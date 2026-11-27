// The terrain layer, cached in chunks of 16 x 16 hexes (sections 3.1 and 11.6
// of docs/PLAN.md), redrawn for the graphics overhaul G3 (docs/OVERHAUL.md 4.1).
//
// Each chunk is drawn once at pixel-art resolution into its own offscreen
// canvas, then every frame only copies the chunks on screen, scaled up with
// smoothing off, so panning costs the same as before. Building a chunk:
//
//   1. The ground, pixel by pixel: each pixel finds its hex and the nearest
//      hex edge, and close to an edge it dithers into the neighbour's colour
//      (an ordered 4x4 pattern anchored to the world, so chunks meet
//      seamlessly). Water meeting land gets a line of foam on the water side
//      and a fringe of beach on the land side; deep and shallow water blend.
//      Explored land fraying into unexplored land (or the world's edge) is
//      left see-through, so the parchment drawn behind shows through.
//   2. Ground patterns, rivers (wider towards the sea, with a light centre)
//      and dirt roads with stones and bridges.
//   3. Props, row by row from the back: hills, mountains and trees, lit from
//      the top left and taller than their hex, so they overlap the row behind.
//   4. Improvements. (Resources are tokens drawn each frame at screen resolution: layers/overlays.js.)
//
// The strategic view (below 60% zoom) uses a second, simpler set of chunks:
// the blended ground and rivers only.

import { HEX_ART, ART_SCALE, SQRT3, cornerOffsets, edgeCorners } from '../hexDraw.js';
import { placeholderColour, drawTerrainPattern, drawFeature, shade } from '../art/placeholders.js';
import { drawMountain, drawHillMounds, drawTrees, drawImprovementArt } from '../art/terrainProps.js';
import { neighbourCache } from '../../sim/index.js';
import { fxRandom } from '../fxRandom.js';

export const CHUNK = 16;
// Props may rise this many art pixels above the top of their hex.
const PROP_TOP = 10;
const BLEND = 3;       // art pixels either side of an edge where two land terrains mix
const WATER_BLEND = 4; // the same between deep and shallow water
const FRAY = 3;        // how far explored land frays into the unexplored
const FOG_BLEND = 4;   // art pixels either side of an edge where the fog of war dithers out (G9)
const FOG_RGBA = [28, 30, 36, 133]; // the fog wash over land you have seen but cannot see now
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const D = SQRT3 * HEX_ART; // distance between neighbouring hex centres, in art pixels
const INNER2 = (D / 2 - Math.max(BLEND, WATER_BLEND, FRAY, 4)) ** 2; // closer than this to the centre, no edge is near

/** Centre of a tile in art pixels (unscaled), matching hexDraw.tileCentre / ART_SCALE. */
function artCentre(map, i) {
  const r = Math.floor(i / map.width);
  const c = i - r * map.width;
  return { x: SQRT3 * HEX_ART * (c + (r % 2) / 2) + (SQRT3 * HEX_ART) / 2, y: 1.5 * HEX_ART * r + HEX_ART };
}

/** Any CSS colour as [r, g, b] (via a canvas, so hsl() placeholders work too). */
function rgbOf(doc, colour) {
  let hex = colour;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    const probe = doc.createElement('canvas').getContext('2d');
    probe.fillStyle = '#000000';
    probe.fillStyle = colour;
    hex = probe.fillStyle;
  }
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [128, 128, 128];
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const hexOf = ([r, g, b]) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
const mixRgb = (a, b, k) => a.map((v, n) => Math.round(v + (b[n] - v) * k));

export function createTerrainLayer(doc, initialMap, ruleset, registry) {
  let map = initialMap;
  const chunksX = Math.ceil(map.width / CHUNK);
  const chunksY = Math.ceil(map.height / CHUNK);
  const cache = new Map();
  const colourOf = (group, id) => placeholderColour(registry, group, id);
  const terrainColour = map.terrainIds.map((id) => hexOf(rgbOf(doc, colourOf('terrain', id))));
  const terrainRgb = terrainColour.map((c) => rgbOf(doc, c));
  const featureColour = map.featureIds.map((id) => colourOf('feature', id));
  const roles = map.terrainIds.map((id) => ruleset.terrain[id]?.mapgen?.role ?? (ruleset.terrain[id]?.water ? 'ocean' : 'land'));
  const water = map.terrainIds.map((id) => ruleset.terrain[id]?.water === true);
  const mountain = roles.map((r) => r === 'mountain');
  const mapColour = (id) => colourOf('map', id);
  const foamRgb = rgbOf(doc, mapColour('foam'));
  const beachRgb = rgbOf(doc, mapColour('beach'));
  const snow = hexOf(rgbOf(doc, mapColour('snow')));
  const river = { edge: mapColour('river'), light: mapColour('riverLight') };
  const road = { track: mapColour('road'), stone: mapColour('roadStone'), bridge: mapColour('bridge') };
  const improvementColours = {
    ink: mapColour('ink'), crop: mapColour('crop'), spoil: mapColour('spoil'), timber: mapColour('timber'), metal: mapColour('metal'),
    fence: mapColour('fence'), bush: mapColour('bush'), stone: mapColour('stone'), hide: mapColour('hide'),
  };
  // Shallow water by the shore is a touch lighter than open water of the same kind.
  const shoreRgb = terrainRgb.map((c) => mixRgb(c, [255, 255, 255], 0.08));

  const nbs = neighbourCache(map);
  // Neighbour offsets in art pixels, by direction (the same for every hex).
  const probe = Math.min(map.height - 2, 2) * map.width + Math.min(map.width - 2, 2);
  const pc = artCentre(map, probe);
  const delta = nbs[probe].map((j) => { const q = artCentre(map, j); return { x: q.x - pc.x, y: q.y - pc.y }; });
  const centres = new Float64Array(map.width * map.height * 2);
  for (let i = 0; i < map.width * map.height; i += 1) { const p = artCentre(map, i); centres[i * 2] = p.x; centres[i * 2 + 1] = p.y; }
  const nearWater = (i) => nbs[i].some((j) => j >= 0 && map.terrain[j] >= 0 && water[map.terrain[j]]);

  function bounds(cx, cy) {
    const c0 = cx * CHUNK;
    const r0 = cy * CHUNK;
    const x = SQRT3 * HEX_ART * c0 - 2;
    const y = 1.5 * HEX_ART * r0 - 2 - PROP_TOP;
    const w = SQRT3 * HEX_ART * (CHUNK + 1) + 4;
    const h = 1.5 * HEX_ART * CHUNK + HEX_ART * 0.5 + 4 + PROP_TOP;
    return { x: Math.floor(x), y: Math.floor(y), w: Math.ceil(w), h: Math.ceil(h) };
  }

  /** Step 1: the ground, blended and frayed, straight into pixels. */
  function ground(ctx, b) {
    const img = ctx.createImageData(b.w, b.h);
    const data = img.data;
    const W = map.width;
    const H = map.height;
    for (let py = 0; py < b.h; py += 1) {
      const Y = b.y + py;
      for (let px = 0; px < b.w; px += 1) {
        const X = b.x + px;
        // Which hex (pixelToHex in core/hex.js, inlined: this runs for every pixel).
        const ax = X + 0.5 - D / 2;
        const ay = Y + 0.5 - HEX_ART;
        const fq = ((SQRT3 / 3) * ax - ay / 3) / HEX_ART;
        const fr = ((2 / 3) * ay) / HEX_ART;
        const fs = -fq - fr;
        let q = Math.round(fq);
        let r = Math.round(fr);
        const rs = Math.round(fs);
        const eq = Math.abs(q - fq);
        const er = Math.abs(r - fr);
        const es = Math.abs(rs - fs);
        if (eq > er && eq > es) q = -r - rs;
        else if (er > es) r = -q - rs;
        const c = q + Math.floor(r / 2);
        if (r < 0 || r >= H || c < 0 || c >= W) continue;
        const i = r * W + c;
        const t = map.terrain[i];
        if (t < 0) continue;
        // The nearest edge: s = distance from the pixel to the edge shared with neighbour d.
        const dx = X + 0.5 - centres[i * 2];
        const dy = Y + 0.5 - centres[i * 2 + 1];
        let s = Infinity;
        let dir = 0;
        // Deep inside the hex nothing blends: skip the edge search.
        if (dx * dx + dy * dy < INNER2) {
          const k = (py * b.w + px) * 4;
          const rgb = terrainRgb[t];
          data[k] = rgb[0];
          data[k + 1] = rgb[1];
          data[k + 2] = rgb[2];
          data[k + 3] = 255;
          continue;
        }
        for (let d = 0; d < 6; d += 1) {
          const sd = D / 2 - (dx * delta[d].x + dy * delta[d].y) / D;
          if (sd < s) { s = sd; dir = d; }
        }
        const j = nbs[i][dir];
        const tj = j >= 0 ? map.terrain[j] : -1;
        const B = BAYER[(Y & 3) * 4 + (X & 3)];
        let rgb = terrainRgb[t];
        if (tj < 0) {
          // Fray into the unexplored (or the world's edge): leave it see-through.
          if (s < FRAY && B > s / FRAY) continue;
        } else if (water[t] && !water[tj]) {
          if (s < 1.25 && B < 0.8) rgb = foamRgb;
          else if (s < 4) rgb = shoreRgb[t];
        } else if (!water[t] && water[tj]) {
          if (s < 1.6 && B < 0.75 && !mountain[t]) rgb = mixRgb(beachRgb, rgb, 0.25);
        } else if (t !== tj) {
          const w = water[t] ? WATER_BLEND : BLEND;
          if (s < w && B < 0.5 * (1 - s / w)) rgb = terrainRgb[tj];
        }
        const k = (py * b.w + px) * 4;
        data[k] = rgb[0];
        data[k + 1] = rgb[1];
        data[k + 2] = rgb[2];
        data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Rivers along hex edges: 3 pixels wide with a light centre, 4 where they meet the sea. */
  function rivers(ctx, b, tiles) {
    const corners = cornerOffsets(HEX_ART);
    ctx.lineCap = 'round';
    for (const pass of ['edge', 'light']) {
      ctx.strokeStyle = river[pass];
      for (const i of tiles) {
        if (!map.river[i] || map.terrain[i] < 0) continue;
        const p = artCentre(map, i);
        const wide = nearWater(i);
        ctx.lineWidth = pass === 'edge' ? (wide ? 4 : 3) : 1;
        for (let d = 0; d < 6; d += 1) {
          if (!(map.river[i] & (1 << d))) continue;
          const [a, c] = edgeCorners(d);
          ctx.beginPath();
          ctx.moveTo(p.x - b.x + corners[a].x, p.y - b.y + corners[a].y);
          ctx.lineTo(p.x - b.x + corners[c].x, p.y - b.y + corners[c].y);
          ctx.stroke();
        }
      }
    }
  }

  /** Dirt roads: a track from each road hex towards its road neighbours, stones along it, bridges over rivers. */
  function roads(ctx, b, tiles) {
    for (const i of tiles) {
      if (!map.road?.[i] || map.terrain[i] < 0) continue;
      const p = artCentre(map, i);
      const x0 = Math.round(p.x - b.x);
      const y0 = Math.round(p.y - b.y);
      const rand = fxRandom(i, 4242);
      let joined = false;
      for (let d = 0; d < 6; d += 1) {
        const j = nbs[i][d];
        if (j < 0 || !map.road[j] || map.terrain[j] < 0) continue;
        const q = artCentre(map, j);
        const mx = Math.round((p.x + q.x) / 2 - b.x);
        const my = Math.round((p.y + q.y) / 2 - b.y);
        ctx.strokeStyle = road.track;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.fillStyle = road.stone;
        for (let n = 1; n < 3; n += 1) {
          const k = n / 3 + (rand() - 0.5) * 0.1;
          ctx.fillRect(Math.round(x0 + (mx - x0) * k), Math.round(y0 + (my - y0) * k), 1, 1);
        }
        // A bridge where the road crosses a river on this edge.
        if (map.river[i] & (1 << d)) {
          const nx = -(my - y0);
          const ny = mx - x0;
          const len = Math.hypot(nx, ny) || 1;
          ctx.strokeStyle = road.bridge;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(mx - (mx - x0) * 0.35, my - (my - y0) * 0.35);
          ctx.lineTo(mx + (mx - x0) * 0.2, my + (my - y0) * 0.2);
          ctx.stroke();
          ctx.fillStyle = shade(road.bridge, -0.2);
          ctx.fillRect(Math.round(mx + (nx / len) * 2.5) - 1, Math.round(my + (ny / len) * 2.5), 2, 1);
          ctx.fillRect(Math.round(mx - (nx / len) * 2.5) - 1, Math.round(my - (ny / len) * 2.5), 2, 1);
        }
        joined = true;
      }
      if (!joined) { ctx.fillStyle = road.track; ctx.fillRect(x0 - 2, y0 - 1, 4, 2); }
    }
  }

  function build(cx, cy, simple) {
    const b = bounds(cx, cy);
    const canvas = doc.createElement('canvas');
    canvas.width = b.w;
    canvas.height = b.h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ground(ctx, b);
    // Every tile whose art can reach this chunk: one row and column beyond it each way.
    const tiles = [];
    for (let r = Math.max(0, cy * CHUNK - 1); r < Math.min(map.height, (cy + 1) * CHUNK + 1); r += 1) {
      for (let c = Math.max(0, cx * CHUNK - 1); c < Math.min(map.width, (cx + 1) * CHUNK + 1); c += 1) tiles.push(r * map.width + c);
    }
    const at = (i) => { const p = artCentre(map, i); return { x: Math.round(p.x - b.x), y: Math.round(p.y - b.y) }; };
    if (!simple) {
      for (const i of tiles) {
        const t = map.terrain[i];
        if (t < 0 || mountain[t]) continue;
        const p = at(i);
        drawTerrainPattern(ctx, p.x, p.y, HEX_ART - 2, map.terrainIds[t], roles[t], terrainColour[t], i);
        const f = map.feature[i];
        if (f >= 0 && !['forest', 'jungle'].includes(map.featureIds[f])) drawFeature(ctx, p.x, p.y, HEX_ART, map.featureIds[f], featureColour[f], i);
      }
    }
    rivers(ctx, b, tiles);
    if (simple) return { canvas, b };
    roads(ctx, b, tiles);
    // Props, back rows first (tiles are in row order).
    for (const i of tiles) {
      const t = map.terrain[i];
      if (t < 0) continue;
      const p = at(i);
      if (mountain[t]) drawMountain(ctx, p.x, p.y, terrainColour[t], snow, i);
      else if (map.hills[i]) drawHillMounds(ctx, p.x, p.y, terrainColour[t], i);
      const f = map.feature[i];
      if (f >= 0 && ['forest', 'jungle'].includes(map.featureIds[f])) drawTrees(ctx, p.x, p.y, HEX_ART, map.featureIds[f], featureColour[f], i);
    }
    for (const i of tiles) {
      if (map.terrain[i] < 0) continue;
      const p = at(i);
      if (map.improvement?.[i] >= 0) drawImprovementArt(ctx, p.x, p.y, map.improvementIds[map.improvement[i]], improvementColours);

    }
    return { canvas, b };
  }

  function chunk(cx, cy, simple) {
    const key = (cy * chunksX + cx) * 2 + (simple ? 1 : 0);
    if (!cache.has(key)) cache.set(key, build(cx, cy, simple));
    return cache.get(key);
  }

  /** Draw the visible chunks. `view` is the visible world rectangle at 100% zoom; `simple` is the strategic view. */
  function draw(ctx, cam, view, simple = false) {
    const scale = ART_SCALE * cam.zoom;
    for (let cy = 0; cy < chunksY; cy += 1) {
      for (let cx = 0; cx < chunksX; cx += 1) {
        const b = bounds(cx, cy);
        const wx = b.x * ART_SCALE;
        const wy = b.y * ART_SCALE;
        if (wx > view.x + view.w || wy > view.y + view.h || wx + b.w * ART_SCALE < view.x || wy + b.h * ART_SCALE < view.y) continue;
        const ch = chunk(cx, cy, simple);
        ctx.drawImage(ch.canvas, Math.round((wx - cam.x) * cam.zoom), Math.round((wy - cam.y) * cam.zoom), Math.ceil(b.w * scale), Math.ceil(b.h * scale));
      }
    }
  }

  /**
   * Water sparkle (cosmetic, only when motion is allowed): a few bright pixels on the
   * water in view that come and go with time. `now` in ms.
   */
  function drawSparkle(ctx, cam, view, fog, now) {
    const rowH = HEX_ART * ART_SCALE * 1.5;
    const colW = D * ART_SCALE;
    const r0 = Math.max(0, Math.floor(view.y / rowH) - 1);
    const r1 = Math.min(map.height - 1, Math.ceil((view.y + view.h) / rowH) + 1);
    const c0 = Math.max(0, Math.floor(view.x / colW) - 1);
    const c1 = Math.min(map.width - 1, Math.ceil((view.x + view.w) / colW) + 1);
    const bucket = Math.floor(now / 600);
    const px = Math.max(1, Math.round(ART_SCALE * cam.zoom));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const i = r * map.width + c;
        const t = map.terrain[i];
        if (t < 0 || !water[t] || (fog && fog[i] !== 2)) continue;
        const rand = fxRandom(i, bucket);
        if (rand() > 0.3) continue;
        const p = artCentre(map, i);
        const x = (p.x + (rand() - 0.5) * HEX_ART) * ART_SCALE;
        const y = (p.y + (rand() - 0.5) * HEX_ART) * ART_SCALE;
        ctx.fillRect(Math.round((x - cam.x) * cam.zoom), Math.round((y - cam.y) * cam.zoom), px * 2, px);
      }
    }
  }

  // ---- The fog of war (graphics overhaul G9) ----
  // Drawn like the ground: per art pixel, in chunks, dithering across the edge between fogged
  // and visible hexes with the same world-anchored pattern, so no hex outline shows (at sea
  // above all). A chunk is rebuilt only when the fog over it changes.
  const fogCache = new Map();

  function fogSignature(fog, cx, cy) {
    let h = 2166136261;
    for (let r = Math.max(0, cy * CHUNK - 1); r < Math.min(map.height, (cy + 1) * CHUNK + 1); r += 1) {
      for (let c = Math.max(0, cx * CHUNK - 1); c < Math.min(map.width, (cx + 1) * CHUNK + 1); c += 1) {
        h = Math.imul(h ^ fog[r * map.width + c], 16777619);
      }
    }
    return h;
  }

  function buildFog(fog, cx, cy) {
    const b = bounds(cx, cy);
    const canvas = doc.createElement('canvas');
    canvas.width = b.w;
    canvas.height = b.h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(b.w, b.h);
    const data = img.data;
    const W = map.width;
    const H = map.height;
    let any = false;
    for (let py = 0; py < b.h; py += 1) {
      const Y = b.y + py;
      for (let px = 0; px < b.w; px += 1) {
        const X = b.x + px;
        const ax = X + 0.5 - D / 2;
        const ay = Y + 0.5 - HEX_ART;
        const fq = ((SQRT3 / 3) * ax - ay / 3) / HEX_ART;
        const fr = ((2 / 3) * ay) / HEX_ART;
        const fs = -fq - fr;
        let q = Math.round(fq);
        let r = Math.round(fr);
        const rs = Math.round(fs);
        const eq = Math.abs(q - fq);
        const er = Math.abs(r - fr);
        const es = Math.abs(rs - fs);
        if (eq > er && eq > es) q = -r - rs;
        else if (er > es) r = -q - rs;
        const c = q + Math.floor(r / 2);
        if (r < 0 || r >= H || c < 0 || c >= W) continue;
        const i = r * W + c;
        if (fog[i] === 0 || map.terrain[i] < 0) continue;
        const own = fog[i] === 1;
        const dx = X + 0.5 - centres[i * 2];
        const dy = Y + 0.5 - centres[i * 2 + 1];
        let fogged = own;
        if (dx * dx + dy * dy >= INNER2) {
          let s = Infinity;
          let dir = 0;
          for (let d = 0; d < 6; d += 1) {
            const sd = D / 2 - (dx * delta[d].x + dy * delta[d].y) / D;
            if (sd < s) { s = sd; dir = d; }
          }
          const j = nbs[i][dir];
          const B = BAYER[(Y & 3) * 4 + (X & 3)];
          if (j < 0 || fog[j] === 0 || map.terrain[j] < 0) {
            // The ground frays here into the parchment: leave the same pixels clear.
            if (s < FRAY && B > s / FRAY) continue;
          } else if ((fog[j] === 1) !== own && s < FOG_BLEND && B < 0.5 * (1 - s / FOG_BLEND)) {
            fogged = !own;
          }
        }
        if (!fogged) continue;
        const k = (py * b.w + px) * 4;
        data[k] = FOG_RGBA[0];
        data[k + 1] = FOG_RGBA[1];
        data[k + 2] = FOG_RGBA[2];
        data[k + 3] = FOG_RGBA[3];
        any = true;
      }
    }
    if (any) ctx.putImageData(img, 0, 0);
    return { canvas: any ? canvas : null, b };
  }

  /** Draw the fog of war over the chunks in view (fog: 0 unexplored, 1 seen before, 2 visible). */
  function drawFog(ctx, cam, view, fog) {
    if (!fog) return;
    const scale = ART_SCALE * cam.zoom;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (let cy = 0; cy < chunksY; cy += 1) {
      for (let cx = 0; cx < chunksX; cx += 1) {
        const b = bounds(cx, cy);
        const wx = b.x * ART_SCALE;
        const wy = b.y * ART_SCALE;
        if (wx > view.x + view.w || wy > view.y + view.h || wx + b.w * ART_SCALE < view.x || wy + b.h * ART_SCALE < view.y) continue;
        const key = cy * chunksX + cx;
        const sig = fogSignature(fog, cx, cy);
        let ch = fogCache.get(key);
        if (!ch || ch.sig !== sig || ch.map !== map) { ch = { ...buildFog(fog, cx, cy), sig, map }; fogCache.set(key, ch); }
        if (ch.canvas) ctx.drawImage(ch.canvas, Math.round((wx - cam.x) * cam.zoom), Math.round((wy - cam.y) * cam.zoom), Math.ceil(b.w * scale), Math.ceil(b.h * scale));
      }
    }
    ctx.imageSmoothingEnabled = smooth;
  }

  /** Swap in newer map data (more of it explored) and redraw only the chunks those tiles touch. */
  function update(newMap, changed) {
    map = newMap;
    for (const i of changed) {
      const r = Math.floor(i / map.width);
      const c = i - r * map.width;
      // A tile also appears in the border of neighbouring chunks.
      for (const dr of [-1, 0, 1]) {
        for (const dc of [-1, 0, 1]) {
          const cy = Math.floor((r + dr) / CHUNK);
          const cx = Math.floor((c + dc) / CHUNK);
          if (cx >= 0 && cy >= 0 && cx < chunksX && cy < chunksY) {
            cache.delete((cy * chunksX + cx) * 2);
            cache.delete((cy * chunksX + cx) * 2 + 1);
          }
        }
      }
    }
  }

  /** Build one not-yet-built chunk near the view (call when the page is idle); false when there is none. */
  function prebuild(view, simple = false) {
    const margin = 1;
    for (let cy = 0; cy < chunksY; cy += 1) {
      for (let cx = 0; cx < chunksX; cx += 1) {
        if (cache.has((cy * chunksX + cx) * 2 + (simple ? 1 : 0))) continue;
        const b = bounds(cx, cy);
        const wx = b.x * ART_SCALE;
        const wy = b.y * ART_SCALE;
        const ww = b.w * ART_SCALE;
        const wh = b.h * ART_SCALE;
        if (wx > view.x + view.w + ww * margin || wy > view.y + view.h + wh * margin || wx + ww * (1 + margin) < view.x || wy + wh * (1 + margin) < view.y) continue;
        chunk(cx, cy, simple);
        return true;
      }
    }
    return false;
  }

  return { draw, drawSparkle, drawFog, update, prebuild, chunkCount: chunksX * chunksY, builtCount: () => cache.size, shade };
}
