// Sprite sheets from the standard descriptor (section 10.6):
//   { id, src, frame: {w, h}, anchor: {x, y}, layout: 'lpc' | 'grid' | 'code', attackAnim, fps, credits }
// Atlas animations are idle, walk, attack, hurt and die, each facing n, w, s
// or e. Hex movement's six directions map to the nearest of the four.

import { lpcAnimation } from './lpc.js';

/** Hex direction (0 east, clockwise to 5 south-east) to the nearest of four facings. */
export const HEX_FACING = Object.freeze(['e', 'n', 'n', 'w', 's', 's']);

function gridAnimation(desc, anim, dir) {
  const a = desc.anims?.[anim] ?? desc.anims?.idle;
  if (!a) return { row: 0, frames: [0] };
  const dirs = a.dirs ?? ['s'];
  const k = Math.max(0, dirs.indexOf(dir));
  return { row: a.row + (dirs.length > 1 ? k : 0), frames: Array.from({ length: a.frames ?? 1 }, (_, i) => i) };
}

export function createSpriteSheet(doc, desc, { base = '' } = {}) {
  let image = null;
  let ready = false;
  if (desc.layout !== 'code' && doc) {
    image = new (doc.defaultView.Image)();
    image.onload = () => { ready = true; sheet.onReady?.(); };
    image.src = base + desc.src;
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
  };
  return sheet;
}
