import { describe, it, expect, beforeEach } from 'vitest';
import {
  CANONICAL_COMPONENTS,
  DEFAULT_CANONICAL_SLOT_LIMITS,
  normalizeSlotLimits,
  toCanonicalComponentType,
  toComponentDisplayLabel,
} from '../data/nstpComponents';
import {
  DEFAULT_COMPONENT_APPLICATION_STATE,
  loadComponentApplicationState,
  saveComponentApplicationState,
  COMPONENT_APPLICATION_STATE_KEY,
  type QualifyingExamResult,
} from '../data/nstpData';

const store: Record<string, string> = {};
const mockLocalStorage: any = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window = {
  localStorage: mockLocalStorage,
  dispatchEvent: () => true,
};

describe('Component normalization and slot limits migration', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('normalizes legacy component display names to canonical database types', () => {
    expect(toCanonicalComponentType('CWTS')).toBe('CWTS');
    expect(toCanonicalComponentType('CWTS (Coast Guard)')).toBe('CWTS_COAST_GUARD');
    expect(toCanonicalComponentType('cwts coast guard')).toBe('CWTS_COAST_GUARD');
    expect(toCanonicalComponentType('MTS (Army)')).toBe('MTS_ARMY');
    expect(toCanonicalComponentType('MTS Army')).toBe('MTS_ARMY');
    expect(toCanonicalComponentType('MTS (Navy)')).toBe('MTS_NAVY');
    expect(toCanonicalComponentType('MTS Navy')).toBe('MTS_NAVY');
    expect(toCanonicalComponentType('LTS')).toBe('LTS');
    expect(toCanonicalComponentType('Invalid')).toBeNull();
  });

  it('maps canonical component types back to user-facing labels', () => {
    expect(toComponentDisplayLabel('CWTS_COAST_GUARD')).toBe('CWTS (Coast Guard)');
    expect(toComponentDisplayLabel('MTS_ARMY')).toBe('MTS (Army)');
    expect(toComponentDisplayLabel('MTS_NAVY')).toBe('MTS (Navy)');
    expect(toComponentDisplayLabel('LTS')).toBe('LTS');
    expect(toComponentDisplayLabel('CWTS')).toBe('CWTS');
  });

  it('migrates legacy slotLimits with display names into canonical keys', () => {
    const legacy = {
      CWTS: 500,
      'CWTS (Coast Guard)': 200,
      'MTS (Army)': 180,
      'MTS (Navy)': 120,
      LTS: 300,
    };

    const migrated = normalizeSlotLimits(legacy);
    expect(migrated).toEqual({
      CWTS: 500,
      CWTS_COAST_GUARD: 200,
      MTS_ARMY: 180,
      MTS_NAVY: 120,
      LTS: 300,
    });
  });

  it('loadComponentApplicationState migrates legacy persisted state from storage', async () => {
    const legacySaved = {
      slotLimits: {
        'CWTS (Coast Guard)': 175,
        'MTS (Army)': 225,
        CWTS: 550,
      } as any,
      qualifyingScore: 75,
      applicationClosed: true,
    };
    await saveComponentApplicationState(legacySaved);

    const loaded = loadComponentApplicationState();
    expect(loaded.slotLimits.CWTS_COAST_GUARD).toBe(175);
    expect(loaded.slotLimits.MTS_ARMY).toBe(225);
    expect(loaded.slotLimits.CWTS).toBe(550);
    expect(loaded.slotLimits.LTS).toBe(DEFAULT_CANONICAL_SLOT_LIMITS.LTS);
    expect(loaded.slotLimits.MTS_NAVY).toBe(DEFAULT_CANONICAL_SLOT_LIMITS.MTS_NAVY);
    expect(loaded.qualifyingScore).toBe(75);
    expect(loaded.applicationClosed).toBe(true);
  });
});
