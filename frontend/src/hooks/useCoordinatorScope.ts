import { useEffect, useState } from 'react';
import { fetchCurrentUser } from '../services/api';
import { coordinatorScopeOf, normalizeAuthenticatedUser } from '../services/authUser';
import { COMPONENT_TYPE_LABELS, SCOPE_COMPONENT_TYPES } from '../services/staff';
import type { AuthenticatedUser } from '../services/authUser';
import type { CoordinatorScope, NstpComponent } from '../data/nstpData';

export type CoordinatorScopeState =
  | { status: 'resolving' }
  | { status: 'ready'; scope: CoordinatorScope }
  | { status: 'unavailable'; message: string };

export type CoordinatorScopeResult = {
  state: CoordinatorScopeState;
  /** null until the scope is confirmed — never a guessed default. */
  scope: CoordinatorScope | null;
  allowedComponentTypes: Array<keyof typeof COMPONENT_TYPE_LABELS>;
  allowedComponents: NstpComponent[];
  /** Safe to render in headings and empty states before the scope is known. */
  label: string;
};

const NO_SCOPE_MESSAGE = 'Your account does not have an NSTP component program assigned yet. Ask an administrator to set your coordinator scope (CWTS, LTS, or MTS) before managing component records.';

/**
 * Resolves the signed-in coordinator's component scope.
 *
 * Scope is never guessed from the account's component label, and it never falls
 * back to CWTS: doing so silently showed one coordinator another component's
 * roster. The value comes from the authenticated user that App.tsx normalised
 * out of /auth/login or /auth/me (see `normalizeAuthenticatedUser`). If it is
 * missing — a stale in-memory session, or a screen rendered outside the normal
 * shell — the API is asked once more, and otherwise an explicit error state is
 * surfaced so callers can block component-specific screens and actions.
 *
 * This is a convenience for rendering only. Authorization stays server-side:
 * every coordinator endpoint re-derives the scope from the database per request.
 *
 * The argument is the whole session, not a bare `coordinatorScope` field, so that
 * `coordinatorScopeOf` can check the role discriminant first: a non-coordinator
 * payload carrying a stray scope key resolves to no scope at all.
 */
export function useCoordinatorScope(user: AuthenticatedUser | null | undefined): CoordinatorScopeResult {
  // A null user means the caller deliberately opted out — ReportsPage passes null
  // for admins, facilitators and students. Those accounts have no coordinator
  // scope to find, so the /auth/me probe below is skipped rather than issuing a
  // request on every non-coordinator render whose answer is known in advance.
  const enabled = user != null;
  const userId = user?.id ?? null;
  const scopeFromUser = coordinatorScopeOf(user);
  const [state, setState] = useState<CoordinatorScopeState>(
    scopeFromUser ? { status: 'ready', scope: scopeFromUser }
      : enabled ? { status: 'resolving' }
        : { status: 'unavailable', message: NO_SCOPE_MESSAGE },
  );
  useEffect(() => {
    if (scopeFromUser) {
      setState({ status: 'ready', scope: scopeFromUser });
      return;
    }
    if (!enabled) {
      // Not resolving and not ready: a disabled hook must never report a scope,
      // and must never leave callers waiting on a request that was never sent.
      setState({ status: 'unavailable', message: NO_SCOPE_MESSAGE });
      return;
    }
    setState({ status: 'resolving' });
    let cancelled = false;
    fetchCurrentUser()
      .then((response) => {
        if (cancelled) return;
        const resolved = coordinatorScopeOf(normalizeAuthenticatedUser(response?.data));
        if (resolved) setState({ status: 'ready', scope: resolved });
        else setState({ status: 'unavailable', message: NO_SCOPE_MESSAGE });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: 'unavailable',
          message: error instanceof Error ? error.message : 'Unable to confirm your coordinator program scope.',
        });
      });
    return () => { cancelled = true; };
  }, [enabled, scopeFromUser, userId]);

  const scope = state.status === 'ready' ? state.scope : null;
  const allowedComponentTypes = scope ? SCOPE_COMPONENT_TYPES[scope] : [];

  return {
    state,
    scope,
    allowedComponentTypes,
    allowedComponents: allowedComponentTypes.map((type) => COMPONENT_TYPE_LABELS[type]),
    label: scope ?? 'Program not assigned',
  };
}
