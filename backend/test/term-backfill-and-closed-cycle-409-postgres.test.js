import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { startMyQualifyingExam } = await import('../src/modules/nstp/nstp.controller.js');
const { placeStudent } = await import('../src/modules/nstp/nstp.service.js');

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260826000000_term_aware_enrollments_and_application_state/migration.sql'
);

test('real postgres: migration backfills dev data, applies unique constraint, and refuses start/placement with 409 when no cycle is open', async () => {
  const ts = `backfill_${Date.now()}`;

  // 1. Ensure CWTS component exists
  const cwts = await prisma.nSTPComponent.upsert({
    where: { type: 'CWTS' },
    update: {},
    create: { type: 'CWTS', name: 'CWTS Regular' },
  });

  // 2. Create section copying dev data shape: schoolYear = '2025-2026', semester = 'FIRST'
  const devSY = '2025-2026';
  const devSem = 'FIRST';
  const section = await prisma.section.create({
    data: {
      code: `SEC-${ts}`,
      name: `CWTS Section ${ts}`,
      schoolYear: devSY,
      semester: devSem,
      componentId: cwts.id,
    },
  });

  // 3. Create student profile copying dev data
  const user = await prisma.user.create({
    data: {
      email: `${ts}@bipsu.edu.ph`,
      name: 'Backfill Test Student',
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

  // Insert enrollment row with null schoolYear/semester directly via raw SQL
  const enrollmentId = `enr-dev-copy-${ts}`;
  await prisma.$executeRawUnsafe(`
    INSERT INTO "enrollment" ("id", "studentId", "componentId", "sectionId", "status", "enrolledAt", "createdAt", "updatedAt", "schoolYear", "semester")
    VALUES ('${enrollmentId}', '${student.id}', '${cwts.id}', '${section.id}', 'ACTIVE', NOW(), NOW(), NOW(), NULL, NULL)
  `);

  // Verify before backfill: schoolYear and semester are null
  const before = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  assert.equal(before.schoolYear, null);
  assert.equal(before.semester, null);

  // 4. Run the migration SQL statements against real PostgreSQL
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const statements = migrationSql
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }

  // 5. Assert: enrollment was backfilled from linked section
  const after = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  assert.equal(after.schoolYear, devSY, 'Enrollment must backfill schoolYear from linked section');
  assert.equal(after.semester, devSem, 'Enrollment must backfill semester from linked section');

  // 6. Assert: unique constraint exists in PostgreSQL catalog
  const constraints = await prisma.$queryRawUnsafe(`
    SELECT conname::text
    FROM pg_constraint
    WHERE conrelid = 'enrollment'::regclass AND conname = 'enrollment_studentId_componentId_schoolYear_semester_key'
  `);
  assert.equal(constraints.length, 1, 'Unique constraint enrollment_studentId_componentId_schoolYear_semester_key must exist');

  // Verify duplicate enrollment for the same student + component + schoolYear + semester is rejected by PostgreSQL
  await assert.rejects(
    async () => {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "enrollment" ("id", "studentId", "componentId", "sectionId", "status", "enrolledAt", "createdAt", "updatedAt", "schoolYear", "semester")
        VALUES ('dup-${ts}', '${student.id}', '${cwts.id}', NULL, 'ACTIVE', NOW(), NOW(), NOW(), '${devSY}', '${devSem}')
      `);
    },
    (err) => {
      assert.match(err.message, /unique constraint|violates unique/i);
      return true;
    },
    'Duplicate enrollment for the same term must violate the unique constraint'
  );

  // 7. Refuse start and placement with 409 when no cycle is open
  // Ensure common module exists for student
  const commonMod = await prisma.module.create({
    data: { title: `Common Mod ${ts}`, hours: 25, componentId: null },
  });
  await prisma.moduleProgress.create({
    data: { studentId: student.id, moduleId: commonMod.id, completedAt: new Date() },
  });

  // Case A: applicationClosed = true
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: { applicationClosed: true, schoolYear: devSY, semester: devSem },
    create: { id: 'default', applicationClosed: true, schoolYear: devSY, semester: devSem, slotLimits: {} },
  });

  const reqClosed = { user, student, body: { preferredComponent: 'CWTS' } };
  const resClosed = mockResponse();
  await startMyQualifyingExam(reqClosed, resClosed);
  assert.equal(resClosed.statusCode, 409, 'startMyQualifyingExam must return 409 when application is closed');
  assert.match(resClosed.body.error, /no active qualifying application cycle is currently open/i);

  await assert.rejects(
    async () => {
      await placeStudent(prisma, { studentId: student.id, canonicalComponent: 'CWTS' });
    },
    (err) => {
      assert.equal(err.statusCode, 409, 'placeStudent must throw 409 when application is closed');
      assert.match(err.message, /no active qualifying application cycle/i);
      return true;
    }
  );

  // Case B: schoolYear is null (no open cycle configured)
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: { applicationClosed: false, schoolYear: null, semester: null },
    create: { id: 'default', applicationClosed: false, schoolYear: null, semester: null, slotLimits: {} },
  });

  const reqNoCycle = { user, student, body: { preferredComponent: 'CWTS' } };
  const resNoCycle = mockResponse();
  await startMyQualifyingExam(reqNoCycle, resNoCycle);
  assert.equal(resNoCycle.statusCode, 409, 'startMyQualifyingExam must return 409 when cycle parameters are null');

  await assert.rejects(
    async () => {
      await placeStudent(prisma, { studentId: student.id, canonicalComponent: 'CWTS' });
    },
    (err) => {
      assert.equal(err.statusCode, 409, 'placeStudent must throw 409 when cycle parameters are null');
      return true;
    }
  );

  // Clean up and restore open cycle for subsequent tests
  await prisma.componentApplicationState.upsert({
    where: { id: 'default' },
    update: { applicationClosed: false, schoolYear: '2026-2027', semester: '1st Semester', slotLimits: { CWTS: 10 } },
    create: { id: 'default', applicationClosed: false, schoolYear: '2026-2027', semester: '1st Semester', slotLimits: { CWTS: 10 } },
  });
});
