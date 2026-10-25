import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANONICAL_COMPONENTS,
  DEFAULT_CANONICAL_SLOT_LIMITS,
  normalizeSlotLimits,
  toCanonicalComponentType,
  toComponentDisplayLabel,
} from '../src/modules/nstp/component-normalization.js';

test('toCanonicalComponentType resolves all canonical, display, and informal component variants', () => {
  assert.equal(toCanonicalComponentType('CWTS'), 'CWTS');
  assert.equal(toCanonicalComponentType('LTS'), 'LTS');
  assert.equal(toCanonicalComponentType('MTS_ARMY'), 'MTS_ARMY');
  assert.equal(toCanonicalComponentType('MTS_NAVY'), 'MTS_NAVY');
  assert.equal(toCanonicalComponentType('CWTS_COAST_GUARD'), 'CWTS_COAST_GUARD');

  // Display strings with parentheses
  assert.equal(toCanonicalComponentType('CWTS (Coast Guard)'), 'CWTS_COAST_GUARD');
  assert.equal(toCanonicalComponentType('MTS (Army)'), 'MTS_ARMY');
  assert.equal(toCanonicalComponentType('MTS (Navy)'), 'MTS_NAVY');

  // Informal space strings
  assert.equal(toCanonicalComponentType('cwts coast guard'), 'CWTS_COAST_GUARD');
  assert.equal(toCanonicalComponentType('mts army'), 'MTS_ARMY');
  assert.equal(toCanonicalComponentType('mts navy'), 'MTS_NAVY');

  // Full names
  assert.equal(toCanonicalComponentType('Civic Welfare Training Service - Coast Guard'), 'CWTS_COAST_GUARD');
  assert.equal(toCanonicalComponentType('Military Training Service - Army'), 'MTS_ARMY');

  // Unknown returns null
  assert.equal(toCanonicalComponentType('ROTC_AIRFORCE'), null);
  assert.equal(toCanonicalComponentType(null), null);
  assert.equal(toCanonicalComponentType(123), null);
});

test('toComponentDisplayLabel maps canonical enums to human-readable UI names', () => {
  assert.equal(toComponentDisplayLabel('CWTS'), 'CWTS');
  assert.equal(toComponentDisplayLabel('CWTS_COAST_GUARD'), 'CWTS (Coast Guard)');
  assert.equal(toComponentDisplayLabel('MTS_ARMY'), 'MTS (Army)');
  assert.equal(toComponentDisplayLabel('MTS_NAVY'), 'MTS (Navy)');
  assert.equal(toComponentDisplayLabel('LTS'), 'LTS');
});

test('normalizeSlotLimits migrates legacy display keys to canonical database keys', () => {
  const legacySlots = {
    CWTS: 500,
    LTS: 350,
    'MTS (Army)': 280,
    'MTS (Navy)': 190,
    'CWTS (Coast Guard)': 220,
  };

  const normalized = normalizeSlotLimits(legacySlots);

  assert.deepEqual(normalized, {
    CWTS: 500,
    LTS: 350,
    MTS_ARMY: 280,
    MTS_NAVY: 190,
    CWTS_COAST_GUARD: 220,
  });

  // Verify all CANONICAL_COMPONENTS are present
  for (const component of CANONICAL_COMPONENTS) {
    assert.equal(typeof normalized[component], 'number');
    assert(normalized[component] >= 0);
  }
});

test('normalizeSlotLimits fills in defaults when given empty or partial payloads', () => {
  const empty = normalizeSlotLimits(null);
  assert.deepEqual(empty, DEFAULT_CANONICAL_SLOT_LIMITS);

  const partial = normalizeSlotLimits({
    'MTS Army': 150,
  });

  assert.equal(partial.MTS_ARMY, 150);
  assert.equal(partial.CWTS, DEFAULT_CANONICAL_SLOT_LIMITS.CWTS);
  assert.equal(partial.CWTS_COAST_GUARD, DEFAULT_CANONICAL_SLOT_LIMITS.CWTS_COAST_GUARD);
  assert.equal(partial.LTS, DEFAULT_CANONICAL_SLOT_LIMITS.LTS);
  assert.equal(partial.MTS_NAVY, DEFAULT_CANONICAL_SLOT_LIMITS.MTS_NAVY);
});
