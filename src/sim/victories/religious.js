// Religious: your religion is what most people follow in more than
// params.shareOfCities (a half) of the cities of every living faction,
// your own included. Only the founder of a religion can win this way.

import { majorityOf } from '../religion.js';

function convertedFactions(state, religionId, share) {
  const living = state.factions.filter((f) => f.alive && Object.values(state.cities ?? {}).some((c) => c.faction === f.id));
  let n = 0;
  for (const f of living) {
    const mine = Object.values(state.cities).filter((c) => c.faction === f.id);
    if (mine.filter((c) => majorityOf(c) === religionId).length > mine.length * share) n += 1;
  }
  return { n, of: living.length };
}

export default {
  winner(state, ruleset, params) {
    const share = params?.shareOfCities ?? 0.5;
    for (const r of Object.values(state.religion?.religions ?? {}).sort((a, b) => a.founded - b.founded || (a.id < b.id ? -1 : 1))) {
      if (!state.factions.find((f) => f.id === r.founder)?.alive) continue;
      const { n, of } = convertedFactions(state, r.id, share);
      if (of > 1 && n === of) return r.founder;
    }
    return null;
  },
  progress(state, ruleset, params, factionId) {
    const r = Object.values(state.religion?.religions ?? {}).find((x) => x.founder === factionId);
    const living = state.factions.filter((f) => f.alive && Object.values(state.cities ?? {}).some((c) => c.faction === f.id)).length;
    if (!r) return { value: 0, target: Math.max(2, living) };
    const { n, of } = convertedFactions(state, r.id, params?.shareOfCities ?? 0.5);
    return { value: n, target: Math.max(2, of) };
  },
};
