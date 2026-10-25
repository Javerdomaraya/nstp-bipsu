/**
 * Canonical NSTP Component normalization and slotLimits migration.
 */

export const CANONICAL_COMPONENTS = Object.freeze([
  'CWTS',
  'LTS',
  'MTS_ARMY',
  'MTS_NAVY',
  'CWTS_COAST_GUARD',
]);

export const COMPONENT_DISPLAY_NAMES = Object.freeze({
  CWTS: 'CWTS',
  LTS: 'LTS',
  MTS_ARMY: 'MTS (Army)',
  MTS_NAVY: 'MTS (Navy)',
  CWTS_COAST_GUARD: 'CWTS (Coast Guard)',
});

export const DEFAULT_CANONICAL_SLOT_LIMITS = Object.freeze({
  CWTS: 600,
  LTS: 400,
  MTS_ARMY: 300,
  MTS_NAVY: 200,
  CWTS_COAST_GUARD: 250,
});

/**
 * Normalizes any string representation of an NSTP component into its canonical database enum.
 */
export function toCanonicalComponentType(value) {
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

export function toComponentDisplayLabel(value) {
  const canonical = toCanonicalComponentType(value);
  return canonical ? COMPONENT_DISPLAY_NAMES[canonical] : null;
}

/**
 * Migrates and normalizes slotLimits so that every key is a canonical component identifier,
 * mapping legacy keys like 'CWTS (Coast Guard)' or 'MTS (Army)' to canonical enum keys.
 */
export function normalizeSlotLimits(raw) {
  const result = { ...DEFAULT_CANONICAL_SLOT_LIMITS };
  if (!raw || typeof raw !== 'object') return result;

  for (const [key, val] of Object.entries(raw)) {
    const canonical = toCanonicalComponentType(key);
    const num = typeof val === 'number' ? val : parseInt(String(val), 10);
    if (canonical && Number.isFinite(num) && num >= 0) {
      result[canonical] = num;
    }
  }
  return result;
}
