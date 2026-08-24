/**
 * Executable coverage for the first two stages of the coordinator trace:
 * `Login → auth normalisation → coordinator scope`.
 *
 * These assertions used to live only in `src/__tests__/coordinatorIntegration.test.ts`,
 * which needs Vitest and cannot run where the installed Rollup binary is built
 * for another platform. `services/authUser.ts` now takes its only value import
 * from the dependency-free `data/nstpComponents` leaf, so the real normaliser can
 * be executed here by the plain Node runner:
 *
 *   node --import ./test/register-ts-loader.mjs --test "test/*.test.ts"
 *
 * The point of the suite is the negative case. The original defect was that an
 * unresolved coordinator scope became CWTS, so an unassigned coordinator opened a
 * real program's workspace. Every path that could reintroduce a default is
 * asserted to produce "unknown" instead.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COORDINATOR_SCOPES,
  coordinatorScopeOf,
  hasResolvedCoordinatorScope,
  normalizeAuthenticatedUser,
} from '../src/services/authUser.ts';

/** What POST /auth/login returns: the scope is flattened onto the payload. */
const loginPayload = (scope: unknown) => ({
  id: 'coordinator-user',
  name: 'Component Coordinator',
  email: 'coordinator@example.test',
  role: 'COORDINATOR',
  coordinatorScope: scope,
  password: 'must-not-survive',
});

/** What GET /auth/me returns: the scope is nested under the profile. */
const refreshPayload = (scope: unknown) => ({
  id: 'coordinator-user',
  name: 'Component Coordinator',
  email: 'coordinator@example.test',
  role: 'COORDINATOR',
  coordinatorProfile: { id: 'coordinator-profile', scope, employeeNumber: 'EMP-1' },
});

// ---------------------------------------------------------------------------
// Login and refresh resolve each program to itself, and to nothing else.
// ---------------------------------------------------------------------------

for (const scope of ['CWTS', 'LTS', 'MTS'] as const) {
  test(`a ${scope} coordinator resolves to ${scope} on login, on refresh, and identically across both`, () => {
    const afterLogin = normalizeAuthenticatedUser(loginPayload(scope));
    const afterRefresh = normalizeAuthenticatedUser(refreshPayload(scope));

    assert.equal(afterLogin?.role, 'coordinator');
    assert.equal(coordinatorScopeOf(afterLogin), scope);
    assert.equal(coordinatorScopeOf(afterRefresh), scope);
    assert.equal(coordinatorScopeOf(afterRefresh), coordinatorScopeOf(afterLogin));
    assert.equal(hasResolvedCoordinatorScope(afterLogin), true);
    assert.equal(hasResolvedCoordinatorScope(afterRefresh), true);

    // No other program may be reachable from this session object.
    for (const other of COORDINATOR_SCOPES.filter((value) => value !== scope)) {
      assert.notEqual(coordinatorScopeOf(afterLogin), other);
    }
  });
}

// ---------------------------------------------------------------------------
// The intentionally invalid / unassigned coordinator. This is the defect: none
// of these may resolve to CWTS, or to any other program.
// ---------------------------------------------------------------------------

test('an unassigned or invalid coordinator receives no scope, and never CWTS', () => {
  const unresolved: Array<[string, Record<string, unknown>]> = [
    ['absent', {}],
    ['null', { coordinatorScope: null }],
    ['blank', { coordinatorScope: '' }],
    ['whitespace', { coordinatorScope: '   ' }],
    ['unrecognised', { coordinatorScope: 'ROTC' }],
    ['a component rather than a scope', { coordinatorScope: 'MTS_NAVY' }],
    ['a component label rather than a scope', { coordinatorScope: 'MTS (Army)' }],
    ['non-string', { coordinatorScope: 42 }],
    ['nested but unrecognised', { coordinatorProfile: { scope: 'CWTS_COAST_GUARD' } }],
    ['nested but null', { coordinatorProfile: { scope: null } }],
    // Regression: User.data used to be spread over the result, so an unvalidated
    // scope one level down reached the canonical field.
    ['unrecognised inside User.data', { data: { coordinatorScope: 'ROTC' } }],
    ['blank inside User.data', { data: { coordinatorScope: '' } }],
  ];

  for (const [label, overrides] of unresolved) {
    const user = normalizeAuthenticatedUser({
      id: 'coordinator-user', name: 'C', email: 'c@example.test', role: 'COORDINATOR', ...overrides,
    });
    assert.equal(coordinatorScopeOf(user), undefined, `${label} must not resolve to a scope`);
    assert.equal(hasResolvedCoordinatorScope(user), false, `${label} must report an unresolved scope`);
    assert.notEqual(coordinatorScopeOf(user), 'CWTS');
  }

  // A valid scope stored only in User.data is still honoured — the fix removed
  // the guess, not the legitimate source.
  const fromData = normalizeAuthenticatedUser({
    id: 'coordinator-user', name: 'C', email: 'c@example.test', role: 'COORDINATOR', data: { coordinatorScope: 'LTS' },
  });
  assert.equal(coordinatorScopeOf(fromData), 'LTS');
});

// ---------------------------------------------------------------------------
// Fail-closed classification and credential hygiene.
// ---------------------------------------------------------------------------

test('an unclassifiable payload produces no session at all rather than a default workspace', () => {
  for (const role of [undefined, null, '', 'ROTC_OFFICER', 'superuser', 42]) {
    assert.equal(
      normalizeAuthenticatedUser({ id: 'x', name: 'X', email: 'x@example.test', role }),
      null,
      `role ${JSON.stringify(role)} must not open a workspace`,
    );
  }
  assert.equal(normalizeAuthenticatedUser(null), null);
  assert.equal(normalizeAuthenticatedUser(undefined), null);

  // A facilitator arrives as 'instructor' and must still be classified.
  assert.equal(normalizeAuthenticatedUser({ id: 'f', name: 'F', email: 'f@example.test', role: 'INSTRUCTOR' })?.role, 'facilitator');
  // A non-coordinator has no scope to read, whatever it carries.
  const student = normalizeAuthenticatedUser({ id: 's', name: 'S', email: 's@example.test', role: 'STUDENT', coordinatorScope: 'CWTS' });
  assert.equal(hasResolvedCoordinatorScope(student), false);
});

test('no credential field survives normalisation, at the top level or inside User.data', () => {
  const user = normalizeAuthenticatedUser({
    ...loginPayload('LTS'),
    passwordHash: 'must-not-survive',
    token: 'must-not-survive',
    data: { passwordHash: 'must-not-survive', token: 'must-not-survive', title: 'Program Head' },
  }) as Record<string, unknown> | null;

  for (const field of ['password', 'passwordHash', 'token']) {
    assert.equal(user != null && field in user, false, `${field} must not survive`);
    assert.equal((user?.data as Record<string, unknown> | undefined)?.[field], undefined, `${field} must not survive inside data`);
  }
  // Non-sensitive profile keys still come through.
  assert.equal(user?.title, 'Program Head');
  assert.equal(JSON.stringify(user).includes('must-not-survive'), false);
});
