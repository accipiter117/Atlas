// Culture: your influence exceeds the lifetime culture of every living rival
// (each faction with cities), and at least params.minInfluence.

const rivalsOf = (state, id) => state.factions.filter((f) => f.alive && f.id !== id && Object.values(state.cities ?? {}).some((c) => c.faction === f.id));

export default {
  winner(state, ruleset, params) {
    const min = params?.minInfluence ?? 100;
    const contenders = state.seatOrder.map((id) => state.factions.find((f) => f.id === id)).filter((f) => f?.alive && (f.influence ?? 0) >= min);
    for (const f of contenders.sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0))) {
      const rivals = rivalsOf(state, f.id);
      if (rivals.length && rivals.every((r) => (f.influence ?? 0) > (r.lifetimeCulture ?? 0))) return f.id;
    }
    return null;
  },
  progress(state, ruleset, params, factionId) {
    const f = state.factions.find((x) => x.id === factionId);
    const rivals = rivalsOf(state, factionId);
    return { value: rivals.filter((r) => (f?.influence ?? 0) > (r.lifetimeCulture ?? 0)).length, target: Math.max(1, rivals.length), influence: Math.floor(f?.influence ?? 0) };
  },
};
