// Code-drawn placeholder art (section 10.5): a base colour per terrain plus a
// seeded pixel pattern (grass tufts, hill bumps, forest trees, waves), so the
// map is readable and pleasant with no image files at all.
//
// Patterns use fxRandom (cosmetic), never the game's random stream.

import { fxRandom, idSeed } from '../fxRandom.js';

// Default colours by terrain role, used when the skin does not name one.
const DEFAULTS = {
  terrain: {
    grassland: '#6f9a3e', plains: '#a7a052', desert: '#dcc27c', tundra: '#8b9479', snow: '#e8eef0',
    coast: '#4d8db5', ocean: '#285e8c', lake: '#4f97b8', mountain: '#7b7268',
  },
  feature: { forest: '#2f5a2a', jungle: '#2d6b35', marsh: '#5f7d63', floodplain: '#8fa35a', oasis: '#3f9bb5', reef: '#e48c8c' },
  resource: { bonus: '#f4e6a1', luxury: '#c77dd8', strategic: '#c9c9c9' },
  // Graphics overhaul G3: the colours of everything else on the map (a skin's "placeholders.map" overrides any).
  map: {
    parchment: '#d8c59a', parchmentInk: '#6b5434', foam: '#e8f3f4', beach: '#d9c58c', snow: '#eef2f4',
    river: '#3f86ad', riverLight: '#8fc8df', road: '#7d5f35', roadStone: '#b7a27c', bridge: '#6b4a2b',
    ink: '#3b2a17', crop: '#d8c26a', spoil: '#8c7a62', timber: '#7a5530', metal: '#c2c7cc', fence: '#e3d6b8',
    bush: '#4c7a2c', stone: '#c4bdb1', hide: '#b08454',
  },
};

function hashColour(id) {
  const h = (idSeed(id) >>> 0) % 360;
  return `hsl(${h} 35% 50%)`;
}

export function placeholderColour(registry, group, id) {
  return registry.placeholders?.[group]?.[id] ?? DEFAULTS[group]?.[id] ?? hashColour(id);
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour (remembered, as the terrain asks for the same ones often). */
const SHADES = new Map();
export function shade(hex, amount) {
  const key = `${hex}|${amount}`;
  let out = SHADES.get(key);
  if (out === undefined) { out = shadeOf(hex, amount); SHADES.set(key, out); }
  return out;
}

function shadeOf(hex, amount) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Is a point inside a pointy-top hex of `size` centred at the origin? */
function inside(x, y, size) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const w = (Math.sqrt(3) / 2) * size;
  return ax <= w - 0.5 && ay <= size - 0.5 && ay <= size - ax / Math.sqrt(3) - 0.5;
}

function dots(ctx, cx, cy, size, rand, count, colour, w = 1, h = 1) {
  ctx.fillStyle = colour;
  for (let n = 0; n < count; n += 1) {
    const x = Math.round((rand() * 2 - 1) * size);
    const y = Math.round((rand() * 2 - 1) * size);
    if (inside(x, y, size - 1)) ctx.fillRect(cx + x, cy + y, w, h);
  }
}

/** Pattern for a base terrain. `tile` seeds the pattern so every tile differs but never changes. */
export function drawTerrainPattern(ctx, cx, cy, size, terrainId, role, base, tile) {
  const rand = fxRandom(tile, idSeed(terrainId));
  if (role === 'ocean' || role === 'coast' || role === 'lake') {
    ctx.fillStyle = shade(base, 0.12);
    for (let n = 0; n < 3; n += 1) {
      const x = Math.round((rand() * 2 - 1) * size * 0.6);
      const y = Math.round((rand() * 2 - 1) * size * 0.6);
      ctx.fillRect(cx + x, cy + y, 3, 1);
    }
  } else if (role === 'mountain') {
    for (let n = 0; n < 2; n += 1) {
      const x = Math.round(cx + (n ? 3 : -4) + (rand() - 0.5) * 2);
      const y = Math.round(cy + (n ? 2 : -1));
      const h = n ? 6 : 8;
      for (let k = 0; k < h; k += 1) {
        ctx.fillStyle = shade(base, -0.12);
        ctx.fillRect(x - k, y - h + k + 3, k * 2 + 1, 1);
      }
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(x - 1, y - h + 3, 3, 2);
    }
  } else {
    dots(ctx, cx, cy, size, rand, 9, shade(base, 0.09));
    dots(ctx, cx, cy, size, rand, 7, shade(base, -0.1));
  }
}

export function drawFeature(ctx, cx, cy, size, featureId, colour, tile) {
  const rand = fxRandom(tile, idSeed(featureId));
  switch (featureId) {
    case 'forest':
    case 'jungle': {
      const count = featureId === 'jungle' ? 9 : 7;
      for (let n = 0; n < count; n += 1) {
        const x = Math.round(cx + (rand() * 2 - 1) * size * 0.62);
        const y = Math.round(cy + (rand() * 2 - 1) * size * 0.55);
        ctx.fillStyle = colour;
        ctx.fillRect(x - 1, y - 1, 3, 2);
        ctx.fillRect(x, y - 2, 1, 1);
        ctx.fillStyle = shade(colour, -0.12);
        ctx.fillRect(x, y + 1, 1, 1);
      }
      break;
    }
    case 'marsh':
      ctx.fillStyle = colour;
      for (let n = 0; n < 5; n += 1) ctx.fillRect(Math.round(cx + (rand() * 2 - 1) * size * 0.55), Math.round(cy + (rand() * 2 - 1) * size * 0.5), 3, 1);
      break;
    case 'floodplain':
      ctx.fillStyle = colour;
      for (let y = -4; y <= 4; y += 4) ctx.fillRect(cx - 5, cy + y, 10, 1);
      break;
    case 'oasis':
      ctx.fillStyle = colour;
      ctx.fillRect(cx - 2, cy - 1, 5, 3);
      ctx.fillStyle = '#2f7a3f';
      ctx.fillRect(cx - 4, cy - 3, 2, 2);
      ctx.fillRect(cx + 3, cy - 2, 2, 2);
      break;
    default:
      dots(ctx, cx, cy, size, rand, 6, colour, 2, 1);
  }
}
