import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceTestDatabase } from './test-db-guard.js';

test('enforceTestDatabase: throws when DATABASE_URL is not set', () => {
  assert.throws(
    () => enforceTestDatabase(''),
    /Refusing to run tests: DATABASE_URL environment variable is not set/
  );
  assert.throws(
    () => enforceTestDatabase(undefined),
    /Refusing to run tests: DATABASE_URL environment variable is not set/
  );
});

test('enforceTestDatabase: throws when database name does not end in _test', () => {
  // Test actual dev database URL format
  const devUrl = 'postgresql://neondb_owner:dummy@ep-pooler.neon.tech/neondb?sslmode=require';
  assert.throws(
    () => enforceTestDatabase(devUrl),
    /CRITICAL GUARD: Refusing to run tests against database "neondb". Tests may only run against databases ending in "_test"/
  );

  const prodUrl = 'postgresql://user:pass@localhost:5432/production_nstp';
  assert.throws(
    () => enforceTestDatabase(prodUrl),
    /CRITICAL GUARD: Refusing to run tests against database "production_nstp"/
  );

  const stagingUrl = 'postgresql://user:pass@localhost:5432/nstp_staging?schema=public';
  assert.throws(
    () => enforceTestDatabase(stagingUrl),
    /CRITICAL GUARD: Refusing to run tests against database "nstp_staging"/
  );
});

test('enforceTestDatabase: accepts database names ending in _test', () => {
  const testUrl1 = 'postgresql://neondb_owner:dummy@ep-pooler.neon.tech/nstp_fresh_test?sslmode=require';
  assert.equal(enforceTestDatabase(testUrl1), 'nstp_fresh_test');

  const testUrl2 = 'postgresql://localhost:5432/my_app_test';
  assert.equal(enforceTestDatabase(testUrl2), 'my_app_test');

  const testUrl3 = 'postgres://user:pass@127.0.0.1:5432/ci_test?sslmode=disable';
  assert.equal(enforceTestDatabase(testUrl3), 'ci_test');
});
