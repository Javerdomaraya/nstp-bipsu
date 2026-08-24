// Shared schema introspection for the deployment gates.
//
// Both gates decide what they can verify based on which tables and columns
// actually exist. If that lookup fails, no check ran and nothing is proven, so
// the failure must be reported as a blocking condition -- never as an empty
// (and therefore clean-looking) result set.

export async function readSchemaSnapshot(prisma) {
  const tableRows = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const columnRows = await prisma.$queryRaw`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'`;

  return {
    tables: new Set(tableRows.map(({ tablename }) => tablename)),
    columns: new Set(
      columnRows.map(({ table_name, column_name }) => `${table_name}.${column_name}`),
    ),
  };
}

export function introspectionFailureReport(error) {
  return {
    bootstrap: false,
    statusCounts: { CLEAR: 0, FOUND: 0, SKIPPED: 0, ERROR: 1 },
    blockingCount: 1,
    blockingReasons: [
      `schema_introspection: could not read the current schema (${String(error?.message ?? error).slice(0, 300)}). No check executed, so nothing is verified.`,
    ],
    results: [],
  };
}
