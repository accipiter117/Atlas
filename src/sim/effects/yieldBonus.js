// yieldBonus: a flat amount of one yield in the cities the effect reaches.
//   { "effect": "yieldBonus", "yield": "production", "amount": 1, "scope": "capital" }
import { reachesCity } from './index.js';

export default {
  name: 'yieldBonus',
  cityFlat: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? { [e.yield]: e.amount } : null),
};
