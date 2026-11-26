// freeBuilding: a building given for nothing. On a trait it is given to each
// new city the effect reaches; on a building or wonder, when that is built.
//   { "effect": "freeBuilding", "building": "monument" }
import { reachesCity, hasBuilding, buildingDef } from './index.js';
import { factionVersionOf } from '../buildings.js';

function give(e, { state, ruleset, city }) {
  const id = factionVersionOf(state, ruleset, city.faction, e.building);
  if (!buildingDef(ruleset, id) || hasBuilding(ruleset, city, id)) return [];
  city.buildings.push(id);
  return [{ type: 'buildingBuilt', city: city.id, building: id, faction: city.faction, free: true }];
}

export default {
  name: 'freeBuilding',
  onCityFounded: (e, ctx) => (e.source?.kind !== 'building' && reachesCity(ctx.ruleset, e, ctx.city) ? give(e, ctx) : []),
  onBuilt: (e, ctx) => (e.source?.kind === 'building' && e.source.id === ctx.built ? give(e, ctx) : []),
};
