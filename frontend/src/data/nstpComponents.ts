/**
 * The canonical NSTP component vocabulary, and the only sanctioned way to turn
 * an untrusted string into one.
 *
 * This file is deliberately dependency-free. It holds the vocabulary that
 * decides which coordinator owns a record, so it must be importable from
 * anywhere — including plain Node test runners — without dragging in the API
 * client, the browser, or React.
 *
 * Display metadata only. The backend re-derives every component from the
 * database and re-checks each write against the coordinator's scope, so nothing
 * in this file grants access; it exists so the client stops guessing.
 */

export type NstpComponent = 'CWTS' | 'LTS' | 'MTS (Army)' | 'MTS (Navy)' | 'CWTS (Coast Guard)';

export const NSTP_COMPONENTS: NstpComponent[] = ['CWTS', 'LTS', 'MTS (Army)', 'MTS (Navy)', 'CWTS (Coast Guard)'];

/**
 * The normalized database enum component identifiers.
 */
export type CanonicalComponentType = 'CWTS' | 'LTS' | 'MTS_ARMY' | 'MTS_NAVY' | 'CWTS_COAST_GUARD';

export const CANONICAL_COMPONENTS: readonly CanonicalComponentType[] = [
  'CWTS',
  'LTS',
  'MTS_ARMY',
  'MTS_NAVY',
  'CWTS_COAST_GUARD',
] as const;

export const COMPONENT_DISPLAY_NAMES: Record<CanonicalComponentType, NstpComponent> = {
  CWTS: 'CWTS',
  LTS: 'LTS',
  MTS_ARMY: 'MTS (Army)',
  MTS_NAVY: 'MTS (Navy)',
  CWTS_COAST_GUARD: 'CWTS (Coast Guard)',
};

export const DEFAULT_CANONICAL_SLOT_LIMITS: Record<CanonicalComponentType, number> = Object.freeze({
  CWTS: 600,
  LTS: 400,
  MTS_ARMY: 300,
  MTS_NAVY: 200,
  CWTS_COAST_GUARD: 250,
});

/**
 * Maps known user/display/enum variants to the canonical database component enum.
 */
export function toCanonicalComponentType(value: unknown): CanonicalComponentType | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toUpperCase();
  if (raw === 'CWTS' || raw === 'CIVIC WELFARE TRAINING SERVICE') return 'CWTS';
  if (raw === 'LTS' || raw === 'LITERACY TRAINING SERVICE') return 'LTS';
  if (raw === 'MTS_ARMY' || raw === 'MTS (ARMY)' || raw === 'MTS ARMY' || raw === 'MILITARY TRAINING SERVICE - ARMY') return 'MTS_ARMY';
  if (raw === 'MTS_NAVY' || raw === 'MTS (NAVY)' || raw === 'MTS NAVY' || raw === 'MILITARY TRAINING SERVICE - NAVY') return 'MTS_NAVY';
  if (raw === 'CWTS_COAST_GUARD' || raw === 'CWTS (COAST GUARD)' || raw === 'CWTS COAST GUARD' || raw === 'CIVIC WELFARE TRAINING SERVICE - COAST GUARD') return 'CWTS_COAST_GUARD';

  if (raw.includes('COAST') && raw.includes('GUARD')) return 'CWTS_COAST_GUARD';
  if (raw.includes('ARMY')) return 'MTS_ARMY';
  if (raw.includes('NAVY')) return 'MTS_NAVY';
  if (raw.includes('LITERACY')) return 'LTS';
  if (raw.includes('CIVIC')) return 'CWTS';
  return null;
}

export function toComponentDisplayLabel(value: unknown): NstpComponent | null {
  const canonical = toCanonicalComponentType(value);
  return canonical ? COMPONENT_DISPLAY_NAMES[canonical] : null;
}

/**
 * Migrates and normalizes slotLimits so that every key is a canonical component identifier,
 * mapping legacy keys like 'CWTS (Coast Guard)' or 'MTS (Army)' to canonical enum keys.
 */
export function normalizeSlotLimits(raw: unknown): Record<CanonicalComponentType, number> {
  const result: Record<CanonicalComponentType, number> = { ...DEFAULT_CANONICAL_SLOT_LIMITS };
  if (!raw || typeof raw !== 'object') return result;

  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const canonical = toCanonicalComponentType(key);
    const num = typeof val === 'number' ? val : parseInt(String(val), 10);
    if (canonical && Number.isFinite(num) && num >= 0) {
      result[canonical] = num;
    }
  }
  return result;
}

/**
 * Validates a component label coming from outside the type system — a CSV cell,
 * a `User.data` blob, a select element's `string` value, an event payload.
 *
 * Returns `null` for anything that is not one of the five canonical labels.
 * Callers must treat `null` as "unknown component" and either reject the input
 * or leave the field empty. Nothing here guesses CWTS: a blank or misspelled
 * component that silently became CWTS produced records that looked legitimate
 * to CWTS coordinators and were invisible to everyone else.
 *
 * Whitespace and letter case are normalised (`' cwts '`, `'LTS'`) because those
 * are transport artefacts rather than different values; nothing else is.
 */
export function toNstpComponent(value: unknown): NstpComponent | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return NSTP_COMPONENTS.find((component) => component.toUpperCase() === candidate) ?? null;
}

/**
 * The single label every screen uses for a student whose component is `null`.
 * Display-only: it is never stored and never parsed back into a component.
 */
export const UNASSIGNED_COMPONENT_LABEL = 'Not yet assigned';

/**
 * A coordinator's program. Broader than a component: the CWTS coordinator owns
 * both `CWTS` and `CWTS (Coast Guard)`, the MTS coordinator both MTS branches.
 * Mirrors the backend `CoordinatorScope` enum.
 */
export type CoordinatorScope = 'CWTS' | 'MTS' | 'LTS';

export const COORDINATOR_SCOPES: readonly CoordinatorScope[] = ['CWTS', 'MTS', 'LTS'] as const;

/**
 * Validates a coordinator scope arriving from outside the type system — a login
 * payload, a nested `coordinatorProfile`, a `User.data` blob, a cached account
 * row.
 *
 * Accepts only the three scopes the backend enum defines. Anything else —
 * missing, null, misspelled, a component name like `MTS_NAVY`, a stale value
 * from an older client — resolves to `undefined` so callers render an explicit
 * "scope unknown" state. It deliberately never falls back to CWTS: that default
 * is what made every unresolved coordinator look like a CWTS coordinator and
 * read a program that was not theirs.
 *
 * This lives beside the component vocabulary, and not in `services/authUser.ts`,
 * so the snapshot layer can validate a cached scope without importing the auth
 * service that already imports it.
 */
export function toCoordinatorScope(value: unknown): CoordinatorScope | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim().toUpperCase();
  return COORDINATOR_SCOPES.find((scope) => scope === candidate);
}
