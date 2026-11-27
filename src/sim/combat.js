// Combat (section 3.6): the engine's half of every battle.
//
// The engine works out each side's strength and every modifier, packs them
// into a BattleSpec (section 5.2), lets a battle module decide how the fight
// plays out, then checks and applies the BattleResult: damage, deaths,
// advancing into the hex, capturing civilians and cities, and experience.
//
// Modifiers (numbers in tuning.json under combat):
//   defender on hills +hillsDefence; feature defence from data (forest +3,
//   marsh -2); a fort's defence; fortified for fortifyTurns turns +fortifyBonus
//   attacker crossing a river (melee) +riverAttackPenalty (negative)
//   attacker flanking (melee): +flankingBonus per other friendly combat unit
//   next to the defender
//   both: -woundedPenaltyPer10Hp per 10 HP missing; combatBonus abilities
//   and promotions (with vs and when filters)

import { supplyModifiers } from './war.js';
import { sideOf } from './frontline.js';
import { neighbourCache } from './map.js';
import { distance } from './borders.js';
import { unitsAt, slotOf, isEnemy, unitDef } from './units.js';
import { buildingDef } from './effects/index.js';
import { random } from '../core/rng.js';
import { knows } from './progression.js';

export const CITY_REF = 'city';

const combatTuning = (ruleset) => ruleset.tuning?.combat ?? {};

/** Is this unit's class melee, ranged, siege, or not a fighter at all? */
export function combatKind(ruleset, unit) {
  const def = unitDef(ruleset, unit);
  const cls = ruleset.unitClasses?.[def?.class];
  if (!cls || cls.civilian || cls.combat === 'none') return 'none';
  return cls.combat; // 'melee' or 'ranged'
}

export function rangeOf(ruleset, unit) {
  return unitDef(ruleset, unit)?.range ?? 0;
}

/** Combat bonuses from a unit's abilities and promotions that apply in this fight. */
export function combatBonuses(ruleset, unit, { role, opponent }) {
  const out = [];
  const effects = [...(unitDef(ruleset, unit)?.abilities ?? [])];
  for (const p of unit.promotions ?? []) for (const e of ruleset.promotions?.[p]?.effects ?? []) effects.push({ ...e, promotion: p });
  for (const e of effects) {
    if (e.effect !== 'combatBonus') continue;
    if (e.when === 'attacking' && role !== 'attacker') continue;
    if (e.when === 'defending' && role !== 'defender') continue;
    const vs = e.vs ?? {};
    if (vs.class && vs.class !== opponent.class) continue;
    if (vs.tags && !(opponent.tags ?? []).includes(vs.tags)) continue;
    if (vs.city && !opponent.isCity) continue;
    if (vs.ranged && !opponent.ranged) continue;
    out.push({ source: e.promotion ? `promotion:${e.promotion}` : 'ability', amount: e.amount });
  }
  return out;
}

function wounded(unit, t) {
  const missing = Math.floor((100 - unit.hp) / 10);
  return missing > 0 ? [{ source: 'wounded', amount: -missing * (t.woundedPenaltyPer10Hp ?? 1) }] : [];
}

/** The defensive terrain modifiers on a tile. */
export function terrainModifiers(state, ruleset, tile) {
  const t = combatTuning(ruleset);
  const map = state.map;
  const out = [];
  if (map.hills[tile]) out.push({ source: 'hills', amount: t.hillsDefence ?? 3 });
  const f = map.feature[tile] >= 0 ? ruleset.features[map.featureIds[map.feature[tile]]] : null;
  if (f?.defence) out.push({ source: map.featureIds[map.feature[tile]], amount: f.defence });
  const imp = map.improvement && map.improvement[tile] >= 0 ? ruleset.improvements?.[map.improvementIds[map.improvement[tile]]] : null;
  if (imp?.defence) out.push({ source: map.improvementIds[map.improvement[tile]], amount: imp.defence });
  return out;
}

/** A city's combat strength: its best unit's strength (or its garrison's), plus a bonus, plus its walls. */
export function cityStrength(state, ruleset, city) {
  const t = combatTuning(ruleset);
  let best = 0;
  for (const def of Object.values(ruleset.units)) {
    if (ruleset.unitClasses[def.class]?.combat !== 'melee') continue;
    if (def.requires?.faction && def.requires.faction !== state.factions.find((f) => f.id === city.faction)?.civ) continue;
    if (def.unique || (def.requires?.side !== undefined && sideOf(state, ruleset, city.faction) !== def.requires.side)) continue;
    if (def.requires?.tech && !knows(state, city.faction, def.requires.tech)) continue;
    if (def.requires?.civic || def.requires?.resource) continue;
    best = Math.max(best, def.strength);
  }
  for (const u of unitsAt(state, city.tile)) if (u.faction === city.faction) best = Math.max(best, unitDef(ruleset, u).strength);
  const walls = city.buildings.filter((b) => (buildingDef(ruleset, b)?.defence ?? 0) > 0).length;
  return best + (t.cityStrengthBonus ?? 3) + walls * (t.wallsStrength ?? 5) + (state.map.hills[city.tile] ? t.hillsDefence ?? 3 : 0);
}

export function cityMaxHp(ruleset, city) {
  let hp = ruleset.tuning?.combat?.cityHp ?? 200;
  for (const b of city.buildings) hp += buildingDef(ruleset, b)?.defence ?? 0;
  return hp;
}

export function cityHasWalls(ruleset, city) {
  return city.buildings.some((b) => (buildingDef(ruleset, b)?.defence ?? 0) > 0);
}

function cityAtTile(state, tile) {
  return Object.values(state.cities ?? {}).find((c) => c.tile === tile) ?? null;
}

/** The enemy combat unit that defends a tile (the strongest), if any. */
export function defenderAt(state, ruleset, attackerFaction, tile) {
  let best = null;
  for (const u of unitsAt(state, tile)) {
    if (!isEnemy(state, attackerFaction, u.faction) || slotOf(ruleset, u.type) === 'civilian') continue;
    if (!best || unitDef(ruleset, u).strength * u.hp > unitDef(ruleset, best).strength * best.hp) best = u;
  }
  return best;
}

function unitEntry(ruleset, u) {
  const def = unitDef(ruleset, u);
  return {
    ref: u.id, type: u.type, class: def.class, strength: def.strength, rangedStrength: def.rangedStrength ?? 0,
    hp: u.hp, xp: u.xp ?? 0, promotions: (u.promotions ?? []).slice(), tags: (def.tags ?? []).slice(), sprite: def.sprite ?? `unit.${u.type}`,
  };
}

function groundOf(state, ruleset, tile) {
  const map = state.map;
  const describe = (t) => ({
    terrain: map.terrainIds[map.terrain[t]], hills: Boolean(map.hills[t]),
    feature: map.feature[t] >= 0 ? map.featureIds[map.feature[t]] : null, river: map.river[t] !== 0,
  });
  return { centre: describe(tile), ring: neighbourCache(map)[tile].filter((j) => j >= 0).map(describe) };
}

/**
 * Why `unit` cannot attack `target` right now (a code), or null. Melee needs an
 * adjacent enemy unit or city; ranged needs one within range.
 */
export function attackProblem(state, ruleset, unit, target, seen = null) {
  const kind = combatKind(ruleset, unit);
  if (kind === 'none') return 'cannotAttack';
  if (unit.moves <= 0) return 'noMoves';
  if (target < 0 || target >= state.map.width * state.map.height) return 'badTarget';
  const reach = kind === 'ranged' ? rangeOf(ruleset, unit) : 1;
  const dist = distance(state.map, unit.tile, target);
  if (dist > reach) return kind === 'ranged' ? 'outOfRange' : 'notAdjacent';
  if (seen && !seen(target)) return 'cannotSee';
  const city = cityAtTile(state, target);
  const hostileCity = city && isEnemy(state, unit.faction, city.faction);
  // Units inside a city you are at peace with are out of reach.
  if (city && !hostileCity && city.faction !== unit.faction) return 'atPeace';
  const defender = defenderAt(state, ruleset, unit.faction, target);
  const civilians = unitsAt(state, target).filter((u) => isEnemy(state, unit.faction, u.faction));
  if (!hostileCity && !defender && !civilians.length) {
    // Someone is there but we are at peace with them.
    const other = unitsAt(state, target).find((u) => u.faction !== unit.faction) ?? (city && city.faction !== unit.faction ? city : null);
    return other ? 'atPeace' : 'noEnemy';
  }
  const d = distance(state.map, unit.tile, target);
  if (kind === 'ranged') {
    if (d > rangeOf(ruleset, unit) || d === 0) return 'outOfRange';
    if (!hostileCity && !defender) return 'noEnemy';
    return null;
  }
  if (d !== 1) return 'notAdjacent';
  const terrain = ruleset.terrain[state.map.terrainIds[state.map.terrain[target]]];
  const domain = unitDef(ruleset, unit).domain ?? ruleset.unitClasses[unitDef(ruleset, unit).class]?.domain ?? 'land';
  if (domain === 'land' && terrain?.water) return 'badTarget';
  return null;
}

/**
 * Build the BattleSpec for an attack, without touching the game's dice (the
 * seed is filled in by the caller). Works on a full state or a view-built one.
 */
export function buildSpec(state, ruleset, unit, target) {
  const t = combatTuning(ruleset);
  const kind0 = combatKind(ruleset, unit);
  const city = cityAtTile(state, target);
  const hostileCity = city && isEnemy(state, unit.faction, city.faction) ? city : null;
  const defender = defenderAt(state, ruleset, unit.faction, target);
  const ranged = kind0 === 'ranged';
  const kind = ranged ? 'ranged' : 'field';
  const attackerEntry = unitEntry(ruleset, unit);
  const aMods = [...wounded(unit, t), ...supplyModifiers(ruleset, unit)];
  const dMods = [];
  let defenderSide;
  const opponentInfo = (u) => ({ class: unitDef(ruleset, u).class, tags: unitDef(ruleset, u).tags ?? [], ranged: combatKind(ruleset, u) === 'ranged' });

  if (hostileCity) {
    defenderSide = {
      faction: hostileCity.faction, civ: state.factions.find((f) => f.id === hostileCity.faction)?.civ ?? null, human: state.factions.find((f) => f.id === hostileCity.faction)?.kind === 'human',
      units: defender ? [unitEntry(ruleset, defender)] : [],
      city: { ref: hostileCity.id, name: hostileCity.name, strength: cityStrength(state, ruleset, hostileCity), hp: hostileCity.hp ?? cityMaxHp(ruleset, hostileCity), walls: cityHasWalls(ruleset, hostileCity) },
    };
    aMods.push(...combatBonuses(ruleset, unit, { role: 'attacker', opponent: { isCity: true } }));
    if (unitDef(ruleset, unit).class === 'siege') aMods.push({ source: 'siege', amount: t.siegeVsCity ?? 10 });
  } else {
    defenderSide = { faction: defender.faction, civ: state.factions.find((f) => f.id === defender.faction)?.civ ?? null, human: state.factions.find((f) => f.id === defender.faction)?.kind === 'human', units: [unitEntry(ruleset, defender)], city: null };
    dMods.push(...terrainModifiers(state, ruleset, target));
    if (defender.activity === 'fortify' && defender.fortifiedTurns >= (t.fortifyTurns ?? 2)) dMods.push({ source: 'fortified', amount: t.fortifyBonus ?? 4 });
    dMods.push(...wounded(defender, t), ...supplyModifiers(ruleset, defender));
    dMods.push(...combatBonuses(ruleset, defender, { role: 'defender', opponent: opponentInfo(unit) }));
    aMods.push(...combatBonuses(ruleset, unit, { role: 'attacker', opponent: opponentInfo(defender) }));
  }
  if (!ranged) {
    const d = neighbourCache(state.map)[unit.tile].indexOf(target);
    if (d >= 0 && (state.map.river[unit.tile] & (1 << d))) aMods.push({ source: 'river', amount: t.riverAttackPenalty ?? -5 });
    let flank = 0;
    for (const j of neighbourCache(state.map)[target]) {
      if (j < 0 || j === unit.tile) continue;
      if (unitsAt(state, j).some((u) => u.faction === unit.faction && combatKind(ruleset, u) !== 'none')) flank += 1;
    }
    if (flank) aMods.push({ source: 'flanking', amount: flank * (t.flankingBonus ?? 2) });
  }
  const battle = ruleset.tuning?.battle?.auto ?? { baseDamage: t.baseDamage ?? 30, strengthScale: t.strengthScale ?? 25, spread: 0.2 };
  const xp = ruleset.tuning?.experience ?? {};
  return {
    battleId: `t${state.turn}-b${(state.battleCount ?? 0) + 1}`,
    seed: 0,
    turn: state.turn,
    kind: hostileCity && !ranged ? 'city' : kind,
    attacker: { faction: unit.faction, civ: state.factions.find((f) => f.id === unit.faction)?.civ ?? null, human: state.factions.find((f) => f.id === unit.faction)?.kind === 'human', units: [attackerEntry], support: [] },
    defender: defenderSide,
    ground: { ...groundOf(state, ruleset, target), riverCrossing: aMods.some((m) => m.source === 'river') },
    modifiers: { attacker: aMods, defender: dMods },
    // Interactive modules read their own slice (battle.<id>, section 5.2).
    tuning: { ...battle, xpAttack: xp.perAttack ?? 5, xpDefence: xp.perDefence ?? 3, tactical: ruleset.tuning?.battle?.tactical ?? null, killzone: ruleset.tuning?.battle?.killzone ?? null },
    skin: ruleset.skin?.id ?? null,
    target,
  };
}

/** A spec for a city's own ranged shot at a unit. */
export function buildCitySpec(state, ruleset, city, target) {
  const t = combatTuning(ruleset);
  const defender = defenderAt(state, ruleset, city.faction, target);
  const dMods = [...terrainModifiers(state, ruleset, target), ...wounded(defender, t), ...supplyModifiers(ruleset, defender)];
  if (defender.activity === 'fortify' && defender.fortifiedTurns >= (t.fortifyTurns ?? 2)) dMods.push({ source: 'fortified', amount: t.fortifyBonus ?? 4 });
  const strength = cityStrength(state, ruleset, city);
  const battle = ruleset.tuning?.battle?.auto ?? { baseDamage: 30, strengthScale: 25, spread: 0.2 };
  return {
    battleId: `t${state.turn}-b${(state.battleCount ?? 0) + 1}`, seed: 0, turn: state.turn, kind: 'cityRanged',
    attacker: { faction: city.faction, human: state.factions.find((f) => f.id === city.faction)?.kind === 'human', units: [{ ref: CITY_REF, type: 'city', class: 'city', strength, rangedStrength: strength, hp: 100, xp: 0, promotions: [], tags: [], sprite: 'city' }], support: [], city: city.id },
    defender: { faction: defender.faction, human: state.factions.find((f) => f.id === defender.faction)?.kind === 'human', units: [unitEntry(ruleset, defender)], city: null },
    ground: { ...groundOf(state, ruleset, target), riverCrossing: false },
    modifiers: { attacker: [], defender: dMods },
    tuning: { ...battle, xpAttack: 0, xpDefence: ruleset.tuning?.experience?.perDefence ?? 3 },
    skin: ruleset.skin?.id ?? null,
    target,
  };
}

/** Draw this battle's own seed from the game dice, once (working copy). */
export function seedBattle(state, spec) {
  state.battleCount = (state.battleCount ?? 0) + 1;
  spec.battleId = `t${state.turn}-b${state.battleCount}`;
  spec.seed = Math.floor(random(state) * 4294967296);
  return spec;
}

/** Promotions a unit has earned but not yet chosen. */
export function promotionsAvailable(ruleset, unit) {
  const thresholds = ruleset.tuning?.experience?.promotionThresholds ?? [15, 45, 90, 150];
  return thresholds.filter((x) => (unit.xp ?? 0) >= x).length - (unit.promotions ?? []).length;
}

/**
 * Apply a validated result (working copy): hp, deaths, experience, the
 * attacker's move ending, advancing, capturing civilians and cities.
 */
export function applyResult(state, ruleset, spec, result, events) {
  const target = spec.target;
  // Where the attack came from (for the map's animation; graphics overhaul G6).
  const fromTile = spec.attacker.city ? state.cities[spec.attacker.city]?.tile ?? null : state.units[spec.attacker.units[0]?.ref]?.tile ?? null;
  for (const r of result.units) {
    if (r.ref === CITY_REF) continue;
    const u = state.units[r.ref];
    if (!u) continue;
    const before = promotionsAvailable(ruleset, u);
    u.hp = r.hp;
    u.xp = (u.xp ?? 0) + (r.alive ? r.xpGained ?? 0 : 0);
    if (!r.alive) {
      delete state.units[r.ref];
      const by = u.faction === spec.attacker.faction ? spec.defender.faction : spec.attacker.faction;
      events.push({ type: 'unitKilled', unit: r.ref, unitType: u.type, faction: u.faction, tile: u.tile, by });
    } else if (promotionsAvailable(ruleset, u) > before) {
      events.push({ type: 'promotionReady', unit: u.id, faction: u.faction });
    }
  }
  if (spec.kind === 'cityRanged') {
    state.cities[spec.attacker.city].shotTurn = state.turn;
  } else {
    const attacker = state.units[spec.attacker.units[0].ref];
    if (attacker) { attacker.moves = 0; attacker.acted = true; attacker.activity = 'none'; attacker.fortifiedTurns = 0; }
  }
  let captured = null;
  if (spec.defender.city) {
    const city = state.cities[spec.defender.city.ref];
    city.hp = result.city.hp;
    city.lastAttacked = state.turn;
    const attacker = state.units[spec.attacker.units[0].ref];
    if (city.hp === 0 && attacker && spec.kind === 'city' && combatKind(ruleset, attacker) === 'melee') captured = city;
  }
  const attacker = state.units[spec.attacker.units[0].ref];
  if (attacker && (result.attackerAdvances || captured) && spec.kind !== 'ranged') {
    const stillHostile = unitsAt(state, target).some((u) => isEnemy(state, attacker.faction, u.faction) && slotOf(ruleset, u.type) !== 'civilian');
    if (!stillHostile) {
      // Enemy civilians on the hex are taken; the garrison of a captured city is destroyed.
      for (const u of unitsAt(state, target)) {
        if (!isEnemy(state, attacker.faction, u.faction)) continue;
        if (slotOf(ruleset, u.type) === 'civilian') {
          u.faction = attacker.faction; u.moves = 0; u.goto = null; u.activity = 'none';
          events.push({ type: 'unitCaptured', unit: u.id, unitType: u.type, faction: attacker.faction, tile: target });
        }
      }
      const from = attacker.tile;
      attacker.tile = target;
      events.push({ type: 'unitMoved', unit: attacker.id, faction: attacker.faction, path: [from, target] });
      if (state.raiders?.camps?.[target] && attacker.faction !== 'raiders') {
        delete state.raiders.camps[target];
        const gold = ruleset.tuning?.raiders?.campGold ?? 30;
        const f = state.factions.find((x) => x.id === attacker.faction);
        if (f?.stocks) f.stocks.gold += gold;
        events.push({ type: 'campCleared', tile: target, faction: attacker.faction, gold });
      }
    }
  }
  if (captured) captureCity(state, ruleset, captured, attacker.faction, events);
  events.push({ type: 'battle', battleId: spec.battleId, kind: spec.kind, attacker: spec.attacker.units[0].ref, attackerFaction: spec.attacker.faction,
    attackerType: spec.attacker.units[0].type, defenderType: spec.defender.units[0]?.type ?? null, attackerCity: spec.attacker.city ?? null,
    defenderFaction: spec.defender.faction, target, from: fromTile, winner: result.winner, margin: result.margin, damage: result.damage ?? null, city: spec.defender.city?.ref ?? null });
}

/** A city changes hands (section 3.2). The new owner must still choose Keep or Raze. */
export function captureCity(state, ruleset, city, newFaction, events) {
  const old = city.faction;
  city.faction = newFaction;
  city.captured = true;
  city.capital = false;
  city.buildings = city.buildings.filter((b) => !buildingDef(ruleset, b)?.requires?.capital);
  city.queue = [];
  city.progress = 0;
  city.locks = [];
  city.hp = Math.round(cityMaxHp(ruleset, city) / 4);
  for (const u of unitsAt(state, city.tile)) if (u.faction === old) delete state.units[u.id];
  state.pendingCapture = { city: city.id, faction: newFaction };
  events.push({ type: 'cityCaptured', city: city.id, name: city.name, faction: newFaction, from: old, tile: city.tile });
}
