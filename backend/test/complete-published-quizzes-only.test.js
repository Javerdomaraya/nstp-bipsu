import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { completeMyModule } = await import('../src/modules/nstp/nstp.controller.js');

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

afterEach(() => {
  if (originalModuleFindFirst) prisma.module.findFirst = originalModuleFindFirst;
});

test('completeMyModule queries quizzes with where status PUBLISHED only', async () => {
  let capturedQueryArgs = null;

  prisma.module.findFirst = async (args) => {
    capturedQueryArgs = args;
    return {
      id: 'module-pub-only',
      status: 'PUBLISHED',
      quizzes: [], // DRAFT quizzes were filtered out by status: 'PUBLISHED'
    };
  };

  const req = {
    params: { moduleId: 'module-pub-only' },
    student: { id: 'sp-1', componentId: 'comp-1' },
  };
  const res = mockResponse();

  await completeMyModule(req, res);

  assert.equal(capturedQueryArgs.include.quizzes.where.status, 'PUBLISHED', 'Must query quizzes with status PUBLISHED only');
  assert.equal(res.statusCode, 409, 'Draft quizzes are not loaded, so module without published quizzes returns 409');
  assert.match(res.body.error, /no published assessment/i);
});
