import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Drift guard for the two coordinator scope → component-type mappings.
 *
 * There are deliberately two:
 *
 *   backend/src/modules/staff/staff.service.js   COORDINATOR_SCOPE_TYPES
 *     AUTHORIZATION AUTHORITY. Every scope decision resolves through this map —
 *     `getCurrentCoordinator`, `componentIdsForScope`, `requireAllowedComponent`
 *     and the websocket scope filter all read it, and an unknown scope is
 *     refused (403) rather than defaulted.
 *
 *   frontend/src/services/staff.ts               SCOPE_COMPONENT_TYPES
 *     DISPLAY-ONLY METADATA. It decides which component options a coordinator is
 *     *offered* in a form and which labels a dashboard prints. It grants nothing:
 *     every write is re-checked server-side against the map above, so a tampered
 *     client list produces a 403 instead of access.
 *
 * They are not merged into a shared module because that would either ship server
 * authorization code to the browser or make the server import from the frontend
 * workspace — the frontend must never be treated as authorization authority.
 * Duplication is therefore accepted, and this test is what stops it drifting:
 * both files are read as *text*, so nothing is imported across the boundary and
 * the check runs without a database or a bundler.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function parseScopeMap(source, identifier) {
  const declaration = new RegExp(`${identifier}[^=]*=\\s*(?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\}`).exec(source);
  assert.ok(declaration, `${identifier} was not found; the drift guard must be updated with it.`);
  const entries = [...declaration[1].matchAll(/([A-Z_]+)\s*:\s*\[([^\]]*)\]/g)].map(([, scope, list]) => [
    scope,
    list.split(',').map((value) => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
  ]);
  assert.ok(entries.length > 0, `${identifier} parsed to an empty mapping.`);
  return Object.fromEntries(entries);
}

test('backend coordinator scope map is the authorization authority and has the required shape', async () => {
  const backendSource = await readFile(new URL('../src/modules/staff/staff.service.js', import.meta.url), 'utf8');
  const authority = parseScopeMap(backendSource, 'COORDINATOR_SCOPE_TYPES');

  assert.deepEqual(authority, {
    CWTS: ['CWTS', 'CWTS_COAST_GUARD'],
    MTS: ['MTS_ARMY', 'MTS_NAVY'],
    LTS: ['LTS'],
  });
  // The authority is frozen so a later import cannot widen a coordinator's scope
  // at runtime.
  assert.match(backendSource, /export const COORDINATOR_SCOPE_TYPES = Object\.freeze\(/);
});

test('frontend display map matches the backend authority exactly', async () => {
  const backendSource = await readFile(new URL('../src/modules/staff/staff.service.js', import.meta.url), 'utf8');
  const frontendSource = await readFile(new URL('frontend/src/services/staff.ts', new URL(`file://${repoRoot}`)), 'utf8');

  const authority = parseScopeMap(backendSource, 'COORDINATOR_SCOPE_TYPES');
  const display = parseScopeMap(frontendSource, 'SCOPE_COMPONENT_TYPES');

  assert.deepEqual(
    display,
    authority,
    'frontend SCOPE_COMPONENT_TYPES drifted from backend COORDINATOR_SCOPE_TYPES; the browser copy is display-only and must mirror the authority.',
  );
});

test('the frontend copy is documented as display-only, not as an authorization source', async () => {
  const frontendSource = await readFile(new URL('frontend/src/services/staff.ts', new URL(`file://${repoRoot}`)), 'utf8');
  assert.match(frontendSource, /DISPLAY-ONLY/);
  assert.match(frontendSource, /COORDINATOR_SCOPE_TYPES/);
});

test('every scope decision on the server resolves through the authority map', async () => {
  const authorization = await readFile(new URL('../src/modules/nstp/nstp.authorization.js', import.meta.url), 'utf8');
  const staffService = await readFile(new URL('../src/modules/staff/staff.service.js', import.meta.url), 'utf8');

  // Imported, never re-declared, so the middleware and the service cannot disagree.
  assert.match(authorization, /import \{ COORDINATOR_SCOPE_TYPES \} from '\.\.\/staff\/staff\.service\.js'/);
  assert.doesNotMatch(authorization, /COORDINATOR_SCOPE_TYPES\s*=/);
  // An unresolvable scope is refused rather than defaulted to a component.
  assert.match(authorization, /if \(!scopeTypes\) return sendError\(/);
  assert.doesNotMatch(authorization, /scopeTypes\s*(\|\||\?\?)\s*COORDINATOR_SCOPE_TYPES\.CWTS/);
  assert.match(staffService, /if \(!types\) throw httpError\('Coordinator scope is invalid\.', 400\)/);
});
