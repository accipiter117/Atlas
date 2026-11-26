// Drawing the tactical battle (phase 18): the field cell by cell, each band as
// its soldiers in formation (one figure per tuning.hpPerMan of health), the
// walls, and the blows and volleys of this step. Pixel style: everything is
// drawn at field size and scaled up without smoothing. Light comes from the
// upper right, as on the strategic map. Reads the battle; never changes it.

import { CELL, GROUND } from '../sim/field.js';
import { FORMATIONS } from '../sim/battle.js';

const BASE = { grassland: '#7f9c4f', plains: '#a6a25c', desert: '#d4bb7c', tundra: '#8e9c86', snow: '#dde4e8', coast: '#7f9c4f', mountain: '#8d8a7e' };
const GROUND_COLOUR = { [GROUND.forest]: '#3f6633', [GROUND.hill]: '#a4a070', [GROUND.river]: '#4f86b0', [GROUND.water]: '#2f5f88', [GROUND.marsh]: '#6c8160', [GROUND.wall]: '#8a8478' };

/** A small deterministic wobble so the field is not flat (no randomness in drawing). */
const wobble = (c, r) => (((c * 73856093) ^ (r * 19349663)) >>> 0) % 7;

function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** Draw the ground once; returns an offscreen canvas the frame copies. */
export function drawGround(doc, field) {
  const can = doc.createElement('canvas');
  can.width = field.width;
  can.height = field.height;
  const g = can.getContext('2d');
  const base = BASE[field.base] ?? BASE.grassland;
  for (let r = 0; r < field.rows; r += 1) {
    for (let c = 0; c < field.cols; c += 1) {
      const kind = field.cells[r * field.cols + c];
      const colour = GROUND_COLOUR[kind] ?? base;
      g.fillStyle = shade(colour, wobble(c, r) - 3);
      g.fillRect(c * CELL, r * CELL, CELL, CELL);
      // Texture: tufts, trees, ripples, stones.
      const w = wobble(r, c);
      if (kind === GROUND.forest) {
        for (let k = 0; k < 3; k += 1) {
          const x = c * CELL + 3 + ((w + k * 7) % 14);
          const y = r * CELL + 4 + ((w * 3 + k * 5) % 12);
          g.fillStyle = '#2c4d24';
          g.fillRect(x - 3, y - 3, 6, 6);
          g.fillStyle = '#5c8a46';
          g.fillRect(x - 1, y - 3, 3, 2);
        }
      } else if (kind === GROUND.hill) {
        g.fillStyle = shade(colour, 18);
        g.fillRect(c * CELL + 6, r * CELL + 5, 9, 2);
        g.fillStyle = shade(colour, -22);
        g.fillRect(c * CELL + 4, r * CELL + 12, 9, 2);
      } else if (kind === GROUND.river || kind === GROUND.water) {
        g.fillStyle = shade(colour, 25);
        g.fillRect(c * CELL + 2 + (w % 6), r * CELL + 6, 6, 1);
        g.fillRect(c * CELL + 8 + (w % 5), r * CELL + 13, 5, 1);
      } else if (kind === GROUND.wall) {
        g.fillStyle = '#b3ad9f';
        g.fillRect(c * CELL, r * CELL + 2, CELL, 4);
        g.fillStyle = '#5f5a50';
        g.fillRect(c * CELL, r * CELL + CELL - 4, CELL, 4);
        for (let k = 0; k < CELL; k += 8) { g.fillStyle = '#9c968a'; g.fillRect(c * CELL + k, r * CELL - 3, 4, 5); }
      } else {
        g.fillStyle = shade(colour, -14);
        if (w < 3) g.fillRect(c * CELL + 4 + w * 3, r * CELL + 9, 1, 3);
      }
    }
  }
  return can;
}

/** Where each surviving soldier of a band stands. */
export function soldierSpots(band, hpPerMan) {
  const f = FORMATIONS[band.formation] ?? FORMATIONS.line;
  const men = band.garrison ? band.men0 : Math.max(band.alive ? 1 : 0, Math.ceil(band.hp / hpPerMan));
  const rx = -band.fy;
  const ry = band.fx;
  const spots = [];
  for (let i = 0; i < men; i += 1) {
    const col = i % f.across;
    const rank = Math.floor(i / f.across);
    const across = (col - (Math.min(f.across, men) - 1) / 2) * f.spacing;
    const back = rank * f.rankGap - (Math.ceil(men / f.across) - 1) * f.rankGap / 2;
    spots.push({ x: band.x + rx * across - band.fx * back, y: band.y + ry * across - band.fy * back });
  }
  return spots;
}

/** One soldier, drawn on a 2-pixel grid so the figures read at a glance. */
function soldier(g, x, y, band, colour, step) {
  const X = Math.round(x);
  const Y = Math.round(y);
  const px = (dx, dy, w, h, c) => { g.fillStyle = c; g.fillRect(X + dx * 2, Y + dy * 2, w * 2, h * 2); };
  const bob = band.alive && band.engaged ? ((step + X) % 4 < 2 ? 0 : 1) : 0;
  if (band.siege) {
    px(-4, -1, 8, 3, '#5a4630');
    px(-1, -5, 1, 5, '#3b2e20');
    px(-3, 2, 2, 1, '#2a2118');
    px(2, 2, 2, 1, '#2a2118');
    return;
  }
  if (band.mounted) {
    px(-3, 0, 6, 2, '#6b4a2b');
    px(2, -1, 2, 1, '#6b4a2b');
    px(-3, 2, 1, 2, '#4a321d');
    px(2, 2, 1, 2, '#4a321d');
  }
  const top = band.mounted ? -5 : -3;
  px(-1, top + 2 - bob, 2, 3, colour);
  px(-1, top - bob, 2, 2, '#e2c4a0');
  if (!band.mounted) { px(-1, top + 5 - bob, 1, 1, '#3a3020'); px(0, top + 5 - bob, 1, 1, '#3a3020'); }
  if (band.cls === 'anti_cavalry') px(1, top - 3, 1, 8, '#4a4a4a');
  else if (band.cls === 'ranged') { px(1, top, 1, 4, '#5a3d22'); px(2, top + 1, 1, 2, '#5a3d22'); }
  else px(1, top + 1 - bob, 1, 3, '#9aa0a6');
}

/**
 * Draw one frame. opts: { colours: { attacker, defender }, selected, ground (from drawGround), hpPerMan }.
 */
export function drawBattle(g, b, opts) {
  const { field } = b;
  g.imageSmoothingEnabled = false;
  g.drawImage(opts.ground, 0, 0);
  const step = b.tickNo;
  // The walls' health shows as cracks and a bar.
  if (b.walls) {
    const w = b.walls;
    const share = w.hp / w.hp0;
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillRect(w.x - 60, w.y - 22, 120, 5);
    g.fillStyle = share > 0.5 ? '#d8c07a' : share > 0.25 ? '#d38b3a' : '#c0432e';
    g.fillRect(w.x - 60, w.y - 22, 120 * share, 5);
    if (!w.alive) { g.fillStyle = 'rgba(60, 50, 40, 0.8)'; g.fillRect(w.x - 30, w.y - 8, 60, 16); }
  }
  for (const band of b.bands) {
    const colour = opts.colours[band.side] ?? '#888';
    for (const s of soldierSpots(band, opts.hpPerMan)) soldier(g, s.x, s.y, band, colour, step);
    if (!band.alive) continue;
    // Health bar and selection ring.
    const share = band.hp / band.hp0;
    const top = band.y - band.depth / 2 - 22;
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillRect(band.x - 20, top, 40, 5);
    g.fillStyle = share > 0.5 ? '#7cc48b' : share > 0.25 ? '#e0b04a' : '#d0533c';
    g.fillRect(band.x - 20, top, 40 * share, 5);
    if (opts.selected === band.id) {
      g.strokeStyle = '#fff4c8';
      g.lineWidth = 1;
      g.strokeRect(Math.round(band.x - band.width / 2 - 5) + 0.5, Math.round(band.y - band.depth / 2 - 6) + 0.5, Math.round(band.width + 10), Math.round(band.depth + 12));
    }
    if (band.order?.type === 'move' && band.side === b.playerSide) {
      g.fillStyle = '#fff4c8';
      g.fillRect(Math.round(band.order.x) - 2, Math.round(band.order.y) - 2, 4, 4);
    }
  }
  // This step's blows and volleys.
  for (const e of b.effects) {
    if (e.type === 'volley') {
      const from = b.bands.find((x) => x.id === e.from);
      if (!from) continue;
      const k = (step % 5) / 5;
      g.fillStyle = '#2a2a2a';
      for (let i = 0; i < 4; i += 1) g.fillRect(Math.round(from.x + (e.x - from.x) * k + i * 6 - 9), Math.round(from.y + (e.y - from.y) * k - i * 2), 3, 1);
    } else if (e.type === 'blow' && step % 3 === 0) {
      g.fillStyle = '#fff1b0';
      g.fillRect(Math.round(e.x) - 6 + (step % 12), Math.round(e.y) + ((step * 5) % 7) - 3, 2, 2);
    }
  }
  return field;
}
