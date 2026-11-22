import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hex, hexDistance, neighbours, ring, spiral, line, hexToPixel, pixelToHex, hexKey, parseHexKey, hexCorners,
} from '../../src/core/hex.js';

const keys = (list) => list.map(hexKey);

test('distance against hand-worked cases', () => {
  assert.equal(hexDistance(hex(0, 0), hex(0, 0)), 0);
  assert.equal(hexDistance(hex(0, 0), hex(1, 0)), 1);
  assert.equal(hexDistance(hex(0, 0), hex(3, -1)), 3);
  assert.equal(hexDistance(hex(0, 0), hex(2, 2)), 4);
  assert.equal(hexDistance(hex(1, -3), hex(-2, 1)), 4);
  assert.equal(hexDistance(hex(-2, 1), hex(1, -3)), 4, 'symmetric');
});

test('neighbours are the six adjacent hexes, clockwise from east', () => {
  assert.deepEqual(keys(neighbours(hex(0, 0))), ['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1']);
  assert.deepEqual(keys(neighbours(hex(2, -1))), ['3,-1', '3,-2', '2,-2', '1,-1', '1,0', '2,0']);
  for (const n of neighbours(hex(5, 7))) assert.equal(hexDistance(hex(5, 7), n), 1);
});

test('rings: hand-worked radius 1, sizes and distances for larger radii', () => {
  assert.deepEqual(keys(ring(hex(0, 0), 0)), ['0,0']);
  assert.deepEqual(keys(ring(hex(0, 0), 1)), ['-1,1', '0,1', '1,0', '1,-1', '0,-1', '-1,0']);
  for (const radius of [2, 3, 5]) {
    const r = ring(hex(4, -2), radius);
    assert.equal(r.length, 6 * radius);
    assert.equal(new Set(keys(r)).size, r.length, 'no duplicates');
    for (const h of r) assert.equal(hexDistance(hex(4, -2), h), radius);
  }
});

test('spiral covers every hex within a radius exactly once', () => {
  const s = spiral(hex(0, 0), 2);
  assert.equal(s.length, 19);
  assert.equal(new Set(keys(s)).size, 19);
  assert.equal(hexKey(s[0]), '0,0');
});

test('lines: hand-worked straight lines and length', () => {
  assert.deepEqual(keys(line(hex(0, 0), hex(3, 0))), ['0,0', '1,0', '2,0', '3,0']);
  assert.deepEqual(keys(line(hex(0, 0), hex(2, -2))), ['0,0', '1,-1', '2,-2']);
  assert.deepEqual(keys(line(hex(1, 1), hex(1, 1))), ['1,1']);
  const l = line(hex(-3, 2), hex(4, -1));
  assert.equal(l.length, hexDistance(hex(-3, 2), hex(4, -1)) + 1);
  for (let i = 1; i < l.length; i += 1) assert.equal(hexDistance(l[i - 1], l[i]), 1, 'each step is one hex');
  assert.deepEqual(keys(line(hex(-3, 2), hex(4, -1))), keys(line(hex(-3, 2), hex(4, -1))), 'deterministic');
});

test('pixel conversion: hand-worked centres and a round trip', () => {
  const p = hexToPixel(hex(1, 0), 10);
  assert.ok(Math.abs(p.x - 17.3205) < 1e-3 && p.y === 0);
  const q = hexToPixel(hex(0, 1), 10);
  assert.ok(Math.abs(q.x - 8.6603) < 1e-3 && q.y === 15);
  for (const h of spiral(hex(0, 0), 4)) {
    const c = hexToPixel(h, 32);
    assert.deepEqual(pixelToHex(c.x + 3, c.y - 2, 32), h);
  }
  assert.equal(hexCorners(hex(0, 0), 10).length, 6);
});

test('keys round trip', () => {
  assert.deepEqual(parseHexKey(hexKey(hex(-4, 9))), hex(-4, 9));
});
