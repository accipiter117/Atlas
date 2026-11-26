// popChange: citizens gained or lost at once (events).
//   { "effect": "popChange", "amount": -2, "chance": 0.5 }
// A city never drops below 1 citizen.
export default {
  name: 'popChange',
  instant(e, { city }) {
    if (!city) return [];
    const before = city.pop;
    city.pop = Math.max(1, city.pop + e.amount);
    return city.pop !== before ? [{ type: 'popChanged', city: city.id, faction: city.faction, pop: city.pop, change: city.pop - before }] : [];
  },
};
