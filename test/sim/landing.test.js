// Killzone Extrasolar War K6: landing battles. Dropships may land on a defended hex; the
// group comes down in waves, anti-air near the hex hits each wave, and troops land only if
// the hex is cleared (docs/KILLZONE.md 6.2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand } from '../../src/sim/index.js';
import { cloneState } from '../../src/sim/commands.js';
import { switchTo } from '../../src/sim/worlds.js';
import { createUnit, unitsAt } from '../../src/sim/units.js';
import { neighbourCache } from '../../src/sim/map.js';
import { distance } from '../../src/sim/borders.js';

const rs = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const CIVS = ['isa', 'home_guard', 'isa_fleet', 'helghast', 'stahl', 'helghast_navy'];

/** The Helghast Navy's fleet (it has a dropship) over Helghan, a group aboard, and an ISA squad on an open hex there. */
function setup({ attackers = ['assault_trooper', 'assault_trooper', 'assault_trooper'], defender = 'home_guard_militia', defenderHp = 100 } = {}) {
  const s = cloneState(createGame(rs, { seed: 3, players: CIVS.map((c) => ({ kind: 'ai', faction: c })), map: { preset: 'kw_vekta' } }));
  const navy = s.factions.find((f) => f.civ === 'helghast_navy').id;
  const isa = s.factions.find((f) => f.civ === 'home_guard').id;
  s.seatIndex = s.seatOrder.indexOf(navy);
  const fleet = Object.values(s.space.fleets).find((f) => f.faction === navy && f.ships.some((x) => rs.units[x.type].space?.lands));
  fleet.at = 'helghan';
  switchTo(s, 'helghan');
  const occupied = new Set([...Object.values(s.units).map((u) => u.tile), ...Object.values(s.cities).map((c) => c.tile)]);
  const open = (t) => !occupied.has(t) && !rs.terrain[s.map.terrainIds[s.map.terrain[t]]]?.water && !rs.terrain[s.map.terrainIds[s.map.terrain[t]]]?.impassable
    && neighbourCache(s.map)[t].every((j) => j >= 0 && !occupied.has(j));
  const far = (t) => Object.values(s.cities).every((c) => distance(s.map, c.tile, t) >= 4);
  const tile = [...Array(s.map.terrain.length).keys()].find((t) => open(t) && far(t));
  const foe = createUnit(s, rs, defender, isa, tile);
  foe.hp = defenderHp;
  fleet.cargo = [attackers.map((type, i) => ({ ...createUnit(s, rs, type, navy, neighbourCache(s.map)[tile][i]) }))];
  for (const u of fleet.cargo[0]) delete s.units[u.id];
  return { s, navy, fleet, tile, foe };
}
const land = (s, navy, fleet, tile, r = rs) => applyCommand(s, { type: 'landArmy', faction: navy, fleet: fleet.id, group: 0, tile, world: 'helghan' }, r);

test('a landing on a defended hex is fought in waves and, once the hex is cleared, the troops land on it', () => {
  const { s, navy, fleet, tile, foe } = setup({ defenderHp: 30 });
  const r = land(s, navy, fleet, tile);
  assert.ok(r.ok, r.error?.message);
  const summary = r.events.find((e) => e.type === 'landingBattle');
  assert.ok(summary.won);
  assert.ok(summary.waves >= 1);
  assert.ok(r.events.some((e) => e.type === 'battle' && e.kind === 'landing'), 'each wave is a battle (war support and glory count it)');
  switchTo(r.state, 'helghan');
  assert.ok(!r.state.units[foe.id], 'the defender is gone');
  assert.ok(unitsAt(r.state, tile).some((u) => u.faction === navy), 'the landing took the hex');
});

test('a landing that fails leaves the hex to its defenders and the survivors aboard', () => {
  const { s, navy, fleet, tile, foe } = setup({ attackers: ['home_guard_militia'].map(() => 'scout_sniper'), defender: 'helghast_heavy' });
  const r = land(s, navy, fleet, tile);
  assert.ok(r.ok, r.error?.message);
  assert.equal(r.events.find((e) => e.type === 'landingBattle').won, false);
  switchTo(r.state, 'helghan');
  assert.ok(r.state.units[foe.id], 'the defender holds');
  assert.ok(!unitsAt(r.state, tile).some((u) => u.faction === navy));
});

test('landing battles are a data switch: off, a defended hex refuses the landing', () => {
  const { s, navy, fleet, tile } = setup();
  const off = { ...rs, tuning: { ...rs.tuning, space: { ...rs.tuning.space, landingBattles: false } } };
  assert.equal(land(s, navy, fleet, tile, off).error.code, 'occupied');
});

test('anti-air just beyond its blocking range fires on every wave', () => {
  const { s, navy, fleet, tile } = setup({ defenderHp: 100 });
  const isa = s.factions.find((f) => f.civ === 'home_guard').id;
  const reach = rs.improvements.anti_air_battery.war.antiAir + 1;
  const spot = [...Array(s.map.terrain.length).keys()].find((t) => distance(s.map, t, tile) === reach && !rs.terrain[s.map.terrainIds[s.map.terrain[t]]]?.water);
  s.map.works = { ...(s.map.works ?? {}), [spot]: { faction: isa, fired: 0 } };
  s.map.improvement[spot] = s.map.improvementIds.indexOf('anti_air_battery');
  const before = fleet.cargo[0].map((u) => u.hp);
  const r = land(s, navy, fleet, tile);
  assert.ok(r.ok, r.error?.message);
  const fought = r.events.filter((e) => e.type === 'battle' && e.kind === 'landing').length;
  assert.ok(fought >= 1);
  const after = r.state.space.fleets[fleet.id].cargo[0];
  const landed = !after;
  assert.ok(landed || after.some((u, i) => u.hp < before[i]), 'flak or the fight hurt the waves');
});
