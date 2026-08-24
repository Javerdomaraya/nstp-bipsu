import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const { default: prisma } = await import('../src/db/prisma.js');
const {
  COORDINATOR_SCOPE_TYPES, createOwnedFacilitator, listOwnedFacilitators, updateOwnedFacilitator,
} = await import('../src/modules/staff/staff.service.js');
const { createCoordinatorSchema } = await import('../src/modules/staff/staff.validation.js');

const originalTransaction = prisma.$transaction;
const originalFindMany = prisma.instructorProfile.findMany;

afterEach(() => {
  prisma.$transaction = originalTransaction;
  prisma.instructorProfile.findMany = originalFindMany;
});

const facilitator = {
  name: 'Scoped Facilitator', email: 'facilitator@example.test', password: 'SecurePass123!',
  employeeNumber: 'FAC-100', title: 'Facilitator', contactNumber: '09123456789',
  municipalities: ['Naval'],
};

test('coordinator program scopes have the required fixed component mapping', () => {
  assert.deepEqual(COORDINATOR_SCOPE_TYPES, {
    CWTS: ['CWTS', 'CWTS_COAST_GUARD'], MTS: ['MTS_ARMY', 'MTS_NAVY'], LTS: ['LTS'],
  });
});

test('CWTS coordinators cannot assign MTS facilitators', async () => {
  let created = false;
  prisma.$transaction = async (operation) => operation({
    user: { create: async () => { created = true; } },
  });
  await assert.rejects(
    () => createOwnedFacilitator('coordinator-user', { id: 'coord-profile', scope: 'CWTS' }, { ...facilitator, component: 'MTS_ARMY' }),
    /outside your coordinator scope/i,
  );
  assert.equal(created, false);
});

test('MTS coordinators can assign Army and Navy facilitators transactionally', async () => {
  for (const componentType of ['MTS_ARMY', 'MTS_NAVY']) {
    const auditEntries = [];
    const tx = {
      nSTPComponent: { findUnique: async ({ where }) => ({ id: `component-${where.type}`, type: where.type, name: where.type }) },
      user: {
        findUnique: async () => null,
        create: async ({ data }) => ({ id: `user-${componentType}`, ...data }),
      },
      instructorProfile: {
        create: async ({ data }) => ({
          id: `profile-${componentType}`, ...data,
          user: { id: `user-${componentType}`, name: facilitator.name, email: facilitator.email, status: 'ACTIVE', data: {}, createdAt: new Date(), updatedAt: new Date() },
          component: { id: data.componentId, type: componentType, name: componentType },
        }),
      },
      auditLogEntry: { create: async ({ data }) => { auditEntries.push(data); return data; } },
    };
    prisma.$transaction = async (operation) => operation(tx);
    const result = await createOwnedFacilitator('coordinator-user', { id: 'coord-profile', scope: 'MTS' }, { ...facilitator, email: `${componentType.toLowerCase()}@example.test`, employeeNumber: `FAC-${componentType}`, component: componentType });
    assert.equal(result.component, componentType);
    assert.equal(result.municipalities.length, 1);
    assert.equal(auditEntries[0].action, 'FACILITATOR_CREATED');
  }
});

test('coordinators can list and update only facilitators they own', async () => {
  let listWhere;
  prisma.instructorProfile.findMany = async ({ where }) => { listWhere = where; return []; };
  await listOwnedFacilitators('coordinator-profile');
  assert.deepEqual(listWhere, { coordinatorId: 'coordinator-profile' });

  prisma.$transaction = async (operation) => operation({
    instructorProfile: { findFirst: async ({ where }) => { assert.equal(where.coordinatorId, 'coordinator-profile'); return null; } },
  });
  await assert.rejects(
    () => updateOwnedFacilitator('coordinator-user', { id: 'coordinator-profile', scope: 'LTS' }, 'other-facilitator', { title: 'Blocked' }),
    /not assigned to you/i,
  );
});

test('coordinator creation rejects client-generated ids and unsupported scopes', () => {
  const common = { name: 'Coordinator', email: 'coord@example.test', employeeNumber: 'COORD-1', password: 'SecurePass123!', scope: 'CWTS' };
  assert.equal(createCoordinatorSchema.safeParse({ body: common, params: {}, query: {} }).success, true);
  assert.equal(createCoordinatorSchema.safeParse({ body: { ...common, id: 'client-id' }, params: {}, query: {} }).success, false);
  assert.equal(createCoordinatorSchema.safeParse({ body: { ...common, scope: 'MTS_ARMY' }, params: {}, query: {} }).success, false);
});

test('coordinator creation requires an explicit supported scope', () => {
  const common = { name: 'Coordinator', email: 'coord@example.test', employeeNumber: 'COORD-1', password: 'SecurePass123!' };
  assert.equal(createCoordinatorSchema.safeParse({ body: common, params: {}, query: {} }).success, false);
  for (const scope of ['CWTS', 'LTS', 'MTS']) {
    assert.equal(createCoordinatorSchema.safeParse({ body: { ...common, scope }, params: {}, query: {} }).success, true);
  }
});

test('schema and forward migration prohibit a database-generated CWTS scope', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../prisma/migrations/20260824120000_require_explicit_coordinator_scope/migration.sql', import.meta.url), 'utf8');
  assert.match(schema, /scope\s+CoordinatorScope\s*\r?\n/);
  assert.doesNotMatch(schema, /scope\s+CoordinatorScope\s+@default\(CWTS\)/);
  expectText(migration, 'ALTER COLUMN "scope" DROP DEFAULT');
  expectText(migration, 'RAISE EXCEPTION');
});

test('migration backfills broad coordinator scopes and facilitator component ownership fields', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20260803233000_coordinator_scopes_and_facilitator_ownership/migration.sql', import.meta.url), 'utf8');
  expectText(migration, '"CoordinatorScope"');
  expectText(migration, "IN ('MTS_ARMY', 'MTS_NAVY')");
  expectText(migration, '"coordinatorId"');
  expectText(migration, '"municipalities" TEXT[]');
});

// Gate behaviour -- that an undeployed relationship column is SKIPPED rather than
// queried, and that the legacy facilitator metadata checks block a deployment --
// is asserted behaviourally in test/release-gate.test.js against the real check
// definitions. It was previously asserted here by grepping the two entry-point
// scripts for source strings; those strings moved into scripts/lib/ when the
// checks were extracted, and the assertions silently became claims about file
// layout rather than about behaviour.

function expectText(source, text) {
  assert.equal(source.includes(text), true, `Expected migration to contain ${text}`);
}
