import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashValue, stableStringify, hashString } from '../../src/core/hash.js';
import { clone, deepFreeze } from '../../src/core/clone.js';
import { nextId } from '../../src/core/ids.js';

test('hash ignores object key order but not values', () => {
  assert.equal(hashValue({ a: 1, b: [1, 2] }), hashValue({ b: [1, 2], a: 1 }));
  assert.notEqual(hashValue({ a: 1 }), hashValue({ a: 2 }));
  assert.match(hashValue({}), /^[0-9a-f]{8}$/);
  assert.equal(hashString(''), 0x811c9dc5);
});

test('hashing refuses NaN and Infinity, so they cannot hide in a state', () => {
  assert.throws(() => stableStringify({ a: NaN }), TypeError);
  assert.throws(() => stableStringify([Infinity]), TypeError);
});

test('clone makes an independent deep copy; deepFreeze locks everything', () => {
  const a = { x: [1, { y: 2 }] };
  const b = clone(a);
  b.x[1].y = 3;
  assert.equal(a.x[1].y, 2);
  const f = deepFreeze({ p: { q: [1] } });
  assert.ok(Object.isFrozen(f.p.q));
});

test('ids count up from state.nextId', () => {
  const s = { nextId: 1 };
  assert.equal(nextId(s, 'u'), 'u_0001');
  assert.equal(nextId(s, 'c'), 'c_0002');
  assert.equal(s.nextId, 3);
  assert.throws(() => nextId(s, 'U1'), TypeError);
});
