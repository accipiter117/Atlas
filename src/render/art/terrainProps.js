// Tall terrain drawn as props (graphics overhaul G3, docs/OVERHAUL.md 4.1):
// mountains, hills and trees, in the same small pixel style as the terrain,
// lit from the top left with their shadows falling to the bottom right. The
// terrain layer draws them row by row after the ground, so a prop overlaps
// the hexes behind it and a mountain range reads as a range.
//
// Everything is seeded by the tile (fxRandom, the cosmetic stream), so the
// same map always looks the same and nothing here touches the game.

import { drawWorkArt } from './worksArt.js';
import { fxRandom, idSeed } from '../fxRandom.js';
import { shade } from './placeholders.js';

const SHADOW = 'rgba(20, 14, 8, 0.28)';

/** One peak: rows of pixels from the tip down, lit left of the ridge, dark right of it, snow at the top. */
function peak(ctx, x, baseY, h, colour, snow, rand) {
  const lit = shade(colour, 0.1);
  const dark = shade(colour, -0.16);
  const snowLit = snow;
  const snowDark = shade(snow, -0.16);
  const slope = 0.95 + rand() * 0.25;
  // Shadow first, cast to the bottom right.
  ctx.fillStyle = SHADOW;
  for (let k = Math.floor(h * 0.45); k < h; k += 1) {
    const hw = Math.round(k * slope);
    ctx.fillRect(x - hw + 3, baseY - h + k + 1, hw * 2 + 1, 1);
  }
  const ridge = Math.round((rand() - 0.5) * 2);
  const snowLine = Math.max(2, Math.round(h * (0.22 + rand() * 0.1)));
  for (let k = 0; k < h; k += 1) {
    const hw = Math.round(k * slope);
    const y = baseY - h + k;
    const split = x + Math.round((ridge * k) / h);
    const isSnow = k < snowLine || (k < snowLine + 2 && ((x + k) % 3 === 0));
    ctx.fillStyle = isSnow ? snowLit : lit;
    ctx.fillRect(x - hw, y, split - (x - hw) + 1, 1);
    ctx.fillStyle = isSnow ? snowDark : dark;
    ctx.fillRect(split + 1, y, x + hw - split, 1);
  }
  // A few crags on the dark side.
  ctx.fillStyle = shade(colour, -0.26);
  for (let n = 0; n < 3; n += 1) {
    const k = snowLine + 1 + Math.floor(rand() * Math.max(1, h - snowLine - 2));
    const hw = Math.round(k * slope);
    ctx.fillRect(x + 1 + Math.floor(rand() * Math.max(1, hw - 1)), baseY - h + k, 1, 1);
  }
}

/** A mountain hex: a main peak with one or two lower ones behind it, taller than the hex. */
export function drawMountain(ctx, cx, cy, colour, snow, tile) {
  const rand = fxRandom(tile, 911);
  const peaks = [
    { x: cx - 6 + Math.round(rand() * 2), base: cy + 4, h: 11 + Math.floor(rand() * 3) },
    { x: cx + 6 + Math.round(rand() * 2), base: cy + 5, h: 12 + Math.floor(rand() * 3) },
    { x: cx + Math.round((rand() - 0.5) * 2), base: cy + 9, h: 19 + Math.floor(rand() * 3) },
  ];
  if (rand() < 0.35) peaks.shift();
  for (const p of peaks) peak(ctx, p.x, p.base, p.h, colour, snow, rand);
}

/** Hills: three low mounds, lit on the left, with a shadow to the right. */
export function drawHillMounds(ctx, cx, cy, base, tile) {
  const rand = fxRandom(tile, 77);
  const rows = [3, 5, 7, 9, 9];
  const lit = shade(base, 0.1);
  const dark = shade(base, -0.16);
  const mounds = [[-5, 1], [4, -3], [2, 6]].map(([ox, oy]) => ({ x: Math.round(cx + ox + (rand() - 0.5) * 2), y: Math.round(cy + oy) }))
    .sort((a, b) => a.y - b.y);
  for (const m of mounds) {
    ctx.fillStyle = SHADOW;
    ctx.fillRect(m.x - 2, m.y + 1, 8, 1);
    rows.forEach((w, k) => {
      const y = m.y - rows.length + 1 + k;
      const x0 = m.x - Math.floor(w / 2);
      ctx.fillStyle = lit;
      ctx.fillRect(x0, y, Math.ceil(w / 2), 1);
      ctx.fillStyle = dark;
      ctx.fillRect(x0 + Math.ceil(w / 2), y, Math.floor(w / 2), 1);
    });
    ctx.fillStyle = shade(base, 0.18);
    ctx.fillRect(m.x - 1, m.y - rows.length + 1, 1, 1);
  }
}

// Tree shapes, as row widths from the top.
const CONIFER = [1, 3, 3, 5, 5, 7];
const BROADLEAF = [3, 5, 5, 5, 3];
const JUNGLE = [3, 5, 7, 7, 5];

function tree(ctx, x, y, shape, colour) {
  const lit = shade(colour, 0.11);
  const dark = shade(colour, -0.14);
  const h = shape.length;
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + 1, y + 1, Math.ceil(shape[h - 1] / 2) + 1, 1);
  ctx.fillStyle = '#4a3420';
  ctx.fillRect(x, y, 1, 1);
  shape.forEach((w, k) => {
    const row = y - h + k;
    const x0 = x - Math.floor(w / 2);
    const half = Math.ceil(w / 2);
    ctx.fillStyle = k === 0 ? lit : lit;
    ctx.fillRect(x0, row, half, 1);
    ctx.fillStyle = dark;
    ctx.fillRect(x0 + half, row, w - half, 1);
  });
  ctx.fillStyle = shade(colour, 0.2);
  ctx.fillRect(x - Math.floor(shape[1] / 2), y - h + 1, 1, 1);
}

/** Forest or jungle: trees on a jittered grid across the hex, back rows first, some reaching above it. */
export function drawTrees(ctx, cx, cy, size, featureId, colour, tile) {
  const rand = fxRandom(tile, idSeed(featureId));
  const spots = [];
  const jungle = featureId === 'jungle';
  for (let gy = -2; gy <= 2; gy += 1) {
    for (let gx = -2; gx <= 2; gx += 1) {
      const x = cx + gx * 4.2 + (gy % 2 ? 2 : 0) + (rand() - 0.5) * 2.4;
      const y = cy + gy * 4 + 3 + (rand() - 0.5) * 2;
      // Keep the trunks inside the hex.
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (dx > size * 0.74 || dy > size * 0.72 || dy > size * 0.95 - dx / Math.sqrt(3)) continue;
      if (rand() < (jungle ? 0.08 : 0.22)) continue;
      spots.push({ x: Math.round(x), y: Math.round(y), kind: rand() });
    }
  }
  spots.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of spots) {
    const shape = jungle ? JUNGLE : s.kind < 0.55 ? CONIFER : BROADLEAF;
    tree(ctx, s.x, s.y, shape, jungle ? colour : s.kind < 0.55 ? shade(colour, -0.04) : shade(colour, 0.06));
  }
}

/** Distinct small pixel art for each improvement (section 4.1), lit from the top left. */
export function drawImprovementArt(ctx, cx, cy, id, colours) {
  // K7: the war's works have their own art (worksArt.js).
  if (drawWorkArt(ctx, cx, cy, id, colours)) return;
  const ink = colours.ink;
  switch (id) {
    case 'farm': {
      // Ploughed rows of crop in a field with a darker edge.
      ctx.fillStyle = shade(colours.crop, -0.25);
      ctx.fillRect(cx - 8, cy - 6, 16, 12);
      for (let y = -5; y <= 4; y += 3) {
        ctx.fillStyle = colours.crop;
        ctx.fillRect(cx - 7, cy + y, 14, 2);
        ctx.fillStyle = shade(colours.crop, 0.15);
        ctx.fillRect(cx - 7, cy + y, 14, 1);
      }
      break;
    }
    case 'mine': {
      // A timbered entrance in a spoil heap.
      ctx.fillStyle = shade(colours.spoil, 0.08);
      for (let k = 0; k < 5; k += 1) ctx.fillRect(cx - 7 + k, cy + 4 - k, 14 - 2 * k, 1);
      ctx.fillStyle = colours.timber;
      ctx.fillRect(cx - 3, cy - 3, 7, 1);
      ctx.fillRect(cx - 3, cy - 3, 1, 6);
      ctx.fillRect(cx + 3, cy - 3, 1, 6);
      ctx.fillStyle = '#120d08';
      ctx.fillRect(cx - 2, cy - 2, 5, 5);
      ctx.fillStyle = colours.metal;
      ctx.fillRect(cx + 5, cy + 2, 3, 1);
      break;
    }
    case 'pasture': {
      // A fenced paddock with two beasts.
      ctx.fillStyle = colours.fence;
      ctx.fillRect(cx - 8, cy - 4, 16, 1);
      ctx.fillRect(cx - 8, cy + 5, 16, 1);
      for (let x = -8; x <= 8; x += 4) ctx.fillRect(cx + x, cy - 5, 1, 11);
      ctx.fillStyle = '#f1ece0';
      ctx.fillRect(cx - 5, cy, 4, 2);
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(cx + 2, cy + 1, 4, 2);
      break;
    }
    case 'plantation': {
      // Rows of bushes with lit tops.
      for (let x = -7; x <= 6; x += 4) {
        for (let y = -4; y <= 4; y += 4) {
          ctx.fillStyle = shade(colours.bush, -0.15);
          ctx.fillRect(cx + x, cy + y, 3, 2);
          ctx.fillStyle = colours.bush;
          ctx.fillRect(cx + x, cy + y - 1, 2, 2);
        }
      }
      break;
    }
    case 'quarry': {
      // Stepped cuts in pale stone.
      ctx.fillStyle = shade(colours.stone, -0.2);
      ctx.fillRect(cx - 7, cy - 4, 14, 9);
      ctx.fillStyle = colours.stone;
      ctx.fillRect(cx - 7, cy - 4, 14, 2);
      ctx.fillRect(cx - 4, cy, 11, 2);
      ctx.fillStyle = shade(colours.stone, 0.15);
      ctx.fillRect(cx - 1, cy + 3, 6, 2);
      break;
    }
    case 'camp': {
      // Two hide tents and a fire.
      for (const [ox, oy] of [[-4, -1], [4, 2]]) {
        for (let k = 0; k < 5; k += 1) {
          ctx.fillStyle = colours.hide;
          ctx.fillRect(cx + ox - k, cy + oy - 4 + k, k + 1, 1);
          ctx.fillStyle = shade(colours.hide, -0.2);
          ctx.fillRect(cx + ox + 1, cy + oy - 4 + k, k, 1);
        }
      }
      ctx.fillStyle = '#f0a030';
      ctx.fillRect(cx, cy + 4, 2, 2);
      break;
    }
    case 'fishing_boats': {
      // Two little boats with sails.
      for (const [ox, oy] of [[-4, -2], [4, 3]]) {
        ctx.fillStyle = colours.timber;
        ctx.fillRect(cx + ox - 4, cy + oy + 1, 8, 2);
        ctx.fillStyle = '#f4f1e8';
        ctx.fillRect(cx + ox, cy + oy - 4, 1, 5);
        ctx.fillRect(cx + ox + 1, cy + oy - 3, 2, 3);
      }
      break;
    }
    case 'fort': {
      // A palisade square with corner posts.
      ctx.fillStyle = shade(colours.timber, -0.15);
      ctx.fillRect(cx - 7, cy - 5, 14, 11);
      ctx.fillStyle = colours.timber;
      ctx.fillRect(cx - 7, cy - 5, 14, 2);
      ctx.fillRect(cx - 7, cy - 5, 2, 11);
      ctx.fillStyle = shade(colours.timber, -0.35);
      ctx.fillRect(cx - 4, cy - 2, 8, 6);
      ctx.fillStyle = ink;
      for (const [x, y] of [[-8, -6], [6, -6], [-8, 5], [6, 5]]) ctx.fillRect(cx + x, cy + y, 3, 2);
      break;
    }
    default:
      ctx.fillStyle = ink;
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }
}
