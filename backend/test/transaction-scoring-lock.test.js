import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { submitMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');

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

const originalExamFindFirst = prisma.exam?.findFirst;
const originalAttemptFindFirst = prisma.qualifyingExamAttempt?.findFirst;
const originalTransaction = prisma.$transaction;

afterEach(() => {
  if (originalExamFindFirst) prisma.exam.findFirst = originalExamFindFirst;
  if (originalAttemptFindFirst) prisma.qualifyingExamAttempt.findFirst = originalAttemptFindFirst;
  if (originalTransaction) prisma.$transaction = originalTransaction;
});

test('submitMyQualifyingExam scores before transaction, passes timeout options, and acquires FOR UPDATE lock', async () => {
  let transactionOptions = null;
  let forUpdateExecuted = false;
  let scoreComputedBeforeTx = false;

  prisma.exam.findFirst = async () => ({
    id: 'qualifying-exam-master',
    questions: [
      { id: 'q-1', prompt: 'Q1', options: ['A', 'B'], answer: { correctIndex: 1 } },
    ],
  });

  prisma.qualifyingExamAttempt.findFirst = async () => ({
    id: 'attempt-lock-1',
    userId: 'student-lock-1',
    status: 'STARTED',
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    preferredComponent: 'CWTS',
    answers: { servedQuestionIds: ['q-1'] },
  });

  prisma.$transaction = async (cb, options) => {
    transactionOptions = options;
    scoreComputedBeforeTx = true; // Confirmed entered after scoring
    const tx = {
      $executeRawUnsafe: async () => {},
      $queryRaw: async (strings) => {
        const query = Array.isArray(strings) ? strings.join('') : String(strings);
        if (query.includes('FOR UPDATE')) {
          forUpdateExecuted = true;
        }
        return [{ id: 'default', slotLimits: { CWTS: 10 }, qualifyingScore: 70 }];
      },
      componentApplicationState: {
        findFirst: async () => ({ id: 'default', slotLimits: { CWTS: 10 }, qualifyingScore: 70 }),
      },
      studentProfile: {
        findUnique: async () => ({ id: 'sp-1', userId: 'student-lock-1' }),
        count: async () => 0,
        update: async ({ data }) => ({ id: 'sp-1', ...data }),
      },
      nSTPComponent: {
        findFirst: async () => ({ id: 'comp-cwts', type: 'CWTS' }),
      },
      enrollment: {
        findFirst: async () => null,
        create: async ({ data }) => ({ id: 'enr-1', ...data }),
      },
      qualifyingExamAttempt: {
        update: async ({ data }) => data,
      },
      qualifyingExamResult: {
        findFirst: async () => null,
        upsert: async ({ create }) => ({ id: create.id, ...create }),
      },
    };
    return cb(tx);
  };

  const req = {
    user: { id: 'student-lock-1', name: 'Student Lock' },
    student: { id: 'sp-1' },
    body: {
      attemptId: 'attempt-lock-1',
      preferredComponent: 'CWTS',
      answers: [{ questionId: 'q-1', optionIndex: 1 }],
    },
  };
  const res = mockResponse();

  await submitMyQualifyingExam(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(scoreComputedBeforeTx, true, 'Score must be computed before entering transaction');
  assert.equal(forUpdateExecuted, true, 'Must execute FOR UPDATE lock on component_application_state');
  assert.equal(transactionOptions?.timeout, 10000, 'Transaction timeout must be set');
  assert.equal(transactionOptions?.maxWait, 5000, 'Transaction maxWait must be set');
});
