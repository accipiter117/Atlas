// The city panel: yields, citizens, what it builds, buying, faith purchases.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { foodToGrow, buildOptions, itemCost, borderCost, buyPrice, adjacencyBonus, buildingDef, faithPrice, cityStrength, cityHasWalls, cityHpMax } from '../../sim/index.js';
import { el, fill, knownWorld, rankOptions, fmt, signed } from '../hud/shared.js';

export function createCityDrawer(g) {
  /** Buttons to buy things with faith in this city (missionaries, faithPurchase buildings). */
  function faithBuys(c, world) {
    const items = [{ kind: 'unit', id: 'missionary' }, ...Object.keys(g.ruleset.buildings ?? {}).map((id) => ({ kind: 'building', id }))];
    return items.map((item) => {
      const price = g.ruleset.beliefs ? faithPrice(world, g.ruleset, c, item) : null;
      if (price === null || (item.kind === 'building' && !canBuildHere(world, c, item))) return null;
      const label = item.kind === 'unit' ? g.ruleset.text[g.ruleset.units[item.id].nameKey] : g.ruleset.text[g.ruleset.buildings[item.id].nameKey];
      return el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { faithBuy: item.id }, disabled: (g.v.stocks?.faith ?? 0) < price,
        onclick: () => g.cityCmd({ type: 'buyWithFaith', item }) }, g.tt('city.buyFaith', { item: label, price }));
    }).filter(Boolean);
  }

  const canBuildHere = (world, c, item) => buildOptions(world, g.ruleset, c).some((o) => o.kind === item.kind && o.id === item.id);

  function mood(a) {
    if (!a) return null;
    const p = a.threshold?.yieldPercent ?? 0;
    const key = p > 0 ? 'city.mood.happy' : p === 0 ? 'city.mood.content' : a.threshold?.rebels ? 'city.mood.revolt' : 'city.mood.unhappy';
    return el(g.doc, 'p', { class: `mood${p < 0 ? ' bad' : p > 0 ? ' good' : ''}`, dataset: { field: 'amenities' } },
      `${g.tt('city.amenities', { balance: signed(a.balance), have: a.have + a.luxuries, need: a.need })} · ${g.tt(key, { p })}`);
  }

  /** Built buildings and wonders, each with what it adds here; adjacency shown in words, not only in a tooltip. */
  function buildingList(c) {
    if (!c.buildings.length) return el(g.doc, 'p', { class: 'muted small' }, g.tt('city.noBuildings'));
    const world = knownWorld(g.v);
    return el(g.doc, 'ul', { class: 'built', dataset: { field: 'buildings' } }, ...c.buildings.map((b) => {
      const def = buildingDef(g.ruleset, b);
      const adj = adjacencyBonus(world, g.ruleset, c, b).filter((a) => a.rule);
      const extra = adj.map((a) => g.tt('city.adjacency', { n: a.amount, yield: g.tt(`yield.${a.yield}`), count: a.count })).join(', ');
      const tip = [g.ruleset.text[def?.descriptionKey], extra].filter(Boolean).join(' ');
      return el(g.doc, 'li', { title: tip, dataset: { building: b } },
        el(g.doc, 'span', { class: 'name' }, g.ruleset.text[def?.nameKey] ?? b),
        extra ? el(g.doc, 'span', { class: 'adjacency' }, ` (${extra})`) : null);
    }));
  }

  function renderCityDrawer(c) {
    const card = g.$('[data-field="unit-card"]');
    const actions = g.$('[data-field="actions"]');
    const y = g.yieldsOf(c);
    const world = knownWorld(g.v);
    const need = foodToGrow(c.pop, g.ruleset.tuning);
    const growIn = y.surplus > 0 ? Math.ceil((need - c.food) / y.surplus) : null;
    const growth = y.surplus < 0 ? g.tt('city.starving') : growIn ? g.tt('city.grows', { n: growIn }) : g.tt('city.growsNever');
    const head = c.queue[0];
    const prod = Math.max(1, y.total.production);
    const price = head ? buyPrice(g.ruleset, c, world) : null;
    const options = rankOptions(g.v, g.ruleset, c, g.tt);
    const shown = g.showAllOptions ? options : options.slice(0, 4);
    const borderIn = Math.max(1, Math.ceil((borderCost(c, g.ruleset.tuning) - c.culture) / Math.max(0.1, y.total.culture)));
    const focuses = Object.values(g.ruleset.focuses ?? {});

    fill(card, ...[
      el(g.doc, 'div', { class: 'city-head' },
        el(g.doc, 'h2', {}, c.name),
        el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-city' }, onclick: () => g.select(null) }, g.tt('city.close'))),
      el(g.doc, 'p', { class: 'muted' }, g.tt('city.pop', { pop: c.pop })),
      mood(y.amenities),
      el(g.doc, 'p', { class: 'muted small', dataset: { field: 'city-hp' } }, g.tt('city.hp', { hp: c.hp ?? cityHpMax(g.ruleset, c), max: cityHpMax(g.ruleset, c), strength: cityStrength(world, g.ruleset, c) })),
      cityHasWalls(g.ruleset, c) ? el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'shoot' }, disabled: c.shotTurn === g.v.turn,
        onclick: () => { g.shootingCity = c.id; g.toast(g.tt('city.shootPick', { n: g.ruleset.tuning?.combat?.cityRange ?? 2 })); } },
      c.shotTurn === g.v.turn ? g.tt('city.shot') : g.tt('city.shoot', { n: g.ruleset.tuning?.combat?.cityRange ?? 2 })) : null,
      el(g.doc, 'div', { class: 'city-yields' },
        el(g.doc, 'span', { class: 'food' }, `${g.tt('city.food', { rate: signed(y.surplus) })} (${growth})`),
        el(g.doc, 'span', {}, g.tt('city.production', { n: fmt(y.total.production) })),
        el(g.doc, 'span', {}, g.tt('city.gold', { n: fmt(y.total.gold) })),
        el(g.doc, 'span', {}, g.tt('city.science', { n: fmt(y.total.science) })),
        el(g.doc, 'span', {}, g.tt('city.culture', { n: fmt(y.total.culture) })),
        el(g.doc, 'span', {}, g.tt('city.faith', { n: fmt(y.total.faith) }))),
      el(g.doc, 'div', { class: 'city-building' },
        el(g.doc, 'p', { dataset: { field: 'building' } }, head
          ? g.tt('city.building', { item: g.itemName(head), n: Math.max(1, Math.ceil((itemCost(g.ruleset, head, world, c) - c.progress) / prod)) })
          : g.tt('city.buildingNothing')),
        head && price !== null ? el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'buy' }, disabled: (g.v.stocks?.gold ?? 0) < price, onclick: () => g.cityCmd({ type: 'buyItem' }) }, g.tt('city.buy', { price })) : null,
        ...faithBuys(c, world),
        c.queue.length > 1 ? el(g.doc, 'p', { class: 'muted' }, g.tt('city.queue', { items: c.queue.slice(1).map(g.itemName).join(', ') })) : null),
      el(g.doc, 'h3', {}, g.tt('city.choose')),
      el(g.doc, 'ul', { class: 'choose', dataset: { field: 'options' } }, ...shown.map((o) => el(g.doc, 'li', {},
        el(g.doc, 'button', { type: 'button', class: `choose-item${head?.id === o.item.id ? ' current' : ''}`, dataset: { item: o.item.id }, onclick: () => g.cityCmd({ type: 'setProduction', item: o.item }) },
          el(g.doc, 'span', { class: 'name' }, g.itemName(o.item)),
          el(g.doc, 'span', { class: 'turns' }, g.tt('city.turns', { n: o.turns })),
          el(g.doc, 'span', { class: 'reason' }, o.reason)),
        el(g.doc, 'button', { type: 'button', class: 'queue-add', 'aria-label': g.tt('city.queueAdd', { item: g.itemName(o.item) }), title: g.tt('city.queueAdd', { item: g.itemName(o.item) }), onclick: () => g.cityCmd({ type: 'queueProduction', item: o.item }) }, '+')))),
      options.length > 4 ? el(g.doc, 'button', { type: 'button', class: 'btn small link', onclick: () => { g.showAllOptions = !g.showAllOptions; g.render(); } },
        g.showAllOptions ? g.tt('city.showFewer') : g.tt('city.showAll', { n: options.length })) : null,
      el(g.doc, 'h3', {}, g.tt('city.buildings')),
      buildingList(c),
      Object.keys(c.specialists ?? {}).length ? el(g.doc, 'p', { class: 'muted small', dataset: { field: 'specialists' } },
        g.tt('city.specialists', { list: Object.entries(c.specialists).map(([k, n]) => `${n} ${g.tt(`yield.${k}`)}`).join(', ') })) : null,
      el(g.doc, 'h3', {}, g.tt('city.focus')),
      el(g.doc, 'div', { class: 'focus', role: 'group' }, ...focuses.map((f) => el(g.doc, 'button', {
        type: 'button', class: `btn small${c.focus === f.id ? ' primary' : ''}`, dataset: { focus: f.id }, 'aria-pressed': String(c.focus === f.id),
        onclick: () => g.cityCmd({ type: 'setFocus', focus: f.id }),
      }, g.ruleset.text[f.nameKey] ?? f.id))),
      el(g.doc, 'p', { class: 'muted small' }, g.tt('city.border', { n: borderIn })),
      el(g.doc, 'p', { class: 'muted small' }, g.tt('city.lockHint')),
    ].filter(Boolean));
    fill(actions, );
    g.$('[data-field="hint"]').textContent = '';
  }

  return { faithBuys, canBuildHere, mood, buildingList, renderCityDrawer };
}
