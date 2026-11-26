// Production planner (section 9.3): for each city, every buildable item gets
//   score = baseValue x pathWeight x personality x urgency / sqrt(turns)
// Settlers while there are good sites and room to grow, builders while land
// lies unimproved, defenders when a city has none (more under threat, and an
// army at war), buildings and wonders by what they would add here.

import { buildOptions, itemCost, cityYields, adjacencyBonus, buildingDef } from '../../sim/index.js';
import { categoryWeight, weightsOf, dist } from '../evaluate.js';

export function rankProduction(world, view, ruleset, memory, city, ctx) {
  const w = weightsOf(ruleset, 'economy');
  const exp = weightsOf(ruleset, 'expansion');
  const mil = weightsOf(ruleset, 'military');
  const prod = Math.max(1, cityYields(world, ruleset, city).total.production);
  const mine = view.units.filter((u) => u.faction === view.me);
  const myCities = view.cities.filter((c) => c.faction === view.me);
  const isTag = (u, tag) => (ruleset.units[u.type].tags ?? []).includes(tag);
  const combat = (id) => !ruleset.unitClasses[ruleset.units[id].class]?.civilian;
  const settlers = mine.filter((u) => isTag(u, 'founder')).length + myCities.filter((c) => c.queue[0]?.id === 'settler' && c.id !== city.id).length;
  const builders = mine.filter((u) => isTag(u, 'worker')).length;
  const defenders = mine.filter((u) => combat(u.type) && dist(view.map, u.tile, city.tile) <= 1).length;
  const options = buildOptions(world, ruleset, city);
  const out = [];
  for (const item of options) {
    const turns = Math.max(1, Math.ceil(itemCost(ruleset, item, world, city) / prod));
    let value = 0;
    let reasonKey = 'ai.reason.build';
    const params = { item: item.id, city: city.name };
    if (item.kind === 'unit') {
      const def = ruleset.units[item.id];
      if ((def.tags ?? []).includes('founder')) {
        if (city.pop < 2 || settlers > Math.floor(myCities.length / 2) || myCities.length + settlers >= (exp.targetCities ?? 8) || !(ctx.sites?.length)) continue;
        // Early cities matter most: settling is worth far more while the empire is small.
        value = 10 * categoryWeight(ruleset, view, memory, 'settle') * (myCities.length < (exp.earlyCities ?? 3) ? (exp.earlyBoost ?? 3) : 1);
        reasonKey = 'ai.reason.settler';
      } else if ((def.tags ?? []).includes('worker')) {
        if (builders >= Math.min(w.maxBuilders ?? 4, Math.ceil(myCities.length * (w.builderPerCities ?? 1.5) / 2))) continue;
        value = 7 * categoryWeight(ruleset, view, memory, 'builder');
        reasonKey = 'ai.reason.builder';
      } else if (def.class === 'recon') {
        // One scout while most of the map is unknown.
        const known = view.fog.filter((f) => f !== 0).length / view.fog.length;
        const scouts = mine.filter((u) => ruleset.units[u.type].class === 'recon').length;
        if (scouts > 0 || known > 0.35) continue;
        value = 11 * categoryWeight(ruleset, view, memory, 'settle');
        reasonKey = 'ai.reason.scout';
      } else if (combat(item.id)) {
        const strength = Math.max(def.strength, def.rangedStrength ?? 0);
        const needDefence = defenders < (mil.defendersPerCity ?? 1);
        const urgency = ctx.threatAt(city.tile) > 0 ? (mil.threatUrgency ?? 3) : 1;
        const war = ctx.atWar ? 1 : 0;
        const army = mine.filter((u) => combat(u.type)).length;
        // No new army while gold is falling: upkeep would bankrupt the faction.
        const wantArmy = war && army < myCities.length * (mil.armyPerCityAtWar ?? 2) && (view.lastNetGold ?? 0) >= 0;
        if (!needDefence && !wantArmy && urgency === 1) continue;
        // Prefer the strongest unit for its cost; naval units only for a reason.
        const domain = def.domain ?? 'land';
        if (domain === 'sea') continue;
        value = (needDefence ? 12 : 8) * (strength / 30) * urgency * categoryWeight(ruleset, view, memory, 'military');
        reasonKey = needDefence ? 'ai.reason.defender' : 'ai.reason.army';
      } else {
        continue;
      }
    } else {
      const def = buildingDef(ruleset, item.id);
      const amen = ctx.unhappy(city) ? 3 : 0.8;
      for (const [y, n] of Object.entries(def.yields ?? {})) value += n * categoryWeight(ruleset, view, memory, y);
      for (const a of adjacencyBonus(world, ruleset, { ...city, buildings: [...city.buildings, item.id] }, item.id)) value += a.amount * categoryWeight(ruleset, view, memory, a.yield);
      value += (def.amenities ?? 0) * amen + (def.effects?.length ?? 0) * 1.2 + (def.defence ? (ctx.threatAt(city.tile) ? 4 : 0.3) : 0);
      value -= (def.upkeep ?? 0) * 0.6;
      if (item.kind === 'wonder') {
        value = value * 0.8 + 2 * categoryWeight(ruleset, view, memory, 'wonder');
        if (view.turn < (exp.wonderFromTurn ?? 30)) value *= 0.4;
        reasonKey = 'ai.reason.wonder';
      }
      if (value <= 0) continue;
    }
    out.push({ cmd: { type: 'setProduction', faction: view.me, city: city.id, item }, score: value / Math.sqrt(turns), reasonKey, params });
  }
  return out.sort((a, b) => b.score - a.score || a.cmd.item.id.localeCompare(b.cmd.item.id));
}
