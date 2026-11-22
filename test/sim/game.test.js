import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyCommand, fingerprint, currentFactionId, SetupError } from '../../src/sim/index.js';
import { clone } from '../../src/core/clone.js';
import { fourPlayerSetup, playEndTurns, findNonFinite } from './helpers.js';

test('createGame then 50 endTurn commands gives the same fingerprint twice', () => {
  const a = playEndTurns(50);
  const b = playEndTurns(50);
  assert.equal(fingerprint(a.state), fingerprint(b.state));
  assert.deepEqual(a.state, b.state);
  assert.equal(a.state.commandCount, 50);
  // 4 seats: 50 turn-ends is 12 full rounds and two seats into round 13.
  assert.equal(a.state.turn, 13);
  assert.equal(a.state.seatIndex, 2);
});

test('replaying the command log rebuilds the identical game', () => {
  const { state, log } = playEndTurns(37);
  let replay = createGame({}, fourPlayerSetup());
  for (const cmd of log) replay = applyCommand(replay, cmd).state;
  assert.equal(fingerprint(replay), fingerprint(state));
});

test('different seeds give different games', () => {
  assert.notEqual(fingerprint(playEndTurns(10, 1).state), fingerprint(playEndTurns(10, 2).state));
});

test('seat order comes from the seed and includes every faction once', () => {
  const orders = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const s = createGame({}, fourPlayerSetup(seed));
    assert.deepEqual([...s.seatOrder].sort(), ['f0', 'f1', 'f2', 'f3']);
    assert.deepEqual(s.seatOrder, createGame({}, fourPlayerSetup(seed)).seatOrder);
    orders.add(s.seatOrder.join());
  }
  assert.ok(orders.size > 5, 'seat order varies between seeds');
});

test('an illegal command is refused without changing state', () => {
  const state = createGame({}, fourPlayerSetup());
  const before = clone(state);
  const print = fingerprint(state);
  const notYou = state.seatOrder.find((id) => id !== currentFactionId(state));
  const cases = [
    [{ type: 'endTurn', faction: notYou }, 'notYourTurn'],
    [{ type: 'endTurn', faction: 'f99' }, 'unknownFaction'],
    [{ type: 'launchRocket' }, 'unknownCommand'],
    [{ type: 'toString' }, 'unknownCommand'],
    [{ faction: 'f0' }, 'badCommand'],
    [null, 'badCommand'],
    [[], 'badCommand'],
  ];
  for (const [cmd, code] of cases) {
    const result = applyCommand(state, cmd);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code, JSON.stringify(cmd));
    assert.equal(typeof result.error.message, 'string');
  }
  assert.deepEqual(state, before);
  assert.equal(fingerprint(state), print);
});

test('a legal command never edits the state it was given', () => {
  const state = createGame({}, fourPlayerSetup());
  const before = clone(state);
  const result = applyCommand(state, { type: 'endTurn', faction: currentFactionId(state) });
  assert.equal(result.ok, true);
  assert.deepEqual(state, before);
  assert.notEqual(result.state, state);
  assert.deepEqual(result.events.map((e) => e.type), ['turnEnded', 'turnStarted']);
});

test('the last seat ending starts a new round', () => {
  let s = createGame({}, fourPlayerSetup());
  let events = [];
  for (let i = 0; i < 4; i += 1) {
    const r = applyCommand(s, { type: 'endTurn', faction: currentFactionId(s) });
    s = r.state;
    events = r.events;
  }
  assert.equal(s.turn, 2);
  assert.equal(s.seatIndex, 0);
  assert.deepEqual(events.map((e) => e.type), ['turnEnded', 'roundStarted', 'turnStarted']);
});

test('no NaN or Infinity anywhere in state after every turn', () => {
  let s = createGame({}, fourPlayerSetup());
  for (let i = 0; i < 100; i += 1) {
    s = applyCommand(s, { type: 'endTurn', faction: currentFactionId(s) }).state;
    assert.deepEqual(findNonFinite(s), []);
  }
});

test('setup is checked and frozen', () => {
  assert.throws(() => createGame({}, { players: [{ kind: 'human' }] }), SetupError);
  assert.throws(() => createGame({}, { seed: 1, players: [] }), SetupError);
  assert.throws(() => createGame({}, { seed: 1, players: [{ kind: 'alien' }] }), SetupError);
  const s = createGame({}, fourPlayerSetup());
  assert.ok(Object.isFrozen(s.setup));
});

test('the ruleset hash changes when the rules do', () => {
  const a = createGame({ units: { warrior: { strength: 20 } } }, fourPlayerSetup());
  const b = createGame({ units: { warrior: { strength: 21 } } }, fourPlayerSetup());
  assert.notEqual(a.rulesetHash, b.rulesetHash);
});
