// Phase 10: the computer seats give exactly the same game whether they play in
// the worker (src/aiWorker.js, in its own thread, with the ruleset and state
// copied across as the browser copies them) or directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { ruleset } from '../sim/fixtures.js';
import { aiGame } from './harness.js';
import { applyCommand, currentFactionId, fingerprint } from '../../src/sim/index.js';
import { createSeatRunner } from '../../src/ai/index.js';

function talk(worker, send, until) {
  return new Promise((resolve, reject) => {
    const on = (m) => { if (until(m)) { worker.off('message', on); resolve(m); } };
    worker.on('message', on);
    worker.once('error', reject);
    if (send) worker.postMessage(send);
  });
}

test('worker and direct runs give identical fingerprints over five rounds', async () => {
  const g = aiGame(ruleset, { seed: 77, turns: 25 });
  let state = g.state;
  const human = currentFactionId(state);
  const others = state.factions.map((f) => f.id).filter((id) => id !== human);
  const direct = createSeatRunner(ruleset, others);
  const worker = new Worker(new URL('./node-worker.mjs', import.meta.url));
  await talk(worker, null, (m) => m.type === 'loaded');
  await talk(worker, { type: 'init', ruleset, factions: others, memories: {} }, (m) => m.type === 'ready');
  try {
    for (let round = 0; round < 5; round += 1) {
      // "You" answer any event (phase 16) and end your turn; then the rivals play both ways from the same state.
      const ev = state.events?.pending?.[human];
      if (ev) state = applyCommand(state, { type: 'chooseEvent', faction: human, event: ev.id, choice: 0 }, ruleset).state;
      state = applyCommand(state, { type: 'endTurn', faction: human }, ruleset).state;
      const a = direct.play(state, { stopAt: human });
      const b = await talk(worker, { type: 'play', id: round, state, stopAt: human }, (m) => m.id === round);
      assert.equal(b.type, 'played', b.message);
      assert.ok(a.commands.length > 0);
      assert.deepEqual(b.commands, a.commands);
      assert.equal(fingerprint(b.state), fingerprint(a.state), `round ${round}`);
      assert.deepEqual(b.journals, direct.journals());
      state = a.state;
    }
  } finally {
    await worker.terminate();
  }
});
