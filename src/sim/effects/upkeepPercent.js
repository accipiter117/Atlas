// upkeepPercent: cheaper (negative) gold upkeep for units or buildings.
//   { "effect": "upkeepPercent", "target": "units", "amount": -10 }
export default {
  name: 'upkeepPercent',
  upkeep: (e, { kind }) => (!e.target || e.target === kind ? e.amount : 0),
};
