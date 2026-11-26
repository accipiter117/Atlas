// The effects vocabulary (docs/PLAN.md section 4.7).
//
// Traits, beliefs, policies, buildings and events all describe what they do
// with the same small set of effects, e.g.
//   { "effect": "yieldPercent", "yield": "production", "amount": 10 }
// This file lists every effect name and its fields, so the loader can refuse
// a misspelt effect or a missing field before the game ever runs. Each effect
// gets a handler in src/sim/effects/ when its system arrives.
//
// Mods are data only: a new effect means a change to the engine, never code
// inside a mod.

import { YIELDS, req, num, int, str, oneOf, ref, obj, any } from './schemas/fields.js';

const amount = req(num(-1000, 1000));
const yieldName = req(oneOf(YIELDS));

/** Fields every effect may carry. */
const COMMON = {
  scope: str(),
  chance: num(0, 1),
  turns: int(1, 500),
  when: any(),
};

export const EFFECTS = Object.freeze({
  yieldBonus: { yield: yieldName, amount },
  yieldPercent: { yield: yieldName, amount },
  cityYieldPercent: { yield: yieldName, amount },
  tileYield: { yield: yieldName, amount, terrain: ref('terrain'), feature: ref('features'), resource: ref('resources'), improvement: ref('improvements') },
  freeBuilding: { building: req(ref('buildings')) },
  freeUnit: { unit: req(ref('units')), count: int(1, 20) },
  freeTech: { tech: ref('techs'), count: int(1, 20) },
  freePolicySlot: { slot: req(oneOf(['military', 'economic', 'diplomatic', 'wildcard'])), amount: req(int(1, 5)) },
  combatBonus: { amount, vs: any() },
  moveBonus: { amount: req(int(-5, 5)), class: ref('unitClasses'), domain: oneOf(['land', 'sea']) },
  sightBonus: { amount: req(int(-3, 3)), class: ref('unitClasses'), domain: oneOf(['land', 'sea']) },
  healBonus: { amount },
  costPercent: { target: req(str()), amount },
  upkeepPercent: { target: str(), amount },
  growthPercent: { amount },
  borderGrowthPercent: { amount },
  amenityBonus: { amount },
  faithPurchase: { target: req(str()) },
  religiousPressure: { amount },
  tradeRouteYield: { yield: yieldName, amount, kind: oneOf(['domestic', 'foreign']) },
  spyBonus: { amount, mission: ref('espionage') },
  opinionModifier: { amount, reasonKey: str(), target: str() },
  popChange: { amount: req(int(-20, 20)) },
  autoRoad: {},
});

/** The full field schema for one effect name, or null if the name is unknown. */
export function effectSchema(name) {
  if (!Object.hasOwn(EFFECTS, name)) return null;
  return obj({ effect: req(str()), ...COMMON, ...EFFECTS[name] });
}
