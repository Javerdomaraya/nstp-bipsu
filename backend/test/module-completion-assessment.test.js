import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { completeMyModule } = await import('../src/modules/nstp/nstp.controller.js');
const { overrideAssessmentAttempt } = await import('../src/modules/nstp/nstp.service.js');

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

const originalModuleFindFirst = prisma.module?.findFirst;
const originalProgressUpsert = prisma.moduleProgress?.upsert;
const originalTransaction = prisma.$transaction;

afterEach(() => {
  if (originalModuleFindFirst) prisma.module.findFirst = originalModuleFindFirst;
  if (originalProgressUpsert) prisma.moduleProgress.upsert = originalProgressUpsert;
  if (originalTransaction) prisma.$transaction = originalTransaction;
});

test('/complete returns 409 when a module has zero published assessments', async () => {
  prisma.module.findFirst = async () => ({
    id: 'module-zero-assessments',
    status: 'PUBLISHED',
    quizzes: [], // zero published assessments
  });

  const req = {
    params: { moduleId: 'module-zero-assessments' },
    student: { id: 'sp-1', componentId: null },
  };
  const res = mockResponse();

  await completeMyModule(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /no published assessment/i);
});

test('admin override and completion check use the exact same field: submission.content.override.status', async () => {
  // 1. First verify overrideAssessmentAttempt writes to submission.content.override.status
  let savedContent = null;
  const adminActor = { userId: 'admin-1', role: 'ADMIN' };
  prisma.$transaction = async (cb) => {
    const tx = {
      submission: {
        findUnique: async () => ({
          id: 'sub-1',
          quizId: 'quiz-1',
          content: { answers: [] },
          score: 50,
          quiz: { data: { passingScore: 70 } },
        }),
        update: async ({ data }) => {
          savedContent = data.content;
          return { id: 'sub-1', ...data };
        },
      },
      auditLogEntry: {
        create: async () => ({}),
      },
    };
    return cb(tx);
  };

  const overrideResult = await overrideAssessmentAttempt(adminActor, 'sub-1', 'passed', 'Exceptional performance override');
  assert.equal(overrideResult.status, 'passed');
  assert.equal(savedContent.override.status, 'passed');

  // 2. Now verify completeMyModule reads submission.content.override.status
  // Student scored 50% (failing passingScore 70), but content.override.status is 'passed'
  prisma.module.findFirst = async () => ({
    id: 'module-1',
    status: 'PUBLISHED',
    quizzes: [
      {
        id: 'quiz-1',
        data: { type: 'quiz', passingScore: 70 },
        submissions: [
          {
            score: 50,
            content: savedContent, // Exactly what overrideAssessmentAttempt produced!
          },
        ],
      },
    ],
  });

  let upsertedProgress = false;
  prisma.moduleProgress.upsert = async ({ update }) => {
    upsertedProgress = true;
    return { id: 'prog-1', completedAt: update.completedAt };
  };

  const req = {
    params: { moduleId: 'module-1' },
    student: { id: 'sp-1', componentId: null },
  };
  const res = mockResponse();

  await completeMyModule(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(upsertedProgress, true, 'Module completed successfully due to manualStatus passed override');

  // 3. Confirm override status 'failed' rejects completion even if score >= 70
  prisma.module.findFirst = async () => ({
    id: 'module-1',
    status: 'PUBLISHED',
    quizzes: [
      {
        id: 'quiz-1',
        data: { type: 'quiz', passingScore: 70 },
        submissions: [
          {
            score: 90, // passing score
            content: { override: { status: 'failed', reason: 'Honor code violation' } },
          },
        ],
      },
    ],
  });

  const reqFailed = {
    params: { moduleId: 'module-1' },
    student: { id: 'sp-1', componentId: null },
  };
  const resFailed = mockResponse();

  await completeMyModule(reqFailed, resFailed);

  assert.equal(resFailed.statusCode, 409);
  assert.match(resFailed.body.error, /pass the published module assessment/i);
});
