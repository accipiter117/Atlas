// Phase 8: the AI fairness "poison" test. Everything a faction cannot see is
// scrambled (unexplored terrain, resources, hidden units, rivals' treasuries
// and research). If the AI only reads its view, every command it issues is
// exactly the same as with the true world.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset } from '../sim/fixtures.js';
import { aiGame } from './harness.js';
import { applyCommand, view, currentFactionId, UNEXPLORED, VISIBLE } from '../../src/sim/index.js';
import { createAi, runAiTurn } from '../../src/ai/index.js';

function poison(state, me) {
  const s = structuredClone(state);
  const fog = s.fog[me];
  const terrains = s.map.terrainIds.length;
  fog.forEach((f, i) => {
    if (f === UNEXPLORED) {
      s.map.terrain[i] = (s.map.terrain[i] + 1 + (i % 3)) % terrains;
      s.map.hills[i] = 1 - s.map.hills[i];
      s.map.resource[i] = (i % 5) - 1;
    }
  });
  for (const u of Object.values(s.units)) if (u.faction !== me && fog[u.tile] !== VISIBLE) { u.hp = 7; u.type = 'warrior'; }
  for (const f of s.factions) {
    if (f.id === me) continue;
    f.stocks = { ...f.stocks, gold: 99999, science: 777 };
    f.research = { ...f.research, known: Object.keys(ruleset.techs), current: null };
  }
  return s;
}

// The turn's cached context holds functions; it is rebuilt at the start of each turn anyway.
const cloneMemory = (m) => structuredClone({ ...m, ctx: null });

for (const seed of [21, 22]) {
  test(`seed ${seed}: hidden information never changes an AI command`, () => {
    const g = aiGame(ruleset, { seed, turns: 15 });
    let state = g.state;
    const memories = Object.fromEntries(Object.entries(g.ais).map(([id, ai]) => [id, cloneMemory(ai.memory)]));
    let issued = 0;
    // Four full rounds, every seat, honest and poisoned side by side.
    for (let seat = 0; seat < 16; seat += 1) {
      const me = currentFactionId(state);
      const runWith = (getView) => {
        let s = state;
        const cmds = [];
        const ai = createAi(ruleset, me, cloneMemory(memories[me]));
        runAiTurn(ai, () => getView(s), (cmd) => {
          cmds.push(cmd);
          const r = applyCommand(s, cmd, ruleset);
          if (r.ok) s = r.state;
          return r;
        });
        return { cmds, s, memory: ai.memory };
      };
      const honest = runWith((s) => view(s, me, ruleset));
      const poisoned = runWith((s) => view(poison(s, me), me, ruleset));
      assert.deepEqual(poisoned.cmds, honest.cmds, `${me} on turn ${state.turn}`);
      issued += honest.cmds.length;
      memories[me] = cloneMemory(honest.memory);
      state = honest.s;
      if (currentFactionId(state) === me) state = applyCommand(state, { type: 'endTurn', faction: me }, ruleset).state;
    }
    assert.ok(issued >= 20, `only ${issued} commands compared`);
  });
}
