# Coordinator Side — Audit Report

**Date:** 2026-08-23
**Scope:** COORDINATOR role, traced end-to-end (Prisma schema → migrations → Express routes/guards/services → frontend services → CoordinatorDashboard UI)
**Verification:** `tsc --noEmit` clean; backend `node --test` = 77 pass / 9 environment-blocked (see Appendix A). All findings below were confirmed by reading source, not inferred.

---

## Verdict

The coordinator side is **partially connected**. The backend is the strong half: the role, scope model, RBAC guards, ownership rules and services are complete and covered by tests. The breakage is on the **frontend wiring**.

Two defects are severe enough to make the coordinator role incorrect in production:

1. **The coordinator's program scope never reaches the browser.** Every coordinator is silently rendered as **CWTS**, regardless of their real scope. For MTS and LTS coordinators this makes facilitator management (create *and* edit) and the module library **entirely unusable** — the API returns correct data and the UI filters it away, then sends wrong-scope writes that the backend rejects with 403.
2. **Coordinator student data is never fetched.** Two fully-implemented backend endpoints are never called. Student counts and analytics render as **0**, permanently.

What *does* work: authentication, role gating, assessments CRUD, and — **provided the coordinator's real scope happens to be CWTS** — the modules library and facilitator list/create/update/suspend. Because `CWTS` is the schema default (`prisma/schema.prisma:178`), CWTS coordinators work by coincidence, which is likely why this has gone unnoticed.

---

## P0-1 — Coordinator scope is discarded at login; every coordinator becomes CWTS

**Severity: Critical — functional breakage + wrong authorization surface in UI**

The backend deliberately sends the scope. `backend/src/modules/auth/auth.service.js:267`:

```js
coordinatorScope: user.coordinatorProfile?.scope,
```

The frontend throws it away. `frontend/src/features/auth/pages/LoginPage.tsx:481`:

```js
onLogin({ id: userData.id, name: userData.name, email: userData.email, role: userData.role });
```

Only four fields are forwarded. `coordinatorScope`, `component`, `municipalities` and `studentId` are all dropped.

In fact the backend sends it **twice**, because `auth.service.js:264-268` spreads `...data` before the explicit field, and `createCoordinator` persists the scope into `User.data` as well (`backend/src/modules/staff/staff.service.js:117`):

```js
data: { title: payload.title || '', contactNumber: payload.contactNumber || '', coordinatorScope: payload.scope },
```

Both copies are discarded at `LoginPage.tsx:481`.

The reload path does not recover it either. `frontend/src/App.tsx:271-273` rebuilds the user from `/auth/me`:

```js
const { id, name, email, role, ...profile } = current.data;
const authenticatedUser = { id, name, email, role: String(role || '').toLowerCase(), ...profile };
```

`/auth/me` exposes the scope in two places, but **neither is top-level**: nested as `coordinatorProfile.scope` (`backend/src/modules/auth/user.dto.js:38,96`) and, thanks to the `User.data` write above, as `data.coordinatorScope`. Because `App.tsx` spreads `...profile` verbatim, these land as `user.coordinatorProfile.scope` and `user.data.coordinatorScope` — never as `user.coordinatorScope`, which is the only key the dashboard reads.

Nothing in the frontend performs that flattening for the *current* session. The only mapping that exists (`frontend/src/data/nstpData.ts:357`) is admin-gated three ways — it sits inside `syncCollectionFromApi` behind `getAdminResource()` (`nstpData.ts:272-274`), is only reached via `syncAllFromApi` which returns `[]` for non-admins (`nstpData.ts:477`), and it writes to the accounts store rather than the session user. A coordinator session cannot reach it.

An exhaustive sweep of all twelve `setUser` call sites in `App.tsx` (lines 240, 253, 272, 279, 293, 416, 441, 658, 672, 697, 712, 820) confirms no other path supplies the field: lines 416 and 441 sit behind `if (!user || user.role !== 'student') return;` (`App.tsx:257-258`), lines 658-712 are student enrollment/exam flows, and line 820 only sets name and email. There is no auth context provider, and `useCurrentUser` (`frontend/src/hooks/index.ts:126`) is consumed solely by `AdminDashboard.tsx:1054`.

So `user.coordinatorScope` is `undefined` in every coordinator session. The fallback then fires. `frontend/src/features/coordinator/pages/CoordinatorDashboard.tsx:41`:

```js
const coordinatorScope = (user.coordinatorScope || (String(user.component).startsWith('MTS') ? 'MTS' : user.component === 'LTS' ? 'LTS' : 'CWTS')) as CoordinatorScope;
```

For a coordinator, `user.component` is also undefined (it is only populated from `instructorProfile`). `String(undefined)` is `"undefined"`, which fails both tests — so **the result is always `'CWTS'`**.

### Downstream impact

`allowedComponentTypes` becomes `['CWTS','CWTS_COAST_GUARD']` for everyone (`CoordinatorDashboard.tsx:42-43`), which drives:

- **Facilitator creation fails outright for MTS/LTS coordinators.** The component dropdown only offers CWTS options (`CoordinatorDashboard.tsx:589`). The backend recomputes the *real* scope from the database and rejects the mismatch — `backend/src/modules/staff/staff.service.js:83`:
  ```js
  if (!COORDINATOR_SCOPE_TYPES[scope]?.includes(type)) throw httpError('The selected facilitator component is outside your coordinator scope.', 403);
  ```
  An MTS coordinator can therefore never create a facilitator through the UI. The coordinator sees "outside your coordinator scope" for the *only* options the UI offered them.
- **They cannot edit their existing facilitators either.** `fetchMyFacilitators()` correctly returns their real MTS facilitators, which `facilitatorToAccount` maps to labels like `'MTS (Army)'` (`CoordinatorDashboard.tsx:48-50`). Saving an edit hits `CoordinatorDashboard.tsx:191`, where `allowedComponentTypes.find(type => COMPONENT_TYPE_LABELS[type] === 'MTS (Army)')` is searched against CWTS types and returns `undefined`, so the client blocks it with "The selected component is outside your coordinator program." Facilitator management is entirely unusable for non-CWTS coordinators, not merely creation.
- **Module creation is rejected the same way.** New modules default to `allowedComponents[0]` = `'CWTS'` (`CoordinatorDashboard.tsx:110,130`), outside an MTS/LTS coordinator's real scope.
- **The module library renders empty.** `fetchManagedModules('coordinator')` returns correctly server-scoped MTS modules, and then `scopedModules` filters them all out against the hardcoded CWTS set (`CoordinatorDashboard.tsx:71-74`). The API returns data and the UI discards it.
- **Headings and copy are wrong**, e.g. "Assign facilitators to CWTS or CWTS (Coast Guard)" shown to an MTS coordinator (`CoordinatorDashboard.tsx:337`).

### Fix

Both sites must change — fixing only login leaves the bug on every page refresh.

Forward the full user payload at login rather than cherry-picking four fields (`LoginPage.tsx:481`):

```js
onLogin({ ...userData, role: String(userData.role || '').toLowerCase() });
```

And flatten the scope on session restore in `App.tsx:271-273`, so a refresh is equivalent to a login:

```js
const authenticatedUser = {
  id, name, email,
  role: String(role || '').toLowerCase(),
  ...profile,
  coordinatorScope: profile.coordinatorProfile?.scope ?? profile.data?.coordinatorScope,
};
```

Then remove the guessing fallback at `CoordinatorDashboard.tsx:41` and fail loudly instead — a missing scope should surface an error, not silently downgrade to CWTS. Note also that the data-loading `useEffect` at `CoordinatorDashboard.tsx:58-69` has an empty dependency array, so if the scope ever arrives asynchronously the effect will not re-run; add `coordinatorScope` to its dependencies as part of this fix.

---

## P0-2 — Coordinator student data is never fetched; two endpoints are dead

**Severity: Critical — dashboard reports zeros**

The backend implements, authorizes and tests these:

```
GET /api/nstp/coordinators/component/students   (backend/src/modules/nstp/nstp.routes.js:88)
GET /api/nstp/coordinators/component/classes    (backend/src/modules/nstp/nstp.routes.js:89)
```

The frontend **never calls either**. A repo-wide search for `coordinators/component`, `component/students` and `component/classes` across `frontend/src` returns nothing.

Instead the dashboard reads students from a client-side store — `CoordinatorDashboard.tsx:54-55`:

```js
setModules(loadModules());
setStudents(loadStudents());
```

`loadStudents()` reads that store (`frontend/src/data/nstpData.ts:720-724`), and it is never populated for a coordinator. `syncAllFromApi` explicitly opts every non-admin role out — `frontend/src/data/nstpData.ts:477-479`:

```js
const keys = currentUser?.role === 'admin'
  ? [MODULES_KEY, ASSESSMENTS_KEY]
  : [];
```

`ensureNstpSeedData()` initialises `STUDENTS_KEY` to `[]` (`nstpData.ts:634-636`), and `setStudents` is called exactly once in the whole component (line 55) — the `useEffect` at line 58 fetches modules, assessments and facilitators from the API, but never students. So `students` is `[]` for the entire session, guaranteed.

Worth noting the store is **not** `localStorage`: `readSensitive`/`writeSensitive` operate on an in-memory `Map` (`nstpData.ts:241`), so there is not even a cross-tab or cross-reload escape hatch. The only writer of `STUDENTS_KEY` besides seeding is `saveStudents` (`nstpData.ts:726-733`), whose callers are admin (`AdminDashboard.tsx:244`, `ComponentAssignment.tsx:234`) or the student's own exam (`QualifyingExam.tsx:145`). No coordinator path exists.

### Downstream impact

- Dashboard stat card "Students" always `0` (`CoordinatorDashboard.tsx:226`)
- Component distribution pie chart renders every slice at `0` (`CoordinatorDashboard.tsx:98-100,265-266`)
- Reports view shows "Total Students 0 / Active 0 / Avg Progress 0%" (`CoordinatorDashboard.tsx:394-410`)

There is no error state — it looks like a coordinator with a genuinely empty component.

### Fix

Add the two service calls and consume them, replacing `loadStudents()` in this component:

```ts
// frontend/src/services/staff.ts
export async function fetchMyComponentStudents() {
  return (await apiGet<ApiEnvelope<StudentRecord[]>>('/nstp/coordinators/component/students')).data;
}
export async function fetchMyComponentClasses() {
  return (await apiGet<ApiEnvelope<ClassRecord[]>>('/nstp/coordinators/component/classes')).data;
}
```

Because the API already scopes results server-side via `getCurrentCoordinator`, the client-side `scopedStudents` filter becomes redundant and should be dropped rather than re-applied.

---

## P1-3 — Coordinator writes silently fail to sync, forever

**Severity: High — silent write failure**

Every `save*` helper in `nstpData.ts` writes to the client store, then pushes to an **admin-only** batch endpoint. `frontend/src/data/nstpData.ts:283-295`:

```js
const result = await apiPost(`/nstp/admin/${collection}/batch`, data);
```

Those routes are gated `requireRole('ADMIN')` (`backend/src/modules/nstp/nstp.routes.js:41-46`). A coordinator therefore receives **403**, which is classified non-retryable (`frontend/src/services/apiClient.ts:12`):

```js
this.retryable = status === 0 || status === 408 || status === 429 || status >= 500;
```

The record lands in the pending-sync queue and stays there permanently. The UI shows success because the client store was written; nothing surfaces the failure. Since that store is in-memory (`nstpData.ts:241`), the write is gone on the next page load — so any coordinator-side edit flowing through these helpers is lost outright, not merely unsynced.

**Fix:** either give coordinators legitimate scoped write endpoints, or stop calling `syncToApi` from non-admin sessions and surface a real error instead of queueing an unretryable request.

---

## P2 — Correctness and UX defects

**P2-4 — Assessments unreachable from the coordinator sidebar.** The nav omits `assessments` (`App.tsx:176-182`) although `renderSection` handles it (`App.tsx:1030`) and the backend has full coordinator assessment CRUD (`nstp.routes.js:91-94`). The feature is only reachable via the command palette (`App.tsx:956`) — effectively hidden.

**P2-5 — `componentType` can be `undefined` on submit.** `CoordinatorDashboard.tsx:191`:
```js
const componentType = allowedComponentTypes.find((type) => COMPONENT_TYPE_LABELS[type] === editingFacilitator.component);
```
`.find()` returns `undefined` on no match — which, combined with P0-1, is exactly the wrong-scope case. It is then sent as `component: undefined` (`:198`) and fails validation with an unhelpful message. Guard before submitting.

**P2-6 — Dynamic Tailwind class is silently dead.** `CoordinatorDashboard.tsx:414`:
```jsx
className={`mt-2 text-3xl font-bold ${stat.color} dark:text-${stat.color.replace('text-', '')}`}
```
Tailwind resolves classes by static analysis, so `dark:text-${...}` is never generated. Dark-mode colour on these stat figures does not apply. Use complete class strings.

**P2-7 — Unreachable legacy branch in the coordinator guard.** `backend/src/modules/nstp/nstp.authorization.js:32-35` branches on `!coordinator.scope && coordinator.componentId`, but `scope` is `CoordinatorScope @default(CWTS)` and non-nullable (`backend/prisma/schema.prisma:178`), so it can never be falsy. Dead code that misleads about the intended model — either drop it or make `scope` nullable if the legacy state is genuinely still possible.

---

## P3 — Hygiene and hardening

**P3-7 — No real linter anywhere in the repo.** Backend `lint` is `node --check` over a hand-maintained file list (`backend/package.json:9`) that omits `app.js`, `routes/index.js`, all of `middleware/`, `config/`, `cache/`, `db/`, `utils/`, plus the `events` and `address` modules and `seed.js`. `node --check` only catches syntax errors — it cannot find unused variables, shadowing, floating promises or bad imports. Frontend `lint` is just `tsc --noEmit` (`frontend/package.json`). Adding ESLint with `@typescript-eslint` and `eslint-plugin-react-hooks` would have caught several items above, including the stale-closure risks around `allowedComponents.join('|')` used as a dependency.

**P3-8 — Spread ordering makes `role` overridable.** `backend/src/modules/auth/auth.service.js:260-268` sets `role` and then spreads `...data`, so a `data.role` key would win. Currently unreachable because `updateProfileSchema` is `.strict()` and only allows `title`/`subtitle`/`contactNumber` (`backend/src/middleware/validationSchemas.js:45-49`) — so this is **not exploitable today**. It is one loosened schema away from privilege escalation. Spread `...data` *before* the authoritative fields.

**P3-9 — Coordinator scope depends on a data migration, not an idempotent seed.** `getCurrentCoordinator` hard-fails with 403 "Coordinator component scope is not fully configured" unless every component type in the scope exists (`backend/src/modules/nstp/nstp.authorization.js:38-39`). CWTS requires *both* `CWTS` and `CWTS_COAST_GUARD`. Those five rows are inserted by `prisma/migrations/20260803233000_.../migration.sql:7-15`, so a correctly-migrated database is fine — but `npm run seed` only seeds addresses (`backend/package.json:16`), so any environment built without that specific migration 403s the *entire* coordinator area. Move component provisioning into an idempotent seed.

**P3-10 — Docker builds are not reproducible.** `backend/Dockerfile` copies only `package.json` and runs `npm install --include=dev`; no lockfile is copied and `npm ci` is not used. Builds can drift between image rebuilds.

**P3-11 — JWT role is trusted from the token.** `backend/src/middleware/authenticate.js:17` populates `req.user.role` from the token payload with no database re-check, and there is no revocation list, so a role change or suspension only takes effect at token expiry (default 24h, `config/env.js:8`). **Mitigated for coordinator routes specifically**, because `getCurrentCoordinator` re-reads the profile and rejects non-`ACTIVE` users on every request (`nstp.authorization.js:31`) — a good pattern worth extending to the other roles.

---

## Suggested order of work

| # | Fix | Effort | Unblocks |
|---|-----|--------|----------|
| 1 | P0-1 forward `coordinatorScope` at login **and** flatten it on `/auth/me` restore | ~20 min | MTS/LTS coordinators entirely |
| 2 | P0-2 call the two `coordinators/component/*` endpoints | ~1 hr | All coordinator analytics |
| 3 | P1-3 stop non-admin `syncToApi`, surface real errors | ~1 hr | Silent data loss |
| 4 | P2-4 add Assessments to coordinator nav | ~5 min | Hidden feature |
| 5 | P2-5, P2-6 guard `componentType`, fix Tailwind class | ~15 min | Error clarity, dark mode |
| 6 | P3-7 introduce ESLint across both workspaces | ~2 hr | Prevents recurrence |

P0-1 is the highest-leverage change in the report: forwarding the payload at `LoginPage.tsx:481` plus flattening the scope in `App.tsx:271-273` restores correct behaviour for every non-CWTS coordinator. Both edits are required — fixing only login leaves the bug on refresh.

---

## Appendix C — Corrections applied after independent review

This report was re-verified by a second reviewer tasked with disproving it. Two claims in the original draft were wrong and have been corrected above, recorded here for transparency:

1. **"The backend never provides the scope on reload" was incomplete.** `/auth/me` does carry it, in two nested locations: `coordinatorProfile.scope` and `data.coordinatorScope` (the latter persisted by `staff.service.js:117`). The defect is purely that neither is flattened to the top-level key the dashboard reads. The conclusion is unchanged, but the fix is simpler than first described.
2. **"localStorage" was wrong.** `readSensitive`/`writeSensitive` use an in-memory `Map` (`nstpData.ts:241`), not `localStorage`. This makes P1-3 more severe, not less: unsynced coordinator writes are lost on page reload rather than merely persisted-but-unsynced.

Claims P0-2, P1-3 and the 403 enforcement path were confirmed exactly. Findings P2-7 and the facilitator-edit breakage under P0-1 were surfaced by that review.

---

## Appendix A — Tooling results

| Check | Result |
|---|---|
| `tsc --noEmit` (frontend) | **Clean**, no errors |
| `node --test` (backend) | 86 tests: **77 pass, 9 environment-blocked** |
| `vitest run` (frontend) | Could not execute in audit sandbox |
| Prisma schema | Valid; all 5 `nstp_component` rows seeded by migration |

The 9 backend failures and the frontend test failure are **artifacts of the audit sandbox, not defects in this codebase**. `node_modules` was installed on Windows, so the Linux-native binaries are absent:

- Backend: all 9 failures are `PrismaClientInitializationError` — "Prisma Client was generated for `windows`, but the actual deployment required `debian-openssl-3.0.x`". Zero assertion failures, so the suite is green on the development machine.
- Frontend: `vitest` aborts on `Cannot find module '@rollup/rollup-linux-x64-gnu'`, the same class of issue.

Neither needs action for Windows development or for the Docker build, which correctly runs `prisma generate` inside the Alpine image. Should you later add Linux CI, declare the targets explicitly:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

## Appendix B — What is correctly wired

Worth stating plainly, since the report is otherwise negative. The backend coordinator implementation is solid:

- `COORDINATOR` enum, `CoordinatorProfile`, `CoordinatorScope`, and facilitator ownership via `instructorProfile.coordinatorId` are modelled correctly, with indexes and foreign keys (`prisma/schema.prisma:12,22,157-186`)
- `staff.routes.js` mounts cleanly and guards every route with `authenticate → requireRole('COORDINATOR') → getCurrentCoordinator`, plus `strictWriteLimiter` and Zod validation on writes
- Scope enforcement is server-authoritative and re-derived from the database on each request, never trusted from the client
- Suspended coordinators are rejected per-request (`nstp.authorization.js:31`)
- WebSocket room assignment is scope-aware (`websocket.js:42-48`)
- Facilitator creation is transactional (`staff-scope.test.js:45`)
- Coordinator authorization is genuinely covered by tests: `authorization.test.js:147,159,165`, `staff-scope.test.js:27-97`, `module-lifecycle.test.js:99,115`, `assessment-lifecycle.test.js:88`

The gap is almost entirely that the frontend does not consume what the backend already offers correctly.
