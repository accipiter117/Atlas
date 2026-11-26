// Score: when the turn limit's round ends, the living faction with the highest
// score wins (a tie goes to the earlier seat).

import { scoreOf } from '../score.js';

export default {
  winner(state, ruleset, params, limit) {
    if (!limit || state.turn < limit) return null;
    const alive = state.seatOrder.map((id) => state.factions.find((f) => f.id === id)).filter((f) => f?.alive);
    let best = null;
    for (const f of alive) {
      const s = scoreOf(state, ruleset, f.id);
      if (!best || s > best.s) best = { id: f.id, s };
    }
    return best?.id ?? null;
  },
  progress(state, ruleset, params, factionId, limit) {
    return { value: scoreOf(state, ruleset, factionId), target: null, turnsLeft: limit ? Math.max(0, limit - state.turn) : null };
  },
};
