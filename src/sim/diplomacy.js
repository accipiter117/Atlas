// Diplomacy (section 3.11).
//
// Relations between two factions: unmet, war, peace, open borders, defensive
// pact or alliance (each treaty includes the ones below it). War lives in
// state.wars, as before; everything else in state.diplomacy:
//   met          pairs that have seen each other
//   treaties     { "a|b": { kind, until, team } } open borders and up
//   peaceUntil   { "a|b": turn } no new war before this turn (peace treaties
//                last at least tuning.diplomacy.peaceMinTurns)
//   modifiers    { "holder>about": [{ id, amount, turn }] } remembered deeds,
//                which fade by decayAmount every decayEveryTurns rounds
//   denounced    { "by>target": turn }
//   weariness    { faction: points } war weariness, which costs amenities
//   counters     { faction: { razed, warsDeclared, surprise } }
//   deals        pending proposals; resources and goldPerTurn running deals
//
// Opinion is what one faction thinks of another: the remembered modifiers,
// live ones (at war, allies, close borders...) and the leader's agenda, each
// with a reason anyone can read. The AI answers deals with evaluateDeal, and
// the same function gives the screen its "likely answer".
//
// Raiders are always at war with everyone and take no part in diplomacy.

import { currentFactionId } from './queries.js';
import { tileHex } from './map.js';
import { hexDistance } from '../core/hex.js';

export const RAIDERS = 'raiders';
export const TREATY_LEVELS = Object.freeze(['openBorders', 'defensivePact', 'alliance']);

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const tun = (ruleset) => ruleset?.tuning?.diplomacy ?? {};
const factionOf = (state, id) => state.factions.find((f) => f.id === id);

export function atWar(state, a, b) {
  if (a === b) return false;
  if (a === RAIDERS || b === RAIDERS) return true;
  return (state.wars ?? []).includes(pairKey(a, b));
}

// ---------- State ----------

export function emptyDiplomacy() {
  return { met: [], treaties: {}, peaceUntil: {}, warSince: {}, modifiers: {}, denounced: {}, weariness: {}, counters: {}, deals: [], resources: [], goldPerTurn: [], nextDeal: 1 };
}

const dip = (state) => (state.diplomacy ??= emptyDiplomacy());

/** Teams from the setup: same team means met and a permanent alliance. */
export function setUpTeams(state) {
  const d = dip(state);
  const team = (f, i) => state.setup?.players?.[i]?.team ?? null;
  state.factions.forEach((a, i) => state.factions.forEach((b, j) => {
    if (j <= i || team(a, i) === null || team(a, i) !== team(b, j)) return;
    const k = pairKey(a.id, b.id);
    if (!d.met.includes(k)) d.met.push(k);
    d.treaties[k] = { kind: 'alliance', until: null, team: true };
  }));
  d.met.sort();
}

export function teamOf(state, factionId) {
  const i = state.factions.findIndex((f) => f.id === factionId);
  return i >= 0 ? state.setup?.players?.[i]?.team ?? null : null;
}

export const teammates = (state, a, b) => a !== b && teamOf(state, a) !== null && teamOf(state, a) === teamOf(state, b);

export function hasMet(state, a, b) {
  if (a === b) return true;
  return (state.diplomacy?.met ?? []).includes(pairKey(a, b));
}

export function treatyOf(state, a, b) {
  return state.diplomacy?.treaties?.[pairKey(a, b)] ?? null;
}

/** unmet, war, peace, openBorders, defensivePact or alliance. */
export function statusOf(state, a, b) {
  if (atWar(state, a, b)) return 'war';
  if (!hasMet(state, a, b)) return 'unmet';
  return treatyOf(state, a, b)?.kind ?? 'peace';
}

const levelOf = (kind) => TREATY_LEVELS.indexOf(kind);
/** Does the pair have at least this treaty? */
export function hasTreaty(state, a, b, kind) {
  const t = treatyOf(state, a, b);
  return Boolean(t) && levelOf(t.kind) >= levelOf(kind);
}

/** Factions that are friends of `f` (defensive pact or better). */
export function friendsOf(state, f) {
  return state.factions.filter((x) => x.id !== f && x.alive && hasTreaty(state, f, x.id, 'defensivePact')).map((x) => x.id);
}

// ---------- Opinion ----------

function addModifier(state, ruleset, holder, about, id, times = 1) {
  if (holder === about || holder === RAIDERS || about === RAIDERS || !ruleset?.diplomacy?.[id]) return;
  const d = dip(state);
  const key = `${holder}>${about}`;
  const list = (d.modifiers[key] ??= []);
  const def = ruleset.diplomacy[id];
  const cap = tun(ruleset).modifierCap ?? 30;
  const existing = list.find((m) => m.id === id);
  if (existing) {
    existing.amount = Math.max(-cap, Math.min(cap, existing.amount + def.amount * times));
    existing.turn = state.turn;
  } else {
    list.push({ id, amount: Math.max(-cap, Math.min(cap, def.amount * times)), turn: state.turn });
  }
}

function militaryPower(state, ruleset, f) {
  let p = 0;
  for (const u of Object.values(state.units ?? {})) {
    if (u.faction !== f) continue;
    const def = ruleset.units?.[u.type];
    if (!def || ruleset.unitClasses?.[def.class]?.civilian) continue;
    p += Math.max(def.strength ?? 0, def.rangedStrength ?? 0) * ((u.hp ?? 100) / 100);
  }
  return p;
}

const citiesOfF = (state, f) => Object.values(state.cities ?? {}).filter((c) => c.faction === f);

function closest(state, a, b) {
  const map = state.map;
  let best = Infinity;
  for (const x of citiesOfF(state, a)) for (const y of citiesOfF(state, b)) best = Math.min(best, hexDistance(tileHex(map, x.tile), tileHex(map, y.tile)));
  return best;
}

/** The leader's agenda: 1 (likes what `about` does), -1 (hates it) or 0. */
export function agendaVerdict(state, ruleset, holder, about) {
  const civ = factionOf(state, holder)?.civ;
  const leader = ruleset.leaders?.[ruleset.factions?.[civ]?.leaders?.[0]];
  const ag = leader?.agenda;
  if (!ag) return { verdict: 0, agenda: null };
  const t = tun(ruleset).agenda ?? {};
  const living = state.factions.filter((f) => f.alive);
  const avgCities = living.reduce((n, f) => n + citiesOfF(state, f.id).length, 0) / Math.max(1, living.length);
  const counters = state.diplomacy?.counters?.[about] ?? {};
  const friends = state.factions.filter((x) => x.id !== about && x.alive && hasTreaty(state, about, x.id, 'openBorders')).length;
  const seaUnits = Object.values(state.units ?? {}).filter((u) => u.faction === about && (ruleset.units[u.type]?.domain ?? ruleset.unitClasses?.[ruleset.units[u.type]?.class]?.domain) === 'sea').length;
  const ownTiles = new Set();
  (state.owner ?? []).forEach((o, i) => { if (o !== null && state.cities[o]?.faction === holder) ownTiles.add(i); });
  const invaders = Object.values(state.units ?? {}).filter((u) => u.faction === about && ownTiles.has(u.tile) && !ruleset.unitClasses?.[ruleset.units[u.type]?.class]?.civilian).length;
  const checks = {
    largeEmpire: () => citiesOfF(state, about).length >= avgCities * (t.largeEmpireRatio ?? 1),
    fewCities: () => citiesOfF(state, about).length < avgCities * (t.fewCitiesRatio ?? 0.6),
    manyFriends: () => friends >= (t.manyFriends ?? 2),
    isolation: () => friends === 0 && state.turn > 30,
    wonders: () => Object.values(state.wondersBuilt ?? {}).some((cityId) => state.cities[cityId]?.faction === about),
    razing: () => (counters.razed ?? 0) > 0,
    keptPromises: () => (counters.warsDeclared ?? 0) === 0,
    surpriseWar: () => (counters.surprise ?? 0) > 0,
    navy: () => seaUnits >= (t.navyUnits ?? 2),
    noNavy: () => seaUnits === 0 && state.turn > 40,
    largeArmy: () => militaryPower(state, ruleset, about) >= militaryPower(state, ruleset, holder) * (t.largeArmyRatio ?? 1),
    weakArmy: () => militaryPower(state, ruleset, about) < militaryPower(state, ruleset, holder) * (t.weakArmyRatio ?? 0.6),
    peace: () => !atWar(state, holder, about),
    invaders: () => invaders >= (t.invaderUnits ?? 2),
    distance: () => closest(state, holder, about) > (t.settledNearDistance ?? 6),
    settledNear: () => closest(state, holder, about) <= (t.settledNearDistance ?? 6),
  };
  if (checks[ag.hates]?.()) return { verdict: -1, agenda: ag, weight: ag.weight };
  if (checks[ag.likes]?.()) return { verdict: 1, agenda: ag, weight: ag.weight };
  return { verdict: 0, agenda: ag, weight: ag.weight };
}

/** What `holder` thinks of `about`: { total, reasons: [{ id, reasonKey, amount, params }] }. */
export function opinionOf(state, ruleset, holder, about) {
  const reasons = [];
  if (!ruleset?.diplomacy || holder === about) return { total: 0, reasons };
  const D = ruleset.diplomacy;
  const add = (id, amount, params = {}) => { if (amount) reasons.push({ id, reasonKey: D[id]?.reasonKey ?? id, amount, params }); };
  for (const m of state.diplomacy?.modifiers?.[`${holder}>${about}`] ?? []) add(m.id, Math.round(m.amount));
  if (teammates(state, holder, about)) add('teammates', D.teammates?.amount ?? 20);
  if (atWar(state, holder, about)) add('atWar', D.atWar?.amount ?? -10);
  else {
    const t = treatyOf(state, holder, about);
    if (t?.kind === 'alliance' && !t.team) add('alliance', D.alliance?.amount ?? 10);
    else if (t?.kind === 'defensivePact') add('defensivePact', D.defensivePact?.amount ?? 5);
    else if (t?.kind === 'openBorders') add('openBorders', D.openBorders?.amount ?? 2);
    const shared = state.factions.some((x) => x.alive && x.id !== holder && x.id !== about && atWar(state, holder, x.id) && atWar(state, about, x.id));
    if (shared) add('sharedEnemy', D.sharedEnemy?.amount ?? 4);
  }
  if (state.map && closest(state, holder, about) <= (tun(ruleset).closeBordersDistance ?? 5)) add('closeBorders', D.closeBorders?.amount ?? -4);
  const ag = agendaVerdict(state, ruleset, holder, about);
  if (ag.verdict > 0) add('agendaLike', ag.weight ?? D.agendaLike?.amount ?? 6, { agendaKey: ag.agenda.nameKey });
  if (ag.verdict < 0) add('agendaHate', -(ag.weight ?? -(D.agendaHate?.amount ?? -6)), { agendaKey: ag.agenda.nameKey });
  return { total: reasons.reduce((n, r) => n + r.amount, 0), reasons };
}

// ---------- War weariness ----------

/** Amenities lost to war weariness in each of the faction's cities. */
export function wearinessAmenities(state, ruleset, factionId) {
  const w = tun(ruleset).weariness ?? {};
  const points = state.diplomacy?.weariness?.[factionId] ?? 0;
  return Math.min(w.maxAmenityLoss ?? 3, Math.floor(points / (w.perAmenity ?? 10)));
}

// ---------- Turn and round ----------

/** Start of a faction's turn: weariness, gold per turn, and its own unanswered proposals lapse. */
export function startDiplomacyTurn(state, ruleset, factionId, events) {
  if (!ruleset?.diplomacy) return;
  const d = dip(state);
  const w = tun(ruleset).weariness ?? {};
  const wars = state.factions.filter((x) => x.alive && x.id !== factionId && atWar(state, factionId, x.id)).length;
  const now = d.weariness[factionId] ?? 0;
  d.weariness[factionId] = wars ? now + wars * (w.perTurnAtWar ?? 1) : Math.max(0, now - (w.recoveryPerTurn ?? 3));
  for (const g of d.goldPerTurn.filter((x) => x.from === factionId)) {
    const payer = factionOf(state, g.from);
    const payee = factionOf(state, g.to);
    if (!payer?.alive || !payee?.alive || atWar(state, g.from, g.to)) { g.until = state.turn; continue; }
    const amount = Math.min(g.amount, Math.max(0, payer.stocks.gold));
    payer.stocks.gold -= amount;
    payee.stocks.gold += amount;
  }
  const lapsed = d.deals.filter((x) => x.from === factionId);
  if (lapsed.length) {
    d.deals = d.deals.filter((x) => x.from !== factionId);
    for (const x of lapsed) events.push({ type: 'dealLapsed', deal: x.id, faction: x.from, target: x.to });
  }
}

/** End of each round: who has met whom, fading memories, treaties and deals that run out. */
export function diplomacyRound(state, ruleset, events) {
  if (!ruleset?.diplomacy || !state.map) return;
  const d = dip(state);
  // Meeting: one sees a unit or city of the other.
  const seen = {};
  for (const f of state.factions) seen[f.id] = state.fog?.[f.id];
  const presence = {};
  for (const u of Object.values(state.units ?? {})) (presence[u.faction] ??= []).push(u.tile);
  for (const c of Object.values(state.cities ?? {})) (presence[c.faction] ??= []).push(c.tile);
  for (const a of state.factions) {
    for (const b of state.factions) {
      if (a.id >= b.id || !a.alive || !b.alive || hasMet(state, a.id, b.id)) continue;
      const sees = (x, y) => (presence[y] ?? []).some((t) => seen[x]?.[t] === 2);
      if (sees(a.id, b.id) || sees(b.id, a.id)) {
        d.met.push(pairKey(a.id, b.id));
        events.push({ type: 'factionMet', faction: a.id, other: b.id });
        events.push({ type: 'factionMet', faction: b.id, other: a.id });
      }
    }
  }
  d.met.sort();
  // Memories fade towards nothing.
  const every = tun(ruleset).decayEveryTurns ?? 5;
  if (state.turn % every === 0) {
    const step = tun(ruleset).decayAmount ?? 1;
    for (const [key, list] of Object.entries(d.modifiers)) {
      for (const m of list) {
        if (ruleset.diplomacy[m.id]?.decays === false) continue;
        m.amount = m.amount > 0 ? Math.max(0, m.amount - step) : Math.min(0, m.amount + step);
      }
      d.modifiers[key] = list.filter((m) => m.amount !== 0);
      if (!d.modifiers[key].length) delete d.modifiers[key];
    }
  }
  // Treaties and running deals end.
  for (const [k, t] of Object.entries(d.treaties)) {
    if (!t.team && t.until !== null && state.turn >= t.until) {
      delete d.treaties[k];
      const [a, b] = k.split('|');
      events.push({ type: 'treatyEnded', faction: a, other: b, kind: t.kind });
    }
  }
  d.resources = d.resources.filter((r) => state.turn < r.until && !atWar(state, r.from, r.to));
  d.goldPerTurn = d.goldPerTurn.filter((g) => state.turn < g.until);
}

/** Count deeds from a command's events: weariness, counters and remembered grievances. */
export function noteDiplomacyEvents(state, ruleset, events) {
  if (!ruleset?.diplomacy) return;
  const d = dip(state);
  const w = tun(ruleset).weariness ?? {};
  for (const e of events) {
    if (e.type === 'unitKilled' && e.by && e.by !== RAIDERS && factionOf(state, e.faction)) {
      d.weariness[e.faction] = (d.weariness[e.faction] ?? 0) + (w.perUnitLost ?? 2);
      addModifier(state, ruleset, e.faction, e.by, 'killedOurUnits');
    }
    if (e.type === 'cityCaptured' && e.from && factionOf(state, e.from)) {
      d.weariness[e.from] = (d.weariness[e.from] ?? 0) + (w.perCityLost ?? 5);
      addModifier(state, ruleset, e.from, e.faction, 'capturedOurCity');
    }
    if (e.type === 'cityRazed') {
      (d.counters[e.faction] ??= {}).razed = (d.counters[e.faction].razed ?? 0) + 1;
      for (const f of state.factions) if (f.id !== e.faction && hasMet(state, f.id, e.faction)) addModifier(state, ruleset, f.id, e.faction, 'razedACity');
    }
  }
}

// ---------- War, peace and denouncing ----------

const refuse = (code, message) => ({ code, message });

function warProblem(state, faction, target) {
  if (!factionOf(state, target)?.alive || target === faction) return refuse('unknownFaction', 'No such faction');
  if (atWar(state, faction, target)) return refuse('alreadyAtWar', 'Already at war');
  if (teammates(state, faction, target)) return refuse('teammate', 'You cannot fight your own team');
  if ((state.diplomacy?.peaceUntil?.[pairKey(faction, target)] ?? -1) > state.turn) return refuse('peaceTreaty', 'A peace treaty is still in force');
  return null;
}

/** Start a war (working copy): treaties end, pacts pull partners in, everyone remembers. */
function startWar(state, ruleset, faction, target, events, { joint = false } = {}) {
  if (atWar(state, faction, target)) return;
  const d = dip(state);
  const k = pairKey(faction, target);
  state.wars = [...(state.wars ?? []), k].sort();
  (d.warSince ??= {})[k] = state.turn;
  if (d.treaties[k] && !d.treaties[k].team) delete d.treaties[k];
  if (!d.met.includes(k)) { d.met.push(k); d.met.sort(); }
  const warnWindow = tun(ruleset).surpriseWarWindow ?? 20;
  const warned = (d.denounced[`${faction}>${target}`] ?? -999) >= state.turn - warnWindow;
  const counters = (d.counters[faction] ??= {});
  counters.warsDeclared = (counters.warsDeclared ?? 0) + 1;
  addModifier(state, ruleset, target, faction, 'declaredWarOnUs');
  if (!warned && !joint) {
    counters.surprise = (counters.surprise ?? 0) + 1;
    for (const f of state.factions) if (f.id !== faction && f.alive && hasMet(state, f.id, faction)) addModifier(state, ruleset, f.id, faction, 'surpriseWar');
  }
  events.push({ type: 'warDeclared', faction, target, surprise: !warned && !joint, global: true });
  // Friends of the target remember; defensive pacts and alliances join in.
  for (const friend of friendsOf(state, target)) {
    if (friend === faction) continue;
    addModifier(state, ruleset, friend, faction, 'attackedOurFriend');
    if (!atWar(state, friend, faction) && !teammates(state, friend, faction)) startWar(state, ruleset, friend, faction, events, { joint: true });
  }
}

export const declareWar = {
  validate(state, cmd) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    return warProblem(state, cmd.faction, cmd.target);
  },
  apply(state, cmd, events, ruleset) {
    startWar(state, ruleset, cmd.faction, cmd.target, events);
  },
};

export const denounce = {
  validate(state, cmd) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    if (!factionOf(state, cmd.target)?.alive || cmd.target === cmd.faction || cmd.target === RAIDERS) return refuse('unknownFaction', 'No such faction');
    if (!hasMet(state, cmd.faction, cmd.target)) return refuse('notMet', 'You have not met them');
    if (teammates(state, cmd.faction, cmd.target)) return refuse('teammate', 'You cannot denounce your own team');
    if ((state.diplomacy?.denounced?.[`${cmd.faction}>${cmd.target}`] ?? -999) > state.turn - 10) return refuse('alreadyDenounced', 'You denounced them recently');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const d = dip(state);
    d.denounced[`${cmd.faction}>${cmd.target}`] = state.turn;
    addModifier(state, ruleset, cmd.target, cmd.faction, 'denouncedUs');
    const k = pairKey(cmd.faction, cmd.target);
    if (d.treaties[k] && !d.treaties[k].team) delete d.treaties[k];
    events.push({ type: 'denounced', faction: cmd.faction, target: cmd.target, global: true });
  },
};

// ---------- Deals ----------

export const DEAL_ITEMS = Object.freeze(['gold', 'goldPerTurn', 'resource', 'openBorders', 'defensivePact', 'alliance', 'peace', 'jointWar']);
const TREATY_ITEMS = new Set(['openBorders', 'defensivePact', 'alliance']);

function ownsResource(state, ruleset, f, resourceId) {
  const map = state.map;
  const want = ruleset.resources?.[resourceId];
  if (!want || !map?.improvement) return false;
  for (let i = 0; i < (state.owner ?? []).length; i += 1) {
    const o = state.owner[i];
    if (o === null || state.cities[o]?.faction !== f) continue;
    if (map.resource[i] < 0 || map.resourceIds[map.resource[i]] !== resourceId) continue;
    if (map.improvement[i] >= 0 && map.improvementIds[map.improvement[i]] === want.improvement) return true;
  }
  return false;
}

/** Resources a faction receives from running deals. */
export function receivedResources(state, f) {
  return (state.diplomacy?.resources ?? []).filter((r) => r.to === f).map((r) => r.resource);
}

/** Resources a faction has given away in running deals (one entry per copy given). */
export function givenResources(state, f) {
  return (state.diplomacy?.resources ?? []).filter((r) => r.from === f).map((r) => r.resource);
}

/** How many improved copies of a resource a faction works in its land. */
export function ownedCopies(state, ruleset, f, resourceId) {
  const map = state.map;
  const want = ruleset.resources?.[resourceId];
  if (!want || !map?.improvement) return 0;
  let n = 0;
  for (let i = 0; i < (state.owner ?? []).length; i += 1) {
    const o = state.owner[i];
    if (o === null || state.cities[o]?.faction !== f) continue;
    if (map.resource[i] < 0 || map.resourceIds[map.resource[i]] !== resourceId) continue;
    if (map.improvement[i] >= 0 && map.improvementIds[map.improvement[i]] === want.improvement) n += 1;
  }
  return n;
}

/** Copies left for the faction itself: owned, less those given away. */
export function keptCopies(state, ruleset, f, resourceId) {
  return ownedCopies(state, ruleset, f, resourceId) - givenResources(state, f).filter((r) => r === resourceId).length;
}

/** Why a deal cannot be made (a code), or null. deal: { from, to, give: [items], get: [items] }. */
export function dealProblem(state, ruleset, deal) {
  const { from, to } = deal;
  if (!factionOf(state, from)?.alive || !factionOf(state, to)?.alive || from === to || to === RAIDERS) return 'unknownFaction';
  if (!hasMet(state, from, to)) return 'notMet';
  const give = deal.give ?? [];
  const get = deal.get ?? [];
  if (!give.length && !get.length) return 'emptyDeal';
  if (give.length + get.length > 8) return 'tooManyItems';
  const war = atWar(state, from, to);
  const all = [...give.map((x) => ({ ...x, giver: from, taker: to })), ...get.map((x) => ({ ...x, giver: to, taker: from }))];
  const types = all.map((x) => x.type);
  if (types.some((x) => !DEAL_ITEMS.includes(x))) return 'badItem';
  if (types.includes('peace') && !war) return 'notAtWar';
  if (war && !types.includes('peace')) return 'atWarNeedsPeace';
  if (types.filter((x) => x === 'peace').length > 1) return 'badItem';
  for (const x of all) {
    if (x.type === 'gold') {
      if (!Number.isInteger(x.amount) || x.amount <= 0) return 'badAmount';
      // (A rival's treasury is hidden from you; the real check happens when the deal is made.)
      const gold = factionOf(state, x.giver).stocks?.gold;
      if (gold !== undefined && gold < x.amount) return 'notEnoughGold';
    }
    if (x.type === 'goldPerTurn' && (!Number.isInteger(x.amount) || x.amount <= 0 || x.amount > 100)) return 'badAmount';
    if (x.type === 'resource') {
      if (!ruleset.resources?.[x.resource] || ruleset.resources[x.resource].class === 'bonus') return 'badItem';
      if (keptCopies(state, ruleset, x.giver, x.resource) <= 0) return 'noResource';
      if (ownsResource(state, ruleset, x.taker, x.resource) || receivedResources(state, x.taker).includes(x.resource)) return 'alreadyHasResource';
    }
    if (TREATY_ITEMS.has(x.type)) {
      if (war) return 'atWarNeedsPeace';
      if (teammates(state, from, to)) return 'teammate';
      if (hasTreaty(state, from, to, x.type)) return 'alreadyTreaty';
    }
    if (x.type === 'jointWar') {
      const t = x.target;
      if (!t || t === from || t === to || !factionOf(state, t)?.alive) return 'unknownFaction';
      if (!hasMet(state, from, t) || !hasMet(state, to, t)) return 'notMet';
      for (const p of [from, to]) if (!atWar(state, p, t) && warProblem(state, p, t)) return 'peaceTreaty';
    }
  }
  return null;
}

const dv = (ruleset) => tun(ruleset).dealValues ?? {};

/**
 * What a deal is worth to `holder` (one of its two sides), with the parts.
 * opinion: the holder's opinion of the other side (default: worked out from
 * the state). The AI accepts a deal worth more than nothing; the screen's
 * "likely answer" uses the same function from what the player can see.
 */
export function evaluateDeal(state, ruleset, holder, deal, { opinion = null } = {}) {
  const V = dv(ruleset);
  const other = holder === deal.from ? deal.to : deal.from;
  const receives = holder === deal.from ? (deal.get ?? []) : (deal.give ?? []);
  const gives = holder === deal.from ? (deal.give ?? []) : (deal.get ?? []);
  const op = opinion ?? opinionOf(state, ruleset, holder, other).total;
  const myPower = militaryPower(state, ruleset, holder);
  const theirPower = militaryPower(state, ruleset, other);
  const parts = [];
  const add = (key, value) => { if (value) parts.push({ key, value: Math.round(value) }); };
  const item = (x, sign) => {
    if (x.type === 'gold') return sign * x.amount * (V.perGold ?? 1);
    if (x.type === 'goldPerTurn') return sign * x.amount * (V.goldPerTurnTurns ?? 30) * (V.goldPerTurnDiscount ?? 0.7) * (V.perGold ?? 1);
    if (x.type === 'resource') {
      const kind = ruleset.resources?.[x.resource]?.class === 'strategic' ? 'strategic' : 'luxury';
      if (sign > 0) return V[kind] ?? 40;
      // Giving away a spare copy (one you have twice) costs little; your last one costs its amenity or units.
      const spare = keptCopies(state, ruleset, x.giver, x.resource) >= 2;
      return -(V[kind] ?? 40) * (spare ? (V.spareShare ?? 0.15) : (V.lastShare ?? 0.8));
    }
    return 0;
  };
  for (const x of receives) add(`get:${x.type}`, item(x, 1));
  for (const x of gives) add(`give:${x.type}`, item(x, -1));
  // Mutual items count once, wherever they were put.
  const mutual = [...receives, ...gives];
  for (const kind of TREATY_ITEMS) {
    if (!mutual.some((x) => x.type === kind)) continue;
    const need = { openBorders: V.minOpenBordersOpinion ?? -5, defensivePact: V.minPactOpinion ?? 5, alliance: V.minAllianceOpinion ?? 10 }[kind];
    const base = V[kind] ?? 10;
    add(kind, op >= need ? base * 0.5 : -base);
  }
  if (mutual.some((x) => x.type === 'peace')) {
    const weariness = state.diplomacy?.weariness?.[holder] ?? 0;
    const ratio = myPower / Math.max(1, theirPower);
    add('peace', (V.peaceBase ?? 30) + weariness / 2 - (V.peacePerStrength ?? 60) * (ratio - 1));
  }
  for (const x of mutual.filter((y) => y.type === 'jointWar')) {
    const theirOp = opinionOf(state, ruleset, holder, x.target).total;
    const vsTarget = myPower / Math.max(1, militaryPower(state, ruleset, x.target));
    add('jointWar', theirOp < 0 && vsTarget >= 0.8 ? (V.jointWar ?? 40) * 0.5 : -(V.jointWar ?? 40));
  }
  // Opinion weighs less on peace: even a bitter enemy takes peace when losing.
  const peaceDeal = mutual.some((x) => x.type === 'peace');
  add('opinion', op * (V.opinionWeight ?? 3) * (peaceDeal ? (V.peaceOpinionShare ?? 0.25) : 1));
  return { value: parts.reduce((n, p) => n + p.value, 0), parts, opinion: op };
}

/** Would `holder` accept? (the AI's answer, and the screen's likely answer) */
export const wouldAccept = (state, ruleset, holder, deal, o) => evaluateDeal(state, ruleset, holder, deal, o).value > 0;

/** Carry out an accepted deal (working copy). */
function enact(state, ruleset, deal, events) {
  const d = dip(state);
  const treatyTurns = tun(ruleset).treatyTurns ?? 30;
  const k = pairKey(deal.from, deal.to);
  const all = [...(deal.give ?? []).map((x) => ({ ...x, giver: deal.from, taker: deal.to })), ...(deal.get ?? []).map((x) => ({ ...x, giver: deal.to, taker: deal.from }))];
  if (all.some((y) => y.type === 'peace')) {
    state.wars = (state.wars ?? []).filter((w) => w !== k);
    d.peaceUntil[k] = state.turn + (tun(ruleset).peaceMinTurns ?? 10);
    addModifier(state, ruleset, deal.from, deal.to, 'madePeace');
    addModifier(state, ruleset, deal.to, deal.from, 'madePeace');
    events.push({ type: 'peaceMade', faction: deal.from, target: deal.to, global: true });
  }
  for (const x of all) {
    if (x.type === 'gold') {
      factionOf(state, x.giver).stocks.gold -= x.amount;
      factionOf(state, x.taker).stocks.gold += x.amount;
    }
    if (x.type === 'goldPerTurn') d.goldPerTurn.push({ from: x.giver, to: x.taker, amount: x.amount, until: state.turn + (dv(ruleset).goldPerTurnTurns ?? 30) });
    if (x.type === 'resource') d.resources.push({ from: x.giver, to: x.taker, resource: x.resource, until: state.turn + treatyTurns });
  }
  const best = all.filter((y) => TREATY_ITEMS.has(y.type)).map((y) => y.type).sort((a, b) => levelOf(b) - levelOf(a))[0];
  if (best) {
    d.treaties[k] = { kind: best, until: state.turn + treatyTurns, team: false };
    events.push({ type: 'treatySigned', faction: deal.from, target: deal.to, kind: best, global: true });
  }
  for (const x of all.filter((y) => y.type === 'jointWar')) {
    for (const p of [deal.from, deal.to]) if (!atWar(state, p, x.target)) startWar(state, ruleset, p, x.target, events, { joint: true });
    addModifier(state, ruleset, deal.from, deal.to, 'jointWar');
    addModifier(state, ruleset, deal.to, deal.from, 'jointWar');
  }
  addModifier(state, ruleset, deal.from, deal.to, 'dealMade');
  addModifier(state, ruleset, deal.to, deal.from, 'dealMade');
}

export const proposeDeal = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    if ((state.diplomacy?.deals ?? []).some((x) => x.from === cmd.faction && x.to === cmd.target)) return refuse('dealPending', 'You already have an offer waiting with them');
    const problem = dealProblem(state, ruleset, { from: cmd.faction, to: cmd.target, give: cmd.give ?? [], get: cmd.get ?? [] });
    return problem ? refuse(problem, 'That deal cannot be made') : null;
  },
  apply(state, cmd, events) {
    const d = dip(state);
    const deal = { id: `d${d.nextDeal++}`, from: cmd.faction, to: cmd.target, give: cmd.give ?? [], get: cmd.get ?? [], turn: state.turn };
    d.deals.push(deal);
    events.push({ type: 'dealProposed', deal: deal.id, faction: deal.from, target: deal.to });
  },
};

export const answerDeal = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const deal = (state.diplomacy?.deals ?? []).find((x) => x.id === cmd.deal);
    if (!deal || deal.to !== cmd.faction) return refuse('noSuchDeal', 'That offer is not open');
    if (cmd.accept && dealProblem(state, ruleset, deal)) return refuse('dealNoLongerPossible', 'That deal can no longer be made');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const d = dip(state);
    const deal = d.deals.find((x) => x.id === cmd.deal);
    d.deals = d.deals.filter((x) => x.id !== cmd.deal);
    if (cmd.accept) {
      enact(state, ruleset, deal, events);
      events.push({ type: 'dealAccepted', deal: deal.id, faction: deal.to, target: deal.from, global: true });
    } else {
      addModifier(state, ruleset, deal.from, deal.to, 'refusedOurDeal');
      events.push({ type: 'dealRefused', deal: deal.id, faction: deal.to, target: deal.from });
    }
  },
};

