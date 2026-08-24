#!/usr/bin/env node
// Referential-integrity gate. Read-only; never repairs.
//
// Exit code is the contract (see scripts/lib/release-gate.mjs):
//   0  every relationship proven CLEAR
//   1  orphan rows exist, a relationship could not be verified, or a query errored
//
// Relationship definitions live in scripts/lib/orphan-checks.mjs so they can be
// unit-tested without a database engine. This file is only the Prisma wiring.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { FOREIGN_KEY_RELATIONSHIPS, LEGACY_REVIEWS, runOrphanChecks } from './lib/orphan-checks.mjs';
import { SAMPLE_LIMIT } from './lib/release-gate.mjs';
import { readSchemaSnapshot, introspectionFailureReport } from './lib/schema-snapshot.mjs';

const prisma = new PrismaClient();
const checkedAt = new Date().toISOString();

function emit(report) {
  console.log(
    JSON.stringify({ checkedAt, readOnly: true, gate: 'report-orphans', ...report }, null, 2),
  );
}

try {
  const snapshot = await readSchemaSnapshot(prisma).catch((error) => ({ error }));

  if (snapshot.error) {
    emit({ ...introspectionFailureReport(snapshot.error), findings: [], warnings: [], skippedChecks: [] });
    process.exitCode = 1;
  } else {
    const report = await runOrphanChecks({
      relationships: FOREIGN_KEY_RELATIONSHIPS,
      reviews: LEGACY_REVIEWS,
      tables: snapshot.tables,
      columns: snapshot.columns,
      limit: SAMPLE_LIMIT,
      runQuery: (sql) => prisma.$queryRawUnsafe(sql),
    });

    emit({
      bootstrap: report.bootstrap,
      ...(report.bootstrap
        ? {
            bootstrapNote:
              'Database contains no tables. Treated as an un-migrated bootstrap database; skipped relationships do not block.',
          }
        : {}),
      statusCounts: report.statusCounts,
      blockingCount: report.blockingCount,
      blockingReasons: report.blockingReasons,
      findings: report.findings,
      warnings: report.warnings,
      skippedChecks: report.skippedChecks,
      erroredChecks: report.erroredChecks,
      relationships: report.results,
    });

    process.exitCode = report.exitCode;
  }
} finally {
  await prisma.$disconnect();
}
