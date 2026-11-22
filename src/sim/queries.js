// Read-only questions about a state. Nothing in here changes anything.

/** The faction whose turn it is. */
export function currentFactionId(state) {
  return state.seatOrder[state.seatIndex];
}

export function getFaction(state, factionId) {
  return state.factions.find((f) => f.id === factionId) ?? null;
}

/** Every faction still in the game, in seat order. */
export function livingSeats(state) {
  return state.seatOrder.filter((id) => getFaction(state, id)?.alive);
}
