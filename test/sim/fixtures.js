// Tiny hand-drawn maps for rule tests. Each character is one tile:
//   .  grassland     h  grassland hills     f  forest     F  forest on hills
//   m  mountain      ~  ocean               c  coast       p  plains
// Rows are the map's rows (odd rows sit half a hex to the right on screen).

import { createGame, applyCommand, currentFactionId } from '../../src/sim/index.js';
import { neighbourCache } from '../../src/sim/map.js';
import { updateAllVisibility } from '../../src/sim/visibility.js';
import { loadReal } from '../data/helpers.js';

export const { ruleset } = await loadReal(['base-ancient']);

const CODES = {
  '.': ['grassland', 0, null], h: ['grassland', 1, null], f: ['grassland', 0, 'forest'], F: ['grassland', 1, 'forest'],
  m: ['mountain', 0, null], '~': ['ocean', 0, null], c: ['coast', 0, null], p: ['plains', 0, null],
};

export function fixtureMap(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const terrainIds = Object.keys(ruleset.terrain);
  const featureIds = Object.keys(ruleset.features);
  const map = { width, height, size: 'fixture', type: 'fixture', terrainIds, featureIds, resourceIds: Object.keys(ruleset.resources),
    terrain: [], hills: [], feature: [], resource: [], river: [], rivers: [], starts: [], road: [] };
  for (const row of rows) {
    for (const ch of row) {
      const [t, hills, f] = CODES[ch];
      map.terrain.push(terrainIds.indexOf(t));
      map.hills.push(hills);
      map.feature.push(f ? featureIds.indexOf(f) : -1);
      map.resource.push(-1);
      map.river.push(0);
      map.road.push(0);
    }
  }
  return map;
}

export const at = (map, c, r) => r * map.width + c;

/** Put a river on the edge between two neighbouring tiles. */
export function addRiver(map, a, b) {
  const nbs = neighbourCache(map);
  map.river[a] |= 1 << nbs[a].indexOf(b);
  map.river[b] |= 1 << nbs[b].indexOf(a);
}

/**
 * A two-faction game on a fixture map. units: [{ type, faction: 'f0', at: tile }].
 * The seed is chosen so f0 moves first. Fog starts fully explored unless `fog: true`.
 */
export function fixtureGame(rows, units, { fog = false, rules = ruleset } = {}) {
  let state = createGame(rules, { seed: 3, players: [{ kind: 'human', name: 'A' }, { kind: 'ai', name: 'B' }] });
  if (state.seatOrder[0] !== 'f0') state.seatOrder.reverse();
  state.map = fixtureMap(rows);
  state.units = {};
  units.forEach((u, i) => {
    const id = `u_${String(i + 1).padStart(4, '0')}`;
    state.units[id] = { id, type: u.type, faction: u.faction ?? 'f0', tile: u.at, hp: 100, moves: rules.units[u.type].moves, activity: 'none', fortifiedTurns: 0, goto: null };
  });
  state.nextId = units.length + 1;
  updateAllVisibility(state, rules);
  if (!fog) for (const f of Object.values(state.fog)) f.forEach((v, i) => { if (v === 0) f[i] = 1; });
  return state;
}

export function play(state, cmd, rules = ruleset) {
  const r = applyCommand(state, cmd, rules);
  if (!r.ok) throw new Error(`${cmd.type} refused: ${r.error.code} ${r.error.message}`);
  return r;
}

/** End turns until it is `faction`'s turn again. */
export function passRound(state, rules = ruleset) {
  const me = currentFactionId(state);
  let s = state;
  do {
    s = play(s, { type: 'endTurn', faction: currentFactionId(s) }, rules).state;
  } while (currentFactionId(s) !== me);
  return s;
}
