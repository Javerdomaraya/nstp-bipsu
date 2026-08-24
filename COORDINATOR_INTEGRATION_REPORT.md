# Coordinator Integration — Fix and Verification Report

BiPSU NSTP System · 23 August 2026

Scope of the engagement: implement the coordinator-side fixes for P0-1 (coordinator scope lost in the
frontend) and P0-2 (coordinator student/class APIs not connected), then verify the whole coordinator
surface end to end. Backend authorization was to remain the source of truth throughout, and no
protected collection was to be narrowed in the browser.

An independent review pass was run against a first draft of this report. It found that three of the
claims here were overstated and that two of my own fixes were incomplete. Both defects have since been
fixed and pinned with tests, and the affected claims have been corrected below rather than softened.
Where something is still imperfect it is in section 7.

---

## 1. Root causes

**P0-1 — the authenticated-user shape was never canonical.** The backend returns coordinator scope in
two different places depending on which endpoint answered. `POST /auth/login` returns it flat, as
`coordinatorScope`, while `GET /auth/me` returns it nested, as `coordinatorProfile.scope`. The
frontend had no single place that reconciled the two, so each entry path into the application produced
a differently-shaped user object. A fresh login carried the scope; a page refresh — which restores the
session through `/auth/me` — did not. Screens that needed the scope therefore had to guess where it
lived, and when the guess missed they fell through to a hardcoded `CWTS`. That is the mechanism behind
the reported symptom of every coordinator rendering as CWTS: it was not that the scope was computed
wrongly, it was that on the refresh path it was never read at all, and the failure was masked by a
default instead of surfaced.

**P0-2 — coordinator screens read an admin-populated client cache instead of the coordinator API.**
The two endpoints the audit named, `GET /api/nstp/coordinators/component/students` and
`GET /api/nstp/coordinators/component/classes`, already existed and were already correctly scoped
server-side (`backend/src/modules/nstp/nstp.routes.js:88-89`). Nothing called them. The coordinator
dashboard instead read the `localStorage` snapshot store in `data/nstpData.ts` via `loadStudents()`,
`loadModules()` and `loadAccounts()`. That store is populated by `syncAllFromApi`, which fetches the
`/nstp/admin/*` collections — endpoints a coordinator is not authorized to call. For a coordinator
those requests returned nothing, the store stayed at `[]`, and the dashboard rendered zeros, empty
tables and empty charts. The audit's framing of this as "not connected" is exactly right; the
important detail is that the wrong data source was also the *unsafe* one, since making it work would
have meant giving coordinators admin collections and filtering them in React.

Three further defects were found during implementation and verification. None appears in the original
audit, and the first is more serious than either reported issue.

**Newly found, high severity — the backend itself defaulted an unknown scope to CWTS, in two
places.** `getCurrentCoordinator` in `backend/src/modules/nstp/nstp.authorization.js` resolved the
coordinator's allowed components with a ternary chain whose final branch was unconditional:

```js
const scopeTypes = coordinator.scope === 'MTS' ? ['MTS_ARMY', 'MTS_NAVY']
  : coordinator.scope === 'LTS' ? ['LTS'] : ['CWTS', 'CWTS_COAST_GUARD'];
```

Any coordinator row whose `scope` was null, empty, or an unrecognised string was silently granted
authority over both CWTS components — on the server, for every coordinator endpoint including the write
paths. This is a privilege-assignment bug that no amount of frontend gating could compensate for.

The same expression existed a second time, in `backend/src/websocket.js:45`, deciding which
`component:<id>` rooms a coordinator socket joins. I missed it on the first pass and the independent
review caught it. Its practical exposure was lower — an unset scope was guarded, so only an
*unrecognised* scope defaulted, and nothing currently emits to `component:*` rooms — but it was live
code on the same authorization concept and is now fixed.

Taken together, this means the original audit's conclusion that "the backend implementation is mostly
correct" holds only in the aggregate: the scope derivation was correct for the three known values and
unsafe for everything else.

**Newly found, medium severity — my own normaliser leaked unvalidated scope values.** The first
version of `normalizeAuthenticatedUser` destructured `coordinatorScope` out of the top level but then
spread `User.data` into the result, so `{ data: { coordinatorScope: 'ROTC' } }` reached the canonical
field anyway. The function's return type claims that field is a `CoordinatorScope`, so any screen
reading it directly would have acted on a value the type system promised was valid. The credential
strip had the same shallow-copy flaw: `data.passwordHash` and `data.token` reappeared as top-level
fields. Both are fixed, and both now have tests that execute the real module.

**Repo-wide `CWTS` sweep.** There are 45 literal `'CWTS'` occurrences across `frontend/src` and
`backend/src`. Most are type-union members, dropdown option labels, chart series keys, or
string-matching branches, and are correct. Two were the authorization defects above, now fixed. One,
`ReportsPage.tsx:471`, is inside the `user.role === 'student'` branch below the coordinator gate and is
unreachable for coordinators. Four are admin-side form or template defaults where an administrator
subsequently chooses the value — `AdminDashboard.tsx:136`, `:4145`, `:4314`, and `nstpData.ts:965`;
these are defensible but worth a look, because a form submitted untouched files the record under CWTS.
Two are display defaults on admin-only endpoints, `nstpData.ts:359` and `:416`. The remaining three are
genuine silent-coercion defects on admin data-entry paths, described in section 7.

---

## 2. Files changed, and why

**Created**

`frontend/src/services/authUser.ts` — the single canonical normalisation point the directive asked
for. Exports the `AuthenticatedUser` type, `toCoordinatorScope` (a validating parser), and
`normalizeAuthenticatedUser`, which accepts either backend envelope. It exists so that no component
ever again has to guess where scope is stored.

`frontend/src/hooks/useCoordinatorScope.ts` — the read model for coordinator screens. Returns a
three-state machine (`resolving` / `ready` / `unavailable`) plus the derived component types and
labels, and never a guessed default. When the user object lacks a scope it re-asks `/auth/me` once
before declaring the scope unavailable, which covers a stale in-memory session.

`frontend/src/services/coordinator.ts` — the API client for the two coordinator collections, plus the
record-to-view-model mappers. Deliberately contains no `.filter(` call at all, so the browser cannot
become a second, weaker scope authority.

`backend/test/coordinator-integration.test.js` — 24 backend tests over the real Express app.

`frontend/src/__tests__/coordinatorIntegration.test.ts` — the frontend suite (normalisation,
endpoint selection, error propagation, and screen-level source guards).

**Modified**

`backend/src/modules/nstp/nstp.authorization.js` — removed the CWTS-defaulting ternary; an unset or
unrecognised scope is now refused with a 403 and an actionable message. The scope map is imported from
`staff.service.js` rather than re-declared. The legacy single-component path (rows predating the
`scope` column, which carry an explicit `componentId`) is preserved.

`backend/src/websocket.js` — the second copy of the same ternary, in `resolveAuthorizedRooms`,
replaced with a lookup against the imported map. An unrecognised scope now joins no component room
instead of the CWTS rooms.

`backend/src/modules/nstp/nstp.controller.js` — `listCoordinatorStudents` and
`listCoordinatorClasses` gained the `include` shapes the coordinator UI needs (component, section,
instructor, and completed-module counts). The `where` clause was left as the sole scope authority. The
point of the change is that the UI can now render labels and counts without fetching an unscoped
collection to join against.

`frontend/src/App.tsx` — session restoration now runs the `/auth/me` payload through
`normalizeAuthenticatedUser`, which is what makes scope survive a refresh. Logout now also clears the
sensitive `localStorage` snapshot.

`frontend/src/features/auth/pages/LoginPage.tsx` — the login hand-off is normalised at the single
call site instead of forwarding the raw payload.

`frontend/src/features/coordinator/pages/CoordinatorDashboard.tsx` — moved off the snapshot store as a
*data source* and onto the coordinator endpoints; gated on a confirmed scope; facilitator component
options restricted to the coordinator's own programs; explicit loading, empty and error states per
collection.

`frontend/src/pages/ReportsPage.tsx` — the coordinator branch now sources students, modules,
assessments, facilitators and grades from coordinator-scoped endpoints, with no fallback to the
snapshot store on failure. Admin, facilitator and student reports keep their existing data source.

`frontend/src/services/grades.ts` — added `fetchCoordinatorGrades`, which targets
`/nstp/coordinators/grades` so the report's grade figures are scoped by the server.

`frontend/src/services/staff.ts` — `SCOPE_COMPONENT_TYPES` and the facilitator record mapper used by
the dashboard and the report.

---

## 3. Fixes implemented

Scope now has exactly one representation and one place that produces it. `normalizeAuthenticatedUser`
reads `coordinatorScope`, then `coordinatorProfile.scope`, then `data.coordinatorScope`, validates the
result against the three known programs, and attaches the field only when it validates. Every object
level that gets spread into the result is first passed through `withoutSensitiveKeys`, which removes
`password`, `passwordHash`, `token` and any raw unvalidated `coordinatorScope` — so neither a bogus
scope nor a credential can re-enter through the nested `User.data` blob. Both entry paths (login and
`/auth/me`) and the hook's re-probe go through it, so fresh login, refresh, and restored session all
produce the same shape.

Unknown scope now fails loudly at every layer. On the server, `getCurrentCoordinator` returns 403 with
"Coordinator component scope is not assigned…" rather than assuming CWTS, and also returns 403 if the
scope is recognised but its component rows are not fully configured. The socket room resolver joins no
component room for an unrecognised scope. In the client, the dashboard and the reports page render a
spinner while the scope is resolving and an alert when it cannot be resolved, and neither renders a
figure, a table, a chart, or an action control until the scope is confirmed.

The scope map now has one authority on the server. `COORDINATOR_SCOPE_TYPES` in `staff.service.js` is
imported by the authorization middleware and by the websocket resolver, so the three consumers cannot
disagree about which component types a program owns. It went from four copies to one on the backend;
the frontend keeps one display-only copy (section 7).

The two coordinator collections are now actually fetched, from
`/nstp/coordinators/component/students` and `/nstp/coordinators/component/classes`, keyed on the
resolved scope so no request is issued before the program is known. Every dependent surface reads from
that data: the dashboard student count, the students table, the classes list and class counts,
component distribution and pie/chart data, summary cards, module statistics, facilitator counts, and
the coordinator report and its export. Progress percentages are measured against the published modules
in the coordinator's own scope rather than a placeholder target. The browser applies no second filter —
`const scopedStudents = students;` and `const scopedClasses = classes;` are deliberate, and commented
as such, because re-filtering by display label would only hide legitimate rows whenever the stored
component name and the UI label disagree.

Facilitator management was tightened on the client to match what the server already enforced: the
component options offered in the facilitator form come from `allowedComponentTypes` rather than from
all of `COMPONENT_TYPE_LABELS`. The server-side guarantee is unchanged and remains the real control —
`requireAllowedComponent` rejects an out-of-scope component with 403, and every ownership lookup is
`findFirst({ where: { userId, coordinatorId } })`, so another coordinator's facilitator is simply not
found.

Two smaller corrections were made during verification. The scope hook no longer issues an `/auth/me`
probe when a caller passes `null` — the reports page does this for admins, facilitators and students,
and the probe could never have returned a scope for them. And `cleanupSensitiveStorage()` now runs on
logout as well as on boot: logging out does not remount the application, so without it a second
account signing in on the same tab could read the previous coordinator's cached module and assessment
snapshot until a manual refresh.

---

## 4. Coordinator flows verified

Traced as `UI → handler/state → API client → route → authenticate → RBAC → getCurrentCoordinator →
controller → Prisma where-clause → response → normalisation → render`.

| Flow | Status | Evidence and notes |
|---|---|---|
| Login | PASS | `LoginPage.tsx:485` normalises the payload; flat `coordinatorScope` is read and validated. |
| Session restore / refresh | PASS | `App.tsx:278` runs the nested `/auth/me` payload through the same normaliser; refresh and login yield identical shapes. |
| CWTS coordinator | PASS | Server derives `['CWTS','CWTS_COAST_GUARD']` from the DB per request; foreign rows absent from both collections. |
| LTS coordinator | PASS | Derives `['LTS']`; an injected `componentId=component-cwts` query parameter cannot widen the result. |
| MTS coordinator | PASS | Derives `['MTS_ARMY','MTS_NAVY']`; half-configured scope returns 403 rather than a partial roster. |
| Students | PASS | `/coordinators/component/students`, `where: { componentId: { in: allowedComponentIds } }`; no client-side filter. |
| Classes | PASS | `/coordinators/component/classes`, same scope clause; component, instructor and student counts included server-side. |
| Facilitators | PASS | Create/update restricted by `requireAllowedComponent`; ownership enforced by `coordinatorId` on every lookup; form options restricted to own programs. |
| Modules | PASS | `/coordinators/modules` scoped by `allowedComponentIds`; frontend filtering agrees with backend authorization. See the latent fail-open note in section 7. |
| Dashboard | PASS | All counts, cards and charts derive from coordinator endpoints; per-collection loading, empty and error states present. |
| Reports | PARTIAL | Students, modules, assessments, facilitators and grades are coordinator-scoped and real. The training-groups section is empty for coordinators — see section 7. |
| Charts / component distribution | PASS | Fed from the scoped roster; renders only after the scope is confirmed. |
| Authorization (RBAC, ownership, isolation) | PASS | 401 unauthenticated, 403 for STUDENT/INSTRUCTOR and for suspended accounts, 404 across coordinator ownership boundaries, 403 for unassigned or unrecognised scope, on both the HTTP and socket paths. |

---

## 5. Tests added and results

`backend/test/coordinator-integration.test.js` — **24 tests, 24 pass, 0 fail, exit 0.** These run the
real Express application with a stubbed Prisma singleton, and assert on the `where` clause the
application actually sends to the database rather than only on the response body, so a scope check
that was accidentally moved into JavaScript would still fail the test. Every stub accessor defaults to
a named thrower, so an unstubbed query fails loudly instead of silently reaching a real database.

Coverage: per-scope student and class scoping for CWTS, LTS and MTS; the coordinator `include` shape;
unassigned scope → 403 with no query issued; unrecognised scope → 403; legacy `componentId` rows still
scoped; grades forced to the scoped component list; a client-injected `componentId` unable to widen
scope; facilitator creation rejected for all four out-of-scope component types with no user created;
component moves out of scope rejected; cross-coordinator update and suspend returning 404 with the
ownership clause asserted; facilitator list scoped to the owning coordinator; 401 unauthenticated on
four endpoints; 403 for STUDENT and INSTRUCTOR; 403 for a suspended coordinator; 403 for a
half-configured scope; and three new socket-room tests pinning per-scope rooms, no room for an
unrecognised scope, and the legacy single-component path.

`frontend/src/__tests__/coordinatorIntegration.test.ts` — written and committed. It covers the 20
required cases on the client side: scope resolution for each program from both envelope shapes,
refresh parity, the seven ways a scope can be missing or invalid all resolving to `undefined` rather
than CWTS (including the two nested-in-`User.data` cases the review pass exposed), credential
stripping at both levels, the two coordinator endpoints being the ones actually requested (asserted on
the intercepted URL, including that `/nstp/admin/` is *not* requested), 403 and 401 propagating as
`ApiRequestError` instead of being swallowed, and screen-level guards that no coordinator screen
reintroduces a component default or reads the admin snapshot as a data source.

**This suite cannot execute in the Linux review sandbox** — `vitest` fails to start with
`Cannot find module '@rollup/rollup-linux-x64-gnu'`, because `node_modules` holds the Windows-native
Rollup binary, and installing the Linux binary was blocked by a 403 from the registry. This is an
environment/toolchain failure, not an application failure, and it is not evidence about the code. On
the user's Windows machine the suite should run with `npm test --workspace frontend`.

To compensate, the normalisation logic was executed directly: the real `authUser.ts` was run through
Node 22 type-stripping and exercised with **12 assertions, 12 pass**, covering every scope-source
precedence rule, both nested-leak paths, and credential stripping at both levels. This is worth
flagging honestly: an earlier version of that harness reported 19 passing assertions while the
nested-`data` defect was still present — it simply never tested that path. The lesson is that a green
harness is only as good as its cases, which is why the two leak paths are now permanent cases in the
committed vitest file as well.

---

## 6. Type and build status

`npx tsc --noEmit` in `frontend/` — **exit 0, no diagnostics.** Re-run after every change, including
the late corrections. This is required test 20, PASS.

Backend is plain ESM JavaScript with no compile step; `node --test` executes the application directly
and exits 0.

Not run, deliberately: `prisma generate`, which would replace the user's Windows query engine with a
Linux one and break `npm run dev` on their machine.

---

## 7. Remaining issues

**Blank or misspelled component on admin data entry silently becomes CWTS** — pre-existing, in three
places, and not part of either P0. On the server, `toComponentType`
(`backend/src/modules/nstp/nstp.service.js:54-61`) ends with an unconditional `return 'CWTS'` and is
used at lines 105, 709, 814 and 817 on the admin upsert and batch-import paths. On the client,
`AdminDashboard.tsx:354` does the same for spreadsheet imports, and `nstp.service.js:818` names a newly
created component `'CWTS'` when the payload is blank. A student imported with a blank component is
filed under CWTS and then legitimately appears in the CWTS coordinator's roster. The scope check is not
the problem — the data is wrong at the point of entry. I did not change it because the fix is a product
decision: rejecting those rows would start failing imports that currently succeed, and that call is
yours. The change would be to return `null` for unrecognised input and have the callers reject with a
validation error.

**Latent fail-open in the module query** — `nstp.service.js:156` builds its `where` clause only when
`managedComponentIds.length` is truthy, so an *empty* array means "no restriction at all", i.e. every
module. This is unreachable today because `getCurrentCoordinator` refuses to produce an empty array
(it 403s first), and because admin callers pass `[]` deliberately to mean unrestricted. But the
semantics are inverted from what a reader expects, and one refactor that passes an empty scope through
would silently return an unscoped module list. Fixing it properly means distinguishing "unrestricted"
from "restricted to nothing" — `null` versus `[]` — across the call sites, which is a wider change
than this engagement authorised.

**The coordinator dashboard still writes to the shared snapshot store.** It no longer *reads* the store
for its data, but `replaceModulesSnapshot` and `replaceAssessmentsSnapshot`
(`CoordinatorDashboard.tsx:70, 107, 187, 205`) push coordinator-scoped modules and assessments into the
same `localStorage` keys that admin screens read. Within a single session this is the coordinator's own
data and is correct; it is also the actual reason the logout cleanup added in section 3 matters. The
cleaner end state is for those screens to hold the records in component state and drop the shared-store
write entirely.

**`ReportsPage.tsx:56-59` calls the snapshot loaders unconditionally**, coordinators included, and
discards the values at lines 107-110 in favour of the coordinator-scoped fetches. No coordinator figure
is derived from them and nothing renders from them, so the security conclusion in section 4 holds — but
the guard is by selection rather than by abstention, and a future edit that reorders those lines could
reintroduce the original bug. Moving the loaders behind `if (!isCoordinator)` would make the intent
structural instead of conventional.

**Training groups have no coordinator-scoped endpoint**, so that section of the coordinator report is
empty rather than populated — `isCoordinator ? [] : loadTrainingGroups()`. Showing the admin snapshot
there would have meant exposing other components' groups, so the section is intentionally empty. This
is the one PARTIAL in section 4. Closing it needs a new backend route,
`GET /nstp/coordinators/component/training-groups`, scoped the same way as the other two.

**`App.tsx` still types the session user loosely** — `useState<AuthenticatedUser | any>(null)`.
Tightening it to `AuthenticatedUser` surfaced six errors in unrelated screens that read ad-hoc fields
off the user object. Fixing those properly is a broader refactor than this engagement authorised. The
normaliser is still the only producer of the value, so the runtime shape is correct; only the
compile-time guarantee is weaker than it should be.

**The scope map still exists in two places** — `COORDINATOR_SCOPE_TYPES` in
`backend/.../staff.service.js`, now the single backend authority, and `SCOPE_COMPONENT_TYPES` in
`frontend/src/services/staff.ts`. The frontend copy is display-only and cannot grant access, but it can
disagree with the server if a program's components ever change. A shared constants module would remove
the last copy.

**Pre-existing backend suites could not be executed here.** Any file importing `src/db/prisma.js`
raises `PrismaClientInitializationError` — the engine in `node_modules` was generated for `windows`
while this sandbox is `debian-openssl-3.0.x`. That is the cause of the nine failures seen in an earlier
session; it is an environment mismatch, not an application defect. My new suite avoids it by seeding
the module's own documented singleton hook, which needed no production-code change. On Windows, run
`npm test --workspace backend`.

---

## 8. Manual verification checklist

Run once per account, with three coordinator accounts — one CWTS, one LTS, one MTS. Open the browser
network panel for steps 2 and 3.

1. **Login.** Sign in. The dashboard header must name the account's own program. It must never say
   CWTS for the LTS or MTS account.
2. **Endpoints.** Confirm requests to `/api/nstp/coordinators/component/students` and
   `/api/nstp/coordinators/component/classes`. Confirm there are **no** requests to
   `/api/nstp/admin/students`, `/api/nstp/admin/accounts` or `/api/nstp/admin/modules`.
3. **Response scoping.** Inspect the students response. Every record's component must belong to the
   signed-in program — CWTS or CWTS (Coast Guard) for CWTS; LTS only for LTS; MTS (Army) or
   MTS (Navy) for MTS. A single foreign record is a failure.
4. **Refresh.** Press F5 on the dashboard. The program label, student count, class count and charts
   must be identical to before the refresh, with no flash of CWTS.
5. **Counts agree.** The summary card student count must equal the students table row count, and the
   class count must equal the classes list length.
6. **Charts.** Component distribution must show only the signed-in program's components, and must not
   render before the program label appears.
7. **Facilitator create.** Open the facilitator form. The component dropdown must offer only the
   signed-in program's components — one option for LTS, two for CWTS and MTS.
8. **Facilitator ownership.** Create a facilitator as coordinator A, then sign in as coordinator B of
   a different program and attempt to edit or suspend it. Expect "Facilitator not found or is not
   assigned to you."
9. **Cross-component write.** With the LTS account, send
   `POST /api/nstp/coordinators/facilitators` with `"component": "MTS_ARMY"` via curl or Postman.
   Expect 403 and no account created.
10. **Injected scope.** Request
    `/api/nstp/coordinators/component/students?componentId=<a CWTS component id>` as the LTS account.
    The response must still contain only LTS students.
11. **Reports.** Open Reports. Figures must match the dashboard, the header must name the correct
    component, and the PDF export must carry the same component label. Training groups will be empty —
    expected, see section 7.
12. **Grades.** Confirm the request goes to `/api/nstp/coordinators/grades` and that returned records
    belong only to the signed-in program.
13. **Empty state.** Using a program with no enrolled students, confirm the message reads "No students
    are enrolled in &lt;PROGRAM&gt; yet." rather than a zero-filled table.
14. **API failure.** Stop the backend and reload. Expect a visible error alert on the dashboard and on
    Reports — not zeros, and not stale figures.
15. **Unassigned scope.** In the admin screen, clear a test coordinator's program, then sign in as
    that coordinator. Expect "Coordinator program unavailable" with the administrator message, no
    roster, and no action buttons. This is the check that the CWTS default is gone.
16. **Session expiry.** Delete the `nstp_auth` cookie and reload. Expect a return to the login screen
    with no protected data rendered.
17. **Account switch.** Log out and sign in as a coordinator of a different program in the same tab.
    Every figure and label must belong to the second account.
