// Tactics (section 9.4): what each unit does this turn.
//
// - Attacks only at good odds: a likely kill (attackMinWinChance, higher
//   against cities), or a clearly favourable exchange (attackMinDamageRatio,
//   keeping attackMinHpAfter), or any ranged shot that does real damage.
//   Melee units walk into a city whose defences are at 0.
// - Garrisons: each city keeps defendersPerCity units fortified inside.
// - At war: everyone else marches on the nearest known enemy city (gathering
//   first a few hexes away when military.musterUnits is set).
// - Badly hurt units go home to heal.
// - Settlers go to the best site and found; builders improve worked land;
//   scouts explore the nearest edge of the unknown.

import { missionaryMove } from './planners/religion.js';
import { traderMove } from './planners/trade.js';
import { attackProblem, combatKind, rangeOf, improvementProblem, builderTargets, foundingProblem, findPath, atWar, tileYields, UNEXPLORED, VISIBLE } from '../sim/index.js';
import { neighbourCache } from '../sim/index.js';
import { weightsOf, odds, dist } from './evaluate.js';
import { surroundingsKnown } from './planners/expansion.js';

function pathTo(world, view, ruleset, unit, target) {
  const fog = view.fog;
  return findPath(world, ruleset, unit, target, { known: (t) => fog[t] !== UNEXPLORED, seen: (t) => fog[t] === VISIBLE });
}

/** The best reachable hex within `range` of a goal (to stand on, or attack from). */
function approach(world, view, ruleset, unit, goal, range = 1) {
  let best = null;
  const map = view.map;
  const r0 = Math.floor(goal / map.width);
  for (let r = Math.max(0, r0 - range - 1); r <= Math.min(map.height - 1, r0 + range + 1); r += 1) {
    for (let c = 0; c < map.width; c += 1) {
      const t = r * map.width + c;
      if (t === goal || t === unit.tile || dist(map, t, goal) > range) continue;
      const p = pathTo(world, view, ruleset, unit, t);
      if (p && (!best || p.arrivesOnTurn < best.p.arrivesOnTurn || (p.arrivesOnTurn === best.p.arrivesOnTurn && p.tiles.length < best.p.tiles.length))) best = { t, p };
    }
  }
  return best?.t ?? null;
}

const move = (view, unit, to, reasonKey, params, score = 1) => ({ cmd: { type: 'moveUnit', faction: view.me, unit: unit.id, to }, reasonKey, params, score });

/** The best attack this unit can make now, if the odds are good enough. */
export function bestAttack(world, view, ruleset, unit, path = null, stance = null, extra = null) {
  // K5: a delegated theatre's stance moves the odds it will take (data: aiWeights theatre.stances),
  // and a siege its odds against a base (theatre.siege).
  const th = { ...weightsOf(ruleset, 'thresholds'), ...(stance ? weightsOf(ruleset, 'theatre').stances?.[stance] ?? {} : {}), ...(extra ?? {}) };
  const seen = (t) => view.fog[t] === VISIBLE;
  const candidates = [];
  const targets = new Set();
  for (const u of view.units) if (u.faction !== view.me && atWar(world, view.me, u.faction)) targets.add(u.tile);
  for (const c of view.cities) if (c.faction !== view.me && atWar(world, view.me, c.faction)) targets.add(c.tile);
  for (const t of targets) {
    if (attackProblem(world, ruleset, unit, t, seen)) continue;
    const o = odds(world, ruleset, unit, t);
    if (!o) {
      candidates.push({ t, score: 5, reasonKey: 'ai.reason.capture', o: null });
      continue;
    }
    let ok = false;
    if (o.city) {
      ok = o.ranged ? o.dealt >= 5 : (o.defenderHp === 0 || o.win >= (th.cityAttackMinWinChance ?? 0.7));
      // Wearing a city down with melee (thresholds.cityMeleeMinDealt in data; off when absent).
      const wearPaths = th.cityMeleePaths ?? null;
      if (!ok && !o.ranged && th.cityMeleeMinDealt && (!wearPaths || wearPaths.includes(path))) {
        ok = o.dealt >= th.cityMeleeMinDealt && o.attackerHp - o.taken >= (th.attackMinHpAfter ?? 35)
          // K5: a siege trades blows only when this unit gives a fair share of what it takes (theatre.siege.cityMinDamageRatio).
          && o.dealt >= o.taken * (th.cityMinDamageRatio ?? 0);
      }
    } else if (o.ranged) {
      ok = o.dealt >= 8;
    } else {
      ok = o.win >= (th.attackMinWinChance ?? 0.6)
        || (o.dealt >= o.taken * (th.attackMinDamageRatio ?? 1.3) && o.attackerHp - o.taken >= (th.attackMinHpAfter ?? 35));
    }
    if (ok) candidates.push({ t, score: o.win * 10 + o.dealt / 10 - o.taken / 20, reasonKey: o.city ? 'ai.reason.attackCity' : 'ai.reason.attack', o });
  }
  candidates.sort((a, b) => b.score - a.score || a.t - b.t);
  const best = candidates[0];
  if (!best) return null;
  return {
    cmd: { type: 'attack', faction: view.me, unit: unit.id, target: best.t }, score: best.score, reasonKey: best.reasonKey,
    params: { unit: unit.type, win: Math.round((best.o?.win ?? 1) * 100), dealt: Math.round(best.o?.dealt ?? 0), taken: Math.round(best.o?.taken ?? 0) },
  };
}

/** One unit's decision. ctx carries the turn's shared picture (sites, garrisons, threat, war target). */
export function decideUnit(world, view, ruleset, memory, unit, ctx) {
  const def = ruleset.units[unit.type];
  const tags = def.tags ?? [];
  const me = view.me;
  const th = weightsOf(ruleset, 'thresholds');
  const myCities = view.cities.filter((c) => c.faction === me);

  if (def.faithOnly && unit.religion) return missionaryMove(world, view, ruleset, unit, move, approach);
  if (tags.includes('trader')) return traderMove(world, view, ruleset, memory, unit, move);
  // Spy units are posted by the espionage planner; until then they wait.
  if (tags.includes('spy')) return { cmd: { type: 'skip', faction: me, unit: unit.id }, score: 0, reasonKey: 'ai.reason.hold', params: {} };

  if (tags.includes('founder')) {
    const here = foundingProblem(world, ruleset, me, unit.tile) || !surroundingsKnown(view, ruleset, unit.tile) ? null : (ctx.siteScoreAt(unit.tile) ?? 0);
    const site = ctx.claimSite(unit);
    if (here !== null && (!site || here >= site.score * 0.85 || !myCities.length)) {
      return { cmd: { type: 'foundCity', faction: me, unit: unit.id }, score: here, reasonKey: myCities.length ? 'ai.reason.found' : 'ai.reason.foundCapital', params: {} };
    }
    if (site) return move(view, unit, site.tile, 'ai.reason.toSite', { score: Math.round(site.score) }, site.score);
    // Nowhere known to go: settle here if allowed, otherwise look for land.
    if (here !== null) return { cmd: { type: 'foundCity', faction: me, unit: unit.id }, score: 1, reasonKey: 'ai.reason.found', params: {} };
    const frontier = ctx.frontierFor(unit);
    if (frontier !== null) return move(view, unit, frontier, 'ai.reason.explore', {}, 1);
    return null;
  }

  if (tags.includes('worker')) {
    const job = ctx.builderJob(unit);
    if (!job) return null;
    if (job.from === unit.tile) return { cmd: { type: 'buildImprovement', faction: me, unit: unit.id, improvement: job.improvement, tile: job.tile }, score: job.gain, reasonKey: 'ai.reason.improve', params: { improvement: job.improvement } };
    return move(view, unit, job.from, 'ai.reason.toImprove', { improvement: job.improvement }, job.gain);
  }

  if (combatKind(ruleset, unit) === 'none') return null;
  const attack = bestAttack(world, view, ruleset, unit, memory.path ?? null, memory.stance ?? null);
  if (attack) return attack;

  // K5: outnumbered near the front, fall back to the nearest of our own fortifications.
  const fallBack = fortifiedRefuge(view, ruleset, unit);
  if (fallBack !== null) {
    if (fallBack === unit.tile) return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 2, reasonKey: 'ai.reason.dugIn', params: {} };
    return move(view, unit, fallBack, 'ai.reason.fallBack', {}, 2);
  }
  // K5: holding the line means staying put.
  if (memory.stance === 'hold' && unit.activity !== 'fortify') return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 1, reasonKey: 'ai.reason.hold', params: {} };

  // Badly hurt: go home and heal.
  if (unit.hp < (th.retreatHp ?? 35)) {
    const home = myCities.slice().sort((a, b) => dist(view.map, a.tile, unit.tile) - dist(view.map, b.tile, unit.tile))[0];
    if (home && home.tile !== unit.tile && !view.units.some((u) => u.tile === home.tile && u.faction === me && u.id !== unit.id && combatKind(ruleset, u) !== 'none')) {
      return move(view, unit, home.tile, 'ai.reason.retreat', { hp: unit.hp }, 1);
    }
    return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 1, reasonKey: 'ai.reason.heal', params: { hp: unit.hp } };
  }

  // Garrison duty.
  const post = ctx.garrisonFor(unit);
  if (post !== null) {
    if (post === unit.tile) return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 2, reasonKey: 'ai.reason.garrison', params: {} };
    return move(view, unit, post, 'ai.reason.toGarrison', {}, 2);
  }

  // K5: a siege. With enough of our side's troops on this world, gather on the enemy base nearest
  // our army and, once enough stand around it (data: theatre.siegeUnits, siegeRange), wear it down.
  const siege = siegePlan(view, ruleset, memory);
  if (siege) {
    const reach = combatKind(ruleset, unit) === 'ranged' ? rangeOf(ruleset, unit) : 1;
    const d = dist(view.map, unit.tile, siege.tile);
    // Ready: any blow on the base or its ring of defenders, on the siege's terms (theatre.siege).
    if (siege.ready && d <= reach + 1) {
      const blow = bestAttack(world, view, ruleset, unit, memory.path ?? null, memory.stance ?? null, weightsOf(ruleset, 'theatre').siege ?? {});
      if (blow) return { ...blow, reasonKey: 'ai.reason.siegeAttack' };
    }
    const close = siege.ready ? reach : weightsOf(ruleset, 'theatre').siegeRange ?? 2;
    if (d > close) {
      const spot = approach(world, view, ruleset, unit, siege.tile, close) ?? approach(world, view, ruleset, unit, siege.tile, close + 1);
      if (spot !== null && spot !== unit.tile) return move(view, unit, spot, 'ai.reason.siege', {}, 1.5);
    } else if (!siege.ready) return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 1, reasonKey: 'ai.reason.siegeWait', params: {} };
  }

  // K5: a war across worlds is won by holding each world's key sites. Stand on ours; march on
  // the nearest one our side does not hold (within supply, unless already cut off).
  // (Only in a war across several worlds: the one-world Killzone front plays as it always has.)
  if (view.frontline?.sites && view.world) {
    const side = ruleset.factions?.[view.factions.find((f) => f.id === me)?.civ]?.frontSide;
    const objective = ruleset.worlds?.[view.world]?.theatre?.objective;
    const key = Object.values(view.frontline.sites).filter((s) => !objective || s.site === objective);
    if (key.some((s) => s.tile === unit.tile && s.owner === side)) return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 1.5, reasonKey: 'ai.reason.holdSite', params: {} };
    const free = (t) => !view.units.some((u) => u.tile === t && u.id !== unit.id && u.faction === me);
    const want = key.filter((s) => s.owner !== side && free(s.tile)).sort((a, b) => dist(view.map, a.tile, unit.tile) - dist(view.map, b.tile, unit.tile) || a.tile - b.tile)[0];
    if (want && side !== undefined) {
      const spot = want.tile === unit.tile ? null : pathTo(world, view, ruleset, unit, want.tile) ? want.tile : approach(world, view, ruleset, unit, want.tile, 1);
      // Supply limits the march only where the side has bases; on a beachhead the fleet's drops follow the troops.
      const bases = view.cities.some((c) => ruleset.factions?.[view.factions.find((f) => f.id === c.faction)?.civ]?.frontSide === side);
      const supplied = !bases || !view.supply || !view.supply.includes(unit.tile) || (spot !== null && view.supply.includes(spot));
      if (spot !== null && spot !== unit.tile && supplied) return move(view, unit, spot, 'ai.reason.toKeySite', {}, 1.5);
    }
  }

  // K5: cut off on another world, head for the nearest supplied hex (a held key site, a base, a drop).
  if (view.world && view.supply?.length && !view.supply.includes(unit.tile)) {
    const near = view.supply.filter((t) => !view.units.some((u) => u.tile === t && u.id !== unit.id)).sort((a, b) => dist(view.map, a, unit.tile) - dist(view.map, b, unit.tile) || a - b);
    const to = near.find((t) => pathTo(world, view, ruleset, unit, t));
    if (to !== undefined) return move(view, unit, to, 'ai.reason.toSupply', {}, 1.5);
  }

  // Scouts explore.
  if (def.class === 'recon' || ctx.exploring(unit)) {
    const frontier = ctx.frontierFor(unit);
    if (frontier !== null) return move(view, unit, frontier, 'ai.reason.explore', {}, 1);
  }

  // At war: march on the nearest known enemy city.
  if (ctx.warTarget) {
    const reach = combatKind(ruleset, unit) === 'ranged' ? rangeOf(ruleset, unit) : 1;
    // While the army musters, units stop ctx.muster hexes away and wait for the rest.
    const muster = ctx.muster ?? 0;
    if (muster && dist(view.map, unit.tile, ctx.warTarget) <= muster) return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 0.5, reasonKey: 'ai.reason.muster', params: {} };
    if (dist(view.map, unit.tile, ctx.warTarget) > reach) {
      const spot = approach(world, view, ruleset, unit, ctx.warTarget, reach);
      if (spot !== null && muster) {
        // The first hex on the way that is close enough to wait in.
        const wait = pathTo(world, view, ruleset, unit, spot)?.tiles?.find((t) => dist(view.map, t, ctx.warTarget) <= muster);
        if (wait !== undefined && wait !== unit.tile) return move(view, unit, wait, 'ai.reason.muster', {}, 1);
      }
      // K5: never march out of supply (the view lists what we can supply); a unit already cut off
      // marches on, since standing still only ends in surrender.
      if (spot !== null && view.supply && view.supply.includes(unit.tile) && !view.supply.includes(spot)) return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 0.5, reasonKey: 'ai.reason.supplyLine', params: {} };
      if (spot !== null) return move(view, unit, spot, 'ai.reason.march', {}, 1);
    }
  }
  return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 0.5, reasonKey: 'ai.reason.hold', params: {} };
}

/**
 * K5: the base our side besieges on this world this turn ({ tile, city, ready }), or null. Only
 * in a war across worlds (view.world and a front), with theatre.siegeUnits of our own troops here.
 */
function siegePlan(view, ruleset, memory) {
  if (!view.world || !view.frontline) return null;
  const tw = weightsOf(ruleset, 'theatre');
  if (!tw.siegeUnits) return null;
  const key = `${view.world}:${view.turn}`;
  if (memory.siegeKey === key) return memory.siegePlan;
  memory.siegeKey = key;
  memory.siegePlan = null;
  const sideOfF = (fid) => ruleset.factions?.[view.factions.find((f) => f.id === fid)?.civ]?.frontSide;
  const side = sideOfF(view.me);
  const fighter = (u) => (ruleset.units[u.type]?.strength ?? 0) > 0;
  const mine = view.units.filter((u) => u.faction === view.me && fighter(u));
  const ours = view.units.filter((u) => sideOfF(u.faction) === side && fighter(u));
  const bases = view.cities.filter((c) => side !== undefined && sideOfF(c.faction) === 1 - side);
  // Our side's troops here count together (allies land together); we need at least one of our own.
  if (!bases.length || !mine.length || ours.length < tw.siegeUnits) return null;
  const cost = (c) => ours.reduce((n, u) => n + dist(view.map, u.tile, c.tile), 0);
  const target = bases.slice().sort((a, b) => cost(a) - cost(b) || a.tile - b.tile)[0];
  const near = ours.filter((u) => dist(view.map, u.tile, target.tile) <= (tw.siegeRange ?? 2)).length;
  memory.siegePlan = { tile: target.tile, city: target.id, ready: near >= tw.siegeUnits };
  return memory.siegePlan;
}

/**
 * K5: when this unit is outnumbered near the front (enemies within reach outnumber friends by the
 * theatre weights' ratio), the nearest free hex of our own fortifications to fall back to; else null.
 */
function fortifiedRefuge(view, ruleset, unit) {
  const tw = weightsOf(ruleset, 'theatre');
  if (!view.map.works || !tw.outnumbered) return null;
  const near = (u) => dist(view.map, u.tile, unit.tile) <= (tw.lookRange ?? 2);
  const foes = view.units.filter((u) => u.faction !== view.me && near(u) && (ruleset.units[u.type]?.strength ?? 0) > 0).length;
  const friends = view.units.filter((u) => u.faction === view.me && near(u) && (ruleset.units[u.type]?.strength ?? 0) > 0).length;
  if (!foes || foes < friends * tw.outnumbered) return null;
  let best = null;
  for (const [t, w] of Object.entries(view.map.works)) {
    const tile = Number(t);
    const def = ruleset.improvements?.[view.map.improvementIds[view.map.improvement[tile]]];
    if (w.faction !== view.me || !def?.defence) continue;
    if (tile !== unit.tile && view.units.some((u) => u.tile === tile)) continue;
    const d = dist(view.map, tile, unit.tile);
    if (d > (tw.refugeRange ?? 3)) continue;
    if (!best || d < best.d || (d === best.d && tile < best.tile)) best = { tile, d };
  }
  return best?.tile ?? null;
}

/** The best improvement job for a builder: a worked or owned hex where an improvement fits, with the biggest gain. */
export function builderJobs(world, view, ruleset) {
  const jobs = [];
  // K5: on a front, engineers dig in first: works near the front line, by the theatre weights' value.
  const tw = weightsOf(ruleset, 'theatre');
  if (view.frontline && tw.works) {
    const control = view.frontline.control;
    const side = ruleset.factions?.[view.factions.find((f) => f.id === view.me)?.civ]?.frontSide ?? 0;
    const ours = (t) => (side === 0 ? control[t] > 0 : control[t] < 0);
    const nbs = neighbourCache(view.map);
    const nearFront = (t) => { const seen = new Set([t]); let ring = [t]; for (let k = 0; k < (tw.frontBand ?? 2); k += 1) { ring = ring.flatMap((x) => nbs[x]).filter((j) => j >= 0 && !seen.has(j) && seen.add(j)); if (ring.some((j) => control[j] !== 0 && !ours(j))) return true; } return false; };
    // A beachhead: where our troops stand out of supply, a supply work (landing bay, depot) first.
    if (view.supply && tw.beachhead) {
      const cut = new Set(view.units.filter((u) => u.faction === view.me && !view.supply.includes(u.tile)).map((u) => u.tile));
      for (const t of cut) {
        if (view.map.improvement?.[t] >= 0 || view.cities.some((c) => c.tile === t)) continue;
        for (const [id, def] of Object.entries(ruleset.improvements ?? {})) {
          if (!def.war?.supply || improvementProblem(world, ruleset, view.me, id, t)) continue;
          jobs.push({ tile: t, from: t, improvement: id, gain: tw.beachhead * def.war.supply });
        }
      }
    }
    for (let t = 0; t < view.map.terrain.length; t += 1) {
      if (view.map.improvement?.[t] >= 0 || !ours(t) || view.cities.some((c) => c.tile === t) || !nearFront(t)) continue;
      for (const [id, value] of Object.entries(tw.works)) {
        if (!ruleset.improvements?.[id] || improvementProblem(world, ruleset, view.me, id, t)) continue;
        jobs.push({ tile: t, from: t, improvement: id, gain: value });
      }
    }
  }
  const map = view.map;
  const myCities = view.cities.filter((c) => c.faction === view.me);
  const worked = new Set(myCities.flatMap((c) => c.worked));
  for (let t = 0; t < map.terrain.length; t += 1) {
    const owner = map.owner?.[t];
    if (!owner || !myCities.some((c) => c.id === owner) || map.improvement?.[t] >= 0) continue;
    if (myCities.some((c) => c.tile === t)) continue;
    const before = tileYields(world, ruleset, t);
    for (const id of Object.keys(ruleset.improvements ?? {})) {
      if (ruleset.improvements[id].road) continue;
      if (improvementProblem(world, ruleset, view.me, id, t)) continue;
      const trial = { ...world, map: { ...map, improvement: map.improvement.slice() } };
      trial.map.improvement[t] = map.improvementIds.indexOf(id);
      const after = tileYields(trial, ruleset, t);
      const gain = (after.food - before.food) * 1.5 + (after.production - before.production) * 1.3 + (after.gold - before.gold) + (worked.has(t) ? 1 : 0)
        + (map.resource[t] >= 0 ? 1.5 : 0);
      if (gain <= 0) continue;
      // Water improvements are built from a neighbouring land hex.
      const from = ruleset.improvements[id].water ? null : t;
      jobs.push({ tile: t, from, improvement: id, gain });
    }
  }
  return jobs.sort((a, b) => b.gain - a.gain || a.tile - b.tile);
}

export { builderTargets };
