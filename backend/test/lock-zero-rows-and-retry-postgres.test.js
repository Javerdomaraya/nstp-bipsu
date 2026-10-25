import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const {
  startMyQualifyingExam,
  submitMyQualifyingExam,
  isLockTimeoutError,
} = await import('../src/modules/nstp/nstp.controller.js');
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

test('real postgres: lock query throws on zero rows, and lock-timeout error is recognized as retryable', async () => {
  const compType = 'CWTS';
  const ts = `lock_test_${Date.now()}`;

  // 1. Ensure CWTS component exists
  await prisma.nSTPComponent.upsert({
    where: { type: compType },
    update: {},
    create: { type: compType, name: 'CWTS Regular' },
  });

  // 2. Ensure application state exists
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: { slotLimits: { [compType]: 10 }, qualifyingScore: 70 },
    create: { id: 'default', slotLimits: { [compType]: 10 }, qualifyingScore: 70 },
  });

  // 3. Ensure Qualifying Exam exists
  const questionId = 'q-lock-test-1';
  let exam = await prisma.exam.findFirst({
    where: {
      OR: [
        { id: QUALIFYING_EXAM_ID },
        { title: { contains: 'Qualifying' } },
      ],
    },
  });
  if (!exam) {
    exam = await prisma.exam.create({
      data: {
        id: QUALIFYING_EXAM_ID,
        title: 'NSTP Qualifying Examination',
        durationMinutes: 60,
        passingPercentage: 70,
        published: true,
      },
    });
  }

  await prisma.question.upsert({
    where: { id: questionId },
    update: {
      examId: exam.id,
      prompt: 'Lock Test Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
    create: {
      id: questionId,
      examId: exam.id,
      prompt: 'Lock Test Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
  });

  await prisma.question.updateMany({
    where: { examId: exam.id },
    data: { answer: { correctIndex: 0 } },
  });

  // 4. Create student with 25 completed common module hours
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Lock Test Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${ts}`,
          course: 'BSIT',
          yearLevel: '1',
        },
      },
    },
    include: { studentProfile: true },
  });
  const student = user.studentProfile;

  const commonMod = await prisma.module.create({
    data: {
      title: `Common Mod ${ts}`,
      hours: 25,
      componentId: null,
    },
  });
  await prisma.moduleProgress.create({
    data: {
      studentId: student.id,
      moduleId: commonMod.id,
      completedAt: new Date(),
    },
  });

  // --- PART 1: Verify isLockTimeoutError classification ---
  assert.equal(isLockTimeoutError({ code: '55P03' }), true, '55P03 (lock_not_available) must be retryable');
  assert.equal(isLockTimeoutError({ code: '57014' }), true, '57014 (query_canceled / statement_timeout) must be retryable');
  assert.equal(isLockTimeoutError({ code: '40P01' }), true, '40P01 (deadlock_detected) must be retryable');
  assert.equal(isLockTimeoutError({ code: 'P2034' }), true, 'Prisma P2034 transaction conflict must be retryable');
  assert.equal(isLockTimeoutError(new Error('canceling statement due to lock timeout')), true, 'lock timeout message must be retryable');
  assert.equal(isLockTimeoutError(new Error('Validation failed')), false, 'non-lock errors must not be retryable');

  // --- PART 2: Lock query throws on zero rows in real PostgreSQL ---
  const startReq = { user, student, body: { preferredComponent: compType } };
  const startRes = mockResponse();
  await startMyQualifyingExam(startReq, startRes);
  assert.equal(startRes.statusCode, 201);
  const attemptId = startRes.body.data.attemptId;
  const questions = startRes.body.data.questions;
  const answers = questions.map((q) => ({ questionId: q.id, optionIndex: 0 }));

  // Rename 'default' row to temporarily simulate 0 rows in PostgreSQL
  await prisma.$executeRawUnsafe(`UPDATE component_application_state SET id = 'default-temp' WHERE id = 'default'`);

  try {
    const submitReq = {
      user,
      student,
      body: { attemptId, preferredComponent: compType, answers },
    };
    const submitRes = mockResponse();

    await assert.rejects(
      async () => {
        await submitMyQualifyingExam(submitReq, submitRes);
      },
      (err) => {
        assert.match(err.message, /Component application state row 'default' not found/);
        return true;
      },
      'Submitting when default row is missing must throw an explicit error on zero rows'
    );
  } finally {
    // Restore 'default' row in PostgreSQL
    await prisma.$executeRawUnsafe(`UPDATE component_application_state SET id = 'default' WHERE id = 'default-temp'`);
  }

  // --- PART 3: After restoring default row, verify successful submit ---
  const submitReqValid = {
    user,
    student,
    body: { attemptId, preferredComponent: compType, answers },
  };
  const submitResValid = mockResponse();
  await submitMyQualifyingExam(submitReqValid, submitResValid);
  assert.equal(submitResValid.statusCode, 201, 'Submission succeeds once the locked row exists');
  assert.equal(submitResValid.body.success, true);
});
