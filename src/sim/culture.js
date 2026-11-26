// Influence and the culture victory (section 3.12).
//
// Every faction keeps two running totals:
//   lifetimeCulture  all the culture its cities have ever produced
//   influence        what its wonders, great buildings and policies have
//                    spread abroad, added at the start of each of its turns
// Influence a turn: tuning.culture.influencePerWonder for each wonder, plus
// the influence of each building (buildings.json) and of each active policy
// card (policies.json). A culture victory is won when a faction's influence
// exceeds the lifetime culture of every living rival.

import { governmentOf } from './government.js';

export function influencePerTurn(state, ruleset, factionId) {
  const t = ruleset.tuning?.culture ?? {};
  let n = 0;
  for (const c of Object.values(state.cities ?? {})) {
    if (c.faction !== factionId) continue;
    for (const b of c.buildings) n += ruleset.buildings?.[b]?.influence ?? 0;
  }
  n += Object.values(state.wondersBuilt ?? {}).filter((cityId) => state.cities?.[cityId]?.faction === factionId).length * (t.influencePerWonder ?? 3);
  for (const list of Object.values(governmentOf(state, factionId).policies ?? {})) for (const id of list ?? []) n += ruleset.policies?.[id]?.influence ?? 0;
  return n;
}

/** Start of a faction's turn: its influence grows. */
export function startCultureTurn(state, ruleset, factionId) {
  const f = state.factions.find((x) => x.id === factionId);
  if (!f) return;
  f.influence = (f.influence ?? 0) + influencePerTurn(state, ruleset, factionId);
}
