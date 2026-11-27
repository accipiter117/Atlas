// Units on the map (section 10.6): a faction-coloured base disc, the sprite
// (or a code-drawn shield with a class letter while art is missing), and an
// HP bar when hurt. Units walking along a path are drawn between tiles with
// their walk animation; with reduced motion they simply jump.

import { HEX_SCREEN, tileCentre } from '../hexDraw.js';
import { HEX_FACING } from '../art/spriteSheet.js';
import { drawIcon, unitIconName } from '../art/icons.js';

const SPRITE_PX = 48;

/** Which way (n, w, s or e) a unit faces when stepping from tile a to neighbouring tile b. */
export function facingBetween(map, a, b) {
  const ca = tileCentre(map, a);
  const cb = tileCentre(map, b);
  const ang = Math.atan2(cb.y - ca.y, cb.x - ca.x);
  const d = Math.round(((-ang * 180) / Math.PI) / 60);
  return HEX_FACING[((d % 6) + 6) % 6];
}

export function createUnitsLayer({ map, ruleset, sheets, colours, reducedMotion }) {
  const anims = new Map(); // unit id -> { path, start, msPerTile }
  const facing = new Map(); // unit id -> last facing, kept between redraws
  const nbsDir = (a, b) => facingBetween(map, a, b);

  function animate(unitId, path, now) {
    if (path.length < 2) return;
    if (reducedMotion()) { facing.set(unitId, nbsDir(path.at(-2), path.at(-1))); return; }
    anims.set(unitId, { path, start: now, msPerTile: 220 });
  }

  function placeOf(unit, now) {
    const a = anims.get(unit.id);
    if (!a) return { ...tileCentre(map, unit.tile), facing: facing.get(unit.id) ?? 's', moving: false };
    const t = (now - a.start) / a.msPerTile;
    if (t >= a.path.length - 1) {
      anims.delete(unit.id);
      facing.set(unit.id, nbsDir(a.path.at(-2), a.path.at(-1)));
      return { ...tileCentre(map, a.path.at(-1)), facing: facing.get(unit.id), moving: false };
    }
    const k = Math.floor(t);
    const f = t - k;
    const p = tileCentre(map, a.path[k]);
    const q = tileCentre(map, a.path[k + 1]);
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, facing: nbsDir(a.path[k], a.path[k + 1]), moving: true };
  }

  function drawPlaceholder(ctx, x, y, size, colour, letter) {
    const w = size * 0.5;
    const h = size * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h);
    ctx.lineTo(x + w / 2, y - h);
    ctx.lineTo(x + w / 2, y - h * 0.35);
    ctx.quadraticCurveTo(x + w / 2, y - h * 0.05, x, y);
    ctx.quadraticCurveTo(x - w / 2, y - h * 0.05, x - w / 2, y - h * 0.35);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size / 28);
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(size * 0.28)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y - h * 0.55);
  }

  /** Draw units; returns true while any are still walking (so the view keeps redrawing). */
  /** The strategic view: a small flag in the faction's colour with the unit's class icon. */
  function drawBanner(ctx, x, y, colour, u, atlas, selected) {
    ctx.fillStyle = '#1b140d';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 22, 2, 22);
    ctx.fillRect(Math.round(x) - 9, Math.round(y) - 23, 19, 16);
    ctx.fillStyle = colour;
    ctx.fillRect(Math.round(x) - 8, Math.round(y) - 22, 17, 14);
    if (!drawIcon(ctx, atlas, unitIconName(ruleset, u.type), Math.round(x) + 0.5, Math.round(y) - 15, 12)) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 17, 4, 4);
    }
    if (selected) {
      ctx.strokeStyle = '#ffe36b';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(x) - 10, Math.round(y) - 24, 21, 18);
    }
  }

  function draw(ctx, cam, units, { selected, now, strategic = false, atlas = null }) {
    const scale = cam.zoom;
    const sorted = units.slice().sort((a, b) => a.tile - b.tile);
    for (const u of sorted) {
      const p = placeOf(u, now);
      if (strategic) {
        const civilian = ruleset.unitClasses[ruleset.units[u.type]?.class]?.civilian;
        drawBanner(ctx, (p.x - cam.x) * scale + (civilian ? -7 : 7), (p.y - cam.y) * scale + 6, colours[u.faction] ?? '#888', u, atlas, u.id === selected);
        continue;
      }
      const civilian = ruleset.unitClasses[ruleset.units[u.type]?.class]?.civilian;
      // Civilians stand a little behind (up and left), combat units in front.
      const off = civilian ? -HEX_SCREEN * 0.22 : HEX_SCREEN * 0.12;
      const x = (p.x + off * 0.6 - cam.x) * scale;
      const y = (p.y + off * 0.4 + HEX_SCREEN * 0.38 - cam.y) * scale;
      const colour = colours[u.faction] ?? '#888';
      // Base disc.
      ctx.beginPath();
      ctx.ellipse(x, y, 17 * scale, 7 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (u.id === selected) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffe36b';
        ctx.stroke();
      }
      const sheet = sheets[`unit.${u.type}`];
      if (sheet?.ready) {
        const f = sheet.frame(p.moving ? 'walk' : 'idle', p.facing, now);
        const s = (SPRITE_PX / sheet.desc.frame.w) * scale;
        ctx.drawImage(sheet.image, f.sx, f.sy, f.sw, f.sh, x - sheet.desc.anchor.x * s, y - sheet.desc.anchor.y * s, f.sw * s, f.sh * s);
      } else {
        const letter = (ruleset.text[ruleset.units[u.type]?.nameKey] ?? u.type).slice(0, 1).toUpperCase();
        drawPlaceholder(ctx, x, y - 2 * scale, SPRITE_PX * scale, colour, letter);
      }
      if (u.hp < 100) {
        const w = 30 * scale;
        ctx.fillStyle = '#111';
        ctx.fillRect(x - w / 2, y + 8 * scale, w, 4 * scale);
        ctx.fillStyle = u.hp > 50 ? '#5cc35c' : u.hp > 25 ? '#e0b43c' : '#d9503f';
        ctx.fillRect(x - w / 2, y + 8 * scale, (w * u.hp) / 100, 4 * scale);
      }
    }
    return anims.size > 0;
  }

  return { draw, animate, isAnimating: () => anims.size > 0 };
}
