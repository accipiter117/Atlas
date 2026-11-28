// Things drawn fresh each frame on top of the terrain: the hex grid and
// markers (start positions in the dev viewer, later selection and paths).

import { HEX_SCREEN, cornerOffsets, edgeCorners, tileCentre, tracePath } from '../hexDraw.js';
import { drawIcon } from '../art/icons.js';

export function drawGrid(ctx, map, cam, view) {
  const corners = cornerOffsets(HEX_SCREEN * cam.zoom);
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.22)';
  ctx.lineWidth = 1;
  const rowH = HEX_SCREEN * 1.5;
  const r0 = Math.max(0, Math.floor(view.y / rowH) - 1);
  const r1 = Math.min(map.height - 1, Math.ceil((view.y + view.h) / rowH) + 1);
  const colW = HEX_SCREEN * Math.sqrt(3);
  const c0 = Math.max(0, Math.floor(view.x / colW) - 1);
  const c1 = Math.min(map.width - 1, Math.ceil((view.x + view.w) / colW) + 1);
  ctx.beginPath();
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const p = tileCentre(map, r * map.width + c);
      const x = (p.x - cam.x) * cam.zoom;
      const y = (p.y - cam.y) * cam.zoom;
      ctx.moveTo(x + corners[0].x, y + corners[0].y);
      for (let k = 1; k < 6; k += 1) ctx.lineTo(x + corners[k].x, y + corners[k].y);
      ctx.closePath();
    }
  }
  ctx.stroke();
}

export function drawMarkers(ctx, map, cam, tiles, colour = '#ffffff') {
  const corners = cornerOffsets(HEX_SCREEN * cam.zoom * 0.82);
  tiles.forEach((i, n) => {
    const p = tileCentre(map, i);
    const x = (p.x - cam.x) * cam.zoom;
    const y = (p.y - cam.y) * cam.zoom;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111';
    tracePath(ctx, x, y, corners);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colour;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = `bold ${Math.round(14 * Math.max(cam.zoom, 0.7))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colour;
    ctx.fillText(String(n + 1), x, y);
  });
}

/** Outline one tile (hover, selection target). */
export function drawTileOutline(ctx, map, cam, tile, colour, width = 2) {
  const corners = cornerOffsets(HEX_SCREEN * cam.zoom * 0.94);
  const p = tileCentre(map, tile);
  tracePath(ctx, (p.x - cam.x) * cam.zoom, (p.y - cam.y) * cam.zoom, corners);
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.stroke();
}

/**
 * A planned path: a line from the unit through each tile, with a numbered
 * badge where each turn ends ("1" is the end of this turn).
 */
export function drawPath(ctx, map, cam, from, plan) {
  if (!plan) return;
  const pts = [from, ...plan.tiles].map((t) => {
    const p = tileCentre(map, t);
    return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
  });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, colour] of [[6, 'rgba(0,0,0,0.45)'], [3, '#fff3b0']]) {
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.lineWidth = w * Math.max(0.7, cam.zoom);
    ctx.strokeStyle = colour;
    ctx.stroke();
  }
  const r = 11 * Math.max(0.8, cam.zoom);
  plan.tiles.forEach((t, k) => {
    const endsTurn = k === plan.tiles.length - 1 || plan.turns[k + 1] > plan.turns[k];
    if (!endsTurn) return;
    const p = pts[k + 1];
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1f2430';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff3b0';
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(plan.turns[k] + 1), p.x, p.y + 0.5);
  });
}

/**
 * The front line (phase 19): each land tile tinted towards the side that holds
 * it (stronger the firmer its control), a bold line where control changes
 * hands, and each site as a marker in its holder's colour with its letter.
 * front: { control, sites, colours: [side 0, side 1], letters: { siteId: 'F' } }.
 */
export function drawFront(ctx, map, cam, view, front, nbs) {
  if (!front) return;
  const corners = cornerOffsets(HEX_SCREEN * cam.zoom * 0.98);
  const rowH = HEX_SCREEN * 1.5;
  const colW = HEX_SCREEN * Math.sqrt(3);
  const r0 = Math.max(0, Math.floor(view.y / rowH) - 1);
  const r1 = Math.min(map.height - 1, Math.ceil((view.y + view.h) / rowH) + 1);
  const c0 = Math.max(0, Math.floor(view.x / colW) - 1);
  const c1 = Math.min(map.width - 1, Math.ceil((view.x + view.w) / colW) + 1);
  const { control } = front;
  const sideOf = (v) => (v > 0 ? 0 : v < 0 ? 1 : null);
  // Tiles grouped by side and by five strengths, each group filled as one shape, so
  // neighbouring hexes join without the seams that read as a grid (graphics overhaul G3).
  const full = cornerOffsets(HEX_SCREEN * cam.zoom);
  const groups = new Map();
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const i = r * map.width + c;
      const v = control[i] ?? 0;
      if (!v) continue;
      const key = `${sideOf(v)}|${Math.min(4, Math.floor(Math.abs(v) / 20))}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
  }
  for (const [key, tiles] of groups) {
    const [side, level] = key.split('|').map(Number);
    ctx.globalAlpha = 0.08 + ((level + 0.5) / 5) * 0.2;
    ctx.fillStyle = front.colours[side];
    ctx.beginPath();
    for (const i of tiles) {
      const p = tileCentre(map, i);
      const x = (p.x - cam.x) * cam.zoom;
      const y = (p.y - cam.y) * cam.zoom;
      ctx.moveTo(x + full[0].x, y + full[0].y);
      for (let k = 1; k < 6; k += 1) ctx.lineTo(x + full[k].x, y + full[k].y);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // The line itself: every edge between tiles held by different sides.
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = Math.max(2, 3.5 * cam.zoom);
  ctx.lineCap = 'round';
  ctx.setLineDash([Math.max(4, 8 * cam.zoom), Math.max(3, 5 * cam.zoom)]);
  ctx.beginPath();
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const i = r * map.width + c;
      const s = sideOf(control[i] ?? 0);
      if (s === null) continue;
      const p = tileCentre(map, i);
      const x = (p.x - cam.x) * cam.zoom;
      const y = (p.y - cam.y) * cam.zoom;
      for (let d = 0; d < 3; d += 1) {
        const j = nbs[i][d];
        if (j < 0) continue;
        const o = sideOf(control[j] ?? 0);
        if (o === null || o === s) continue;
        const [a, b] = edgeCorners(d);
        ctx.moveTo(x + corners[a].x, y + corners[a].y);
        ctx.lineTo(x + corners[b].x, y + corners[b].y);
      }
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Sites.
  const size = Math.max(10, 16 * cam.zoom);
  ctx.font = `bold ${Math.round(size * 0.7)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const s of Object.values(front.sites ?? {})) {
    const p = tileCentre(map, s.tile);
    const x = (p.x - cam.x) * cam.zoom;
    const y = (p.y - cam.y) * cam.zoom - size * 0.9;
    ctx.fillStyle = s.owner === null || s.owner === undefined ? '#d8d2c0' : front.colours[s.owner];
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = '#111';
    ctx.fillText(front.letters?.[s.site] ?? '?', x, y + 1);
  }
}

/**
 * Resources (graphics overhaul G5, docs/OVERHAUL.md 4.5): a small round token with the
 * resource's icon (assets/icons.svg, "res-<id>"), at the bottom right of its hex, at screen
 * resolution so it stays crisp at any zoom. Without the icon, a gem in the class's colour.
 */
export function drawResources(ctx, map, cam, view, atlas, classColour) {
  const rowH = HEX_SCREEN * 1.5;
  const colW = HEX_SCREEN * Math.sqrt(3);
  const r0 = Math.max(0, Math.floor(view.y / rowH) - 1);
  const r1 = Math.min(map.height - 1, Math.ceil((view.y + view.h) / rowH) + 1);
  const c0 = Math.max(0, Math.floor(view.x / colW) - 1);
  const c1 = Math.min(map.width - 1, Math.ceil((view.x + view.w) / colW) + 1);
  const z = cam.zoom;
  const r = Math.max(6, Math.round(10 * Math.min(1.4, z)));
  for (let row = r0; row <= r1; row += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const i = row * map.width + c;
      if (map.resource[i] < 0 || map.terrain[i] < 0) continue;
      const id = map.resourceIds[map.resource[i]];
      const p = tileCentre(map, i);
      const x = Math.round((p.x - cam.x) * z + 18 * z);
      const y = Math.round((p.y - cam.y) * z + 16 * z);
      ctx.fillStyle = 'rgba(20, 14, 8, 0.35)';
      ctx.beginPath();
      ctx.arc(x + 1.5, y + 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#efe3c6';
      ctx.strokeStyle = classColour(id);
      ctx.lineWidth = Math.max(1.5, 2 * z);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!drawIcon(ctx, atlas, `res-${id}`, x, y, 16)) {
        ctx.fillStyle = classColour(id);
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }
}

/**
 * K7: the landing planner's lens. Hexes where the waiting star map order can go are washed
 * green; hexes under enemy anti-air are hatched red (drawn under everything that stands there).
 */
export function drawZones(ctx, map, cam, visible, zones) {
  const corners = cornerOffsets(HEX_SCREEN * cam.zoom * 0.96);
  const near = (t) => {
    const p = tileCentre(map, t);
    return p.x > visible.x - HEX_SCREEN * 2 && p.x < visible.x + visible.w + HEX_SCREEN * 2 && p.y > visible.y - HEX_SCREEN * 2 && p.y < visible.y + visible.h + HEX_SCREEN * 2 ? p : null;
  };
  ctx.save();
  for (const t of zones.antiAir ?? []) {
    const p = near(t);
    if (!p) continue;
    tracePath(ctx, (p.x - cam.x) * cam.zoom, (p.y - cam.y) * cam.zoom, corners);
    ctx.fillStyle = 'rgba(200, 50, 40, 0.28)';
    ctx.fill();
  }
  for (const t of zones.ok ?? []) {
    const p = near(t);
    if (!p) continue;
    tracePath(ctx, (p.x - cam.x) * cam.zoom, (p.y - cam.y) * cam.zoom, corners);
    ctx.fillStyle = 'rgba(80, 200, 110, 0.26)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, cam.zoom);
    ctx.strokeStyle = 'rgba(120, 230, 150, 0.7)';
    ctx.stroke();
  }
  ctx.restore();
}
