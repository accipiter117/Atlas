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

/** What happened in one delegated theatre this turn, from its events. */
export function theatreReport(events, world, stance, me) {
  const r = { world, stance, won: 0, lost: 0, killed: 0, fallen: 0, works: 0, captured: 0 };
  for (const e of events) {
    if (e.type === 'battle' && (e.attackerFaction === me || e.defenderFaction === me)) {
      const attacking = e.attackerFaction === me;
      if ((e.winner === 'attacker') === attacking) r.won += 1; else r.lost += 1;
    }
    if (e.type === 'unitKilled') { if (e.faction === me) r.fallen += 1; else r.killed += 1; }
    if (e.type === 'improvementBuilt' && (e.faction ?? me) === me) r.works += 1;
    if (e.type === 'cityCaptured' && e.faction === me) r.captured += 1;
  }
  return r;
}

/**
 * A set of AIs, one per faction id, able to play their seats.
 * memories: { factionId: memory } to carry on from (a loaded game, or the other side of a worker).
 * aiRules: an optional ruleset per faction for the AI's own thinking (challenger weights in tools/sim.mjs);
 * the game's rules always come from `ruleset`.
 */
export function createSeatRunner(ruleset, factionIds, { memories = {}, aiRules = {}, recordOff = false } = {}) {
  const ais = Object.fromEntries(factionIds.map((id) => [id, createAi(aiRules[id] ?? ruleset, id, { ...(memories[id] ?? {}), ...(recordOff ? { recordOff: true } : {}) })]));
  const delegates = {};
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
    /**
     * Delegated theatres (K5; docs/KILLZONE.md 7.2): play `factionId`'s units on every world it
     * has delegated, in that world's stance, with the theatre-only AI (no research, production,
     * diplomacy or fleets). Any battle that would wait for a battle screen is auto-resolved.
     * Called by the game screen just before the player's end of turn. Returns
     * { state, commands, events, refusals, report } where report is one entry per theatre:
     * { world, stance, won, lost, killed, fallen, works, captured, orders, why } (why: the
     * reason behind most of its orders, a journal reasonKey and params, or null).
     */
    delegate(start, factionId) {
      let state = start;
      const commands = [];
      const events = [];
      const refusals = [];
      const report = [];
      const mine = state.delegation?.[factionId] ?? {};
      const worlds = (state.worldOrder ?? []).filter((w) => mine[w]);
      if (!worlds.length || state.winner) return { state, commands, events, refusals, report };
      delegates[factionId] ??= createAi(ruleset, factionId, { theatreOnly: true });
      const ai = delegates[factionId];
      const apply = (cmd) => {
        const r = applyCommand(state, cmd, ruleset);
        if (r.ok) { state = r.state; commands.push(cmd); events.push(...r.events); }
        return r;
      };
      for (const w of worlds) {
        ai.memory.stance = mine[w];
        const before = ai.refusals.length;
        const from = events.length;
        const said = (ai.memory.journal ??= []).length;
        runAiTurn(ai, () => view(state, factionId, ruleset, { world: w }), (cmd) => {
          if (cmd.type === 'endTurn') return { ok: true, state, events: [] };
          const r = apply({ ...cmd, world: w });
          if (r.ok && state.pendingBattle) apply({ type: 'autoResolveBattle', faction: factionId, world: w });
          return r;
        });
        refusals.push(...ai.refusals.slice(before));
        // Why: the reason behind most of its orders here (the journal keeps the AI's reasons).
        const reasons = ai.memory.journal.slice(said).filter((j) => j.type !== 'endTurn');
        const counts = {};
        for (const j of reasons) counts[j.reasonKey] = (counts[j.reasonKey] ?? 0) + 1;
        const top = reasons.find((j) => counts[j.reasonKey] === Math.max(...Object.values(counts))) ?? null;
        report.push({ ...theatreReport(events.slice(from), w, mine[w], factionId), orders: reasons.length, why: top ? { reasonKey: top.reasonKey, params: top.params } : null });
        ai.memory.journal.length = said;
        if (state.winner) break;
      }
      return { state, commands, events, refusals, report };
    },
    memories() {
      return Object.fromEntries(Object.entries(ais).map(([id, ai]) => [id, portableMemory(ai.memory)]));
    },
    journals() {
      return Object.fromEntries(Object.entries(ais).map(([id, ai]) => [id, ai.memory.journal ?? []]));
    },
  };
}
