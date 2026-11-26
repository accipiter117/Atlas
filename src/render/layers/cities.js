// Cities on the map: faction borders, the city itself (a walled town drawn
// in code until art exists), a name banner with its population, and, for the
// city you have open, which tiles its citizens work (a dot), which are locked
// (a padlock) and what nearby tiles would cost to buy.

import { HEX_SCREEN, cornerOffsets, edgeCorners, tileCentre } from '../hexDraw.js';

const screen = (map, cam, t) => {
  const p = tileCentre(map, t);
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
};

/** Lines along every hex edge where ownership changes, in the owner's colour. */
export function drawBorders(ctx, map, cam, owner, cityColour, nbs) {
  if (!owner) return;
  const corners = cornerOffsets(HEX_SCREEN * cam.zoom * 0.97);
  ctx.lineWidth = Math.max(2, 3 * cam.zoom);
  ctx.lineCap = 'round';
  for (let i = 0; i < owner.length; i += 1) {
    const o = owner[i];
    if (o === null || o === undefined) continue;
    const p = screen(map, cam, i);
    if (p.x < -100 || p.y < -100 || p.x > ctx.canvas.width + 100 || p.y > ctx.canvas.height + 100) continue;
    ctx.strokeStyle = cityColour(o);
    ctx.beginPath();
    for (let d = 0; d < 6; d += 1) {
      const j = nbs[i][d];
      const other = j >= 0 ? owner[j] : null;
      if (other !== null && other !== undefined && cityColour(other) === cityColour(o)) continue;
      const [a, b] = edgeCorners(d);
      ctx.moveTo(p.x + corners[a].x, p.y + corners[a].y);
      ctx.lineTo(p.x + corners[b].x, p.y + corners[b].y);
    }
    ctx.stroke();
  }
}

export function drawCities(ctx, map, cam, cities, colourOf, selectedCity, religionLens = null) {
  const z = cam.zoom;
  for (const c of cities) {
    const p = screen(map, cam, c.tile);
    const colour = colourOf(c.faction);
    // A little walled town: wall, two towers, a keep.
    const w = 34 * z;
    const h = 20 * z;
    const x = p.x - w / 2;
    const y = p.y - h / 2 + 4 * z;
    ctx.fillStyle = '#d9cfb4';
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillRect(x - 3 * z, y - 6 * z, 9 * z, h + 6 * z);
    ctx.strokeRect(x - 3 * z, y - 6 * z, 9 * z, h + 6 * z);
    ctx.fillRect(x + w - 6 * z, y - 6 * z, 9 * z, h + 6 * z);
    ctx.strokeRect(x + w - 6 * z, y - 6 * z, 9 * z, h + 6 * z);
    ctx.fillStyle = colour;
    ctx.fillRect(p.x - 7 * z, y - 12 * z, 14 * z, 14 * z);
    ctx.strokeRect(p.x - 7 * z, y - 12 * z, 14 * z, 14 * z);
    // Banner: population and name.
    ctx.font = `600 ${Math.round(Math.max(11, 13 * z))}px system-ui, sans-serif`;
    const label = c.name;
    const tw = ctx.measureText(label).width;
    const bh = Math.max(16, 20 * z);
    const bw = tw + bh + 14;
    const bx = p.x - bw / 2;
    const by = p.y - HEX_SCREEN * z * 0.95;
    ctx.fillStyle = 'rgba(20, 22, 28, 0.88)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = colour;
    ctx.fillRect(bx, by, bh, bh);
    if (c.id === selectedCity) {
      ctx.strokeStyle = '#ffe36b';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.pop), bx + bh / 2, by + bh / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.fillText(label, bx + bh + 7, by + bh / 2 + 0.5);
    // Religion lens: one pip per citizen, in the colour of their religion, above the banner (grey: none).
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
    if (c.capital) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      const sx = bx + bw - 2;
      ctx.arc(sx, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
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
