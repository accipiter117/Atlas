// Pointy-top hex geometry for drawing.
//
// The terrain is drawn as pixel art: each hex is HEX_ART pixels from centre
// to corner on a small canvas, then scaled up ART_SCALE times with smoothing
// off, which gives crisp pixels and keeps the cached chunks small. At 100%
// zoom a hex is about 72 screen pixels wide (section 10.6).

import { hexToPixel } from '../core/hex.js';

export const ART_SCALE = 3;
export const HEX_ART = 14;
export const HEX_SCREEN = HEX_ART * ART_SCALE;
export const SQRT3 = Math.sqrt(3);

/** Corner offsets for a hex of `size`, corner i at angle 60i - 30 degrees (0 = up-right). */
export function cornerOffsets(size) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return { x: size * Math.cos(a), y: size * Math.sin(a) };
  });
}

/** The two corners an edge in hex direction d runs between. */
export function edgeCorners(d) {
  const a = (6 - d) % 6;
  return [a, (a + 1) % 6];
}

/** Centre of a tile (by row and column) in world pixels at 100% zoom, with the map's top-left hex fully on screen. */
export function tileCentre(map, i, size = HEX_SCREEN) {
  const r = Math.floor(i / map.width);
  const c = i - r * map.width;
  const p = hexToPixel({ q: c - Math.floor(r / 2), r }, size);
  return { x: p.x + (SQRT3 * size) / 2, y: p.y + size };
}

export function worldSize(map, size = HEX_SCREEN) {
  return { width: SQRT3 * size * (map.width + 0.5), height: size * (1.5 * map.height + 0.5) };
}

export function tracePath(ctx, cx, cy, corners) {
  ctx.beginPath();
  ctx.moveTo(cx + corners[0].x, cy + corners[0].y);
  for (let k = 1; k < 6; k += 1) ctx.lineTo(cx + corners[k].x, cy + corners[k].y);
  ctx.closePath();
}

/**
 * Fill a pointy-top hex as whole pixel rows, for crisp pixel art with no
 * soft edges (soft edges let a dark seam show where two hexes meet).
 * Rows overlap their neighbours by half a pixel so no gap can open.
 */
export function fillHexPixels(ctx, cx, cy, size) {
  const w = (SQRT3 / 2) * size;
  for (let dy = -size; dy < size; dy += 1) {
    const ay = Math.abs(dy + 0.5);
    const hw = (ay <= size / 2 ? w : (w * (size - ay)) / (size / 2)) + 0.5;
    const x0 = Math.floor(cx - hw);
    ctx.fillRect(x0, cy + dy, Math.ceil(cx + hw) - x0, 1);
  }
}
