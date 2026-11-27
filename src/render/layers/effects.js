// Effects on the map (graphics overhaul G6, docs/OVERHAUL.md 4.6): impact
// flashes, floating damage numbers, projectiles, dust where a unit falls, and
// banners over cities that are founded or taken. They are presentation only:
// they are scheduled from events after the game has already changed, they
// read nothing from the game, and they never change it.
//
// Each effect has a start time and a length in ms (performance.now() time);
// draw() paints the ones that are running and says whether any are still to
// come, so the map keeps redrawing until they are done.

import { tileCentre, HEX_SCREEN } from '../hexDraw.js';

const ease = (t) => 1 - (1 - t) * (1 - t);

export function createEffects() {
  let list = [];

  function add(effect) {
    list.push(effect);
  }

  const screen = (map, cam, tile) => {
    const p = tileCentre(map, tile);
    return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
  };

  function drawOne(ctx, map, cam, e, t) {
    const z = cam.zoom;
    switch (e.kind) {
      case 'flash': {
        // A white burst with a ring, at the point of impact.
        const p = screen(map, cam, e.tile);
        const r = (10 + 26 * ease(t)) * z;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 12 * z, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = Math.max(2, 3 * z);
        ctx.beginPath();
        ctx.arc(p.x, p.y - 12 * z, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'number': {
        // Damage floating up and fading.
        const p = screen(map, cam, e.tile);
        const y = p.y - (24 + 34 * ease(t)) * z + (e.offset ?? 0) * z;
        ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.font = `800 ${Math.round(Math.max(13, 17 * z))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1b140d';
        ctx.strokeText(e.text, p.x + (e.dx ?? 0) * z, y);
        ctx.fillStyle = e.colour ?? '#ff6a4a';
        ctx.fillText(e.text, p.x + (e.dx ?? 0) * z, y);
        break;
      }
      case 'projectile': {
        // An arrow, stone or shot on a shallow arc from one hex to another.
        const a = screen(map, cam, e.from);
        const b = screen(map, cam, e.to);
        const x = a.x + (b.x - a.x) * t;
        const arc = Math.sin(Math.PI * t) * HEX_SCREEN * 0.7 * z;
        const y = a.y + (b.y - a.y) * t - arc - 16 * z;
        const dx = b.x - a.x;
        const dy = b.y - a.y - Math.cos(Math.PI * t) * HEX_SCREEN * 0.7 * z * Math.PI;
        const ang = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        if (e.style === 'stone') {
          ctx.fillStyle = '#6b6258';
          ctx.fillRect(-3 * z, -3 * z, 6 * z, 6 * z);
        } else {
          ctx.fillStyle = '#3b2a17';
          ctx.fillRect(-9 * z, -1 * z, 18 * z, 2 * z);
          ctx.fillStyle = '#d8d2c6';
          ctx.fillRect(7 * z, -2 * z, 3 * z, 4 * z);
        }
        ctx.restore();
        break;
      }
      case 'dust': {
        // Where a unit fell: a puff of dust spreading and settling.
        const p = screen(map, cam, e.tile);
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.fillStyle = '#b8a888';
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2;
          const r = (8 + 22 * ease(t)) * z;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * r, p.y + 6 * z + Math.sin(a) * r * 0.45, (6 + 6 * t) * z, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'banner': {
        // A ribbon over a city: founded, or taken.
        const p = screen(map, cam, e.tile);
        const rise = t < 0.15 ? t / 0.15 : 1;
        ctx.globalAlpha = t < 0.8 ? rise : 1 - (t - 0.8) / 0.2;
        ctx.font = '700 16px system-ui, sans-serif';
        const w = ctx.measureText(e.text).width + 28;
        const y = p.y - HEX_SCREEN * z * 1.6 - 10 * rise;
        ctx.fillStyle = e.colour ?? '#c9a227';
        ctx.fillRect(p.x - w / 2, y - 14, w, 28);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(p.x - w / 2, y + 10, w, 4);
        ctx.beginPath();
        ctx.moveTo(p.x - w / 2, y - 14);
        ctx.lineTo(p.x - w / 2 - 10, y);
        ctx.lineTo(p.x - w / 2, y + 14);
        ctx.moveTo(p.x + w / 2, y - 14);
        ctx.lineTo(p.x + w / 2 + 10, y);
        ctx.lineTo(p.x + w / 2, y + 14);
        ctx.fill();
        ctx.fillStyle = '#fff8e6';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, p.x, y + 1);
        break;
      }
      default:
    }
    ctx.globalAlpha = 1;
  }

  /** Draw the running effects; returns true while any are running or still to start. */
  function draw(ctx, map, cam, now) {
    list = list.filter((e) => now < e.start + e.dur);
    for (const e of list) {
      if (now < e.start) continue;
      drawOne(ctx, map, cam, e, Math.min(1, (now - e.start) / e.dur));
    }
    return list.length > 0;
  }

  return { add, draw, clear: () => { list = []; }, get count() { return list.length; } };
}
