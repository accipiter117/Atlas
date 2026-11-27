// Playing events back (graphics overhaul G6, docs/OVERHAUL.md 4.6): walks,
// lunges, arrows, impact flashes, damage numbers, dust where a unit fell,
// banners over cities founded or taken, sounds, the turn ribbon, a glow on
// the progress ring, and the turn summary in the notifications panel.
//
// Everything here happens after the game has changed and reads only what
// you can see: it never changes the game (a browser test checks the game's
// fingerprint is the same with animations on or off). Your own actions play
// at once; rivals' moves you can see are queued one after another, in full,
// quickly or not at all as Settings says, after the computer has finished.
//
// Everything the game screen shares comes in through `g` (see game.js).

import { VISIBLE } from '../../sim/index.js';
import { el } from './shared.js';
import { icon } from './icons.js';

const WALK_MS = { normal: 220, fast: 110, instant: 0 };
const RIVAL_MS = { full: null, quick: 70, off: 0 };
const MAX_SUMMARY = 12;

export function createPlayback(g) {
  let summary = [];

  const setting = (name, fallback) => g.doc.documentElement.dataset[name] ?? fallback;
  const seen = (tile) => tile !== null && tile !== undefined && g.v.fog[tile] === VISIBLE;
  const later = (ms, fn) => (ms <= 0 ? fn() : g.doc.defaultView.setTimeout(fn, ms));

  function sound(id, at, now) { later(at - now, () => g.sound?.(id)); }

  /** A ranged attacker throws stones (slingers, siege) or shoots arrows. */
  function missile(e) {
    const def = g.ruleset.units[e.attackerType];
    return def?.class === 'siege' || /sling/.test(e.attackerType ?? '') ? 'stone' : 'arrow';
  }

  /**
   * Play events. rival: they come from the computer players' turns (queued, played as
   * Settings says); otherwise they are your own action's and play at once.
   * Returns how long the queue runs, in ms.
   */
  function play(events, { rival = false } = {}) {
    const win = g.doc.defaultView;
    const now = win.performance.now();
    const walk = WALK_MS[setting('animSpeed', 'normal')] ?? 220;
    const mode = setting('rivalMoves', 'quick');
    const rivalStep = RIVAL_MS[mode] === null ? walk : RIVAL_MS[mode];
    const camera = setting('combatCamera', 'on') === 'on';
    const still = g.mapView.reducedMotion?.() || walk === 0;
    let t = now;
    const human = g.human;
    for (const e of events) {
      const mine = e.faction === human || e.attackerFaction === human;
      const queued = rival && !mine;
      if (queued && mode === 'off' && e.type !== 'cityCaptured' && e.type !== 'cityFounded') continue;
      const at = queued ? t : now;
      const step = queued ? rivalStep : walk;
      if (e.type === 'unitMoved') {
        if (!(mine || e.path.some(seen))) continue;
        g.mapView.animateMove(e.unit, e.path, { start: at, msPerTile: still ? 0 : step });
        if (queued && !still) t += (e.path.length - 1) * step + 40;
      } else if (e.type === 'battle') {
        if (!(e.attackerFaction === human || e.defenderFaction === human || seen(e.target) || seen(e.from))) continue;
        const ranged = e.kind === 'ranged' || e.kind === 'cityRanged';
        const flight = still ? 0 : 420;
        const impact = at + (ranged ? flight : still ? 0 : 180);
        if (queued && camera && e.defenderFaction === human) later(at - now, () => g.mapView.ensureVisible(e.target));
        if (ranged && e.from !== null && e.from !== undefined) {
          g.mapView.effect({ kind: 'projectile', from: e.from, to: e.target, start: at, dur: flight, style: missile(e) });
          sound('bow', at, now);
        } else if (e.attacker) {
          g.mapView.lunge(e.attacker, e.target, { start: at, dur: still ? 0 : 360 });
        }
        if (!ranged) sound('clash', impact, now);
        g.mapView.effect({ kind: 'flash', tile: e.target, start: impact, dur: 380 });
        const d = e.damage ?? {};
        if (d.toDefender) g.mapView.effect({ kind: 'number', tile: e.target, text: `-${d.toDefender}`, colour: '#ff6a4a', start: impact, dur: 1100 });
        if (!ranged && d.toAttacker && e.from !== null && e.from !== undefined) g.mapView.effect({ kind: 'number', tile: e.from, text: `-${d.toAttacker}`, colour: '#ffb04a', start: impact + 120, dur: 1100, dx: 8 });
        if (queued) t += (ranged ? flight : 360) + 260;
      } else if (e.type === 'unitKilled') {
        if (seen(e.tile) || e.faction === human) g.mapView.effect({ kind: 'dust', tile: e.tile, start: (queued ? t : now) + (still ? 0 : 220), dur: 700 });
      } else if (e.type === 'cityFounded') {
        if (e.faction === human || seen(e.tile)) {
          g.mapView.effect({ kind: 'banner', tile: e.tile, text: g.tt('fx.founded', { city: e.name }), colour: g.colours[e.faction], start: at, dur: 2200 });
          if (e.faction === human) sound('cityFounded', at, now);
        }
      } else if (e.type === 'cityCaptured') {
        if (e.faction === human || e.from === human || seen(e.tile)) {
          g.mapView.effect({ kind: 'banner', tile: e.tile, text: g.tt('fx.captured', { city: e.name, faction: g.civName(e.faction) }), colour: g.colours[e.faction], start: at, dur: 2600 });
          if (camera && e.from === human) later(at - now, () => g.mapView.ensureVisible(e.tile));
        }
      } else if ((e.type === 'techLearned' || e.type === 'civicLearned') && e.faction === human) {
        glow(e.type === 'techLearned' ? 'techs' : 'civics');
        sound('techDone', at, now);
      } else if ((e.type === 'unitBuilt' || e.type === 'buildingBuilt' || e.type === 'wonderBuilt') && e.faction === human) {
        sound('built', at, now);
      }
    }
    if (rival) addSummary(events);
    return Math.max(0, t - now);
  }

  /** The research or civic ring glows for a moment when something is learned. */
  function glow(tree) {
    const row = g.root.querySelector(`[data-progress="${tree}"]`);
    if (!row) return;
    row.classList.remove('glow');
    void row.offsetWidth; // restart the animation
    row.classList.add('glow');
  }

  /** "Turn 42" sweeping across the top of the map as your turn starts. */
  function ribbon(turn) {
    const host = g.root.querySelector('[data-field="turn-ribbon"]');
    if (!host) return;
    host.textContent = g.tt('fx.turn', { n: turn });
    host.classList.remove('show');
    void host.offsetWidth;
    host.classList.add('show');
  }

  // ---- The turn summary: what happened in the last round that concerns you ----

  function addSummary(events) {
    const human = g.human;
    const items = [];
    const add = (iconName, text, tile = null) => items.push({ icon: iconName, text, tile });
    for (const e of events) {
      if (e.type === 'battle' && (e.attackerFaction === human || e.defenderFaction === human)) {
        const d = e.damage ?? { toDefender: 0, toAttacker: 0 };
        const attacker = e.kind === 'cityRanged' ? g.cityNameOf(e.attackerCity) : g.nameOfUnit(e.attackerType ?? '', e.attackerFaction);
        const defender = e.city ? g.cityNameOf(e.city) : g.nameOfUnit(e.defenderType, e.defenderFaction);
        add('strength', g.tt('summary.battle', { attacker, defender, dealt: d.toDefender ?? 0 }), e.target);
      } else if (e.type === 'unitKilled' && e.faction === human) add('hp', g.tt('battle.lost', { unit: g.unitName({ type: e.unitType }) }), e.tile);
      else if (e.type === 'cityCaptured' && (e.from === human || e.faction === human)) add('city', g.tt('summary.cityCaptured', { city: e.name, faction: g.civName(e.faction) }), e.tile);
      else if (e.type === 'cityFounded' && e.faction !== human && seen(e.tile)) add('city', g.tt('summary.cityFounded', { city: e.name, faction: g.civName(e.faction) }), e.tile);
      else if (e.type === 'warDeclared' && (e.faction === human || e.target === human)) add('war', g.tt('game.warDeclared', { faction: g.civName(e.faction), target: g.civName(e.target) }));
      else if (e.type === 'peaceMade' && (e.faction === human || e.target === human)) add('peace', g.tt('game.peaceMade', { faction: g.civName(e.faction), target: g.civName(e.target) }));
      else if (e.type === 'techLearned' && e.faction === human) add('science', g.tt('game.techLearned', { item: g.techName(e.item) }));
      else if (e.type === 'civicLearned' && e.faction === human) add('culture', g.tt('game.civicLearned', { item: g.civicName(e.item) }));
      else if (e.type === 'unitBuilt' && e.faction === human) add('production', g.tt('summary.built', { city: g.cityNameOf(e.city), item: g.itemName({ kind: 'unit', id: e.unitType }) }), g.v.cities.find((c) => c.id === e.city)?.tile ?? null);
      else if (e.type === 'wonderBuilt') add('culture', g.tt('summary.wonder', { wonder: g.ruleset.text[g.ruleset.wonders?.[e.wonder]?.nameKey] ?? e.wonder }));
      else if (e.type === 'dealProposed' && e.target === human) add('diplomacy', g.tt('game.attention.offer', { faction: g.civName(e.faction) }));
    }
    summary = items.slice(0, MAX_SUMMARY);
    renderSummary();
  }

  function renderSummary() {
    const host = g.root.querySelector('[data-field="turn-summary"]');
    if (!host) return;
    host.hidden = !summary.length;
    const list = host.querySelector('ul');
    list.replaceChildren(...summary.map((it) => el(g.doc, 'li', {},
      el(g.doc, 'button', { type: 'button', class: 'summary-item', disabled: it.tile === null, onclick: () => { if (it.tile !== null) { g.mapView.centreOnTile(it.tile); g.mapView.setHover(it.tile); } } },
        icon(g.doc, it.icon, { size: 16 }), el(g.doc, 'span', {}, it.text)))));
    host.querySelector('[data-field="summary-title"]').textContent = g.tt('summary.title', { n: summary.length });
    host.closest('.attention')?.classList.toggle('empty', !summary.length && !g.root.querySelector('.attention-item'));
  }

  return { play, ribbon, glow, get summary() { return summary.slice(); } };
}
