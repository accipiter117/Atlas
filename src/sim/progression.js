// Progression (section 3.7): techs now, civics in phase 11, through the same
// code (`tree` is the content type: 'techs' or 'civics').
//
// - Cost = data cost x the era's cost multiplier x the game speed multiplier.
// - Science fills the current item; overflow carries on to the next in the
//   queue. Science earned with nothing chosen waits in the faction's stock
//   and is spent on the next choice.
// - Boosts: each item may name a trigger in data, for example
//   { "trigger": "improvementBuilt", "id": "quarry", "count": 1 }. When the
//   faction's deeds meet it, boostShare (40%) of the cost is paid at once.
//   Triggers: improvementBuilt, unitBuilt, buildingBuilt, citiesFounded, unitKilled.
// - A faction's era is the latest era in which it knows at least
//   eraTechShare (half) of the techs.

import { currentFactionId } from './queries.js';

const FIELD = { techs: 'research', civics: 'civicResearch' };

export function emptyResearch() {
  return { current: null, queue: [], progress: {}, known: [], boosted: [], counters: {} };
}

export function researchOf(faction, tree = 'techs') {
  faction[FIELD[tree]] ??= emptyResearch();
  return faction[FIELD[tree]];
}

export function knows(state, factionId, techId, tree = 'techs') {
  if (!techId) return true;
  const f = state.factions?.find((x) => x.id === factionId);
  if (!f) return factionId === 'raiders';
  return (f[FIELD[tree]]?.known ?? []).includes(techId);
}

export function speedMultiplier(state, ruleset) {
  return ruleset.tuning?.speeds?.[state.setup?.speed ?? 'standard'] ?? 1;
}

export function costOf(state, ruleset, id, tree = 'techs') {
  const item = ruleset[tree]?.[id];
  if (!item) return Infinity;
  const era = ruleset.eras?.[item.era];
  return Math.max(1, Math.round(item.cost * (era?.costMultiplier ?? 1) * speedMultiplier(state, ruleset)));
}

/** Items a faction could research now: not known, every prerequisite known. */
export function available(state, ruleset, factionId, tree = 'techs') {
  const f = state.factions.find((x) => x.id === factionId);
  const r = researchOf(f, tree);
  return Object.values(ruleset[tree] ?? {}).filter((t) => !r.known.includes(t.id) && (t.requires ?? []).every((q) => r.known.includes(q))).map((t) => t.id);
}

/** Every unknown item needed to reach `id`, prerequisites first (including id). */
export function pathTo(state, ruleset, factionId, id, tree = 'techs') {
  const f = state.factions.find((x) => x.id === factionId);
  const known = new Set(researchOf(f, tree).known);
  const out = [];
  const visit = (t) => {
    if (known.has(t) || out.includes(t)) return;
    for (const q of ruleset[tree][t]?.requires ?? []) visit(q);
    out.push(t);
  };
  visit(id);
  return out;
}

/** The faction's era (an era id). */
export function eraOf(state, ruleset, factionId) {
  const f = state.factions.find((x) => x.id === factionId);
  const known = new Set(researchOf(f).known);
  const share = ruleset.tuning?.progression?.eraTechShare ?? 0.5;
  const eras = Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index);
  let era = eras[0]?.id ?? null;
  for (const e of eras) {
    const all = Object.values(ruleset.techs ?? {}).filter((t) => t.era === e.id);
    if (!all.length) continue;
    if (all.filter((t) => known.has(t.id)).length / all.length >= share) era = e.id;
  }
  return era;
}

function learn(state, ruleset, f, id, tree, events) {
  const r = researchOf(f, tree);
  if (r.known.includes(id)) return;
  r.known.push(id);
  delete r.progress[id];
  r.queue = r.queue.filter((q) => q !== id);
  if (r.current === id) r.current = null;
  events.push({ type: tree === 'techs' ? 'techLearned' : 'civicLearned', faction: f.id, item: id });
  for (const res of Object.values(ruleset.resources ?? {})) {
    if (tree === 'techs' && res.revealedBy === id) events.push({ type: 'resourceRevealed', faction: f.id, resource: res.id });
  }
}

/** Start of turn: put this turn's science into research (working copy). */
export function addResearch(state, ruleset, factionId, amount, events, tree = 'techs') {
  const f = state.factions.find((x) => x.id === factionId);
  const r = researchOf(f, tree);
  const stock = tree === 'techs' ? 'science' : 'culture';
  let pool = amount + (f.stocks?.[stock] ?? 0);
  if (f.stocks) f.stocks[stock] = 0;
  for (let guard = 0; guard < 20; guard += 1) {
    if (!r.current) r.current = r.queue.find((q) => !r.known.includes(q)) ?? null;
    if (!r.current) break;
    const cost = costOf(state, ruleset, r.current, tree);
    const have = r.progress[r.current] ?? 0;
    const need = cost - have;
    if (pool < need) { r.progress[r.current] = have + pool; pool = 0; break; }
    pool -= need;
    learn(state, ruleset, f, r.current, tree, events);
  }
  // Nothing chosen: keep it for the next choice.
  if (pool > 0 && f.stocks) f.stocks[stock] += pool;
}

/** Count a faction's deeds from events and pay any boosts now earned (working copy). */
export function applyBoosts(state, ruleset, events, tree = 'techs') {
  for (const e of events) {
    const fid = e.type === 'unitKilled' ? e.by : e.faction;
    const f = state.factions?.find((x) => x.id === fid);
    if (!f) continue;
    const c = researchOf(f, tree).counters;
    const bump = (key) => { c[key] = (c[key] ?? 0) + 1; };
    if (e.type === 'improvementBuilt') bump(`improvementBuilt:${e.improvement}`);
    if (e.type === 'unitBuilt') bump(`unitBuilt:${e.unitType}`);
    if (e.type === 'buildingBuilt' || e.type === 'wonderCompleted') bump(`buildingBuilt:${e.building}`);
    if (e.type === 'cityFounded') bump('citiesFounded');
    if (e.type === 'unitKilled') bump('unitKilled');
  }
  const out = [];
  for (const f of state.factions ?? []) {
    const r = researchOf(f, tree);
    for (const item of Object.values(ruleset[tree] ?? {})) {
      const b = item.boost;
      if (!b || r.known.includes(item.id) || r.boosted.includes(item.id)) continue;
      const key = b.id ? `${b.trigger}:${b.id}` : b.trigger;
      if ((r.counters[key] ?? 0) < (b.count ?? 1)) continue;
      r.boosted.push(item.id);
      const share = ruleset.tuning?.progression?.boostShare ?? 0.4;
      r.progress[item.id] = (r.progress[item.id] ?? 0) + Math.round(costOf(state, ruleset, item.id, tree) * share);
      out.push({ type: 'boost', faction: f.id, item: item.id, tree });
    }
  }
  events.push(...out);
}

/** Give a faction every tech of the eras before `eraId` (lock-era, later start eras). */
export function grantErasBefore(state, ruleset, factionId, eraId) {
  const era = ruleset.eras?.[eraId];
  if (!era) return;
  const f = state.factions.find((x) => x.id === factionId);
  const r = researchOf(f);
  for (const t of Object.values(ruleset.techs ?? {})) {
    if ((ruleset.eras[t.era]?.index ?? 0) < era.index && !r.known.includes(t.id)) r.known.push(t.id);
  }
}

const refuse = (code, message) => ({ code, message });

export const setResearch = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    if (!available(state, ruleset, cmd.faction, cmd.tree ?? 'techs').includes(cmd.item)) return refuse('notAvailable', 'That cannot be researched yet');
    return null;
  },
  apply(state, cmd) {
    const r = researchOf(state.factions.find((f) => f.id === cmd.faction), cmd.tree ?? 'techs');
    r.current = cmd.item;
    r.queue = r.queue.filter((q) => q !== cmd.item);
  },
};

export const queueResearch = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const tree = cmd.tree ?? 'techs';
    if (!ruleset[tree]?.[cmd.item] || knows(state, cmd.faction, cmd.item, tree)) return refuse('notAvailable', 'That cannot be queued');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const tree = cmd.tree ?? 'techs';
    const r = researchOf(state.factions.find((f) => f.id === cmd.faction), tree);
    for (const id of pathTo(state, ruleset, cmd.faction, cmd.item, tree)) if (!r.queue.includes(id) && r.current !== id) r.queue.push(id);
    if (!r.current) r.current = r.queue.shift() ?? null;
  },
};
