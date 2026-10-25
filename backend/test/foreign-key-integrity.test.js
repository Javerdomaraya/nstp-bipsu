import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import {
  CATALOG_SOURCE_SQL,
  EXPECTED_FOREIGN_KEYS,
  FOREIGN_KEY_INTEGRITY_CHECK,
  ON_DELETE_ACTIONS,
  REQUIRED_COLUMNS,
  REQUIRED_TABLES,
  applyPostDeployPolicy,
  assertExpectationsAreSafe,
  buildForeignKeyIntegritySql,
} from '../scripts/lib/foreign-key-integrity.mjs';
import { FOREIGN_KEY_RELATIONSHIPS } from '../scripts/lib/orphan-checks.mjs';
import { runPreflightChecks } from '../scripts/lib/preflight-checks.mjs';
import { SEVERITY } from '../scripts/lib/release-gate.mjs';

/**
 * Physical foreign-key verification.
 *
 * schema.prisma leaves `relationMode` at its default of "foreignKeys", so every
 * declared `onDelete:` action is enforced by PostgreSQL rather than emulated by
 * the client. A declared cascade whose constraint is missing is therefore inert,
 * and `prisma migrate status` still reports the migration as applied. This
 * repository has already needed 20260802130000_restore_postgres_foreign_keys to
 * recover from exactly that, which is why the check reads pg_constraint.
 *
 * Two layers, because neither is sufficient alone:
 *
 *  - Structural tests pin the expectation list and the catalog query. They are
 *    the only way to assert things about SQL that cannot run here.
 *  - Behavioural tests execute the comparison logic in SQLite against a
 *    synthetic catalog, injected through `buildForeignKeyIntegritySql({source})`.
 *    pg_constraint cannot be faked, but the LEFT JOIN and the `<>` test that
 *    decide what counts as a defect are the parts most likely to be subtly
 *    wrong, and those are engine-independent.
 */

const key = (child, column, parent) => `${child}.${column} -> ${parent}`;

// ---------------------------------------------------------------------------
// Structure: the expectation list and the catalog query
// ---------------------------------------------------------------------------

test('the expectation list and the orphan gate describe the same relationships', () => {
  // Two lists of foreign keys in one repository will drift unless something
  // holds them together. orphan-checks.mjs verifies the *data* obeys each
  // relationship; this module verifies the *constraint* implementing it exists.
  // A relationship missing from either side is a gap in coverage.
  const expected = new Set(EXPECTED_FOREIGN_KEYS.map(([c, col, p]) => key(c, col, p)));
  const declared = new Set(
    FOREIGN_KEY_RELATIONSHIPS.map((relationship) =>
      key(relationship.child, relationship.column, relationship.parent),
    ),
  );

  assert.deepEqual(
    [...declared].filter((relationship) => !expected.has(relationship)),
    [],
    'relationship checked for orphans but never verified to have a physical foreign key',
  );
  assert.deepEqual(
    [...expected].filter((relationship) => !declared.has(relationship)),
    [],
    'foreign key expected to exist but its data is never checked for orphans',
  );
  assert.equal(expected.size, EXPECTED_FOREIGN_KEYS.length);

  // Named-constraint checks
  assert.ok(expected.has('qualifying_exam_attempt.userId -> user'), 'qualifying_exam_attempt.userId -> user must exist');
  assert.ok(expected.has('qualifying_exam_attempt.examId -> exam'), 'qualifying_exam_attempt.examId -> exam must exist');
  assert.ok(expected.has('coordinator_profile.userId -> user'), 'coordinator_profile.userId -> user must exist');
  assert.ok(expected.has('coordinator_profile.componentId -> nstp_component'), 'coordinator_profile.componentId -> nstp_component must exist');
  assert.ok(expected.has('student_profile.userId -> user'), 'student_profile.userId -> user must exist');
  assert.ok(expected.has('enrollment.studentId -> student_profile'), 'enrollment.studentId -> student_profile must exist');
  assert.ok(expected.has('submission.studentId -> student_profile'), 'submission.studentId -> student_profile must exist');
});

test('the qualifying exam attempt foreign keys are pinned explicitly with correct ON DELETE actions', () => {
  const find = (child, column) =>
    EXPECTED_FOREIGN_KEYS.find(([c, col]) => c === child && col === column);

  assert.deepEqual(find('qualifying_exam_attempt', 'userId'), [
    'qualifying_exam_attempt',
    'userId',
    'user',
    'c',
  ]);
  assert.deepEqual(find('qualifying_exam_attempt', 'examId'), [
    'qualifying_exam_attempt',
    'examId',
    'exam',
    'n',
  ]);
});

test('the two authorization-critical coordinator keys are pinned explicitly', () => {
  // These two carry the coordinator scope grant, so their ON DELETE actions are
  // the ones with security consequences. Deleting a coordinator account must
  // remove the grant (CASCADE); deleting a component must not (SET NULL), or the
  // grant would disappear along with it.
  const find = (child, column) =>
    EXPECTED_FOREIGN_KEYS.find(([c, col]) => c === child && col === column);

  assert.deepEqual(find('coordinator_profile', 'userId'), [
    'coordinator_profile',
    'userId',
    'user',
    'c',
  ]);
  assert.deepEqual(find('coordinator_profile', 'componentId'), [
    'coordinator_profile',
    'componentId',
    'nstp_component',
    'n',
  ]);
});

test('every expectation names a known ON DELETE action', () => {
  for (const [child, column, , onDelete] of EXPECTED_FOREIGN_KEYS) {
    assert.ok(
      onDelete in ON_DELETE_ACTIONS,
      `${child}.${column} declares unknown confdeltype '${onDelete}'`,
    );
  }
});

test('the check is a BLOCKER and requires the schema it inspects', () => {
  assert.equal(FOREIGN_KEY_INTEGRITY_CHECK.severity, SEVERITY.BLOCKER);
  // Requiring the tables makes a partially-migrated database skip, and a skipped
  // BLOCKER blocks. Without this the check would run against a half-built schema
  // and report every absent table as a missing foreign key.
  assert.equal(REQUIRED_TABLES.length, new Set(EXPECTED_FOREIGN_KEYS.flatMap(([c, , p]) => [c, p])).size);
  assert.equal(REQUIRED_COLUMNS.length, EXPECTED_FOREIGN_KEYS.length);
  assert.deepEqual(FOREIGN_KEY_INTEGRITY_CHECK.tables, REQUIRED_TABLES);
  assert.deepEqual(FOREIGN_KEY_INTEGRITY_CHECK.columns, REQUIRED_COLUMNS);
  assert.ok(REQUIRED_TABLES.includes('coordinator_profile'));
  assert.ok(REQUIRED_COLUMNS.includes('coordinator_profile.userId'));
  assert.ok(REQUIRED_TABLES.includes('qualifying_exam_attempt'));
  assert.ok(REQUIRED_COLUMNS.includes('qualifying_exam_attempt.userId'));
  assert.ok(REQUIRED_COLUMNS.includes('qualifying_exam_attempt.examId'));
});

test('the check body carries no LIMIT of its own', () => {
  // The runner adds the limit; an embedded one would cap COUNT(*) OVER() and
  // understate how many foreign keys are broken.
  assert.doesNotMatch(FOREIGN_KEY_INTEGRITY_CHECK.sql, /\bLIMIT\b/i);
});

test('the production query reads the catalog, not migration history', () => {
  const sql = FOREIGN_KEY_INTEGRITY_CHECK.sql;

  assert.match(sql, /pg_constraint/, 'must read pg_constraint');
  assert.doesNotMatch(
    sql,
    /_prisma_migrations/,
    'the ledger is the thing this check exists not to trust',
  );
  // Without contype='f' the query would also match primary keys and unique
  // constraints, whose confdeltype is a blank code, producing 38 false defects.
  assert.match(sql, /"contype"\s*=\s*'f'/);
  assert.match(sql, /array_length\(fk\."conkey",\s*1\)\s*=\s*1/);
  // Without a schema restriction a same-named table in another schema could
  // satisfy the expectation.
  assert.match(sql, /current_schemas\(false\)/);
  assert.ok(sql.includes(CATALOG_SOURCE_SQL), 'the check must embed the catalog query verbatim');
});

test('the report projects an identifier only, never row data', () => {
  // Deployment output gets pasted into tickets. This check reports schema
  // metadata, so there is nothing to redact -- but assert it, because a future
  // edit that joined a data table to "show which rows are affected" would be a
  // PII leak in a file nobody thinks of as touching user data.
  const selected = FOREIGN_KEY_INTEGRITY_CHECK.sql.slice(
    FOREIGN_KEY_INTEGRITY_CHECK.sql.lastIndexOf('SELECT expected.child'),
  );
  assert.doesNotMatch(selected, /"(email|firstName|lastName|passwordHash|score|data)"/i);
});

test('every interpolated value is a bare identifier', () => {
  const values = EXPECTED_FOREIGN_KEYS.flatMap(([c, col, p]) => [c, col, p]);
  for (const value of values) {
    assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/);
  }
  const tuples = FOREIGN_KEY_INTEGRITY_CHECK.sql.match(/^\s*\('?[A-Za-z]|^\s*\(CAST/gm) ?? [];
  assert.equal(tuples.length, EXPECTED_FOREIGN_KEYS.length, 'one VALUES row per expectation');
});

test('the identifier guard rejects anything that could break out of a SQL literal', () => {
  // The list above is interpolated into SQL that runs against production. The
  // assertion that today's values are clean does not prove a bad entry added
  // later would be refused, so exercise the guard directly.
  const payloads = [
    "user'; DROP TABLE \"user\"; --",
    "user' OR '1'='1",
    'user"',
    'user name',
    'user-name',
    '1user',
    '',
    null,
    undefined,
    42,
  ];

  for (const payload of payloads) {
    assert.throws(
      () => assertExpectationsAreSafe([[payload, 'userId', 'user', 'c']]),
      /not a bare identifier/,
      `${JSON.stringify(payload)} must be refused as a table name`,
    );
    assert.throws(
      () => assertExpectationsAreSafe([['coordinator_profile', payload, 'user', 'c']]),
      /not a bare identifier/,
      `${JSON.stringify(payload)} must be refused as a column name`,
    );
    assert.throws(
      () => assertExpectationsAreSafe([['coordinator_profile', 'userId', payload, 'c']]),
      /not a bare identifier/,
      `${JSON.stringify(payload)} must be refused as a parent table`,
    );
  }

  // An unknown ON DELETE code is equally unusable: it would silently compare
  // against a code PostgreSQL never emits and pass forever.
  for (const code of ['x', 'CASCADE', '', null, 'c;']) {
    assert.throws(
      () => assertExpectationsAreSafe([['coordinator_profile', 'userId', 'user', code]]),
      /unknown ON DELETE code/,
      `${JSON.stringify(code)} must be refused as an ON DELETE code`,
    );
  }

  // And it must still accept the real thing, or the guard is just a rejector.
  assert.doesNotThrow(() => assertExpectationsAreSafe(EXPECTED_FOREIGN_KEYS));
});

// ---------------------------------------------------------------------------
// Behaviour: the comparison logic, executed against a synthetic catalog
// ---------------------------------------------------------------------------

// Runs the real comparison SQL over whatever foreign-key state `mutate` returns.
function findDefects(mutate) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE fk (child TEXT, "column" TEXT, parent TEXT, on_delete TEXT)');

  const insert = db.prepare('INSERT INTO fk VALUES (?, ?, ?, ?)');
  for (const row of mutate(EXPECTED_FOREIGN_KEYS.map((entry) => [...entry]))) {
    insert.run(...row);
  }

  const sql = buildForeignKeyIntegritySql({
    source: 'SELECT child, "column", parent, on_delete FROM fk',
  });
  // node:sqlite returns null-prototype rows; read the column out rather than
  // deep-comparing the row objects.
  return db.prepare(sql).all().map((row) => row.id);
}

const withAction = (child, column, action) => (rows) =>
  rows.map((row) => (row[0] === child && row[1] === column ? [row[0], row[1], row[2], action] : row));

const without = (child, column) => (rows) =>
  rows.filter((row) => !(row[0] === child && row[1] === column));

test('a database whose foreign keys all match reports nothing', () => {
  // The control. If this ever fails, every other case below is meaningless.
  assert.deepEqual(findDefects((rows) => rows), []);
});

test('a missing foreign key is reported with the action it should have had', () => {
  assert.deepEqual(findDefects(without('coordinator_profile', 'userId')), [
    'coordinator_profile.userId -> user: no physical foreign key (expected ON DELETE CASCADE)',
  ]);
});

test('a cascade degraded to NO ACTION is reported', () => {
  // The failure mode with teeth: the constraint exists, `prisma migrate status`
  // is clean, and deleting a coordinator account now errors instead of removing
  // the scope grant.
  assert.deepEqual(findDefects(withAction('coordinator_profile', 'userId', 'a')), [
    'coordinator_profile.userId -> user: ON DELETE NO ACTION, expected ON DELETE CASCADE',
  ]);
});

test('a SET NULL widened to CASCADE is reported', () => {
  // The inverse and more destructive drift: deleting an NSTP component would
  // delete the coordinators scoped to it.
  assert.deepEqual(findDefects(withAction('coordinator_profile', 'componentId', 'c')), [
    'coordinator_profile.componentId -> nstp_component: ON DELETE CASCADE, expected ON DELETE SET NULL',
  ]);
});

test('a foreign key repointed at a different parent does not satisfy the expectation', () => {
  // Reported as absent, which is accurate: no constraint implements
  // coordinator_profile.userId -> user. A constraint does exist on that column,
  // so an operator should expect to find one when they look.
  assert.deepEqual(
    findDefects((rows) =>
      rows.map((row) =>
        row[0] === 'coordinator_profile' && row[1] === 'userId'
          ? [row[0], row[1], 'nstp_component', row[3]]
          : row,
      ),
    ),
    ['coordinator_profile.userId -> user: no physical foreign key (expected ON DELETE CASCADE)'],
  );
});

test('an unrecognised catalog code is surfaced rather than passed over', () => {
  const [defect] = findDefects(withAction('grade', 'studentId', 'z'));
  assert.match(defect, /unrecognised catalog code z/);
  assert.match(defect, /expected ON DELETE CASCADE/);
});

test('an undeclared extra foreign key is not treated as a defect', () => {
  // Deliberate: this gate asserts the schema's declared relationships are real,
  // not that no other constraint exists. An unexpected extra key is a schema
  // review question, not a reason to fail a deployment.
  assert.deepEqual(findDefects((rows) => [...rows, ['user', 'unrelatedId', 'user', 'c']]), []);
});

test('every expected foreign key is reported when none exist', () => {
  // A database where the constraints were never applied -- the
  // 20260802130000_restore_postgres_foreign_keys scenario. All 38, not a subset.
  const defects = findDefects(() => []);
  assert.equal(defects.length, EXPECTED_FOREIGN_KEYS.length);
  assert.ok(defects.every((defect) => defect.includes('no physical foreign key')));
});

// ---------------------------------------------------------------------------
// Post-deploy policy: bootstrap stops being an excuse once migrations have run
// ---------------------------------------------------------------------------

test('an empty database AFTER deploy blocks, unlike in preflight', async () => {
  // Preflight exempts an empty database because it has never been migrated and
  // cannot hold bad data. Reusing that exemption here would mean a deploy that
  // applied nothing at all reported success -- the same fail-open shape this
  // release removes.
  const report = applyPostDeployPolicy(
    await runPreflightChecks({
      checks: [FOREIGN_KEY_INTEGRITY_CHECK],
      tables: new Set(),
      columns: new Set(),
      runQuery: async () => [],
    }),
  );

  assert.equal(report.bootstrapAfterDeploy, true);
  assert.equal(report.exitCode, 1);
  assert.equal(report.blockingCount, 1);
  assert.match(report.blockingReasons[0], /nothing was verified/i);
  // Still honest: a check that did not run is not reported as a finding.
  assert.equal(report.statusCounts.FOUND, 0);
});

test('a partially migrated database blocks rather than skipping quietly', async () => {
  const report = applyPostDeployPolicy(
    await runPreflightChecks({
      checks: [FOREIGN_KEY_INTEGRITY_CHECK],
      tables: new Set(['user']), // migrate deploy stopped part-way
      columns: new Set(),
      runQuery: async () => {
        throw new Error('a skipped check must never reach the database');
      },
    }),
  );

  assert.equal(report.bootstrapAfterDeploy, false);
  assert.equal(report.results[0].status, 'SKIPPED');
  assert.equal(report.exitCode, 1);
});

test('a fully migrated database with intact foreign keys passes', async () => {
  const report = applyPostDeployPolicy(
    await runPreflightChecks({
      checks: [FOREIGN_KEY_INTEGRITY_CHECK],
      tables: new Set(REQUIRED_TABLES),
      columns: new Set(REQUIRED_COLUMNS),
      runQuery: async () => [],
    }),
  );

  assert.equal(report.bootstrapAfterDeploy, false);
  assert.equal(report.results[0].status, 'CLEAR');
  assert.equal(report.exitCode, 0);
});

test('a broken foreign key blocks the deployment report', async () => {
  const report = applyPostDeployPolicy(
    await runPreflightChecks({
      checks: [FOREIGN_KEY_INTEGRITY_CHECK],
      tables: new Set(REQUIRED_TABLES),
      columns: new Set(REQUIRED_COLUMNS),
      runQuery: async () => [
        {
          id: 'coordinator_profile.userId -> user: no physical foreign key (expected ON DELETE CASCADE)',
          __total: 1,
        },
      ],
    }),
  );

  assert.equal(report.results[0].status, 'FOUND');
  assert.equal(report.exitCode, 1);
  assert.match(report.blockingReasons[0], /physical_foreign_keys_match_schema/);
});

test('each expected foreign key is independently detectable', () => {
  // Guards against a comparison that happens to work for the coordinator rows
  // used above but silently ignores some other relationship -- e.g. a join
  // condition that only matches certain column names.
  for (const [child, column, parent] of EXPECTED_FOREIGN_KEYS) {
    const defects = findDefects(without(child, column));
    assert.equal(defects.length, 1, `removing ${key(child, column, parent)} produced no defect`);
    assert.ok(defects[0].startsWith(`${key(child, column, parent)}:`), defects[0]);
  }
});

test('a wrong action on any expected foreign key is independently detectable', () => {
  for (const [child, column, parent, onDelete] of EXPECTED_FOREIGN_KEYS) {
    // Swap to a different valid action so the mutation is always a real change.
    const other = onDelete === 'c' ? 'a' : 'c';
    const defects = findDefects(withAction(child, column, other));
    assert.equal(defects.length, 1, `wrong action on ${key(child, column, parent)} not detected`);
    assert.match(defects[0], new RegExp(`expected ON DELETE ${ON_DELETE_ACTIONS[onDelete]}$`));
  }
});
