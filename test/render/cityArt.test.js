// Graphics overhaul G5 (docs/OVERHAUL.md 4.4): cities grow through four size
// tiers and take their style from the skin and the owner's era.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cityTier, styleFor, CITY_STYLES } from '../../src/render/art/cityArt.js';

test('population maps to the four size tiers', () => {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 10, 11, 30].map(cityTier);
  assert.deepEqual(tiers, [1, 1, 1, 2, 2, 2, 3, 3, 4, 4]);
});

test('the style follows the skin and the era, with ancient as the fallback', () => {
  const base = { style: 'ancient', eras: { medieval: 'stone', renaissance: 'stone' } };
  assert.equal(styleFor(base, 'ancient'), 'ancient');
  assert.equal(styleFor(base, 'medieval'), 'stone');
  assert.equal(styleFor({ style: 'timber' }, 'medieval'), 'timber');
  assert.equal(styleFor(undefined, null), 'ancient');
  for (const s of ['ancient', 'stone', 'timber', 'bunker']) assert.ok(CITY_STYLES[s], `${s} has a palette`);
});
