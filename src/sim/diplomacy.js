// War and peace, the minimum needed before full diplomacy (phase 12).
//
// Factions start at peace. Either side may declare war (declareWar); the
// pair then stays at war until peace exists (phase 12). Raiders are always
// at war with everyone. Units of factions at peace cannot attack each other
// and do not exert zone of control on each other.

import { currentFactionId } from './queries.js';

export const RAIDERS = 'raiders';

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function atWar(state, a, b) {
  if (a === b) return false;
  if (a === RAIDERS || b === RAIDERS) return true;
  return (state.wars ?? []).includes(pairKey(a, b));
}

export const declareWar = {
  validate(state, cmd) {
    if (cmd.faction !== currentFactionId(state)) return { code: 'notYourTurn', message: 'Wait for your turn' };
    if (!state.factions.some((f) => f.id === cmd.target && f.alive) || cmd.target === cmd.faction) return { code: 'unknownFaction', message: 'No such faction' };
    if (atWar(state, cmd.faction, cmd.target)) return { code: 'alreadyAtWar', message: 'Already at war' };
    return null;
  },
  apply(state, cmd, events) {
    state.wars = [...(state.wars ?? []), pairKey(cmd.faction, cmd.target)].sort();
    events.push({ type: 'warDeclared', faction: cmd.faction, target: cmd.target, global: true });
  },
};
