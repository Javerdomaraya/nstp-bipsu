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
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
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

test('real postgres: no-submit expiry marks attempt EXPIRED and refuses retake or late submit', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  await prisma.componentApplicationState.deleteMany({});
  await prisma.componentApplicationState.create({
    data: {
      id: `app-state-${Date.now()}`,
      schoolYear: openSY,
      semester: openSem,
      applicationClosed: false,
      slotLimits: { CWTS: 100 },
    },
  });

  const exam = await prisma.exam.findFirst({
    where: { id: QUALIFYING_EXAM_ID },
    include: { questions: true },
  });
  assert.ok(exam && exam.questions.length > 0, 'Master qualifying exam must exist');

  // Setup common modules totaling 25 hours
  const commonModule = await prisma.module.upsert({
    where: { id: 'test-common-mod-nosubmit' },
    update: { hours: 25, componentId: null, isPublished: true },
    create: {
      id: 'test-common-mod-nosubmit',
      title: 'Common Module for No-Submit Test',
      hours: 25,
      componentId: null,
      isPublished: true,
    },
  });

  const ts = `nosubmit_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'No Submit Expiry Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
          componentId: null,
          moduleProgress: {
            create: {
              moduleId: commonModule.id,
              completedAt: new Date(),
            },
          },
        },
      },
    },
    include: { studentProfile: true },
  });

  // Step 1: Student starts the exam
  const startReq1 = {
    user: { id: user.id, name: user.name, email: user.email },
    student: { id: user.studentProfile.id },
    body: { preferredComponent: 'CWTS' },
  };
  const startRes1 = mockResponse();

  await startMyQualifyingExam(startReq1, startRes1);
  assert.equal(startRes1.statusCode, 201, `Expected 201 on start, got ${startRes1.statusCode}: ${JSON.stringify(startRes1.body)}`);
  const attemptId = startRes1.body.data.attemptId;
  assert.ok(attemptId, 'Attempt ID must be returned');

  // Verify attempt is STARTED in the database
  const initialAttempt = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attemptId },
  });
  assert.equal(initialAttempt.status, 'STARTED');

  // Step 2: Student NEVER submits. Time expires past expiresAt.
  const pastExpiresAt = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
  await prisma.qualifyingExamAttempt.update({
    where: { id: attemptId },
    data: {
      expiresAt: pastExpiresAt,
    },
  });

  // Step 3: Student calls start again without ever having submitted
  const startReq2 = {
    user: { id: user.id, name: user.name, email: user.email },
    student: { id: user.studentProfile.id },
    body: { preferredComponent: 'CWTS' },
  };
  const startRes2 = mockResponse();

  await startMyQualifyingExam(startReq2, startRes2);
  assert.equal(startRes2.statusCode, 400, `Expected 400 refusing retake, got: ${startRes2.statusCode}`);
  assert.match(startRes2.body.error, /maximum allowed qualifying exam attempts/i);

  // Step 4: Verify the expired unsubmitted attempt was transitioned to EXPIRED
  const updatedAttempt = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attemptId },
  });
  assert.equal(updatedAttempt.status, 'EXPIRED');

  // Verify no new attempt was created
  const totalAttempts = await prisma.qualifyingExamAttempt.count({
    where: { userId: user.id },
  });
  assert.equal(totalAttempts, 1);

  // Step 5: Submitting this attempt is now rejected
  const submitReq = {
    user: { id: user.id, name: user.name, email: user.email },
    student: { id: user.studentProfile.id },
    body: {
      attemptId,
      preferredComponent: 'CWTS',
      answers: exam.questions.map((q) => ({ questionId: q.id, optionIndex: 0 })),
    },
  };
  const submitRes = mockResponse();

  await submitMyQualifyingExam(submitReq, submitRes);
  assert.equal(submitRes.statusCode, 400);
  assert.match(submitRes.body.error, /already been submitted or completed|expired/i);

  // Profile remains unplaced
  const profileAfter = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.equal(profileAfter.componentId, null);
});
