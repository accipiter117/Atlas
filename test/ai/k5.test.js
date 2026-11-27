// Killzone Extrasolar War K5: the star map AI, the theatre AI and theatre delegation
// (docs/KILLZONE.md section 7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from '../data/helpers.js';
import { createGame, applyCommand, view, currentFactionId, fingerprint } from '../../src/sim/index.js';
import { createSeatRunner } from '../../src/ai/index.js';
import { theatreReport } from '../../src/ai/seats.js';
import { createAi } from '../../src/ai/controller.js';
import { worldData } from '../../src/sim/worlds.js';

const rs = (await loadReal(['base-ancient', 'killzone', 'killzone-war'])).ruleset;
const CIVS = ['isa', 'home_guard', 'isa_fleet', 'helghast', 'stahl', 'helghast_navy'];
const setup = (human = null, extra = {}) => ({ seed: 7, players: CIVS.map((c) => ({ kind: c === human ? 'human' : 'ai', faction: c })), map: { preset: 'kw_vekta' }, ...extra });
const fid = (s, civ) => s.factions.find((f) => f.civ === civ).id;

// One computer-only game of 40 rounds, shared by the tests that read it.
const played = (() => {
  let s = createGame(rs, setup());
  const runner = createSeatRunner(rs, s.factions.map((f) => f.id));
  const commands = [];
  const events = [];
  let refusals = 0;
  while (s.turn < 40 && !s.winner) {
    const r = runner.play(s, { maxSeats: 6 });
    s = r.state;
    commands.push(...r.commands);
    events.push(...r.events);
    refusals += r.refusals.length;
  }
  return { state: s, commands, events, refusals };
})();

test('six computer factions play 40 rounds with no refused orders and no broken numbers', () => {
  assert.equal(played.refusals, 0);
  for (const f of played.state.factions) for (const [k, v] of Object.entries(f.stocks)) assert.ok(Number.isFinite(v), `${f.civ} ${k}`);
  for (const side of [0, 1]) assert.ok(played.state.warSupport[side] >= 0 && played.state.warSupport[side] <= 100);
  assert.ok(Object.values(played.state.glory).every((g) => Number.isFinite(g) && g >= 0));
});

test('the star map AI embarks troops, sails, lands them and blockades', () => {
  const types = new Set(played.commands.map((c) => c.type));
  for (const t of ['loadArmy', 'moveFleet', 'landArmy', 'setBlockade']) assert.ok(types.has(t), `no ${t} in 40 rounds`);
});

test('the theatre AI fortifies the front with engineers', () => {
  const works = new Set(Object.keys(rs.improvements).filter((k) => rs.improvements[k].war));
  assert.ok(works.size > 0);
  assert.ok(played.events.some((e) => e.type === 'improvementBuilt' && works.has(e.improvement)), 'no trench, wire or nest dug in 40 rounds');
});

test('a game replays exactly from its seed and the AI\'s commands', () => {
  let s = createGame(rs, setup());
  for (const cmd of played.commands) {
    const r = applyCommand(s, cmd, rs);
    assert.ok(r.ok, `${cmd.type}: ${r.error?.message}`);
    s = r.state;
  }
  assert.equal(fingerprint(s), fingerprint(played.state));
});

/** A game where you are Strategic Command, at your first turn. */
function myGame(extra = {}) {
  let s = createGame(rs, setup('isa', extra));
  const me = fid(s, 'isa');
  const runner = createSeatRunner(rs, s.factions.filter((f) => f.id !== me).map((f) => f.id));
  s = runner.play(s, { stopAt: me }).state;
  assert.equal(currentFactionId(s), me);
  return { s, me, runner };
}

test('setDelegation hands a theatre to your generals in a stance, and takes it back', () => {
  const { s, me } = myGame();
  const set = (st, stance, theatre = 'vekta') => applyCommand(st, { type: 'setDelegation', faction: me, theatre, stance }, rs);
  const a = set(s, 'hold');
  assert.ok(a.ok);
  assert.deepEqual(view(a.state, me, rs).war.delegation, { vekta: 'hold' });
  const b = set(a.state, 'allout', 'halcyon');
  assert.deepEqual(b.state.delegation[me], { vekta: 'hold', halcyon: 'allout' });
  const c = set(b.state, null);
  assert.deepEqual(c.state.delegation[me], { halcyon: 'allout' });
  assert.equal(set(s, 'charge').error.code, 'unknownStance');
  assert.equal(set(s, 'hold', 'pluto').error.code, 'unknownWorld');
  assert.equal(applyCommand(s, { type: 'setDelegation', faction: fid(s, 'helghast'), theatre: 'vekta', stance: 'hold' }, rs).error.code, 'notYourTurn');
  // A rival cannot see your delegation.
  assert.deepEqual(view(b.state, fid(s, 'home_guard'), rs).war.delegation, {});
});

test('a delegated theatre is played as your faction, on that world only, with a report', () => {
  const { s, me, runner } = myGame({ scenario: 'invasion_of_vekta' });
  const st = applyCommand(s, { type: 'setDelegation', faction: me, theatre: 'vekta', stance: 'advance' }, rs).state;
  const d = runner.delegate(st, me);
  assert.ok(d.commands.length > 0, 'the generals gave orders');
  assert.ok(d.commands.every((c) => c.world === 'vekta' && c.faction === me && c.type !== 'endTurn'));
  assert.ok(d.commands.every((c) => !['setResearch', 'setProduction', 'moveFleet', 'loadArmy'].includes(c.type)), 'theatre commanders only move and fight');
  assert.equal(d.refusals.length, 0);
  assert.equal(d.report.length, 1);
  assert.equal(d.report[0].world, 'vekta');
  assert.equal(d.report[0].orders, d.commands.filter((c) => c.type !== 'autoResolveBattle').length);
  assert.ok(d.report[0].why?.reasonKey?.startsWith('ai.reason.'));
  assert.equal(currentFactionId(d.state), me, 'it is still your turn: you end it yourself');
  // Nothing delegated: nothing happens.
  assert.equal(runner.delegate(s, me).commands.length, 0);
});

test('Hold the line digs in; All-out assault attacks on odds Hold would refuse', () => {
  const { s, me } = myGame({ scenario: 'invasion_of_vekta' });
  const v = view(s, me, rs, { world: 'vekta' });
  const hold = createAi(rs, me, { theatreOnly: true, stance: 'hold' });
  const cmds = [];
  let st = s;
  for (let n = 0; n < 30; n += 1) {
    const cmd = hold.next(view(st, me, rs, { world: 'vekta' }));
    if (cmd.type === 'endTurn') break;
    cmds.push(cmd);
    const r = applyCommand(st, { ...cmd, world: 'vekta' }, rs);
    if (r.ok) st = r.state; else hold.refused(cmd, r.error);
  }
  assert.ok(v.units.some((u) => u.faction === me));
  assert.ok(cmds.some((c) => c.type === 'fortify'), 'something fortified');
  // What each stance means is data: All-out takes worse odds than Hold.
  const stances = rs.aiWeights.theatre.weights.stances;
  assert.ok(stances.allout.attackMinWinChance < stances.hold.attackMinWinChance);
});

test('the theatre report counts battles, losses and works from the events', () => {
  const r = theatreReport([
    { type: 'battle', winner: 'attacker', attackerFaction: 'f0', defenderFaction: 'f3' },
    { type: 'battle', winner: 'attacker', attackerFaction: 'f3', defenderFaction: 'f0' },
    { type: 'unitKilled', faction: 'f3' }, { type: 'unitKilled', faction: 'f0' }, { type: 'unitKilled', faction: 'f3' },
    { type: 'improvementBuilt', faction: 'f0' }, { type: 'cityCaptured', faction: 'f0' },
  ], 'vekta', 'allout', 'f0');
  assert.deepEqual(r, { world: 'vekta', stance: 'allout', won: 1, lost: 1, killed: 2, fallen: 1, works: 1, captured: 1 });
});

test('the AI\'s view of a world keeps the world and the space flag, so it can build ships', () => {
  const { s, me } = myGame();
  const v = view(s, me, rs, { world: 'vekta' });
  assert.equal(v.world, 'vekta');
  assert.ok(v.space);
  assert.ok(Array.isArray(v.supply) && v.supply.length > 0, 'supplied tiles for the theatre AI');
  assert.ok(Object.values(worldData(s, 'vekta').cities).length > 0);
});

test('a supply drop lasts the round: another faction\'s later drop does not clear it', async () => {
  const { supplyDrop } = await import('../../src/sim/space.js');
  const s = createGame(rs, setup());
  const fleet = Object.values(s.space.fleets).find((f) => f.ships.some((x) => rs.units[x.type]?.space?.bombard));
  s.space.drops = [{ world: 'midway', tile: 15, faction: 'f_other', turn: s.turn - 1 }];
  supplyDrop.apply(s, { type: 'supplyDrop', faction: fleet.faction, fleet: fleet.id, tile: 0 }, [], rs);
  assert.ok(s.space.drops.some((d) => d.faction === 'f_other'), 'last round\'s drop still counts until its faction\'s next turn');
  s.space.drops.push({ world: 'midway', tile: 15, faction: 'f_old', turn: s.turn - 2 });
  fleet.struck = []; // a new turn for the cruiser
  supplyDrop.apply(s, { type: 'supplyDrop', faction: fleet.faction, fleet: fleet.id, tile: 0 }, [], rs);
  assert.ok(!s.space.drops.some((d) => d.faction === 'f_old'), 'older drops are tidied away');
});

test('a dead heat at the turn limit goes to the first seat\'s side, not to whoever farmed glory', async () => {
  const { checkVictory } = await import('../../src/sim/victories/index.js');
  const { sideOf } = await import('../../src/sim/index.js');
  const s = createGame(rs, setup(null, { turnLimit: 50 }));
  s.turn = 50;
  s.warSupport = { 0: 70, 1: 70 };
  for (const f of s.factions) s.glory[f.id] = sideOf(s, rs, f.id) === sideOf(s, rs, s.seatOrder[0]) ? 0 : 500;
  checkVictory(s, rs, []);
  assert.equal(s.winner.victory, 'war_time');
  assert.equal(sideOf(s, rs, s.winner.faction), sideOf(s, rs, s.seatOrder[0]));
});
