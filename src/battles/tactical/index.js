// The tactical battle module (phase 18, docs/PLAN.md section 5): fight your
// own battles with pixel soldiers on a small field built from the ground the
// battle is fought on. sim/ holds the rules (seeded, no DOM), render/ draws the
// field and ui/ builds the battle screen.
//
// It handles land battles only (a fight with a ship, or a city's own shot,
// goes to auto). The engine sends it only battles a human starts with
// "Ask each time" or "Always fight my battles"; everything else auto-resolves.

import { simulateBattle } from './sim/battle.js';
import { mountBattle } from './ui/screen.js';

const SEA = new Set(['naval_melee', 'naval_ranged']);

export default {
  id: 'tactical',
  version: 1,
  kind: 'interactive',
  canHandle(spec) {
    if (spec.kind === 'cityRanged') return false;
    const units = [...spec.attacker.units, ...spec.defender.units];
    return units.length > 0 && !units.some((u) => SEA.has(u.class) || (u.tags ?? []).includes('ship'));
  },
  simulate(spec, rng) {
    return simulateBattle(spec, rng);
  },
  mount(spec, host) {
    return mountBattle(spec, host);
  },
};
