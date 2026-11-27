// Several worlds in one game (Killzone Extrasolar War, phase K1a; docs/KILLZONE.md 8.1).
// Each world keeps its own map, fog, borders, units, cities and front line; nothing leaks
// between them; games stay reproducible; and a one-world game is untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand, view, fingerprint, currentFactionId } from '../../src/sim/index.js';
import { activeWorld, allCities, allUnits, lookAt, worldData, worldIds, wholeGame, switchTo } from '../../src/sim/worlds.js';
import { eliminate } from '../../src/sim/elimination.js';
import { cloneState } from '../../src/sim/commands.js';
import { aiGame } from '../ai/harness.js';

const two = (await loadReal(['base-ancient', 'test-two-worlds'])).ruleset;
const kz = (await loadReal(['base-ancient', 'killzone', 'test-killzone-worlds'])).ruleset;
const base = (await loadReal(['base-ancient'])).ruleset;

const setup = (seed, players = 2) => ({ seed, players: Array.from({ length: players }, (_, i) => ({ kind: i ? 'ai' : 'human' })), map: { size: 'small', type: 'continents' } });

test('a one-world game has no trace of the worlds system', () => {
  const s = createGame(base, setup(3));
  assert.equal(s.world, undefined);
  assert.equal(s.worlds, undefined);
  assert.equal(s.worldOrder, undefined);
  assert.equal(view(s, 'f0', base).worlds, undefined);
  assert.deepEqual(worldIds(s), ['main']);
  assert.equal(allUnits(s), s.units);
  assert.equal(wholeGame(s), s);
});

test('two worlds: each its own map, the start world holds the starting units, the other is empty', () => {
  const s = createGame(two, setup(4));
  assert.deepEqual(s.worldOrder, ['alpha', 'beta']);
  assert.equal(activeWorld(s), 'alpha');
  assert.equal(s.worlds.alpha, null, 'the active world lives at the top of the state');
  const beta = s.worlds.beta;
  assert.ok(beta.map && beta.owner && beta.units && beta.cities);
  assert.notDeepEqual(beta.map.terrain, s.map.terrain, 'the worlds have different maps');
  assert.ok(Object.keys(s.units).length > 0);
  assert.equal(Object.keys(beta.units).length, 0);
  // Nobody has seen anything of Beta.
  for (const fog of Object.values(beta.fog ?? {})) assert.ok(fog.every((v) => v === 0));
  assert.equal(Object.keys(allUnits(s)).length, Object.keys(s.units).length);
});

test('views show one world at a time and say which', () => {
  const s = createGame(two, setup(5));
  const a = view(s, 'f0', two);
  const b = view(s, 'f0', two, { world: 'beta' });
  assert.equal(a.world, 'alpha');
  assert.equal(b.world, 'beta');
  assert.deepEqual(a.worlds, ['alpha', 'beta']);
  assert.ok(a.units.length > 0);
  assert.equal(b.units.length, 0);
  assert.ok(b.map.terrain.every((t) => t === -1), 'Beta is unexplored');
  assert.equal(b.map.width, s.worlds.beta.map.width);
  assert.throws(() => view(s, 'f0', two, { world: 'gamma' }), /No world/);
  // Looking does not change the game.
  assert.equal(activeWorld(s), 'alpha');
});

test('a command for another world is checked there, and a refusal changes nothing', () => {
  const s = createGame(two, setup(6));
  const me = currentFactionId(s);
  const u = Object.values(s.units).find((x) => x.faction === me);
  const before = fingerprint(s);
  const there = applyCommand(s, { type: 'skip', faction: me, unit: u.id, world: 'beta' }, two);
  assert.equal(there.ok, false, 'the unit is not on Beta');
  assert.equal(applyCommand(s, { type: 'skip', faction: me, unit: u.id, world: 'gamma' }, two).error.code, 'unknownWorld');
  assert.equal(fingerprint(s), before);
  const here = applyCommand(s, { type: 'skip', faction: me, unit: u.id, world: 'alpha' }, two);
  assert.equal(here.ok, true);
});

test('switching worlds parks one and brings the other back intact', () => {
  const s = cloneState(createGame(two, setup(7)));
  const alphaUnits = JSON.stringify(s.units);
  const betaMap = JSON.stringify(s.worlds.beta.map);
  switchTo(s, 'beta');
  assert.equal(activeWorld(s), 'beta');
  assert.equal(JSON.stringify(s.map), betaMap);
  assert.equal(JSON.stringify(s.worlds.alpha.units), alphaUnits);
  switchTo(s, 'alpha');
  assert.equal(JSON.stringify(s.units), alphaUnits);
  assert.equal(s.worlds.beta.map && JSON.stringify(s.worlds.beta.map), betaMap);
});

test('40 AI turns on two worlds: no refusals, nothing leaks into the empty world, the same every time', () => {
  const run = () => aiGame(two, { seed: 31, players: 3, turns: 40 });
  const g = run();
  assert.deepEqual(g.refusals, []);
  const s = g.state;
  const beta = worldData(s, 'beta');
  // Raiders live on every world (their camps can appear on Beta); no player's units or cities do.
  const players = new Set(s.factions.map((f) => f.id));
  assert.deepEqual(Object.values(beta.units).filter((u) => players.has(u.faction)), []);
  assert.equal(Object.keys(beta.cities).length, 0);
  assert.ok(beta.owner.every((o) => o === null), 'no borders on Beta');
  for (const fog of Object.values(beta.fog ?? {})) assert.ok(fog.every((v) => v === 0), 'no sight of Beta');
  assert.ok(Object.keys(s.cities).length > 0, 'cities were founded on Alpha');
  assert.equal(fingerprint(run().state), fingerprint(s), 'reproducible');
});

test('Killzone on two worlds: both fronts set up, each world keeps its own units and front', () => {
  let s = createGame(kz, { seed: 8, players: [{ kind: 'ai' }, { kind: 'ai' }], map: { preset: 'corinth_front' } });
  assert.deepEqual(s.worldOrder, ['vekta', 'helghan']);
  const hel = s.worlds.helghan;
  assert.ok(hel.frontline && s.frontline, 'a front on each world');
  assert.ok(Object.keys(hel.cities).length >= 2 && Object.keys(s.cities).length >= 2);
  const ids = (o) => new Set(Object.keys(o));
  const vUnits = ids(s.units);
  for (const id of ids(hel.units)) assert.ok(!vUnits.has(id), 'unit ids are unique across worlds');
  // A few rounds of ending turns: every world's cities and units take their turn, nothing moves between worlds.
  const helUnits = [...ids(hel.units)].sort();
  for (let k = 0; k < 6; k += 1) s = applyCommand(s, { type: 'endTurn', faction: currentFactionId(s) }, kz).state;
  assert.equal(activeWorld(s), 'vekta');
  assert.deepEqual([...ids(s.worlds.helghan.units)].filter((id) => helUnits.includes(id)).sort(), helUnits.filter((id) => s.worlds.helghan.units[id]).sort());
  const helCity = Object.values(s.worlds.helghan.cities)[0];
  assert.ok(helCity.pop >= 1);
  assert.equal(Object.keys(allCities(s)).length, Object.keys(s.cities).length + Object.keys(s.worlds.helghan.cities).length);
});

test('a faction with cities only on another world is not knocked out', () => {
  const s = cloneState(createGame(kz, { seed: 9, players: [{ kind: 'ai' }, { kind: 'ai' }], map: { preset: 'corinth_front' } }));
  const f = s.factions[0].id;
  for (const c of Object.values(s.cities)) if (c.faction === f) delete s.cities[c.id];
  for (const u of Object.values(s.units)) if (u.faction === f) delete s.units[u.id];
  const events = [];
  eliminate(s, kz, events);
  assert.equal(s.factions[0].alive, true, 'it still holds cities on Helghan');
  for (const c of Object.values(s.worlds.helghan.cities)) if (c.faction === f) delete s.worlds.helghan.cities[c.id];
  eliminate(s, kz, events);
  assert.equal(s.factions[0].alive, false);
  assert.ok(events.some((e) => e.type === 'factionEliminated'));
});

test('lookAt is read only', () => {
  const s = createGame(two, setup(10));
  const b = lookAt(s, 'beta');
  assert.equal(b.map, s.worlds.beta.map);
  assert.equal(activeWorld(s), 'alpha');
  assert.equal(lookAt(s, 'alpha'), s);
});
