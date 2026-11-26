// Phase 10: the simulator gives the same results for the same seed list, and
// a challenger batch with swapped seats gives each version every seat once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch, plan, parseArgs } from '../../tools/sim.mjs';
import { report, healthProblems } from '../../tools/lib-sim.mjs';

const strip = (games) => games.map(({ worstRoundMs: _ms, ...g }) => g);

test('the same seed list gives the same simulator output', async () => {
  const o = parseArgs(['--games', '3', '--turn-limit', '30', '--seeds', '5-7', '--threads', '2', '--quiet']);
  const a = await runBatch(o);
  const b = await runBatch({ ...o, threads: 1 });
  assert.deepEqual(strip(a), strip(b));
  const r = report(a);
  assert.equal(r.games, 3);
  assert.equal(r.decided + r.stalled, 3);
  assert.deepEqual(r.errors, { refusals: 0, nan: 0, crashes: 0 });
  assert.ok(Array.isArray(healthProblems(r)));
});

test('challenger against champion with seats swapped: every seat played by each version once per seed', () => {
  const jobs = plan(parseArgs(['--games', '4', '--challenger', 'rules-dev/ai/example.json', '--swap-seats', '--seeds', '1-2']));
  assert.equal(jobs.length, 4);
  for (const seed of [1, 2]) {
    const pair = jobs.filter((j) => j.seed === seed);
    assert.equal(pair.length, 2);
    for (let seat = 0; seat < 4; seat += 1) assert.notEqual(pair[0].seats[seat], pair[1].seats[seat]);
  }
  assert.equal(jobs[0].challenger.id, 'example');
});
