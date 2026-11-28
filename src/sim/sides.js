// War support, glory, the war council and arms deals (Killzone Extrasolar War K4b;
// docs/KILLZONE.md sections 4 and 6). Optional, switched on by tuning.warSupport.enabled.
//
// War support: one meter per side (0 to 100, starting at tuning.warSupport.start). It moves
// with the war: worlds captured and lost, the enemy landing on your home world, a faction's
// capital falling, battles won and lost, a blockade of your home world, and propaganda turned
// into support each round. High support speeds industry; low support makes units dearer and
// bases grow slower; at 0 the side loses (the victory module in victories/sides.js).
//
// Glory: one score per faction, from battles, bases and worlds taken, and its own ambition (data
// on the faction). It ranks the factions of the winning side. Actions on the war council's
// objective world earn more.
//
// War council: every so many turns each side's factions vote on one world to fight for; each
// proposes (their ambition's world unless they say otherwise) and votes for their own; the
// proposal with most votes wins, a tie going to the faction with least glory, so the side
// helps whoever is behind.
//
// Arms deals: a faction whose data says it sells arms (Stahl Arms) sells units with those tags
// to its allies for credits, at a price that rises with each sale.

import { atWar } from './diplomacy.js';
import { sideOf } from './frontline.js';
import { activeWorld, allCities, worldData, worldIds } from './worlds.js';
import { orbitOf, blockadedFor } from './space.js';
import { currentFactionId } from './queries.js';
import { spawnUnit } from './buildings.js';
import { knows } from './progression.js';

const tun = (ruleset) => ruleset.tuning?.warSupport ?? {};
export const sidesOn = (ruleset) => tun(ruleset).enabled === true;

const clamp = (n) => Math.max(0, Math.min(100, n));
const factionsOf = (state, ruleset, side) => state.factions.filter((f) => f.alive && sideOf(state, ruleset, f.id) === side);
const civOf = (state, id) => state.factions.find((f) => f.id === id)?.civ;

/** Set up war support, glory and the council at the start of a game. */
export function setUpSides(state, ruleset) {
  const t = tun(ruleset);
  state.warSupport = { 0: t.start ?? 60, 1: t.start ?? 60 };
  state.glory = Object.fromEntries(state.factions.map((f) => [f.id, 0]));
  state.council = { 0: null, 1: null, proposals: {}, votes: {} };
  state.holdStreak = { 0: 0, 1: 0 };
  state.arms = { sales: 0 };
}

function support(state, side, delta, events, why) {
  if (side !== 0 && side !== 1 || !delta) return;
  const before = state.warSupport[side];
  state.warSupport[side] = clamp(before + delta);
  if (state.warSupport[side] !== before) events.push({ type: 'warSupport', side, delta: state.warSupport[side] - before, value: state.warSupport[side], why });
}

/** The world whose home this is (worlds.homeOf), or null. */
const homeOf = (ruleset, world) => ruleset.worlds?.[world]?.homeOf ?? null;

/** Glory for a faction, with the council's bonus when the deed was on its side's objective world. */
function glory(state, ruleset, faction, amount, world, events, why) {
  if (!amount || !(faction in state.glory)) return;
  const side = sideOf(state, ruleset, faction);
  const objective = state.council?.[side]?.world;
  const bonus = objective && world === objective ? Math.round((amount * (tun(ruleset).councilBonus ?? 20)) / 100) : 0;
  state.glory[faction] += amount + bonus;
  events.push({ type: 'glory', faction, amount: amount + bonus, why });
}

/** A faction's ambition rules that match a deed: [{ when, world, resource, amount, perTurn }]. */
const ambitions = (ruleset, civ, when) => (ruleset.factions?.[civ]?.ambition ?? []).filter((a) => a.when === when);

/**
 * War support and glory from what just happened (called after every command, like the
 * diplomacy rules' own note-taking). Reads the events; never changes how anything played out.
 */
export function noteWarEvents(state, ruleset, events) {
  if (!state.warSupport) return;
  const t = tun(ruleset);
  const extra = [];
  const world = activeWorld(state);
  for (const e of events) {
    if (e.type === 'battle' && e.winner) {
      const win = e.winner === 'attacker' ? e.attackerFaction : e.defenderFaction;
      const lose = e.winner === 'attacker' ? e.defenderFaction : e.attackerFaction;
      if (win === 'raiders' || lose === 'raiders') continue;
      support(state, sideOf(state, ruleset, win), t.battle ?? 1, extra, 'battleWon');
      support(state, sideOf(state, ruleset, lose), -(t.battle ?? 1), extra, 'battleLost');
      glory(state, ruleset, win, (t.gloryBattle ?? 1) + ambitions(ruleset, civOf(state, win), 'battleWon').reduce((n, a) => n + (a.amount ?? 0), 0), world, extra, 'battle');
    } else if (e.type === 'worldCaptured') {
      support(state, e.side, t.territory ?? 5, extra, 'worldCaptured');
      if (e.from === 0 || e.from === 1) support(state, e.from, -(t.territory ?? 5), extra, 'worldLost');
      for (const f of factionsOf(state, ruleset, e.side)) {
        const amb = ambitions(ruleset, f.civ, 'captureWorld').filter((a) => !a.world || a.world === e.world).reduce((n, a) => n + (a.amount ?? 0), 0);
        glory(state, ruleset, f.id, (t.gloryWorld ?? 5) + amb, e.world, extra, 'world');
      }
    } else if (e.type === 'armyLanded') {
      const home = homeOf(ruleset, e.world);
      const side = sideOf(state, ruleset, e.faction);
      if (home !== null && home !== side) support(state, home, -(t.homeLanding ?? 10), extra, 'homeLanding');
      // An ambition's landing glory pays on the world it names, home world or not, when the
      // landing is on ground the side does not hold.
      if (state.holders?.[e.world] !== side) glory(state, ruleset, e.faction, ambitions(ruleset, civOf(state, e.faction), 'landOn').filter((a) => a.world === e.world).reduce((n, a) => n + (a.amount ?? 0), 0), e.world, extra, 'landing');
    } else if (e.type === 'cityCaptured') {
      const city = allCities(state)[e.city];
      glory(state, ruleset, e.faction, t.gloryCity ?? 5, world, extra, 'base');
      if (city?.originalCapital && e.from) {
        support(state, sideOf(state, ruleset, e.from), -(t.capitalLost ?? 15), extra, 'capitalLost');
        glory(state, ruleset, e.faction, (t.gloryCapital ?? 10) + ambitions(ruleset, civOf(state, e.faction), 'captureCapital').reduce((n, a) => n + (a.amount ?? 0), 0), world, extra, 'capital');
      }
    }
  }
  events.push(...extra);
}

/**
 * The end of each round: blockades of home worlds, propaganda into support, ambitions held,
 * who holds how many worlds (for the territory victory), and the war council when it is due.
 */
export function sidesRound(state, ruleset, events) {
  if (!state.warSupport) return;
  const t = tun(ruleset);
  for (const side of [0, 1]) {
    const home = worldIds(state).find((w) => homeOf(ruleset, w) === side);
    const someone = factionsOf(state, ruleset, side)[0];
    if (home && someone && blockadedFor(state, someone.id, home)) support(state, side, -(t.blockade ?? 1), events, 'blockade');
    // Propaganda: every so much becomes a point of support, up to a few a round for the side.
    let room = t.propagandaMax ?? 3;
    for (const f of factionsOf(state, ruleset, side)) {
      const per = t.propagandaPer ?? 25;
      const n = Math.min(room, Math.floor((f.stocks?.faith ?? 0) / per));
      if (n <= 0) continue;
      f.stocks.faith -= n * per;
      room -= n;
      support(state, side, n, events, 'propaganda');
    }
  }
  // Ambitions held, turn by turn.
  for (const f of state.factions.filter((x) => x.alive)) {
    const side = sideOf(state, ruleset, f.id);
    for (const a of ruleset.factions?.[f.civ]?.ambition ?? []) {
      if (state.turn % (a.every ?? 1) !== 0) continue;
      if (a.when === 'holdWorld' && state.holders?.[a.world] === side) glory(state, ruleset, f.id, a.perTurn ?? 1, a.world, events, 'ambition');
      if (a.when === 'holdOrbit' && orbitOf(state, ruleset, a.world).factions.some((x) => x === f.id)) glory(state, ruleset, f.id, a.perTurn ?? 1, a.world, events, 'ambition');
      if (a.when === 'holdCapital') {
        const cap = Object.values(allCities(state)).find((c) => c.foundedBy === f.id && c.originalCapital);
        if (cap && cap.faction === f.id) glory(state, ruleset, f.id, a.perTurn ?? 1, null, events, 'ambition');
      }
      if (a.when === 'resourceWorked') {
        let n = 0;
        for (const w of worldIds(state)) {
          const d = worldData(state, w);
          d.map.resource.forEach((r, i) => {
            if (r < 0 || d.map.resourceIds[r] !== a.resource || d.map.improvement[i] < 0) return;
            const owner = d.owner?.[i];
            if (owner && d.cities[owner]?.faction === f.id) n += 1;
          });
        }
        glory(state, ruleset, f.id, n * (a.perTurn ?? 1), null, events, 'ambition');
      }
    }
  }
  for (const side of [0, 1]) {
    const held = Object.values(state.holders ?? {}).filter((h) => h === side).length;
    state.holdStreak[side] = held >= (t.holdWorlds ?? 6) ? state.holdStreak[side] + 1 : 0;
  }
  if (state.turn % (t.councilEvery ?? 10) === 0) council(state, ruleset, events);
}

/** A faction's proposal for the council: its own choice, else its ambition's first world. */
function proposalOf(state, ruleset, f) {
  return state.council.proposals?.[f.id] ?? (ruleset.factions?.[f.civ]?.ambition ?? []).find((a) => a.world)?.world ?? null;
}

/** The war council meets: each side picks one world to fight for until the next meeting. */
export function council(state, ruleset, events) {
  for (const side of [0, 1]) {
    const members = factionsOf(state, ruleset, side);
    if (!members.length) continue;
    const tally = new Map();
    for (const f of members) {
      const vote = state.council.votes?.[f.id] ?? proposalOf(state, ruleset, f);
      if (vote) tally.set(vote, (tally.get(vote) ?? 0) + 1);
    }
    if (!tally.size) continue;
    const least = (w) => Math.min(...members.filter((f) => proposalOf(state, ruleset, f) === w).map((f) => state.glory[f.id]), Infinity);
    const world = [...tally.keys()].sort((a, b) => (tally.get(b) - tally.get(a)) || (least(a) - least(b)) || (a < b ? -1 : 1))[0];
    const proposer = members.find((f) => proposalOf(state, ruleset, f) === world)?.id ?? null;
    state.council[side] = { world, proposer, from: state.turn, votes: Object.fromEntries(tally) };
    events.push({ type: 'councilDecided', side, world, proposer, votes: Object.fromEntries(tally), global: true });
  }
  state.council.proposals = {};
  state.council.votes = {};
}

/** Effects of a side's war support on a faction (merged into effectsFor): industry when high, dearer units and slower growth when low. */
export function warSupportEffects(state, ruleset, factionId) {
  if (!state.warSupport) return [];
  const t = tun(ruleset);
  const v = state.warSupport[sideOf(state, ruleset, factionId)];
  if (v === undefined) return [];
  const src = { kind: 'warSupport', id: 'warSupport' };
  if (v > (t.high ?? 70)) return [{ effect: 'yieldPercent', yield: 'production', amount: t.highIndustry ?? 10, scope: 'everyCity', source: src }];
  if (v < (t.low ?? 30)) {
    return [{ effect: 'costPercent', target: 'units', amount: t.lowCost ?? 20, scope: 'everyCity', source: src },
      { effect: 'growthPercent', amount: -(t.lowGrowth ?? 25), scope: 'everyCity', source: src }];
  }
  return [];
}

// ---------- Commands ----------

const err = (code, message) => ({ code, message });

/** Propose (or vote for) a world for your side's next war council. */
export const councilVote = {
  validate(state, cmd, ruleset) {
    if (!state.warSupport) return err('noCouncil', 'This game has no war council');
    if (cmd.faction !== currentFactionId(state)) return err('notYourTurn', 'It is not your turn');
    if (!ruleset.worlds?.[cmd.world]) return err('unknownWorld', 'There is no such world');
    return null;
  },
  apply(state, cmd, events) {
    state.council.proposals[cmd.faction] = cmd.world;
    state.council.votes[cmd.faction] = cmd.world;
    events.push({ type: 'councilProposal', faction: cmd.faction, world: cmd.world });
  },
};

/**
 * Delegate a theatre (K5; docs/KILLZONE.md 7.2): the computer plays your units on that world at
 * the end of each of your turns, in one of three STANCES (Hold the line, Advance, All-out
 * assault; what each means to the AI is in the mod's ai/weights.json theatre.stances). stance null takes the theatre back. It changes no rules:
 * the delegated orders are ordinary commands in the log, so a game still replays exactly.
 */
export const STANCES = ['hold', 'advance', 'allout'];

export const setDelegation = {
  validate(state, cmd, ruleset) {
    if (!state.warSupport || !state.worldOrder) return err('noDelegation', 'Only a war across several worlds has theatres to delegate');
    if (cmd.faction !== currentFactionId(state)) return err('notYourTurn', 'It is not your turn');
    if (!state.worldOrder.includes(cmd.theatre)) return err('unknownWorld', 'There is no such world');
    if (cmd.stance !== null && !STANCES.includes(cmd.stance)) return err('unknownStance', 'There is no such stance');
    return null;
  },
  apply(state, cmd, events) {
    state.delegation ??= {};
    const mine = { ...(state.delegation[cmd.faction] ?? {}) };
    if (cmd.stance === null) delete mine[cmd.theatre]; else mine[cmd.theatre] = cmd.stance;
    state.delegation[cmd.faction] = mine;
    events.push({ type: 'delegationSet', faction: cmd.faction, theatre: cmd.theatre, stance: cmd.stance });
  },
};

/** The price of an arms deal: the unit's cost times the markup, rising with each sale. */
export function armsPrice(state, ruleset, unitId) {
  const t = tun(ruleset);
  return Math.round((ruleset.units[unitId]?.cost ?? 0) * (t.armsMarkup ?? 2) * (1 + ((state.arms?.sales ?? 0) * (t.armsRise ?? 10)) / 100));
}

/** Buy a unit from an allied arms dealer (Stahl Arms), delivered to one of your bases. */
export const buyArms = {
  validate(state, cmd, ruleset) {
    if (!state.warSupport) return err('noArms', 'This game has no arms trade');
    if (cmd.faction !== currentFactionId(state)) return err('notYourTurn', 'It is not your turn');
    const seller = state.factions.find((f) => f.id === cmd.seller && f.alive);
    const sells = seller ? ruleset.factions?.[seller.civ]?.sellsArms ?? [] : [];
    if (!sells.length || seller.id === cmd.faction) return err('noDealer', 'They do not sell arms');
    if (atWar(state, cmd.faction, seller.id) || sideOf(state, ruleset, cmd.faction) !== sideOf(state, ruleset, seller.id)) return err('notAlly', 'Only allies buy arms');
    const def = ruleset.units[cmd.unit];
    if (!def || !(def.tags ?? []).some((x) => sells.includes(x)) || def.unique) return err('notForSale', 'That is not for sale');
    if (def.requires?.side !== undefined && def.requires.side !== sideOf(state, ruleset, cmd.faction)) return err('notForSale', 'That is not for sale');
    if (def.requires?.tech && !knows(state, seller.id, def.requires.tech)) return err('notForSale', 'They cannot make that yet');
    const city = state.cities?.[cmd.city];
    if (!city || city.faction !== cmd.faction) return err('notYourCity', 'Choose one of your bases on this world');
    const buyer = state.factions.find((f) => f.id === cmd.faction);
    if ((buyer.stocks?.gold ?? 0) < armsPrice(state, ruleset, cmd.unit)) return err('cannotAfford', 'Not enough credits');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const price = armsPrice(state, ruleset, cmd.unit);
    const ev = spawnUnit(state, ruleset, state.cities[cmd.city], cmd.unit);
    if (!ev) { events.push({ type: 'armsUndelivered', faction: cmd.faction, unit: cmd.unit }); return; }
    state.factions.find((f) => f.id === cmd.faction).stocks.gold -= price;
    state.factions.find((f) => f.id === cmd.seller).stocks.gold += price;
    state.arms.sales += 1;
    events.push({ ...ev, type: 'armsBought', seller: cmd.seller, price });
  },
};
