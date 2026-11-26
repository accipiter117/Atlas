// sightBonus: units see further. On a building it reaches units built there.
//   { "effect": "sightBonus", "amount": 1 }
import { reachesUnit } from './index.js';
import { domainOf } from '../units.js';

export default {
  name: 'sightBonus',
  sight(e, { ruleset, unit }) {
    if (!reachesUnit(ruleset, e, unit)) return 0;
    if (e.class && ruleset.units[unit.type]?.class !== e.class) return 0;
    if (e.domain && domainOf(ruleset, unit.type) !== e.domain) return 0;
    return e.amount;
  },
};
