/**
 * Client-side regression suite for the component-integrity and coordinator-scope
 * fixes. Required regression tests 1-6, 12, 13, 18 and 19.
 *
 * Run with the repository's plain Node runner:
 *
 *   node --import ./test/register-ts-loader.mjs --test "test/*.test.ts"
 *
 * It deliberately avoids Vitest and jsdom. Tests 1-6 execute the real validator
 * and the real component parser, so they are behavioural. Tests 12, 13, 18 and
 * 19 are source-structure guards: the properties they protect ("a coordinator
 * code path never calls an admin snapshot loader") are properties of the control
 * flow, and asserting them on the source is what stops the shape being quietly
 * reintroduced. They are labelled as such rather than presented as runtime
 * proof.
 *
 * The authorization guarantees themselves are tested server-side, in
 * backend/test/coordinator-scope-regression.test.js — the client is never the
 * authority for scope.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { NSTP_COMPONENTS, toCoordinatorScope, toNstpComponent } from '../src/data/nstpComponents.ts';
import { validateStudentImportRows } from '../src/utils/studentImport.ts';

const src = (relative: string) => readFile(new URL(`../src/${relative}`, import.meta.url), 'utf8');

/** A CSV row as `parseStudentCsv` would hand it over. */
const row = (overrides: Record<string, unknown> = {}) => ({
  id: '',
  name: 'Juan Dela Cruz',
  email: 'juan@example.test',
  component: 'CWTS',
  progress: 50,
  assessments: 2,
  status: '',
  notes: '',
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1-2. Invalid component cells are rejected, with the row identified.
// ---------------------------------------------------------------------------

test('1. a blank component is rejected instead of becoming CWTS', () => {
  for (const blank of ['', '   ', '\t']) {
    const result = validateStudentImportRows([row({ component: blank })]);
    assert.equal(result.rows.length, 0, 'no row may be produced from a blank component');
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /^Row 2 \(juan@example\.test\)/, 'the message must identify the row');
    assert.match(result.errors[0], /\(blank\)/);
    assert.match(result.errors[0], /not a valid NSTP component/);
  }
});

test('2. an unknown or misspelled component is rejected', () => {
  const bad = ['CWT', 'cwts-coast guard', 'ROTC', 'MTS', 'MTS (Air Force)', 'LTS ARMY', 'null', 'undefined', '0'];
  const result = validateStudentImportRows(bad.map((component, index) => row({ component, email: `student${index}@example.test` })));

  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, bad.length, 'every invalid row must be reported, not just the first');
  bad.forEach((component, index) => {
    assert.match(result.errors[index], new RegExp(`^Row ${index + 2} \\(student${index}@example.test\\)`));
    assert.ok(result.errors[index].includes(component), `the rejected value "${component}" must be echoed back`);
  });
});

// ---------------------------------------------------------------------------
// 3-5. Every canonical component still imports.
// ---------------------------------------------------------------------------

test('3. a valid CWTS import succeeds', () => {
  const result = validateStudentImportRows([row({ component: 'CWTS' }), row({ component: ' cwts ', email: 'b@example.test' })]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map((entry) => entry.component), ['CWTS', 'CWTS']);
});

test('4. a valid LTS import succeeds', () => {
  const result = validateStudentImportRows([row({ component: 'LTS' }), row({ component: 'lts', email: 'b@example.test' })]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map((entry) => entry.component), ['LTS', 'LTS']);
});

test('5. valid MTS (Army) and MTS (Navy) imports succeed, and so does CWTS (Coast Guard)', () => {
  const result = validateStudentImportRows([
    row({ component: 'MTS (Army)', email: 'army@example.test' }),
    row({ component: 'MTS (NAVY)', email: 'navy@example.test' }),
    row({ component: 'CWTS (Coast Guard)', email: 'cg@example.test' }),
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map((entry) => entry.component), ['MTS (Army)', 'MTS (Navy)', 'CWTS (Coast Guard)']);

  // Nothing outside the canonical five is accepted anywhere.
  assert.deepEqual(NSTP_COMPONENTS, ['CWTS', 'LTS', 'MTS (Army)', 'MTS (Navy)', 'CWTS (Coast Guard)']);
  for (const component of NSTP_COMPONENTS) assert.equal(toNstpComponent(component), component);
  for (const value of [null, undefined, 42, {}, [], 'CWTS ,LTS']) assert.equal(toNstpComponent(value), null);
});

// ---------------------------------------------------------------------------
// 6. The batch is all-or-nothing: an invalid component cannot produce a student,
// and cannot leave a partially imported roster behind.
// ---------------------------------------------------------------------------

test('6. an invalid component cannot accidentally create a CWTS student', () => {
  const result = validateStudentImportRows([
    row({ component: 'LTS', email: 'valid-lts@example.test' }),
    row({ component: '', email: 'blank@example.test' }),
    row({ component: 'MTS (Navy)', email: 'valid-navy@example.test' }),
    row({ component: 'CWT', email: 'typo@example.test' }),
  ]);

  assert.equal(result.errors.length, 2, 'both bad rows are reported');
  assert.deepEqual(result.rows, [], 'a batch containing an invalid row imports nothing at all');
  assert.equal(JSON.stringify(result.rows).includes('CWTS'), false, 'no row may be silently assigned to CWTS');

  // A row with a valid component but an unusable status is equally unsafe.
  const badStatus = validateStudentImportRows([row({ component: 'CWTS', status: 'enrolled' })]);
  assert.deepEqual(badStatus.rows, []);
  assert.match(badStatus.errors[0], /status "enrolled" is not one of active, pending, graduated/);

  // A blank status is legitimate: the caller derives it from progress.
  const blankStatus = validateStudentImportRows([row({ component: 'CWTS', status: '  ' })]);
  assert.deepEqual(blankStatus.errors, []);
  assert.equal(blankStatus.rows[0].status, null);
  assert.equal(blankStatus.rows[0].component, 'CWTS');
});

test('6b. the admin screen delegates the whole batch to the validator and persists nothing on failure', async () => {
  const dashboard = await src('features/admin/pages/AdminDashboard.tsx');
  const handler = dashboard.slice(dashboard.indexOf('const handleImportCsv'), dashboard.indexOf('const approveRegistration'));

  assert.match(handler, /validateStudentImportRows\(importedRows\)/);
  // The rejection path returns before `persistStudents`, so nothing is written.
  assert.ok(
    handler.indexOf('if (rowErrors.length > 0)') < handler.indexOf('persistStudents(merged)'),
    'the batch must be rejected before any persistence',
  );
  assert.match(handler, /Import cancelled — no records were saved/);
  // No component may be inferred while building the records.
  assert.doesNotMatch(handler, /component:\s*['"]CWTS['"]/);
  assert.doesNotMatch(handler, /\|\|\s*['"]CWTS['"]/);
  assert.doesNotMatch(handler, /\?\?\s*['"]CWTS['"]/);
});

test('6d. a new coordinator requires an explicit program choice', async () => {
  const dashboard = await src('features/admin/pages/AdminDashboard.tsx');
  const editor = dashboard.slice(dashboard.indexOf('function CoordinatorManagementView'));

  assert.doesNotMatch(editor, /coordinatorScope:\s*['"]CWTS['"]/);
  assert.doesNotMatch(editor, /coordinatorScope\s*\|\|\s*['"]CWTS['"]/);
  assert.match(editor, /<option value="" disabled>Select a coordinator program<\/option>/);
});

// ---------------------------------------------------------------------------
// 12 and 18. Coordinator reports read coordinator endpoints only. Source-structure
// guard: every admin snapshot loader is confined to one helper, and that helper
// is called on exactly one branch.
// ---------------------------------------------------------------------------

test('12. (source structure) coordinator Reports does not use the admin snapshot loaders', async () => {
  const reports = await src('pages/ReportsPage.tsx');

  assert.match(reports, /function loadSnapshotReportSource\(\): ReportSource \{/);
  assert.ok(
    reports.includes('= isCoordinator\n    ? coordinatorData\n    : loadSnapshotReportSource();'),
    'the data source must be chosen by a single explicit fork on isCoordinator',
  );

  // Each snapshot loader appears exactly once, and every one of those single
  // occurrences is inside loadSnapshotReportSource.
  const helper = reports.slice(
    reports.indexOf('function loadSnapshotReportSource'),
    reports.indexOf('export default function ReportsCenter'),
  );
  for (const loader of ['loadStudents()', 'loadModules()', 'loadAssessments()', 'loadAccounts()', 'loadTrainingGroups()']) {
    const occurrences = reports.split(loader).length - 1;
    assert.equal(occurrences, 1, `${loader} must be called in exactly one place`);
    assert.ok(helper.includes(loader), `${loader} must live inside loadSnapshotReportSource`);
  }
});

test('18. (source structure) Reports training-group data comes from the coordinator endpoint', async () => {
  const reports = await src('pages/ReportsPage.tsx');
  const coordinatorEffect = reports.slice(reports.indexOf('if (!isCoordinator || !coordinatorScope.scope) return;'), reports.indexOf('const { students, modules'));

  assert.match(coordinatorEffect, /fetchCoordinatorTrainingGroups\(\)/);
  assert.match(coordinatorEffect, /fetchCoordinatorStudents\(/);
  assert.match(coordinatorEffect, /fetchMyFacilitators\(\)/);
  assert.match(coordinatorEffect, /fetchManagedModules\('coordinator'\)/);
  assert.match(coordinatorEffect, /fetchManagedAssessments\('coordinator'\)/);
  assert.doesNotMatch(coordinatorEffect, /loadTrainingGroups\(\)/, 'the snapshot store is not a coordinator source');

  // The coordinator client calls the scoped route and does not narrow anything
  // itself; the server decides which rows exist. `.filter(Boolean)` on a JSON
  // string column is the only filtering allowed here, because it cannot select
  // records — it only drops empty strings inside one row.
  const service = await src('services/coordinator.ts');
  assert.match(service, /\/nstp\/coordinators\/component\/training-groups/);
  for (const call of service.match(/\.filter\([^)]*\)/g) ?? []) {
    assert.equal(call, '.filter(Boolean)', `the coordinator client must not narrow a protected collection: ${call}`);
  }
});

test('18c. the coordinator dashboard mounts the full scoped Reports page', async () => {
  const dashboard = await src('features/coordinator/pages/CoordinatorDashboard.tsx');
  assert.match(dashboard, /React\.lazy\(\(\) => import\(['"]\.\.\/\.\.\/\.\.\/pages\/ReportsPage['"]\)\)/);
  assert.match(dashboard, /<CoordinatorReports user=\{user\} \/>/);
  assert.doesNotMatch(dashboard, /const gradeValues = scopedStudents/);
});

test('18d. coordinator grade failures are visible instead of becoming silent zeroes', async () => {
  const reports = await src('pages/ReportsPage.tsx');
  assert.match(reports, /setGradeError\(error instanceof Error/);
  assert.match(reports, /Grade data is unavailable: \{gradeError\}/);
});

test('20b. LoginPage compares the canonical facilitator role', async () => {
  const login = await src('features/auth/pages/LoginPage.tsx');
  const successBranch = login.slice(login.indexOf('if (apiResult?.success && apiResult?.data)'));
  assert.ok(
    successBranch.indexOf('const authenticatedUser = normalizeAuthenticatedUser(userData)')
      < successBranch.indexOf('const backendRole = authenticatedUser.role'),
    'the backend role must be normalized before it is compared with the selected workspace',
  );
  assert.doesNotMatch(successBranch, /const backendRole = \(userData\.role/);
});

// ---------------------------------------------------------------------------
// 13. The coordinator dashboard writes nothing into the shared snapshot keys.
// ---------------------------------------------------------------------------

test('13. (source structure) the coordinator dashboard neither reads nor writes admin snapshot storage', async () => {
  const dashboard = await src('features/coordinator/pages/CoordinatorDashboard.tsx');

  for (const forbidden of [
    'saveStudents(', 'saveAccounts(', 'saveModules(', 'saveAssessments(', 'saveTrainingGroups(',
    'loadStudents(', 'loadAccounts(', 'loadModules(', 'loadAssessments(', 'loadTrainingGroups(',
    'replaceModulesSnapshot', 'replaceAssessmentsSnapshot', 'writeSensitive', 'localStorage',
  ]) {
    assert.equal(dashboard.includes(forbidden), false, `${forbidden} must not appear in a coordinator screen`);
  }

  // It reads its data from the scoped endpoints instead.
  assert.match(dashboard, /fetchCoordinatorStudents\(/);
  assert.match(dashboard, /fetchCoordinatorClasses\(\)/);
  assert.match(dashboard, /useCoordinatorScope\(user\)/);
  assert.match(dashboard, /if \(scopeState\.status !== 'ready'\)/);
});

// ---------------------------------------------------------------------------
// 19. Switching accounts on the same tab cannot inherit cached coordinator data.
// ---------------------------------------------------------------------------
test('19. (source structure) account switching clears both caches, on boot and on logout', async () => {
  const app = await src('App.tsx');

  const cleanup = app.slice(app.indexOf('function cleanupSensitiveStorage()'), app.indexOf('function cleanupSensitiveStorage()') + 800);
  // The snapshots live in a module-level Map, not in localStorage, so clearing
  // only the browser keys left the previous coordinator's roster in memory.
  assert.match(cleanup, /clearSessionSnapshots\(\);/);
  assert.match(cleanup, /localStorage\.removeItem\(key\)/);
  assert.ok(
    cleanup.indexOf('clearSessionSnapshots();') < cleanup.indexOf('for (const key of Object.keys(localStorage))'),
    'the in-memory snapshots must be cleared as part of the same routine',
  );

  // Called on session start and on logout: the app does not remount between two
  // sign-ins on the same tab, so one of the two alone is not enough.
  assert.equal(app.split('cleanupSensitiveStorage();').length - 1, 2);
  assert.ok(app.includes('await logoutCurrentUser();\n    // Also cleared here, not only on boot.'));

  // Defence in depth only: the security boundary is the server, which re-derives
  // scope per request. Nothing in the cache grants access.
  const data = await src('data/nstpData.ts');
  assert.match(data, /export function clearSessionSnapshots\(\) \{\n  runtimeStore\.clear\(\);\n\}/);
});

// ---------------------------------------------------------------------------
// 13b. A coordinator session does not seed the shared admin snapshot keys at
// all. `ensureNstpSeedData` runs on boot for every role, and it wrote seven
// empty collections into the shared store on a coordinator's behalf — inert, but
// still a coordinator write into admin storage, and the kind of coupling that
// grows back. Skipping is invisible to readers: an absent key and a key holding
// '[]' both parse to [].
// ---------------------------------------------------------------------------

test('13b. (source structure) a coordinator session does not seed the shared snapshot keys', async () => {
  const data = await src('data/nstpData.ts');
  const seed = data.slice(data.indexOf('export function ensureNstpSeedData()'), data.indexOf('export async function initializeFromApi'));

  assert.match(seed, /if \(sessionRole\(\) === 'coordinator'\) return;/);
  assert.ok(
    seed.indexOf("if (sessionRole() === 'coordinator') return;") < seed.indexOf('writeSensitive('),
    'the coordinator check must precede every write',
  );
  // The role is read from the session record the app already stores, not from a
  // parameter a caller could get wrong.
  assert.match(data, /function sessionRole\(\): string \| null \{/);
});

test('18b. (source structure) a coordinator export includes the scoped training groups it is allowed to see', async () => {
  const reports = await src('pages/ReportsPage.tsx');

  // The rows are already restricted by the server, so all three renderings of the
  // same report — screen, XLSX, PDF — must agree. The PDF branch used to gate
  // training groups on `user.role === 'admin'` alone, from before the scoped
  // endpoint existed, so a coordinator's own groups were silently dropped.
  const pdfBranch = reports.slice(reports.indexOf("if (user.role === 'admin' || isCoordinator) {"), reports.indexOf("doc.save("));
  assert.match(pdfBranch, /addReportTable\('Training Groups'/);
  assert.match(pdfBranch, /addReportTable\('Facilitator Assignments'/);
  assert.doesNotMatch(pdfBranch, /if \(user\.role === 'admin'\) \{/, 'no admin-only gate may remain around the scoped tables');
  assert.doesNotMatch(reports, /Training groups have no scoped endpoint/, 'the stale comment must not outlive the endpoint');
});

// ---------------------------------------------------------------------------
// 7f. The shared module editor must let a coordinator name a component inside
// its own program. The backend refuses a component-less ('Common') write from any
// narrowed actor, so an editor with no component field made coordinator module
// creation a guaranteed 403 with nothing the user could do about it.
// ---------------------------------------------------------------------------

test('7f. (source structure) the coordinator module editor offers only in-scope components and never Common', async () => {
  const modules = await src('pages/ModulesPage.tsx');

  // The new draft starts inside the coordinator's program instead of on 'Common'.
  assert.match(modules, /isComponentScoped && allowedComponents\[0\]/);
  assert.match(modules, /\{ \.\.\.nextModule, component: allowedComponents\[0\] \}/);

  // The options come from the scope hook, which reads display metadata only.
  assert.match(modules, /const coordinatorScope = useCoordinatorScope\(isComponentScoped \? user : null\);/);
  assert.match(modules, /allowedComponents\.map\(\(component\) => \(/);
  // A coordinator cannot pick 'Common' — the value is not offered, and saving
  // without a component is refused with an instruction rather than a 403.
  assert.match(modules, /Coordinators cannot create shared "Common" modules\./);
  assert.match(modules, /isComponentScoped && \(!editorDraft\.component \|\| editorDraft\.component === 'Common'\)/);

  // Scope metadata must not become a row filter: the API decides which modules
  // exist, and the page still applies the response as it arrives.
  assert.doesNotMatch(modules, /modules\.filter\([^)]*allowedComponent/);
  assert.doesNotMatch(modules, /allowedComponents\.includes\(/);
});

// ---------------------------------------------------------------------------
// 6c. One validator for the coordinator scope vocabulary. Two copies of "which
// scopes exist" is how a coordinator ends up defaulted somewhere, so the
// snapshot layer and the auth service must resolve to the same function.
// ---------------------------------------------------------------------------

test('6c. the coordinator scope vocabulary has exactly one implementation, and it never guesses', async () => {
  for (const [input, expected] of [
    ['CWTS', 'CWTS'], ['cwts', 'CWTS'], [' lts ', 'LTS'], ['mts', 'MTS'],
  ] as const) {
    assert.equal(toCoordinatorScope(input), expected);
  }
  // Component spellings are not scopes, and nothing resolves to CWTS by default.
  for (const value of ['', '   ', 'ROTC', 'MTS_NAVY', 'MTS (Army)', 'CWTS_COAST_GUARD', null, undefined, 42, {}]) {
    assert.equal(toCoordinatorScope(value), undefined, `${JSON.stringify(value)} must not resolve to a scope`);
  }

  // Both public surfaces re-export the leaf rather than declaring their own.
  const auth = await src('services/authUser.ts');
  assert.match(auth, /export \{ COORDINATOR_SCOPES, toCoordinatorScope \};/);
  assert.doesNotMatch(auth, /export function toCoordinatorScope/);
  assert.doesNotMatch(auth, /export const COORDINATOR_SCOPES\s*[:=]/);

  const data = await src('data/nstpData.ts');
  assert.match(data, /export \{[^}]*toCoordinatorScope[^}]*\} from '\.\/nstpComponents';/);
  assert.doesNotMatch(data, /export type CoordinatorScope =/);
  // The cached staff row validates the scope instead of casting it.
  assert.match(data, /coordinatorScope: toCoordinatorScope\(cp\.scope\) \?\? toCoordinatorScope\(d\.coordinatorScope\)/);
  assert.doesNotMatch(data, /as CoordinatorScope/);
});
