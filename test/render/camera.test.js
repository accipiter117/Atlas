// The camera keeps the world filling the view (graphics overhaul G9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToWorld, fillZoom, MIN_ZOOM } from '../../src/render/camera.js';

const world = { width: 4000, height: 2400 };
const margin = 120;

test('the camera cannot zoom out past the point where the world fills the view', () => {
  const cam = clampToWorld({ x: 0, y: 0, zoom: MIN_ZOOM }, world, 1366, 768, margin);
  const z = fillZoom(world, 1366, 768, margin);
  assert.equal(cam.zoom, z);
  assert.ok(1366 / cam.zoom <= world.width + 2 * margin + 1e-6);
  assert.ok(768 / cam.zoom <= world.height + 2 * margin + 1e-6);
});

test('no more than the margin of parchment shows past any edge', () => {
  for (const [x, y] of [[-9999, -9999], [9999, 9999], [-9999, 9999], [500, 500]]) {
    const cam = clampToWorld({ x, y, zoom: 1 }, world, 1366, 768, margin);
    assert.ok(cam.x >= -margin - 1e-6 && cam.y >= -margin - 1e-6, `left/top ${cam.x},${cam.y}`);
    assert.ok(cam.x + 1366 <= world.width + margin + 1e-6, 'right');
    assert.ok(cam.y + 768 <= world.height + margin + 1e-6, 'bottom');
  }
});

test('a world smaller than the view at the furthest zoom is centred, and nothing is NaN', () => {
  const tiny = { width: 300, height: 200 };
  const cam = clampToWorld({ x: 50, y: -40, zoom: 2 }, tiny, 1366, 768, margin);
  for (const v of Object.values(cam)) assert.ok(Number.isFinite(v));
  const span = 1366 / cam.zoom;
  if (span >= tiny.width + 2 * margin) assert.ok(Math.abs(cam.x - (tiny.width - span) / 2) < 1e-6);
  assert.deepEqual(clampToWorld({ x: 1, y: 2, zoom: 1 }, world, 0, 0, margin), { x: 1, y: 2, zoom: 1 });
});

test('the camera keeps to the explored part, but a small one never locks you in close', () => {
  const part = { x: 1000, y: 600, width: 3600, height: 2200 };
  const cam = clampToWorld({ x: 0, y: 0, zoom: 0.3 }, part, 1366, 768, margin, 0.55);
  assert.equal(cam.zoom, fillZoom(part, 1366, 768, margin));
  assert.ok(cam.x >= part.x - margin - 1e-6 && cam.y >= part.y - margin - 1e-6);
  assert.ok(cam.x + 1366 / cam.zoom <= part.x + part.width + margin + 1e-6);
  assert.ok(cam.y + 768 / cam.zoom <= part.y + part.height + margin + 1e-6);
  // A first-turn view (a few hexes known) can still zoom out to the reach, centred on it.
  const small = { x: 2000, y: 1200, width: 300, height: 260 };
  const out = clampToWorld({ x: 0, y: 0, zoom: MIN_ZOOM }, small, 1366, 768, margin, 0.55);
  assert.equal(out.zoom, 0.55);
  assert.ok(Math.abs(out.x + 1366 / out.zoom / 2 - (small.x + small.width / 2)) < 1e-6);
});
