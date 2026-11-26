// borderGrowthPercent: a city's culture counts for more (or less) towards
// claiming its next tile.
//   { "effect": "borderGrowthPercent", "amount": 50 }
import { reachesCity } from './index.js';

export default {
  name: 'borderGrowthPercent',
  borderGrowth: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? e.amount : 0),
};
