import bcrypt from 'bcrypt';
import prisma from '../../db/prisma.js';
import { adminAccountSelect, adminStudentSelect, pendingRegistrationSelect, toAdminAccountDto, toAdminStudentDto } from '../auth/user.dto.js';
import { assertPlaintextPassword } from '../auth/passwords.js';
import { normalizeModuleUrls } from './module-url.validation.js';
import { normalizeSlotLimits, toCanonicalComponentType, DEFAULT_CANONICAL_SLOT_LIMITS } from './component-normalization.js';

const now = () => new Date().toISOString();

export async function getDatabaseStatus() {
  const result = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS user, NOW() AS time`;
  return {
    ok: true,
    provider: 'postgresql',
    connection: result[0],
  };
}

class DatabaseUnavailableError extends Error {
  constructor(resource, cause) {
    super(`The ${resource} data service is temporarily unavailable.`);
    this.name = 'DatabaseUnavailableError';
    this.statusCode = 503;
    this.code = 'DATABASE_UNAVAILABLE';
    this.cause = cause;
  }
}

function classifyDatabaseError(error, resource) {
  if (error?.statusCode) return error;
  // Prisma's connection/pool failures are the only errors that should become 503.
  if (['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error?.code)) return new DatabaseUnavailableError(resource, error);
  if (/\b(connection|database)\b.*\b(lost|unavailable|refused|timeout)\b/i.test(error?.message || '')) return new DatabaseUnavailableError(resource, error);
  if (error?.code === 'P2002') {
    const conflict = new Error('A record with one of these unique values already exists.');
    conflict.statusCode = 409;
    return conflict;
  }
  if (error?.name === 'PrismaClientValidationError') {
    const invalid = new Error('Invalid account data. Please review the required fields.');
    invalid.statusCode = 400;
    return invalid;
  }
  return error;
}

const toUserRole = (role) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'admin') return 'ADMIN';
  if (normalized === 'coordinator') return 'COORDINATOR';
  if (normalized === 'instructor' || normalized === 'facilitator' || normalized === 'speaker') return 'INSTRUCTOR';
  return 'STUDENT';
};

/**
 * The five values the Prisma `NSTPComponentType` enum defines
 * (prisma/schema.prisma). Nothing outside this set may reach the database.
 */
export const NSTP_COMPONENT_TYPES = Object.freeze(['CWTS', 'CWTS_COAST_GUARD', 'LTS', 'MTS_ARMY', 'MTS_NAVY']);

/** Canonical display name for each type, used when a component row must be created. */
export const NSTP_COMPONENT_NAMES = Object.freeze({
  CWTS: 'CWTS',
  CWTS_COAST_GUARD: 'CWTS (Coast Guard)',
  LTS: 'LTS',
  MTS_ARMY: 'MTS (Army)',
  MTS_NAVY: 'MTS (Navy)',
});

/**
 * Resolves a component to its canonical enum value, or `null` when the value is
 * blank or unrecognised.
 *
 * Aliases are intentional, not guessed: the key is normalised by upper-casing,
 * collapsing whitespace to underscores and dropping parentheses, so the five
 * display names the API already accepts on module writes ('MTS (Army)',
 * 'CWTS (Coast Guard)', …) and the five enum spellings map onto the same key.
 * Anything else — blank, 'MTS' with no branch, 'ROTC', a typo — resolves to
 * `null`.
 *
 * This function used to end in an unconditional `return 'CWTS'`. Because CWTS is
 * also the schema default, that turned any unrecognised component in an admin
 * import into a genuine CWTS record, which then appeared on the CWTS
 * coordinator's roster as legitimate data. Callers must now treat `null` as a
 * validation failure; see `requireComponentType`.
 */
export const toComponentType = (component) => {
  if (typeof component !== 'string') return null;
  const key = component.trim().toUpperCase().replace(/\s+/g, '_').replace(/[()]/g, '');
  return NSTP_COMPONENT_TYPES.includes(key) ? key : null;
};

/**
 * Same resolution as `toComponentType`, but raises a 400 instead of returning
 * `null`. Every write path that persists a component uses this so an invalid
 * value can never be silently filed under a real program.
 */
export function requireComponentType(component, field = 'component') {
  const type = toComponentType(component);
  if (type) return type;
  const supplied = typeof component === 'string' ? component.trim() : '';
  const error = new Error(
    `"${supplied || '(blank)'}" is not a recognised NSTP component. Use one of: ${Object.values(NSTP_COMPONENT_NAMES).join(', ')}.`,
  );
  error.statusCode = 400;
  error.code = 'INVALID_COMPONENT';
  error.field = field;
  throw error;
}

const withDatabase = async (name, operation) => {
  try {
    return await operation();
  } catch (error) {
    // Never substitute empty or in-memory data for official academic records.
    // The error handler deliberately returns a safe, structured 503 response.
    console.warn(`Prisma ${name} operation failed: ${error?.message || error}`);
    throw classifyDatabaseError(error, name);
  }
};

const toModuleDto = (mod) => ({
  ...mod,
  ...(mod.data || {}),
  data: undefined,
  component: mod.component?.name || mod.data?.component || 'Common',
  status: mod.status || (mod.isPublished ? 'PUBLISHED' : 'DRAFT'),
  completedStudents: mod._count?.progress || 0,
});

const moduleExtraFields = [
  'component', 'courseCode', 'semester', 'schoolYear', 'sourceDocument', 'outcomes',
  'difficulty', 'videoUrl', 'meetingLink', 'documentLink', 'speaker',
  'speakerPosition', 'scheduledDate', 'scheduledTime',
];

function moduleData(payload) {
  return Object.fromEntries(moduleExtraFields
    .filter((field) => payload[field] !== undefined)
    .map((field) => [field, payload[field]]));
}

/**
 * Resolves the component a module write may be attached to.
 *
 * `forcedComponentScope` is the caller's narrowing, and only two values mean
 * "unrestricted": `null` and `undefined`. Those are reachable exclusively from
 * the admin controllers, which pass no third argument. Every coordinator path
 * passes `req.coordinator.allowedComponentIds`, an array the request middleware
 * re-derives from the database.
 *
 * A *present but empty* narrowing therefore means "this actor may reach no
 * component at all" and must deny — it must never be read as "no restriction".
 * That is why the checks below test `Array.isArray(...)` alone: an earlier
 * version also tested `.length`, so an empty array skipped both guards and fell
 * through to an unscoped write. It was unreachable in practice (a coordinator
 * with no components is rejected upstream), but it was still a fail-open
 * spelling of the invariant, and `outsideForcedScope` already gets this right.
 */
async function resolveModuleComponent(client, component, forcedComponentScope = null) {
  // One shape from here on, so the string and array forms cannot drift apart.
  const scope = typeof forcedComponentScope === 'string' ? [forcedComponentScope] : forcedComponentScope;
  if (!component || component === 'Common') {
    // A common (component-less) module is an administrator's write. A narrowed
    // actor has to name a component inside its own scope.
    if (Array.isArray(scope)) {
      const error = new Error('Coordinators must select a component inside their program scope.');
      error.statusCode = 403;
      throw error;
    }
    return null;
  }
  const record = await client.nSTPComponent.findUnique({ where: { type: requireComponentType(component) }, select: { id: true } });
  if (!record) {
    const error = new Error('The selected NSTP component is not configured.');
    error.statusCode = 400;
    throw error;
  }
  if (outsideForcedScope(record.id, scope)) {
    const error = new Error('The selected module component is outside your coordinator scope.');
    error.statusCode = 403;
    throw error;
  }
  return record.id;
}

/**
 * True when `componentId` lies outside the caller's narrowing.
 *
 * Only a nullish scope is unrestricted. An empty array is a real (if empty)
 * allow-list, so `[].includes(anything)` is false and everything is outside it —
 * which is the required reading of "no authorized components".
 */
function outsideForcedScope(componentId, forcedComponentScope) {
  if (forcedComponentScope == null) return false;
  return Array.isArray(forcedComponentScope) ? !forcedComponentScope.includes(componentId) : componentId !== forcedComponentScope;
}

function assertModulePublishable(payload) {
  if (payload.status !== 'PUBLISHED') return;
  if (!String(payload.title || '').trim() || !String(payload.description || '').trim() || !Number(payload.hours)) {
    const error = new Error('A title, description, and valid duration are required before publishing.');
    error.statusCode = 400;
    throw error;
  }
}

function moduleWriteData(payload, componentId) {
  const status = payload.status || 'DRAFT';
  return {
    title: payload.title,
    description: payload.description || '',
    hours: Number(payload.hours),
    order: Number(payload.order) || 0,
    status,
    isPublished: status === 'PUBLISHED',
    componentId,
    data: moduleData(payload),
  };
}

/**
 * How a caller is allowed to read the managed-module collection.
 *
 * The mode is named rather than inferred because an empty component list is a
 * legitimate *restrictive* state — a coordinator with no components resolved —
 * while an administrator's unrestricted read carries no list at all. The former
 * signature expressed both as `[]` and resolved the ambiguity with
 * `managedComponentIds.length ? { componentId: { in: … } } : {}`, so a caller
 * that arrived with an empty list fell through to the unfiltered branch and
 * received every module in the system. Making the mode explicit means the two
 * states can no longer be confused by a caller, a refactor, or a default value.
 */
export const MODULE_ACCESS = Object.freeze({
  /** Administrator. Every module; no component restriction. */
  UNRESTRICTED: 'unrestricted',
  /** Coordinator. Only modules whose componentId is in `componentIds`. */
  COMPONENTS: 'components',
  /** Facilitator. Own modules, plus modules of the components they teach in. */
  INSTRUCTOR: 'instructor',
});

/**
 * Translates an access descriptor into a Prisma filter.
 *
 * Returns `null` to mean "no rows are reachable" — distinct from `{}`, which
 * means "no restriction". Callers must treat the two differently; that
 * distinction is the whole point of this function.
 */
function moduleAccessFilter(access) {
  const mode = access?.mode;
  if (mode === MODULE_ACCESS.UNRESTRICTED) return {};

  if (mode === MODULE_ACCESS.COMPONENTS) {
    if (!Array.isArray(access.componentIds)) {
      throw new Error('MODULE_ACCESS.COMPONENTS requires a componentIds array.');
    }
    const componentIds = [...new Set(access.componentIds.filter(Boolean))];
    // An authorised-component list that resolved to nothing means no access.
    // It must never widen into an unfiltered read.
    if (!componentIds.length) return null;
    return { componentId: { in: componentIds } };
  }

  if (mode === MODULE_ACCESS.INSTRUCTOR) {
    if (!access.instructorId) throw new Error('MODULE_ACCESS.INSTRUCTOR requires an instructorId.');
    const componentIds = [...new Set((access.componentIds || []).filter(Boolean))];
    // A facilitator with no sections still owns modules they authored, so an
    // empty component list narrows the OR rather than emptying the result.
    return {
      OR: [
        { instructorId: access.instructorId },
        ...(componentIds.length ? [{ componentId: { in: componentIds } }] : []),
      ],
    };
  }

  throw new Error(`listManagedModules requires an explicit access mode; received ${JSON.stringify(mode ?? null)}.`);
}

/**
 * Lists modules for a staff member. `access` is required and must be one of the
 * `MODULE_ACCESS` shapes; there is deliberately no default, because a default
 * would have to pick between unrestricted and no-access and either choice is
 * wrong for some caller.
 */
export async function listManagedModules(access) {
  const where = moduleAccessFilter(access);
  if (where === null) return [];
  return withDatabase('modules', async () => {
    const modules = await prisma.module.findMany({
      ...(Object.keys(where).length ? { where } : {}),
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        component: { select: { id: true, name: true, type: true } },
        _count: { select: { progress: { where: { completedAt: { not: null } } } } },
      },
    });
    return modules.map(toModuleDto);
  });
}

export async function listPublishedModules(componentIds = []) {
  const allowedComponentIds = [...new Set(componentIds.filter(Boolean))];
  return withDatabase('modules', async () => {
    const modules = await prisma.module.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ componentId: null }, ...(allowedComponentIds.length ? [{ componentId: { in: allowedComponentIds } }] : [])],
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        component: { select: { id: true, name: true, type: true } },
        _count: { select: { progress: { where: { completedAt: { not: null } } } } },
      },
    });
    return modules.map(toModuleDto);
  });
}

/**
 * Training groups belonging to a coordinator's own components.
 *
 * `TrainingGroup.component` is a display-name string rather than a `componentId`
 * foreign key (prisma/schema.prisma), so the scope is applied by resolving the
 * component ids the server derived for this coordinator into the spellings a row
 * may legitimately use — the stored component name, its enum type, and the
 * canonical label — and filtering on that set inside the query.
 *
 * Two properties matter here. The allow-list is built from ids the server
 * derived from the database (never from the request), and the restriction lives
 * in the `where` clause, so the response cannot contain another program's rows
 * for a client to filter out afterwards.
 */
export async function listCoordinatorTrainingGroups(allowedComponentIds) {
  if (!Array.isArray(allowedComponentIds)) {
    throw new Error('listCoordinatorTrainingGroups requires an array of authorised component ids.');
  }
  const componentIds = [...new Set(allowedComponentIds.filter(Boolean))];
  // No components resolved means no access. Never every group.
  if (!componentIds.length) return [];

  return withDatabase('training-groups', async () => {
    const components = await prisma.nSTPComponent.findMany({
      where: { id: { in: componentIds } },
      select: { name: true, type: true },
    });
    const allowedLabels = [...new Set(
      components.flatMap((component) => [component.name, component.type, NSTP_COMPONENT_NAMES[component.type]])
        .filter(Boolean),
    )];
    if (!allowedLabels.length) return [];
    return prisma.trainingGroup.findMany({
      where: { component: { in: allowedLabels } },
      orderBy: { createdAt: 'desc' },
    });
  });
}

export async function createManagedModule(actorId, payload, forcedComponentId = null) {
  const normalized = normalizeModuleUrls(payload);
  return withDatabase('modules', () => prisma.$transaction(async (tx) => {
    const componentId = await resolveModuleComponent(tx, normalized.component, forcedComponentId);
    const created = await tx.module.create({
      data: moduleWriteData({ ...normalized, status: 'DRAFT' }, componentId),
      include: { component: { select: { id: true, name: true, type: true } } },
    });
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actorId, action: 'MODULE_CREATED', detail: JSON.stringify({ moduleId: created.id, status: created.status }) },
    });
    return toModuleDto(created);
  }));
}

export async function updateManagedModule(actorId, id, patch, forcedComponentId = null) {
  const normalized = normalizeModuleUrls(patch);
  return withDatabase('modules', () => prisma.$transaction(async (tx) => {
    const existing = await tx.module.findUnique({ where: { id }, include: { component: true } });
    if (!existing) {
      const error = new Error('Module not found.');
      error.statusCode = 404;
      throw error;
    }
    if (outsideForcedScope(existing.componentId, forcedComponentId)) {
      const error = new Error('You cannot modify a module outside your assigned component.');
      error.statusCode = 403;
      throw error;
    }
    const existingDto = toModuleDto(existing);
    const merged = { ...existingDto, ...normalized };
    assertModulePublishable(merged);
    const componentId = await resolveModuleComponent(tx, merged.component, forcedComponentId);
    const updated = await tx.module.update({
      where: { id },
      data: moduleWriteData(merged, componentId),
      include: { component: { select: { id: true, name: true, type: true } } },
    });
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actorId, action: 'MODULE_UPDATED', detail: JSON.stringify({ moduleId: id, previousStatus: existing.status, status: updated.status }) },
    });
    return toModuleDto(updated);
  }));
}

export async function removeManagedModule(actorId, id, forcedComponentId = null) {
  return withDatabase('modules', () => prisma.$transaction(async (tx) => {
    const existing = await tx.module.findUnique({
      where: { id },
      include: { _count: { select: { lessons: true, quizzes: true, assignments: true, exams: true, grades: true, progress: true } } },
    });
    if (!existing) {
      const error = new Error('Module not found.');
      error.statusCode = 404;
      throw error;
    }
    if (outsideForcedScope(existing.componentId, forcedComponentId)) {
      const error = new Error('You cannot delete a module outside your assigned component.');
      error.statusCode = 403;
      throw error;
    }
    const hasReferences = Object.values(existing._count).some((count) => count > 0);
    if (hasReferences) {
      await tx.module.update({ where: { id }, data: { status: 'ARCHIVED', isPublished: false } });
    } else {
      await tx.module.delete({ where: { id } });
    }
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actorId, action: hasReferences ? 'MODULE_ARCHIVED' : 'MODULE_DELETED', detail: JSON.stringify({ moduleId: id }) },
    });
    return { id, archived: hasReferences };
  }));
}

const assessmentInclude = {
  module: { include: { component: { select: { id: true, name: true, type: true } } } },
  questions: { orderBy: { order: 'asc' } },
  _count: { select: { submissions: true, grades: true } },
};

function storedAssessmentQuestions(quiz) {
  if (quiz.questions?.length) {
    return quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: Array.isArray(question.options) ? question.options : [],
      correctIndex: Number(question.answer?.correctIndex ?? 0),
    }));
  }
  return Array.isArray(quiz.data?.questions) ? quiz.data.questions : [];
}

function toManagedAssessmentDto(quiz) {
  const definition = quiz.data || {};
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.instructions || '',
    moduleId: quiz.moduleId,
    moduleTitle: quiz.module?.title || 'Unavailable module',
    moduleStatus: quiz.module?.status || 'ARCHIVED',
    component: quiz.module?.component?.name || quiz.module?.data?.component || 'Common',
    type: definition.type || 'quiz',
    timeLimit: Number(definition.timeLimit || 15),
    passingScore: Number(definition.passingScore ?? 70),
    questionsToShow: Number(definition.questionsToShow || 0),
    ownerId: definition.ownerId || '',
    ownerName: definition.ownerName || 'Administrator',
    ownerRole: definition.ownerRole || 'admin',
    status: String(quiz.status || 'DRAFT').toLowerCase(),
    questions: storedAssessmentQuestions(quiz),
    attemptCount: quiz._count?.submissions || 0,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  };
}

function toStudentAssessmentDto(quiz) {
  const managed = toManagedAssessmentDto(quiz);
  return {
    ...managed,
    ownerId: undefined,
    ownerName: undefined,
    ownerRole: undefined,
    attemptCount: undefined,
    questions: managed.questions.map(({ correctIndex: _correctIndex, ...question }) => question),
  };
}

function assessmentModuleWhere(actor) {
  if (actor.role === 'ADMIN') return {};
  // `in: []` matches nothing, which is the correct reading of "this coordinator
  // has no components". Do not rewrite this as
  // `componentIds.length ? { componentId: { in: … } } : {}` — that spelling turns
  // zero access into unrestricted access.
  if (actor.role === 'COORDINATOR') return { componentId: { in: actor.componentIds || [] } };
  if (actor.role === 'INSTRUCTOR') return {
    OR: [
      { instructorId: actor.instructorId },
      ...(actor.componentIds?.length ? [{ componentId: { in: actor.componentIds } }] : []),
    ],
  };
  return { id: '__forbidden__' };
}

async function requireManageableModule(client, actor, moduleId, publishing = false) {
  const module = await client.module.findFirst({
    where: { id: moduleId, ...assessmentModuleWhere(actor) },
    include: { component: true },
  });
  if (!module) {
    const error = new Error('The selected module does not exist or is not assigned to you.');
    error.statusCode = 403;
    throw error;
  }
  if (module.status === 'ARCHIVED') {
    const error = new Error('Archived modules cannot receive assessments.');
    error.statusCode = 409;
    throw error;
  }
  if (publishing && module.status !== 'PUBLISHED') {
    const error = new Error('Publish the connected module before publishing its assessment.');
    error.statusCode = 409;
    throw error;
  }
  return module;
}

function assertAssessmentPublishable(payload) {
  if (payload.status !== 'PUBLISHED') return;
  if (!payload.questions?.length) {
    const error = new Error('At least one valid question is required before publishing.');
    error.statusCode = 400;
    throw error;
  }
  if (payload.questionsToShow > payload.questions.length) {
    const error = new Error('Questions to show cannot exceed the number of assessment questions.');
    error.statusCode = 400;
    throw error;
  }
}

async function resolveAssessmentOwner(client, actor, requestedOwnerId) {
  if (actor.role !== 'ADMIN' || !requestedOwnerId || requestedOwnerId === actor.userId) {
    return { ownerId: actor.userId, ownerName: actor.name, ownerRole: actor.role.toLowerCase() };
  }
  const owner = await client.user.findFirst({
    where: { id: requestedOwnerId, role: 'INSTRUCTOR' },
    select: { id: true, name: true },
  });
  if (!owner) {
    const error = new Error('The selected facilitator account is invalid.');
    error.statusCode = 400;
    throw error;
  }
  return { ownerId: owner.id, ownerName: owner.name, ownerRole: 'facilitator' };
}

function assessmentData(payload, owner) {
  return {
    type: payload.type,
    timeLimit: Number(payload.timeLimit),
    passingScore: Number(payload.passingScore),
    questionsToShow: Number(payload.questionsToShow || 0),
    ...owner,
  };
}

async function replaceAssessmentQuestions(client, quizId, questions) {
  await client.question.deleteMany({ where: { quizId } });
  if (!questions.length) return;
  await client.question.createMany({
    data: questions.map((question, order) => ({
      id: crypto.randomUUID(),
      quizId,
      prompt: question.prompt,
      options: question.options,
      answer: { correctIndex: question.correctIndex },
      points: 1,
      order,
    })),
  });
}

export async function listManagedAssessments(actor) {
  return withDatabase('assessments', async () => {
    const records = await prisma.quiz.findMany({
      where: { module: assessmentModuleWhere(actor) },
      orderBy: { createdAt: 'desc' },
      include: assessmentInclude,
    });
    return records.map(toManagedAssessmentDto);
  });
}

export async function listStudentAssessments(componentId) {
  return withDatabase('assessments', async () => {
    const records = await prisma.quiz.findMany({
      where: {
        status: 'PUBLISHED',
        module: {
          status: 'PUBLISHED',
          OR: [{ componentId: null }, ...(componentId ? [{ componentId }] : [])],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: assessmentInclude,
    });
    return records.map(toStudentAssessmentDto);
  });
}

export async function createManagedAssessment(actor, payload) {
  return withDatabase('assessments', () => prisma.$transaction(async (tx) => {
    await requireManageableModule(tx, actor, payload.moduleId, false);
    const owner = await resolveAssessmentOwner(tx, actor, payload.ownerId);
    const created = await tx.quiz.create({
      data: {
        title: payload.title,
        instructions: payload.description || '',
        moduleId: payload.moduleId,
        totalPoints: payload.questions.length,
        status: 'DRAFT',
        data: assessmentData(payload, owner),
      },
    });
    await replaceAssessmentQuestions(tx, created.id, payload.questions);
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actor.userId, action: 'ASSESSMENT_CREATED', detail: JSON.stringify({ assessmentId: created.id, moduleId: created.moduleId }) },
    });
    return toManagedAssessmentDto(await tx.quiz.findUnique({ where: { id: created.id }, include: assessmentInclude }));
  }));
}

export async function updateManagedAssessment(actor, id, patch) {
  return withDatabase('assessments', () => prisma.$transaction(async (tx) => {
    const existing = await tx.quiz.findUnique({ where: { id }, include: assessmentInclude });
    if (!existing) {
      const error = new Error('Assessment not found.');
      error.statusCode = 404;
      throw error;
    }
    await requireManageableModule(tx, actor, existing.moduleId, false);
    const current = toManagedAssessmentDto(existing);
    const merged = { ...current, ...patch, status: patch.status || String(existing.status) };
    await requireManageableModule(tx, actor, merged.moduleId, merged.status === 'PUBLISHED');
    assertAssessmentPublishable(merged);
    const owner = await resolveAssessmentOwner(tx, actor, patch.ownerId || current.ownerId);
    await tx.quiz.update({
      where: { id },
      data: {
        title: merged.title,
        instructions: merged.description || '',
        moduleId: merged.moduleId,
        totalPoints: merged.questions.length,
        status: merged.status,
        data: assessmentData(merged, owner),
      },
    });
    if (patch.questions) await replaceAssessmentQuestions(tx, id, merged.questions);
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actor.userId, action: 'ASSESSMENT_UPDATED', detail: JSON.stringify({ assessmentId: id, previousStatus: existing.status, status: merged.status }) },
    });
    return toManagedAssessmentDto(await tx.quiz.findUnique({ where: { id }, include: assessmentInclude }));
  }));
}

export async function removeManagedAssessment(actor, id) {
  return withDatabase('assessments', () => prisma.$transaction(async (tx) => {
    const existing = await tx.quiz.findUnique({ where: { id }, include: assessmentInclude });
    if (!existing) {
      const error = new Error('Assessment not found.');
      error.statusCode = 404;
      throw error;
    }
    await requireManageableModule(tx, actor, existing.moduleId, false);
    const hasResults = (existing._count?.submissions || 0) > 0 || (existing._count?.grades || 0) > 0;
    if (hasResults) await tx.quiz.update({ where: { id }, data: { status: 'ARCHIVED' } });
    else await tx.quiz.delete({ where: { id } });
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actor.userId, action: hasResults ? 'ASSESSMENT_ARCHIVED' : 'ASSESSMENT_DELETED', detail: JSON.stringify({ assessmentId: id }) },
    });
    return { id, archived: hasResults };
  }));
}

export async function listAssessmentAttempts() {
  return withDatabase('assessment attempts', async () => {
    const attempts = await prisma.submission.findMany({
      where: { quizId: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take: 500,
      include: {
        student: { include: { user: { select: { id: true, name: true, email: true } } } },
        quiz: { select: { id: true, title: true, data: true } },
      },
    });
    return attempts.map((attempt) => ({
      id: attempt.id,
      studentId: attempt.student.user.id,
      studentName: attempt.student.user.name,
      studentEmail: attempt.student.user.email,
      assessmentId: attempt.quiz.id,
      assessmentTitle: attempt.quiz.title,
      score: attempt.score,
      passed: Number(attempt.score || 0) >= Number(attempt.quiz.data?.passingScore ?? 70),
      manualStatus: attempt.content?.override?.status,
      submittedAt: attempt.submittedAt,
    }));
  });
}

export async function overrideAssessmentAttempt(actor, id, status, reason) {
  return withDatabase('assessment attempts', () => prisma.$transaction(async (tx) => {
    const existing = await tx.submission.findUnique({ where: { id }, include: { quiz: true } });
    if (!existing?.quizId) {
      const error = new Error('Assessment attempt not found.');
      error.statusCode = 404;
      throw error;
    }
    const previous = existing.content?.override?.status || (Number(existing.score || 0) >= Number(existing.quiz.data?.passingScore ?? 70) ? 'passed' : 'failed');
    const changedAt = new Date().toISOString();
    const updated = await tx.submission.update({
      where: { id },
      data: { content: { ...(existing.content || {}), override: { previous, status, reason, actorId: actor.userId, changedAt } } },
    });
    await tx.auditLogEntry.create({
      data: { id: crypto.randomUUID(), actor: actor.userId, action: 'ASSESSMENT_ATTEMPT_OVERRIDDEN', detail: JSON.stringify({ attemptId: id, previous, status, reason }) },
    });
    return { id: updated.id, previous, status, reason, changedAt };
  }));
}

function normalizeFacilitatorMunicipalities(value) {
  if (!Array.isArray(value)) {
    const error = new Error('Facilitators must be assigned to between 1 and 3 municipalities.');
    error.statusCode = 400;
    throw error;
  }

  const municipalities = [...new Set(value.map((municipality) => String(municipality).trim()).filter(Boolean))];
  if (municipalities.length < 1 || municipalities.length > 3) {
    const error = new Error('Facilitators must be assigned to between 1 and 3 municipalities.');
    error.statusCode = 400;
    throw error;
  }
  return municipalities;
}

// These functions deliberately receive a resource name only from server-side
// route handlers. Never pass a client-controlled collection name here.
export async function listAdminResource(name, filters = {}) {
  if (name === 'accounts') {
    const role = filters.role ? String(filters.role).toUpperCase() : null;
    if (role && !['ADMIN', 'COORDINATOR', 'INSTRUCTOR', 'STUDENT'].includes(role)) {
      const error = new Error('Invalid account role filter.');
      error.statusCode = 400;
      throw error;
    }
    const accounts = await withDatabase(name, () => prisma.user.findMany({
      ...(role ? { where: { role } } : {}),
      orderBy: { createdAt: 'desc' },
      select: adminAccountSelect,
    }));
    return accounts.map(toAdminAccountDto);
  }

  if (name === 'modules') {
    // Reached only from admin-only route handlers (see the note above this
    // function), so the unrestricted mode is stated rather than implied.
    return listManagedModules({ mode: MODULE_ACCESS.UNRESTRICTED });
  }

  if (name === 'students') {
    const students = await withDatabase(name, () => prisma.studentProfile.findMany({
      orderBy: { createdAt: 'desc' },
      select: adminStudentSelect,
    }));
    return students.map(toAdminStudentDto);
  }

  if (name === 'grades') {
    return withDatabase(name, async () => prisma.grade.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  if (name === 'assessments') {
    return withDatabase(name, async () => {
      const quizzes = await prisma.quiz.findMany({
        orderBy: { createdAt: 'desc' },
        include: { module: true, questions: true },
      });
      return quizzes.map((quiz) => ({
        ...quiz,
        ...(quiz.data || {}),
        data: undefined,
      }));
    });
  }

  const simpleList = (model) => withDatabase(name, () => model.findMany({ orderBy: { createdAt: 'desc' } }));

  if (name === 'pending-registrations') {
    return withDatabase(name, () => prisma.pendingRegistration.findMany({
      where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: pendingRegistrationSelect,
    }));
  }
  if (name === 'training-groups') return simpleList(prisma.trainingGroup);
  if (name === 'attendance-records') return simpleList(prisma.attendanceRecord);
  if (name === 'attendance-sessions') return simpleList(prisma.attendanceSession);
  if (name === 'qualifying-results') return simpleList(prisma.qualifyingExamResult);
  if (name === 'component-state') {
    return withDatabase(name, async () => {
      const records = await prisma.componentApplicationState.findMany();
      return records.map((rec) => ({
        ...rec,
        slotLimits: normalizeSlotLimits(rec.slotLimits),
      }));
    });
  }
  if (name === 'audit-log') return simpleList(prisma.auditLogEntry);

  return [];
}

export async function upsertAdminResource(name, lookup, payload, context = {}) {
  if (Object.hasOwn(payload || {}, 'passwordHash')) {
    const error = new Error('passwordHash is not accepted. Supply a plaintext password through the approved provisioning flow.');
    error.statusCode = 400;
    throw error;
  }
  const nextPayload = { ...payload, updatedAt: payload.updatedAt || now() };

  try {
    if (name === 'accounts') {
      if (toUserRole(nextPayload.role) === 'COORDINATOR') {
        const error = new Error('Coordinator accounts must be managed through the dedicated coordinator endpoint.');
        error.statusCode = 400;
        throw error;
      }
      const profileData = nextPayload.data || {};
      const explicitFields = ['surname', 'firstName', 'middleName', 'school', 'department', 'degreeProgram', 'yearLevel', 'major', 'gender', 'birthdate', 'houseStreetPurok', 'barangay', 'municipality', 'municipalities', 'province', 'provincialAddress', 'contactNumber', 'currentAddress', 'cityAddress', 'title', 'bio', 'generalEducationComplete', 'preferredComponent', 'examTaken', 'examScore', 'component', 'componentAccessStatus'];
      for (const field of explicitFields) {
        if (nextPayload[field] !== undefined) profileData[field] = nextPayload[field];
      }
      const existingUser = nextPayload.email
        ? await prisma.user.findUnique({ where: { email: nextPayload.email }, select: { id: true } })
        : null;
      if (!existingUser && nextPayload.password === undefined) {
        const error = new Error('A password of at least 8 characters is required when creating an account.');
        error.statusCode = 400;
        throw error;
      }
      if (nextPayload.password !== undefined) assertPlaintextPassword(nextPayload.password);
      const passwordHash = nextPayload.password ? await bcrypt.hash(nextPayload.password, 10) : undefined;
      const userRole = toUserRole(nextPayload.role);
      if (userRole === 'COORDINATOR') delete profileData.municipalities;
      if (userRole === 'INSTRUCTOR') profileData.municipalities = normalizeFacilitatorMunicipalities(profileData.municipalities);
      const user = await prisma.user.upsert({
        where: { email: nextPayload.email },
        update: {
          name: nextPayload.name,
          role: userRole,
          data: profileData,
          ...(passwordHash ? { passwordHash } : {}),
        },
        create: {
          id: nextPayload.id,
          name: nextPayload.name || nextPayload.email,
          email: nextPayload.email,
          passwordHash,
          role: userRole,
          data: profileData,
        },
        select: { id: true },
      });

      if (userRole === 'INSTRUCTOR') {
        await prisma.instructorProfile.upsert({
          where: { userId: user.id },
          update: {
            employeeNumber: profileData.employeeNumber || `fac-${user.id.slice(0, 8)}`,
            department: profileData.department || null,
            title: profileData.title || null,
          },
          create: {
            userId: user.id,
            employeeNumber: profileData.employeeNumber || `fac-${user.id.slice(0, 8)}`,
            department: profileData.department || null,
            title: profileData.title || null,
          },
        });
      }

      // No coordinator branch here on purpose. Coordinator provisioning is
      // rejected at the top of this resource (`Coordinator accounts must be
      // managed through the dedicated coordinator endpoint`), so any code keyed
      // on `userRole === 'COORDINATOR'` below that guard is unreachable. A dead
      // branch used to resolve `profileData.component` through the old
      // CWTS-defaulting `toComponentType`, which is exactly the kind of path
      // that gets revived by accident; the real flow is
      // `staff.service.js#createCoordinator`, which validates the scope.

      return toAdminAccountDto(await prisma.user.findUnique({ where: { id: user.id }, select: adminAccountSelect }));
    }

    if (name === 'modules') {
      const normalizedModulePayload = normalizeModuleUrls(nextPayload);
      const moduleKnownFields = ['id', 'title', 'description', 'hours', 'published', 'isPublished', 'status', 'order', 'componentId', 'updatedAt', 'createdAt', 'data'];
      const moduleExtras = {};
      for (const key of Object.keys(normalizedModulePayload)) {
        if (!moduleKnownFields.includes(key)) moduleExtras[key] = normalizedModulePayload[key];
      }
      const updatedModuleData = { ...(normalizedModulePayload.data || {}), ...moduleExtras };
      const moduleStatus = normalizedModulePayload.status || (normalizedModulePayload.published ?? normalizedModulePayload.isPublished ? 'PUBLISHED' : 'DRAFT');
      return await prisma.module.upsert({
        where: { id: normalizedModulePayload.id },
        update: {
          title: normalizedModulePayload.title,
          description: normalizedModulePayload.description,
          hours: Number(normalizedModulePayload.hours) || null,
          status: moduleStatus,
          isPublished: moduleStatus === 'PUBLISHED',
          data: updatedModuleData,
        },
        create: {
          id: normalizedModulePayload.id,
          title: normalizedModulePayload.title || 'Untitled module',
          description: normalizedModulePayload.description,
          hours: Number(normalizedModulePayload.hours) || null,
          status: moduleStatus,
          isPublished: moduleStatus === 'PUBLISHED',
          data: updatedModuleData,
        },
      });
    }

    if (name === 'assessments') {
      if (!nextPayload.moduleId) {
        const error = new Error('A valid module is required for every assessment.');
        error.statusCode = 400;
        throw error;
      }
      const knownFields = ['id', 'title', 'description', 'moduleId', 'questions', 'updatedAt', 'createdAt'];
      const extras = {};
      for (const key of Object.keys(nextPayload)) {
        if (!knownFields.includes(key)) extras[key] = nextPayload[key];
      }
      const updatedQuizData = { ...(nextPayload.data || {}), ...extras };
      return await prisma.quiz.upsert({
        where: { id: nextPayload.id || 'none' },
        update: {
          title: nextPayload.title,
          ...(nextPayload.description !== undefined ? { instructions: nextPayload.description } : {}),
          ...(nextPayload.status ? { status: String(nextPayload.status).toUpperCase() } : {}),
          data: updatedQuizData,
        },
        create: {
          id: nextPayload.id,
          title: nextPayload.title || 'Untitled assessment',
          moduleId: nextPayload.moduleId,
          status: String(nextPayload.status || 'DRAFT').toUpperCase(),
          ...(nextPayload.description !== undefined ? { instructions: nextPayload.description } : {}),
          data: updatedQuizData,
        },
      });
    }

    if (name === 'students') {
      // Resolved first, before any row is written. There is no transaction
      // around this branch, so validating the component after the user upsert
      // would leave a real account behind whenever the component was rejected —
      // a partially created student. The old code could not fail here at all: an
      // unrecognised component became 'CWTS' and the record was filed under a
      // live program.
      const componentType = requireComponentType(nextPayload.component);
      const existingUser = nextPayload.email
        ? await prisma.user.findUnique({ where: { email: nextPayload.email }, select: { id: true } })
        : null;
      if (!existingUser && nextPayload.password === undefined) {
        const error = new Error('A password of at least 8 characters is required when creating a student account.');
        error.statusCode = 400;
        throw error;
      }
      if (nextPayload.password !== undefined) assertPlaintextPassword(nextPayload.password);
      const studentPasswordHash = nextPayload.password ? await bcrypt.hash(nextPayload.password, 10) : undefined;
      const user = await prisma.user.upsert({
        where: { email: nextPayload.email },
        update: { name: nextPayload.name, role: 'STUDENT' },
        create: {
          name: nextPayload.name || nextPayload.email,
          email: nextPayload.email,
          passwordHash: studentPasswordHash,
          role: 'STUDENT',
        },
        select: { id: true },
      });

      const component = await prisma.nSTPComponent.upsert({
        where: { type: componentType },
        update: {},
        // The name comes from the canonical table, never from the payload. The
        // previous `nextPayload.component || 'CWTS'` let arbitrary import text
        // become a component's display name.
        create: { type: componentType, name: NSTP_COMPONENT_NAMES[componentType] },
      });

      const studentKnownFields = ['id', 'studentId', 'studentNumber', 'userId', 'componentId', 'component', 'course', 'yearLevel', 'sectionId', 'email', 'password', 'name', 'updatedAt', 'createdAt'];
      const studentExtras = {};
      for (const key of Object.keys(nextPayload)) {
        if (!studentKnownFields.includes(key)) studentExtras[key] = nextPayload[key];
      }
      const updatedStudentData = { ...(nextPayload.data || {}), ...studentExtras };

      const studentProfile = await prisma.studentProfile.upsert({
        where: { studentNumber: nextPayload.studentId || nextPayload.studentNumber },
        update: {
          userId: user.id,
          course: nextPayload.course,
          yearLevel: nextPayload.yearLevel,
          data: updatedStudentData,
        },
        create: {
          id: nextPayload.id,
          userId: user.id,
          studentNumber: nextPayload.studentId || nextPayload.studentNumber,
          course: nextPayload.course,
          yearLevel: nextPayload.yearLevel,
          data: updatedStudentData,
        },
      });

      // Route component placement through placeStudent to guarantee StudentProfile.componentId
      // and ACTIVE Enrollment stay synchronized
      if (componentType) {
        await placeStudent(prisma, {
          studentId: studentProfile.id,
          canonicalComponent: componentType,
        });
      }

      return await prisma.studentProfile.findUnique({
        where: { id: studentProfile.id },
      });
    }

    const upsertSimple = (model, where) => model.upsert({
      where: where || { id: nextPayload.id || 'none' },
      update: { ...nextPayload, updatedAt: undefined },
      create: { ...nextPayload, updatedAt: undefined },
    });

    if (name === 'pending-registrations') {
      const regPayload = { ...nextPayload };
      if (regPayload.password) {
        assertPlaintextPassword(regPayload.password);
        regPayload.password = await bcrypt.hash(regPayload.password, 10);
      }
      const { updatedAt, ...regClean } = regPayload;
      return await prisma.pendingRegistration.upsert({
        where: { id: regClean.id || 'none' },
        update: regClean,
        create: regClean,
      });
    }
    if (name === 'grades') {
      if (!nextPayload.id || !nextPayload.studentId) {
        const error = new Error('Grade id and studentId are required.');
        error.statusCode = 400;
        throw error;
      }
      const { id, updatedAt, ...gradeData } = nextPayload;
      return prisma.grade.upsert({
        where: { id },
        update: gradeData,
        create: { id, ...gradeData },
      });
    }
    if (name === 'training-groups') return await upsertSimple(prisma.trainingGroup);
    if (name === 'attendance-records') return await upsertSimple(prisma.attendanceRecord);
    if (name === 'attendance-sessions') return await upsertSimple(prisma.attendanceSession);
    if (name === 'qualifying-results') {
      const actorId = context?.actor?.id || context?.actor?.userId || (typeof context?.actor === 'string' ? context.actor : (nextPayload.actor || 'admin'));

      return await prisma.$transaction(async (tx) => {
        let student = null;
        let user = null;
        if (nextPayload.userId) {
          student = await tx.studentProfile.findFirst({
            where: { userId: nextPayload.userId },
          });
          user = await tx.user.findUnique({
            where: { id: nextPayload.userId },
          });
        } else if (nextPayload.studentId) {
          student = await tx.studentProfile.findUnique({
            where: { id: nextPayload.studentId },
          });
          if (student?.userId) {
            user = await tx.user.findUnique({
              where: { id: student.userId },
            });
          }
        }

        const allowedResultFields = [
          'id', 'userId', 'userName', 'userEmail', 'preferredComponent',
          'score', 'timestamp', 'assignedComponent', 'rank', 'status',
          'adminOverride', 'attemptNumber', 'startedAt', 'expiresAt', 'submittedAt',
        ];
        const cleanResultData = {};
        for (const [k, v] of Object.entries(nextPayload)) {
          if (allowedResultFields.includes(k) && v !== undefined) {
            cleanResultData[k] = v;
          }
        }

        const rawAssigned = nextPayload.assignedComponent !== undefined ? nextPayload.assignedComponent : nextPayload.component;
        const isUnassign = rawAssigned === null ||
          rawAssigned === '' ||
          rawAssigned === 'none' ||
          rawAssigned === 'unassigned' ||
          (nextPayload.status === 'waitlisted' && (!rawAssigned || rawAssigned === 'none'));

        const targetUserId = nextPayload.userId || student?.userId;

        if (isUnassign) {
          if (student) {
            await tx.studentProfile.update({
              where: { id: student.id },
              data: { componentId: null },
            });
            await tx.enrollment.updateMany({
              where: { studentId: student.id, status: 'ACTIVE' },
              data: { status: 'DROPPED' },
            });
          }

          if (targetUserId) {
            await tx.qualifyingExamAttempt.updateMany({
              where: { userId: targetUserId },
              data: {
                assignedComponent: null,
                status: nextPayload.status || 'waitlisted',
                rank: null,
              },
            });
          }

          cleanResultData.assignedComponent = null;
          cleanResultData.status = nextPayload.status || 'waitlisted';
          cleanResultData.adminOverride = false;
          cleanResultData.rank = null;

          let existing = null;
          if (nextPayload.id) {
            existing = await tx.qualifyingExamResult.findUnique({ where: { id: nextPayload.id } });
          }
          if (!existing && targetUserId) {
            existing = await tx.qualifyingExamResult.findFirst({ where: { userId: targetUserId } });
          }

          let result;
          if (existing) {
            result = await tx.qualifyingExamResult.update({
              where: { id: existing.id },
              data: cleanResultData,
            });
          } else {
            result = await tx.qualifyingExamResult.create({
              data: {
                id: nextPayload.id || `qxr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                userId: targetUserId,
                userName: nextPayload.userName || user?.name || 'Student',
                userEmail: nextPayload.userEmail || user?.email || 'student@bipsu.edu.ph',
                preferredComponent: nextPayload.preferredComponent || 'CWTS',
                score: nextPayload.score ?? 75,
                timestamp: nextPayload.timestamp || new Date().toISOString(),
                ...cleanResultData,
              },
            });
          }

          await tx.auditLogEntry.create({
            data: {
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              actor: actorId,
              action: 'QUALIFYING_UNASSIGN',
              detail: JSON.stringify({
                userId: targetUserId,
                studentId: student?.id,
                reason: nextPayload.reason || 'Admin unassigned student component',
              }),
            },
          });

          return result;
        }

        const canonicalComp = toCanonicalComponentType(rawAssigned) || toComponentType(rawAssigned);
        if (!canonicalComp) {
          const err = new Error(`Invalid component type: ${rawAssigned}`);
          err.statusCode = 400;
          throw err;
        }

        const appState = await tx.componentApplicationState.findFirst({
          orderBy: { updatedAt: 'desc' },
        });

        const cycleSchoolYear = appState?.schoolYear || '2025-2026';
        const cycleSemester = appState?.semester || '1st Semester';

        const slotLimits = normalizeSlotLimits(appState?.slotLimits);
        const slotLimit = slotLimits[canonicalComp] ?? DEFAULT_CANONICAL_SLOT_LIMITS[canonicalComp] ?? 0;

        const currentPlacedCount = await countDistinctPlacedStudents(tx, {
          canonicalComponent: canonicalComp,
          currentUserId: targetUserId,
          currentStudentId: student?.id,
          schoolYear: cycleSchoolYear,
          semester: cycleSemester,
        });

        const isQuotaExceeded = currentPlacedCount >= slotLimit;
        const isOverride = Boolean(nextPayload.adminOverride || isQuotaExceeded);

        await placeStudent(tx, {
          userId: targetUserId,
          studentId: student?.id,
          canonicalComponent: canonicalComp,
          schoolYear: cycleSchoolYear,
          semester: cycleSemester,
        });

        const attemptStatus = nextPayload.status || (isOverride ? 'manual-approved' : 'assigned-alternative');
        if (targetUserId) {
          await tx.qualifyingExamAttempt.updateMany({
            where: { userId: targetUserId },
            data: {
              assignedComponent: canonicalComp,
              status: attemptStatus,
            },
          });
        }

        cleanResultData.assignedComponent = canonicalComp;
        cleanResultData.status = attemptStatus;
        cleanResultData.adminOverride = isOverride;

        let existing = null;
        if (nextPayload.id) {
          existing = await tx.qualifyingExamResult.findUnique({ where: { id: nextPayload.id } });
        }
        if (!existing && targetUserId) {
          existing = await tx.qualifyingExamResult.findFirst({ where: { userId: targetUserId } });
        }

        let result;
        if (existing) {
          result = await tx.qualifyingExamResult.update({
            where: { id: existing.id },
            data: cleanResultData,
          });
        } else {
          result = await tx.qualifyingExamResult.create({
            data: {
              id: nextPayload.id || `qxr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              userId: targetUserId,
              userName: nextPayload.userName || user?.name || 'Student',
              userEmail: nextPayload.userEmail || user?.email || 'student@bipsu.edu.ph',
              preferredComponent: nextPayload.preferredComponent || canonicalComp,
              score: nextPayload.score ?? 75,
              timestamp: nextPayload.timestamp || new Date().toISOString(),
              ...cleanResultData,
            },
          });
        }

        if (isOverride) {
          await tx.auditLogEntry.create({
            data: {
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              actor: actorId,
              action: 'QUALIFYING_QUOTA_OVERRIDE',
              detail: JSON.stringify({
                userId: targetUserId,
                studentId: student?.id,
                component: canonicalComp,
                currentCount: currentPlacedCount,
                slotLimit,
                reason: nextPayload.reason || 'Admin quota override placement',
                adminOverride: true,
              }),
            },
          });
        } else {
          await tx.auditLogEntry.create({
            data: {
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              actor: actorId,
              action: 'QUALIFYING_ADMIN_REASSIGNMENT',
              detail: JSON.stringify({
                userId: targetUserId,
                studentId: student?.id,
                component: canonicalComp,
                reason: nextPayload.reason || 'Admin reassigned student component',
              }),
            },
          });
        }

        return result;
      });
    }
    if (name === 'component-state') {
      const statePayload = {
        ...nextPayload,
        slotLimits: normalizeSlotLimits(nextPayload.slotLimits),
      };
      return await prisma.componentApplicationState.upsert({
        where: { id: statePayload.id || 'default' },
        update: statePayload,
        create: { id: statePayload.id || 'default', ...statePayload },
      });
    }
    if (name === 'audit-log') return await upsertSimple(prisma.auditLogEntry);
  } catch (error) {
    console.warn(`Prisma ${name} upsert failed: ${error?.message || error}`);
    throw classifyDatabaseError(error, name);
  }
}

export async function deleteAdminResource(name, id) {
  try {
    const modelMap = {
      accounts: prisma.user,
      modules: prisma.module,
      assessments: prisma.quiz,
      students: prisma.studentProfile,
      grades: prisma.grade,
      'pending-registrations': prisma.pendingRegistration,
      'training-groups': prisma.trainingGroup,
      'attendance-records': prisma.attendanceRecord,
      'attendance-sessions': prisma.attendanceSession,
      'qualifying-results': prisma.qualifyingExamResult,
      'component-state': prisma.componentApplicationState,
      'audit-log': prisma.auditLogEntry,
    };
    if (name === 'students') {
      const student = await prisma.studentProfile.findFirst({
        where: { OR: [{ id }, { userId: id }] },
      });
      if (student) {
        return await prisma.studentProfile.delete({ where: { id: student.id } });
      }
      return null;
    }
    const model = modelMap[name];
    if (model) {
      return await model.delete({ where: { id } });
    }
    if (name === 'notices' || name === 'supportTickets') {
      const items = fallback[name] || [];
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
      return { id, deleted: index >= 0 };
    }
    return null;
  } catch (error) {
    console.warn(`Prisma ${name} delete failed: ${error?.message || error}`);
    throw classifyDatabaseError(error, name);
  }
}

/**
 * Resources whose rows carry an NSTP component that must resolve to a canonical
 * type before anything is written. `students` is the sensitive one: a student's
 * component decides which coordinator sees the record. `training-groups` is
 * included because its component column is what scopes the coordinator report.
 */
const COMPONENT_BEARING_RESOURCES = Object.freeze({
  students: { required: true },
  'training-groups': { required: false },
  accounts: { required: false },
});

/**
 * Finds every row whose component cannot be resolved, identified by its 1-based
 * position in the submitted batch so an operator can locate it in the source
 * file.
 *
 * `required: true` also rejects a missing or blank value; the looser resources
 * only reject a value that was supplied and is wrong, because their component is
 * optional metadata rather than the authorisation-relevant assignment.
 */
export function findInvalidComponentRows(name, records) {
  const rule = COMPONENT_BEARING_RESOURCES[name];
  if (!rule) return [];
  const invalid = [];
  records.forEach((payload, index) => {
    const supplied = payload?.component;
    const blank = supplied === undefined || supplied === null || String(supplied).trim() === '';
    if (blank && !rule.required) return;
    if (!blank && toComponentType(supplied) !== null) return;
    invalid.push({
      row: index + 1,
      value: blank ? '' : String(supplied),
      id: payload?.id,
      studentId: payload?.studentId,
      email: payload?.email,
    });
  });
  return invalid;
}

export async function batchUpsertAdminResources(name, records) {
  // The whole batch is validated before the first write. Two reasons: a bad
  // component must never be guessed into a real program, and an import that
  // fails halfway leaves the operator with a partially applied spreadsheet and
  // no clear way to tell which rows landed. Rejecting up front keeps the file
  // atomic with respect to this class of error.
  const invalidComponents = findInvalidComponentRows(name, records);
  if (invalidComponents.length) {
    const preview = invalidComponents.slice(0, 5)
      .map((entry) => `row ${entry.row}${entry.value ? ` ("${entry.value}")` : ' (blank)'}`)
      .join(', ');
    const error = new Error(
      `${invalidComponents.length} row(s) have an unrecognised NSTP component: ${preview}`
      + `${invalidComponents.length > 5 ? ', …' : ''}. `
      + `Use one of: ${Object.values(NSTP_COMPONENT_NAMES).join(', ')}. No records were imported.`,
    );
    error.statusCode = 400;
    error.code = 'INVALID_COMPONENT';
    error.rows = invalidComponents;
    throw error;
  }

  const results = [];
  for (const payload of records) {
    const lookup = payload.id
      ? { id: payload.id }
      : payload.studentId
        ? { studentId: payload.studentId }
        : payload.email
          ? { email: payload.email }
          : { id: `${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}` };
    try {
      const result = await upsertAdminResource(name, lookup, { ...lookup, ...payload });
      results.push(result);
    } catch (err) {
      if (err?.statusCode === 503) throw err;
      results.push({ error: err.message || 'Unknown error', email: payload.email, id: payload.id });
    }
  }
  return results;
}

export async function getAdminSummary() {
  const [students, modules, assessments, grades] = await Promise.all([
    listAdminResource('students'),
    listAdminResource('modules'),
    listAdminResource('assessments'),
    listAdminResource('grades'),
  ]);

  return {
    students: students.length,
    learningHours: modules.reduce((sum, module) => sum + (Number(module.hours) || 0), 0),
    assessments: assessments.length,
    releasedGrades: grades.filter((grade) => grade.isReleased || grade.released).length,
    totalGradeRecords: grades.length,
    reportsGenerated: 12,
    updatedAt: now(),
  };
}

export async function placeStudent(tx, {
  studentId,
  userId,
  canonicalComponent,
  sectionId = null,
  schoolYear,
  semester,
}) {
  let student = null;
  if (studentId) {
    student = await tx.studentProfile.findUnique({ where: { id: studentId } });
  } else if (userId) {
    student = await tx.studentProfile.findUnique({ where: { userId } });
  }
  if (!student) {
    throw new Error(`Student profile not found for placement: ${studentId || userId}`);
  }

  // Resolve cycle from ComponentApplicationState or section if not explicitly provided
  let cycleSchoolYear = schoolYear;
  let cycleSemester = semester;
  if (cycleSchoolYear === undefined || cycleSemester === undefined) {
    if (sectionId) {
      const sec = await tx.section.findUnique({ where: { id: sectionId } });
      if (cycleSchoolYear === undefined) cycleSchoolYear = sec?.schoolYear ?? null;
      if (cycleSemester === undefined) cycleSemester = sec?.semester ?? null;
    }
    if (!cycleSchoolYear || !cycleSemester) {
      const appState = await tx.componentApplicationState.findFirst({
        orderBy: { updatedAt: 'desc' },
      });
      if (cycleSchoolYear === undefined) cycleSchoolYear = appState?.schoolYear ?? null;
      if (cycleSemester === undefined) cycleSemester = appState?.semester ?? null;
    }
  }

  cycleSchoolYear = cycleSchoolYear || '2025-2026';
  cycleSemester = cycleSemester || '1st Semester';

  const component = await tx.nSTPComponent.findFirst({
    where: {
      OR: [
        { type: canonicalComponent },
        { id: canonicalComponent },
      ],
    },
  });
  const componentId = component?.id || canonicalComponent;

  // Single source of component assignment: StudentProfile.componentId
  const updatedStudent = await tx.studentProfile.update({
    where: { id: student.id },
    data: { componentId },
  });

  // Drop other components' enrollments for this student for that term
  const dropWhere = {
    studentId: student.id,
    componentId: { not: componentId },
    status: { not: 'DROPPED' },
  };
  if (cycleSchoolYear) dropWhere.schoolYear = cycleSchoolYear;
  if (cycleSemester) dropWhere.semester = cycleSemester;

  await tx.enrollment.updateMany({
    where: dropWhere,
    data: { status: 'DROPPED' },
  });

  // Find existing enrollment in target component for this student and cycle
  const existingEnrollment = await tx.enrollment.findFirst({
    where: {
      studentId: student.id,
      componentId,
      ...(cycleSchoolYear ? { schoolYear: cycleSchoolYear } : {}),
      ...(cycleSemester ? { semester: cycleSemester } : {}),
    },
  });

  let enrollment;
  if (existingEnrollment) {
    enrollment = await tx.enrollment.update({
      where: { id: existingEnrollment.id },
      data: {
        status: 'ACTIVE',
        sectionId: sectionId !== undefined ? sectionId : existingEnrollment.sectionId,
        schoolYear: cycleSchoolYear,
        semester: cycleSemester,
      },
    });
  } else {
    enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        componentId,
        sectionId,
        schoolYear: cycleSchoolYear,
        semester: cycleSemester,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });
  }

  return { student: updatedStudent, enrollment };
}

export async function countDistinctPlacedStudents(tx, {
  canonicalComponent,
  currentStudentId,
  currentUserId,
  schoolYear,
  semester,
}) {
  const component = await tx.nSTPComponent.findFirst({
    where: {
      OR: [
        { type: canonicalComponent },
        { id: canonicalComponent },
      ],
    },
  });
  const componentId = component?.id || canonicalComponent;

  // Resolve open cycle from ComponentApplicationState if not explicitly provided
  let cycleSchoolYear = schoolYear;
  let cycleSemester = semester;
  if (cycleSchoolYear === undefined || cycleSemester === undefined) {
    const appState = await tx.componentApplicationState.findFirst({
      where: { applicationClosed: false },
      orderBy: { updatedAt: 'desc' },
    });
    if (cycleSchoolYear === undefined) cycleSchoolYear = appState?.schoolYear ?? null;
    if (cycleSemester === undefined) cycleSemester = appState?.semester ?? null;
  }

  if (!cycleSchoolYear || !cycleSemester) {
    const err = new Error('Cannot place student: no active qualifying application cycle is open.');
    err.statusCode = 409;
    throw err;
  }

  const where = {
    componentId,
    status: 'ACTIVE',
  };

  if (cycleSchoolYear) {
    where.schoolYear = cycleSchoolYear;
  }
  if (cycleSemester) {
    where.semester = cycleSemester;
  }

  if (currentStudentId) {
    where.studentId = { not: currentStudentId };
  } else if (currentUserId) {
    where.student = { userId: { not: currentUserId } };
  }

  // Count distinct placed students with ACTIVE enrollments for that cycle
  const activeEnrollments = await tx.enrollment.findMany({
    where,
    distinct: ['studentId'],
    select: { studentId: true },
  });

  return activeEnrollments.length;
}
