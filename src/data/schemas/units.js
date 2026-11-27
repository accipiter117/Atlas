// Units, unit classes and promotions (section 3.5).

import { entryType, req, str, int, bool, ref, refs, obj, oneOf, effects, key, list } from './fields.js';

export const unitClasses = entryType('unitClasses', {
  domain: req(oneOf(['land', 'sea', 'space'])),
  combat: req(oneOf(['melee', 'ranged', 'none'])),
  civilian: bool(),
  ignoresZoc: bool(),
  promotionTree: str(),
});

export const units = entryType('units', {
  class: req(ref('unitClasses')),
  domain: oneOf(['land', 'sea', 'space']),
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
    // K4: only factions on this front-line side may train it.
    side: int(0, 1),
  }),
  // K4: never trained, only given (a project's flagship).
  unique: bool(),
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
  // Killzone Extrasolar War K2: a ship (domain space) on the star map. capacity: army groups it
  // carries; lands: it can put them down away from a base (dropships); bombard: orbital strikes;
  // heavy: may take heavy-only lanes; builtAt: the kinds of world whose bases can build it.
  space: obj({
    capacity: int(0, 6),
    lands: bool(),
    bombard: bool(),
    heavy: bool(),
    builtAt: list(oneOf(['homeworld', 'moon', 'asteroid', 'station', 'world'])),
  }),
});

export const promotions = entryType('promotions', {
  class: req(ref('unitClasses')),
  tier: req(int(1, 5)),
  requires: refs('promotions'),
  effects: effects(),
  descriptionKey: key(),
});

