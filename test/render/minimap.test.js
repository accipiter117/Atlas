// The minimap's maths (graphics overhaul G2): the world fits inside the
// minimap without stretching, centred, and a point on the minimap maps back
// to the right place in the world (so clicking it moves the camera there).

import test from 'node:test';
import assert from 'node:assert/strict';
import { minimapLayout, minimapToWorld } from '../../src/render/minimap.js';

test('the minimap fits the whole world, centred, with no NaN', () => {
  for (const world of [{ width: 4000, height: 2500 }, { width: 1000, height: 1600 }, { width: 3000, height: 2000 }]) {
    const l = minimapLayout(world, 240, 160);
    for (const n of Object.values(l)) assert.ok(Number.isFinite(n));
    assert.ok(world.width * l.scale <= 240 + 1e-9 && world.height * l.scale <= 160 + 1e-9);
    // One side fills the minimap; the other is centred.
    assert.ok(Math.abs(world.width * l.scale - 240) < 1e-9 || Math.abs(world.height * l.scale - 160) < 1e-9);
    assert.ok(Math.abs(l.ox * 2 + world.width * l.scale - 240) < 1e-9);
    assert.ok(Math.abs(l.oy * 2 + world.height * l.scale - 160) < 1e-9);
  }
});

test('a point on the minimap is the matching point in the world', () => {
  const world = { width: 4000, height: 2500 };
  const l = minimapLayout(world, 240, 160);
  const centre = minimapToWorld(l, 120, 80);
  assert.ok(Math.abs(centre.x - 2000) < 1e-6 && Math.abs(centre.y - 1250) < 1e-6);
  const corner = minimapToWorld(l, l.ox, l.oy);
  assert.ok(Math.abs(corner.x) < 1e-6 && Math.abs(corner.y) < 1e-6);
});
