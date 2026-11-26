// yieldPercent: a percentage on one yield, applied last (after tiles and flat bonuses).
//   { "effect": "yieldPercent", "yield": "science", "amount": 10 }
import { reachesCity } from './index.js';

export default {
  name: 'yieldPercent',
  cityPercent: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? { [e.yield]: e.amount } : null),
};
