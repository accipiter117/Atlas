// Religion (section 3.8).
//
// Faith builds up in each faction's stock. At pantheonFaith a faction picks a
// pantheon belief (one each, unique in the world), which works in all its
// cities. At foundReligionFaith, with a pantheon and a city with a shrine or
// temple (the holy city), it founds one of the religions in religions.json,
// names it, and picks a follower belief and a founder belief. There are only
// ceil(factions x religionsPerFaction) religions.
//
// Each city has followers per religion (citizens; the rest follow none). At
// the end of every round each city whose people mostly follow a religion
// presses it on every city within pressureRange hexes, its own included, and
// once a city's pressure for a religion reaches convertAt, one more citizen
// converts. Missionaries, bought with faith, convert citizens directly.
// Follower beliefs work in every city following the religion, whoever owns
// it; founder beliefs work for the founder only (some pay per follower city).
//
// Every number lives in tuning.religion.

import { currentFactionId } from './queries.js';
import { tileHex, neighbourCache } from './map.js';
import { hexDistance } from '../core/hex.js';
import { createUnit, canStand } from './units.js';
import { sumHook, effectsFor } from './effects/index.js';
import { speedMultiplier } from './progression.js';

const tun = (ruleset) => ruleset?.tuning?.religion ?? {};
const refuse = (code, message) => ({ code, message });
const factionOf = (state, id) => state.factions.find((f) => f.id === id);

export function emptyReligion() {
  return { pantheons: {}, religions: {} };
}
const rel = (state) => (state.religion ??= emptyReligion());

/** The religion most of a city follows (more followers than any other), or null. */
export function majorityOf(city) {
  let best = null;
  let n = 0;
  let tie = false;
  for (const [id, k] of Object.entries(city?.followers ?? {}).sort()) {
    if (k > n) { best = id; n = k; tie = false; } else if (k === n && k > 0) tie = true;
  }
  return n > 0 && !tie ? best : null;
}

export function religionLimit(state, ruleset) {
  return Math.ceil(state.factions.length * (tun(ruleset).religionsPerFaction ?? 0.5));
}

export const foundedBy = (state, factionId) => Object.values(state.religion?.religions ?? {}).find((r) => r.founder === factionId) ?? null;
export const pantheonOf = (state, factionId) => state.religion?.pantheons?.[factionId] ?? null;

/** Beliefs already taken by someone (pantheons, and every founded religion's beliefs). */
export function takenBeliefs(state) {
  const r = state.religion ?? emptyReligion();
  return new Set([...Object.values(r.pantheons), ...Object.values(r.religions).flatMap((x) => x.beliefs)]);
}

/** How many cities in the world mostly follow this religion. */
export function followerCities(state, religionId) {
  return Object.values(state.cities ?? {}).filter((c) => majorityOf(c) === religionId).length;
}

/** Faith needed for a pantheon and to found a religion (scaled by game speed, like every cost). */
export const pantheonFaith = (state, ruleset) => Math.round((tun(ruleset).pantheonFaith ?? 25) * speedMultiplier(state, ruleset));
export const foundFaith = (state, ruleset) => Math.round((tun(ruleset).foundReligionFaith ?? 200) * speedMultiplier(state, ruleset));

/** Faith cost of a missionary (scaled by game speed). */
export const missionaryFaith = (state, ruleset) => Math.round((tun(ruleset).missionaryFaith ?? 80) * speedMultiplier(state, ruleset));

/** Convert up to n citizens of a city to a religion: those of no religion first, then from the largest other. */
export function convert(city, religionId, n) {
  city.followers ??= {};
  let done = 0;
  for (let i = 0; i < n; i += 1) {
    const total = Object.values(city.followers).reduce((a, b) => a + b, 0);
    if (total < city.pop) { city.followers[religionId] = (city.followers[religionId] ?? 0) + 1; done += 1; continue; }
    const from = Object.entries(city.followers).filter(([id, k]) => id !== religionId && k > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (!from) break;
    city.followers[from[0]] -= 1;
    if (!city.followers[from[0]]) delete city.followers[from[0]];
    city.followers[religionId] = (city.followers[religionId] ?? 0) + 1;
    done += 1;
  }
  return done;
}

/** Keep followers within the population (people lost leave the biggest group first). */
function fit(city) {
  city.followers ??= {};
  let total = Object.values(city.followers).reduce((a, b) => a + b, 0);
  while (total > city.pop) {
    const big = Object.entries(city.followers).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    city.followers[big[0]] -= 1;
    if (!city.followers[big[0]]) delete city.followers[big[0]];
    total -= 1;
  }
}

/** Pressure one city puts out for its majority religion, before distance (0 if none). */
export function pressureFrom(state, ruleset, city) {
  const r = majorityOf(city);
  if (!r) return 0;
  const t = tun(ruleset);
  const holy = state.religion?.religions?.[r]?.holyCity === city.id;
  const base = ((t.pressurePerCity ?? 1) + (city.followers[r] ?? 0) * (t.pressurePerFollower ?? 0.25)) * (holy ? (t.holyCityPressure ?? 2) : 1);
  const pct = sumHook('pressure', state, ruleset, city.faction, { city, religion: r });
  return base * (1 + pct / 100);
}

/** End of round: every city presses its religion on the cities in range; conversions follow. */
export function religionRound(state, ruleset, events) {
  if (!ruleset?.beliefs || !state.cities) return;
  const t = tun(ruleset);
  const range = t.pressureRange ?? 10;
  const at = t.convertAt ?? 30;
  const cities = Object.values(state.cities).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const c of cities) fit(c);
  const sources = cities.map((c) => ({ c, r: majorityOf(c), p: pressureFrom(state, ruleset, c), hex: tileHex(state.map, c.tile) })).filter((x) => x.r);
  if (!sources.length) return;
  for (const target of cities) {
    const th = tileHex(state.map, target.tile);
    const incoming = {};
    for (const s of sources) if (hexDistance(s.hex, th) <= range) incoming[s.r] = (incoming[s.r] ?? 0) + s.p;
    target.pressure ??= {};
    for (const [r, p] of Object.entries(incoming)) target.pressure[r] = (target.pressure[r] ?? 0) + p;
    const before = majorityOf(target);
    for (const [r] of Object.entries(target.pressure).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
      while (target.pressure[r] >= at) {
        target.pressure[r] -= at;
        if (!convert(target, r, 1)) { target.pressure[r] = Math.min(target.pressure[r], at); break; }
      }
    }
    const after = majorityOf(target);
    if (after !== before) events.push({ type: 'cityConverted', city: target.id, name: target.name, faction: target.faction, religion: after, from: before });
  }
}

// ---------- Effects ----------

/** The religion effects for a faction: pantheon, follower beliefs in following cities, founder beliefs. */
export function religionEffects(state, ruleset, factionId) {
  const out = [];
  const r = state.religion;
  if (!r || !ruleset.beliefs) return out;
  const pan = r.pantheons[factionId];
  for (const e of ruleset.beliefs[pan]?.effects ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'belief', id: pan } });
  const mine = Object.values(state.cities ?? {}).filter((c) => c.faction === factionId);
  const followed = new Set(mine.map(majorityOf).filter(Boolean));
  for (const relId of followed) {
    for (const b of r.religions[relId]?.beliefs ?? []) {
      if (ruleset.beliefs[b]?.kind !== 'follower') continue;
      for (const e of ruleset.beliefs[b].effects) out.push({ ...e, scope: `religion:${relId}`, source: { kind: 'belief', id: b } });
    }
  }
  for (const own of Object.values(r.religions).filter((x) => x.founder === factionId)) {
    const holy = state.cities?.[own.holyCity];
    const count = followerCities(state, own.id);
    for (const b of own.beliefs) {
      const def = ruleset.beliefs[b];
      if (def?.kind !== 'founder') continue;
      for (const e of def.effects) {
        if (def.perFollowerCity) {
          const scope = holy?.faction === factionId ? 'thisCity' : 'capital';
          if (count) out.push({ ...e, amount: e.amount * count, scope, source: { kind: 'belief', id: b, city: holy?.id } });
        } else out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'belief', id: b } });
      }
    }
  }
  return out;
}

/** Items this faction may buy with faith (faithPurchase effects). */
export function faithTargets(state, ruleset, factionId) {
  return new Set(effectsFor(state, ruleset, factionId).filter((e) => e.effect === 'faithPurchase').map((e) => e.target));
}

// ---------- Commands ----------

export const choosePantheon = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    if (pantheonOf(state, cmd.faction)) return refuse('hasPantheon', 'You already have a pantheon');
    if (ruleset.beliefs?.[cmd.belief]?.kind !== 'pantheon') return refuse('badBelief', 'That is not a pantheon belief');
    if (takenBeliefs(state).has(cmd.belief)) return refuse('beliefTaken', 'Someone already has that belief');
    if ((factionOf(state, cmd.faction).stocks.faith ?? 0) < pantheonFaith(state, ruleset)) return refuse('notEnoughFaith', 'Not enough faith');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    factionOf(state, cmd.faction).stocks.faith -= pantheonFaith(state, ruleset);
    rel(state).pantheons[cmd.faction] = cmd.belief;
    events.push({ type: 'pantheonChosen', faction: cmd.faction, belief: cmd.belief, global: true });
  },
};

/** Cities that could be a holy city: your own, with one of the buildings in foundNeedsBuilding. */
export function holyCityOptions(state, ruleset, factionId) {
  const need = tun(ruleset).foundNeedsBuilding ?? ['shrine', 'temple'];
  return Object.values(state.cities ?? {}).filter((c) => c.faction === factionId && c.buildings.some((b) => need.includes(b))).map((c) => c.id);
}

export const foundReligion = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    if (foundedBy(state, cmd.faction)) return refuse('hasReligion', 'You have already founded a religion');
    if (!pantheonOf(state, cmd.faction)) return refuse('needsPantheon', 'Choose a pantheon first');
    if (Object.keys(state.religion?.religions ?? {}).length >= religionLimit(state, ruleset)) return refuse('noReligionsLeft', 'Every religion has been founded');
    if (!ruleset.religions?.[cmd.religion] || state.religion?.religions?.[cmd.religion]) return refuse('religionTaken', 'That religion is not available');
    const taken = takenBeliefs(state);
    if (ruleset.beliefs?.[cmd.follower]?.kind !== 'follower' || taken.has(cmd.follower)) return refuse('badBelief', 'Choose a free follower belief');
    if (ruleset.beliefs?.[cmd.founder]?.kind !== 'founder' || taken.has(cmd.founder)) return refuse('badBelief', 'Choose a free founder belief');
    if (!holyCityOptions(state, ruleset, cmd.faction).includes(cmd.city)) return refuse('needsHolyCity', 'Found it in a city with a shrine or temple');
    if (cmd.name !== undefined && (typeof cmd.name !== 'string' || !cmd.name.trim() || cmd.name.length > 30)) return refuse('badName', 'Give the religion a name of up to 30 letters');
    if ((factionOf(state, cmd.faction).stocks.faith ?? 0) < foundFaith(state, ruleset)) return refuse('notEnoughFaith', 'Not enough faith');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    factionOf(state, cmd.faction).stocks.faith -= foundFaith(state, ruleset);
    const r = { id: cmd.religion, name: cmd.name?.trim() ?? null, founder: cmd.faction, holyCity: cmd.city, beliefs: [cmd.follower, cmd.founder], founded: state.turn };
    rel(state).religions[cmd.religion] = r;
    const city = state.cities[cmd.city];
    convert(city, cmd.religion, city.pop);
    events.push({ type: 'religionFounded', faction: cmd.faction, religion: cmd.religion, name: r.name, city: cmd.city, global: true });
  },
};

/** Faith price of an item in a city, or null if it cannot be bought with faith there. */
export function faithPrice(state, ruleset, city, item) {
  if (item?.kind === 'unit' && ruleset.units?.[item.id]?.faithOnly) {
    const mine = foundedBy(state, city.faction);
    if (!mine || majorityOf(city) !== mine.id) return null;
    return missionaryFaith(state, ruleset);
  }
  if (item?.kind === 'building' && faithTargets(state, ruleset, city.faction).has(item.id)) {
    const def = ruleset.buildings?.[item.id];
    if (!def || city.buildings.includes(item.id)) return null;
    return Math.round(def.cost * (tun(ruleset).faithPerProduction ?? 2) * speedMultiplier(state, ruleset));
  }
  return null;
}

export const buyWithFaith = {
  validate(state, cmd, ruleset, deps = {}) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const city = state.cities?.[cmd.city];
    if (!city || city.faction !== cmd.faction) return refuse('notYourCity', 'That is not your city');
    const price = faithPrice(state, ruleset, city, cmd.item);
    if (price === null) return refuse('cannotBuyWithFaith', 'That cannot be bought with faith here');
    if (cmd.item.kind === 'building' && deps.canBuild && !deps.canBuild(state, ruleset, city, cmd.item)) return refuse('cannotBuyWithFaith', 'That cannot be built here');
    if ((factionOf(state, cmd.faction).stocks.faith ?? 0) < price) return refuse('notEnoughFaith', 'Not enough faith');
    if (cmd.item.kind === 'unit') {
      const spots = [city.tile, ...neighbourCache(state.map)[city.tile].filter((j) => j >= 0)];
      if (!spots.some((t) => canStand(state, ruleset, cmd.item.id, cmd.faction, t))) return refuse('noRoom', 'There is no room for a new unit');
    }
    return null;
  },
  apply(state, cmd, events, ruleset, deps = {}) {
    const city = state.cities[cmd.city];
    const price = faithPrice(state, ruleset, city, cmd.item);
    factionOf(state, cmd.faction).stocks.faith -= price;
    if (cmd.item.kind === 'unit') {
      const spots = [city.tile, ...neighbourCache(state.map)[city.tile].filter((j) => j >= 0)];
      const spot = spots.find((t) => canStand(state, ruleset, cmd.item.id, cmd.faction, t));
      const unit = createUnit(state, ruleset, cmd.item.id, cmd.faction, spot);
      unit.religion = foundedBy(state, cmd.faction).id;
      unit.moves = 0;
      events.push({ type: 'unitBuilt', city: city.id, unit: unit.id, unitType: unit.type, faction: cmd.faction, tile: spot, bought: true, faith: true });
    } else {
      events.push(...(deps.completeItem?.(state, ruleset, city, cmd.item) ?? []));
    }
  },
};

/** The city a missionary can preach to from where it stands: on it or next to it. */
export function preachTarget(state, unit) {
  const near = [unit.tile, ...neighbourCache(state.map)[unit.tile].filter((j) => j >= 0)];
  return Object.values(state.cities ?? {}).filter((c) => near.includes(c.tile)).sort((a, b) => (a.tile === unit.tile ? -1 : 0) - (b.tile === unit.tile ? -1 : 0) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

export const spreadReligion = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const unit = state.units?.[cmd.unit];
    if (!unit || unit.faction !== cmd.faction) return refuse('notYourUnit', 'That is not your unit');
    if (!ruleset.units[unit.type]?.faithOnly || !unit.religion) return refuse('notMissionary', 'Only missionaries spread religion');
    if (unit.moves <= 0) return refuse('noMoves', 'No moves left this turn');
    const city = preachTarget(state, unit);
    if (!city) return refuse('noCityNear', 'Move next to a city first');
    if ((city.followers?.[unit.religion] ?? 0) >= city.pop) return refuse('alreadyConverted', 'Everyone there already follows your religion');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    const city = preachTarget(state, unit);
    const before = majorityOf(city);
    const n = convert(city, unit.religion, tun(ruleset).missionaryFollowers ?? 2);
    unit.charges = (unit.charges ?? 1) - 1;
    unit.moves = 0;
    events.push({ type: 'religionSpread', unit: unit.id, faction: unit.faction, city: city.id, name: city.name, religion: unit.religion, converted: n });
    if (majorityOf(city) !== before) events.push({ type: 'cityConverted', city: city.id, name: city.name, faction: city.faction, religion: majorityOf(city), from: before });
    if (unit.charges <= 0) {
      delete state.units[unit.id];
      events.push({ type: 'unitDisbanded', reason: 'charges', unit: unit.id, unitType: unit.type, faction: unit.faction, tile: unit.tile });
    }
  },
};
