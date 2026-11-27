// Playing the computer seats (phase 10). One code path for every place the
// AI runs: the browser's Web Worker (src/aiWorker.js), the page itself when a
// Worker is not available, the test harness and the tools. Because the same
// function runs everywhere, a game plays out identically whichever is used;
// a test proves it by comparing fingerprints.

import { applyCommand, view, currentFactionId } from '../sim/index.js';
import { createAi } from './controller.js';
import { runAiTurn } from './index.js';

/** The part of an AI's memory worth keeping between turns (the turn's cached context holds functions). */
export function portableMemory(memory) {
  const { ctx: _ctx, ...rest } = memory ?? {};
  return rest;
}

/**
 * A set of AIs, one per faction id, able to play their seats.
 * memories: { factionId: memory } to carry on from (a loaded game, or the other side of a worker).
 * aiRules: an optional ruleset per faction for the AI's own thinking (challenger weights in tools/sim.mjs);
 * the game's rules always come from `ruleset`.
 */
export function createSeatRunner(ruleset, factionIds, { memories = {}, aiRules = {}, recordOff = false } = {}) {
  const ais = Object.fromEntries(factionIds.map((id) => [id, createAi(aiRules[id] ?? ruleset, id, { ...(memories[id] ?? {}), ...(recordOff ? { recordOff: true } : {}) })]));
  return {
    ais,
    /**
     * Play seats in order until it is `stopAt`'s turn (or a seat with no AI), the game
     * is won, or `maxSeats` seats have played.
     * Returns { state, commands, events, refusals }.
     */
    play(start, { stopAt = null, maxSeats = 64 } = {}) {
      let state = start;
      const commands = [];
      const events = [];
      const refusals = [];
      const apply = (cmd) => {
        const r = applyCommand(state, cmd, ruleset);
        if (r.ok) { state = r.state; commands.push(cmd); events.push(...r.events); }
        return r;
      };
      for (let n = 0; n < maxSeats && !state.winner; n += 1) {
        const me = currentFactionId(state);
        if (me === stopAt || !ais[me]) break;
        const before = ais[me].refusals.length;
        if (state.worlds) {
          // Several worlds (K1b): the seat plays each world in turn, its orders tagged with that
          // world; only the last world's end of turn really ends it.
          const order = state.worldOrder;
          for (const w of order) {
            const last = w === order[order.length - 1];
            runAiTurn(ais[me], () => view(state, me, ruleset, { world: w }), (cmd) => {
              if (cmd.type === 'endTurn') return last ? apply(cmd) : { ok: true, state, events: [] };
              return apply({ ...cmd, world: w });
            });
            if (state.winner || currentFactionId(state) !== me) break;
          }
        } else runAiTurn(ais[me], () => view(state, me, ruleset), apply);
        refusals.push(...ais[me].refusals.slice(before));
        if (!state.winner && currentFactionId(state) === me) apply({ type: 'endTurn', faction: me });
      }
      return { state, commands, events, refusals };
    },
    memories() {
      return Object.fromEntries(Object.entries(ais).map(([id, ai]) => [id, portableMemory(ai.memory)]));
    },
    journals() {
      return Object.fromEntries(Object.entries(ais).map(([id, ai]) => [id, ai.memory.journal ?? []]));
    },
  };
}
