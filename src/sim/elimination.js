// Knocking factions out (end of every round). A faction with no cities and no
// unit able to found one can never recover, so it leaves the game: its
// remaining units are removed and its seat is skipped from then on.
// Rule-test fixtures (no cities by design) turn this off with setup.elimination: false.

export function eliminate(state, ruleset, events) {
  if (!state.cities || !state.units || state.setup?.elimination === false) return;
  for (const f of state.factions) {
    if (!f.alive) continue;
    if (Object.values(state.cities).some((c) => c.faction === f.id)) continue;
    const units = Object.values(state.units).filter((u) => u.faction === f.id);
    if (units.some((u) => (ruleset.units?.[u.type]?.tags ?? []).includes('founder'))) continue;
    f.alive = false;
    for (const u of units) delete state.units[u.id];
    events.push({ type: 'factionEliminated', faction: f.id, turn: state.turn, global: true });
  }
}
