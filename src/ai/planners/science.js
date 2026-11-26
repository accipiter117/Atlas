// Science planner: which tech to research next. Each available tech is
// valued by what it unlocks (units by their strength, buildings and wonders
// by their yields, improvements, revealed resources), weighted by the
// current path and personality, made cheaper by any boost already paid,
// and divided by the square root of its cost.

import { available, costOf } from '../../sim/index.js';
import { categoryWeight } from '../evaluate.js';

const YIELD_CATEGORY = { food: 'food', production: 'production', gold: 'gold', science: 'science', culture: 'culture', faith: 'faith' };

export function rankTechs(world, view, ruleset, memory) {
  const out = [];
  for (const id of available(world, ruleset, view.me)) {
    const tech = ruleset.techs[id];
    let value = 1;
    const reasons = [];
    for (const u of tech.unlocks?.units ?? []) {
      const def = ruleset.units[u];
      if (!def || (def.requires?.faction && def.requires.faction !== view.factions.find((f) => f.id === view.me)?.civ)) continue;
      value += (Math.max(def.strength, def.rangedStrength ?? 0) / 25) * categoryWeight(ruleset, view, memory, 'military');
      reasons.push(u);
    }
    for (const b of [...(tech.unlocks?.buildings ?? []), ...(tech.unlocks?.wonders ?? [])]) {
      const def = ruleset.buildings?.[b] ?? ruleset.wonders?.[b];
      if (!def) continue;
      for (const [y, n] of Object.entries(def.yields ?? {})) value += (n / 2) * categoryWeight(ruleset, view, memory, YIELD_CATEGORY[y]);
      value += (def.amenities ?? 0) * 0.8 + (def.effects?.length ?? 0) * 0.6;
      if (ruleset.wonders?.[b]) value += 0.5 * categoryWeight(ruleset, view, memory, 'wonder');
    }
    value += (tech.unlocks?.improvements?.length ?? 0) * 1.2 * categoryWeight(ruleset, view, memory, 'builder');
    value += Object.values(ruleset.resources).filter((r) => r.revealedBy === id).length * 1.5;
    const cost = costOf(world, ruleset, id);
    const paid = view.research?.progress?.[id] ?? 0;
    const score = (value * categoryWeight(ruleset, view, memory, 'science') * 10) / Math.sqrt(Math.max(1, cost - paid));
    out.push({ cmd: { type: 'setResearch', faction: view.me, item: id }, score, reasonKey: 'ai.reason.research', params: { tech: id } });
  }
  return out.sort((a, b) => b.score - a.score || a.cmd.item.localeCompare(b.cmd.item));
}
