// autoRoad: each new city is joined to the capital by road.
//   { "effect": "autoRoad", "scope": "cityToCapital" }
import { roadBetween } from '../improvements.js';

export default {
  name: 'autoRoad',
  onCityFounded(e, { state, ruleset, city }) {
    const capital = Object.values(state.cities).find((c) => c.faction === city.faction && c.capital);
    if (!capital || capital.id === city.id) return [];
    const tiles = roadBetween(state, ruleset, capital.tile, city.tile);
    return tiles.length ? [{ type: 'roadBuilt', faction: city.faction, tiles }] : [];
  },
};
