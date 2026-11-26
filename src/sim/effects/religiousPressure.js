// religiousPressure: a faction's cities spread their religion more (or less) strongly.
//   { "effect": "religiousPressure", "amount": 30 }
import { reachesCity } from './index.js';

export default {
  name: 'religiousPressure',
  pressure: (e, { ruleset, city }) => (reachesCity(ruleset, e, city) ? e.amount : 0),
};
