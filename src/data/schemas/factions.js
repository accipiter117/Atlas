// Factions, leaders and city name lists (section 4.6).

import { entryType, req, key, ref, refs, obj, colour, effects, str, list, num, int, oneOf } from './fields.js';

const trait = obj({ id: req(str()), nameKey: key(), descriptionKey: key(), effects: effects() });

export const factions = entryType('factions', {
  adjectiveKey: key(),
  descriptionKey: key(),
  colours: req(obj({ primary: req(colour()), secondary: req(colour()) })),
  leaders: req(refs('leaders')),
  startBias: obj({ terrain: refs('terrain'), avoid: refs('terrain') }),
  trait,
  uniqueUnits: refs('units'),
  uniqueBuildings: refs('buildings'),
  cityNames: ref('cityNames', { cascade: 'clear' }),
});

const VICTORIES = ['conquest', 'science', 'culture', 'religious', 'score'];

export const leaders = entryType('leaders', {
  faction: req(ref('factions')),
  trait,
  agenda: obj({ id: req(str()), nameKey: key(), descriptionKey: key(), likes: str(), hates: str(), weight: int(0, 20) }),
  ai: obj({
    personality: ref('aiPersonalities', { cascade: 'clear' }),
    victoryBias: obj(Object.fromEntries(VICTORIES.map((v) => [v, num(0, 5)])), { open: true }),
  }),
  portrait: str(),
});

export const cityNames = entryType('cityNames', {
  names: req(list(str(), { min: 1 })),
});

// A personality multiplies each category of decision (section 9.3), plus how
// bold (war), loyal (treaties) and grudging (old wars) the leader is.
export const aiPersonalities = entryType('aiPersonalities', {
  weights: obj({}, { open: true }),
  boldness: num(0, 2),
  loyalty: num(0, 2),
  grudge: num(0, 2),
  style: oneOf(['builder', 'conqueror', 'builder_conqueror', 'trader', 'zealot', 'explorer']),
});

export const aiWeights = entryType('aiWeights', {
  planner: req(str()),
  weights: req(obj({}, { open: true })),
});
