// Victory paths (section 3.12). Each module is registered here by id; the
// ruleset's victories.json switches them on and names the module, and the
// setup's victories list (when given) narrows them further. Culture and
// religious victories arrive with their systems in later phases, so their
// entries are simply not active until a module exists for them.
//
// Victories are checked at the end of every round (section 3.14).

import conquest from './conquest.js';
import science from './science.js';
import score from './score.js';
import religious from './religious.js';
import culture from './culture.js';
import { teamOf } from '../diplomacy.js';

export const VICTORY_MODULES = Object.freeze({ conquest, science, score, religious, culture });

/** The victories this game can be won by: [{ id, def, module }]. */
export function activeVictories(state, ruleset) {
  const chosen = state.setup?.victories;
  return Object.values(ruleset.victories ?? {})
    .filter((v) => v.enabled && VICTORY_MODULES[v.module] && (!Array.isArray(chosen) || chosen.includes(v.id)))
    .map((v) => ({ id: v.id, def: v, module: VICTORY_MODULES[v.module] }));
}

/** The score victory's turn limit: the setup's own, else the default for the game speed. null means none. */
export function turnLimit(state, ruleset) {
  if (state.setup?.turnLimit === null || state.setup?.turnLimit === 'none') return null;
  if (Number.isInteger(state.setup?.turnLimit)) return state.setup.turnLimit;
  // A mod can switch the default limit off (lock-era sets the score victory's turnLimit to null).
  const params = ruleset.victories?.score?.params ?? {};
  if (Object.hasOwn(params, 'turnLimit') && params.turnLimit === null) return null;
  const speed = state.setup?.speed ?? 'standard';
  const byTuning = ruleset.tuning?.victory?.turnLimits?.[speed];
  if (byTuning) return byTuning;
  const base = params.turnLimit ?? null;
  return base ? Math.round(base * (ruleset.tuning?.speeds?.[speed] ?? 1)) : null;
}

/** End of round: record the first victory that has been won (working copy). */
export function checkVictory(state, ruleset, events) {
  if (state.winner) return;
  const limit = turnLimit(state, ruleset);
  for (const v of activeVictories(state, ruleset)) {
    const id = v.module.winner(state, ruleset, v.def.params ?? {}, limit);
    if (id) {
      state.winner = { faction: id, victory: v.id, turn: state.turn, team: teamOf(state, id) };
      events.push({ type: 'gameWon', faction: id, victory: v.id, turn: state.turn, global: true });
      return;
    }
  }
  // With no score victory, the game still ends at the turn limit (with no winner) if one is set explicitly.
}

/** How close every faction is on every active path: [{ id, nameKey, rows: [{ faction, value, target, turnsLeft }] }]. */
export function victoryProgress(state, ruleset) {
  const limit = turnLimit(state, ruleset);
  return activeVictories(state, ruleset).map((v) => ({
    id: v.id,
    nameKey: v.def.nameKey,
    rows: state.factions.map((f) => ({ faction: f.id, alive: f.alive, ...v.module.progress(state, ruleset, v.def.params ?? {}, f.id, limit) })),
  }));
}
