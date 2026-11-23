// Things drawn fresh each frame on top of the terrain: the hex grid and
// markers (start positions in the dev viewer, later selection and paths).

import { HEX_SCREEN, cornerOffsets, tileCentre, tracePath } from '../hexDraw.js';

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
