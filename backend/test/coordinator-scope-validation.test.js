import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createCoordinatorSchema,
  updateCoordinatorSchema,
} from '../src/modules/staff/staff.validation.js';

/**
 * Coordinator scope must be chosen explicitly at every entry point.
 *
 * The database no longer supplies a default (see
 * 20260824120000_require_explicit_coordinator_scope), so the request schema is
 * the layer that has to reject an omitted scope with a 400 rather than let the
 * write reach a column that will refuse it with a 500 -- or worse, let some
 * future default quietly grant CWTS.
 *
 * staff.validation.js imports only zod, so these tests need no database.
 */

const validCoordinator = Object.freeze({
  name: 'Test Coordinator',
  email: 'coordinator@example.edu',
  employeeNumber: 'EMP-1001',
  password: 'a-sufficiently-long-password',
});

const parseCreate = (body) => createCoordinatorSchema.safeParse({ body, params: {}, query: {} });
const parseUpdate = (body) =>
  updateCoordinatorSchema.safeParse({ body, params: { id: 'coordinator-1' }, query: {} });

test('creating a coordinator without a scope is rejected', () => {
  const result = parseCreate({ ...validCoordinator });

  assert.equal(result.success, false, 'an omitted scope must not be accepted');
  const scopeIssue = result.error.issues.find((issue) => issue.path.includes('scope'));
  assert.ok(scopeIssue, 'the rejection must name the scope field');
});

test('an omitted scope is never filled in with a default', () => {
  // The decisive property. A `.default('CWTS')` added here would reintroduce the
  // defaulting bug at the API layer after the database stopped allowing it.
  const result = parseCreate({ ...validCoordinator });
  assert.equal(result.success, false);
  assert.equal(result.data, undefined, 'no parsed value may be produced for a missing scope');
});

for (const scope of ['CWTS', 'MTS', 'LTS']) {
  test(`creating a coordinator with an explicit ${scope} scope succeeds`, () => {
    const result = parseCreate({ ...validCoordinator, scope });

    assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error?.issues));
    assert.equal(result.data.body.scope, scope, 'the chosen scope must survive validation unchanged');
  });
}

test('a component type is not accepted where a scope is required', () => {
  // CoordinatorScope and NSTPComponentType are different enums. MTS_ARMY and
  // CWTS_COAST_GUARD are component types; accepting one as a scope would store a
  // value the authorization layer cannot interpret.
  for (const notAScope of ['MTS_ARMY', 'MTS_NAVY', 'CWTS_COAST_GUARD']) {
    const result = parseCreate({ ...validCoordinator, scope: notAScope });
    assert.equal(result.success, false, `${notAScope} must not be accepted as a scope`);
  }
});

test('malformed scope values are rejected rather than coerced', () => {
  const rejected = ['cwts', 'Cwts', ' CWTS', 'CWTS ', '', null, undefined, 0, 1, true, [], {}, 'ROTC', 'ALL'];

  for (const scope of rejected) {
    const result = parseCreate({ ...validCoordinator, scope });
    assert.equal(result.success, false, `scope ${JSON.stringify(scope)} must be rejected`);
  }
});

test('the coordinator scope enum admits exactly the three program scopes', () => {
  // A fourth value added here without a matching migration mapping would be
  // storable but unmappable. The migration's mapping is the other half of this
  // contract; test/migration-scope-guard.test.js pins that side.
  const accepted = [];
  for (const candidate of [
    'CWTS',
    'MTS',
    'LTS',
    'MTS_ARMY',
    'MTS_NAVY',
    'CWTS_COAST_GUARD',
    'ROTC',
    'NSTP',
    'ALL',
    'NONE',
  ]) {
    if (parseCreate({ ...validCoordinator, scope: candidate }).success) accepted.push(candidate);
  }

  assert.deepEqual(accepted, ['CWTS', 'MTS', 'LTS']);
});

test('unknown fields are rejected, so a stray scope-like key cannot slip through', () => {
  // .strict() matters here: without it, a client sending `componentType` or
  // `coordinatorScope` would have it silently dropped and the real scope field
  // would go unnoticed as missing.
  for (const strayKey of ['coordinatorScope', 'componentType', 'component', 'scopes']) {
    const result = parseCreate({ ...validCoordinator, scope: 'LTS', [strayKey]: 'CWTS' });
    assert.equal(result.success, false, `${strayKey} must be rejected as an unknown field`);
  }
});

test('updating a coordinator may omit scope but may not set an invalid one', () => {
  // Update is intentionally partial -- renaming a coordinator should not require
  // restating their scope -- but a supplied scope still has to be a real one.
  const renameOnly = parseUpdate({ name: 'Renamed Coordinator' });
  assert.equal(renameOnly.success, true, 'a partial update without scope is legitimate');
  assert.equal('scope' in renameOnly.data.body, false, 'no scope may be invented on update');

  assert.equal(parseUpdate({ scope: 'MTS' }).success, true);
  assert.equal(parseUpdate({ scope: 'MTS_ARMY' }).success, false);
  assert.equal(parseUpdate({ scope: 'cwts' }).success, false);
  assert.equal(parseUpdate({ scope: null }).success, false);
});

test('an empty update is rejected', () => {
  assert.equal(parseUpdate({}).success, false, 'an update must change at least one field');
});
