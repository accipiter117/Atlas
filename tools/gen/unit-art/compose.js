// Unit art composer (graphics overhaul G4), run in headless Chromium by
// tools/gen/lpc-units.mjs. Never part of the game.
//
// Every sheet uses the classic LPC layout: 64 pixel frames, four rows per
// animation in the order up, left, down, right (thrust rows 4 to 7, walk 8
// to 11, slash 12 to 15, shoot 16 to 19, hurt row 20), so the game draws LPC
// and code-drawn units the same way.
//
// Faction colour: pixels in the reserved mask colour (red equal to blue, no
// green, red at least 48) are recoloured to each faction's colour by the game
// (src/render/art/spriteSheet.js), keeping the mask's brightness as shading.

import { getPixelTrooper, PT_W, PT_H } from './killzone/pixel-troopers.js';
import { getTank, TANK_W, TANK_H } from './killzone/tanks.js';
import { getVehicle } from './vehicles.js';

export const FRAME = 64;
export const ROWS = { thrust: 4, walk: 8, slash: 12, shoot: 16, hurt: 20 };
export const FRAMES = { thrust: 8, walk: 9, slash: 6, shoot: 13, hurt: 6 };
const DIRS = ['n', 'w', 's', 'e'];
const W = 13 * FRAME;
const H = 21 * FRAME;

function canvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function load(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Turn a layer's pixels into the mask colour, keeping their brightness (dark outlines stay as they are). */
function toMask(c) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let k = 0; k < d.length; k += 4) {
    if (!d[k + 3]) continue;
    const l = Math.round(0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]);
    if (l < 44) continue;
    const m = Math.min(255, Math.max(48, Math.round(48 + (l - 44) * 1.05)));
    d[k] = m;
    d[k + 1] = 0;
    d[k + 2] = m;
  }
  g.putImageData(img, 0, 0);
}

/** Recolour a layer: every pixel takes hue h (degrees) and saturation s (0 to 1), its lightness scaled by l. */
function recolourHsl(c, [h, sat, l]) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const f = (n, k, a, L) => L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255;
    const gg = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const L = Math.min(1, ((Math.max(r, gg, b) + Math.min(r, gg, b)) / 2) * l);
    const a = sat * Math.min(L, 1 - L);
    for (const [q, n] of [[0, 0], [1, 8], [2, 4]]) {
      const k = (n + h / 30) % 12;
      d[i + q] = Math.round(f(n, k, a, L) * 255);
    }
  }
  g.putImageData(img, 0, 0);
}

/** A mask colour of a given brightness (0 to 1), for code-drawn parts in the faction's colour. */
const mask = (b) => { const m = Math.round(48 + Math.max(0, Math.min(1, b)) * 207); return `rgb(${m},0,${m})`; };

/**
 * Composite LPC layers. spec.layers: [{ z, tint, files: { walk: url, hurt: url, thrust: url, ... } }]
 * Returns the sheet canvas.
 */
export async function composeLpc(spec) {
  const [sheet, sg] = canvas();
  const layers = spec.layers.slice().sort((a, b) => a.z - b.z);
  for (const layer of layers) {
    const [lc, lg] = canvas();
    for (const [anim, url] of Object.entries(layer.files)) {
      const img = await load(url);
      if (!img) continue;
      lg.drawImage(img, 0, ROWS[anim] * FRAME);
    }
    if (layer.hsl) recolourHsl(lc, layer.hsl);
    if (layer.tint) toMask(lc);
    sg.drawImage(lc, 0, 0);
  }
  return sheet;
}

export async function composeLpcUrl(spec) {
  return (await composeLpc(spec)).toDataURL('image/png');
}

// ---------- Code-drawn units ----------

/** A tiny pixel painter over a 2D context, offset to a frame. */
function painter(g, ox, oy, flip) {
  const X = (x, w = 1) => (flip ? ox + FRAME - x - w : ox + x);
  return {
    rect(x, y, w, h, colour) { g.fillStyle = colour; g.fillRect(X(Math.round(x), Math.round(w)), oy + Math.round(y), Math.round(w), Math.round(h)); },
    px(x, y, colour) { g.fillStyle = colour; g.fillRect(X(Math.round(x)), oy + Math.round(y), 1, 1); },
    /** A filled ellipse as pixel rows, lit from the top left: the top rows lighter. */
    ellipse(cx, cy, rx, ry, colour, light, dark) {
      for (let y = -ry; y <= ry; y += 1) {
        const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
        const c = y < -ry * 0.35 ? light : y > ry * 0.45 ? dark : colour;
        this.rect(cx - hw, cy + y, hw * 2 + 1, 1, c);
      }
    },
    line(x0, y0, x1, y1, colour) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k += 1) this.px(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, colour);
    },
    image(img, sx, sy, sw, sh, dx, dy) {
      if (!flip) { g.drawImage(img, sx, sy, sw, sh, ox + dx, oy + dy, sw, sh); return; }
      g.save();
      g.translate(ox + FRAME - dx, oy + dy);
      g.scale(-1, 1);
      g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      g.restore();
    },
  };
}

const SHADOW = 'rgba(20, 14, 8, 0.3)';

/** A horse facing right. frame 0 stands; 1 to 8 walk; `barding` covers it in the faction's colour. */
function horse(p, f, { coat = '#7a5230', barding = false, y0 = 0 } = {}) {
  const light = '#9c6b40';
  const dark = '#4e3420';
  const mane = '#2e2016';
  const ph = (f / 8) * Math.PI * 2;
  const bob = f ? Math.round(Math.sin(ph * 2) * 0.6) : 0;
  const y = y0 + bob;
  p.ellipse(31, 57, 16, 2, SHADOW, SHADOW, SHADOW);
  // Legs: far pair darker, near pair lighter, swinging in opposite phase.
  const leg = (x, phase, colour) => {
    const s = f ? Math.round(Math.sin(ph + phase) * 3) : 0;
    p.rect(x, 44 + y, 2, 7, colour);
    p.rect(x + s, 50 + y, 2, 6, colour);
    p.rect(x + s, 56 + y, 3, 1, '#1d140c');
  };
  leg(21, Math.PI, dark);
  leg(40, 0, dark);
  // Tail.
  p.rect(13, 36 + y, 3, 2, mane);
  p.rect(12, 38 + y, 3, 7, mane);
  p.ellipse(30, 40 + y, 14, 6, coat, light, dark);
  // Neck and head.
  p.rect(40, 31 + y, 5, 9, coat);
  p.rect(41, 30 + y, 4, 1, light);
  p.rect(43, 26 + y, 6, 6, coat);
  p.rect(46, 28 + y, 6, 4, coat);
  p.rect(51, 30 + y, 2, 2, dark);
  p.px(46, 28 + y, '#1d140c');
  p.rect(42, 25 + y, 2, 2, coat);
  p.rect(39, 27 + y, 2, 9, mane);
  leg(25, 0, coat);
  leg(37, Math.PI, coat);
  if (barding) {
    for (let k = 0; k < 9; k += 1) p.rect(18, 36 + y + k, 26, 1, mask(0.75 - k * 0.05));
    p.rect(18, 45 + y, 26, 1, '#2a1d12');
    p.rect(40, 30 + y, 6, 7, mask(0.6));
  } else {
    // Saddle cloth.
    for (let k = 0; k < 6; k += 1) p.rect(26, 34 + y + k, 10, 1, mask(0.7 - k * 0.06));
  }
}

/** A rider's upper body from a composed LPC sheet (facing right), sitting at the saddle. */
function rider(p, sheet, row, col, y0 = 0) {
  // Rows 0 to 41 of the frame are the head, chest, arms and waist.
  p.image(sheet, col * FRAME, row * FRAME, FRAME, 42, 0, -6 + y0);
}

/** A light two-wheeled chariot behind a horse, its wheel turning. */
function chariot(p, f, colour = '#8a6235') {
  const ph = (f / 8) * Math.PI * 2;
  p.rect(2, 40, 20, 3, colour);
  p.rect(2, 34, 2, 7, colour);
  p.rect(4, 34, 16, 1, '#5c4022');
  for (let k = 0; k < 5; k += 1) p.rect(4, 35 + k, 16, 1, mask(0.7 - k * 0.08));
  p.line(20, 41, 30, 41, '#5c4022');
  // Wheel with spokes.
  const cx = 12;
  const cy = 49;
  for (let a = 0; a < Math.PI * 2; a += 0.2) p.px(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, '#3e2a16');
  for (let s = 0; s < 3; s += 1) {
    const a = ph + (s * Math.PI) / 3;
    p.line(cx - Math.cos(a) * 6, cy - Math.sin(a) * 6, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, '#6b4a2b');
  }
}

/** Siege engines on wheels, facing right. kind: catapult, trebuchet, bombard. */
function siege(p, f, kind, attack = -1) {
  const wood = '#8a6235';
  const woodL = '#a87a46';
  const woodD = '#5c4022';
  const ph = (f / 8) * Math.PI * 2;
  p.ellipse(32, 57, 20, 2, SHADOW, SHADOW, SHADOW);
  const wheel = (cx) => {
    for (let a = 0; a < Math.PI * 2; a += 0.25) p.px(cx + Math.cos(a) * 5, 51 + Math.sin(a) * 5, '#3e2a16');
    const a = ph;
    p.line(cx - Math.cos(a) * 4, 51 - Math.sin(a) * 4, cx + Math.cos(a) * 4, 51 + Math.sin(a) * 4, woodD);
  };
  if (kind === 'bombard') {
    p.rect(14, 44, 30, 4, woodD);
    p.rect(14, 43, 30, 1, wood);
    // Barrel, tilting up as it fires.
    const lift = attack >= 0 ? Math.min(2, attack) : 0;
    for (let k = 0; k < 26; k += 1) p.rect(20 + k, 37 - Math.round((k * lift) / 13), 1, 6, k < 4 ? '#3a3d40' : '#5a5e62');
    p.rect(20, 37, 26, 1, '#8a8f94');
    if (attack >= 2 && attack <= 4) { p.rect(47, 34 - lift * 2, 4, 4, '#ffd27a'); p.rect(51, 35 - lift * 2, 3, 2, '#fff0c0'); }
    wheel(18);
    wheel(40);
    p.rect(8, 40, 6, 3, mask(0.7));
    return;
  }
  // Base frame.
  p.rect(8, 44, 44, 4, wood);
  p.rect(8, 44, 44, 1, woodL);
  p.rect(8, 47, 44, 1, woodD);
  wheel(14);
  wheel(46);
  if (kind === 'catapult') {
    p.rect(24, 32, 3, 13, wood);
    p.rect(34, 32, 3, 13, wood);
    p.rect(23, 32, 15, 2, woodD);
    // The arm: lying back, then thrown forward when attacking.
    const t = attack < 0 ? 0 : Math.min(1, attack / 3);
    const a = (-0.25 - t * 1.25);
    const ex = 30 + Math.cos(Math.PI + a) * -18;
    const ey = 42 + Math.sin(Math.PI + a) * 18;
    p.line(30, 42, ex, ey, woodL);
    p.line(31, 42, ex + 1, ey, wood);
    p.rect(ex - 2, ey - 2, 4, 3, '#6b5a48');
    p.rect(10, 38, 4, 6, mask(0.7));
  } else {
    // Trebuchet: tall A frame, long arm, counterweight box.
    p.line(22, 46, 30, 14, wood);
    p.line(38, 46, 30, 14, wood);
    p.line(23, 46, 31, 14, woodL);
    const t = attack < 0 ? 0 : Math.min(1, attack / 4);
    const a = -0.9 + t * 2.1;
    const ax = 30 + Math.cos(a) * 24;
    const ay = 15 + Math.sin(a) * 24;
    const bx = 30 - Math.cos(a) * 9;
    const by = 15 - Math.sin(a) * 9;
    p.line(bx, by, ax, ay, woodL);
    p.rect(bx - 4, by, 8, 7, '#5a5048');
    p.rect(bx - 4, by, 8, 1, '#7a7068');
    p.line(ax, ay, ax, ay + 8, '#3a2a18');
    p.rect(8, 36, 4, 8, mask(0.7));
  }
}

/** Ships facing right on a little bow wave. kind: trireme, quinquereme, caravel, drakkar. */
function ship(p, f, kind) {
  const bob = Math.round(Math.sin((f / 8) * Math.PI * 2) * 1);
  const hull = kind === 'caravel' ? '#6b4628' : '#7a5230';
  const hullL = '#9c6b40';
  const hullD = '#46301c';
  const y = 46 + bob;
  // Water ripples.
  p.rect(2, 56, 60, 1, 'rgba(255,255,255,0.35)');
  p.rect(48 + (f % 3), 55, 8, 1, 'rgba(255,255,255,0.6)');
  const long = kind !== 'caravel';
  const x0 = long ? 4 : 10;
  const x1 = long ? 60 : 54;
  for (let k = 0; k < 8; k += 1) {
    const inset = Math.round(k * (long ? 0.7 : 1.2));
    p.rect(x0 + inset, y + k - 4, x1 - x0 - inset * 2, 1, k < 2 ? hullL : k > 5 ? hullD : hull);
  }
  if (kind === 'trireme' || kind === 'quinquereme') {
    // Oars, sweeping with the stroke.
    const sweep = Math.round(Math.sin((f / 8) * Math.PI * 2) * 2);
    const banks = kind === 'quinquereme' ? [0, 3] : [0];
    for (const b of banks) for (let x = 12; x < 52; x += 5) p.line(x, y - 1 + b, x - 3 + sweep, y + 8 + b, '#c8a878');
    p.rect(58, y - 6, 4, 2, hullD); // ram
    p.rect(30, 12 + bob, 2, 32, hullD); // mast
    for (let k = 0; k < 16; k += 1) p.rect(22, 14 + bob + k, 18, 1, mask(0.85 - k * 0.025));
    if (kind === 'quinquereme') { p.rect(8, y - 9, 10, 4, hullD); p.rect(46, y - 9, 10, 4, hullD); }
  } else if (kind === 'drakkar') {
    p.line(58, y - 4, 61, y - 14, hull);
    p.rect(59, y - 16, 4, 3, '#3f6b3a'); // dragon head
    p.px(61, y - 15, '#ffd27a');
    for (let x = 12; x < 52; x += 6) { p.rect(x, y - 6, 4, 4, mask(0.8)); p.px(x + 1, y - 5, '#c8b070'); }
    p.rect(32, 12 + bob, 2, 30, hullD);
    for (let k = 0; k < 16; k += 1) p.rect(24, 14 + bob + k, 18, 1, k % 4 < 2 ? mask(0.8) : '#e8e0c8');
  } else {
    // Caravel: castles fore and aft, two lateen sails.
    p.rect(10, y - 10, 10, 6, hullD);
    p.rect(44, y - 8, 10, 4, hullD);
    p.rect(26, 8 + bob, 2, 34, hullD);
    p.rect(40, 16 + bob, 2, 26, hullD);
    for (let k = 0; k < 18; k += 1) p.rect(27 - Math.round(k * 0.5), 10 + bob + k, Math.round(k * 0.8) + 2, 1, k % 6 === 5 ? mask(0.7) : '#efe6cf');
    for (let k = 0; k < 13; k += 1) p.rect(41 - Math.round(k * 0.4), 18 + bob + k, Math.round(k * 0.7) + 2, 1, '#e6dcc2');
    p.rect(27, 6 + bob, 6, 3, mask(0.85));
  }
}

/** The Witcher's monsters, facing right. kind: drowner, nekker, ghoul, wyvern. */
function monster(p, f, kind, attack = -1) {
  const ph = (f / 8) * Math.PI * 2;
  const step = f ? Math.round(Math.sin(ph) * 2) : 0;
  p.ellipse(32, 57, kind === 'wyvern' ? 14 : 10, 2, SHADOW, SHADOW, SHADOW);
  const lunge = attack >= 0 ? Math.round(Math.sin((attack / 5) * Math.PI) * 5) : 0;
  if (kind === 'drowner' || kind === 'nekker') {
    const big = kind === 'drowner';
    const skin = big ? '#5e7a5a' : '#7a6448';
    const light = big ? '#7f9b78' : '#9a8262';
    const dark = big ? '#3e5440' : '#54432f';
    const h = big ? 30 : 22;
    const top = 57 - h;
    // Hunched body, long arms with claws.
    p.rect(26 + step, 50, 3, 7, dark);
    p.rect(34 - step, 50, 3, 7, dark);
    p.ellipse(31 + lunge, top + h * 0.45, big ? 8 : 6, big ? 9 : 7, skin, light, dark);
    p.ellipse(38 + lunge, top + 4, big ? 5 : 5, big ? 4 : 4, skin, light, dark);
    p.px(41 + lunge, top + 3, big ? '#d8f0a0' : '#ffd060');
    p.rect(41 + lunge, top + 6, 3, 1, '#1a1410');
    p.line(36 + lunge, top + 10, 44 + lunge + lunge, top + 18 + step, skin);
    p.line(44 + lunge * 2, top + 18 + step, 46 + lunge * 2, top + 20 + step, '#e8e0c8');
    if (big) for (let k = 0; k < 4; k += 1) p.px(26 + k * 3, top + 8 + k, '#89a882');
    if (!big) { p.rect(35 + lunge, top - 1, 2, 2, dark); p.rect(39 + lunge, top - 1, 2, 2, dark); }
  } else if (kind === 'ghoul') {
    const skin = '#a8a49a';
    const light = '#c8c4ba';
    const dark = '#6e6a62';
    for (const [x, ph2] of [[22, 0], [28, Math.PI], [36, Math.PI], [42, 0]]) {
      const s = f ? Math.round(Math.sin(ph + ph2) * 2) : 0;
      p.rect(x + s, 47, 2, 10, dark);
    }
    p.ellipse(32 + lunge, 42, 13, 6, skin, light, dark);
    for (let x = 22; x < 42; x += 3) p.px(x + lunge, 37, '#7a5a50');
    p.ellipse(46 + lunge, 40, 5, 4, skin, light, dark);
    p.rect(48 + lunge, 42, 4, 1, '#3a1a14');
    p.px(48 + lunge, 39, '#e04030');
  } else {
    // Wyvern: hovering, wings beating; tail behind.
    const flap = Math.sin(ph * 1.5 + (attack >= 0 ? attack : 0));
    const hover = Math.round(Math.sin(ph) * 2);
    const skin = '#6d7a3e';
    const light = '#8f9c56';
    const dark = '#4a5428';
    p.line(14, 34 + hover, 24, 38 + hover, dark);
    p.line(10, 30 + hover, 14, 34 + hover, dark);
    p.ellipse(30, 38 + hover, 10, 5, skin, light, dark);
    p.rect(38, 30 + hover, 4, 8, skin);
    p.ellipse(44 + lunge, 28 + hover, 5, 3, skin, light, dark);
    p.px(46 + lunge, 27 + hover, '#ffd060');
    p.rect(47 + lunge, 30 + hover, 3, 1, '#2a1a10');
    // Wing: a fan of struts with membrane.
    const tipY = 18 + hover - Math.round(flap * 12);
    for (let k = 0; k <= 10; k += 1) {
      const x = 24 + k * 1.4;
      p.line(x, 36 + hover, 18 + k * 2, tipY + k * 0.8, k % 3 ? '#8c6a48' : '#5a3e28');
    }
    p.rect(24, 44 + hover, 2, 6, dark);
    p.rect(32, 44 + hover, 2, 6, dark);
  }
}

/** Draw a code unit's frame. kind, frame number, direction, animation; mounted units get the rider sheet. */
function drawCode(g, spec, riderSheet, ox, oy, dir, anim, f) {
  const flip = dir === 'w' || dir === 'n';
  const p = painter(g, ox, oy, flip);
  const attack = anim === 'attack' ? f : -1;
  const walkF = anim === 'walk' ? f : 0;
  const k = spec.draw;
  if (k === 'horse' || k === 'chariot') {
    if (k === 'chariot') chariot(p, walkF, spec.cart);
    horse(p, walkF, { coat: spec.coat, barding: spec.barding });
    if (riderSheet) {
      // The rider faces right (LPC row 11) walking, or uses the attack rows.
      const row = anim === 'attack' ? (ROWS[spec.attack] ?? ROWS.thrust) + 3 : ROWS.walk + 3;
      const col = anim === 'attack' ? Math.min(f, FRAMES[spec.attack] - 1) : 0;
      if (k === 'chariot') rider(p, riderSheet, row, col, 1 - 6);
      else rider(p, riderSheet, row, col, 0);
    }
  } else if (k === 'siege') siege(p, walkF, spec.kind, attack);
  else if (k === 'ship') ship(p, walkF, spec.kind);
  else if (k === 'monster') monster(p, walkF, spec.kind, attack);
}

/**
 * A code-drawn unit's sheet in the LPC layout. spec: { draw, kind, attack, coat, barding, cart }
 * riderUrl: a composed LPC sheet (data URL) for mounted units.
 */
export async function composeCode(spec, riderUrl = null) {
  const riderSheet = riderUrl ? await load(riderUrl) : null;
  const [sheet, g] = canvas();
  const attack = spec.attack ?? 'thrust';
  DIRS.forEach((dir, d) => {
    for (let f = 0; f < FRAMES.walk; f += 1) drawCode(g, spec, riderSheet, f * FRAME, (ROWS.walk + d) * FRAME, dir, 'walk', f);
    for (let f = 0; f < FRAMES[attack]; f += 1) drawCode(g, spec, riderSheet, f * FRAME, (ROWS[attack] + d) * FRAME, dir, 'attack', f);
  });
  // Hurt (and die): the standing frame shaking, then sinking and fading.
  for (let f = 0; f < FRAMES.hurt; f += 1) {
    const [fc, fg] = canvas(FRAME, FRAME);
    drawCode(fg, spec, riderSheet, 0, 0, 's', 'walk', 0);
    g.globalAlpha = f < 3 ? 1 : 1 - (f - 2) * 0.22;
    g.drawImage(fc, f * FRAME + (f % 2 ? 1 : -1), ROWS.hurt * FRAME + Math.max(0, f - 2) * 2);
    g.globalAlpha = 1;
  }
  return sheet.toDataURL('image/png');
}

// ---------- Killzone troopers and tanks (Matthew's own code, vendored unchanged) ----------

/**
 * A Killzone unit's sheet in a grid layout: rows idle (right, left), walk (right, left),
 * attack (right, left), hurt. spec: { side: 'isa' | 'hgh', role, tank }.
 */
export function composeKillzone(spec) {
  const fw = spec.tank || spec.vehicle ? TANK_W : PT_W;
  const fh = spec.tank || spec.vehicle ? TANK_H : PT_H;
  // K7: spec.vehicle draws one of the Extrasolar War's vehicles (vehicles.js), framed like a tank.
  const machine = spec.tank || spec.vehicle;
  const get = (frame, facing) => (spec.vehicle ? getVehicle(spec.vehicle, spec.side, frame, facing) : spec.tank ? getTank(spec.side, frame, facing) : getPixelTrooper(spec.side, frame, facing, spec.role));
  const walk = machine ? ['move1', 'move2', 'move3', 'move4'] : ['walk1', 'walk2', 'walk3', 'walk4'];
  const idle = machine ? 'idle' : 'stand';
  const attack = machine ? ['idle', 'fire', 'fire', 'idle'] : ['stand', 'fire', 'fire', 'stand'];
  const hurt = machine ? ['idle', 'wreck', 'wreck'] : ['fall1', 'fall2', 'dead'];
  const rows = [[idle], [idle], walk, walk, attack, attack, hurt];
  const facings = [1, -1, 1, -1, 1, -1, 1];
  const [c, g] = canvas(fw * 4, fh * rows.length);
  rows.forEach((frames, r) => frames.forEach((name, k) => g.drawImage(get(name, facings[r]), k * fw, r * fh)));
  return { url: c.toDataURL('image/png'), frame: { w: fw, h: fh } };
}

// ---------- Contact sheet ----------

/**
 * Every unit's standing frame facing the viewer and walking right, tinted with a sample
 * faction colour, with its name: the contact sheet for docs/shots/G4/.
 * entries: [{ name, url, desc }]
 */
export async function contactSheet(entries, colour = [176, 52, 40]) {
  const cols = 8;
  const cell = 120;
  const rows = Math.ceil(entries.length / cols);
  const [c, g] = canvas(cols * cell, rows * cell + 8);
  g.fillStyle = '#d8c59a';
  g.fillRect(0, 0, c.width, c.height);
  g.font = '600 11px sans-serif';
  g.textAlign = 'center';
  for (let n = 0; n < entries.length; n += 1) {
    const e = entries[n];
    const img = await load(e.url);
    if (!img) continue;
    const x = (n % cols) * cell;
    const y = Math.floor(n / cols) * cell;
    const [tc, tg] = canvas(img.width, img.height);
    tg.drawImage(img, 0, 0);
    const data = tg.getImageData(0, 0, img.width, img.height);
    const d = data.data;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 1] !== 0 || d[k] !== d[k + 2] || d[k] < 48 || !d[k + 3]) continue;
      const t = ((d[k] - 48) / 207) * 1.3;
      for (let q = 0; q < 3; q += 1) d[k + q] = Math.round(t <= 1 ? colour[q] * (0.35 + 0.65 * t) : colour[q] + (255 - colour[q]) * (t - 1) * 0.6);
    }
    tg.putImageData(data, 0, 0);
    const { frame, layout } = e.desc;
    const scale = Math.min(1.5, 100 / Math.max(frame.w, frame.h));
    const pick = layout === 'lpc' ? [[0, ROWS.walk + 2], [2, ROWS.walk + 3]] : [[0, 0], [1, 2]];
    pick.forEach(([col, row], k) => {
      g.drawImage(tc, col * frame.w, row * frame.h, frame.w, frame.h, x + 6 + k * 54 * (frame.w > 64 ? 0.9 : 1), y + 4, frame.w * scale * 0.75, frame.h * scale * 0.75);
    });
    g.fillStyle = '#2a1f14';
    g.fillText(e.name, x + cell / 2, y + cell - 6);
  }
  return c.toDataURL('image/png');
}

// ---------- Leader portraits ----------

/**
 * Head and shoulders from a composed sheet's standing frame facing the viewer, scaled up
 * `size` pixels square, the mask recoloured to the leader's faction colour ([r, g, b]).
 */
export async function portraitFrom(url, box, size, colour) {
  const img = await load(url);
  const [fc, fg] = canvas(FRAME, FRAME);
  fg.drawImage(img, box.col * FRAME, box.row * FRAME, FRAME, FRAME, 0, 0, FRAME, FRAME);
  const data = fg.getImageData(0, 0, FRAME, FRAME);
  const d = data.data;
  for (let k = 0; k < d.length; k += 4) {
    if (!d[k + 3] || d[k + 1] !== 0 || d[k] !== d[k + 2] || d[k] < 48) continue;
    const t = ((d[k] - 48) / 207) * 1.3;
    for (let q = 0; q < 3; q += 1) d[k + q] = Math.round(t <= 1 ? colour[q] * (0.35 + 0.65 * t) : colour[q] + (255 - colour[q]) * (t - 1) * 0.6);
  }
  fg.putImageData(data, 0, 0);
  const [out, og] = canvas(size, size);
  og.drawImage(fc, box.x, box.y, box.w, box.h, 0, 0, size, size);
  return out.toDataURL('image/png');
}
