// Vehicles for Killzone: Extrasolar War (K7), drawn in code with the puppet renderer from
// Matthew's Killzone project (killzone/puppet.js) in the same three quarter side view and size
// as its tanks, so they sit beside the troopers and tanks on the map. Original designs for
// Atlas (MIT licence): an APC, a two-legged walker, Stahl's battle suit, a self-propelled field
// gun and an arc artillery tower. Each is drawn once per side: the ISA's clean and angular in
// blue-grey with yellow markings, the Helghast's riveted iron with rust and orange glows.
//
// Frames, as for the tanks: idle, move1..move4, fire, wreck.

import { cap, ell, poly, box, detail, materials, rasterise, shiftPieces, rotatePieces } from './killzone/puppet.js';

export const VEH_W = 210;
export const VEH_H = 130;

const MATS = {
  isa: materials({
    main: '#5d7489', light: '#7f98b0', dark: '#3c4d5f', track: '#26292d', trackLight: '#4a4f56', wheel: '#33383f',
    metal: '#8a929b', gun: '#2c3036', gunLight: '#4f5660', accent: '#d8c35a', rivet: '#9aa6b2',
    glass: { base: '#5fb8e8', gloss: true },
    glow: { glow: true, ramp: [0, 0, [60, 120, 200], [140, 200, 255], [140, 200, 255]], core: [235, 248, 255] },
    flash: { glow: true, ramp: [0, 0, [120, 170, 230], [200, 230, 255], [200, 230, 255]], core: [255, 255, 255] },
    arc: { glow: true, ramp: [0, 0, [80, 150, 255], [180, 220, 255], [180, 220, 255]], core: [255, 255, 255] },
    scorch: '#2a2724',
  }),
  hgh: materials({
    main: '#4e5155', light: '#6b6e72', dark: '#2f3134', track: '#1f2022', trackLight: '#45474a', wheel: '#2c2e31',
    metal: '#7d8083', gun: '#262729', gunLight: '#4a4c50', accent: '#6e4a32', rivet: '#8e9093',
    glass: { glow: true, ramp: [0, 0, [176, 38, 12], [255, 92, 28], [255, 92, 28]], core: [255, 226, 160] },
    glow: { glow: true, ramp: [0, 0, [140, 40, 12], [230, 90, 28], [230, 90, 28]], core: [255, 180, 100] },
    flash: { glow: true, ramp: [0, 0, [220, 90, 20], [255, 160, 60], [255, 160, 60]], core: [255, 244, 200] },
    arc: { glow: true, ramp: [0, 0, [200, 70, 20], [255, 170, 80], [255, 170, 80]], core: [255, 250, 220] },
    scorch: '#262320',
  }),
};

// Rivets along a line (Helghast) or panel lines (ISA), as fine detail.
function trim(P, side, x0, x1, y, z) {
  if (side === 'hgh') for (let x = x0; x <= x1; x += 9) P.push(...detail(ell([x, y], 0.8, 0.8, 'rivet', z)));
  else P.push(...detail(cap([x0, y], [x1, y], 0.5, 0.5, 'dark', z)));
}

// Road wheels that turn with phase (0..1): the APC's six big tyres, or a tracked run.
function wheels(P, xs, y, r, phase) {
  for (const x of xs) {
    P.push(ell([x, y], r, r, 'wheel', 11), ell([x, y], r * 0.45, r * 0.45, 'metal', 11.5));
    for (let s = 0; s < 3; s++) {
      const a = phase * Math.PI * 2 / 3 + (s * Math.PI * 2) / 3;
      P.push(...detail(cap([x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5], [x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85], 0.7, 0.7, 'trackLight', 11.6)));
    }
  }
}
function tracks(P, x0, x1, y0, y1, n, phase) {
  const r = (y1 - y0) / 2;
  P.push(cap([x0 + r, y0 + r], [x1 - r, y0 + r], r, r, 'track', 10));
  for (let x = x0 + r - 6 + phase * 6; x < x1 - r; x += 6) P.push(...detail(box(x, y0, x + 2.5, y0 + 2, 'trackLight', 10.5), box(x, y1 - 2, x + 2.5, y1, 'trackLight', 10.5)));
  const step = (x1 - x0 - 2 * r) / (n - 1);
  wheels(P, Array.from({ length: n }, (_, k) => x0 + r + k * step), y0 + r + 1, r * 0.7, phase);
}

// ---- APC: a six-wheeled armoured box with a small gun turret ----
function apc(side, { phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  wheels(P, [44, 76, 108, 150], 108, 12, phase);
  const hgh = side === 'hgh';
  // Hull: the ISA's low sloped wedge; the Helghast's taller riveted box with a ram plate.
  P.push(poly(hgh ? [[24, 58], [168, 58], [190, 80], [188, 100], [22, 100]] : [[22, 66], [150, 62], [188, 82], [186, 100], [20, 100]], 'main', 16));
  P.push(poly(hgh ? [[28, 58], [166, 58], [176, 68], [30, 68]] : [[26, 64], [150, 61], [172, 72], [28, 72]], 'light', 16.5));
  trim(P, side, 30, 170, 86, 16.7);
  // Troop door at the back and vision blocks along the side.
  P.push(box(26, 72, 40, 98, 'dark', 17));
  for (const x of [60, 84, 108, 132]) P.push(box(x, 74, x + 10, 79, 'glass', 17.2));
  P.push(box(hgh ? 150 : 56, hgh ? 84 : 88, hgh ? 168 : 72, hgh ? 92 : 94, 'accent', 17.3)); // marking or rust
  if (hgh) for (let k = 0; k < 4; k++) P.push(box(60 + k * 22, 90, 66 + k * 22, 94, 'glow', 17.4)); // vents
  else P.push(ell([184, 90], 2, 1.6, 'glow', 17.4)); // running light
  // Small turret with a cannon.
  const tx = -recoil * 0.4;
  P.push(poly([[96 + tx, 46], [134 + tx, 44], [144 + tx, 52], [140 + tx, 60], [98 + tx, 60]], 'main', 20));
  P.push(poly([[100 + tx, 45], [134 + tx, 44], [140 + tx, 49], [102 + tx, 51]], 'light', 20.5));
  const g = 140 - recoil * 4;
  P.push(cap([g, 51], [g + 38, 50], 2, 1.7, 'gun', 22));
  if (flash) P.push(ell([g + 44, 50], 5, 3, 'flash', 30));
  return P;
}

// ---- Walker: a pod on two long legs, a cannon under its chin ----
function walker(side, { phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  const hgh = side === 'hgh';
  // Legs swing in opposite phase while walking: hip, knee (bent back), foot.
  const leg = (hx, swing, z) => {
    const kx = hx + 6 + swing * 10;
    const fx = hx - 2 + swing * 22;
    const lift = Math.max(0, Math.sin(swing * Math.PI)) * 6;
    P.push(cap([hx, 64], [kx, 92], 5, 4, 'dark', z), cap([kx, 92], [fx, 116 - lift], 4, 3.5, 'main', z + 0.2));
    P.push(poly([[fx - 10, 116 - lift], [fx + 14, 116 - lift], [fx + 16, 121 - lift], [fx - 12, 121 - lift]], 'dark', z + 0.3));
    P.push(ell([kx, 92], 4, 4, 'metal', z + 0.4));
  };
  const s = Math.sin(phase * Math.PI * 2);
  leg(94, -s * 0.5, 12);
  leg(114, s * 0.5, 13);
  // Body pod, cockpit glass (ISA) or glowing eye slits (Helghast).
  P.push(poly(hgh ? [[70, 26], [140, 24], [160, 40], [154, 66], [76, 68], [64, 48]] : [[72, 32], [138, 28], [162, 44], [150, 64], [80, 66], [66, 50]], 'main', 18));
  P.push(poly(hgh ? [[74, 26], [140, 25], [150, 34], [76, 36]] : [[76, 31], [138, 29], [152, 38], [80, 40]], 'light', 18.5));
  trim(P, side, 80, 150, 56, 18.7);
  if (hgh) P.push(box(126, 38, 154, 42, 'glass', 19), box(130, 46, 152, 49, 'glass', 19));
  else P.push(poly([[132, 36], [156, 44], [150, 54], [130, 52]], 'glass', 19));
  P.push(box(84, 44, 100, 50, 'accent', 19.2));
  // Chin cannon and a rocket pod on the back.
  const g = 140 - recoil * 4;
  P.push(cap([g, 62], [g + 42, 63], 2.6, 2.2, 'gun', 22));
  P.push(box(70, 34, 84, 50, 'dark', 17), ...[38, 43].map((y) => ell([72, y], 1.6, 1.6, 'gunLight', 17.2)));
  if (flash) P.push(ell([g + 48, 63], 6, 3.6, 'flash', 30));
  return P;
}

// ---- Battle suit: Stahl's hulking armoured figure with an arm cannon ----
function suit(side, { phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  const s = Math.sin(phase * Math.PI * 2);
  // Thick legs.
  for (const [hx, w, z] of [[92, -s, 12], [116, s, 13]]) {
    const fx = hx + w * 10;
    P.push(cap([hx, 74], [hx + w * 4, 96], 9, 8, 'dark', z), cap([hx + w * 4, 96], [fx, 114], 8, 7, 'main', z + 0.2));
    P.push(poly([[fx - 12, 113], [fx + 14, 113], [fx + 15, 121], [fx - 13, 121]], 'dark', z + 0.3));
  }
  // Torso, a hunched block with a small head and glowing visor.
  P.push(poly([[78, 28], [132, 24], [146, 46], [138, 78], [84, 80], [72, 52]], 'main', 18));
  P.push(poly([[82, 28], [132, 25], [140, 36], [84, 38]], 'light', 18.5));
  trim(P, side, 86, 136, 62, 18.7);
  P.push(poly([[110, 12], [132, 12], [136, 26], [108, 28]], 'dark', 19), box(116, 18, 134, 21, 'glass', 19.5));
  P.push(box(88, 46, 102, 54, 'accent', 19.2));
  // Shoulder plates and the arm cannon.
  P.push(ell([86, 34], 14, 10, 'dark', 20), ell([136, 36], 12, 9, 'dark', 20));
  const g = 140 - recoil * 4;
  P.push(cap([136, 44], [g + 6, 58], 7, 6, 'main', 21), cap([g + 6, 58], [g + 44, 58], 4, 3.4, 'gun', 22));
  P.push(ell([g + 20, 58], 5, 4.4, 'gunLight', 22.5));
  if (flash) P.push(ell([g + 50, 58], 7, 4.2, 'flash', 30));
  return P;
}

// ---- Field gun: tracks, an open fighting compartment and a long barrel raised high ----
function fieldGun(side, { phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  tracks(P, 26, 180, 94, 120, 6, phase);
  P.push(poly([[22, 70], [170, 70], [186, 90], [20, 92]], 'main', 16), poly([[26, 70], [168, 70], [176, 78], [28, 78]], 'light', 16.5));
  trim(P, side, 30, 170, 86, 16.7);
  P.push(box(40, 74, 58, 82, 'accent', 17));
  // Gun house and the long barrel at 25 degrees; recoil slides it back along its own line.
  P.push(poly([[70, 50], [128, 48], [140, 70], [66, 70]], 'main', 20), poly([[72, 49], [126, 48], [132, 56], [74, 57]], 'light', 20.5));
  const a = (-25 * Math.PI) / 180;
  const r0 = 18 - recoil * 6;
  const bx = 120 + Math.cos(a) * r0;
  const by = 56 + Math.sin(a) * r0;
  P.push(cap([bx, by], [bx + Math.cos(a) * 70, by + Math.sin(a) * 70], 3.2, 2.6, 'gun', 22));
  P.push(box(bx + Math.cos(a) * 66 - 4, by + Math.sin(a) * 66 - 4, bx + Math.cos(a) * 66 + 5, by + Math.sin(a) * 66 + 4, 'gunLight', 22.5));
  if (flash) P.push(ell([bx + Math.cos(a) * 80, by + Math.sin(a) * 80], 8, 5, 'flash', 30));
  return P;
}

// ---- Arc artillery: tracks carrying a coil tower that throws a crackling arc ----
function arcArtillery(side, { phase = 0, recoil = 0, flash = false } = {}) {
  const P = [];
  tracks(P, 30, 176, 94, 120, 5, phase);
  P.push(poly([[26, 72], [170, 72], [184, 92], [24, 92]], 'main', 16), poly([[30, 72], [168, 72], [174, 80], [32, 80]], 'light', 16.5));
  trim(P, side, 32, 168, 86, 16.7);
  // The coil: stacked rings on a mast, glowing at the top.
  P.push(cap([100, 72], [100, 30], 5, 4, 'dark', 20));
  for (let k = 0; k < 5; k++) P.push(ell([100, 64 - k * 8], 12 - k, 3, k % 2 ? 'metal' : 'gunLight', 20.5 + k * 0.1));
  P.push(ell([100, 24], 7, 7, 'arc', 21));
  for (const x of [48, 66, 136, 152]) P.push(box(x, 82, x + 8, 86, 'glow', 17));
  // Firing: a jagged arc leaping forward and down.
  if (flash || recoil) {
    let p = [104, 24];
    for (let k = 0; k < 6; k++) {
      const q = [p[0] + 14, p[1] + (k % 2 ? 8 : -2)];
      P.push(cap(p, q, 1.6, 1.2, 'arc', 30));
      p = q;
    }
  }
  return P;
}

const BUILD = { apc, walker, suit, field_gun: fieldGun, arc_artillery: arcArtillery };
export const VEHICLE_KINDS = Object.keys(BUILD);

function piecesFor(kind, side, frame) {
  const make = (o) => BUILD[kind](side, o);
  if (frame.startsWith('move')) return make({ phase: (Number(frame.slice(4)) - 1) / 4 });
  if (frame === 'fire') return make({ recoil: 1, flash: true });
  if (frame === 'wreck') {
    // Knocked out: the top thrown askew, scorched, the lights gone out.
    const P = make({});
    const out = P.map((p) => (p.z >= 18 && p.z < 30 ? shiftPieces(rotatePieces([p], [105, 60], -8), -3, 4)[0] : p));
    out.push(ell([100, 70], 16, 7, 'scorch', 17.9), ell([140, 80], 9, 4, 'scorch', 17.9));
    return out.filter((p) => !['glow', 'glass', 'arc', 'flash'].includes(p.mat));
  }
  return make({});
}

const cache = new Map();

/** A canvas for one vehicle kind, side ('isa' or 'hgh'), frame and facing (1 right, -1 left). */
export function getVehicle(kind, side, frame, facing = 1) {
  const key = `${kind}|${side}|${frame}|${facing}`;
  let c = cache.get(key);
  if (c) return c;
  const px = rasterise(piecesFor(kind, side, frame), MATS[side], VEH_W, VEH_H, { dim: frame === 'wreck' ? 0.55 : 1 });
  c = document.createElement('canvas');
  c.width = VEH_W;
  c.height = VEH_H;
  const g = c.getContext('2d');
  const img = g.createImageData(VEH_W, VEH_H);
  if (facing === 1) img.data.set(px);
  else {
    for (let y = 0; y < VEH_H; y++) for (let x = 0; x < VEH_W; x++) {
      const s = (y * VEH_W + x) * 4;
      const d = (y * VEH_W + (VEH_W - 1 - x)) * 4;
      img.data.set(px.subarray(s, s + 4), d);
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
