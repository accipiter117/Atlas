// tileYield: extra yield on matching tiles worked by the faction's cities.
//   { "effect": "tileYield", "yield": "food", "amount": 1, "feature": "floodplain" }
export default {
  name: 'tileYield',
  tileYield(e, { terrainId, featureId, resourceId, improvementId }) {
    if (e.terrain && e.terrain !== terrainId) return null;
    if (e.feature && e.feature !== featureId) return null;
    if (e.resource && e.resource !== resourceId) return null;
    if (e.improvement && e.improvement !== improvementId) return null;
    return { [e.yield]: e.amount };
  },
};
