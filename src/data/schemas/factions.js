// Factions, leaders and city name lists (section 4.6).

import { entryType, req, key, ref, refs, obj, colour, effects, str, list, num, int, oneOf } from './fields.js';

const trait = obj({ id: req(str()), effects: effects() });

export const factions = entryType('factions', {
  adjectiveKey: key(),
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
  agenda: obj({ id: req(str()), likes: str(), hates: str(), weight: int(0, 20) }),
  ai: obj({
    personality: ref('aiPersonalities', { cascade: 'clear' }),
    victoryBias: obj(Object.fromEntries(VICTORIES.map((v) => [v, num(0, 5)])), { open: true }),
  }),
  portrait: str(),
});

export const cityNames = entryType('cityNames', {
  names: req(list(str(), { min: 1 })),
});

export const aiPersonalities = entryType('aiPersonalities', {
  aggression: num(0, 2),
  expansion: num(0, 2),
  wonderLove: num(0, 2),
  style: oneOf(['builder', 'conqueror', 'builder_conqueror', 'trader', 'zealot']),
});

export const aiWeights = entryType('aiWeights', {
  planner: req(str()),
  weights: req(obj({}, { open: true })),
});
