// The auto battle module: resolves a fight in one step with Civ VI's curve
// (section 3.6). Each side's strength is its unit's strength plus the
// modifiers the engine already worked out; the difference sets the damage:
//   damage = baseDamage x e^(difference / strengthScale) x random(1 - spread .. 1 + spread)
// At equal strength each side loses 24 to 36 HP. Ranged attacks and
// bombardments take no damage back. Pure and deterministic: the only
// randomness is the rng the engine hands in, seeded once per battle.

import { expDet } from '../../core/mathdet.js';

const sum = (mods) => (mods ?? []).reduce((n, m) => n + m.amount, 0);

export function damage(diff, tuning, roll) {
  const spread = tuning.spread ?? 0.2;
  const factor = 1 - spread + 2 * spread * roll;
  return Math.max(1, Math.round(tuning.baseDamage * expDet(diff / tuning.strengthScale) * factor));
}

/** The two strengths the fight compares, from the spec alone. */
export function strengths(spec) {
  const a = spec.attacker.units[0];
  const ranged = spec.kind === 'ranged' || spec.kind === 'cityRanged';
  const attack = (ranged ? a.rangedStrength : a.strength) + sum(spec.modifiers?.attacker);
  const d = spec.defender.city ?? spec.defender.units[0];
  const defence = d.strength + sum(spec.modifiers?.defender);
  return { attack, defence, ranged };
}

export default {
  id: 'auto',
  version: 1,
  kind: 'instant',
  canHandle: () => true,
  resolve(spec, rng) {
    const t = spec.tuning;
    const { attack, defence, ranged } = strengths(spec);
    const diff = attack - defence;
    const toDefender = damage(diff, t, rng());
    const toAttacker = ranged ? 0 : damage(-diff, t, rng());
    const a = spec.attacker.units[0];
    let aHp = Math.max(0, a.hp - toAttacker);
    const units = [];
    let city = null;
    let defenderDown;
    if (spec.defender.city) {
      const c = spec.defender.city;
      const hp = Math.max(0, c.hp - toDefender);
      city = { ref: c.ref, hp };
      defenderDown = hp === 0;
      for (const u of spec.defender.units) units.push({ ref: u.ref, hp: u.hp, alive: true, xpGained: 0 });
    } else {
      const d = spec.defender.units[0];
      const hp = Math.max(0, d.hp - toDefender);
      defenderDown = hp === 0;
      units.push({ ref: d.ref, hp, alive: hp > 0, xpGained: t.xpDefence ?? 0 });
    }
    // Both cannot fall: if they would, the attacker clings on with 1 HP.
    if (aHp === 0 && defenderDown) aHp = 1;
    if (spec.kind === 'cityRanged') {
      units.unshift({ ref: a.ref, hp: a.hp, alive: true, xpGained: 0 });
    } else {
      units.unshift({ ref: a.ref, hp: aHp, alive: aHp > 0, xpGained: t.xpAttack ?? 0 });
    }
    const winner = aHp === 0 && spec.kind !== 'cityRanged' ? 'defender' : defenderDown ? 'attacker' : 'none';
    const dealt = toDefender;
    const margin = winner === 'none' ? 'none' : (winner === 'attacker' ? dealt >= 50 : toAttacker >= 50) ? 'clear' : 'narrow';
    return {
      battleId: spec.battleId, module: 'auto', moduleVersion: 1, winner, margin, units, city,
      attackerAdvances: winner === 'attacker' && !ranged, summaryKey: `battle.summary.${winner}`, replay: null,
      damage: { toDefender, toAttacker },
    };
  },
};
