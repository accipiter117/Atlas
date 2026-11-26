// costPercent: cheaper (negative) or dearer production for matching items.
//   { "effect": "costPercent", "target": "builder", "amount": -25 }
// Targets: an item id, a unit class or tag, or one of units, buildings,
// wonders, landUnits, seaUnits.
import { reachesCity } from './index.js';

export function costTargetMatches(target, item, ruleset) {
  if (target === item.id) return true;
  if (item.kind === 'unit') {
    const def = ruleset.units[item.id];
    const domain = def.domain ?? ruleset.unitClasses[def.class]?.domain ?? 'land';
    return target === 'units' || target === def.class || (def.tags ?? []).includes(target)
      || (target === 'landUnits' && domain === 'land') || (target === 'seaUnits' && domain === 'sea');
  }
  if (item.kind === 'building') return target === 'buildings' || ruleset.buildings?.[item.id]?.replaces === target;
  if (item.kind === 'wonder') return target === 'wonders';
  return false;
}

export default {
  name: 'costPercent',
  cost(e, { ruleset, city, item }) {
    if (city && !reachesCity(ruleset, e, city)) return 0;
    return costTargetMatches(e.target, item, ruleset) ? e.amount : 0;
  },
};
