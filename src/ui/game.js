// The game screen (phase 4): the map, a needs-attention list, a unit panel
// with every action as a button, and the Next Turn button that first walks
// you through units needing orders.
//
// Everything shown comes from view(state, yourFaction), never the raw state,
// so the screen cannot show what your units cannot see.

import { createGame, applyCommand, view, findPath, currentFactionId, VISIBLE, UNEXPLORED } from '../sim/index.js';
import { takeTurn } from '../ai/index.js';
import { createMapView } from '../render/canvas.js';
import { attachMapInput } from './input.js';
import { t } from '../data/text.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

/** A state-shaped object built from a view, so planning a path uses only what the player knows. */
function knownWorld(v) {
  return { map: v.map, units: Object.fromEntries(v.units.map((u) => [u.id, u])) };
}

export function createGameScreen(doc, root, { ruleset, text, sheets, seed, toast, players = 4, mapSize = 'small', mapType = 'continents' }) {
  const tt = (key, args) => t(text, key, args);
  const setup = {
    seed,
    players: [{ kind: 'human', name: tt('game.you') }, ...Array.from({ length: players - 1 }, (_, n) => ({ kind: 'ai', name: tt('game.rival', { n: n + 1 }) }))],
    map: { size: mapSize, type: mapType },
  };
  let state = createGame(ruleset, setup);
  const human = 'f0';
  const palette = ruleset.skin.seatColours ?? ['#c23b22', '#2f6fbf', '#e0a526', '#6a4c9c'];
  const colours = Object.fromEntries(state.factions.map((f, i) => [f.id, palette[i % palette.length]]));
  const $ = (sel) => root.querySelector(sel);
  let v = view(state, human);
  let selected = null;
  let pendingTarget = null;
  let confirmDisband = false;
  let lastTouch = false;

  const mapView = createMapView($('#game-map'), { map: v.map, ruleset, fog: v.fog, units: v.units, colours, sheets });
  doc.defaultView.__atlasGame = { get state() { return state; }, get view() { return v; }, mapView, human };

  const unitName = (u) => ruleset.text[ruleset.units[u.type]?.nameKey] ?? u.type;
  const myUnits = () => v.units.filter((u) => u.faction === human);
  const idle = () => myUnits().filter((u) => u.moves > 0 && u.activity === 'none' && u.goto === null);
  const selectedUnit = () => v.units.find((u) => u.id === selected && u.faction === human) ?? null;
  const isCivilian = (u) => ruleset.unitClasses[ruleset.units[u.type].class]?.civilian === true;

  function plan(unit, target) {
    if (!unit || target < 0) return null;
    const fog = v.fog;
    return findPath(knownWorld(v), ruleset, unit, target, { known: (i) => fog[i] !== UNEXPLORED, seen: (i) => fog[i] === VISIBLE });
  }

  function select(id, { centre = false } = {}) {
    selected = id;
    pendingTarget = null;
    confirmDisband = false;
    mapView.setSelection(id);
    mapView.setPath(null, null);
    const u = selectedUnit();
    if (u && centre) mapView.centreOnTile(u.tile);
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
    mapView.setWorld({ map: v.map, fog: v.fog, units: v.units });
    if (selected && !selectedUnit()) select(null);
    render();
  }

  function showEvents(events) {
    for (const e of events) {
      if (e.type !== 'unitMoved') continue;
      // Animate moves the player could see: their own, or along tiles they can see.
      if (e.faction === human || e.path.some((tile) => v.fog[tile] === VISIBLE)) mapView.animateMove(e.unit, e.path);
    }
  }

  function run(cmd) {
    const r = applyCommand(state, cmd, ruleset);
    if (!r.ok) {
      toast(text[`game.refused.${r.error.code}`] ?? r.error.message);
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
      for (const cmd of takeTurn(view(state, me))) {
        r = applyCommand(state, cmd, ruleset);
        if (r.ok) { state = r.state; all.push(...r.events); }
      }
      if (currentFactionId(state) === me) {
        r = applyCommand(state, { type: 'endTurn', faction: me }, ruleset);
        state = r.state;
        all.push(...r.events);
      }
    }
    refresh();
    showEvents(all);
    selectNextIdle();
  }

  function next() {
    if (idle().length) selectNextIdle();
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
    const r = run({ type, faction: human, unit: u.id });
    if (r && type === 'disband') toast(tt('game.disbanded', { unit: name }));
    if (r && ['fortify', 'skip', 'sleep', 'disband'].includes(type)) selectNextIdle();
    else render();
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

  function onTap(sx, sy, pointerType) {
    lastTouch = pointerType === 'touch' || pointerType === 'pen';
    const tile = mapView.tileAt(sx, sy);
    if (tile < 0) return;
    const mine = myUnits().filter((u) => u.tile === tile);
    const u = selectedUnit();
    if (mine.length) {
      const slot = (x) => (isCivilian(x) ? 'civilian' : 'combat');
      const canShare = u && u.tile !== tile && mine.every((m) => slot(m) !== slot(u));
      if (!canShare) {
        // Select a unit here; tapping the same tile again cycles through the units on it.
        const k = u && u.tile === tile ? mine.findIndex((m) => m.id === u.id) : -1;
        select(mine[(k + 1) % mine.length].id);
        return;
      }
    }
    if (!u) return;
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

  function render() {
    $('[data-field="turn"]').textContent = tt('game.turn', { n: state.turn });
    const list = idle();
    // Needs attention.
    $('[data-field="attention-title"]').textContent = tt('game.attention', { n: list.length });
    const items = list.map((u) => el(doc, 'li', {},
      el(doc, 'button', { type: 'button', class: 'attention-item', dataset: { unit: u.id }, onclick: () => select(u.id, { centre: true }) },
        tt('game.attention.idle', { unit: unitName(u) }))));
    $('[data-field="attention"]').replaceChildren(...(items.length ? items : [el(doc, 'li', { class: 'none' }, tt('game.attention.none'))]));

    // Unit card and actions.
    const u = selectedUnit();
    const card = $('[data-field="unit-card"]');
    const actions = $('[data-field="actions"]');
    if (!u) {
      card.replaceChildren(el(doc, 'p', { class: 'muted' }, tt('game.noUnit')));
      actions.replaceChildren();
      $('[data-field="hint"]').textContent = tt('game.hint.select');
    } else {
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
      const button = (type, label, disabled = false) => el(doc, 'button', { type: 'button', class: `btn small${type === 'disband' && confirmDisband ? ' danger' : ''}`, dataset: { act: type }, disabled, onclick: () => act(type) }, label);
      actions.replaceChildren(...[
        isCivilian(u) ? null : button('fortify', tt('game.action.fortify'), u.activity === 'fortify'),
        button('skip', tt('game.action.skip'), u.moves <= 0 || u.activity === 'skip'),
        u.activity === 'sleep' ? button('wake', tt('game.action.wake')) : button('sleep', tt('game.action.sleep')),
        button('disband', confirmDisband ? tt('game.action.confirmDisband') : tt('game.action.disband')),
      ].filter(Boolean));
      $('[data-field="hint"]').textContent = lastTouch ? tt('game.hint.moveTouch') : tt('game.hint.move');
    }
    $('[data-action="next"]').textContent = list.length ? tt('game.nextUnit', { n: list.length }) : tt('game.nextTurn');
  }

  root.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const handled = {
      ' ': () => selectNextIdle(),
      Enter: () => { if (!e.target.closest?.('button')) next(); else return false; },
      f: () => act('fortify'),
      s: () => (selectedUnit() ? act('skip') : false),
      z: () => act('sleep'),
      Delete: () => act('disband'),
      Escape: () => { if (selected) select(null); else return false; },
    }[key];
    if (handled && handled() !== false) e.preventDefault();
  });
  $('[data-action="next"]').onclick = next;

  // The computer seats before you in the first round play now.
  if (currentFactionId(state) !== human) {
    let guard = 0;
    while (currentFactionId(state) !== human && guard < 64) {
      guard += 1;
      for (const cmd of takeTurn(view(state, currentFactionId(state)))) {
        const r = applyCommand(state, cmd, ruleset);
        if (r.ok) state = r.state;
      }
    }
  }
  refresh();
  const firstUnit = myUnits()[0];
  if (firstUnit) mapView.centreOnTile(firstUnit.tile);
  selectNextIdle();
  return { destroy: () => mapView.destroy(), get state() { return state; } };
}
