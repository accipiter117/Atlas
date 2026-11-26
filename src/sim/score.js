// Score (section 3.12): one number per faction, used by the score victory at
// the turn limit and shown in the victory panel and on the end screen. Every
// weight lives in tuning.score.

export function scoreParts(state, ruleset, factionId) {
  const w = ruleset.tuning?.score ?? {};
  const cities = Object.values(state.cities ?? {}).filter((c) => c.faction === factionId);
  const f = state.factions.find((x) => x.id === factionId);
  const parts = {
    citizens: cities.reduce((n, c) => n + c.pop, 0) * (w.perCitizen ?? 1),
    cities: cities.length * (w.perCity ?? 5),
    techs: (f?.research?.known?.length ?? 0) * (w.perTech ?? 3),
    wonders: Object.values(state.wondersBuilt ?? {}).filter((cityId) => state.cities?.[cityId]?.faction === factionId).length * (w.perWonder ?? 10),
    buildings: cities.reduce((n, c) => n + c.buildings.length, 0) * (w.perBuilding ?? 1),
    projects: (state.projects?.[factionId]?.length ?? 0) * (w.perProject ?? 25),
  };
  return parts;
}

export function scoreOf(state, ruleset, factionId) {
  return Object.values(scoreParts(state, ruleset, factionId)).reduce((a, b) => a + b, 0);
}
