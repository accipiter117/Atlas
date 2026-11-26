// Governments and policy cards (section 3.7).
//
// A faction adopts a government (unlocked by civics) and slots policy cards
// into its military, economic, diplomatic and wildcard slots (any card fits a
// wildcard slot). Slots come from the government plus freePolicySlot effects
// (the palace gives one wildcard slot). Government and card effects work
// through the ordinary effects registry.
//
// Changes take a turn: the new government or cards are pending and become
// active at the start of the faction's next turn. Changing from one
// government to another also means anarchy until then: no government and no
// cards at all.

import { currentFactionId } from './queries.js';
import { knows } from './progression.js';
import { effectsFor, yieldHook } from './effects/index.js';

export const SLOT_KINDS = Object.freeze(['military', 'economic', 'diplomatic', 'wildcard']);
const emptyCards = () => Object.fromEntries(SLOT_KINDS.map((k) => [k, []]));

export function emptyGovernment() {
  return { id: null, policies: emptyCards(), anarchy: false };
}

const factionOf = (state, id) => state.factions.find((f) => f.id === id);

/** The faction's active government record. */
export function governmentOf(state, factionId) {
  return factionOf(state, factionId)?.government ?? emptyGovernment();
}

/** The layout that commands change: the pending one if there is one, else a copy of the active one. */
export function workingGovernment(state, factionId) {
  const f = factionOf(state, factionId);
  return f?.pendingGovernment ?? { id: f?.government?.id ?? null, policies: JSON.parse(JSON.stringify(f?.government?.policies ?? emptyCards())), anarchy: false };
}

/** Slot counts for a government id (default: the working one): its own slots plus freePolicySlot effects. */
export function slotsOf(state, ruleset, factionId, govId = workingGovernment(state, factionId).id) {
  const gov = govId ? ruleset.governments?.[govId] : null;
  const out = Object.fromEntries(SLOT_KINDS.map((k) => [k, gov?.slots?.[k] ?? 0]));
  if (!gov) return out;
  const extra = yieldHook('slots', state, ruleset, factionId, {}, effectsFor(state, ruleset, factionId).filter((e) => e.source?.kind !== 'policy'));
  for (const [k, n] of Object.entries(extra)) out[k] = (out[k] ?? 0) + n;
  return out;
}

export function governmentAvailable(state, ruleset, factionId, id) {
  const g = ruleset.governments?.[id];
  return Boolean(g) && knows(state, factionId, g.requires?.civic, 'civics');
}

export function policyAvailable(state, ruleset, factionId, id) {
  const p = ruleset.policies?.[id];
  if (!p) return false;
  if (!knows(state, factionId, p.requires?.civic, 'civics')) return false;
  if (p.obsoletedBy && knows(state, factionId, p.obsoletedBy, 'civics')) return false;
  return true;
}

/** Why `policy` cannot go into slot `kind`[index] of the working layout (a code), or null. */
export function policyProblem(state, ruleset, factionId, kind, index, policy) {
  if (!SLOT_KINDS.includes(kind)) return 'unknownSlot';
  const work = workingGovernment(state, factionId);
  if (!work.id) return 'noGovernment';
  const slots = slotsOf(state, ruleset, factionId, work.id);
  if (!Number.isInteger(index) || index < 0 || index >= (slots[kind] ?? 0)) return 'noSuchSlot';
  if (policy === null) return null;
  if (!policyAvailable(state, ruleset, factionId, policy)) return 'policyLocked';
  const p = ruleset.policies[policy];
  if (kind !== 'wildcard' && p.slot !== kind) return 'wrongSlot';
  for (const k of SLOT_KINDS) {
    if ((work.policies[k] ?? []).some((id, i) => id === policy && !(k === kind && i === index))) return 'alreadySlotted';
  }
  return null;
}

/** Fit cards into a government's slots: cards that no longer fit are dropped. */
function refit(state, ruleset, factionId, govId, policies) {
  const slots = slotsOf(state, ruleset, factionId, govId);
  const out = emptyCards();
  for (const k of SLOT_KINDS) {
    const kept = (policies?.[k] ?? []).filter((id) => id && policyAvailable(state, ruleset, factionId, id) && (k === 'wildcard' || ruleset.policies[id]?.slot === k));
    out[k] = kept.slice(0, slots[k] ?? 0);
  }
  return out;
}

/** Start of the faction's turn: pending changes become active; cards that no longer fit drop out. */
export function startGovernmentTurn(state, ruleset, factionId, events) {
  const f = factionOf(state, factionId);
  if (!f || !ruleset.governments) return;
  f.government ??= emptyGovernment();
  if (f.pendingGovernment) {
    const pend = f.pendingGovernment;
    const changed = pend.id !== f.government.id || f.government.anarchy;
    f.government = { id: pend.id, policies: refit(state, ruleset, factionId, pend.id, pend.policies), anarchy: false };
    f.pendingGovernment = null;
    if (changed) events.push({ type: 'governmentAdopted', faction: factionId, government: pend.id, global: true });
    events.push({ type: 'policiesActive', faction: factionId });
  } else if (f.government.id) {
    f.government.policies = refit(state, ruleset, factionId, f.government.id, f.government.policies);
  }
}

const refuse = (code, message) => ({ code, message });

export const setGovernment = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    if (!ruleset.governments?.[cmd.government]) return refuse('unknownGovernment', 'No such government');
    if (!governmentAvailable(state, ruleset, cmd.faction, cmd.government)) return refuse('governmentLocked', 'That government needs a civic first');
    if (workingGovernment(state, cmd.faction).id === cmd.government) return refuse('alreadyGovernment', 'That is already your government');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const f = factionOf(state, cmd.faction);
    const work = workingGovernment(state, cmd.faction);
    f.pendingGovernment = { id: cmd.government, policies: refit(state, ruleset, cmd.faction, cmd.government, work.policies), anarchy: false };
    // Leaving one government for another: anarchy (no government, no cards) until next turn.
    if (f.government?.id) f.government = { ...emptyGovernment(), anarchy: true };
    events.push({ type: 'governmentChosen', faction: cmd.faction, government: cmd.government });
  },
};

export const setPolicy = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const problem = policyProblem(state, ruleset, cmd.faction, cmd.slot, cmd.index, cmd.policy ?? null);
    return problem ? refuse(problem, 'That card cannot go in that slot') : null;
  },
  apply(state, cmd, events) {
    const f = factionOf(state, cmd.faction);
    const work = workingGovernment(state, cmd.faction);
    const list = work.policies[cmd.slot] ?? [];
    while (list.length <= cmd.index) list.push(null);
    list[cmd.index] = cmd.policy ?? null;
    work.policies[cmd.slot] = list;
    f.pendingGovernment = work;
    events.push({ type: 'policyChosen', faction: cmd.faction, slot: cmd.slot, index: cmd.index, policy: cmd.policy ?? null });
  },
};
