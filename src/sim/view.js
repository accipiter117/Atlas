// view(state, factionId): the game as one faction is allowed to know it.
//
// The player's screen and the AI both read this, never the raw state, so
// nobody can see through the fog (section 9.5). Unexplored tiles come back
// as -1 in every map array; other factions' units appear only on tiles the
// faction can see right now, with only what can be seen from outside.

import { VISIBLE, UNEXPLORED } from './visibility.js';

const HIDDEN = -1;

export function view(state, factionId, ruleset = null) {
  const me = state.factions.find((f) => f.id === factionId);
  if (!me) throw new Error(`No faction "${factionId}"`);
  const out = {
    turn: state.turn,
    me: factionId,
    current: state.seatOrder[state.seatIndex],
    seatOrder: state.seatOrder.slice(),
    // Everyone's government is public knowledge (as in the board game); cards and research are not.
    factions: state.factions.map((f) => ({ id: f.id, name: f.name, kind: f.kind, alive: f.alive, civ: f.civ ?? null, government: f.government?.id ?? null })),
    cities: [],
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
    // Strategic resources stay hidden until the tech that reveals them.
    resource: mask(map.resource).map((r) => {
      const res = r >= 0 && ruleset ? ruleset.resources[map.resourceIds[r]] : null;
      return res?.revealedBy && !(me.research?.known ?? []).includes(res.revealedBy) ? -1 : r;
    }),
    river: mask(map.river, 0),
    road: map.road ? mask(map.road, 0) : null,
    improvementIds: (map.improvementIds ?? []).slice(),
    improvement: map.improvement ? mask(map.improvement) : null,
    owner: state.owner ? mask(state.owner, null) : null,
  };
  // Cities: your own in full; others where you have explored, outside details only.
  out.cities = [];
  for (const c of Object.values(state.cities ?? {})) {
    if (c.faction === factionId) out.cities.push(JSON.parse(JSON.stringify(c)));
    else if (fog[c.tile] !== UNEXPLORED) out.cities.push({ id: c.id, name: c.name, faction: c.faction, tile: c.tile, pop: c.pop, capital: c.capital, hp: c.hp, buildings: c.buildings.slice(), originalCapital: c.originalCapital });
  }
  const mine = state.factions.find((f) => f.id === factionId);
  out.stocks = mine.stocks ? { ...mine.stocks } : null;
  out.lastNetGold = mine.lastNetGold ?? null;
  out.research = mine.research ? JSON.parse(JSON.stringify(mine.research)) : null;
  out.civicResearch = mine.civicResearch ? JSON.parse(JSON.stringify(mine.civicResearch)) : null;
  out.government = mine.government ? JSON.parse(JSON.stringify(mine.government)) : null;
  out.pendingGovernment = mine.pendingGovernment ? JSON.parse(JSON.stringify(mine.pendingGovernment)) : null;
  out.setup = JSON.parse(JSON.stringify(state.setup ?? {}));
  out.wars = (state.wars ?? []).filter((w) => w.split('|').includes(factionId));
  out.wondersBuilt = { ...(state.wondersBuilt ?? {}) };
  // Finished projects and the winner are announced to everyone, so every view has them.
  out.projects = JSON.parse(JSON.stringify(state.projects ?? {}));
  out.winner = state.winner ? { ...state.winner } : null;
  out.pendingCapture = state.pendingCapture?.faction === factionId ? { ...state.pendingCapture } : null;
  out.pendingBattle = state.pendingBattle && (state.pendingBattle.spec.attacker.faction === factionId || state.pendingBattle.spec.defender.faction === factionId) ? JSON.parse(JSON.stringify(state.pendingBattle)) : null;
  out.camps = Object.keys(state.raiders?.camps ?? {}).map(Number).filter((t) => fog[t] !== UNEXPLORED);
  for (const u of Object.values(state.units ?? {})) {
    if (u.faction === factionId) {
      out.units.push({ ...u });
    } else if (fog[u.tile] === VISIBLE) {
      out.units.push({ id: u.id, type: u.type, faction: u.faction, tile: u.tile, hp: u.hp, activity: u.activity === 'fortify' ? 'fortify' : 'none', fortifiedTurns: u.activity === 'fortify' ? u.fortifiedTurns : 0, promotions: (u.promotions ?? []).slice() });
    }
  }
  return out;
}

/**
 * A state-shaped object built only from a view: what this player knows,
 * arranged so the rules' own checks (paths, founding, building, attacking,
 * validating a command) can run on it. The screen and the AI both use it,
 * so what they allow is exactly what the rules allow, without peeking.
 */
export function worldFromView(v) {
  return {
    map: v.map,
    units: Object.fromEntries(v.units.map((u) => [u.id, u])),
    cities: Object.fromEntries(v.cities.map((c) => [c.id, c])),
    owner: v.map?.owner ?? null,
    factions: v.factions.map((f) => (f.id === v.me ? { ...f, research: v.research, civicResearch: v.civicResearch, government: v.government, pendingGovernment: v.pendingGovernment, stocks: v.stocks } : f)),
    turn: v.turn,
    seatOrder: v.seatOrder,
    seatIndex: v.seatOrder.indexOf(v.current),
    fog: v.fog ? { [v.me]: v.fog } : {},
    wars: v.wars ?? [],
    wondersBuilt: v.wondersBuilt ?? {}, projects: v.projects ?? {}, winner: v.winner ?? null,
    setup: v.setup ?? {},
    pendingCapture: v.pendingCapture ?? null,
    raiders: { camps: Object.fromEntries((v.camps ?? []).map((t) => [t, {}])) },
  };
}
