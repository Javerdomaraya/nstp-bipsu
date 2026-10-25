import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { adminVoidQualifyingExamAttempt, startMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
const { placeStudent } = await import('../src/modules/nstp/nstp.service.js');
const { QUALIFYING_EXAM_ID } = await import('../src/seed.js');

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

test('real postgres: admin void-attempt resets placement, removes result, logs audit entry, and allows student retake', async () => {
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

  const commonModule = await prisma.module.upsert({
    where: { id: 'test-common-mod-void' },
    update: { hours: 25, componentId: null, isPublished: true },
    create: {
      id: 'test-common-mod-void',
      title: 'Common Module for Void Test',
      hours: 25,
      componentId: null,
      isPublished: true,
    },
  });

  const ts = `void_stu_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Void Test Student',
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

  // 1. Student has a completed, placed attempt in CWTS
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
      score: 90,
      rank: 1,
    },
  });

  // Place student into CWTS
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
      score: 90,
      assignedComponent: 'CWTS',
      status: 'assigned-preferred',
      timestamp: new Date().toISOString(),
    },
  });

  // Verify initial state: student is placed, enrollment is ACTIVE
  const profileBefore = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(profileBefore.componentId !== null, 'Student should be placed initially');

  const enrollmentBefore = await prisma.enrollment.findFirst({
    where: { studentId: user.studentProfile.id, status: 'ACTIVE' },
  });
  assert.ok(enrollmentBefore !== null, 'Student should have active enrollment initially');

  // 2. Admin voids the attempt
  const adminUser = { id: `admin-actor-${Date.now()}`, name: 'Lead Coordinator', role: 'ADMIN' };
  const voidReq = {
    params: { id: attempt.id },
    body: { reason: 'Student experienced power outage during examination' },
    user: adminUser,
  };
  const voidRes = mockResponse();

  await adminVoidQualifyingExamAttempt(voidReq, voidRes);

  assert.equal(voidRes.statusCode, 200);
  assert.equal(voidRes.body.success, true);
  assert.ok(voidRes.body.data.auditLogId, 'Audit log ID must be returned');

  // 3. Verify attempt status is VOIDED
  const voidedAttempt = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attempt.id },
  });
  assert.equal(voidedAttempt.status, 'VOIDED');

  // 4. Verify student profile component was cleared and enrollment DROPPED
  const profileAfter = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.equal(profileAfter.componentId, null, 'Student profile componentId should be reset to null');

  const activeEnrollments = await prisma.enrollment.findMany({
    where: { studentId: user.studentProfile.id, status: 'ACTIVE' },
  });
  assert.equal(activeEnrollments.length, 0, 'Active enrollments should be dropped');

  // 5. Verify qualifying result was removed
  const resultAfter = await prisma.qualifyingExamResult.findFirst({
    where: { userId: user.id },
  });
  assert.equal(resultAfter, null, 'Qualifying exam result should be removed');

  // 6. Verify AuditLogEntry was recorded
  const audit = await prisma.auditLogEntry.findUnique({
    where: { id: voidRes.body.data.auditLogId },
  });
  assert.ok(audit, 'Audit log entry must exist in database');
  assert.equal(audit.action, 'QUALIFYING_ATTEMPT_VOID');
  assert.equal(audit.actor, adminUser.id);
  assert.match(audit.detail, /power outage/i);

  // 7. Verify student can now retake (call start again)
  const retakeReq = {
    user: { id: user.id, name: user.name, email: user.email },
    student: { id: user.studentProfile.id },
    body: { preferredComponent: 'LTS' },
  };
  const retakeRes = mockResponse();

  await startMyQualifyingExam(retakeReq, retakeRes);
  assert.equal(retakeRes.statusCode, 201, `Student should be able to start retake after void, got: ${retakeRes.statusCode}`);
  assert.ok(retakeRes.body.data.attemptId !== attempt.id, 'New attempt should have new ID');
});
