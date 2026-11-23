// The map view: a canvas that fills its host element, a camera, and a
// redraw only when something changed (so an idle map costs nothing).

import { createCamera, clampToWorld, centreOn } from './camera.js';
import { worldSize } from './hexDraw.js';
import { createTerrainLayer } from './layers/terrain.js';
import { drawGrid, drawMarkers } from './layers/overlays.js';
import { createRegistry } from './art/registry.js';

export function createMapView(host, { map, ruleset }) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'map-canvas';
  host.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const registry = createRegistry(ruleset.skin);
  const world = worldSize(map);
  const view = {
    cam: createCamera(),
    showGrid: false,
    markers: [],
    terrain: createTerrainLayer(doc, map, ruleset, registry),
    frames: 0,
    lastFrameMs: 0,
  };
  let dirty = true;
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
    ctx.fillStyle = '#1d3f5e';
    ctx.fillRect(0, 0, size.w, size.h);
    const cam = view.cam;
    const visible = { x: cam.x, y: cam.y, w: size.w / cam.zoom, h: size.h / cam.zoom };
    view.terrain.draw(ctx, cam, visible);
    if (view.showGrid) drawGrid(ctx, map, cam, visible);
    if (view.markers.length) drawMarkers(ctx, map, cam, view.markers);
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
