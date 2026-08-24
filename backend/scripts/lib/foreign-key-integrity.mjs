// Physical foreign-key verification, checked against the PostgreSQL catalog
// rather than against migration history.
//
// WHY THIS EXISTS
//
// schema.prisma does not set `relationMode`, so it defaults to "foreignKeys" on
// PostgreSQL. That means every `onDelete:` action declared in the schema is
// enforced by the database, not emulated by the Prisma client. A declared
// `onDelete: Cascade` whose physical constraint is absent is therefore inert:
// the application believes deleting a user removes their coordinator_profile,
// and nothing does.
//
// `prisma migrate status` cannot detect this. It compares the _prisma_migrations
// ledger against the migrations directory and reports "applied" for a migration
// whose DDL is no longer reflected in the schema. This repository contains
// direct evidence that the situation is real rather than theoretical:
// 20260802130000_restore_postgres_foreign_keys exists solely because these
// constraints went missing once already, and
// 20260803170000_repair_coordinator_role_enum repairs another silently-lost DDL
// change.
//
// So the only trustworthy source for "is this cascade real?" is pg_constraint.
//
// WHY THIS RUNS AFTER `prisma migrate deploy` AND NOT IN PREFLIGHT
//
// Preflight runs before migrations apply, where the correct expectation is "the
// foreign-key state as of the last applied migration". Establishing that would
// require trusting _prisma_migrations -- exactly what this check exists to avoid
// -- and a completeness check run pre-migration would raise a false blocker on
// any future release that adds a foreign key. Immediately after deploy, the
// expected state is unambiguous: it is the state this revision's migrations
// describe, which is the list below. A missing constraint at that point is
// always a defect.
//
// This gate cannot prevent a bad migration from applying; it runs too late for
// that. What it does is refuse to let a deployment be *reported* as successful
// when the schema is not what the application's authorization logic assumes.
// See MIGRATION_OPERATIONS.md for the manual form of these queries and for the
// recovery path when it fires.

import { CHECK_STATUS, SEVERITY, SAMPLE_LIMIT, summarize } from './release-gate.mjs';

// pg_constraint.confdeltype codes. Kept as the single translation table so the
// generated SQL and the operator-facing report cannot disagree about what 'n'
// means.
export const ON_DELETE_ACTIONS = Object.freeze({
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
});

// [childTable, childColumn, parentTable, expectedConfdeltype]
//
// Derived by replaying every prisma/migrations/*/migration.sql in order and
// tracking ADD CONSTRAINT / DROP CONSTRAINT: 38 foreign keys are added and all
// 38 are still present at head. The set matches FOREIGN_KEY_RELATIONSHIPS in
// orphan-checks.mjs exactly -- test/foreign-key-integrity.test.js asserts that
// the two lists stay in agreement, so neither can drift alone.
//
// The ON DELETE actions are the load-bearing part. `c` (CASCADE) on
// coordinator_profile.userId is what makes deleting a coordinator account remove
// their scope grant; if that degraded to `a` (NO ACTION) the delete would fail,
// and if the constraint vanished the profile would survive its user as an
// unreachable grant.
export const EXPECTED_FOREIGN_KEYS = Object.freeze([
  ['assignment',          'moduleId',           'module',              'c'],
  ['coordinator_profile', 'componentId',        'nstp_component',      'n'],
  ['coordinator_profile', 'userId',             'user',                'c'],
  ['enrollment',          'componentId',        'nstp_component',      'r'],
  ['enrollment',          'sectionId',          'section',             'n'],
  ['enrollment',          'studentId',          'student_profile',     'c'],
  ['exam',                'moduleId',           'module',              'n'],
  ['follow',              'followerId',         'user',                'c'],
  ['follow',              'targetUserId',       'user',                'c'],
  ['grade',               'assignmentId',       'assignment',          'n'],
  ['grade',               'componentId',        'nstp_component',      'n'],
  ['grade',               'examId',             'exam',                'n'],
  ['grade',               'moduleId',           'module',              'n'],
  ['grade',               'quizId',             'quiz',                'n'],
  ['grade',               'studentId',          'student_profile',     'c'],
  ['instructor_profile',  'componentId',        'nstp_component',      'n'],
  ['instructor_profile',  'coordinatorId',      'coordinator_profile', 'n'],
  ['instructor_profile',  'userId',             'user',                'c'],
  ['lesson',              'moduleId',           'module',              'c'],
  ['module',              'componentId',        'nstp_component',      'n'],
  ['module',              'instructorId',       'instructor_profile',  'n'],
  ['module_progress',     'moduleId',           'module',              'c'],
  ['module_progress',     'studentId',          'student_profile',     'c'],
  ['payment',             'targetEnrollmentId', 'enrollment',          'r'],
  ['payment',             'userId',             'user',                'r'],
  ['question',            'examId',             'exam',                'c'],
  ['question',            'quizId',             'quiz',                'c'],
  ['quiz',                'moduleId',           'module',              'c'],
  ['section',             'componentId',        'nstp_component',      'r'],
  ['section',             'instructorId',       'instructor_profile',  'n'],
  ['student_profile',     'componentId',        'nstp_component',      'n'],
  ['student_profile',     'sectionId',          'section',             'n'],
  ['student_profile',     'userId',             'user',                'c'],
  ['submission',          'assignmentId',       'assignment',          'n'],
  ['submission',          'examId',             'exam',                'n'],
  ['submission',          'lessonId',           'lesson',              'n'],
  ['submission',          'quizId',             'quiz',                'n'],
  ['submission',          'studentId',          'student_profile',     'c'],
]);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The expectation list is interpolated into SQL as string literals. Every value
// is a schema identifier and none should ever need quoting or escaping, so a
// value that does not look like one is a mistake -- and interpolating it anyway
// would be an injection point in a script that runs against production.
//
// Exported so the guard itself is testable. Validating the shipped list proves
// only that today's data is clean; it does not prove the check would reject a bad
// entry added later, and that is the property worth having.
export function assertExpectationsAreSafe(entries) {
  for (const [child, column, parent, onDelete] of entries) {
    for (const identifier of [child, column, parent]) {
      if (typeof identifier !== 'string' || !IDENTIFIER.test(identifier)) {
        throw new Error(
          `EXPECTED_FOREIGN_KEYS contains a value that is not a bare identifier: ${JSON.stringify(identifier)}`,
        );
      }
    }
    if (!(onDelete in ON_DELETE_ACTIONS)) {
      throw new Error(
        `EXPECTED_FOREIGN_KEYS: ${child}.${column} declares unknown ON DELETE code ${JSON.stringify(onDelete)}`,
      );
    }
  }
  return entries;
}

// Fail at import time rather than at deployment time.
assertExpectationsAreSafe(EXPECTED_FOREIGN_KEYS);

const unique = (values) => [...new Set(values)].sort();

export const REQUIRED_TABLES = Object.freeze(
  unique(EXPECTED_FOREIGN_KEYS.flatMap(([child, , parent]) => [child, parent])),
);

export const REQUIRED_COLUMNS = Object.freeze(
  unique(EXPECTED_FOREIGN_KEYS.map(([child, column]) => `${child}.${column}`)),
);

function expectedValuesSql() {
  return EXPECTED_FOREIGN_KEYS.map(([child, column, parent, onDelete], index) => {
    const label = ON_DELETE_ACTIONS[onDelete];
    const values = [child, column, parent, onDelete, label];
    // PostgreSQL resolves the column types of a VALUES list from the first row,
    // where bare literals arrive as `unknown` and fail to join against the text
    // columns of the catalog query. Casting the first row is sufficient.
    // Standard CAST syntax rather than `::text` so the same SQL also parses in
    // SQLite, which is what makes the comparison logic testable.
    return index === 0
      ? `(${values.map((value) => `CAST('${value}' AS text)`).join(', ')})`
      : `(${values.map((value) => `'${value}'`).join(', ')})`;
  }).join(',\n      ');
}

// Reads the live foreign-key state out of the PostgreSQL catalog.
//
// Matches on (child table, child column, parent table) rather than on constraint
// name. Prisma names these `<table>_<column>_fkey` and all 38 currently follow
// that convention, but a hand-written repair migration is free to choose another
// name; what must hold is the relationship and its ON DELETE action, not the
// label. Reporting stays name-free for the same reason.
//
// conkey[1] with array_length = 1 restricts this to single-column keys, which is
// all 38 of them. A composite key would be a schema change large enough to
// require revisiting this list, so it is left out rather than silently
// half-matched.
export const CATALOG_SOURCE_SQL = `SELECT
      child_table."relname"::text AS child,
      child_column."attname"::text AS "column",
      parent_table."relname"::text AS parent,
      fk."confdeltype"::text AS on_delete
    FROM "pg_constraint" fk
    JOIN "pg_class" child_table ON child_table."oid" = fk."conrelid"
    JOIN "pg_class" parent_table ON parent_table."oid" = fk."confrelid"
    JOIN "pg_namespace" child_schema ON child_schema."oid" = child_table."relnamespace"
    JOIN "pg_attribute" child_column
      ON child_column."attrelid" = child_table."oid"
     AND child_column."attnum" = fk."conkey"[1]
    WHERE fk."contype" = 'f'
      AND array_length(fk."conkey", 1) = 1
      AND child_schema."nspname" = ANY (current_schemas(false))`;

// `source` exists so the comparison logic below -- the LEFT JOIN and the
// `<>` test that together decide what counts as a defect -- can be executed in
// tests against a synthetic catalog. There is no PostgreSQL server in the test
// environment, and pg_constraint cannot be faked, but the part of this query most
// likely to be subtly wrong is the comparison rather than the catalog read. The
// production default is CATALOG_SOURCE_SQL; test/foreign-key-integrity.test.js
// separately asserts that the default reads pg_constraint with the guards above.
export function buildForeignKeyIntegritySql({ source = CATALOG_SOURCE_SQL } = {}) {
  return `WITH expected(child, "column", parent, on_delete, on_delete_label) AS (
    VALUES
      ${expectedValuesSql()}
  ), actual AS (
    ${source}
  )
  SELECT expected.child || '.' || expected."column" || ' -> ' || expected.parent || ': ' ||
    CASE
      WHEN actual.child IS NULL
        THEN 'no physical foreign key (expected ON DELETE ' || expected.on_delete_label || ')'
      ELSE 'ON DELETE ' || CASE actual.on_delete
          WHEN 'a' THEN 'NO ACTION'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
          ELSE 'unrecognised catalog code ' || actual.on_delete
        END || ', expected ON DELETE ' || expected.on_delete_label
    END AS "id"
  FROM expected
  LEFT JOIN actual
    ON actual.child = expected.child
   AND actual."column" = expected."column"
   AND actual.parent = expected.parent
  WHERE actual.child IS NULL
     OR actual.on_delete <> expected.on_delete`;
}

// Shaped like a preflight check so it runs through the same runner and the same
// blocking policy: a BLOCKER that cannot execute blocks, and an error blocks.
export const FOREIGN_KEY_INTEGRITY_CHECK = Object.freeze({
  name: 'physical_foreign_keys_match_schema',
  severity: SEVERITY.BLOCKER,
  description:
    'Every foreign key declared by the Prisma schema is physically present in pg_constraint with the declared ON DELETE action. Verified against the catalog, not against _prisma_migrations, because a migration can be recorded as applied while its DDL is absent.',
  tables: REQUIRED_TABLES,
  columns: REQUIRED_COLUMNS,
  sql: buildForeignKeyIntegritySql(),
});

// Applies the one policy difference between this gate and preflight.
//
// Preflight treats an empty database as a legitimate bootstrap: it has never been
// migrated, so it cannot hold bad data and skipped checks do not block. After
// `prisma migrate deploy` that reasoning inverts. An empty database at this point
// means the deploy did not apply the schema it reported applying, and the gate
// verified nothing. Reporting success there would be the same fail-open shape
// this release exists to remove.
//
// Separated from scripts/verify-schema.mjs so it is testable: that file imports
// @prisma/client and cannot run without a database engine.
export function applyPostDeployPolicy(report) {
  if (!report.bootstrap) {
    return { ...report, bootstrapAfterDeploy: false };
  }

  return {
    ...report,
    bootstrap: true,
    bootstrapAfterDeploy: true,
    bootstrapNote:
      'Database contains no tables AFTER migrate deploy. The deployment did not apply the schema it reported applying.',
    blockingCount: 1,
    blockingReasons: ['verify-schema: no tables exist after migrate deploy; nothing was verified.'],
    exitCode: 1,
  };
}

export { CHECK_STATUS, SEVERITY, summarize, SAMPLE_LIMIT };
