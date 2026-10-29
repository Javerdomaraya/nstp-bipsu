import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { adminVoidQualifyingExamAttempt, startMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
const { placeStudent } = await import('../src/modules/nstp/nstp.service.js');
const { QUALIFYING_EXAM_ID } = await import('../src/seed.js');
const { voidQualifyingExamAttemptSchema } = await import('../src/middleware/validationSchemas.js');

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    set(k, v) {
      this.headers[k] = String(v);
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

test('real postgres: admin void-attempt resets placement when unplace is opt-in, marks result voided, and logs audit', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  await prisma.componentApplicationState.deleteMany({});
  await prisma.componentApplicationState.create({
    data: {
      id: `app-state-void-${Date.now()}`,
      schoolYear: openSY,
      semester: openSem,
      applicationClosed: false,
      isCurrent: true,
      slotLimits: { CWTS: 100 },
    },
  });

  const exam = await prisma.exam.findFirst({
    where: { id: QUALIFYING_EXAM_ID },
    include: { questions: true },
  });
  assert.ok(exam && exam.questions.length > 0, 'Master qualifying exam must exist');

  const ts = `void_full_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Void Full Test Student',
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
      submittedAt: new Date(),
      status: 'assigned-preferred',
      assignedComponent: 'CWTS',
      score: 88,
      rank: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await placeStudent(tx, {
      studentId: user.studentProfile.id,
      userId: user.id,
      canonicalComponent: 'CWTS',
      schoolYear: openSY,
      semester: openSem,
    });
  });

  await prisma.qualifyingExamResult.create({
    data: {
      id: `qxr-void-${ts}`,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent: 'CWTS',
      score: 88,
      assignedComponent: 'CWTS',
      status: 'assigned-preferred',
      timestamp: new Date().toISOString(),
    },
  });

  const adminActor = { id: `admin-actor-${Date.now()}`, role: 'ADMIN' };
  const voidReq = {
    params: { id: attempt.id },
    body: { reason: 'System glitch reported during submission', unplace: true },
    validated: {
      body: { reason: 'System glitch reported during submission', unplace: true },
      params: { id: attempt.id },
    },
    user: adminActor,
  };
  const voidRes = mockResponse();

  await adminVoidQualifyingExamAttempt(voidReq, voidRes);

  assert.equal(voidRes.statusCode, 200);
  assert.equal(voidRes.body.data.unplaced, true);

  // Check attempt status is VOIDED
  const updatedAttempt = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attempt.id },
  });
  assert.equal(updatedAttempt.status, 'VOIDED');

  // Check result was marked voided, NOT deleted
  const resultAfter = await prisma.qualifyingExamResult.findFirst({
    where: { userId: user.id },
  });
  assert.ok(resultAfter, 'Qualifying exam result must be retained, not deleted');
  assert.equal(resultAfter.status, 'voided');

  // Check profile unplaced
  const profileAfter = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.equal(profileAfter.componentId, null);

  // Check audit entry includes score in detail
  const audit = await prisma.auditLogEntry.findUnique({
    where: { id: voidRes.body.data.auditLogId },
  });
  assert.ok(audit, 'AuditLogEntry must exist');
  assert.equal(audit.action, 'QUALIFYING_ATTEMPT_VOID');
  assert.equal(audit.actor, adminActor.id);
  const detail = JSON.parse(audit.detail);
  assert.equal(detail.score, 88);
  assert.equal(detail.reason, 'System glitch reported during submission');
});

test('real postgres: double void throws 409 conflict', async () => {
  const ts = `double_void_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Double Void Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
        },
      },
    },
  });

  const attempt = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent: 'CWTS',
      attemptNumber: 1,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      status: 'STARTED',
    },
  });

  const adminActor = { id: `admin-actor-${Date.now()}`, role: 'ADMIN' };
  const req1 = {
    params: { id: attempt.id },
    body: { reason: 'Initial void' },
    validated: { body: { reason: 'Initial void', unplace: false }, params: { id: attempt.id } },
    user: adminActor,
  };
  const res1 = mockResponse();

  await adminVoidQualifyingExamAttempt(req1, res1);
  assert.equal(res1.statusCode, 200);

  // Second void on the same attempt
  const req2 = {
    params: { id: attempt.id },
    body: { reason: 'Duplicate void attempt' },
    validated: { body: { reason: 'Duplicate void attempt', unplace: false }, params: { id: attempt.id } },
    user: adminActor,
  };
  const res2 = mockResponse();

  await adminVoidQualifyingExamAttempt(req2, res2);
  assert.equal(res2.statusCode, 409, `Expected 409 on second void, got ${res2.statusCode}`);
  assert.match(res2.body.error, /already voided/i);
});

test('real postgres: void-after-retake refuses unplace and leaves new placement intact', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  const ts = `void_retake_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Void Retake Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
        },
      },
    },
    include: { studentProfile: true },
  });

  // Attempt 1 (older)
  const attempt1 = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent: 'CWTS',
      attemptNumber: 1,
      startedAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() - 1800000),
      submittedAt: new Date(Date.now() - 1900000),
      createdAt: new Date(Date.now() - 3600000),
      status: 'assigned-preferred',
      assignedComponent: 'CWTS',
      score: 75,
    },
  });

  // Attempt 2 (newer retake placed in LTS)
  const attempt2 = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent: 'LTS',
      attemptNumber: 2,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      submittedAt: new Date(),
      createdAt: new Date(),
      status: 'assigned-preferred',
      assignedComponent: 'LTS',
      score: 95,
    },
  });

  // Place student into LTS based on attempt 2
  await prisma.$transaction(async (tx) => {
    await placeStudent(tx, {
      studentId: user.studentProfile.id,
      userId: user.id,
      canonicalComponent: 'LTS',
      schoolYear: openSY,
      semester: openSem,
    });
  });

  // Admin tries to void Attempt 1 with unplace: true
  const adminActor = { id: `admin-actor-${Date.now()}`, role: 'ADMIN' };
  const voidReq = {
    params: { id: attempt1.id },
    body: { reason: 'Voiding older attempt', unplace: true },
    validated: { body: { reason: 'Voiding older attempt', unplace: true }, params: { id: attempt1.id } },
    user: adminActor,
  };
  const voidRes = mockResponse();

  await adminVoidQualifyingExamAttempt(voidReq, voidRes);
  assert.equal(voidRes.statusCode, 409, `Expected 409 refusing unplace when newer attempt exists, got ${voidRes.statusCode}`);
  assert.match(voidRes.body.error, /newer qualifying exam attempt exists/i);

  // Student's LTS placement and enrollment remain intact
  const profileAfter = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(
    profileAfter.componentId === 'LTS' || profileAfter.componentId === 'system-component-lts',
    'Student must remain placed in LTS'
  );

  const ltsEnrollment = await prisma.enrollment.findFirst({
    where: { studentId: user.studentProfile.id, status: 'ACTIVE' },
  });
  assert.ok(ltsEnrollment, 'Active enrollment in LTS must remain intact');
});

test('real postgres: unplace is refused with 409 when grades exist', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  const ts = `void_grades_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Grades Student',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${Date.now().toString().slice(-6)}`,
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
      preferredComponent: 'CWTS',
      attemptNumber: 1,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      status: 'assigned-preferred',
      assignedComponent: 'CWTS',
      score: 80,
    },
  });

  await prisma.$transaction(async (tx) => {
    await placeStudent(tx, {
      studentId: user.studentProfile.id,
      userId: user.id,
      canonicalComponent: 'CWTS',
      schoolYear: openSY,
      semester: openSem,
    });
  });

  // Create an academic grade for this student
  await prisma.grade.create({
    data: {
      id: `grade-${Date.now()}`,
      studentId: user.studentProfile.id,
      score: 88,
      percentGrade: 88,
    },
  });

  const adminActor = { id: `admin-actor-${Date.now()}`, role: 'ADMIN' };
  const voidReq = {
    params: { id: attempt.id },
    body: { reason: 'Attempt to unplace student with grades', unplace: true },
    validated: { body: { reason: 'Attempt to unplace student with grades', unplace: true }, params: { id: attempt.id } },
    user: adminActor,
  };
  const voidRes = mockResponse();

  await adminVoidQualifyingExamAttempt(voidReq, voidRes);
  assert.equal(voidRes.statusCode, 409, `Expected 409 refusing unplace when grades exist, got ${voidRes.statusCode}`);
  assert.match(voidRes.body.error, /academic grades already exist/i);

  // Student placement remains intact
  const profileAfter = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(profileAfter.componentId !== null, 'Student placement must not be removed');
});

test('real postgres: missing reason fails validation with 400', () => {
  // Test via Zod schema
  const invalid1 = voidQualifyingExamAttemptSchema.safeParse({
    body: { reason: '' },
    params: { id: 'attempt-123' },
  });
  assert.equal(invalid1.success, false);

  const invalid2 = voidQualifyingExamAttemptSchema.safeParse({
    body: {},
    params: { id: 'attempt-123' },
  });
  assert.equal(invalid2.success, false);

  const invalid3 = voidQualifyingExamAttemptSchema.safeParse({
    body: { reason: '   ' },
    params: { id: 'attempt-123' },
  });
  assert.equal(invalid3.success, false);

  const valid = voidQualifyingExamAttemptSchema.safeParse({
    body: { reason: 'Valid administrative reason', unplace: true },
    params: { id: 'attempt-123' },
  });
  assert.equal(valid.success, true);
});

test('real postgres: non-admin request fails authorization check with 403', async () => {
  const { requireRole } = await import('../src/middleware/authenticate.js');
  const requireAdminMiddleware = requireRole('ADMIN');

  let studentNextCalled = false;
  const studentReq = { user: { id: 'student-user-1', role: 'STUDENT' } };
  const studentRes = mockResponse();
  requireAdminMiddleware(studentReq, studentRes, () => {
    studentNextCalled = true;
  });
  assert.equal(studentNextCalled, false, 'Student must not proceed through admin middleware');
  assert.equal(studentRes.statusCode, 403);

  let coordNextCalled = false;
  const coordReq = { user: { id: 'coord-user-1', role: 'COORDINATOR' } };
  const coordRes = mockResponse();
  requireAdminMiddleware(coordReq, coordRes, () => {
    coordNextCalled = true;
  });
  assert.equal(coordNextCalled, false, 'Coordinator must not proceed through admin middleware');
  assert.equal(coordRes.statusCode, 403);
});
