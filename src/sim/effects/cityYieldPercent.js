// cityYieldPercent: a percentage on one city's yield for a number of turns,
// left on the city by an event choice (events arrive in phase 16).
//   { "effect": "cityYieldPercent", "yield": "gold", "amount": -25, "turns": 5 }
import { reachesCity } from './index.js';

export default {
  name: 'cityYieldPercent',
  cityPercent: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? { [e.yield]: e.amount } : null),
};
