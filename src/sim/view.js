// view(state, factionId): the game as one faction is allowed to know it.
//
// The player's screen and the AI both read this, never the raw state, so
// nobody can see through the fog (section 9.5). Unexplored tiles come back
// as -1 in every map array; other factions' units appear only on tiles the
// faction can see right now, with only what can be seen from outside.

import { VISIBLE, UNEXPLORED } from './visibility.js';
import { opinionOf } from './diplomacy.js';
import { multiWorld, lookAt, activeWorld } from './worlds.js';
import { spaceView } from './space.js';
import { sideOf } from './frontline.js';

const HIDDEN = -1;

/**
 * opts.world: with several worlds (K1a), the world to look at (default: the active one).
 * The view then also says which world it shows and lists them all (world, worlds).
 */
export function view(state, factionId, ruleset = null, opts = {}) {
  const multi = multiWorld(state);
  if (multi && opts.world && opts.world !== activeWorld(state)) {
    if (!state.worldOrder.includes(opts.world)) throw new Error(`No world "${opts.world}"`);
    state = lookAt(state, opts.world);
  }
  const me = state.factions.find((f) => f.id === factionId);
  if (!me) throw new Error(`No faction "${factionId}"`);
  const out = {
    turn: state.turn,
    me: factionId,
    current: state.seatOrder[state.seatIndex],
    seatOrder: state.seatOrder.slice(),
    // Everyone's government is public knowledge (as in the board game); cards and research are not.
    factions: state.factions.map((f) => ({ id: f.id, name: f.name, kind: f.kind, alive: f.alive, civ: f.civ ?? null, government: f.government?.id ?? null })),
    cities: [],
    map: null,
    fog: null,
    units: [],
  };
  if (multi) { out.world = activeWorld(state); out.worlds = state.worldOrder.slice(); }
  // K2: the star map, as this faction may know it.
  if (state.space && ruleset) out.space = spaceView(state, ruleset, factionId, sideOf);
  if (!state.map) return out;
  const map = state.map;
  const fog = state.fog?.[factionId] ?? new Array(map.width * map.height).fill(UNEXPLORED);
  const mask = (arr, hidden = HIDDEN) => arr.map((v, i) => (fog[i] === UNEXPLORED ? hidden : v));
  out.fog = fog.slice();
  out.map = {
    width: map.width,
    height: map.height,
    size: map.size,
    type: map.type,
    terrainIds: map.terrainIds.slice(),
    featureIds: map.featureIds.slice(),
    resourceIds: map.resourceIds.slice(),
    terrain: mask(map.terrain),
    hills: mask(map.hills, 0),
    feature: mask(map.feature),
    // Strategic resources stay hidden until the tech that reveals them.
    resource: mask(map.resource).map((r) => {
      const res = r >= 0 && ruleset ? ruleset.resources[map.resourceIds[r]] : null;
      return res?.revealedBy && !(me.research?.known ?? []).includes(res.revealedBy) ? -1 : r;
    }),
    river: mask(map.river, 0),
    road: map.road ? mask(map.road, 0) : null,
    improvementIds: (map.improvementIds ?? []).slice(),
    improvement: map.improvement ? mask(map.improvement) : null,
    owner: state.owner ? mask(state.owner, null) : null,
  };
  // Cities: your own in full; others where you have explored, outside details only.
  out.cities = [];
  for (const c of Object.values(state.cities ?? {})) {
    if (c.faction === factionId) out.cities.push(JSON.parse(JSON.stringify(c)));
    else if (fog[c.tile] !== UNEXPLORED) out.cities.push({ id: c.id, name: c.name, faction: c.faction, tile: c.tile, pop: c.pop, capital: c.capital, hp: c.hp, buildings: c.buildings.slice(), originalCapital: c.originalCapital, followers: { ...(c.followers ?? {}) } });
  }
  const mine = state.factions.find((f) => f.id === factionId);
  out.stocks = mine.stocks ? { ...mine.stocks } : null;
  out.lastNetGold = mine.lastNetGold ?? null;
  out.research = mine.research ? JSON.parse(JSON.stringify(mine.research)) : null;
  out.civicResearch = mine.civicResearch ? JSON.parse(JSON.stringify(mine.civicResearch)) : null;
  out.government = mine.government ? JSON.parse(JSON.stringify(mine.government)) : null;
  out.pendingGovernment = mine.pendingGovernment ? JSON.parse(JSON.stringify(mine.pendingGovernment)) : null;
  out.setup = JSON.parse(JSON.stringify(state.setup ?? {}));
  // Who is at war with whom, who has met whom and the treaties are public (phase 12),
  // as are war weariness levels; opinions, offers and running deals only for the parties.
  out.wars = (state.wars ?? []).slice();
  if (state.diplomacy) {
    const d = state.diplomacy;
    const mine = (x) => x.from === factionId || x.to === factionId;
    out.diplomacy = {
      met: d.met.slice(),
      treaties: JSON.parse(JSON.stringify(d.treaties)),
      peaceUntil: { ...d.peaceUntil },
      warSince: { ...(d.warSince ?? {}) },
      weariness: { ...d.weariness },
      counters: JSON.parse(JSON.stringify(d.counters)),
      denounced: Object.fromEntries(Object.entries(d.denounced).filter(([k]) => k.split('>').includes(factionId))),
      deals: JSON.parse(JSON.stringify(d.deals.filter(mine))),
      resources: d.resources.filter(mine).map((r) => ({ ...r })),
      goldPerTurn: d.goldPerTurn.filter(mine).map((g) => ({ ...g })),
      modifiers: {},
      nextDeal: d.nextDeal,
    };
    // Worked out only when read (the AI reads them once a turn, but asks for a view after every move).
    let opinions = null;
    Object.defineProperty(out, 'opinions', {
      enumerable: true,
      get() {
        if (!opinions) {
          opinions = {};
          if (ruleset) {
            for (const f of state.factions) {
              if (f.id === factionId || !d.met.includes(factionId < f.id ? `${factionId}|${f.id}` : `${f.id}|${factionId}`)) continue;
              opinions[f.id] = { mine: opinionOf(state, ruleset, factionId, f.id), theirs: opinionOf(state, ruleset, f.id, factionId) };
            }
          }
        }
        return opinions;
      },
    });
  }
  out.wondersBuilt = { ...(state.wondersBuilt ?? {}) };
  // Trade routes that start or end in your cities (phase 14).
  if (state.trade) {
    const own = new Set(Object.values(state.cities ?? {}).filter((c) => c.faction === factionId).map((c) => c.id));
    out.trade = { routes: state.trade.routes.filter((r) => r.faction === factionId || own.has(r.dest)).map((r) => ({ ...r, path: r.path.slice() })), nextRoute: state.trade.nextRoute };
  }
  // Your own spies and the intel they brought back (phase 15); rivals' spies stay hidden.
  if (state.espionage) {
    out.espionage = { spies: state.espionage.spies.filter((s) => s.faction === factionId).map((s) => ({ ...s, mission: s.mission ? { ...s.mission } : null })), intel: JSON.parse(JSON.stringify(state.espionage.intel?.[factionId] ?? {})), nextSpy: state.espionage.nextSpy };
  }
  // An event waiting for your choice (phase 16), your influence and lifetime culture, and everyone's lifetime culture (public, for the culture victory).
  out.pendingEvent = state.events?.pending?.[factionId] ? { ...state.events.pending[factionId] } : null;
  out.culture = Object.fromEntries(state.factions.map((f) => [f.id, { lifetime: Math.floor(f.lifetimeCulture ?? 0), influence: Math.floor(f.influence ?? 0) }]));
  // The front line (phase 19) is public: both sides can see where it runs and who holds the sites.
  out.frontline = state.frontline ? { control: state.frontline.control.slice(), sites: JSON.parse(JSON.stringify(state.frontline.sites)) } : null;
  // Pantheons and religions (founders, holy cities, beliefs) are public (phase 13).
  out.religion = state.religion ? JSON.parse(JSON.stringify(state.religion)) : null;
  // Finished projects and the winner are announced to everyone, so every view has them.
  out.projects = JSON.parse(JSON.stringify(state.projects ?? {}));
  out.winner = state.winner ? { ...state.winner } : null;
  out.pendingCapture = state.pendingCapture?.faction === factionId ? { ...state.pendingCapture } : null;
  out.pendingBattle = state.pendingBattle && (state.pendingBattle.spec.attacker.faction === factionId || state.pendingBattle.spec.defender.faction === factionId) ? JSON.parse(JSON.stringify(state.pendingBattle)) : null;
  out.camps = Object.keys(state.raiders?.camps ?? {}).map(Number).filter((t) => fog[t] !== UNEXPLORED);
  for (const u of Object.values(state.units ?? {})) {
    if (u.faction === factionId) {
      out.units.push({ ...u });
    } else if (fog[u.tile] === VISIBLE) {
      out.units.push({ id: u.id, type: u.type, faction: u.faction, tile: u.tile, hp: u.hp, activity: u.activity === 'fortify' ? 'fortify' : 'none', fortifiedTurns: u.activity === 'fortify' ? u.fortifiedTurns : 0, promotions: (u.promotions ?? []).slice() });
    }
  }
  return out;
}

/**
 * A state-shaped object built only from a view: what this player knows,
 * arranged so the rules' own checks (paths, founding, building, attacking,
 * validating a command) can run on it. The screen and the AI both use it,
 * so what they allow is exactly what the rules allow, without peeking.
 */
export function worldFromView(v) {
  return {
    map: v.map,
    units: Object.fromEntries(v.units.map((u) => [u.id, u])),
    cities: Object.fromEntries(v.cities.map((c) => [c.id, c])),
    owner: v.map?.owner ?? null,
    factions: v.factions.map((f) => (f.id === v.me ? { ...f, research: v.research, civicResearch: v.civicResearch, government: v.government, pendingGovernment: v.pendingGovernment, stocks: v.stocks } : f)),
    turn: v.turn,
    seatOrder: v.seatOrder,
    seatIndex: v.seatOrder.indexOf(v.current),
    fog: v.fog ? { [v.me]: v.fog } : {},
    wars: v.wars ?? [],
    diplomacy: v.diplomacy ?? undefined,
    religion: v.religion ?? undefined,
    trade: v.trade ?? undefined,
    frontline: v.frontline ?? undefined,
    events: v.pendingEvent ? { pending: { [v.me]: v.pendingEvent }, last: {}, nextId: 0 } : undefined,
    espionage: v.espionage ? { spies: v.espionage.spies, intel: { [v.me]: v.espionage.intel }, nextSpy: v.espionage.nextSpy } : undefined,
    wondersBuilt: v.wondersBuilt ?? {}, projects: v.projects ?? {}, winner: v.winner ?? null,
    setup: v.setup ?? {},
    pendingCapture: v.pendingCapture ?? null,
    raiders: { camps: Object.fromEntries((v.camps ?? []).map((t) => [t, {}])) },
  };
}
