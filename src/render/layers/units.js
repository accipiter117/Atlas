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

export function createUnitsLayer({ map, ruleset, sheets, colours, civs = {}, reducedMotion }) {
  /** A faction's own sheet for a unit (Killzone's ISA and Helghast troopers), else the shared one. */
  const sheetFor = (type, faction) => sheets[`unit.${type}.${civs[faction]}`] ?? sheets[`unit.${type}`] ?? null;
  const anims = new Map(); // unit id -> { path, start, msPerTile }
  const lunges = new Map(); // unit id -> { to, start, dur } (graphics overhaul G6)
  const facing = new Map(); // unit id -> last facing, kept between redraws
  const nbsDir = (a, b) => facingBetween(map, a, b);

  /** Walk a unit along a path, starting at `start` (later moves wait their turn), `msPerTile` per step. */
  function animate(unitId, path, now, { start = now, msPerTile = 220 } = {}) {
    if (path.length < 2) return;
    if (reducedMotion() || msPerTile <= 0) { facing.set(unitId, nbsDir(path.at(-2), path.at(-1))); return; }
    anims.set(unitId, { path, start, msPerTile });
  }

  /** A melee lunge: the unit leans into the hex it attacks and back. */
  function lunge(unitId, to, { start, dur = 360 }) {
    if (reducedMotion() || dur <= 0) return;
    lunges.set(unitId, { to, start, dur });
  }

  function placeOf(unit, now) {
    const p = walkPlace(unit, now);
    const l = lunges.get(unit.id);
    if (!l) return p;
    if (now >= l.start + l.dur) { lunges.delete(unit.id); return p; }
    if (now < l.start) return p;
    const k = Math.sin(Math.PI * ((now - l.start) / l.dur)) * 0.38;
    const q = tileCentre(map, l.to);
    return { ...p, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, facing: nbsDir(unit.tile, l.to) };
  }

  function walkPlace(unit, now) {
    const a = anims.get(unit.id);
    if (!a) return { ...tileCentre(map, unit.tile), facing: facing.get(unit.id) ?? 's', moving: false };
    // Waiting for an earlier move to finish: stand at the start of the path.
    if (now < a.start) return { ...tileCentre(map, a.path[0]), facing: nbsDir(a.path[0], a.path[1]), moving: false };
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

  /**
   * The strategic view: a flag in the faction's colour with the unit's own class icon on a
   * light field, drawn at the icon's native 16px so it stays crisp and each kind reads apart
   * (G9: at 12px on the faction colour every icon looked like the same pennant).
   */
  function drawBanner(ctx, x, y, colour, u, atlas, selected) {
    const bx = Math.round(x) - 11;
    const by = Math.round(y) - 30;
    ctx.fillStyle = '#1b140d';
    ctx.fillRect(Math.round(x) - 1, by + 20, 2, 10);
    ctx.fillRect(bx - 1, by - 1, 24, 22);
    ctx.fillStyle = colour;
    ctx.fillRect(bx, by, 22, 20);
    ctx.fillStyle = '#f1e6cf';
    ctx.fillRect(bx + 2, by + 1, 18, 18);
    if (!drawIcon(ctx, atlas, unitIconName(ruleset, u.type), bx + 11, by + 10, 16)) {
      ctx.fillStyle = colour;
      ctx.fillRect(bx + 8, by + 7, 6, 6);
    }
    if (selected) {
      ctx.strokeStyle = '#ffe36b';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 2, by - 2, 26, 24);
    }
  }

  /**
   * Draw the units. hover: the hex under the pointer (its units show their status badges, as
   * does the selected one). under: hexes whose units are drawn in a first pass (true) or skipped
   * (false), so crowded towns can be drawn over their garrison (graphics overhaul G9).
   */
  function draw(ctx, cam, units, { selected, now, strategic = false, atlas = null, cityTiles = null, hover = null, under = null, pass = null }) {
    const scale = cam.zoom;
    const sorted = units.slice().sort((a, b) => a.tile - b.tile);
    const count = new Map();
    const last = new Map();
    for (const u of sorted) { count.set(u.tile, (count.get(u.tile) ?? 0) + 1); last.set(u.tile, u); }
    for (const u of sorted) {
      if (under && pass !== null && under.has(u.tile) !== pass) continue;
      const p = placeOf(u, now);
      if (strategic) {
        const civilian = ruleset.unitClasses[ruleset.units[u.type]?.class]?.civilian;
        drawBanner(ctx, (p.x - cam.x) * scale + (civilian ? -9 : 9), (p.y - cam.y) * scale + 10, colours[u.faction] ?? '#888', u, atlas, u.id === selected);
        continue;
      }
      const civilian = ruleset.unitClasses[ruleset.units[u.type]?.class]?.civilian;
      // Civilians stand a little behind (up and left), combat units in front.
      // In a city they stand to its sides, so the town itself stays in view (graphics overhaul G5).
      const inCity = cityTiles?.has(u.tile) && !p.moving;
      const off = inCity ? (civilian ? -HEX_SCREEN * 0.62 : HEX_SCREEN * 0.62) : civilian ? -HEX_SCREEN * 0.22 : HEX_SCREEN * 0.12;
      const x = (p.x + off * 0.6 - cam.x) * scale;
      const y = (p.y + (inCity ? HEX_SCREEN * 0.1 : off * 0.4) + HEX_SCREEN * 0.38 - cam.y) * scale;
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
      // No class pennant any more (G9): the base disc already carries the faction's colour,
      // and the figure itself says what kind of unit it is.
      const sheet = sheetFor(u.type, u.faction);
      if (sheet?.ready) {
        const f = sheet.frameFor(p.moving ? 'walk' : 'idle', p.facing, now, colour);
        const s = (sheet.desc.mapScale ?? SPRITE_PX / sheet.desc.frame.w) * scale;
        ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, x - sheet.desc.anchor.x * s, y - sheet.desc.anchor.y * s, f.sw * s, f.sh * s);
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
      // Status: fortified, asleep or healing (resting while hurt), as a small icon at the top
      // right; only on the selected unit or the hex under the pointer, to keep the map clear (G9).
      const resting = u.activity === 'fortify' || u.activity === 'sleep';
      const status = resting && u.hp < 100 ? 'healing' : u.activity === 'fortify' ? 'fortified' : u.activity === 'sleep' ? 'asleep' : null;
      if (status && !p.moving && (u.id === selected || u.tile === hover)) badge(ctx, x + 14 * scale, y - 40 * scale, scale, status, atlas);
      // More than one unit here: how many, on the front one.
      const here = count.get(u.tile);
      if (here > 1 && u === last.get(u.tile)) {
        const r = Math.max(6, 7 * scale);
        ctx.fillStyle = '#1b140d';
        ctx.beginPath();
        ctx.arc(x + 16 * scale, y + 2 * scale, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f1e6cf';
        ctx.font = `700 ${Math.round(r * 1.3)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(here), x + 16 * scale, y + 2.5 * scale);
      }
    }
    return anims.size > 0 || lunges.size > 0;
  }

  function badge(ctx, x, y, scale, name, atlas) {
    const r = Math.max(6, 8 * scale);
    ctx.fillStyle = 'rgba(27, 20, 13, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(ctx, atlas, name, x, y, Math.round(r * 1.3));
  }

  return { draw, animate, lunge, sheetFor, isAnimating: () => anims.size > 0 || lunges.size > 0 };
}
