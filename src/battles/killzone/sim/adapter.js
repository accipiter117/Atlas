// The Killzone platoon battle, adapted to Atlas (docs/PLAN.md section 5.5).
//
// The battle itself is the Killzone project's own sim, vendored unchanged in
// ./vendor (createMatch, runToEnd, result.platoons[].survivors). This file
// only translates:
//   spec -> forces: each strategic unit becomes a platoon. Its strength (with
//     the engine's modifiers) sets how many squads it fields
//     (tuning.strengthPerSquad, between minSquads and maxSquads), its class
//     sets their roles (tuning.roles), and its health sets how many soldiers
//     of each squad are present (soldiersPerSquad x hp / 100).
//   ground -> the battle map: a city is fought in the streets, a dug-in
//     defence (hills, woods, fortified) in the trenches, anything else on
//     industrial ground; the defenders fight from trenches when dug in.
//   result -> survivors back to health: hp = starting hp x soldiers left /
//     soldiers present. A side whose platoons all broke is routed and lost.
//     A battle that runs out of time leaves both sides standing, but the side
//     that lost on points (held fewer objectives) takes a further share of
//     damage by how badly it lost (tuning.timeLoss: narrow, clear, crushing).
// No DOM; the seed comes from the engine's battle seed.

import { createMatch, runToEnd } from './vendor/match.js';
import { createAI } from './vendor/ai.js';
import { CONFIG } from './config.js';

const sum = (mods) => (mods ?? []).reduce((n, m) => n + m.amount, 0);
const DUG_IN = new Set(['hills', 'forest', 'fortified', 'walls', 'city']);

export function killzoneTuning(spec) {
  return spec.tuning?.killzone ?? {};
}

/** Which battle side (0 the ISA's, 1 the Helghast's) the attacker takes. */
export function attackerSideOf(spec) {
  return (killzoneTuning(spec).secondSide ?? ['helghast']).includes(spec.attacker.civ) ? 1 : 0;
}

/**
 * K6: what the war works on and around the hex add to the battle (tuning killzone.works, by
 * work id): the defender's works on the hex and beside it, and either side's support works
 * (artillery) beside it. Returns { side0, side1, dug } with each side's extras.
 */
export function worksOf(spec) {
  const t = killzoneTuning(spec).works ?? {};
  const aSide = attackerSideOf(spec);
  const extras = [{ opBonus: 0, artillery: false, fortified: false }, { opBonus: 0, artillery: false, fortified: false }];
  const apply = (w, onHex) => {
    const e = w?.id ? t[w.id] : null;
    if (!e) return;
    const side = w.side === 0 || w.side === 1 ? w.side : 1 - aSide;
    const x = extras[side];
    // Fortifications count only on the hex itself, for its defenders; support reaches from beside it.
    if (onHex && side === 1 - aSide) {
      if (e.fortified) x.fortified = true;
      x.opBonus += e.opBonus ?? 0;
    }
    if (e.artillery) x.artillery = true;
    if (!onHex && e.supportOpBonus) x.opBonus += e.supportOpBonus;
  };
  apply(spec.ground?.centre?.work, true);
  for (const r of spec.ground?.ring ?? []) apply(r.work, false);
  return { side0: extras[0], side1: extras[1], dug: extras[1 - aSide].fortified };
}

/** The map the battle is fought on. */
export function mapTypeOf(spec) {
  // K6: a station's battles are fought in its built-up corridors (tuning killzone.worldMaps by world kind).
  const byWorld = killzoneTuning(spec).worldMaps?.[spec.ground?.worldKind];
  if (byWorld) return byWorld;
  if (spec.defender.city) return 'city';
  const w = worksOf(spec);
  const dug = (spec.modifiers?.defender ?? []).some((m) => DUG_IN.has(m.source)) || w.dug;
  return dug || spec.ground?.centre?.hills ? 'trenches' : 'industrial';
}

function platoonFor(t, u, power, i) {
  const per = CONFIG.soldiersPerSquad;
  const roles = t.roles?.[u.class] ?? t.roles?.default ?? ['rifle', 'heavy', 'engineer'];
  const squads = Math.max(t.minSquads ?? 1, Math.min(t.maxSquads ?? roles.length, Math.round(power / (t.strengthPerSquad ?? 12))));
  const list = Array.from({ length: squads }, (_, k) => roles[k % roles.length]);
  const present = Math.max(1, Math.round((per * u.hp) / 100));
  return { roles: list, name: u.type, ref: u.ref ?? `m${i}`, alive: list.map(() => present) };
}

/** The Killzone forces for a spec: [side 0, side 1], plus which side attacks. */
export function forcesFor(spec) {
  const t = killzoneTuning(spec);
  const aSide = attackerSideOf(spec);
  const ranged = spec.kind === 'ranged';
  const attacker = spec.attacker.units.map((u, i) => platoonFor(t, u, (ranged ? u.rangedStrength : u.strength) + sum(spec.modifiers?.attacker), i));
  const defenders = spec.defender.units.map((u, i) => platoonFor(t, u, u.strength + sum(spec.modifiers?.defender), i));
  // A city with no garrison is held by its militia (not a unit on the map).
  if (spec.defender.city && !defenders.length) defenders.push({ ...platoonFor(t, { class: 'militia', hp: spec.defender.city.hp * 100 / Math.max(1, spec.defender.city.hpMax ?? spec.defender.city.hp), type: 'militia' }, spec.defender.city.strength + sum(spec.modifiers?.defender), 0), ref: '__militia' });
  const type = mapTypeOf(spec);
  const dug = type !== 'industrial';
  const w = worksOf(spec);
  const ex = (side) => (side === 0 ? w.side0 : w.side1);
  // K6: vehicles in the attack bring the tank (tuning killzone.vehicleTank).
  const vehicle = Boolean(t.vehicleTank) && spec.attacker.units.some((u) => (u.tags ?? []).includes('vehicle'));
  const sides = [null, null];
  sides[aSide] = { platoons: attacker, tank: vehicle, artillery: ex(aSide).artillery, opBonus: ex(aSide).opBonus, fortified: false };
  sides[1 - aSide] = { platoons: defenders, tank: false, artillery: Boolean(spec.defender.city) || ex(1 - aSide).artillery, opBonus: ex(1 - aSide).opBonus, fortified: dug || ex(1 - aSide).fortified };
  return { forces: sides, aSide };
}

/** The options for createMatch. */
export function matchOptions(spec) {
  const t = killzoneTuning(spec);
  const type = mapTypeOf(spec);
  return {
    config: { map: { type }, world: { ...CONFIG.mapSizes[type] }, battle: { durationSec: t.durationSec ?? 150 } },
    forces: forcesFor(spec).forces,
  };
}

/** A battle seed from the engine's random function. */
export const seedFrom = (rng) => Math.floor(rng() * 2147483646) + 1;

/** Turn a finished Killzone battle into the Atlas BattleResult (section 5.3). */
export function toResult(spec, kzResult, replay) {
  const t = spec.tuning ?? {};
  const { forces, aSide } = forcesFor(spec);
  const dSide = 1 - aSide;
  const byRef = new Map(kzResult.platoons.map((p) => [`${p.side}:${p.ref}`, p]));
  const kt = killzoneTuning(spec);
  const lostOnPoints = (side) => kzResult.reason === 'time' && kzResult.winner === (1 - side);
  const pointsLoss = kt.timeLoss?.[kzResult.margin] ?? 0;
  const routed = (side) => kzResult.winner === (1 - side) && (kzResult.reason === 'broken' || kzResult.reason === 'hq');
  const unitResult = (u, side) => {
    const p = byRef.get(`${side}:${u.ref}`);
    const f = forces[side].platoons.find((x) => x.ref === u.ref);
    const present = f.alive.reduce((a, b) => a + b, 0);
    const left = p ? p.survivors.reduce((a, b) => a + Math.min(b, present), 0) : 0;
    let hp = Math.min(u.hp, Math.round((u.hp * Math.min(left, present)) / present));
    if (lostOnPoints(side)) hp = Math.round(hp * (1 - pointsLoss));
    if (routed(side)) hp = 0;
    return { ref: u.ref, hp, alive: hp > 0, xpGained: side === aSide ? (t.xpAttack ?? 0) : (t.xpDefence ?? 0) };
  };
  const units = [...spec.attacker.units.map((u) => unitResult(u, aSide)), ...spec.defender.units.map((u) => unitResult(u, dSide))];
  let city = null;
  if (spec.defender.city) {
    const c = spec.defender.city;
    const kept = forces[dSide].platoons.reduce((n, f) => {
      const p = byRef.get(`${dSide}:${f.ref}`);
      return n + (p ? p.survivors.reduce((a, b) => a + b, 0) : 0);
    }, 0);
    const had = forces[dSide].platoons.reduce((n, f) => n + f.alive.reduce((a, b) => a + b, 0), 0);
    const share = (Math.min(kept, had) / Math.max(1, had)) * (lostOnPoints(dSide) ? 1 - pointsLoss : 1);
    city = { ref: c.ref, hp: routed(dSide) ? 0 : Math.min(c.hp, Math.max(1, Math.round(c.hp * share))) };
  }
  const attackers = units.slice(0, spec.attacker.units.length);
  let attackerAlive = attackers.some((u) => u.alive);
  const defenderDown = city ? city.hp === 0 : units.slice(spec.attacker.units.length).every((u) => !u.alive);
  if (!attackerAlive && defenderDown) { attackers[0].hp = 1; attackers[0].alive = true; attackerAlive = true; }
  const winner = !attackerAlive ? 'defender' : defenderDown ? 'attacker' : 'none';
  const margin = winner === 'none' ? 'none' : kzResult.margin === 'narrow' ? 'narrow' : 'clear';
  return {
    battleId: spec.battleId, module: 'killzone', moduleVersion: 1, winner, margin, units, city,
    attackerAdvances: winner === 'attacker' && spec.kind !== 'ranged', summaryKey: `battle.summary.${winner}`,
    replay, killzone: { winner: kzResult.winner, reason: kzResult.reason, margin: kzResult.margin, durationSec: kzResult.durationSec, attackerSide: aSide },
  };
}

/** Play the whole battle headless, the computer commanding both sides. */
export function simulateKillzone(spec, rng) {
  const seed = seedFrom(rng);
  const match = createMatch({ seed, options: matchOptions(spec), controllers: [createAI(0), createAI(1)] });
  const r = runToEnd(match);
  return toResult(spec, r, { seed, commands: match.log.commands.length });
}
