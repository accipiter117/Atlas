// Shared judgement for the AI: weights from data, distances, military power,
// odds and how good a city site is. Reads only what the view gives.

import { hexDistance } from '../core/hex.js';
import { tileHex, tileYields, damage, strengths, buildSpec, defenderAt, atWar } from '../sim/index.js';

/** One planner's weights from rules/<mod>/ai/weights.json. */
export function weightsOf(ruleset, id) {
  return ruleset.aiWeights?.[id]?.weights ?? {};
}

/** This faction's leader personality (category multipliers plus boldness, loyalty, grudge). */
export function personalityOf(ruleset, view) {
  const civ = view.factions.find((f) => f.id === view.me)?.civ;
  const leader = ruleset.leaders?.[ruleset.factions?.[civ]?.leaders?.[0]];
  const p = ruleset.aiPersonalities?.[leader?.ai?.personality];
  return { weights: p?.weights ?? {}, boldness: p?.boldness ?? 1, loyalty: p?.loyalty ?? 1, grudge: p?.grudge ?? 1, bias: leader?.ai?.victoryBias ?? {} };
}

/** pathWeight x personality for a category (section 9.3). */
export function categoryWeight(ruleset, view, memory, category) {
  const path = memory.path ?? 'score';
  const pw = weightsOf(ruleset, path)[category] ?? 1;
  const pers = personalityOf(ruleset, view).weights[category] ?? 1;
  return pw * pers;
}

export function dist(map, a, b) {
  return hexDistance(tileHex(map, a), tileHex(map, b));
}

/** Rough fighting power: strength scaled by health, for every combat unit in the list. */
export function militaryPower(ruleset, units) {
  let p = 0;
  for (const u of units) {
    const def = ruleset.units[u.type];
    if (!def || ruleset.unitClasses[def.class]?.civilian) continue;
    p += Math.max(def.strength, def.rangedStrength ?? 0) * (u.hp / 100);
  }
  return p;
}

/**
 * Odds of an attack from what the AI knows, by stepping evenly through the
 * damage range (no dice at all, so it can never touch the game's).
 */
export function odds(world, ruleset, unit, target) {
  const hasDefender = defenderAt(world, ruleset, unit.faction, target)
    || Object.values(world.cities).some((c) => c.tile === target && atWar(world, unit.faction, c.faction));
  if (!hasDefender) return null;
  const spec = buildSpec(world, ruleset, unit, target);
  const { attack, defence, ranged } = strengths(spec);
  const diff = attack - defence;
  const a = spec.attacker.units[0];
  const d = spec.defender.city ?? spec.defender.units[0];
  const n = 21;
  let win = 0;
  let dealt = 0;
  let taken = 0;
  for (let i = 0; i < n; i += 1) {
    const roll = (i + 0.5) / n;
    const toD = Math.min(d.hp, damage(diff, spec.tuning, roll));
    const toA = ranged ? 0 : Math.min(a.hp, damage(-diff, spec.tuning, 1 - roll));
    if (toD >= d.hp) win += 1;
    dealt += toD;
    taken += toA;
  }
  return { win: win / n, dealt: dealt / n, taken: taken / n, ranged, city: Boolean(spec.defender.city), defenderHp: d.hp, attackerHp: a.hp };
}

/** How good a hex is to found a city on, from the tiles around it the AI has seen. */
export function siteScore(world, ruleset, tile, capitalTile, w) {
  const map = world.map;
  const here = tileHex(map, tile);
  const radius = w.siteRadius ?? 2;
  let score = 0;
  let water = false;
  let coast = false;
  for (let i = 0; i < map.terrain.length; i += 1) {
    if (map.terrain[i] < 0) continue;
    const d = hexDistance(here, tileHex(map, i));
    if (d > radius) continue;
    const y = tileYields(world, ruleset, i);
    score += y.food * 1.6 + y.production * 1.2 + y.gold * 0.6 + y.science + y.culture * 0.6 + y.faith * 0.4;
    if (map.resource[i] >= 0 && ruleset.resources[map.resourceIds[map.resource[i]]]?.class === 'luxury') score += w.luxury ?? 3;
    if (d <= 1 && map.river[i]) water = true;
    const t = ruleset.terrain[map.terrainIds[map.terrain[i]]];
    if (d === 1 && t?.mapgen?.role === 'lake') water = true;
    if (d === 1 && t?.water) coast = true;
  }
  if (map.river[tile]) water = true;
  if (water) score += w.freshWater ?? 4;
  if (coast) score += w.coast ?? 1.5;
  if (capitalTile !== null && capitalTile !== undefined) score -= dist(map, tile, capitalTile) * (w.capitalDistance ?? 0.6);
  return score;
}
