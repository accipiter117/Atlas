// The star map AI (Killzone Extrasolar War K5; docs/KILLZONE.md 7.1). It reads only the view
// (view.space, the world on screen, the war council) and answers with the same star map orders a
// player gives. Every number is in the ruleset's aiWeights entry "starmap".
//
// Each turn the faction picks one world to make war on: enemy and contested worlds score most,
// then neutral ones; its ambition's worlds and its side's council objective add to the score;
// distance and enemy warships seen there take away; a threat to its home world (enemy fleets at
// it, beside it or on their way) brings the warships home. Then, on whichever world it is playing,
// each of its fleets there: drops supplies on cut-off troops or strikes the enemy from orbit,
// lands an army group on the target, embarks troops from its bases for the target, sails a lane
// nearer, or blockades an enemy world it holds the orbit of.

import { weightsOf } from '../evaluate.js';

const sideOfView = (view, ruleset) => {
  const me = view.factions.find((f) => f.id === view.me);
  return view.war?.side ?? ruleset.factions?.[me?.civ]?.frontSide ?? 0;
};

/** Lane hops from one world to every other (heavy-only lanes only for all-heavy fleets). */
function hops(view, from, heavy) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    for (const l of view.space.lanes) {
      if (l.heavyOnly && !heavy) continue;
      const to = l.from === at ? l.to : l.to === at ? l.from : null;
      if (!to || dist.has(to)) continue;
      dist.set(to, dist.get(at) + l.turns);
      prev.set(to, at);
      queue.push(to);
    }
  }
  return { dist, prev };
}

function nextHop(prev, from, to) {
  let at = to;
  while (prev.get(at) && prev.get(at) !== from) at = prev.get(at);
  return prev.get(at) === from ? at : null;
}

const power = (ruleset, ships) => ships.reduce((n, s) => n + ((ruleset.units[s.type]?.strength ?? 0) * s.hp) / 100, 0);

/** The world this faction makes war on this turn (memory.fleetTarget), or null. */
function chooseTarget(view, ruleset, memory, fleets) {
  if (memory.fleetTargetTurn === view.turn) return memory.fleetTarget;
  const w = weightsOf(ruleset, 'starmap');
  const side = sideOfView(view, ruleset);
  const me = view.factions.find((f) => f.id === view.me);
  const ambition = new Set((ruleset.factions?.[me?.civ]?.ambition ?? []).map((a) => a.world).filter(Boolean));
  const objective = view.war?.council?.world ?? null;
  const main = fleets.slice().sort((a, b) => power(ruleset, b.ships) - power(ruleset, a.ships))[0];
  const heavy = main.ships.every((s) => ruleset.units[s.type]?.space?.heavy);
  const { dist } = hops(view, main.at, heavy);
  const mine = Math.max(1, power(ruleset, main.ships));
  const home = view.space.worlds.find((x) => ruleset.worlds?.[x.id]?.homeOf === side)?.id ?? null;
  const enemyAt = (id) => view.space.fleets.filter((f) => f.faction !== view.me && !f.transit && f.at === id && !(f.faction in (view.war?.glory ?? {})));
  let best = null;
  for (const x of view.space.worlds) {
    if (!dist.has(x.id)) continue;
    let score = x.holder === 1 - side ? w.enemy ?? 3 : x.holder === 'contested' ? w.contested ?? 4 : x.holder === null ? w.neutral ?? 2.5 : w.own ?? 0;
    if (ambition.has(x.id)) score += w.ambition ?? 3;
    if (objective === x.id) score += w.council ?? 4;
    score -= (w.distance ?? 1.2) * dist.get(x.id);
    score -= (w.enemyFleet ?? 2) * (power(ruleset, enemyAt(x.id).flatMap((f) => f.ships)) / mine);
    if (x.id === home) {
      const threat = view.space.fleets.some((f) => f.faction !== view.me && !(f.faction in (view.war?.glory ?? {})) && (f.at === home || f.transit?.to === home));
      if (threat) score += w.homeThreat ?? 8;
    }
    if (!best || score > best.score || (score === best.score && x.id < best.id)) best = { id: x.id, score };
  }
  memory.fleetTarget = best && best.score > (w.minScore ?? 0) ? best.id : null;
  memory.fleetTargetTurn = view.turn;
  return memory.fleetTarget;
}

const enemiesHere = (view, side, ruleset) => view.units.filter((u) => u.faction !== view.me && u.faction !== 'raiders'
  && (ruleset.factions?.[view.factions.find((f) => f.id === u.faction)?.civ]?.frontSide ?? -1) === 1 - side);

/** Is a hex covered by enemy anti-air we can see (works or units)? */
function covered(view, ruleset, side, tile, dist) {
  for (const [t, wk] of Object.entries(view.map.works ?? {})) {
    const def = ruleset.improvements?.[view.map.improvementIds[view.map.improvement[t]]];
    const civ = view.factions.find((f) => f.id === wk.faction)?.civ;
    if (def?.war?.antiAir && ruleset.factions?.[civ]?.frontSide === 1 - side && dist(Number(t), tile) <= def.war.antiAir) return true;
  }
  return false;
}

/**
 * The next star map order for one of this faction's fleets in orbit of the world on screen,
 * or null. done(key) remembers what was tried this turn, so nothing is sent twice.
 */
export function nextFleetOrder(view, ruleset, memory, dist) {
  if (!view.space || !view.world) return null;
  const mine = view.space.fleets.filter((f) => f.faction === view.me);
  if (!mine.length) {
    // No fleet of our own: still want warships and guns when the enemy holds our home's orbit.
    const s = sideOfView(view, ruleset);
    const homeW = view.space.worlds.find((x) => ruleset.worlds?.[x.id]?.homeOf === s);
    memory.shipsWanted = Boolean(homeW?.orbit && !homeW.orbit.mine && homeW.orbit.factions.length) || homeW?.blockaded === true
      // A fleet faction that has lost its fleet builds a new one: warships and transports.
      || Boolean(memory.hadFleet);
    memory.carriersWanted = Boolean(memory.hadFleet);
    return null;
  }
  memory.hadFleet = true;
  const w = weightsOf(ruleset, 'starmap');
  const t = ruleset.tuning?.space ?? {};
  const side = sideOfView(view, ruleset);
  const target = chooseTarget(view, ruleset, memory, mine);
  // Warships and orbital guns are wanted while the enemy holds or contests our home's orbit (the economy planner reads it).
  const homeW = view.space.worlds.find((x) => ruleset.worlds?.[x.id]?.homeOf === side);
  memory.shipsWanted = Boolean(homeW?.orbit && !homeW.orbit.mine && homeW.orbit.factions.length) || homeW?.blockaded === true
    // or while one of our fleets has been held back by a stronger one for a while.
    || mine.some((f) => (memory.fleetBlocked?.[f.id] ?? 0) >= (w.waitTurns ?? 6));
  // And carriers (transports, dropships) when we have a target to invade but no room for an army.
  const room = mine.reduce((n, f) => n + f.ships.reduce((m, s) => m + (ruleset.units[s.type]?.space?.capacity ?? 0), 0), 0);
  memory.carriersWanted = Boolean(target) && room === 0;
  const here = view.space.worlds.find((x) => x.id === view.world);
  const tried = (key) => { if (memory.done[key]) return true; memory.done[key] = true; return false; };
  // A landing that did not happen (a hidden enemy on the hex): that hex is not tried again.
  memory.badLanding ??= {};
  const last = memory.lastLanding;
  if (last && last.turn !== view.turn && last.world === view.world) {
    const f0 = mine.find((x) => x.id === last.fleet);
    if (f0 && (f0.cargo?.length ?? 0) >= last.groups) memory.badLanding[`${last.world}:${last.tile}`] = true;
    memory.lastLanding = null;
  }
  const badHex = (tile) => memory.badLanding[`${view.world}:${tile}`] === true;
  const land = (id) => !ruleset.terrain[view.map.terrainIds[view.map.terrain[id]]]?.water && !ruleset.terrain[view.map.terrainIds[view.map.terrain[id]]]?.impassable && view.map.terrain[id] >= 0;
  const occupied = (id) => view.units.some((u) => u.tile === id) || view.cities.some((c) => c.tile === id);
  // A beachhead: our troops on this world with no base or supply work of the side's here to feed
  // them. Until the engineers' landing bay or depot stands, a cruiser in orbit keeps them supplied.
  const friendSide = (fid) => fid === view.me || (fid in (view.war?.glory ?? {}));
  const groundSupply = view.cities.some((c) => friendSide(c.faction)) || Object.entries(view.map?.works ?? {}).some(([tile, wk]) => {
    const def = ruleset.improvements?.[view.map.improvementIds[view.map.improvement[Number(tile)]]];
    return def?.war?.supply && friendSide(wk.faction);
  });
  const beachhead = !groundSupply && here?.holder !== side && view.units.some((u) => u.faction === view.me && (ruleset.units[u.type]?.strength ?? 0) > 0);
  for (const f of mine.filter((x) => !x.transit && x.at === view.world)) {
    const bombard = f.ships.some((s) => ruleset.units[s.type]?.space?.bombard && !(f.struck ?? []).includes(s.id));
    const orbit = here?.orbit?.mine;
    // Supplies for our own cut-off troops first, then a strike on the enemy beside our troops.
    if (bombard && orbit && !here.storm) {
      // Our troops here out of supply (or already cut off), not only those already suffering.
      const cut = view.units.find((u) => u.faction === view.me && (u.cut || beachhead || (view.supply && !view.supply.includes(u.tile))));
      if (cut && !covered(view, ruleset, side, cut.tile, dist) && !tried(`fl:${f.id}:drop`)) {
        return { cmd: { type: 'supplyDrop', faction: view.me, fleet: f.id, tile: cut.tile }, score: 3, reasonKey: 'ai.reason.supplyDrop', params: {} };
      }
      const foes = enemiesHere(view, side, ruleset).filter((u) => !covered(view, ruleset, side, u.tile, dist));
      const ours = view.units.filter((u) => u.faction === view.me);
      foes.sort((a, b) => Math.min(...ours.map((o) => dist(o.tile, a.tile)), 99) - Math.min(...ours.map((o) => dist(o.tile, b.tile)), 99) || b.hp - a.hp || (a.id < b.id ? -1 : 1));
      // An enemy base our side's troops are closing on comes first, when strikes can hit bases.
      const sideUnits = view.units.filter((u) => u.faction === view.me || (u.faction in (view.war?.glory ?? {})));
      const besieged = t.strikeCity ? view.cities.filter((c) => ruleset.factions?.[view.factions.find((x) => x.id === c.faction)?.civ]?.frontSide === 1 - side
        && sideUnits.some((u) => dist(u.tile, c.tile) <= (w.strikeBaseRange ?? 3)) && !covered(view, ruleset, side, c.tile, dist)).sort((a, b) => a.tile - b.tile)[0] : null;
      // Clear the ring of defenders round it first: a strike on them is worth more than on the walls.
      const ring = besieged ? foes.filter((u) => u.tile !== besieged.tile && dist(u.tile, besieged.tile) <= 1) : [];
      if (ring.length && !tried(`fl:${f.id}:strike`)) return { cmd: { type: 'orbitalStrike', faction: view.me, fleet: f.id, tile: ring.sort((a, b) => a.hp - b.hp || a.tile - b.tile)[0].tile }, score: 3, reasonKey: 'ai.reason.strike', params: {} };
      if (besieged && !tried(`fl:${f.id}:strike`)) return { cmd: { type: 'orbitalStrike', faction: view.me, fleet: f.id, tile: besieged.tile }, score: 3, reasonKey: 'ai.reason.strikeBase', params: {} };
      if (foes[0] && !tried(`fl:${f.id}:strike`)) return { cmd: { type: 'orbitalStrike', faction: view.me, fleet: f.id, tile: foes[0].tile }, score: 3, reasonKey: 'ai.reason.strike', params: {} };
    }
    // Land on the target, or on any world on the way that our side does not hold (a neutral
    // relay, a contested or enemy world): troops aboard are worth more on the ground.
    // (On a world our side already holds, only when enemy troops are there to fight.)
    const landHere = here && (here.holder !== side ? (view.world === target || w.landOnTheWay !== false) : view.world === target && enemiesHere(view, side, ruleset).length > 0);
    // A group whose lead can stand here (no vehicles on a station: the world's theatre rules).
    const th = ruleset.worlds?.[view.world]?.theatre;
    const allowed = (g) => !th?.noVehicles || !(ruleset.units[g[0]?.type]?.tags ?? []).includes(th.vehicleTag ?? 'vehicle');
    const groupIdx = (f.cargo ?? []).findIndex(allowed);
    if (groupIdx >= 0 && orbit && landHere && !tried(`fl:${f.id}:land`)) {
      const friendly = view.cities.filter((c) => c.faction === view.me || (ruleset.factions?.[view.factions.find((x) => x.id === c.faction)?.civ]?.frontSide === side));
      const enemyBases = view.cities.filter((c) => !friendly.includes(c));
      const foes = enemiesHere(view, side, ruleset);
      // A friendly base with no one else standing in it (raiders or an enemy may have walked in).
      const stranger = (tile) => view.units.some((u) => u.tile === tile && u.faction !== view.me && !(u.faction in (view.war?.glory ?? {})));
      let spot = friendly.find((c) => !stranger(c.tile) && !badHex(c.tile))?.tile ?? null;
      // Away from a friendly base, land only troops we can keep supplied: an engineer aboard to
      // build the landing bay, or a ship that can drop supplies until it is built.
      const engineer = (f.cargo[groupIdx] ?? []).some((u) => (ruleset.units[u.type]?.tags ?? []).includes('worker'));
      const sustain = engineer || f.ships.some((s) => ruleset.units[s.type]?.space?.bombard);
      if (spot === null && sustain && f.ships.some((s) => ruleset.units[s.type]?.space?.lands) && !here.storm) {
        let bestT = null;
        for (let id = 0; id < view.map.terrain.length; id += 1) {
          if (!land(id) || occupied(id) || badHex(id) || covered(view, ruleset, side, id, dist)) continue;
          const nearFoe = Math.min(...foes.map((u) => dist(u.tile, id)), ...enemyBases.map((c) => dist(c.tile, id)), 99);
          if (nearFoe < (w.landMinDistance ?? 3)) continue;
          const score = -Math.abs(nearFoe - (w.landDistance ?? 4));
          if (!bestT || score > bestT.score || (score === bestT.score && id < bestT.id)) bestT = { id, score };
        }
        spot = bestT?.id ?? null;
      }
      if (spot !== null) {
        memory.lastLanding = { fleet: f.id, tile: spot, world: view.world, turn: view.turn, groups: f.cargo.length };
        return { cmd: { type: 'landArmy', faction: view.me, fleet: f.id, group: groupIdx, tile: spot }, score: 4, reasonKey: 'ai.reason.land', params: {} };
      }
    }
    // Embark troops for the target from our bases here.
    let nobody = false;
    const room = f.ships.reduce((n, s) => n + (ruleset.units[s.type]?.space?.capacity ?? 0), 0) - (f.cargo?.length ?? 0);
    if (room > 0 && orbit && target && target !== view.world && !f.moved && !tried(`fl:${f.id}:embark`)) {
      // Our own troops and our allies' (a side shares its transport), standing at or beside the side's bases, not in them.
      const ally = (fid) => fid === view.me || (fid in (view.war?.glory ?? {}));
      const bases = view.cities.filter((c) => ally(c.faction));
      const units = view.units.filter((u) => ally(u.faction) && (ruleset.units[u.type]?.strength ?? 0) > 0 && !bases.some((c) => c.tile === u.tile) && !u.cut
        && bases.some((c) => dist(c.tile, u.tile) <= (t.loadRange ?? 1)))
        // Our own first (engineers stay home to fortify the front: a held key site supplies a beachhead).
        .sort((a, b) => (a.faction === view.me ? 0 : 1) - (b.faction === view.me ? 0 : 1) || (a.id < b.id ? -1 : 1));
      const keep = w.keepHome ?? 1;
      const pick = units.slice(0, Math.max(0, Math.min(t.groupSize ?? 4, units.length - keep)));
      // Not enough yet: ask our bases for troops (the economy planner reads memory.troopsWanted).
      // After waiting its turns, a fleet takes whatever troops it has.
      nobody = pick.length === 0;
      // Topping up a group already aboard takes even one more; a first group waits for minGroup.
      const minGroup = (f.cargo?.length || (memory.fleetWait?.[f.id] ?? 0) >= (w.waitTurns ?? 6)) ? 1 : w.minGroup ?? 2;
      memory.troopsWanted = pick.length >= minGroup ? 0 : (t.groupSize ?? 4);
      // An empty transport fleet at one of the side's bases waits a few turns for its troops (data: waitTurns).
      memory.fleetWait ??= {};
      // (With no one here at all there is nothing to wait for: it fetches troops instead, below.)
      if (pick.length < minGroup && !nobody && bases.length && !(f.cargo?.length)) {
        const waited = memory.fleetWait[f.id] ?? 0;
        if (waited < (w.waitTurns ?? 6)) {
          if (memory.fleetWaitTurn?.[f.id] !== view.turn) { memory.fleetWait[f.id] = waited + 1; memory.fleetWaitTurn = { ...(memory.fleetWaitTurn ?? {}), [f.id]: view.turn }; }
          memory.done[`fl:${f.id}:move`] = true;
        }
      } else if (pick.length >= minGroup) memory.fleetWait[f.id] = 0;
      if (pick.length >= minGroup) return { cmd: { type: 'loadArmy', faction: view.me, fleet: f.id, units: pick.map((u) => u.id) }, score: 2, reasonKey: 'ai.reason.embark', params: {} };
    }
    // Sail a lane nearer the target (not into a stronger enemy fleet). An empty transport away
    // from the side's bases goes back for more troops first: to the nearest world the side holds
    // with bases and armies on it.
    const heavy = f.ships.every((s) => ruleset.units[s.type]?.space?.heavy);
    let dest = target;
    let why = 'ai.reason.sail';
    // A fleet that can drop supplies stays while our troops here are out of supply.
    // (A cruiser that already dropped or struck this turn still counts: it can drop again next turn.)
    const cruiser = f.ships.some((s) => ruleset.units[s.type]?.space?.bombard);
    // It guards a beachhead for a while (data: holdTurns), then fetches reinforcements.
    memory.fleetHeld ??= {};
    let holding = cruiser && orbit && here?.holder !== side && (beachhead || (view.supply && view.units.some((u) => u.faction === view.me && !view.supply.includes(u.tile))));
    if (holding && memory.fleetHeldTurn?.[f.id] !== view.turn) {
      memory.fleetHeld[f.id] = (memory.fleetHeld[f.id] ?? 0) + 1;
      memory.fleetHeldTurn = { ...(memory.fleetHeldTurn ?? {}), [f.id]: view.turn };
    }
    if (!holding) memory.fleetHeld[f.id] = 0;
    if (holding && memory.fleetHeld[f.id] > (w.holdTurns ?? 6)) holding = false;
    if (holding) dest = null;
    if (dest && !(f.cargo?.length) && room > 0 && !(here?.holder === side && here.bases > 0)) {
      const { dist: d } = hops(view, view.world, heavy);
      const depot = view.space.worlds.filter((x) => x.holder === side && x.bases > 0 && x.armies > 0 && d.has(x.id) && x.id !== view.world)
        .sort((a, b) => d.get(a.id) - d.get(b.id) || (a.id < b.id ? -1 : 1))[0];
      if (depot) { dest = depot.id; why = 'ai.reason.ferry'; }
    }
    // No one at all to embark at this base: go where the side's armies are.
    const aboardNow = (f.cargo ?? []).reduce((n, g) => n + g.length, 0);
    if (dest && aboardNow < (w.minAssault ?? 3) && room > 0 && here?.holder === side && here.bases > 0 && nobody) {
      const { dist: d } = hops(view, view.world, heavy);
      const depot = view.space.worlds.filter((x) => x.holder === side && x.bases > 0 && x.armies > here.armies && d.has(x.id) && x.id !== view.world)
        .sort((a, b) => b.armies - a.armies || d.get(a.id) - d.get(b.id) || (a.id < b.id ? -1 : 1))[0];
      if (depot) { dest = depot.id; why = 'ai.reason.ferry'; memory.fleetWait[f.id] = 0; }
    }
    // A transport makes for an enemy or contested world only with an assault group aboard (data:
    // minAssault); with fewer it waits at the side's base for more troops, rather than sailing
    // empty or throwing a lone squad at a defended world. Defending home is the exception.
    const aboard = (f.cargo ?? []).reduce((n, g) => n + g.length, 0);
    const targetW = view.space.worlds.find((x) => x.id === target);
    const homeId = view.space.worlds.find((x) => ruleset.worlds?.[x.id]?.homeOf === side)?.id;
    const defended = targetW && (targetW.holder === 1 - side || targetW.holder === 'contested');
    if (dest === target && why !== 'ai.reason.ferry' && room > 0 && target !== homeId && aboard < (w.minAssault ?? 3) && (defended || aboard === 0)
      && here?.holder === side && here.bases > 0) dest = null;
    if (dest && dest !== view.world && !f.moved && !tried(`fl:${f.id}:move`)) {
      const { prev } = hops(view, view.world, heavy);
      const to = nextHop(prev, view.world, dest);
      // Coming home to defend, a fleet takes a fairer fight.
      const dare = target === view.space.worlds.find((x) => ruleset.worlds?.[x.id]?.homeOf === side)?.id ? w.homeDare ?? 1.5 : w.dareRatio ?? 0.9;
      // A stand-off does not last for ever: each turn a fleet is held back, it dares a little more (data: dareGrowth, dareMax).
      memory.fleetBlocked ??= {};
      const held = memory.fleetBlocked[f.id] ?? 0;
      const bold = Math.max(dare, Math.min(w.dareMax ?? 1.6, dare + held * (w.dareGrowth ?? 0.1)));
      const theirs = power(ruleset, view.space.fleets.filter((x) => x.faction !== view.me && !x.transit && x.at === to && !(x.faction in (view.war?.glory ?? {}))).flatMap((x) => x.ships));
      if (to && theirs <= power(ruleset, f.ships) * bold) {
        memory.fleetBlocked[f.id] = 0;
        return { cmd: { type: 'moveFleet', faction: view.me, fleet: f.id, to }, score: 2, reasonKey: why, params: { world: to } };
      }
      if (to && memory.fleetBlockedTurn?.[f.id] !== view.turn) {
        memory.fleetBlocked[f.id] = held + 1;
        memory.fleetBlockedTurn = { ...(memory.fleetBlockedTurn ?? {}), [f.id]: view.turn };
      }
    }
    // Blockade an enemy world whose orbit we hold.
    if (orbit && here.holder === 1 - side && !f.blockade && f.ships.some((s) => (ruleset.units[s.type]?.strength ?? 0) > 0) && !tried(`fl:${f.id}:blockade`)) {
      return { cmd: { type: 'setBlockade', faction: view.me, fleet: f.id, on: true }, score: 1, reasonKey: 'ai.reason.blockade', params: {} };
    }
  }
  return null;
}
