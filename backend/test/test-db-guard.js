export function enforceTestDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('Refusing to run tests: DATABASE_URL environment variable is not set.');
  }

  let dbName = '';
  try {
    const parsed = new URL(databaseUrl);
    dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  } catch (err) {
    throw new Error(`Refusing to run tests: invalid DATABASE_URL: ${err.message}`);
  }

  if (!dbName.endsWith('_test')) {
    throw new Error(
      `CRITICAL GUARD: Refusing to run tests against database "${dbName}". Tests may only run against databases ending in "_test" to protect non-test environments.`
    );
  }

  return dbName;
}
