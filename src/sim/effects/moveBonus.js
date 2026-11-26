// moveBonus: more (or fewer) moves for matching units.
//   { "effect": "moveBonus", "amount": 1, "domain": "sea" }
import { reachesUnit } from './index.js';
import { domainOf } from '../units.js';

export default {
  name: 'moveBonus',
  move(e, { ruleset, unit }) {
    if (!reachesUnit(ruleset, e, unit)) return 0;
    if (e.class && ruleset.units[unit.type]?.class !== e.class) return 0;
    if (e.domain && domainOf(ruleset, unit.type) !== e.domain) return 0;
    return e.amount;
  },
};
