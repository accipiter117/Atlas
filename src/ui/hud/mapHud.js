// The parts of the HUD that work with the map (graphics overhaul G2,
// docs/OVERHAUL.md section 3): the minimap, the yield-icon and hex-grid
// toggles, the hex hover tooltip, the camera's clear area (so panels never
// hide the selected unit) and the Help sheet. Everything the game screen
// shares comes in through `g` (see src/ui/game.js).

import { tileYields, UNEXPLORED, VISIBLE } from '../../sim/index.js';
import { createMinimap } from '../../render/minimap.js';
import { showTooltipAt, hideTooltip, tooltipDelay } from './tooltip.js';
import { unitIconName } from './icons.js';
import { el, knownWorld, fmt } from './shared.js';
import { helpBody } from '../helpContent.js';

const YIELDS = ['food', 'production', 'gold', 'science', 'culture', 'faith'];
const RESOURCE_ICONS = new Set(['wheat', 'rice', 'cattle', 'deer', 'fish', 'stone', 'wine', 'silk', 'incense', 'horses', 'iron']);
export function createMapHud(g) {
  let yieldIcons = false;
  let grid = false;
  let hoverTile = null;
  let hoverTimer = null;

  // ---- Minimap ----
  const minimap = createMinimap(g.$('[data-field="minimap"]'), {
    map: g.v.map, ruleset: g.ruleset, colours: g.colours,
    onJump: (wx, wy) => g.mapView.centreOnWorld(wx, wy),
  });
  g.mapView.onView = (cam, vp) => minimap.setView(cam, vp);

  function refreshMinimap() {
    minimap.setWorld({ map: g.v.map, fog: g.v.fog, cities: g.v.cities });
  }

  // ---- The clear area: what the floating panels leave of the map ----
  function updateInsets() {
    const host = g.$('#game-map').getBoundingClientRect();
    if (!host.width) return;
    const rect = (sel) => { const n = g.root.querySelector(sel); if (!n || n.hidden || n.offsetParent === null) return null; const r = n.getBoundingClientRect(); return r.width ? r : null; };
    const bar = rect('.game-bar');
    const progress = rect('.hud-progress');
    const notes = rect('.attention:not(.empty)');
    const panel = rect('.unit-panel');
    const endturn = rect('.hud-endturn');
    const mini = rect('.hud-minimap');
    const cityOpen = g.root.classList.contains('city-open');
    const tops = [bar, cityOpen ? null : progress].filter(Boolean).map((r) => r.bottom - host.top);
    const bottoms = [cityOpen ? null : panel, endturn, mini].filter(Boolean).map((r) => host.bottom - r.top);
    g.mapView.setInsets({
      top: Math.max(0, ...tops),
      bottom: Math.max(0, ...bottoms),
      left: cityOpen && panel ? panel.right - host.left : 0,
      right: notes ? host.right - notes.left : 0,
    });
  }

  // ---- Toggles under the end-turn button ----
  function toggleYields(on = !yieldIcons) {
    yieldIcons = on;
    const world = () => knownWorld(g.v);
    g.mapView.setYieldOverlay(on ? (tile) => tileYields(world(), g.ruleset, tile) : null);
    g.$('[data-action="yield-icons"]').setAttribute('aria-pressed', String(on));
  }
  function toggleGrid(on = !grid) {
    grid = on;
    g.mapView.setGrid(on);
    g.$('[data-action="grid"]').setAttribute('aria-pressed', String(on));
  }
  g.$('[data-action="yield-icons"]').onclick = () => toggleYields();
  g.$('[data-action="grid"]').onclick = () => toggleGrid();
  g.$('[data-action="lens"]').onclick = () => g.toggleLens();

  // ---- Hex tooltips ----
  const name = (key, fallback) => g.ruleset.text[key] ?? fallback;

  /** What the tooltip says about a hex, from what you know of it (null when unexplored). */
  function hexContent(tile) {
    const v = g.v;
    if (tile < 0 || v.fog[tile] === UNEXPLORED) return null;
    const map = v.map;
    const terrainId = map.terrainIds[map.terrain[tile]];
    const terrain = g.ruleset.terrain[terrainId];
    const lines = [];
    const featureId = map.feature[tile] >= 0 ? map.featureIds[map.feature[tile]] : null;
    const resourceId = map.resource[tile] >= 0 ? map.resourceIds[map.resource[tile]] : null;
    const improvementId = map.improvement && map.improvement[tile] >= 0 ? map.improvementIds[map.improvement[tile]] : null;
    if (featureId) lines.push({ text: name(g.ruleset.features[featureId]?.nameKey, featureId) });
    if (map.river?.[tile]) lines.push({ text: g.tt('hex.river') });
    if (resourceId) lines.push({ icon: RESOURCE_ICONS.has(resourceId) ? `res-${resourceId}` : null, text: g.tt('hex.resource', { name: name(g.ruleset.resources[resourceId]?.nameKey, resourceId) }) });
    if (improvementId) lines.push({ text: g.tt('hex.improvement', { name: name(g.ruleset.improvements?.[improvementId]?.nameKey, improvementId) }) });
    if (map.road?.[tile]) lines.push({ text: g.tt('hex.road') });
    const y = tileYields(knownWorld(v), g.ruleset, tile);
    const shown = YIELDS.filter((k) => (y[k] ?? 0) !== 0);
    for (const k of shown) lines.push({ icon: k, text: g.tt(`tooltip.yield.${k}`), value: fmt(y[k]) });
    if (!shown.length) lines.push({ text: g.tt('hex.noYields'), muted: true });
    const ownerCity = map.owner?.[tile];
    const city = ownerCity !== null && ownerCity !== undefined ? v.cities.find((c) => c.id === ownerCity) : null;
    const here = v.cities.find((c) => c.tile === tile);
    if (here) lines.push({ icon: here.capital ? 'capital' : 'city', text: g.tt('hex.city', { city: here.name, faction: g.civName(here.faction) }) });
    else if (city) lines.push({ icon: 'city', text: g.tt('hex.owner', { city: city.name, faction: g.civName(city.faction) }) });
    if (v.fog[tile] === VISIBLE) {
      for (const u of v.units.filter((x) => x.tile === tile)) {
        const def = g.ruleset.units[u.type];
        const who = u.faction === g.human ? g.tt('hex.yours') : u.faction === 'raiders' ? g.raidersName() : g.civName(u.faction);
        lines.push({ icon: unitIconName(g.ruleset, u.type), text: g.tt('hex.unit', { unit: g.nameOfUnit(u.type, u.faction), owner: who }), value: def?.strength ? g.tt('hex.unitStats', { s: def.strength, hp: u.hp }) : g.tt('hex.unitHp', { hp: u.hp }) });
      }
    } else lines.push({ text: g.tt('hex.lastSeen'), muted: true });
    const title = map.hills?.[tile] ? g.tt('hex.hills', { terrain: name(terrain?.nameKey, terrainId) }) : name(terrain?.nameKey, terrainId);
    return { title, lines };
  }

  /** The pointer rests on a hex: after the tooltip delay, show what it is. */
  function hexHover(sx, sy, tile) {
    if (tile === hoverTile) return;
    hoverTile = tile;
    clearTimeout(hoverTimer);
    hideTooltip();
    const delay = tooltipDelay();
    if (delay === null || tile === null || tile < 0) return;
    const host = g.$('#game-map').getBoundingClientRect();
    hoverTimer = g.doc.defaultView.setTimeout(() => {
      if (hoverTile !== tile) return;
      showTooltipAt(g.doc, host.left + sx, host.top + sy, hexContent(tile));
    }, Math.max(delay, 250));
  }
  function hexLeave() {
    hoverTile = null;
    clearTimeout(hoverTimer);
    hideTooltip();
  }

  // ---- Help ----
  function openHelp() {
    const body = g.panel.querySelector('[data-field="panel-body"]');
    body.replaceChildren(
      el(g.doc, 'div', { class: 'tree-head' }, el(g.doc, 'h2', {}, g.tt('help.title')),
        el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-help' }, onclick: () => { g.panel.hidden = true; } }, g.tt('help.close'))),
      helpBody(g.doc, g.tt));
    g.panel.hidden = false;
    g.panel.querySelector('[data-action="close-help"]').focus();
  }
  g.$('[data-action="help"]').onclick = openHelp;

  return { refreshMinimap, updateInsets, toggleYields, toggleGrid, hexHover, hexLeave, hexContent, openHelp };
}
