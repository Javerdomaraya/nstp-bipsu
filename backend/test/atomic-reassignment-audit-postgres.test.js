import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { adminQualifyingResults } = await import('../src/modules/nstp/nstp.controller.js');

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

test('real postgres: admin reassignment handles unassign atomically and logs audit entry', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  const lts = await prisma.nSTPComponent.upsert({
    where: { type: 'LTS' },
    update: {},
    create: { type: 'LTS', name: 'Literacy Training Service' },
  });

  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: { schoolYear: openSY, semester: openSem, applicationClosed: false },
    create: { id: 'default', schoolYear: openSY, semester: openSem, slotLimits: {}, applicationClosed: false },
  });

  const ts = `unassign_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Placed Student To Unassign',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${ts}`,
          course: 'BSCS',
          yearLevel: '1',
          componentId: lts.id,
        },
      },
    },
    include: { studentProfile: true },
  });

  const student = user.studentProfile;

  // Active enrollment exists initially
  const enrollment = await prisma.enrollment.create({
    data: {
      studentId: student.id,
      componentId: lts.id,
      schoolYear: openSY,
      semester: openSem,
      status: 'ACTIVE',
    },
  });

  const attempt = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      preferredComponent: 'LTS',
      score: 85,
      status: 'assigned-preferred',
      assignedComponent: 'LTS',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const resultId = `qxr-${ts}`;
  await prisma.qualifyingExamResult.create({
    data: {
      id: resultId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent: 'LTS',
      score: 85,
      status: 'assigned-preferred',
      assignedComponent: 'LTS',
      adminOverride: false,
      timestamp: new Date().toISOString(),
    },
  });

  // Admin executes unassign
  const unassignReq = {
    user: { id: 'admin-auditor-unassign' },
    body: {
      id: resultId,
      userId: user.id,
      assignedComponent: null, // explicit unassign
      status: 'waitlisted',
      reason: 'Student requested component withdrawal',
    },
  };
  const unassignRes = mockResponse();
  await adminQualifyingResults.upsert(unassignReq, unassignRes);
  assert.equal(unassignRes.statusCode, 201);

  // 1. Verify StudentProfile componentId cleared
  const updatedStudent = await prisma.studentProfile.findUnique({ where: { id: student.id } });
  assert.equal(updatedStudent.componentId, null, 'StudentProfile.componentId must be set to null');

  // 2. Verify Enrollment transitioned to DROPPED
  const updatedEnrollment = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
  assert.equal(updatedEnrollment.status, 'DROPPED', 'Enrollment must be transitioned to DROPPED');

  // 3. Verify QualifyingExamAttempt updated
  const updatedAttempt = await prisma.qualifyingExamAttempt.findUnique({ where: { id: attempt.id } });
  assert.equal(updatedAttempt.assignedComponent, null);
  assert.equal(updatedAttempt.status, 'waitlisted');

  // 4. Verify QualifyingExamResult updated
  const updatedResult = await prisma.qualifyingExamResult.findUnique({ where: { id: resultId } });
  assert.equal(updatedResult.assignedComponent, null);
  assert.equal(updatedResult.status, 'waitlisted');
  assert.equal(updatedResult.adminOverride, false);

  // 5. Verify AuditLogEntry in real PostgreSQL
  const audit = await prisma.auditLogEntry.findFirst({
    where: {
      action: 'QUALIFYING_UNASSIGN',
      actor: 'admin-auditor-unassign',
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(audit, 'AuditLogEntry with action QUALIFYING_UNASSIGN must be recorded');
  const auditDetail = JSON.parse(audit.detail);
  assert.equal(auditDetail.userId, user.id);
  assert.equal(auditDetail.studentId, student.id);
  assert.match(auditDetail.reason, /withdrawal/i);
});

test('real postgres: admin reassignment over quota flags adminOverride and logs QUALIFYING_QUOTA_OVERRIDE audit', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  const mtsArmy = await prisma.nSTPComponent.upsert({
    where: { type: 'MTS_ARMY' },
    update: {},
    create: { type: 'MTS_ARMY', name: 'MTS Army' },
  });

  // Limit MTS_ARMY slot to exactly 1
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: {
      schoolYear: openSY,
      semester: openSem,
      applicationClosed: false,
      slotLimits: { MTS_ARMY: 1 },
    },
    create: {
      id: 'default',
      schoolYear: openSY,
      semester: openSem,
      applicationClosed: false,
      slotLimits: { MTS_ARMY: 1 },
    },
  });

  // Student 1 fills the only slot
  const ts1 = `quota_s1_${Date.now()}`;
  const user1 = await prisma.user.create({
    data: {
      email: `${ts1}@bipsu.edu.ph`,
      name: 'Student Occupying Sole Slot',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${ts1}`,
          course: 'BSCS',
          yearLevel: '1',
          componentId: mtsArmy.id,
        },
      },
    },
    include: { studentProfile: true },
  });
  await prisma.enrollment.create({
    data: {
      studentId: user1.studentProfile.id,
      componentId: mtsArmy.id,
      schoolYear: openSY,
      semester: openSem,
      status: 'ACTIVE',
    },
  });

  // Student 2 is currently waitlisted
  const ts2 = `quota_s2_${Date.now()}`;
  const user2 = await prisma.user.create({
    data: {
      email: `${ts2}@bipsu.edu.ph`,
      name: 'Waitlisted Student Over Quota',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${ts2}`,
          course: 'BSCS',
          yearLevel: '1',
          componentId: null,
        },
      },
    },
    include: { studentProfile: true },
  });

  const attempt2 = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user2.id,
      preferredComponent: 'MTS_ARMY',
      score: 75,
      status: 'waitlisted',
      assignedComponent: null,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const result2Id = `qxr-${ts2}`;
  await prisma.qualifyingExamResult.create({
    data: {
      id: result2Id,
      userId: user2.id,
      userName: user2.name,
      userEmail: user2.email,
      preferredComponent: 'MTS_ARMY',
      score: 75,
      status: 'waitlisted',
      assignedComponent: null,
      adminOverride: false,
      timestamp: new Date().toISOString(),
    },
  });

  // Admin manually reassigns Student 2 to MTS_ARMY despite quota being full
  const reassignReq = {
    user: { id: 'admin-dean-override' },
    body: {
      id: result2Id,
      userId: user2.id,
      assignedComponent: 'MTS_ARMY',
      reason: 'Dean special accommodation override',
    },
  };
  const reassignRes = mockResponse();
  await adminQualifyingResults.upsert(reassignReq, reassignRes);
  assert.equal(reassignRes.statusCode, 201);

  // 1. Student 2 should be placed in MTS_ARMY
  const updatedStudent2 = await prisma.studentProfile.findUnique({ where: { id: user2.studentProfile.id } });
  assert.equal(updatedStudent2.componentId, mtsArmy.id);

  const activeEnrollments2 = await prisma.enrollment.findMany({
    where: { studentId: user2.studentProfile.id, status: 'ACTIVE' },
  });
  assert.equal(activeEnrollments2.length, 1);
  assert.equal(activeEnrollments2[0].componentId, mtsArmy.id);

  // 2. QualifyingExamResult must have adminOverride: true
  const updatedResult2 = await prisma.qualifyingExamResult.findUnique({ where: { id: result2Id } });
  assert.equal(updatedResult2.adminOverride, true, 'adminOverride flag must be set to true on quota override');
  assert.equal(updatedResult2.assignedComponent, 'MTS_ARMY');

  // 3. QualifyingExamAttempt must be updated
  const updatedAttempt2 = await prisma.qualifyingExamAttempt.findUnique({ where: { id: attempt2.id } });
  assert.equal(updatedAttempt2.assignedComponent, 'MTS_ARMY');

  // 4. AuditLogEntry must record QUALIFYING_QUOTA_OVERRIDE
  const quotaAudit = await prisma.auditLogEntry.findFirst({
    where: {
      action: 'QUALIFYING_QUOTA_OVERRIDE',
      actor: 'admin-dean-override',
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(quotaAudit, 'AuditLogEntry with action QUALIFYING_QUOTA_OVERRIDE must be created');
  const auditDetail = JSON.parse(quotaAudit.detail);
  assert.equal(auditDetail.adminOverride, true);
  assert.equal(auditDetail.component, 'MTS_ARMY');
  assert.equal(auditDetail.slotLimit, 1);
  assert.equal(auditDetail.currentCount, 1);
  assert.match(auditDetail.reason, /accommodation/i);
});
