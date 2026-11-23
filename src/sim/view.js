// view(state, factionId): the game as one faction is allowed to know it.
//
// The player's screen and the AI both read this, never the raw state, so
// nobody can see through the fog (section 9.5). Unexplored tiles come back
// as -1 in every map array; other factions' units appear only on tiles the
// faction can see right now, with only what can be seen from outside.

import { VISIBLE, UNEXPLORED } from './visibility.js';

const HIDDEN = -1;

export function view(state, factionId) {
  const me = state.factions.find((f) => f.id === factionId);
  if (!me) throw new Error(`No faction "${factionId}"`);
  const out = {
    turn: state.turn,
    me: factionId,
    current: state.seatOrder[state.seatIndex],
    seatOrder: state.seatOrder.slice(),
    factions: state.factions.map((f) => ({ id: f.id, name: f.name, kind: f.kind, alive: f.alive })),
    map: null,
    fog: null,
    units: [],
  };
  if (!state.map) return out;
  const map = state.map;
  const fog = state.fog?.[factionId] ?? new Array(map.width * map.height).fill(UNEXPLORED);
  const mask = (arr, hidden = HIDDEN) => arr.map((v, i) => (fog[i] === UNEXPLORED ? hidden : v));
  out.fog = fog.slice();
  out.map = {
    width: map.width,
    height: map.height,
    size: map.size,
    type: map.type,
    terrainIds: map.terrainIds.slice(),
    featureIds: map.featureIds.slice(),
    resourceIds: map.resourceIds.slice(),
    terrain: mask(map.terrain),
    hills: mask(map.hills, 0),
    feature: mask(map.feature),
    resource: mask(map.resource),
    river: mask(map.river, 0),
    road: map.road ? mask(map.road, 0) : null,
  };
  for (const u of Object.values(state.units ?? {})) {
    if (u.faction === factionId) {
      out.units.push({ ...u });
    } else if (fog[u.tile] === VISIBLE) {
      out.units.push({ id: u.id, type: u.type, faction: u.faction, tile: u.tile, hp: u.hp });
    }
  }
  return out;
}
