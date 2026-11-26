// growthPercent: food surplus counts for more (or less) towards growing.
//   { "effect": "growthPercent", "amount": 25 }
import { reachesCity } from './index.js';

export default {
  name: 'growthPercent',
  growth: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? e.amount : 0),
};
