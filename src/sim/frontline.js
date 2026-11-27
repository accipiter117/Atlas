// The front line (phase 19): an optional system for two-sided wars, switched
// on only by tuning.frontline.enabled (base-ancient and the Witcher leave it
// off, so their games are untouched).
//
// - Two sides: each faction's frontSide (0 or 1) in factions.json; the two
//   sides start at war.
// - Control: every land tile has a control value from -100 (side 1 holds it)
//   to +100 (side 0). Each round, armies push it: every fighting unit adds its
//   strength (tuning.presenceStrength per point) to the tiles within
//   presenceRange, falling off with distance, and the difference between the
//   sides moves control by up to maxStep. Control also spreads a little to
//   neighbours (spread), so the front is a line rather than a scatter, and a
//   side's cities hold their own tiles at full control.
// - Battles push the front too: the side that came off better (a smaller
//   share of health lost) shifts control at the battlefield and around it by
//   battleShift, scaled by how much better it did.
// - Sites (sites.json, placed by the map preset): a factory or power plant
//   belongs to the side whose control at its tile reaches captureAt; its
//   effects then apply to every faction on that side.
// - Settling is off: settlers cannot be trained and cities cannot be founded
//   (the map preset places them), and there are no raiders.
// - Maps come from mapPresets.json (fixed maps, built by buildPresetMap).

import { neighbourCache } from './map.js';
import { distance } from './borders.js';

const tun = (ruleset) => ruleset?.tuning?.frontline ?? {};

/** Is the front-line system on for these rules? */
export const frontlineOn = (ruleset) => tun(ruleset).enabled === true;

/** The side (0 or 1) a faction fights on: its civ's frontSide, else its seat. */
export function sideOf(state, ruleset, factionId) {
  const i = state.factions.findIndex((f) => f.id === factionId);
  if (i < 0) return null;
  const side = ruleset.factions?.[state.factions[i].civ]?.frontSide;
  return side === 0 || side === 1 ? side : i % 2;
}

/** The fixed map of a preset, in the same shape the map generator makes. */
export function buildPresetMap(ruleset, presetId) {
  const p = ruleset.mapPresets?.[presetId];
  if (!p) throw new Error(`No map preset "${presetId}"`);
  const terrainIds = Object.keys(ruleset.terrain);
  const featureIds = Object.keys(ruleset.features ?? {});
  const width = Math.max(...p.rows.map((r) => r.length));
  const height = p.rows.length;
  const map = { width, height, size: 'preset', type: presetId, preset: presetId, terrainIds, featureIds, resourceIds: Object.keys(ruleset.resources ?? {}),
    terrain: [], hills: [], feature: [], resource: [], river: [], rivers: [], starts: [] };
  for (const row of p.rows) {
    for (let c = 0; c < width; c += 1) {
      const cell = p.legend[row[c] ?? row.at(-1)] ?? p.legend[Object.keys(p.legend)[0]];
      map.terrain.push(Math.max(0, terrainIds.indexOf(cell.terrain)));
      map.hills.push(cell.hills ? 1 : 0);
      map.feature.push(cell.feature ? featureIds.indexOf(cell.feature) : -1);
      // K4: a legend letter may carry a resource (petrusite, fuel).
      map.resource.push(cell.resource ? Math.max(-1, map.resourceIds.indexOf(cell.resource)) : -1);
      map.river.push(0);
    }
  }
  // Start tiles: each side's first city, so anything that asks for starts still works.
  for (const side of [0, 1]) {
    const c = p.cities.find((x) => x.side === side);
    if (c) map.starts.push(c.row * width + c.col);
  }
  return map;
}

/** A tile is land (water and mountains never hold a front). */
function landTile(state, ruleset, t) {
  const terr = ruleset.terrain[state.map.terrainIds[state.map.terrain[t]]];
  return terr && !terr.water;
}

/**
 * Set up a front-line game on a preset map (createGame calls this once the
 * map exists): cities, units, sites, the starting front, and both sides at war.
 */
export function setUpFrontline(state, ruleset, presetId, { foundCity, createUnit, assignCitizens }) {
  const p = ruleset.mapPresets[presetId];
  const w = state.map.width;
  const bySide = [0, 1].map((side) => state.factions.filter((f) => sideOf(state, ruleset, f.id) === side));
  const firstOf = (side) => bySide[side][0]?.id ?? null;
  // K4: a preset may give a base or unit to a named faction (civ); without that faction in the game, its side's first.
  const ownerOf = (x) => (x.civ ? state.factions.find((f) => f.civ === x.civ)?.id : null) ?? firstOf(x.side);
  for (const c of p.cities) {
    const owner = ownerOf(c);
    if (!owner) continue;
    const { city } = foundCity(state, ruleset, owner, c.row * w + c.col);
    if (c.nameKey && ruleset.text?.[c.nameKey]) city.name = ruleset.text[c.nameKey];
    if (c.pop) { city.pop = c.pop; assignCitizens(state, ruleset, city); }
  }
  for (const u of p.units ?? []) {
    const owner = ownerOf(u);
    if (owner && ruleset.units[u.type]) createUnit(state, ruleset, u.type, owner, u.row * w + u.col);
  }
  // Control starts split at the front column, softened over a few tiles.
  const soft = tun(ruleset).startSoftness ?? 25;
  const control = new Array(w * state.map.height).fill(0);
  for (let t = 0; t < control.length; t += 1) {
    if (!landTile(state, ruleset, t)) continue;
    const col = t % w;
    // K2: a world may start wholly one side's, or nobody's.
    if (p.start === 'side0') control[t] = 100;
    else if (p.start === 'side1') control[t] = -100;
    else if (p.start === 'neutral') control[t] = 0;
    else control[t] = Math.max(-100, Math.min(100, Math.round((p.front - col) * soft)));
  }
  const sites = {};
  for (const s of p.sites ?? []) {
    const t = s.row * w + s.col;
    sites[t] = { site: s.site, tile: t, owner: control[t] > 0 ? 0 : control[t] < 0 ? 1 : null };
  }
  state.frontline = { control, sites };
  // The two sides start at war.
  for (const a of bySide[0]) for (const b of bySide[1]) {
    const key = [a.id, b.id].sort().join('|');
    if (!state.wars.includes(key)) state.wars.push(key);
  }
}

/** Sum of each side's fighting presence on every tile (strength, falling off with distance). */
function presence(state, ruleset) {
  const t = tun(ruleset);
  const range = t.presenceRange ?? 2;
  const out = [new Float64Array(state.map.terrain.length), new Float64Array(state.map.terrain.length)];
  const sides = Object.fromEntries(state.factions.map((f) => [f.id, sideOf(state, ruleset, f.id)]));
  const nbs = neighbourCache(state.map);
  for (const u of Object.values(state.units ?? {})) {
    const side = sides[u.faction];
    if (side === null || side === undefined) continue;
    const def = ruleset.units[u.type];
    if (!def?.strength || ruleset.unitClasses[def.class]?.civilian) continue;
    const power = (def.strength * (u.hp ?? 100)) / 100 * (t.presenceStrength ?? 0.05);
    // Breadth-first out to `range`: full strength on the tile, halving with each step.
    let frontier = [u.tile];
    const seen = new Set(frontier);
    for (let d = 0; d <= range; d += 1) {
      const next = [];
      for (const x of frontier) {
        out[side][x] += power / 2 ** d;
        if (d < range) for (const j of nbs[x]) if (j >= 0 && !seen.has(j)) { seen.add(j); next.push(j); }
      }
      frontier = next;
    }
  }
  return out;
}

/** End of each round: armies push the front, it spreads, cities hold, sites change hands. */
export function frontlineRound(state, ruleset, events) {
  const f = state.frontline;
  if (!f) return;
  const t = tun(ruleset);
  const maxStep = t.maxStep ?? 20;
  const spread = t.spread ?? 0.15;
  const [p0, p1] = presence(state, ruleset);
  const nbs = neighbourCache(state.map);
  const before = f.control;
  const next = before.slice();
  for (let i = 0; i < next.length; i += 1) {
    if (!landTile(state, ruleset, i)) continue;
    const push = Math.max(-maxStep, Math.min(maxStep, (p0[i] - p1[i]) * 100));
    let sum = 0;
    let n = 0;
    for (const j of nbs[i]) if (j >= 0 && landTile(state, ruleset, j)) { sum += before[j]; n += 1; }
    const avg = n ? sum / n : before[i];
    next[i] = Math.max(-100, Math.min(100, Math.round(before[i] + push + (avg - before[i]) * spread)));
  }
  // A side's cities hold their own tile and the ring around it.
  for (const c of Object.values(state.cities ?? {})) {
    const side = sideOf(state, ruleset, c.faction);
    if (side === null) continue;
    const full = side === 0 ? 100 : -100;
    next[c.tile] = full;
    for (const j of nbs[c.tile]) if (j >= 0 && landTile(state, ruleset, j)) next[j] = side === 0 ? Math.max(next[j], 50) : Math.min(next[j], -50);
  }
  f.control = next;
  updateSites(state, ruleset, events);
}

/** Sites belong to whichever side's control at their tile reaches captureAt. */
export function updateSites(state, ruleset, events) {
  const f = state.frontline;
  const at = tun(ruleset).captureAt ?? 50;
  for (const s of Object.values(f.sites)) {
    const c = f.control[s.tile];
    const owner = c >= at ? 0 : c <= -at ? 1 : s.owner;
    if (owner !== s.owner) {
      s.owner = owner;
      events.push({ type: 'siteCaptured', site: s.site, tile: s.tile, side: owner, global: true });
    }
  }
}

/** After a battle: the side that came off better pushes the front at the battlefield. */
export function frontlineBattle(state, ruleset, spec, result, events) {
  const f = state.frontline;
  if (!f) return;
  const t = tun(ruleset);
  const aSide = sideOf(state, ruleset, spec.attacker.faction);
  if (aSide === null) return;
  const lossShare = (units) => {
    const start = units.reduce((n, u) => n + u.hp, 0);
    if (!start) return 0;
    const end = units.reduce((n, u) => n + (result.units.find((r) => r.ref === u.ref)?.hp ?? u.hp), 0);
    return (start - end) / start;
  };
  const aLoss = lossShare(spec.attacker.units);
  const dLoss = spec.defender.city ? (spec.defender.city.hp - (result.city?.hp ?? spec.defender.city.hp)) / Math.max(1, spec.defender.city.hp) : lossShare(spec.defender.units);
  let edge = dLoss - aLoss;
  if (result.winner === 'attacker') edge += t.winBonus ?? 0.5;
  if (result.winner === 'defender') edge -= t.winBonus ?? 0.5;
  const shift = Math.round(Math.max(-1, Math.min(1, edge)) * (t.battleShift ?? 40));
  if (!shift) return;
  const toward = aSide === 0 ? 1 : -1;
  const target = spec.target ?? spec.defender.city?.tile;
  if (target === undefined || target === null) return;
  for (let i = 0; i < f.control.length; i += 1) {
    if (!landTile(state, ruleset, i)) continue;
    const d = distance(state.map, target, i);
    if (d > 1) continue;
    const amount = d === 0 ? shift : Math.round(shift / 2);
    f.control[i] = Math.max(-100, Math.min(100, f.control[i] + amount * toward));
  }
  events.push({ type: 'frontShift', tile: target, side: shift * toward > 0 ? 0 : 1, amount: Math.abs(shift) });
  updateSites(state, ruleset, events);
}

/** The sites a faction's side holds, as effect sources (for the effects registry). */
export function siteEffects(state, ruleset, factionId) {
  const f = state.frontline;
  if (!f) return [];
  const side = sideOf(state, ruleset, factionId);
  const out = [];
  for (const s of Object.values(f.sites)) {
    if (s.owner !== side) continue;
    for (const e of ruleset.sites?.[s.site]?.effects ?? []) out.push({ ...e, scope: e.scope ?? 'everyCity', source: { kind: 'site', id: s.site, tile: s.tile } });
  }
  return out;
}

/** How much of the land each side holds (for the screen and the tests). */
export function frontShares(state, ruleset) {
  const f = state.frontline;
  if (!f) return null;
  let a = 0;
  let b = 0;
  for (let i = 0; i < f.control.length; i += 1) {
    if (!landTile(state, ruleset, i)) continue;
    if (f.control[i] > 0) a += 1; else if (f.control[i] < 0) b += 1;
  }
  return [a, b];
}
