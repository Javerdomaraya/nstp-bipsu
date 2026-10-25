import assert from 'node:assert/strict';
import { test } from 'node:test';

// Use the real Postgres database URL (fallback to default connection in backend/.env)
process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';

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

test('real postgres concurrency: two simultaneous submissions for the last slot yield exactly 1 assigned and 1 waitlisted', async () => {
  const compType = 'CWTS_COAST_GUARD';

  // 1. Ensure NSTPComponent exists in DB
  const component = await prisma.nSTPComponent.upsert({
    where: { type: compType },
    update: {},
    create: {
      type: compType,
      name: 'CWTS (Coast Guard)',
      description: 'Coast Guard Auxiliary NSTP',
    },
  });

  // 2. Set slot limit to exactly 1 slot for Coast Guard
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: {
      slotLimits: { [compType]: 1 },
      qualifyingScore: 70,
    },
    create: {
      id: 'default',
      slotLimits: { [compType]: 1 },
      qualifyingScore: 70,
    },
  });

  // 3. Ensure master qualifying exam exists with answer key
  const exam = await prisma.exam.upsert({
    where: { id: QUALIFYING_EXAM_ID },
    update: {},
    create: {
      id: QUALIFYING_EXAM_ID,
      title: 'NSTP Qualifying Examination',
      totalPoints: 100,
    },
  });

  const question = await prisma.question.upsert({
    where: { id: 'q-concurrency-1' },
    update: {
      examId: exam.id,
      prompt: 'What does CWTS stand for?',
      options: ['Civic Welfare Training Service', 'Combat War Training School'],
      answer: { correctIndex: 0 },
    },
    create: {
      id: 'q-concurrency-1',
      examId: exam.id,
      prompt: 'What does CWTS stand for?',
      options: ['Civic Welfare Training Service', 'Combat War Training School'],
      answer: { correctIndex: 0 },
      order: 0,
    },
  });

  // 4. Ensure common module for 25 hours exists
  const commonModule = await prisma.module.upsert({
    where: { id: 'mod-concurrency-common' },
    update: { hours: 25, isPublished: true, status: 'PUBLISHED', componentId: null },
    create: {
      id: 'mod-concurrency-common',
      title: 'Common Module for Concurrency Test',
      hours: 25,
      isPublished: true,
      status: 'PUBLISHED',
      componentId: null,
    },
  });

  // 5. Clean up previous test users and setup two fresh test students
  const u1Id = 'pg-test-user-1';
  const u2Id = 'pg-test-user-2';

  await prisma.enrollment.deleteMany({ where: { student: { userId: { in: [u1Id, u2Id] } } } });
  await prisma.qualifyingExamResult.deleteMany({ where: { userId: { in: [u1Id, u2Id] } } });
  await prisma.qualifyingExamAttempt.deleteMany({ where: { userId: { in: [u1Id, u2Id] } } });
  await prisma.moduleProgress.deleteMany({ where: { student: { userId: { in: [u1Id, u2Id] } } } });
  await prisma.studentProfile.deleteMany({ where: { userId: { in: [u1Id, u2Id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [u1Id, u2Id] } } });

  const u1 = await prisma.user.create({
    data: {
      id: u1Id,
      email: 'student1.concurrency@bipsu.edu.ph',
      name: 'Concurrent Student One',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: 'SN-CONC-01',
          componentId: null,
        },
      },
    },
    include: { studentProfile: true },
  });

  const u2 = await prisma.user.create({
    data: {
      id: u2Id,
      email: 'student2.concurrency@bipsu.edu.ph',
      name: 'Concurrent Student Two',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: 'SN-CONC-02',
          componentId: null,
        },
      },
    },
    include: { studentProfile: true },
  });

  // Mark 25 common module hours completed for both
  await prisma.moduleProgress.createMany({
    data: [
      { studentId: u1.studentProfile.id, moduleId: commonModule.id, completedAt: new Date() },
      { studentId: u2.studentProfile.id, moduleId: commonModule.id, completedAt: new Date() },
    ],
  });

  // 6. Both students start exam
  const startReq1 = {
    user: u1,
    student: u1.studentProfile,
    body: { preferredComponent: compType },
  };
  const startRes1 = mockResponse();
  await startMyQualifyingExam(startReq1, startRes1);
  assert.equal(startRes1.statusCode, 201);
  const attemptId1 = startRes1.body.data.attemptId;

  const startReq2 = {
    user: u2,
    student: u2.studentProfile,
    body: { preferredComponent: compType },
  };
  const startRes2 = mockResponse();
  await startMyQualifyingExam(startReq2, startRes2);
  assert.equal(startRes2.statusCode, 201);
  const attemptId2 = startRes2.body.data.attemptId;

  // 7. Fire both submissions simultaneously against real PostgreSQL!
  const answers1 = startRes1.body.data.questions.map((q) => ({ questionId: q.id, optionIndex: 0 }));
  const answers2 = startRes2.body.data.questions.map((q) => ({ questionId: q.id, optionIndex: 0 }));

  const submitReq1 = {
    user: u1,
    student: u1.studentProfile,
    body: {
      attemptId: attemptId1,
      preferredComponent: compType,
      answers: answers1, // 100% correct
    },
  };
  const submitRes1 = mockResponse();

  const submitReq2 = {
    user: u2,
    student: u2.studentProfile,
    body: {
      attemptId: attemptId2,
      preferredComponent: compType,
      answers: answers2, // 100% correct
    },
  };
  const submitRes2 = mockResponse();

  await Promise.all([
    submitMyQualifyingExam(submitReq1, submitRes1),
    submitMyQualifyingExam(submitReq2, submitRes2),
  ]);

  assert.equal(submitRes1.statusCode, 201);
  assert.equal(submitRes2.statusCode, 201);

  const statuses = [submitRes1.body.data.status, submitRes2.body.data.status];
  const assigned = [submitRes1.body.data.assignedComponent, submitRes2.body.data.assignedComponent];

  assert.ok(statuses.includes('assigned-preferred'), 'Real Postgres must assign preferred to the winner');
  assert.ok(statuses.includes('waitlisted'), 'Real Postgres must waitlist the second submitter');
  assert.equal(assigned.filter((c) => c === compType).length, 1, 'Only one student receives the slot');
  assert.equal(assigned.filter((c) => c === null).length, 1, 'The other receives null assignedComponent');

  // 8. Verify the database state in PostgreSQL
  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      componentId: component.id,
      status: 'ACTIVE',
      studentId: { in: [u1.studentProfile.id, u2.studentProfile.id] },
    },
  });
  assert.equal(activeEnrollments.length, 1, 'Exactly one active enrollment created in Postgres');

  const placedProfiles = await prisma.studentProfile.findMany({
    where: {
      id: { in: [u1.studentProfile.id, u2.studentProfile.id] },
      componentId: component.id,
    },
  });
  assert.equal(placedProfiles.length, 1, 'Exactly one student profile placed in Postgres');

  // Cleanup test artifacts
  await prisma.enrollment.deleteMany({ where: { student: { userId: { in: [u1Id, u2Id] } } } });
  await prisma.qualifyingExamResult.deleteMany({ where: { userId: { in: [u1Id, u2Id] } } });
  await prisma.qualifyingExamAttempt.deleteMany({ where: { userId: { in: [u1Id, u2Id] } } });
  await prisma.moduleProgress.deleteMany({ where: { student: { userId: { in: [u1Id, u2Id] } } } });
  await prisma.studentProfile.deleteMany({ where: { userId: { in: [u1Id, u2Id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [u1Id, u2Id] } } });
});
