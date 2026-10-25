import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { placeStudent, upsertAdminResource } = await import('../src/modules/nstp/nstp.service.js');
const { submitMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
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

test('real postgres: admin can reassign student when applications are closed', async () => {
  const termSY = '2026-2027';
  const termSem = '1st Semester';

  // 1. Set application cycle to closed
  await prisma.componentApplicationState.deleteMany({});
  await prisma.componentApplicationState.create({
    data: {
      id: `app-state-closed-${Date.now()}`,
      schoolYear: termSY,
      semester: termSem,
      applicationClosed: true,
      slotLimits: { CWTS: 50, LTS: 50 },
    },
  });

  const ts = `adm_closed_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Closed Cycle Reassign Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
          componentId: null,
        },
      },
    },
    include: { studentProfile: true },
  });

  // Admin directly calls placeStudent or upsertAdminResource when applicationClosed is true
  await prisma.$transaction(async (tx) => {
    await placeStudent(tx, {
      studentId: user.studentProfile.id,
      userId: user.id,
      canonicalComponent: 'CWTS',
      schoolYear: termSY,
      semester: termSem,
    });
  });

  const updatedProfile = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(
    updatedProfile.componentId === 'CWTS' || updatedProfile.componentId === 'system-component-cwts',
    `Student should be placed into CWTS by admin despite closed applications`
  );

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: user.studentProfile.id,
      schoolYear: termSY,
      semester: termSem,
      status: 'ACTIVE',
    },
  });
  assert.ok(enrollment, 'Active enrollment should be created for the student');

  // Also test admin upsertAdminResource('qualifying-results') reassignment when applicationClosed is true
  const adminActor = { id: `admin-${Date.now()}`, name: 'System Admin', email: 'admin@bipsu.edu.ph' };
  const reassigned = await upsertAdminResource('qualifying-results', null, {
    userId: user.id,
    preferredComponent: 'LTS',
    assignedComponent: 'LTS',
    status: 'assigned-preferred',
  }, { actor: adminActor });

  assert.equal(reassigned.assignedComponent, 'LTS');
  const profileAfterAdmin = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(
    profileAfterAdmin.componentId === 'LTS' || profileAfterAdmin.componentId === 'system-component-lts',
    'Student should be reassigned to LTS'
  );
});

test('real postgres: locking current-cycle row throws on zero rows when no cycle is open', async () => {
  // Ensure no cycle is open
  await prisma.componentApplicationState.deleteMany({});
  await prisma.componentApplicationState.create({
    data: {
      id: `app-state-all-closed-${Date.now()}`,
      schoolYear: '2026-2027',
      semester: '1st Semester',
      applicationClosed: true,
      slotLimits: { CWTS: 50 },
    },
  });

  const exam = await prisma.exam.findFirst({
    where: { id: QUALIFYING_EXAM_ID },
    include: { questions: true },
  });

  const ts = `zero_row_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Zero Rows Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
          componentId: null,
        },
      },
    },
    include: { studentProfile: true },
  });

  const attempt = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      examId: exam.id,
      preferredComponent: 'CWTS',
      answers: { servedQuestionIds: exam.questions.map((q) => q.id) },
      attemptNumber: 1,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: 'STARTED',
    },
  });

  const req = {
    user: { id: user.id, name: user.name, email: user.email },
    student: { id: user.studentProfile.id },
    body: {
      attemptId: attempt.id,
      preferredComponent: 'CWTS',
      answers: exam.questions.map((q) => ({ questionId: q.id, optionIndex: 0 })),
    },
  };
  const res = mockResponse();

  await submitMyQualifyingExam(req, res);
  assert.equal(res.statusCode, 409, `Expected 409 on zero open cycle rows, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.match(res.body.error, /No active qualifying application cycle|Component application state row not found/i);
});

test('real postgres: locking current-cycle row throws on multiple open rows', async () => {
  // Create two open application states
  await prisma.componentApplicationState.deleteMany({});
  await prisma.componentApplicationState.createMany({
    data: [
      {
        id: `open-cycle-1-${Date.now()}`,
        schoolYear: '2026-2027',
        semester: '1st Semester',
        applicationClosed: false,
        slotLimits: { CWTS: 50 },
      },
      {
        id: `open-cycle-2-${Date.now()}`,
        schoolYear: '2026-2027',
        semester: '2nd Semester',
        applicationClosed: false,
        slotLimits: { CWTS: 50 },
      },
    ],
  });

  const exam = await prisma.exam.findFirst({
    where: { id: QUALIFYING_EXAM_ID },
    include: { questions: true },
  });

  const ts = `multi_row_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Multiple Rows Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
          componentId: null,
        },
      },
    },
    include: { studentProfile: true },
  });

  const attempt = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      examId: exam.id,
      preferredComponent: 'CWTS',
      answers: { servedQuestionIds: exam.questions.map((q) => q.id) },
      attemptNumber: 1,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: 'STARTED',
    },
  });

  const req = {
    user: { id: user.id, name: user.name, email: user.email },
    student: { id: user.studentProfile.id },
    body: {
      attemptId: attempt.id,
      preferredComponent: 'CWTS',
      answers: exam.questions.map((q) => ({ questionId: q.id, optionIndex: 0 })),
    },
  };
  const res = mockResponse();

  let threwError = null;
  try {
    await submitMyQualifyingExam(req, res);
  } catch (err) {
    threwError = err;
  }

  // Either thrown 500 error or returned 500 response
  if (threwError) {
    assert.equal(threwError.code, 'ROW_LOCK_MULTIPLE_ROWS');
  } else {
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /Multiple active.*application cycle/i);
  }
});
