import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const {
  startMyQualifyingExam,
  submitMyQualifyingExam,
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

test('real postgres: start, then expiry, then start again is refused with 400', async () => {
  const compType = 'CWTS';
  const ts = `expiry_test_${Date.now()}`;

  // 1. Ensure CWTS exists
  await prisma.nSTPComponent.upsert({
    where: { type: compType },
    update: {},
    create: { type: compType, name: 'CWTS Regular' },
  });

  // 2. Ensure application state has an open cycle
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: {
      applicationClosed: false,
      schoolYear: '2026-2027',
      semester: '1st Semester',
      slotLimits: { [compType]: 10 },
      qualifyingScore: 70,
    },
    create: {
      id: 'default',
      applicationClosed: false,
      schoolYear: '2026-2027',
      semester: '1st Semester',
      slotLimits: { [compType]: 10 },
      qualifyingScore: 70,
    },
  });

  // 3. Ensure Qualifying Exam exists with at least 1 question
  const questionId = 'q-expiry-test-1';
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
      prompt: 'Expiry Test Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
    create: {
      id: questionId,
      examId: exam.id,
      prompt: 'Expiry Test Question 1',
      options: ['Option A', 'Option B'],
      answer: { correctIndex: 0 },
      order: 0,
    },
  });

  // 4. Create student with 25 completed common module hours
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Expiry Test Student',
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

  // 5. STEP 1: Student starts the exam
  const startReq1 = { user, student, body: { preferredComponent: compType } };
  const startRes1 = mockResponse();
  await startMyQualifyingExam(startReq1, startRes1);

  assert.equal(startRes1.statusCode, 201, 'First start must succeed with 201');
  const attemptId = startRes1.body.data.attemptId;
  assert.ok(attemptId, 'Must return attemptId');

  // Verify attempt is STARTED in PostgreSQL
  const attemptInDb = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attemptId },
  });
  assert.equal(attemptInDb.status, 'STARTED');

  // 6. STEP 2: Simulate expiry by setting expiresAt to the past in PostgreSQL
  const pastTime = new Date(Date.now() - 10000); // 10 seconds ago
  await prisma.qualifyingExamAttempt.update({
    where: { id: attemptId },
    data: { expiresAt: pastTime },
  });

  // 7. STEP 3: Student attempts to start the exam again after expiry
  const startReq2 = { user, student, body: { preferredComponent: compType } };
  const startRes2 = mockResponse();
  await startMyQualifyingExam(startReq2, startRes2);

  // Assert start again is REFUSED with 400
  assert.equal(startRes2.statusCode, 400, 'Starting again after expiry must be refused with 400');
  assert.equal(startRes2.body.success, false);
  assert.match(
    startRes2.body.error,
    /cannot exceed maximum allowed qualifying exam attempts/i,
    'Error message must state attempts limit exceeded'
  );

  // Verify in PostgreSQL that the past-due attempt is marked EXPIRED
  const attemptAfter = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attemptId },
  });
  assert.equal(attemptAfter.status, 'EXPIRED', 'Past-due attempt must transition to EXPIRED');

  // Also verify submitting the expired attempt is rejected
  const submitReq = {
    user,
    student,
    body: {
      attemptId,
      preferredComponent: compType,
      answers: [{ questionId, optionIndex: 0 }],
    },
  };
  const submitRes = mockResponse();
  await submitMyQualifyingExam(submitReq, submitRes);
  assert.equal(submitRes.statusCode, 400, 'Submitting expired attempt must return 400');
  assert.match(submitRes.body.error, /expired|already been submitted/i);
});
