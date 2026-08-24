#!/usr/bin/env node
// Read-only production preflight gate.
//
// This script proves that conditions the pending migrations cannot tolerate are
// absent from the target database. It never writes, and it never repairs.
//
// Exit code is the contract (see scripts/lib/release-gate.mjs):
//   0  every BLOCKER proven CLEAR
//   1  a BLOCKER matched rows, a BLOCKER could not run, or a check errored
//
// The check bodies and blocking policy live in scripts/lib/ so they can be
// unit-tested without a database engine. This file is only the Prisma wiring.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { PRODUCTION_CHECKS, runPreflightChecks } from './lib/preflight-checks.mjs';
import { SAMPLE_LIMIT } from './lib/release-gate.mjs';
import { readSchemaSnapshot, introspectionFailureReport } from './lib/schema-snapshot.mjs';

const prisma = new PrismaClient();
const checkedAt = new Date().toISOString();

function emit(report) {
  console.log(JSON.stringify({ checkedAt, readOnly: true, gate: 'preflight-production', ...report }, null, 2));
}

try {
  const snapshot = await readSchemaSnapshot(prisma).catch((error) => ({ error }));

  if (snapshot.error) {
    emit(introspectionFailureReport(snapshot.error));
    process.exitCode = 1;
  } else {
    const report = await runPreflightChecks({
      checks: PRODUCTION_CHECKS,
      tables: snapshot.tables,
      columns: snapshot.columns,
      limit: SAMPLE_LIMIT,
      runQuery: (sql) => prisma.$queryRawUnsafe(sql),
    });

    emit({
      bootstrap: report.bootstrap,
      // A database with no tables has never been migrated, so it cannot hold bad
      // data. Every skip is legitimate there and only there.
      ...(report.bootstrap
        ? {
            bootstrapNote:
              'Database contains no tables. Treated as an un-migrated bootstrap database; skipped checks do not block.',
          }
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
