// amenityBonus: extra amenities (happiness) in the cities it reaches.
//   { "effect": "amenityBonus", "amount": 1 }
import { reachesCity } from './index.js';

export default {
  name: 'amenityBonus',
  amenities: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? e.amount : 0),
};
