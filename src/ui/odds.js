// Odds before attacking (section 3.6): win chance and expected HP each side
// loses, from a battle spec the engine builds without rolling any dice.
//
// It samples the damage range with its own throwaway random stream (a tiny
// generator private to this file), never the game's, so looking at odds can
// never change what happens in the game.

import { damage, strengths } from '../battles/index.js';

function throwaway(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * @returns {{ win: number, lose: number, attackerLoss: number, defenderLoss: number, attack: number, defence: number }}
 *   win: chance the defender (unit, or city to 0 HP) falls; lose: chance the attacker dies.
 */
export function estimateOdds(spec, samples = 400) {
  const rng = throwaway(0x5eed);
  const { attack, defence, ranged } = strengths(spec);
  const diff = attack - defence;
  const a = spec.attacker.units[0];
  const d = spec.defender.city ?? spec.defender.units[0];
  let win = 0;
  let lose = 0;
  let aLoss = 0;
  let dLoss = 0;
  for (let k = 0; k < samples; k += 1) {
    const toD = Math.min(d.hp, damage(diff, spec.tuning, rng()));
    const toA = ranged ? 0 : Math.min(a.hp, damage(-diff, spec.tuning, rng()));
    const defenderFalls = toD >= d.hp;
    const attackerFalls = toA >= a.hp && !defenderFalls;
    if (defenderFalls) win += 1;
    if (attackerFalls) lose += 1;
    aLoss += attackerFalls ? a.hp : toA;
    dLoss += toD;
  }
  return { win: win / samples, lose: lose / samples, attackerLoss: aLoss / samples, defenderLoss: dLoss / samples, attack, defence, ranged };
}
