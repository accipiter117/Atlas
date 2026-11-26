import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, buildSpec, fingerprint, promotionOptions, promotionsAvailable, cityStrength } from '../../src/sim/index.js';
import { damage } from '../../src/battles/auto/index.js';
import { estimateOdds } from '../../src/ui/odds.js';
import { expDet } from '../../src/core/mathdet.js';
import { clone } from '../../src/core/clone.js';
import { ruleset, fixtureGame, at, addRiver, play, passRound } from './fixtures.js';

const T = { baseDamage: 30, strengthScale: 25, spread: 0.2 };
const OPEN = ['........', '........', '........', '........', '........'];

test('damage formula against hand-worked values; equal strength gives 24 to 36 HP', () => {
  assert.equal(damage(0, T, 0), 24);
  assert.equal(damage(0, T, 0.5), 30);
  assert.equal(damage(0, T, 0.999999), 36);
  assert.equal(damage(25, T, 0.5), 82, '30 x e = 81.55');
  assert.equal(damage(-25, T, 0.5), 11, '30 / e = 11.04');
  assert.equal(damage(10, T, 0.5), 45, '30 x e^0.4 = 44.75');
  assert.ok(Math.abs(expDet(1) - Math.E) < 1e-15);
});

test('equal warriors on open ground each lose 24 to 36 HP', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
    s.rng = seed;
    const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 });
    const a = r.state.units.u_0001.hp;
    const d = r.state.units.u_0002.hp;
    assert.ok(100 - a >= 24 && 100 - a <= 36, `attacker lost ${100 - a}`);
    assert.ok(100 - d >= 24 && 100 - d <= 36, `defender lost ${100 - d}`);
    assert.equal(r.state.units.u_0001.moves, 0, 'attacking ends the move');
  }
});

test('modifiers stack as documented', () => {
  const rows = ['.F......', '........', '........'];
  const s = fixtureGame(rows, [{ type: 'warrior', at: 2 }, { type: 'warrior', at: 9 }, { type: 'spearman', faction: 'f1', at: 1 }]);
  addRiver(s.map, 2, 1);
  const d = s.units.u_0003;
  d.activity = 'fortify';
  d.fortifiedTurns = 2;
  d.hp = 70;
  s.units.u_0001.hp = 85;
  const spec = buildSpec(s, ruleset, s.units.u_0001, 1);
  const mods = (side) => Object.fromEntries(spec.modifiers[side].map((m) => [m.source, m.amount]));
  assert.deepEqual(mods('defender'), { hills: 3, forest: 3, fortified: 4, wounded: -3 });
  assert.deepEqual(mods('attacker'), { wounded: -1, river: -5, flanking: 2 });
  assert.equal(spec.ground.riverCrossing, true);
  // A spearman gets +10 against cavalry.
  const rules = clone(ruleset);
  const h = fixtureGame(OPEN, [{ type: 'horseman', at: 0 }, { type: 'spearman', faction: 'f1', at: 1 }], { rules });
  const hs = buildSpec(h, rules, h.units.u_0001, 1);
  assert.ok(hs.modifiers.defender.some((m) => m.source === 'ability' && m.amount === 10));
});

test('uphill across a river is worse than open ground, in the odds and on average', () => {
  const open = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  const hard = fixtureGame(['.h......', '........'], [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  addRiver(hard.map, 0, 1);
  const oOpen = estimateOdds(buildSpec(open, ruleset, open.units.u_0001, 1));
  const oHard = estimateOdds(buildSpec(hard, ruleset, hard.units.u_0001, 1));
  assert.ok(oHard.defenderLoss < oOpen.defenderLoss && oHard.attackerLoss > oOpen.attackerLoss);
  let dealtOpen = 0;
  let dealtHard = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const a = clone(open); a.rng = seed;
    const b = clone(hard); b.rng = seed;
    dealtOpen += 100 - play(a, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 }).state.units.u_0002.hp;
    dealtHard += 100 - play(b, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 }).state.units.u_0002.hp;
  }
  assert.ok(dealtHard < dealtOpen * 0.8, `${dealtHard} against ${dealtOpen}`);
  assert.ok(Math.abs(dealtOpen / 60 - oOpen.defenderLoss) < 3, 'the odds match what happens');
});

test('the odds preview never touches state.rng', () => {
  const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  const before = s.rng;
  const print = fingerprint(s);
  const o1 = estimateOdds(buildSpec(s, ruleset, s.units.u_0001, 1));
  const o2 = estimateOdds(buildSpec(s, ruleset, s.units.u_0001, 1));
  assert.equal(s.rng, before);
  assert.equal(fingerprint(s), print);
  assert.deepEqual(o1, o2);
  assert.ok(o1.win === 0 && o1.attackerLoss > 24 && o1.attackerLoss < 36);
});

test('ranged attacks take no damage back; out of range is refused', () => {
  const s = fixtureGame(OPEN, [{ type: 'archer', at: 0 }, { type: 'warrior', faction: 'f1', at: 2 }]);
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 2 });
  assert.equal(r.state.units.u_0001.hp, 100);
  assert.ok(r.state.units.u_0002.hp < 100);
  assert.equal(r.state.units.u_0001.tile, 0, 'ranged units stay put');
  const far = fixtureGame(OPEN, [{ type: 'archer', at: 0 }, { type: 'warrior', faction: 'f1', at: 3 }]);
  assert.equal(applyCommand(far, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 3 }, ruleset).error.code, 'outOfRange');
  const melee = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 2 }]);
  assert.equal(applyCommand(melee, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 2 }, ruleset).error.code, 'notAdjacent');
});

test('a kill lets melee advance and take civilians on the hex', () => {
  const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }, { type: 'builder', faction: 'f1', at: 1 }]);
  s.units.u_0002.hp = 5;
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 });
  assert.equal(r.state.units.u_0002, undefined);
  assert.equal(r.state.units.u_0001.tile, 1);
  assert.equal(r.state.units.u_0003.faction, 'f0', 'the builder is captured');
});

/** A game where f1 owns a city at (4, 2) and f0 has a warrior next to it. */
function siege(extra = []) {
  const rows = ['............', '............', '............', '............', '............'];
  // No techs: the city's strength comes from ancient units, so a warrior can finish it.
  let s = fixtureGame(rows, [{ type: 'warrior', at: at({ width: 12 }, 3, 2) }, { type: 'settler', faction: 'f1', at: at({ width: 12 }, 4, 2) }, ...extra], { knowAll: false });
  s = play(s, { type: 'endTurn', faction: 'f0' }).state;
  s = play(s, { type: 'foundCity', faction: 'f1', unit: 'u_0002' }).state;
  s = play(s, { type: 'endTurn', faction: 'f1' }).state;
  return { s, city: Object.values(s.cities)[0] };
}

test('cities: strength from their best unit and walls; melee captures at 0 HP; Keep or Raze', () => {
  let { s, city } = siege();
  assert.ok(cityStrength(s, ruleset, city) > ruleset.units.warrior.strength);
  assert.equal(city.hp, 200);
  s.cities[city.id].hp = 10;
  s.cities[city.id].pop = 4;
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: city.tile });
  s = r.state;
  assert.equal(s.cities[city.id].faction, 'f0');
  assert.deepEqual(s.pendingCapture, { city: city.id, faction: 'f0' });
  assert.equal(applyCommand(s, { type: 'endTurn', faction: 'f0' }, ruleset).error.code, 'capturePending');
  assert.equal(applyCommand(s, { type: 'captureChoice', faction: 'f0', city: city.id, choice: 'raze' }, ruleset).error.code, 'cannotRazeCapital');
  s = play(s, { type: 'captureChoice', faction: 'f0', city: city.id, choice: 'keep' }).state;
  assert.equal(s.cities[city.id].pop, 2, 'keeping it loses half its people');
  assert.ok(!s.cities[city.id].buildings.includes('palace'));
});

test('razing removes a captured city one citizen a turn', () => {
  let { s, city } = siege();
  s.cities[city.id].originalCapital = false;
  s.cities[city.id].hp = 1;
  s.cities[city.id].pop = 2;
  s = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: city.tile }).state;
  s = play(s, { type: 'captureChoice', faction: 'f0', city: city.id, choice: 'raze' }).state;
  s = passRound(s);
  assert.equal(s.cities[city.id].pop, 1);
  s = passRound(s);
  assert.equal(s.cities[city.id], undefined);
  assert.ok(s.owner.every((o) => o !== city.id));
});

test('ranged units cannot capture; walled cities shoot once a turn', () => {
  let { s, city } = siege([{ type: 'archer', at: at({ width: 12 }, 2, 2) }]);
  s.cities[city.id].hp = 5;
  s = play(s, { type: 'attack', faction: 'f0', unit: 'u_0003', target: city.tile }).state;
  assert.equal(s.cities[city.id].faction, 'f1', 'still theirs at 0 HP until a melee unit walks in');
  assert.equal(s.cities[city.id].hp, 0);
  s = play(s, { type: 'endTurn', faction: 'f0' }).state;
  assert.equal(applyCommand(s, { type: 'cityAttack', faction: 'f1', city: city.id, target: at(s.map, 3, 2) }, ruleset).error.code, 'needsWalls');
  s.cities[city.id].buildings.push('walls');
  s = play(s, { type: 'cityAttack', faction: 'f1', city: city.id, target: at(s.map, 3, 2) }).state;
  assert.ok(s.units.u_0001.hp < 100);
  assert.equal(applyCommand(s, { type: 'cityAttack', faction: 'f1', city: city.id, target: at(s.map, 3, 2) }, ruleset).error.code, 'alreadyShot');
});

test('experience and promotions: earn, pick from a short list, and the bonus applies', () => {
  let s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: 1 }]);
  s.units.u_0001.xp = 12;
  const r = play(s, { type: 'attack', faction: 'f0', unit: 'u_0001', target: 1 });
  assert.ok(r.events.some((e) => e.type === 'promotionReady' && e.unit === 'u_0001'));
  s = r.state;
  assert.equal(promotionsAvailable(ruleset, s.units.u_0001), 1);
  const options = promotionOptions(ruleset, s.units.u_0001);
  assert.deepEqual(options.sort(), ['charge', 'shield_wall']);
  assert.equal(applyCommand(s, { type: 'promote', faction: 'f0', unit: 'u_0001', promotion: 'veteran' }, ruleset).error.code, 'badPromotion');
  s = play(s, { type: 'promote', faction: 'f0', unit: 'u_0001', promotion: 'charge' }).state;
  assert.deepEqual(s.units.u_0001.promotions, ['charge']);
  const spec = buildSpec(s, ruleset, s.units.u_0001, 1);
  assert.ok(spec.modifiers.attacker.some((m) => m.source === 'promotion:charge' && m.amount === 7));
});

/** 200 scripted attacks between two lines of units; returns the final state and every battle's result. */
function scripted() {
  const rows = ['............', '............', '............', '............', '............', '............'];
  const units = [];
  for (let c = 0; c < 12; c += 1) { units.push({ type: c % 3 ? 'warrior' : 'spearman', at: c }); units.push({ type: c % 2 ? 'warrior' : 'archer', faction: 'f1', at: 12 + c }); }
  let s = fixtureGame(rows, units);
  const results = [];
  let attacks = 0;
  for (let round = 0; attacks < 200 && round < 200; round += 1) {
    for (const me of ['f0', 'f1']) {
      for (const u of Object.values(s.units).filter((x) => x.faction === me)) {
        if (attacks >= 200) break;
        const foe = Object.values(s.units).find((x) => x.faction !== me && applyCommand(s, { type: 'attack', faction: me, unit: u.id, target: x.tile }, ruleset).ok);
        if (!foe) continue;
        const r = play(s, { type: 'attack', faction: me, unit: u.id, target: foe.tile });
        s = r.state;
        attacks += 1;
        results.push(r.events.find((e) => e.type === 'battle'));
      }
      s = play(s, { type: 'endTurn', faction: me }).state;
    }
    // Refill the lines so fighting continues.
    for (const [i, u] of units.entries()) if (!Object.values(s.units).some((x) => x.tile === u.at)) s.units[`r_${round}_${i}`] = { id: `r_${round}_${i}`, type: u.type, faction: u.faction ?? 'f0', tile: u.at, hp: 100, moves: 0, activity: 'none', fortifiedTurns: 0, goto: null, xp: 0, promotions: [] };
  }
  return { s, results, attacks };
}

test('200 scripted battles are deterministic', () => {
  const a = scripted();
  const b = scripted();
  assert.equal(a.attacks, 200);
  assert.equal(fingerprint(a.s), fingerprint(b.s));
  assert.deepEqual(a.results, b.results);
  assert.ok(a.results.some((r) => r.winner === 'attacker') && a.results.some((r) => r.winner === 'none'));
});

test('raiders: a camp appears in the fog, sends raiders, and clearing it pays gold', () => {
  const rows = Array.from({ length: 12 }, () => '..................');
  let s = fixtureGame(rows, [{ type: 'warrior', at: 0 }], { fog: true });
  s.setup = { ...s.setup, raiders: 'on' };
  s.factions[0].stocks.gold = 0;
  for (let k = 0; k < 20; k += 1) s = passRound(s);
  const camps = Object.keys(s.raiders.camps).map(Number);
  assert.ok(camps.length >= 1, 'a camp appeared');
  assert.ok(Object.values(s.units).some((u) => u.faction === 'raiders'), 'raiders came out');
  // Clear one: put our warrior next to an empty camp and walk in.
  const camp = camps[0];
  for (const u of Object.values(s.units)) if (u.faction === 'raiders') delete s.units[u.id];
  const next = camp + 1 < 12 * 18 && (camp + 1) % 18 !== 0 ? camp + 1 : camp - 1;
  s.units.u_0001.tile = next;
  s.units.u_0001.moves = 2;
  s.fog.f0.fill(2);
  const r = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: camp });
  assert.ok(r.events.some((e) => e.type === 'campCleared'));
  assert.equal(r.state.factions[0].stocks.gold, ruleset.tuning.raiders.campGold);
});
