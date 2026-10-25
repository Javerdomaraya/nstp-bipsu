import { enforceTestDatabase } from './test-db-guard.js';
// Regression suite for the coordinator scope fixes (module fail-open and the
// coordinator training-groups endpoint).
//
// Required regression tests 7-11 and 14-17 live here. They run the real Express
// app and the real middleware chain; only the Prisma accessors are replaced, and
// the assertions are made on the `where` clause the database receives — because
// "the response happened to be empty" is not the same guarantee as "the query
// could not have returned another program's rows".
//
// Nothing here reads the request body for scope: every allow-list is derived by
// the server from the coordinator profile.

import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

// src/db/prisma.js reuses `globalThis.prisma` when one is present, so seeding it
// before the app is imported means `new PrismaClient()` is never constructed.
// That keeps the suite independent of which platform the Prisma client binary
// was generated for (a Windows-generated client cannot initialise on Linux —
// a toolchain mismatch that must never masquerade as a coordinator defect), and
// every accessor starts out throwing so a forgotten stub fails loudly by name
// instead of quietly reaching for a real database.
const PRISMA_MODELS = [
  'user', 'coordinatorProfile', 'instructorProfile', 'studentProfile',
  'section', 'nSTPComponent', 'module', 'trainingGroup', 'grade', 'auditLogEntry',
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
const {
  MODULE_ACCESS,
  listManagedModules,
  listCoordinatorTrainingGroups,
  createManagedModule,
  updateManagedModule,
  removeManagedModule,
} = await import('../src/modules/nstp/nstp.service.js');

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

// The component ids and training-group labels each program legitimately owns.
// Written out by hand on purpose: if the server mapping drifts, these fixtures
// have to be changed consciously instead of silently agreeing with the code.
const SCOPE_COMPONENT_IDS = {
  CWTS: ['component-cwts', 'component-cwts-cg'],
  LTS: ['component-lts'],
  MTS: ['component-mts-army', 'component-mts-navy'],
};
const SCOPE_LABELS = {
  CWTS: ['CWTS', 'CWTS_COAST_GUARD', 'CWTS (Coast Guard)'],
  LTS: ['LTS'],
  MTS: ['MTS_ARMY', 'MTS (Army)', 'MTS_NAVY', 'MTS (Navy)'],
};

const MODULES = COMPONENTS.map((component, index) => ({
  id: `module-${index}`,
  title: `${component.name} Module`,
  status: 'PUBLISHED',
  order: index,
  componentId: component.id,
  component,
  data: {},
  _count: { progress: 0 },
}));

// One extra module that belongs to no component: an administrator must still see
// it, and it must never leak into a coordinator's scoped read.
const COMMON_MODULE = {
  id: 'module-common', title: 'Orientation', status: 'PUBLISHED', order: 99,
  componentId: null, component: null, data: {}, _count: { progress: 0 },
};
const ALL_MODULES = [...MODULES, COMMON_MODULE];

const TRAINING_GROUPS = [
  { id: 'group-cwts', name: 'CWTS Group 1', component: 'CWTS', createdAt: new Date('2026-01-01') },
  { id: 'group-cwts-cg', name: 'Coast Guard Group', component: 'CWTS (Coast Guard)', createdAt: new Date('2026-01-02') },
  { id: 'group-lts', name: 'LTS Group 1', component: 'LTS', createdAt: new Date('2026-01-03') },
  { id: 'group-mts-army', name: 'Army Group', component: 'MTS (Army)', createdAt: new Date('2026-01-04') },
  { id: 'group-mts-navy', name: 'Navy Group', component: 'MTS_NAVY', createdAt: new Date('2026-01-05') },
];

const originals = {
  coordinatorFindUnique: prisma.coordinatorProfile.findUnique,
  componentFindMany: prisma.nSTPComponent.findMany,
  moduleFindMany: prisma.module.findMany,
  trainingGroupFindMany: prisma.trainingGroup.findMany,
  transaction: prisma.$transaction,
};

/**
 * Runs module writes against an in-memory transaction and records what the
 * database was actually asked to do, so "the write was refused" can be asserted
 * as "no row was created/updated/deleted" rather than only as a thrown error.
 */
function useModuleWriteTransaction() {
  const calls = { created: [], updated: [], deleted: [] };
  const tx = {
    nSTPComponent: {
      findUnique: async ({ where }) => COMPONENTS.find((component) => component.type === where.type) ?? null,
    },
    module: {
      // The read fixtures carry only the columns a listing needs, so the two
      // fields the publish check requires are filled in here — an edit to a
      // published module must not fail for a reason unrelated to scope.
      findUnique: async ({ where }) => {
        const found = ALL_MODULES.find((mod) => mod.id === where.id);
        return found ? { description: 'Existing content', hours: 3, ...found } : null;
      },
      create: async ({ data }) => { calls.created.push(data); return { id: 'module-new', ...data, component: null }; },
      update: async ({ where, data }) => { calls.updated.push({ where, data }); return { ...MODULES[0], ...data, component: null }; },
      delete: async ({ where }) => { calls.deleted.push(where); return { id: where.id }; },
    },
    auditLogEntry: { create: async () => ({}) },
  };
  prisma.$transaction = async (run) => run(tx);
  return calls;
}

const modulePayload = (overrides = {}) => ({
  title: 'Scoped material', description: 'Content', hours: 2,
  difficulty: 'Beginner', status: 'DRAFT', order: 0, ...overrides,
});

function token(role, id = `${role.toLowerCase()}-user`) {
  return jwt.sign({ id, email: `${id}@example.test`, role }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

async function request(path, { role, method = 'GET', id } = {}) {
  const headers = {};
  if (role) headers.authorization = `Bearer ${token(role, id)}`;
  return fetch(`${baseUrl}${path}`, { method, headers });
}

/**
 * Signs in as a coordinator whose profile carries exactly the given scope, and
 * answers both component lookups the server makes: by `type` (scope resolution)
 * and by `id` (training-group label resolution).
 */
function asCoordinator({ scope, componentId = null, profileId = 'coordinator-profile', status = 'ACTIVE' }) {
  prisma.coordinatorProfile.findUnique = async () => ({
    id: profileId, userId: 'coordinator-user', employeeNumber: 'EMP-1', scope, componentId, user: { status },
  });
  prisma.nSTPComponent.findMany = async ({ where }) => {
    if (where?.type?.in) return COMPONENTS.filter((component) => where.type.in.includes(component.type));
    if (where?.id?.in) return COMPONENTS.filter((component) => where.id.in.includes(component.id));
    throw new Error(`Unexpected component query: ${JSON.stringify(where)}`);
  };
}

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  prisma.coordinatorProfile.findUnique = originals.coordinatorFindUnique;
  prisma.nSTPComponent.findMany = originals.componentFindMany;
  prisma.module.findMany = originals.moduleFindMany;
  prisma.trainingGroup.findMany = originals.trainingGroupFindMany;
  prisma.$transaction = originals.transaction;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  delete globalThis.prisma;
});

// ---------------------------------------------------------------------------
// Required test 7: an empty authorised-component list must mean NO access.
// This is the fail-open that `managedComponentIds.length ? … : {}` created.
// ---------------------------------------------------------------------------

test('7. an empty authorised component list returns no modules and never runs an unfiltered query', async () => {
  let queried = false;
  prisma.module.findMany = async () => { queried = true; return ALL_MODULES; };

  for (const componentIds of [[], [null], ['', null, undefined]]) {
    const modules = await listManagedModules({ mode: MODULE_ACCESS.COMPONENTS, componentIds });
    assert.deepEqual(modules, [], `componentIds=${JSON.stringify(componentIds)} must resolve to no access`);
  }
  assert.equal(queried, false, 'an empty component list must not reach the database at all');
});

test('7b. a component-restricted read cannot be requested without a component list', async () => {
  let queried = false;
  prisma.module.findMany = async () => { queried = true; return ALL_MODULES; };

  await assert.rejects(
    () => listManagedModules({ mode: MODULE_ACCESS.COMPONENTS }),
    /requires a componentIds array/,
  );
  // No mode at all is a programming error, not an unrestricted read.
  await assert.rejects(() => listManagedModules({}), /explicit access mode/);
  await assert.rejects(() => listManagedModules(), /explicit access mode/);
  assert.equal(queried, false);
});

// ---------------------------------------------------------------------------
// Required test 8: the administrator's unrestricted read is explicit and still
// works — removing the fail-open must not remove legitimate admin access.
// ---------------------------------------------------------------------------

test('8. an administrator still reads every module, and the widening is explicit', async () => {
  let observedArgs;
  prisma.module.findMany = async (args) => { observedArgs = args; return ALL_MODULES; };

  const response = await request('/api/nstp/admin/modules', { role: 'ADMIN' });
  assert.equal(response.status, 200);
  const modules = await response.json();
  assert.equal(modules.length, ALL_MODULES.length);
  assert.equal(observedArgs.where, undefined, 'an unrestricted read carries no component filter');

  // The unrestricted mode is reachable only by naming it.
  assert.equal(MODULE_ACCESS.UNRESTRICTED, 'unrestricted');
  assert.equal((await request('/api/nstp/admin/modules', { role: 'COORDINATOR' })).status, 403);
  assert.equal((await request('/api/nstp/admin/modules', { role: 'STUDENT' })).status, 403);
});

// ---------------------------------------------------------------------------
// Required test 7, write side. The read path was the reported fail-open, but the
// same "empty list means unrestricted" spelling existed in the module *write*
// path (`resolveModuleComponent` gated on `Array.isArray(scope) && scope.length`).
// It was not reachable through HTTP — getCurrentCoordinator refuses an
// unresolved scope before any controller runs — but an empty allow-list reaching
// the service must deny on its own, without depending on an upstream guard.
// ---------------------------------------------------------------------------

test('7c. an empty authorised component list cannot create a module, in any component or as common', async () => {
  const calls = useModuleWriteTransaction();

  for (const component of ['CWTS', 'LTS', 'MTS (Navy)', 'CWTS (Coast Guard)']) {
    await assert.rejects(
      () => createManagedModule('coordinator-user', modulePayload({ component }), []),
      /outside your coordinator scope/i,
      `an empty allow-list must not permit a ${component} module`,
    );
  }

  // 'Common' (no component) is an administrator's write; a narrowed actor has to
  // name a component, and with an empty allow-list no component qualifies.
  for (const component of ['Common', '', null, undefined]) {
    await assert.rejects(
      () => createManagedModule('coordinator-user', modulePayload({ component }), []),
      /must select a component inside their program scope/i,
    );
  }

  assert.deepEqual(calls.created, [], 'no module row may be written for an actor with no authorised components');
});

test('7d. an empty authorised component list cannot update or delete an existing module', async () => {
  const calls = useModuleWriteTransaction();

  for (const target of ALL_MODULES) {
    await assert.rejects(
      () => updateManagedModule('coordinator-user', target.id, { title: 'Blocked edit' }, []),
      /outside your assigned component/i,
    );
    await assert.rejects(
      () => removeManagedModule('coordinator-user', target.id, []),
      /outside your assigned component/i,
    );
  }

  assert.deepEqual(calls.updated, [], 'no module may be updated for an actor with no authorised components');
  assert.deepEqual(calls.deleted, [], 'no module may be deleted for an actor with no authorised components');
});

test('7e. a real coordinator allow-list still writes inside its scope and is refused outside it', async () => {
  const calls = useModuleWriteTransaction();
  const mtsScope = SCOPE_COMPONENT_IDS.MTS;

  const created = await createManagedModule('coordinator-user', modulePayload({ component: 'MTS (Navy)' }), mtsScope);
  assert.equal(created.componentId, 'component-mts-navy');
  assert.equal(calls.created.length, 1);

  await assert.rejects(
    () => createManagedModule('coordinator-user', modulePayload({ component: 'CWTS' }), mtsScope),
    /outside your coordinator scope/i,
  );
  await assert.rejects(
    () => updateManagedModule('coordinator-user', 'module-2', { title: 'Blocked edit' }, mtsScope),
    /outside your assigned component/i,
  );
  // An unconfigured component is a validation error, never a silent CWTS write.
  await assert.rejects(
    () => createManagedModule('coordinator-user', modulePayload({ component: 'ROTC' }), mtsScope),
    /is not a recognised NSTP component/i,
  );
  assert.equal(calls.created.length, 1, 'only the in-scope write reached the database');
  assert.deepEqual(calls.updated, []);
});

test('8b. an administrator write carries no narrowing and may still create a common module', async () => {
  const calls = useModuleWriteTransaction();

  // No third argument at all is the one and only unrestricted form.
  const common = await createManagedModule('admin-user', modulePayload({ component: 'Common' }));
  assert.equal(common.componentId, null);

  const scoped = await createManagedModule('admin-user', modulePayload({ component: 'CWTS' }));
  assert.equal(scoped.componentId, 'component-cwts');

  const updated = await updateManagedModule('admin-user', 'module-2', { title: 'Admin edit' });
  assert.equal(updated.title, 'Admin edit');

  assert.equal(calls.created.length, 2);
  assert.equal(calls.updated.length, 1);
});

// ---------------------------------------------------------------------------
// Required tests 9-11: the module query stays scoped for every program, and the
// restriction is in the `where` clause rather than in the client.
// ---------------------------------------------------------------------------

for (const scope of ['CWTS', 'LTS', 'MTS']) {
  const label = { CWTS: '9', LTS: '10', MTS: '11' }[scope];

  test(`${label}. a ${scope} coordinator module query remains scoped to ${scope} components`, async () => {
    let observedArgs;
    asCoordinator({ scope });
    prisma.module.findMany = async (args) => {
      observedArgs = args;
      const allowed = args.where?.componentId?.in;
      assert.ok(Array.isArray(allowed), 'the module query must constrain componentId server-side');
      return ALL_MODULES.filter((mod) => allowed.includes(mod.componentId));
    };

    const response = await request('/api/nstp/coordinators/modules', { role: 'COORDINATOR' });
    assert.equal(response.status, 200);
    assert.deepEqual(observedArgs.where, { componentId: { in: SCOPE_COMPONENT_IDS[scope] } });

    const modules = await response.json();
    assert.deepEqual(
      modules.map((mod) => mod.componentId).sort(),
      [...SCOPE_COMPONENT_IDS[scope]].sort(),
    );
    const foreign = Object.entries(SCOPE_COMPONENT_IDS)
      .filter(([key]) => key !== scope)
      .flatMap(([, ids]) => ids);
    assert.equal(modules.filter((mod) => foreign.includes(mod.componentId)).length, 0, 'no foreign component may survive');
    assert.equal(modules.filter((mod) => mod.id === COMMON_MODULE.id).length, 0, 'an unscoped module is not a coordinator record');
  });
}

test('9-11b. an unassigned coordinator receives no modules and no module query runs', async () => {
  let queried = false;
  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: null, componentId: null, user: { status: 'ACTIVE' } });
  prisma.module.findMany = async () => { queried = true; return ALL_MODULES; };

  const response = await request('/api/nstp/coordinators/modules', { role: 'COORDINATOR' });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /scope is not assigned/i);
  assert.equal(queried, false);
});

// ---------------------------------------------------------------------------
// Required test 14: the training-groups endpoint is coordinator scoped, in the
// database query, and requires a coordinator identity.
// ---------------------------------------------------------------------------

test('14. the training-groups endpoint is coordinator scoped in the query itself', async () => {
  let observedArgs;
  asCoordinator({ scope: 'CWTS' });
  prisma.trainingGroup.findMany = async (args) => { observedArgs = args; return []; };

  const response = await request('/api/nstp/coordinators/component/training-groups', { role: 'COORDINATOR' });
  assert.equal(response.status, 200);

  const allowed = observedArgs.where?.component?.in;
  assert.ok(Array.isArray(allowed), 'the training-group query must restrict the component in the where clause');
  assert.deepEqual([...allowed].sort(), [...SCOPE_LABELS.CWTS].sort());
});

test('14b. training groups require an authenticated, active, correctly-roled coordinator', async () => {
  let queried = false;
  prisma.trainingGroup.findMany = async () => { queried = true; return TRAINING_GROUPS; };

  assert.equal((await request('/api/nstp/coordinators/component/training-groups')).status, 401);
  for (const role of ['STUDENT', 'INSTRUCTOR']) {
    assert.equal((await request('/api/nstp/coordinators/component/training-groups', { role })).status, 403);
  }

  asCoordinator({ scope: 'CWTS', status: 'SUSPENDED' });
  assert.equal((await request('/api/nstp/coordinators/component/training-groups', { role: 'COORDINATOR' })).status, 403);

  prisma.coordinatorProfile.findUnique = async () => ({ id: 'coordinator-profile', scope: 'ROTC', componentId: null, user: { status: 'ACTIVE' } });
  assert.equal((await request('/api/nstp/coordinators/component/training-groups', { role: 'COORDINATOR' })).status, 403);

  assert.equal(queried, false, 'no training-group query may run without a resolved coordinator scope');
});

test('14c. an empty authorised component list yields no training groups', async () => {
  let queried = false;
  prisma.nSTPComponent.findMany = async () => { queried = true; return COMPONENTS; };
  prisma.trainingGroup.findMany = async () => { queried = true; return TRAINING_GROUPS; };

  assert.deepEqual(await listCoordinatorTrainingGroups([]), []);
  assert.deepEqual(await listCoordinatorTrainingGroups([null, '']), []);
  await assert.rejects(() => listCoordinatorTrainingGroups(), /requires an array/);
  await assert.rejects(() => listCoordinatorTrainingGroups('component-cwts'), /requires an array/);
  assert.equal(queried, false);
});

// ---------------------------------------------------------------------------
// Required tests 15-17: cross-program isolation for training groups.
// ---------------------------------------------------------------------------

const FOREIGN_GROUPS = {
  CWTS: ['group-lts', 'group-mts-army', 'group-mts-navy'],
  LTS: ['group-cwts', 'group-cwts-cg', 'group-mts-army', 'group-mts-navy'],
  MTS: ['group-cwts', 'group-cwts-cg', 'group-lts'],
};
const OWN_GROUPS = {
  CWTS: ['group-cwts', 'group-cwts-cg'],
  LTS: ['group-lts'],
  MTS: ['group-mts-army', 'group-mts-navy'],
};

for (const scope of ['CWTS', 'LTS', 'MTS']) {
  const label = { CWTS: '15', LTS: '16', MTS: '17' }[scope];
  const others = Object.keys(FOREIGN_GROUPS).filter((key) => key !== scope).join('/');

  test(`${label}. a ${scope} coordinator cannot retrieve ${others} training groups`, async () => {
    asCoordinator({ scope });
    prisma.trainingGroup.findMany = async ({ where }) => {
      const allowed = where?.component?.in;
      assert.ok(Array.isArray(allowed), 'the query must carry the component allow-list');
      // Applied the way the database would, so the assertion below proves the
      // filter — not a client-side pass over a full result set.
      return TRAINING_GROUPS.filter((group) => allowed.includes(group.component));
    };

    const response = await request('/api/nstp/coordinators/component/training-groups', { role: 'COORDINATOR' });
    assert.equal(response.status, 200);
    const { data } = await response.json();

    assert.deepEqual(data.map((group) => group.id).sort(), [...OWN_GROUPS[scope]].sort());
    for (const foreign of FOREIGN_GROUPS[scope]) {
      assert.equal(data.some((group) => group.id === foreign), false, `${foreign} must not be reachable by a ${scope} coordinator`);
    }
  });
}

test('15-17b. a client-supplied component cannot widen the training-group scope', async () => {
  let observedArgs;
  asCoordinator({ scope: 'LTS' });
  prisma.trainingGroup.findMany = async (args) => { observedArgs = args; return []; };

  const response = await request(
    '/api/nstp/coordinators/component/training-groups?component=CWTS&componentId=component-cwts',
    { role: 'COORDINATOR' },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(observedArgs.where, { component: { in: ['LTS'] } });
});
