// Phase 19: the Killzone platoon battle adapter. simulate() is deterministic,
// every result passes the engine's checks, strength and health set the
// platoons, the attacker's side follows its faction, and sea fights go to auto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import killzone from '../../src/battles/killzone/index.js';
import { forcesFor, mapTypeOf, attackerSideOf } from '../../src/battles/killzone/sim/adapter.js';
import { validateResult } from '../../src/battles/index.js';
import { createRng } from '../../src/core/rng.js';
import { loadReal } from '../data/helpers.js';

const rs = (await loadReal(['base-ancient', 'killzone'])).ruleset;
await killzone.load();
const TUNING = { baseDamage: 30, strengthScale: 25, xpAttack: 5, xpDefence: 3, killzone: rs.tuning.battle.killzone };

function spec({ kind = 'field', aCiv = 'isa', dCiv = 'helghast', aS = 30, dS = 30, aHp = 100, dHp = 100, city = false, dMods = [], seed = 11 } = {}) {
  return {
    battleId: `b${seed}`, seed, turn: 3, kind,
    attacker: { faction: 'f0', civ: aCiv, human: false, units: [{ ref: 'a', type: 'warrior', class: 'melee', strength: aS, rangedStrength: aS, hp: aHp, tags: [] }], support: [] },
    defender: city ? { faction: 'f1', civ: dCiv, human: false, units: [{ ref: 'g', type: 'warrior', class: 'melee', strength: 20, hp: 80, tags: [] }], city: { ref: 'c', name: 'Pyrrhus', strength: dS, hp: 200 } }
      : { faction: 'f1', civ: dCiv, human: false, units: [{ ref: 'd', type: 'spearman', class: 'anti_cavalry', strength: dS, hp: dHp, tags: [] }], city: null },
    ground: { centre: { terrain: 'plains', hills: false, feature: null }, ring: [] },
    modifiers: { attacker: [], defender: dMods },
    tuning: TUNING,
  };
}

test('simulate is deterministic: the same spec and seed give the same battle', () => {
  const s = spec();
  const a = killzone.simulate(s, createRng(s.seed).next);
  const b = killzone.simulate(s, createRng(s.seed).next);
  assert.deepEqual(a, b);
  assert.equal(a.module, 'killzone');
});

test('results pass the engine checks for field and city battles', () => {
  for (const s of [spec({ seed: 1 }), spec({ seed: 2, aS: 40, dS: 20 }), spec({ seed: 3, city: true, dS: 28 }), spec({ seed: 4, aHp: 40 })]) {
    const r = killzone.simulate(s, createRng(s.seed).next);
    assert.equal(validateResult(s, r), null, JSON.stringify(r.units));
    for (const u of r.units) assert.ok(Number.isInteger(u.hp) && u.hp >= 0);
  }
});

test('strength sets how many squads a platoon fields, health how many soldiers are present', () => {
  const strong = forcesFor(spec({ aS: 48 })).forces[0].platoons[0];
  const weak = forcesFor(spec({ aS: 12 })).forces[0].platoons[0];
  assert.ok(strong.roles.length > weak.roles.length);
  const hurt = forcesFor(spec({ aHp: 40 })).forces[0].platoons[0];
  assert.deepEqual(hurt.alive, hurt.roles.map(() => 2));
});

test('the Helghast fight from the Killzone sim\'s second side; the ground picks the map', () => {
  assert.equal(attackerSideOf(spec()), 0);
  assert.equal(attackerSideOf(spec({ aCiv: 'helghast', dCiv: 'isa' })), 1);
  const { forces } = forcesFor(spec({ aCiv: 'helghast', dCiv: 'isa' }));
  assert.equal(forces[1].platoons[0].ref, 'a');
  assert.equal(mapTypeOf(spec()), 'industrial');
  assert.equal(mapTypeOf(spec({ dMods: [{ source: 'hills', amount: 3 }] })), 'trenches');
  assert.equal(mapTypeOf(spec({ city: true })), 'city');
});

test('land battles only', () => {
  assert.equal(killzone.canHandle(spec()), true);
  assert.equal(killzone.canHandle({ ...spec(), kind: 'cityRanged' }), false);
  const ship = spec();
  ship.attacker.units[0] = { ...ship.attacker.units[0], class: 'naval_melee', tags: ['ship'] };
  assert.equal(killzone.canHandle(ship), false);
});

// K6 (Killzone Extrasolar War): the battlefield is built from the hex's war works, stations
// fight in built-up corridors, and every faction of the Helghast side takes the second side.
const war = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const WAR = { ...TUNING, killzone: war.tuning.battle.killzone };
const warSpec = (extra = {}) => {
  const s = spec(extra);
  return { ...s, tuning: WAR, ground: { ...s.ground, ...(extra.ground ?? {}) } };
};

test('K6: works on and beside the hex: trenches dig the defenders in, nests add orders, a battery beside it brings artillery', async () => {
  const { worksOf } = await import('../../src/battles/killzone/sim/adapter.js');
  const s = warSpec({ ground: { centre: { terrain: 'plains', hills: false, feature: null, work: { id: 'trench', side: 1 } }, ring: [{ work: { id: 'artillery_battery', side: 0 } }, { work: { id: 'mg_nest', side: 1 } }] } });
  const w = worksOf(s);
  assert.equal(w.side1.fortified, true, 'the Helghast defenders are dug in');
  assert.equal(w.side0.artillery, true, 'the ISA battery beside the hex supports the attack');
  assert.equal(w.side1.opBonus, 0, 'a nest beside the hex is not on it');
  const { forces } = forcesFor(s);
  assert.equal(forces[1].fortified, true);
  assert.equal(forces[0].artillery, true);
  assert.equal(mapTypeOf(s), 'trenches');
  const nest = worksOf(warSpec({ ground: { centre: { terrain: 'plains', work: { id: 'mg_nest', side: 1 } }, ring: [] } }));
  assert.equal(nest.side1.opBonus, war.tuning.battle.killzone.works.mg_nest.opBonus);
});

test('K6: a station battle is fought in built-up corridors; Stahl and the Navy fight from the second side; vehicles bring the tank', () => {
  assert.equal(mapTypeOf(warSpec({ ground: { worldKind: 'station' } })), 'city');
  assert.equal(attackerSideOf(warSpec({ aCiv: 'stahl', dCiv: 'isa' })), 1);
  assert.equal(attackerSideOf(warSpec({ aCiv: 'helghast_navy', dCiv: 'isa' })), 1);
  const tank = warSpec();
  tank.attacker.units[0] = { ...tank.attacker.units[0], tags: ['vehicle'] };
  assert.equal(forcesFor(tank).forces[0].tank, true);
  assert.equal(forcesFor(spec()).forces[0].tank, false, 'Killzone: The Front is unchanged');
});

test('K6: battles on fortified ground and in stations stay deterministic and pass the engine checks', () => {
  for (const s of [warSpec({ seed: 21, ground: { centre: { terrain: 'plains', hills: false, feature: null, work: { id: 'bunker', side: 1 } }, ring: [] } }), warSpec({ seed: 22, ground: { worldKind: 'station' } })]) {
    const a = killzone.simulate(s, createRng(s.seed).next);
    assert.deepEqual(killzone.simulate(s, createRng(s.seed).next), a);
    assert.equal(validateResult(s, a), null);
  }
});
