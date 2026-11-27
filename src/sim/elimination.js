// Knocking factions out (end of every round). A faction with no cities and no
// unit able to found one can never recover, so it leaves the game: its
// remaining units are removed and its seat is skipped from then on.
// Rule-test fixtures (no cities by design) turn this off with setup.elimination: false.

import { allCities, allUnits, worldIds, worldData } from './worlds.js';

export function eliminate(state, ruleset, events) {
  if (!state.cities || !state.units || state.setup?.elimination === false) return;
  // With several worlds (K1a) a faction counts its cities and units on every world.
  const cities = Object.values(allCities(state));
  const units = Object.values(allUnits(state));
  for (const f of state.factions) {
    if (!f.alive) continue;
    if (cities.some((c) => c.faction === f.id)) continue;
    const own = units.filter((u) => u.faction === f.id);
    if (own.some((u) => (ruleset.units?.[u.type]?.tags ?? []).includes('founder'))) continue;
    f.alive = false;
    for (const w of worldIds(state)) {
      const held = worldData(state, w).units;
      for (const u of own) delete held[u.id];
    }
    events.push({ type: 'factionEliminated', faction: f.id, turn: state.turn, global: true });
  }
}
