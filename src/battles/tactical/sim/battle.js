// The tactical battle (phase 18): each strategic unit becomes a band of
// soldiers on a small field; they march, wheel, charge and fight in short
// steps of time (tuning.tick seconds). No DOM, no clock: the same spec, seed
// and orders always give the same battle.
//
// How hard each blow lands uses the auto-resolve curve on the spec's own
// strengths and modifiers:
//   damage per second = baseDamage / clashSeconds x e^(difference / strengthScale) x fortune
// where fortune is each side's luck for the day, drawn once like auto's spread.
// So a clash that runs its full length deals what auto-resolve would; the
// battle can end sooner (a side destroyed, or one withdraws). What a player
// adds is tactics: a charge or a blow to the flank adds a little to the
// difference while it lasts (tuning.chargeBonus, tuning.flankBonus), and
// withdrawing early keeps what health is left.
//
// Kinds: field (melee against a band), ranged (a volley across the gap: only
// the shooters deal damage, as in auto), city (the attackers assault the walls,
// which strike back; the garrison keeps its health, as in auto).

import { expDet } from '../../../core/mathdet.js';
import { buildField, speedFactor } from './field.js';

const DEFAULTS = {
  width: 640, height: 400, tick: 0.1, clashSeconds: 12, maxSeconds: 90, hpPerMan: 10,
  speed: { foot: 30, mounted: 60, siege: 15 }, turnRate: 1.2, reach: { melee: 6, ranged: 200, siege: 260 },
  chargeBonus: 3, chargeSeconds: 2.5, chargeSpeed: 1.5, flankBonus: 3, flankDot: 0.5,
};

/** The formation each unit class fights in: men across, ranks deep, spacing. */
export const FORMATIONS = Object.freeze({
  line: { across: 5, spacing: 14, rankGap: 16 },
  block: { across: 4, spacing: 12, rankGap: 14 },
  loose: { across: 5, spacing: 18, rankGap: 16 },
  wedge: { across: 4, spacing: 18, rankGap: 18 },
  battery: { across: 2, spacing: 24, rankGap: 20 },
});
const FORMATION_OF = { melee: 'line', anti_cavalry: 'block', ranged: 'loose', cavalry: 'wedge', recon: 'loose', siege: 'battery' };
const MOUNTED = new Set(['cavalry']);

const sum = (mods) => (mods ?? []).reduce((n, m) => n + m.amount, 0);
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

export function tuningOf(spec) {
  const t = spec.tuning?.tactical ?? {};
  return { ...DEFAULTS, ...t, speed: { ...DEFAULTS.speed, ...(t.speed ?? {}) }, reach: { ...DEFAULTS.reach, ...(t.reach ?? {}) } };
}

function bandSize(cls, men) {
  const f = FORMATIONS[FORMATION_OF[cls] ?? 'line'];
  const across = Math.min(f.across, Math.max(1, men));
  const ranks = Math.max(1, Math.ceil(men / f.across));
  return { width: across * f.spacing, depth: ranks * f.rankGap };
}

function makeBand(spec, t, side, u, i, x, y, power, kindOfFight) {
  const men = Math.max(1, Math.ceil(u.hp / t.hpPerMan));
  const cls = u.class;
  const ranged = kindOfFight === 'ranged' && side === 'attacker';
  const size = bandSize(cls, men);
  return {
    id: `${side[0]}${i}`, ref: u.ref, side, cls, type: u.type, sprite: u.sprite, formation: FORMATION_OF[cls] ?? 'line',
    x, y, fx: 0, fy: side === 'attacker' ? -1 : 1, hp: u.hp, hp0: u.hp, men0: men, ...size,
    power, ranged, mounted: MOUNTED.has(cls), siege: cls === 'siege',
    order: { type: side === 'attacker' ? 'advance' : 'hold' }, target: null, engaged: null, chargeUntil: -1, flank: false, charging: false,
    alive: true, dealt: 0, taken: 0,
  };
}

/**
 * A new battle from a spec and a random function (0 to 1).
 * playerSide: 'attacker', 'defender' or null (the computer commands both).
 */
export function createBattle(spec, rng, { playerSide = null } = {}) {
  const t = tuningOf(spec);
  const field = buildField(spec, t, rng);
  const spread = spec.tuning?.spread ?? 0.2;
  const fortune = { attacker: 1 - spread + 2 * spread * rng(), defender: 1 - spread + 2 * spread * rng() };
  const kind = spec.kind === 'cityRanged' ? 'ranged' : spec.kind;
  const ranged = kind === 'ranged';
  const aPower = (u) => (ranged ? u.rangedStrength : u.strength) + sum(spec.modifiers?.attacker);
  const midX = field.width / 2;
  const bands = [];
  spec.attacker.units.forEach((u, i) => bands.push(makeBand(spec, t, 'attacker', u, i, midX + (i - (spec.attacker.units.length - 1) / 2) * 60, field.height * 0.84, aPower(u), kind)));
  let walls = null;
  if (spec.defender.city) {
    const c = spec.defender.city;
    walls = { id: 'walls', ref: c.ref, side: 'defender', cls: 'walls', x: midX, y: field.wallY, width: field.width - 80, depth: 12, fx: 0, fy: 1,
      hp: c.hp, hp0: c.hp, power: c.strength + sum(spec.modifiers?.defender), alive: true, isWalls: true, dealt: 0, taken: 0, order: { type: 'hold' } };
    // The garrison stands behind the walls; it does not fight (as in auto).
    spec.defender.units.forEach((u, i) => {
      const b = makeBand(spec, t, 'defender', u, i, midX + (i - (spec.defender.units.length - 1) / 2) * 60, field.wallY - 34, 0, kind);
      b.garrison = true;
      bands.push(b);
    });
  } else {
    spec.defender.units.forEach((u, i) => bands.push(makeBand(spec, t, 'defender', u, i, midX + (i - (spec.defender.units.length - 1) / 2) * 60, field.height * 0.22, u.strength + sum(spec.modifiers?.defender), kind)));
  }
  return { spec, t, field, kind, bands, walls, fortune, time: 0, tickNo: 0, clash: 0, over: false, endReason: null, withdrawn: null, playerSide, orders: [], effects: [] };
}

/** Every fighting band (and the walls) of a side, alive. */
export function fighters(b, side) {
  const list = b.bands.filter((x) => x.side === side && x.alive && !x.garrison);
  if (side === 'defender' && b.walls?.alive) list.push(b.walls);
  return list;
}

/** Give an order to one of the player's bands (or the whole side, for withdraw). Recorded for the replay. */
export function giveOrder(b, order) {
  if (b.over) return false;
  if (order.type === 'withdraw') {
    b.orders.push({ tick: b.tickNo, type: 'withdraw', side: order.side });
    b.withdrawn = order.side;
    return true;
  }
  const band = b.bands.find((x) => x.id === order.band);
  if (!band || !band.alive || band.garrison || band.side !== b.playerSide) return false;
  const o = { type: order.type };
  if (order.type === 'move') { o.x = Math.max(0, Math.min(b.field.width, order.x)); o.y = Math.max(0, Math.min(b.field.height, order.y)); }
  if (!['move', 'advance', 'hold', 'charge'].includes(o.type)) return false;
  band.order = o;
  if (o.type === 'charge') band.charging = true;
  b.orders.push({ tick: b.tickNo, band: band.id, ...o });
  return true;
}

function nearestFoe(b, band) {
  const foes = fighters(b, band.side === 'attacker' ? 'defender' : 'attacker');
  let best = null;
  let bestD = Infinity;
  for (const f of foes) {
    const d = f.isWalls ? (band.y - f.y) * (band.y - f.y) : dist2(band, f);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** Can this band strike its foe from where it stands? */
function inReach(b, band, foe) {
  if (band.ranged) return dist2(band, foe) <= b.t.reach.ranged * b.t.reach.ranged;
  if (foe.isWalls) return Math.abs(band.y - foe.y) <= (band.depth + foe.depth) / 2 + b.t.reach.melee;
  // Each band's half-size along the line between them: depth if met head on, width if met side on.
  const d = Math.sqrt(dist2(band, foe)) || 1;
  const ux = (foe.x - band.x) / d;
  const uy = (foe.y - band.y) / d;
  const half = (x, vx, vy) => Math.abs(vx * x.fx + vy * x.fy) * x.depth / 2 + Math.abs(-vx * x.fy + vy * x.fx) * x.width / 2;
  return d <= half(band, ux, uy) + half(foe, ux, uy) + b.t.reach.melee;
}

function turnTowards(band, dx, dy, rate) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return;
  const tx = dx / len;
  const ty = dy / len;
  // Blend the facing towards the target by at most `rate` (a fraction per step), then renormalise.
  band.fx += (tx - band.fx) * rate;
  band.fy += (ty - band.fy) * rate;
  const l = Math.sqrt(band.fx * band.fx + band.fy * band.fy) || 1;
  band.fx /= l;
  band.fy /= l;
}

function move(b, band, gx, gy, foe) {
  const t = b.t;
  const dx = gx - band.x;
  const dy = gy - band.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  let speed = band.siege ? t.speed.siege : band.mounted ? t.speed.mounted : t.speed.foot;
  if (band.charging) speed *= t.chargeSpeed;
  speed *= speedFactor(b.field, band.x, band.y, t);
  let step = Math.min(len, speed * t.tick);
  // Never walk through the walls or into the foe.
  const nx = band.x + (dx / len) * step;
  let ny = band.y + (dy / len) * step;
  if (b.walls?.alive && band.side === 'attacker' && ny - band.depth / 2 < b.walls.y + b.walls.depth / 2) ny = b.walls.y + b.walls.depth / 2 + band.depth / 2;
  band.x = Math.max(band.width / 2, Math.min(b.field.width - band.width / 2, nx));
  band.y = Math.max(band.depth / 2, Math.min(b.field.height - band.depth / 2, ny));
  turnTowards(band, foe && !foe.isWalls && step < len ? foe.x - band.x : dx, foe && !foe.isWalls && step < len ? foe.y - band.y : dy, t.turnRate * t.tick);
  step = 0;
}

/** One step of the battle. Computer-commanded bands decide here. */
export function stepBattle(b) {
  if (b.over) return;
  const t = b.t;
  b.effects = [];
  if (b.withdrawn) { end(b, 'withdrawn'); return; }

  // Orders and movement.
  for (const band of b.bands) {
    if (!band.alive || band.garrison) continue;
    const foe = nearestFoe(b, band);
    band.target = foe;
    if (!foe) continue;
    const reach = inReach(b, band, foe);
    const o = band.order;
    if (o.type === 'hold') {
      if (!band.isWalls) turnTowards(band, foe.isWalls ? 0 : foe.x - band.x, foe.isWalls ? -1 : foe.y - band.y, t.turnRate * t.tick);
      continue;
    }
    if (reach && o.type !== 'move') { turnTowards(band, foe.isWalls ? 0 : foe.x - band.x, foe.isWalls ? -1 : foe.y - band.y, t.turnRate * t.tick); continue; }
    if (o.type === 'move') {
      move(b, band, o.x, o.y, null);
      if (dist2(band, o) < 4) band.order = { type: 'hold' };
      continue;
    }
    // Advance or charge: close with the foe (shooters stop at their range).
    if (foe.isWalls) move(b, band, band.x, foe.y + foe.depth / 2 + band.depth / 2, foe);
    else move(b, band, foe.x, foe.y, foe);
  }

  // The fight.
  const scale = b.spec.tuning?.strengthScale ?? 25;
  const dps = (b.spec.tuning?.baseDamage ?? 30) / t.clashSeconds;
  const blows = [];
  for (const band of [...b.bands, ...(b.walls ? [b.walls] : [])]) {
    if (!band.alive || band.garrison) continue;
    const foe = band.target ?? nearestFoe(b, band);
    if (!foe || !foe.alive) continue;
    // In a ranged fight only the shooters strike; walls strike whoever is at them.
    if (b.kind === 'ranged' && band.side === 'defender') continue;
    if (band.isWalls) {
      const at = fighters(b, 'attacker').filter((a) => inReach(b, a, band));
      if (!at.length) continue;
      blows.push({ from: band, to: at[0], bonus: 0 });
      continue;
    }
    if (!inReach(b, band, foe)) { if (band.engaged) band.engaged = null; continue; }
    if (!band.engaged) {
      band.engaged = foe.id;
      if (band.charging && band.side === b.playerSide) band.chargeUntil = b.time + t.chargeSeconds;
      // A blow to the flank or rear: the foe is not facing us.
      if (!foe.isWalls && band.side === b.playerSide) {
        const dx = band.x - foe.x;
        const dy = band.y - foe.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        band.flank = (dx / l) * foe.fx + (dy / l) * foe.fy < t.flankDot;
      }
    }
    band.charging = false;
    let bonus = 0;
    if (b.time < band.chargeUntil) bonus += t.chargeBonus;
    if (band.flank) bonus += t.flankBonus;
    blows.push({ from: band, to: foe, bonus });
  }
  if (blows.length) b.clash += t.tick;
  for (const { from, to, bonus } of blows) {
    const diff = from.power + bonus - to.power;
    const dmg = dps * expDet(diff / scale) * b.fortune[from.side] * t.tick;
    to.hp -= dmg;
    from.dealt += dmg;
    to.taken += dmg;
    b.effects.push({ type: from.ranged ? 'volley' : 'blow', from: from.id, to: to.id, x: to.x, y: to.y });
  }
  for (const x of [...b.bands, ...(b.walls ? [b.walls] : [])]) if (x.alive && x.hp <= 0) { x.hp = 0; x.alive = false; b.effects.push({ type: 'fall', band: x.id }); }

  b.time += t.tick;
  b.tickNo += 1;
  const attackersLeft = fighters(b, 'attacker').length > 0;
  const defendersLeft = fighters(b, 'defender').length > 0;
  if (!attackersLeft || !defendersLeft) end(b, 'destroyed');
  else if (b.clash >= t.clashSeconds - 1e-9) end(b, 'clashOver');
  else if (b.time >= t.maxSeconds) end(b, 'timeUp');
}

function end(b, reason) {
  b.over = true;
  b.endReason = reason;
}

/** Hand every remaining step to the computer (both sides) and play to the end. */
export function playOut(b) {
  b.playerSide = null;
  for (const band of b.bands) if (band.side === 'attacker' && band.order.type === 'hold' && !band.garrison) band.order = { type: 'advance' };
  while (!b.over) stepBattle(b);
}

/** The BattleResult (docs/PLAN.md section 5.3) for a finished battle. */
export function battleResult(b, moduleId = 'tactical', version = 1) {
  const spec = b.spec;
  const t = spec.tuning ?? {};
  const hpOf = (band) => (band.alive ? Math.min(band.hp0, Math.max(1, Math.round(band.hp))) : 0);
  const attackers = b.bands.filter((x) => x.side === 'attacker');
  const defenderDown = b.walls ? !b.walls.alive : !b.bands.some((x) => x.side === 'defender' && x.alive);
  let attackerAlive = attackers.some((x) => x.alive);
  // Both cannot fall: if they would, the attacker clings on with 1 HP (as in auto).
  if (!attackerAlive && defenderDown) { attackers[0].alive = true; attackers[0].hp = 1; attackerAlive = true; }
  const units = b.bands.map((x) => {
    const hp = x.garrison ? x.hp0 : hpOf(x);
    const xpGained = x.garrison ? 0 : x.side === 'attacker' ? (t.xpAttack ?? 0) : (t.xpDefence ?? 0);
    return { ref: x.ref, hp, alive: hp > 0, xpGained };
  });
  const city = b.walls ? { ref: b.walls.ref, hp: b.walls.alive ? Math.min(b.walls.hp0, Math.max(1, Math.round(b.walls.hp))) : 0 } : null;
  const winner = !attackerAlive ? 'defender' : defenderDown ? 'attacker' : 'none';
  const dealt = attackers.reduce((n, x) => n + x.dealt, 0);
  const taken = attackers.reduce((n, x) => n + x.taken, 0);
  const margin = winner === 'none' ? 'none' : (winner === 'attacker' ? dealt >= 50 : taken >= 50) ? 'clear' : 'narrow';
  return {
    battleId: spec.battleId, module: moduleId, moduleVersion: version, winner, margin, units, city,
    attackerAdvances: winner === 'attacker' && b.kind !== 'ranged', summaryKey: `battle.summary.${winner}`,
    replay: { orders: b.orders.slice(), ticks: b.tickNo, endReason: b.endReason },
    damage: { toDefender: Math.round(dealt), toAttacker: Math.round(taken) },
  };
}

/** Play a whole battle headless with the computer on both sides (simulate()). */
export function simulateBattle(spec, rng) {
  const b = createBattle(spec, rng);
  playOut(b);
  return battleResult(b);
}

/** Replay a battle from its seed and recorded orders (tests and the post-battle check). */
export function replayBattle(spec, rng, replay, playerSide = 'attacker') {
  const b = createBattle(spec, rng, { playerSide });
  const orders = replay?.orders ?? [];
  let i = 0;
  while (!b.over) {
    while (i < orders.length && orders[i].tick === b.tickNo) { giveOrder(b, orders[i]); i += 1; }
    stepBattle(b);
  }
  return battleResult(b);
}
