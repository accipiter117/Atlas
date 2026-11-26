// Diplomacy planner (phase 12, section 3.11). One command at a time:
//   1. answer offers made to us, with the same evaluateDeal the screen uses;
//   2. at war and losing, after the war has run a while: offer peace, adding
//      gold if they would otherwise say no;
//   3. befriend those we like (open borders, defensive pact, alliance);
//   4. denounce those we dislike most, which also turns a planned war into a
//      formal one rather than a surprise attack.
// Every threshold and pause lives in ai/weights.json ("diplomacy").

import { evaluateDeal, dealProblem, atWar, statusOf, pairKey, COMMANDS } from '../../sim/index.js';
import { weightsOf } from '../evaluate.js';

const ok = (world, ruleset, cmd) => COMMANDS[cmd.type].validate(world, cmd, ruleset) === null;

export function nextDiplomacy(world, view, ruleset, memory) {
  if (!ruleset.diplomacy || !view.diplomacy) return null;
  const w = weightsOf(ruleset, 'diplomacy');
  const me = view.me;
  const ops = view.opinions ?? {};
  memory.dip ??= {};
  const recently = (key, gap) => view.turn - (memory.dip[key] ?? -999) < gap;

  // 1. Offers to us.
  for (const deal of view.diplomacy.deals.filter((x) => x.to === me)) {
    const { value } = evaluateDeal(world, ruleset, me, deal, { opinion: ops[deal.from]?.mine?.total ?? 0 });
    const cmd = { type: 'answerDeal', faction: me, deal: deal.id, accept: value > 0 };
    if (ok(world, ruleset, cmd)) return { cmd, score: value, reasonKey: value > 0 ? 'ai.reason.acceptDeal' : 'ai.reason.refuseDeal', params: { target: deal.from } };
  }

  const others = view.factions.filter((f) => f.id !== me && f.alive && ops[f.id]);
  const pending = (to) => view.diplomacy.deals.some((x) => x.from === me && x.to === to);

  // 2. Peace when losing.
  for (const f of others) {
    if (!atWar(world, me, f.id) || pending(f.id) || recently(`peace:${f.id}`, w.peaceEvery ?? 5)) continue;
    const since = view.diplomacy.warSince?.[pairKey(me, f.id)] ?? 0;
    if (view.turn - since < (w.minWarTurns ?? 10)) continue;
    const offer = { from: me, to: f.id, give: [{ type: 'peace' }], get: [] };
    const mine = evaluateDeal(world, ruleset, me, offer, { opinion: ops[f.id].mine.total }).value;
    if (mine <= (w.peaceWantAbove ?? 0)) continue;
    const theirs = evaluateDeal(world, ruleset, f.id, offer, { opinion: ops[f.id].theirs.total }).value;
    if (theirs <= 0) {
      const gold = Math.min(Math.floor((view.stocks?.gold ?? 0) * (w.peaceGoldShare ?? 0.5)), Math.ceil(-theirs) + 5);
      if (gold > 0 && gold >= -theirs) offer.give.push({ type: 'gold', amount: gold });
    }
    if (dealProblem(world, ruleset, offer)) continue;
    memory.dip[`peace:${f.id}`] = view.turn;
    const cmd = { type: 'proposeDeal', faction: me, target: f.id, give: offer.give, get: [] };
    if (ok(world, ruleset, cmd)) return { cmd, score: mine, reasonKey: 'ai.reason.offerPeace', params: { target: f.id } };
  }

  // 3. Friendship: the best treaty both sides should want.
  for (const f of others.slice().sort((a, b) => ops[b.id].mine.total - ops[a.id].mine.total || (a.id < b.id ? -1 : 1))) {
    if (atWar(world, me, f.id) || pending(f.id) || recently(`friend:${f.id}`, w.friendEvery ?? 10)) continue;
    const status = statusOf(world, me, f.id);
    for (const kind of ['alliance', 'defensivePact', 'openBorders']) {
      if (status === kind || (status === 'alliance') || (status === 'defensivePact' && kind === 'openBorders')) break;
      const offer = { from: me, to: f.id, give: [{ type: kind }], get: [] };
      if (dealProblem(world, ruleset, offer)) continue;
      const mine = evaluateDeal(world, ruleset, me, offer, { opinion: ops[f.id].mine.total }).value;
      const theirs = evaluateDeal(world, ruleset, f.id, offer, { opinion: ops[f.id].theirs.total }).value;
      if (mine > (w.friendWantAbove ?? 10) && theirs > 0) {
        memory.dip[`friend:${f.id}`] = view.turn;
        const cmd = { type: 'proposeDeal', faction: me, target: f.id, give: offer.give, get: [] };
        if (ok(world, ruleset, cmd)) return { cmd, score: mine, reasonKey: 'ai.reason.offerTreaty', params: { target: f.id, treaty: kind } };
      }
    }
  }

  // 4. Denounce the one we dislike most, or the one we mean to fight.
  const target = memory.warPlan && !atWar(world, me, memory.warPlan) ? memory.warPlan : null;
  const worst = others.filter((f) => !atWar(world, me, f.id)).sort((a, b) => ops[a.id].mine.total - ops[b.id].mine.total)[0];
  for (const f of [target && others.find((x) => x.id === target), worst].filter(Boolean)) {
    if (f.id !== target && ops[f.id].mine.total > (w.denounceBelow ?? -15)) continue;
    if (recently(`denounce:${f.id}`, 20)) continue;
    memory.dip[`denounce:${f.id}`] = view.turn;
    const cmd = { type: 'denounce', faction: me, target: f.id };
    if (ok(world, ruleset, cmd)) return { cmd, score: -ops[f.id].mine.total, reasonKey: 'ai.reason.denounce', params: { target: f.id } };
  }
  return null;
}
