// The map view: a canvas that fills its host element, a camera, and a
// redraw only when something changed (so an idle map costs nothing).
// It draws what it is given: the full map in the developer viewer, a
// faction's view (fog and all) in the game.

import { createCamera, clampToWorld, screenToWorld, worldToScreen } from './camera.js';
import { worldSize, tileCentre, HEX_SCREEN, SQRT3, ART_SCALE } from './hexDraw.js';
import { loadIconAtlas, drawIcon } from './art/icons.js';
import { pixelToHex } from '../core/hex.js';
import { createTerrainLayer } from './layers/terrain.js';
import { createUnitsLayer } from './layers/units.js';
import { drawGrid, drawMarkers, drawFog, drawPath, drawTileOutline, drawFront, drawResources } from './layers/overlays.js';
import { createRegistry } from './art/registry.js';
import { placeholderColour, shade } from './art/placeholders.js';
import { fxRandom } from './fxRandom.js';
import { drawCityArt, cityTier, styleFor } from './art/cityArt.js';
import { drawBorders, drawCities, drawCityWork, drawCamps } from './layers/cities.js';
import { neighbourCache } from '../sim/index.js';
import { createSpriteSheet } from './art/spriteSheet.js';

export function createMapView(host, { map, ruleset, fog = null, units = [], colours = {}, civs = {}, sheets: descriptors = {} }) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'map-canvas';
  host.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const registry = createRegistry(ruleset.skin);
  const world = worldSize(map);
  // The Settings choice wins over the device's own preference.
  const reducedMotion = () => {
    const setting = doc.documentElement?.dataset?.motion;
    if (setting === 'reduce') return true;
    if (setting === 'full') return false;
    return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  };
  const sheets = {};
  let dirty = true;
  for (const [id, desc] of Object.entries(descriptors)) {
    sheets[id] = createSpriteSheet(doc, desc);
    sheets[id].onReady = () => { dirty = true; };
  }
  const view = {
    cam: createCamera(),
    showGrid: false,
    markers: [],
    map,
    fog,
    units,
    selected: null,
    cities: [],
    owner: null,
    cityOverlay: null,
    selectedCity: null,
    camps: [],
    target: null,
    hover: null,
    path: null,
    pathFrom: null,
    terrain: createTerrainLayer(doc, map, ruleset, registry),
    atWar: new Set(),
    cityExtras: {},
    ambient: true,
    strategic: false,
    frames: 0,
    lastFrameMs: 0,
  };
  const unitsLayer = createUnitsLayer({ map, ruleset, sheets, colours, civs, reducedMotion });
  let size = { w: 0, h: 0 };
  // The parts of the canvas covered by floating panels (graphics overhaul G2): centring
  // aims at the middle of what is left, and ensureVisible keeps a hex out from under them.
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  // The yield overlay: a function tile -> { food, production, ... } or null when off.
  let yieldsAt = null;
  let atlas = null;
  let lastView = null;
  let lastAmbient = 0;
  let idleQueued = false;
  let parchment = null;
  // Below this zoom the map switches to the strategic view (section 4.1).
  const STRATEGIC = 0.6;
  const screenOf = (cam, t) => { const p = tileCentre(view.map, t); return worldToScreen(cam, p.x, p.y); };
  const YIELD_ORDER = ['food', 'production', 'gold', 'science', 'culture', 'faith'];

  function resize() {
    const dpr = win.devicePixelRatio || 1;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === size.w && h === size.h && canvas.width === Math.round(w * dpr)) return;
    // Keep the same spot in the middle when the map area changes size (a phone's
    // bottom sheet opening or closing, or the phone turning on its side).
    if (size.w && size.h && view.cam) {
      view.cam = clampToWorld({ ...view.cam, x: view.cam.x + (size.w - w) / 2 / view.cam.zoom, y: view.cam.y + (size.h - h) / 2 / view.cam.zoom }, world, w, h);
    }
    size = { w, h };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    dirty = true;
  }

  function draw() {
    const t0 = win.performance.now();
    const dpr = win.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const cam = view.cam;
    // Unexplored land and the world beyond its edge: parchment with ink clouds (the game);
    // the developer viewer, which sees everything, keeps its plain sea blue.
    if (view.fog) drawParchment(cam, t0);
    else { ctx.fillStyle = '#1d3f5e'; ctx.fillRect(0, 0, size.w, size.h); }
    const visible = { x: cam.x, y: cam.y, w: size.w / cam.zoom, h: size.h / cam.zoom };
    const strategic = cam.zoom < STRATEGIC;
    view.strategic = strategic;
    view.terrain.draw(ctx, cam, visible, strategic);
    if (ambient()) view.terrain.drawSparkle(ctx, cam, visible, view.fog, t0);
    drawFog(ctx, view.map, cam, visible, view.fog);
    if (view.front) drawFront(ctx, view.map, cam, visible, view.front, neighbourCache(view.map));
    const cityById = new Map(view.cities.map((c) => [c.id, c]));
    drawBorders(ctx, view.map, cam, view.owner, (cityId) => cityById.get(cityId)?.faction ?? null, (f) => colours[f] ?? '#888', neighbourCache(view.map), view.atWar, visible);
    if (!strategic) drawResources(ctx, view.map, cam, visible, atlas, (id) => placeholderColour(registry, 'resource', ruleset.resources[id]?.class ?? id));
    drawCityWork(ctx, view.map, cam, view.cityOverlay);
    if (view.showGrid) drawGrid(ctx, view.map, cam, visible);
    if (view.hover !== null) drawTileOutline(ctx, view.map, cam, view.hover, 'rgba(255,255,255,0.5)');
    if (view.path) drawPath(ctx, view.map, cam, view.pathFrom, view.path);
    drawCamps(ctx, view.map, cam, view.camps);
    const cities = (pass) => drawCities(ctx, view.map, cam, view.cities, (f) => colours[f] ?? '#888', view.selectedCity, view.religionLens, strategic,
      { art: cityArt, extras: view.cityExtras, atlas, now: t0, smoke: ambient(), pass });
    // The towns go under the units; their name plates go on top so they always read.
    cities('art');
    if (view.target !== null) drawTileOutline(ctx, view.map, cam, view.target, '#ff5a4a', 3);
    loadAtlas();
    const walking = unitsLayer.draw(ctx, cam, view.units, { selected: view.selected, now: t0, strategic, atlas, cityTiles: new Set(view.cities.map((c) => c.tile)) });
    cities('plate');
    if (view.markers.length) drawMarkers(ctx, view.map, cam, view.markers);
    if (yieldsAt) drawYieldOverlay(cam, visible);
    if (walking) dirty = true;
    view.frames += 1;
    view.lastFrameMs = win.performance.now() - t0;
  }

  /** Yield icons on every hex you know of in view, repeated once per point (up to four), on a dark plate. */
  function drawYieldOverlay(cam, visible) {
    const style = win.getComputedStyle(host);
    const size = Math.max(8, Math.round(11 * cam.zoom));
    const gap = size + 1;
    const rowH = HEX_SCREEN * 1.5;
    const colW = HEX_SCREEN * SQRT3;
    const r0 = Math.max(0, Math.floor(visible.y / rowH) - 1);
    const r1 = Math.min(view.map.height - 1, Math.ceil((visible.y + visible.h) / rowH) + 1);
    const c0 = Math.max(0, Math.floor(visible.x / colW) - 1);
    const c1 = Math.min(view.map.width - 1, Math.ceil((visible.x + visible.w) / colW) + 1);
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const i = r * view.map.width + c;
        if (view.fog && view.fog[i] === 0) continue;
        const y = yieldsAt(i);
        if (!y) continue;
        const icons = [];
        for (const k of YIELD_ORDER) for (let n = 0; n < Math.min(4, Math.floor(y[k] ?? 0)); n += 1) icons.push(k);
        if (!icons.length) continue;
        const perRow = Math.min(icons.length, icons.length > 4 ? Math.ceil(icons.length / 2) : 4);
        const rows = Math.ceil(icons.length / perRow);
        const p = screenOf(cam, i);
        const top = p.y + 6 * cam.zoom;
        ctx.fillStyle = 'rgba(20, 14, 8, 0.55)';
        ctx.fillRect(Math.round(p.x - (perRow * gap) / 2 - 2), Math.round(top - 2), perRow * gap + 3, rows * gap + 3);
        icons.forEach((k, n) => {
          const row = Math.floor(n / perRow);
          const inRow = Math.min(perRow, icons.length - row * perRow);
          const x = p.x - (inRow * gap) / 2 + (n % perRow) * gap + gap / 2;
          const yy = top + row * gap + gap / 2;
          if (!drawIcon(ctx, atlas, k, x, yy, size)) {
            ctx.fillStyle = style.getPropertyValue(`--y-${k}`).trim() || '#ccc';
            ctx.beginPath();
            ctx.arc(x, yy, size / 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    }
  }

  // City looks (graphics overhaul G5), drawn once per size, style, walls and colour.
  const cityLooks = new Map();
  const cityArt = {
    get(c) {
      const extra = view.cityExtras[c.id] ?? {};
      const tier = cityTier(c.pop);
      const style = styleFor(ruleset.skin?.cityArt, extra.era);
      const colour = colours[c.faction] ?? '#888888';
      const key = `${c.id}|${tier}|${style}|${extra.walls ? 1 : 0}|${colour}`;
      if (!cityLooks.has(key)) {
        if (cityLooks.size > 600) cityLooks.clear();
        cityLooks.set(key, drawCityArt(doc, { tier, style, walls: Boolean(extra.walls), colour, seed: c.tile }));
      }
      return cityLooks.get(key);
    },
  };

  /** Water sparkle and drifting clouds: cosmetic, only in the game, never with reduced motion. */
  const ambient = () => Boolean(view.fog) && view.ambient && !reducedMotion();

  /** The parchment tile: 160 art pixels square, speckled, with curling ink clouds; tiles seamlessly. */
  function parchmentTile() {
    const n = 160;
    const c = doc.createElement('canvas');
    c.width = n;
    c.height = n;
    const p = c.getContext('2d');
    const base = placeholderColour(registry, 'map', 'parchment');
    const ink = placeholderColour(registry, 'map', 'parchmentInk');
    p.fillStyle = base;
    p.fillRect(0, 0, n, n);
    const rand = fxRandom(64, 7);
    const dot = (x, y) => p.fillRect(((Math.round(x) % n) + n) % n, ((Math.round(y) % n) + n) % n, 1, 1);
    p.fillStyle = shade(base, -0.05);
    for (let k = 0; k < 800; k += 1) dot(rand() * n, rand() * n);
    p.fillStyle = shade(base, 0.05);
    for (let k = 0; k < 500; k += 1) dot(rand() * n, rand() * n);
    // Two clouds: a row of puffs (half circles) with a curl at one end, in faded ink.
    p.fillStyle = ink;
    p.globalAlpha = 0.32;
    for (const [ox, oy] of [[14, 30], [92, 96], [40, 140]]) {
      for (let k = 0; k < 3; k += 1) {
        const cx = ox + k * 7;
        const r = 4 + (k % 2);
        for (let a = Math.PI; a <= Math.PI * 2; a += 0.12) dot(cx + Math.cos(a) * r, oy + Math.sin(a) * r);
      }
      for (let x = ox - 4; x <= ox + 18; x += 1) dot(x, oy);
      for (let a = 0; a < Math.PI * 3; a += 0.15) { const r = 1 + a * 0.7; dot(ox + 24 + Math.cos(a) * r, oy - 2 + Math.sin(a) * r); }
    }
    p.globalAlpha = 1;
    return c;
  }

  function drawParchment(cam, now) {
    if (!parchment) parchment = ctx.createPattern(parchmentTile(), 'repeat');
    const k = ART_SCALE * cam.zoom;
    const drift = ambient() ? (now / 1000) * 3 : 0;
    parchment.setTransform?.(new win.DOMMatrix([k, 0, 0, k, -(cam.x - drift) * cam.zoom, -cam.y * cam.zoom]));
    ctx.fillStyle = parchment;
    ctx.fillRect(0, 0, size.w, size.h);
  }

  function loadAtlas() {
    if (atlas || !win.fetch) return;
    atlas = { ready: false };
    win.fetch('assets/icons.json').then((r) => (r.ok ? r.json() : null)).then((layout) => {
      if (!layout) return;
      atlas = loadIconAtlas(win, layout);
      atlas.image?.addEventListener('load', () => { dirty = true; });
    }).catch(() => {});
  }

  function loop() {
    resize();
    const now = win.performance.now();
    if (ambient() && now - lastAmbient > 150) { lastAmbient = now; dirty = true; }
    if (dirty) { dirty = false; draw(); }
    // When nothing else is happening, build the terrain chunks just outside the view, one at a time,
    // so panning into them later does not have to.
    if (!dirty && win.requestIdleCallback && !idleQueued) {
      idleQueued = true;
      win.requestIdleCallback(() => {
        idleQueued = false;
        const cam = view.cam;
        view.terrain.prebuild({ x: cam.x, y: cam.y, w: size.w / cam.zoom, h: size.h / cam.zoom }, view.strategic);
      }, { timeout: 500 });
    }
    const cam = view.cam;
    if (api.onView && (!lastView || lastView.x !== cam.x || lastView.y !== cam.y || lastView.zoom !== cam.zoom || lastView.w !== size.w || lastView.h !== size.h)) {
      lastView = { ...cam, w: size.w, h: size.h };
      api.onView(cam, { ...size });
    }
    if (!api.destroyed) win.requestAnimationFrame(loop);
  }

  const api = {
    canvas,
    world,
    stats: view,
    destroyed: false,
    get camera() { return view.cam; },
    setCamera(cam) {
      view.cam = clampToWorld(cam, world, size.w, size.h);
      dirty = true;
    },
    /** Centre on a world point: the middle of the area the panels leave clear. */
    centreOnWorld(wx, wy) {
      const cx = insets.left + Math.max(0, size.w - insets.left - insets.right) / 2;
      const cy = insets.top + Math.max(0, size.h - insets.top - insets.bottom) / 2;
      api.setCamera({ ...view.cam, x: wx - cx / view.cam.zoom, y: wy - cy / view.cam.zoom });
    },
    /** Which parts of the canvas floating panels cover: { top, right, bottom, left } in CSS pixels. */
    setInsets(next) { insets = { top: 0, right: 0, bottom: 0, left: 0, ...next }; },
    get insets() { return { ...insets }; },
    /** Is a hex's centre in the clear area (with a margin), not under a panel? */
    isClear(t, margin = 48) {
      const p = screenOf(view.cam, t);
      return p.x >= insets.left + margin && p.x <= size.w - insets.right - margin && p.y >= insets.top + margin && p.y <= size.h - insets.bottom - margin;
    },
    /** Bring a hex into the clear area if a panel (or the edge) hides it. */
    ensureVisible(t) { if (!api.isClear(t)) api.centreOnTile(t); },
    /** Hex to screen (CSS pixels on the canvas), for placing things over the map. */
    tileToScreen(t) { return screenOf(view.cam, t); },
    /** The yield overlay: fn(tile) -> yields, or null to turn it off. */
    setYieldOverlay(fn) { yieldsAt = fn; if (fn) loadAtlas(); dirty = true; },
    /** Per city: { era, walls, maxHp, producing, build: { icon, turns } } (graphics overhaul G5). */
    setCityExtras(extras) { view.cityExtras = extras ?? {}; dirty = true; },
    /** Factions you are at war with: their borders are drawn dashed. */
    setWar(factions) { view.atWar = new Set(factions); dirty = true; },
    /** Water sparkle and cloud drift on or off (they also stop with reduced motion). */
    setAmbient(on) { view.ambient = on; dirty = true; },
    /** The sprite sheet a unit type uses for a faction (for portraits), or null. */
    sheetFor: (type, faction) => unitsLayer.sheetFor(type, faction),
    /** Called with (camera, viewport) whenever either changes (the minimap's frame). */
    onView: null,
    centreOnTile(t) {
      const r = Math.floor(t / view.map.width);
      const c = t - r * view.map.width;
      api.centreOnWorld(SQRT3 * HEX_SCREEN * (c + (r % 2) / 2 + 0.5), HEX_SCREEN * (1.5 * r + 1));
    },
    /** The tile under a point on the canvas, or -1. */
    tileAt(sx, sy) {
      const w = screenToWorld(view.cam, sx, sy);
      const h = pixelToHex(w.x - (SQRT3 * HEX_SCREEN) / 2, w.y - HEX_SCREEN, HEX_SCREEN);
      const c = h.q + Math.floor(h.r / 2);
      if (h.r < 0 || h.r >= view.map.height || c < 0 || c >= view.map.width) return -1;
      return h.r * view.map.width + c;
    },
    /** Update what the player knows: map arrays (for newly explored tiles), fog and units. */
    setWorld({ map: newMap, fog: newFog, units: newUnits, cities: newCities, camps: newCamps }) {
      if (newMap && view.fog && newFog) {
        // Redraw the chunks where something on the ground changed: newly explored hexes, improvements, roads.
        const old = view.map;
        const changed = [];
        for (let i = 0; i < newFog.length; i += 1) {
          if ((view.fog[i] === 0) !== (newFog[i] === 0) || old.improvement?.[i] !== newMap.improvement?.[i] || old.road?.[i] !== newMap.road?.[i]) changed.push(i);
        }
        if (changed.length) view.terrain.update(newMap, changed);
      }
      if (newMap) view.map = newMap;
      if (newFog) view.fog = newFog;
      if (newUnits) view.units = newUnits;
      if (newCities) view.cities = newCities;
      if (newCamps) view.camps = newCamps;
      view.owner = view.map.owner ?? null;
      dirty = true;
    },
    /** The open city's worked tiles, locks and tile prices (or null to clear). */
    setCityOverlay(cityId, overlay) { view.selectedCity = cityId; view.cityOverlay = overlay; dirty = true; },
    animateMove(unitId, path) { unitsLayer.animate(unitId, path, win.performance.now()); dirty = true; },
    isAnimating: () => unitsLayer.isAnimating(),
    setSelection(unitId) { view.selected = unitId; dirty = true; },
    setHover(tile) { if (view.hover !== tile) { view.hover = tile; dirty = true; } },
    setPath(from, plan) { view.pathFrom = from; view.path = plan; dirty = true; },
    /** Ring a hex in red (an enemy you are aiming at), or clear it with null. */
    setTarget(tile) { if (view.target !== tile) { view.target = tile; dirty = true; } },
    setGrid(on) { view.showGrid = on; dirty = true; },
    setMarkers(tiles) { view.markers = tiles; dirty = true; },
    /** The religion lens: { cityId: [{ colour, n }] } or null to hide it. */
    setReligionLens(lens) { view.religionLens = lens; dirty = true; },
    /** The front line (phase 19): { control, sites, colours, letters }, or null. */
    setFront(front) { view.front = front; dirty = true; },
    redraw() { dirty = true; },
    /** Draw immediately (for timing tests). */
    drawNow() { resize(); draw(); return view.lastFrameMs; },
    viewport() { return { ...size }; },
    destroy() { api.destroyed = true; },
  };
  resize();
  api.centreOnWorld(world.width / 2, world.height / 2);
  win.requestAnimationFrame(loop);
  return api;
}
