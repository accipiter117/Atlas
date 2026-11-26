// Espionage planner (phase 15, section 3.10), offensive and defensive:
//   - a new spy defends the capital first (while no city is defended);
//   - the rest go to the best rival city: one at war with us, or the one we
//     like least, preferring big, rich cities;
//   - an idle spy abroad starts the mission worth most to us, if its odds are
//     good enough.
// Numbers in ai/weights.json ("espionage").

import { missionOdds, atWar, spyCount, spyCap } from '../../sim/index.js';
import { weightsOf, categoryWeight } from '../evaluate.js';

/** Where a spy should go next: a city id, or null. */
function bestPost(view, ruleset, memory, mineAbroad) {
  const me = view.me;
  const mine = view.cities.filter((c) => c.faction === me);
  const spies = view.espionage?.spies ?? [];
  const defended = new Set(spies.filter((s) => mine.some((c) => c.id === s.city)).map((s) => s.city));
  const capital = mine.find((c) => c.capital) ?? mine[0];
  if (capital && !defended.size) return capital.id;
  const ops = view.opinions ?? {};
  const targets = view.cities.filter((c) => c.faction !== me && c.faction !== 'raiders' && ops[c.faction] && !mineAbroad.has(c.id))
    .map((c) => ({ c, score: (atWar(view, me, c.faction) ? 20 : 0) - (ops[c.faction]?.mine?.total ?? 0) + c.pop * 2 + (c.capital ? 6 : 0) }))
    .sort((a, b) => b.score - a.score || (a.c.id < b.c.id ? -1 : 1));
  return targets[0]?.c.id ?? capital?.id ?? null;
}

function missionValue(view, ruleset, memory, id, city) {
  const m = ruleset.espionage[id];
  const war = atWar(view, view.me, city.faction);
  const cw = (c) => categoryWeight(ruleset, view, memory, c);
  switch (m.action) {
    case 'siphon': return 6 * cw('gold');
    case 'boost': return 8 * cw('science');
    case 'sabotage': return (war ? 9 : 3) * cw('military');
    case 'unrest': return (war ? 8 : 2) * cw('military');
    case 'intel': return (memory.intelFrom?.[city.faction] ?? -999) > view.turn - 20 ? 0 : 3;
    default: return 0;
  }
}

export function nextEspionage(world, view, ruleset, memory) {
  if (!ruleset.espionage || !view.espionage) return null;
  const w = weightsOf(ruleset, 'espionage');
  const me = view.me;
  const spies = view.espionage.spies ?? [];
  const abroad = new Set(spies.filter((s) => view.cities.some((c) => c.id === s.city && c.faction !== me)).map((s) => s.city));

  // Spy units on the map: post them.
  for (const u of view.units.filter((x) => x.faction === me && (ruleset.units[x.type]?.tags ?? []).includes('spy'))) {
    const city = bestPost(view, ruleset, memory, abroad);
    if (city) return { cmd: { type: 'assignSpy', faction: me, unit: u.id, city }, score: 1, reasonKey: 'ai.reason.spyPosted', params: { city: view.cities.find((c) => c.id === city)?.name ?? '' } };
  }
  // Idle spies abroad: the best mission with fair odds.
  for (const s of spies.filter((x) => !x.mission)) {
    const city = view.cities.find((c) => c.id === s.city);
    if (!city || city.faction === me) continue;
    const ranked = Object.keys(ruleset.espionage).filter((id) => (ruleset.espionage[id].requiresLevel ?? 0) <= s.level)
      .map((id) => ({ id, odds: missionOdds(world, ruleset, s, id, city), v: missionValue(view, ruleset, memory, id, city) }))
      .filter((x) => x.odds >= (w.minOdds ?? 40) && x.v > 0)
      .sort((a, b) => b.v * b.odds - a.v * a.odds || (a.id < b.id ? -1 : 1));
    if (ranked.length) {
      if (ruleset.espionage[ranked[0].id].action === 'intel') (memory.intelFrom ??= {})[city.faction] = view.turn;
      return { cmd: { type: 'startMission', faction: me, spy: s.id, mission: ranked[0].id }, score: ranked[0].v, reasonKey: 'ai.reason.mission', params: { mission: ranked[0].id, city: city.name, odds: ranked[0].odds } };
    }
  }
  return null;
}

/** Whether the AI wants another spy built. */
export const wantsSpy = (world, ruleset, view) => spyCount(world, ruleset, view.me) < Math.min(spyCap(world, ruleset, view.me), weightsOf(ruleset, 'espionage').maxSpies ?? 3);
