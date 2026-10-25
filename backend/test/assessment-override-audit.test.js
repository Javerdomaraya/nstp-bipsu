import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { overrideAssessmentAttempt } = await import('../src/modules/nstp/nstp.service.js');
const { overrideAdminAssessmentAttempt } = await import('../src/modules/nstp/nstp.controller.js');

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

const originalTransaction = prisma.$transaction;

afterEach(() => {
  if (originalTransaction) prisma.$transaction = originalTransaction;
});

test('overrideAssessmentAttempt writes an AuditLogEntry with actor, action, and details', async () => {
  let createdAudit = null;
  let updatedSubmission = null;

  prisma.$transaction = async (cb) => {
    const tx = {
      submission: {
        findUnique: async () => ({
          id: 'sub-audit-1',
          quizId: 'quiz-1',
          score: 55,
          content: {},
          quiz: { data: { passingScore: 70 } },
        }),
        update: async ({ data }) => {
          updatedSubmission = data;
          return { id: 'sub-audit-1', ...data };
        },
      },
      auditLogEntry: {
        create: async ({ data }) => {
          createdAudit = data;
          return data;
        },
      },
    };
    return cb(tx);
  };

  const adminActor = { userId: 'admin-auditor-1', role: 'ADMIN' };
  const result = await overrideAssessmentAttempt(adminActor, 'sub-audit-1', 'passed', 'Medical exception');

  assert.equal(result.status, 'passed');
  assert.equal(result.previous, 'failed');
  assert.ok(createdAudit, 'Must create an AuditLogEntry');
  assert.equal(createdAudit.actor, 'admin-auditor-1');
  assert.equal(createdAudit.action, 'ASSESSMENT_ATTEMPT_OVERRIDDEN');

  const detail = JSON.parse(createdAudit.detail);
  assert.equal(detail.attemptId, 'sub-audit-1');
  assert.equal(detail.previous, 'failed');
  assert.equal(detail.status, 'passed');
  assert.equal(detail.reason, 'Medical exception');
});

test('overrideAdminAssessmentAttempt endpoint routes to overrideAssessmentAttempt and produces AuditLogEntry', async () => {
  let createdAudit = null;

  prisma.$transaction = async (cb) => {
    const tx = {
      submission: {
        findUnique: async () => ({
          id: 'sub-audit-2',
          quizId: 'quiz-2',
          score: 40,
          content: {},
          quiz: { data: { passingScore: 70 } },
        }),
        update: async ({ data }) => ({ id: 'sub-audit-2', ...data }),
      },
      auditLogEntry: {
        create: async ({ data }) => {
          createdAudit = data;
          return data;
        },
      },
    };
    return cb(tx);
  };

  const req = {
    user: { id: 'admin-controller-1', role: 'ADMIN' },
    params: { id: 'sub-audit-2' },
    validated: {
      body: {
        status: 'passed',
        reason: 'Instructor confirmed attendance',
      },
    },
  };
  const res = mockResponse();

  await overrideAdminAssessmentAttempt(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(createdAudit);
  assert.equal(createdAudit.action, 'ASSESSMENT_ATTEMPT_OVERRIDDEN');
  assert.equal(createdAudit.actor, 'admin-controller-1');
  assert.match(createdAudit.detail, /Instructor confirmed attendance/);
});
