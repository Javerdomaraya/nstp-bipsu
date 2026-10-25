import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');
const { evaluateGrade, resolveGradeInput } = await import('../src/modules/grades/grade.policy.js');
const { createSemesterGrade, listAdminGradeRoster, listReleasedStudentSemesterGrades, releaseSemesterGrade } = await import('../src/modules/grades/grades.service.js');
const { createSemesterGradeSchema } = await import('../src/modules/grades/grades.validation.js');

const originalFindMany = prisma.grade.findMany;
const originalStudentFindMany = prisma.studentProfile.findMany;
const originalStudentCount = prisma.studentProfile.count;
const originalTransaction = prisma.$transaction;
afterEach(() => {
  prisma.grade.findMany = originalFindMany;
  prisma.studentProfile.findMany = originalStudentFindMany;
  prisma.studentProfile.count = originalStudentCount;
  prisma.$transaction = originalTransaction;
});

test('approved percent and numerical grade bands calculate classification on the server', () => {
  assert.equal(evaluateGrade(95, 1.0), 'EXCELLENT');
  assert.equal(evaluateGrade(92, 1.3), 'OUTSTANDING');
  assert.equal(evaluateGrade(87, 1.8), 'VERY_GOOD');
  assert.equal(evaluateGrade(82, 2.2), 'GOOD');
  assert.equal(evaluateGrade(77, 2.8), 'FAIR');
  assert.equal(evaluateGrade(75, 3.0), 'POOR');
  assert.equal(evaluateGrade(72, 3.5), 'CONDITIONAL');
  assert.equal(evaluateGrade(70, 5.0), 'FAILED');
});

test('BiPSU grade input is converted server-side from one authoritative value', () => {
  assert.deepEqual(resolveGradeInput('PERCENT', 90), {
    inputType: 'PERCENT', inputValue: 90, gradeScaleVersion: 'BIPSU-2026', percentGrade: 90,
    numericalGrade: 1.5, classification: 'OUTSTANDING', percentEquivalent: '90%', numericalEquivalent: '1.5',
  });
  assert.equal(resolveGradeInput('NUMERICAL', 1.3).percentEquivalent, '92%');
  assert.equal(resolveGradeInput('NUMERICAL', 1.3).classification, 'OUTSTANDING');
  assert.equal(resolveGradeInput('PERCENT', 72).numericalGrade, null);
  assert.equal(resolveGradeInput('PERCENT', 72).numericalEquivalent, '3.1–4.0');
  assert.equal(resolveGradeInput('NUMERICAL', 3.5).percentGrade, null);
  assert.equal(resolveGradeInput('NUMERICAL', 3.5).percentEquivalent, '71–74%');
  assert.equal(resolveGradeInput('NUMERICAL', 5).percentEquivalent, '70% or below');
});

test('unsupported grade values are rejected by the BiPSU scale', () => {
  assert.throws(() => resolveGradeInput('PERCENT', 90.5), /whole number/i);
  assert.throws(() => resolveGradeInput('NUMERICAL', 4.5), /1\.0–4\.0 or 5\.0/i);
  assert.throws(() => resolveGradeInput('NUMERICAL', 1.25), /one decimal place/i);
});

test('incompatible grades and non-whole percentages are rejected', () => {
  assert.throws(() => evaluateGrade(92, 2.0), /incompatible/i);
  assert.throws(() => evaluateGrade(75, 5.0), /incompatible/i);
  assert.throws(() => evaluateGrade(92.5, 1.3), /whole number/i);
});

test('only First and Second Semester identities pass strict validation', () => {
  const base = { studentId: 'student-1', componentId: 'component-1', schoolYear: '2026-2027', semester: 'FIRST', gradeInput: { inputType: 'PERCENT', inputValue: 92 } };
  assert.equal(createSemesterGradeSchema.safeParse({ body: base, params: {}, query: {} }).success, true);
  assert.equal(createSemesterGradeSchema.safeParse({ body: { ...base, semester: 'SUMMER' }, params: {}, query: {} }).success, false);
  assert.equal(createSemesterGradeSchema.safeParse({ body: { ...base, classification: 'EXCELLENT' }, params: {}, query: {} }).success, false);
  assert.equal(createSemesterGradeSchema.safeParse({ body: { ...base, percentGrade: 92, numericalGrade: 1.3 }, params: {}, query: {} }).success, false);
});

test('student grade lookup requests released semester records only', async () => {
  let query;
  prisma.grade.findMany = async (args) => { query = args; return []; };
  await listReleasedStudentSemesterGrades('student-1');
  assert.equal(query.where.studentId, 'student-1');
  assert.equal(query.where.isReleased, true);
  assert.deepEqual(query.where.semester, { not: null });
});

test('admin grade roster is server-paginated and searches authoritative student profiles', async () => {
  let query;
  prisma.studentProfile.findMany = async (args) => { query = args; return []; };
  prisma.studentProfile.count = async () => 125;
  const result = await listAdminGradeRoster({ schoolYear: '2026-2027', semester: 'FIRST', search: 'Kian', page: 2, pageSize: 25 });
  assert.equal(query.skip, 25);
  assert.equal(query.take, 25);
  assert.equal(query.select.grades.where.schoolYear, '2026-2027');
  assert.equal(query.select.grades.where.semester, 'FIRST');
  assert.equal(result.pagination.totalPages, 5);
});

test('First and Second Semester grades retain independent unique identities', async () => {
  const identities = [];
  const tx = {
    studentProfile: { findUnique: async () => ({ id: 'student-1', componentId: 'component-1' }) },
    nSTPComponent: { findUnique: async () => ({ id: 'component-1' }) },
    grade: {
      findUnique: async ({ where }) => { identities.push(where.studentId_componentId_schoolYear_semester); return null; },
      create: async ({ data }) => ({ id: `grade-${data.semester}`, ...data, numericalGrade: data.numericalGrade, isReleased: false }),
    },
    auditLogEntry: { create: async () => ({}) },
  };
  prisma.$transaction = async (operation) => operation(tx);
  const base = { studentId: 'student-1', componentId: 'component-1', schoolYear: '2026-2027', gradeInput: { inputType: 'PERCENT', inputValue: 92 } };
  const first = await createSemesterGrade('admin-1', { ...base, semester: 'FIRST' });
  await createSemesterGrade('admin-1', { ...base, semester: 'SECOND' });
  assert.equal(identities[0].semester, 'FIRST');
  assert.equal(identities[1].semester, 'SECOND');
  assert.equal(first.percentGrade, 92);
  assert.equal(first.numericalGrade, 1.3);
  assert.equal(first.classification, 'OUTSTANDING');
  assert.equal(first.gradeScaleVersion, 'BIPSU-2026');
});

test('duplicate semester identities are rejected without creating another grade', async () => {
  let created = false;
  prisma.$transaction = async (operation) => operation({
    studentProfile: { findUnique: async () => ({ id: 'student-1', componentId: 'component-1' }) },
    nSTPComponent: { findUnique: async () => ({ id: 'component-1' }) },
    grade: { findUnique: async () => ({ id: 'existing-grade' }), create: async () => { created = true; } },
  });
  await assert.rejects(() => createSemesterGrade('admin-1', {
    studentId: 'student-1', componentId: 'component-1', schoolYear: '2026-2027', semester: 'FIRST', gradeInput: { inputType: 'NUMERICAL', inputValue: 1.3 },
  }), (error) => error.statusCode === 409);
  assert.equal(created, false);
});

test('official release requires an active matching enrollment', async () => {
  const existing = { id: 'grade-1', studentId: 'student-1', componentId: 'component-1', schoolYear: '2026-2027', semester: 'FIRST', percentGrade: 92, numericalGrade: 1.3, isReleased: false };
  prisma.$transaction = async (operation) => operation({
    grade: { findUnique: async () => existing },
    enrollment: { findFirst: async () => null },
  });
  await assert.rejects(() => releaseSemesterGrade('admin-1', 'grade-1'), (error) => error.statusCode === 409 && /active enrollment/i.test(error.message));

  let releaseData;
  prisma.$transaction = async (operation) => operation({
    grade: {
      findUnique: async () => existing,
      update: async ({ data }) => { releaseData = data; return { ...existing, ...data }; },
    },
    enrollment: { findFirst: async () => ({ id: 'enrollment-1' }) },
    auditLogEntry: { create: async () => ({}) },
  });
  const released = await releaseSemesterGrade('admin-1', 'grade-1');
  assert.equal(released.isReleased, true);
  assert.equal(releaseData.releasedById, 'admin-1');
});

test('migration preserves legacy grade columns and adds semester uniqueness', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20260803235900_semester_grade_records/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /Existing prelim\/midterm\/final data is intentionally retained/);
  assert.match(migration, /grade_studentId_componentId_schoolYear_semester_key/);
  assert.doesNotMatch(migration, /DROP COLUMN "(?:prelim|midterm|final)"/);
});

test('grade input migration records future provenance without inventing it for legacy rows', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20260803235930_grade_input_conversion/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TYPE "GradeInputType"/);
  assert.match(migration, /"gradeScaleVersion"/);
  assert.match(migration, /original entry format is\s*-- unknowable/);
  assert.doesNotMatch(migration, /UPDATE "grade"/);
});
