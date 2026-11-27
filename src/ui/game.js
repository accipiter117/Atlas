// The game screen: top bar with turn and empire yields, the advice line,
// the needs-attention list, the map, and the right panel (a unit card, or the
// city drawer when a city is open), with the Next button.
//
// Everything shown comes from view(state, yourFaction), never the raw state,
// so the screen cannot show what your units and cities cannot see. Every
// change goes through applyCommand.

import { createGame, applyCommand, view, findPath, currentFactionId, VISIBLE, UNEXPLORED, fingerprint, cityYields, itemCost, claimable, tilePrice, upkeepOf, atWar, buildSpec, attackProblem, combatKind, rangeOf, defenderAt, eraOf, cityHasWalls, cityMaxHp } from '../sim/index.js';
import { estimateOdds } from './odds.js';

import { el, knownWorld } from './hud/shared.js';
import { createTopBar } from './hud/topBar.js';
import { createAdvice } from './hud/advice.js';
import { createAttention } from './hud/attention.js';
import { createMapHud } from './hud/mapHud.js';
import { createPlayback } from './hud/playback.js';
import { mapThumb } from './thumb.js';
import { hideTooltip } from './hud/tooltip.js';
import { createUnitCard } from './hud/unitCard.js';
import { createCityDrawer } from './screens/cityDrawer.js';
import { createDialogs } from './screens/dialogs.js';
import { createOverlays } from './screens/overlays.js';
import { factionCard } from './factionCards.js';
import { createSeatRunner } from '../ai/index.js';
import { unitIconName } from './hud/icons.js';

import { religionName } from './religionTab.js';

import { createMapView } from '../render/canvas.js';
import { attachMapInput } from './input.js';
import { t, formatText } from '../data/text.js';

/**
 * The game screen. Starts a new game from `setup` (or a quick default built
 * from seed and faction), or carries on from `resume` ({ state, log, journal })
 * when a save is loaded. `hooks` connect it to the app: saveSlot, exportCode,
 * autosave, quit and newGame.
 */
export function createGameScreen(doc, root, { ruleset, text, sheets, seed, toast, sound = null, setup: given = null, resume = null, players = 4, mapSize = 'small', mapType = 'continents', faction = null, debug = false, hooks = {} }) {
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

  // Everything the HUD and screen modules (src/ui/hud, src/ui/screens) share with
  // the game screen, read live through getters (and setters for what they change).
  const g = {
    get $() { return $; },
    get act() { return act; },
    get aiIds() { return aiIds; },
    get aim() { return aim; }, set aim(x) { aim = x; },
    get aimAt() { return aimAt; },
    get api() { return api; },
    get attackAt() { return attackAt; },
    get autoplayAi() { return autoplayAi; }, set autoplayAi(x) { autoplayAi = x; },
    get autosaveNow() { return autosaveNow; },
    get battleReport() { return battleReport; },
    get battleScreen() { return battleScreen; }, set battleScreen(x) { battleScreen = x; },
    get busy() { return busy; }, set busy(x) { busy = x; },
    get checkEnd() { return checkEnd; },
    get cityCmd() { return cityCmd; },
    get cityNameOf() { return cityNameOf; },
    get cityOverlay() { return cityOverlay; },
    get civName() { return civName; },
    get civicName() { return civicName; },
    get colours() { return colours; },
    get confirmDisband() { return confirmDisband; }, set confirmDisband(x) { confirmDisband = x; },
    get debug() { return debug; },
    get dipUi() { return dipUi; },
    get doc() { return doc; },
    get empireTab() { return empireTab; }, set empireTab(x) { empireTab = x; },
    get endShown() { return endShown; }, set endShown(x) { endShown = x; },
    get endTurn() { return endTurn; },
    get enemyAt() { return enemyAt; },
    get exec() { return exec; },
    get faction() { return faction; },
    get firstUnit() { return firstUnit; },
    get foundForm() { return foundForm; }, set foundForm(x) { foundForm = x; },
    get gameOver() { return gameOver; },
    get given() { return given; },
    get goldTurnsLeft() { return goldTurnsLeft; },
    get hexDist() { return hexDist; },
    get hooks() { return hooks; },
    get human() { return human; },
    get humanAlive() { return humanAlive; },
    get idle() { return idle; },
    get isCivilian() { return isCivilian; },
    get isFounder() { return isFounder; },
    get itemName() { return itemName; },
    get journals() { return journals; }, set journals(x) { journals = x; },
    get lastTouch() { return lastTouch; }, set lastTouch(x) { lastTouch = x; },
    get lastTree() { return lastTree; }, set lastTree(x) { lastTree = x; },
    get log() { return log; },
    get lum() { return lum; },
    get mapSize() { return mapSize; },
    get mapType() { return mapType; },
    get mapView() { return mapView; },
    get moveTo() { return moveTo; },
    get myCities() { return myCities; },
    get myUnits() { return myUnits; },
    get nameOfUnit() { return nameOfUnit; },
    get netGold() { return netGold; },
    get next() { return next; },
    get noProduction() { return noProduction; },
    get onCityTap() { return onCityTap; },
    get onHover() { return onHover; },
    get onTap() { return onTap; },
    get openCity() { return openCity; }, set openCity(x) { openCity = x; },
    get openCityDrawer() { return openCityDrawer; },
    get opening() { return opening; },
    get overlay() { return overlay; },
    get palette() { return palette; },
    get panel() { return panel; },
    get pendingBuy() { return pendingBuy; }, set pendingBuy(x) { pendingBuy = x; },
    get pendingTarget() { return pendingTarget; }, set pendingTarget(x) { pendingTarget = x; },
    get pickSlot() { return pickSlot; }, set pickSlot(x) { pickSlot = x; },
    get plan() { return plan; },
    get playComputerSeats() { return playComputerSeats; },
    get playId() { return playId; }, set playId(x) { playId = x; },
    get players() { return players; },
    get raidersName() { return raidersName; },
    get recordOff() { return recordOff; },
    get refresh() { return refresh; },
    get refusal() { return refusal; },
    get religionLens() { return religionLens; }, set religionLens(x) { religionLens = x; },
    get render() { return render; },
    get renderBusy() { return renderBusy; },
    get resume() { return resume; },
    get root() { return root; },
    get ruleset() { return ruleset; },
    get run() { return run; },
    get saveLabel() { return saveLabel; },
    get seats() { return seats; },
    get seed() { return seed; },
    get select() { return select; },
    get selectNextIdle() { return selectNextIdle; },
    get selected() { return selected; }, set selected(x) { selected = x; },
    get selectedUnit() { return selectedUnit; },
    get setDrawer() { return setDrawer; },
    get setSheet() { return setSheet; },
    get setup() { return setup; },
    get sheets() { return sheets; },
    get shootingCity() { return shootingCity; }, set shootingCity(x) { shootingCity = x; },
    get showAllOptions() { return showAllOptions; }, set showAllOptions(x) { showAllOptions = x; },
    get showClose() { return showClose; },
    get showEvents() { return showEvents; },
    get sound() { return sound; },
    get openHelp() { return openHelp; },
    get snapshot() { return snapshot; },
    get startMemories() { return startMemories; },
    get startWorker() { return startWorker; },
    get starving() { return starving; },
    get state() { return state; }, set state(x) { state = x; },
    get techName() { return techName; },
    get text() { return text; },
    get theCity() { return theCity; },
    get toast() { return toast; },
    get tt() { return tt; },
    get unitName() { return unitName; },
    get usedColours() { return usedColours; },
    get v() { return v; }, set v(x) { v = x; },
    get worker() { return worker; },
    get workerPlay() { return workerPlay; },
    get world0() { return world0; },
    get yieldsOf() { return yieldsOf; },
    get buildingList() { return buildingList; },
    get canBuildHere() { return canBuildHere; },
    get civicSuggestion() { return civicSuggestion; },
    get currentAdvice() { return currentAdvice; },
    get doAdvice() { return doAdvice; },
    get emptySlot() { return emptySlot; },
    get exportInto() { return exportInto; },
    get faithBuys() { return faithBuys; },
    get frontData() { return frontData; },
    get lensData() { return lensData; },
    get mood() { return mood; },
    get nameOf() { return nameOf; },
    get oddsPanel() { return oddsPanel; },
    get openBattle() { return openBattle; },
    get openDiplomacy() { return openDiplomacy; },
    get openEmpire() { return openEmpire; },
    get openJournal() { return openJournal; },
    get openMenu() { return openMenu; },
    get openTrees() { return openTrees; },
    get openVictory() { return openVictory; },
    get promotionPanel() { return promotionPanel; },
    get readyGovernment() { return readyGovernment; },
    get renderAdvice() { return renderAdvice; },
    get renderAttention() { return renderAttention; },
    get renderBar() { return renderBar; },
    get renderCityDrawer() { return renderCityDrawer; },
    get renderUnitCard() { return renderUnitCard; },
    get showBattleCard() { return showBattleCard; },
    get showCaptureDialog() { return showCaptureDialog; },
    get showEnd() { return showEnd; },
    get showEventDialog() { return showEventDialog; },
    get sideName() { return sideName; },
    get suggestion() { return suggestion; },
    get toggleLens() { return toggleLens; },
  };
  const { renderBar, lensData, toggleLens } = createTopBar(g);
  const { civicSuggestion, readyGovernment, emptySlot, suggestion, currentAdvice, doAdvice, renderAdvice } = createAdvice(g);
  const { renderAttention } = createAttention(g);
  const { oddsPanel, promotionPanel, renderUnitCard } = createUnitCard(g);
  const { faithBuys, canBuildHere, mood, buildingList, renderCityDrawer } = createCityDrawer(g);
  const { showCaptureDialog, frontData, sideName, showBattleCard, openBattle, showEventDialog } = createDialogs(g);
  const { openTrees, openDiplomacy, openEmpire, openJournal, nameOf, openVictory, exportInto, openMenu, showEnd } = createOverlays(g);

  const mapView = createMapView($('#game-map'), { map: v.map, ruleset, fog: v.fog, units: v.units, colours, civs: Object.fromEntries(v.factions.map((f) => [f.id, f.civ])), sheets });
  const { refreshMinimap, updateInsets, toggleYields, toggleGrid, hexHover, hexLeave, hexContent, openHelp } = createMapHud(g);
  const playback = createPlayback(g);
  doc.defaultView.addEventListener('resize', () => updateInsets());
  // What tests and the dev tools can see; published on window once the opening seats have played.
  const api = { get state() { return state; }, get view() { return v; }, get busy() { return busy; }, mapView, human, ruleset, get journals() { return journals; }, usesWorker: Boolean(worker),
    /** Open one of your cities' panels (the screenshot harness and tests). */
    openCity: (id) => openCityDrawer(id, { centre: true }),
    /** What the hover tooltip says about a hex (tests). */
    hexTooltip: (tile) => hexContent(tile),
    /** The game's fingerprint now (tests: animations never change the game). */
    fingerprint: () => fingerprint(state),
    get summary() { return playback.summary; } };
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
      /** Issue a command as you would by tapping (tests): { ok } or null if refused. */
      run(cmd) { const r = run(cmd); return r ? { ok: true } : null; },
      /** Choose how your battles are fought (battle tests): 'auto', 'ask' or 'fight'. */
      battleMode(mode, module = 'tactical') {
        const next = JSON.parse(JSON.stringify(state));
        next.setup.battleMode = mode;
        next.setup.battleModule = mode === 'auto' ? 'auto' : module;
        setup.battleMode = next.setup.battleMode;
        setup.battleModule = next.setup.battleModule;
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
    if (id) setSheet(true);
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
    render();
    // Graphics overhaul G2: the camera keeps the selected unit out from under the panels.
    const u = selectedUnit();
    if (u && centre) mapView.centreOnTile(u.tile);
    else if (u) mapView.ensureVisible(u.tile);
  }

  function openCityDrawer(id, { centre = false } = {}) {
    setSheet(true);
    selected = null;
    openCity = id;
    pendingBuy = null;
    showAllOptions = false;
    mapView.setSelection(null);
    mapView.setPath(null, null);
    mapView.setCityOverlay(id, cityOverlay());
    render();
    const c = theCity();
    if (c && centre) mapView.centreOnTile(c.tile);
    else if (c) mapView.ensureVisible(c.tile);
  }

  function selectNextIdle() {
    const list = idle();
    if (!list.length) { select(null); return; }
    const after = list.findIndex((u) => u.id > (selected ?? ''));
    select(list[after >= 0 ? after : 0].id, { centre: true });
  }

  /** What the map needs to draw each city (graphics overhaul G5): era, walls, health, and your builds. */
  function cityExtras(world) {
    const out = {};
    const eras = new Map();
    const eraOfFaction = (f) => {
      // Another faction's era as far as you can tell (your view may not hold their research).
      if (!eras.has(f)) { let e = null; try { e = f === 'raiders' ? null : eraOf(world, ruleset, f); } catch { e = null; } eras.set(f, e); }
      return eras.get(f);
    };
    for (const c of v.cities) {
      const extra = { era: eraOfFaction(c.faction), walls: cityHasWalls(ruleset, c), maxHp: cityMaxHp(ruleset, c), producing: c.faction === human ? c.queue?.length > 0 : c.pop >= 4 };
      const item = c.faction === human ? c.queue?.[0] : null;
      if (item) {
        const prod = Math.max(1, yieldsOf(c).total.production);
        const turns = Math.max(1, Math.ceil((itemCost(ruleset, item, world, c) - (c.progress ?? 0)) / prod));
        extra.build = { icon: item.kind === 'unit' ? unitIconName(ruleset, item.id) : 'production', turns };
      }
      out[c.id] = extra;
    }
    return out;
  }

  function refresh() {
    v = view(state, human, ruleset);
    mapView.setWorld({ map: v.map, fog: v.fog, units: v.units, cities: v.cities, camps: v.camps });
    if (religionLens) mapView.setReligionLens(lensData());
    if (v.frontline) mapView.setFront(frontData());
    if (v.pendingBattle) showBattleCard();
    else if (v.pendingCapture) showCaptureDialog();
    else if (v.pendingEvent) showEventDialog();
    if (selected && !selectedUnit()) select(null);
    if (openCity) mapView.setCityOverlay(openCity, cityOverlay());
    // Borders of factions you are at war with are dashed (graphics overhaul G3).
    const world = knownWorld(v);
    mapView.setWar(v.factions.filter((f) => f.id !== human && atWar(world, human, f.id)).map((f) => f.id));
    mapView.setCityExtras(cityExtras(world));
    refreshMinimap();
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

  /** Toasts for what happened, and the animations and sounds (G6). Returns how long the animations run. */
  function showEvents(events, { rival = false } = {}) {
    const ms = playback.play(events, { rival });
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
      if (e.type === 'siteCaptured' && e.side !== null) {
        const holder = v.factions.find((f) => ruleset.factions?.[f.civ]?.frontSide === e.side);
        toast(tt('front.siteCaptured', { side: holder ? civName(holder.id) : '', site: (ruleset.text[ruleset.sites?.[e.site]?.nameKey] ?? e.site).toLowerCase() }));
      }
      if (e.type === 'factionEliminated') toast(tt(e.faction === human ? 'game.youEliminated' : 'game.eliminated', { faction: civName(e.faction) }));
      if (e.type === 'unitBuilt' && !e.bought) toast(tt('game.unitBuilt', { city: city?.name ?? '', unit: itemName({ kind: 'unit', id: e.unitType }) }));
    }
    return ms;
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
    return { state, log, journal: journals, meta: saveMeta() };
  }
  /** What the Continue and Load cards show (graphics overhaul G7). */
  function saveMeta() {
    const civ = v.factions.find((f) => f.id === human)?.civ;
    const leader = ruleset.factions?.[civ]?.leaders?.[0];
    try {
      return { faction: civName(human), leader: ruleset.text[ruleset.leaders?.[leader]?.nameKey] ?? '', portrait: sheets?.[`leader.${leader}`]?.src ?? null, colour: colours[human], thumb: mapThumb(v, ruleset, human) };
    } catch { return null; }
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
    sound?.('endTurn');
    const ms = showEvents(all, { rival: true });
    playback.ribbon(state.turn);
    autosaveNow();
    checkEnd();
    if (gameOver()) return;
    // Let the rivals' moves play before the camera jumps to your first job (at most 2.5 seconds).
    const firstJob = () => {
      if (busy || gameOver() || currentFactionId(state) !== human) return;
      if (noProduction().length) openCityDrawer(noProduction()[0].id, { centre: true });
      else selectNextIdle();
    };
    if (ms > 0) doc.defaultView.setTimeout(firstJob, Math.min(ms, 2500)); else firstJob();
  }

  /** The Next button: whatever still blocks the turn, else end it (section 10.1). */
  function next() {
    if (v.pendingBattle) showBattleCard();
    else if (v.pendingCapture) showCaptureDialog();
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
    hexLeave();
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
    if (sx === null) hexLeave(); else hexHover(sx, sy, mapView.tileAt(sx, sy));
    const u = selectedUnit();
    if (sx === null) { mapView.setHover(null); if (!pendingTarget) mapView.setPath(null, null); return; }
    const tile = mapView.tileAt(sx, sy);
    // With nothing selected the hovered hex still gets its soft outline (G3).
    if (!u) { mapView.setHover(tile >= 0 && v.fog[tile] !== UNEXPLORED ? tile : null); return; }
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

  const world0 = () => knownWorld(v);

  // The religion lens: pips under each city in the colours of its followers.
  let religionLens = false;

  // ---------- Battles you fight yourself (phase 18) ----------
  let battleScreen = null;   // { host element, mounted module screen, battleId }

  function render() {
    renderBar();
    renderAdvice();
    renderAttention();
    const c = theCity();
    const u = selectedUnit();
    root.querySelector('.unit-panel').classList.toggle('city-open', Boolean(c));
    root.classList.toggle('city-open', Boolean(c));
    if (c) renderCityDrawer(c);
    else if (u) renderUnitCard(u);
    else {
      $('[data-field="unit-card"]').replaceChildren(el(doc, 'p', { class: 'muted' }, tt('game.noUnit')));
      $('[data-field="actions"]').replaceChildren();
      $('[data-field="hint"]').textContent = tt('game.hint.select');
    }
    $('[data-action="next"]').textContent = noProduction().length ? tt('game.nextChooseProduction')
      : idle().length ? tt('game.nextUnit', { n: idle().length }) : tt('game.nextTurn');
    updateInsets();
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
      y: () => toggleYields(),
      g: () => toggleGrid(),
      '?': () => openHelp(),
      f: () => act('fortify'),
      s: () => (selectedUnit() ? act('skip') : false),
      z: () => act('sleep'),
      Delete: () => act('disband'),
      // Escape closes whatever is open, the top-most first: a sheet, the faction card, then the selection.
      Escape: () => {
        hideTooltip();
        if (!panel.hidden) { panel.hidden = true; return true; }
        if (!overlay.hidden) { overlay.hidden = true; return true; }
        if (selected || openCity) select(null); else return false;
      },
    }[key];
    if (handled && handled() !== false) e.preventDefault();
  });
  // Escape also works while a sheet or the faction card has the focus (they sit outside the game screen).
  const onDocKey = (e) => {
    if (e.key !== 'Escape' || root.hidden || root.contains(e.target)) return;
    if (e.target.closest?.('.battle-screen')) return;
    if (!panel.hidden) panel.hidden = true;
    else if (!overlay.hidden) overlay.hidden = true;
    else return;
    hideTooltip();
    e.preventDefault();
    $('#game-map').focus({ preventScroll: true });
  };
  doc.addEventListener('keydown', onDocKey);
  $('[data-action="next"]').onclick = next;
  const panel = doc.querySelector('[data-field="panel"]');
  let lastTree = 'techs';
  const dipUi = { selected: null, deal: null };
  let pickSlot = null;
  let empireTab = 'government';
  let foundForm = {};
  // Phone layout (phase 21): the attention drawer and the bottom sheet's handle.
  function setDrawer(open) {
    root.classList.toggle('drawer-open', open);
    $('[data-action="attention-toggle"]').setAttribute('aria-expanded', String(open));
    $('[data-field="drawer-backdrop"]').hidden = !open;
    if (open) root.querySelector('.attention .attention-item')?.focus({ preventScroll: true });
  }
  function setSheet(open) {
    root.classList.toggle('sheet-min', !open);
    $('[data-action="sheet-toggle"]').setAttribute('aria-expanded', String(open));
  }
  $('[data-action="attention-toggle"]').onclick = () => setDrawer(!root.classList.contains('drawer-open'));
  $('[data-field="drawer-backdrop"]').onclick = () => setDrawer(false);
  $('[data-action="sheet-toggle"]').onclick = () => setSheet(root.classList.contains('sheet-min'));
  $('[data-action="journal"]').onclick = openJournal;
  $('[data-action="empire"]').onclick = () => openEmpire('government');
  $('[data-action="diplomacy"]').onclick = () => openDiplomacy();
  $('[data-action="victory"]').onclick = openVictory;
  $('[data-action="game-menu"]').onclick = openMenu;
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
    showEvents(events, { rival: true });
    selectNextIdle();
    checkEnd();
    doc.defaultView.__atlasGame = api;
  });
  return { destroy: () => { mapView.destroy(); worker?.terminate(); doc.removeEventListener('keydown', onDocKey); hideTooltip(); }, get state() { return state; }, snapshot };
}
