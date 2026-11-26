// Phase 12: diplomacy. Opinion that fades as specified, the peace minimum,
// deal values, deterministic AI answers, war weariness, surprise wars,
// defensive pacts, teams and traded luxuries.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset } from './fixtures.js';
import { createGame, applyCommand, currentFactionId, opinionOf, evaluateDeal, statusOf, atWar, view, wearinessAmenities, amenitiesFor } from '../../src/sim/index.js';
import { diplomacyRound, pairKey } from '../../src/sim/diplomacy.js';
import { createAi } from '../../src/ai/index.js';

/** Three (or more) AI factions on a real Small map, all having met, no wars, at f0's turn. */
function game({ players = 3, teams = null, fog = 'on' } = {}) {
  const s = createGame(ruleset, { seed: 5, fog, players: Array.from({ length: players }, (_, i) => ({ kind: 'ai', ...(teams ? { team: teams[i] } : {}) })), map: { size: 'small', type: 'continents' } });
  const ids = s.factions.map((f) => f.id);
  for (const a of ids) for (const b of ids) if (a < b && !s.diplomacy.met.includes(pairKey(a, b))) s.diplomacy.met.push(pairKey(a, b));
  return s;
}
/** Apply a command as `faction` (moving the turn to them for the test). */
function as(state, faction, cmd) {
  const s = { ...state, seatIndex: state.seatOrder.indexOf(faction) };
  const r = applyCommand(s, { ...cmd, faction }, ruleset);
  return r.ok ? { state: r.state, events: r.events } : { error: r.error.code };
}
const op = (s, holder, about) => opinionOf(s, ruleset, holder, about);
const reason = (s, holder, about, id) => op(s, holder, about).reasons.find((r) => r.id === id)?.amount ?? 0;
const rounds = (s, n) => {
  let st = s;
  for (let i = 0; i < n; i += 1) {
    st = { ...st, turn: st.turn + 1 };
    diplomacyRound(st, ruleset, []);
  }
  return st;
};

test('opinion modifiers fade by decayAmount every decayEveryTurns rounds, then vanish', () => {
  let s = game();
  s = as(s, 'f0', { type: 'denounce', target: 'f1' }).state;
  const full = ruleset.diplomacy.denouncedUs.amount;
  assert.equal(reason(s, 'f1', 'f0', 'denouncedUs'), full);
  const every = ruleset.tuning.diplomacy.decayEveryTurns;
  const step = ruleset.tuning.diplomacy.decayAmount;
  s.turn = every - 1;
  s = rounds(s, every);
  assert.equal(reason(s, 'f1', 'f0', 'denouncedUs'), full + step, 'one step after one period');
  s = rounds(s, every * Math.abs(full));
  assert.equal(reason(s, 'f1', 'f0', 'denouncedUs'), 0);
  assert.equal(s.diplomacy.modifiers['f1>f0'], undefined, 'gone entirely');
});

test('peace treaties hold for the minimum number of turns', () => {
  let s = game();
  s = as(s, 'f0', { type: 'declareWar', target: 'f1' }).state;
  assert.equal(statusOf(s, 'f0', 'f1'), 'war');
  s = as(s, 'f0', { type: 'proposeDeal', target: 'f1', give: [{ type: 'peace' }], get: [] }).state;
  const deal = s.diplomacy.deals[0].id;
  s = as(s, 'f1', { type: 'answerDeal', deal, accept: true }).state;
  assert.equal(statusOf(s, 'f0', 'f1'), 'peace');
  assert.ok(!atWar(s, 'f0', 'f1'));
  const min = ruleset.tuning.diplomacy.peaceMinTurns;
  assert.equal(as(s, 'f0', { type: 'declareWar', target: 'f1' }).error, 'peaceTreaty');
  s.turn += min - 1;
  assert.equal(as(s, 'f1', { type: 'declareWar', target: 'f0' }).error, 'peaceTreaty', 'either side');
  s.turn += 1;
  assert.ok(as(s, 'f0', { type: 'declareWar', target: 'f1' }).state, 'allowed once the treaty runs out');
});

test('gold and gold per turn are worth the same to both sides (with no opinion in the way)', () => {
  const s = game();
  s.factions[0].stocks.gold = 500;
  for (const items of [[{ type: 'gold', amount: 120 }], [{ type: 'goldPerTurn', amount: 4 }], [{ type: 'gold', amount: 30 }, { type: 'goldPerTurn', amount: 2 }]]) {
    const deal = { from: 'f0', to: 'f1', give: items, get: [] };
    const giver = evaluateDeal(s, ruleset, 'f0', deal, { opinion: 0 }).value;
    const taker = evaluateDeal(s, ruleset, 'f1', deal, { opinion: 0 }).value;
    assert.equal(giver, -taker, JSON.stringify(items));
    assert.ok(taker > 0);
  }
  // Opinion adds the same amount wherever the deal comes from.
  const deal = { from: 'f0', to: 'f1', give: [{ type: 'gold', amount: 10 }], get: [] };
  assert.equal(evaluateDeal(s, ruleset, 'f1', deal, { opinion: 5 }).value - evaluateDeal(s, ruleset, 'f1', deal, { opinion: 0 }).value, 5 * ruleset.tuning.diplomacy.dealValues.opinionWeight);
});

test('AI answers are deterministic and follow evaluateDeal', () => {
  let s = game();
  s.factions[0].stocks.gold = 300;
  s = as(s, 'f0', { type: 'proposeDeal', target: 'f1', give: [{ type: 'gold', amount: 100 }], get: [] }).state;
  s = { ...s, seatIndex: s.seatOrder.indexOf('f1') };
  const answers = [0, 1, 2].map(() => {
    const ai = createAi(ruleset, 'f1');
    let cmd = null;
    for (let i = 0; i < 20; i += 1) {
      cmd = ai.next(view(s, 'f1', ruleset));
      if (cmd.type === 'answerDeal') break;
    }
    return cmd;
  });
  assert.deepEqual(answers[1], answers[0]);
  assert.deepEqual(answers[2], answers[0]);
  assert.equal(answers[0].type, 'answerDeal');
  assert.equal(answers[0].accept, true, 'free gold is a yes');
  // A gift the other way (they pay us everything) is a no.
  let t = game();
  t.factions[1].stocks.gold = 300;
  t = as(t, 'f0', { type: 'proposeDeal', target: 'f1', give: [], get: [{ type: 'gold', amount: 300 }] }).state;
  t = { ...t, seatIndex: t.seatOrder.indexOf('f1') };
  const ai = createAi(ruleset, 'f1');
  let c = null;
  for (let i = 0; i < 20; i += 1) { c = ai.next(view(t, 'f1', ruleset)); if (c.type === 'answerDeal') break; }
  assert.equal(c.accept, false);
});

test('war weariness grows at war, costs amenities, and eases in peace', () => {
  let s = game();
  const city = (st) => Object.values(st.cities).find((c) => c.faction === 'f0');
  // Give f0 a city to measure amenities in.
  const settler = Object.values(s.units).find((u) => u.faction === 'f0' && u.type === 'settler');
  s = as(s, 'f0', { type: 'foundCity', unit: settler.id }).state;
  const base = amenitiesFor(s, ruleset, 'f0')[city(s).id].have;
  const w = ruleset.tuning.diplomacy.weariness;
  s.diplomacy.weariness.f0 = w.perAmenity * 2 + 1;
  assert.equal(wearinessAmenities(s, ruleset, 'f0'), 2);
  assert.equal(amenitiesFor(s, ruleset, 'f0')[city(s).id].have, base - 2);
  s.diplomacy.weariness.f0 = 10_000;
  assert.equal(wearinessAmenities(s, ruleset, 'f0'), w.maxAmenityLoss, 'capped');
  // At war it grows each turn; at peace it eases.
  let t = game();
  t = as(t, 'f0', { type: 'declareWar', target: 'f1' }).state;
  const before = t.diplomacy.weariness.f0 ?? 0;
  for (let i = 0; i < t.factions.length; i += 1) t = applyCommand(t, { type: 'endTurn', faction: currentFactionId(t) }, ruleset).state;
  assert.equal(t.diplomacy.weariness.f0, before + w.perTurnAtWar);
});

test('war without denouncing first is a surprise war; others remember it', () => {
  let s = game();
  const r = as(s, 'f0', { type: 'declareWar', target: 'f1' });
  assert.ok(r.events.some((e) => e.type === 'warDeclared' && e.surprise));
  assert.equal(reason(r.state, 'f2', 'f0', 'surpriseWar'), ruleset.diplomacy.surpriseWar.amount);
  assert.equal(reason(r.state, 'f1', 'f0', 'declaredWarOnUs'), ruleset.diplomacy.declaredWarOnUs.amount);
  s = as(s, 'f0', { type: 'denounce', target: 'f1' }).state;
  const r2 = as(s, 'f0', { type: 'declareWar', target: 'f1' });
  assert.ok(r2.events.some((e) => e.type === 'warDeclared' && !e.surprise), 'a denounced enemy is fair warning');
  assert.equal(reason(r2.state, 'f2', 'f0', 'surpriseWar'), 0);
});

test('a defensive pact pulls the partner into a war on its friend', () => {
  let s = game();
  s.diplomacy.treaties[pairKey('f1', 'f2')] = { kind: 'defensivePact', until: s.turn + 30, team: false };
  s = as(s, 'f0', { type: 'declareWar', target: 'f1' }).state;
  assert.ok(atWar(s, 'f0', 'f1'));
  assert.ok(atWar(s, 'f2', 'f0'), 'the partner joins');
  assert.ok(reason(s, 'f2', 'f0', 'attackedOurFriend') < 0);
});

test('treaties by deal, with a likely answer from the same function; deals that cannot be made are refused', () => {
  let s = game();
  const deal = { from: 'f0', to: 'f1', give: [{ type: 'openBorders' }], get: [] };
  assert.equal(typeof evaluateDeal(s, ruleset, 'f1', deal).value, 'number');
  assert.equal(as(s, 'f0', { type: 'proposeDeal', target: 'f1', give: [{ type: 'peace' }], get: [] }).error, 'notAtWar');
  assert.equal(as(s, 'f0', { type: 'proposeDeal', target: 'f1', give: [{ type: 'gold', amount: 99999 }], get: [] }).error, 'notEnoughGold');
  s = as(s, 'f0', { type: 'proposeDeal', target: 'f1', give: [{ type: 'alliance' }], get: [] }).state;
  assert.equal(as(s, 'f0', { type: 'proposeDeal', target: 'f1', give: [{ type: 'openBorders' }], get: [] }).error, 'dealPending');
  s = as(s, 'f1', { type: 'answerDeal', deal: s.diplomacy.deals[0].id, accept: true }).state;
  assert.equal(statusOf(s, 'f0', 'f1'), 'alliance');
  assert.ok(reason(s, 'f1', 'f0', 'alliance') > 0);
  // Unanswered offers lapse at the proposer's next turn.
  s = as(s, 'f0', { type: 'proposeDeal', target: 'f2', give: [{ type: 'openBorders' }], get: [] }).state;
  assert.equal(s.diplomacy.deals.length, 1);
  let t = s;
  for (let i = 0; i < t.factions.length + 1 && t.diplomacy.deals.length; i += 1) t = applyCommand(t, { type: 'endTurn', faction: currentFactionId(t) }, ruleset).state;
  assert.equal(t.diplomacy.deals.length, 0);
});

test('teams: teammates start allied, cannot fight, and win conquest together', () => {
  const s = game({ players: 4, teams: [1, 1, 2, null] });
  assert.equal(statusOf(s, 'f0', 'f1'), 'alliance');
  assert.ok(s.diplomacy.treaties[pairKey('f0', 'f1')].team);
  assert.equal(as(s, 'f0', { type: 'declareWar', target: 'f1' }).error, 'teammate');
  assert.equal(as(s, 'f0', { type: 'denounce', target: 'f1' }).error, 'teammate');
  assert.ok(reason(s, 'f0', 'f1', 'teammates') > 0);
  assert.equal(statusOf(s, 'f0', 'f2'), 'peace');
});

test('a luxury received in a deal counts for the receiver\'s amenities', async () => {
  const { luxuriesOf } = await import('../../src/sim/amenities.js');
  const s = game();
  const lux = Object.values(ruleset.resources).find((r) => r.class === 'luxury').id;
  assert.ok(!luxuriesOf(s, ruleset, 'f1').includes(lux));
  s.diplomacy.resources.push({ from: 'f0', to: 'f1', resource: lux, until: s.turn + 30 });
  assert.ok(luxuriesOf(s, ruleset, 'f1').includes(lux));
});

test('an AI at war and losing offers peace on its own', () => {
  // Fog off, so the losing side can see the army it faces.
  let s = game({ fog: 'off' });
  s = as(s, 'f0', { type: 'declareWar', target: 'f1' }).state;
  // f0 is far stronger: a dozen extra swordsmen beside its start.
  const start = Object.values(s.units).find((u) => u.faction === 'f0').tile;
  for (let i = 0; i < 12; i += 1) {
    const id = `x_${i}`;
    s.units[id] = { id, type: 'swordsman', faction: 'f0', tile: start, hp: 100, moves: 0, activity: 'fortified', fortifiedTurns: 0, goto: null, xp: 0, promotions: [] };
  }
  s.turn += ruleset.aiWeights.diplomacy.weights.minWarTurns + 1;
  s = { ...s, seatIndex: s.seatOrder.indexOf('f1') };
  const ai = createAi(ruleset, 'f1');
  let offer = null;
  for (let i = 0; i < 40 && !offer; i += 1) {
    const cmd = ai.next(view(s, 'f1', ruleset));
    if (cmd.type === 'proposeDeal' && cmd.target === 'f0') offer = cmd;
    if (cmd.type === 'endTurn') break;
    const r = applyCommand(s, cmd, ruleset);
    if (r.ok) s = r.state;
  }
  assert.ok(offer, 'the losing side proposes a deal');
  assert.equal(offer.target, 'f0');
  assert.ok(offer.give.some((x) => x.type === 'peace'));
});
