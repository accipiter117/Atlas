// Grand strategy (section 9.2): every few turns, score each enabled victory
// path from 0 to 100 and keep the best, with hysteresis so the AI does not
// dither: a new path must beat the current one by switchMargin points.
//   pathScore = progress x w.progress + feasibility x w.feasibility
//             + leaderBias x w.bias + traitFit x w.trait - rivalLead x w.rival
// Paths available for now: conquest, science and score (others arrive with
// their systems). lock-era's sandbox mode replaces them with "sandbox".

import { weightsOf, personalityOf } from './evaluate.js';

const PATHS = ['conquest', 'science', 'score'];

export function pathScores(view, ruleset) {
  const w = weightsOf(ruleset, 'strategy');
  const bias = personalityOf(ruleset, view).bias;
  const enabled = PATHS.filter((p) => ruleset.victories?.[p]?.enabled !== false);
  const myCities = view.cities.filter((c) => c.faction === view.me);
  const capitals = view.cities.filter((c) => c.originalCapital || c.capital);
  const known = view.research?.known?.length ?? 0;
  const techs = Object.keys(ruleset.techs ?? {}).length || 1;
  const others = view.factions.filter((f) => f.id !== view.me && f.alive).length;
  const out = {};
  for (const p of enabled) {
    let progress = 0;
    let feasibility = 1;
    if (p === 'conquest') {
      progress = capitals.length ? capitals.filter((c) => c.faction === view.me).length / Math.max(1, others + 1) : 0;
      feasibility = view.map?.type === 'islands' ? 0.5 : 1;
    } else if (p === 'science') {
      progress = known / techs;
    } else {
      progress = Math.min(1, myCities.length / 8);
    }
    const traitFit = 0;
    const rivalLead = 0;
    out[p] = progress * (w.progress ?? 40) + feasibility * (w.feasibility ?? 25) + (bias[p] ?? 1) * (w.bias ?? 30) + traitFit * (w.trait ?? 10) - rivalLead * (w.rival ?? 20);
  }
  return out;
}

/** Update memory.path (and memory.secondary) when due. */
export function updateStrategy(view, ruleset, memory) {
  if (ruleset.tuning?.ai?.lateGameMode === 'sandbox') { memory.path = 'sandbox'; return null; }
  const w = weightsOf(ruleset, 'strategy');
  if (memory.path && view.turn - (memory.pathTurn ?? -99) < (w.everyTurns ?? 10)) return null;
  const scores = pathScores(view, ruleset);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) { memory.path = 'score'; return null; }
  const [best, bestScore] = ranked[0];
  const current = memory.path;
  memory.pathTurn = view.turn;
  if (!current || current === best || bestScore >= (scores[current] ?? -Infinity) + (w.switchMargin ?? 15)) {
    const changed = current !== best;
    memory.path = best;
    memory.secondary = ranked[1]?.[0] ?? null;
    return changed ? { path: best, scores } : null;
  }
  return null;
}
