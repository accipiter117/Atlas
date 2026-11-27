// The AI controller (section 9): one AI per computer faction.
//
// next(view) returns the faction's single next command, looking at a fresh
// view each time, so it always acts on what is true after its last move. In
// order: answer a captured city, choose research, consider war, give every
// idle city something to build, take promotions, move every unit, end the
// turn. Every command is checked against the rules (on the AI's own picture
// of the world) before it is sent, and every one is written to the journal
// with its reason and the next two options it weighed.

import { worldFromView, COMMANDS, buyPrice, promotionOptions, amenitiesFor, combatKind, findPath, UNEXPLORED, VISIBLE, neighbourCache } from '../sim/index.js';
import { record } from './recorder.js';
import { updateStrategy } from './strategy.js';
import { rankTechs } from './planners/science.js';
import { rankCivics, considerGovernment, nextPolicy } from './planners/government.js';
import { scanSites } from './planners/expansion.js';
import { rankProduction } from './planners/economy.js';
import { threatMap, considerWar } from './planners/military.js';
import { nextDiplomacy } from './planners/diplomacy.js';
import { nextReligion } from './planners/religion.js';
import { nextEspionage } from './planners/espionage.js';
import { chooseEventChoice } from './planners/events.js';
import { decideUnit, builderJobs } from './tactics.js';
import { nextFleetOrder } from './planners/starmap.js';
import { weightsOf, dist } from './evaluate.js';

export function createAi(ruleset, factionId, memory = {}) {
  memory.journal ??= [];
  const ai = { memory, refusals: [] };

  function valid(world, cmd) {
    const h = COMMANDS[cmd.type];
    return h && h.validate(world, cmd, ruleset) === null;
  }

  function issue(view, _world, choice, alternatives = []) {
    record(memory, view.turn, choice.cmd, choice, alternatives);
    return choice.cmd;
  }

  /** The turn's shared picture, built once per turn and refreshed lightly per call. */
  function context(world, view) {
    const me = view.me;
    const mine = view.units.filter((u) => u.faction === me);
    const myCities = view.cities.filter((c) => c.faction === me);
    const mil = weightsOf(ruleset, 'military');
    const threat = threatMap(world, view, ruleset);
    const sites = scanSites(world, view, ruleset, memory);
    const amen = myCities.length ? amenitiesFor(world, ruleset, me) : {};
    const enemyCities = view.cities.filter((c) => c.faction !== me && (world.wars ?? []).some((w) => w.split('|').includes(c.faction) && w.split('|').includes(me)));
    const capital = myCities.find((c) => c.capital) ?? myCities[0];
    // The nearest enemy city; on the conquest path, original capitals count as this many hexes nearer (data).
    const capPull = memory.path === 'conquest' ? (mil.capitalTargetPull ?? 0) : 0;
    const warDist = (c) => dist(view.map, c.tile, capital.tile) - (c.originalCapital ? capPull : 0);
    const warTarget = enemyCities.length && capital ? enemyCities.slice().sort((a, b) => warDist(a) - warDist(b) || a.tile - b.tile)[0].tile : null;

    // Garrisons: each city keeps its nearest fighting units.
    memory.garrison ??= {};
    const fighters = mine.filter((u) => combatKind(ruleset, u) !== 'none');
    const posted = new Map();
    for (const c of myCities) {
      const want = (mil.defendersPerCity ?? 1) + (threat(c.tile) > 0 ? 1 : 0);
      const near = fighters.filter((u) => !posted.has(u.id)).sort((a, b) => dist(view.map, a.tile, c.tile) - dist(view.map, b.tile, c.tile) || (a.id < b.id ? -1 : 1));
      // One defender stands in the city; extra ones next to it.
      for (const u of near.slice(0, want)) posted.set(u.id, c.tile);
    }

    // Exploration: early on, one fighting unit explores if there is no scout.
    const hasScout = mine.some((u) => ruleset.units[u.type].class === 'recon');
    const explorer = !hasScout && view.turn < 40 ? fighters.filter((u) => !posted.has(u.id)).sort((a, b) => (a.id < b.id ? -1 : 1))[0]?.id : null;

    // Mustering (phase 16): with military.musterUnits set, units bound for the war target
    // gather musterDistance hexes away until that many stand there, then go in together.
    const musterOn = (mil.musterUnits ?? 0) > 0 && (!mil.musterPaths || mil.musterPaths.includes(memory.path));
    const mustered = warTarget !== null && musterOn ? fighters.filter((u) => !posted.has(u.id) && dist(view.map, u.tile, warTarget) <= (mil.musterDistance ?? 3)).length : 0;
    const muster = musterOn && warTarget !== null && mustered < mil.musterUnits ? (mil.musterDistance ?? 3) : 0;

    const claimed = new Set(Object.values(memory.siteOf ?? {}));
    const jobs = builderJobs(world, view, ruleset);
    const takenJobs = new Set();
    return {
      sites,
      atWar: (world.wars ?? []).some((w) => w.split('|').includes(me)) || view.units.some((u) => u.faction === 'raiders' && myCities.some((c) => dist(view.map, c.tile, u.tile) <= (mil.threatRange ?? 4))),
      threatAt: threat,
      warTarget,
      muster,
      unhappy: (c) => (amen[c.id]?.balance ?? 0) < 0,
      siteScoreAt: (t) => sites.find((s) => s.tile === t)?.score ?? null,
      claimSite(unit) {
        memory.siteOf ??= {};
        const current = memory.siteOf[unit.id];
        const stillGood = sites.find((s) => s.tile === current);
        if (stillGood) return stillGood;
        const w = weightsOf(ruleset, 'expansion');
        const pick = sites.filter((s) => !claimed.has(s.tile) && dist(view.map, s.tile, unit.tile) <= (w.maxSettleDistance ?? 12)
          && (s.tile === unit.tile || findPath(world, ruleset, unit, s.tile, { known: (t) => view.fog[t] !== UNEXPLORED, seen: (t) => view.fog[t] === VISIBLE })))
          .sort((a, b) => (b.score - dist(view.map, b.tile, unit.tile)) - (a.score - dist(view.map, a.tile, unit.tile)) || a.tile - b.tile)[0];
        if (pick) { memory.siteOf[unit.id] = pick.tile; claimed.add(pick.tile); }
        return pick ?? null;
      },
      builderJob(unit) {
        for (const job of jobs) {
          if (takenJobs.has(job.tile)) continue;
          let from = job.from;
          if (from === null) {
            from = neighbourCache(view.map)[job.tile].find((j) => j >= 0 && view.map.terrain[j] >= 0 && !ruleset.terrain[view.map.terrainIds[view.map.terrain[j]]]?.water
              && (j === unit.tile || findPath(world, ruleset, unit, j, { known: (t) => view.fog[t] !== UNEXPLORED, seen: (t) => view.fog[t] === VISIBLE }))) ?? null;
            if (from === null) continue;
          } else if (from !== unit.tile && !findPath(world, ruleset, unit, from, { known: (t) => view.fog[t] !== UNEXPLORED, seen: (t) => view.fog[t] === VISIBLE })) {
            continue;
          }
          if (dist(view.map, from, unit.tile) > 10) continue;
          takenJobs.add(job.tile);
          return { ...job, from };
        }
        return null;
      },
      garrisonFor: (unit) => (posted.has(unit.id) ? posted.get(unit.id) : null),
      exploring: (unit) => unit.id === explorer,
      frontierFor(unit) {
        const fog = view.fog;
        let best = null;
        for (let t = 0; t < fog.length; t += 1) {
          if (fog[t] === UNEXPLORED || t === unit.tile) continue;
          if (!neighbourCache(view.map)[t].some((j) => j >= 0 && fog[j] === UNEXPLORED)) continue;
          const d = dist(view.map, unit.tile, t);
          if (best && d >= best.d) continue;
          if (!findPath(world, ruleset, unit, t, { known: (i) => fog[i] !== UNEXPLORED, seen: (i) => fog[i] === VISIBLE })) continue;
          best = { t, d };
        }
        return best?.t ?? null;
      },
    };
  }

  ai.next = function next(view) {
    const world = worldFromView(view);
    const me = view.me;
    if (memory.turn !== view.turn) {
      memory.turn = view.turn;
      memory.handled = {};
      memory.done = {};
      const changed = updateStrategy(view, ruleset, memory);
      if (changed) record(memory, view.turn, { type: 'strategy' }, { reasonKey: 'ai.reason.path', params: { path: changed.path }, score: changed.scores[changed.path] },
        Object.entries(changed.scores).filter(([p]) => p !== changed.path).sort((a, b) => b[1] - a[1]).map(([p, s]) => ({ reasonKey: 'ai.reason.path', params: { path: p }, score: s })));
      memory.ctx = null;
    }
    // Several worlds (K1b): the AI plays each world in turn; its picture of the map is per world.
    if ((view.world ?? null) !== (memory.world ?? null)) {
      memory.world = view.world ?? null;
      memory.handled = {};
      memory.ctx = null;
    }

    // 1. A captured city waits for an answer: keep it.
    if (view.pendingCapture) {
      const cmd = { type: 'captureChoice', faction: me, city: view.pendingCapture.city, choice: 'keep' };
      if (valid(world, cmd)) return issue(view, world, { cmd, reasonKey: 'ai.reason.keep', params: {} });
    }

    // K5: a theatre commander (a delegated world) only moves units: no research, cities, diplomacy or fleets.
    const full = !memory.theatreOnly;

    // 1b. An event waits for a choice (phase 16): take the one worth most.
    if (full && view.pendingEvent) {
      const ranked = (chooseEventChoice(view, ruleset, memory) ?? []).filter((c) => valid(world, c.cmd));
      if (ranked.length) return issue(view, world, ranked[0], ranked.slice(1));
    }

    // 2. Research.
    if (full && !memory.done.research && !view.research?.current && !(view.research?.queue ?? []).length) {
      memory.done.research = true;
      const ranked = rankTechs(world, view, ruleset, memory).filter((c) => valid(world, c.cmd));
      if (ranked.length) return issue(view, world, ranked[0], ranked.slice(1));
    }

    // 2b. Civics, government and policy cards (phase 11).
    if (full && ruleset.civics && !memory.done.civic && !view.civicResearch?.current && !(view.civicResearch?.queue ?? []).length) {
      memory.done.civic = true;
      const ranked = rankCivics(world, view, ruleset, memory).filter((c) => valid(world, c.cmd));
      if (ranked.length) return issue(view, world, ranked[0], ranked.slice(1));
    }
    if (full && ruleset.governments && !memory.done.government) {
      memory.done.government = true;
      const g = considerGovernment(world, view, ruleset, memory);
      if (g && valid(world, g.cmd)) return issue(view, world, g, g.alternatives);
    }
    if (full && ruleset.policies && (memory.done.policies ?? 0) < 12) {
      memory.done.policies = (memory.done.policies ?? 0) + 1;
      const p = nextPolicy(world, view, ruleset, memory);
      if (p && valid(world, p.cmd)) return issue(view, world, p);
      memory.done.policies = 99;
    }

    // 2c. Diplomacy: answer offers, seek peace when losing, make friends, denounce (phase 12).
    if (full && ruleset.diplomacy && (memory.done.diplomacy ?? 0) < 6) {
      memory.done.diplomacy = (memory.done.diplomacy ?? 0) + 1;
      const d = nextDiplomacy(world, view, ruleset, memory);
      if (d && valid(world, d.cmd)) return issue(view, world, d);
      memory.done.diplomacy = 99;
    }

    // 2d. Religion: pantheon, founding, missionaries (phase 13).
    if (full && ruleset.beliefs && (memory.done.religion ?? 0) < 4) {
      memory.done.religion = (memory.done.religion ?? 0) + 1;
      const r = nextReligion(world, view, ruleset, memory);
      if (r && valid(world, r.cmd)) return issue(view, world, r);
      memory.done.religion = 99;
    }

    // 2e. Espionage: post spies, start missions (phase 15).
    if (full && ruleset.espionage && (memory.done.espionage ?? 0) < 6) {
      memory.done.espionage = (memory.done.espionage ?? 0) + 1;
      const e = nextEspionage(world, view, ruleset, memory);
      if (e && valid(world, e.cmd)) return issue(view, world, e);
      memory.done.espionage = 99;
    }

    // 3. War.
    if (full && !memory.done.war) {
      memory.done.war = true;
      const war = considerWar(world, view, ruleset, memory);
      if (war && valid(world, war.cmd)) return issue(view, world, war);
    }

    memory.ctx ??= context(world, view);
    const ctx = { ...memory.ctx, threatAt: threatMap(world, view, ruleset) };

    // 4. Cities with nothing to build.
    for (const c of view.cities.filter((x) => full && x.faction === me && !x.queue.length)) {
      if (memory.done[`city:${c.id}`]) continue;
      memory.done[`city:${c.id}`] = true;
      const ranked = rankProduction(world, view, ruleset, memory, c, ctx).filter((r) => valid(world, r.cmd));
      if (ranked.length) return issue(view, world, ranked[0], ranked.slice(1));
    }

    // 4b. Every few turns, a city switches to something clearly better (progress carries over).
    const reconsider = weightsOf(ruleset, 'economy').reconsiderEvery ?? 5;
    if (full && view.turn % reconsider === 0) {
      for (const c of view.cities.filter((x) => x.faction === me && x.queue.length)) {
        if (memory.done[`re:${c.id}`]) continue;
        memory.done[`re:${c.id}`] = true;
        const ranked = rankProduction(world, view, ruleset, memory, c, ctx).filter((r) => valid(world, r.cmd));
        const head = c.queue[0];
        const current = ranked.find((r) => r.cmd.item.id === head.id && r.cmd.item.kind === head.kind);
        const best = ranked[0];
        if (best && (best.cmd.item.id !== head.id) && best.score > (current?.score ?? 0) * 1.5) {
          return issue(view, world, { ...best, reasonKey: 'ai.reason.switch', params: { ...best.params, from: head.id } }, ranked.slice(1));
        }
      }
    }

    // 5. Spare gold buys settlers, builders and defenders (keeping a reserve).
    const reserve = weightsOf(ruleset, 'economy').goldReserve ?? 60;
    for (const c of view.cities.filter((x) => full && x.faction === me && x.queue.length)) {
      if (memory.done[`buy:${c.id}`]) continue;
      memory.done[`buy:${c.id}`] = true;
      const head = c.queue[0];
      if (head.kind !== 'unit') continue;
      const tags = ruleset.units[head.id].tags ?? [];
      const urgent = tags.includes('founder') || tags.includes('worker') || ctx.threatAt(c.tile) > 0;
      if (!urgent) continue;
      const price = buyPrice(ruleset, c, world);
      if (price === null || (view.stocks?.gold ?? 0) - price < reserve) continue;
      const cmd = { type: 'buyItem', faction: me, city: c.id };
      if (valid(world, cmd)) return issue(view, world, { cmd, reasonKey: 'ai.reason.buy', params: { item: head.id, city: c.name, price } });
    }

    // 6. Promotions.
    for (const u of view.units.filter((x) => x.faction === me)) {
      const options = promotionOptions(ruleset, u);
      if (!options.length) continue;
      const pick = options.slice().sort()[0];
      const cmd = { type: 'promote', faction: me, unit: u.id, promotion: pick };
      if (valid(world, cmd)) return issue(view, world, { cmd, reasonKey: 'ai.reason.promote', params: { promotion: pick } });
    }

    // 6b. Fleets (K5): orders for this faction's fleets in orbit of the world on screen.
    if (full && view.space) {
      const order = nextFleetOrder(view, ruleset, memory, (a, b) => dist(view.map, a, b));
      if (order) return issue(view, world, order);
    }

    // 7. Units.
    const units = view.units.filter((u) => u.faction === me).sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const u of units) {
      if (memory.handled[u.id] || u.moves <= 0) continue;
      const busy = u.goto !== null || u.activity === 'sleep' || u.activity === 'fortify' || u.activity === 'skip';
      memory.handled[u.id] = true;
      if (busy) {
        // A fortified or travelling unit only acts if it can hit something worthwhile.
        const choice = combatKind(ruleset, u) !== 'none' ? decideUnit(world, view, ruleset, memory, u, ctx) : null;
        if (choice && choice.cmd.type === 'attack' && valid(world, choice.cmd)) return issue(view, world, choice);
        if (u.activity === 'fortify' || u.activity === 'sleep' || u.goto !== null) continue;
      }
      const choice = decideUnit(world, view, ruleset, memory, u, ctx);
      if (choice && valid(world, choice.cmd)) return issue(view, world, choice);
      const fallback = { type: combatKind(ruleset, u) === 'none' ? 'sleep' : 'fortify', faction: me, unit: u.id };
      if (u.activity === 'none' && valid(world, fallback)) return issue(view, world, { cmd: fallback, reasonKey: 'ai.reason.hold', params: {} });
    }

    // 8. Done.
    return issue(view, world, { cmd: { type: 'endTurn', faction: me }, reasonKey: 'ai.reason.endTurn', params: {} });
  };

  ai.refused = (cmd, error) => { ai.refusals.push({ turn: memory.turn, cmd, error }); };
  return ai;
}
