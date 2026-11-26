// Phase 17: AI-only Witcher games (base-ancient + witcher), 150 turns on five
// seeds: no refused commands, no NaN, only the setting's factions, and the
// monsters roam as raiders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiGame } from './harness.js';
import { loadReal } from '../data/helpers.js';

/** Paths in the state holding NaN (JSON would hide them as null). */
function nanPaths(v, path = 'state', out = []) {
  if (typeof v === 'number' && Number.isNaN(v)) out.push(path);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) nanPaths(x, `${path}.${k}`, out);
  return out;
}

const rs = (await loadReal(['base-ancient', 'witcher'])).ruleset;

for (const seed of [11, 12, 13, 14, 15]) {
  test(`Witcher seed ${seed}: 150 AI turns with 0 errors`, () => {
    let monsters = 0;
    const g = aiGame(rs, { seed, turns: 150, speed: 'quick', onTurn: (s) => { monsters = Math.max(monsters, Object.values(s.units).filter((u) => u.faction === 'raiders').length); } });
    assert.deepEqual(g.refusals, []);
    assert.ok(g.state.turn >= 150 || g.state.winner, 'played to turn 150 or a victory');
    assert.deepEqual(nanPaths(g.state).slice(0, 5), []);
    for (const f of g.state.factions) assert.ok(rs.factions[f.civ]?.tags.includes('witcher'), f.civ);
    for (const u of Object.values(g.state.units).filter((x) => x.faction === 'raiders')) assert.ok(rs.units[u.type].tags.includes('monster'), u.type);
    assert.ok(monsters > 0, 'monsters appeared');
  });
}
