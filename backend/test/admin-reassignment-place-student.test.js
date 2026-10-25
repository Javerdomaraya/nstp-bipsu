import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';

const { default: prisma } = await import('../src/db/prisma.js');
const { adminQualifyingResults, getMyQualifyingResults } = await import('../src/modules/nstp/nstp.controller.js');

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

test('real postgres: admin reassignment of waitlisted student routes through placeStudent, stamps enrollment, and updates studentProfile.componentId', async () => {
  const openSY = '2026-2027';
  const openSem = '1st Semester';

  // 1. Ensure CWTS and LTS components exist in PostgreSQL
  const cwts = await prisma.nSTPComponent.upsert({
    where: { type: 'CWTS' },
    update: {},
    create: { type: 'CWTS', name: 'CWTS Regular' },
  });
  const lts = await prisma.nSTPComponent.upsert({
    where: { type: 'LTS' },
    update: {},
    create: { type: 'LTS', name: 'Literacy Training Service' },
  });

  // 2. Ensure application state has open cycle
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: { schoolYear: openSY, semester: openSem },
    create: { id: 'default', schoolYear: openSY, semester: openSem, slotLimits: {} },
  });

  // 3. Create a student who took the exam but was waitlisted (componentId: null)
  const ts = `reassign_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Waitlisted Student In PendingAssignment',
      passwordHash: 'dummy-hash',
      role: 'STUDENT',
      studentProfile: {
        create: {
          studentNumber: `SN-${ts}`,
          course: 'BSCS',
          yearLevel: '1',
          componentId: null, // No component assigned yet
        },
      },
    },
    include: { studentProfile: true },
  });

  const student = user.studentProfile;
  assert.equal(student.componentId, null, 'Student starts unassigned');

  // Create waitlisted QualifyingExamAttempt
  const attempt = await prisma.qualifyingExamAttempt.create({
    data: {
      userId: user.id,
      preferredComponent: 'CWTS',
      score: 80,
      status: 'waitlisted',
      assignedComponent: null,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Create waitlisted QualifyingExamResult
  const resultId = `qxr-${ts}`;
  const result = await prisma.qualifyingExamResult.create({
    data: {
      id: resultId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      preferredComponent: 'CWTS',
      score: 80,
      status: 'waitlisted',
      assignedComponent: null,
      timestamp: new Date().toISOString(),
    },
  });

  // Verify before admin reassignment: student has NO active enrollment
  const enrollmentsBefore = await prisma.enrollment.findMany({
    where: { studentId: student.id, status: 'ACTIVE' },
  });
  assert.equal(enrollmentsBefore.length, 0, 'No active enrollment before reassignment');

  // 4. Admin reassigns the student to LTS from ComponentAssignment / PendingAssignment
  // This invokes adminQualifyingResults.upsert(req, res)
  const reassignPayload = {
    id: resultId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    preferredComponent: 'CWTS',
    assignedComponent: 'LTS', // Admin manually assigns LTS
    status: 'assigned-alternative',
    score: 80,
    timestamp: new Date().toISOString(),
  };

  const adminReq = { body: reassignPayload };
  const adminRes = mockResponse();
  await adminQualifyingResults.upsert(adminReq, adminRes);
  assert.equal(adminRes.statusCode, 201, `Admin upsert failed: ${JSON.stringify(adminRes.body)}`);

  // 5. Assert: StudentProfile.componentId was updated to LTS by placeStudent
  const updatedStudent = await prisma.studentProfile.findUnique({
    where: { id: student.id },
  });
  assert.equal(updatedStudent.componentId, lts.id, 'placeStudent must update studentProfile.componentId to LTS');

  // 6. Assert: placeStudent created an ACTIVE enrollment for LTS stamped with the open cycle
  const activeEnrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id, status: 'ACTIVE' },
  });
  assert.equal(activeEnrollments.length, 1, 'Exactly one ACTIVE enrollment should exist');
  assert.equal(activeEnrollments[0].componentId, lts.id, 'ACTIVE enrollment must be for LTS');
  assert.equal(activeEnrollments[0].schoolYear, openSY, 'Enrollment must be stamped with open schoolYear');
  assert.equal(activeEnrollments[0].semester, openSem, 'Enrollment must be stamped with open semester');

  // 7. Assert: qualifyingExamAttempt was also synchronized
  const updatedAttempt = await prisma.qualifyingExamAttempt.findUnique({
    where: { id: attempt.id },
  });
  assert.equal(updatedAttempt.assignedComponent, 'LTS');
  assert.equal(updatedAttempt.status, 'assigned-alternative');

  // 8. Assert: student polling endpoint /students/me/qualifying-results returns the assignedComponent
  const req = { user, student: updatedStudent };
  const res = mockResponse();
  await getMyQualifyingResults(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.data) && res.body.data.length > 0);
  assert.equal(res.body.data[0].assignedComponent, 'LTS');
});
