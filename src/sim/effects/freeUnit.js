// freeUnit: units given for nothing, in the city: on a trait for each new
// city the effect reaches, on a building or wonder when that is built.
//   { "effect": "freeUnit", "unit": "builder", "count": 1 }
import { reachesCity } from './index.js';
import { spawnUnit } from '../buildings.js';

function give(e, { state, ruleset, city }) {
  const out = [];
  for (let k = 0; k < (e.count ?? 1); k += 1) {
    const ev = spawnUnit(state, ruleset, city, e.unit);
    if (ev) out.push({ ...ev, free: true });
  }
  return out;
}

export default {
  name: 'freeUnit',
  onCityFounded: (e, ctx) => (e.source?.kind !== 'building' && reachesCity(ctx.ruleset, e, ctx.city) ? give(e, ctx) : []),
  onBuilt: (e, ctx) => (e.source?.kind === 'building' && e.source.id === ctx.built ? give(e, ctx) : []),
};
