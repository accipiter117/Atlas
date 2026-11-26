// tradeRouteYield: extra yield for the origin city of each trade route of a kind.
//   { "effect": "tradeRouteYield", "yield": "gold", "amount": 2, "kind": "foreign" }
import { reachesCity } from './index.js';

export default {
  name: 'tradeRouteYield',
  tradeRoute: (e, { ruleset, city, route }) => (reachesCity(ruleset, e, city) && (!e.kind || e.kind === route.kind) ? { [e.yield]: e.amount } : null),
};
