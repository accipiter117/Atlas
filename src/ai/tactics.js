// Tactics (section 9.4): what each unit does this turn.
//
// - Attacks only at good odds: a likely kill (attackMinWinChance, higher
//   against cities), or a clearly favourable exchange (attackMinDamageRatio,
//   keeping attackMinHpAfter), or any ranged shot that does real damage.
//   Melee units walk into a city whose defences are at 0.
// - Garrisons: each city keeps defendersPerCity units fortified inside.
// - At war: everyone else marches on the nearest known enemy city.
// - Badly hurt units go home to heal.
// - Settlers go to the best site and found; builders improve worked land;
//   scouts explore the nearest edge of the unknown.

import { missionaryMove } from './planners/religion.js';
import { attackProblem, combatKind, rangeOf, improvementProblem, builderTargets, foundingProblem, findPath, atWar, tileYields, UNEXPLORED, VISIBLE } from '../sim/index.js';
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
export function bestAttack(world, view, ruleset, unit, path = null) {
  const th = weightsOf(ruleset, 'thresholds');
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
      if (!ok && !o.ranged && th.cityMeleeMinDealt && (!wearPaths || wearPaths.includes(path))) ok = o.dealt >= th.cityMeleeMinDealt && o.attackerHp - o.taken >= (th.attackMinHpAfter ?? 35);
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
  const attack = bestAttack(world, view, ruleset, unit, memory.path ?? null);
  if (attack) return attack;

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

  // Scouts explore.
  if (def.class === 'recon' || ctx.exploring(unit)) {
    const frontier = ctx.frontierFor(unit);
    if (frontier !== null) return move(view, unit, frontier, 'ai.reason.explore', {}, 1);
  }

  // At war: march on the nearest known enemy city.
  if (ctx.warTarget) {
    const reach = combatKind(ruleset, unit) === 'ranged' ? rangeOf(ruleset, unit) : 1;
    if (dist(view.map, unit.tile, ctx.warTarget) > reach) {
      const spot = approach(world, view, ruleset, unit, ctx.warTarget, reach);
      if (spot !== null) return move(view, unit, spot, 'ai.reason.march', {}, 1);
    }
  }
  return { cmd: { type: 'fortify', faction: me, unit: unit.id }, score: 0.5, reasonKey: 'ai.reason.hold', params: {} };
}

/** The best improvement job for a builder: a worked or owned hex where an improvement fits, with the biggest gain. */
export function builderJobs(world, view, ruleset) {
  const jobs = [];
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
