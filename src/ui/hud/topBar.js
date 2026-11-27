// The top bar (graphics overhaul G2): your faction, every yield as an icon and a number
// with a tooltip breaking it down, the turn and era, and the screen buttons; plus the
// progress widget (research and civic with rings) and the lens toggle's state.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { eraOf, upkeepOf, costOf } from '../../sim/index.js';
import { icon } from './icons.js';
import { attachTooltip } from './tooltip.js';
import { el, fill, knownWorld, fmt, signed } from './shared.js';

const SOURCE_GROUP = { tiles: 'tiles', city: 'city', citizens: 'citizens', building: 'buildings', adjacency: 'buildings', specialists: 'specialists', trade: 'trade', effects: 'bonuses', percent: 'bonuses' };
const SOURCE_ORDER = ['tiles', 'city', 'citizens', 'buildings', 'specialists', 'trade', 'bonuses'];
const SOURCE_ICON = { tiles: 'food', city: 'city', citizens: 'population', buildings: 'housing', specialists: 'population', trade: 'trader', bonuses: 'xp' };
const KEY_HINT = { science: 'tooltip.key.trees', culture: 'tooltip.key.civics', faith: 'tooltip.key.religion' };

export function createTopBar(g) {
  /** One yield in the bar: its icon, the number and (for stocks) the rate; a button when it opens something. */
  function chip(y, { value, rate = null, action = null, onclick = null, label, falling = false }) {
    const kids = [icon(g.doc, y, { size: 18 }), el(g.doc, 'span', { class: 'val' }, value)];
    if (rate !== null) kids.push(el(g.doc, 'span', { class: 'rate' }, `(${rate})`));
    const props = { class: `y-chip y ${y}${falling ? ' falling' : ''}`, 'aria-label': label };
    if (action) return el(g.doc, 'button', { ...props, type: 'button', dataset: { action }, onclick }, ...kids);
    return el(g.doc, 'span', { ...props, role: 'img', tabindex: '0' }, ...kids);
  }

  function renderBar() {
    g.$('[data-field="turn"]').textContent = g.tt('game.turn', { n: g.state.turn });
    g.$('[data-field="era"]').textContent = g.tt('game.era', { era: g.ruleset.text[g.ruleset.eras?.[eraOf(knownWorld(g.v), g.ruleset, g.human)]?.nameKey] ?? '' });
    // Your whole empire, on every world (K1b).
    const { total, netGold } = g.empireTotals();
    const s = g.v.stocks ?? { gold: 0, faith: 0 };
    const me = g.v.factions.find((f) => f.id === g.human);
    const chipBtn = g.$('[data-action="faction"]');
    chipBtn.textContent = g.tt('game.factionCard', { faction: g.civName(g.human) });
    chipBtn.style.setProperty('--faction', g.ruleset.factions?.[me?.civ]?.colours.primary ?? '#888');
    const science = g.v.research?.current ? g.tt('game.bar.science', { rate: signed(total.science), item: g.techName(g.v.research.current) }) : g.tt('game.bar.noResearch', { rate: signed(total.science) });
    const culture = !g.ruleset.civics ? g.tt('game.bar.culture', { rate: signed(total.culture) })
      : g.v.civicResearch?.current ? g.tt('game.bar.civic', { rate: signed(total.culture), item: g.civicName(g.v.civicResearch.current) }) : g.tt('game.bar.noCivic', { rate: signed(total.culture) });
    const faith = g.tt('game.bar.faith', { stock: fmt(s.faith), rate: signed(total.faith) });
    g.$('[data-field="yields"]').replaceChildren(
      chip('food', { value: signed(total.food), label: g.tt('game.bar.food', { rate: signed(total.food) }) }),
      chip('production', { value: signed(total.production), label: g.tt('game.bar.production', { rate: signed(total.production) }) }),
      chip('gold', { value: fmt(s.gold), rate: signed(netGold), falling: netGold < 0, label: g.tt('game.bar.gold', { stock: fmt(s.gold), rate: signed(netGold) }) }),
      chip('science', { value: signed(total.science), action: 'trees', onclick: () => g.openTrees('techs'), label: science }),
      chip('culture', { value: signed(total.culture), action: g.ruleset.civics ? 'civics' : null, onclick: () => g.openTrees('civics'), label: culture }),
      chip('faith', { value: fmt(s.faith), rate: signed(total.faith), action: g.ruleset.beliefs ? 'religion' : null, onclick: () => g.openEmpire('religion'), label: faith }),
    );
    // Tooltips: each yield broken down by where it comes from.
    const bar = g.$('[data-field="yields"]');
    for (const y of ['food', 'production', 'gold', 'science', 'culture', 'faith']) {
      const node = bar.querySelector(`.y.${y}`);
      if (node) attachTooltip(node, () => (y === 'food' || y === 'production' ? cityTooltip(y) : yieldTooltip(y)));
    }
    renderProgress(total);
    // The map toggles under the end-turn button.
    const lens = g.$('[data-action="lens"]');
    lens.hidden = !g.ruleset.beliefs;
    lens.setAttribute('aria-pressed', String(Boolean(g.religionLens)));
  }

  /** The progress widget (top left): research and civic, each with a ring and turns left; click opens the tree. */
  function renderProgress(total) {
    const world = knownWorld(g.v);
    const row = (tree, r, perTurn, name, noneKey) => {
      const id = r?.current ?? null;
      const cost = id ? costOf(world, g.ruleset, id, tree) : 1;
      const done = id ? Math.min(1, (r.progress?.[id] ?? 0) / Math.max(1, cost)) : 0;
      const turns = id ? Math.max(1, Math.ceil((cost - (r.progress?.[id] ?? 0)) / Math.max(1, perTurn))) : null;
      const yieldName = tree === 'civics' ? 'culture' : 'science';
      const circ = 2 * Math.PI * 16;
      const ring = el(g.doc, 'span', { class: 'ring' });
      ring.innerHTML = `<svg class="ring-track" viewBox="0 0 38 38" aria-hidden="true"><circle class="back" cx="19" cy="19" r="16"/><circle class="${yieldName}" cx="19" cy="19" r="16" stroke-dasharray="${(done * circ).toFixed(1)} ${circ.toFixed(1)}"/></svg>`;
      ring.append(icon(g.doc, tree === 'civics' ? 'civics' : 'techs', { size: 18 }));
      return el(g.doc, 'button', { type: 'button', class: 'progress-row', dataset: { progress: tree }, onclick: () => g.openTrees(tree),
        'aria-label': id ? g.tt('game.progress.label', { name: name(id), n: turns }) : g.tt(noneKey) },
      ring,
      el(g.doc, 'span', { class: `name${id ? '' : ' none'}` }, id ? name(id) : g.tt(noneKey)),
      id ? el(g.doc, 'span', { class: 'turns' }, turns === 1 ? g.tt('game.progress.turn') : g.tt('game.progress.turns', { n: turns })) : el(g.doc, 'span'));
    };
    const host = g.$('[data-field="progress"]');
    fill(host,
      g.ruleset.techs ? row('techs', g.v.research, total.science, g.techName, 'game.progress.noResearch') : null,
      g.ruleset.civics ? row('civics', g.v.civicResearch, total.culture, g.civicName, 'game.progress.noCivic') : null);
  }

  /** Food or production by city, biggest first. */
  function cityTooltip(y) {
    const rows = g.myCities().map((c) => { const r = g.yieldsOf(c); return { name: c.name, n: y === 'food' ? r.surplus : r.total.production }; })
      .sort((a, b) => b.n - a.n);
    const lines = rows.slice(0, 8).map((r) => ({ icon: 'city', text: r.name, value: signed(r.n) }));
    if (rows.length > 8) lines.push({ text: g.tt('tooltip.moreCities', { n: rows.length - 8 }), muted: true });
    if (!lines.length) lines.push({ text: g.tt('tooltip.none'), muted: true });
    lines.push({ icon: y, text: g.tt(y === 'food' ? 'tooltip.foodSurplus' : 'tooltip.perTurn'), value: signed(rows.reduce((n, r) => n + r.n, 0)), total: true });
    return { title: g.tt(`tooltip.yield.${y}`), lines };
  }

  /** Where a yield comes from, summed over your cities (and, for gold, what upkeep costs). */
  function yieldTooltip(y) {
    const parts = {};
    let total = 0;
    for (const c of g.myCities()) {
      const r = g.yieldsOf(c);
      total += r.total[y];
      for (const src of r.sources) {
        const n = src.yields?.[y] ?? 0;
        if (!n) continue;
        const kind = SOURCE_GROUP[src.kind] ?? 'bonuses';
        parts[kind] = (parts[kind] ?? 0) + n;
      }
    }
    const lines = SOURCE_ORDER.filter((k) => parts[k]).map((k) => ({ icon: SOURCE_ICON[k] ?? y, text: g.tt(`tooltip.source.${k}`), value: signed(parts[k]) }));
    if (y === 'gold') {
      const up = upkeepOf(knownWorld(g.v), g.ruleset, g.human);
      if (up.units) lines.push({ icon: 'class-melee', text: g.tt('tooltip.upkeep.units'), value: signed(-up.units) });
      if (up.buildings) lines.push({ icon: 'city', text: g.tt('tooltip.upkeep.buildings'), value: signed(-up.buildings) });
      total -= up.total;
    }
    if (!lines.length) lines.push({ text: g.tt('tooltip.none'), muted: true });
    lines.push({ icon: y, text: g.tt('tooltip.perTurn'), value: signed(total), total: true });
    const stock = y === 'gold' || y === 'faith' ? g.tt('tooltip.stock', { n: fmt(g.v.stocks?.[y] ?? 0) }) : null;
    if (stock) lines.push({ text: stock, muted: true });
    return { title: g.tt(`tooltip.yield.${y}`), lines, key: KEY_HINT[y] ? g.tt(KEY_HINT[y]) : null };
  }

  function lensData() {
    if (!g.religionLens) return null;
    const out = {};
    for (const c of g.v.cities) {
      out[c.id] = Object.entries(c.followers ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([id, n]) => ({ colour: g.ruleset.religions?.[id]?.colour ?? '#888', n }));
    }
    return out;
  }

  function toggleLens() {
    g.religionLens = !g.religionLens;
    g.mapView.setReligionLens(lensData());
    g.render();
  }

  return { renderBar, lensData, toggleLens };
}
