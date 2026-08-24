// Coordinator scope integration tests.
//
// These exercise the real Express app and the real middleware chain; only the
// Prisma accessors are replaced. The point is to prove that the *server* decides
// which component records a coordinator may see, so the assertions are made on
// the `where` clauses Prisma receives and on the rows that survive them — not on
// anything the client sends.

import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

// src/db/prisma.js intentionally reuses `globalThis.prisma` when one is already
// present, so seeding it here means `new PrismaClient()` is never constructed.
// That matters for two reasons:
//
//   1. Constructing PrismaClient eagerly probes for its native query engine,
//      which fails outright when the installed client was generated for a
//      different platform than the one running the tests (a Windows workspace
//      executed on Linux, for example). That is a toolchain mismatch, not a
//      coordinator defect, and it must not surface as a failing assertion.
//   2. Every accessor starts out throwing. Any query this suite forgets to stub
//      fails loudly by name instead of quietly reaching for a real database.
//
// No production code is modified: this uses the singleton hook the module
// already exposes.
const PRISMA_MODELS = [
  'user', 'coordinatorProfile', 'instructorProfile', 'studentProfile',
  'section', 'nSTPComponent', 'grade', 'auditLogEntry',
];
const PRISMA_METHODS = ['findUnique', 'findFirst', 'findMany', 'count', 'create', 'update', 'upsert', 'delete'];

const unstubbed = (call) => async () => {
  throw new Error(`Unstubbed Prisma call: ${call}. Add an explicit stub to this test.`);
};

globalThis.prisma = {
  $transaction: unstubbed('$transaction'),
  $queryRaw: unstubbed('$queryRaw'),
  $disconnect: async () => {},
  ...Object.fromEntries(PRISMA_MODELS.map((model) => [
    model,
    Object.fromEntries(PRISMA_METHODS.map((method) => [method, unstubbed(`${model}.${method}`)])),
  ])),
};

const { createApp } = await import('../src/app.js');
const { default: prisma } = await import('../src/db/prisma.js');

assert.equal(prisma, globalThis.prisma, 'the application must be using the stubbed Prisma singleton');

let server;
let baseUrl;

const COMPONENTS = [
  { id: 'component-cwts', type: 'CWTS', name: 'CWTS' },
  { id: 'component-cwts-cg', type: 'CWTS_COAST_GUARD', name: 'CWTS (Coast Guard)' },
  { id: 'component-lts', type: 'LTS', name: 'LTS' },
  { id: 'component-mts-army', type: 'MTS_ARMY', name: 'MTS (Army)' },
  { id: 'component-mts-navy', type: 'MTS_NAVY', name: 'MTS (Navy)' },
];

// The component ids each coordinator program legitimately owns. Duplicated here
// deliberately: if the server-side mapping ever drifts, these fixtures must be
// updated consciously rather than silently agreeing with the implementation.
const SCOPE_COMPONENT_IDS = {
  CWTS: ['component-cwts', 'component-cwts-cg'],
  LTS: ['component-lts'],
  MTS: ['component-mts-army', 'component-mts-navy'],
};

const STUDENTS = COMPONENTS.map((component, index) => ({
  id: `student-profile-${index}`,
  studentNumber: `2026-000${index}`,
  componentId: component.id,
  user: { id: `student-user-${index}`, name: `Student ${index}`, email: `student${index}@example.test`, data: {} },
  component,
  section: null,
  _count: { moduleProgress: 0, submissions: 0 },
}));

const SECTIONS = COMPONENTS.map((component, index) => ({
  id: `section-${index}`,
  code: `${component.type}-1A`,
  name: `${component.name} 1A`,
  schoolYear: '2026-2027',
  semester: 'FIRST',
  componentId: component.id,
  instructorId: null,
  component,
  instructor: null,
  _count: { students: 0 },
}));

const originals = {
  transaction: prisma.$transaction,
  coordinatorFindUnique: prisma.coordinatorProfile.findUnique,
  componentFindMany: prisma.nSTPComponent.findMany,
  componentFindUnique: prisma.nSTPComponent.findUnique,
  studentFindMany: prisma.studentProfile.findMany,
  sectionFindMany: prisma.section.findMany,
  gradeFindMany: prisma.grade.findMany,
  gradeCount: prisma.grade.count,
  instructorFindMany: prisma.instructorProfile.findMany,
  instructorFindFirst: prisma.instructorProfile.findFirst,
  instructorFindUnique: prisma.instructorProfile.findUnique,
  instructorUpdate: prisma.instructorProfile.update,
  instructorCreate: prisma.instructorProfile.create,
  userFindUnique: prisma.user.findUnique,
  userCreate: prisma.user.create,
  userUpdate: prisma.user.update,
  auditCreate: prisma.auditLogEntry.create,
};

function token(role, id = `${role.toLowerCase()}-user`) {
  return jwt.sign({ id, email: `${id}@example.test`, role }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

async function request(path, { role, method = 'GET', body, id } = {}) {
  const headers = body ? { 'content-type': 'application/json' } : {};
  if (role) headers.authorization = `Bearer ${token(role, id)}`;
  return fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

/** Signs in as a coordinator whose profile carries exactly the given scope. */
function asCoordinator({ scope, componentId = null, profileId = 'coordinator-profile', status = 'ACTIVE' }) {
  prisma.coordinatorProfile.findUnique = async () => ({
    id: profileId, userId: 'coordinator-user', employeeNumber: 'EMP-1', scope, componentId, user: { status },
  });
  prisma.nSTPComponent.findMany = async ({ where }) => COMPONENTS.filter((component) => where.type.in.includes(component.type));
}

/** Applies a `componentId: { in: [...] }` filter the way the database would. */
function applyComponentFilter(rows, where) {
  const allowed = where?.componentId?.in;
  assert.ok(Array.isArray(allowed), 'the query must constrain componentId server-side');
  return rows.filter((row) => allowed.includes(row.componentId));
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  prisma.$transaction = originals.transaction;
  prisma.coordinatorProfile.findUnique = originals.coordinatorFindUnique;
  prisma.nSTPComponent.findMany = originals.componentFindMany;
  prisma.nSTPComponent.findUnique = originals.componentFindUnique;
  prisma.studentProfile.findMany = originals.studentFindMany;
  prisma.section.findMany = originals.sectionFindMany;
  prisma.grade.findMany = originals.gradeFindMany;
  prisma.grade.count = originals.gradeCount;
  prisma.instructorProfile.findMany = originals.instructorFindMany;
  prisma.instructorProfile.findFirst = originals.instructorFindFirst;
  prisma.instructorProfile.findUnique = originals.instructorFindUnique;
  prisma.instructorProfile.update = originals.instructorUpdate;
  prisma.instructorProfile.create = originals.instructorCreate;
  prisma.user.findUnique = originals.userFindUnique;
  prisma.user.create = originals.userCreate;
  prisma.user.update = originals.userUpdate;
  prisma.auditLogEntry.create = originals.auditCreate;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  delete globalThis.prisma;
});

// ---------------------------------------------------------------------------
// Required tests 1-3, 7, 11-13: each program is scoped to its own components,
// and the rows for every other component are dropped by the database query.
// ---------------------------------------------------------------------------

for (const scope of ['CWTS', 'LTS', 'MTS']) {
  test(`a ${scope} coordinator reads only ${scope} students from the component endpoint`, async () => {
    let observedWhere;
    asCoordinator({ scope });
    prisma.studentProfile.findMany = async ({ where }) => {
      observedWhere = where;
      return applyComponentFilter(STUDENTS, where);
    };

    const response = await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
    assert.equal(response.status, 200);
    assert.deepEqual(observedWhere, { componentId: { in: SCOPE_COMPONENT_IDS[scope] } });

    const { data } = await response.json();
    assert.deepEqual(data.map((row) => row.componentId).sort(), [...SCOPE_COMPONENT_IDS[scope]].sort());
    // Cross-component isolation: nothing outside the program survived.
    const foreign = Object.entries(SCOPE_COMPONENT_IDS).filter(([key]) => key !== scope).flatMap(([, ids]) => ids);
    assert.equal(data.filter((row) => foreign.includes(row.componentId)).length, 0);
  });

  test(`a ${scope} coordinator reads only ${scope} classes from the component endpoint`, async () => {
    let observedWhere;
    asCoordinator({ scope });
    prisma.section.findMany = async ({ where }) => {
      observedWhere = where;
      return applyComponentFilter(SECTIONS, where);
    };

    const response = await request('/api/nstp/coordinators/component/classes', { role: 'COORDINATOR' });
    assert.equal(response.status, 200);
    assert.deepEqual(observedWhere, { componentId: { in: SCOPE_COMPONENT_IDS[scope] } });

    const { data } = await response.json();
    assert.deepEqual(data.map((row) => row.componentId).sort(), [...SCOPE_COMPONENT_IDS[scope]].sort());
  });
}

test('the coordinator student endpoint supplies the labels and counts the UI needs', async () => {
  asCoordinator({ scope: 'LTS' });
  let observedInclude;
  prisma.studentProfile.findMany = async ({ where, include }) => {
    observedInclude = include;
    return applyComponentFilter(STUDENTS, where);
  };

  await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
  // Without these joins the client would have to call an unscoped endpoint to
  // resolve component and section names, which is exactly what must not happen.
  assert.ok(observedInclude.component, 'component label must be joined server-side');
  assert.ok(observedInclude.section, 'section label must be joined server-side');
  assert.deepEqual(observedInclude._count.select.moduleProgress, { where: { completedAt: { not: null } } });
  assert.equal(observedInclude._count.select.submissions, true);
});

// ---------------------------------------------------------------------------
// Required test 6 (server side): an unassigned or unrecognised scope must be
// refused, never quietly treated as CWTS.
// ---------------------------------------------------------------------------

test('a coordinator with no scope and no legacy component is refused rather than defaulted to CWTS', async () => {
  let queried = false;
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: null, componentId: null, user: { status: 'ACTIVE' } });
  prisma.studentProfile.findMany = async () => { queried = true; return STUDENTS; };

  const response = await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
  assert.equal(response.status, 403);
  assert.equal(queried, false, 'no student query may run for an unscoped coordinator');
  assert.match((await response.json()).error, /scope is not assigned/i);
});

test('an unrecognised coordinator scope is refused rather than defaulted to CWTS', async () => {
  let queried = false;
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: 'ROTC', componentId: null, user: { status: 'ACTIVE' } });
  prisma.studentProfile.findMany = async () => { queried = true; return STUDENTS; };

  const response = await request('/api/nstp/coordinators/component/classes', { role: 'COORDINATOR' });
  assert.equal(response.status, 403);
  assert.equal(queried, false);
});

test('a legacy single-component coordinator is still scoped to its own component', async () => {
  let observedWhere;
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: null, componentId: 'component-lts', user: { status: 'ACTIVE' } });
  prisma.studentProfile.findMany = async ({ where }) => { observedWhere = where; return applyComponentFilter(STUDENTS, where); };

  const response = await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
  assert.equal(response.status, 200);
  assert.deepEqual(observedWhere, { componentId: { in: ['component-lts'] } });
});

// ---------------------------------------------------------------------------
// Required test 10: coordinator report figures come from a scoped query, and a
// client-supplied componentId cannot widen it.
// ---------------------------------------------------------------------------

test('coordinator grades are restricted to the coordinator components', async () => {
  let observedWhere;
  asCoordinator({ scope: 'MTS' });
  prisma.grade.findMany = async ({ where }) => { observedWhere = where; return []; };
  prisma.grade.count = async () => 0;

  const response = await request('/api/nstp/coordinators/grades?schoolYear=2026-2027&semester=FIRST', { role: 'COORDINATOR' });
  assert.equal(response.status, 200);
  assert.deepEqual(observedWhere.componentId, { in: SCOPE_COMPONENT_IDS.MTS });
});

test('a componentId supplied by the client cannot widen coordinator grade scope', async () => {
  let observedWhere;
  asCoordinator({ scope: 'LTS' });
  prisma.grade.findMany = async ({ where }) => { observedWhere = where; return []; };
  prisma.grade.count = async () => 0;

  const response = await request('/api/nstp/coordinators/grades?schoolYear=2026-2027&semester=FIRST&componentId=component-cwts', { role: 'COORDINATOR' });
  assert.equal(response.status, 200);
  // The forced componentIds must win; the injected id must not appear at all.
  assert.deepEqual(observedWhere.componentId, { in: ['component-lts'] });
});

// ---------------------------------------------------------------------------
// Required tests 14 and 15: facilitator ownership and component ownership.
// ---------------------------------------------------------------------------

const facilitatorPayload = (component) => ({
  name: 'New Facilitator',
  email: 'new.facilitator@example.test',
  employeeNumber: 'EMP-99',
  password: 'facilitator-password',
  component,
  municipalities: ['Naval'],
});

test('a coordinator cannot create a facilitator outside their assigned component', async () => {
  asCoordinator({ scope: 'LTS' });
  let created = false;
  prisma.$transaction = async (fn) => fn({
    nSTPComponent: { findUnique: async ({ where }) => COMPONENTS.find((component) => component.type === where.type) },
    user: { findUnique: async () => null, create: async () => { created = true; return { id: 'new-user' }; } },
    instructorProfile: { create: async () => { created = true; return {}; } },
    auditLogEntry: { create: async () => ({}) },
  });

  for (const foreign of ['CWTS', 'CWTS_COAST_GUARD', 'MTS_ARMY', 'MTS_NAVY']) {
    const response = await request('/api/nstp/coordinators/facilitators', {
      role: 'COORDINATOR', method: 'POST', body: facilitatorPayload(foreign),
    });
    assert.equal(response.status, 403, `${foreign} must be rejected for an LTS coordinator`);
    assert.match((await response.json()).error, /outside your coordinator scope/i);
  }
  assert.equal(created, false, 'no account may be provisioned for an out-of-scope component');
});

test('a coordinator cannot move an owned facilitator to a component outside their scope', async () => {
  asCoordinator({ scope: 'CWTS' });
  let updated = false;
  prisma.$transaction = async (fn) => fn({
    instructorProfile: {
      findFirst: async () => ({ id: 'instructor-profile', userId: 'facilitator-user', componentId: 'component-cwts', municipalities: ['Naval'], component: COMPONENTS[0], user: { data: {} } }),
      update: async () => { updated = true; return {}; },
      findUnique: async () => ({}),
    },
    nSTPComponent: { findUnique: async ({ where }) => COMPONENTS.find((component) => component.type === where.type) },
    user: { update: async () => { updated = true; return {}; } },
    auditLogEntry: { create: async () => ({}) },
  });

  const response = await request('/api/nstp/coordinators/facilitators/facilitator-user', {
    role: 'COORDINATOR', method: 'PATCH', body: { component: 'MTS_ARMY' },
  });
  assert.equal(response.status, 403);
  assert.equal(updated, false);
});

test("a coordinator cannot modify another coordinator's facilitator", async () => {
  asCoordinator({ scope: 'CWTS', profileId: 'coordinator-a' });
  let observedWhere;
  let updated = false;
  prisma.$transaction = async (fn) => fn({
    instructorProfile: {
      // Ownership is enforced in the query itself: a facilitator owned by
      // another coordinator simply does not match.
      findFirst: async ({ where }) => { observedWhere = where; return where.coordinatorId === 'coordinator-b' ? {} : null; },
      update: async () => { updated = true; return {}; },
    },
    user: { update: async () => { updated = true; return {}; } },
    auditLogEntry: { create: async () => ({}) },
  });

  const response = await request('/api/nstp/coordinators/facilitators/foreign-facilitator', {
    role: 'COORDINATOR', method: 'PATCH', body: { title: 'Reassigned by an unrelated coordinator' },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(observedWhere, { userId: 'foreign-facilitator', coordinatorId: 'coordinator-a' });
  assert.equal(updated, false);
});

test("a coordinator cannot suspend another coordinator's facilitator", async () => {
  asCoordinator({ scope: 'MTS', profileId: 'coordinator-a' });
  let observedWhere;
  let statusChanged = false;
  prisma.$transaction = async (fn) => fn({
    instructorProfile: { findFirst: async ({ where }) => { observedWhere = where; return null; } },
    user: { update: async () => { statusChanged = true; return {}; } },
    auditLogEntry: { create: async () => ({}) },
  });

  const response = await request('/api/nstp/coordinators/facilitators/foreign-facilitator/suspend', { role: 'COORDINATOR', method: 'POST' });
  assert.equal(response.status, 404);
  assert.deepEqual(observedWhere, { userId: 'foreign-facilitator', coordinatorId: 'coordinator-a' });
  assert.equal(statusChanged, false);
});

test('a coordinator only lists the facilitators they own', async () => {
  asCoordinator({ scope: 'CWTS', profileId: 'coordinator-a' });
  let observedWhere;
  prisma.instructorProfile.findMany = async ({ where }) => { observedWhere = where; return []; };

  const response = await request('/api/nstp/coordinators/facilitators', { role: 'COORDINATOR' });
  assert.equal(response.status, 200);
  assert.deepEqual(observedWhere, { coordinatorId: 'coordinator-a' });
});

// ---------------------------------------------------------------------------
// Required test 19: no protected coordinator data leaves the API without a
// valid coordinator identity.
// ---------------------------------------------------------------------------

test('coordinator endpoints expose no data without authentication', async () => {
  let queried = false;
  prisma.studentProfile.findMany = async () => { queried = true; return STUDENTS; };
  prisma.section.findMany = async () => { queried = true; return SECTIONS; };

  for (const path of [
    '/api/nstp/coordinators/component/students',
    '/api/nstp/coordinators/component/classes',
    '/api/nstp/coordinators/facilitators',
    '/api/nstp/coordinators/grades?schoolYear=2026-2027&semester=FIRST',
  ]) {
    assert.equal((await request(path)).status, 401, `${path} must require authentication`);
  }
  assert.equal(queried, false);
});

test('non-coordinator roles cannot reach coordinator component endpoints', async () => {
  let queried = false;
  prisma.studentProfile.findMany = async () => { queried = true; return STUDENTS; };
  prisma.section.findMany = async () => { queried = true; return SECTIONS; };

  for (const role of ['STUDENT', 'INSTRUCTOR']) {
    assert.equal((await request('/api/nstp/coordinators/component/students', { role })).status, 403);
    assert.equal((await request('/api/nstp/coordinators/component/classes', { role })).status, 403);
  }
  assert.equal(queried, false);
});

test('a suspended coordinator reaches no component data', async () => {
  let queried = false;
  asCoordinator({ scope: 'CWTS', status: 'SUSPENDED' });
  prisma.studentProfile.findMany = async () => { queried = true; return STUDENTS; };

  assert.equal((await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' })).status, 403);
  assert.equal(queried, false);
});

test('an incompletely configured component scope is refused instead of partially applied', async () => {
  let queried = false;
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: 'MTS', componentId: null, user: { status: 'ACTIVE' } });
  // Only one of the two MTS components exists in this database.
  prisma.nSTPComponent.findMany = async () => [COMPONENTS[3]];
  prisma.studentProfile.findMany = async () => { queried = true; return STUDENTS; };

  const response = await request('/api/nstp/coordinators/component/students', { role: 'COORDINATOR' });
  assert.equal(response.status, 403);
  assert.equal(queried, false, 'a half-configured scope must not silently read a subset');
});

// The websocket room resolver used to repeat the scope mapping inline, ending in
// an unconditional CWTS branch. These pin the imported map so an unrecognised
// scope can never be subscribed to another component's room.
test('socket rooms follow the coordinator scope for each program', async () => {
  const { resolveAuthorizedRooms } = await import('../src/websocket.js');
  for (const scope of ['CWTS', 'LTS', 'MTS']) {
    asCoordinator({ scope });
    const rooms = await resolveAuthorizedRooms({ id: 'coordinator-user', role: 'COORDINATOR' });
    const componentRooms = rooms.filter((room) => room.startsWith('component:')).sort();
    assert.deepEqual(
      componentRooms,
      SCOPE_COMPONENT_IDS[scope].map((id) => `component:${id}`).sort(),
      `${scope} must subscribe to exactly its own component rooms`,
    );
  }
});

test('an unrecognised coordinator scope joins no component room', async () => {
  const { resolveAuthorizedRooms } = await import('../src/websocket.js');
  asCoordinator({ scope: 'ROTC' });
  const rooms = await resolveAuthorizedRooms({ id: 'coordinator-user', role: 'COORDINATOR' });
  assert.deepEqual(rooms.filter((room) => room.startsWith('component:')), [], 'an unknown scope must not fall back to CWTS');
});

test('a coordinator without a valid scope joins no component room even when a legacy componentId remains', async () => {
  const { resolveAuthorizedRooms } = await import('../src/websocket.js');
  asCoordinator({ scope: null, componentId: 'component-lts' });
  const rooms = await resolveAuthorizedRooms({ id: 'coordinator-user', role: 'COORDINATOR' });
  assert.deepEqual(rooms.filter((room) => room.startsWith('component:')), []);
});
