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
