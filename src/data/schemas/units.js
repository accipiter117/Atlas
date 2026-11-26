// Units, unit classes and promotions (section 3.5).

import { entryType, req, str, int, bool, ref, refs, obj, oneOf, effects, key } from './fields.js';

export const unitClasses = entryType('unitClasses', {
  domain: req(oneOf(['land', 'sea'])),
  combat: req(oneOf(['melee', 'ranged', 'none'])),
  civilian: bool(),
  ignoresZoc: bool(),
  promotionTree: str(),
});

export const units = entryType('units', {
  class: req(ref('unitClasses')),
  domain: oneOf(['land', 'sea']),
  era: ref('eras'),
  strength: req(int(0, 200)),
  rangedStrength: int(0, 200),
  range: int(0, 5),
  moves: req(int(1, 10)),
  sight: int(1, 6),
  cost: req(int(1, 5000)),
  upkeep: int(0, 50),
  requires: obj({
    tech: ref('techs'),
    civic: ref('civics'),
    resource: ref('resources'),
    faction: ref('factions'),
    building: ref('buildings'),
  }),
  replaces: ref('units', { cascade: 'clear' }),
  upgradesTo: ref('units', { cascade: 'clear' }),
  abilities: effects(),
  sprite: str(),
  descriptionKey: key(),
  // Phase 13: units bought only with faith (missionaries), and uses before they are spent.
  faithOnly: bool(),
  // Phase 17: units only raiders field (a conversion's monsters); no city can train them.
  raiderOnly: bool(),
  charges: int(1, 20),
});

export const promotions = entryType('promotions', {
  class: req(ref('unitClasses')),
  tier: req(int(1, 5)),
  requires: refs('promotions'),
  effects: effects(),
  descriptionKey: key(),
});

