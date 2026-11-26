// Growth and starvation (section 3.2).
//
// Food needed to grow from population n to n+1 is
//   floor(base + linear * (n - 1) + (n - 1) ^ exponent)
// with base 15, linear 8 and exponent 1.5 in tuning.json (Civ VI's curve).
// Powers are worked out with multiplication and square roots only, so every
// browser gets exactly the same answer.

/** x raised to a power that is a whole or half number, computed the same way everywhere. */
export function powHalf(x, e) {
  const whole = Math.floor(e);
  let out = 1;
  for (let i = 0; i < whole; i += 1) out *= x;
  const rest = e - whole;
  if (rest === 0.5) out *= Math.sqrt(x);
  else if (rest !== 0) throw new Error(`Growth exponent must be a whole or half number, got ${e}`);
  return out;
}

export function foodToGrow(pop, tuning) {
  const g = tuning?.growth ?? { base: 15, linear: 8, exponent: 1.5 };
  const n = pop - 1;
  return Math.floor(g.base + g.linear * n + powHalf(n, g.exponent));
}

/**
 * Apply one turn of food. A surplus is scaled by the river bonus and by
 * growthPercent (effects and the city's mood); a shortfall is not.
 * Returns 'grew', 'starved' or null. City is a working copy.
 */
export function applyGrowth(city, surplus, tuning, nearRiver, growthPercent = 0) {
  let gain = surplus;
  if (gain > 0) gain *= Math.max(0, 1 + (nearRiver ? tuning?.map?.riverGrowthBonus ?? 0 : 0) + growthPercent / 100);
  city.food += gain;
  if (city.food < 0) {
    if (city.pop > 1) {
      city.pop -= 1;
      city.food = tuning?.growth?.starvationReset ?? 0;
      return 'starved';
    }
    city.food = 0;
    return null;
  }
  const need = foodToGrow(city.pop, tuning);
  if (city.food >= need) {
    city.food -= need;
    city.pop += 1;
    return 'grew';
  }
  return null;
}
