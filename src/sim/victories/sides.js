// Side victories (Killzone Extrasolar War K4b; docs/KILLZONE.md 6.4). One module, three ways to
// win and one for running out of time, each a victories.json entry with params.kind:
//   capitals   every enemy faction's original capital is held by your side
//   support    the enemy side's war support has fallen to 0
//   territory  your side has held params.worlds worlds for params.turns rounds in a row
//   time       at the turn limit, the side with more war support (then more worlds) wins; a
//              dead heat goes to the first seat's side
// The winner recorded is the faction with most glory on the winning side (then the earlier
// seat): its decisive victory, the others' a shared one.

import { sideOf } from '../frontline.js';
import { allCities } from '../worlds.js';

function winningSide(state, ruleset, params, limit) {
  if (!state.warSupport) return null;
  const caps = Object.values(allCities(state)).filter((c) => c.originalCapital);
  for (const side of [0, 1]) {
    const enemy = 1 - side;
    if (params.kind === 'capitals') {
      const theirs = caps.filter((c) => sideOf(state, ruleset, c.foundedBy ?? c.faction) === enemy);
      if (theirs.length && theirs.every((c) => sideOf(state, ruleset, c.faction) === side)) return side;
    }
    if (params.kind === 'support' && state.warSupport[enemy] <= 0) return side;
    if (params.kind === 'territory' && (state.holdStreak?.[side] ?? 0) >= (params.turns ?? 10)) return side;
  }
  if (params.kind === 'time' && limit && state.turn >= limit) {
    const w = state.warSupport;
    if (w[0] !== w[1]) return w[0] > w[1] ? 0 : 1;
    const held = (s) => Object.values(state.holders ?? {}).filter((h) => h === s).length;
    if (held(0) !== held(1)) return held(0) > held(1) ? 0 : 1;
    // A dead heat: the side of the first seat in the (shuffled) seat order, a fair coin toss.
    // Glory is not used here: some factions earn it just by holding ground, which would always
    // hand the tie to the same side.
    return sideOf(state, ruleset, state.seatOrder[0]);
  }
  return null;
}

/** The faction with most glory on a side (then the earlier seat). */
export function gloryLeader(state, ruleset, side) {
  const members = state.seatOrder.map((id) => state.factions.find((f) => f.id === id)).filter((f) => f && sideOf(state, ruleset, f.id) === side);
  let best = null;
  for (const f of members) if (!best || (state.glory?.[f.id] ?? 0) > (state.glory?.[best.id] ?? 0)) best = f;
  return best?.id ?? null;
}

export default {
  winner(state, ruleset, params, limit) {
    const side = winningSide(state, ruleset, params, limit);
    return side === null ? null : gloryLeader(state, ruleset, side);
  },
  progress(state, ruleset, params, factionId, limit) {
    const side = sideOf(state, ruleset, factionId);
    if (!state.warSupport) return { value: 0, target: null, turnsLeft: null };
    if (params.kind === 'support') return { value: 100 - (state.warSupport[1 - side] ?? 0), target: 100, turnsLeft: null };
    if (params.kind === 'territory') return { value: Object.values(state.holders ?? {}).filter((h) => h === side).length, target: params.worlds ?? 6, turnsLeft: null };
    if (params.kind === 'capitals') {
      const caps = Object.values(allCities(state)).filter((c) => c.originalCapital && sideOf(state, ruleset, c.foundedBy ?? c.faction) === 1 - side);
      return { value: caps.filter((c) => sideOf(state, ruleset, c.faction) === side).length, target: caps.length, turnsLeft: null };
    }
    return { value: state.warSupport[side] ?? 0, target: null, turnsLeft: limit ? Math.max(0, limit - state.turn) : null };
  },
};
