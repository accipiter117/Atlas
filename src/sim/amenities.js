// Amenities, the happiness of each city (section 3.3).
//
// A city needs 1 amenity for every citizensPerAmenity citizens. It gets them
// from buildings, effects, and luxury resources: each kind of luxury the
// faction has improved in its land gives 1 amenity to up to citiesPerLuxury
// cities, unhappiest first. The balance (have minus need) picks a row from
// tuning.amenities.thresholds, which changes the city's yields and growth.

import { sumHook, buildingDef, effectsFor } from './effects/index.js';
import { citiesOf } from './cities.js';
import { wearinessAmenities, receivedResources, givenResources } from './diplomacy.js';

/** Luxury kinds a faction has improved somewhere in its land. */
export function luxuriesOf(state, ruleset, factionId) {
  const map = state.map;
  const kinds = new Set();
  for (let i = 0; i < state.owner.length; i += 1) {
    const o = state.owner[i];
    if (o === null || state.cities[o]?.faction !== factionId || map.resource[i] < 0) continue;
    const id = map.resourceIds[map.resource[i]];
    const res = ruleset.resources[id];
    if (res?.class !== 'luxury' || map.improvement?.[i] < 0) continue;
    if (map.improvementIds[map.improvement[i]] === res.improvement) kinds.add(id);
  }
  // A luxury given away in a deal leaves only if it was the last copy; luxuries received count too.
  for (const id of new Set(givenResources(state, factionId))) {
    if (!kinds.has(id)) continue;
    let copies = 0;
    for (let i = 0; i < state.owner.length; i += 1) {
      const o = state.owner[i];
      if (o !== null && state.cities[o]?.faction === factionId && map.resource[i] >= 0 && map.resourceIds[map.resource[i]] === id && map.improvement?.[i] >= 0 && map.improvementIds[map.improvement[i]] === ruleset.resources[id].improvement) copies += 1;
    }
    if (copies - givenResources(state, factionId).filter((r) => r === id).length <= 0) kinds.delete(id);
  }
  for (const id of receivedResources(state, factionId)) if (ruleset.resources[id]?.class === 'luxury') kinds.add(id);
  return [...kinds].sort();
}

/** Every city of a faction: { need, have, balance, luxuries, threshold }. */
export function amenitiesFor(state, ruleset, factionId) {
  const t = ruleset.tuning?.amenities ?? {};
  const per = t.citizensPerAmenity ?? 2;
  const effects = effectsFor(state, ruleset, factionId);
  const cities = citiesOf(state, factionId);
  const out = {};
  // War weariness (phase 12) costs amenities in every city.
  const weary = ruleset.diplomacy ? wearinessAmenities(state, ruleset, factionId) : 0;
  for (const c of cities) {
    let have = -weary;
    for (const b of c.buildings) have += buildingDef(ruleset, b)?.amenities ?? 0;
    have += sumHook('amenities', state, ruleset, factionId, { city: c }, effects);
    out[c.id] = { need: Math.floor(c.pop / per), have, luxuries: 0 };
  }
  // Each luxury kind goes to up to citiesPerLuxury cities, worst off first.
  for (const _lux of luxuriesOf(state, ruleset, factionId)) {
    const order = cities.slice().sort((a, b) => (out[a.id].have + out[a.id].luxuries - out[a.id].need) - (out[b.id].have + out[b.id].luxuries - out[b.id].need) || (a.id < b.id ? -1 : 1));
    for (const c of order.slice(0, t.citiesPerLuxury ?? 4)) out[c.id].luxuries += 1;
  }
  const rows = (t.thresholds ?? []).slice().sort((a, b) => b.atLeast - a.atLeast);
  for (const c of cities) {
    const a = out[c.id];
    a.balance = a.have + a.luxuries - a.need;
    a.threshold = rows.find((r) => a.balance >= r.atLeast) ?? { yieldPercent: 0, growthPercent: 0 };
  }
  return out;
}
