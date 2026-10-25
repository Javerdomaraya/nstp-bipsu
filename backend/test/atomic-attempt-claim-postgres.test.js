import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { startMyQualifyingExam, submitMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
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

test('real postgres: atomic attempt claim rejects simultaneous double-submit from the same student', async () => {
  const compType = 'CWTS';
  const ts = `double_submit_${Date.now()}`;

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
  const questionId = 'q-atomic-test-1';
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
      prompt: 'Atomic Test Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
    create: {
      id: questionId,
      examId: exam.id,
      prompt: 'Atomic Test Question 1',
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
      name: 'Double Submit Student',
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

  // 5. Start exam
  const startReq = { user, student, body: { preferredComponent: compType } };
  const startRes = mockResponse();
  await startMyQualifyingExam(startReq, startRes);

  assert.equal(startRes.statusCode, 201);
  const attemptId = startRes.body.data.attemptId;
  const questions = startRes.body.data.questions;
  const answers = questions.map((q) => ({ questionId: q.id, optionIndex: 0 }));

  // 6. Fire two concurrent submit requests for the same attempt from the SAME student!
  const submitReq1 = {
    user,
    student,
    body: { attemptId, preferredComponent: compType, answers },
  };
  const submitRes1 = mockResponse();

  const submitReq2 = {
    user,
    student,
    body: { attemptId, preferredComponent: compType, answers },
  };
  const submitRes2 = mockResponse();

  await Promise.all([
    submitMyQualifyingExam(submitReq1, submitRes1),
    submitMyQualifyingExam(submitReq2, submitRes2),
  ]);

  const statusCodes = [submitRes1.statusCode, submitRes2.statusCode].sort();
  console.log(`Double submit response status codes: ${submitRes1.statusCode} and ${submitRes2.statusCode}`);

  // Exactly one request must succeed (201) and exactly one must fail (400)
  assert.deepEqual(statusCodes, [201, 400], 'One request must succeed (201) and the duplicate must be rejected (400)');

  const successRes = submitRes1.statusCode === 201 ? submitRes1 : submitRes2;
  const rejectedRes = submitRes1.statusCode === 400 ? submitRes1 : submitRes2;

  assert.equal(successRes.body.success, true);
  assert.equal(rejectedRes.body.success, false);
  assert.match(rejectedRes.body.error, /already been submitted|completed/i);

  // 7. Verify the database state in real PostgreSQL: exactly one result created
  const resultsInDb = await prisma.qualifyingExamResult.findMany({
    where: { userId: user.id },
  });
  assert.equal(resultsInDb.length, 1, 'Only exactly 1 exam result should exist in PostgreSQL');

  const attemptsInDb = await prisma.qualifyingExamAttempt.findMany({
    where: { userId: user.id },
  });
  assert.equal(attemptsInDb.length, 1, 'Only 1 attempt record should exist');
  assert.notEqual(attemptsInDb[0].status, 'STARTED', 'Attempt status must no longer be STARTED');
  assert.notEqual(attemptsInDb[0].status, 'SUBMITTING', 'Attempt status must be resolved (not stuck in SUBMITTING)');
  assert.ok(attemptsInDb[0].submittedAt, 'Attempt must have submittedAt recorded');
});
