// The map view: a canvas that fills its host element, a camera, and a
// redraw only when something changed (so an idle map costs nothing).
// It draws what it is given: the full map in the developer viewer, a
// faction's view (fog and all) in the game.

import { createCamera, clampToWorld, centreOn, screenToWorld } from './camera.js';
import { worldSize, HEX_SCREEN, SQRT3 } from './hexDraw.js';
import { pixelToHex } from '../core/hex.js';
import { createTerrainLayer } from './layers/terrain.js';
import { createUnitsLayer } from './layers/units.js';
import { drawGrid, drawMarkers, drawFog, drawPath, drawTileOutline } from './layers/overlays.js';
import { createRegistry } from './art/registry.js';
import { drawBorders, drawCities, drawCityWork, drawCamps } from './layers/cities.js';
import { neighbourCache } from '../sim/index.js';
import { createSpriteSheet } from './art/spriteSheet.js';

export function createMapView(host, { map, ruleset, fog = null, units = [], colours = {}, sheets: descriptors = {} }) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'map-canvas';
  host.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const registry = createRegistry(ruleset.skin);
  const world = worldSize(map);
  const reducedMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
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
    frames: 0,
    lastFrameMs: 0,
  };
  const unitsLayer = createUnitsLayer({ map, ruleset, sheets, colours, reducedMotion });
  let size = { w: 0, h: 0 };

  function resize() {
    const dpr = win.devicePixelRatio || 1;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === size.w && h === size.h && canvas.width === Math.round(w * dpr)) return;
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
    ctx.fillStyle = view.fog ? '#0b0c10' : '#1d3f5e';
    ctx.fillRect(0, 0, size.w, size.h);
    const cam = view.cam;
    const visible = { x: cam.x, y: cam.y, w: size.w / cam.zoom, h: size.h / cam.zoom };
    view.terrain.draw(ctx, cam, visible);
    drawFog(ctx, view.map, cam, visible, view.fog);
    const cityById = new Map(view.cities.map((c) => [c.id, c]));
    drawBorders(ctx, view.map, cam, view.owner, (cityId) => colours[cityById.get(cityId)?.faction] ?? '#888', neighbourCache(view.map));
    drawCityWork(ctx, view.map, cam, view.cityOverlay);
    if (view.showGrid) drawGrid(ctx, view.map, cam, visible);
    if (view.hover !== null) drawTileOutline(ctx, view.map, cam, view.hover, 'rgba(255,255,255,0.7)');
    if (view.path) drawPath(ctx, view.map, cam, view.pathFrom, view.path);
    drawCamps(ctx, view.map, cam, view.camps);
    drawCities(ctx, view.map, cam, view.cities, (f) => colours[f] ?? '#888', view.selectedCity);
    if (view.target !== null) drawTileOutline(ctx, view.map, cam, view.target, '#ff5a4a', 3);
    const walking = unitsLayer.draw(ctx, cam, view.units, { selected: view.selected, now: t0 });
    if (view.markers.length) drawMarkers(ctx, view.map, cam, view.markers);
    if (walking) dirty = true;
    view.frames += 1;
    view.lastFrameMs = win.performance.now() - t0;
  }

  function loop() {
    resize();
    if (dirty) { dirty = false; draw(); }
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
    centreOnWorld(wx, wy) { api.setCamera(centreOn(view.cam, wx, wy, size.w, size.h)); },
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
