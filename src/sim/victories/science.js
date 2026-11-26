// Science: finish every final project named in params.projects (in base-ancient:
// Great Observatory, Atlas of the World, Voyage Beyond). Projects are wonder
// entries with project: true, built in a city like any wonder.

const list = (params) => params?.projects ?? [];

export default {
  winner(state, ruleset, params) {
    const need = list(params);
    if (!need.length) return null;
    const done = state.factions.filter((f) => f.alive && need.every((p) => (state.projects?.[f.id] ?? []).includes(p)));
    return done[0]?.id ?? null;
  },
  progress(state, ruleset, params, factionId) {
    const need = list(params);
    return { value: need.filter((p) => (state.projects?.[factionId] ?? []).includes(p)).length, target: need.length };
  },
};
