// The game screen: top bar with turn and empire yields, the advice line,
// the needs-attention list, the map, and the right panel (a unit card, or the
// city drawer when a city is open), with the Next button.
//
// Everything shown comes from view(state, yourFaction), never the raw state,
// so the screen cannot show what your units and cities cannot see. Every
// change goes through applyCommand.

import {
  createGame, applyCommand, view, findPath, currentFactionId, VISIBLE, UNEXPLORED,
  cityYields, foodToGrow, buildOptions, itemCost, foundingProblem, borderCost, claimable, tilePrice, buyPrice,
  improvementProblem, builderTargets, upkeepOf, adjacencyBonus, buildingDef,
} from '../sim/index.js';
import { factionCard } from './factionCards.js';
import { takeTurn } from '../ai/index.js';
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

const fmt = (n) => (Math.round(n * 10) / 10).toString();
const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));

/** A state-shaped object built from a view, so planning and previews use only what the player knows. */
export function knownWorld(v) {
  return {
    map: v.map,
    units: Object.fromEntries(v.units.map((u) => [u.id, u])),
    cities: Object.fromEntries(v.cities.map((c) => [c.id, c])),
    owner: v.map?.owner ?? null,
    factions: v.factions,
    turn: v.turn,
  };
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

export function createGameScreen(doc, root, { ruleset, text, sheets, seed, toast, players = 4, mapSize = 'small', mapType = 'continents', faction = null }) {
  const tt = (key, args) => t(text, key, args);
  const setup = {
    seed,
    players: [{ kind: 'human', name: tt('game.you'), ...(faction ? { faction } : {}) }, ...Array.from({ length: players - 1 }, (_, n) => ({ kind: 'ai', name: tt('game.rival', { n: n + 1 }) }))],
    map: { size: mapSize, type: mapType },
  };
  let state = createGame(ruleset, setup);
  const human = 'f0';
  const palette = ruleset.skin.seatColours ?? ['#c23b22', '#2f6fbf', '#e0a526', '#6a4c9c'];
  const colours = Object.fromEntries(state.factions.map((f, i) => [f.id, palette[i % palette.length]]));
  const $ = (sel) => root.querySelector(sel);
  let v = view(state, human);
  let selected = null;        // unit id
  let openCity = null;        // city id
  let pendingTarget = null;   // touch: first tap on a destination
  let pendingBuy = null;      // tile awaiting a second tap to buy
  let confirmDisband = false;
  let showAllOptions = false;
  let lastTouch = false;

  const mapView = createMapView($('#game-map'), { map: v.map, ruleset, fog: v.fog, units: v.units, colours, sheets });
  doc.defaultView.__atlasGame = { get state() { return state; }, get view() { return v; }, mapView, human, ruleset };

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
    v = view(state, human);
    mapView.setWorld({ map: v.map, fog: v.fog, units: v.units, cities: v.cities });
    if (selected && !selectedUnit()) select(null);
    if (openCity) mapView.setCityOverlay(openCity, cityOverlay());
    render();
  }

  function showEvents(events) {
    for (const e of events) {
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
      if (e.type === 'unitBuilt' && !e.bought) toast(tt('game.unitBuilt', { city: city?.name ?? '', unit: itemName({ kind: 'unit', id: e.unitType }) }));
    }
  }

  function run(cmd) {
    const r = applyCommand(state, cmd, ruleset);
    if (!r.ok) {
      toast(refusal(r.error));
      return null;
    }
    state = r.state;
    refresh();
    showEvents(r.events);
    return r;
  }

  /** End your turn, let the computer seats play, and come back at your next turn. */
  function endTurn() {
    if (currentFactionId(state) !== human) return;
    const all = [];
    let r = applyCommand(state, { type: 'endTurn', faction: human }, ruleset);
    state = r.state;
    all.push(...r.events);
    let guard = 0;
    while (currentFactionId(state) !== human && guard < 64) {
      guard += 1;
      const me = currentFactionId(state);
      for (const cmd of takeTurn(view(state, me), ruleset)) {
        r = applyCommand(state, cmd, ruleset);
        if (r.ok) { state = r.state; all.push(...r.events); }
        if (cmd.type === 'endTurn') break;
      }
      if (currentFactionId(state) === me) {
        r = applyCommand(state, { type: 'endTurn', faction: me }, ruleset);
        state = r.state;
        all.push(...r.events);
      }
    }
    refresh();
    showEvents(all);
    if (noProduction().length) openCityDrawer(noProduction()[0].id, { centre: true });
    else selectNextIdle();
  }

  /** The Next button: whatever still blocks the turn, else end it (section 10.1). */
  function next() {
    if (noProduction().length) openCityDrawer(noProduction()[0].id, { centre: true });
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

  function onTap(sx, sy, pointerType) {
    lastTouch = pointerType === 'touch' || pointerType === 'pen';
    const tile = mapView.tileAt(sx, sy);
    if (tile < 0) return;
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
      el(doc, 'span', { class: 'y science' }, tt('game.bar.science', { rate: signed(total.science) })),
      el(doc, 'span', { class: 'y culture' }, tt('game.bar.culture', { rate: signed(total.culture) })),
      el(doc, 'span', { class: 'y faith' }, tt('game.bar.faith', { stock: fmt(s.faith), rate: signed(total.faith) })),
    );
  }

  /** The advice line: the highest-priority piece of advice whose condition holds (rules/<mod>/ui/advice.json). */
  function currentAdvice() {
    const checks = {
      noCities: () => myCities().length === 0 && myUnits().some(isFounder) && {},
      cityStarving: () => starving().length && { city: starving()[0].name, target: starving()[0].id },
      cityNoProduction: () => noProduction().length && { city: noProduction()[0].name, target: noProduction()[0].id },
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
  }

  function renderAdvice() {
    const a = currentAdvice();
    const line = $('[data-field="advice"]');
    if (!a) { line.replaceChildren(); return; }
    line.replaceChildren(
      el(doc, 'span', { class: 'advice-text' }, tt(a.textKey, a.args)),
      el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'advice' }, onclick: () => doAdvice(a) }, tt(a.actionKey ?? 'advice.do')),
    );
  }

  function renderAttention() {
    const items = [
      ...noProduction().map((c) => ({ key: `p${c.id}`, label: tt('game.attention.production', { city: c.name }), go: () => openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...starving().map((c) => ({ key: `s${c.id}`, label: tt('game.attention.starving', { city: c.name }), go: () => openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...idle().map((u) => ({ key: u.id, label: tt('game.attention.idle', { unit: unitName(u) }), go: () => select(u.id, { centre: true }), unit: u.id })),
    ];
    $('[data-field="attention-title"]').textContent = tt('game.attention', { n: items.length });
    const lis = items.map((it) => el(doc, 'li', {},
      el(doc, 'button', { type: 'button', class: `attention-item${it.urgent ? ' urgent' : ''}`, dataset: it.unit ? { unit: it.unit } : {}, onclick: it.go }, it.label)));
    $('[data-field="attention"]').replaceChildren(...(lis.length ? lis : [el(doc, 'li', { class: 'none' }, tt('game.attention.none'))]));
  }

  function renderUnitCard(u) {
    const card = $('[data-field="unit-card"]');
    const actions = $('[data-field="actions"]');
    const def = ruleset.units[u.type];
    const turnsLeft = u.goto !== null ? (plan(u, u.goto)?.arrivesOnTurn ?? 0) + 1 : 0;
    const status = u.goto !== null ? tt('game.unit.status.goto', { turns: turnsLeft }) : tt(`game.unit.status.${u.activity}`, { turns: u.fortifiedTurns });
    card.replaceChildren(
      el(doc, 'h2', {}, unitName(u)),
      el(doc, 'p', { class: 'muted' }, isCivilian(u) ? tt('game.unit.civilian') : `${ruleset.text[ruleset.unitClasses[def.class]?.nameKey] ?? def.class} · ${def.strength}`),
      el(doc, 'p', { dataset: { field: 'moves' } }, tt('game.unit.moves', { left: u.moves, max: def.moves })),
      el(doc, 'p', {}, tt('game.unit.health', { hp: u.hp })),
      el(doc, 'p', { class: 'status' }, status),
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
    actions.replaceChildren(...improve, ...[
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
    const need = foodToGrow(c.pop, ruleset.tuning);
    const growIn = y.surplus > 0 ? Math.ceil((need - c.food) / y.surplus) : null;
    const growth = y.surplus < 0 ? tt('city.starving') : growIn ? tt('city.grows', { n: growIn }) : tt('city.growsNever');
    const head = c.queue[0];
    const prod = Math.max(1, y.total.production);
    const world = knownWorld(v);
    const price = head ? buyPrice(ruleset, c, world) : null;
    const options = rankOptions(v, ruleset, c, tt);
    const shown = showAllOptions ? options : options.slice(0, 4);
    const borderIn = Math.max(1, Math.ceil((borderCost(c, ruleset.tuning) - c.culture) / Math.max(0.1, y.total.culture)));
    const focuses = Object.values(ruleset.focuses ?? {});

    card.replaceChildren(...[
      el(doc, 'div', { class: 'city-head' },
        el(doc, 'h2', {}, c.name),
        el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-city' }, onclick: () => select(null) }, tt('city.close'))),
      el(doc, 'p', { class: 'muted' }, tt('city.pop', { pop: c.pop })),
      mood(y.amenities),
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
    actions.replaceChildren();
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
      f: () => act('fortify'),
      s: () => (selectedUnit() ? act('skip') : false),
      z: () => act('sleep'),
      Delete: () => act('disband'),
      Escape: () => { if (selected || openCity) select(null); else return false; },
    }[key];
    if (handled && handled() !== false) e.preventDefault();
  });
  $('[data-action="next"]').onclick = next;
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

  // The computer seats before you in the first round play now.
  let guard = 0;
  while (currentFactionId(state) !== human && guard < 64) {
    guard += 1;
    const me = currentFactionId(state);
    for (const cmd of takeTurn(view(state, me), ruleset)) {
      const r = applyCommand(state, cmd, ruleset);
      if (r.ok) state = r.state;
      if (cmd.type === 'endTurn') break;
    }
  }
  refresh();
  const firstUnit = myUnits()[0];
  if (firstUnit) mapView.centreOnTile(firstUnit.tile);
  selectNextIdle();
  return { destroy: () => mapView.destroy(), get state() { return state; } };
}
