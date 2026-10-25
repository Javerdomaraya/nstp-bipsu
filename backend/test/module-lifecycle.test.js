import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const {
  createManagedModule,
  removeManagedModule,
  updateManagedModule,
} = await import('../src/modules/nstp/nstp.service.js');

const originalTransaction = prisma.$transaction;

afterEach(() => {
  prisma.$transaction = originalTransaction;
});

function useTransactionMock(overrides = {}) {
  const auditEntries = [];
  const tx = {
    nSTPComponent: { findUnique: async () => ({ id: 'component-cwts' }) },
    module: {},
    auditLogEntry: { create: async ({ data }) => { auditEntries.push(data); return data; } },
    ...overrides,
  };
  prisma.$transaction = async (operation) => operation(tx);
  return { tx, auditEntries };
}

test('new modules are created as server-confirmed drafts without client supplied ids', async () => {
  let createData;
  const { auditEntries } = useTransactionMock({
    module: {
      create: async ({ data }) => {
        createData = data;
        return { id: 'server-module-id', ...data, component: null, createdAt: new Date(), updatedAt: new Date() };
      },
    },
  });

  const result = await createManagedModule('admin-1', {
    id: 'attacker-controlled-id',
    title: 'Community Health',
    description: 'Validated module content.',
    component: 'Common',
    hours: 3,
    difficulty: 'Beginner',
    status: 'DRAFT',
    order: 0,
  });

  assert.equal(result.id, 'server-module-id');
  assert.equal(createData.status, 'DRAFT');
  assert.equal(createData.isPublished, false);
  assert.equal(Object.hasOwn(createData, 'id'), false);
  assert.equal(auditEntries[0].action, 'MODULE_CREATED');
});

test('publishing requires complete module content', async () => {
  const { tx } = useTransactionMock({
    module: {
      findUnique: async () => ({
        id: 'module-1', title: 'Incomplete', description: '', hours: 3, order: 0,
        status: 'DRAFT', isPublished: false, componentId: null, component: null, data: { difficulty: 'Beginner' },
      }),
      update: async () => assert.fail('invalid module must not be updated'),
    },
  });

  await assert.rejects(
    () => updateManagedModule('admin-1', 'module-1', { status: 'PUBLISHED' }),
    /title, description, and valid duration/i,
  );
  assert.ok(tx);
});

test('modules with academic references are archived rather than deleted', async () => {
  let archivedData;
  let deleted = false;
  const { auditEntries } = useTransactionMock({
    module: {
      findUnique: async () => ({
        id: 'module-1', componentId: null,
        _count: { lessons: 0, quizzes: 1, assignments: 0, exams: 0, grades: 0, progress: 0 },
      }),
      update: async ({ data }) => { archivedData = data; return { id: 'module-1', ...data }; },
      delete: async () => { deleted = true; },
    },
  });

  const result = await removeManagedModule('admin-1', 'module-1');
  assert.deepEqual(result, { id: 'module-1', archived: true });
  assert.deepEqual(archivedData, { status: 'ARCHIVED', isPublished: false });
  assert.equal(deleted, false);
  assert.equal(auditEntries[0].action, 'MODULE_ARCHIVED');
});

test('coordinators cannot modify modules outside their assigned component', async () => {
  useTransactionMock({
    module: {
      findUnique: async () => ({
        id: 'module-1', title: 'LTS Module', description: 'Content', hours: 3,
        order: 0, status: 'DRAFT', isPublished: false, componentId: 'component-lts', component: null, data: {},
      }),
    },
  });

  await assert.rejects(
    () => updateManagedModule('coordinator-1', 'module-1', { title: 'Blocked edit' }, 'component-cwts'),
    /outside your assigned component/i,
  );
});

test('coordinator module creation accepts only a component inside the broad program scope', async () => {
  let createData;
  useTransactionMock({
    nSTPComponent: { findUnique: async ({ where }) => ({ id: where.type === 'MTS_NAVY' ? 'component-navy' : 'component-cwts' }) },
    module: { create: async ({ data }) => { createData = data; return { id: 'module-navy', ...data, component: null }; } },
  });
  await createManagedModule('coordinator-1', {
    title: 'Navy module', description: 'Scoped material', component: 'MTS (Navy)', hours: 2,
    difficulty: 'Beginner', status: 'DRAFT', order: 0,
  }, ['component-army', 'component-navy']);
  assert.equal(createData.componentId, 'component-navy');

  await assert.rejects(() => createManagedModule('coordinator-1', {
    title: 'Blocked CWTS module', description: 'Outside scope', component: 'CWTS', hours: 2,
    difficulty: 'Beginner', status: 'DRAFT', order: 0,
  }, ['component-army', 'component-navy']), /outside your coordinator scope/i);
});
