// Cities on the map: faction borders, the city itself (a walled town drawn
// in code until art exists), a name banner with its population, and, for the
// city you have open, which tiles its citizens work (a dot), which are locked
// (a padlock) and what nearby tiles would cost to buy.

import { HEX_SCREEN, ART_SCALE, cornerOffsets, edgeCorners, tileCentre } from '../hexDraw.js';
import { shade } from '../art/placeholders.js';
import { CITY_W, CITY_H, CITY_BASE } from '../art/cityArt.js';
import { drawIcon } from '../art/icons.js';

const screen = (map, cam, t) => {
  const p = tileCentre(map, t);
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
};

/** Hex rows and columns overlapping the visible world rectangle (with a margin of one). */
function visibleRange(map, view) {
  const rowH = HEX_SCREEN * 1.5;
  const colW = HEX_SCREEN * Math.sqrt(3);
  return {
    r0: Math.max(0, Math.floor(view.y / rowH) - 1), r1: Math.min(map.height - 1, Math.ceil((view.y + view.h) / rowH) + 1),
    c0: Math.max(0, Math.floor(view.x / colW) - 1), c1: Math.min(map.width - 1, Math.ceil((view.x + view.w) / colW) + 1),
  };
}

/**
 * Borders (graphics overhaul G3, docs/OVERHAUL.md 4.2): a 12% tint of the owner's colour
 * on owned land, and one continuous edge per territory, a line in the faction colour with
 * a darker line inside it. Lines between two cities of the same faction disappear, and a
 * faction you are at war with has its border dashed.
 */
export function drawBorders(ctx, map, cam, owner, factionOf, colourOf, nbs, atWar = new Set(), view = null) {
  if (!owner) return;
  const z = cam.zoom;
  const full = cornerOffsets(HEX_SCREEN * z);
  const outer = cornerOffsets(HEX_SCREEN * z * 0.95);
  const inner = cornerOffsets(HEX_SCREEN * z * 0.95 - Math.max(2, 2.6 * z));
  const range = view ? visibleRange(map, view) : { r0: 0, r1: map.height - 1, c0: 0, c1: map.width - 1 };
  const byFaction = new Map();
  for (let r = range.r0; r <= range.r1; r += 1) {
    for (let c = range.c0; c <= range.c1; c += 1) {
      const i = r * map.width + c;
      const o = owner[i];
      if (o === null || o === undefined) continue;
      const f = factionOf(o);
      if (f === null) continue;
      if (!byFaction.has(f)) byFaction.set(f, []);
      byFaction.get(f).push(i);
    }
  }
  for (const [f, tiles] of byFaction) {
    const colour = colourOf(f);
    // The tint.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (const i of tiles) {
      const p = screen(map, cam, i);
      ctx.moveTo(p.x + full[0].x, p.y + full[0].y);
      for (let k = 1; k < 6; k += 1) ctx.lineTo(p.x + full[k].x, p.y + full[k].y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    // The edge: where the neighbour belongs to someone else (or no one).
    const edges = [];
    for (const i of tiles) {
      for (let d = 0; d < 6; d += 1) {
        const j = nbs[i][d];
        const other = j >= 0 ? owner[j] : null;
        if (other !== null && other !== undefined && factionOf(other) === f) continue;
        edges.push([i, d]);
      }
    }
    const war = atWar.has(f);
    for (const [corners, style, width] of [[outer, colour, Math.max(1.5, 2.6 * z)], [inner, shade(colour, -0.32), Math.max(1.5, 2.2 * z)]]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineCap = war ? 'butt' : 'round';
      ctx.setLineDash(war ? [7 * Math.max(z, 0.6), 5 * Math.max(z, 0.6)] : []);
      ctx.beginPath();
      for (const [i, d] of edges) {
        const p = screen(map, cam, i);
        const [a, b] = edgeCorners(d);
        ctx.moveTo(p.x + corners[a].x, p.y + corners[a].y);
        ctx.lineTo(p.x + corners[b].x, p.y + corners[b].y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

/**
 * Cities (graphics overhaul G5): the code-drawn town from `art.get(city)` (sized by
 * population, styled by era and skin, walled if it has walls), production smoke while
 * motion is allowed, and the name plate. In the strategic view, a dot and the plate.
 * extras: { [cityId]: { maxHp, build: { icon, turns } } } from the game screen.
 */
export function drawCities(ctx, map, cam, cities, colourOf, selectedCity, religionLens = null, strategic = false, { art = null, extras = {}, atlas = null, now = 0, smoke = false, pass = 'both' } = {}) {
  const z = cam.zoom;
  for (const c of cities) {
    const p = screen(map, cam, c.tile);
    const colour = colourOf(c.faction);
    if (pass === 'plate') { drawPlate(ctx, c, p, z, colour, selectedCity, religionLens, strategic, extras[c.id] ?? {}, atlas); continue; }
    if (strategic) {
      ctx.fillStyle = '#1b140d';
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
      ctx.fillStyle = colour;
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    } else if (art) {
      const look = art.get(c);
      const k = ART_SCALE * z;
      const x = Math.round(p.x - (CITY_W / 2) * k);
      const y = Math.round(p.y - CITY_BASE * k + 9 * k);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(look.canvas, x, y, Math.round(CITY_W * k), Math.round(CITY_H * k));
      if (smoke && extras[c.id]?.producing) {
        for (const ch of look.chimneys.slice(0, 3)) {
          for (let n = 0; n < 3; n += 1) {
            const t = ((now / 1400 + n / 3 + (ch.x % 5) / 5) % 1);
            ctx.globalAlpha = 0.45 * (1 - t);
            ctx.fillStyle = '#d8d2c6';
            const r = (1 + t * 2) * k;
            ctx.fillRect(Math.round(x + (ch.x + t * 3) * k - r / 2), Math.round(y + (ch.y - t * 9) * k - r / 2), Math.ceil(r), Math.ceil(r));
          }
        }
        ctx.globalAlpha = 1;
      }
    } else drawTown(ctx, p, z, colour);
    if (pass === 'both') drawPlate(ctx, c, p, z, colour, selectedCity, religionLens, strategic, extras[c.id] ?? {}, atlas);
  }
}

/** A little walled town: wall, two towers, a keep (used when no city art is available). */
function drawTown(ctx, p, z, colour) {
  const w = 34 * z;
  const h = 20 * z;
  const x = p.x - w / 2;
  const y = p.y - h / 2 + 4 * z;
  ctx.fillStyle = '#d9cfb4';
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = Math.max(1, 1.5 * z);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(p.x - 7 * z, y - 12 * z, 14 * z, 14 * z);
  ctx.strokeRect(p.x - 7 * z, y - 12 * z, 14 * z, 14 * z);
}

/**
 * The name plate: population in the faction's colour, a star for a capital, the name,
 * what it is building and in how many turns (your own cities), and a health bar when hurt.
 * The same size at every zoom, so it stays readable; slimmer in the strategic view.
 */
function drawPlate(ctx, c, p, z, colour, selectedCity, religionLens, strategic, extra, atlas) {
  const fs = strategic ? 11 : Math.round(Math.min(14, Math.max(11, 12 * z)));
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  const label = c.name;
  const tw = ctx.measureText(label).width;
  const bh = Math.round(fs * 1.6);
  const star = c.capital ? bh * 0.7 : 0;
  const build = !strategic && extra.build ? extra.build : null;
  const buildText = build ? String(build.turns) : '';
  const bwBuild = build ? bh * 0.8 + ctx.measureText(buildText).width + 6 : 0;
  const bw = bh + 8 + star + tw + 8 + bwBuild;
  const bx = Math.round(p.x - bw / 2);
  const by = Math.round(strategic ? p.y - bh - 7 : p.y - HEX_SCREEN * z * 0.98 - bh * 0.4);
  ctx.fillStyle = 'rgba(32, 24, 17, 0.9)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = colour;
  ctx.fillRect(bx, by, bh, bh);
  ctx.fillStyle = shade(colour, -0.35);
  ctx.fillRect(bx, by + bh - 2, bw, 2);
  if (c.id === selectedCity) {
    ctx.strokeStyle = '#ffe36b';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(c.pop), bx + bh / 2, by + bh / 2 + 0.5);
  let x = bx + bh + 6;
  if (star) {
    if (!drawIcon(ctx, atlas, 'capital', x + star / 2, by + bh / 2, Math.round(bh * 0.7))) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(x + star / 2, by + bh / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    x += star;
  }
  ctx.fillStyle = '#f1e6cf';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, by + bh / 2 + 0.5);
  if (build) {
    const bxi = x + tw + 8;
    ctx.fillStyle = 'rgba(241, 230, 207, 0.18)';
    ctx.fillRect(bxi - 4, by + 2, 1, bh - 4);
    drawIcon(ctx, atlas, build.icon, bxi + bh * 0.4, by + bh / 2, Math.round(bh * 0.7));
    ctx.fillStyle = '#e8d9b8';
    ctx.fillText(buildText, bxi + bh * 0.8 + 2, by + bh / 2 + 0.5);
  }
  // Health, only when hurt.
  if (extra.maxHp && (c.hp ?? extra.maxHp) < extra.maxHp) {
    const f = Math.max(0, Math.min(1, c.hp / extra.maxHp));
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by + bh + 1, bw, 4);
    ctx.fillStyle = f > 0.5 ? '#5cc35c' : f > 0.25 ? '#e0b43c' : '#d9503f';
    ctx.fillRect(bx, by + bh + 1, Math.round(bw * f), 4);
  }
  // Religion lens: one pip per citizen, in the colour of their religion, above the plate (grey: none).
  const pips = religionLens?.[c.id];
  if (pips) {
    const r = Math.max(3, 4 * z);
    const list = [];
    for (const p2 of pips) for (let k = 0; k < p2.n; k += 1) list.push(p2.colour);
    while (list.length < c.pop) list.push('#9a9a9a');
    const shown = list.slice(0, 10);
    const px = p.x - ((shown.length - 1) * (r * 2 + 2)) / 2;
    const py = by - r - 3;
    shown.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px + i * (r * 2 + 2), py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
}

/** For the open city: dots on worked tiles, padlocks on locked ones, prices on tiles for sale. */
export function drawCityWork(ctx, map, cam, overlay) {
  if (!overlay) return;
  const z = cam.zoom;
  for (const t of overlay.worked) {
    const p = screen(map, cam, t);
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2 * z, 8 * Math.max(0.8, z), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 244, 200, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1f2430';
    ctx.stroke();
    // A tiny person.
    ctx.fillStyle = '#1f2430';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 5 * z, 2.2 * Math.max(0.8, z), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x - 2.5 * Math.max(0.8, z), p.y - 2 * z, 5 * Math.max(0.8, z), 5 * Math.max(0.8, z));
  }
  for (const t of overlay.locks) {
    const p = screen(map, cam, t);
    const s = Math.max(0.8, z);
    const x = p.x + 10 * s;
    const y = p.y - 14 * s;
    ctx.fillStyle = '#1f2430';
    ctx.fillRect(x - 5 * s, y, 10 * s, 8 * s);
    ctx.strokeStyle = '#1f2430';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(x, y, 3.5 * s, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(x - 1 * s, y + 2.5 * s, 2 * s, 3 * s);
  }
  ctx.font = `600 ${Math.round(Math.max(10, 12 * z))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { tile, price, pending } of overlay.prices ?? []) {
    const p = screen(map, cam, tile);
    const label = `${price}g`;
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = pending ? '#ffe36b' : 'rgba(20, 22, 28, 0.78)';
    ctx.fillRect(p.x - w / 2, p.y - 9, w, 18);
    ctx.fillStyle = pending ? '#1f2430' : '#ffe36b';
    ctx.fillText(label, p.x, p.y + 0.5);
  }
}

/** Raider camps the player has seen: a dark tent with a red pennant. */
export function drawCamps(ctx, map, cam, camps) {
  const z = cam.zoom;
  for (const tile of camps ?? []) {
    const p = screen(map, cam, tile);
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.moveTo(p.x - 14 * z, p.y + 10 * z);
    ctx.lineTo(p.x, p.y - 12 * z);
    ctx.lineTo(p.x + 14 * z, p.y + 10 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.stroke();
    ctx.fillStyle = '#1a120b';
    ctx.fillRect(p.x - 3 * z, p.y + 2 * z, 6 * z, 8 * z);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(p.x, p.y - 20 * z, 9 * z, 5 * z);
    ctx.fillStyle = '#111';
    ctx.fillRect(p.x - 1 * z, p.y - 20 * z, 2 * z, 9 * z);
  }
}
