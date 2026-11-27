// Creating a new game state.
//
// State is plain JSON data: no classes, no functions, no references between
// objects. That keeps it easy to save, copy, hash and send over the network
// later (online play replays the same commands on every device).

import { normaliseSeed, fork } from '../core/rng.js';
import { hashValue } from '../core/hash.js';
import { clone, deepFreeze } from '../core/clone.js';
import { generateMap } from './mapgen.js';
import { placeStartingUnits, createUnit } from './units.js';
import { frontlineOn, buildPresetMap, setUpFrontline, sideOf } from './frontline.js';
import { foundCity, assignCitizens } from './cities.js';
import { emptyResearch, grantErasBefore } from './progression.js';
import { emptyGovernment } from './government.js';
import { emptyDiplomacy, setUpTeams } from './diplomacy.js';
import { emptyReligion } from './religion.js';
import { emptyTrade } from './trade.js';
import { emptyEspionage } from './espionage.js';
import { emptyEvents } from './events.js';
import { updateAllVisibility, EXPLORED } from './visibility.js';
import { worldsOn, park, unpark } from './worlds.js';
import { spaceOn, setUpSpace } from './space.js';

export const STATE_VERSION = 1;
export const ENGINE_VERSION = '0.1.0';

export class SetupError extends Error {}

function checkSetup(setup) {
  if (!setup || typeof setup !== 'object') throw new SetupError('Setup must be an object');
  if (!Number.isInteger(setup.seed)) throw new SetupError('Setup needs an integer seed');
  const players = setup.players;
  if (!Array.isArray(players) || players.length < 1) throw new SetupError('Setup needs at least one player');
  players.forEach((p, i) => {
    if (!p || (p.kind !== 'human' && p.kind !== 'ai')) {
      throw new SetupError(`Player ${i} needs kind "human" or "ai"`);
    }
  });
}

/**
 * Start a new game.
 *
 * @param {object} ruleset  the merged, frozen ruleset (an empty object is fine until phase 2)
 * @param {object} setup    match options (section 6); needs seed and players at minimum
 * @returns {object} the starting state, ready for the first seat to act
 */
export function createGame(ruleset, setup) {
  checkSetup(setup);
  const frozenSetup = deepFreeze(clone(setup));

  const factions = setup.players.map((p, i) => ({
    id: `f${i}`,
    name: typeof p.name === 'string' ? p.name : `Player ${i + 1}`,
    kind: p.kind,
    alive: true,
  }));

  const state = {
    stateVersion: STATE_VERSION,
    engineVersion: ENGINE_VERSION,
    setup: frozenSetup,
    rulesetHash: hashValue(ruleset ?? {}),
    turn: 1,
    rng: normaliseSeed(setup.seed),
    nextId: 1,
    factions,
    seatOrder: [],
    seatIndex: 0,
    commandCount: 0,
  };

  // Seat order is random per game, from the seed, then fixed (section 3.14).
  // A named fork keeps the main dice stream untouched.
  state.seatOrder = fork(state, 'seats').shuffle(factions.map((f) => f.id));

  // Each player plays a faction from the ruleset: their choice, or one drawn
  // from the seed (no repeats until every faction is taken).
  const civs = Object.keys(ruleset?.factions ?? {});
  if (civs.length) {
    const chosen = new Set(setup.players.map((p) => p.faction).filter(Boolean));
    let pool = fork(state, 'civs').shuffle(civs.filter((c) => !chosen.has(c)));
    factions.forEach((f, i) => {
      if (setup.players[i].faction && ruleset.factions[setup.players[i].faction]) { f.civ = setup.players[i].faction; return; }
      if (!pool.length) pool = fork(state, `civs${i}`).shuffle(civs);
      f.civ = pool.shift();
    });
  }
  for (const f of factions) {
    f.stocks = { gold: ruleset?.tuning?.economy?.startingGold ?? 0, science: 0, culture: 0, faith: 0 };
    if (ruleset?.civics) f.civicResearch = emptyResearch();
    if (ruleset?.techs) {
      f.research = emptyResearch();
      const before = ruleset.tuning?.start?.grantErasBefore;
      if (before) grantErasBefore({ factions }, ruleset, f.id, before);
      // Setup "starting era": every tech of the eras before it is known from the start.
      if (setup.startEra && ruleset.eras?.[setup.startEra]) grantErasBefore({ factions }, ruleset, f.id, setup.startEra);
    }
    if (ruleset?.governments) { f.government = emptyGovernment(); f.pendingGovernment = null; }
  }
  state.wars = [];
  if (ruleset?.diplomacy) { state.diplomacy = emptyDiplomacy(); setUpTeams(state); }
  if (ruleset?.beliefs) state.religion = emptyReligion();
  if (ruleset?.trade) state.trade = emptyTrade();
  if (ruleset?.espionage) state.espionage = emptyEspionage();
  if (ruleset?.events) state.events = emptyEvents();

  // The world, when the setup asks for one and the ruleset can build it.
  // A front-line game (phase 19) is fought on a fixed map from mapPresets.json.
  // A ruleset with several worlds (K1a, src/sim/worlds.js) builds each in turn, parks
  // all but the starting one under state.worlds, and starts on that one.
  if (setup.map && worldsOn(ruleset)) {
    const list = Object.values(ruleset.worlds).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    // K2: a scenario may give a world another preset (who holds what at the start).
    const scenarios = Object.values(ruleset.scenarios ?? {});
    const scenario = ruleset.scenarios?.[setup.scenario] ?? scenarios.find((x) => x.default) ?? scenarios[0] ?? null;
    const start = (list.find((w) => w.start) ?? list[0]).id;
    state.worlds = {};
    state.worldOrder = list.map((w) => w.id);
    state.wondersBuilt = {};
    for (const w of list) {
      state.world = w.id;
      const chosen = scenario?.presets?.[w.id] ?? w.map.preset;
      const preset = chosen && frontlineOn(ruleset) && ruleset.mapPresets?.[chosen] ? chosen : null;
      buildWorld(state, ruleset, setup, factions, { preset, size: w.map.size, type: w.map.type, units: w.id === start });
      park(state);
    }
    unpark(state, start);
    if (spaceOn(ruleset)) setUpSpace(state, ruleset, sideOf);
    if (scenario) state.scenario = scenario.id;
    return state;
  }
  const preset = frontlineOn(ruleset) && setup.map && ruleset.mapPresets ? (ruleset.mapPresets[setup.map.preset] ? setup.map.preset : Object.keys(ruleset.mapPresets)[0]) : null;
  if (setup.map && (ruleset?.mapSizes || preset)) {
    state.wondersBuilt = {};
    buildWorld(state, ruleset, setup, factions, { preset, units: true });
  }
  return state;
}

/**
 * Build one world's map, borders, units and cities at the top of the state (the active
 * world). preset: a front-line map; otherwise generated from the setup's map options,
 * with size and type overriding them; units: place the starting units here.
 */
function buildWorld(state, ruleset, setup, factions, { preset = null, size, type, units = true }) {
  const mapOpts = { ...setup.map, ...(size ? { size } : {}), ...(type ? { type } : {}), seed: setup.seed, factions: factions.length };
  // Each extra world draws its own map from a seed of its own, so worlds never repeat.
  if (state.world && state.worldOrder?.indexOf(state.world) > 0) mapOpts.seed = (setup.seed + 7919 * state.worldOrder.indexOf(state.world)) | 0;
  state.map = preset ? buildPresetMap(ruleset, preset) : generateMap(ruleset, mapOpts);
  state.map.road = new Array(state.map.width * state.map.height).fill(0);
  state.map.improvementIds = Object.keys(ruleset.improvements ?? {});
  state.map.improvement = new Array(state.map.width * state.map.height).fill(-1);
  state.units = {};
  state.cities = {};
  state.owner = new Array(state.map.width * state.map.height).fill(null);
  if (preset) setUpFrontline(state, ruleset, preset, { foundCity, createUnit, assignCitizens });
  else if (units) placeStartingUnits(state, ruleset);
  updateAllVisibility(state, ruleset);
  // A front-line war is fought on a known map: both sides start with every tile explored.
  if (preset && state.fog) for (const fog of Object.values(state.fog)) for (let i = 0; i < fog.length; i += 1) if (fog[i] < EXPLORED) fog[i] = EXPLORED;
}
