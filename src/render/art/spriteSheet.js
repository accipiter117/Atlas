// Sprite sheets from the standard descriptor (section 10.6):
//   { id, src, frame: {w, h}, anchor: {x, y}, layout: 'lpc' | 'grid' | 'code', attackAnim, fps, credits,
//     tint, mapScale, portrait: { row, col, x, y, w, h } }
// Atlas animations are idle, walk, attack, hurt and die, each facing n, w, s
// or e. Hex movement's six directions map to the nearest of the four.
//
// Faction colour (graphics overhaul G4): a sheet with "tint" has parts drawn
// in a reserved mask colour (red equal to blue, no green, red at least 48);
// frameFor() recolours a frame to a faction's colour the first time it is
// asked for and keeps it, so a sheet is shared by every faction.

import { lpcAnimation } from './lpc.js';

/** Hex direction (0 east, clockwise to 5 south-east) to the nearest of four facings. */
export const HEX_FACING = Object.freeze(['e', 'n', 'n', 'w', 's', 's']);
const MAX_TINTED = 4000; // frames kept per sheet before the cache starts again

function gridAnimation(desc, anim, dir) {
  const a = desc.anims?.[anim] ?? desc.anims?.idle;
  if (!a) return { row: 0, frames: [0] };
  const dirs = a.dirs ?? ['s'];
  const k = Math.max(0, dirs.indexOf(dir === 'n' ? 'w' : dir === 's' ? 'e' : dir));
  return { row: a.row + (dirs.length > 1 ? k : 0), frames: Array.from({ length: a.frames ?? 1 }, (_, i) => i) };
}

/** '#rrggbb' to [r, g, b] (anything else is grey). */
export function rgbOf(colour) {
  if (!/^#[0-9a-f]{6}$/i.test(colour ?? '')) return [136, 136, 136];
  const n = parseInt(colour.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** Recolour mask pixels in place: the mask's brightness becomes shading of the faction colour. */
export function recolour(data, rgb) {
  for (let k = 0; k < data.length; k += 4) {
    if (!data[k + 3] || data[k + 1] !== 0 || data[k] !== data[k + 2] || data[k] < 48) continue;
    const t = ((data[k] - 48) / 207) * 1.3;
    for (let q = 0; q < 3; q += 1) data[k + q] = Math.round(t <= 1 ? rgb[q] * (0.35 + 0.65 * t) : rgb[q] + (255 - rgb[q]) * (t - 1) * 0.6);
  }
}

export function createSpriteSheet(doc, desc, { base = '' } = {}) {
  let image = null;
  let ready = false;
  const tinted = new Map();
  if (desc.layout !== 'code' && doc) {
    image = new (doc.defaultView.Image)();
    image.onload = () => { ready = true; sheet.onReady?.(); };
    image.src = base + desc.src;
  }

  /** A frame recoloured to `colour` (cached), as a small canvas. */
  function tintedFrame(sx, sy, sw, sh, colour) {
    const key = `${colour}|${sx}|${sy}`;
    let c = tinted.get(key);
    if (c) return c;
    if (tinted.size > MAX_TINTED) tinted.clear();
    c = doc.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const g = c.getContext('2d');
    g.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    try {
      const img = g.getImageData(0, 0, sw, sh);
      recolour(img.data, rgbOf(colour));
      g.putImageData(img, 0, 0);
    } catch { /* an image from another origin cannot be read: draw it untinted */ }
    tinted.set(key, c);
    return c;
  }

  const sheet = {
    desc,
    get ready() { return ready; },
    get image() { return image; },
    onReady: null,
    /** Source rectangle for an animation frame at time `ms`. */
    frame(anim, dir, ms = 0) {
      const a = desc.layout === 'lpc' ? lpcAnimation(anim, dir, desc.attackAnim) : gridAnimation(desc, anim, dir);
      const step = Math.floor((ms / 1000) * (desc.fps ?? 8)) % a.frames.length;
      const col = a.frames[step];
      return { sx: col * desc.frame.w, sy: a.row * desc.frame.h, sw: desc.frame.w, sh: desc.frame.h };
    },
    /** What to draw for a frame in a faction's colour: { img, sx, sy, sw, sh }. */
    frameFor(anim, dir, ms, colour) {
      const f = sheet.frame(anim, dir, ms);
      if (!desc.tint || !colour) return { img: image, ...f };
      return { img: tintedFrame(f.sx, f.sy, f.sw, f.sh, colour), sx: 0, sy: 0, sw: f.sw, sh: f.sh };
    },
    /**
     * Draw the unit's portrait (head and shoulders, from the descriptor's "portrait" box)
     * into a canvas context, filling `size` pixels, in a faction's colour. Returns false
     * when the sheet is not loaded yet.
     */
    drawPortrait(ctx, size, colour) {
      if (!ready) return false;
      const p = desc.portrait ?? { row: 10, col: 0, x: 16, y: 8, w: 32, h: 32 };
      const sx = p.col * desc.frame.w;
      const sy = p.row * desc.frame.h;
      const src = desc.tint && colour ? tintedFrame(sx, sy, desc.frame.w, desc.frame.h, colour) : null;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      if (src) ctx.drawImage(src, p.x, p.y, p.w, p.h, 0, 0, size, size);
      else ctx.drawImage(image, sx + p.x, sy + p.y, p.w, p.h, 0, 0, size, size);
      return true;
    },
  };
  return sheet;
}
