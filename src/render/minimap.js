// The minimap (graphics overhaul G2, docs/OVERHAUL.md section 3): the whole
// map in one small canvas, as far as you know it. Unexplored hexes stay dark,
// hexes you remember but cannot see now are dimmed, owned land carries its
// owner's colour, cities are bright squares, and a frame shows what the big
// map is looking at. Clicking or dragging on it moves the camera there.
//
// It draws only from what it is given (your view of the world), so it can
// never reveal anything the fog hides.

import { worldSize, tileCentre, HEX_SCREEN, SQRT3 } from './hexDraw.js';
import { createRegistry } from './art/registry.js';
import { placeholderColour } from './art/placeholders.js';

/** Mix two #rrggbb colours: amount 0 gives a, 1 gives b. */
function mix(a, b, amount) {
  const p = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((n, i) => Math.round(n + (y[i] - n) * amount)).join(',')})`;
}

/** hsl() placeholders become #rrggbb so they can be mixed. */
function toHex(doc, colour) {
  if (/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const probe = doc.createElement('canvas').getContext('2d');
  probe.fillStyle = colour;
  return probe.fillStyle;
}

/** Where a point on the minimap is in the world (pure, tested in Node). */
export function minimapToWorld(layout, mx, my) {
  return { x: (mx - layout.ox) / layout.scale, y: (my - layout.oy) / layout.scale };
}

/** The scale and offset that fit the world into a w x h minimap, centred (pure). */
export function minimapLayout(world, w, h) {
  const scale = Math.min(w / world.width, h / world.height);
  return { scale, ox: (w - world.width * scale) / 2, oy: (h - world.height * scale) / 2 };
}

/**
 * @param {HTMLCanvasElement} canvas  the minimap's canvas (sized by CSS)
 * @param {object} opts  { map, ruleset, colours (faction -> colour), onJump(wx, wy) }
 */
export function createMinimap(canvas, { map, ruleset, colours = {}, onJump = () => {} }) {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const ctx = canvas.getContext('2d');
  const registry = createRegistry(ruleset.skin);
  let world = worldSize(map);
  const terrainColour = map.terrainIds.map((id) => toHex(doc, placeholderColour(registry, 'terrain', id)));
  let state = { map, fog: null, cities: [], cityFaction: new Map() };
  let camera = null;
  let viewport = { w: 0, h: 0 };
  let base = null;   // the terrain, fog and owners, redrawn only when the world changes
  let layout = null;
  let size = { w: 0, h: 0 };

  const token = (name, fallback) => win.getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;

  function resize() {
    const dpr = win.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== size.w || h !== size.h || canvas.width !== Math.round(w * dpr)) {
      size = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      base = null;
    }
    layout = minimapLayout(world, w, h);
    return true;
  }

  function drawBase() {
    const dpr = win.devicePixelRatio || 1;
    base ??= doc.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    const b = base.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = toHex(doc, token('--minimap-unexplored', '#15110c'));
    b.fillStyle = dark;
    b.fillRect(0, 0, size.w, size.h);
    const { map: m, fog } = state;
    const s = layout.scale;
    const cw = SQRT3 * HEX_SCREEN * s + 0.75;
    const ch = 1.5 * HEX_SCREEN * s + 0.75;
    for (let i = 0; i < m.terrain.length; i += 1) {
      if (fog && fog[i] === 0) continue;
      const t = m.terrain[i];
      if (t < 0) continue;
      let colour = terrainColour[t] ?? '#777777';
      const ownerCity = m.owner?.[i];
      const faction = ownerCity !== null && ownerCity !== undefined ? state.cityFaction.get(ownerCity) : null;
      if (faction && colours[faction]) colour = mix(toHex(doc, colour), toHex(doc, colours[faction]), 0.55);
      if (fog && fog[i] === 1) colour = mix(toHex(doc, colour), dark, 0.45);
      const p = tileCentre(m, i);
      b.fillStyle = colour;
      b.fillRect(layout.ox + p.x * s - cw / 2, layout.oy + p.y * s - ch / 2, cw, ch);
    }
    // Cities: a bright square with a dark edge, in the owner's colour.
    const edge = token('--ink', '#2a1f14');
    for (const c of state.cities) {
      const p = tileCentre(m, c.tile);
      const r = Math.max(2, 2.2 * HEX_SCREEN * s);
      b.fillStyle = edge;
      b.fillRect(layout.ox + p.x * s - r / 2 - 1, layout.oy + p.y * s - r / 2 - 1, r + 2, r + 2);
      b.fillStyle = colours[c.faction] ?? '#cccccc';
      b.fillRect(layout.ox + p.x * s - r / 2, layout.oy + p.y * s - r / 2, r, r);
    }
  }

  function draw() {
    if (!resize()) return;
    if (!base) drawBase();
    const dpr = win.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (!camera || !viewport.w) return;
    // The frame: what the big map shows now.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = layout.scale;
    const x = layout.ox + camera.x * s;
    const y = layout.oy + camera.y * s;
    const w = (viewport.w / camera.zoom) * s;
    const h = (viewport.h / camera.zoom) * s;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = token('--gold', '#c9a227');
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
  }

  // Click or drag to move the camera; the pointer is captured so a drag can leave the minimap.
  let dragging = false;
  const jump = (e) => {
    const r = canvas.getBoundingClientRect();
    // getBoundingClientRect is in page pixels; the canvas's own size may be zoomed by --ui-scale.
    const k = canvas.clientWidth / (r.width || 1);
    const p = minimapToWorld(layout ?? minimapLayout(world, size.w, size.h), (e.clientX - r.left) * k, (e.clientY - r.top) * k);
    onJump(Math.min(world.width, Math.max(0, p.x)), Math.min(world.height, Math.max(0, p.y)));
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
    jump(e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => { if (dragging) jump(e); });
  const stop = (e) => { dragging = false; canvas.releasePointerCapture?.(e.pointerId); };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  return {
    /** Your view of the world changed: { map, fog, cities }. */
    setWorld({ map: m, fog, cities }) {
      // Another world (K1b) may be a different size.
      if (m && (m.width !== state.map.width || m.height !== state.map.height)) world = worldSize(m);
      state = { map: m ?? state.map, fog: fog ?? state.fog, cities: cities ?? state.cities, cityFaction: new Map((cities ?? state.cities).map((c) => [c.id, c.faction])) };
      base = null;
      draw();
    },
    /** The big map's camera and viewport size moved. */
    setView(cam, vp) {
      if (camera && vp && cam.x === camera.x && cam.y === camera.y && cam.zoom === camera.zoom && vp.w === viewport.w && vp.h === viewport.h) return;
      camera = { ...cam };
      viewport = { ...vp };
      draw();
    },
    redraw() { base = null; draw(); },
    get layout() { return layout; },
  };
}
