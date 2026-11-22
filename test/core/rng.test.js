import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, random, randomInt, fork, forkSeed, step } from '../../src/core/rng.js';

const draw = (seed, n) => { const r = createRng(seed); return Array.from({ length: n }, () => r.next()); };

test('identical seeds give identical sequences', () => {
  assert.deepEqual(draw(12345, 100), draw(12345, 100));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(draw(12345, 20), draw(12346, 20));
  assert.notDeepEqual(draw(0, 20), draw(1, 20));
});

test('values stay in [0, 1) and spread evenly enough', () => {
  const values = draw(99, 10000);
  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean}`);
});

test('the generator is a pure step function (mulberry32 reference values)', () => {
  // First outputs of mulberry32 for seed 1, from the reference implementation.
  const a = step(1);
  const b = step(a.seed);
  assert.equal(a.seed, (1 + 0x6d2b79f5) >>> 0);
  assert.equal(a.value, 0.6270739405881613);
  assert.equal(b.value, 0.002735721180215478);
});

test('state helpers advance state.rng and replay identically', () => {
  const s1 = { rng: 777 };
  const s2 = { rng: 777 };
  const rolls1 = Array.from({ length: 50 }, () => randomInt(s1, 1, 6));
  const rolls2 = Array.from({ length: 50 }, () => randomInt(s2, 1, 6));
  assert.deepEqual(rolls1, rolls2);
  assert.ok(rolls1.every((d) => d >= 1 && d <= 6));
  assert.equal(s1.rng, s2.rng);
  assert.notEqual(s1.rng, 777);
  random(s1);
  assert.notEqual(s1.rng, s2.rng);
});

test('named forks are repeatable, independent and leave the main stream alone', () => {
  const state = { rng: 4242 };
  const a = fork(state, 'map').next();
  const b = fork(state, 'map').next();
  const c = fork(state, 'seats').next();
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(state.rng, 4242);
  assert.equal(forkSeed(4242, 'map'), forkSeed(4242, 'map'));
});

test('shuffle is deterministic and keeps every item', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const x = createRng(5).shuffle(list);
  const y = createRng(5).shuffle(list);
  assert.deepEqual(x, y);
  assert.deepEqual([...x].sort(), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'original untouched');
});

test('seeds must be integers', () => {
  assert.throws(() => createRng(1.5), TypeError);
  assert.throws(() => createRng('7'), TypeError);
});
