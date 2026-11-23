// The map generator (docs/PLAN.md section 3.1).
//
// One generator runs every map type; each type is just a recipe in
// mapTypes.json (land share, landmasses, mountain and hill share, rivers).
// Everything comes from the game seed through a named fork, so the same seed
// always makes the same world, and making the map never shifts any other
// dice roll in the game.
//
// Steps: elevation (noise shaped by the recipe) -> land and sea at exactly
// the target share -> mountains and hills -> lakes, coast and ocean ->
// temperature and moisture -> terrain by climate -> rivers along hex edges
// -> features -> resources -> fair start positions -> sea lanes so every
// start can reach every other by land or coast.

import { createRng, forkSeed } from '../core/rng.js';
import { fractalNoise } from '../core/noise.js';
import { hexToPixel } from '../core/hex.js';
import { tileHex, neighbourTiles } from './map.js';

export class MapgenError extends Error {}

const LARGE_AREA = 74 * 46;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Multi-source breadth-first distance (in steps) from every tile where `isSource` holds, capped at `cap`. */
function distanceField(n, nbs, isSource, cap) {
  const dist = new Array(n).fill(cap);
  const queue = [];
  for (let i = 0; i < n; i += 1) if (isSource(i)) { dist[i] = 0; queue.push(i); }
  for (let h = 0; h < queue.length; h += 1) {
    const i = queue[h];
    if (dist[i] >= cap) continue;
    for (const j of nbs[i]) if (j >= 0 && dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; queue.push(j); }
  }
  return dist;
}

/**
 * Build a map.
 * @param {object} ruleset  the merged ruleset (terrain, features, resources, mapSizes, mapTypes, tuning)
 * @param {object} opts     { seed, size, type, factions, resources, seaLevel, age }
 */
export function generateMap(ruleset, opts) {
  const sizeDef = ruleset.mapSizes?.[opts.size];
  const typeDef = ruleset.mapTypes?.[opts.type];
  if (!sizeDef) throw new MapgenError(`Unknown map size "${opts.size}"`);
  if (!typeDef) throw new MapgenError(`Unknown map type "${opts.type}"`);
  const tuning = ruleset.tuning.mapgen;
  const recipe = typeDef.recipe;
  const W = sizeDef.width;
  const H = sizeDef.height;
  const N = W * H;
  const factions = opts.factions ?? sizeDef.factions;
  const rng = createRng(forkSeed(opts.seed, 'map'));
  const seeds = { elev: rng.int(1, 2 ** 30), ridge: rng.int(1, 2 ** 30), hill: rng.int(1, 2 ** 30), temp: rng.int(1, 2 ** 30), moist: rng.int(1, 2 ** 30) };
  const ageFactor = tuning.ages?.[opts.age ?? 'standard'] ?? 1;
  const seaShift = tuning.seaLevels?.[opts.seaLevel ?? 'normal'] ?? 0;

  // Geometry: every tile's neighbours and position (pixel space, scaled so the map is 1 wide).
  const map = { width: W, height: H, size: opts.size, type: opts.type };
  const hexes = Array.from({ length: N }, (_, i) => tileHex(map, i));
  const nbs = hexes.map((_, i) => neighbourTiles(map, i));
  const span = hexToPixel({ q: W - 1, r: 0 }, 1).x + 1;
  const px = new Array(N);
  const py = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const p = hexToPixel(hexes[i], 1);
    px[i] = p.x / span;
    py[i] = p.y / span;
  }
  const yMax = hexToPixel({ q: 0, r: H - 1 }, 1).y / span;

  // 1. Elevation: noise plus the recipe's shape.
  const k = recipe.landmasses;
  const centres = [];
  const minSep = 0.55 / Math.sqrt(k);
  for (let tries = 0; centres.length < k && tries < 500; tries += 1) {
    const c = { x: 0.15 + rng.next() * 0.7, y: yMax * (0.2 + rng.next() * 0.6) };
    if (centres.every((o) => (o.x - c.x) ** 2 + (o.y - c.y) ** 2 > minSep * minSep) || tries > 400) centres.push(c);
  }
  const area = yMax; // the map is 1 wide and yMax tall
  const blobRadius = Math.sqrt((recipe.landShare * area) / (k * 3.14159)) * 1.5;
  const noiseScale = 7 + k * 0.6;
  const elev = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const n = fractalNoise(px[i] * noiseScale, py[i] * noiseScale, seeds.elev, 5);
    let shape;
    if (recipe.inlandSea) {
      const dx = px[i] - 0.5;
      const dy = py[i] - yMax / 2;
      const d = Math.sqrt(dx * dx + dy * dy * 3);
      shape = clamp01(d / 0.45);
    } else {
      shape = 0;
      for (const c of centres) {
        const dx = px[i] - c.x;
        const dy = py[i] - c.y;
        shape = Math.max(shape, 1 - Math.sqrt(dx * dx + dy * dy) / blobRadius);
      }
      const edge = Math.min(px[i], 1 - px[i], py[i], yMax - py[i]);
      if (edge < 0.05) shape -= (0.05 - edge) * 12;
    }
    elev[i] = n * 0.55 + shape * 0.75;
  }

  // 2. Land and sea at exactly the target share.
  const target = Math.round(clamp01(recipe.landShare - seaShift) * N);
  const order = elev.map((e, i) => [e, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const land = new Array(N).fill(false);
  for (let j = 0; j < target; j += 1) land[order[j][1]] = true;

  // 3. Mountains and hills, by their own noise layered on height.
  const landTiles = order.slice(0, target).map((x) => x[1]);
  const mountain = new Array(N).fill(false);
  const hills = new Array(N).fill(0);
  const ridge = (i) => elev[i] * 0.4 + fractalNoise(px[i] * 18, py[i] * 18, seeds.ridge, 3) * 0.6;
  const byRidge = landTiles.slice().sort((a, b) => ridge(b) - ridge(a) || a - b);
  const mountains = Math.round(landTiles.length * recipe.mountainShare * ageFactor);
  for (let j = 0; j < mountains; j += 1) mountain[byRidge[j]] = true;
  const hillScore = (i) => fractalNoise(px[i] * 22, py[i] * 22, seeds.hill, 3) + (nbs[i].some((x) => x >= 0 && mountain[x]) ? 0.25 : 0);
  const flat = landTiles.filter((i) => !mountain[i]).sort((a, b) => hillScore(b) - hillScore(a) || a - b);
  const hillCount = Math.round(landTiles.length * (recipe.hillShare ?? 0.18) * ageFactor);
  for (let j = 0; j < hillCount && j < flat.length; j += 1) hills[flat[j]] = 1;

  // 4. Water: small enclosed bodies are lakes, water touching land is coast, the rest ocean.
  const roleOf = new Array(N);
  const seen = new Array(N).fill(false);
  for (let i = 0; i < N; i += 1) {
    if (land[i] || seen[i]) continue;
    const body = [i];
    seen[i] = true;
    let touchesEdge = false;
    for (let h = 0; h < body.length; h += 1) {
      const t = body[h];
      for (const j of nbs[t]) {
        if (j < 0) { touchesEdge = true; continue; }
        if (!land[j] && !seen[j]) { seen[j] = true; body.push(j); }
      }
    }
    const isLake = !touchesEdge && body.length <= (tuning.lakeMaxSize ?? 6);
    for (const t of body) roleOf[t] = isLake ? 'lake' : (nbs[t].some((j) => j >= 0 && land[j]) ? 'coast' : 'ocean');
  }
  for (let i = 0; i < N; i += 1) if (land[i]) roleOf[i] = mountain[i] ? 'mountain' : 'land';

  // 5. Climate.
  const waterDist = distanceField(N, nbs, (i) => !land[i], 4);
  const temp = new Array(N);
  const moist = new Array(N);
  for (let i = 0; i < N; i += 1) {
    const lat = Math.abs(hexes[i].r / (H - 1) - 0.5) * 2;
    temp[i] = clamp01(1.05 - lat * 1.1 + (fractalNoise(px[i] * 6, py[i] * 6, seeds.temp, 3) - 0.5) * 0.3 - hills[i] * 0.05);
    moist[i] = clamp01(fractalNoise(px[i] * 9, py[i] * 9, seeds.moist, 4) * 0.95 + (waterDist[i] <= 1 ? 0.15 : waterDist[i] <= 2 ? 0.07 : -0.05));
  }

  // 6. Terrain by role and climate (all from data).
  const terrainList = Object.values(ruleset.terrain);
  const byRole = (role) => terrainList.filter((t) => t.mapgen?.role === role);
  const water = { ocean: byRole('ocean')[0], coast: byRole('coast')[0], lake: byRole('lake')[0] };
  water.coast ??= water.ocean;
  water.lake ??= water.coast;
  const mountainTerrain = byRole('mountain')[0];
  const climates = byRole('land').filter((t) => Number.isFinite(t.mapgen.temperature) && Number.isFinite(t.mapgen.moisture));
  if (!water.ocean || !mountainTerrain || !climates.length) throw new MapgenError('The ruleset needs ocean, mountain and land terrain with mapgen settings');
  const terrainIds = terrainList.map((t) => t.id);
  const tIndex = Object.fromEntries(terrainIds.map((id, i) => [id, i]));
  const terrain = new Array(N);
  for (let i = 0; i < N; i += 1) {
    let t;
    if (roleOf[i] === 'land') {
      let best = Infinity;
      for (const c of climates) {
        const d = ((c.mapgen.temperature - temp[i]) * 1.4) ** 2 + (c.mapgen.moisture - moist[i]) ** 2;
        if (d < best) { best = d; t = c; }
      }
      if (!t.allowsHills) hills[i] = 0;
    } else if (roleOf[i] === 'mountain') {
      t = mountainTerrain;
    } else {
      t = water[roleOf[i]];
    }
    terrain[i] = tIndex[t.id];
  }
  const isWater = (i) => roleOf[i] === 'ocean' || roleOf[i] === 'coast' || roleOf[i] === 'lake';

  // 7. Rivers, corner to corner along hex edges, downhill until they meet water.
  const river = new Array(N).fill(0);
  const rivers = [];
  const height = (i) => elev[i] + (mountain[i] ? 0.5 : 0) + hills[i] * 0.1;
  const dirTo = (a, b) => nbs[a].indexOf(b);
  const common = (a, b) => nbs[a].filter((x) => x >= 0 && nbs[b].includes(x));
  const edgeHasRiver = (a, b) => (river[a] & (1 << dirTo(a, b))) !== 0;
  const vertexKey = (v) => v.slice().sort((x, y) => x - y).join(',');
  const touchesRiver = (v) => edgeHasRiver(v[0], v[1]) || edgeHasRiver(v[1], v[2]) || edgeHasRiver(v[0], v[2]);
  const riverAt = new Map(); // vertex key -> river index, for rivers that join others
  const wanted = Math.round(recipe.rivers * (N / LARGE_AREA));
  const sources = landTiles.filter((i) => !mountain[i] && (hills[i] || nbs[i].some((j) => j >= 0 && mountain[j])) && waterDist[i] >= 3);
  // Two passes over the shuffled sources: first only sources well away from
  // existing rivers (so fresh water is spread across the map), then any.
  const shuffled = rng.shuffle(sources);
  const nearRiver = (a, radius) => {
    const seenNear = new Set([a]);
    let frontier = [a];
    for (let k = 0; k <= radius; k += 1) {
      for (const t of frontier) if (river[t] !== 0) return true;
      const next = [];
      for (const t of frontier) for (const u of nbs[t]) if (u >= 0 && !seenNear.has(u)) { seenNear.add(u); next.push(u); }
      frontier = next;
    }
    return false;
  };
  const attempts = shuffled.map((a) => [a, true]).concat(shuffled.map((a) => [a, false]));
  for (let s = 0; s < attempts.length && rivers.length < wanted; s += 1) {
    const [a, spaced] = attempts[s];
    if (spaced && nearRiver(a, 4)) continue;
    const d = rng.int(0, 5);
    const b = nbs[a][d];
    const c = nbs[a][(d + 1) % 6];
    if (b < 0 || c < 0 || isWater(b) || isWater(c)) continue;
    let cur = [a, b, c];
    if (touchesRiver(cur)) continue;
    const visited = new Set([vertexKey(cur)]);
    const edges = [];
    let level = height(a) + height(b) + height(c);
    let mouth = -1;
    let joins = -1;
    for (let step = 0; step < (tuning.riverMaxLength ?? 40); step += 1) {
      const wet = cur.find((x) => isWater(x));
      if (wet !== undefined) { mouth = wet; break; }
      if (edges.length && riverAt.has(vertexKey(cur))) { joins = riverAt.get(vertexKey(cur)); break; }
      let best = null;
      for (const [x, y, z] of [[cur[0], cur[1], cur[2]], [cur[1], cur[2], cur[0]], [cur[0], cur[2], cur[1]]]) {
        if (edgeHasRiver(x, y)) continue;
        const other = common(x, y).find((t) => t !== z);
        if (other === undefined) continue;
        const next = [x, y, other];
        const key = vertexKey(next);
        if (visited.has(key)) continue;
        if (mountain[x] && mountain[y]) continue;
        const score = height(x) + height(y) + height(other) + rng.next() * 0.02;
        if (!best || score < best.score) best = { score, x, y, next, key };
      }
      if (!best || best.score > level + 0.12) break;
      level = Math.min(level, best.score);
      edges.push([best.x, best.y]);
      visited.add(best.key);
      cur = best.next;
    }
    if ((mouth < 0 && joins < 0) || edges.length < (tuning.riverMinLength ?? 3)) continue;
    const index = rivers.length;
    for (const [x, y] of edges) {
      river[x] |= 1 << dirTo(x, y);
      river[y] |= 1 << dirTo(y, x);
    }
    // Remember every vertex on this river so later rivers can join it.
    for (const [x, y] of edges) {
      for (const t of common(x, y)) riverAt.set(vertexKey([x, y, t]), index);
    }
    rivers.push({ edges: edges.map(([x, y]) => [x, dirTo(x, y)]), mouth: joins >= 0 ? rivers[joins].mouth : mouth, joins });
  }

  // 8. Features, in data order, by climate window and chance.
  const featureList = Object.values(ruleset.features ?? {}).filter((f) => f.mapgen);
  const featureIds = Object.keys(ruleset.features ?? {});
  const fIndex = Object.fromEntries(featureIds.map((id, i) => [id, i]));
  const feature = new Array(N).fill(-1);
  for (let i = 0; i < N; i += 1) {
    if (roleOf[i] === 'mountain' || roleOf[i] === 'ocean') continue;
    const tid = terrainIds[terrain[i]];
    for (const f of featureList) {
      const g = f.mapgen;
      if (f.validTerrain && !f.validTerrain.includes(tid)) continue;
      if (g.minTemperature !== undefined && temp[i] < g.minTemperature) continue;
      if (g.maxTemperature !== undefined && temp[i] > g.maxTemperature) continue;
      if (g.minMoisture !== undefined && moist[i] < g.minMoisture) continue;
      if (g.maxMoisture !== undefined && moist[i] > g.maxMoisture) continue;
      if (g.needsRiver && river[i] === 0) continue;
      if (g.avoidsRiver && river[i] !== 0) continue;
      if (g.flatOnly && hills[i]) continue;
      if (g.nearLand && !nbs[i].some((j) => j >= 0 && land[j])) continue;
      if (rng.next() < g.chance) { feature[i] = fIndex[f.id]; break; }
    }
  }

  // 9. Resources, by frequency, only where their data allows.
  const resourceList = Object.values(ruleset.resources ?? {});
  const resourceIds = resourceList.map((r) => r.id);
  const resource = new Array(N).fill(-1);
  const level = tuning.resourceLevels?.[opts.resources ?? 'standard'] ?? 1;
  resourceList.forEach((res, ri) => {
    const valid = [];
    for (let i = 0; i < N; i += 1) if (resource[i] < 0 && resourceAllowed(res, terrainIds[terrain[i]], feature[i] >= 0 ? featureIds[feature[i]] : null, hills[i], roleOf[i])) valid.push(i);
    const count = Math.min(valid.length, Math.round(landTiles.length * (tuning.resourceDensity ?? 0.02) * (res.frequency ?? 1) * level));
    const chosen = rng.shuffle(valid).slice(0, count);
    for (const i of chosen) resource[i] = ri;
  });

  map.terrainIds = terrainIds;
  map.featureIds = featureIds;
  map.resourceIds = resourceIds;
  map.terrain = terrain;
  map.hills = hills;
  map.feature = feature;
  map.resource = resource;
  map.river = river;
  map.rivers = rivers;

  // 10. Fair starts.
  map.starts = placeStarts(map, ruleset, { factions, spacing: sizeDef.startSpacing, nbs, roleOf, rng, tuning });

  // 11. Sea lanes: make sure every start can reach the first by land or coast.
  connectStarts(map, ruleset, { nbs, roleOf, water });
  return map;
}

export function resourceAllowed(res, terrainId, featureId, hilly, role) {
  if (role === 'mountain' || role === 'ocean') return false;
  if (res.validTerrain && !res.validTerrain.includes(terrainId)) return false;
  if (featureId !== null && !(res.validFeatures ?? []).includes(featureId)) return false;
  if (res.needsHills && !hilly) return false;
  return true;
}

/** Food a tile gives before any improvement: terrain + feature + resource. */
export function tileFood(map, ruleset, i) {
  const t = ruleset.terrain[map.terrainIds[map.terrain[i]]];
  const f = map.feature[i] >= 0 ? ruleset.features[map.featureIds[map.feature[i]]] : null;
  const r = map.resource[i] >= 0 ? ruleset.resources[map.resourceIds[map.resource[i]]] : null;
  return (t.yields?.food ?? 0) + (f?.yields?.food ?? 0) + (r?.yields?.food ?? 0);
}

function within(nbs, start, radius) {
  const out = [start];
  const dist = new Map([[start, 0]]);
  for (let h = 0; h < out.length; h += 1) {
    const i = out[h];
    if (dist.get(i) >= radius) continue;
    for (const j of nbs[i]) if (j >= 0 && !dist.has(j)) { dist.set(j, dist.get(i) + 1); out.push(j); }
  }
  return { tiles: out, dist };
}

function startQuality(map, ruleset, i, ctx) {
  const radius = ctx.tuning.startRadius ?? 3;
  const { tiles } = within(ctx.nbs, i, radius);
  let food = 0;
  let fresh = false;
  let score = 0;
  for (const t of tiles) {
    const f = tileFood(map, ruleset, t);
    if (f >= (ctx.tuning.startFoodYield ?? 2)) food += 1;
    if (map.river[t] !== 0 || ctx.roleOf[t] === 'lake') fresh = true;
    if (ctx.roleOf[t] === 'land') score += 1;
    if (map.resource[t] >= 0) score += 1;
  }
  return { food, fresh, score: score + food * 2 + (map.river[i] ? 3 : 0) };
}

export function placeStarts(map, ruleset, ctx) {
  const N = map.width * map.height;
  const candidates = [];
  for (let i = 0; i < N; i += 1) {
    if (ctx.roleOf[i] !== 'land') continue;
    const t = ruleset.terrain[map.terrainIds[map.terrain[i]]];
    if ((t.yields?.food ?? 0) + (t.yields?.production ?? 0) < 2) continue; // not on snow or bare desert
    const q = startQuality(map, ruleset, i, ctx);
    candidates.push({ i, ...q, ok: q.food >= (ctx.tuning.startMinFoodTiles ?? 2) && q.fresh, jitter: ctx.rng.next() });
  }
  candidates.sort((a, b) => (b.score + b.jitter * 2) - (a.score + a.jitter * 2) || a.i - b.i);
  const dist = (a, b) => {
    const x = tileHex(map, a);
    const y = tileHex(map, b);
    const dq = x.q - y.q;
    const dr = x.r - y.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  };
  // Spread-out fallback: start from the best spot, then keep taking the spot
  // furthest from every start so far (better spots win ties).
  const spread = (pool, spacing) => {
    if (!pool.length) return null;
    const starts = [pool[0].i];
    const nearest = pool.map((c) => dist(c.i, pool[0].i));
    while (starts.length < ctx.factions) {
      let best = -1;
      for (let k = 0; k < pool.length; k += 1) if (best < 0 || nearest[k] > nearest[best]) best = k;
      if (best < 0 || nearest[best] < spacing) return null;
      starts.push(pool[best].i);
      for (let k = 0; k < pool.length; k += 1) nearest[k] = Math.min(nearest[k], dist(pool[k].i, pool[best].i));
    }
    return starts;
  };
  // Try full fairness and spacing first, then relax spacing, then the food and water rule.
  for (const strict of [true, false]) {
    const pool = strict ? candidates.filter((c) => c.ok) : candidates;
    for (let spacing = ctx.spacing; spacing >= 3; spacing -= 1) {
      const starts = [];
      for (const c of pool) {
        if (starts.every((s) => dist(s, c.i) >= spacing)) starts.push(c.i);
        if (starts.length === ctx.factions) return starts;
      }
      const spaced = spread(pool, spacing);
      if (spaced) return spaced;
    }
  }
  throw new MapgenError(`Could not place ${ctx.factions} starts on this map`);
}

function connectStarts(map, ruleset, ctx) {
  const N = map.width * map.height;
  const coastIndex = map.terrainIds.indexOf(ctx.water.coast.id);
  const passable = (i) => ctx.roleOf[i] === 'land' || ctx.roleOf[i] === 'coast' || ctx.roleOf[i] === 'lake';
  const component = () => {
    const comp = new Array(N).fill(false);
    const queue = [map.starts[0]];
    comp[map.starts[0]] = true;
    for (let h = 0; h < queue.length; h += 1) {
      for (const j of ctx.nbs[queue[h]]) if (j >= 0 && !comp[j] && passable(j)) { comp[j] = true; queue.push(j); }
    }
    return comp;
  };
  let comp = component();
  for (const s of map.starts.slice(1)) {
    if (comp[s]) continue;
    // Shortest path across ocean (not mountains) from the connected area to this start.
    const prev = new Array(N).fill(-2);
    const queue = [];
    for (let i = 0; i < N; i += 1) if (comp[i]) { prev[i] = -1; queue.push(i); }
    for (let h = 0; h < queue.length && prev[s] === -2; h += 1) {
      for (const j of ctx.nbs[queue[h]]) {
        if (j >= 0 && prev[j] === -2 && ctx.roleOf[j] !== 'mountain') { prev[j] = queue[h]; queue.push(j); }
      }
    }
    for (let i = s; i >= 0 && prev[i] !== -1; i = prev[i]) {
      if (ctx.roleOf[i] === 'ocean') { ctx.roleOf[i] = 'coast'; map.terrain[i] = coastIndex; }
    }
    comp = component();
  }
}
