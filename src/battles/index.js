// Battle modules (docs/PLAN.md section 5).
//
// When armies meet, the engine packs the fight into a BattleSpec, hands it to
// a module, and checks the BattleResult before applying it. Modules register
// here by id. 'auto' resolves instantly inside the rules; an interactive
// module (one with a screen) registers itself the same way and provides
// simulate() so computer-only battles and tests can run it headless.

import auto from './auto/index.js';
import tactical from './tactical/index.js';
import killzone from './killzone/index.js';

const MODULES = new Map([[auto.id, auto], [tactical.id, tactical], [killzone.id, killzone]]);

/** Every module, for the setup screen's list. */
export function moduleIds() {
  return [...MODULES.keys()];
}

export function registerModule(mod) {
  if (!mod?.id || !['instant', 'interactive'].includes(mod.kind)) throw new Error('A battle module needs an id and a kind');
  MODULES.set(mod.id, mod);
}

export function unregisterModule(id) {
  if (id !== 'auto') MODULES.delete(id);
}

export function getModule(id) {
  return MODULES.get(id) ?? null;
}

export function autoModule() {
  return auto;
}

/**
 * Check a result against its spec (section 5.3): every unit ref came from the
 * spec, hp is between 0 and its starting value, a dead unit has 0 hp, a city
 * keeps its hp in range, and the winner agrees with who survived.
 * Returns null if the result is good, else a short reason.
 */
export function validateResult(spec, result) {
  if (!result || typeof result !== 'object') return 'not an object';
  if (result.battleId !== spec.battleId) return 'battleId does not match';
  if (!['attacker', 'defender', 'none'].includes(result.winner)) return 'winner must be attacker, defender or none';
  if (!Array.isArray(result.units)) return 'units must be a list';
  const start = new Map();
  for (const side of ['attacker', 'defender']) for (const u of spec[side].units) start.set(u.ref, { hp: u.hp, side });
  const seen = new Set();
  for (const u of result.units) {
    const s = start.get(u?.ref);
    if (!s) return `unit ${u?.ref} was not in the battle`;
    if (seen.has(u.ref)) return `unit ${u.ref} listed twice`;
    seen.add(u.ref);
    if (!Number.isInteger(u.hp) || u.hp < 0 || u.hp > s.hp) return `unit ${u.ref} hp ${u.hp} is out of range`;
    if (typeof u.alive !== 'boolean' || (u.alive && u.hp === 0) || (!u.alive && u.hp !== 0)) return `unit ${u.ref} alive and hp disagree`;
  }
  if (seen.size !== start.size) return 'every unit in the battle must be in the result';
  const city = spec.defender.city;
  if (city) {
    if (!result.city || result.city.ref !== city.ref) return 'the city is missing from the result';
    if (!Number.isInteger(result.city.hp) || result.city.hp < 0 || result.city.hp > city.hp) return 'city hp is out of range';
  }
  const alive = (side) => result.units.some((u) => start.get(u.ref).side === side && u.alive);
  const attackerAlive = alive('attacker');
  const defenderDown = city ? result.city.hp === 0 : !alive('defender');
  const expected = !attackerAlive ? 'defender' : defenderDown ? 'attacker' : 'none';
  if (result.winner !== expected) return `winner should be ${expected}`;
  return null;
}

/** The auto module's damage curve and strength sums, for odds previews. */
export { damage, strengths } from './auto/index.js';
