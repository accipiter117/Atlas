// Events with choices (phase 16, section 4.6).
//
// At the start of each faction's turn, if no event has happened to it for
// tuning.events.minGap turns, each event in events.json whose conditions hold
// for one of its cities rolls its chance (times the setup's frequency: off,
// occasional or frequent; off when the setup does not say, so older saves
// play on unchanged); the first to succeed happens in one of the cities
// that qualify. Disasters only happen with the Disasters setup option on.
// The faction must then pick a choice (chooseEvent) before ending its turn.
//
// A choice's effects go through the effects registry: effects with an
// instant handler (popChange, freeUnit) happen at once; the rest last their
// `turns` (default tuning.events.defaultTurns) in that city. An effect with a
// `chance` happens only if the game dice allow.
//
// Conditions (the engine knows these): cityPopAtLeast, cityOnRiver,
// cityCoastal, cityHasBuilding, citiesAtLeast, atWar, goldAtLeast,
// eraAtLeast, hasReligion.

import { currentFactionId } from './queries.js';
import { random } from '../core/rng.js';
import { neighbourCache } from './map.js';
import { eraOf } from './progression.js';
import { HANDLERS } from './effects/index.js';

const tun = (ruleset) => ruleset?.tuning?.events ?? {};
const refuse = (code, message) => ({ code, message });

export const emptyEvents = () => ({ pending: {}, last: {}, nextId: 1 });

function cityOk(state, ruleset, city, cond) {
  const [k, v] = Object.entries(cond)[0] ?? [];
  if (k === 'cityPopAtLeast') return city.pop >= v;
  if (k === 'cityOnRiver') return (state.map.river[city.tile] !== 0) === v;
  if (k === 'cityCoastal') return neighbourCache(state.map)[city.tile].some((j) => j >= 0 && ruleset.terrain[state.map.terrainIds[state.map.terrain[j]]]?.water) === v;
  if (k === 'cityHasBuilding') return city.buildings.includes(v);
  return null; // not a city condition
}

function factionOk(state, ruleset, factionId, cond) {
  const [k, v] = Object.entries(cond)[0] ?? [];
  const f = state.factions.find((x) => x.id === factionId);
  if (k === 'citiesAtLeast') return Object.values(state.cities).filter((c) => c.faction === factionId).length >= v;
  if (k === 'atWar') return (state.wars ?? []).some((w) => w.split('|').includes(factionId)) === v;
  if (k === 'goldAtLeast') return (f.stocks?.gold ?? 0) >= v;
  if (k === 'eraAtLeast') return (ruleset.eras?.[eraOf(state, ruleset, factionId)]?.index ?? 0) >= v;
  if (k === 'hasReligion') return Object.values(state.religion?.religions ?? {}).some((r) => r.founder === factionId) === v;
  return null;
}

/** The cities of a faction where an event could happen now (its conditions all hold). */
export function eventCities(state, ruleset, factionId, ev) {
  const conds = ev.when?.conditions ?? [];
  for (const c of conds) { const r = factionOk(state, ruleset, factionId, c); if (r === false) return []; }
  return Object.values(state.cities ?? {}).filter((city) => city.faction === factionId
    && conds.every((c) => { const r = cityOk(state, ruleset, city, c); return r === null || r; }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Start of a faction's turn: perhaps an event happens. */
export function startEventsTurn(state, ruleset, factionId, events) {
  if (!ruleset.events) return;
  const freq = tun(ruleset).frequency?.[state.setup?.events ?? 'off'] ?? 1;
  if (!freq) return;
  state.events ??= emptyEvents();
  const s = state.events;
  if (s.pending[factionId]) return;
  if (state.turn - (s.last[factionId] ?? -999) < (tun(ruleset).minGap ?? 10)) return;
  const disasters = state.setup?.disasters === 'on';
  for (const ev of Object.values(ruleset.events)) {
    if (ev.disaster && !disasters) continue;
    if (state.turn < (ev.when?.minTurn ?? 0)) continue;
    const cities = eventCities(state, ruleset, factionId, ev);
    if (!cities.length) continue;
    if (random(state) >= (ev.when?.chance ?? 0) * freq) continue;
    const city = cities[Math.floor(random(state) * cities.length)];
    s.pending[factionId] = { id: `e${s.nextId++}`, event: ev.id, city: city.id, turn: state.turn };
    s.last[factionId] = state.turn;
    events.push({ type: 'eventHappened', faction: factionId, event: ev.id, city: city.id, cityName: city.name });
    return;
  }
}

/** Carry out a choice's effects in a city (working copy). */
export function applyChoice(state, ruleset, city, choice, events) {
  for (const e of choice.effects ?? []) {
    if (e.chance !== undefined && random(state) >= e.chance) continue;
    const h = HANDLERS[e.effect];
    if (h?.instant) {
      events.push(...(h.instant(e, { state, ruleset, city }) ?? []));
    } else {
      const { chance: _c, ...rest } = e;
      city.timed = [...(city.timed ?? []), { ...rest, turns: e.turns ?? tun(ruleset).defaultTurns ?? 10 }];
    }
  }
}

export const chooseEvent = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const p = state.events?.pending?.[cmd.faction];
    if (!p || p.id !== cmd.event) return refuse('noSuchEvent', 'There is no such event waiting');
    const ev = ruleset.events?.[p.event];
    if (!Number.isInteger(cmd.choice) || !ev?.choices?.[cmd.choice]) return refuse('noSuchChoice', 'Pick one of the choices');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const p = state.events.pending[cmd.faction];
    delete state.events.pending[cmd.faction];
    const city = state.cities[p.city];
    if (city) applyChoice(state, ruleset, city, ruleset.events[p.event].choices[cmd.choice], events);
    events.push({ type: 'eventChosen', faction: cmd.faction, event: p.event, choice: cmd.choice, city: p.city });
  },
};
