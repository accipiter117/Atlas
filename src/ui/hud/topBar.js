// The top bar: your faction, the turn, gold, era, research, civic, faith and the religion lens.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { eraOf, upkeepOf } from '../../sim/index.js';
import { attachTooltip } from './tooltip.js';
import { el, knownWorld, fmt, signed } from './shared.js';

const SOURCE_GROUP = { tiles: 'tiles', city: 'city', citizens: 'citizens', building: 'buildings', adjacency: 'buildings', specialists: 'specialists', trade: 'trade', effects: 'bonuses', percent: 'bonuses' };
const SOURCE_ORDER = ['tiles', 'city', 'citizens', 'buildings', 'specialists', 'trade', 'bonuses'];
const SOURCE_ICON = { tiles: 'food', city: 'city', citizens: 'population', buildings: 'housing', specialists: 'population', trade: 'trader', bonuses: 'xp' };
const KEY_HINT = { science: 'tooltip.key.trees', culture: 'tooltip.key.civics', faith: 'tooltip.key.religion' };

export function createTopBar(g) {
  function renderBar() {
    g.$('[data-field="turn"]').textContent = g.tt('game.turn', { n: g.state.turn });
    const total = { gold: 0, science: 0, culture: 0, faith: 0 };
    for (const c of g.myCities()) {
      const y = g.yieldsOf(c).total;
      for (const k of Object.keys(total)) total[k] += y[k];
    }
    const s = g.v.stocks ?? { gold: 0, faith: 0 };
    const me = g.v.factions.find((f) => f.id === g.human);
    const chip = g.$('[data-action="faction"]');
    chip.textContent = g.tt('game.factionCard', { faction: g.civName(g.human) });
    chip.style.setProperty('--faction', g.ruleset.factions?.[me?.civ]?.colours.primary ?? '#888');
    g.$('[data-field="yields"]').replaceChildren(
      el(g.doc, 'span', { class: `y gold${g.netGold() < 0 ? ' falling' : ''}` }, g.tt('game.bar.gold', { stock: fmt(s.gold), rate: signed(g.netGold()) })),
      el(g.doc, 'span', { class: 'y era' }, g.tt('game.era', { era: g.ruleset.text[g.ruleset.eras?.[eraOf(knownWorld(g.v), g.ruleset, g.human)]?.nameKey] ?? '' })),
      el(g.doc, 'button', { type: 'button', class: 'y science link-like', dataset: { action: 'trees' }, onclick: g.openTrees },
        g.v.research?.current ? g.tt('game.bar.science', { rate: signed(total.science), item: g.techName(g.v.research.current) }) : g.tt('game.bar.noResearch', { rate: signed(total.science) })),
      g.ruleset.civics ? el(g.doc, 'button', { type: 'button', class: 'y culture link-like', dataset: { action: 'civics' }, onclick: () => g.openTrees('civics') },
        g.v.civicResearch?.current ? g.tt('game.bar.civic', { rate: signed(total.culture), item: g.civicName(g.v.civicResearch.current) }) : g.tt('game.bar.noCivic', { rate: signed(total.culture) }))
        : el(g.doc, 'span', { class: 'y culture' }, g.tt('game.bar.culture', { rate: signed(total.culture) })),
      g.ruleset.beliefs ? el(g.doc, 'button', { type: 'button', class: 'y faith link-like', dataset: { action: 'religion' }, onclick: () => g.openEmpire('religion') }, g.tt('game.bar.faith', { stock: fmt(s.faith), rate: signed(total.faith) }))
        : el(g.doc, 'span', { class: 'y faith' }, g.tt('game.bar.faith', { stock: fmt(s.faith), rate: signed(total.faith) })),
      g.ruleset.beliefs ? el(g.doc, 'button', { type: 'button', class: `y link-like lens${g.religionLens ? ' on' : ''}`, dataset: { action: 'lens' }, 'aria-pressed': String(g.religionLens), onclick: toggleLens }, g.tt('game.lens')) : null,
    );
    // Tooltips (graphics overhaul G1): each yield broken down by where it comes from.
    const bar = g.$('[data-field="yields"]');
    for (const y of ['gold', 'science', 'culture', 'faith']) {
      const node = bar.querySelector(`.y.${y}`);
      if (node) attachTooltip(node, () => yieldTooltip(y));
    }
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
