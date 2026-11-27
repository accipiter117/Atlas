// War support, glory, the war council, arms deals, side victories and scenarios
// (Killzone Extrasolar War K4b; docs/KILLZONE.md sections 4 and 6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand, sideOf } from '../../src/sim/index.js';
import { cloneState } from '../../src/sim/commands.js';
import { allCities, worldData } from '../../src/sim/worlds.js';
import { noteWarEvents, sidesRound, council, warSupportEffects, armsPrice } from '../../src/sim/sides.js';
import { checkVictory } from '../../src/sim/victories/index.js';

const rs = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const CIVS = ['isa', 'home_guard', 'isa_fleet', 'helghast', 'stahl', 'helghast_navy'];
const game = (extra = {}) => cloneState(createGame(rs, { seed: 4, players: CIVS.map((c, i) => ({ kind: i ? 'ai' : 'human', faction: c })), map: { preset: 'kw_vekta' }, ...extra }));
const fid = (s, civ) => s.factions.find((f) => f.civ === civ).id;
const t = rs.tuning.warSupport;

test('war support starts level; glory and the council start empty', () => {
  const s = game();
  assert.deepEqual(s.warSupport, { 0: t.start, 1: t.start });
  assert.ok(Object.values(s.glory).every((g) => g === 0));
  assert.equal(s.council[0], null);
});

test('battles, worlds, landings on a home world and fallen capitals move war support and glory', () => {
  const s = game();
  const isa = fid(s, 'isa');
  const hel = fid(s, 'helghast');
  noteWarEvents(s, rs, [{ type: 'battle', winner: 'attacker', attackerFaction: isa, defenderFaction: hel }]);
  assert.deepEqual(s.warSupport, { 0: t.start + t.battle, 1: t.start - t.battle });
  assert.ok(s.glory[isa] >= t.gloryBattle);
  noteWarEvents(s, rs, [{ type: 'worldCaptured', world: 'morrow', side: 0, from: 1 }]);
  assert.equal(s.warSupport[1], t.start - t.battle - t.territory);
  noteWarEvents(s, rs, [{ type: 'armyLanded', world: 'vekta', faction: fid(s, 'helghast_navy'), units: [] }]);
  assert.equal(s.warSupport[0], t.start + t.battle + t.territory - t.homeLanding);
  assert.ok(s.glory[fid(s, 'helghast_navy')] > 0, 'the Navy\'s ambition: landing on Vekta');
  const pyrrhus = Object.values(allCities(s)).find((c) => c.faction === hel && c.originalCapital);
  noteWarEvents(s, rs, [{ type: 'cityCaptured', city: pyrrhus.id, faction: isa, from: hel }]);
  assert.equal(s.warSupport[1], t.start - t.battle - t.territory - t.capitalLost);
});

test('high support speeds industry; low support makes units dearer and growth slower; never past 0 or 100', () => {
  const s = game();
  const isa = fid(s, 'isa');
  s.warSupport[0] = 80;
  assert.deepEqual(warSupportEffects(s, rs, isa).map((e) => e.effect), ['yieldPercent']);
  s.warSupport[0] = 20;
  assert.deepEqual(warSupportEffects(s, rs, isa).map((e) => e.effect).sort(), ['costPercent', 'growthPercent']);
  s.warSupport[0] = 50;
  assert.deepEqual(warSupportEffects(s, rs, isa), []);
  s.warSupport[0] = 2;
  noteWarEvents(s, rs, [{ type: 'worldCaptured', world: 'vekta', side: 1, from: 0 }]);
  assert.equal(s.warSupport[0], 0);
});

test('propaganda becomes support (a few points a round per side); a blockaded home world drains it', () => {
  const s = game();
  const isa = s.factions.find((f) => f.civ === 'isa');
  // Enough for one point more than the cap, so the cap shows.
  const plenty = t.propagandaPer * (t.propagandaMax + 1);
  isa.stocks.faith = plenty;
  s.factions.find((f) => f.civ === 'home_guard').stocks.faith = 200;
  const events = [];
  sidesRound(s, rs, events);
  assert.equal(s.warSupport[0], t.start + t.propagandaMax, 'capped for the side');
  assert.equal(isa.stocks.faith, plenty - t.propagandaMax * t.propagandaPer);
  const b = game();
  const helFleet = Object.values(b.space.fleets).find((f) => f.at === 'helghan');
  delete b.space.fleets[Object.values(b.space.fleets).find((f) => f.at === 'vekta').id];
  helFleet.at = 'vekta';
  helFleet.blockade = true;
  sidesRound(b, rs, []);
  assert.equal(b.warSupport[0], t.start - t.blockade);
});

test('the war council: proposals, votes, a tie to whoever has least glory, and more glory on the objective', () => {
  const s = game();
  const fleet = fid(s, 'isa_fleet');
  const guard = fid(s, 'home_guard');
  s.glory[guard] = 10;
  const events = [];
  council(s, rs, events);
  assert.equal(s.council[0].world, 'ardent', 'the Fleet (least glory) wins the tie with Ardent');
  // A vote for Vekta from Strategic Command (which proposes nothing of its own) carries it.
  const v = game();
  v.seatIndex = v.seatOrder.indexOf(fid(v, 'isa'));
  const r = applyCommand(v, { type: 'councilVote', faction: fid(v, 'isa'), world: 'vekta' }, rs);
  assert.ok(r.ok);
  council(r.state, rs, []);
  assert.equal(r.state.council[0].world, 'vekta');
  // Deeds on the objective world earn the bonus.
  const bonus = cloneState(r.state);
  const before = bonus.glory[fleet];
  noteWarEvents(bonus, rs, [{ type: 'battle', winner: 'attacker', attackerFaction: fleet, defenderFaction: fid(bonus, 'helghast') }]);
  assert.ok(bonus.glory[fleet] - before >= t.gloryBattle);
});

test('arms deals: Stahl sells vehicles and arc weapons to its allies only, for credits, at rising prices', () => {
  const s = game();
  const stahl = fid(s, 'stahl');
  const army = fid(s, 'helghast');
  for (const f of s.factions) f.research.known.push('crawler_drives');
  s.factions.find((f) => f.id === army).stocks.gold = 1000;
  s.seatIndex = s.seatOrder.indexOf(army);
  const s2 = cloneState(s);
  // Helghan is the Army's world; switch the game to it for the order.
  const city = Object.values(worldData(s2, 'helghan').cities).find((c) => c.faction === army);
  const buy = (st, unit, faction = army) => applyCommand(st, { type: 'buyArms', faction, seller: stahl, unit, city: city.id, world: 'helghan' }, rs);
  assert.equal(buy(s2, 'assault_trooper').error.code, 'notForSale');
  const price = armsPrice(s2, rs, 'armoured_walker');
  const r = buy(s2, 'armoured_walker');
  assert.ok(r.ok, r.error?.message);
  assert.equal(r.state.factions.find((f) => f.id === army).stocks.gold, 1000 - price);
  assert.ok(armsPrice(r.state, rs, 'armoured_walker') > price, 'the price rises');
  assert.ok(Object.values(r.state.units).some((u) => u.type === 'armoured_walker' && u.faction === army));
  const isa = cloneState(s);
  isa.seatIndex = isa.seatOrder.indexOf(fid(isa, 'isa'));
  assert.equal(applyCommand(isa, { type: 'buyArms', faction: fid(isa, 'isa'), seller: stahl, unit: 'apc', city: Object.values(isa.cities)[0].id }, rs).error.code, 'notAlly');
});

test('side victories: break their will, take the capitals, hold the system, or outlast them; glory picks the winner', () => {
  const win = (s) => { const e = []; checkVictory(s, rs, e); return s.winner; };
  const a = game();
  a.warSupport[1] = 0;
  a.glory[fid(a, 'home_guard')] = 30;
  assert.deepEqual([win(a).faction, win(a).victory], [fid(a, 'home_guard'), 'war_support']);
  const b = game();
  for (const c of Object.values(allCities(b))) if (c.originalCapital && sideOf(b, rs, c.faction) === 1) c.faction = fid(b, 'isa');
  assert.equal(win(b).victory, 'war_capitals');
  assert.equal(sideOf(b, rs, b.winner.faction), 0);
  const c = game();
  c.holdStreak[1] = 10;
  assert.equal(win(c).victory, 'war_territory');
  assert.equal(sideOf(c, rs, c.winner.faction), 1);
  const d = game({ turnLimit: 50 });
  d.turn = 50;
  d.warSupport = { 0: 40, 1: 55 };
  assert.equal(win(d).victory, 'war_time');
  assert.equal(sideOf(d, rs, d.winner.faction), 1);
  assert.equal(win(game()), undefined, 'no one has won at the start');
});

test('scenarios: the invasion of Vekta and the road to Helghan start from other ground', () => {
  const inv = game({ scenario: 'invasion_of_vekta' });
  assert.equal(inv.holders.halcyon, 1);
  assert.ok(Object.values(worldData(inv, 'vekta').units).some((u) => sideOf(inv, rs, u.faction) === 1), 'Helghast troops are on Vekta');
  const road = game({ scenario: 'road_to_helghan' });
  assert.equal(road.holders.midway, 0);
  assert.equal(road.holders.morrow, 0);
  assert.equal(game().scenario, 'balanced_war');
});
