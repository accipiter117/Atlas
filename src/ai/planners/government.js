// Civics, government and policy planner (phase 11, section 9.3).
//
// Civics are ranked like techs: what they unlock (governments by the slots
// they bring, policy cards by their estimated value), weighted by path and
// personality, divided by the square root of the cost left.
//
// Policy cards are valued from their effects with the same formula
// everywhere: what the effect adds to this empire as it is now (its cities,
// yields, units and upkeep), times the category weight. Every scale lives in
// ai/weights.json ("policy"). The government is the one whose slots, filled
// with the best cards on offer, plus its own effects, are worth the most; the
// AI switches only when the gain beats a margin and not too often.

import {
  available, costOf, cityYields, upkeepOf, slotsOf, governmentAvailable, policyAvailable, SLOT_KINDS, workingGovernment,
} from '../../sim/index.js';
import { categoryWeight, weightsOf } from '../evaluate.js';

const YIELD = ['food', 'production', 'gold', 'science', 'culture', 'faith'];

/** The empire as it stands, for valuing effects. */
export function empireFacts(world, view, ruleset) {
  const cities = view.cities.filter((c) => c.faction === view.me);
  const totals = Object.fromEntries(YIELD.map((y) => [y, 0]));
  for (const c of cities) {
    const t = cityYields(world, ruleset, c).total;
    for (const y of YIELD) totals[y] += t[y] ?? 0;
  }
  const units = view.units.filter((u) => u.faction === view.me);
  const byClass = {};
  for (const u of units) { const k = ruleset.units[u.type]?.class; byClass[k] = (byClass[k] ?? 0) + 1; }
  let upkeep = 0;
  try { upkeep = upkeepOf(world, ruleset, view.me).units ?? upkeepOf(world, ruleset, view.me).total ?? 0; } catch { upkeep = 0; }
  const atWar = (view.wars ?? []).length > 0;
  return { cities: cities.length, totals, units: units.length, byClass, upkeep, atWar };
}

function costCategory(ruleset, target) {
  if (target === 'settler') return ['settle', 'settlerCost'];
  if (target === 'builder') return ['builder', 'builderCost'];
  if (target === 'wonders') return ['wonder', 'wonderCost'];
  if (target === 'buildings' || ruleset.buildings?.[target]) return ['production', 'buildingCost'];
  return ['military', 'unitCost'];
}

/** What one effect is worth to this empire now. */
export function effectValue(e, facts, ruleset, view, memory) {
  const p = weightsOf(ruleset, 'policy');
  const cw = (c) => categoryWeight(ruleset, view, memory, c);
  const reach = e.scope === 'capital' ? Math.min(1, facts.cities) : facts.cities;
  switch (e.effect) {
    case 'yieldBonus': return e.amount * reach * cw(e.yield) * (p.flatYield ?? 1);
    case 'yieldPercent':
    case 'cityYieldPercent': return (e.amount / 100) * (facts.totals[e.yield] ?? 0) * cw(e.yield) * (p.percentYield ?? 1);
    case 'costPercent': {
      const [cat, scale] = costCategory(ruleset, e.target);
      const wantMore = cat !== 'settle' || facts.cities < (weightsOf(ruleset, 'expansion').targetCities ?? 8);
      return wantMore ? (-e.amount / 100) * (p[scale] ?? 4) * cw(cat) : 0;
    }
    case 'upkeepPercent': return (-e.amount / 100) * facts.upkeep * cw('gold') * (p.upkeep ?? 1);
    case 'growthPercent': return (e.amount / 100) * facts.cities * (p.growth ?? 3) * cw('food');
    case 'amenityBonus': return e.amount * reach * (p.amenity ?? 1.5);
    case 'healBonus': return (e.amount / 10) * (p.heal ?? 1) * cw('military') * (facts.atWar ? 2 : 0.5);
    case 'moveBonus':
    case 'sightBonus': {
      const n = e.class ? (facts.byClass[e.class] ?? 0) : facts.units;
      return e.amount * Math.min(n, 6) * (p.movement ?? 0.4) * cw('military');
    }
    case 'borderGrowthPercent': return (e.amount / 100) * facts.cities * (p.borders ?? 1) * cw('culture');
    case 'freePolicySlot': return p.slot ?? 3;
    default: return 0;
  }
}

export function policyValue(id, facts, ruleset, view, memory) {
  return (ruleset.policies[id]?.effects ?? []).reduce((n, e) => n + effectValue(e, facts, ruleset, view, memory), 0);
}

/** The best cards for a government's slots: { layout, value }. Wildcards take the best cards left over. */
export function bestLayout(world, view, ruleset, memory, govId, facts = empireFacts(world, view, ruleset)) {
  const slots = slotsOf(world, ruleset, view.me, govId);
  const cards = Object.keys(ruleset.policies ?? {}).filter((id) => policyAvailable(world, ruleset, view.me, id))
    .map((id) => ({ id, slot: ruleset.policies[id].slot, value: policyValue(id, facts, ruleset, view, memory) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
  const used = new Set();
  const layout = Object.fromEntries(SLOT_KINDS.map((k) => [k, []]));
  let value = 0;
  for (const kind of ['military', 'economic', 'diplomatic', 'wildcard']) {
    for (let i = 0; i < (slots[kind] ?? 0); i += 1) {
      const c = cards.find((x) => !used.has(x.id) && (kind === 'wildcard' || x.slot === kind));
      if (!c) break;
      used.add(c.id);
      layout[kind].push(c.id);
      value += c.value;
    }
  }
  const gov = ruleset.governments?.[govId];
  for (const e of gov?.effects ?? []) value += effectValue({ ...e, scope: e.scope ?? 'everyCity' }, facts, ruleset, view, memory);
  return { layout, value };
}

/** The civics worth researching, best first (like rankTechs). */
export function rankCivics(world, view, ruleset, memory) {
  const p = weightsOf(ruleset, 'policy');
  const facts = empireFacts(world, view, ruleset);
  const out = [];
  for (const id of available(world, ruleset, view.me, 'civics')) {
    const civic = ruleset.civics[id];
    let value = 1;
    for (const g of civic.unlocks?.governments ?? []) {
      const slots = Object.values(ruleset.governments[g]?.slots ?? {}).reduce((a, b) => a + b, 0);
      value += slots * (p.civicPerSlot ?? 2);
    }
    for (const pol of civic.unlocks?.policies ?? []) value += policyValue(pol, facts, ruleset, view, memory) * (p.civicPerCard ?? 0.6);
    const paid = view.civicResearch?.progress?.[id] ?? 0;
    const score = (value * categoryWeight(ruleset, view, memory, 'culture') * 10) / Math.sqrt(Math.max(1, costOf(world, ruleset, id, 'civics') - paid));
    out.push({ cmd: { type: 'setResearch', faction: view.me, item: id, tree: 'civics' }, score, reasonKey: 'ai.reason.civic', params: { civic: id } });
  }
  return out.sort((a, b) => b.score - a.score || a.cmd.item.localeCompare(b.cmd.item));
}

/** Adopt a better government? One command or null. */
export function considerGovernment(world, view, ruleset, memory) {
  const p = weightsOf(ruleset, 'policy');
  const work = workingGovernment(world, view.me);
  const facts = empireFacts(world, view, ruleset);
  const options = Object.keys(ruleset.governments ?? {}).filter((g) => governmentAvailable(world, ruleset, view.me, g))
    .map((g) => ({ g, ...bestLayout(world, view, ruleset, memory, g, facts) }))
    .sort((a, b) => b.value - a.value || (a.g < b.g ? -1 : 1));
  if (!options.length) return null;
  const best = options[0];
  if (work.id === best.g) return null;
  if (work.id) {
    const current = options.find((o) => o.g === work.id)?.value ?? 0;
    if (best.value < current * (1 + (p.switchMargin ?? 0.25)) + (p.switchMinGain ?? 2)) return null;
    if (view.turn - (memory.govTurn ?? -999) < (p.minTurnsBetweenChanges ?? 25)) return null;
  }
  memory.govTurn = view.turn;
  return { cmd: { type: 'setGovernment', faction: view.me, government: best.g }, score: best.value, reasonKey: 'ai.reason.government', params: { government: best.g },
    alternatives: options.slice(1, 3).map((o) => ({ reasonKey: 'ai.reason.government', params: { government: o.g }, score: o.value })) };
}

/** The next card change that brings the working layout closer to the best one, or null. */
export function nextPolicy(world, view, ruleset, memory) {
  const work = workingGovernment(world, view.me);
  if (!work.id) return null;
  const { layout } = bestLayout(world, view, ruleset, memory, work.id);
  const slots = slotsOf(world, ruleset, view.me, work.id);
  // Empty slots the best layout no longer fills first (so a card can move), then fill.
  for (const kind of SLOT_KINDS) {
    for (let i = 0; i < (slots[kind] ?? 0); i += 1) {
      const have = work.policies[kind]?.[i] ?? null;
      const want = layout[kind][i] ?? null;
      if (have && have !== want && Object.values(layout).some((l) => l.includes(have))) {
        return { cmd: { type: 'setPolicy', faction: view.me, slot: kind, index: i, policy: null }, score: 1, reasonKey: 'ai.reason.policyMove', params: { policy: have } };
      }
    }
  }
  for (const kind of SLOT_KINDS) {
    for (let i = 0; i < (slots[kind] ?? 0); i += 1) {
      const have = work.policies[kind]?.[i] ?? null;
      const want = layout[kind][i] ?? null;
      if (want && have !== want) {
        return { cmd: { type: 'setPolicy', faction: view.me, slot: kind, index: i, policy: want }, score: 1, reasonKey: 'ai.reason.policy', params: { policy: want } };
      }
    }
  }
  return null;
}
