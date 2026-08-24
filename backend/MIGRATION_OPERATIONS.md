# Migration and recovery operations

Operational procedure for applying database migrations to the BiPSU NSTP
production database, and for recovering when one fails.

This document contains no credentials. Every command reads connection details
from the environment. Set `DATABASE_URL` (and the `PG*` variables below) from your
secret store; never paste a connection string into a ticket, a chat message, or
this file.

```bash
# Set once per session, from your secret store. Not committed anywhere.
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME'
export PGHOST=... PGPORT=5432 PGUSER=... PGDATABASE=...
export PGPASSWORD=...   # or use ~/.pgpass, which keeps it out of your shell history
```

Run the `npm run` commands below from either the repository root or `backend/` —
the root `package.json` aliases the deployment scripts to the backend workspace.
The two exceptions are noted where they appear: `npm test` and
`npm run test:migration-guard` are defined only in the backend workspace, so they
take `--workspace backend` from the root.

---

## 1. The only approved production migration path

```bash
npm run migrate:deploy
```

That script, and only that script, is approved for production:

```
report:orphans  ->  preflight:production  ->  prisma migrate deploy  ->  verify:schema
```

Each stage fails closed. The first two are read-only and abort before any DDL
runs. The last runs after the DDL and verifies the physical schema is what the
application assumes.

Never run `prisma migrate deploy` directly, and never run `prisma migrate dev`,
`prisma db push`, or `prisma migrate reset` against production. A bare deploy
applies the coordinator scope backfill with no gate having run.

`backend/build.sh` routes through `npm run migrate:deploy` for hosting platforms
that insist on migrating from a build step. Migrating from a build step is not the
preferred workflow — a build may run in a different environment, or on several
instances at once, than the release it produces. Prefer the explicit operator
procedure in section 5.

### What each gate proves

`report:orphans` checks all 38 declared foreign-key relationships for rows whose
parent is missing. `preflight:production` runs 16 checks for conditions the
pending migrations cannot tolerate — chiefly coordinators whose program scope
cannot be derived without guessing. Both report up to 100 identifiers per finding
plus an accurate total, and both project identifiers only, never names, email
addresses, or grades. Reports are safe to attach to a deployment ticket.

`verify:schema` reads `pg_constraint` and confirms all 38 foreign keys exist with
their declared `ON DELETE` action. It exists because `prisma migrate status`
compares the `_prisma_migrations` ledger against the migrations directory: it
reports a migration as applied even when its DDL is no longer present in the
database. This repository has already needed
`20260802130000_restore_postgres_foreign_keys` to recover from exactly that.

That distinction matters for authorization. `schema.prisma` leaves
`relationMode` at its default of `"foreignKeys"`, so every `onDelete:` action is
enforced by PostgreSQL rather than emulated by the Prisma client. If
`coordinator_profile_userId_fkey` is missing, deleting a coordinator's user
account leaves the scope grant behind as an unreachable row, and nothing in the
application notices.

A gate that cannot run is treated as a failure, not as a pass. A skipped
BLOCKER exits non-zero.

---

## 2. Back up, and prove the backup is restorable

**Do this before touching production migrations.** A backup you have not
restored is a hypothesis, not a backup.

### 2.1 Take the dump

Use the custom format. It is compressed, and it is the only format
`pg_restore` can filter and list.

```bash
BACKUP="nstp-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump --format=custom --no-owner --no-privileges --verbose --file="$BACKUP"
sha256sum "$BACKUP" | tee "$BACKUP.sha256"
```

Run `pg_dump --version` first and confirm it is at least the server's major
version (PostgreSQL 16). An older `pg_dump` against a newer server can produce a
dump that will not restore.

### 2.2 Verify the dump is readable

```bash
pg_restore --list "$BACKUP" | head -40

# Count what the archive claims to hold, and what production actually holds.
pg_restore --list "$BACKUP" | grep -c 'TABLE DATA'
psql -tAc "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = ANY (current_schemas(false)) AND table_type = 'BASE TABLE';"
```

`--list` parses the archive's table of contents. If it errors, the file is
truncated or corrupt and the deployment stops here.

Compare the two counts rather than assuming a non-empty listing means success.
Derive the expected number from the live database as above instead of from a
number written down here: the schema currently defines 29 tables and
`_prisma_migrations` makes 30, but that figure moves with every release that adds
a model, and a stale constant in a runbook is worse than no constant. A dump
listing materially fewer tables than production holds was taken against the wrong
database or with a restrictive `--schema`/`--table` filter.

### 2.3 Restore it to a scratch database — never over production

```bash
SCRATCH=nstp_restore_test

createdb "$SCRATCH"
pg_restore --dbname="$SCRATCH" --no-owner --no-privileges --exit-on-error \
  --verbose "$BACKUP"
```

`--exit-on-error` is required. Without it `pg_restore` reports a nonzero
number of errors and still exits 0, so a partial restore looks like a success.

Then confirm the restore actually carries data:

```bash
psql --dbname="$SCRATCH" -c '
  SELECT
    (SELECT COUNT(*) FROM "user")                AS users,
    (SELECT COUNT(*) FROM "coordinator_profile") AS coordinators,
    (SELECT COUNT(*) FROM "student_profile")     AS students,
    (SELECT COUNT(*) FROM "grade")               AS grades;'
```

Compare against the same query run on production. A restore that yields zero
coordinators is a failed restore regardless of exit codes.

Only once this succeeds do you have a rollback option. If it fails, stop: there
is nothing to roll back to.

---

## 3. Rehearse the migration on the restored copy

The restored scratch database is production's data without production's risk.
Rehearse against it, not against a seeded or empty development database — the
conditions that abort this release's migration are all data conditions.

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/$SCRATCH"

npm run migrate:status        # expect: 1 migration not yet applied
npm run report:orphans        # read-only
npm run preflight:production  # read-only
npm run migrate:deploy        # the real thing, on the copy
npm run verify:schema
npm run migrate:status        # expect: schema up to date
```

Record the exit code and output of each. Reset `DATABASE_URL` to production
afterwards, and be deliberate about it — an unnoticed stale `DATABASE_URL` is the
most likely way to migrate the wrong database.

If preflight reports blockers, that is the rehearsal working. Reconcile each
finding with the data owner before going near production:

- restore the missing parent row, or
- correct the child's reference, or
- approve a separately reviewed cleanup migration.

Do not delete or remap orphaned production rows as part of a deployment, and do
not modify production data to make a gate pass. The gates exist to stop
deployment on exactly these conditions.

### Do not seed production

```
DO NOT RUN SEED IN PRODUCTION.
```

`npm run seed` populates address reference data and is intended for local
development only. It is deliberately not part of `migrate:deploy` and must never
be coupled to it. Migration and seeding are separate operations with separate
authorization. The same applies to the scratch database if you intend to compare
row counts against production — seeding it invalidates the comparison.

---

## 4. What this release changes

One new migration:
`20260824120000_require_explicit_coordinator_scope`.

It removes the historical `DEFAULT 'CWTS'` from `coordinator_profile.scope` and
backfills every existing row from an authoritative source: the coordinator's NSTP
component where one is linked, otherwise `user.data->>'coordinatorScope'`.

The mapping is explicit and exhaustive, with no `ELSE` branch:

| Component type      | Coordinator scope |
| ------------------- | ----------------- |
| `CWTS`              | `CWTS`            |
| `CWTS_COAST_GUARD`  | `CWTS`            |
| `LTS`               | `LTS`             |
| `MTS_ARMY`          | `MTS`             |
| `MTS_NAVY`          | `MTS`             |

A component type outside that set yields NULL, which the column's `NOT NULL`
constraint rejects, aborting the migration. That is intentional: a sixth
component type added later must be mapped deliberately rather than defaulting to
a CWTS grant.

The migration **aborts and rolls back** rather than guessing when it finds a
coordinator whose `userId` or `componentId` dangles, whose component and metadata
disagree, or for whom no authoritative program mapping exists. It never deletes
or remaps rows. `preflight:production` reports all of these conditions before the
migration runs, so an abort at migration time should mean something changed
between preflight and deploy.

After backfilling, the migration re-reads the table and aborts if any
component-backed profile disagrees with its own component's type. That
post-condition is not redundant: it is what catches a future edit to the mapping
above that silently stops matching, in the file where such an edit would be made.

The application side changes with it. The deployed code had one write site that
created `coordinator_profile` rows without a scope — the `coordinatorProfile
.upsert` in `src/modules/nstp/nstp.service.js`, whose `create` and `update`
blocks both omit the column and let the default decide. This release removes it
and leaves two write sites, both in `src/modules/staff/staff.service.js`, which
supply `scope` explicitly and validate it against the `CoordinatorScope` enum.
Dropping the default is what makes a future omission fail loudly instead of
quietly granting CWTS. This is also why the previous release must not be run
against the migrated schema — see section 7.1.

---

## 5. Production deployment sequence

Preconditions: section 2 complete with a verified restorable backup, section 3
rehearsed clean, the release commit merged, and a maintenance window if you want
one (the migration itself is brief, but the abort paths need an operator).

```bash
# 1. Confirm you are pointed at production, and at the right revision.
psql -c 'SELECT current_database(), version();'
git log --oneline -1

# 2. Confirm what is pending. Expect exactly the one new migration.
npm run migrate:status

# 3. Read-only proofs against production itself.
npm run report:orphans
npm run preflight:production

# 4. Apply. This re-runs both gates, deploys, then verifies the schema.
npm run migrate:deploy

# 5. Confirm the ledger and the physical schema agree.
npm run migrate:status
npm run verify:schema
```

Stop at the first non-zero exit code. Do not re-run a gate hoping for a
different answer, and do not pass a flag to skip one.

### 5.1 Verify the coordinator foreign keys by hand

`verify:schema` covers all 38 automatically. These are the two with
authorization consequences, for the deployment record:

```sql
SELECT conname,
       confdeltype,   -- 'c' = CASCADE, 'n' = SET NULL, 'a' = NO ACTION, 'r' = RESTRICT
       confupdtype
FROM pg_constraint
WHERE conrelid = '"coordinator_profile"'::regclass
  AND contype = 'f'
ORDER BY conname;
```

Expected exactly:

| Constraint                             | `confdeltype`  | Meaning                                                     |
| -------------------------------------- | -------------- | ----------------------------------------------------------- |
| `coordinator_profile_componentId_fkey` | `n` (SET NULL) | Removing a component must not delete its coordinator        |
| `coordinator_profile_userId_fkey`      | `c` (CASCADE)  | Deleting the account must remove the scope grant with it     |

Anything else — a missing row, `a`, or `r` — means the schema does not enforce
what the application assumes. Treat it as a failed deployment and go to section 7.

All 38 foreign keys should also report `confupdtype = 'c'` (`ON UPDATE CASCADE`).
Note the scope limit honestly: `verify:schema` verifies `confdeltype` only, so
`ON UPDATE` is checked here by eye and not by the gate. It carries no
authorization consequence — these keys are cuid strings and are not updated in
place — which is why it was left out rather than half-verified.

### 5.2 Confirm the scope column is now explicit

```sql
SELECT column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'coordinator_profile' AND column_name = 'scope';
-- expect: column_default = NULL, is_nullable = 'NO'

SELECT scope, COUNT(*) FROM "coordinator_profile" GROUP BY scope ORDER BY scope;
```

A surviving `'CWTS'::"CoordinatorScope"` default means the migration did not
complete. Review the scope distribution against what the registrar expects: this
is the check that catches a backfill that technically succeeded but produced the
wrong grants.

---

## 6. Migration immutability

Applied migrations are immutable. Prisma stores a checksum of each
`migration.sql` in `_prisma_migrations` and fails on a mismatch. Editing a
migration that production has already applied breaks every future deploy.

The 17 migrations through `20260803235930_grade_input_conversion` are committed
and were released before this one. **Do not modify them**, including whitespace
and line endings — a line-ending change alters the checksum. This is one reason
not to bulk-normalize CRLF/LF as part of a release.

Treat `npm run migrate:status` against production as the authority on what is
actually applied there. This file cannot know; it can only tell you what the
repository contains.

Only `20260824120000_require_explicit_coordinator_scope` is new in this release
and may still be edited, up until it is applied anywhere that matters.

### Operations with no inverse

Some already-applied changes cannot be undone by a new migration, which is why
restore-from-backup is the rollback plan:

- `ALTER TYPE ... ADD VALUE` — PostgreSQL cannot remove an enum value.
  `20260703023044_add_coordinator_role` added to `UserRole` and
  `NSTPComponentType`; `20260803170000_repair_coordinator_role_enum` added to
  `UserRole` again.
- `CREATE UNIQUE INDEX` — the index drops cleanly, but the de-duplication that
  had to precede it does not come back.
- This release's backfill — the two `UPDATE` statements partition the table
  between them (the first takes rows with a resolvable `componentId`, the second
  the rows where it is NULL), so on success every row's `scope` has been
  rewritten. Rows that merely inherited the old default are indistinguishable
  afterwards from rows that were set deliberately, so there is no basis for
  reconstructing the prior values. Re-adding the default would not restore them;
  it would reintroduce the defaulting bug.

`prisma migrate deploy` wraps each migration file in its own transaction, so an
individual file either applies completely or not at all. That bounds the damage
from one failure; it does not make an applied file reversible.

---

## 7. Rollback

**Prisma has no down migrations.** There is no `prisma migrate down`, and this
project does not ship reverse migrations. Do not write one under time pressure
against a schema whose state you have not established.

**Restoring the verified backup from section 2 is the only safe recovery path for
an applied migration.** Say so plainly in the incident channel rather than
attempting a partial repair.

```bash
# 1. Stop application traffic so nothing writes during the restore.
# 2. Preserve the broken state for diagnosis -- do not skip this.
pg_dump --format=custom --no-owner --no-privileges \
  --file="nstp-FAILED-$(date -u +%Y%m%dT%H%M%SZ).dump"

# 3. Restore. Requires the DBA to be certain of the target.
psql -c 'SELECT current_database();'
pg_restore --dbname="$PGDATABASE" --clean --if-exists --no-owner \
  --no-privileges --exit-on-error --verbose "$BACKUP"

# 4. Prove the restore.
npm run migrate:status
npm run verify:schema
npm run report:orphans
```

`--clean --if-exists` drops the existing objects first. It is destructive by
design and must only be aimed at a database you intend to overwrite entirely.

### 7.1 Application compatibility — the rollback ordering rule

**Never run the previous backend release against the migrated schema.**

The currently deployed code creates coordinator profiles without supplying
`scope`, at `src/modules/nstp/nstp.service.js` in the admin accounts path
(`coordinatorProfile.upsert`, in the `userRole === 'COORDINATOR'` branch). It
relies on the `DEFAULT 'CWTS'` to fill the column — that write site *is* the
silent CWTS-granting behaviour this release removes, and this release removes the
write site along with the default.

So once the migration has applied, that code path hits a `NOT NULL` violation:
creating or updating a coordinator through admin account management fails outright.
Loudly, which is better than silently granting CWTS, but it is an outage in that
feature.

The direction that *is* safe:

| Application | Schema | Result |
| ----------- | ------ | ------ |
| This release | migrated | Correct. Both remaining write sites supply `scope` explicitly. |
| This release | pre-migration (restored) | Works. Explicit values override the column default, which sits unused. |
| Previous release | pre-migration (restored) | Works, with the original defaulting bug. |
| Previous release | migrated | **Breaks.** `NOT NULL` violation on coordinator creation. |

Two consequences for recovery:

- Restoring the database **alone** is safe. This release's code keeps supplying
  explicit scopes against the restored schema, so a database rollback does not
  force an application rollback.
- Rolling the application back **alone** is not safe. If you roll back the
  application, restore the database in the same maintenance window, and bring the
  database back first or simultaneously — never the application first.

### Rollback triggers

Restore the backup if any of these hold after deployment:

- `verify:schema` reports a missing or wrong-action foreign key that cannot be
  explained and corrected immediately.
- `coordinator_profile.scope` still has a default, or the scope distribution does
  not match what the registrar expects.
- A coordinator can read or write data outside their program, or an
  authorization check that should deny is granting.
- `migrate:status` reports a failed migration and the DBA review in section 8
  cannot establish the schema's actual state.
- Coordinator or grade writes are failing in a way that began at deployment.

Do not attempt data repair on production while any of these is unresolved.

---

## 8. Failed migration recovery

Builds and application startup never run recovery. A failed `migrate:deploy`
stays failed, deliberately.

1. Capture `npm run migrate:status` output and the full deploy log.
2. Dump the current state (section 7, step 2). Do not repair before capturing.
3. Restore the backup to an **isolated** database and diagnose there.
4. An authorized DBA reviews the partial schema and data state against the
   migration SQL.
5. Only after that review may the DBA invoke Prisma's recovery commands
   directly — `npm exec prisma migrate resolve --rolled-back <name>` or
   `--applied <name>`. This project deliberately does not wrap them.
6. Re-run `npm run report:orphans`, `npm run verify:schema`, and
   `npm run migrate:status`.

`npm run migrate:recover` does **not** perform recovery. It prints a refusal and
exits 1, by design: it exists so that a hosting platform's restart hook, or an
operator reaching for the obvious-looking script name under pressure, cannot
resolve a failed migration without the review in step 4. Automatic recovery would
mean marking a migration resolved without anyone having established what state the
database is in.

`--applied` tells Prisma a migration succeeded. If its DDL did not in fact apply,
you have created the exact silent divergence that made `verify:schema` necessary.
Do not use it to clear a failure you have not diagnosed.

---

## 9. Testing the migration guards

The abort paths carry the security-relevant behaviour, so they are tested three
ways, in two commands:

```bash
npm test --workspace backend                       # no database required
npm run test:migration-guard --workspace backend   # real PostgreSQL
```

The first command covers two of the three: structural assertions about the
migration SQL and the gate definitions, and a SQLite transcription of the
mapping and comparison logic executed as real queries. Neither can prove the
production SQL runs.

The third is `test/migration-guard.pgtest.sh`, which executes the actual
migration against a real server and asserts case by case that it resolves what it
can and rolls back everything it cannot. Only running it on PostgreSQL proves the
PL/pgSQL parses, that the `::"CoordinatorScope"` casts resolve, and that
`RAISE EXCEPTION` truly rolls back — including that the `DROP DEFAULT` is not
committed when a later statement aborts.

It is destructive: it truncates tables, drops foreign keys, and re-adds a column
default before restoring the schema. It therefore refuses to start unless
`MIGRATION_GUARD_TEST=1` **and** the database name is on its allowlist
(`nstp_ci`, `nstp_guard_test`, `*_test`, `*_scratch`, `*_ci`). Never point it at
production; the allowlist exists because a stray `DATABASE_URL` otherwise could.

CI runs it against a disposable `postgres:16-alpine` service database, then
re-runs `verify:schema` afterwards to confirm the test restored what it dropped.

---

## 10. Referential actions

- User-to-profile and user-to-follow rows cascade, because those rows cannot have
  meaning without the deleted user.
- Module-to-lesson/quiz/assignment and student-profile-to-submission/enrollment/
  grade rows cascade, because they are dependent coursework records.
- Optional content references in submissions and grades, optional
  component/instructor assignments, and optional section assignment use
  `SET NULL` to keep the historical row when its optional catalog parent is
  removed.
- Component-to-section/enrollment and user/enrollment-to-payment use `RESTRICT`:
  institutional structure and financial records require an operator decision.
- All relations use `ON UPDATE CASCADE` to preserve integrity if a key changes.

Current distribution across the 38 foreign keys: 15 `CASCADE`, 19 `SET NULL`,
4 `RESTRICT`. `scripts/lib/foreign-key-integrity.mjs` holds the authoritative
per-key list that `verify:schema` enforces.

---

## 11. Administrator operations

`npm run admin:create` creates the configured administrator only if absent.

`npm run admin:reset-password` is deliberately separate and requires all of
`ADMIN_EMAIL`, `ADMIN_RESET_PASSWORD`, and
`ADMIN_RESET_CONFIRM=RESET_ADMIN_PASSWORD`. Password values are never logged.

Both are operator-initiated and are not part of any migration or build path.
