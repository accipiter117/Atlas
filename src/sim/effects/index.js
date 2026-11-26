// The effects registry (docs/PLAN.md section 4.7).
//
// Traits, leaders, buildings, wonders (and later policies, beliefs and
// events) describe what they do with effects such as
//   { "effect": "yieldPercent", "yield": "science", "amount": 10 }
// Each effect name has one handler file here. A handler offers one or more
// hooks (tileYield, cityFlat, cityPercent, cost, upkeep, growth, amenities,
// move, sight, heal, onCityFounded, onBuilt); the rest of the rules ask the
// registry "what do this faction's effects add up to for this hook?" and
// never look at effect names themselves.
//
// Scopes say where an effect reaches:
//   everyCity (default for traits)   every city of the faction
//   thisCity (default for buildings) only the city that has the building
//   capital                          only the capital
//   withBuilding:<id>                cities that have that building
//   capturedCities                   cities taken from someone else

import yieldBonus from './yieldBonus.js';
import yieldPercent from './yieldPercent.js';
import cityYieldPercent from './cityYieldPercent.js';
import tileYield from './tileYield.js';
import costPercent from './costPercent.js';
import upkeepPercent from './upkeepPercent.js';
import growthPercent from './growthPercent.js';
import amenityBonus from './amenityBonus.js';
import freeBuilding from './freeBuilding.js';
import freeUnit from './freeUnit.js';
import moveBonus from './moveBonus.js';
import sightBonus from './sightBonus.js';
import healBonus from './healBonus.js';
import autoRoad from './autoRoad.js';
import freePolicySlot from './freePolicySlot.js';
import borderGrowthPercent from './borderGrowthPercent.js';
import religiousPressure from './religiousPressure.js';
import faithPurchase from './faithPurchase.js';
import tradeRouteYield from './tradeRouteYield.js';
import { religionEffects, majorityOf } from '../religion.js';

export const HANDLERS = Object.freeze(Object.fromEntries(
  [yieldBonus, yieldPercent, cityYieldPercent, tileYield, costPercent, upkeepPercent, growthPercent,
    amenityBonus, freeBuilding, freeUnit, moveBonus, sightBonus, healBonus, autoRoad, freePolicySlot, borderGrowthPercent, religiousPressure, faithPurchase, tradeRouteYield].map((h) => [h.name, h]),
));

/** A building's definition, whether a building or a wonder. */
export function buildingDef(ruleset, id) {
  return ruleset.buildings?.[id] ?? ruleset.wonders?.[id] ?? null;
}

/** Does the city have this building, or a faction's own version of it? */
export function hasBuilding(ruleset, city, id) {
  return city.buildings.some((b) => b === id || buildingDef(ruleset, b)?.replaces === id);
}

/**
 * Every effect active for a faction, each tagged with where it came from and
 * the scope it uses: the faction's trait, its leader's trait, and every
 * building and wonder in its cities (plus timed effects on a city).
 */
/** The game's difficulty level (setup.difficulty, else the ruleset's default), or null. */
export function difficultyOf(state, ruleset) {
  const all = ruleset.difficulty ?? {};
  return all[state.setup?.difficulty] ?? Object.values(all).find((d) => d.default) ?? null;
}

export function effectsFor(state, ruleset, factionId) {
  const out = [];
  const f = state.factions.find((x) => x.id === factionId);
  const civ = f?.civ ? ruleset.factions?.[f.civ] : null;
  for (const e of civ?.trait?.effects ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'trait', id: civ.trait.id } });
  const leader = civ?.leaders?.[0] ? ruleset.leaders?.[civ.leaders[0]] : null;
  for (const e of leader?.trait?.effects ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'leader', id: leader.trait.id } });
  // Difficulty (section 9.5): the labelled bonuses from difficulty.json, the only advantages anyone gets.
  const level = difficultyOf(state, ruleset);
  for (const e of (f?.kind === 'human' ? level?.humanEffects : f?.kind === 'ai' ? level?.aiEffects : null) ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'difficulty', id: level.id } });
  // Government and policy cards (section 3.7): only the active ones; none during anarchy.
  const gov = f?.government;
  if (gov?.id && ruleset.governments?.[gov.id]) {
    for (const e of ruleset.governments[gov.id].effects ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'government', id: gov.id } });
    for (const list of Object.values(gov.policies ?? {})) {
      for (const id of list ?? []) {
        for (const e of ruleset.policies?.[id]?.effects ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'policy', id } });
      }
    }
  }
  // Religion (phase 13): pantheon, follower beliefs in following cities, founder beliefs.
  if (ruleset.beliefs) out.push(...religionEffects(state, ruleset, factionId));
  for (const city of Object.values(state.cities ?? {})) {
    if (city.faction !== factionId) continue;
    for (const b of city.buildings ?? []) {
      for (const e of buildingDef(ruleset, b)?.effects ?? []) out.push({ ...e, scope: e.scope ?? 'thisCity', source: { kind: 'building', id: b, city: city.id } });
    }
    for (const e of city.timed ?? []) out.push({ ...e, scope: 'thisCity', source: { kind: 'timed', id: e.effect, city: city.id } });
  }
  return out;
}

/** Does an effect reach this city? */
export function reachesCity(ruleset, e, city) {
  const scope = e.scope ?? 'everyCity';
  if (scope === 'everyCity') return true;
  if (scope === 'thisCity') return e.source?.city === city.id;
  if (scope === 'capital') return city.capital === true;
  if (scope === 'capturedCities') return city.captured === true;
  if (scope.startsWith('religion:')) return majorityOf(city) === scope.slice('religion:'.length);
  if (scope.startsWith('withBuilding:')) return hasBuilding(ruleset, city, scope.slice('withBuilding:'.length));
  return false;
}

/** Does an effect reach this unit (thisCity effects reach units built in that city)? */
export function reachesUnit(ruleset, e, unit) {
  const scope = e.scope ?? 'everyCity';
  if (scope === 'thisCity') return unit.builtIn === e.source?.city;
  return scope === 'everyCity' || scope === 'capital';
}

/** Add up a numeric hook over a faction's effects. */
export function sumHook(hook, state, ruleset, factionId, ctx, effects = effectsFor(state, ruleset, factionId)) {
  let total = 0;
  for (const e of effects) {
    const h = HANDLERS[e.effect]?.[hook];
    if (h) total += h(e, { ...ctx, state, ruleset }) ?? 0;
  }
  return total;
}

/** Add up a yields-shaped hook (an object of yield name to amount). */
export function yieldHook(hook, state, ruleset, factionId, ctx, effects = effectsFor(state, ruleset, factionId)) {
  const out = {};
  for (const e of effects) {
    const h = HANDLERS[e.effect]?.[hook];
    const r = h ? h(e, { ...ctx, state, ruleset }) : null;
    if (r) for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Run an event hook (onCityFounded, onBuilt) for every effect that has one. */
export function runHook(hook, state, ruleset, effects, ctx) {
  const events = [];
  for (const e of effects) {
    const h = HANDLERS[e.effect]?.[hook];
    if (h) events.push(...(h(e, { ...ctx, state, ruleset }) ?? []));
  }
  return events;
}
