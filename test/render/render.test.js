import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, zoomAt, pan, screenToWorld, worldToScreen, MIN_ZOOM, MAX_ZOOM, clampZoom } from '../../src/render/camera.js';
import { fallbackChain, createRegistry, getArt } from '../../src/render/art/registry.js';
import { fxRandom } from '../../src/render/fxRandom.js';
import { edgeCorners, tileCentre, HEX_SCREEN } from '../../src/render/hexDraw.js';
import { shade } from '../../src/render/art/placeholders.js';

test('camera: zoom is clamped to 50% to 200% and keeps the point under the cursor still', () => {
  let cam = createCamera(100, 50, 1);
  const before = screenToWorld(cam, 300, 200);
  cam = zoomAt(cam, 1.7, 300, 200);
  const after = screenToWorld(cam, 300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(zoomAt(cam, 100, 0, 0).zoom, MAX_ZOOM);
  assert.equal(zoomAt(cam, 0.001, 0, 0).zoom, MIN_ZOOM);
  assert.equal(clampZoom(1.3), 1.3);
});

test('camera: dragging moves the world with the pointer at any zoom', () => {
  const cam = createCamera(0, 0, 2);
  const moved = pan(cam, 40, -20);
  const p = worldToScreen(moved, 0, 0);
  assert.deepEqual(p, { x: 40, y: -20 });
});

test('art registry tries the most specific id first, then falls back to a placeholder', () => {
  assert.deepEqual(fallbackChain('unit', 'legionary', { faction: 'rome', class: 'melee' }), ['unit.legionary.rome', 'unit.legionary', 'unit.class.melee']);
  const reg = createRegistry({ art: { 'unit.legionary': { sheet: 'a.json' }, 'unit.class.melee': { sheet: 'b.json' } } });
  assert.equal(getArt(reg, 'unit', 'legionary', { faction: 'rome', class: 'melee' }).found, 'unit.legionary');
  assert.equal(getArt(reg, 'unit', 'swordsman', { class: 'melee' }).found, 'unit.class.melee');
  assert.equal(getArt(reg, 'terrain', 'grassland').placeholder, true);
});

test('cosmetic randomness is repeatable and separate from the game', () => {
  const a = fxRandom(5, 9);
  const b = fxRandom(5, 9);
  const xs = Array.from({ length: 20 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 20 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 20 }, fxRandom(5, 10)));
});

test('hex drawing geometry: edges sit between the right corners; rows interlock', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(edgeCorners), [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]]);
  const map = { width: 10, height: 10 };
  const a = tileCentre(map, 0);
  const b = tileCentre(map, 1);
  const c = tileCentre(map, 10);
  assert.ok(Math.abs(b.x - a.x - Math.sqrt(3) * HEX_SCREEN) < 1e-9);
  assert.ok(Math.abs(c.x - a.x - (Math.sqrt(3) * HEX_SCREEN) / 2) < 1e-9, 'odd rows shift half a hex');
  assert.equal(c.y - a.y, 1.5 * HEX_SCREEN);
  assert.equal(shade('#808080', 0.1), '#9a9a9a');
});

import { lpcAnimation } from '../../src/render/art/lpc.js';
import { createSpriteSheet, HEX_FACING } from '../../src/render/art/spriteSheet.js';
import { facingBetween } from '../../src/render/layers/units.js';
import { readFile } from 'node:fs/promises';

test('LPC layout: walk rows 8 to 11 in the order up, left, down, right; thrust and hurt rows', () => {
  assert.equal(lpcAnimation('walk', 'n').row, 8);
  assert.equal(lpcAnimation('walk', 'w').row, 9);
  assert.equal(lpcAnimation('walk', 's').row, 10);
  assert.equal(lpcAnimation('walk', 'e').row, 11);
  assert.deepEqual(lpcAnimation('idle', 'e'), { row: 11, frames: [0] });
  assert.equal(lpcAnimation('attack', 'n', 'thrust').row, 4);
  assert.equal(lpcAnimation('attack', 'n', 'slash').row, 12);
  assert.equal(lpcAnimation('die', 's').row, 20);
});

test('sprite sheet frames step at the sheet\'s fps; the test warrior is credited', async () => {
  const desc = JSON.parse(await readFile(new URL('../../assets/sprites/lpc-test-warrior.json', import.meta.url), 'utf8'));
  assert.match(desc.credits, /OGA-BY 3\.0/);
  const sheet = createSpriteSheet(null, desc);
  assert.deepEqual(sheet.frame('walk', 'e', 0), { sx: 64, sy: 11 * 64, sw: 64, sh: 64 });
  assert.deepEqual(sheet.frame('walk', 'e', 1000 / 8), { sx: 128, sy: 11 * 64, sw: 64, sh: 64 }, 'next frame after one tick');
});

test('units face the way they walk: each hex direction maps to the nearest of four', () => {
  assert.deepEqual(HEX_FACING, ['e', 'n', 'n', 'w', 's', 's']);
  const map = { width: 10, height: 10 };
  const at = (c, r) => r * 10 + c;
  assert.equal(facingBetween(map, at(4, 4), at(5, 4)), 'e');
  assert.equal(facingBetween(map, at(4, 4), at(3, 4)), 'w');
  assert.equal(facingBetween(map, at(4, 4), at(4, 3)), 'n', 'up-right on an even row');
  assert.equal(facingBetween(map, at(4, 4), at(3, 3)), 'n', 'up-left');
  assert.equal(facingBetween(map, at(4, 4), at(4, 5)), 's', 'down-right');
  assert.equal(facingBetween(map, at(4, 4), at(3, 5)), 's', 'down-left');
});
