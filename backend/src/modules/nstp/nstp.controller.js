import prisma from '../../db/prisma.js';
import { sendError, sendSuccess } from '../../utils/apiResponse.js';
import {
  batchUpsertAdminResources,
  deleteAdminResource,
  getAdminSummary,
  getDatabaseStatus,
  listAdminResource,
  listManagedModules,
  MODULE_ACCESS,
  listCoordinatorTrainingGroups,
  listPublishedModules,
  createManagedModule,
  updateManagedModule,
  removeManagedModule,
  listManagedAssessments,
  listStudentAssessments,
  createManagedAssessment,
  updateManagedAssessment,
  removeManagedAssessment,
  listAssessmentAttempts,
  overrideAssessmentAttempt,
  upsertAdminResource,
  placeStudent,
  countDistinctPlacedStudents,
} from './nstp.service.js';
import { emitCollectionChange } from '../../websocket.js';
import { studentSelfSelect, toStudentSelfProfileDto } from '../auth/user.dto.js';
import {
  toCanonicalComponentType,
  normalizeSlotLimits,
  DEFAULT_CANONICAL_SLOT_LIMITS,
} from './component-normalization.js';
import { QUALIFYING_EXAM_ID } from '../../seed.js';

const ADMIN_RESOURCES = new Set([
  'accounts', 'modules', 'assessments', 'students', 'grades',
  'pending-registrations', 'training-groups', 'attendance-records',
  'attendance-sessions', 'qualifying-results', 'component-state', 'audit-log',
]);

function adminResourceHandlers(resource) {
  if (!ADMIN_RESOURCES.has(resource)) throw new Error(`Unsupported resource: ${resource}`);
  return {
    list: async (req, res) => res.json(await listAdminResource(resource, req.query)),
    upsert: async (req, res) => {
      const payload = req.body || {};
      if (resource === 'grades' && !payload.id) return sendError(res, 'Grade id is required.', 400);
      const lookup = payload.id ? { id: payload.id }
        : payload.studentId ? { studentId: payload.studentId }
          : payload.email ? { email: payload.email }
            : { id: `${resource}-${Date.now()}` };
      const record = await upsertAdminResource(resource, lookup, { ...lookup, ...payload });
      emitCollectionChange(resource, 'upserted');
      return res.status(201).json(record);
    },
    batch: async (req, res) => {
      const records = req.body;
      if (!Array.isArray(records) || records.length === 0) {
        return sendError(res, 'Expected a non-empty array of records.', 400);
      }
      let results;
      try {
        results = await batchUpsertAdminResources(resource, records);
      } catch (error) {
        // A batch rejected for an unresolvable component is reported with the
        // offending row positions so the operator can correct the source file.
        // Nothing was written, so this is a clean 400 rather than a partial 207.
        if (error?.code === 'INVALID_COMPONENT') {
          return res.status(400).json({
            success: false, error: error.message, code: error.code, upserted: 0, rows: error.rows || [],
          });
        }
        throw error;
      }
      const failed = results.filter((entry) => entry?.error);
      emitCollectionChange(resource, 'batch-upserted');
      if (failed.length) {
        return res.status(207).json({ success: false, upserted: results.length - failed.length, failed: failed.length, errors: failed });
      }
      return sendSuccess(res, { upserted: results.length });
    },
    remove: async (req, res) => {
      const result = await deleteAdminResource(resource, req.params.id);
      if (!result) return sendError(res, 'Record not found or could not be deleted.', 404);
      emitCollectionChange(resource, 'deleted');
      return sendSuccess(res, { deleted: result.id || req.params.id });
    },
  };
}

export const adminAccounts = adminResourceHandlers('accounts');
export const adminStudents = adminResourceHandlers('students');
export const adminPendingRegistrations = adminResourceHandlers('pending-registrations');
export const adminTrainingGroups = adminResourceHandlers('training-groups');
export const adminAttendanceRecords = adminResourceHandlers('attendance-records');
export const adminAttendanceSessions = adminResourceHandlers('attendance-sessions');
export const adminQualifyingResults = adminResourceHandlers('qualifying-results');
export const adminComponentState = adminResourceHandlers('component-state');
export const adminAuditLog = adminResourceHandlers('audit-log');

export async function listAdminModules(req, res) {
  // Administrator reads are unrestricted, and say so. The route already enforces
  // requireRole('ADMIN').
  return res.json(await listManagedModules({ mode: MODULE_ACCESS.UNRESTRICTED }));
}

export async function createAdminModule(req, res) {
  const module = await createManagedModule(req.user.id, req.validated.body);
  emitCollectionChange('modules', 'created');
  return sendSuccess(res, module, 201);
}

export async function updateAdminModule(req, res) {
  const module = await updateManagedModule(req.user.id, req.params.id, req.validated.body);
  emitCollectionChange('modules', 'updated');
  return sendSuccess(res, module);
}

export async function removeAdminModule(req, res) {
  const result = await removeManagedModule(req.user.id, req.params.id);
  emitCollectionChange('modules', result.archived ? 'archived' : 'deleted');
  return sendSuccess(res, result);
}

export async function listCoordinatorModules(req, res) {
  // Component-restricted. If the middleware ever resolved an empty component
  // list this returns nothing, not everything.
  return res.json(await listManagedModules({
    mode: MODULE_ACCESS.COMPONENTS,
    componentIds: req.coordinator.allowedComponentIds,
  }));
}

export async function createCoordinatorModule(req, res) {
  const module = await createManagedModule(req.user.id, req.validated.body, req.coordinator.allowedComponentIds);
  emitCollectionChange('modules', 'created');
  return sendSuccess(res, module, 201);
}

export async function updateCoordinatorModule(req, res) {
  const module = await updateManagedModule(req.user.id, req.params.id, req.validated.body, req.coordinator.allowedComponentIds);
  emitCollectionChange('modules', 'updated');
  return sendSuccess(res, module);
}

export async function removeCoordinatorModule(req, res) {
  const result = await removeManagedModule(req.user.id, req.params.id, req.coordinator.allowedComponentIds);
  emitCollectionChange('modules', result.archived ? 'archived' : 'deleted');
  return sendSuccess(res, result);
}

export async function listStudentModules(req, res) {
  return res.json(await listPublishedModules([req.student.componentId]));
}

export async function listInstructorModules(req, res) {
  return res.json(await listManagedModules({
    mode: MODULE_ACCESS.INSTRUCTOR,
    instructorId: req.instructor.id,
    componentIds: (req.instructor.sections || []).map((section) => section.componentId),
  }));
}

const adminActor = (req) => ({ userId: req.user.id, name: req.user.name || 'Administrator', role: 'ADMIN' });
const coordinatorActor = (req) => ({ userId: req.user.id, name: req.user.name || 'Coordinator', role: 'COORDINATOR', componentIds: req.coordinator.allowedComponentIds });
const instructorActor = (req) => ({
  userId: req.user.id,
  name: req.user.name || 'Facilitator',
  role: 'INSTRUCTOR',
  instructorId: req.instructor.id,
  componentIds: [...new Set((req.instructor.sections || []).map((section) => section.componentId))],
});

export async function listAdminAssessments(req, res) {
  return res.json(await listManagedAssessments(adminActor(req)));
}

export async function createAdminAssessment(req, res) {
  const assessment = await createManagedAssessment(adminActor(req), req.validated.body);
  emitCollectionChange('assessments', 'created');
  return sendSuccess(res, assessment, 201);
}

export async function updateAdminAssessment(req, res) {
  const assessment = await updateManagedAssessment(adminActor(req), req.params.id, req.validated.body);
  emitCollectionChange('assessments', 'updated');
  return sendSuccess(res, assessment);
}

export async function removeAdminAssessment(req, res) {
  const result = await removeManagedAssessment(adminActor(req), req.params.id);
  emitCollectionChange('assessments', result.archived ? 'archived' : 'deleted');
  return sendSuccess(res, result);
}

export async function listCoordinatorAssessments(req, res) {
  return res.json(await listManagedAssessments(coordinatorActor(req)));
}

export async function createCoordinatorAssessment(req, res) {
  return sendSuccess(res, await createManagedAssessment(coordinatorActor(req), req.validated.body), 201);
}

export async function updateCoordinatorAssessment(req, res) {
  return sendSuccess(res, await updateManagedAssessment(coordinatorActor(req), req.params.id, req.validated.body));
}

export async function removeCoordinatorAssessment(req, res) {
  return sendSuccess(res, await removeManagedAssessment(coordinatorActor(req), req.params.id));
}

export async function listInstructorAssessments(req, res) {
  return res.json(await listManagedAssessments(instructorActor(req)));
}

export async function createInstructorAssessment(req, res) {
  return sendSuccess(res, await createManagedAssessment(instructorActor(req), req.validated.body), 201);
}

export async function updateInstructorAssessment(req, res) {
  return sendSuccess(res, await updateManagedAssessment(instructorActor(req), req.params.id, req.validated.body));
}

export async function removeInstructorAssessment(req, res) {
  return sendSuccess(res, await removeManagedAssessment(instructorActor(req), req.params.id));
}

export async function listMyAssessments(req, res) {
  return res.json(await listStudentAssessments(req.student.componentId));
}

export async function listAdminAssessmentAttempts(req, res) {
  return res.json(await listAssessmentAttempts());
}

export async function overrideAdminAssessmentAttempt(req, res) {
  return sendSuccess(res, await overrideAssessmentAttempt(adminActor(req), req.params.id, req.validated.body.status, req.validated.body.reason));
}

export async function getDbTest(req, res) {
  const status = await getDatabaseStatus();
  return res.json(status);
}

export async function getAdminSummaryController(req, res) {
  return res.json(await getAdminSummary());
}

export async function getMyStudentProfile(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: studentSelfSelect,
  });
  return sendSuccess(res, toStudentSelfProfileDto(user));
}

export async function getMyProgress(req, res) {
  const [progress, storedAttempts] = await Promise.all([
    prisma.moduleProgress.findMany({ where: { studentId: req.student.id }, orderBy: { updatedAt: 'desc' } }),
    prisma.submission.findMany({
      where: { studentId: req.student.id, quizId: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take: 100,
      select: { id: true, quizId: true, score: true, submittedAt: true, content: true, quiz: { select: { data: true } } },
    }),
  ]);
  const attempts = storedAttempts.map((attempt) => {
    const computedPassed = Number(attempt.score || 0) >= Number(attempt.quiz?.data?.passingScore ?? 70);
    const manualStatus = attempt.content?.override?.status;
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      score: attempt.score,
      submittedAt: attempt.submittedAt,
      passed: manualStatus === 'passed' ? true : manualStatus === 'failed' ? false : computedPassed,
      ...(manualStatus ? { manualStatus } : {}),
    };
  });
  return sendSuccess(res, { progress, attempts });
}

export async function completeMyModule(req, res) {
  const module = await prisma.module.findFirst({
    where: {
      id: req.params.moduleId,
      status: 'PUBLISHED',
      OR: [{ componentId: null }, ...(req.student.componentId ? [{ componentId: req.student.componentId }] : [])],
    },
    include: {
      quizzes: {
        where: { status: 'PUBLISHED' },
        include: { submissions: { where: { studentId: req.student.id }, select: { score: true, content: true } } },
      },
    },
  });
  if (!module) return sendError(res, 'Module is not available for completion.', 404);
  const requiredAssessments = module.quizzes.filter((quiz) => quiz.data?.type !== 'exam');
  if (!requiredAssessments.length) {
    return sendError(res, 'Module has no published assessment and cannot be marked complete.', 409);
  }
  const incompleteAssessment = requiredAssessments.find((quiz) => {
    const passingScore = Number(quiz.data?.passingScore ?? 70);
    return !quiz.submissions.some((submission) => {
      const manualStatus = submission.content?.override?.status;
      if (manualStatus === 'passed') return true;
      if (manualStatus === 'failed' || manualStatus === 'review') return false;
      return Number(submission.score || 0) >= passingScore;
    });
  });
  if (incompleteAssessment) return sendError(res, 'Pass the published module assessment before marking this module complete.', 409);
  const progress = await prisma.moduleProgress.upsert({
    where: { studentId_moduleId: { studentId: req.student.id, moduleId: module.id } },
    update: { completedAt: new Date() },
    create: { studentId: req.student.id, moduleId: module.id, completedAt: new Date() },
  });
  return sendSuccess(res, progress, 201);
}

export async function submitMyAssessment(req, res) {
  const quiz = await prisma.quiz.findFirst({
    where: {
      id: req.params.assessmentId,
      status: 'PUBLISHED',
      module: { status: 'PUBLISHED', OR: [{ componentId: null }, ...(req.student.componentId ? [{ componentId: req.student.componentId }] : [])] },
    },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!quiz) return sendError(res, 'Assessment is not available.', 404);
  const definition = quiz.data || {};
  const legacyQuestions = Array.isArray(definition.questions) ? definition.questions : [];
  const questions = quiz.questions.length ? quiz.questions.map((question) => ({ id: question.id, options: question.options, correctIndex: question.answer?.correctIndex })) : legacyQuestions;
  const answers = req.validated.body.answers;
  const expectedCount = Number(definition.questionsToShow || 0) || questions.length;
  const uniqueQuestionIds = new Set(answers.map((answer) => answer.questionId));
  if (!questions.length || answers.length !== expectedCount || uniqueQuestionIds.size !== answers.length) {
    return sendError(res, 'Invalid assessment answers: count must match expected total and duplicates are rejected.', 400);
  }
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  let correct = 0;
  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question || answer.optionIndex >= question.options.length) return sendError(res, 'Invalid assessment answers.', 400);
    if (Number(answer.optionIndex) === Number(question.correctIndex)) correct += 1;
  }
  const score = Math.round((correct / expectedCount) * 100);
  const attemptNumber = await prisma.submission.count({ where: { studentId: req.student.id, quizId: quiz.id } }) + 1;
  const attempt = await prisma.submission.create({
    data: { studentId: req.student.id, quizId: quiz.id, content: { answers, attemptNumber }, score, status: 'GRADED', gradedAt: new Date() },
  });
  return sendSuccess(res, { id: attempt.id, assessmentId: quiz.id, attemptNumber, score, correct, total: expectedCount, passed: score >= Number(definition.passingScore || 0), submittedAt: attempt.submittedAt }, 201);
}

export async function getMyAttendance(req, res) {
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: { in: [req.student.id, req.user.id] } }, orderBy: { createdAt: 'desc' },
  });
  return sendSuccess(res, records);
}

export async function getMyQualifyingResults(req, res) {
  const results = await prisma.qualifyingExamResult.findMany({
    where: { userId: req.user.id }, orderBy: { createdAt: 'desc' },
  });
  return sendSuccess(res, results);
}

let allocationLock = Promise.resolve();
export function withAllocationLock(fn) {
  const next = allocationLock.then(() => fn(), () => fn());
  allocationLock = next.catch(() => {});
  return next;
}

export async function startMyQualifyingExam(req, res) {
  const studentId = req.student?.id;
  if (!studentId) {
    return sendError(res, 'Student profile not found.', 404);
  }

  // 1. Verify 25 common module hours completed
  const completedProgress = await prisma.moduleProgress.findMany({
    where: {
      studentId,
      completedAt: { not: null },
      module: {
        componentId: null,
      },
    },
    include: {
      module: {
        select: { hours: true },
      },
    },
  });
  const completedHours = completedProgress.reduce((sum, item) => sum + (Number(item.module?.hours) || 0), 0);
  if (completedHours < 25) {
    return sendError(res, `Cannot start exam before completing 25 hours of common modules (completed: ${completedHours} hrs).`, 400);
  }

  // 2. Retake policy: cannot exceed allowed attempts (1 attempt allowed)
  const existingAttempts = await prisma.qualifyingExamAttempt.count({
    where: { userId: req.user.id },
  });
  if (existingAttempts >= 1) {
    return sendError(res, 'Cannot exceed maximum allowed qualifying exam attempts (maximum 1 attempt).', 400);
  }

  // 3. Find master qualifying exam
  const exam = await prisma.exam.findFirst({
    where: {
      OR: [
        { id: QUALIFYING_EXAM_ID },
        { title: { contains: 'Qualifying' } },
      ],
    },
    include: {
      questions: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return sendError(res, 'Qualifying exam is not currently available.', 404);
  }

  const sanitizedQuestions = exam.questions.map((q, idx) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options,
    order: q.order ?? idx,
  }));

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + 60 * 60 * 1000); // 60-minute limit
  const preferredComponent = toCanonicalComponentType(req.body.preferredComponent) || req.body.preferredComponent;

  const attempt = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: req.user.id,
      userName: req.user.name || 'Student',
      userEmail: req.user.email || '',
      examId: exam.id,
      preferredComponent,
      attemptNumber: 1,
      startedAt,
      expiresAt,
      status: 'STARTED',
    },
  });

  return sendSuccess(res, {
    attemptId: attempt.id,
    examTitle: exam.title,
    expiresAt: attempt.expiresAt.toISOString(),
    questions: sanitizedQuestions,
  }, 201);
}

export async function submitMyQualifyingExam(req, res) {
  // Reject if client attempts to submit a score
  if (req.body?.score !== undefined) {
    return sendError(res, 'Submitting a score is not allowed. Exam scores are computed server-side.', 400);
  }

  const { attemptId, answers } = req.body;
  const canonicalPreferred = toCanonicalComponentType(req.body.preferredComponent) || req.body.preferredComponent;

  const uniqueQuestionIds = new Set((answers || []).map((ans) => ans.questionId));
  if (uniqueQuestionIds.size !== (answers || []).length) {
    return sendError(res, 'Duplicate question answers are not allowed.', 400);
  }

  const attempt = await prisma.qualifyingExamAttempt.findFirst({
    where: {
      id: attemptId,
      userId: req.user.id,
    },
  });

  if (!attempt) {
    return sendError(res, 'Qualifying exam attempt not found.', 404);
  }

  if (attempt.status !== 'STARTED') {
    return sendError(res, 'Exam attempt has already been submitted or completed.', 400);
  }

  const now = new Date();
  if (now.getTime() > new Date(attempt.expiresAt).getTime()) {
    await prisma.qualifyingExamAttempt.update({
      where: { id: attempt.id },
      data: { status: 'EXPIRED' },
    });
    return sendError(res, 'Exam has expired. Submission rejected.', 400);
  }

  const exam = await prisma.exam.findFirst({
    where: {
      OR: [
        { id: attempt.examId || QUALIFYING_EXAM_ID },
        { id: QUALIFYING_EXAM_ID },
        { title: { contains: 'Qualifying' } },
      ],
    },
    include: { questions: true },
  });

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return sendError(res, 'Master exam questions could not be loaded.', 500);
  }

  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  let correct = 0;
  for (const ans of (answers || [])) {
    const q = questionMap.get(ans.questionId);
    if (q) {
      const correctIndex = q.answer?.correctIndex;
      if (correctIndex !== undefined && Number(ans.optionIndex) === Number(correctIndex)) {
        correct += 1;
      }
    }
  }
  const score = Math.round((correct / exam.questions.length) * 100);

  const result = await withAllocationLock(async () => {
    return await prisma.$transaction(async (tx) => {
      let appState = null;
      try {
        const locked = await tx.$queryRaw`SELECT id, "slotLimits", "qualifyingScore", "applicationClosed" FROM component_application_state WHERE id = 'default' FOR UPDATE`;
        if (locked && locked.length) {
          appState = locked[0];
        }
      } catch {
        appState = await tx.componentApplicationState.findFirst();
      }
      if (!appState) {
        appState = await tx.componentApplicationState.findFirst();
      }

      const slotLimits = normalizeSlotLimits(appState?.slotLimits);
      const qualifyingScore = appState?.qualifyingScore ?? 70;
      const slotLimit = slotLimits[canonicalPreferred] ?? DEFAULT_CANONICAL_SLOT_LIMITS[canonicalPreferred] ?? 0;

      // Count quota strictly by distinct placed students in this component
      const assignedCount = await countDistinctPlacedStudents(tx, {
        canonicalComponent: canonicalPreferred,
        currentStudentId: req.student?.id,
        currentUserId: req.user?.id,
      });

      const passed = score >= qualifyingScore;
      let status;
      let assignedComponent;
      let rank;

      if (passed && assignedCount < slotLimit) {
        status = 'assigned-preferred';
        assignedComponent = canonicalPreferred;
        rank = assignedCount + 1;
        await placeStudent(tx, {
          studentId: req.student?.id,
          userId: req.user?.id,
          canonicalComponent: canonicalPreferred,
        });
      } else {
        status = passed ? 'waitlisted' : 'not-qualified';
        assignedComponent = null;
        rank = null;
      }

      const submittedAt = new Date();

      await tx.qualifyingExamAttempt.update({
        where: { id: attempt.id },
        data: {
          score,
          answers,
          submittedAt,
          status,
          assignedComponent,
          rank,
        },
      });

      const existingResult = await tx.qualifyingExamResult.findFirst({
        where: { userId: req.user.id },
      });
      const resultId = existingResult?.id || `qxr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const examResult = await tx.qualifyingExamResult.upsert({
        where: { id: resultId },
        update: {
          score,
          preferredComponent: canonicalPreferred,
          timestamp: submittedAt.toISOString(),
          assignedComponent,
          rank,
          status,
          attemptNumber: attempt.attemptNumber || 1,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          submittedAt,
        },
        create: {
          id: resultId,
          userId: req.user.id,
          userName: req.user.name || attempt.userName || 'Student',
          userEmail: req.user.email || attempt.userEmail || '',
          preferredComponent: canonicalPreferred,
          score,
          timestamp: submittedAt.toISOString(),
          assignedComponent,
          rank,
          status,
          attemptNumber: attempt.attemptNumber || 1,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          submittedAt,
        },
      });

      return {
        id: examResult.id,
        attemptId: attempt.id,
        score,
        passed,
        assignedComponent,
        status,
        rank,
        submittedAt: submittedAt.toISOString(),
      };
    });
  });

  return sendSuccess(res, result, 201);
}

export async function listInstructorClasses(req, res) {
  const sections = await prisma.section.findMany({ where: { instructorId: req.instructor.id } });
  return sendSuccess(res, sections);
}

export async function listInstructorClassStudents(req, res) {
  const students = await prisma.studentProfile.findMany({
    where: { sectionId: req.section.id },
    include: { user: { select: { id: true, name: true, email: true, data: true } } },
  });
  return sendSuccess(res, students);
}

// The `where` clause below is the only scope authority: allowedComponentIds is
// re-derived from the database by getCurrentCoordinator on every request and is
// never taken from the client. The extra `include`s only add the component and
// section labels the coordinator UI needs so it does not have to fetch the
// unscoped student list and filter in the browser.
export async function listCoordinatorStudents(req, res) {
  const students = await prisma.studentProfile.findMany({
    where: { componentId: { in: req.coordinator.allowedComponentIds } },
    include: {
      user: { select: { id: true, name: true, email: true, data: true } },
      component: { select: { id: true, type: true, name: true } },
      section: { select: { id: true, code: true, name: true, schoolYear: true, semester: true } },
      _count: {
        select: {
          moduleProgress: { where: { completedAt: { not: null } } },
          submissions: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  return sendSuccess(res, students);
}

export async function listCoordinatorClasses(req, res) {
  const sections = await prisma.section.findMany({
    where: { componentId: { in: req.coordinator.allowedComponentIds } },
    include: {
      component: { select: { id: true, type: true, name: true } },
      instructor: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { students: true } },
    },
    orderBy: [{ schoolYear: 'desc' }, { code: 'asc' }],
  });
  return sendSuccess(res, sections);
}

/**
 * Coordinator-scoped training groups. Follows the same chain as the students and
 * classes handlers above: `authenticate` -> `requireRole('COORDINATOR')` ->
 * `getCurrentCoordinator` (which re-derives `allowedComponentIds` from the
 * database) -> a component-restricted query. The client receives only its own
 * program's rows; nothing is narrowed in the browser.
 */
export async function listCoordinatorTrainingGroupsController(req, res) {
  return sendSuccess(res, await listCoordinatorTrainingGroups(req.coordinator.allowedComponentIds));
}

export async function listInstructorAttendanceSessions(req, res) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { facilitatorId: { in: [req.instructor.id, req.user.id] } },
    orderBy: { createdAt: 'desc' },
  });
  return sendSuccess(res, sessions);
}

export async function upsertInstructorAttendanceSession(req, res) {
  const payload = req.body || {};
  const id = payload.id || `ats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const date = payload.date || new Date().toISOString().split('T')[0];
  const title = payload.title || `NSTP Session - ${date}`;
  const session = await prisma.attendanceSession.upsert({
    where: { id },
    update: { date, title },
    create: {
      id,
      date,
      title,
      facilitatorId: req.instructor.id,
      createdAt: new Date(),
    },
  });
  return sendSuccess(res, session, 201);
}

export async function removeInstructorAttendanceSession(req, res) {
  const session = await prisma.attendanceSession.findFirst({
    where: { id: req.params.id, facilitatorId: { in: [req.instructor.id, req.user.id] } },
  });
  if (!session) return sendError(res, 'Attendance session not found.', 404);
  await prisma.attendanceRecord.deleteMany({ where: { sessionId: session.id } });
  await prisma.attendanceSession.delete({ where: { id: session.id } });
  return sendSuccess(res, { deleted: session.id });
}

export async function listInstructorAttendanceRecords(req, res) {
  const records = await prisma.attendanceRecord.findMany({
    where: { facilitatorId: { in: [req.instructor.id, req.user.id] } },
    orderBy: { updatedAt: 'desc' },
  });
  return sendSuccess(res, records);
}

export async function upsertInstructorAttendanceRecord(req, res) {
  const payload = req.body || {};
  const id = payload.id || `atr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!payload.studentId || !payload.sessionId || !payload.status) {
    return sendError(res, 'studentId, sessionId, and status are required.', 400);
  }
  const existing = await prisma.attendanceRecord.findFirst({
    where: {
      studentId: payload.studentId,
      sessionId: payload.sessionId,
    },
  });
  let record;
  if (existing) {
    record = await prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: { status: payload.status, updatedAt: new Date() },
    });
  } else {
    record = await prisma.attendanceRecord.create({
      data: {
        id,
        studentId: payload.studentId,
        sessionId: payload.sessionId,
        status: payload.status,
        facilitatorId: req.instructor.id,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    });
  }
  return sendSuccess(res, record, 201);
}
