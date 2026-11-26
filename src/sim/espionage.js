// Espionage (section 3.10).
//
// Spies are built like units (after the civic that unlocks them), at most
// capBase + era index per faction. Assigning a spy to a city you know
// (assignSpy) takes it off the map: in one of your cities it defends; in a
// rival's it can run a mission (startMission) from espionage.json. Each
// mission takes its turns; its success chance is shown before you commit:
//   baseOdds + spy level x oddsPerLevel - the city's defence
// (each defending spy adds defencePerSpy + its level x defencePerLevel),
// kept between minOdds and maxOdds. When it ends, one roll of the game dice:
// success, success but identified, failed and escaped, or captured (the spy
// is lost). Being identified or captured costs opinion (caughtSpying), and the
// city's owner is told. A spy that succeeds gains a level.
//
// Every number lives in tuning.espionage and espionage.json.

import { currentFactionId } from './queries.js';
import { random } from '../core/rng.js';
import { eraOf, knows, researchOf, costOf, available } from './progression.js';
import { neighbourCache } from './map.js';
import { EXPLORED } from './visibility.js';

const tun = (ruleset) => ruleset?.tuning?.espionage ?? {};
const refuse = (code, message) => ({ code, message });
const factionOf = (state, id) => state.factions.find((f) => f.id === id);

export const emptyEspionage = () => ({ spies: [], nextSpy: 1, intel: {} });
const esp = (state) => (state.espionage ??= emptyEspionage());

const isSpyType = (ruleset, type) => (ruleset.units?.[type]?.tags ?? []).includes('spy');

/** How many spies a faction may have: capBase + its era index. */
export function spyCap(state, ruleset, factionId) {
  const era = ruleset.eras?.[eraOf(state, ruleset, factionId)];
  return (tun(ruleset).capBase ?? 1) + (era?.index ?? 0);
}

/** Spies a faction has: assigned agents plus spy units still on the map. */
export function spyCount(state, ruleset, factionId) {
  const agents = (state.espionage?.spies ?? []).filter((s) => s.faction === factionId).length;
  const units = Object.values(state.units ?? {}).filter((u) => u.faction === factionId && isSpyType(ruleset, u.type)).length;
  return agents + units;
}

/** A city's defence against spies: each spy of its owner posted there. */
export function cityDefence(state, ruleset, city) {
  const t = tun(ruleset);
  return (state.espionage?.spies ?? []).filter((s) => s.city === city.id && s.faction === city.faction)
    .reduce((n, s) => n + (t.defencePerSpy ?? 15) + s.level * (t.defencePerLevel ?? 5), 0);
}

/** The success chance (0 to 100) of a mission by this spy in this city. */
export function missionOdds(state, ruleset, spy, missionId, city) {
  const t = tun(ruleset);
  const m = ruleset.espionage?.[missionId];
  if (!m || !city) return 0;
  const odds = (m.baseOdds ?? t.baseOdds ?? 60) + spy.level * (t.oddsPerLevel ?? 10) - cityDefence(state, ruleset, city);
  return Math.max(t.minOdds ?? 5, Math.min(t.maxOdds ?? 95, odds));
}

/**
 * One roll of the dice for a finished mission: success, identified (success,
 * but seen), escaped (failed) or captured (failed, spy lost).
 */
export function rollOutcome(roll, roll2, odds, ruleset) {
  const t = tun(ruleset);
  if (roll * 100 < odds) return roll2 < (t.identifyChance ?? 0.25) ? 'identified' : 'success';
  return roll2 < (t.captureChance ?? 0.5) ? 'captured' : 'escaped';
}

/** The target probabilities of each outcome, for the screen and the tests. */
export function outcomeChances(odds, ruleset) {
  const t = tun(ruleset);
  const p = odds / 100;
  return { success: p * (1 - (t.identifyChance ?? 0.25)), identified: p * (t.identifyChance ?? 0.25), escaped: (1 - p) * (1 - (t.captureChance ?? 0.5)), captured: (1 - p) * (t.captureChance ?? 0.5) };
}

// ---------- Commands ----------

/** A city the faction knows (has explored), by id. */
function knownCity(state, factionId, cityId) {
  const c = state.cities?.[cityId];
  if (!c) return null;
  if (c.faction === factionId) return c;
  return (state.fog?.[factionId]?.[c.tile] ?? 0) > 0 ? c : null;
}

export const assignSpy = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const city = knownCity(state, cmd.faction, cmd.city);
    if (!city) return refuse('noSuchCity', 'Choose a city you know');
    if (cmd.unit) {
      const u = state.units?.[cmd.unit];
      if (!u || u.faction !== cmd.faction || !isSpyType(ruleset, u.type)) return refuse('notSpy', 'That is not one of your spies');
    } else {
      const s = (state.espionage?.spies ?? []).find((x) => x.id === cmd.spy && x.faction === cmd.faction);
      if (!s) return refuse('notSpy', 'That is not one of your spies');
      if (s.mission) return refuse('spyBusy', 'That spy is on a mission');
      if (s.city === city.id) return refuse('alreadyThere', 'That spy is already there');
    }
    return null;
  },
  apply(state, cmd, events) {
    const e = esp(state);
    let spy;
    if (cmd.unit) {
      delete state.units[cmd.unit];
      spy = { id: `s${e.nextSpy++}`, faction: cmd.faction, level: 0, city: cmd.city, mission: null };
      e.spies.push(spy);
    } else {
      spy = e.spies.find((x) => x.id === cmd.spy);
      spy.city = cmd.city;
    }
    events.push({ type: 'spyAssigned', spy: spy.id, faction: cmd.faction, city: cmd.city });
  },
};

export const startMission = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const s = (state.espionage?.spies ?? []).find((x) => x.id === cmd.spy && x.faction === cmd.faction);
    if (!s) return refuse('notSpy', 'That is not one of your spies');
    if (s.mission) return refuse('spyBusy', 'That spy is on a mission');
    const city = state.cities?.[s.city];
    if (!city || city.faction === cmd.faction) return refuse('ownCity', 'Spies run missions in rivals\' cities');
    const m = ruleset.espionage?.[cmd.mission];
    if (!m) return refuse('noSuchMission', 'No such mission');
    if ((m.requiresLevel ?? 0) > s.level) return refuse('spyTooGreen', 'The spy needs more experience');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const s = state.espionage.spies.find((x) => x.id === cmd.spy);
    const city = state.cities[s.city];
    const m = ruleset.espionage[cmd.mission];
    s.mission = { id: cmd.mission, until: state.turn + m.turns, odds: missionOdds(state, ruleset, s, cmd.mission, city) };
    events.push({ type: 'missionStarted', spy: s.id, faction: cmd.faction, city: city.id, mission: cmd.mission, odds: s.mission.odds });
  },
};

// ---------- Mission results ----------

function succeed(state, ruleset, spy, city, m, events) {
  const owner = factionOf(state, city.faction);
  const me = factionOf(state, spy.faction);
  const t = tun(ruleset);
  if (m.action === 'intel') {
    const fog = state.fog?.[spy.faction];
    if (fog) {
      const nbs = neighbourCache(state.map);
      let frontier = [city.tile];
      const seen = new Set(frontier);
      for (let d = 0; d < (m.amount ?? 3); d += 1) {
        const next = [];
        for (const x of frontier) for (const j of nbs[x]) if (j >= 0 && !seen.has(j)) { seen.add(j); next.push(j); }
        frontier = next;
      }
      for (const x of seen) if (fog[x] < EXPLORED) fog[x] = EXPLORED;
    }
    esp(state).intel[spy.faction] ??= {};
    esp(state).intel[spy.faction][city.faction] = { turn: state.turn, until: state.turn + (t.intelTurns ?? 20), research: owner.research?.current ?? null, techs: owner.research?.known?.length ?? 0, gold: Math.floor(owner.stocks?.gold ?? 0), cities: Object.values(state.cities).filter((c) => c.faction === city.faction).length };
    return {};
  }
  if (m.action === 'siphon') {
    const gold = Math.min(m.cap ?? 120, Math.floor(Math.max(0, owner.stocks.gold) * (m.amount ?? 0.2)));
    owner.stocks.gold -= gold;
    me.stocks.gold += gold;
    return { gold };
  }
  if (m.action === 'boost') {
    const theirs = owner.research?.known ?? [];
    const mine = researchOf(me);
    const options = available(state, ruleset, me.id).filter((id) => theirs.includes(id) && !mine.boosted.includes(id));
    const pick = options.sort()[0] ?? theirs.filter((id) => !knows(state, me.id, id) && !mine.boosted.includes(id)).sort()[0];
    if (!pick) return { tech: null };
    mine.boosted.push(pick);
    mine.progress[pick] = (mine.progress[pick] ?? 0) + Math.round(costOf(state, ruleset, pick) * (ruleset.tuning?.progression?.boostShare ?? 0.4));
    events.push({ type: 'boost', faction: me.id, item: pick, tree: 'techs' });
    return { tech: pick };
  }
  if (m.action === 'sabotage') {
    const lost = Math.floor(city.progress ?? 0);
    city.progress = 0;
    return { production: lost };
  }
  if (m.action === 'unrest') {
    city.timed = [...(city.timed ?? []), { effect: 'amenityBonus', amount: -(m.amount ?? 2), turns: m.effectTurns ?? 10 }];
    return { amenities: m.amount ?? 2 };
  }
  return {};
}

/** Carry out one outcome of a mission (working copy). Returns what happened (gold stolen, tech boosted...). */
export function resolveMission(state, ruleset, spy, city, m, outcome, events, addModifier = null) {
  const e = esp(state);
  const t = tun(ruleset);
  const factionId = spy.faction;
  let result = {};
  if (outcome === 'success' || outcome === 'identified') {
    result = succeed(state, ruleset, spy, city, m, events);
    spy.level = Math.min(t.maxLevel ?? 3, spy.level + 1);
  }
  if (outcome === 'identified' || outcome === 'captured') addModifier?.(state, ruleset, city.faction, factionId, 'caughtSpying');
  if (outcome === 'captured') e.spies = e.spies.filter((s) => s.id !== spy.id);
  if (outcome === 'escaped') {
    // Home to the capital (or any city) to recover.
    const home = Object.values(state.cities).find((c) => c.faction === factionId && c.capital) ?? Object.values(state.cities).find((c) => c.faction === factionId);
    if (home) spy.city = home.id; else e.spies = e.spies.filter((s) => s.id !== spy.id);
  }
  return result;
}

/** Start of a faction's turn: its finished missions resolve. */
export function startEspionageTurn(state, ruleset, factionId, events, addModifier) {
  const e = state.espionage;
  if (!e?.spies.length) return;
  for (const spy of e.spies.filter((s) => s.faction === factionId && s.mission && state.turn >= s.mission.until)) {
    const city = state.cities?.[spy.city];
    const m = ruleset.espionage?.[spy.mission.id];
    const odds = spy.mission.odds;
    spy.mission = null;
    if (!city || !m || city.faction === factionId) continue;
    const outcome = rollOutcome(random(state), random(state), odds, ruleset);
    const result = resolveMission(state, ruleset, spy, city, m, outcome, events, addModifier);
    events.push({ type: 'missionEnded', spy: spy.id, faction: factionId, target: city.faction, city: city.id, cityName: city.name, mission: m.id, outcome, odds, ...result });
  }
  // Spies in cities that have since changed hands, or been lost, go home.
  for (const spy of e.spies.filter((s) => s.faction === factionId && !state.cities?.[s.city])) {
    const home = Object.values(state.cities).find((c) => c.faction === factionId);
    if (home) spy.city = home.id; else e.spies = e.spies.filter((s) => s.id !== spy.id);
  }
  if (e.intel?.[factionId]) for (const [k, v] of Object.entries(e.intel[factionId])) if (state.turn >= v.until) delete e.intel[factionId][k];
}
