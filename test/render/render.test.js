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
