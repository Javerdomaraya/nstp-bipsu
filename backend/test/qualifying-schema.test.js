import { enforceTestDatabase } from './test-db-guard.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/nstp_test';
enforceTestDatabase();
const { default: prisma } = await import('../src/db/prisma.js');

test('QualifyingExamAttempt model and updated QualifyingExamResult exist on Prisma client', () => {
  assert(prisma.qualifyingExamAttempt, 'prisma.qualifyingExamAttempt should be defined on client');
  assert(prisma.qualifyingExamResult, 'prisma.qualifyingExamResult should be defined on client');
});

test('Qualifying exam redesign migration SQL is present and well-formed', () => {
  const migrationPath = new URL('../prisma/migrations/20260825000000_qualifying_exam_redesign/migration.sql', import.meta.url);
  const sql = readFileSync(migrationPath, 'utf8');
  assert(sql.includes('qualifying_exam_attempt'), 'Migration must create qualifying_exam_attempt table');
  assert(sql.includes('qualifying_exam_result'), 'Migration must alter qualifying_exam_result table');
  assert(sql.includes('expiresAt'), 'Migration must define expiresAt column');
  assert(sql.includes('attemptNumber'), 'Migration must define attemptNumber column');
});
