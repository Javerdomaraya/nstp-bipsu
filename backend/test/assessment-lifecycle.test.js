import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const {
  createManagedAssessment,
  listStudentAssessments,
  removeManagedAssessment,
  updateManagedAssessment,
} = await import('../src/modules/nstp/nstp.service.js');
const { completeMyModule, submitMyAssessment } = await import('../src/modules/nstp/nstp.controller.js');

const originalTransaction = prisma.$transaction;
const originalQuizFindMany = prisma.quiz.findMany;
const originalQuizFindFirst = prisma.quiz.findFirst;
const originalModuleFindFirst = prisma.module.findFirst;
const originalSubmissionCount = prisma.submission.count;
const originalSubmissionCreate = prisma.submission.create;

afterEach(() => {
  prisma.$transaction = originalTransaction;
  prisma.quiz.findMany = originalQuizFindMany;
  prisma.quiz.findFirst = originalQuizFindFirst;
  prisma.module.findFirst = originalModuleFindFirst;
  prisma.submission.count = originalSubmissionCount;
  prisma.submission.create = originalSubmissionCreate;
});

const admin = { userId: 'admin-1', name: 'Admin', role: 'ADMIN' };
const instructor = { userId: 'user-instructor', name: 'Instructor', role: 'INSTRUCTOR', instructorId: 'instructor-1' };

function record(overrides = {}) {
  return {
    id: 'assessment-1', title: 'Post-test', instructions: 'Instructions', moduleId: 'module-1',
    totalPoints: 1, status: 'DRAFT', data: { type: 'quiz', timeLimit: 15, passingScore: 70, questionsToShow: 1, ownerId: 'admin-1', ownerName: 'Admin', ownerRole: 'admin' },
    module: { id: 'module-1', title: 'Module One', status: 'PUBLISHED', componentId: null, component: null, data: {} },
    questions: [{ id: 'question-1', prompt: 'Question?', options: ['A', 'B'], answer: { correctIndex: 1 }, order: 0 }],
    _count: { submissions: 0, grades: 0 }, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function transactionMock(overrides = {}) {
  const audits = [];
  const tx = {
    module: { findFirst: async () => ({ id: 'module-1', status: 'PUBLISHED', componentId: null, instructorId: 'instructor-1' }) },
    user: { findFirst: async () => null },
    quiz: {},
    question: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 1 }) },
    submission: {},
    auditLogEntry: { create: async ({ data }) => { audits.push(data); return data; } },
    ...overrides,
  };
  prisma.$transaction = async (operation) => operation(tx);
  return { tx, audits };
}

test('assessment creation binds a real module and always starts as draft', async () => {
  let createData;
  transactionMock({
    quiz: {
      create: async ({ data }) => { createData = data; return { id: 'server-assessment', ...data }; },
      findUnique: async () => record({ id: 'server-assessment' }),
    },
  });
  const created = await createManagedAssessment(admin, {
    title: 'Post-test', description: 'Validated', moduleId: 'module-1', type: 'quiz', timeLimit: 15,
    passingScore: 70, questionsToShow: 1, status: 'PUBLISHED',
    questions: [{ prompt: 'Question?', options: ['A', 'B'], correctIndex: 1 }],
  });
  assert.equal(createData.moduleId, 'module-1');
  assert.equal(createData.status, 'DRAFT');
  assert.equal(created.id, 'server-assessment');
});

test('instructors cannot connect assessments to unassigned modules', async () => {
  transactionMock({
    module: { findFirst: async () => null },
    quiz: { create: async () => assert.fail('unauthorized assessment must not be created') },
  });
  await assert.rejects(() => createManagedAssessment(instructor, {
    title: 'Blocked', description: '', moduleId: 'other-module', type: 'quiz', timeLimit: 15,
    passingScore: 70, questionsToShow: 1, questions: [{ prompt: 'Question?', options: ['A', 'B'], correctIndex: 0 }],
  }), /does not exist or is not assigned/i);
});

test('coordinator assessments are restricted to every component in their program scope', async () => {
  let observedWhere;
  transactionMock({
    module: { findFirst: async ({ where }) => { observedWhere = where; return null; } },
    quiz: { create: async () => assert.fail('missing module must not create an assessment') },
  });
  const coordinator = { userId: 'coordinator-1', name: 'MTS Coordinator', role: 'COORDINATOR', componentIds: ['component-army', 'component-navy'] };
  await assert.rejects(() => createManagedAssessment(coordinator, {
    title: 'Scoped assessment', description: '', moduleId: 'other-module', type: 'quiz', timeLimit: 15,
    passingScore: 70, questionsToShow: 1, questions: [{ prompt: 'Question?', options: ['A', 'B'], correctIndex: 0 }],
  }), /does not exist or is not assigned/i);
  assert.deepEqual(observedWhere, { id: 'other-module', componentId: { in: ['component-army', 'component-navy'] } });
});

test('an assessment cannot be published while its module is draft', async () => {
  let moduleCalls = 0;
  transactionMock({
    module: { findFirst: async () => ({ id: 'module-1', status: moduleCalls++ === 0 ? 'DRAFT' : 'DRAFT' }) },
    quiz: { findUnique: async () => record({ module: { ...record().module, status: 'DRAFT' } }) },
  });
  await assert.rejects(() => updateManagedAssessment(admin, 'assessment-1', { status: 'PUBLISHED' }), /connected module/i);
});

test('student assessment responses redact correct answers and include only published module-scoped records', async () => {
  let where;
  prisma.quiz.findMany = async (args) => { where = args.where; return [record({ status: 'PUBLISHED' })]; };
  const rows = await listStudentAssessments('component-cwts');
  assert.equal(where.status, 'PUBLISHED');
  assert.equal(where.module.status, 'PUBLISHED');
  assert.equal(Object.hasOwn(rows[0].questions[0], 'correctIndex'), false);
});

test('assessments with attempts are archived instead of deleted', async () => {
  let archived;
  let deleted = false;
  transactionMock({
    quiz: {
      findUnique: async () => record({ _count: { submissions: 2, grades: 0 } }),
      update: async ({ data }) => { archived = data; return record({ status: data.status }); },
      delete: async () => { deleted = true; },
    },
  });
  const result = await removeManagedAssessment(admin, 'assessment-1');
  assert.deepEqual(result, { id: 'assessment-1', archived: true });
  assert.deepEqual(archived, { status: 'ARCHIVED' });
  assert.equal(deleted, false);
});

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('student scores are calculated from question IDs on the server', async () => {
  let submissionData;
  prisma.quiz.findFirst = async () => ({
    id: 'assessment-1', data: { passingScore: 70, questionsToShow: 1 },
    questions: [{ id: 'question-1', options: ['A', 'B'], answer: { correctIndex: 1 } }],
  });
  prisma.submission.count = async () => 0;
  prisma.submission.create = async ({ data }) => {
    submissionData = data;
    return { id: 'attempt-1', submittedAt: new Date(), ...data };
  };
  const req = {
    params: { assessmentId: 'assessment-1' }, student: { id: 'student-profile-1', componentId: 'component-1' },
    body: { answers: [{ questionId: 'question-1', optionIndex: 1 }], score: 0 },
    validated: { body: { answers: [{ questionId: 'question-1', optionIndex: 1 }] } },
  };
  const res = responseMock();
  await submitMyAssessment(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.score, 100);
  assert.equal(submissionData.score, 100);
  assert.equal(Object.hasOwn(submissionData.content, 'score'), false);
});

test('students cannot complete a module before passing its published linked assessment', async () => {
  prisma.module.findFirst = async () => ({
    id: 'module-1', quizzes: [{ id: 'assessment-1', data: { type: 'quiz', passingScore: 70 }, submissions: [{ score: 60 }] }],
  });
  const req = { params: { moduleId: 'module-1' }, student: { id: 'student-profile-1', componentId: 'component-1' } };
  const res = responseMock();
  await completeMyModule(req, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /pass the published module assessment/i);
});
