import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const {
  startMyQualifyingExam,
  submitMyQualifyingExam,
} = await import('../src/modules/nstp/nstp.controller.js');
const {
  startQualifyingExamSchema,
  submitQualifyingExamSchema,
} = await import('../src/middleware/validationSchemas.js');
const { validateRequest } = await import('../src/middleware/validateRequest.js');

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

const originalModuleProgressFindMany = prisma.moduleProgress?.findMany;
const originalAttemptCount = prisma.qualifyingExamAttempt?.count;
const originalAttemptCreate = prisma.qualifyingExamAttempt?.create;
const originalAttemptFindFirst = prisma.qualifyingExamAttempt?.findFirst;
const originalAttemptUpdate = prisma.qualifyingExamAttempt?.update;
const originalExamFindFirst = prisma.exam?.findFirst;
const originalTransaction = prisma.$transaction;
const originalResultFindMany = prisma.qualifyingExamResult?.findMany;
const originalResultFindFirst = prisma.qualifyingExamResult?.findFirst;
const originalResultUpsert = prisma.qualifyingExamResult?.upsert;
const originalStateFindFirst = prisma.componentApplicationState?.findFirst;

afterEach(() => {
  if (originalModuleProgressFindMany) prisma.moduleProgress.findMany = originalModuleProgressFindMany;
  if (originalAttemptCount) prisma.qualifyingExamAttempt.count = originalAttemptCount;
  if (originalAttemptCreate) prisma.qualifyingExamAttempt.create = originalAttemptCreate;
  if (originalAttemptFindFirst) prisma.qualifyingExamAttempt.findFirst = originalAttemptFindFirst;
  if (originalAttemptUpdate) prisma.qualifyingExamAttempt.update = originalAttemptUpdate;
  if (originalExamFindFirst) prisma.exam.findFirst = originalExamFindFirst;
  if (originalTransaction) prisma.$transaction = originalTransaction;
  if (originalResultFindMany) prisma.qualifyingExamResult.findMany = originalResultFindMany;
  if (originalResultFindFirst) prisma.qualifyingExamResult.findFirst = originalResultFindFirst;
  if (originalResultUpsert) prisma.qualifyingExamResult.upsert = originalResultUpsert;
  if (originalStateFindFirst) prisma.componentApplicationState.findFirst = originalStateFindFirst;
});

test('a student cannot start under 25 hours', async () => {
  // Student with only 20 hours completed
  prisma.moduleProgress.findMany = async () => [
    { completedAt: new Date(), module: { hours: 10 } },
    { completedAt: new Date(), module: { hours: 10 } },
  ];
  prisma.qualifyingExamAttempt.count = async () => 0;

  const req = {
    user: { id: 'student-1', name: 'Student One', email: 's1@test.com' },
    student: { id: 'sp-1', userId: 'student-1' },
    body: { preferredComponent: 'CWTS' },
  };
  const res = mockResponse();

  await startMyQualifyingExam(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /25 hours/);

  // Student with 25+ hours completed succeeds
  prisma.qualifyingExamAttempt.findFirst = async () => null;
  prisma.moduleProgress.findMany = async () => [
    { completedAt: new Date(), module: { hours: 15 } },
    { completedAt: new Date(), module: { hours: 10 } },
  ];
  prisma.exam.findFirst = async () => ({
    id: 'qualifying-exam-master',
    title: 'NSTP Qualifying Examination',
    questions: [
      { id: 'q-1', prompt: 'Question 1', options: ['A', 'B'], answer: { correctIndex: 0 }, order: 0 },
    ],
  });
  let createdData = null;
  prisma.qualifyingExamAttempt.create = async ({ data }) => {
    createdData = data;
    return { id: 'attempt-1', ...data };
  };

  const resOk = mockResponse();
  await startMyQualifyingExam(req, resOk);

  assert.equal(resOk.statusCode, 201);
  assert.equal(resOk.body.success, true);
  assert.equal(resOk.body.data.attemptId, 'attempt-1');
  assert.ok(resOk.body.data.serverNow, 'start response must return serverNow');
  assert.equal(resOk.body.data.questions[0].answer, undefined, 'answer key must be redacted');
  assert.equal(createdData.preferredComponent, 'CWTS');
});

test('a student cannot exceed attempts', async () => {
  prisma.qualifyingExamAttempt.findFirst = async () => null;
  // Student completed 25 hours, but already has 1 attempt
  prisma.moduleProgress.findMany = async () => [
    { completedAt: new Date(), module: { hours: 25 } },
  ];
  prisma.qualifyingExamAttempt.count = async () => 1;

  const req = {
    user: { id: 'student-1', name: 'Student One', email: 's1@test.com' },
    student: { id: 'sp-1', userId: 'student-1' },
    body: { preferredComponent: 'CWTS' },
  };
  const res = mockResponse();

  await startMyQualifyingExam(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /maximum allowed qualifying exam attempts/);
});

test('a student cannot submit a score', async () => {
  // 1. Validation schema rejects client submission containing a score
  const validator = validateRequest(submitQualifyingExamSchema);
  let nextCalled = false;
  const invalidReq = {
    body: {
      attemptId: 'attempt-1',
      preferredComponent: 'CWTS',
      score: 95,
      answers: [{ questionId: 'q-1', optionIndex: 0 }],
    },
    params: {},
    query: {},
  };
  const invalidRes = mockResponse();
  validator(invalidReq, invalidRes, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(invalidRes.statusCode, 400);

  // 2. Controller directly rejects client score if passed
  const controllerRes = mockResponse();
  await submitMyQualifyingExam(invalidReq, controllerRes);
  assert.equal(controllerRes.statusCode, 400);
  assert.match(controllerRes.body.error, /score/i);

  // 3. Valid submission without client score computes score server-side from answer key
  const validReq = {
    user: { id: 'student-1', name: 'Student One', email: 's1@test.com' },
    student: { id: 'sp-1', userId: 'student-1' },
    body: {
      attemptId: 'attempt-1',
      preferredComponent: 'CWTS',
      answers: [
        { questionId: 'q-1', optionIndex: 1 }, // correct answer is 1 -> 100%
      ],
    },
  };
  prisma.qualifyingExamAttempt.findFirst = async () => ({
    id: 'attempt-1',
    userId: 'student-1',
    status: 'STARTED',
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    preferredComponent: 'CWTS',
    attemptNumber: 1,
  });
  prisma.exam.findFirst = async () => ({
    id: 'qualifying-exam-master',
    questions: [
      { id: 'q-1', prompt: 'Q1', options: ['Wrong', 'Right'], answer: { correctIndex: 1 } },
    ],
  });
  prisma.$transaction = async (cb) => {
    const tx = {
      $queryRaw: async () => [{ id: 'default', slotLimits: { CWTS: 10 }, qualifyingScore: 70 }],
      componentApplicationState: {
        findFirst: async () => ({ id: 'default', slotLimits: { CWTS: 10 }, qualifyingScore: 70 }),
      },
      qualifyingExamResult: {
        findMany: async () => [],
        findFirst: async () => null,
        upsert: async ({ create }) => ({ id: create.id, ...create }),
      },
      qualifyingExamAttempt: {
        update: async ({ data }) => data,
      },
      studentProfile: {
        findUnique: async () => ({ id: 'sp-1', userId: 'student-1' }),
        count: async () => 0,
        findMany: async () => [],
        update: async ({ data }) => ({ id: 'sp-1', ...data }),
      },
      nSTPComponent: {
        findFirst: async () => ({ id: 'comp-cwts', type: 'CWTS' }),
      },
      enrollment: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async ({ data }) => ({ id: 'enr-1', ...data }),
        update: async ({ data }) => ({ id: 'enr-1', ...data }),
      },
    };
    return cb(tx);
  };

  const validRes = mockResponse();
  await submitMyQualifyingExam(validReq, validRes);

  assert.equal(validRes.statusCode, 201);
  assert.equal(validRes.body.success, true);
  assert.equal(validRes.body.data.score, 100, 'Score must be computed 100% on server from answer key');
  assert.equal(validRes.body.data.status, 'assigned-preferred');
});

test('a student cannot submit after expiresAt', async () => {
  const expiredAttempt = {
    id: 'attempt-expired',
    userId: 'student-1',
    status: 'STARTED',
    startedAt: new Date(Date.now() - 70 * 60 * 1000),
    expiresAt: new Date(Date.now() - 10 * 60 * 1000), // expired 10 minutes ago
    preferredComponent: 'CWTS',
  };
  let attemptUpdated = false;
  prisma.qualifyingExamAttempt.findFirst = async () => expiredAttempt;
  prisma.qualifyingExamAttempt.update = async ({ data }) => {
    if (data.status === 'EXPIRED') attemptUpdated = true;
    return { ...expiredAttempt, ...data };
  };

  const req = {
    user: { id: 'student-1', name: 'Student One', email: 's1@test.com' },
    student: { id: 'sp-1', userId: 'student-1' },
    body: {
      attemptId: 'attempt-expired',
      preferredComponent: 'CWTS',
      answers: [{ questionId: 'q-1', optionIndex: 0 }],
    },
  };
  const res = mockResponse();

  await submitMyQualifyingExam(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /expired/i);
  assert.equal(attemptUpdated, true, 'attempt status should be updated to EXPIRED');
});

test('two concurrent submits for the last slot yield one assigned-preferred and one waitlisted', async () => {
  // Slot limit for MTS_NAVY is exactly 1
  const appState = {
    id: 'default',
    slotLimits: { MTS_NAVY: 1 },
    qualifyingScore: 70,
  };

  // Shared in-memory list of assigned results to simulate database state
  const assignedStore = [];

  prisma.exam.findFirst = async () => ({
    id: 'qualifying-exam-master',
    questions: [
      { id: 'q-1', prompt: 'Q1', options: ['Wrong', 'Right'], answer: { correctIndex: 1 } },
    ],
  });

  prisma.qualifyingExamAttempt.findFirst = async ({ where }) => ({
    id: where.id,
    userId: where.userId,
    status: 'STARTED',
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    preferredComponent: 'MTS_NAVY',
    attemptNumber: 1,
  });

  prisma.qualifyingExamAttempt.update = async ({ data }) => data;

  prisma.$transaction = async (cb) => {
    const tx = {
      $queryRaw: async () => [appState],
      componentApplicationState: {
        findFirst: async () => appState,
      },
      qualifyingExamResult: {
        findMany: async () => [...assignedStore],
        findFirst: async () => null,
        upsert: async ({ create }) => {
          assignedStore.push({
            id: create.id,
            userId: create.userId,
            assignedComponent: create.assignedComponent,
            status: create.status,
          });
          return { id: create.id, ...create };
        },
      },
      qualifyingExamAttempt: {
        update: async ({ data }) => data,
      },
      studentProfile: {
        findUnique: async ({ where }) => ({ id: where.id || 'sp-1', userId: where.userId || 'student-1' }),
        count: async () => assignedStore.filter((s) => s.status === 'assigned-preferred').length,
        findMany: async () => [],
        update: async ({ data }) => ({ id: 'sp-1', ...data }),
      },
      nSTPComponent: {
        findFirst: async () => ({ id: 'comp-mts-navy', type: 'MTS_NAVY' }),
      },
      enrollment: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async ({ data }) => ({ id: 'enr-1', ...data }),
        update: async ({ data }) => ({ id: 'enr-1', ...data }),
      },
    };
    return cb(tx);
  };

  const req1 = {
    user: { id: 'student-A', name: 'Alice', email: 'alice@test.com' },
    student: { id: 'sp-A', userId: 'student-A' },
    body: {
      attemptId: 'attempt-A',
      preferredComponent: 'MTS_NAVY',
      answers: [{ questionId: 'q-1', optionIndex: 1 }], // 100% score (>= 70)
    },
  };
  const res1 = mockResponse();

  const req2 = {
    user: { id: 'student-B', name: 'Bob', email: 'bob@test.com' },
    student: { id: 'sp-B', userId: 'student-B' },
    body: {
      attemptId: 'attempt-B',
      preferredComponent: 'MTS_NAVY',
      answers: [{ questionId: 'q-1', optionIndex: 1 }], // 100% score (>= 70)
    },
  };
  const res2 = mockResponse();

  // Fire both submissions concurrently
  await Promise.all([
    submitMyQualifyingExam(req1, res1),
    submitMyQualifyingExam(req2, res2),
  ]);

  assert.equal(res1.statusCode, 201);
  assert.equal(res2.statusCode, 201);

  const statuses = [res1.body.data.status, res2.body.data.status];
  const assignedComponents = [res1.body.data.assignedComponent, res2.body.data.assignedComponent];

  assert.ok(
    statuses.includes('assigned-preferred'),
    'One submission must be assigned-preferred'
  );
  assert.ok(
    statuses.includes('waitlisted'),
    'One submission must be waitlisted due to slot capacity reached'
  );

  // Exactly one student got MTS_NAVY assigned, the other got null
  assert.equal(assignedComponents.filter((c) => c === 'MTS_NAVY').length, 1);
  assert.equal(assignedComponents.filter((c) => c === null).length, 1);
});
