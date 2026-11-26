// Conquest: hold every original capital (each faction's very first city).
// Nobody wins this way while a living rival has not founded its capital yet.

import { teamOf } from '../diplomacy.js';

const capitals = (state) => Object.values(state.cities ?? {}).filter((c) => c.originalCapital);
/** Same side: the same faction, or teammates (phase 12). */
const side = (state, a, b) => a === b || (teamOf(state, a) !== null && teamOf(state, a) === teamOf(state, b));

export default {
  winner(state) {
    const alive = state.factions.filter((f) => f.alive);
    if (state.factions.length > 1 && alive.length && alive.every((f) => side(state, f.id, alive[0].id)) && state.factions.some((f) => !side(state, f.id, alive[0].id))) return alive[0].id;
    const caps = capitals(state);
    for (const x of alive) {
      if (!caps.some((c) => c.foundedBy === x.id)) continue;
      if (alive.some((f) => !side(state, f.id, x.id) && !f.foundedCapital)) continue;
      if (caps.some((c) => !side(state, c.foundedBy, x.id)) && caps.every((c) => side(state, c.faction, x.id))) return x.id;
    }
    return null;
  },
  progress(state, ruleset, params, factionId) {
    const caps = capitals(state);
    const unsettled = state.factions.filter((f) => f.alive && !f.foundedCapital).length;
    return { value: caps.filter((c) => c.faction === factionId).length, target: Math.max(2, caps.length + unsettled) };
  },
};
