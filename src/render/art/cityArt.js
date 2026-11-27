// Cities drawn in code (graphics overhaul G5, docs/OVERHAUL.md 4.4): a cluster
// of buildings that grows through four size tiers, built in a style that
// follows the owner's era and the skin (ancient mudbrick and stone, medieval
// stone and tile, the Witcher's timber, thatch and slate, Killzone's bunkers,
// pylons and floodlights), a wall ring when the city has walls, and the
// faction's banner on its tallest building. Lit from the top left like the
// terrain. Each look is drawn once at pixel-art size and cached.
//
// All the layout randomness comes from fxRandom seeded by the city's tile,
// so a city always looks the same and nothing here touches the game.

import { fxRandom } from '../fxRandom.js';
import { shade } from './placeholders.js';

export const CITY_W = 44;  // art pixels
export const CITY_H = 48;
export const CITY_BASE = 39; // the row that sits on the hex centre line (plus a little)
const TOP = 8; // headroom above the tallest landmark and its flag

/** The size tier for a population: 1 village (1 to 3), 2 town (4 to 6), 3 city (7 to 10), 4 great city (11+). */
export function cityTier(pop) {
  return pop >= 11 ? 4 : pop >= 7 ? 3 : pop >= 4 ? 2 : 1;
}

// Palettes per style: walls (lit, base, shade), roofs, and accents.
export const CITY_STYLES = {
  ancient: { wall: '#d2b98a', roof: '#a9875a', roofAlt: '#b86b45', trim: '#efe3c6', stone: '#dcd6c8', door: '#4a3220', flat: true },
  stone: { wall: '#bdb5a6', roof: '#a5452f', roofAlt: '#7b4a33', trim: '#e4ddd0', stone: '#cfc8ba', door: '#3e2a1a', flat: false },
  timber: { wall: '#e6dabd', roof: '#b39445', roofAlt: '#4f5a63', trim: '#4a3624', stone: '#9ea3a5', door: '#3a2818', flat: false, beams: true },
  bunker: { wall: '#74777a', roof: '#4a4d50', roofAlt: '#5c5f62', trim: '#9da2a6', stone: '#8a8d90', door: '#2a2c2e', flat: true, bunker: true },
};

/** Which style a city uses: the skin's choice for the owner's era, else its default, else ancient. */
export function styleFor(skinCityArt, era) {
  return skinCityArt?.eras?.[era] ?? skinCityArt?.style ?? 'ancient';
}

function px(g) {
  return {
    rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  };
}

/** One building: a box with a pitched or flat roof, lit from the top left, a door and windows. */
function building(p, x, base, w, h, s, rand, { tall = false } = {}) {
  const wall = s.wall;
  const lit = shade(wall, 0.08);
  const dark = shade(wall, -0.14);
  const top = base - h;
  // Shadow to the bottom right.
  p.rect(x + 2, base, w, 1, 'rgba(20, 14, 8, 0.3)');
  p.rect(x + w, top + 2, 2, h - 1, 'rgba(20, 14, 8, 0.22)');
  p.rect(x, top, w, h, wall);
  p.rect(x, top, 1, h, lit);
  p.rect(x + w - 1, top, 1, h, dark);
  if (s.beams) {
    p.rect(x, top, w, 1, s.trim);
    p.rect(x, top + Math.floor(h / 2), w, 1, s.trim);
    for (let bx = x; bx < x + w; bx += 3) p.rect(bx, top, 1, h, s.trim);
  }
  // Door and a window or two.
  p.rect(x + Math.floor(w / 2) - 1, base - 3, 2, 3, s.door);
  if (w >= 6) p.rect(x + 1, top + 2, 1, 1, s.bunker ? '#ffcf6a' : s.door);
  if (w >= 8) p.rect(x + w - 3, top + 2, 1, 1, s.bunker ? '#ffcf6a' : s.door);
  // Roof.
  const roof = rand() < 0.3 ? s.roofAlt : s.roof;
  if (s.flat) {
    p.rect(x - 1, top - 1, w + 2, 2, roof);
    p.rect(x - 1, top - 1, w + 2, 1, shade(roof, 0.12));
    if (s.bunker) p.rect(x + 1, top - 2, w - 2, 1, shade(roof, -0.1));
  } else {
    const rh = Math.ceil(w / 2) + (tall ? 1 : 0);
    for (let k = 0; k < rh; k += 1) {
      const y = top - rh + k;
      const half = Math.min(Math.ceil(w / 2) + 1, k + 1);
      const cx = x + w / 2;
      p.rect(cx - half, y, half, 1, shade(roof, 0.1));
      p.rect(cx, y, half, 1, shade(roof, -0.12));
    }
  }
}

/** A tall landmark for bigger places: a temple (ancient), a church tower (stone), a keep (timber), a comms pylon (bunker). */
function landmark(p, x, base, s, tier, rand) {
  if (s.bunker) {
    // A pylon with a red light and a floodlight mast.
    for (let y = base - 22; y < base; y += 1) { p.rect(x, y, 1, 1, '#5a5d60'); if (y % 3 === 0) p.rect(x - 1, y, 3, 1, '#7a7d80'); }
    p.rect(x, base - 23, 1, 1, '#ff4030');
    p.rect(x + 8, base - 15, 1, 15, '#6a6d70');
    p.rect(x + 7, base - 16, 3, 2, '#fff2b0');
    return base - 23;
  }
  if (s.flat) {
    // A columned temple on a stepped base.
    const w = tier >= 4 ? 14 : 12;
    p.rect(x - 1, base - 2, w + 2, 2, shade(s.stone, -0.1));
    for (let c = 0; c < w; c += 3) { p.rect(x + c, base - 9, 1, 7, s.stone); p.rect(x + c + 1, base - 9, 1, 7, shade(s.stone, -0.18)); }
    p.rect(x - 1, base - 10, w + 2, 1, s.trim);
    for (let k = 0; k < 4; k += 1) p.rect(x + k, base - 11 - k, w - 2 * k, 1, k < 2 ? shade(s.stone, 0.08) : s.stone);
    return base - 15;
  }
  // A tower with a pointed roof.
  const h = tier >= 4 ? 20 : 16;
  p.rect(x, base - h, 5, h, s.beams ? s.stone : s.wall);
  p.rect(x, base - h, 1, h, shade(s.beams ? s.stone : s.wall, 0.1));
  p.rect(x + 4, base - h, 1, h, shade(s.beams ? s.stone : s.wall, -0.16));
  p.rect(x + 2, base - h + 4, 1, 2, s.door);
  const roof = s.beams ? s.roofAlt : s.roof;
  for (let k = 0; k < 5; k += 1) { p.rect(x + 2 - Math.floor(k / 2), base - h - 5 + k, Math.floor(k / 2) + 1, 1, shade(roof, 0.1)); p.rect(x + 3, base - h - 5 + k, Math.floor(k / 2), 1, shade(roof, -0.12)); }
  return base - h - 5;
  // (rand kept for future variety)
}

/** The wall ring: an oval of wall with towers, the back half drawn before the buildings, the front after. */
function walls(p, s, half) {
  const cx = CITY_W / 2;
  const cy = CITY_BASE - TOP - 2;
  const rx = 19;
  const ry = 8;
  const stone = s.bunker ? '#5f6264' : s.stone;
  for (let a = 0; a < Math.PI * 2; a += 0.035) {
    const front = Math.sin(a) > 0;
    if (front !== (half === 'front')) continue;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    p.rect(x, y - 3, 1, 3, Math.cos(a) < 0 ? shade(stone, 0.08) : shade(stone, -0.12));
    if (Math.round(a * 100) % 14 === 0) p.rect(x, y - 4, 1, 1, stone);
  }
  if (half === 'front') {
    for (const a of [0.5, 1.6, 2.6]) {
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      p.rect(x - 1, y - 6, 3, 6, stone);
      p.rect(x - 1, y - 6, 1, 6, shade(stone, 0.1));
      p.rect(x - 1, y - 7, 1, 1, stone);
      p.rect(x + 1, y - 7, 1, 1, stone);
    }
  }
}

/**
 * Draw a city into a new canvas (CITY_W x CITY_H art pixels).
 * opts: { tier, style (a key of CITY_STYLES), walls, colour (faction), seed }
 * Returns { canvas, chimneys: [{x, y}], flag: {x, y} } in art pixels, for smoke and banners.
 */
export function drawCityArt(doc, { tier, style, walls: hasWalls, colour, seed }) {
  const c = doc.createElement('canvas');
  c.width = CITY_W;
  c.height = CITY_H;
  const g = c.getContext('2d');
  g.translate(0, TOP);
  const p = px(g);
  const s = CITY_STYLES[style] ?? CITY_STYLES.ancient;
  const rand = fxRandom(seed, 4401);
  if (hasWalls) walls(p, s, 'back');
  // Building plots by tier, back rows first: [x, base, w, h].
  const plots = [
    [[15, 28, 7, 5], [23, 30, 6, 4]],
    [[10, 25, 6, 5], [24, 24, 7, 6], [14, 30, 7, 5], [26, 31, 6, 4]],
    [[8, 23, 6, 6], [20, 21, 0, 0], [28, 23, 7, 6], [6, 29, 7, 5], [15, 31, 7, 6], [27, 31, 7, 5]],
    [[6, 21, 6, 6], [20, 19, 0, 0], [30, 21, 7, 7], [3, 27, 7, 6], [13, 27, 6, 5], [26, 27, 6, 6], [34, 28, 6, 5], [9, 33, 7, 6], [20, 34, 7, 5], [29, 33, 6, 5]],
  ][Math.max(0, Math.min(3, tier - 1))];
  const chimneys = [];
  let flag = { x: 20, y: 18 };
  for (const [x, base, w, h] of plots) {
    if (!w) {
      const top = landmark(p, x, base, s, tier, rand);
      flag = { x: x + 2, y: top - 1 };
      continue;
    }
    const ww = w + (rand() < 0.4 ? 1 : 0);
    const hh = h + (rand() < 0.4 ? 1 : 0);
    building(p, x, base, ww, hh, s, rand);
    if (!s.bunker && rand() < 0.45) { p.rect(x + ww - 2, base - hh - 3, 1, 2, shade(s.wall, -0.3)); chimneys.push({ x: x + ww - 2, y: base - hh - 4 }); }
  }
  if (tier === 1) flag = { x: 18, y: 20 };
  if (hasWalls) walls(p, s, 'front');
  // The banner: a pole and a flag in the faction's colour.
  p.rect(flag.x, flag.y - 7, 1, 7, '#2a1d12');
  p.rect(flag.x + 1, flag.y - 7, 5, 3, colour);
  p.rect(flag.x + 1, flag.y - 7, 5, 1, shade(colour, 0.15));
  return { canvas: c, chimneys: chimneys.map((ch) => ({ x: ch.x, y: ch.y + TOP })), flag: { x: flag.x, y: flag.y + TOP } };
}
