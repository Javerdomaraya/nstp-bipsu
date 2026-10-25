import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Real PostgreSQL database URL (pointing to nstp_fresh_test)
process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { startMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
const { QUALIFYING_EXAM_ID } = await import('../src/seed.js');

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

test('real postgres: /start returns current server time, resuming an attempt after delay asserts remaining time shrinks', async () => {
  const compType = 'CWTS';
  const email = `resume_test_${Date.now()}@bipsu.edu.ph`;

  // 1. Ensure NSTPComponent exists
  await prisma.nSTPComponent.upsert({
    where: { type: compType },
    update: {},
    create: {
      type: compType,
      name: 'CWTS Regular',
      description: 'Civic Welfare Training Service',
    },
  });

  // 2. Ensure Qualifying Exam exists with at least 1 question
  let exam = await prisma.exam.findFirst({
    where: {
      OR: [
        { id: QUALIFYING_EXAM_ID },
        { title: { contains: 'Qualifying' } },
      ],
    },
    include: { questions: true },
  });

  if (!exam) {
    exam = await prisma.exam.create({
      data: {
        id: QUALIFYING_EXAM_ID,
        title: 'NSTP Qualifying Examination',
        durationMinutes: 60,
        passingPercentage: 70,
        published: true,
        questions: {
          create: [
            {
              prompt: 'Question 1',
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: 0,
              order: 0,
            },
          ],
        },
      },
      include: { questions: true },
    });
  }

  // 3. Create test user and student profile
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Resume Attempt Student',
      passwordHash: 'HashedPassword123!',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-RESUME-${Date.now()}`,
          course: 'BSIT',
          yearLevel: '1',
        },
      },
    },
    include: { studentProfile: true },
  });

  const student = user.studentProfile;

  // 4. Create common module of 25 hours and mark completed
  const commonModule = await prisma.module.create({
    data: {
      title: `Common Module For Resume Test ${Date.now()}`,
      description: 'Common Module Description',
      hours: 25,
      componentId: null, // common module
    },
  });

  await prisma.moduleProgress.create({
    data: {
      studentId: student.id,
      moduleId: commonModule.id,
      completedAt: new Date(),
    },
  });

  const req1 = {
    user,
    student,
    body: { preferredComponent: compType },
  };
  const res1 = mockResponse();

  // First start
  await startMyQualifyingExam(req1, res1);
  assert.equal(res1.statusCode, 201, `Expected status 201 on initial start, got ${res1.statusCode}: ${JSON.stringify(res1.body)}`);
  assert.ok(res1.body?.data?.attemptId, 'Expected attemptId in response');
  assert.ok(res1.body?.data?.serverNow, 'Expected serverNow in response');
  assert.ok(res1.body?.data?.expiresAt, 'Expected expiresAt in response');

  const t1ServerNow = new Date(res1.body.data.serverNow).getTime();
  const t1ExpiresAt = new Date(res1.body.data.expiresAt).getTime();
  const remainingTime1 = t1ExpiresAt - t1ServerNow;

  assert.ok(remainingTime1 > 0, 'Remaining time should be positive');

  // Wait for 150 milliseconds
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Resume the attempt
  const req2 = {
    user,
    student,
    body: { preferredComponent: compType },
  };
  const res2 = mockResponse();

  await startMyQualifyingExam(req2, res2);
  assert.equal(res2.statusCode, 200, `Expected status 200 on resumed start, got ${res2.statusCode}: ${JSON.stringify(res2.body)}`);
  assert.equal(res2.body?.data?.attemptId, res1.body.data.attemptId, 'Resumed attemptId must match original attemptId');
  assert.equal(res2.body?.data?.expiresAt, res1.body.data.expiresAt, 'ExpiresAt must remain unchanged');

  const t2ServerNow = new Date(res2.body.data.serverNow).getTime();
  const t2ExpiresAt = new Date(res2.body.data.expiresAt).getTime();
  const remainingTime2 = t2ExpiresAt - t2ServerNow;

  assert.ok(t2ServerNow > t1ServerNow, `Resumed serverNow (${t2ServerNow}) must be strictly greater than initial serverNow (${t1ServerNow})`);
  assert.ok(remainingTime2 < remainingTime1, `Remaining time must shrink after delay (initial: ${remainingTime1}ms, resumed: ${remainingTime2}ms)`);
  console.log(`Initial remaining time: ${remainingTime1}ms, Resumed remaining time: ${remainingTime2}ms (shrunk by ${remainingTime1 - remainingTime2}ms)`);
});
