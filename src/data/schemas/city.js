// Buildings, wonders and improvements (section 3.4).

import { entryType, req, str, int, num, bool, ref, refs, list, obj, map, oneOf, effects, yields, key, YIELDS } from './fields.js';

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
    projects: refs('wonders', { cascade: 'remove' }),
    nearTerrain: ref('terrain'),
    river: bool(),
    capital: bool(),
    // K4: only factions on this front-line side may build it (all three of a side share their kit).
    side: int(0, 1),
  }),
  replaces: ref('buildings', { cascade: 'clear' }),
  // K4: only on these kinds of world (a shipyard on home worlds and stations).
  builtAt: list(oneOf(['homeworld', 'moon', 'asteroid', 'station', 'world'])),
  // K4: fires each round at enemy ships in this world's orbit (orbital defence guns).
  orbitalGuns: int(0, 100),
  // K4: the base supplies this many hexes further (logistics hubs).
  supplyRange: int(0, 6),
  // Phase 16: influence a turn towards a culture victory (wonders also get tuning.culture.influencePerWonder).
  influence: num(0, 100),
  yields: yields(),
  adjacency,
  specialistSlots: map(oneOf(YIELDS), int(0, 5)),
  housing: int(0, 20),
  amenities: int(0, 20),
  defence: int(0, 200),
  effects: effects(),
  icon: str(),
  descriptionKey: key(),
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
  needsResource: bool(),
  water: bool(),
  road: bool(),
  removesFeature: bool(),
  defence: int(0, 20),
  requires: obj({ tech: ref('techs'), civic: ref('civics') }),
  moveCost: num(0.1, 10),
  charges: int(0, 5),
  art: str(),
  descriptionKey: key(),
  // K3: how many turns an engineer takes over it (1 when left out).
  turns: int(1, 9),
  // K3: war infrastructure (src/sim/war.js). Built anywhere your side holds; who built it counts.
  war: obj({
    faction: ref('factions'),
    zoc: bool(),
    stopsEntry: bool(),
    freeShot: int(0, 100),
    mineDamage: int(0, 100),
    hidden: bool(),
    antiAir: int(0, 6),
    strikeArmour: int(0, 100),
    arcDamage: int(0, 100),
    bombard: obj({ strength: req(int(1, 200)), range: req(int(1, 6)), crew: bool() }),
    landingBay: bool(),
    supply: int(0, 8),
    heal: int(0, 100),
    reveal: int(0, 6),
  }),
});
