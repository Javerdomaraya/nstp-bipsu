# BiPSU NSTP — Final Production Deployment Readiness Review

**Date:** 2026-08-24
**Scope:** deployment safety of the coordinator-scope release (18 migrations, HEAD + uncommitted work)
**Reviewer role:** production engineering / migration safety / security / release management

---

## VERDICT

# READY WITH REQUIRED PRE-DEPLOYMENT ACTIONS

The prior audit's central security claim holds and I independently re-verified it: coordinator
authorization is fail-closed, no CWTS fallback survives anywhere in `backend/src`, the scope→component
map has a single backend authority, and `CoordinatorProfile.scope` carries no schema default. That work
is sound.

What is **not** ready is the deployment machinery around it. Every issue below is in the release
mechanism — gate scripts that exit zero when they cannot run, a build script that bypasses the gates
entirely, an unverified production constraint state, and a backup/restore procedure that does not exist
in the repository. None require touching authorization logic. All are fixable in well under a day.

One genuine defect was found in the new migration itself, by execution rather than reading. It is
narrow and does not warrant redesigning the coordinator system — it warrants one additional guard.

---

## 1. Production Database Preflight

`backend/scripts/preflight-production.mjs` (189 lines, currently **untracked**) implements 14 checks.
All 13 conditions named in the brief are covered:

| # | Required condition | Check name | Severity |
|---|---|---|---|
| 1 | Orphan coordinator profiles | `orphan_coordinator_profiles` | BLOCKER |
| 2 | Profiles connected to wrong roles | `coordinator_profiles_linked_to_non_coordinators` | BLOCKER |
| 3 | Invalid/unmappable scopes | `unmappable_coordinator_scopes` | BLOCKER |
| 4 | Conflicting scope metadata | `conflicting_coordinator_scope_sources` | BLOCKER |
| 5 | Duplicate facilitator relationships | `duplicate_facilitator_user_profiles` | BLOCKER |
| 6 | Duplicate employee numbers | `duplicate_facilitator_employee_numbers` | BLOCKER |
| 7 | Invalid facilitator component metadata | `legacy_facilitator_component_metadata_invalid` | BLOCKER |
| 8 | Facilitators without coordinators | `facilitators_without_coordinator` | REVIEW |
| 9 | Facilitators without valid components | `facilitators_without_valid_component` | BLOCKER |
| 10 | Students without valid components | `students_without_valid_component` | BLOCKER |
| 11 | Training groups with invalid components | `training_groups_with_invalid_component` | BLOCKER |
| 12 | Invalid legacy grades | `legacy_grades_outside_percent_range` | BLOCKER |
| 13 | Duplicate semester-grade keys | `duplicate_semester_grade_keys` | BLOCKER |
| + | Facilitator ownership ambiguity | `legacy_facilitator_ownership_not_unique` | REVIEW |

**Read-only: confirmed.** Every one of the 14 statements is a `SELECT`. There is no `INSERT`, `UPDATE`,
`DELETE`, or DDL in the file. It reaches the database only through `$queryRaw`/`$queryRawUnsafe`.

**No PII or credentials: confirmed.** Each check projects only `"id"`, and the wrapper at line 171
re-projects `candidate."id"` alone. Names, emails, and `passwordHash` are never selected. The header
comment states this intent and the code honours it.

**Warnings vs blockers: confirmed.** `severity: 'BLOCKER' | 'REVIEW'` is declared per check, and the
JSON output carries an explicit `blockingCount`.

**Non-zero exit on failure: partially correct — this is the main finding.**

### P1 (HIGH) — a BLOCKER that cannot run does not block

```js
if (missing.length) {
  results.push({ name: check.name, severity: check.severity, status: 'SKIPPED', missing });
  continue;                                        // ← line 168
}
...
const blocking = results.filter((r) => r.severity === 'BLOCKER' && r.status === 'FOUND');
if (blocking.length) process.exitCode = 1;         // ← line 186
```

`SKIPPED` is not `FOUND`, so a blocker that never executed contributes nothing to `blockingCount` and
the process exits **0**. This matters because preflight runs *before* `prisma migrate deploy`, and four
checks reference columns that the pending migrations create:

- `grade.componentId`, `grade.schoolYear`, `grade.semester` — created by `semester_grade_records`
- `instructor_profile.coordinatorId`, `instructor_profile.componentId` — created by `coordinator_scopes_and_facilitator_ownership`

So `duplicate_semester_grade_keys`, `facilitators_without_coordinator`, and
`facilitators_without_valid_component` skip **by construction** whenever production is behind on those
migrations — which is precisely the state preflight exists to inspect. A green run on an older database
is indistinguishable from a green run on a fully-migrated one.

This is a fail-open gate. It does not need redesigning; it needs `SKIPPED` blockers to be fatal, or at
minimum surfaced and asserted zero by the operator.

### P2 (HIGH) — `report-orphans.mjs` is fail-open more severely

```js
for (const [child, column, parent] of checks) {
  if (!available.has(child) || !available.has(parent)) continue;   // ← line 17
```

A missing **table** is skipped without being recorded anywhere — not in `findings`, not in
`skippedChecks`. A missing **column** at least lands in `skippedChecks` (line 19). So a run against a
database missing several tables emits `{"findings": [], "warnings": [], "skippedChecks": []}` and exits
0, which reads as "clean" but means "checked almost nothing".

Separately, `count: sample.length` (line 23) saturates at the `LIMIT 100`, understating the true scale
of any orphan set. An operator seeing `count: 100` cannot tell whether there are 100 or 100,000.

### P3 (MEDIUM) — no preflight check for a dangling `coordinator_profile.componentId`

`unmappable_coordinator_scopes` and `conflicting_coordinator_scope_sources` both `JOIN "user"` and
either `LEFT JOIN` or `JOIN` `nstp_component`, which makes them blind to the two conditions that
actually break the new migration (CASE F and CASE G in §3). Only `report-orphans.mjs` catches them, via
`['coordinator_profile','userId','user']` and `['coordinator_profile','componentId','nstp_component']`.
That is adequate *because* `migrate:deploy` chains orphans first — but it means the orphan report is
load-bearing for scope correctness, and per P2 it is the weaker of the two scripts.

### P4 (LOW) — internal mapping inconsistency

`conflicting_coordinator_scope_sources` closes its mapping `CASE` with `ELSE 'CWTS'` (line 49), while
`legacy_facilitator_ownership_not_unique` uses an explicit whitelist with no `ELSE` (lines 82–85). Two
encodings of one rule in one file, with different behaviour on an unrecognised component type. Neither
is wrong today (see §3 on enum closure) but they will drift.

### P5 (LOW) — performance and error handling at production scale

- `COUNT(*) OVER()` (line 172) forces the full candidate set to materialise before `LIMIT 100`. For the
  `grade` table this is a full scan plus a sort. Acceptable in a maintenance window; not something to
  run against a live primary under load.
- `legacy_grades_outside_percent_range` cannot use an index (four `OR`-ed range predicates with
  `::text = 'NaN'` casts) — plan on a sequential scan of `grade`.
- There is no `statement_timeout` and no `try/catch` around the check loop. A query error throws out of
  the `try` block, `finally` disconnects, and the process exits non-zero — which is *fail-closed* and
  therefore acceptable, but the output is a stack trace rather than structured JSON.

**Recommendation:** run preflight against the restored copy (§4) first, where a slow scan costs nothing,
and confirm the JSON contains zero `SKIPPED` entries before trusting a green result on production.

---

## 2. Migration Safety

Prisma wraps each migration file in a single transaction, and PostgreSQL 16 has transactional DDL, so
every migration below is **atomic individually** — a mid-file failure rolls the whole file back and
leaves `_prisma_migrations` without a success row, making retry safe. There is **no atomicity across
files**: a failure in migration N leaves 1..N-1 permanently applied.

Two migrations share the timestamp `20260802130000`. Prisma orders lexicographically by directory name,
so `restore_postgres_foreign_keys` sorts before `server_backed_academic_progress` ('r' < 's'). This is
deterministic and stable across environments, and harmless here because the FK migration does not touch
`module_progress` (the only object the other one creates, and it declares its own FKs inline). Flagging
it only because duplicate timestamps are a latent ordering hazard for future work.

| Migration | Lock profile | Scan / backfill | Failure mode | Retry-safe | Maintenance mode |
|---|---|---|---|---|---|
| `restore_postgres_foreign_keys` | `ACCESS EXCLUSIVE` on 15 child tables, `SHARE ROW EXCLUSIVE` on parents, held for the whole transaction | 33 `ADD CONSTRAINT` — each **validates every existing row**; full scan per FK | `23503` on first orphan | Yes (rollback is clean) | **Required** |
| `assessment_lifecycle` | `ACCESS EXCLUSIVE` on `quiz`/`question`; `SHARE` from `CREATE INDEX` blocks writes | full-table `UPDATE "quiz" SET status`; `LATERAL jsonb_array_elements` insert into `question`; `UPDATE quiz SET totalPoints` | cast failure on bad `data->'questions'` shape | **Yes** — deterministic `'legacy-'||md5(...)` ids + `NOT EXISTS` + `ON CONFLICT DO NOTHING` | Recommended |
| `coordinator_scopes_and_facilitator_ownership` | `ACCESS EXCLUSIVE` on `coordinator_profile`, `instructor_profile`, `nstp_component` | 5-row component upsert; backfill of `instructor_profile.componentId`; 2 indexes | enum cast failure | Yes | Recommended |
| `semester_grade_records` | metadata-only for columns; `SHARE` on `grade` for 3 indexes | 10 **nullable** `ADD COLUMN` (no rewrite in PG11+); **no backfill** | unique-index violation — see note | Yes | Brief write pause |
| `grade_input_conversion` | metadata-only | 3 nullable columns, no backfill | none realistic | Yes | No |
| `require_explicit_coordinator_scope` | `ACCESS EXCLUSIVE` on `coordinator_profile` (small table) | 2 targeted `UPDATE`s + `DROP DEFAULT` | deliberate `RAISE EXCEPTION` from guards | Yes | No |

**`restore_postgres_foreign_keys` is the heaviest and riskiest step.** Thirty-three constraint
validations, each a full scan of the child table, all inside one transaction holding `ACCESS EXCLUSIVE`.
On `grade` and `submission` this is where the window will be spent. The migration's own header is
correct and should be obeyed literally: *"Run `npm run report:orphans` against a backup/copy first;
PostgreSQL will reject this migration if any relationship is orphaned."* Because it is one transaction,
a single orphaned row anywhere aborts all 33 — so the orphan report must come back completely clean, not
merely mostly clean.

**`semester_grade_records`' unique index cannot fail on legacy data.** `CREATE UNIQUE INDEX
grade_studentId_componentId_schoolYear_semester_key` spans three columns that this same migration adds
as `NULL`. PostgreSQL treats NULLs as distinct in unique indexes by default, so every pre-existing row
is exempt. The `duplicate_semester_grade_keys` preflight check guards the case where a prior partial
deployment already populated them — which is exactly the check that P1 causes to be silently skipped on
an un-migrated database.

**One data-fidelity note on `assessment_lifecycle`.** The legacy question import filters on
`NULLIF(BTRIM(question_data.value->>'prompt'), '') IS NOT NULL`, so blank-prompt questions are silently
dropped, leaving gaps in the generated `order` sequence and a `totalPoints` lower than the original
array length. I initially read `SET totalPoints = COUNT(*)` as destroying `SUM(points)` semantics; that
was wrong — `nstp.service.js` writes `totalPoints: payload.questions.length` (lines 620, 653) and always
writes `points: 1` (line 577), so `COUNT(*)` matches application behaviour. Downgraded to LOW: the only
real effect is quietly discarded malformed questions.

**Per the brief's instruction, none of this rests on local success.** Local runs prove syntax and logic;
they say nothing about production row counts, lock contention, or whether the DDL that
`_prisma_migrations` claims to have applied actually landed. The next point is where that bites.

### P6 (HIGH) — `_prisma_migrations` cannot be trusted in this deployment

`20260803170000_repair_coordinator_role_enum` exists, and its comment says it all:

> *Repair deployments where the historical coordinator migration is marked as applied but the
> PostgreSQL enum was not updated.*

That is in-repo proof that this deployment has previously had a migration recorded as applied while its
DDL did not run. Consequently `prisma migrate status` reporting "up to date" is **not** evidence that
`restore_postgres_foreign_keys` physically created its constraints. That must be confirmed against
`pg_constraint` directly (command in §D), because the answer determines whether the §3 defect is
reachable.

---

## 3. Coordinator Scope Migration

I transcribed `20260824120000_require_explicit_coordinator_scope` into an executable harness and ran 33
scenarios rather than reasoning about it on the page. The logic under test is pure relational set logic
and SQL three-valued semantics — `LEFT JOIN` producing NULL, `NOT IN` against NULL, `CASE` without
`ELSE` yielding NULL, and inner-join `UPDATE ... FROM` row selection — all of which SQLite and
PostgreSQL agree on, so set-membership conclusions transfer. Enum enforcement, lock levels, transaction
wrapping, and cast failures were **not** exercised and still need a real PostgreSQL dry run on the
restored copy.

**Result: 30 passed, 3 failed.**

### What is correct

- **All five component types map correctly** (scenarios A). `CWTS`→CWTS, `CWTS_COAST_GUARD`→CWTS,
  `LTS`→LTS, `MTS_ARMY`→MTS, `MTS_NAVY`→MTS.
- **Component-derived scope takes precedence** over `user.data.coordinatorScope` (scenarios B) —
  UPDATE 1 runs first and UPDATE 2 is restricted to `componentId IS NULL`, so metadata can never
  override a component.
- **Every genuine conflict aborts** (scenarios C, 10/10). Guard 1 raises when a component exists and
  valid metadata disagrees with it.
- **Every unmappable metadata form aborts** (scenarios E, 6/6): absent key, JSON `null`, empty string,
  `ROTC`, lowercase `lts`, leading-whitespace `" LTS"`. Guard 2's
  `COALESCE(..., '') NOT IN ('CWTS','LTS','MTS')` correctly treats all of these as unmappable rather
  than guessing.
- **A pre-existing wrong scope is corrected** from the component (scenario H).
- **`DROP DEFAULT` is forward-safe.** `createCoordinator` writes `scope: payload.scope` explicitly
  (`staff.service.js:142`) and mirrors it to `user.data.coordinatorScope` (line 139), so no application
  path relies on the removed default. The consistent double-write also explains why guard 1 will not
  fire spuriously for coordinators created by the current code.

### On the `ELSE 'CWTS'` in UPDATE 1 — not the forbidden fallback

```sql
SET "scope" = CASE
  WHEN component."type" IN ('MTS_ARMY','MTS_NAVY') THEN 'MTS'
  WHEN component."type" = 'LTS' THEN 'LTS'
  ELSE 'CWTS'
END
FROM "nstp_component" component
WHERE component."id" = coordinator."componentId";
```

This reads like a CWTS default but is not one. `NSTPComponentType` is a closed five-value enum,
`component."type"` is `NOT NULL`, and the statement inner-joins `nstp_component` — so `ELSE` is
reachable only by `CWTS` and `CWTS_COAST_GUARD`, both of which genuinely map to CWTS. It is
**semantically correct today**.

It is, however, a latent trap: adding a sixth component type would silently map it to CWTS, and guard
1's `CASE` (which has no `ELSE`, so it returns NULL) would not flag the mismatch either, because
`metadata <> NULL` is NULL and the row goes unmatched. Worth making explicit, but not a defect now.

### P7 (MEDIUM, real defect) — CASE F: dangling `componentId` retains the stale CWTS default

A `coordinator_profile` whose `componentId` is non-NULL but points to no existing `nstp_component` falls
through every branch:

| Statement | Predicate | Why it misses |
|---|---|---|
| Guard 1 | `component."type" IS NOT NULL` | false — `LEFT JOIN` produced NULL |
| Guard 2 | `component."type" IS NULL AND metadata NOT IN (...)` | metadata *is* valid, so no abort |
| UPDATE 1 | `FROM nstp_component WHERE id = componentId` | inner join finds nothing |
| UPDATE 2 | `WHERE coordinator."componentId" IS NULL` | false — it is non-NULL, just dangling |

The row keeps whatever `scope` it had, which for any profile created before this release is the
`DEFAULT 'CWTS'` from `20260803233000`. Harness output:

```
[FAIL] F/DANGLING componentId + valid LTS metadata   expect=LTS   got=scope=CWTS
[FAIL] F/DANGLING componentId + valid MTS metadata   expect=MTS   got=scope=CWTS
!! SILENT CWTS ASSIGNMENT CONFIRMED
```

**This is a wrong-program grant.** The coordinator's `user` row is intact, so they can authenticate, and
`getCurrentCoordinator` will hand them CWTS authority instead of LTS or MTS. The root cause is a
predicate mismatch the guards were clearly meant to cover: guard 2 keys on `component."type" IS NULL`
(true for both a NULL and a dangling `componentId`) while UPDATE 2 keys on `componentId IS NULL` (true
only for NULL). The gap is exactly the difference between those two sets.

### P8 (LOW) — CASE G: orphan `userId` retains CWTS and does not abort

Both guards `JOIN "user"`, so a `coordinator_profile` whose `userId` matches no `user` row is never
examined; both UPDATEs also miss it. The row retains `'CWTS'` and the migration **completes silently**,
contrary to its stated contract of aborting on unmappable data. Security impact is limited — there is no
`user` row to authenticate as — but it breaks the abort-rather-than-correct invariant, and the row
becomes a live wrong-scope grant the moment anyone re-links it.

### Reachability — this is the question that decides deployment

Both cases require broken referential integrity in `coordinator_profile`, so they hinge on whether the
FKs from `restore_postgres_foreign_keys` physically exist in production:

- `coordinator_profile_userId_fkey → user(id) ON DELETE CASCADE`
- `coordinator_profile_componentId_fkey → nstp_component(id) ON DELETE SET NULL`

Reasons to doubt they are there: `coordinator_profile` was created on 2026-07-03 with **no FKs at all**
(only a PK and three indexes) and stayed unconstrained until 2026-08-02; the docs still describe the FK
restore in future tense; and P6 proves this deployment has had DDL silently not run.

If those constraints are **absent**, CASE G is reachable by routine admin action:
`DELETE /admin/accounts/:id` → `nstp.service.js` `deleteAdminResource` → `prisma.user.delete()`. The
route is correctly `ADMIN`-guarded — no authorization hole — but the schema declares `relationMode`
nowhere, so it defaults to `"foreignKeys"` and Prisma does **not** emulate the declared
`onDelete: Cascade`. With no physical FK, deleting a coordinator's user account orphans the profile
rather than cascading. CASE F additionally needs a deleted or never-existent `nstp_component`; no
application path deletes components, so it requires legacy or direct-SQL data.

If those constraints are **present**, both cases are unreachable going forward and any pre-existing
rows are caught by `report:orphans`, which `migrate:deploy` chains first.

**Required action:** verify via `pg_constraint` (§D command 6) and run the two targeted CASE F/G queries
(§D command 7) before migrating. Then add the third guard in §B action 3 so the migration fails closed
instead of quietly assigning CWTS. That guard is additive and fail-closed: it does not weaken
authorization, restore a default, guess a historical mapping, or modify data.

---

## 4. Backup + Restore Plan

**Finding B4 (HIGH): the procedure does not exist.** `backend/MIGRATION_OPERATIONS.md` is 46 lines and
the only runbook in the repository. It mentions backup twice, both in prose:

> line 7 — *"Before production deployment, create and verify a PostgreSQL backup, restore it to..."*
> line 34 — *"...preserve logs, and restore a backup to..."*

`pg_dump` appears **zero times** anywhere in the repository. So do `pg_restore`, `createdb`, and `psql`.
There is no rollback section at all, and the document covers 1 of 18 migrations. The single recovery
mechanism the plan depends on is entirely undocumented — and per §6 it is the *only* recovery path for
most of these migrations.

The commands below close that gap. Run them in order. **The restore test must complete before any
production migration runs.**

```bash
# ── 0. Pin the target and a run stamp ────────────────────────────────────────
export PGHOST=<prod-host> PGPORT=5432 PGUSER=<admin-user> PGDATABASE=<prod-db>
export STAMP=$(date -u +%Y%m%dT%H%M%SZ)
export BACKUP=/var/backups/nstp/nstp-${STAMP}.dump
mkdir -p /var/backups/nstp

# ── 1. Custom-format backup (compressed, selectively restorable) ─────────────
pg_dump --format=custom --compress=9 --verbose \
        --file="${BACKUP}" "${PGDATABASE}"

# ── 2. Verify the backup is readable and complete ────────────────────────────
pg_restore --list "${BACKUP}" > "${BACKUP}.toc"
wc -l < "${BACKUP}.toc"                       # expect hundreds of entries, not 0
grep -c 'TABLE DATA' "${BACKUP}.toc"          # expect one per non-empty table
sha256sum "${BACKUP}" | tee "${BACKUP}.sha256"
# Confirm the security-critical tables are actually present in the archive:
grep -E 'TABLE DATA public (coordinator_profile|instructor_profile|user|grade)\b' "${BACKUP}.toc"

# ── 3. Restore into an isolated scratch database (never the prod DB) ─────────
export SCRATCH=nstp_restore_${STAMP}
createdb "${SCRATCH}"
pg_restore --dbname="${SCRATCH}" --no-owner --no-privileges \
           --exit-on-error --verbose "${BACKUP}"
# --exit-on-error is essential: without it pg_restore reports success despite errors.

export SCRATCH_URL="postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${SCRATCH}"

# ── 4. Orphan report against the restored copy ───────────────────────────────
DATABASE_URL="${SCRATCH_URL}" npm run report:orphans --workspace backend \
  | tee orphans-${STAMP}.json
# MUST be findings: [] AND skippedChecks: [] — an empty result with skips means
# nothing was checked (finding P2).

# ── 5. Preflight against the restored copy ───────────────────────────────────
DATABASE_URL="${SCRATCH_URL}" npm run preflight:production --workspace backend \
  | tee preflight-${STAMP}.json
# MUST be blockingCount: 0 AND zero "status": "SKIPPED" entries (finding P1):
grep -c '"status": "SKIPPED"' preflight-${STAMP}.json    # expect 0

# ── 6. Prisma migration status on the restored copy ──────────────────────────
DATABASE_URL="${SCRATCH_URL}" npx prisma migrate status --schema backend/prisma/schema.prisma

# ── 7. THE REHEARSAL — apply the real migrations to the copy, and time it ────
time DATABASE_URL="${SCRATCH_URL}" npx prisma migrate deploy \
     --schema backend/prisma/schema.prisma
# This is the only honest estimate of the production maintenance window, and the
# only place the enum casts and 33 FK validations are exercised against real data.

# ── 8. Re-run both gates post-migration on the copy ──────────────────────────
DATABASE_URL="${SCRATCH_URL}" npm run report:orphans --workspace backend
DATABASE_URL="${SCRATCH_URL}" npm run preflight:production --workspace backend
# Now that all columns exist, previously-SKIPPED blockers will actually execute.

# ── 9. Tear down only after the results are recorded ─────────────────────────
dropdb "${SCRATCH}"
```

Keep `orphans-*.json`, `preflight-*.json`, the `.toc`, the `.sha256`, and the step-7 timing with the
release record. Step 7 is the single most valuable item in this document: it converts "the migrations
work locally" into a measured statement about production data.

---

## 5. Docker / Prisma Release Safety

Verified correct:

- **The image builds its own Prisma Client from the current schema.** `backend/Dockerfile:5` copies
  `prisma/` before `backend/Dockerfile:6` runs `npx prisma generate`. Ordering is right, so the client
  always matches `schema.prisma`.
- **No stale client is carried in.** `backend/.dockerignore:1` excludes `node_modules`, so the host's
  Windows-built client cannot shadow the image's. The generator block declares no `binaryTargets`, so
  generate targets the native platform — correct here because both build and runtime stages are
  `node:20-alpine`. (This is also the definitive explanation for the sandbox test failure in §9.)
- **Ordinary containers do not migrate.** `CMD ["node", "src/server.js"]` with no `ENTRYPOINT` and no
  migrate hook. Restarting or scaling the app cannot trigger schema changes.
- **Migration is a gated maintenance service.** In `docker-compose.yml`, `migrate` and `seed` both carry
  `profiles: ["maintenance"]` and neither has a `restart:` key, so neither runs on a normal
  `docker compose up`.
- **The intended chain is wired correctly.** `backend/package.json`:
  `"migrate:deploy": "npm run report:orphans && npm run preflight:production && prisma migrate deploy"`.
  npm's `&&` short-circuits on the non-zero `process.exitCode` both scripts set, so a real finding does
  stop the deploy. (Subject to P1/P2 — the gates are correctly *chained*; they are just too willing to
  pass.)
- **No weak secrets.** Every credential in compose uses `${VAR:?...}` required syntax. Nothing is baked
  into an image layer.
- **Prisma CLI is present in the runtime image** (no `npm prune --omit=dev`), which is load-bearing for
  the migrate service rather than an oversight.

### P9 (HIGH) — `backend/build.sh` bypasses both gates

```sh
npm install
npx prisma generate
npx prisma migrate deploy      # ← line 11: no orphan report, no preflight
```

Thirteen lines, referenced by nothing in the repository — no Dockerfile, no compose service, no npm
script, no CI config. That is what makes it dangerous: it is an unowned script whose name invites use by
a PaaS build step or a hurried operator, and it applies `restore_postgres_foreign_keys` and the scope
backfill with **no orphan check at all**. This is the concrete mechanism by which CASE F and CASE G
reach production. Delete it, or change line 11 to `npm run migrate:deploy`.

### P10 (MEDIUM) — no lockfile in the image build context

The Dockerfile copies only `package.json`, so the image resolves dependencies afresh with `npm install`
rather than `npm ci`. The Prisma version in the image can therefore drift from the version CI validated,
and a Prisma minor bump can change generated SQL and `migrate deploy` behaviour. Pin it: copy
`package-lock.json` and use `npm ci`.

### P11 (LOW) — two smaller items

- `backend/.dockerignore:10` excludes `prisma/migrations/migration_lock.toml`. Prisma uses that file to
  detect provider mismatch; excluding it removes a safety check inside the container.
- The container runs as **root** (no `USER` directive). Not a deployment blocker, but unnecessary
  privilege for a Node process.
- `seed` depends only on `postgres: service_healthy`, **not** on `migrate`, so nothing structurally
  prevents seeding an unmigrated database. It is profile-gated, and per the brief seeds must not run in
  production at all — do not pass `COMPOSE_PROFILES=maintenance` to any routine `up`, since that
  re-arms both maintenance services at once.

---

## 6. Rollback Analysis

**The rollback instructions are not realistic, because there are none.** `MIGRATION_OPERATIONS.md` has
no rollback section; its only guidance is "preserve logs, and restore a backup" (line 34) — pointing at
a backup procedure that, per §4, is itself undocumented. Prisma has no `migrate down`; there are no
hand-written down-migrations in the repository.

Assessed per the brief:

**PostgreSQL enum migrations — irreversible, permanently.** PostgreSQL has no
`ALTER TYPE ... DROP VALUE`. `ALTER TYPE "UserRole" ADD VALUE 'COORDINATOR'` and
`ALTER TYPE "NSTPComponentType" ADD VALUE 'CWTS_COAST_GUARD'` cannot be undone. Removing a value
requires creating a replacement type, rewriting every dependent column, and dropping the original — a
multi-hour operation on `user` and `nstp_component`. Any plan assuming enum reversal is fiction. Types
created outright (`CoordinatorScope`, `AssessmentStatus`, `AcademicSemester`, `GradeClassification`,
`GradeInputType`) *can* be dropped once their columns are gone.

**Coordinator scope backfill — irreversible. Restore from backup is the only safe path.**
`require_explicit_coordinator_scope` overwrites `scope` on every coordinator row. The prior per-row
values exist nowhere afterwards. `ALTER COLUMN scope SET DEFAULT 'CWTS'` would restore the *default* but
not the *data* — and doing so is explicitly forbidden. There is no derivation back to the previous
state.

**Assessment question conversion — effectively irreversible.** The inserted rows are identifiable
(`id LIKE 'legacy-%'`) and could be deleted, and `status`/`order` columns could be dropped. But
`UPDATE "quiz" SET "totalPoints" = <count>` overwrote the prior `totalPoints` with no record of the old
value. Restore from backup is the only way to recover it.

**Semester grade migration — genuinely reversible.** Ten nullable columns with **no backfill**, plus two
indexes, one unique index, and one FK. Dropping the columns and types returns the database to its exact
prior state. This is the one heavy migration with a real down path:

```sql
BEGIN;
ALTER TABLE "grade" DROP CONSTRAINT "grade_componentId_fkey";
DROP INDEX "grade_studentId_componentId_schoolYear_semester_key";
ALTER TABLE "grade"
  DROP COLUMN "componentId",   DROP COLUMN "schoolYear",  DROP COLUMN "semester",
  DROP COLUMN "percentGrade",  DROP COLUMN "numericalGrade",
  DROP COLUMN "classification", DROP COLUMN "releasedAt",
  DROP COLUMN "releasedById",  DROP COLUMN "createdById", DROP COLUMN "updatedById";
DROP TYPE "GradeClassification";
DROP TYPE "AcademicSemester";
COMMIT;
-- then: npx prisma migrate resolve --rolled-back 20260803235900_semester_grade_records
```

`grade_input_conversion` is reversible on the same pattern.

**FK restore — mechanically reversible, but reverting it is a security regression.** Thirty-three
`DROP CONSTRAINT` statements would undo it. Doing so re-opens the orphan window and removes the very
constraints that make the §3 CASE F/G defects unreachable. Treat it as forward-only.

**Deploying an old backend against the new schema — one hard incompatibility.** Most changes are
additive (new nullable columns, new tables, new enum values) and Prisma issues explicit column lists in
`SELECT`, so an older client tolerates extra columns. The breaking change is `DROP DEFAULT` on
`coordinator_profile.scope`: any backend build predating the fix relied on the `DEFAULT 'CWTS'` and
omitted `scope` on insert, which now fails with `23502 not_null_violation`. Coordinator creation would
break outright.

> **Backend rollback must not go earlier than the commit where `createCoordinator` began writing
> `scope` explicitly (`staff.service.js:142`).** Within that bound, application rollback is safe and is
> the preferred recovery for application-level bugs.

**Bottom line, stated plainly as the brief requires:** for the enum additions, the coordinator scope
backfill, and the assessment conversion, **restore from the §4 backup is the only safe recovery path.**
There is no partial or surgical rollback for those three. This makes the untested backup the single
point of failure for the entire release, and is the strongest reason step 7 of §4 must be rehearsed
before touching production.

---

## 7. Post-Deployment Security Smoke Test Matrix

Run against production immediately after migration, before re-opening access. Use fresh private
browsing sessions per principal and capture HTTP status codes. **Any single ✗ is a rollback trigger.**

### 7.1 Per-principal matrix

| # | Principal | Login | `/auth/me` + refresh | API authorization | Writes | Reports | Exports | WebSocket room |
|---|---|---|---|---|---|---|---|---|
| 1 | **ADMIN** | 200, `role: admin` | scope absent | all admin routes 200 | account/component CRUD 200 | all components visible | full workbook | admin room only |
| 2 | **CWTS coordinator** | 200, `coordinatorScope: CWTS` | `coordinatorProfile.scope = CWTS` | CWTS 200; **LTS/MTS 403** | own facilitators only | CWTS + Coast Guard rows only | CWTS-only PDF | CWTS + CWTS_COAST_GUARD only |
| 3 | **LTS coordinator** | 200, `LTS` | `scope = LTS` | LTS 200; **CWTS/MTS 403** | own facilitators only | LTS rows only | LTS-only PDF | LTS only |
| 4 | **MTS coordinator** | 200, `MTS` | `scope = MTS` | MTS 200; **CWTS/LTS 403** | own facilitators only | Army + Navy rows only | MTS-only PDF | MTS_ARMY + MTS_NAVY only |
| 5 | **Facilitator** | 200, `role: instructor` | no coordinator scope | own sections 200; coordinator routes **403** | own sections only | own sections only | own sections only | own section rooms |
| 6 | **Student** | 200, `role: student` | no scope | own records 200; staff routes **403** | own submissions only | own grades only | own transcript only | own enrolment rooms |
| 7 | **Invalid / profileless coordinator** | 200 (auth succeeds) | **`/auth/me` must not return a scope** | **every coordinator route 403** | **all writes 403** | **no report data** | **no export** | **joins no component room** |

Principal 7 is the most important row and the one most easily skipped. Construct it deliberately: a
`user` with `role = COORDINATOR` and **no** `coordinator_profile`. Expected behaviour, per
`getCurrentCoordinator`, is a 403 on missing profile, on a null scope without `componentId`, and on an
unrecognised scope. Confirm the dashboard renders an unavailable state rather than an empty CWTS view —
an empty CWTS view is the signature of the original defect.

### 7.2 Explicit checks beyond the grid

- **Grade PDFs (`ReportsPage`)** — generate as each of principals 2, 3, 4 and open the files. Confirm no
  row from another component appears in any PDF, including in totals, headers, and page footers.
- **Spreadsheet export (`xlsxExport.ts`)** — same three principals. Check **every sheet and every hidden
  column**; a scope leak in an export is invisible in the UI.
- **WebSocket rooms** — inspect the actual `join` calls (`websocket.js:6` uses the shared
  `COORDINATOR_SCOPE_TYPES`). Confirm principal 7 joins **no** component room, and that no coordinator
  joins a room outside their scope.
- **`ModulesPage`** — this page renders before `useCoordinatorScope` reaches `'ready'`, unlike Dashboard
  and Reports. It is safe by construction (server-scoped data, empty disabled picker) but confirm it
  shows no cross-component options during the resolving window.
- **Direct object references** — as principal 3 (LTS), request a known CWTS student, section, module,
  and grade by id. All four must 403 or 404, never 200.

### 7.3 Account-switching transitions

For each transition: log out, log in as the next principal in the **same browser tab**, then verify.
**No previous scope data may survive.**

| Transition | Must verify |
|---|---|
| CWTS → LTS | No CWTS student, section, facilitator, or grade is visible. React-query cache fully evicted. In-memory `runtimeStore` (`nstpData.ts`) cleared. `useCoordinatorScope` passed through `resolving` and re-resolved to LTS — it must not report `ready` with the old scope. |
| LTS → MTS | As above. Component picker offers only Army/Navy. Any LTS report still on screen is discarded, not reused. |
| MTS → Facilitator | All coordinator navigation gone. Coordinator API calls 403. No MTS aggregate counts anywhere in the facilitator shell. |
| Facilitator → Admin | Admin sees all components — expected — but confirm the previous facilitator's section scoping is not still narrowing any admin list. |

Repeat one transition using **browser back-navigation** rather than in-app navigation, and one using
token refresh across the switch. Because `nstpData.ts` keeps an in-memory `Map` rather than
`localStorage`, a full page reload clears it — meaning a **soft** switch is the case that can leak, and
the case worth testing hardest.

---

## 8. Repository Cleanup

The working tree shows **136 files differing** from HEAD, but only **38 contain real content changes**:

```
git diff --ignore-all-space --numstat | awk '$1+$2>0' | wc -l   # → 38
git diff --name-only | wc -l                                     # → 136
```

The other **98 are pure line-ending churn** — HEAD blobs are LF, the working tree is CRLF, there is no
`.gitattributes`, and `core.autocrlf` is unset. `package-lock.json` is the clearest case: 7414
insertions and 7414 deletions, zero real change.

Per the brief, **do not normalize line endings as part of this release.** Stage the 38 real files
individually (`git add` by path, never `git add -A`), and confirm before committing:

```bash
git diff --cached --ignore-all-space --numstat | awk '$1+$2>0' | wc -l   # must equal files staged
```

A `.gitattributes` with `* text=auto` is the right long-term fix, as a **separate** commit after this
release.

**Credentials: clean.** `backend/.env` and `frontend/.env` exist on disk but are gitignored and
untracked. Only the three `.env.example` files are tracked. `frontend/dist/` is present and gitignored.
**Debug statements: none found.**

Notable: `20260824120000_require_explicit_coordinator_scope/migration.sql` is the **only untracked
migration** — all 17 others are tracked. An untracked migration will not reach the production image, so
committing it is mandatory. Full commit classification in §G/§H.

---

## 9. Release Decision

# READY WITH REQUIRED PRE-DEPLOYMENT ACTIONS

**On the test evidence, per the brief's instruction not to claim readiness from local tests:** I did
**not** independently reproduce the stated 227/227. In this Linux sandbox I executed
`scope-mapping-drift.test.js` (**4/4 pass**) and `coordinator-scope-regression.test.js` (**18/18
pass**). `authorization.test.js` returned **30 pass / 1 fail**, and the failure is
`failureType: 'hookFailed'` —

```
PrismaClientInitializationError: Prisma Client could not locate the Query Engine for
runtime "debian-openssl-3.0.x" ... generated for "windows"
```

— an environment artifact (the client was generated on Windows; §5 confirms no `binaryTargets`), **not**
a code defect. Per project convention the client must not be regenerated in place. The remaining backend
and all frontend suites could not run here for the same reason. **The 227/227 figure remains unverified
by this review and must be reconfirmed on the deployment host.**

I did independently confirm the authorization claims by reading and executing code: no CWTS fallback
remains anywhere in `backend/src` (every `'CWTS'` occurrence is a comment, allow-list key, Zod enum
member, or display label), `getCurrentCoordinator` 403s on missing profile / null scope without
`componentId` / unrecognised scope, `websocket.js` joins no component room on unknown scope, and the
frontend map is key-by-key identical to the backend's.

---

### A. Blocking issues

There are **no authorization defects in the running application.** The prior audit's core finding
stands. The blockers are all in deployment mechanics:

1. **`backend/build.sh:11` bypasses both safety gates** (P9). Runs bare `npx prisma migrate deploy` with
   no orphan report and no preflight. Unreferenced by anything, which makes it more dangerous, not less.
2. **Preflight is fail-open on `SKIPPED` blockers** (P1). A blocker that cannot run exits 0, and it
   cannot run precisely when production is behind on migrations.
3. **`report-orphans.mjs` silently skips missing tables** (P2), making "clean" indistinguishable from
   "checked nothing" — while being the only script that detects the §3 CASE F/G conditions.
4. **Production FK state is unverified** (P6) and determines whether P7/P8 are reachable. Cannot be
   settled from `_prisma_migrations`, because `repair_coordinator_role_enum` proves that table has lied
   in this deployment.
5. **No backup or restore procedure exists** (B4/§6). `pg_dump` appears zero times in the repository,
   and restore-from-backup is the *only* recovery path for the enum additions, the scope backfill, and
   the assessment conversion.
6. **CASE F silently assigns CWTS to a dangling-`componentId` coordinator** (P7) — proven by execution,
   a genuine wrong-program grant.

### B. Required pre-deployment actions

1. **Fix or delete `backend/build.sh`.** Change line 11 to `npm run migrate:deploy`, or remove the file.
2. **Make preflight fail closed.** Treat a `SKIPPED` blocker as blocking:
   ```js
   const blocking = results.filter((r) =>
     r.severity === 'BLOCKER' && (r.status === 'FOUND' || r.status === 'SKIPPED'));
   ```
   In `report-orphans.mjs`, record missing tables in `skippedChecks` instead of `continue`, and set a
   non-zero exit when anything was skipped.
3. **Add a third guard to `require_explicit_coordinator_scope`**, before the UPDATEs — closing both
   CASE F and CASE G by aborting instead of defaulting:
   ```sql
   DO $$
   DECLARE broken integer;
   BEGIN
     SELECT COUNT(*) INTO broken
     FROM "coordinator_profile" coordinator
     LEFT JOIN "user" account          ON account."id"   = coordinator."userId"
     LEFT JOIN "nstp_component" component ON component."id" = coordinator."componentId"
     WHERE account."id" IS NULL
        OR (coordinator."componentId" IS NOT NULL AND component."id" IS NULL);
     IF broken > 0 THEN
       RAISE EXCEPTION
         'Aborting: % coordinator_profile row(s) have a dangling userId or componentId. '
         'Resolve via npm run report:orphans before applying this migration.', broken;
     END IF;
   END $$;
   ```
   Additive and fail-closed — it does not weaken authorization, restore a default, guess a mapping, or
   modify data.
4. **Add a matching BLOCKER check to preflight** for dangling `coordinator_profile.componentId`, so the
   condition is caught before the migration rather than by it.
5. **Confirm the production FK state** via §D command 6. If `coordinator_profile_userId_fkey` is absent,
   note that `DELETE /admin/accounts/:id` currently orphans coordinator profiles and freeze that
   operation until the FK restore lands.
6. **Complete the full §4 sequence, including the step-7 rehearsal on the restored copy.** Do not skip
   it — it is the only measurement of the real maintenance window and the only test of the enum casts
   and 33 FK validations against production data.
7. **Reconfirm 227/227 on the deployment host** (Linux-generated Prisma client), since this review could
   not.
8. **Commit the §G files** — most critically the untracked migration, which will not otherwise ship.
9. *(Recommended)* Make the UPDATE 1 mapping explicit with an `ELSE RAISE`, and pin the image build to
   `npm ci` with a copied lockfile (P10).

### C. Exact migration sequence

```bash
# 1 — Announce and enter maintenance mode. Stop application traffic.
docker compose stop backend frontend

# 2 — Backup and verify (§4 steps 1–2). Do not proceed on any pg_restore --list error.

# 3 — Restore to scratch and REHEARSE (§4 steps 3–8). Record the step-7 timing.
#     Do not proceed unless orphans=[] AND skipped=[] AND blockingCount=0.

# 4 — Verify physical FK state and the CASE F/G conditions on PRODUCTION (§D 6–7).

# 5 — Apply migrations through the gated maintenance service.
docker compose run --rm migrate
#   which runs, in order and short-circuiting on failure:
#     npm run report:orphans  &&  npm run preflight:production  &&  prisma migrate deploy
#   NEVER run `npx prisma migrate deploy` directly, and NEVER use backend/build.sh.

# 6 — Confirm all 18 migrations applied.
docker compose run --rm migrate npx prisma migrate status

# 7 — Re-run both gates post-migration; previously-skipped blockers now execute.
docker compose run --rm migrate npm run report:orphans
docker compose run --rm migrate npm run preflight:production

# 8 — Start the application.
docker compose up -d backend frontend

# 9 — Run the §7 smoke matrix BEFORE re-opening public access.

# 10 — Re-open access. Retain all JSON artefacts with the release record.
```

Do **not** run `npm run seed` at any point. Do not set `COMPOSE_PROFILES=maintenance` on a routine
`up` — it re-arms both `migrate` and `seed`.

### D. Exact verification commands

```bash
# 1 — Backup integrity
pg_restore --list "${BACKUP}" | grep -E 'TABLE DATA public (coordinator_profile|user|grade)\b'

# 2 — Orphan report (expect findings: [] AND skippedChecks: [])
npm run report:orphans --workspace backend

# 3 — Preflight (expect blockingCount: 0 AND zero SKIPPED)
npm run preflight:production --workspace backend
npm run preflight:production --workspace backend | grep -c '"status": "SKIPPED"'   # expect 0

# 4 — Migration status (expect 18 applied, none pending, none failed)
npx prisma migrate status --schema backend/prisma/schema.prisma

# 5 — Schema/DB agreement (expect no drift)
npx prisma migrate diff \
  --from-schema-datasource backend/prisma/schema.prisma \
  --to-schema-datamodel   backend/prisma/schema.prisma --exit-code

# 6 — PHYSICAL FK STATE — authoritative; _prisma_migrations is not (P6)
psql "${DATABASE_URL}" -c "
  SELECT conname, confdeltype
  FROM pg_constraint
  WHERE conrelid = 'coordinator_profile'::regclass AND contype = 'f'
  ORDER BY conname;"
# Expect exactly:
#   coordinator_profile_componentId_fkey | n   (SET NULL)
#   coordinator_profile_userId_fkey      | c   (CASCADE)

# 7 — CASE F and CASE G (both MUST return zero rows)
psql "${DATABASE_URL}" -c "
  SELECT c.\"id\", c.\"componentId\" FROM \"coordinator_profile\" c
  LEFT JOIN \"nstp_component\" n ON n.\"id\" = c.\"componentId\"
  WHERE c.\"componentId\" IS NOT NULL AND n.\"id\" IS NULL;"
psql "${DATABASE_URL}" -c "
  SELECT c.\"id\", c.\"userId\" FROM \"coordinator_profile\" c
  LEFT JOIN \"user\" u ON u.\"id\" = c.\"userId\"
  WHERE u.\"id\" IS NULL;"

# 8 — Post-migration: scope column has NO default and is NOT NULL
psql "${DATABASE_URL}" -c "
  SELECT column_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'coordinator_profile' AND column_name = 'scope';"
# Expect: scope | NO | (null)

# 9 — Post-migration: every coordinator scope agrees with its component
psql "${DATABASE_URL}" -c "
  SELECT c.\"id\", c.\"scope\", n.\"type\" FROM \"coordinator_profile\" c
  JOIN \"nstp_component\" n ON n.\"id\" = c.\"componentId\"
  WHERE (n.\"type\" IN ('MTS_ARMY','MTS_NAVY') AND c.\"scope\" <> 'MTS')
     OR (n.\"type\" = 'LTS' AND c.\"scope\" <> 'LTS')
     OR (n.\"type\" IN ('CWTS','CWTS_COAST_GUARD') AND c.\"scope\" <> 'CWTS');"
# MUST be zero rows.

# 10 — Application checks on the deployment host
npm test --workspace backend          # expect 127 pass
npm test --workspace frontend         # expect 75 pass
npx tsc --noEmit --project frontend
npm run build --workspace frontend
docker compose config >/dev/null && echo "compose OK"
```

### E. Rollback trigger conditions

Roll back immediately if any of these occur.

**Abort before migrating** (no rollback needed — nothing has changed):

- `pg_restore --list` errors, or the `.toc` is missing `coordinator_profile`/`user`/`grade` data
- Orphan report returns any finding, or any `skippedChecks` entry
- Preflight returns `blockingCount > 0`, or any `SKIPPED` blocker
- §D command 7 returns any row (CASE F or CASE G present in production)
- The step-7 rehearsal fails, or exceeds the agreed maintenance window

**Restore from backup** (§6: the only safe path for these):

- `prisma migrate deploy` fails **after** `restore_postgres_foreign_keys` or
  `require_explicit_coordinator_scope` has committed
- §D command 9 returns any row — a coordinator's scope disagrees with their component
- Any coordinator in the §7 matrix sees data outside their scope, in the UI, a PDF, or a spreadsheet
- Principal 7 (invalid/profileless coordinator) receives any component data at all
- Scope data survives an account switch (§7.3)
- Post-migration orphan report finds newly orphaned rows

**Application-only rollback** (redeploy the previous image, keep the schema — safe because the changes
are additive):

- Application errors with no data-integrity symptom and no scope leak
- **Hard limit:** do not roll the backend earlier than the commit where `createCoordinator` began
  writing `scope` explicitly (`staff.service.js:142`). Earlier builds relied on the removed
  `DEFAULT 'CWTS'` and will fail coordinator creation with `23502`.

**Never** attempt to reverse an enum addition, and never re-add `DEFAULT 'CWTS'` to
`coordinator_profile.scope` as a recovery step.

### F. Post-deployment smoke checklist

1. `prisma migrate status` — 18 applied, 0 pending, 0 failed
2. `report:orphans` — `findings: []`, `skippedChecks: []`
3. `preflight:production` — `blockingCount: 0`, zero `SKIPPED`
4. §D command 8 — `scope` is `NOT NULL` with no default
5. §D command 9 — zero scope/component disagreements
6. §D command 6 — both `coordinator_profile` FKs physically present
7. All seven principals in §7.1 log in with the expected role and scope
8. Cross-scope API denial: LTS coordinator gets 403 on CWTS and MTS routes (and the mirror cases)
9. Principal 7 gets 403 on every coordinator route and renders an unavailable state, not an empty CWTS view
10. CWTS, LTS, and MTS report PDFs each contain only their own component's rows
11. Spreadsheet exports checked sheet by sheet, including hidden columns
12. WebSocket rooms match scope; principal 7 joins no component room
13. All four §7.3 transitions leave no residual scope data, including one soft switch and one across a token refresh
14. Direct object reference probes across scope all 403/404
15. Five `nstp_component` rows present with correct types (they come from a data migration, not a seed)
16. Error logs clean of `23502`, `23503`, and `PrismaClientKnownRequestError`

### G. Files that should be committed

The 38 real-change files, staged individually by path — never `git add -A`.

**Must commit (release will be incorrect without them):**

- `backend/prisma/migrations/20260824120000_require_explicit_coordinator_scope/migration.sql` — *with the
  §B action 3 guard added.* The only untracked migration; it will not reach the image otherwise.
- `backend/prisma/schema.prisma` — `scope` with no default
- `backend/scripts/preflight-production.mjs` — *with the §B action 2 fail-closed fix*; already referenced
  by `package.json` and the `lint` chain
- `backend/package.json` — the gated `migrate:deploy` chain
- `backend/src/modules/nstp/nstp.authorization.js`, `nstp.controller.js`, `nstp.routes.js`,
  `nstp.service.js` — fail-closed authorization
- `backend/src/modules/staff/staff.service.js` — `COORDINATOR_SCOPE_TYPES` single authority
- `backend/src/websocket.js` — scope-correct room joins
- `backend/src/modules/grades/grades.service.js`
- `backend/build.sh` — *fixed or deleted* (§B action 1)
- `docker-compose.yml`, `package.json`, `frontend/package.json`

**Frontend source (all listed real-change files), notably:**

- `frontend/src/services/authUser.ts` — `normalizeAuthenticatedUser`, the single scope-resolution point
- `frontend/src/hooks/useCoordinatorScope.ts` — the three-state machine
- `frontend/src/services/coordinator.ts`, `services/staff.ts`, `services/grades.ts`
- `frontend/src/data/nstpComponents.ts`, `data/nstpData.ts`
- `frontend/src/utils/studentImport.ts`, `utils/xlsxExport.ts`
- `frontend/src/App.tsx`, `components/layout/RoleShell.tsx`, and the feature pages listed in §8

**Tests (all currently untracked — commit them; they are the regression net):**

- `backend/test/coordinator-integration.test.js`, `coordinator-scope-regression.test.js`,
  `scope-mapping-drift.test.js`, plus modified `authorization.test.js`, `staff-scope.test.js`
- `frontend/src/__tests__/coordinatorIntegration.test.ts`, modified `spreadsheet.test.ts`
- `frontend/test/auth-normalization.test.ts`, `coordinator-component-regression.test.ts`,
  `register-ts-loader.mjs`, `ts-extension-loader.mjs`

**Documentation:**

- `backend/MIGRATION_OPERATIONS.md` — extend with the §4 backup/restore commands and the §6 rollback
  analysis, which are the largest gaps in the release

### H. Files that should remain uncommitted

- **The 98 line-ending-only files.** Verify nothing whitespace-only is staged:
  `git diff --cached --ignore-all-space --numstat | awk '$1+$2>0' | wc -l` must equal the number of
  files staged. `package-lock.json` (7414/7414, zero real change) is the one to watch. A `.gitattributes`
  belongs in a **separate** later commit.
- **`backend/.env`, `frontend/.env`** — real credentials; correctly gitignored and untracked. Keep it
  that way; only the `.env.example` files are tracked.
- **`frontend/dist/`** — build output, gitignored.
- **`COORDINATOR_AUDIT.md`, `COORDINATOR_HARDENING_REPORT.md`, `COORDINATOR_INTEGRATION_REPORT.md`** —
  three untracked point-in-time audit reports at the repo root. `COORDINATOR_AUDIT.md` is **actively
  stale**: lines 18 and 204 still describe `scope` as defaulting to CWTS, which
  `schema.prisma:178` contradicts. Committing stale security documentation is worse than not having it.
  Either fold the durable conclusions into `backend/MIGRATION_OPERATIONS.md` and delete these three, or
  move them to a `docs/audits/` directory with dates in the filenames.
- **This document.** By the same standard, `PRODUCTION_DEPLOYMENT_REVIEW.md` is a fourth point-in-time
  report at the repo root and should not be committed as-is. Its durable content — the §4 backup/restore
  commands, the §6 rollback analysis, and the §D verification commands — belongs in
  `backend/MIGRATION_OPERATIONS.md`. Keep this file as the release record, outside the repository or in
  `docs/audits/2026-08-24-production-readiness.md`.
- **Local Prisma Client artefacts.** Do not commit anything from `node_modules/.prisma`. The generated
  client is Windows-built; the image regenerates it during build (§5).

---

## Summary

The coordinator scope security work is sound and I verified its central claims independently rather than
taking them on report. Authorization is fail-closed, the CWTS default is gone from the schema, and no
fallback path survives in the backend.

The gap between that and a safe deployment is entirely in release mechanics: two gate scripts that exit
zero when they cannot do their job, an orphaned build script that skips both, a production constraint
state nobody has actually looked at, one narrow migration defect found only by executing the logic, and
a backup procedure that is the sole recovery path for three irreversible migrations yet appears nowhere
in the repository.

Those are ordinary release-engineering problems with small, well-defined fixes. Work through §B, then
§C, and this is a safe deployment. Skip the §4 rehearsal and the release is resting on an untested
backup.
