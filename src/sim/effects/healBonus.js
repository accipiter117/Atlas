// healBonus: units heal more each turn. On a trait it reaches every unit;
// on a building, units standing in that city's land.
//   { "effect": "healBonus", "amount": 10 }
export default {
  name: 'healBonus',
  heal(e, { state, unit }) {
    if (e.source?.kind === 'building') return state.owner?.[unit.tile] === e.source.city ? e.amount : 0;
    return e.amount;
  },
};
