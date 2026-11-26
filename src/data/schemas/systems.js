// Trade, espionage, diplomacy, events and victories (sections 3.9 to 3.12).
// Their systems arrive in phases 9 to 16; the schemas exist now so mods can be
// checked against them from day one.

import { entryType, req, int, num, bool, oneOf, effects, key, str, obj, list, any, yields, refs } from './fields.js';

export const trade = entryType('trade', {
  kind: req(oneOf(['domestic', 'foreign'])),
  domain: oneOf(['land', 'sea']),
  originYields: yields(),
  destinationYields: yields(),
  perResource: yields(),
});

export const espionage = entryType('espionage', {
  turns: req(int(1, 30)),
  baseOdds: req(int(0, 100)),
  outcome: effects(),
  requiresLevel: int(0, 5),
  descriptionKey: key(),
  // Phase 15: what success does (the engine knows these five), with its numbers.
  action: oneOf(['intel', 'siphon', 'boost', 'sabotage', 'unrest']),
  amount: num(0, 1000),
  cap: int(0, 10000),
  effectTurns: int(1, 100),
});

export const diplomacy = entryType('diplomacy', {
  amount: req(int(-100, 100)),
  reasonKey: key(),
  decays: bool(),
  trigger: str(),
});

export const events = entryType('events', {
  when: req(obj({
    trigger: req(str()),
    chance: num(0, 1),
    conditions: list(any()),
    minTurn: int(0, 2000),
  })),
  textKey: req(key()),
  choices: req(list(obj({ textKey: req(key()), effects: effects() }), { min: 1 })),
  // Phase 16: disasters only happen with the Disasters setup option on.
  disaster: bool(),
});

// Difficulty (section 9.5): the only advantages anyone gets, all listed on the setup screen.
export const difficulty = entryType('difficulty', {
  index: req(int(0, 20)),
  default: bool(),
  aiEffects: effects(),
  humanEffects: effects(),
  aiStartUnits: refs('units'),
  summaryKey: req(key()),
});

export const victories = entryType('victories', {
  module: req(str()),
  enabled: req(bool()),
  params: obj({}, { open: true }),
});
