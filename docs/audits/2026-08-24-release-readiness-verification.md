# Release Readiness Verification — Coordinator Scope Hardening Release

**Date:** 2026-08-24
**Repository:** `bipsu_nstp` — branch `main`, HEAD `6e5ca8c` (*feat(grades): add BiPSU automatic grade conversion*)
**Scope of this pass:** the release machinery, not the coordinator authorization model.

> This is a dated, point-in-time audit. Durable operational content belongs in
> `backend/MIGRATION_OPERATIONS.md`, which is the authoritative runbook. If this
> file and the runbook ever disagree, the runbook wins. This document is not
> committed automatically.

---

## 1. Final verdict

### READY WITH REQUIRED OPERATOR ACTIONS

Coordinator authorization was already sound and fail-closed; it was left alone, as instructed. Every one of the eight enumerated blockers was in the release machinery, and all eight are now closed in code. What remains is genuinely operator-side and cannot be discharged by a code change: taking a backup that has been *proven* restorable, rehearsing the migration on that restored copy, staging two untracked paths correctly, and honouring an asymmetric rollback ordering rule.

The verdict is not `READY FOR PRODUCTION DEPLOYMENT` for one honest reason: **the decisive evidence cannot be produced in this environment.** No PostgreSQL server and no Docker daemon are available here, so the migration has never been executed against real PostgreSQL by me, and the backend container image has never been built. CI covers the first of those (see §8); nothing covers the second (see §6). Declaring full readiness would mean claiming production readiness on the strength of local tests alone, which the brief explicitly forbids.

The verdict is emphatically not `NOT READY`: there is no known open defect, every gate now fails closed, and the failing tests in this sandbox are platform artifacts with zero assertion failures.

---

## 2. Blockers fixed

| Issue | Before | After | Status |
|---|---|---|---|
| **1.** `backend/build.sh` bypassed the gates | Ran bare `npx prisma migrate deploy`; 13 lines, referenced by nothing, so DDL and the scope backfill could apply with no gate having run | Calls `npm run migrate:deploy` under `set -euo pipefail`; header comment forbids reintroducing a bare deploy and explains why | **FIXED** |
| **2.** `preflight-production.mjs` exited 0 on a skipped BLOCKER | A check whose table/column was missing became `status:'SKIPPED'`; `blockingCount` counted only `'FOUND'`, so a BLOCKER that never ran did not block — and it skipped precisely when the DB was behind on migrations, i.e. at deploy time | A SKIPPED BLOCKER blocks. Bootstrap (no tables at all) remains a legitimate exemption pre-migration, but not after deploy | **FIXED** |
| **3.** `report-orphans.mjs` silently skipped missing tables | Bare `continue`, not even recorded in `skippedChecks`; a green run was indistinguishable from one that checked nothing. `count: sample.length` saturated at `LIMIT 100` | Missing tables/columns are recorded as SKIPPED and block; `COUNT(*) OVER()` reports true scale independent of the sample limit | **FIXED** |
| **4.** Scope migration preserved stale CWTS on a dangling relationship | CASE F: `componentId` non-NULL but dangling — both guards skipped, both UPDATEs missed, row kept stale `'CWTS'` while the user could still authenticate. CASE G: orphan `userId` never examined | Additive fail-closed guards + a post-backfill `DO` block that `RAISE EXCEPTION` on any component/scope disagreement. `NOT NULL` (inherited) is the backstop: an unmapped type yields NULL and aborts the transaction | **FIXED** |
| **5.** Production FK state unverifiable independently of `_prisma_migrations` | `prisma migrate status` reports a migration as applied even when its DDL is absent — and this repo contains two repair migrations proving that has already happened here | `scripts/verify-schema.mjs` reads `pg_constraint` and checks all 38 FKs and their `ON DELETE` actions; runs after deploy inside the gated chain | **FIXED** |
| **6.** Backup / restore / rehearsal absent from the repo | `pg_dump` appeared zero times; the only runbook was 46 lines, mentioned backup twice in prose with no commands, and had no rollback section | `backend/MIGRATION_OPERATIONS.md` rewritten to 526 lines / 11 sections: approved path, provable backup, rehearsal, immutability, recovery, rollback triggers. No secrets | **FIXED** |
| **7.** New explicit-scope migration untracked | The migration that performs the security-relevant backfill was not in version control and would not ship | Verified present and complete on disk; **staging is an operator action** — see §9 | **CODE COMPLETE / OPERATOR ACTION** |
| **8.** Docker dependency install not reproducible | Backend image copied only `package.json` and ran `npm install`, resolving versions afresh per build, so the image could drift from what CI tested | Root build context + `npm ci --workspace backend --include-workspace-root --include=dev` against the single root lockfile | **FIXED (build unverified — see §6)** |

Two smaller corrections made along the way, both surfaced by checking rather than assuming: the runbook originally documented the rollback direction **backwards** (§7), and two tests in `staff-scope.test.js` had become assertions about file layout rather than behaviour after the checks were extracted into `scripts/lib/` — they were replaced with four real behavioural tests in `release-gate.test.js`, each mutation-verified.

---

## 3. Migration immutability decision

**Decision: the existing 17 migrations are treated as immutable. The release adds exactly one new migration and edits no historical one.**

Prisma records a checksum per migration in `_prisma_migrations`. Editing an already-applied migration file makes `migrate deploy` fail with a checksum mismatch on every environment that has already applied it, so amending history is not a recovery technique — it is a way to break every deployed environment at once.

The new migration is `20260824120000_require_explicit_coordinator_scope` (158 lines), which brings the total to 18.

**Operations in this release that have no inverse**, and for which restore-from-backup is therefore the only recovery path:

- **Enum additions.** PostgreSQL has no `ALTER TYPE ... DROP VALUE`. `UserRole.COORDINATOR` and `NSTPComponentType.CWTS_COAST_GUARD` are permanent once added (`20260703023044_add_coordinator_role`, repaired by `20260803170000_repair_coordinator_role_enum`).
- **The coordinator scope backfill.** It overwrites `coordinator_profile.scope`; prior values are not recoverable from the database afterwards.
- **The assessment conversion.** `UPDATE quiz SET totalPoints = COUNT(*)` destroys the previous value.

Cleanly reversible by contrast: `semester_grade_records` and `grade_input_conversion` add nullable columns with no backfill.

**`npm run migrate:recover` does not perform recovery.** It prints a refusal and exits 1 by design (`scripts/resolve-failed-migrations.mjs`), so that neither a restart hook nor an operator in a hurry can `prisma migrate resolve` a failed migration without human review. Resolving a failed migration is a deliberate, documented, manual act.

---

## 4. Gate behaviour

The approved path is a single `&&` chain, so any non-zero exit aborts it before the next stage:

```
report:orphans  &&  preflight:production  &&  prisma migrate deploy  &&  verify:schema
```

Note the ordering: both read-only gates run **before** any DDL. `verify:schema` runs after, and cannot prevent a bad migration — its job is to refuse to let a deployment be *reported* successful when the physical schema is not what the authorization logic assumes.

| Situation | Behaviour | Exit |
|---|---|---|
| **Clean run** | All 16 preflight checks and 38 orphan relationships execute and return no rows; `prisma migrate deploy` applies; `verify:schema` confirms all 38 FKs present with the declared `ON DELETE` | **0** — deployment proceeds |
| **A finding** | The offending check reports `FOUND` with a true `COUNT(*) OVER()` total and a sample capped at `SAMPLE_LIMIT` (100). BLOCKER findings set `blockingCount > 0` | **1** — aborts before DDL |
| **A BLOCKER that could not run** | Recorded as `SKIPPED` with the specific missing requirement (`table:x` or `column:x.y`), and **blocking**. The check is *not* converted into a fake finding — `statusCounts.FOUND` stays 0 — but the deployment still fails | **1** — aborts before DDL |
| **A query failure** | The error propagates; the gate does not swallow it | **1** — aborts before DDL |
| **Empty database, pre-migration** | Legitimate bootstrap: nothing has been migrated, so nothing can be dirty. Skips do not block | **0** |
| **Empty database, after deploy** | `applyPostDeployPolicy` inverts the exemption — an empty DB at this point means the deploy did not apply what it reported applying and the gate verified nothing | **1** |

Verified empirically in this sandbox: with no reachable database, `report:orphans`, `preflight:production`, and `verify:schema` **each exit 1**. Because `report:orphans` is first in the chain, `prisma migrate deploy` is never reached. That is the fail-closed property the release exists to establish.

A SKIPPED check never touches the database — asserted by a test that makes `runQuery` throw if reached.

---

## 5. Database-scope migration verification

The mapping is exhaustive over the closed 5-value `NSTPComponentType` enum and **deliberately has no `ELSE`**. The two UPDATE statements *partition* the table between them (resolvable `componentId`, versus `componentId IS NULL`) — neither overwrites the other's rows.

| Case | Input | Result |
|---|---|---|
| **CWTS** | `component.type = 'CWTS'` | → `scope = 'CWTS'` |
| **CWTS (Coast Guard)** | `component.type = 'CWTS_COAST_GUARD'` | → `scope = 'CWTS'` |
| **LTS** | `component.type = 'LTS'` | → `scope = 'LTS'` |
| **MTS (Army)** | `component.type = 'MTS_ARMY'` | → `scope = 'MTS'` |
| **MTS (Navy)** | `component.type = 'MTS_NAVY'` | → `scope = 'MTS'` |
| **Metadata fallback** | `componentId IS NULL`, scope derived from `user.data->>'coordinatorScope'` | Applied only to the `componentId IS NULL` partition |
| **Conflict** | Component type and account metadata disagree | **`RAISE EXCEPTION`** — names the profile IDs and points at `preflight:production` |
| **Invalid metadata** | Metadata value outside the closed label set `('CWTS','LTS','MTS (Army)','MTS (Navy)','CWTS (Coast Guard)')` | **BLOCKER** in preflight; migration `RAISE EXCEPTION` if it reaches the backfill |
| **Dangling `componentId`** | Non-NULL `componentId` pointing at no component (**the original CASE F defect**) | **`RAISE EXCEPTION`** — no longer keeps a stale `'CWTS'` |
| **Orphan `userId`** | `coordinator_profile.userId` with no `user` row (**CASE G**) | **`RAISE EXCEPTION`** — no longer skipped by the guards' `JOIN "user"` |

Fail-closed backstop, re-confirmed fresh: `coordinator_profile.scope` was created `NOT NULL DEFAULT 'CWTS'` in `20260803233000`. This release **only drops the DEFAULT** (`schema.prisma:178` now reads `scope CoordinatorScope` with no `@default`). The `NOT NULL` therefore survives, and any component type not covered by the exhaustive `CASE` yields NULL → constraint violation → the whole migration transaction rolls back. There is no open-ended `ELSE CWTS` anywhere in the authorization-relevant transformation.

No previous scope data survives account switching, and no historical coordinator mapping is guessed: where the data cannot establish an authoritative mapping, the migration aborts rather than choosing.

**Hand-verification after deploy** (runbook §5.1) — the two FKs with authorization consequences:

```sql
SELECT conname, confdeltype FROM pg_constraint
WHERE conrelid = 'coordinator_profile'::regclass AND contype = 'f';
```

Expect `coordinator_profile_userId_fkey` = `c` (CASCADE — deleting the account removes the grant) and `coordinator_profile_componentId_fkey` = `n` (SET NULL — deleting a component must not delete the coordinator). `schema.prisma` sets no `relationMode`, so it defaults to `foreignKeys` on PostgreSQL and these actions are DB-enforced; a declared cascade whose physical constraint is missing is **inert**, and `migrate status` will still say "applied".

---

## 6. Docker / release path

There is exactly **one** lockfile: `/package-lock.json` (lockfileVersion 3, workspaces `backend` + `frontend`, 524 packages). A backend-only build context cannot see it — which is precisely why the image used to run `npm install`. So `backend/Dockerfile` now builds from the **repository root** (`context: .`, `dockerfile: backend/Dockerfile`) and runs:

```
npm ci --workspace backend --include-workspace-root --include=dev
```

Both dependency trees are copied to the runtime stage, and this is load-bearing rather than defensive: the lockfile pins **34** entries under `backend/node_modules/` — verified, and including `@prisma/client`, `prisma`, and `dotenv`. The generated Prisma client is written next to the resolved package, at `/app/backend/node_modules/.prisma/client`. Copying only `/app/node_modules` produces a runtime `MODULE_NOT_FOUND`.

`.dockerignore` excludes `**/node_modules` (which keeps the developer's Windows-platform Prisma client from shadowing the correctly generated one) and `**/.env*`, and deliberately does **not** exclude `migration_lock.toml` (Prisma's provider-mismatch check) or the lockfile — confirmed, so the `COPY` will succeed. `openssl` is installed in *both* stages so Prisma's platform detection agrees between build and runtime.

`CMD` is `node src/server.js` with **no migration hook**. Schema changes are applied only by a deliberate operator-initiated `npm run migrate:deploy`.

In `docker-compose.yml`, `migrate` sits in `profiles: ["maintenance"]` and runs the gated `npm run migrate:deploy`. **`seed` is isolated in its own separate `["seed"]` profile** — specifically so that bringing up the maintenance profile cannot also seed. Migration and seeding are never coupled, and the service carries a `DO NOT RUN THIS AGAINST PRODUCTION` banner.

**Verification gap, stated plainly.** CI's `container-smoke` job builds **only the frontend image** (`docker build ./frontend`). Nothing in `.github/workflows/ci.yml` references `backend/Dockerfile`, and Docker is unavailable in this sandbox. **The backend image has therefore never been built** — neither by CI nor by me. The `npm ci` change is correct by inspection and every factual claim in its comments has been verified against the lockfile, but "correct by inspection" is not "it builds". See §10.

`frontend/Dockerfile` was left untouched, as instructed.

---

## 7. Backup / restore runbook summary

`backend/MIGRATION_OPERATIONS.md` (526 lines, 11 sections, no secrets — only `postgresql://USER:PASSWORD@HOST:5432/DBNAME` and `$SCRATCH` placeholders).

**A backup is not a backup until it has been restored.** The runbook's §2 requires: `pg_dump` in custom format, then `pg_restore --list` to confirm the archive is readable, then an actual restore into a scratch database with `--exit-on-error`, then a row-count comparison against the source. The expected table count is derived from the live database via `information_schema.tables` rather than hardcoded — an earlier draft of this document hardcoded 18, which was wrong (18 is the count of FK-involved tables; the schema has 29 models / 30 tables).

**The restore test happens BEFORE production migrations are touched.** §3 then rehearses the full migration on that restored copy — 14 steps, ending in the post-deploy checks — so the first time the migration meets real data is never in production. **`DO NOT RUN SEED IN PRODUCTION`** is stated explicitly; seeding is not coupled to migration anywhere.

### 7.1 Rollback ordering is asymmetric — the finding

This was initially documented **backwards**, and the error was caught by checking the deployed code at `git HEAD` rather than reasoning about it. The previous backend has a **third** `coordinatorProfile` write site — `nstp.service.js:711`, a `coordinatorProfile.upsert` that does **not** supply `scope` and relied on `DEFAULT 'CWTS'`. This release removes that upsert; the two remaining write sites (`staff.service.js` create and update) both pass `scope` explicitly.

| Application | Database | Outcome |
|---|---|---|
| This release | migrated | Correct. Both remaining write sites supply scope explicitly. |
| This release | pre-migration (restored) | Works. Explicit values override the column default. |
| Previous release | pre-migration (restored) | Works, with the original defaulting bug. |
| **Previous release** | **migrated** | **Breaks.** NOT NULL violation on coordinator creation. |

Restoring the database **alone** is safe. Rolling the application back **alone** is not. **Bring the database back first, or simultaneously — never the application first.**

**Rollback triggers** are in §12. Honest scope note: `verify:schema` checks `confdeltype` (ON DELETE) only, not `confupdtype`. All 38 FKs are `ON UPDATE CASCADE`; that is verified by eye, not by the gate, and carries no authorization consequence.

---

## 8. Fresh automated results

All values below were measured in this session. None are reused from the earlier review.

| Check | Result |
|---|---|
| Environment | Node **v22.23.2**, npm **10.9.8** (CI pins Node 24) |
| `npm run backend:lint` | **exit 0** — all 41 `node --check` targets pass |
| `npm --workspace backend test` (`node --test`) | **220 tests / 211 pass / 9 fail** |
| ↳ nature of the 9 failures | **0 `AssertionError`**, **9 `PrismaClientInitializationError`** across 7 files — engine built for `windows`, sandbox needs `debian-openssl-3.0.x`. Environmental, not logic |
| 5 no-DB release-gate suites | **90 / 90 pass, 0 fail** (`release-gate`, `foreign-key-integrity`, `migration-scope-guard`, `scope-mapping-drift`, `coordinator-scope-validation`) |
| `npm run frontend:typecheck` (`tsc --noEmit`) | **exit 0** |
| `npm run frontend:test:regression` | **25 / 25 pass, exit 0** |
| `npm run frontend:test` (vitest) | **FAILS** — `Cannot find module @rollup/rollup-linux-x64-gnu`; only `rollup-win32-*` binaries are installed in this Windows checkout. Environmental |
| Gates with no reachable DB | `report:orphans` **1**, `preflight:production` **1**, `verify:schema` **1** — fail closed; chain aborts before DDL |
| `git diff --check` | **0 conflict markers**. ~23k trailing-whitespace reports are the CR of CRLF lines — see §9 |
| `docker compose config` / backend image build | **Could not execute** — no Docker daemon in the sandbox. `docker-compose.yml` validated as YAML instead: services `postgres`, `backend`, `frontend`, `migrate`, `seed` |
| `npm run migrate:status` | **Could not execute** — requires a live database |
| `npm run test:migration-guard` | **Could not execute** — requires real PostgreSQL; runs in CI (`migration-smoke`) |

**What ran, and what this does and does not prove.** The reliable signals here are `tsc --noEmit` and the pure-logic `node --test` suites, which need neither a Prisma engine nor PostgreSQL by design — the checks were extracted into `scripts/lib/` with injected `{tables, columns, runQuery}` precisely so the gate logic is testable without a database. Those are green. The four behavioural tests added to `release-gate.test.js` were each **mutation-verified**: downgrading the unknown-component BLOCKER to REVIEW was caught, opening the closed `NOT IN` label set was caught, disabling the orphan skip was caught (3 failures), and the control run stayed green.

What this does **not** prove is that the PL/pgSQL parses, that the `::"CoordinatorScope"` casts resolve, or that `RAISE EXCEPTION` rolls the transaction back. Only real PostgreSQL can establish that. CI's `migration-smoke` job does exactly that against `postgres:16-alpine`: it applies migrations to a fresh database, then **re-runs both gates against the now-migrated schema** (so that every check's SQL actually executes rather than being skipped as bootstrap), then runs `test:migration-guard`, then `verify:schema`, then `migrate:status`. That job is the evidence that matters, and it must be green on this branch before deploying.

---

## 9. Git status and staging recommendation

Branch `main`, HEAD `6e5ca8c`. Working tree: **142 modified tracked files, 0 staged, 67 untracked.**

Of the 142 modified files, only **44 have real content changes**. The other **98 are pure CRLF churn** — HEAD is LF, the worktree is CRLF, there is no `.gitattributes`, and `core.autocrlf` is unset. `package-lock.json` is CRLF-only with **zero** semantic change (verified with `--ignore-all-space`).

**Do not stage with `git add -A`. Do not mass-normalize line endings as part of this release.** Line-ending normalization is a legitimate cleanup, but bundling it with a security-sensitive migration would make the diff unreviewable at exactly the moment review matters most. Stage the 44 real changes by path.

Verify what you have staged is real:

```bash
git diff --cached --ignore-all-space --numstat | awk '$1+$2>0' | wc -l
```

`git diff --check` is **not** a usable cleanliness signal in this repo — it flags the CR on every CRLF line (~23k reports). It found **0 conflict markers**, which is the part that matters. Check individual files with `git diff --check -- <path>` and read only the "conflict marker" lines.

### Untracked paths that MUST ship

- `backend/prisma/migrations/20260824120000_require_explicit_coordinator_scope/migration.sql` — **blocker #7**
- `backend/scripts/lib/{release-gate,preflight-checks,orphan-checks,schema-snapshot,foreign-key-integrity}.mjs`
- `backend/scripts/{preflight-production,verify-schema}.mjs`
- `backend/test/{release-gate,foreign-key-integrity,migration-scope-guard,scope-mapping-drift,coordinator-scope-validation,coordinator-integration,coordinator-scope-regression}.test.js` and `backend/test/migration-guard.pgtest.sh`
- the untracked `frontend/src/**` and `frontend/test/**` scope files

### Staging trap

`backend/scripts/lib/` also contains **37 `.fuse_hidden*` files** — sandbox filesystem artifacts from files being replaced while open. They are **not** gitignored. **Never `git add backend/scripts/lib/` wholesale**; add the five `.mjs` files by name. They should be deleted, not committed.

### Do not commit

The four point-in-time audit reports at the repository root (`COORDINATOR_AUDIT.md`, `COORDINATOR_HARDENING_REPORT.md`, `COORDINATOR_INTEGRATION_REPORT.md`, `PRODUCTION_DEPLOYMENT_REVIEW.md`) should not be committed automatically. `COORDINATOR_AUDIT.md` is actively **stale** on the CWTS default and must not become authoritative documentation. This file is deliberately in `docs/audits/` rather than becoming a fifth root-level report; the authoritative operational document is `backend/MIGRATION_OPERATIONS.md`.

---

## 10. Remaining operator actions

1. **Take a backup and prove it restores.** Runbook §2. `pg_dump` custom format → `pg_restore --list` → restore into a scratch DB with `--exit-on-error` → compare row counts. An unrestored dump does not count. **This must happen before production migrations are touched.**
2. **Rehearse on the restored copy.** Runbook §3, all 14 steps, ending with `verify:schema` and the §5.1 FK hand-check. This is where the PL/pgSQL, the enum casts, and the abort paths meet real data for the first time. **Do not touch production during rehearsal.**
3. **Confirm CI is green on this branch** — specifically the `migration-smoke` job (§8). It is the only automated evidence that the migration works against real PostgreSQL.
4. **Build the backend image once, manually**, and start a container against a scratch database: `docker compose build backend`. CI does not build it (§6) and neither could this session. Confirm `npm ci` succeeds and that `require('@prisma/client')` resolves at runtime.
5. **Stage the 44 real changes and the untracked must-ship paths by path** (§9). Delete the 37 `.fuse_hidden*` artifacts. Never `git add -A`.
6. **Read the §7.1 ordering rule before you need it.** Database first or simultaneously; never the application alone.
7. **Hand-verify the two coordinator FKs after deploy** (§5), because `migrate status` cannot detect a missing physical constraint.
8. **Post-deploy security smoke test:** sign in as a coordinator of each of CWTS, MTS, and LTS; confirm each sees only in-scope components; confirm account switching leaks no previous scope data; confirm a coordinator cannot assign an out-of-scope facilitator.

Optional follow-ups, deliberately **not** done in this pass: adding a backend image build to CI's `container-smoke`; introducing `.gitattributes` to end the CRLF churn; moving the four root-level audit reports into `docs/audits/`. Each is worth doing separately, none belongs in a security-sensitive release.

---

## 11. Deployment command sequence

Run from the repository root. Every step is expected to exit 0; **if any step is non-zero, stop.**

```bash
# 0. Preconditions: CI green on this branch (incl. migration-smoke); backup taken
#    AND proven restorable (runbook §2); rehearsal completed on the restored
#    copy (runbook §3). Do not proceed without all three.

# 1. Confirm what the database thinks it has applied.
npm run migrate:status

# 2. Apply the release. This single command IS the gated path -- it runs the
#    orphan report and the read-only preflight first, applies the migration,
#    then verifies the physical schema. Every stage fails closed.
npm run migrate:deploy

# 3. Confirm the ledger now matches the migrations directory.
npm run migrate:status
```

Do **not** substitute a bare `npx prisma migrate deploy`. Do **not** run `npm run seed`. Under Docker the equivalent of step 2 is, invoked alone and by name:

```bash
docker compose --profile maintenance run --rm migrate
```

Then hand-verify the two authorization-critical foreign keys (§5) and run the §10.8 smoke test.

If a migration fails part-way, **do not** reach for `prisma migrate resolve`. `npm run migrate:recover` refuses by design and exits 1; follow runbook §8, and restore from the §2 backup if that is the only safe path — which for the three irreversible operations in §3, it is.

---

## 12. Rollback triggers

Roll back if any of the following is true.

- **`prisma migrate deploy` fails part-way**, leaving a migration recorded as failed. Do not hand-resolve it; follow runbook §8.
- **`verify:schema` reports a missing or degraded foreign key** after deploy — especially `coordinator_profile_userId_fkey` ≠ `c` or `coordinator_profile_componentId_fkey` ≠ `n`. Authorization is enforced by these constraints, so this is a security condition, not a cosmetic one.
- **`verify:schema` reports `bootstrapAfterDeploy`** — an empty database after deploy means nothing was applied and nothing was verified.
- **The migration raises any of its own exceptions** (component/metadata disagreement, unmappable profile, post-backfill mismatch). The transaction has already rolled itself back; the correct response is to resolve the reported profile IDs, not to retry.
- **A `NOT NULL` violation on `coordinator_profile.scope`** appears in application logs — the signature of a *previous* backend running against the *migrated* schema. See §7.1: this is the asymmetric-rollback failure, and the fix is to move the database, not the application.
- **A coordinator sees out-of-scope components, or scope data survives account switching.** Treat as a security incident.

**Recovery method.** Because the enum additions, the scope backfill, and the assessment conversion have no inverse, **restore from the verified backup is the only safe recovery path** for anything that has already applied them. Reverse migrations were not invented for these, deliberately: a fabricated "down" migration that cannot actually restore the overwritten `scope` values would be worse than none, because it would look like a rollback while silently inventing authorization data.

Restore the database first, or simultaneously with the application. Never the application alone.
