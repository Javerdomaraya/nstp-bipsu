import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Guard tests for 20260824120000_require_explicit_coordinator_scope.
 *
 * The migration removes the historical `DEFAULT 'CWTS'` from
 * coordinator_profile.scope and backfills every existing row. Because scope is
 * authorization data, a row that slips through the backfill keeps a CWTS grant it
 * may not be entitled to -- and the account still authenticates, so the wrong
 * grant is live rather than merely broken.
 *
 * Two layers of testing, because neither alone is sufficient:
 *
 *  1. STRUCTURAL. Assertions against the real migration.sql text. These test the
 *     artifact that actually ships, and they are what stops a future edit from
 *     reintroducing an open-ended fallback.
 *
 *  2. BEHAVIOURAL. The guard sequence is transcribed into SQLite and executed
 *     over a scenario matrix. This is a TRANSCRIPTION, not the PL/pgSQL itself --
 *     it proves the guard *logic* is sound and it is what originally caught the
 *     dangling-componentId and orphan-userId defects, but it cannot prove the
 *     PostgreSQL syntax is valid. That proof comes from the migration-smoke job
 *     in CI, which applies the real file to a real PostgreSQL 16 server (see
 *     test/fixtures/coordinator-scope-scenarios.sql).
 */

const MIGRATION_PATH = fileURLToPath(
  new URL(
    '../prisma/migrations/20260824120000_require_explicit_coordinator_scope/migration.sql',
    import.meta.url,
  ),
);
const STAFF_SERVICE_PATH = fileURLToPath(
  new URL('../src/modules/staff/staff.service.js', import.meta.url),
);

const migrationSql = await readFile(MIGRATION_PATH, 'utf8');

/**
 * Removes `--` line comments so structural assertions test executable SQL rather
 * than prose. Without this, commenting out a RAISE EXCEPTION still satisfies a
 * naive /RAISE EXCEPTION/ match, and the file's own explanatory header (which
 * describes the guards in words) can satisfy assertions about them.
 *
 * `--` inside a string literal is not a comment, so quote state is tracked.
 * PostgreSQL escapes a quote by doubling it, which this handles naturally: the
 * second quote of a '' pair simply re-opens the string.
 */
function stripSqlComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      let inString = false;
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] === "'") inString = !inString;
        else if (!inString && line[index] === '-' && line[index + 1] === '-') {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join('\n');
}

const migrationCode = stripSqlComments(migrationSql);

// The authoritative mapping, expressed once here for the tests to compare
// against both the migration and the backend authority.
const EXPECTED_MAPPING = Object.freeze({
  CWTS: 'CWTS',
  CWTS_COAST_GUARD: 'CWTS',
  LTS: 'LTS',
  MTS_ARMY: 'MTS',
  MTS_NAVY: 'MTS',
});

/** Every `CASE component."type" ... END` mapping in the executable SQL. */
function scopeMappings(sql) {
  return [...sql.matchAll(/CASE component\."type"([\s\S]*?)\bEND\b/g)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/WHEN '([A-Z_]+)' THEN '([A-Z]+)'/g)].map(([, type, scope]) => [
        type,
        scope,
      ]),
    ),
  );
}

/** The executable `DO $$ ... $$;` blocks, in file order, comments removed. */
const doBlocks = [...migrationCode.matchAll(/DO \$\$([\s\S]*?)\$\$;/g)].map((match) => ({
  body: match[1],
  start: match.index,
}));

/** Locates a guard by what it actually tests, not by a comment label. */
function guard(label, pattern) {
  const matches = doBlocks.filter((block) => pattern.test(block.body));
  assert.equal(matches.length, 1, `expected exactly one ${label} guard in executable SQL`);
  return matches[0];
}

const FIRST_UPDATE_AT = migrationCode.search(/^UPDATE /m);

// ---------------------------------------------------------------------------
// Layer 1: structural assertions against the shipped migration
// ---------------------------------------------------------------------------

test('the migration aborts on both dangling coordinator relationships before it updates anything', () => {
  const referential = guard('referential-integrity', /account\."id" IS NULL/);

  assert.ok(FIRST_UPDATE_AT >= 0, 'the migration must contain a backfill UPDATE');
  assert.ok(
    referential.start < FIRST_UPDATE_AT,
    'the referential-integrity guard must run before any UPDATE',
  );

  // Orphan userId: the row references a user that does not exist.
  assert.match(referential.body, /account\."id" IS NULL/, 'must detect an orphan userId');
  // Dangling componentId: set, but pointing at a component that does not exist.
  assert.match(
    referential.body,
    /coordinator\."componentId"\s+IS NOT NULL\s+AND\s+component\."id" IS NULL/,
    'must detect a dangling componentId',
  );
  assert.match(referential.body, /RAISE\s+EXCEPTION/, 'must abort rather than repair');
});

test('every guard actually raises, rather than counting and continuing', () => {
  // A guard that computes a count and does nothing with it is worse than absent:
  // it reads as protection during review while permitting the deployment.
  assert.ok(doBlocks.length >= 4, `expected at least 4 guard blocks, found ${doBlocks.length}`);

  for (const [index, block] of doBlocks.entries()) {
    assert.match(
      block.body,
      /RAISE\s+EXCEPTION/,
      `guard block ${index} computes a check but never raises`,
    );
    assert.match(
      block.body,
      /IF\s+[\s\S]*?\bTHEN\b/,
      `guard block ${index} has no conditional to raise under`,
    );
  }
});

test('the migration does not delete, remap, or otherwise repair bad rows', () => {
  // Aborting is the only acceptable outcome. Silent correction of
  // security-sensitive data is worse than a failed deployment.
  assert.doesNotMatch(migrationCode, /\bDELETE\s+FROM\b/i, 'the migration must not delete rows');
  assert.doesNotMatch(migrationCode, /\bTRUNCATE\b/i, 'the migration must not truncate');
  assert.doesNotMatch(
    migrationCode,
    /INSERT\s+INTO\s+"(user|nstp_component)"/i,
    'the migration must not invent parent rows to satisfy a dangling reference',
  );
});

test('every copy of the scope mapping is explicit, exhaustive, and identical', () => {
  // The mapping is written out three times -- in the conflict guard, in the
  // backfill UPDATE, and in the post-condition check. PL/pgSQL has no way to
  // share a CASE expression across statements without creating a function, so
  // the duplication stands; this test is what keeps the copies honest. A drift
  // in the conflict guard's copy would mis-detect conflicts, and a drift in the
  // post-condition's copy would defeat the migration's self-verification.
  const mappings = scopeMappings(migrationCode);
  assert.equal(mappings.length, 3, 'expected three copies of the component-type mapping');

  for (const [index, mapping] of mappings.entries()) {
    assert.deepEqual(
      mapping,
      EXPECTED_MAPPING,
      `mapping copy ${index + 1} must cover every NSTPComponentType value explicitly`,
    );
  }
});

test('the scope mapping has no open-ended fallback', () => {
  // An `ELSE 'CWTS'` here is precisely the defaulting bug this release removes.
  assert.doesNotMatch(migrationCode, /ELSE\s+'CWTS'/i, 'no ELSE CWTS fallback may exist');

  for (const [, body] of [...migrationCode.matchAll(/CASE component\."type"([\s\S]*?)\bEND\b/g)]) {
    assert.doesNotMatch(body, /\bELSE\b/i, 'a component-type CASE must have no ELSE branch at all');
  }
});

test('an unmapped component type is refused rather than defaulted', () => {
  // This guard is the deliberate stop for a future sixth enum value. The
  // exhaustive CASE with no ELSE is the second, independent backstop behind it:
  // it yields NULL, which the NOT NULL column rejects.
  const unmapped = guard('unmapped-component-type', /NOT IN \(\s*\n?\s*'CWTS', 'CWTS_COAST_GUARD'/);
  assert.match(unmapped.body, /RAISE\s+EXCEPTION/);
  assert.ok(
    unmapped.start < FIRST_UPDATE_AT,
    'the unmapped-type guard must run before the backfill',
  );
});

test('the migration drops the historical default and does not reinstate one', () => {
  assert.match(migrationCode, /ALTER COLUMN "scope" DROP DEFAULT/);
  assert.doesNotMatch(
    migrationCode,
    /ALTER COLUMN "scope" SET DEFAULT/,
    'no new default may be introduced',
  );
});

test('the migration mapping matches the backend authorization authority', async () => {
  // staff.service.js COORDINATOR_SCOPE_TYPES is the single backend authority for
  // scope -> component types. If the migration and the runtime disagree, a
  // backfilled scope will not match what the server later authorizes.
  const staffService = await readFile(STAFF_SERVICE_PATH, 'utf8');
  const block = staffService.slice(
    staffService.indexOf('COORDINATOR_SCOPE_TYPES'),
    staffService.indexOf('COORDINATOR_SCOPE_TYPES') + 400,
  );

  for (const [componentType, scope] of Object.entries(EXPECTED_MAPPING)) {
    const scopeEntry = block.match(new RegExp(`${scope}:\\s*\\[([^\\]]*)\\]`));
    assert.ok(scopeEntry, `staff.service.js must define a ${scope} entry`);
    assert.ok(
      scopeEntry[1].includes(`'${componentType}'`),
      `${scope} must include ${componentType} in the backend authority`,
    );
  }
});

test('the migration verifies its own result before committing', () => {
  // A post-condition check catches a mapping regression introduced by a future
  // edit to the file, independently of the guards that ran before the UPDATEs.
  const postCondition = guard('post-condition', /mismatched/);
  assert.ok(
    postCondition.start > FIRST_UPDATE_AT,
    'the post-condition check must run after the backfill',
  );
  assert.match(postCondition.body, /RAISE\s+EXCEPTION/);
  assert.match(
    postCondition.body,
    /coordinator\."scope" <> CASE component\."type"/,
    'the post-condition must compare stored scope against the component mapping',
  );
});

test('every scenario in the matrix is exercised', () => {
  // Guards against a scenario being silently dropped from the array.
  assert.equal(scenarios.length, 14);
  assert.equal(scenarios.filter((scenario) => scenario.abort).length, 7);
  assert.equal(scenarios.filter((scenario) => scenario.expect).length, 7);
});

// ---------------------------------------------------------------------------
// Layer 2: behavioural matrix (SQLite transcription of the guard sequence)
// ---------------------------------------------------------------------------

const SCOPE_CASE = `CASE component.type
  WHEN 'MTS_ARMY' THEN 'MTS'
  WHEN 'MTS_NAVY' THEN 'MTS'
  WHEN 'LTS' THEN 'LTS'
  WHEN 'CWTS' THEN 'CWTS'
  WHEN 'CWTS_COAST_GUARD' THEN 'CWTS'
END`;

class MigrationAbort extends Error {}

function buildDatabase({ users, components, profiles }) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE user_account (id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE nstp_component (id TEXT PRIMARY KEY, type TEXT NOT NULL);
    CREATE TABLE coordinator_profile (
      id TEXT PRIMARY KEY,
      userId TEXT,
      componentId TEXT,
      scope TEXT NOT NULL DEFAULT 'CWTS'
    );
  `);

  for (const user of users) {
    db.prepare('INSERT INTO user_account (id, data) VALUES (?, ?)').run(
      user.id,
      JSON.stringify(user.data ?? {}),
    );
  }
  for (const component of components) {
    db.prepare('INSERT INTO nstp_component (id, type) VALUES (?, ?)').run(component.id, component.type);
  }
  for (const profile of profiles) {
    db.prepare(
      'INSERT INTO coordinator_profile (id, userId, componentId, scope) VALUES (?, ?, ?, ?)',
    ).run(profile.id, profile.userId, profile.componentId ?? null, profile.scope ?? 'CWTS');
  }
  return db;
}

/**
 * Executes the migration's guard sequence in the same order as the real file.
 * `user` is spelled `user_account` because `user` is reserved in SQLite; the
 * jsonb `->>` operator is spelled with json_extract. Everything else -- the
 * predicates, their order, and which rows each UPDATE touches -- mirrors
 * migration.sql line for line.
 */
function runMigration(db) {
  const count = (sql) => db.prepare(sql).get().n;

  // Guard 0: referential integrity (orphan userId or dangling componentId).
  const broken = count(`
    SELECT COUNT(*) AS n
    FROM coordinator_profile coordinator
    LEFT JOIN user_account account ON account.id = coordinator.userId
    LEFT JOIN nstp_component component ON component.id = coordinator.componentId
    WHERE account.id IS NULL
       OR (coordinator.componentId IS NOT NULL AND component.id IS NULL)`);
  if (broken > 0) throw new MigrationAbort(`dangling relationships: ${broken}`);

  // Guard 1: every referenced component type has an explicit mapping.
  const unmapped = count(`
    SELECT COUNT(*) AS n
    FROM coordinator_profile coordinator
    JOIN nstp_component component ON component.id = coordinator.componentId
    WHERE component.type NOT IN ('CWTS','CWTS_COAST_GUARD','LTS','MTS_ARMY','MTS_NAVY')`);
  if (unmapped > 0) throw new MigrationAbort(`unmapped component types: ${unmapped}`);

  // Guard 2: component relation and account metadata must agree.
  const conflicting = count(`
    SELECT COUNT(*) AS n
    FROM coordinator_profile coordinator
    JOIN user_account account ON account.id = coordinator.userId
    LEFT JOIN nstp_component component ON component.id = coordinator.componentId
    WHERE component.type IS NOT NULL
      AND json_extract(account.data, '$.coordinatorScope') IN ('CWTS','LTS','MTS')
      AND json_extract(account.data, '$.coordinatorScope') <> ${SCOPE_CASE}`);
  if (conflicting > 0) throw new MigrationAbort(`conflicting scope sources: ${conflicting}`);

  // Guard 3: no component relation requires usable metadata.
  const unmappable = count(`
    SELECT COUNT(*) AS n
    FROM coordinator_profile coordinator
    JOIN user_account account ON account.id = coordinator.userId
    LEFT JOIN nstp_component component ON component.id = coordinator.componentId
    WHERE component.type IS NULL
      AND COALESCE(json_extract(account.data, '$.coordinatorScope'), '')
          NOT IN ('CWTS','LTS','MTS')`);
  if (unmappable > 0) throw new MigrationAbort(`no authoritative mapping: ${unmappable}`);

  // UPDATE 1: component-derived scope, exhaustive CASE with no ELSE.
  db.exec(`
    UPDATE coordinator_profile
    SET scope = (
      SELECT ${SCOPE_CASE}
      FROM nstp_component component
      WHERE component.id = coordinator_profile.componentId
    )
    WHERE componentId IN (SELECT id FROM nstp_component)`);

  // The NOT NULL constraint is the backstop for an unmapped type reaching here.
  const nulled = count('SELECT COUNT(*) AS n FROM coordinator_profile WHERE scope IS NULL');
  if (nulled > 0) throw new MigrationAbort(`NOT NULL violation on scope: ${nulled}`);

  // UPDATE 2: metadata-derived scope, only where there is no component relation.
  db.exec(`
    UPDATE coordinator_profile
    SET scope = (
      SELECT json_extract(account.data, '$.coordinatorScope')
      FROM user_account account
      WHERE account.id = coordinator_profile.userId
    )
    WHERE componentId IS NULL`);

  // Post-condition: every component-backed row agrees with its component.
  const mismatched = count(`
    SELECT COUNT(*) AS n
    FROM coordinator_profile coordinator
    JOIN nstp_component component ON component.id = coordinator.componentId
    WHERE coordinator.scope <> ${SCOPE_CASE}`);
  if (mismatched > 0) throw new MigrationAbort(`post-condition mismatch: ${mismatched}`);

  return readProfiles(db);
}

// node:sqlite returns null-prototype rows; copy them into plain objects so the
// strict deep-equal assertions compare values rather than prototypes.
function readProfiles(db) {
  return db
    .prepare('SELECT id, scope FROM coordinator_profile ORDER BY id')
    .all()
    .map((row) => ({ id: row.id, scope: row.scope }));
}

const COMPONENTS = [
  { id: 'c-cwts', type: 'CWTS' },
  { id: 'c-coast', type: 'CWTS_COAST_GUARD' },
  { id: 'c-lts', type: 'LTS' },
  { id: 'c-army', type: 'MTS_ARMY' },
  { id: 'c-navy', type: 'MTS_NAVY' },
  { id: 'c-future', type: 'ROTC' }, // a hypothetical sixth enum value
];

const scenarios = [
  {
    label: 'A. component CWTS resolves to CWTS',
    users: [{ id: 'u1' }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-cwts' }],
    expect: [{ id: 'p1', scope: 'CWTS' }],
  },
  {
    label: 'B. component LTS resolves to LTS, not the CWTS default',
    users: [{ id: 'u1' }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-lts' }],
    expect: [{ id: 'p1', scope: 'LTS' }],
  },
  {
    label: 'C. component MTS_ARMY resolves to MTS',
    users: [{ id: 'u1' }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-army' }],
    expect: [{ id: 'p1', scope: 'MTS' }],
  },
  {
    label: 'C2. component MTS_NAVY also resolves to MTS',
    users: [{ id: 'u1' }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-navy' }],
    expect: [{ id: 'p1', scope: 'MTS' }],
  },
  {
    label: 'C3. component CWTS_COAST_GUARD resolves to CWTS explicitly, not by fallback',
    users: [{ id: 'u1' }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-coast' }],
    expect: [{ id: 'p1', scope: 'CWTS' }],
  },
  {
    label: 'D. no component, valid metadata resolves from metadata',
    users: [{ id: 'u1', data: { coordinatorScope: 'MTS' } }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: null }],
    expect: [{ id: 'p1', scope: 'MTS' }],
  },
  {
    label: 'E. component and metadata disagree -> abort',
    users: [{ id: 'u1', data: { coordinatorScope: 'LTS' } }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-cwts' }],
    abort: /conflicting scope sources/,
  },
  {
    label: 'F. componentId set but dangling -> abort, never a stale CWTS',
    users: [{ id: 'u1', data: { coordinatorScope: 'LTS' } }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-deleted' }],
    abort: /dangling relationships/,
  },
  {
    label: 'G. orphan userId -> abort',
    users: [],
    profiles: [{ id: 'p1', userId: 'u-deleted', componentId: 'c-lts' }],
    abort: /dangling relationships/,
  },
  {
    label: 'H. no component and unusable metadata -> abort',
    users: [{ id: 'u1', data: { coordinatorScope: 'ROTC' } }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: null }],
    abort: /no authoritative mapping/,
  },
  {
    label: 'H2. no component and absent metadata -> abort',
    users: [{ id: 'u1', data: {} }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: null }],
    abort: /no authoritative mapping/,
  },
  {
    label: 'I. a future sixth component type -> abort rather than default to CWTS',
    users: [{ id: 'u1' }],
    profiles: [{ id: 'p1', userId: 'u1', componentId: 'c-future' }],
    abort: /unmapped component types/,
  },
  {
    label: 'J. a mixed population resolves each row from its own component',
    users: [
      { id: 'u1' },
      { id: 'u2' },
      { id: 'u3', data: { coordinatorScope: 'CWTS' } },
      { id: 'u4', data: { coordinatorScope: 'MTS' } },
    ],
    profiles: [
      { id: 'p1', userId: 'u1', componentId: 'c-lts' },
      { id: 'p2', userId: 'u2', componentId: 'c-navy' },
      { id: 'p3', userId: 'u3', componentId: 'c-coast' },
      { id: 'p4', userId: 'u4', componentId: null },
    ],
    expect: [
      { id: 'p1', scope: 'LTS' },
      { id: 'p2', scope: 'MTS' },
      { id: 'p3', scope: 'CWTS' },
      { id: 'p4', scope: 'MTS' },
    ],
  },
  {
    label: 'K. one bad row aborts the whole migration, leaving the good rows untouched',
    users: [{ id: 'u1' }, { id: 'u2' }],
    profiles: [
      { id: 'p1', userId: 'u1', componentId: 'c-lts' },
      { id: 'p2', userId: 'u2', componentId: 'c-deleted' },
    ],
    abort: /dangling relationships/,
  },
];

for (const scenario of scenarios) {
  test(`scope backfill -- ${scenario.label}`, () => {
    const db = buildDatabase({
      users: scenario.users,
      components: COMPONENTS,
      profiles: scenario.profiles,
    });

    if (scenario.abort) {
      assert.throws(() => runMigration(db), scenario.abort);

      // The decisive property: an aborted migration must never leave a row
      // holding the historical CWTS default as though it had been resolved.
      // In PostgreSQL the whole migration is one transaction and rolls back;
      // here we assert no row was rewritten to a resolved-looking value.
      const rows = readProfiles(db);
      for (const row of rows) {
        assert.equal(row.scope, 'CWTS', `${row.id} must retain its pre-migration value on abort`);
      }
    } else {
      assert.deepEqual(runMigration(db), scenario.expect);
    }
  });
}
