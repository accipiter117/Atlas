// Several worlds in one game (Killzone Extrasolar War, phase K1a; docs/KILLZONE.md 8.1).
//
// An optional engine system, like the front line: a ruleset switches it on by
// listing its worlds in worlds.json. Each world has its
// own map, borders, fog of war, units, cities, front line and raider camps.
//
// How it is stored. Exactly one world is active at a time, and its data sits where
// it always has (state.map, state.owner, state.fog, state.units, state.cities,
// state.frontline, state.raiders), so every rule in the engine works on it
// unchanged. The other worlds are parked, whole, under state.worlds[id], and
// state.world names the active one. Turn processing and commands swap a world in
// when they need it. Everything else (factions, research, gold, diplomacy, wars,
// religion, trade) belongs to the whole game.
//
// A game whose ruleset does not switch worlds on never has state.world or
// state.worlds, so it is byte for byte the game it was before this system: same
// saves, same fingerprints, no migration. Where a unit or city is is told by
// which world holds it, so units and cities need no world field.

/** The parts of the state that belong to one world. */
export const WORLD_KEYS = Object.freeze(['map', 'owner', 'fog', 'units', 'cities', 'frontline', 'raiders']);

/** Does this ruleset use several worlds? Yes when it lists any (a mod that removes them all turns the system off). */
export function worldsOn(ruleset) {
  return Object.keys(ruleset?.worlds ?? {}).length > 0;
}

/** Is this game played on several worlds? */
export const multiWorld = (state) => Boolean(state?.worlds);

/** The active world's id ('main' in a one-world game). */
export const activeWorld = (state) => state?.world ?? 'main';

/** Every world's id, in the ruleset's order (just 'main' in a one-world game). */
export function worldIds(state) {
  if (!multiWorld(state)) return ['main'];
  return state.worldOrder.slice();
}

/** Park the active world's data under state.worlds (setup and switchTo only). */
export function park(state) {
  const parked = {};
  for (const k of WORLD_KEYS) {
    if (state[k] !== undefined) parked[k] = state[k];
    delete state[k];
  }
  state.worlds[state.world] = parked;
}

/** Bring a parked world's data back to the top of the state (setup and switchTo only). */
export function unpark(state, id) {
  const data = state.worlds[id];
  for (const k of WORLD_KEYS) if (data[k] !== undefined) state[k] = data[k];
  state.worlds[id] = null;
  state.world = id;
}

/**
 * Make `id` the active world (mutates the state; use it on a working copy).
 * Refuses to leave a world while a battle or a capture choice is waiting there.
 */
export function switchTo(state, id) {
  if (!multiWorld(state) || activeWorld(state) === id) return;
  if (!Object.hasOwn(state.worlds, id)) throw new Error(`No world "${id}"`);
  if (state.pendingBattle || state.pendingCapture) throw new Error('A battle or capture is waiting on the active world');
  park(state);
  unpark(state, id);
}

/**
 * Run fn(id) with each world active in turn (just once in a one-world game),
 * then return to the world that was active before.
 */
export function forEachWorld(state, fn) {
  if (!multiWorld(state)) { fn('main'); return; }
  const back = activeWorld(state);
  for (const id of state.worldOrder) {
    switchTo(state, id);
    fn(id);
    if (state.pendingBattle || state.pendingCapture) return; // stays on the world that needs an answer
  }
  switchTo(state, back);
}

/** A world's data without changing which is active: { map, owner, fog, units, cities, ... } (read only). */
export function worldData(state, id = activeWorld(state)) {
  if (!multiWorld(state) || id === activeWorld(state)) {
    return Object.fromEntries(WORLD_KEYS.filter((k) => state[k] !== undefined).map((k) => [k, state[k]]));
  }
  return state.worlds[id] ?? null;
}

/** A read-only look at the state as if world `id` were active (for views and queries; never write to it). */
export function lookAt(state, id) {
  if (!multiWorld(state) || id === activeWorld(state)) return state;
  const out = { ...state, world: id };
  for (const k of WORLD_KEYS) delete out[k];
  return Object.assign(out, state.worlds[id]);
}

/** Every unit on every world, as one { id: unit } object (read only). */
export function allUnits(state) {
  if (!multiWorld(state)) return state.units ?? {};
  return Object.assign({}, ...worldIds(state).map((id) => worldData(state, id)?.units ?? {}));
}

/** Every city on every world, as one { id: city } object (read only). */
export function allCities(state) {
  if (!multiWorld(state)) return state.cities ?? {};
  return Object.assign({}, ...worldIds(state).map((id) => worldData(state, id)?.cities ?? {}));
}

/** Which world a unit or city is on (null if none holds it). */
export function worldOf(state, kind, id) {
  for (const w of worldIds(state)) if (worldData(state, w)?.[kind]?.[id]) return w;
  return null;
}

/**
 * The whole game seen at once, for rules that judge factions rather than places
 * (knocking factions out, victory): the active world's map with every world's
 * units and cities. Read only.
 */
export function wholeGame(state) {
  if (!multiWorld(state)) return state;
  return { ...state, units: allUnits(state), cities: allCities(state) };
}
