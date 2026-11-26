// Military planner: when to go to war, and a threat map for everyone else.
//
// War: every few turns (from minTurnForWar), against a faction it has met,
// when its own fighting power is at least declareWarMinStrengthRatio times
// what it can see of theirs (bolder leaders need less), and only one war at
// a time (military.maxWars in data). Threat map: for each hex, the strength of enemy units at war with
// it that could reach it next turn.

import { atWar } from '../../sim/index.js';
import { weightsOf, personalityOf, militaryPower, dist } from '../evaluate.js';

export function threatMap(world, view, ruleset) {
  const enemies = view.units.filter((u) => u.faction !== view.me && atWar(world, view.me, u.faction));
  return (tile) => {
    let t = 0;
    for (const u of enemies) {
      const def = ruleset.units[u.type];
      if (ruleset.unitClasses[def.class]?.civilian) continue;
      if (dist(view.map, u.tile, tile) <= (def.moves ?? 2) + Math.max(1, def.range ?? 0)) t += Math.max(def.strength, def.rangedStrength ?? 0) * (u.hp / 100);
    }
    return t;
  };
}

export function considerWar(world, view, ruleset, memory) {
  const w = weightsOf(ruleset, 'military');
  const th = weightsOf(ruleset, 'thresholds');
  if (view.turn < (w.minTurnForWar ?? 30) || view.turn - (memory.warCheck ?? -99) < (w.warCheckEvery ?? 5)) return null;
  memory.warCheck = view.turn;
  const others = view.factions.filter((f) => f.id !== view.me && f.alive);
  const wars = others.filter((f) => atWar(world, view.me, f.id)).length;
  if (wars >= (w.maxWars ?? 1)) return null;
  const mine = militaryPower(ruleset, view.units.filter((u) => u.faction === view.me));
  const bold = personalityOf(ruleset, view).boldness;
  const need = (th.declareWarMinStrengthRatio ?? 1.4) / Math.max(0.3, bold);
  const pathBoost = memory.path === 'conquest' || memory.path === 'sandbox' ? 0.85 : 1.15;
  let best = null;
  for (const f of others) {
    if (atWar(world, view.me, f.id)) continue;
    const theirCities = view.cities.filter((c) => c.faction === f.id);
    if (!theirCities.length) continue; // not met
    const theirs = militaryPower(ruleset, view.units.filter((u) => u.faction === f.id)) + theirCities.length * 12;
    const ratio = mine / Math.max(1, theirs);
    if (ratio >= need * pathBoost && (!best || ratio > best.ratio)) best = { target: f.id, ratio };
  }
  if (!best) return null;
  return { cmd: { type: 'declareWar', faction: view.me, target: best.target }, score: best.ratio, reasonKey: 'ai.reason.war', params: { target: best.target, ratio: Math.round(best.ratio * 10) / 10 } };
}
