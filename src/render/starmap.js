// The star map (Killzone Extrasolar War K2; docs/KILLZONE.md 7.3): a starfield, the worlds
// as code-drawn pixel planets (moons, stations and asteroid belts drawn their own way) with
// orbit rings, the lanes between them, and fleet tokens. Presentation only: it draws what
// view().space says the player knows, and says what is under the pointer.
//
// Planet colours come from the skin by art id (placeholders.world.<id>), so art can replace
// them; light falls from the top left, as on the hex map.

import { createRegistry } from './art/registry.js';
import { placeholderColour, shade } from './art/placeholders.js';
import { fxRandom, idSeed } from './fxRandom.js';

const PX = 3; // screen pixels per art pixel: planets are pixel art, drawn small and scaled up crisp
const RADIUS = { homeworld: 13, moon: 8, world: 11, station: 7, asteroid: 8 };

/** A planet (or station, or belt) drawn once at art resolution. */
function planetArt(doc, kind, colour, seed) {
  const r = RADIUS[kind] ?? 10;
  const size = r * 2 + 6;
  const c = doc.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const mid = size / 2;
  const rand = fxRandom(seed);
  const lit = (x, y, rr) => {
    // Light from the top left: brighter there, darker to the bottom right, in four bands.
    const dx = (x - mid) / rr;
    const dy = (y - mid) / rr;
    const dz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    const b = -0.55 * dx - 0.55 * dy + 0.63 * dz;
    return b > 0.7 ? 0.14 : b > 0.4 ? 0.04 : b > 0.1 ? -0.08 : -0.2;
  };
  if (kind === 'station') {
    // A ring round a hub, with a spar.
    ctx.fillStyle = shade(colour, -0.15);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x + 0.5 - mid, y + 0.5 - mid);
      if (d <= r && d >= r - 2) { ctx.fillStyle = shade(colour, lit(x + 0.5, y + 0.5, r)); ctx.fillRect(x, y, 1, 1); }
    }
    ctx.fillStyle = shade(colour, -0.1);
    ctx.fillRect(Math.round(mid - 0.5), Math.round(mid - r + 1), 1, r * 2 - 2);
    ctx.fillStyle = shade(colour, 0.12);
    ctx.fillRect(Math.round(mid - 2), Math.round(mid - 2), 4, 4);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(Math.round(mid - 1), Math.round(mid - 1), 1, 1);
    return c;
  }
  if (kind === 'asteroid') {
    // A loose cluster of rocks.
    for (let k = 0; k < 6; k += 1) {
      const rx = mid + (rand() - 0.5) * r * 1.6;
      const ry = mid + (rand() - 0.5) * r * 1.6;
      const rr = 1.5 + rand() * 2.5;
      for (let y = Math.floor(ry - rr); y <= ry + rr; y += 1) for (let x = Math.floor(rx - rr); x <= rx + rr; x += 1) {
        if (Math.hypot(x + 0.5 - rx, y + 0.5 - ry) > rr) continue;
        const dx = (x + 0.5 - rx) / rr;
        const dy = (y + 0.5 - ry) / rr;
        ctx.fillStyle = shade(colour, -0.4 * dx - 0.4 * dy > 0.15 ? 0.12 : -0.4 * dx - 0.4 * dy < -0.25 ? -0.2 : -0.04);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  // A sphere: banded shading, a few surface patches, then the terminator.
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (Math.hypot(x + 0.5 - mid, y + 0.5 - mid) > r) continue;
    ctx.fillStyle = shade(colour, lit(x + 0.5, y + 0.5, r));
    ctx.fillRect(x, y, 1, 1);
  }
  for (let k = 0; k < r; k += 1) {
    const px = Math.round(mid + (rand() - 0.5) * r * 1.4);
    const py = Math.round(mid + (rand() - 0.5) * r * 1.4);
    if (Math.hypot(px + 0.5 - mid, py + 0.5 - mid) > r - 1.5) continue;
    ctx.fillStyle = shade(colour, kind === 'moon' ? -0.12 : rand() < 0.5 ? -0.1 : 0.08);
    ctx.fillRect(px, py, kind === 'moon' ? 1 : 2, 1);
  }
  return c;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts { ruleset, factionColour(id) -> colour, sideColour(side) -> colour, label(worldId) -> text }
 */
export function createStarMap(canvas, { ruleset, factionColour, sideColour }) {
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const ctx = canvas.getContext('2d');
  const registry = createRegistry(ruleset.skin);
  const art = new Map();
  let size = { w: 0, h: 0 };
  let hits = [];
  let stars = null;

  const colourOf = (id) => placeholderColour(registry, 'world', id);
  const posOf = (id) => {
    const p = ruleset.worlds[id]?.pos ?? { x: 50, y: 50 };
    const padX = 70;
    const padY = 60;
    return { x: padX + ((size.w - padX * 2) * p.x) / 100, y: padY + ((size.h - padY * 2) * p.y) / 100 };
  };

  function resize() {
    const dpr = win.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== size.w || h !== size.h) {
      size = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      stars = null;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function starfield() {
    if (stars) return stars;
    const rand = fxRandom(77);
    stars = Array.from({ length: Math.round((size.w * size.h) / 2600) }, () => ({ x: Math.floor(rand() * size.w), y: Math.floor(rand() * size.h), b: rand() }));
    return stars;
  }

  /** Draw. space: view().space; opts { selectedFleet, selectedWorld, me }. */
  function draw(space, { selectedFleet = null, selectedWorld = null, me = null } = {}) {
    if (!resize()) return;
    hits = [];
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = colourOf('space');
    ctx.fillRect(0, 0, size.w, size.h);
    for (const s of starfield()) {
      ctx.fillStyle = s.b > 0.92 ? '#f4f1e6' : s.b > 0.6 ? '#9aa4b8' : '#4a5266';
      ctx.fillRect(s.x, s.y, s.b > 0.97 ? 2 : 1, s.b > 0.97 ? 2 : 1);
    }
    // Lanes: solid, or dashed and arched for a long jump (heavy ships only).
    for (const l of space.lanes) {
      const a = posOf(l.from);
      const b = posOf(l.to);
      ctx.strokeStyle = colourOf('lane');
      ctx.lineWidth = 2;
      ctx.setLineDash(l.heavyOnly ? [6, 6] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (l.turns > 1) ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - size.h * 0.42, b.x, b.y);
      else ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Worlds: orbit ring (in the colour of who holds the ground), then the planet.
    for (const w of space.worlds) {
      const p = posOf(w.id);
      const kind = ruleset.worlds[w.id].kind;
      const key = `${w.id}|${kind}`;
      if (!art.has(key)) art.set(key, planetArt(doc, kind, colourOf(w.id), idSeed(w.id)));
      const img = art.get(key);
      const r = (RADIUS[kind] ?? 10) * PX;
      ctx.strokeStyle = w.holder === 0 || w.holder === 1 ? sideColour(w.holder) : w.holder === 'contested' ? '#e0b43c' : '#6a7080';
      ctx.lineWidth = w.id === selectedWorld ? 3 : 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r + 12, (r + 12) * 0.42, -0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.drawImage(img, Math.round(p.x - (img.width * PX) / 2), Math.round(p.y - (img.height * PX) / 2), img.width * PX, img.height * PX);
      hits.push({ kind: 'world', id: w.id, x: p.x, y: p.y, r: r + 10 });
    }
    // Fleets: arrowheads in their faction's colour round the world, or out on the lane.
    const byPlace = new Map();
    for (const f of space.fleets) {
      const key = f.transit ? `${f.transit.from}>${f.transit.to}` : f.at;
      if (!byPlace.has(key)) byPlace.set(key, []);
      byPlace.get(key).push(f);
    }
    for (const [key, list] of byPlace) {
      list.forEach((f, i) => {
        let x;
        let y;
        if (f.transit) {
          const a = posOf(f.transit.from);
          const b = posOf(f.transit.to);
          const lane = space.lanes.find((l) => (l.from === f.transit.from && l.to === f.transit.to) || (l.to === f.transit.from && l.from === f.transit.to));
          const t = 1 - f.transit.left / (lane?.turns ?? 1);
          const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - size.h * 0.42 };
          const u = Math.max(0.1, Math.min(0.9, t + 0.15));
          x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x;
          y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y + i * 18;
        } else {
          const p = posOf(key);
          const kind = ruleset.worlds[key].kind;
          const r = (RADIUS[kind] ?? 10) * PX + 22;
          const ang = -Math.PI / 2 - 0.9 + i * 0.75;
          x = p.x + Math.cos(ang) * r;
          y = p.y + Math.sin(ang) * r * 0.75;
        }
        const col = factionColour(f.faction);
        ctx.fillStyle = col;
        ctx.strokeStyle = '#0b0e17';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x + 8, y + 7);
        ctx.lineTo(x, y + 3);
        ctx.lineTo(x - 8, y + 7);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.fillStyle = shade(col, 0.25);
        ctx.fillRect(Math.round(x - 1), Math.round(y - 6), 2, 7);
        // How many ships.
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f1e6cf';
        ctx.fillText(String(f.ships.length), x + 10, y);
        if (f.id === selectedFleet) {
          ctx.strokeStyle = '#ffe36b';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 12, y - 13, 24, 24);
        }
        if (f.blockade) {
          ctx.strokeStyle = col;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        hits.push({ kind: 'fleet', id: f.id, mine: f.faction === me, x, y, r: 14 });
      });
    }
  }

  /** What is under a point (CSS pixels on the canvas): { kind: 'fleet' | 'world', id } or null; fleets first. */
  function hit(x, y) {
    const found = hits.filter((h) => Math.hypot(h.x - x, h.y - y) <= h.r).sort((a, b) => (a.kind === b.kind ? (b.mine ? 1 : 0) - (a.mine ? 1 : 0) : a.kind === 'fleet' ? -1 : 1));
    return found[0] ? { kind: found[0].kind, id: found[0].id } : null;
  }

  /** A world's centre on the canvas (CSS pixels), for placing its status card. */
  const worldAt = (id) => posOf(id);

  return { draw, hit, worldAt, planetRadius: (id) => (RADIUS[ruleset.worlds[id]?.kind] ?? 10) * PX };
}
