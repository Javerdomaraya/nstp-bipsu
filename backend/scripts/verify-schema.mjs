#!/usr/bin/env node
// Post-deploy schema verification gate.
//
// Runs AFTER `prisma migrate deploy` and answers one question the migration
// ledger cannot: is the physical schema actually what this revision describes?
//
// `prisma migrate status` compares _prisma_migrations against the migrations
// directory. It reports "applied" for a migration whose DDL is no longer present
// in the database, which is precisely the failure this repository has already
// hit -- 20260802130000_restore_postgres_foreign_keys exists because foreign
// keys went missing while migration history stayed clean.
//
// That matters for authorization because schema.prisma leaves `relationMode` at
// its default of "foreignKeys": the `onDelete: Cascade` on
// coordinator_profile.userId is enforced by PostgreSQL, not by the client. If
// the constraint is absent, deleting a coordinator account leaves the scope
// grant behind and nothing in the application notices.
//
// This gate runs too late to prevent a bad migration. What it prevents is a
// deployment being *reported* as successful when the schema is not what the
// authorization logic assumes.
//
// Exit code is the contract (see scripts/lib/release-gate.mjs):
//   0  the physical schema matches the expectation
//   1  a foreign key is missing or has the wrong ON DELETE action, the check
//      could not run, or the check errored
//
// This script is read-only. It never repairs. Recovery is an operator decision
// -- see MIGRATION_OPERATIONS.md.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { FOREIGN_KEY_INTEGRITY_CHECK, applyPostDeployPolicy } from './lib/foreign-key-integrity.mjs';
import { runPreflightChecks } from './lib/preflight-checks.mjs';
import { SAMPLE_LIMIT } from './lib/release-gate.mjs';
import { readSchemaSnapshot, introspectionFailureReport } from './lib/schema-snapshot.mjs';

const prisma = new PrismaClient();
const checkedAt = new Date().toISOString();

function emit(report) {
  console.log(
    JSON.stringify({ checkedAt, readOnly: true, gate: 'verify-schema', ...report }, null, 2),
  );
}

try {
  const snapshot = await readSchemaSnapshot(prisma).catch((error) => ({ error }));

  if (snapshot.error) {
    emit(introspectionFailureReport(snapshot.error));
    process.exitCode = 1;
  } else {
    const report = applyPostDeployPolicy(
      await runPreflightChecks({
        checks: [FOREIGN_KEY_INTEGRITY_CHECK],
        tables: snapshot.tables,
        columns: snapshot.columns,
        limit: SAMPLE_LIMIT,
        runQuery: (sql) => prisma.$queryRawUnsafe(sql),
      }),
    );

    emit({
      ...(report.bootstrapAfterDeploy
        ? { bootstrapAfterDeploy: true, bootstrapNote: report.bootstrapNote }
        : {}),
      statusCounts: report.statusCounts,
      blockingCount: report.blockingCount,
      blockingReasons: report.blockingReasons,
      results: report.results,
    });

    process.exitCode = report.exitCode;
  }
} finally {
  await prisma.$disconnect();
}
