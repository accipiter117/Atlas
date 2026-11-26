// Event planner (phase 16): when an event waits for an answer, score each
// choice by what its effects are worth to this AI and pick the best.
//   value = sum of (amount x turns x category weight) for yields,
//           percent effects scaled by the city's yield, citizens, units
// Numbers in ai/weights.json ("events").

import { weightsOf, categoryWeight } from '../evaluate.js';

function effectValue(ruleset, view, memory, e, w) {
  const turns = e.turns ?? ruleset.tuning?.events?.defaultTurns ?? 10;
  const odds = e.chance ?? 1;
  const cw = (c) => categoryWeight(ruleset, view, memory, c);
  let v = 0;
  if (e.effect === 'yieldBonus') v = e.amount * turns * cw(e.yield);
  else if (e.effect === 'cityYieldPercent') v = (e.amount / 100) * (w.percentBase ?? 8) * turns * cw(e.yield);
  else if (e.effect === 'amenityBonus') v = e.amount * turns * (w.amenity ?? 1.5);
  else if (e.effect === 'growthPercent') v = (e.amount / 100) * (w.growthBase ?? 3) * turns * cw('food');
  else if (e.effect === 'costPercent') v = -(e.amount / 100) * (w.costBase ?? 6) * turns * cw(e.target === 'wonders' ? 'wonder' : 'production');
  else if (e.effect === 'popChange') v = e.amount * (w.citizen ?? 25);
  else if (e.effect === 'freeUnit') v = (w.unit ?? 20) * cw('military');
  return v * odds;
}

/** The choice to make for a waiting event, or null. */
export function chooseEventChoice(view, ruleset, memory) {
  const p = view.pendingEvent;
  const ev = p && ruleset.events?.[p.event];
  if (!ev) return null;
  const w = weightsOf(ruleset, 'events');
  const ranked = ev.choices.map((c, i) => ({
    cmd: { type: 'chooseEvent', faction: view.me, event: p.id, choice: i },
    score: (c.effects ?? []).reduce((n, e) => n + effectValue(ruleset, view, memory, e, w), 0),
    reasonKey: 'ai.reason.event', params: { event: p.event },
  })).sort((a, b) => b.score - a.score || a.cmd.choice - b.cmd.choice);
  return ranked;
}
