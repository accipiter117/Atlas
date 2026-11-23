// Map content: terrain, features, resources, map sizes and map types (section 3.1).

import { entryType, req, str, key, int, num, bool, yields, refs, ref, oneOf, obj } from './fields.js';

export const terrain = entryType('terrain', {
  yields: req(yields()),
  moveCost: req(int(1, 99)),
  impassable: bool(),
  water: bool(),
  defence: int(-20, 20),
  allowsHills: bool(),
  art: str(),
});

export const features = entryType('features', {
  yields: yields(),
  moveCost: int(1, 99),
  defence: int(-20, 20),
  blocksSight: bool(),
  validTerrain: refs('terrain'),
  removable: bool(),
  art: str(),
});

export const resources = entryType('resources', {
  class: req(oneOf(['bonus', 'luxury', 'strategic'])),
  yields: yields(),
  revealedBy: ref('techs'),
  improvement: ref('improvements', { cascade: 'clear' }),
  improvedYields: yields(),
  validTerrain: refs('terrain'),
  validFeatures: refs('features'),
  needsHills: bool(),
  frequency: num(0, 10),
  amenities: int(0, 10),
  art: str(),
});

export const mapSizes = entryType('mapSizes', {
  width: req(int(10, 200)),
  height: req(int(10, 200)),
  factions: req(int(1, 16)),
  default: bool(),
});

export const mapTypes = entryType('mapTypes', {
  recipe: req(obj({
    landShare: req(num(0.05, 0.95)),
    landmasses: req(int(1, 20)),
    mountainShare: req(num(0, 0.5)),
    hillShare: num(0, 0.8),
    rivers: req(int(0, 200)),
    inlandSea: bool(),
  })),
  descriptionKey: key(),
  default: bool(),
});

