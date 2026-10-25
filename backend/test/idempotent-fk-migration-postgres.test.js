import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

process.env.DATABASE_URL ||= 'postgresql://neondb_owner:npg_2wuOR3NhbaAF@ep-long-truth-a1cnk55w.ap-southeast-1.aws.neon.tech/nstp_fresh_test?sslmode=require';
enforceTestDatabase();

const { default: prisma } = await import('../src/db/prisma.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationSqlPath = path.resolve(
  __dirname,
  '../prisma/migrations/20260825120000_qualifying_exam_attempt_foreign_keys/migration.sql'
);

test('real postgres: foreign key migration is idempotent with DROP CONSTRAINT IF EXISTS and can execute repeatedly', async () => {
  const sql = fs.readFileSync(migrationSqlPath, 'utf8');

  // Verify the migration file literally contains DROP CONSTRAINT IF EXISTS for both foreign keys
  assert.match(sql, /ALTER TABLE "qualifying_exam_attempt" DROP CONSTRAINT IF EXISTS "qualifying_exam_attempt_userId_fkey"/);
  assert.match(sql, /ALTER TABLE "qualifying_exam_attempt" DROP CONSTRAINT IF EXISTS "qualifying_exam_attempt_examId_fkey"/);

  // Clean comments and split into individual statements
  const statements = sql
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter((s) => s.length > 0);

  console.log('PARSED STATEMENTS:', statements);

  // Run the migration statements 3 consecutive times against real PostgreSQL
  for (let run = 1; run <= 3; run++) {
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }

  // Inspect pg_constraint catalog to verify both FKs exist with ON DELETE RESTRICT ('r')
  const fks = await prisma.$queryRawUnsafe(`
    SELECT conname::text, confdeltype::text, confupdtype::text
    FROM pg_constraint
    WHERE conrelid = 'qualifying_exam_attempt'::regclass AND contype = 'f'
    ORDER BY conname ASC
  `);

  const userFk = fks.find((fk) => fk.conname === 'qualifying_exam_attempt_userId_fkey');
  const examFk = fks.find((fk) => fk.conname === 'qualifying_exam_attempt_examId_fkey');

  assert.ok(userFk, 'qualifying_exam_attempt_userId_fkey must exist');
  assert.equal(userFk.confdeltype, 'r', 'qualifying_exam_attempt_userId_fkey must have confdeltype = "r" (RESTRICT)');

  assert.ok(examFk, 'qualifying_exam_attempt_examId_fkey must exist');
  assert.equal(examFk.confdeltype, 'r', 'qualifying_exam_attempt_examId_fkey must have confdeltype = "r" (RESTRICT)');
});
