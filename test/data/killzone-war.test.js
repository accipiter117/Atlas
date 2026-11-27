// Killzone: Extrasolar War K4a (docs/KILLZONE.md sections 4 and 5): six splinter factions, the
// war's own units, bases, projects and research in place of the ancient world's, and a
// six-faction computer game that runs clean.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from './helpers.js';
import { createGame, applyCommand, sideOf } from '../../src/sim/index.js';
import { cloneState } from '../../src/sim/commands.js';
import { allCities, switchTo, worldData } from '../../src/sim/worlds.js';
import { buildOptions } from '../../src/sim/cities.js';
import { suppliedTiles } from '../../src/sim/war.js';
import { createSeatRunner } from '../../src/ai/index.js';

const rs = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const base = (await loadReal(['base-ancient'])).ruleset;
const CIVS = ['isa', 'home_guard', 'isa_fleet', 'helghast', 'stahl', 'helghast_navy'];
const six = (seed = 4) => createGame(rs, { seed, players: CIVS.map((c, i) => ({ kind: i ? 'ai' : 'human', faction: c })), map: { preset: 'kw_vekta' } });

test('six splinter factions, three a side, each with a leader and a capital on its home world', () => {
  assert.deepEqual(Object.keys(rs.factions).sort(), [...CIVS].sort());
  const s = six();
  for (const f of s.factions) {
    const side = sideOf(s, rs, f.id);
    assert.equal(side, ['isa', 'home_guard', 'isa_fleet'].includes(f.civ) ? 0 : 1);
    assert.ok(rs.leaders[rs.factions[f.civ].leaders[0]], `${f.civ} has a leader`);
    const caps = Object.values(allCities(s)).filter((c) => c.faction === f.id && c.capital);
    assert.equal(caps.length, 1, `${f.civ} has one capital`);
    const home = side === 0 ? 'vekta' : 'helghan';
    assert.ok(Object.values(worldData(s, home).cities).some((c) => c.id === caps[0].id), `${f.civ}'s capital is on ${home}`);
  }
  // Each side's fleets belong to its fleet faction.
  assert.ok(Object.values(s.space.fleets).every((fl) => ['isa_fleet', 'helghast_navy'].includes(s.factions.find((x) => x.id === fl.faction).civ)));
});

test('the ancient world is gone: no base unit, building, tech, doctrine, religion or resource is left', () => {
  const left = (type, keep = []) => Object.keys(base[type] ?? {}).filter((id) => rs[type]?.[id] && !keep.includes(id));
  assert.deepEqual(left('units'), []);
  // Only the capital building stays (as Headquarters); the war's barracks shares the ancient one's name.
  assert.deepEqual(left('buildings', ['palace', 'barracks']), []);
  assert.notEqual(rs.buildings.barracks.cost, base.buildings.barracks.cost);
  assert.deepEqual(left('wonders'), []);
  assert.deepEqual(left('techs'), []);
  assert.deepEqual(left('civics'), []);
  assert.deepEqual(left('policies'), []);
  assert.deepEqual(left('governments'), []);
  assert.deepEqual(left('resources'), []);
  assert.equal(Object.keys(rs.beliefs ?? {}).length, 0, 'no religion in this war');
  assert.ok(Object.keys(rs.techs).length >= 25 && Object.keys(rs.buildings).length === 17 && Object.keys(rs.wonders).length === 5);
  assert.equal(rs.text['tooltip.yield.food'], 'Rations');
  assert.equal(rs.text['era.classical.name'], 'Escalation');
  // Every unit, building and project points at techs that exist.
  for (const u of Object.values(rs.units)) if (u.requires?.tech) assert.ok(rs.techs[u.requires.tech], u.id);
  for (const b of Object.values(rs.buildings)) if (b.requires?.tech) assert.ok(rs.techs[b.requires.tech], b.id);
});

test('each side builds its own kit; faction units only for their faction; flagships only from projects', () => {
  const s = cloneState(six());
  for (const f of s.factions) f.research = { ...f.research, known: Object.keys(rs.techs) };
  const cityOf = (civ) => Object.values(s.cities).find((c) => s.factions.find((f) => f.id === c.faction).civ === civ);
  const opts = (civ) => buildOptions(s, rs, cityOf(civ)).filter((o) => o.kind === 'unit').map((o) => o.id);
  const isa = opts('isa');
  assert.ok(isa.includes('rifle_squad') && !isa.includes('assault_trooper'), 'ISA kit only');
  assert.ok(!isa.includes('home_guard_militia'), 'Home Guard militia for the Home Guard only');
  assert.ok(opts('home_guard').includes('home_guard_militia'));
  assert.ok(!isa.includes('new_sun_cruiser'), 'a flagship is never trained');
  const bs = buildOptions(s, rs, cityOf('isa')).filter((o) => o.kind === 'wonder').map((o) => o.id);
  assert.ok(bs.includes('orbital_defence_grid') && !bs.includes('arc_cannon_array'), 'each side its own projects');
  // A shipyard on a home world, not on a moon.
  assert.ok(buildOptions(s, rs, cityOf('isa')).some((o) => o.id === 'shipyard'));
  switchTo(s, 'halcyon');
  const moonBase = Object.values(s.cities)[0];
  assert.ok(!buildOptions(s, rs, moonBase).some((o) => o.id === 'shipyard'));
});

test('projects launch flagships into orbit; orbital guns hit enemy ships; logistics hubs reach further', () => {
  const s = cloneState(six());
  const f0 = s.factions.find((f) => f.civ === 'isa');
  f0.research.known = Object.keys(rs.techs);
  s.seatIndex = s.seatOrder.indexOf(f0.id);
  const hq = Object.values(s.cities).find((c) => c.faction === f0.id);
  hq.queue = [{ kind: 'wonder', id: 'new_sun_project' }];
  hq.progress = 100_000;
  let t = s;
  for (let k = 0; k < s.factions.length && !Object.values(t.space.fleets).some((fl) => fl.ships.some((x) => x.type === 'new_sun_cruiser')); k += 1) {
    t = applyCommand(t, { type: 'endTurn', faction: t.seatOrder[t.seatIndex] }, rs).state;
  }
  assert.ok(Object.values(t.space.fleets).some((fl) => fl.faction === f0.id && fl.at === 'vekta' && fl.ships.some((x) => x.type === 'new_sun_cruiser')), 'the New Sun is in Vekta\'s orbit');
  // Orbital guns: an enemy fleet over a base with the defence grid takes damage at the end of the round.
  const g = cloneState(six());
  const isaHq = Object.values(g.cities).find((c) => g.factions.find((f) => f.id === c.faction).civ === 'isa');
  isaHq.buildings.push('orbital_defence_grid');
  const enemy = Object.values(g.space.fleets).find((fl) => fl.at === 'ardent');
  enemy.at = 'vekta';
  const hp = enemy.ships[0].hp;
  let r = g;
  const events = [];
  for (let k = 0; k < g.factions.length; k += 1) { const x = applyCommand(r, { type: 'endTurn', faction: r.seatOrder[r.seatIndex] }, rs); events.push(...x.events); r = x.state; }
  assert.ok(events.some((e) => e.type === 'orbitalGuns'));
  assert.ok(!r.space.fleets[enemy.id] || r.space.fleets[enemy.id].ships[0].hp < hp);
  // Logistics hub: the base supplies further.
  const h = cloneState(six());
  const hub = Object.values(h.cities).find((c) => h.factions.find((f) => f.id === c.faction).civ === 'isa');
  const without = suppliedTiles(h, rs, hub.faction).size;
  hub.buildings.push('logistics_hub');
  assert.ok(suppliedTiles(h, rs, hub.faction).size > without);
});

test('petrusite on Helghan and Kerberos, fuel on Vekta and Halcyon, worked by extractors', () => {
  const s = six();
  const count = (w, r) => worldData(s, w).map.resource.filter((x) => x >= 0 && worldData(s, w).map.resourceIds[x] === r).length;
  assert.ok(count('helghan', 'petrusite') >= 3 && count('kerberos', 'petrusite') >= 3);
  assert.ok(count('vekta', 'fuel') >= 2 && count('halcyon', 'fuel') >= 1);
  assert.equal(rs.resources.petrusite.improvement, 'extractor');
  assert.equal(rs.units.tank_platoon.requires.resource, 'fuel');
});

test('six computer factions play 40 turns with no refused orders, and research moves', () => {
  let s = createGame(rs, { seed: 9, players: CIVS.map((c) => ({ kind: 'ai', faction: c })), map: { preset: 'kw_vekta' }, speed: 'quick', events: 'occasional' });
  const ids = s.factions.map((f) => f.id);
  const runner = createSeatRunner(rs, ids, { recordOff: true });
  const refusals = [];
  while (!s.winner && s.turn <= 40) { const r = runner.play(s, { maxSeats: ids.length }); s = r.state; refusals.push(...r.refusals); }
  assert.deepEqual(refusals, []);
  assert.ok(s.factions.some((f) => (f.research?.known?.length ?? 0) >= 3), 'someone has learned three techs');
});
