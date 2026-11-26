// The interactive battle path (section 5.4), with a fake module that stands
// in for a real one with a screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand } from '../../src/sim/index.js';
import { registerModule, unregisterModule, validateResult, autoModule } from '../../src/battles/index.js';
import { createRng } from '../../src/core/rng.js';
import { ruleset, fixtureGame, play } from '../sim/fixtures.js';

const OPEN = ['........', '........', '........'];

const fake = {
  id: 'fake', version: 1, kind: 'interactive', canHandle: (spec) => spec.kind === 'field',
  simulate: (spec, rng) => autoModule().resolve(spec, rng),
  mount() {},
};

function pendingGame() {
  registerModule(fake);
  const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  s.setup = { ...s.setup, battleModule: 'fake', battleMode: 'ask' };
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 });
  return r;
}

test('a human battle with an interactive module waits; nothing else may happen meanwhile', () => {
  const r = pendingGame();
  assert.ok(r.events.some((e) => e.type === 'battlePending'));
  assert.equal(r.state.pendingBattle.module, 'fake');
  assert.equal(r.state.units.u_0002.hp, 100, 'nothing applied yet');
  assert.equal(applyCommand(r.state, { type: 'endTurn', faction: 'f0' }, ruleset).error.code, 'battlePending');
  unregisterModule('fake');
});

test('a bad result from the module is refused and changes nothing', () => {
  const r = pendingGame();
  const spec = r.state.pendingBattle.spec;
  const bad = [
    { battleId: 'nope', winner: 'none', units: [] },
    { battleId: spec.battleId, winner: 'attacker', units: [{ ref: 'u_0001', hp: 100, alive: true }, { ref: 'u_0002', hp: 50, alive: true }] },
    { battleId: spec.battleId, winner: 'none', units: [{ ref: 'u_0001', hp: 150, alive: true }, { ref: 'u_0002', hp: 50, alive: true }] },
    { battleId: spec.battleId, winner: 'none', units: [{ ref: 'u_0001', hp: 0, alive: true }, { ref: 'u_0002', hp: 50, alive: true }] },
    { battleId: spec.battleId, winner: 'none', units: [{ ref: 'u_0009', hp: 10, alive: true }, { ref: 'u_0002', hp: 50, alive: true }] },
  ];
  for (const result of bad) {
    const refused = applyCommand(r.state, { type: 'resolveBattle', result }, ruleset);
    assert.equal(refused.ok, false);
    assert.equal(refused.error.code, 'badResult');
  }
  assert.equal(r.state.units.u_0002.hp, 100);
  unregisterModule('fake');
});

test('a good result from the screen is applied; auto-resolve also works', () => {
  const r = pendingGame();
  const spec = r.state.pendingBattle.spec;
  const result = { battleId: spec.battleId, module: 'fake', moduleVersion: 1, winner: 'attacker', margin: 'clear',
    units: [{ ref: 'u_0001', hp: 90, alive: true, xpGained: 5 }, { ref: 'u_0002', hp: 0, alive: false, xpGained: 0 }], city: null, attackerAdvances: true };
  assert.equal(validateResult(spec, result), null);
  const done = play(r.state, { type: 'resolveBattle', result });
  assert.equal(done.state.pendingBattle, null);
  assert.equal(done.state.units.u_0002, undefined);
  assert.equal(done.state.units.u_0001.tile, 1);
  assert.equal(done.state.battleLog.at(-1).module, 'fake', 'the log keeps the result');

  const r2 = pendingGame();
  const auto = play(r2.state, { type: 'autoResolveBattle' });
  const expected = autoModule().resolve(r2.state.pendingBattle.spec, createRng(r2.state.pendingBattle.spec.seed).next);
  assert.equal(auto.state.units.u_0002?.hp ?? 0, expected.units[1].hp);
  unregisterModule('fake');
});

test('computer-only battles never wait: they auto-resolve (phase 18)', () => {
  registerModule(fake);
  const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  s.factions[0].kind = 'ai';
  s.setup = { ...s.setup, battleModule: 'fake', battleMode: 'ask' };
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 });
  assert.equal(r.state.pendingBattle ?? null, null);
  assert.ok(r.state.units.u_0002.hp < 100);
  assert.equal(r.state.battleLog.at(-1).module, 'auto');
  unregisterModule('fake');
});

test('a computer attacking a human never waits either: it auto-resolves', () => {
  registerModule(fake);
  const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  s.factions[0].kind = 'ai';
  s.factions[1].kind = 'human';
  s.setup = { ...s.setup, battleModule: 'fake', battleMode: 'fight' };
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 });
  assert.equal(r.state.pendingBattle ?? null, null);
  assert.equal(r.state.battleLog.at(-1).module, 'auto');
  unregisterModule('fake');
});
