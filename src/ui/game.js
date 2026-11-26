// The game screen: top bar with turn and empire yields, the advice line,
// the needs-attention list, the map, and the right panel (a unit card, or the
// city drawer when a city is open), with the Next button.
//
// Everything shown comes from view(state, yourFaction), never the raw state,
// so the screen cannot show what your units and cities cannot see. Every
// change goes through applyCommand.

import {
  createGame, applyCommand, view, worldFromView, findPath, currentFactionId, VISIBLE, UNEXPLORED, fingerprint,
  cityYields, foodToGrow, buildOptions, itemCost, foundingProblem, borderCost, claimable, tilePrice, buyPrice,
  improvementProblem, builderTargets, upkeepOf, adjacencyBonus, buildingDef, eraOf, slotsOf, workingGovernment, governmentAvailable, policyAvailable, faithPrice, preachTarget, pantheonOf, foundedBy, pantheonFaith, foundFaith, holyCityOptions, religionLimit,
  atWar, buildSpec, attackProblem, cityStrength, cityHasWalls, combatKind, rangeOf, promotionsAvailable, promotionOptions, cityHpMax, defenderAt,
} from '../sim/index.js';
import { estimateOdds } from './odds.js';
import { factionCard } from './factionCards.js';
import { createSeatRunner, rankTechs, rankCivics } from '../ai/index.js';
import { renderTrees } from './trees.js';
import { renderEmpire } from './empire.js';
import { renderDiplomacy } from './diplomacy.js';
import { renderReligionTab, religionName } from './religionTab.js';
import { renderTradeTab, renderTraderList } from './tradeTab.js';
import { renderSpiesTab } from './spiesTab.js';
import { renderJournal } from './journal.js';
import { renderVictory, renderEnd } from './victoryPanel.js';
import { renderGameMenu, codeBox } from './gameMenu.js';
import { createMapView } from '../render/canvas.js';
import { attachMapInput } from './input.js';
import { t, formatText } from '../data/text.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/** Replace an element's children, skipping empty entries (null, undefined, false). */
function fill(node, ...children) {
  node.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false));
}

const fmt = (n) => (Math.round(n * 10) / 10).toString();
const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));

/** A state-shaped object built from a view, so planning and previews use only what the player knows. */
export function knownWorld(v) {
  return worldFromView(v);
}

/** Rank what a city could build, best first, each with a one-line reason (section 10.4). */
export function rankOptions(v, ruleset, city, tt) {
  const world = knownWorld(v);
  const me = v.me;
  const prod = Math.max(1, cityYields(world, ruleset, city).total.production);
  const myUnits = v.units.filter((u) => u.faction === me);
  const defended = myUnits.some((u) => u.tile === city.tile && !ruleset.unitClasses[ruleset.units[u.type].class]?.civilian);
  const explored = v.fog.filter((f) => f !== UNEXPLORED).length / v.fog.length;
  const settlersAround = myUnits.filter((u) => (ruleset.units[u.type].tags ?? []).includes('founder')).length;
  return buildOptions(world, ruleset, city).map((item) => {
    const turns = Math.max(1, Math.ceil((itemCost(ruleset, item, world, city) - (city.queue[0]?.id === item.id ? city.progress : 0)) / prod));
    let score = 1;
    let reason;
    if (item.kind === 'building' || item.kind === 'wonder') {
      const def = buildingDef(ruleset, item.id);
      reason = ruleset.text[def.descriptionKey] ?? tt('prod.reason.building', { city: city.name });
      if (item.kind === 'wonder') reason = tt('prod.reason.wonder', { text: reason });
      // Value what it gives here: yields (with adjacency in this city) and amenities.
      const adj = (def.adjacency ?? []).length ? adjacencyBonus(world, ruleset, { ...city, buildings: [...city.buildings, item.id] }, item.id).reduce((n, a) => n + a.amount, 0) : 0;
      const gives = Object.values(def.yields ?? {}).reduce((n, x) => n + x, 0) + adj + (def.amenities ?? 0) * 1.5 + (def.effects?.length ?? 0);
      score = (item.kind === 'wonder' ? 2.5 : 2) + gives * 0.6;
    } else {
      const def = ruleset.units[item.id];
      const cls = ruleset.unitClasses[def.class] ?? {};
      const tags = def.tags ?? [];
      if (tags.includes('founder')) { reason = tt('prod.reason.settle'); score = city.pop >= 2 && settlersAround === 0 ? 9 : 4; }
      else if (tags.includes('worker')) { reason = tt('prod.reason.improve'); score = 1; }
      else if (cls.domain === 'sea') { reason = tt('prod.reason.naval'); score = 2; }
      else if (def.class === 'recon') { reason = tt('prod.reason.explore'); score = explored < 0.25 ? 7 : 2; }
      else if (cls.combat === 'ranged') { reason = tt('prod.reason.ranged'); score = 4; }
      else if (def.class === 'anti_cavalry') { reason = tt('prod.reason.antiCavalry'); score = 3.5; }
      else if (!defended) { reason = tt('prod.reason.defendNone', { city: city.name }); score = 8; }
      else { reason = tt('prod.reason.defend'); score = 3; }
    }
    return { item, turns, reason, score: score - turns * 0.05 };
  }).sort((a, b) => b.score - a.score || a.turns - b.turns || a.item.id.localeCompare(b.item.id));
}

/**
 * The game screen. Starts a new game from `setup` (or a quick default built
 * from seed and faction), or carries on from `resume` ({ state, log, journal })
 * when a save is loaded. `hooks` connect it to the app: saveSlot, exportCode,
 * autosave, quit and newGame.
 */
export function createGameScreen(doc, root, { ruleset, text, sheets, seed, toast, setup: given = null, resume = null, players = 4, mapSize = 'small', mapType = 'continents', faction = null, debug = false, hooks = {} }) {
  const tt = (key, args) => t(text, key, args);
  const setup = resume ? resume.state.setup : given ?? {
    seed,
    players: [{ kind: 'human', name: tt('game.you'), ...(faction ? { faction } : {}) }, ...Array.from({ length: players - 1 }, (_, n) => ({ kind: 'ai', name: tt('game.rival', { n: n + 1 }) }))],
    map: { size: mapSize, type: mapType },
    raiders: 'on',
  };
  let state = resume ? resume.state : createGame(ruleset, setup);
  // Every command that changed the game, in order: with the seed, this rebuilds it exactly (saves, replays).
  const log = resume ? resume.log.slice() : [];
  /** The one way this screen changes the game: apply a command and log it. */
  function exec(cmd) {
    const r = applyCommand(state, cmd, ruleset);
    if (r.ok) { state = r.state; log.push(cmd); }
    return r;
  }
  const human = state.factions.find((f) => f.kind === 'human')?.id ?? 'f0';
  const palette = ruleset.skin.seatColours ?? ['#c23b22', '#2f6fbf', '#e0a526', '#6a4c9c'];
  // A skin may ask for each faction's own colours (skin.factionColours): its primary, or its
  // secondary when the primary is too dark to see on the map; a repeat falls back to the seat palette.
  const lum = (hex) => { const n = Number.parseInt(String(hex).slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
  const usedColours = new Set();
  const colours = Object.fromEntries(state.factions.map((f, i) => {
    const own = ruleset.skin.factionColours ? ruleset.factions?.[f.civ]?.colours : null;
    let c = own ? (lum(own.primary) < 0.15 ? own.secondary : own.primary) : null;
    if (!c || usedColours.has(c)) c = palette[i % palette.length];
    usedColours.add(c);
    return [f.id, c];
  }));
  colours.raiders = ruleset.skin.raiderColour ?? '#3d3d3d';
  const $ = (sel) => root.querySelector(sel);
  // The computer seats. They play in a Web Worker when the browser allows
  // (phase 10), so the page never freezes; otherwise here, with the same code.
  const aiIds = state.factions.filter((f) => f.kind === 'ai').map((f) => f.id);
  const startMemories = Object.fromEntries(aiIds.map((id) => [id, { journal: resume?.journal?.[id] ?? [] }]));
  const recordOff = setup.recordAI === 'off';
  const seats = createSeatRunner(ruleset, aiIds, { memories: startMemories, recordOff });
  let journals = seats.journals();
  let busy = false;           // the rivals are moving: your commands wait
  const worker = startWorker();
  function startWorker() {
    const params = new URLSearchParams(doc.defaultView.location.search);
    if (params.get('worker') === 'off' || typeof doc.defaultView.Worker !== 'function') return null;
    try {
      const w = new doc.defaultView.Worker(new URL('../aiWorker.js', import.meta.url), { type: 'module' });
      w.postMessage({ type: 'init', ruleset, factions: aiIds, memories: startMemories, recordOff });
      return w;
    } catch {
      return null;
    }
  }
  let playId = 0;
  /** Ask the worker to play the computer seats; resolves with its reply, or null if it failed. */
  function workerPlay(fromState) {
    const id = ++playId;
    return new Promise((resolve) => {
      const done = (e) => {
        if (e.data?.id !== id) return;
        worker.removeEventListener('message', done);
        resolve(e.data.type === 'played' ? e.data : null);
      };
      worker.addEventListener('message', done);
      worker.postMessage({ type: 'play', id, state: fromState, stopAt: human });
    });
  }
  let v = view(state, human, ruleset);
  let selected = null;        // unit id
  let openCity = null;        // city id
  let pendingTarget = null;   // touch: first tap on a destination
  let pendingBuy = null;      // tile awaiting a second tap to buy
  let confirmDisband = false;
  let showAllOptions = false;
  let aim = null;             // { tile, spec, odds } for the enemy being pointed at
  let shootingCity = null;    // a city choosing what to shoot
  let lastTouch = false;
  let autoplayAi = null;      // ?debug=1 autoplay: an AI plays your seat too

  const mapView = createMapView($('#game-map'), { map: v.map, ruleset, fog: v.fog, units: v.units, colours, sheets });
  // What tests and the dev tools can see; published on window once the opening seats have played.
  const api = { get state() { return state; }, get view() { return v; }, get busy() { return busy; }, mapView, human, ruleset, get journals() { return journals; }, usesWorker: Boolean(worker) };
  if (debug) {
    // Developer cheats (?debug=1 only), like the plan's dev page: they edit a copy of the
    // state directly, outside the rules, so they are never available in a normal game.
    api.debug = {
      spawn(type, factionId, tile) {
        const next = JSON.parse(JSON.stringify(state));
        const id = `dbg_${next.nextId++}`;
        next.units[id] = { id, type, faction: factionId, tile, hp: 100, moves: ruleset.units[type].moves, activity: 'none', fortifiedTurns: 0, goto: null, xp: 0, promotions: [] };
        state = next;
        refresh();
        return id;
      },
      /** Let an AI play your seat as well, for `rounds` rounds or until the game ends (the full-game browser test). */
      autoplay(rounds = 1) {
        // Its own AIs for every seat, played here on the page (debug only).
        autoplayAi ??= createSeatRunner(ruleset, state.factions.map((f) => f.id));
        const refusals = [];
        for (let i = 0; i < rounds && !gameOver(); i += 1) {
          const before = state.turn;
          while (state.turn === before && !state.winner) {
            const r = autoplayAi.play(state, { maxSeats: state.factions.length });
            state = r.state;
            log.push(...r.commands);
            refusals.push(...r.refusals);
          }
        }
        journals = autoplayAi.journals();
        refresh();
        checkEnd();
        return { turn: state.turn, winner: state.winner ?? null, refusals, log: log.length };
      },
      /** Play the computer seats from the current state both in the worker and on the page, from fresh AIs; compare. */
      async workerCheck() {
        // From the moment you end this turn (without changing the real game).
        const from = currentFactionId(state) === human ? applyCommand(state, { type: 'endTurn', faction: human }, ruleset).state : state;
        const fresh = createSeatRunner(ruleset, aiIds);
        const direct = fresh.play(from, { stopAt: human });
        const w = new doc.defaultView.Worker(new URL('../aiWorker.js', import.meta.url), { type: 'module' });
        const reply = await new Promise((resolve) => {
          w.onmessage = (e) => { if (e.data.type === 'ready') w.postMessage({ type: 'play', id: 1, state: from, stopAt: human }); else resolve(e.data); };
          w.postMessage({ type: 'init', ruleset, factions: aiIds, memories: {} });
        });
        w.terminate();
        return { direct: fingerprint(direct.state), worker: fingerprint(reply.state), commands: [direct.commands.length, reply.commands?.length] };
      },
      /** Reveal the whole map to you (as the plan's developer page does). */
      reveal() {
        const next = JSON.parse(JSON.stringify(state));
        next.fog[human] = next.fog[human].map((f) => Math.max(f, 1));
        state = next;
        refresh();
      },
      /** Make an event happen to you now, in your first city (events tests). */
      event(id) {
        const next = JSON.parse(JSON.stringify(state));
        const city = Object.values(next.cities).find((c) => c.faction === human);
        next.events ??= { pending: {}, last: {}, nextId: 1 };
        next.events.pending[human] = { id: `e${next.events.nextId++}`, event: id, city: city.id, turn: next.turn };
        state = next;
        refresh();
      },
      /** Add faith to your stock (religion tests). */
      faith(n) {
        const next = JSON.parse(JSON.stringify(state));
        next.factions.find((x) => x.id === human).stocks.faith += n;
        state = next;
        refresh();
      },
      /** Put a building in one of your cities at once. */
      addBuilding(cityId, id) {
        const next = JSON.parse(JSON.stringify(state));
        next.cities[cityId].buildings.push(id);
        state = next;
        refresh();
      },
      /** Meet every other faction at once (diplomacy tests). */
      meetAll() {
        const next = JSON.parse(JSON.stringify(state));
        for (const f of next.factions) {
          if (f.id === human) continue;
          const k = human < f.id ? `${human}|${f.id}` : `${f.id}|${human}`;
          if (!next.diplomacy.met.includes(k)) next.diplomacy.met.push(k);
        }
        next.diplomacy.met.sort();
        state = next;
        refresh();
      },
      /** Know these techs or civics at once (tree: 'techs' or 'civics'). */
      learn(tree, ids) {
        const next = JSON.parse(JSON.stringify(state));
        const f = next.factions.find((x) => x.id === human);
        const r = tree === 'civics' ? f.civicResearch : f.research;
        for (const id of ids) if (!r.known.includes(id)) r.known.push(id);
        state = next;
        refresh();
      },
      /** What an item costs in your capital right now (unit costs show the effect of policy cards). */
      cost(kind, id) {
        const c = state.cities && Object.values(state.cities).find((x) => x.faction === human && x.capital);
        return c ? itemCost(ruleset, { kind, id }, state, c) : null;
      },
      setXp(unitId, xp) {
        const next = JSON.parse(JSON.stringify(state));
        next.units[unitId].xp = xp;
        state = next;
        refresh();
      },
    };
  }

  const unitName = (u) => ruleset.text[ruleset.units[u.type]?.nameKey] ?? u.type;
  const itemName = (item) => (item.kind === 'unit' ? ruleset.text[ruleset.units[item.id]?.nameKey] : ruleset.text[ruleset.buildings?.[item.id]?.nameKey]) ?? item.id;
  const myUnits = () => v.units.filter((u) => u.faction === human);
  const myCities = () => v.cities.filter((c) => c.faction === human);
  const idle = () => myUnits().filter((u) => u.moves > 0 && u.activity === 'none' && u.goto === null);
  const selectedUnit = () => v.units.find((u) => u.id === selected && u.faction === human) ?? null;
  const theCity = () => v.cities.find((c) => c.id === openCity && c.faction === human) ?? null;
  const isCivilian = (u) => ruleset.unitClasses[ruleset.units[u.type].class]?.civilian === true;
  const isFounder = (u) => (ruleset.units[u.type].tags ?? []).includes('founder');
  const yieldsOf = (c) => cityYields(knownWorld(v), ruleset, c);
  const noProduction = () => myCities().filter((c) => c.queue.length === 0);
  /** Gold per turn after upkeep, from what you know. */
  const netGold = () => myCities().reduce((n, c) => n + yieldsOf(c).total.gold, 0) - upkeepOf(knownWorld(v), ruleset, human).total;
  const goldTurnsLeft = () => { const net = netGold(); return net < 0 ? Math.floor((v.stocks?.gold ?? 0) / -net) + 1 : Infinity; };
  const techName = (id) => ruleset.text[ruleset.techs?.[id]?.nameKey] ?? id;
  const cityNameOf = (id) => v.cities.find((c) => c.id === id)?.name ?? state.cities?.[id]?.name ?? '';
  const civicName = (id) => ruleset.text[ruleset.civics?.[id]?.nameKey] ?? id;
  const civName = (factionId) => { const f = v.factions.find((x) => x.id === factionId); return ruleset.text[ruleset.factions?.[f?.civ]?.nameKey] ?? f?.name ?? ''; };
  const starving = () => myCities().filter((c) => yieldsOf(c).surplus < 0);

  function plan(unit, target) {
    if (!unit || target < 0) return null;
    const fog = v.fog;
    return findPath(knownWorld(v), ruleset, unit, target, { known: (i) => fog[i] !== UNEXPLORED, seen: (i) => fog[i] === VISIBLE });
  }

  function refusal(error) {
    const n = ruleset.tuning?.cities?.minCityDistance ?? 4;
    return text[`game.refused.${error.code}`] ? formatText(text[`game.refused.${error.code}`], { n }) : error.message;
  }

  function cityOverlay() {
    const c = theCity();
    if (!c) return null;
    const world = knownWorld(v);
    const prices = claimable(world, ruleset, c).filter((tile) => v.fog[tile] !== UNEXPLORED).map((tile) => ({ tile, price: tilePrice(world, ruleset, c, tile), pending: tile === pendingBuy }));
    return { worked: c.worked, locks: c.locks, prices };
  }

  function select(id, { centre = false } = {}) {
    selected = id;
    openCity = null;
    aim = null;
    shootingCity = null;
    mapView.setTarget(null);
    pendingTarget = null;
    pendingBuy = null;
    confirmDisband = false;
    mapView.setSelection(id);
    mapView.setPath(null, null);
    mapView.setCityOverlay(null, null);
    const u = selectedUnit();
    if (u && centre) mapView.centreOnTile(u.tile);
    render();
  }

  function openCityDrawer(id, { centre = false } = {}) {
    selected = null;
    openCity = id;
    pendingBuy = null;
    showAllOptions = false;
    mapView.setSelection(null);
    mapView.setPath(null, null);
    mapView.setCityOverlay(id, cityOverlay());
    const c = theCity();
    if (c && centre) mapView.centreOnTile(c.tile);
    render();
  }

  function selectNextIdle() {
    const list = idle();
    if (!list.length) { select(null); return; }
    const after = list.findIndex((u) => u.id > (selected ?? ''));
    select(list[after >= 0 ? after : 0].id, { centre: true });
  }

  function refresh() {
    v = view(state, human, ruleset);
    mapView.setWorld({ map: v.map, fog: v.fog, units: v.units, cities: v.cities, camps: v.camps });
    if (religionLens) mapView.setReligionLens(lensData());
    if (v.pendingCapture) showCaptureDialog();
    else if (v.pendingEvent) showEventDialog();
    if (selected && !selectedUnit()) select(null);
    if (openCity) mapView.setCityOverlay(openCity, cityOverlay());
    render();
  }

  // Raiders keep a conversion's own name for them (tuning.raiders.nameKey: Monsters in the Witcher);
  // a unit only raiders field (a drowner) needs no prefix.
  const raidersName = () => ruleset.text[ruleset.tuning?.raiders?.nameKey] ?? tt('game.raiders');
  const nameOfUnit = (type, faction) => (faction === 'raiders' && !ruleset.units[type]?.raiderOnly ? `${raidersName()} ${unitName({ type }).toLowerCase()}` : unitName({ type }));

  function battleReport(e) {
    if (e.attackerFaction !== human && e.defenderFaction !== human) return;
    const attackerType = e.attackerType ?? '';
    const d = e.damage ?? { toDefender: 0, toAttacker: 0 };
    const city = e.city ? v.cities.find((c) => c.id === e.city) : null;
    const defender = city ? tt('odds.city', { name: city.name }) : nameOfUnit(e.defenderType, e.defenderFaction);
    const attacker = e.kind === 'cityRanged' ? (v.cities.find((c) => c.id === e.attackerCity)?.name ?? '') : nameOfUnit(attackerType, e.attackerFaction);
    toast(e.kind === 'ranged' || e.kind === 'cityRanged'
      ? tt('battle.reportRanged', { attacker, defender, dealt: d.toDefender })
      : tt('battle.report', { attacker, defender, dealt: d.toDefender, taken: d.toAttacker }));
  }

  function showEvents(events) {
    for (const e of events) {
      if (e.type === 'battle') battleReport(e);
      if (e.type === 'warDeclared' && (e.faction === human || e.target === human || v.cities.some((c) => c.faction === e.faction))) toast(tt('game.warDeclared', { faction: civName(e.faction), target: civName(e.target) }));
      if (e.type === 'boost' && e.faction === human) toast(tt('game.boost', { item: e.tree === 'civics' ? civicName(e.item) : techName(e.item), pct: Math.round((ruleset.tuning?.progression?.boostShare ?? 0.4) * 100) }));
      if (e.type === 'techLearned' && e.faction === human) toast(tt('game.techLearned', { item: techName(e.item) }));
      const involved = e.faction === human || e.target === human;
      if (e.type === 'peaceMade' && (involved || v.opinions?.[e.faction])) toast(tt('game.peaceMade', { faction: civName(e.faction), target: civName(e.target) }));
      if (e.type === 'treatySigned' && involved) toast(tt('game.treatySigned', { faction: civName(e.faction), target: civName(e.target), kind: tt(`dip.item.${e.kind}`) }));
      if (e.type === 'denounced' && involved) toast(tt('game.denounced', { faction: civName(e.faction), target: civName(e.target) }));
      if (e.type === 'dealAccepted' && e.target === human) toast(tt('game.dealAccepted', { faction: civName(e.faction) }));
      if (e.type === 'dealRefused' && e.target === human) toast(tt('game.dealRefused', { faction: civName(e.faction) }));
      if (e.type === 'dealLapsed' && e.faction === human) toast(tt('game.dealLapsed', { faction: civName(e.target) }));
      if (e.type === 'factionMet' && e.faction === human) toast(tt('game.factionMet', { faction: civName(e.other) }));
      if (e.type === 'treatyEnded' && (e.faction === human || e.other === human)) toast(tt('game.treatyEnded', { faction: civName(e.faction === human ? e.other : e.faction) }));
      if (e.type === 'dealProposed' && e.target === human) toast(tt('game.attention.offer', { faction: civName(e.faction) }));
      if (e.type === 'pantheonChosen' && (e.faction === human || v.opinions?.[e.faction])) toast(tt('game.pantheonChosen', { faction: civName(e.faction), belief: ruleset.text[ruleset.beliefs?.[e.belief]?.nameKey] ?? '' }));
      if (e.type === 'religionFounded') toast(tt('game.religionFounded', { faction: civName(e.faction), religion: e.name || religionName(ruleset, v, e.religion) }));
      if (e.type === 'cityConverted' && e.faction === human && e.religion) toast(tt('game.cityConverted', { city: e.name, religion: religionName(ruleset, v, e.religion) }));
      if (e.type === 'religionSpread' && e.faction === human) toast(tt('game.religionSpread', { n: e.converted, city: e.name }));
      if (e.type === 'tradeRouteStarted' && e.faction === human) toast(tt('game.routeStarted', { from: cityNameOf(e.origin), to: cityNameOf(e.dest) }));
      if (e.type === 'tradeRouteStarted' && e.faction !== human && e.destFaction === human) toast(tt('game.routeToYou', { faction: civName(e.faction), to: cityNameOf(e.dest) }));
      if (e.type === 'tradeRouteEnded' && e.faction === human) toast(tt('game.routeEnded', { from: cityNameOf(e.origin), to: cityNameOf(e.dest) }));
      if (e.type === 'missionEnded' && e.faction === human) toast(tt(`spies.result.${e.outcome}`, { mission: ruleset.text[ruleset.espionage?.[e.mission]?.nameKey] ?? '', city: e.cityName, gold: e.gold ?? 0 }));
      if (e.type === 'missionEnded' && e.target === human && e.outcome === 'captured') toast(tt('spies.caughtTheirs', { faction: civName(e.faction), city: e.cityName }));
      if (e.type === 'missionEnded' && e.target === human && e.outcome === 'identified') toast(tt('spies.identifiedTheirs', { faction: civName(e.faction), city: e.cityName, mission: ruleset.text[ruleset.espionage?.[e.mission]?.nameKey] ?? '' }));
      if (e.type === 'civicLearned' && e.faction === human) toast(tt('game.civicLearned', { item: civicName(e.item) }));
      if (e.type === 'governmentAdopted' && e.faction === human) toast(tt('game.youGovernment', { government: ruleset.text[ruleset.governments?.[e.government]?.nameKey] ?? '' }));
      if (e.type === 'unitKilled' && e.faction === human) toast(tt('battle.lost', { unit: unitName({ type: e.unitType }) }));
      if (e.type === 'cityCaptured' && e.from === human) toast(tt('battle.cityLost', { city: e.name, faction: civName(e.faction) }));
      if (e.type === 'campCleared' && e.faction === human) toast(tt('battle.campCleared', { gold: e.gold }));
      if (e.type === 'unitCaptured' && e.faction === human) toast(tt('battle.civilianCaptured', { unit: unitName({ type: e.unitType }) }));
      if (e.type === 'unitMoved' && (e.faction === human || e.path.some((tile) => v.fog[tile] === VISIBLE))) mapView.animateMove(e.unit, e.path);
      if (e.type === 'wonderBuilt') {
        const known = e.faction === human || v.cities.some((c) => c.id === e.city);
        toast(tt('game.wonderBuilt', { faction: known ? civName(e.faction) : '?', wonder: ruleset.text[ruleset.wonders[e.wonder]?.nameKey] ?? e.wonder, city: known ? e.cityName : '?' }));
      }
      if (e.faction !== human) continue;
      const city = v.cities.find((c) => c.id === e.city);
      if (e.type === 'wonderLost') toast(tt('game.wonderLost', { wonder: ruleset.text[ruleset.wonders[e.wonder]?.nameKey] ?? e.wonder, gold: Math.round(e.gold) }));
      if (e.type === 'goldWarning') toast(tt('game.goldWarning', { n: e.turns }));
      if (e.type === 'unitDisbanded' && e.reason === 'bankrupt') toast(tt('game.bankrupt', { unit: unitName({ type: e.unitType }) }));
      if (e.type === 'improvementBuilt') toast(tt('game.improvementBuilt', { name: ruleset.text[ruleset.improvements[e.improvement]?.nameKey] ?? e.improvement, n: Math.max(0, e.charges) }));
      if (e.type === 'cityFounded') toast(tt('game.cityFounded', { city: e.name }));
      if (e.type === 'projectCompleted') toast(tt('game.projectCompleted', { faction: civName(e.faction), project: ruleset.text[ruleset.wonders[e.project]?.nameKey] ?? e.project, n: (state.projects?.[e.faction] ?? []).length }));
      if (e.type === 'factionEliminated') toast(tt(e.faction === human ? 'game.youEliminated' : 'game.eliminated', { faction: civName(e.faction) }));
      if (e.type === 'unitBuilt' && !e.bought) toast(tt('game.unitBuilt', { city: city?.name ?? '', unit: itemName({ kind: 'unit', id: e.unitType }) }));
    }
  }

  function run(cmd) {
    if (busy) return null;
    const r = exec(cmd);
    if (!r.ok) {
      toast(refusal(r.error));
      return null;
    }
    refresh();
    showEvents(r.events);
    checkEnd();
    return r;
  }

  const humanAlive = () => state.factions.find((f) => f.id === human)?.alive !== false;
  const gameOver = () => Boolean(state.winner) || !humanAlive();

  /** Everything a save needs right now. */
  function snapshot() {
    return { state, log, journal: journals };
  }
  function saveLabel() {
    const civ = v.factions.find((f) => f.id === human)?.civ;
    const size = ruleset.text[ruleset.mapSizes?.[setup.map?.size]?.nameKey] ?? setup.map?.size ?? '';
    const type = ruleset.text[ruleset.mapTypes?.[setup.map?.type]?.nameKey] ?? setup.map?.type ?? '';
    return tt('save.label', { faction: ruleset.text[ruleset.factions?.[civ]?.nameKey] ?? '', turn: state.turn, size, type });
  }
  function autosaveNow() {
    const every = setup.autosave ?? 'every';
    if (every === 'off' || !hooks.autosave || gameOver()) return;
    if (every === 'five' && state.turn % 5 !== 0) return;
    hooks.autosave(snapshot(), saveLabel());
  }

  let endShown = false;
  function checkEnd() {
    if (!gameOver() || endShown) return;
    endShown = true;
    showEnd();
  }

  /** Let every computer seat play until it is your turn again: in the worker if there is one. */
  async function playComputerSeats() {
    if (state.winner || currentFactionId(state) === human) return [];
    busy = true;
    renderBusy();
    let r = null;
    if (worker) r = await workerPlay(state);
    if (!r) r = seats.play(state, { stopAt: human });
    state = r.state;
    log.push(...r.commands);
    journals = r.journals ?? seats.journals();
    busy = false;
    return r.events;
  }

  /** While the rivals move, the advice line says so and the Next button waits. */
  function renderBusy() {
    const next = $('[data-action="next"]');
    next.disabled = busy;
    if (busy) {
      next.textContent = tt('game.rivalsMoving');
      $('[data-field="advice"]').replaceChildren(el(doc, 'span', { class: 'busy' }, tt('game.rivalsMoving')));
    }
  }

  /** End your turn, let the computer seats play, and come back at your next turn. */
  async function endTurn() {
    if (busy || currentFactionId(state) !== human || gameOver()) return;
    const all = [];
    const r = exec({ type: 'endTurn', faction: human });
    if (!r.ok) { toast(refusal(r.error)); return; }
    all.push(...r.events);
    refresh();
    all.push(...(await playComputerSeats()));
    $('[data-action="next"]').disabled = false;
    refresh();
    showEvents(all);
    autosaveNow();
    checkEnd();
    if (gameOver()) return;
    if (noProduction().length) openCityDrawer(noProduction()[0].id, { centre: true });
    else selectNextIdle();
  }

  /** The Next button: whatever still blocks the turn, else end it (section 10.1). */
  function next() {
    if (v.pendingCapture) showCaptureDialog();
    else if (v.pendingEvent) showEventDialog();
    else if (noProduction().length) openCityDrawer(noProduction()[0].id, { centre: true });
    else if (idle().length) selectNextIdle();
    else endTurn();
  }

  function act(type) {
    const u = selectedUnit();
    if (!u) return;
    if (type === 'disband' && !confirmDisband) {
      confirmDisband = true;
      render();
      return;
    }
    const name = unitName(u);
    const cmd = { type, faction: human, unit: u.id };
    const r = run(cmd);
    if (!r) return;
    if (type === 'disband') toast(tt('game.disbanded', { unit: name }));
    if (type === 'foundCity') {
      const founded = r.events.find((e) => e.type === 'cityFounded');
      openCityDrawer(founded.city);
      return;
    }
    if (['fortify', 'skip', 'sleep', 'disband'].includes(type)) selectNextIdle();
    else render();
  }

  function cityCmd(cmd) {
    const c = theCity();
    if (!c) return null;
    const r = run({ ...cmd, faction: human, city: c.id });
    mapView.setCityOverlay(openCity, cityOverlay());
    render();
    return r;
  }

  function moveTo(target) {
    const u = selectedUnit();
    if (!u) return;
    const r = run({ type: 'moveUnit', faction: human, unit: u.id, to: target });
    mapView.setPath(null, null);
    pendingTarget = null;
    if (!r) return;
    const after = selectedUnit();
    if (!after || after.moves <= 0 || after.goto !== null) setTimeout(selectNextIdle, 0);
    else render();
  }

  function onCityTap(tile) {
    const c = theCity();
    const world = knownWorld(v);
    if (c.worked.includes(tile) || c.locks.includes(tile)) {
      cityCmd(c.locks.includes(tile) ? { type: 'unlockTile', tile } : { type: 'lockTile', tile });
      return true;
    }
    if (v.map.owner[tile] === c.id && tile !== c.tile) {
      cityCmd({ type: 'lockTile', tile });
      return true;
    }
    if (claimable(world, ruleset, c).includes(tile)) {
      if (pendingBuy === tile) {
        pendingBuy = null;
        cityCmd({ type: 'buyTile', tile });
      } else {
        pendingBuy = tile;
        toast(tt('city.buyTile', { price: tilePrice(world, ruleset, c, tile) }));
        mapView.setCityOverlay(openCity, cityOverlay());
      }
      return true;
    }
    return false;
  }

  /** A visible enemy unit or enemy city on a hex. */
  function enemyAt(tile) {
    if (tile < 0 || v.fog[tile] !== VISIBLE) return null;
    const city = v.cities.find((c) => c.tile === tile && c.faction !== human);
    const unit = v.units.find((x) => x.tile === tile && x.faction !== human);
    return city || unit ? { city, unit } : null;
  }

  function aimAt(tile) {
    const u = selectedUnit();
    const world = knownWorld(v);
    if (!u || combatKind(ruleset, u) === 'none' || !enemyAt(tile)) { aim = null; mapView.setTarget(null); return; }
    const there = v.units.find((x) => x.tile === tile && x.faction !== human) ?? v.cities.find((c) => c.tile === tile && c.faction !== human);
    if (there && there.faction !== 'raiders' && !atWar(world, human, there.faction)) {
      aim = { tile, spec: null, odds: null, peaceWith: there.faction };
      mapView.setTarget(tile);
      render();
      return;
    }
    const hasDefender = defenderAt(world, ruleset, human, tile) || v.cities.some((c) => c.tile === tile && atWar(world, human, c.faction));
    const spec = hasDefender ? buildSpec(world, ruleset, u, tile) : null;
    aim = { tile, spec, odds: spec ? estimateOdds(spec) : null };
    mapView.setTarget(tile);
    mapView.setPath(null, null);
    render();
  }

  /** Attack if possible; otherwise walk to the nearest hex it can attack from. */
  function attackAt(tile) {
    const u = selectedUnit();
    if (!u) return;
    const world = knownWorld(v);
    const seen = (i) => v.fog[i] === VISIBLE;
    const why = attackProblem(world, ruleset, u, tile, seen);
    if (!why) {
      const r = run({ type: 'attack', faction: human, unit: u.id, target: tile });
      aim = null;
      mapView.setTarget(null);
      if (r) setTimeout(selectNextIdle, 0);
      return;
    }
    if (why === 'atPeace') { aimAt(tile); return; }
    if (why === 'notAdjacent' || why === 'outOfRange') {
      const reach = combatKind(ruleset, u) === 'ranged' ? rangeOf(ruleset, u) : 1;
      let best = null;
      for (let i = 0; i < v.fog.length; i += 1) {
        if (v.fog[i] === UNEXPLORED || hexDist(i, tile) > reach || i === tile) continue;
        const p = plan(u, i);
        if (p && (!best || p.arrivesOnTurn < best.p.arrivesOnTurn || (p.arrivesOnTurn === best.p.arrivesOnTurn && p.tiles.length < best.p.tiles.length))) best = { i, p };
      }
      if (best) { moveTo(best.i); return; }
    }
    toast(refusal({ code: why, message: why }));
  }

  function hexDist(a, b) {
    const w = v.map.width;
    const ra = Math.floor(a / w); const rb = Math.floor(b / w);
    const qa = a - ra * w - Math.floor(ra / 2); const qb = b - rb * w - Math.floor(rb / 2);
    const dq = qa - qb; const dr = ra - rb;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  function onTap(sx, sy, pointerType) {
    lastTouch = pointerType === 'touch' || pointerType === 'pen';
    const tile = mapView.tileAt(sx, sy);
    if (tile < 0) return;
    if (shootingCity) {
      const c = shootingCity;
      shootingCity = null;
      mapView.setTarget(null);
      run({ type: 'cityAttack', faction: human, city: c, target: tile });
      return;
    }
    if (selectedUnit() && combatKind(ruleset, selectedUnit()) !== 'none' && enemyAt(tile)) {
      // Mouse: a click attacks (the odds showed on pointing). Touch: the first tap shows the odds.
      if (lastTouch && aim?.tile !== tile) { aimAt(tile); toast(tt('odds.confirm')); return; }
      attackAt(tile);
      return;
    }
    const city = myCities().find((c) => c.tile === tile);
    const mine = myUnits().filter((u) => u.tile === tile);
    const u = selectedUnit();

    if (theCity()) {
      if (tile === theCity().tile) { select(null); return; }
      if (!mine.length && onCityTap(tile)) return;
    }
    if (city && !u && !mine.length) { openCityDrawer(city.id); return; }
    if (mine.length) {
      const slot = (x) => (isCivilian(x) ? 'civilian' : 'combat');
      const canShare = u && u.tile !== tile && mine.every((m) => slot(m) !== slot(u));
      if (!canShare) {
        // Tapping your units selects them; tapping again cycles through them, then opens the city if there is one.
        const k = u && u.tile === tile ? mine.findIndex((m) => m.id === u.id) : -1;
        if (city && k === mine.length - 1) { openCityDrawer(city.id); return; }
        select(mine[(k + 1) % mine.length].id);
        return;
      }
    }
    if (city && !u) { openCityDrawer(city.id); return; }
    if (!u) { if (theCity()) select(null); return; }
    if (lastTouch && pendingTarget !== tile) {
      pendingTarget = tile;
      mapView.setHover(tile);
      mapView.setPath(u.tile, plan(u, tile));
      render();
      return;
    }
    moveTo(tile);
  }

  function onHover(sx, sy) {
    const u = selectedUnit();
    if (sx === null || !u) { mapView.setHover(null); if (!pendingTarget) mapView.setPath(null, null); return; }
    const tile = mapView.tileAt(sx, sy);
    if (combatKind(ruleset, u) !== 'none' && enemyAt(tile)) {
      if (aim?.tile !== tile) aimAt(tile);
      return;
    }
    if (aim) { aim = null; mapView.setTarget(null); render(); }
    mapView.setHover(tile >= 0 ? tile : null);
    mapView.setPath(u.tile, tile >= 0 && tile !== u.tile ? plan(u, tile) : null);
  }

  attachMapInput(mapView, {
    onTap,
    onHover,
    onContext: (sx, sy) => { const tile = mapView.tileAt(sx, sy); if (tile >= 0 && selectedUnit()) moveTo(tile); },
    keyPan: (e) => !(e.key.toLowerCase() === 's' && selectedUnit()),
    keyTarget: root,
  });

  // ---- Rendering the panels ----

  function renderBar() {
    $('[data-field="turn"]').textContent = tt('game.turn', { n: state.turn });
    const total = { gold: 0, science: 0, culture: 0, faith: 0 };
    for (const c of myCities()) {
      const y = yieldsOf(c).total;
      for (const k of Object.keys(total)) total[k] += y[k];
    }
    const s = v.stocks ?? { gold: 0, faith: 0 };
    const me = v.factions.find((f) => f.id === human);
    const chip = $('[data-action="faction"]');
    chip.textContent = tt('game.factionCard', { faction: civName(human) });
    chip.style.setProperty('--faction', ruleset.factions?.[me?.civ]?.colours.primary ?? '#888');
    $('[data-field="yields"]').replaceChildren(
      el(doc, 'span', { class: `y gold${netGold() < 0 ? ' falling' : ''}` }, tt('game.bar.gold', { stock: fmt(s.gold), rate: signed(netGold()) })),
      el(doc, 'span', { class: 'y era' }, tt('game.era', { era: ruleset.text[ruleset.eras?.[eraOf(knownWorld(v), ruleset, human)]?.nameKey] ?? '' })),
      el(doc, 'button', { type: 'button', class: 'y science link-like', dataset: { action: 'trees' }, onclick: openTrees },
        v.research?.current ? tt('game.bar.science', { rate: signed(total.science), item: techName(v.research.current) }) : tt('game.bar.noResearch', { rate: signed(total.science) })),
      ruleset.civics ? el(doc, 'button', { type: 'button', class: 'y culture link-like', dataset: { action: 'civics' }, onclick: () => openTrees('civics') },
        v.civicResearch?.current ? tt('game.bar.civic', { rate: signed(total.culture), item: civicName(v.civicResearch.current) }) : tt('game.bar.noCivic', { rate: signed(total.culture) }))
        : el(doc, 'span', { class: 'y culture' }, tt('game.bar.culture', { rate: signed(total.culture) })),
      ruleset.beliefs ? el(doc, 'button', { type: 'button', class: 'y faith link-like', dataset: { action: 'religion' }, onclick: () => openEmpire('religion') }, tt('game.bar.faith', { stock: fmt(s.faith), rate: signed(total.faith) }))
        : el(doc, 'span', { class: 'y faith' }, tt('game.bar.faith', { stock: fmt(s.faith), rate: signed(total.faith) })),
      ruleset.beliefs ? el(doc, 'button', { type: 'button', class: `y link-like lens${religionLens ? ' on' : ''}`, dataset: { action: 'lens' }, 'aria-pressed': String(religionLens), onclick: toggleLens }, tt('game.lens')) : null,
    );
  }

  /** Buttons to buy things with faith in this city (missionaries, faithPurchase buildings). */
  function faithBuys(c, world) {
    const items = [{ kind: 'unit', id: 'missionary' }, ...Object.keys(ruleset.buildings ?? {}).map((id) => ({ kind: 'building', id }))];
    return items.map((item) => {
      const price = ruleset.beliefs ? faithPrice(world, ruleset, c, item) : null;
      if (price === null || (item.kind === 'building' && !canBuildHere(world, c, item))) return null;
      const label = item.kind === 'unit' ? ruleset.text[ruleset.units[item.id].nameKey] : ruleset.text[ruleset.buildings[item.id].nameKey];
      return el(doc, 'button', { type: 'button', class: 'btn small', dataset: { faithBuy: item.id }, disabled: (v.stocks?.faith ?? 0) < price,
        onclick: () => cityCmd({ type: 'buyWithFaith', item }) }, tt('city.buyFaith', { item: label, price }));
    }).filter(Boolean);
  }
  const canBuildHere = (world, c, item) => buildOptions(world, ruleset, c).some((o) => o.kind === item.kind && o.id === item.id);
  const world0 = () => knownWorld(v);

  // The religion lens: pips under each city in the colours of its followers.
  let religionLens = false;
  function lensData() {
    if (!religionLens) return null;
    const out = {};
    for (const c of v.cities) {
      out[c.id] = Object.entries(c.followers ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([id, n]) => ({ colour: ruleset.religions?.[id]?.colour ?? '#888', n }));
    }
    return out;
  }
  function toggleLens() {
    religionLens = !religionLens;
    mapView.setReligionLens(lensData());
    render();
  }

  /** The civic the AI's planner would pick in your place. */
  function civicSuggestion() {
    return ruleset.civics ? rankCivics(knownWorld(v), v, ruleset, { path: 'score' })[0]?.cmd.item ?? null : null;
  }
  /** A government you could adopt and have not (only when you have none yet). */
  function readyGovernment() {
    if (!ruleset.governments || v.government?.id || v.government?.anarchy || v.pendingGovernment) return null;
    return Object.values(ruleset.governments).find((g) => governmentAvailable(knownWorld(v), ruleset, human, g.id))?.id ?? null;
  }
  /** Is a policy slot of your working government empty while a card could fill it? */
  function emptySlot() {
    const world = knownWorld(v);
    const work = workingGovernment(world, human);
    if (!work.id) return false;
    const slots = slotsOf(world, ruleset, human, work.id);
    const inUse = new Set(Object.values(work.policies).flat().filter(Boolean));
    const cards = Object.values(ruleset.policies ?? {}).filter((p) => !inUse.has(p.id) && policyAvailable(world, ruleset, human, p.id));
    return Object.entries(slots).some(([kind, n]) => (work.policies[kind] ?? []).filter(Boolean).length < n && cards.some((p) => kind === 'wildcard' || p.slot === kind));
  }

  /** The tech the AI's own science planner would pick in your place. */
  function suggestion() {
    return rankTechs(knownWorld(v), v, ruleset, { path: 'score' })[0]?.cmd.item ?? null;
  }

  /** The advice line: the highest-priority piece of advice whose condition holds (rules/<mod>/ui/advice.json). */
  function currentAdvice() {
    const checks = {
      eventPending: () => v.pendingEvent && { city: v.cities.find((c) => c.id === v.pendingEvent.city)?.name ?? '' },
      noCities: () => myCities().length === 0 && myUnits().some(isFounder) && {},
      cityStarving: () => starving().length && { city: starving()[0].name, target: starving()[0].id },
      cityNoProduction: () => noProduction().length && { city: noProduction()[0].name, target: noProduction()[0].id },
      noResearch: () => ruleset.techs && !v.research?.current && !(v.research?.queue ?? []).length && suggestion() && { tech: techName(suggestion()) },
      noCivic: () => ruleset.civics && !v.civicResearch?.current && !(v.civicResearch?.queue ?? []).length && civicSuggestion() && { civic: civicName(civicSuggestion()) },
      governmentReady: () => readyGovernment() && { government: ruleset.text[ruleset.governments[readyGovernment()].nameKey] },
      emptyPolicySlot: () => emptySlot() && {},
      pantheonReady: () => ruleset.beliefs && !pantheonOf(knownWorld(v), human) && (v.stocks?.faith ?? 0) >= pantheonFaith(knownWorld(v), ruleset) && {},
      religionReady: () => {
        const w = knownWorld(v);
        return ruleset.beliefs && pantheonOf(w, human) && !foundedBy(w, human) && (v.stocks?.faith ?? 0) >= foundFaith(w, ruleset)
          && holyCityOptions(w, ruleset, human).length && Object.keys(v.religion?.religions ?? {}).length < religionLimit(w, ruleset) && {};
      },
      goldRunningOut: () => goldTurnsLeft() <= (ruleset.tuning?.economy?.bankruptcyWarningTurns ?? 2) && { n: goldTurnsLeft() },
      unitsNeedOrders: () => idle().length && { n: idle().length },
      cityCanBuyTile: () => false,
      readyToEnd: () => ({}),
    };
    const list = Object.values(ruleset.advice ?? {}).sort((a, b) => b.priority - a.priority);
    for (const a of list) {
      const args = checks[a.condition]?.();
      if (args) return { ...a, args };
    }
    return null;
  }

  function doAdvice(a) {
    if (a.action === 'selectSettler') { const s = myUnits().find(isFounder); if (s) select(s.id, { centre: true }); }
    else if (a.action === 'openCity') openCityDrawer(a.args.target, { centre: true });
    else if (a.action === 'selectUnit') selectNextIdle();
    else if (a.action === 'endTurn') endTurn();
    else if (a.action === 'research') run({ type: 'setResearch', faction: human, item: suggestion() });
    else if (a.action === 'civic') run({ type: 'setResearch', faction: human, item: civicSuggestion(), tree: 'civics' });
    else if (a.action === 'empire') openEmpire('government');
    else if (a.action === 'religion') openEmpire('religion');
    else if (a.action === 'event') showEventDialog();
  }

  function renderAdvice() {
    const a = currentAdvice();
    const line = $('[data-field="advice"]');
    if (!a) { fill(line, ); return; }
    fill(line, 
      el(doc, 'span', { class: 'advice-text' }, tt(a.textKey, a.args)),
      el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'advice' }, onclick: () => doAdvice(a) }, tt(a.actionKey ?? 'advice.do')),
    );
  }

  function renderAttention() {
    const items = [
      ...noProduction().map((c) => ({ key: `p${c.id}`, label: tt('game.attention.production', { city: c.name }), go: () => openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...starving().map((c) => ({ key: `s${c.id}`, label: tt('game.attention.starving', { city: c.name }), go: () => openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...myUnits().filter((u) => promotionsAvailable(ruleset, u) > 0 && combatKind(ruleset, u) !== 'none').map((u) => ({ key: `pr${u.id}`, label: tt('game.attention.promote', { unit: unitName(u) }), go: () => select(u.id, { centre: true }) })),
      ...(v.diplomacy?.deals ?? []).filter((d) => d.to === human).map((d) => ({ key: `deal${d.id}`, label: tt('game.attention.offer', { faction: civName(d.from) }), go: () => openDiplomacy(d.from), urgent: true })),
      ...idle().map((u) => ({ key: u.id, label: tt('game.attention.idle', { unit: unitName(u) }), go: () => select(u.id, { centre: true }), unit: u.id })),
    ];
    $('[data-field="attention-title"]').textContent = tt('game.attention', { n: items.length });
    const lis = items.map((it) => el(doc, 'li', {},
      el(doc, 'button', { type: 'button', class: `attention-item${it.urgent ? ' urgent' : ''}`, dataset: it.unit ? { unit: it.unit } : {}, onclick: it.go }, it.label)));
    $('[data-field="attention"]').replaceChildren(...(lis.length ? lis : [el(doc, 'li', { class: 'none' }, tt('game.attention.none'))]));
  }

  function oddsPanel() {
    if (!aim) return null;
    const target = aim.spec?.defender.city ? tt('odds.city', { name: aim.spec.defender.city.name })
      : (() => { const e = v.units.find((x) => x.tile === aim.tile && x.faction !== human); return e ? nameOfUnit(e.type, e.faction) : ''; })();
    if (aim.peaceWith) {
      return el(doc, 'div', { class: 'odds', dataset: { field: 'odds' } }, el(doc, 'h3', {}, tt('odds.title', { target })),
        el(doc, 'p', {}, tt('game.refused.atPeace')),
        el(doc, 'button', { type: 'button', class: 'btn small wide danger', dataset: { action: 'declare-war' },
          onclick: () => { run({ type: 'declareWar', faction: human, target: aim.peaceWith }); aimAt(aim.tile); } }, tt('game.declareWar', { faction: civName(aim.peaceWith) })));
    }
    if (!aim.odds) return el(doc, 'div', { class: 'odds', dataset: { field: 'odds' } }, el(doc, 'h3', {}, tt('odds.title', { target })));
    const o = aim.odds;
    const modText = (side) => {
      const list = aim.spec.modifiers[side].map((m) => `${m.amount > 0 ? '+' : ''}${m.amount} ${tt(`odds.mod.${m.source.split(':')[0]}`)}`).join(', ');
      return list ? el(doc, 'p', { class: 'muted small' }, tt('odds.mods', { side: tt(`odds.${side}`), list })) : null;
    };
    return el(doc, 'div', { class: `odds${o.win > 0.5 ? ' good' : o.lose > 0.3 ? ' bad' : ''}`, dataset: { field: 'odds' } },
      el(doc, 'h3', {}, tt('odds.title', { target })),
      el(doc, 'p', { class: 'win' }, tt('odds.win', { p: Math.round(o.win * 100) })),
      o.ranged ? null : el(doc, 'p', {}, tt('odds.youLose', { hp: Math.round(o.attackerLoss) })),
      el(doc, 'p', {}, tt('odds.theyLose', { hp: Math.round(o.defenderLoss) })),
      el(doc, 'p', { class: 'muted small' }, tt('odds.strength', { a: o.attack, d: o.defence })),
      modText('attacker'), modText('defender'));
  }

  function promotionPanel(u) {
    const options = promotionOptions(ruleset, u);
    if (!options.length) return null;
    return el(doc, 'div', { class: 'promote', dataset: { field: 'promote' } },
      el(doc, 'h3', {}, tt('promote.title')),
      ...options.map((id) => {
        const p = ruleset.promotions[id];
        return el(doc, 'button', { type: 'button', class: 'btn small wide', dataset: { promotion: id },
          onclick: () => { run({ type: 'promote', faction: human, unit: u.id, promotion: id }); render(); } },
        tt('promote.pick', { name: ruleset.text[p.nameKey] ?? id, text: ruleset.text[p.descriptionKey] ?? '' }));
      }));
  }

  function showCaptureDialog() {
    const p = v.pendingCapture;
    if (!p) return;
    const c = v.cities.find((x) => x.id === p.city);
    const overlay = doc.querySelector('[data-field="overlay"]');
    const body = overlay.querySelector('[data-field="overlay-body"]');
    fill(body, 
      el(doc, 'h2', {}, tt('capture.title', { city: c.name })),
      el(doc, 'p', {}, tt('capture.text')),
      el(doc, 'div', { class: 'capture-choices' },
        el(doc, 'button', { type: 'button', class: 'btn primary', dataset: { capture: 'keep' }, onclick: () => { overlay.hidden = true; run({ type: 'captureChoice', faction: human, city: c.id, choice: 'keep' }); toast(tt('battle.captured', { city: c.name })); } }, tt('capture.keep', { city: c.name })),
        el(doc, 'button', { type: 'button', class: 'btn', dataset: { capture: 'raze' }, disabled: Boolean(c.originalCapital), onclick: () => { overlay.hidden = true; run({ type: 'captureChoice', faction: human, city: c.id, choice: 'raze' }); } }, tt('capture.raze', { city: c.name }))),
      c.originalCapital ? el(doc, 'p', { class: 'muted small' }, tt('capture.noRaze')) : null,
    );
    overlay.querySelector('[data-action="close-overlay"]').hidden = true;
    overlay.hidden = false;
    body.querySelector('[data-capture="keep"]').focus();
  }

  /** An event waits for an answer (phase 16): its text and one button per choice. */
  function showEventDialog() {
    const p = v.pendingEvent;
    const ev = p && ruleset.events?.[p.event];
    if (!ev) return;
    const c = v.cities.find((x) => x.id === p.city);
    const cityName = c?.name ?? '';
    const say = (key) => (ruleset.text[key] ?? key).replaceAll('{city}', cityName);
    const overlay = doc.querySelector('[data-field="overlay"]');
    const body = overlay.querySelector('[data-field="overlay-body"]');
    fill(body,
      el(doc, 'h2', { dataset: { field: 'event-title' } }, say(ev.nameKey)),
      el(doc, 'p', { class: 'small muted' }, tt('event.inCity', { city: cityName })),
      el(doc, 'p', {}, say(ev.textKey)),
      el(doc, 'p', { class: 'small muted' }, tt('event.choose')),
      el(doc, 'div', { class: 'event-choices' }, ...ev.choices.map((ch, i) => el(doc, 'button', { type: 'button', class: `btn wide${i === 0 ? ' primary' : ''}`, dataset: { eventChoice: String(i) },
        onclick: () => { overlay.hidden = true; run({ type: 'chooseEvent', faction: human, event: p.id, choice: i }); toast(tt('event.chosen', { event: say(ev.nameKey) })); render(); } }, say(ch.textKey)))));
    overlay.querySelector('[data-action="close-overlay"]').hidden = true;
    overlay.hidden = false;
    body.querySelector('[data-event-choice="0"]')?.focus();
  }

  function renderUnitCard(u) {
    const card = $('[data-field="unit-card"]');
    const actions = $('[data-field="actions"]');
    const def = ruleset.units[u.type];
    const turnsLeft = u.goto !== null ? (plan(u, u.goto)?.arrivesOnTurn ?? 0) + 1 : 0;
    const status = u.goto !== null ? tt('game.unit.status.goto', { turns: turnsLeft }) : tt(`game.unit.status.${u.activity}`, { turns: u.fortifiedTurns });
    const thresholds = ruleset.tuning?.experience?.promotionThresholds ?? [15, 45, 90, 150];
    const nextAt = thresholds.find((x) => x > (u.xp ?? 0));
    fill(card, 
      el(doc, 'h2', {}, unitName(u)),
      el(doc, 'p', { class: 'muted' }, isCivilian(u) ? tt('game.unit.civilian') : `${ruleset.text[ruleset.unitClasses[def.class]?.nameKey] ?? def.class} · ${def.strength}`),
      el(doc, 'p', { dataset: { field: 'moves' } }, tt('game.unit.moves', { left: u.moves, max: def.moves })),
      el(doc, 'p', {}, tt('game.unit.health', { hp: u.hp })),
      el(doc, 'p', { class: 'status' }, status),
      combatKind(ruleset, u) === 'none' ? null : el(doc, 'p', { class: 'muted small' }, tt('game.unit.xp', { xp: u.xp ?? 0, next: nextAt ?? '-' })),
      (u.promotions ?? []).length ? el(doc, 'p', { class: 'muted small' }, tt('game.unit.promotions', { list: u.promotions.map((p) => ruleset.text[ruleset.promotions[p]?.nameKey] ?? p).join(', ') })) : null,
      promotionPanel(u),
      oddsPanel(),
    );
    const button = (type, label, disabled = false, extra = '') => el(doc, 'button', { type: 'button', class: `btn small${extra}${type === 'disband' && confirmDisband ? ' danger' : ''}`, dataset: { act: type }, disabled, onclick: () => act(type) }, label);
    const foundable = isFounder(u) && u.moves > 0 && !foundingProblem(knownWorld(v), ruleset, human, u.tile);
    // Builders: one button per improvement that fits a hex they can reach now.
    const improve = [];
    if ((def.tags ?? []).includes('worker')) {
      card.append(el(doc, 'p', { dataset: { field: 'charges' } }, tt('game.unit.charges', { n: u.charges ?? 0 })));
      const world = knownWorld(v);
      for (const [id, imp] of Object.entries(ruleset.improvements ?? {})) {
        for (const tile of builderTargets(world, ruleset, id, u.tile)) {
          if (improvementProblem(world, ruleset, human, id, tile)) continue;
          const label = tt('game.action.improve', { name: ruleset.text[imp.nameKey] ?? id });
          improve.push(el(doc, 'button', { type: 'button', class: 'btn small wide', dataset: { improve: id }, title: ruleset.text[imp.descriptionKey] ?? '', disabled: u.moves <= 0,
            onclick: () => { const r = run({ type: 'buildImprovement', faction: human, unit: u.id, improvement: id, tile }); if (r) selectNextIdle(); } }, label));
          break;
        }
      }
    }
    const preach = ruleset.units[u.type]?.faithOnly && u.religion ? preachTarget(world0(), u) : null;
    const isTrader = (ruleset.units[u.type]?.tags ?? []).includes('trader');
    if ((ruleset.units[u.type]?.tags ?? []).includes('spy')) improve.push(el(doc, 'button', { type: 'button', class: 'btn small primary wide', dataset: { action: 'post-spy' }, onclick: () => openEmpire('spies') }, tt('spies.postFromCard')));
    if (isTrader) improve.push(renderTraderList(doc, { world: world0(), view: v, ruleset, text, unit: u, name: civName,
      onStart: (city) => { const r = run({ type: 'startTradeRoute', faction: human, unit: u.id, city }); if (r) selectNextIdle(); } }));
    fill(actions, ...improve, ...[
      preach ? el(doc, 'button', { type: 'button', class: 'btn small primary wide', dataset: { act: 'spreadReligion' }, disabled: u.moves <= 0,
        onclick: () => { const r = run({ type: 'spreadReligion', faction: human, unit: u.id }); if (r) selectNextIdle(); } }, tt('game.action.preach', { city: preach.name })) : null,
      isFounder(u) ? button('foundCity', tt('game.action.found'), !foundable, ' primary wide') : null,
      isCivilian(u) ? null : button('fortify', tt('game.action.fortify'), u.activity === 'fortify'),
      button('skip', tt('game.action.skip'), u.moves <= 0 || u.activity === 'skip'),
      u.activity === 'sleep' ? button('wake', tt('game.action.wake')) : button('sleep', tt('game.action.sleep')),
      button('disband', confirmDisband ? tt('game.action.confirmDisband') : tt('game.action.disband')),
    ].filter(Boolean));
    $('[data-field="hint"]').textContent = lastTouch ? tt('game.hint.moveTouch') : tt('game.hint.move');
  }

  function mood(a) {
    if (!a) return null;
    const p = a.threshold?.yieldPercent ?? 0;
    const key = p > 0 ? 'city.mood.happy' : p === 0 ? 'city.mood.content' : a.threshold?.rebels ? 'city.mood.revolt' : 'city.mood.unhappy';
    return el(doc, 'p', { class: `mood${p < 0 ? ' bad' : p > 0 ? ' good' : ''}`, dataset: { field: 'amenities' } },
      `${tt('city.amenities', { balance: signed(a.balance), have: a.have + a.luxuries, need: a.need })} · ${tt(key, { p })}`);
  }

  /** Built buildings and wonders, each with what it adds here; adjacency shown in words, not only in a tooltip. */
  function buildingList(c) {
    if (!c.buildings.length) return el(doc, 'p', { class: 'muted small' }, tt('city.noBuildings'));
    const world = knownWorld(v);
    return el(doc, 'ul', { class: 'built', dataset: { field: 'buildings' } }, ...c.buildings.map((b) => {
      const def = buildingDef(ruleset, b);
      const adj = adjacencyBonus(world, ruleset, c, b).filter((a) => a.rule);
      const extra = adj.map((a) => tt('city.adjacency', { n: a.amount, yield: tt(`yield.${a.yield}`), count: a.count })).join(', ');
      const tip = [ruleset.text[def?.descriptionKey], extra].filter(Boolean).join(' ');
      return el(doc, 'li', { title: tip, dataset: { building: b } },
        el(doc, 'span', { class: 'name' }, ruleset.text[def?.nameKey] ?? b),
        extra ? el(doc, 'span', { class: 'adjacency' }, ` (${extra})`) : null);
    }));
  }

  function renderCityDrawer(c) {
    const card = $('[data-field="unit-card"]');
    const actions = $('[data-field="actions"]');
    const y = yieldsOf(c);
    const world = knownWorld(v);
    const need = foodToGrow(c.pop, ruleset.tuning);
    const growIn = y.surplus > 0 ? Math.ceil((need - c.food) / y.surplus) : null;
    const growth = y.surplus < 0 ? tt('city.starving') : growIn ? tt('city.grows', { n: growIn }) : tt('city.growsNever');
    const head = c.queue[0];
    const prod = Math.max(1, y.total.production);
    const price = head ? buyPrice(ruleset, c, world) : null;
    const options = rankOptions(v, ruleset, c, tt);
    const shown = showAllOptions ? options : options.slice(0, 4);
    const borderIn = Math.max(1, Math.ceil((borderCost(c, ruleset.tuning) - c.culture) / Math.max(0.1, y.total.culture)));
    const focuses = Object.values(ruleset.focuses ?? {});

    fill(card, ...[
      el(doc, 'div', { class: 'city-head' },
        el(doc, 'h2', {}, c.name),
        el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-city' }, onclick: () => select(null) }, tt('city.close'))),
      el(doc, 'p', { class: 'muted' }, tt('city.pop', { pop: c.pop })),
      mood(y.amenities),
      el(doc, 'p', { class: 'muted small', dataset: { field: 'city-hp' } }, tt('city.hp', { hp: c.hp ?? cityHpMax(ruleset, c), max: cityHpMax(ruleset, c), strength: cityStrength(world, ruleset, c) })),
      cityHasWalls(ruleset, c) ? el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'shoot' }, disabled: c.shotTurn === v.turn,
        onclick: () => { shootingCity = c.id; toast(tt('city.shootPick', { n: ruleset.tuning?.combat?.cityRange ?? 2 })); } },
      c.shotTurn === v.turn ? tt('city.shot') : tt('city.shoot', { n: ruleset.tuning?.combat?.cityRange ?? 2 })) : null,
      el(doc, 'div', { class: 'city-yields' },
        el(doc, 'span', { class: 'food' }, `${tt('city.food', { rate: signed(y.surplus) })} (${growth})`),
        el(doc, 'span', {}, tt('city.production', { n: fmt(y.total.production) })),
        el(doc, 'span', {}, tt('city.gold', { n: fmt(y.total.gold) })),
        el(doc, 'span', {}, tt('city.science', { n: fmt(y.total.science) })),
        el(doc, 'span', {}, tt('city.culture', { n: fmt(y.total.culture) })),
        el(doc, 'span', {}, tt('city.faith', { n: fmt(y.total.faith) }))),
      el(doc, 'div', { class: 'city-building' },
        el(doc, 'p', { dataset: { field: 'building' } }, head
          ? tt('city.building', { item: itemName(head), n: Math.max(1, Math.ceil((itemCost(ruleset, head, world, c) - c.progress) / prod)) })
          : tt('city.buildingNothing')),
        head && price !== null ? el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'buy' }, disabled: (v.stocks?.gold ?? 0) < price, onclick: () => cityCmd({ type: 'buyItem' }) }, tt('city.buy', { price })) : null,
        ...faithBuys(c, world),
        c.queue.length > 1 ? el(doc, 'p', { class: 'muted' }, tt('city.queue', { items: c.queue.slice(1).map(itemName).join(', ') })) : null),
      el(doc, 'h3', {}, tt('city.choose')),
      el(doc, 'ul', { class: 'choose', dataset: { field: 'options' } }, ...shown.map((o) => el(doc, 'li', {},
        el(doc, 'button', { type: 'button', class: `choose-item${head?.id === o.item.id ? ' current' : ''}`, dataset: { item: o.item.id }, onclick: () => cityCmd({ type: 'setProduction', item: o.item }) },
          el(doc, 'span', { class: 'name' }, itemName(o.item)),
          el(doc, 'span', { class: 'turns' }, tt('city.turns', { n: o.turns })),
          el(doc, 'span', { class: 'reason' }, o.reason)),
        el(doc, 'button', { type: 'button', class: 'queue-add', 'aria-label': tt('city.queueAdd', { item: itemName(o.item) }), title: tt('city.queueAdd', { item: itemName(o.item) }), onclick: () => cityCmd({ type: 'queueProduction', item: o.item }) }, '+')))),
      options.length > 4 ? el(doc, 'button', { type: 'button', class: 'btn small link', onclick: () => { showAllOptions = !showAllOptions; render(); } },
        showAllOptions ? tt('city.showFewer') : tt('city.showAll', { n: options.length })) : null,
      el(doc, 'h3', {}, tt('city.buildings')),
      buildingList(c),
      Object.keys(c.specialists ?? {}).length ? el(doc, 'p', { class: 'muted small', dataset: { field: 'specialists' } },
        tt('city.specialists', { list: Object.entries(c.specialists).map(([k, n]) => `${n} ${tt(`yield.${k}`)}`).join(', ') })) : null,
      el(doc, 'h3', {}, tt('city.focus')),
      el(doc, 'div', { class: 'focus', role: 'group' }, ...focuses.map((f) => el(doc, 'button', {
        type: 'button', class: `btn small${c.focus === f.id ? ' primary' : ''}`, dataset: { focus: f.id }, 'aria-pressed': String(c.focus === f.id),
        onclick: () => cityCmd({ type: 'setFocus', focus: f.id }),
      }, ruleset.text[f.nameKey] ?? f.id))),
      el(doc, 'p', { class: 'muted small' }, tt('city.border', { n: borderIn })),
      el(doc, 'p', { class: 'muted small' }, tt('city.lockHint')),
    ].filter(Boolean));
    fill(actions, );
    $('[data-field="hint"]').textContent = '';
  }

  function render() {
    renderBar();
    renderAdvice();
    renderAttention();
    const c = theCity();
    const u = selectedUnit();
    root.querySelector('.unit-panel').classList.toggle('city-open', Boolean(c));
    if (c) renderCityDrawer(c);
    else if (u) renderUnitCard(u);
    else {
      $('[data-field="unit-card"]').replaceChildren(el(doc, 'p', { class: 'muted' }, tt('game.noUnit')));
      $('[data-field="actions"]').replaceChildren();
      $('[data-field="hint"]').textContent = tt('game.hint.select');
    }
    $('[data-action="next"]').textContent = noProduction().length ? tt('game.nextChooseProduction')
      : idle().length ? tt('game.nextUnit', { n: idle().length }) : tt('game.nextTurn');
  }

  root.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const handled = {
      ' ': () => selectNextIdle(),
      Enter: () => { if (!e.target.closest?.('button')) next(); else return false; },
      b: () => { const u = selectedUnit(); if (u && isFounder(u)) act('foundCity'); else return false; },
      r: () => openTrees('techs'),
      c: () => (ruleset.civics ? openTrees('civics') : false),
      e: () => (ruleset.governments ? openEmpire() : false),
      d: () => (ruleset.diplomacy ? openDiplomacy() : false),
      l: () => (ruleset.beliefs ? toggleLens() : false),
      j: () => openJournal(),
      v: () => openVictory(),
      f: () => act('fortify'),
      s: () => (selectedUnit() ? act('skip') : false),
      z: () => act('sleep'),
      Delete: () => act('disband'),
      Escape: () => { if (!panel.hidden) { panel.hidden = true; return true; } if (selected || openCity) select(null); else return false; },
    }[key];
    if (handled && handled() !== false) e.preventDefault();
  });
  $('[data-action="next"]').onclick = next;
  const panel = doc.querySelector('[data-field="panel"]');
  let lastTree = 'techs';
  function openTrees(tree = lastTree) {
    lastTree = tree === 'civics' && ruleset.civics ? 'civics' : 'techs';
    const rate = myCities().reduce((n, c) => n + yieldsOf(c).total[lastTree === 'civics' ? 'culture' : 'science'], 0);
    const civ = lastTree === 'civics' ? { tree: 'civics' } : {};
    renderTrees(doc, panel.querySelector('[data-field="panel-body"]'), {
      world: knownWorld(v), view: v, ruleset, text, tree: lastTree, rate,
      onResearch: (id) => { run({ type: 'setResearch', faction: human, item: id, ...civ }); openTrees(lastTree); },
      onQueue: (id) => { run({ type: 'queueResearch', faction: human, item: id, ...civ }); openTrees(lastTree); },
      onTab: (t2) => openTrees(t2),
      onClose: () => { panel.hidden = true; },
    });
    panel.hidden = false;
  }
  const dipUi = { selected: null, deal: null };
  function openDiplomacy(select = dipUi.selected) {
    dipUi.selected = select ?? Object.keys(v.opinions ?? {})[0] ?? null;
    const civOf = (id) => v.factions.find((f) => f.id === id)?.civ;
    renderDiplomacy(doc, panel.querySelector('[data-field="panel-body"]'), {
      world: knownWorld(v), view: v, ruleset, text, ui: dipUi, name: civName,
      leaderName: (id) => ruleset.text[ruleset.leaders?.[ruleset.factions?.[civOf(id)]?.leaders?.[0]]?.nameKey] ?? '',
      act: {
        select: (id) => { dipUi.selected = id; dipUi.deal = null; openDiplomacy(id); },
        editDeal: (deal) => { dipUi.deal = deal; openDiplomacy(); },
        propose: (target, give, get) => { if (run({ type: 'proposeDeal', faction: human, target, give, get })) { toast(tt('dip.sent', { faction: civName(target) })); dipUi.deal = null; } openDiplomacy(); },
        answer: (deal, accept) => { run({ type: 'answerDeal', faction: human, deal, accept }); openDiplomacy(); },
        denounce: (target) => { run({ type: 'denounce', faction: human, target }); openDiplomacy(); },
        declareWar: (target) => { run({ type: 'declareWar', faction: human, target }); openDiplomacy(); },
        close: () => { dipUi.deal = null; panel.hidden = true; },
      },
    });
    panel.hidden = false;
  }
  let pickSlot = null;
  let empireTab = 'government';
  let foundForm = {};
  function openEmpire(tab = empireTab) {
    empireTab = tab;
    const world = knownWorld(v);
    renderEmpire(doc, panel.querySelector('[data-field="panel-body"]'), {
      world, view: v, ruleset, text, pick: pickSlot, tab,
      onTab: (t2) => { pickSlot = null; openEmpire(t2); },
      tradeTab: ruleset.trade ? () => renderTradeTab(doc, { world, view: v, ruleset, text, name: civName }) : null,
      spiesTab: ruleset.espionage ? () => renderSpiesTab(doc, {
        world, view: v, ruleset, text, name: civName,
        act: {
          assignUnit: (unit, city) => { run({ type: 'assignSpy', faction: human, unit, city }); openEmpire('spies'); },
          move: (spy, city) => { run({ type: 'assignSpy', faction: human, spy, city }); openEmpire('spies'); },
          mission: (spy, mission) => { run({ type: 'startMission', faction: human, spy, mission }); openEmpire('spies'); },
        },
      }) : null,
      religionTab: ruleset.beliefs ? () => renderReligionTab(doc, {
        world, view: v, ruleset, text, name: civName, form: foundForm,
        act: {
          pantheon: (belief) => { run({ type: 'choosePantheon', faction: human, belief }); openEmpire('religion'); },
          form: (f) => { foundForm = f; openEmpire('religion'); },
          found: (f) => { if (run({ type: 'foundReligion', faction: human, ...f })) foundForm = {}; openEmpire('religion'); },
        },
      }) : null,
      onGovernment: (id) => { pickSlot = null; run({ type: 'setGovernment', faction: human, government: id }); openEmpire(); },
      onPolicy: (kind, index, policy) => { pickSlot = null; run({ type: 'setPolicy', faction: human, slot: kind, index, policy }); openEmpire(); },
      onPick: (slot) => { pickSlot = slot; openEmpire(); },
      onClose: () => { pickSlot = null; panel.hidden = true; },
    });
    panel.hidden = false;
  }
  function openJournal() {
    renderJournal(doc, panel.querySelector('[data-field="panel-body"]'), {
      ais: Object.fromEntries(Object.entries(journals).map(([id, journal]) => [id, { memory: { journal } }])), factions: v.factions, ruleset, text, factionName: (id) => (id === 'raiders' ? raidersName() : civName(id)), onClose: () => { panel.hidden = true; },
    });
    panel.hidden = false;
  }
  $('[data-action="journal"]').onclick = openJournal;
  $('[data-action="empire"]').onclick = () => openEmpire('government');
  $('[data-action="diplomacy"]').onclick = () => openDiplomacy();
  const nameOf = (id) => (id === human ? tt('victory.you', { faction: civName(id) }) : civName(id));
  function openVictory() {
    renderVictory(doc, panel.querySelector('[data-field="panel-body"]'), { state, ruleset, text, human, name: nameOf, colours, onClose: () => { panel.hidden = true; } });
    panel.hidden = false;
  }
  $('[data-action="victory"]').onclick = openVictory;
  async function exportInto(out) {
    if (!hooks.exportCode) return;
    out.replaceChildren(el(doc, 'p', { class: 'small muted' }, tt('menu.working')));
    const code = await hooks.exportCode(snapshot(), saveLabel());
    out.replaceChildren(codeBox(doc, text, code, `atlas-turn-${state.turn}.txt`));
  }
  function openMenu() {
    renderGameMenu(doc, panel.querySelector('[data-field="panel-body"]'), {
      text, label: saveLabel(),
      onSave: async (label, out) => {
        out.replaceChildren(el(doc, 'p', { class: 'small muted' }, tt('menu.working')));
        const r = await hooks.saveSlot?.(snapshot(), label);
        if (r?.ok) out.replaceChildren(el(doc, 'p', { class: 'ok', dataset: { field: 'saved' } }, tt('menu.saved', { label })));
        else {
          out.replaceChildren(el(doc, 'p', { class: 'warn' }, r?.message ?? tt('menu.saveFailed')));
          await exportInto(out.appendChild(el(doc, 'div')));
        }
      },
      onExport: (out) => exportInto(out),
      onVictory: openVictory,
      onTitle: () => { panel.hidden = true; hooks.quit?.(); },
      onClose: () => { panel.hidden = true; },
    });
    panel.hidden = false;
  }
  $('[data-action="game-menu"]').onclick = openMenu;
  function showEnd() {
    renderEnd(doc, panel.querySelector('[data-field="panel-body"]'), {
      state, ruleset, text, human, name: nameOf,
      onExport: () => exportInto(panel.querySelector('[data-field="end-code"]')),
      onNew: () => { panel.hidden = true; hooks.newGame?.(); },
      onTitle: () => { panel.hidden = true; hooks.quit?.(); },
      onClose: () => { panel.hidden = true; },
    });
    panel.hidden = false;
    hooks.ended?.();
  }
  // Your faction's card, from the chip in the top bar.
  const overlay = doc.querySelector('[data-field="overlay"]');
  $('[data-action="faction"]').onclick = () => {
    const civ = v.factions.find((f) => f.id === human)?.civ;
    if (!civ) return;
    overlay.querySelector('[data-field="overlay-body"]').replaceChildren(factionCard(doc, ruleset, text, civ));
    overlay.hidden = false;
    overlay.querySelector('[data-action="close-overlay"]').focus();
  };
  overlay.querySelector('[data-action="close-overlay"]').onclick = () => { overlay.hidden = true; };
  const showClose = $('[data-action="faction"]').onclick;
  $('[data-action="faction"]').onclick = () => { overlay.querySelector('[data-action="close-overlay"]').hidden = false; showClose(); };

  // The computer seats before you in the first round play now (a loaded game is already at your turn).
  refresh();
  const firstUnit = myUnits()[0];
  if (firstUnit) mapView.centreOnTile(firstUnit.tile);
  // The computer seats before you in the first round play now (a loaded game is already at your turn).
  const opening = !resume && currentFactionId(state) !== human ? playComputerSeats() : Promise.resolve([]);
  opening.then((events) => {
    $('[data-action="next"]').disabled = false;
    refresh();
    showEvents(events);
    selectNextIdle();
    checkEnd();
    doc.defaultView.__atlasGame = api;
  });
  return { destroy: () => { mapView.destroy(); worker?.terminate(); }, get state() { return state; }, snapshot };
}
