import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHECK_STATUS,
  SEVERITY,
  isBlocking,
  isBootstrapDatabase,
  missingRequirements,
  summarize,
} from '../scripts/lib/release-gate.mjs';
import { PRODUCTION_CHECKS, buildSampledQuery, runPreflightChecks } from '../scripts/lib/preflight-checks.mjs';
import { FOREIGN_KEY_RELATIONSHIPS, runOrphanChecks } from '../scripts/lib/orphan-checks.mjs';

/**
 * Exit-code contract for the two deployment gates.
 *
 * Both gates were originally reporting tools that were later wired into
 * `migrate:deploy` as blocking gates, without their exit-code semantics being
 * revisited. The result was fail-open in the exact circumstance that matters:
 * a check whose table or column was missing recorded `SKIPPED` and was then
 * excluded from the blocking count, and checks skip precisely when the database
 * is behind on migrations -- i.e. at deployment time.
 *
 * The rule these tests defend is:
 *
 *     A gate that cannot prove a condition is safe must not report success.
 *
 * These tests inject a fake query executor, so they exercise the real blocking
 * policy with no database engine and no Prisma client.
 */

const ALL_TABLES = new Set(['coordinator_profile', 'user', 'nstp_component']);
const ALL_COLUMNS = new Set([
  'coordinator_profile.userId',
  'coordinator_profile.componentId',
  'user.role',
  'nstp_component.type',
]);

function check(overrides = {}) {
  return {
    name: 'example_check',
    severity: SEVERITY.BLOCKER,
    description: 'example',
    tables: ['coordinator_profile'],
    columns: ['coordinator_profile.userId'],
    sql: 'SELECT "id" FROM "coordinator_profile"',
    ...overrides,
  };
}

const noRows = async () => [];
const someRows = (total, shown = Math.min(total, 100)) => async () =>
  Array.from({ length: shown }, (_, index) => ({ id: `row-${index}`, __total: total }));

test('BLOCKER + CLEAR exits 0', async () => {
  const report = await runPreflightChecks({
    checks: [check()],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: noRows,
  });

  assert.equal(report.results[0].status, CHECK_STATUS.CLEAR);
  assert.equal(report.blockingCount, 0);
  assert.equal(report.exitCode, 0);
});

test('BLOCKER + FOUND exits non-zero', async () => {
  const report = await runPreflightChecks({
    checks: [check()],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: someRows(3),
  });

  assert.equal(report.results[0].status, CHECK_STATUS.FOUND);
  assert.equal(report.results[0].totalCount, 3);
  assert.equal(report.blockingCount, 1);
  assert.notEqual(report.exitCode, 0);
});

test('BLOCKER + SKIPPED exits non-zero and is not disguised as a finding', async () => {
  const report = await runPreflightChecks({
    checks: [check({ tables: ['table_that_does_not_exist'] })],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: async () => {
      throw new Error('a skipped check must never reach the database');
    },
  });

  const [result] = report.results;
  assert.equal(result.status, CHECK_STATUS.SKIPPED);
  // Fail closed, but stay honest: a check that did not run is not a finding.
  assert.notEqual(report.exitCode, 0, 'a BLOCKER that could not run must block the deployment');
  assert.equal(report.statusCounts.FOUND, 0, 'a skip must not be reported as a finding');
  assert.deepEqual(result.missing, ['table:table_that_does_not_exist']);
  assert.match(report.blockingReasons[0], /proves nothing/i);
});

test('REVIEW + FOUND is reported but does not block', async () => {
  const report = await runPreflightChecks({
    checks: [check({ severity: SEVERITY.REVIEW })],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: someRows(7),
  });

  assert.equal(report.results[0].status, CHECK_STATUS.FOUND);
  assert.equal(report.statusCounts.FOUND, 1, 'the finding is still reported to the operator');
  assert.equal(report.blockingCount, 0);
  assert.equal(report.exitCode, 0);
});

test('REVIEW + SKIPPED is reported but does not block', async () => {
  const report = await runPreflightChecks({
    checks: [check({ severity: SEVERITY.REVIEW, tables: ['absent_table'] })],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: noRows,
  });

  assert.equal(report.results[0].status, CHECK_STATUS.SKIPPED);
  assert.equal(report.exitCode, 0);
});

test('a query error blocks even for a REVIEW check', async () => {
  const report = await runPreflightChecks({
    checks: [check({ severity: SEVERITY.REVIEW })],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: async () => {
      throw Object.assign(new Error('connection terminated unexpectedly'), { code: '08006' });
    },
  });

  // A gate that crashed has verified nothing, whatever its severity.
  assert.equal(report.results[0].status, CHECK_STATUS.ERROR);
  assert.notEqual(report.exitCode, 0);
  assert.match(report.results[0].error, /08006/);
});

test('one failing check does not prevent the others from running', async () => {
  let calls = 0;
  const report = await runPreflightChecks({
    checks: [check({ name: 'first' }), check({ name: 'second' }), check({ name: 'third' })],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return [];
    },
  });

  assert.equal(calls, 3, 'every check is attempted so the operator sees the full picture');
  assert.deepEqual(
    report.results.map((result) => result.status),
    [CHECK_STATUS.ERROR, CHECK_STATUS.CLEAR, CHECK_STATUS.CLEAR],
  );
  assert.notEqual(report.exitCode, 0);
});

test('a missing column is recorded as precisely as a missing table', async () => {
  const report = await runPreflightChecks({
    checks: [check({ columns: ['coordinator_profile.columnThatDoesNotExist'] })],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: noRows,
  });

  assert.deepEqual(report.results[0].missing, ['column:coordinator_profile.columnThatDoesNotExist']);
  assert.notEqual(report.exitCode, 0);
});

test('an empty database is treated as bootstrap, so skips do not block', async () => {
  const report = await runPreflightChecks({
    checks: [check()],
    tables: new Set(),
    columns: new Set(),
    runQuery: noRows,
  });

  // A database with no tables has never been migrated and cannot hold bad data.
  // This is the only circumstance in which a skipped BLOCKER is acceptable, and
  // it is what lets CI apply migrations to a fresh service database.
  assert.equal(report.bootstrap, true);
  assert.equal(report.results[0].status, CHECK_STATUS.SKIPPED);
  assert.equal(report.exitCode, 0);
});

test('a database with even one table is no longer bootstrap', async () => {
  assert.equal(isBootstrapDatabase(new Set()), true);
  assert.equal(isBootstrapDatabase(new Set(['user'])), false);

  const report = await runPreflightChecks({
    checks: [check({ tables: ['coordinator_profile'] })],
    tables: new Set(['user']),
    columns: new Set(),
    runQuery: noRows,
  });

  assert.equal(report.bootstrap, false);
  assert.notEqual(report.exitCode, 0, 'a partially migrated database must not skip silently');
});

test('reported totals are accurate beyond the sample limit', async () => {
  const report = await runPreflightChecks({
    checks: [check()],
    tables: ALL_TABLES,
    columns: ALL_COLUMNS,
    runQuery: someRows(125_000, 100),
  });

  const [result] = report.results;
  // The previous implementation reported sample.length, so 125,000 orphan rows
  // and 100 orphan rows were indistinguishable in the report.
  assert.equal(result.totalCount, 125_000);
  assert.equal(result.sampleIds.length, 100);
  assert.equal(result.truncated, true);
});

test('the sampled query keeps COUNT(*) OVER() outside the LIMIT', () => {
  const sql = buildSampledQuery('SELECT "id" FROM "coordinator_profile"', 100);
  const overIndex = sql.indexOf('COUNT(*) OVER()');
  const limitIndex = sql.lastIndexOf('LIMIT');
  assert.ok(overIndex >= 0 && limitIndex > overIndex, 'the window function must precede the LIMIT');
});

test('check bodies carry no LIMIT of their own', () => {
  // The runner adds the limit. A LIMIT inside a check body would silently cap
  // the window-function total and reintroduce the saturating-count bug.
  for (const production of PRODUCTION_CHECKS) {
    assert.doesNotMatch(production.sql, /\bLIMIT\b/i, `${production.name} must not embed a LIMIT`);
  }
});

test('preflight covers the two dangling coordinator relationships the migration aborts on', () => {
  const names = PRODUCTION_CHECKS.map((production) => production.name);
  // These mirror Guard 0 of 20260824120000_require_explicit_coordinator_scope.
  // Preflight must surface both conditions before the migration hits them.
  assert.ok(names.includes('orphan_coordinator_profiles'), 'orphan userId check missing');
  assert.ok(
    names.includes('dangling_coordinator_component_references'),
    'dangling componentId check missing',
  );

  for (const name of ['orphan_coordinator_profiles', 'dangling_coordinator_component_references']) {
    const production = PRODUCTION_CHECKS.find((candidate) => candidate.name === name);
    assert.equal(production.severity, SEVERITY.BLOCKER, `${name} must be a BLOCKER`);
  }
});

test('no production check maps an unrecognised component type to a default scope', () => {
  // An open-ended `ELSE 'CWTS'` in authorization-related data transformation is
  // exactly the defaulting bug this release exists to remove.
  for (const production of PRODUCTION_CHECKS) {
    assert.doesNotMatch(
      production.sql,
      /ELSE\s+'CWTS'/i,
      `${production.name} must not fall back to CWTS`,
    );
  }
});

test('preflight samples expose identifiers only', () => {
  // Deployment reports get pasted into tickets and chat. They must not carry
  // names, email addresses, titles, or grades.
  for (const production of PRODUCTION_CHECKS) {
    const selected = production.sql.slice(0, production.sql.search(/\bFROM\b/i));
    assert.doesNotMatch(
      selected,
      /"(email|firstName|lastName|middleName|title|passwordHash|score|percentGrade)"/i,
      `${production.name} selects a PII or grade column`,
    );
  }
});

test('orphan gate blocks when a relationship cannot be verified', async () => {
  const relationship = FOREIGN_KEY_RELATIONSHIPS.find(
    (candidate) => candidate.name === 'coordinator_profile.userId -> user.id',
  );

  const report = await runOrphanChecks({
    relationships: [relationship],
    reviews: [],
    tables: new Set(['coordinator_profile']), // parent table absent
    columns: new Set(['coordinator_profile.userId']),
    runQuery: async () => {
      throw new Error('must not run');
    },
  });

  // The previous implementation dropped this case with a bare `continue`, so it
  // did not even appear in skippedChecks.
  assert.equal(report.results[0].status, CHECK_STATUS.SKIPPED);
  assert.deepEqual(report.results[0].missing, ['table:user']);
  assert.equal(report.skippedChecks.length, 1, 'the skip is recorded, not swallowed');
  assert.notEqual(report.exitCode, 0);
});

test('orphan gate never reports empty findings for checks that did not execute', async () => {
  const report = await runOrphanChecks({
    relationships: FOREIGN_KEY_RELATIONSHIPS.slice(0, 5),
    reviews: [],
    tables: new Set(['user']), // almost everything is missing
    columns: new Set(),
    runQuery: async () => [],
  });

  assert.deepEqual(report.findings, []);
  // ...but the run is emphatically not clean, and the exit code says so.
  assert.ok(report.skippedChecks.length > 0);
  assert.notEqual(report.exitCode, 0);
  assert.ok(report.blockingReasons.length > 0);
});

test('orphan findings report the true row count, not the sample size', async () => {
  const relationship = FOREIGN_KEY_RELATIONSHIPS.find(
    (candidate) => candidate.name === 'grade.studentId -> student_profile.id',
  );

  const report = await runOrphanChecks({
    relationships: [relationship],
    reviews: [],
    tables: new Set(['grade', 'student_profile']),
    columns: new Set(['grade.studentId']),
    runQuery: async () =>
      Array.from({ length: 100 }, (_, index) => ({
        id: `grade-${index}`,
        danglingValue: 'missing-student',
        __total: 125_000,
      })),
  });

  const [result] = report.results;
  assert.equal(result.totalCount, 125_000);
  assert.equal(result.sample.length, 100);
  assert.equal(result.truncated, true);
  assert.notEqual(report.exitCode, 0);
});

test('orphan samples carry only the id and the dangling key value', async () => {
  const relationship = FOREIGN_KEY_RELATIONSHIPS.find(
    (candidate) => candidate.name === 'coordinator_profile.userId -> user.id',
  );

  const report = await runOrphanChecks({
    relationships: [relationship],
    reviews: [],
    tables: new Set(['coordinator_profile', 'user']),
    columns: new Set(['coordinator_profile.userId']),
    runQuery: async () => [
      { id: 'p1', danglingValue: 'u9', __total: 1, email: 'leaked@example.com', title: 'leaked' },
    ],
  });

  assert.deepEqual(report.results[0].sample, [{ id: 'p1', danglingValue: 'u9' }]);
});

test('every foreign-key relationship is a BLOCKER', () => {
  for (const relationship of FOREIGN_KEY_RELATIONSHIPS) {
    assert.equal(relationship.severity, SEVERITY.BLOCKER, `${relationship.name} must block`);
  }
});

test('the blocking policy itself is exhaustive over status and severity', () => {
  const expectations = [
    [SEVERITY.BLOCKER, CHECK_STATUS.CLEAR, false],
    [SEVERITY.BLOCKER, CHECK_STATUS.FOUND, true],
    [SEVERITY.BLOCKER, CHECK_STATUS.SKIPPED, true],
    [SEVERITY.BLOCKER, CHECK_STATUS.ERROR, true],
    [SEVERITY.REVIEW, CHECK_STATUS.CLEAR, false],
    [SEVERITY.REVIEW, CHECK_STATUS.FOUND, false],
    [SEVERITY.REVIEW, CHECK_STATUS.SKIPPED, false],
    [SEVERITY.REVIEW, CHECK_STATUS.ERROR, true],
  ];

  for (const [severity, status, blocks] of expectations) {
    assert.equal(
      isBlocking({ name: 'x', severity, status }),
      blocks,
      `${severity} + ${status} should ${blocks ? '' : 'not '}block`,
    );
  }
});

test('summarize counts every status and derives the exit code from blocking alone', () => {
  const summary = summarize([
    { name: 'a', severity: SEVERITY.BLOCKER, status: CHECK_STATUS.CLEAR },
    { name: 'b', severity: SEVERITY.REVIEW, status: CHECK_STATUS.FOUND, totalCount: 2 },
    { name: 'c', severity: SEVERITY.BLOCKER, status: CHECK_STATUS.SKIPPED, missing: ['table:x'] },
  ]);

  assert.deepEqual(summary.statusCounts, { CLEAR: 1, FOUND: 1, SKIPPED: 1, ERROR: 0 });
  assert.equal(summary.blockingCount, 1);
  assert.equal(summary.exitCode, 1);
});

test('missingRequirements distinguishes tables from columns', () => {
  const missing = missingRequirements(
    { tables: ['present', 'absent'], columns: ['present.here', 'present.gone'] },
    new Set(['present']),
    new Set(['present.here']),
  );

  assert.deepEqual(missing, ['table:absent', 'column:present.gone']);
});

// ---------------------------------------------------------------------------
// The legacy facilitator checks
//
// These previously lived in test/staff-scope.test.js as `includes()` assertions
// against the source of scripts/preflight-production.mjs. When the check
// definitions were extracted into scripts/lib/preflight-checks.mjs the strings
// moved with them and the assertions started failing while the behaviour was
// entirely intact -- they had been testing file layout, not conduct. Asserted
// here against the real definitions instead.
// ---------------------------------------------------------------------------

const production = (name) => PRODUCTION_CHECKS.find((entry) => entry.name === name);

test('a facilitator carrying an unknown component name is a BLOCKER', async () => {
  const check = production('legacy_facilitator_component_metadata_invalid');
  assert.ok(check, 'legacy_facilitator_component_metadata_invalid must be a production check');
  assert.equal(check.severity, SEVERITY.BLOCKER);

  // The closed label set is the point of the check. An open-ended comparison
  // would let an unrecognised component name through, and the migration would
  // then have no authoritative program for that facilitator.
  assert.match(
    check.sql,
    /NOT IN\s*\(\s*'CWTS',\s*'LTS',\s*'MTS \(Army\)',\s*'MTS \(Navy\)',\s*'CWTS \(Coast Guard\)'\s*\)/,
  );

  // And it must actually block, not merely be labelled BLOCKER.
  const report = await runPreflightChecks({
    checks: [check],
    tables: new Set(check.tables),
    columns: new Set(check.columns),
    runQuery: someRows(3),
  });

  assert.equal(report.results[0].status, CHECK_STATUS.FOUND);
  assert.equal(report.results[0].totalCount, 3);
  assert.equal(report.exitCode, 1);
});

test('ambiguous facilitator ownership is REVIEW, and does not by itself block', async () => {
  // Deliberately not a BLOCKER: zero or multiple candidate coordinators is a
  // data-modelling question for an operator, not proof that the migration would
  // grant the wrong scope. Pinned so the distinction is not lost to a later edit.
  const check = production('legacy_facilitator_ownership_not_unique');
  assert.ok(check, 'legacy_facilitator_ownership_not_unique must be a production check');
  assert.equal(check.severity, SEVERITY.REVIEW);

  const report = await runPreflightChecks({
    checks: [check],
    tables: new Set(check.tables),
    columns: new Set(check.columns),
    runQuery: someRows(2),
  });

  assert.equal(report.results[0].status, CHECK_STATUS.FOUND);
  assert.equal(report.blockingCount, 0);
  assert.equal(report.exitCode, 0);
});

// ---------------------------------------------------------------------------
// Orphan reporting against a schema that is behind on migrations
// ---------------------------------------------------------------------------

test('a relationship whose column is not yet deployed is skipped without being queried', async () => {
  // The pre-migration case: report:orphans runs before `migrate deploy`, so a
  // relationship added by a pending migration does not exist yet. Querying it
  // would raise a SQL error and be reported as ERROR, which is indistinguishable
  // from a real failure. It must skip -- and skipping must still block, because a
  // relationship that could not be verified is not a relationship known to be clean.
  const relationship = {
    name: 'coordinator_profile.componentId -> nstp_component',
    child: 'coordinator_profile',
    column: 'componentId',
    parent: 'nstp_component',
    severity: SEVERITY.BLOCKER,
  };

  const report = await runOrphanChecks({
    relationships: [relationship],
    reviews: [],
    tables: new Set(['coordinator_profile', 'nstp_component']),
    columns: new Set(['coordinator_profile.userId']), // componentId not deployed yet
    runQuery: async () => {
      throw new Error('a skipped relationship must never reach the database');
    },
  });

  assert.equal(report.results[0].status, CHECK_STATUS.SKIPPED);
  assert.deepEqual(report.results[0].missing, ['column:coordinator_profile.componentId']);
  assert.match(report.results[0].reason, /absent from the current schema/i);
  assert.equal(report.exitCode, 1);
});

test('every declared foreign-key relationship is verified once the schema is present', async () => {
  // The complement of the case above: with the full schema, nothing is skipped.
  // Guards against a requirement typo permanently skipping a relationship, which
  // would read as a clean gate run.
  const tables = new Set(FOREIGN_KEY_RELATIONSHIPS.flatMap((r) => [r.child, r.parent]));
  const columns = new Set(FOREIGN_KEY_RELATIONSHIPS.map((r) => `${r.child}.${r.column}`));

  const report = await runOrphanChecks({
    relationships: FOREIGN_KEY_RELATIONSHIPS,
    reviews: [],
    tables,
    columns,
    runQuery: noRows,
  });

  assert.equal(report.results.length, FOREIGN_KEY_RELATIONSHIPS.length);
  assert.deepEqual(
    report.results.filter((result) => result.status !== CHECK_STATUS.CLEAR),
    [],
  );
  assert.equal(report.exitCode, 0);
});
