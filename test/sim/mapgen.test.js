import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, resourceAllowed, tileFood, createGame, neighbourTiles, tileHex } from '../../src/sim/index.js';
import { hashValue } from '../../src/core/hash.js';
import { hexDistance } from '../../src/core/hex.js';
import { loadReal } from '../data/helpers.js';

const { ruleset } = await loadReal(['base-ancient']);
const TYPES = Object.keys(ruleset.mapTypes);
const terrainOf = (m, i) => ruleset.terrain[m.terrainIds[m.terrain[i]]];
const water = (m, i) => terrainOf(m, i).water === true;
const role = (m, i) => terrainOf(m, i).mapgen.role;

function checkMap(m, type) {
  const N = m.width * m.height;
  const nbs = Array.from({ length: N }, (_, i) => neighbourTiles(m, i));
  const problems = [];

  // Land share within 5 points of the recipe.
  const land = m.terrain.filter((_, i) => !water(m, i)).length / N;
  if (Math.abs(land - ruleset.mapTypes[type].recipe.landShare) > 0.05) problems.push(`land share ${land.toFixed(3)}`);

  // Resources only where their data allows; features only on valid terrain.
  for (let i = 0; i < N; i += 1) {
    const f = m.feature[i] >= 0 ? m.featureIds[m.feature[i]] : null;
    if (m.resource[i] >= 0) {
      const res = ruleset.resources[m.resourceIds[m.resource[i]]];
      if (!resourceAllowed(res, m.terrainIds[m.terrain[i]], f, m.hills[i], role(m, i))) problems.push(`resource ${res.id} on ${m.terrainIds[m.terrain[i]]}/${f}`);
    }
    if (f && ruleset.features[f].validTerrain && !ruleset.features[f].validTerrain.includes(m.terrainIds[m.terrain[i]])) problems.push(`feature ${f} on ${m.terrainIds[m.terrain[i]]}`);
    if (m.hills[i] && !terrainOf(m, i).allowsHills) problems.push('hills on flat-only terrain');
    // River flags are symmetric: both tiles sharing an edge agree.
    for (let d = 0; d < 6; d += 1) {
      if (!(m.river[i] & (1 << d))) continue;
      const j = nbs[i][d];
      if (j < 0 || !(m.river[j] & (1 << ((d + 3) % 6)))) problems.push(`one-sided river at ${i}`);
      else if (water(m, i) && water(m, j)) problems.push(`river between two water tiles at ${i}`);
    }
  }

  // Rivers run along edges and end in water (directly, or by joining a river that does).
  m.rivers.forEach((river, n) => {
    if (!water(m, river.mouth)) problems.push(`river ${n} mouth is not water`);
    for (let e = 1; e < river.edges.length; e += 1) {
      const [a, d] = river.edges[e - 1];
      const [b, d2] = river.edges[e];
      const pa = [a, nbs[a][d]];
      const pb = [b, nbs[b][d2]];
      if (!pa.some((x) => pb.includes(x))) problems.push(`river ${n} breaks between edges ${e - 1} and ${e}`);
    }
    const [x, d] = river.edges.at(-1);
    const y = nbs[x][d];
    const end = nbs[x].filter((t) => t >= 0 && nbs[y].includes(t));
    if (river.joins < 0 && !end.some((t) => water(m, t))) problems.push(`river ${n} does not reach water`);
    if (river.joins >= 0 && river.joins >= n) problems.push(`river ${n} joins a later river`);
  });

  // Starts: on land, fair, and all reachable by land or coast.
  if (m.starts.length !== ruleset.mapSizes[m.size].factions) problems.push(`${m.starts.length} starts`);
  for (const s of m.starts) {
    if (role(m, s) !== 'land') problems.push(`start on ${role(m, s)}`);
    const near = [];
    for (let i = 0; i < N; i += 1) if (hexDistance(tileHex(m, s), tileHex(m, i)) <= 3) near.push(i);
    if (near.filter((i) => tileFood(m, ruleset, i) >= 2).length < 2) problems.push(`start ${s} lacks food`);
    if (!near.some((i) => m.river[i] !== 0 || role(m, i) === 'lake')) problems.push(`start ${s} lacks fresh water`);
  }
  const passable = (i) => role(m, i) !== 'ocean' && role(m, i) !== 'mountain';
  const seen = new Set([m.starts[0]]);
  const queue = [m.starts[0]];
  for (let h = 0; h < queue.length; h += 1) for (const j of nbs[queue[h]]) if (j >= 0 && !seen.has(j) && passable(j)) { seen.add(j); queue.push(j); }
  for (const s of m.starts) if (!seen.has(s)) problems.push(`start ${s} unreachable`);
  return problems;
}

test('the same seed gives an identical map; a different seed a different one', () => {
  const a = generateMap(ruleset, { seed: 42, size: 'standard', type: 'continents' });
  const b = generateMap(ruleset, { seed: 42, size: 'standard', type: 'continents' });
  const c = generateMap(ruleset, { seed: 43, size: 'standard', type: 'continents' });
  assert.equal(hashValue(a), hashValue(b));
  assert.notEqual(hashValue(a), hashValue(c));
});

for (const type of TYPES) {
  test(`50 seeds of ${type} all make valid maps`, () => {
    const failures = [];
    for (let seed = 1; seed <= 50; seed += 1) {
      const m = generateMap(ruleset, { seed: seed * 7919, size: 'small', type });
      const p = checkMap(m, type);
      if (p.length) failures.push(`seed ${seed * 7919}: ${p.slice(0, 3).join('; ')}`);
    }
    assert.deepEqual(failures, []);
  });
}

test('every type also works on a Large map, with starts at least 9 hexes apart', () => {
  for (const type of TYPES) {
    for (const seed of [11, 222, 3333]) {
      const m = generateMap(ruleset, { seed, size: 'large', type });
      assert.deepEqual(checkMap(m, type), [], `${type} ${seed}`);
      let min = Infinity;
      for (const a of m.starts) for (const b of m.starts) if (a !== b) min = Math.min(min, hexDistance(tileHex(m, a), tileHex(m, b)));
      assert.ok(min >= 9, `${type} seed ${seed}: closest starts ${min} apart`);
    }
  }
});

test('a Huge map generates in under 1.5 seconds', () => {
  for (const type of TYPES) {
    const t0 = performance.now();
    generateMap(ruleset, { seed: 99, size: 'huge', type });
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${type} took ${Math.round(ms)} ms`);
  }
});

test('map options change the world: sea level and resource levels', () => {
  const land = (m) => m.terrain.filter((_, i) => !water(m, i)).length;
  const low = generateMap(ruleset, { seed: 5, size: 'small', type: 'continents', seaLevel: 'low' });
  const high = generateMap(ruleset, { seed: 5, size: 'small', type: 'continents', seaLevel: 'high' });
  assert.ok(land(low) > land(high));
  const res = (m) => m.resource.filter((r) => r >= 0).length;
  assert.ok(res(generateMap(ruleset, { seed: 5, size: 'small', type: 'pangaea', resources: 'abundant' }))
    > res(generateMap(ruleset, { seed: 5, size: 'small', type: 'pangaea', resources: 'sparse' })));
});

test('a new game builds its map from a fork of the seed, leaving the main dice untouched', () => {
  const setup = { seed: 777, players: [{ kind: 'human' }, { kind: 'ai' }], map: { size: 'small', type: 'pangaea' } };
  const state = createGame(ruleset, setup);
  assert.equal(state.rng, 777);
  assert.equal(hashValue(state.map), hashValue(generateMap(ruleset, { seed: 777, size: 'small', type: 'pangaea', factions: 2 })));
  assert.equal(state.map.starts.length, 2);
});
