import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COORDINATOR_SCOPES, coordinatorScopeOf, hasResolvedCoordinatorScope, normalizeAuthenticatedUser, toCoordinatorScope } from '../services/authUser';
import { fetchCoordinatorClasses, fetchCoordinatorStudents, toCoordinatorClass, toCoordinatorStudent, toCoordinatorTrainingGroup } from '../services/coordinator';

// Both shapes the backend actually returns. /auth/login flattens the scope onto
// the payload; /auth/me nests it under coordinatorProfile. Anything that reads
// the scope from only one of them regresses the "coordinator renders as CWTS"
// defect, so both are asserted for every program.
const loginPayload = (scope: string) => ({
  id: 'coordinator-user',
  name: 'Component Coordinator',
  email: 'coordinator@example.test',
  role: 'COORDINATOR',
  coordinatorScope: scope,
  password: 'must-not-survive',
});

const authMePayload = (scope: string) => ({
  id: 'coordinator-user',
  name: 'Component Coordinator',
  email: 'coordinator@example.test',
  role: 'COORDINATOR',
  coordinatorProfile: { id: 'coordinator-profile', scope, employeeNumber: 'EMP-1' },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('coordinator scope normalisation', () => {
  afterEach(() => vi.restoreAllMocks());

  // Required tests 1-3: each program resolves to itself and to nothing else.
  it.each(['CWTS', 'LTS', 'MTS'] as const)('a %s coordinator receives the %s scope from the login payload', (scope) => {
    const user = normalizeAuthenticatedUser(loginPayload(scope));
    // Read through `coordinatorScopeOf`: the session type only exposes a scope on
    // the coordinator variant, so this is also the check that the payload was
    // classified as a coordinator in the first place.
    expect(coordinatorScopeOf(user)).toBe(scope);
    expect(user?.role).toBe('coordinator');
    expect(hasResolvedCoordinatorScope(user)).toBe(true);
  });

  // Required test 5: /auth/me restores the scope from the nested profile.
  it.each(['CWTS', 'LTS', 'MTS'] as const)('a %s coordinator scope is restored from the nested /auth/me profile', (scope) => {
    expect(coordinatorScopeOf(normalizeAuthenticatedUser(authMePayload(scope)))).toBe(scope);
  });

  // Required test 4: a page refresh replays /auth/me through the same
  // normaliser, so the value a screen reads after reload is identical to the
  // one it read right after login.
  it('produces an identical scope after a refresh replays /auth/me', () => {
    for (const scope of COORDINATOR_SCOPES) {
      const afterLogin = normalizeAuthenticatedUser(loginPayload(scope));
      const afterRefresh = normalizeAuthenticatedUser(authMePayload(scope));
      expect(coordinatorScopeOf(afterRefresh)).toBe(coordinatorScopeOf(afterLogin));
    }
  });

  // Required test 6: the defect being fixed. An unknown or absent scope must
  // stay unknown; it must never become CWTS.
  it.each([
    ['absent', {}],
    ['null', { coordinatorScope: null }],
    ['empty', { coordinatorScope: '' }],
    ['unrecognised', { coordinatorScope: 'ROTC' }],
    ['nested but unrecognised', { coordinatorProfile: { scope: 'MTS_ARMY' } }],
    // Regression: `User.data` used to be spread into the result, so an unvalidated
    // scope stored one level down reached the canonical field even though the
    // top-level key was being stripped.
    ['unrecognised inside User.data', { data: { coordinatorScope: 'ROTC' } }],
    ['empty inside User.data', { data: { coordinatorScope: '' } }],
  ])('does not default a %s coordinator scope to CWTS', (_label, overrides) => {
    const user = normalizeAuthenticatedUser({ id: 'c', name: 'C', email: 'c@example.test', role: 'COORDINATOR', ...(overrides as object) });
    expect(coordinatorScopeOf(user)).toBeUndefined();
    expect(hasResolvedCoordinatorScope(user)).toBe(false);
  });

  it('still reads a valid scope out of User.data when that is the only copy', () => {
    const user = normalizeAuthenticatedUser({ id: 'c', name: 'C', email: 'c@example.test', role: 'COORDINATOR', data: { coordinatorScope: 'LTS' } });
    expect(coordinatorScopeOf(user)).toBe('LTS');
  });

  it('accepts only the three coordinator programs and never guesses', () => {
    expect(toCoordinatorScope('cwts')).toBe('CWTS');
    expect(toCoordinatorScope(' lts ')).toBe('LTS');
    expect(toCoordinatorScope('MTS_NAVY')).toBeUndefined();
    expect(toCoordinatorScope(undefined)).toBeUndefined();
    expect(toCoordinatorScope(42)).toBeUndefined();
  });

  it('never carries credential fields into the session user', () => {
    const user = normalizeAuthenticatedUser({ ...loginPayload('LTS'), passwordHash: 'must-not-survive', token: 'must-not-survive' });
    expect(user && 'password' in user).toBe(false);
    expect(user && 'passwordHash' in user).toBe(false);
    expect(user && 'token' in user).toBe(false);
  });

  it('strips credentials nested inside User.data as well as at the top level', () => {
    const user = normalizeAuthenticatedUser({
      id: 'c', name: 'C', email: 'c@example.test', role: 'COORDINATOR',
      data: { passwordHash: 'must-not-survive', token: 'must-not-survive', title: 'Program Head' },
    });
    // The blob is exposed as `user.data`, and its keys used to be spread over the
    // result as well, so an unstripped credential would surface either way.
    expect(user && 'passwordHash' in user).toBe(false);
    expect(user && 'token' in user).toBe(false);
    expect(user?.data?.passwordHash).toBeUndefined();
    expect(user?.data?.token).toBeUndefined();
    // Non-sensitive profile keys must still survive.
    expect(user?.title).toBe('Program Head');
  });

  it('treats a non-coordinator as having no coordinator scope', () => {
    const student = normalizeAuthenticatedUser({ id: 's', name: 'S', email: 's@example.test', role: 'STUDENT', component: 'CWTS' });
    expect(hasResolvedCoordinatorScope(student)).toBe(false);
  });
});

describe('coordinator-scoped reads', () => {
  afterEach(() => vi.restoreAllMocks());

  // Required test 7.
  it('requests the coordinator student endpoint rather than an unscoped collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCoordinatorStudents();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/nstp/coordinators/component/students');
    expect(String(url)).not.toContain('/nstp/admin/students');
  });

  // Required test 8.
  it('requests the coordinator class endpoint rather than an unscoped collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCoordinatorClasses();

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/nstp/coordinators/component/classes');
    expect(String(url)).not.toContain('/nstp/admin/');
  });

  // Required test 18: a failing request surfaces a typed error instead of
  // resolving with data the caller could mistake for an empty component.
  it('propagates an API failure instead of returning fallback rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403)));
    await expect(fetchCoordinatorStudents()).rejects.toMatchObject({ name: 'ApiRequestError', status: 403 });
  });

  // Required test 19: an unauthenticated read must not yield protected records.
  it('does not expose student records when authentication fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401)));
    await expect(fetchCoordinatorStudents()).rejects.toMatchObject({ status: 401 });
    await expect(fetchCoordinatorClasses()).rejects.toMatchObject({ status: 401 });
  });

  it('maps a student row without inventing a component or a progress figure', () => {
    const student = toCoordinatorStudent({
      id: 'profile-1',
      studentNumber: '2026-0001',
      componentId: 'component-lts',
      user: { id: 'user-1', name: 'Learner One', email: 'learner@example.test', data: { surname: 'One', firstName: 'Learner' } },
      component: { id: 'component-lts', type: 'LTS', name: 'LTS' },
      section: { id: 'section-1', code: 'LTS-1A', name: 'LTS 1A', schoolYear: '2026-2027', semester: 'FIRST' },
      _count: { moduleProgress: 3, submissions: 2 },
    }, 6);

    expect(student.component).toBe('LTS');
    expect(student.programSection).toBe('LTS-1A');
    expect(student.progress).toBe(50);
    expect(student.assessments).toBe(2);
    expect(student.status).toBe('active');
  });

  it('reports 0% rather than a guessed percentage when no module target is known', () => {
    const student = toCoordinatorStudent({ id: 'profile-2', _count: { moduleProgress: 4, submissions: 0 } });
    expect(student.progress).toBe(0);
    expect(student.component).toBeNull();
  });

  it('maps a class row with its facilitator and enrolment count', () => {
    const section = toCoordinatorClass({
      id: 'section-1', code: 'MTS-1A', name: 'MTS 1A', schoolYear: '2026-2027', semester: 'FIRST',
      componentId: 'component-mts-army',
      component: { id: 'component-mts-army', type: 'MTS_ARMY', name: 'MTS (Army)' },
      instructor: { id: 'instructor-1', user: { id: 'user-2', name: 'Facilitator One', email: 'f@example.test' } },
      _count: { students: 27 },
    });

    expect(section.component).toBe('MTS (Army)');
    expect(section.facilitatorName).toBe('Facilitator One');
    expect(section.studentCount).toBe(27);
  });

  it('labels an unassigned class instead of leaving the facilitator blank', () => {
    expect(toCoordinatorClass({
      id: 'section-2', code: 'CWTS-1A', name: 'CWTS 1A', schoolYear: '2026-2027', semester: 'FIRST', componentId: 'component-cwts',
    }).facilitatorName).toBe('Unassigned');
  });

  it('normalises backend enum spellings in coordinator training groups', () => {
    const group = toCoordinatorTrainingGroup({ id: 'group-1', component: 'MTS_ARMY' });
    expect(group.component).toBe('MTS (Army)');
  });

  it('rejects an invalid coordinator training-group component', () => {
    expect(() => toCoordinatorTrainingGroup({ id: 'group-2', component: 'ROTC' }))
      .toThrow('invalid NSTP component');
  });
});

describe('coordinator screens consume scoped server data', () => {
  const dashboardUrl = new URL('../features/coordinator/pages/CoordinatorDashboard.tsx', import.meta.url);
  const reportsUrl = new URL('../pages/ReportsPage.tsx', import.meta.url);
  const scopeHookUrl = new URL('../hooks/useCoordinatorScope.ts', import.meta.url);

  // Required test 9.
  it('builds dashboard statistics from the coordinator API, not the admin snapshot store', async () => {
    const dashboard = await readFile(dashboardUrl, 'utf8');
    expect(dashboard).toContain('fetchCoordinatorStudents(');
    expect(dashboard).toContain('fetchCoordinatorClasses()');
    expect(dashboard).not.toContain('loadStudents()');
    expect(dashboard).not.toContain('loadModules()');
    expect(dashboard).not.toContain('loadAccounts()');
  });

  // Required test 10.
  it('builds coordinator reports from coordinator-scoped endpoints instead of admin or mock state', async () => {
    const reports = await readFile(reportsUrl, 'utf8');
    expect(reports).toContain('fetchCoordinatorStudents(');
    expect(reports).toContain('fetchCoordinatorGrades(');
    expect(reports).toContain("fetchManagedModules('coordinator')");
    expect(reports).toContain("fetchManagedAssessments('coordinator')");
    // Reports fork: coordinator figures come exclusively from coordinatorData,
    // while non-coordinators read adminData populated from TanStack Query hooks.
    expect(reports).toContain('isCoordinator\n    ? coordinatorData\n    : adminData');
  });

  // Required test 6, enforced at the screen level as well as the normaliser.
  it('gates every component-specific coordinator screen on a confirmed scope', async () => {
    const [dashboard, reports, hook] = await Promise.all([
      readFile(dashboardUrl, 'utf8'), readFile(reportsUrl, 'utf8'), readFile(scopeHookUrl, 'utf8'),
    ]);

    expect(dashboard).toContain('useCoordinatorScope(user)');
    expect(dashboard).toContain("if (scopeState.status !== 'ready')");
    expect(reports).toContain("coordinatorScope.state.status !== 'ready'");

    // Non-coordinator screens opt out by passing null; the hook must then resolve
    // nothing rather than issuing an /auth/me probe that cannot return a scope.
    expect(reports).toContain('useCoordinatorScope(isCoordinator ? user : null)');
    expect(hook).toContain('const enabled = user != null;');
    expect(hook).toContain('const userId = user?.id ?? null;');
    expect(hook).toContain('if (!enabled) {');
    expect(hook).toContain('[enabled, scopeFromUser, userId]');
    expect(hook).not.toContain('probedRef');

    // No screen may reintroduce a component default.
    for (const source of [dashboard, reports, hook]) {
      expect(source).not.toMatch(/scope\s*\|\|\s*['"]CWTS['"]/);
      expect(source).not.toMatch(/scope\s*\?\?\s*['"]CWTS['"]/);
      expect(source).not.toMatch(/coordinatorScope\s*[|?]{2}\s*['"]CWTS['"]/);
    }
  });

  // Required tests 16, 17 and 18 at the screen level.
  it('renders loading, empty and failure states for coordinator collections', async () => {
    const dashboard = await readFile(dashboardUrl, 'utf8');
    expect(dashboard).toContain('Confirming your coordinator program');
    expect(dashboard).toContain('rosterLoading');
    expect(dashboard).toContain('studentError');
    expect(dashboard).toContain('classError');
    expect(dashboard).toContain('No students are enrolled in ${userComponent} yet.');
    expect(dashboard).toContain('No classes have been created for ${userComponent} yet.');
    expect(dashboard).toContain('role="alert"');
    expect(dashboard).toContain('role="status"');

    const reports = await readFile(reportsUrl, 'utf8');
    expect(reports).toContain('coordinatorLoading');
    expect(reports).toContain('coordinatorError');
    expect(reports).toMatch(/No students are enrolled in \{coordinatorScope\.label\}/);
  });

  // Required tests 11-13 at the client level: the browser must not be the thing
  // that narrows a protected collection.
  it('does not re-filter protected collections in the browser', async () => {
    const service = await readFile(new URL('../services/coordinator.ts', import.meta.url), 'utf8');
    // `.filter(Boolean)` on a JSON string column inside one row is fine — it
    // cannot select records. Anything else would mean the browser is narrowing a
    // protected collection.
    for (const call of service.match(/\.filter\([^)]*\)/g) ?? []) {
      expect(call).toBe('.filter(Boolean)');
    }
    const dashboard = await readFile(dashboardUrl, 'utf8');
    expect(dashboard).toContain('const scopedStudents = students;');
    expect(dashboard).toContain('const scopedClasses = classes;');
  });

  it('restricts the facilitator component options to the coordinator programs', async () => {
    const dashboard = await readFile(dashboardUrl, 'utf8');
    expect(dashboard).toContain('allowedComponentTypes');
    expect(dashboard).toContain('allowedComponents');
    expect(dashboard).not.toMatch(/Object\.keys\(COMPONENT_TYPE_LABELS\)/);
  });
});
