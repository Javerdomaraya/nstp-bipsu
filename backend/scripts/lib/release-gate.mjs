// Shared release-gate vocabulary and blocking policy for the deployment gates
// (scripts/preflight-production.mjs and scripts/report-orphans.mjs).
//
// This module is deliberately free of database imports so the blocking policy
// can be unit-tested without a live PostgreSQL connection.
//
// Blocking policy -- the whole point of this module:
//
//   A gate that cannot prove a condition is safe must not report success.
//
//   BLOCKER + FOUND    -> blocks. The condition exists in the database.
//   BLOCKER + SKIPPED  -> blocks. The check could not run, so nothing was
//                         proven. This is the fail-open hole that previously
//                         let a deployment proceed unverified: checks skip
//                         precisely when the database is behind on migrations,
//                         which is exactly the pre-deployment state.
//   BLOCKER + CLEAR    -> passes. Proven absent.
//   REVIEW  + FOUND    -> reported, does not block. Operator judgement.
//   REVIEW  + SKIPPED  -> reported, does not block.
//   ANY     + ERROR    -> blocks, regardless of severity. An error means the
//                         gate itself malfunctioned; a gate that crashed has
//                         verified nothing and must never be read as success.

export const CHECK_STATUS = Object.freeze({
  CLEAR: 'CLEAR',
  FOUND: 'FOUND',
  SKIPPED: 'SKIPPED',
  ERROR: 'ERROR',
});

export const SEVERITY = Object.freeze({
  BLOCKER: 'BLOCKER',
  REVIEW: 'REVIEW',
});

export const SAMPLE_LIMIT = 100;

// Returns the unmet schema requirements for a check, as stable
// "table:<name>" / "column:<table>.<name>" tokens.
export function missingRequirements(check, availableTables, availableColumns) {
  const tables = check.tables ?? [];
  const columns = check.columns ?? [];
  return [
    ...tables.filter((table) => !availableTables.has(table)).map((table) => `table:${table}`),
    ...columns.filter((column) => !availableColumns.has(column)).map((column) => `column:${column}`),
  ];
}

// A database with no tables at all has not been migrated even once. It cannot
// contain bad data, so the gates have nothing to verify and skipping is
// legitimate rather than fail-open. Any table present means the database is
// partially or fully migrated, and every skip is then treated as blocking.
export function isBootstrapDatabase(availableTables) {
  return availableTables.size === 0;
}

export function isBlocking(result) {
  if (result.status === CHECK_STATUS.ERROR) return true;
  if (result.severity !== SEVERITY.BLOCKER) return false;
  return result.status === CHECK_STATUS.FOUND || result.status === CHECK_STATUS.SKIPPED;
}

export function blockingReason(result) {
  switch (result.status) {
    case CHECK_STATUS.FOUND:
      return `${result.name}: ${result.totalCount ?? 0} row(s) matched a BLOCKER condition.`;
    case CHECK_STATUS.SKIPPED:
      return `${result.name}: BLOCKER could not run (${(result.missing ?? []).join(', ') || 'unknown reason'}). A check that did not execute proves nothing.`;
    case CHECK_STATUS.ERROR:
      return `${result.name}: check failed to execute (${result.error ?? 'unknown error'}).`;
    default:
      return `${result.name}: unexpected blocking status ${result.status}.`;
  }
}

export function countByStatus(results) {
  const counts = { CLEAR: 0, FOUND: 0, SKIPPED: 0, ERROR: 0 };
  for (const result of results) {
    if (result.status in counts) counts[result.status] += 1;
  }
  return counts;
}

// Single source of truth for the process exit code of both gates.
export function summarize(results, { bootstrap = false } = {}) {
  const blocking = bootstrap ? [] : results.filter(isBlocking);
  return {
    bootstrap,
    statusCounts: countByStatus(results),
    blockingCount: blocking.length,
    blockingReasons: blocking.map(blockingReason),
    exitCode: blocking.length > 0 ? 1 : 0,
  };
}
