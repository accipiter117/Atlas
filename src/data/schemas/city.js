// Buildings, wonders and improvements (section 3.4).

import { entryType, req, str, int, num, bool, ref, refs, list, obj, map, oneOf, effects, yields, YIELDS } from './fields.js';

const adjacency = list(obj({
  yield: req(oneOf(YIELDS)),
  amount: req(num(-20, 20)),
  per: int(1, 10),
  countTiles: obj({ terrain: ref('terrain'), feature: ref('features'), resource: ref('resources'), improvement: ref('improvements') }),
  within: oneOf(['borders', 'adjacent']),
}));

const buildingFields = {
  era: ref('eras'),
  cost: req(int(1, 5000)),
  upkeep: int(0, 50),
  requires: obj({
    tech: ref('techs'),
    civic: ref('civics'),
    faction: ref('factions'),
    buildings: refs('buildings', { cascade: 'remove' }),
    nearTerrain: ref('terrain'),
  }),
  replaces: ref('buildings', { cascade: 'clear' }),
  yields: yields(),
  adjacency,
  specialistSlots: map(oneOf(YIELDS), int(0, 5)),
  housing: int(0, 20),
  amenities: int(0, 20),
  defence: int(0, 200),
  effects: effects(),
  icon: str(),
};

export const buildings = entryType('buildings', buildingFields);

export const wonders = entryType('wonders', {
  ...buildingFields,
  era: req(ref('eras')),
  project: bool(),
});

export const improvements = entryType('improvements', {
  yields: yields(),
  validTerrain: refs('terrain'),
  validFeatures: refs('features'),
  needsHills: bool(),
  requires: obj({ tech: ref('techs'), civic: ref('civics') }),
  moveCost: num(0.1, 10),
  charges: int(0, 5),
  art: str(),
});
