// applyCommand: the only way anything changes in a game.
//
// The player's clicks and the AI's choices both become command objects, such
// as { type: 'endTurn', faction: 'f0' }. Because every change goes through
// here, a game can be rebuilt exactly from its seed and its list of commands,
// which is what saves, replays and online play rely on.
//
// A refused command never changes anything: the input state is not touched,
// and the caller gets { ok: false, error } with a reason to show the player.

import { clone } from '../core/clone.js';
import { endTurn } from './turn.js';
import { moveUnit, fortify, skip, sleep, wake, disband, buildImprovement } from './unitCommands.js';
import { setResearch, queueResearch, applyBoosts } from './progression.js';
import { declareWar, denounce, proposeDeal, answerDeal, noteDiplomacyEvents } from './diplomacy.js';
import { setGovernment, setPolicy } from './government.js';
import { choosePantheon, foundReligion, buyWithFaith as faithBuy, spreadReligion } from './religion.js';
import { canBuild, completeItem } from './cities.js';
import { startTradeRoute } from './trade.js';
import { assignSpy, startMission } from './espionage.js';

// Buying a building with faith finishes it like any other, so it borrows the city rules.
const buyWithFaith = {
  validate: (s, c, r) => faithBuy.validate(s, c, r, { canBuild }),
  apply: (s, c, e, r) => faithBuy.apply(s, c, e, r, { completeItem }),
};
import { attack, cityAttack, resolveBattle, autoResolveBattle, captureChoice, promote } from './combatCommands.js';
import { foundCity, setProduction, queueProduction, buyItem, setFocus, lockTile, unlockTile, buyTile } from './cityCommands.js';

/** Every command the sim understands, by type. Each has validate (returns an error or null) and apply. */
export const COMMANDS = Object.freeze({
  endTurn,
  moveUnit,
  fortify,
  skip,
  sleep,
  wake,
  disband,
  buildImprovement,
  foundCity,
  setProduction,
  queueProduction,
  buyItem,
  setFocus,
  lockTile,
  unlockTile,
  buyTile,
  attack,
  cityAttack,
  resolveBattle,
  autoResolveBattle,
  captureChoice,
  promote,
  setResearch,
  queueResearch,
  declareWar,
  denounce,
  proposeDeal,
  answerDeal,
  setGovernment,
  setPolicy,
  choosePantheon,
  foundReligion,
  buyWithFaith,
  spreadReligion,
  startTradeRoute,
  assignSpy,
  startMission,
});

const EMPTY = Object.freeze({});

// Map layers that never change once the map is made. A new state shares them
// with the old one instead of copying them for every command (phase 10 speed
// work): nothing in the rules may write to them after map generation.
const FIXED_MAP_LAYERS = new Set(['terrain', 'hills', 'feature', 'resource', 'river', 'rivers', 'starts', 'terrainIds', 'featureIds', 'resourceIds', 'improvementIds']);

/** A working copy of the state for one command: everything copied except the fixed map layers. */
export function cloneState(state) {
  if (!state.map) return clone(state);
  const { map, ...rest } = state;
  const out = clone(rest);
  const m = {};
  for (const key of Object.keys(map)) m[key] = FIXED_MAP_LAYERS.has(key) ? map[key] : clone(map[key]);
  out.map = m;
  return out;
}

function refuse(code, message) {
  return { ok: false, error: { code, message } };
}

/**
 * Apply one command to a state. The ruleset is the merged, frozen ruleset the
 * game was created with (state.rulesetHash records which one); games with no
 * map can leave it out.
 *
 * @returns {{ok: true, state: object, events: object[]} | {ok: false, error: {code: string, message: string}}}
 */
export function applyCommand(state, cmd, ruleset = EMPTY) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return refuse('badCommand', 'A command must be an object');
  if (typeof cmd.type !== 'string') return refuse('badCommand', 'A command needs a type');
  if (!Object.hasOwn(COMMANDS, cmd.type)) return refuse('unknownCommand', `Unknown command "${cmd.type}"`);

  // While a battle waits for its screen, only its result may be sent; while a
  // captured city waits for Keep or Raze, its new owner must choose first.
  if (state.pendingBattle && cmd.type !== 'resolveBattle' && cmd.type !== 'autoResolveBattle') return refuse('battlePending', 'Finish the battle first');
  if (state.pendingCapture && cmd.type !== 'captureChoice' && state.pendingCapture.faction === cmd.faction) return refuse('capturePending', 'Choose whether to keep or raze the captured city first');

  if (state.winner) return refuse('gameOver', 'The game is over');

  const handler = COMMANDS[cmd.type];
  const problem = handler.validate(state, cmd, ruleset);
  if (problem) return { ok: false, error: problem };

  const next = cloneState(state);
  const events = [];
  handler.apply(next, cmd, events, ruleset);
  if (ruleset.techs) applyBoosts(next, ruleset, events);
  if (ruleset.civics) applyBoosts(next, ruleset, events, 'civics');
  if (ruleset.diplomacy) noteDiplomacyEvents(next, ruleset, events);
  next.commandCount += 1;
  return { ok: true, state: next, events };
}
