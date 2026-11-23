// The terrain layer, cached in chunks of 16 x 16 hexes (section 3.1 and 11.6).
//
// Each chunk is drawn once, at pixel-art resolution, into its own offscreen
// canvas: base terrain, hills, features, rivers and resource gems. Every
// frame then only copies the chunks that are on screen, scaled up with
// smoothing off, which keeps panning a Huge map at full speed.

import { HEX_ART, ART_SCALE, SQRT3, cornerOffsets, edgeCorners, fillHexPixels } from '../hexDraw.js';
import { placeholderColour, drawTerrainPattern, drawHills, drawFeature, drawResource, shade } from '../art/placeholders.js';

export const CHUNK = 16;

/** Centre of a tile in art pixels (unscaled), matching hexDraw.tileCentre / ART_SCALE. */
function artCentre(map, i) {
  const r = Math.floor(i / map.width);
  const c = i - r * map.width;
  return { x: SQRT3 * HEX_ART * (c + (r % 2) / 2) + (SQRT3 * HEX_ART) / 2, y: 1.5 * HEX_ART * r + HEX_ART };
}

export function createTerrainLayer(doc, initialMap, ruleset, registry) {
  let map = initialMap;
  const chunksX = Math.ceil(map.width / CHUNK);
  const chunksY = Math.ceil(map.height / CHUNK);
  const cache = new Map();
  const terrainColour = map.terrainIds.map((id) => placeholderColour(registry, 'terrain', id));
  const featureColour = map.featureIds.map((id) => placeholderColour(registry, 'feature', id));
  const resourceColour = map.resourceIds.map((id) => placeholderColour(registry, 'resource', ruleset.resources[id]?.class ?? id));
  const roles = map.terrainIds.map((id) => ruleset.terrain[id]?.mapgen?.role ?? (ruleset.terrain[id]?.water ? 'ocean' : 'land'));
  const riverColour = placeholderColour(registry, 'terrain', 'lake');

  function bounds(cx, cy) {
    const c0 = cx * CHUNK;
    const r0 = cy * CHUNK;
    const x = SQRT3 * HEX_ART * c0 - 2;
    const y = 1.5 * HEX_ART * r0 - 2;
    const w = SQRT3 * HEX_ART * (CHUNK + 1) + 4;
    const h = 1.5 * HEX_ART * CHUNK + HEX_ART * 0.5 + 4;
    return { x: Math.floor(x), y: Math.floor(y), w: Math.ceil(w), h: Math.ceil(h) };
  }

  function tilesIn(cx, cy) {
    const out = [];
    for (let r = cy * CHUNK; r < Math.min(map.height, (cy + 1) * CHUNK); r += 1) {
      for (let c = cx * CHUNK; c < Math.min(map.width, (cx + 1) * CHUNK); c += 1) out.push(r * map.width + c);
    }
    return out;
  }

  function build(cx, cy) {
    const b = bounds(cx, cy);
    const canvas = doc.createElement('canvas');
    canvas.width = b.w;
    canvas.height = b.h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Draw a one-tile border of neighbouring chunks first so hex edges meet cleanly.
    const tiles = [];
    for (let r = Math.max(0, cy * CHUNK - 1); r < Math.min(map.height, (cy + 1) * CHUNK + 1); r += 1) {
      for (let c = Math.max(0, cx * CHUNK - 1); c < Math.min(map.width, (cx + 1) * CHUNK + 1); c += 1) tiles.push(r * map.width + c);
    }
    for (const i of tiles) {
      const p = artCentre(map, i);
      const x = Math.round(p.x - b.x);
      const y = Math.round(p.y - b.y);
      const t = map.terrain[i];
      if (t < 0) continue; // unexplored: left black
      const base = terrainColour[t];
      ctx.fillStyle = base;
      fillHexPixels(ctx, x, y, HEX_ART);
      drawTerrainPattern(ctx, x, y, HEX_ART, map.terrainIds[t], roles[t], base, i);
      if (map.hills[i]) drawHills(ctx, x, y, base, i);
      if (map.feature[i] >= 0) drawFeature(ctx, x, y, HEX_ART, map.featureIds[map.feature[i]], featureColour[map.feature[i]], i);
    }
    // Rivers along hex edges: each edge drawn once, from the tile that owns directions 0 to 2.
    ctx.strokeStyle = riverColour;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const edgeCornerPts = cornerOffsets(HEX_ART);
    for (const i of tiles) {
      if (!map.river[i] || map.terrain[i] < 0) continue;
      const p = artCentre(map, i);
      for (let d = 0; d < 6; d += 1) {
        if (!(map.river[i] & (1 << d))) continue;
        const [a, c] = edgeCorners(d);
        ctx.beginPath();
        ctx.moveTo(p.x - b.x + edgeCornerPts[a].x, p.y - b.y + edgeCornerPts[a].y);
        ctx.lineTo(p.x - b.x + edgeCornerPts[c].x, p.y - b.y + edgeCornerPts[c].y);
        ctx.stroke();
      }
    }
    for (const i of tilesIn(cx, cy)) {
      if (map.resource[i] < 0 || map.terrain[i] < 0) continue;
      const p = artCentre(map, i);
      drawResource(ctx, Math.round(p.x - b.x), Math.round(p.y - b.y), resourceColour[map.resource[i]]);
    }
    return { canvas, b };
  }

  function chunk(cx, cy) {
    const key = cy * chunksX + cx;
    if (!cache.has(key)) cache.set(key, build(cx, cy));
    return cache.get(key);
  }

  /** Draw the visible chunks. `view` is the visible world rectangle at 100% zoom. */
  function draw(ctx, cam, view) {
    const scale = ART_SCALE * cam.zoom;
    for (let cy = 0; cy < chunksY; cy += 1) {
      for (let cx = 0; cx < chunksX; cx += 1) {
        const b = bounds(cx, cy);
        const wx = b.x * ART_SCALE;
        const wy = b.y * ART_SCALE;
        if (wx > view.x + view.w || wy > view.y + view.h || wx + b.w * ART_SCALE < view.x || wy + b.h * ART_SCALE < view.y) continue;
        const ch = chunk(cx, cy);
        ctx.drawImage(ch.canvas, Math.round((wx - cam.x) * cam.zoom), Math.round((wy - cam.y) * cam.zoom), Math.ceil(b.w * scale), Math.ceil(b.h * scale));
      }
    }
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
          if (cx >= 0 && cy >= 0 && cx < chunksX && cy < chunksY) cache.delete(cy * chunksX + cx);
        }
      }
    }
  }

  return { draw, update, chunkCount: chunksX * chunksY, builtCount: () => cache.size, shade };
}
