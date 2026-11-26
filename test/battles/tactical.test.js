// Phase 18: the tactical battle module. simulate() is deterministic; over 500
// battles its outcomes stay within 10 points of auto-resolve for the same
// specs (so fighting is not a cheat); every result passes the engine's checks;
// recorded orders replay exactly; and a strategic game replays from its
// stored results even with the module gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import tactical from '../../src/battles/tactical/index.js';
import { replayBattle, createBattle, giveOrder, stepBattle, battleResult } from '../../src/battles/tactical/sim/battle.js';
import { autoModule, validateResult, registerModule, unregisterModule } from '../../src/battles/index.js';
import { createRng } from '../../src/core/rng.js';
import { applyCommand, fingerprint } from '../../src/sim/index.js';
import { ruleset, fixtureGame, play } from '../sim/fixtures.js';

const TUNING = { baseDamage: 30, strengthScale: 25, spread: 0.2, xpAttack: 5, xpDefence: 3, tactical: ruleset.tuning.battle.tactical };
const CLASSES = ['melee', 'anti_cavalry', 'cavalry', 'ranged', 'siege', 'recon'];

/** A random but valid spec of the given kind. */
function randomSpec(g, i, kind = g.pick(['field', 'field', 'field', 'ranged', 'city'])) {
  const aS = g.int(15, 50);
  const dS = g.int(15, 50);
  const garrison = kind === 'city' && g.next() < 0.5 ? [{ ref: 'g', type: 'warrior', class: 'melee', strength: 20, hp: g.int(30, 100), tags: [] }] : [];
  return {
    battleId: `b${i}`, seed: g.int(1, 1e9), turn: 1, kind,
    attacker: { faction: 'f0', human: false, units: [{ ref: 'a', type: 'x', class: kind === 'ranged' ? 'ranged' : g.pick(CLASSES.filter((c) => c !== 'ranged')), strength: aS, rangedStrength: aS, hp: g.int(20, 100), tags: [] }], support: [] },
    defender: kind === 'city'
      ? { faction: 'f1', human: false, units: garrison, city: { ref: 'c', name: 'Town', strength: dS + 8, hp: g.int(50, 200) } }
      : { faction: 'f1', human: false, units: [{ ref: 'd', type: 'y', class: g.pick(CLASSES), strength: dS, hp: g.int(20, 100), tags: [] }], city: null },
    ground: { centre: { terrain: g.pick(['grassland', 'plains', 'desert', 'tundra']), hills: g.next() < 0.3, feature: g.next() < 0.3 ? 'forest' : null, river: false },
      ring: Array.from({ length: 6 }, () => ({ terrain: g.pick(['grassland', 'plains', 'coast']), hills: g.next() < 0.2, feature: g.next() < 0.2 ? 'forest' : null })), riverCrossing: g.next() < 0.2 },
    modifiers: { attacker: g.next() < 0.3 ? [{ source: 'flanking', amount: 2 }] : [], defender: [{ source: 'terrain', amount: g.int(0, 6) }] },
    tuning: TUNING,
  };
}

test('simulate is deterministic: the same spec and seed give the same battle', () => {
  const g = createRng(1);
  for (let i = 0; i < 20; i += 1) {
    const spec = randomSpec(g, i);
    const a = tactical.simulate(spec, createRng(spec.seed).next);
    const b = tactical.simulate(spec, createRng(spec.seed).next);
    assert.deepEqual(a, b);
  }
});

test('over 500 battles, simulated outcomes are within 10 points of auto-resolve', () => {
  const g = createRng(2024);
  const tally = { tactical: { attacker: 0, defender: 0, none: 0 }, auto: { attacker: 0, defender: 0, none: 0 } };
  const byKind = {};
  for (let i = 0; i < 500; i += 1) {
    const spec = randomSpec(g, i);
    const t = tactical.simulate(spec, createRng(spec.seed).next);
    const a = autoModule().resolve(spec, createRng(spec.seed).next);
    tally.tactical[t.winner] += 1;
    tally.auto[a.winner] += 1;
    byKind[spec.kind] ??= { n: 0, t: 0, a: 0 };
    byKind[spec.kind].n += 1;
    byKind[spec.kind].t += t.winner === 'attacker' ? 1 : 0;
    byKind[spec.kind].a += a.winner === 'attacker' ? 1 : 0;
  }
  for (const w of ['attacker', 'defender', 'none']) {
    const gap = Math.abs(tally.tactical[w] - tally.auto[w]) / 5;
    assert.ok(gap <= 10, `${w} wins: tactical ${tally.tactical[w] / 5}% against auto ${tally.auto[w] / 5}%`);
  }
  for (const [kind, k] of Object.entries(byKind)) {
    assert.ok(Math.abs(k.t - k.a) / k.n <= 0.1, `${kind}: attacker wins ${k.t} against ${k.a} of ${k.n}`);
  }
});

test('stronger defences (hills and woods) make the same attack harder, in both modules', () => {
  const g = createRng(9);
  let open = 0;
  let dug = 0;
  for (let i = 0; i < 300; i += 1) {
    const spec = randomSpec(g, i, 'field');
    spec.modifiers.defender = [];
    const hard = { ...spec, ground: { ...spec.ground, centre: { ...spec.ground.centre, hills: true, feature: 'forest' } }, modifiers: { attacker: [], defender: [{ source: 'hills', amount: 3 }, { source: 'forest', amount: 3 }] } };
    open += tactical.simulate(spec, createRng(spec.seed).next).damage.toDefender;
    dug += tactical.simulate(hard, createRng(spec.seed).next).damage.toDefender;
  }
  assert.ok(dug < open * 0.85, `damage dealt on open ground ${open}, on a wooded hill ${dug}`);
});

test('every result passes the engine checks: refs, HP in range, a winner that matches', () => {
  const g = createRng(77);
  for (let i = 0; i < 300; i += 1) {
    const spec = randomSpec(g, i);
    const r = tactical.simulate(spec, createRng(spec.seed).next);
    assert.equal(validateResult(spec, r), null, `${spec.kind} ${JSON.stringify(r.units)} ${r.winner}`);
    assert.equal(r.module, 'tactical');
    if (spec.defender.city) for (const u of spec.defender.units) assert.equal(r.units.find((x) => x.ref === u.ref).hp, u.hp, 'the garrison keeps its health');
  }
});

test('a battle with your orders replays exactly from its seed and recorded orders', () => {
  const g = createRng(5);
  const spec = randomSpec(g, 1, 'field');
  const b = createBattle(spec, createRng(spec.seed).next, { playerSide: 'attacker' });
  giveOrder(b, { band: 'a0', type: 'move', x: 80, y: 200 });
  for (let k = 0; k < 40; k += 1) stepBattle(b);
  giveOrder(b, { band: 'a0', type: 'charge' });
  while (!b.over) stepBattle(b);
  const live = battleResult(b);
  const again = replayBattle(spec, createRng(spec.seed).next, live.replay);
  assert.deepEqual(again, live);
  assert.equal(live.replay.orders.length, 2);
});

test('withdrawing ends the battle at once; both sides keep what they have', () => {
  const g = createRng(6);
  const spec = randomSpec(g, 2, 'field');
  const b = createBattle(spec, createRng(spec.seed).next, { playerSide: 'attacker' });
  giveOrder(b, { type: 'withdraw', side: 'attacker' });
  stepBattle(b);
  const r = battleResult(b);
  assert.equal(r.winner, 'none');
  assert.equal(r.replay.endReason, 'withdrawn');
  assert.deepEqual(r.units.map((u) => u.hp), [spec.attacker.units[0].hp, spec.defender.units[0].hp]);
});

test('the module fights land battles only', () => {
  const g = createRng(8);
  const spec = randomSpec(g, 3, 'field');
  assert.equal(tactical.canHandle(spec), true);
  assert.equal(tactical.canHandle({ ...spec, kind: 'cityRanged' }), false);
  const ship = { ...spec, attacker: { ...spec.attacker, units: [{ ...spec.attacker.units[0], class: 'naval_melee', tags: ['ship'] }] } };
  assert.equal(tactical.canHandle(ship), false);
});

test('a strategic game replays from its stored battle result, even with the module removed', () => {
  const OPEN = ['........', '........', '........'];
  const s0 = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  s0.setup = { ...s0.setup, battleModule: 'tactical', battleMode: 'fight' };
  const attack = { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 };
  const r1 = play(s0, attack);
  const spec = r1.state.pendingBattle.spec;
  assert.equal(r1.state.pendingBattle.module, 'tactical');
  // The screen's result: a battle fought with orders (here, played out by the module itself).
  const result = tactical.simulate(spec, createRng(spec.seed).next);
  const log = [attack, { type: 'resolveBattle', result }];
  const runLog = () => log.reduce((s, cmd) => {
    const r = applyCommand(s, cmd, ruleset);
    assert.equal(r.ok, true, `${cmd.type}: ${r.error?.code}`);
    return r.state;
  }, s0);
  const first = runLog();
  unregisterModule('tactical');
  try {
    const second = runLog();
    assert.equal(fingerprint(second), fingerprint(first));
    assert.equal(second.battleLog.at(-1).module, 'tactical');
    assert.equal(second.units.u_0001?.hp ?? 0, result.units[0].hp);
  } finally {
    registerModule(tactical);
  }
});
