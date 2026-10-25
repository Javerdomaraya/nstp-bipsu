import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

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

test('real postgres: ensures isCurrent column and partial unique index exist', async () => {
  // Apply the migration statements idempotently
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "component_application_state" ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN NOT NULL DEFAULT false;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "component_application_state_is_current_unique"
    ON "component_application_state" ("isCurrent")
    WHERE "isCurrent" = true;
  `);

  const indexes = await prisma.$queryRaw`
    SELECT indexname::text, indexdef::text
    FROM pg_indexes
    WHERE tablename = 'component_application_state'
      AND indexname = 'component_application_state_is_current_unique';
  `;
  assert.equal(indexes.length, 1, 'Partial unique index on isCurrent must exist');
  assert.match(indexes[0].indexdef, /WHERE \("isCurrent" = true\)/i);
});

test('real postgres: two open cycles with isCurrent = true cannot exist (partial unique constraint)', async () => {
  await prisma.componentApplicationState.deleteMany({});

  // Cycle 1 created as isCurrent = true
  await prisma.componentApplicationState.create({
    data: {
      id: `current-cycle-1-${Date.now()}`,
      schoolYear: '2026-2027',
      semester: '1st Semester',
      applicationClosed: false,
      isCurrent: true,
      slotLimits: { CWTS: 50 },
    },
  });

  // Attempting to create Cycle 2 also with isCurrent = true must be rejected by PostgreSQL
  let uniqueViolationCaught = false;
  try {
    await prisma.componentApplicationState.create({
      data: {
        id: `current-cycle-2-${Date.now()}`,
        schoolYear: '2026-2027',
        semester: '2nd Semester',
        applicationClosed: false,
        isCurrent: true,
        slotLimits: { CWTS: 50 },
      },
    });
  } catch (err) {
    uniqueViolationCaught = true;
    assert.match(err.message, /unique constraint|23505/i);
  }

  assert.equal(uniqueViolationCaught, true, 'Database must enforce that two current cycles cannot exist');

  // However, multiple historical cycles with isCurrent = false ARE allowed
  const pastCycle = await prisma.componentApplicationState.create({
    data: {
      id: `past-cycle-${Date.now()}`,
      schoolYear: '2025-2026',
      semester: '2nd Semester',
      applicationClosed: true,
      isCurrent: false,
      slotLimits: { CWTS: 50 },
    },
  });
  assert.ok(pastCycle.id, 'Cycle with isCurrent = false should be created without constraint violation');
});

test('real postgres: admin can reassign student when isCurrent cycle has applicationClosed = true', async () => {
  const termSY = '2026-2027';
  const termSem = '1st Semester';

  await prisma.componentApplicationState.deleteMany({});
  await prisma.componentApplicationState.create({
    data: {
      id: `current-cycle-closed-${Date.now()}`,
      schoolYear: termSY,
      semester: termSem,
      applicationClosed: true,
      isCurrent: true,
      slotLimits: { CWTS: 50, LTS: 50 },
    },
  });

  const ts = `adm_close_cur_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Admin Closed Cycle Student',
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

  // 1. Direct placeStudent works even though applicationClosed = true
  await prisma.$transaction(async (tx) => {
    await placeStudent(tx, {
      studentId: user.studentProfile.id,
      userId: user.id,
      canonicalComponent: 'CWTS',
    });
  });

  const profileAfterPlace = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(
    profileAfterPlace.componentId === 'CWTS' || profileAfterPlace.componentId === 'system-component-cwts',
    'Student profile must be updated to CWTS'
  );

  // 2. Admin qualifying-results reassignment works
  const adminActor = { id: `admin-${Date.now()}`, name: 'System Admin', email: 'admin@bipsu.edu.ph' };
  const reassigned = await upsertAdminResource('qualifying-results', null, {
    userId: user.id,
    preferredComponent: 'LTS',
    assignedComponent: 'LTS',
    status: 'assigned-preferred',
  }, { actor: adminActor });

  assert.equal(reassigned.assignedComponent, 'LTS');
  const profileAfterReassign = await prisma.studentProfile.findUnique({
    where: { id: user.studentProfile.id },
  });
  assert.ok(
    profileAfterReassign.componentId === 'LTS' || profileAfterReassign.componentId === 'system-component-lts',
    'Student profile must be reassigned to LTS by admin'
  );

  // 3. But student qualifying exam submit is rejected when applicationClosed = true
  const exam = await prisma.exam.findFirst({
    where: { id: QUALIFYING_EXAM_ID },
    include: { questions: true },
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
  assert.equal(res.statusCode, 409, `Student submit must be refused with 409 when applicationClosed = true, got: ${res.statusCode}`);
  assert.match(res.body.error, /no active qualifying application cycle is currently open/i);
});
