#!/usr/bin/env node
// The icon set (graphics overhaul G1, docs/OVERHAUL.md section 2): about 60
// pixel icons, 16x16, drawn in code from simple shapes, so every one is
// original art and any can be redrawn by changing a few numbers. Light comes
// from the top left.
//
// Writes:
//   assets/icons.svg        one SVG sprite (a <symbol id="i-<name>"> each) for the interface
//   assets/icons.png        the same icons in a 16-wide grid at 2x (32px), for the map
//   assets/icons.json       where each icon sits in icons.png
//
// Run: node tools/gen/icons.mjs

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const N = 16;

// Palette.
const C = {
  ink: '#2a1f14', dark: '#4a3a28', white: '#f6f1e4', cream: '#e9dcb8', grey: '#9a978f', steel: '#c2c7cc', steelD: '#6e767d',
  wood: '#8a5a2b', woodL: '#b07a3e', gold: '#e6b422', goldD: '#a77d12', goldL: '#f7d96a', red: '#c0392b', redD: '#7e2318', redL: '#e8735f',
  green: '#7cb342', greenD: '#4b7a22', greenL: '#a8d36b', blue: '#4fa3d9', blueD: '#2a6f9e', blueL: '#9fd0f0',
  purple: '#b46ad4', purpleD: '#7a3f97', orange: '#c97b2a', orangeL: '#eba25a', brown: '#6b4a2b', sand: '#d8bf86', faith: '#e8e2d0', faithD: '#a89f84',
};

/** A 16x16 pixel canvas with simple drawing tools. */
function canvas() {
  const px = Array.from({ length: N }, () => Array(N).fill(null));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[Math.round(y)][Math.round(x)] = c; };
  const api = {
    px,
    set(x, y, c) { set(x, y, c); return api; },
    rect(x, y, w, h, c) { for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) set(i, j, c); return api; },
    line(x0, y0, x1, y1, c) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let k = 0; k <= n; k += 1) set(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, c);
      return api;
    },
    disc(cx, cy, r, c) { for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r + 0.3) set(i, j, c); return api; },
    ring(cx, cy, r, c) { for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) { const d = Math.sqrt((i - cx) ** 2 + (j - cy) ** 2); if (d <= r + 0.5 && d > r - 0.6) set(i, j, c); } return api; },
    poly(pts, c) {
      for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
        let inside = false;
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a, a += 1) {
          const [xa, ya] = pts[a]; const [xb, yb] = pts[b];
          if ((ya > j + 0.5) !== (yb > j + 0.5) && i + 0.5 < ((xb - xa) * (j + 0.5 - ya)) / (yb - ya) + xa) inside = !inside;
        }
        if (inside) set(i, j, c);
      }
      return api;
    },
    /** A dark outline round every filled pixel (drawn last). */
    outline(c = C.ink) {
      const copy = px.map((r) => r.slice());
      for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) {
        if (copy[j][i]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => copy[j + dy]?.[i + dx] && copy[j + dy][i + dx] !== c);
        if (near) px[j][i] = c;
      }
      return api;
    },
  };
  return api;
}

const sword = (k, col = C.steel) => k.line(4, 11, 11, 4, col).line(5, 11, 12, 4, C.steelD).line(3, 9, 6, 12, C.wood).rect(2, 12, 2, 2, C.woodL);
const bow = (k) => { for (let j = 2; j <= 13; j += 1) k.set(5 + Math.round(4 * Math.sin(((j - 2) / 11) * Math.PI)), j, C.wood); k.line(5, 2, 5, 13, C.cream).line(5, 8, 12, 8, C.steelD).set(12, 7, C.steel).set(12, 9, C.steel); };
const person = (k, body, head = C.cream) => k.disc(8, 4, 2.2, head).rect(6, 7, 5, 5, body).rect(6, 12, 2, 3, C.dark).rect(9, 12, 2, 3, C.dark);
const coin = (k) => k.disc(8, 8, 5.5, C.gold).ring(8, 8, 5.5, C.goldD).rect(7, 5, 2, 6, C.goldD).set(6, 6, C.goldL).set(5, 7, C.goldL);
const heart = (k, c = C.red) => k.disc(5.5, 6, 2.6, c).disc(10.5, 6, 2.6, c).poly([[3, 7], [13, 7], [8, 13.5]], c).set(5, 5, C.redL);
const flame = (k, c = C.faith, d = C.faithD) => k.poly([[8, 1.5], [12.5, 9], [11, 13], [5, 13], [3.5, 9], [6, 6], [7, 8]], c).poly([[8, 7], [10, 11], [8, 13], [6, 11]], d);
const flask = (k) => k.rect(7, 2, 3, 5, C.blueL).poly([[6.5, 7], [10.5, 7], [13, 13.5], [4, 13.5]], C.blueL).poly([[5, 10], [12, 10], [13, 13.5], [4, 13.5]], C.blue).rect(6, 1, 5, 1, C.steelD);
const hexagon = (k, c, fill = null) => { const pts = [[8, 1.5], [14, 5], [14, 11], [8, 14.5], [2, 11], [2, 5]]; if (fill) k.poly(pts, fill); for (let a = 0; a < 6; a += 1) k.line(...pts[a], ...pts[(a + 1) % 6], c); };
const scroll = (k) => k.rect(3, 4, 10, 8, C.cream).rect(2, 3, 2, 10, C.sand).rect(12, 3, 2, 10, C.sand).line(5, 6, 10, 6, C.dark).line(5, 8, 10, 8, C.dark).line(5, 10, 8, 10, C.dark);
const book = (k, c = C.redD) => k.rect(3, 3, 10, 10, c).rect(5, 4, 7, 8, C.cream).line(7, 6, 10, 6, C.dark).line(7, 8, 10, 8, C.dark);
const ship = (k, sail = C.cream) => k.poly([[2, 10], [14, 10], [12, 13], [4, 13]], C.wood).line(8, 2, 8, 10, C.dark).poly([[8.5, 2.5], [13, 9], [8.5, 9]], sail).rect(1, 14, 14, 1, C.blue);
const horse = (k, c = C.brown) => k.poly([[4, 3], [9, 2], [12, 6], [12, 9], [9, 9], [8, 14], [5, 14], [5, 8], [3, 7]], c).set(6, 4, C.ink).line(9, 2, 12, 6, C.dark).rect(3, 6, 2, 1, C.dark);

/** Every icon: name -> drawing. */
export const ICONS = {
  // Yields and city numbers.
  food: (k) => { k.line(5, 6, 7, 14, C.greenD).line(8, 5, 8, 14, C.greenD).line(11, 6, 9, 14, C.greenD); for (const [x, y] of [[4, 2], [4, 4], [7, 1], [7, 3], [10, 2], [10, 4]]) k.rect(x, y, 2, 2, C.gold); k.rect(6, 10, 5, 2, C.green); },
  production: (k) => k.rect(7, 6, 2, 8, C.wood).rect(3, 2, 10, 4, C.steelD).rect(3, 2, 10, 2, C.steel).set(13, 3, C.steelD),
  gold: coin,
  science: flask,
  culture: (k) => { k.poly([[3, 3], [13, 3], [13, 9], [8, 13], [3, 9]], C.purple).rect(5, 5, 2, 2, C.ink).rect(9, 5, 2, 2, C.ink).line(6, 9, 10, 9, C.purpleD).set(5, 8, C.purpleD).set(11, 8, C.purpleD); },
  faith: (k) => flame(k),
  amenity: (k) => k.disc(8, 8, 5.5, C.goldL).ring(8, 8, 5.5, C.goldD).rect(6, 6, 1, 2, C.ink).rect(10, 6, 1, 2, C.ink).line(5, 10, 6, 11, C.ink).line(6, 11, 10, 11, C.ink).line(10, 11, 11, 10, C.ink),
  housing: (k) => k.poly([[2, 8], [8, 2.5], [14, 8]], C.red).rect(4, 8, 8, 6, C.cream).rect(7, 10, 2, 4, C.wood),
  influence: (k) => k.poly([[8, 1.5], [10, 6], [14.5, 6.5], [11, 9.5], [12, 14], [8, 11.5], [4, 14], [5, 9.5], [1.5, 6.5], [6, 6]], C.purple).set(7, 6, C.white),
  population: (k) => person(k, C.green),
  turn: (k) => k.rect(4, 2, 8, 1, C.wood).rect(4, 13, 8, 1, C.wood).poly([[5, 3], [11, 3], [8, 8]], C.sand).poly([[8, 8], [11, 13], [5, 13]], C.sand).rect(7, 10, 2, 3, C.goldD),
  // Unit stats.
  strength: (k) => sword(k),
  ranged: (k) => bow(k),
  moves: (k) => k.rect(4, 3, 5, 8, C.brown).rect(4, 11, 9, 3, C.brown).rect(4, 13, 10, 1, C.dark).set(5, 4, C.woodL),
  hp: (k) => heart(k),
  xp: (k) => k.poly([[8, 1.5], [10, 6], [14.5, 6.5], [11, 9.5], [12, 14], [8, 11.5], [4, 14], [5, 9.5], [1.5, 6.5], [6, 6]], C.gold).set(7, 6, C.goldL),
  // Unit classes.
  'class-melee': (k) => sword(k),
  'class-ranged': (k) => bow(k),
  'class-anti_cavalry': (k) => k.line(3, 13, 12, 4, C.wood).poly([[11, 2], [14, 2], [14, 5], [12, 5]], C.steel).line(10, 3, 13, 6, C.steelD),
  'class-cavalry': (k) => horse(k),
  'class-recon': (k) => k.disc(8, 8, 5.5, C.cream).disc(8, 8, 3, C.blue).disc(8, 8, 1.5, C.ink).set(7, 6, C.white),
  'class-siege': (k) => k.rect(2, 11, 11, 2, C.wood).disc(4, 13, 1.5, C.dark).disc(11, 13, 1.5, C.dark).line(4, 11, 12, 3, C.woodL).disc(12.5, 3, 1.8, C.grey),
  'class-naval_melee': (k) => ship(k),
  'class-naval_ranged': (k) => ship(k, C.redL),
  'class-civilian': (k) => person(k, C.sand),
  founder: (k) => k.line(4, 2, 4, 14, C.dark).poly([[5, 2], [13, 4.5], [5, 7]], C.red).rect(2, 13, 6, 2, C.greenD),
  worker: (k) => k.line(4, 13, 11, 4, C.wood).poly([[7, 2], [14, 4], [13, 6], [9, 4]], C.steel),
  trader: (k) => k.rect(3, 6, 10, 5, C.woodL).rect(3, 4, 10, 2, C.cream).disc(5, 12, 1.8, C.dark).disc(11, 12, 1.8, C.dark),
  spy: (k) => k.poly([[2, 6], [14, 6], [13, 10], [9, 10], [8, 8], [7, 10], [3, 10]], C.ink).rect(4, 7, 2, 1, C.white).rect(10, 7, 2, 1, C.white),
  missionary: (k) => book(k, C.purpleD),
  monster: (k) => k.disc(8, 8, 5.5, C.greenD).rect(5, 6, 2, 2, C.goldL).rect(9, 6, 2, 2, C.goldL).poly([[5, 10], [11, 10], [10, 12], [8, 11], [6, 12]], C.white),
  // Lenses and map toggles.
  'lens-religion': (k) => flame(k, C.purple, C.purpleD),
  'lens-yields': (k) => k.rect(2, 9, 3, 5, C.green).rect(6, 5, 3, 9, C.orange).rect(10, 2, 3, 12, C.gold),
  grid: (k) => hexagon(k, C.cream),
  // Screen buttons.
  menu: (k) => k.rect(2, 3, 12, 2, C.cream).rect(2, 7, 12, 2, C.cream).rect(2, 11, 12, 2, C.cream),
  empire: (k) => k.poly([[2, 13], [2, 5], [5, 8], [8, 3], [11, 8], [14, 5], [14, 13]], C.gold).rect(2, 11, 12, 2, C.goldD).set(8, 6, C.red),
  diplomacy: (k) => scroll(k),
  // Killzone Extrasolar War K2: the star map (a ringed planet) and a fleet (a ship's arrowhead).
  starmap: (k) => k.disc(8, 8, 4.5, C.blue).disc(6.5, 6.5, 1.5, C.blueL).line(1, 11, 15, 5, C.goldL).line(1, 12, 15, 6, C.goldD).set(13, 2, C.white).set(2, 3, C.white),
  fleet: (k) => k.poly([[2, 13], [8, 2], [14, 13], [8, 10]], C.steel).line(8, 3, 8, 10, C.steelD).rect(7, 12, 3, 2, C.goldL),
  victory: (k) => k.poly([[4, 2], [12, 2], [11, 8], [5, 8]], C.gold).rect(7, 8, 2, 3, C.goldD).rect(4, 11, 8, 2, C.goldD).rect(2, 3, 2, 3, C.goldD).rect(12, 3, 2, 3, C.goldD),
  journal: (k) => book(k),
  help: (k) => k.disc(8, 8, 6, C.blueD).rect(6, 4, 4, 1, C.white).rect(9, 5, 1, 2, C.white).rect(7, 7, 2, 2, C.white).rect(7, 11, 2, 2, C.white),
  close: (k) => k.line(3, 3, 12, 12, C.red).line(4, 3, 13, 12, C.red).line(12, 3, 3, 12, C.red).line(13, 3, 4, 12, C.red),
  techs: (k) => flask(k),
  civics: (k) => k.rect(3, 4, 10, 2, C.cream).rect(4, 6, 2, 6, C.cream).rect(7, 6, 2, 6, C.cream).rect(10, 6, 2, 6, C.cream).rect(2, 12, 12, 2, C.cream).poly([[2, 4], [8, 1], [14, 4]], C.cream),
  settings: (k) => { k.disc(8, 8, 5, C.steel); for (const [x, y] of [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [13, 3], [3, 13], [13, 13]]) k.rect(x - 1, y - 1, 2, 2, C.steel); k.disc(8, 8, 2, C.steelD); },
  sound: (k) => k.rect(2, 6, 3, 4, C.cream).poly([[5, 6], [9, 2.5], [9, 13.5], [5, 10]], C.cream).line(11, 5, 12, 8, C.cream).line(12, 8, 11, 11, C.cream),
  save: (k) => k.rect(2, 2, 12, 12, C.blueD).rect(4, 2, 7, 4, C.steel).rect(4, 9, 8, 5, C.white),
  // Statuses.
  fortified: (k) => k.poly([[3, 2], [13, 2], [13, 8], [8, 14], [3, 8]], C.steel).poly([[8, 2], [13, 2], [13, 8], [8, 14]], C.steelD),
  asleep: (k) => k.line(3, 3, 8, 3, C.blueL).line(8, 3, 3, 8, C.blueL).line(3, 8, 8, 8, C.blueL).line(9, 9, 13, 9, C.blueL).line(13, 9, 9, 13, C.blueL).line(9, 13, 13, 13, C.blueL),
  healing: (k) => k.rect(6, 2, 4, 12, C.green).rect(2, 6, 12, 4, C.green).rect(7, 3, 1, 4, C.greenL),
  embarked: (k) => ship(k),
  war: (k) => { sword(k); k.line(11, 11, 4, 4, C.steel).line(12, 11, 5, 4, C.steelD).line(13, 9, 10, 12, C.wood); },
  peace: (k) => k.poly([[2, 9], [7, 6], [13, 4], [11, 8], [6, 11]], C.white).set(12, 5, C.ink).line(3, 12, 9, 9, C.greenD).rect(4, 11, 2, 1, C.green).rect(7, 10, 2, 1, C.green),
  city: (k) => k.rect(2, 7, 4, 7, C.cream).rect(6, 4, 4, 10, C.sand).rect(10, 8, 4, 6, C.cream).poly([[6, 4], [8, 1.5], [10, 4]], C.red).rect(7, 10, 2, 4, C.wood),
  capital: (k) => k.poly([[8, 1.5], [10, 6], [14.5, 6.5], [11, 9.5], [12, 14], [8, 11.5], [4, 14], [5, 9.5], [1.5, 6.5], [6, 6]], C.goldL),
  // Resources.
  'res-wheat': (k) => { k.line(8, 5, 8, 14, C.goldD); for (const y of [2, 4, 6, 8]) { k.rect(6, y, 2, 2, C.gold); k.rect(9, y + 1, 2, 2, C.gold); } },
  'res-rice': (k) => { k.line(5, 6, 5, 14, C.greenD).line(8, 4, 8, 14, C.greenD).line(11, 6, 11, 14, C.greenD); for (const [x, y] of [[4, 4], [7, 2], [10, 4], [5, 3], [9, 3]]) k.rect(x, y, 2, 1, C.cream); k.rect(2, 13, 12, 2, C.blue); },
  'res-cattle': (k) => k.rect(3, 6, 10, 5, C.white).rect(4, 7, 3, 2, C.ink).rect(9, 8, 2, 2, C.ink).rect(12, 4, 3, 4, C.white).rect(3, 11, 2, 3, C.dark).rect(10, 11, 2, 3, C.dark).set(14, 3, C.sand),
  'res-deer': (k) => k.rect(4, 7, 8, 4, C.woodL).rect(11, 4, 3, 4, C.woodL).line(11, 3, 10, 1, C.wood).line(13, 3, 14, 1, C.wood).rect(4, 11, 2, 3, C.wood).rect(10, 11, 2, 3, C.wood),
  'res-fish': (k) => k.poly([[2, 8], [7, 5], [11, 6], [13, 8], [11, 10], [7, 11]], C.blueL).poly([[12, 8], [15, 5], [15, 11]], C.blue).set(5, 7, C.ink),
  'res-stone': (k) => k.poly([[2, 13], [4, 7], [8, 5], [12, 7], [14, 13]], C.grey).poly([[4, 7], [8, 5], [9, 8], [5, 10]], C.steel),
  'res-wine': (k) => { for (const [x, y] of [[6, 4], [9, 4], [5, 7], [8, 7], [11, 7], [6, 10], [9, 10], [8, 13]]) k.disc(x, y, 1.4, C.purple); k.line(8, 1, 8, 3, C.greenD).rect(9, 1, 2, 1, C.green); },
  'res-silk': (k) => k.poly([[2, 4], [14, 2], [13, 7], [3, 9]], C.redL).poly([[3, 9], [13, 7], [14, 13], [2, 14]], C.red).line(3, 9, 13, 7, C.redD),
  'res-incense': (k) => k.rect(5, 10, 6, 4, C.goldD).rect(4, 9, 8, 1, C.gold).line(8, 8, 7, 5, C.grey).line(7, 5, 9, 2, C.grey).set(8, 1, C.steel),
  'res-horses': (k) => horse(k, C.woodL),
  'res-iron': (k) => k.poly([[2, 11], [5, 7], [11, 7], [14, 11], [11, 13], [5, 13]], C.steelD).poly([[5, 7], [11, 7], [10, 9], [6, 9]], C.steel),
};

/** Draw every icon; returns { name: 16x16 colour grid }. */
export function drawIcons() {
  const out = {};
  for (const [name, draw] of Object.entries(ICONS)) {
    const k = canvas();
    draw(k);
    k.outline();
    out[name] = k.px;
  }
  return out;
}

function svgSymbol(name, px) {
  const rects = [];
  for (let y = 0; y < N; y += 1) {
    let x = 0;
    while (x < N) {
      const c = px[y][x];
      if (!c) { x += 1; continue; }
      let w = 1;
      while (x + w < N && px[y][x + w] === c) w += 1;
      rects.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`);
      x += w;
    }
  }
  return `<symbol id="i-${name}" viewBox="0 0 16 16">${rects.join('')}</symbol>`;
}

/** A PNG (RGBA) from a pixel callback; no libraries, just zlib. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function writeIcons(root = ROOT) {
  const icons = drawIcons();
  const names = Object.keys(icons);
  await mkdir(join(root, 'assets'), { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n<!-- Atlas icons: original pixel art drawn by tools/gen/icons.mjs. Do not edit by hand. -->\n${names.map((n) => svgSymbol(n, icons[n])).join('\n')}\n</svg>\n`;
  await writeFile(join(root, 'assets', 'icons.svg'), svg);
  // The atlas for the map: 16 icons a row, each at 2x.
  const cols = 16;
  const S = 32;
  const rows = Math.ceil(names.length / cols);
  const hex = (c) => [Number.parseInt(c.slice(1, 3), 16), Number.parseInt(c.slice(3, 5), 16), Number.parseInt(c.slice(5, 7), 16), 255];
  const at = {};
  names.forEach((n, i) => { at[n] = { x: (i % cols) * S, y: Math.floor(i / cols) * S, w: S, h: S }; });
  const image = png(cols * S, rows * S, (x, y) => {
    const i = Math.floor(y / S) * cols + Math.floor(x / S);
    const name = names[i];
    if (!name) return [0, 0, 0, 0];
    const c = icons[name][Math.floor((y % S) / 2)][Math.floor((x % S) / 2)];
    return c ? hex(c) : [0, 0, 0, 0];
  });
  await writeFile(join(root, 'assets', 'icons.png'), image);
  await writeFile(join(root, 'assets', 'icons.json'), `${JSON.stringify({ credits: 'Original Atlas pixel icons drawn in code by tools/gen/icons.mjs, MIT licence.', size: S, icons: at }, null, 1)}\n`);
  return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = await writeIcons();
  console.log(`icons: ${names.length} icons written to assets/icons.svg, assets/icons.png and assets/icons.json`);
}
