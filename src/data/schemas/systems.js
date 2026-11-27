// Trade, espionage, diplomacy, events and victories (sections 3.9 to 3.12).
// Their systems arrive in phases 9 to 16; the schemas exist now so mods can be
// checked against them from day one.

import { entryType, req, int, num, bool, oneOf, effects, key, str, obj, list, any, yields, refs, ref } from './fields.js';

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

// Phase 19: the optional front-line system (tuning.frontline.enabled).
// Capturable sites (a factory, a power plant) and the bonuses their holder's
// side enjoys, through the effects registry.
export const sites = entryType('sites', {
  descriptionKey: key(),
  icon: str(),
  effects: effects(),
});

// Fixed maps for front-line games: rows of map letters (legend says what each
// letter is), where the front starts (a column), each side's cities and
// units, and the sites on the map.
const placed = obj({ side: req(int(0, 1)), col: req(int(0, 200)), row: req(int(0, 200)) }, { open: true });
export const mapPresets = entryType('mapPresets', {
  descriptionKey: key(),
  legend: req(obj({}, { open: true })),
  rows: req(list(str(), { min: 4 })),
  front: req(int(0, 200)),
  // K2: who holds the ground at the start: split at the front column (the default), all one
  // side's, or nobody's (a neutral world waiting to be claimed). Then cities may be none.
  start: oneOf(['front', 'side0', 'side1', 'neutral']),
  cities: req(list(placed)),
  units: list(placed),
  sites: list(obj({ site: req(ref('sites')), col: req(int(0, 200)), row: req(int(0, 200)) })),
});

// Killzone Extrasolar War, phase K1a: several worlds in one game (on when any are listed).
// Each world has its own map: a fixed one from mapPresets, or one generated at a size and
// type. Exactly one world is where the game starts (start: true): the first one viewed, and
// on a generated map the one that gets the starting units.
export const worlds = entryType('worlds', {
  descriptionKey: key(),
  kind: req(oneOf(['homeworld', 'moon', 'asteroid', 'station', 'world'])),
  order: req(int(0, 99)),
  start: bool(),
  map: req(obj({ preset: ref('mapPresets'), size: ref('mapSizes'), type: ref('mapTypes') })),
  // K2: fleets in this world's orbit at the start, by side (ships are units with domain space).
  fleets: list(obj({ side: req(int(0, 1)), ships: req(list(ref('units'), { min: 1 })) })),
  // K2: where the world sits on the star map, in percent of its width and height.
  pos: obj({ x: req(int(0, 100)), y: req(int(0, 100)) }),
  // K3: the world's own theatre rules (src/sim/war.js).
  theatre: obj({
    storm: obj({ every: req(int(2, 20)), offset: int(0, 19), sight: int(-3, 0), blocksOrbit: bool() }),
    toxic: obj({ damage: req(int(1, 50)), terrain: refs('terrain'), immune: refs('factions') }),
    lowGravity: obj({ moves: req(int(1, 3)), tag: str() }),
    noVehicles: bool(),
    vehicleTag: str(),
    objective: ref('sites'),
  }),
});

// K2: the star map's lanes between worlds. turns: how many system turns the jump takes;
// heavyOnly: only fleets of heavy ships (cruisers) may take it.
export const lanes = entryType('lanes', {
  from: req(ref('worlds')),
  to: req(ref('worlds')),
  turns: req(int(1, 9)),
  heavyOnly: bool(),
});

// K2: scenarios, presets of starting ownership: per world, the map preset to use instead of
// the world's own (whose cities and front say who holds it). One is the default.
export const scenarios = entryType('scenarios', {
  descriptionKey: key(),
  default: bool(),
  presets: obj({}, { open: true }),
});
