// Conquest: hold every original capital (each faction's very first city).
// Nobody wins this way while a living rival has not founded its capital yet.

const capitals = (state) => Object.values(state.cities ?? {}).filter((c) => c.originalCapital);

export default {
  winner(state) {
    const alive = state.factions.filter((f) => f.alive);
    if (state.factions.length > 1 && alive.length === 1) return alive[0].id;
    const caps = capitals(state);
    for (const x of alive) {
      if (!caps.some((c) => c.foundedBy === x.id)) continue;
      if (alive.some((f) => f.id !== x.id && !f.foundedCapital)) continue;
      if (caps.length > 1 && caps.every((c) => c.faction === x.id)) return x.id;
    }
    return null;
  },
  progress(state, ruleset, params, factionId) {
    const caps = capitals(state);
    const unsettled = state.factions.filter((f) => f.alive && !f.foundedCapital).length;
    return { value: caps.filter((c) => c.faction === factionId).length, target: Math.max(2, caps.length + unsettled) };
  },
};
