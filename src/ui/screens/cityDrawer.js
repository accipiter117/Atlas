// The city panel: yields, citizens, what it builds, buying, faith purchases.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { foodToGrow, buildOptions, itemCost, borderCost, buyPrice, adjacencyBonus, buildingDef, faithPrice, cityStrength, cityHasWalls, cityHpMax } from '../../sim/index.js';
import { el, fill, knownWorld, rankOptions, fmt, signed } from '../hud/shared.js';
import { icon, unitIconName } from '../hud/icons.js';

// Which city tab is open, kept as you move between cities.
let cityTab = 'production';

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
      `${a.need > 0 ? g.tt('city.amenities', { balance: signed(a.balance), have: a.have + a.luxuries, need: a.need }) : g.tt('city.amenitiesNone', { have: a.have + a.luxuries })} · ${g.tt(key, { p })}`);
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

    // The city screen (graphics overhaul G8, docs/OVERHAUL.md 5.3): a parchment panel beside the live
    // map, with previous and next city, the city at a glance, and three tabs.
    const mine = g.myCities();
    const at = mine.findIndex((x) => x.id === c.id);
    const step = (d) => { const nxt = mine[(at + d + mine.length) % mine.length]; if (nxt) g.openCityDrawer(nxt.id, { centre: true, keepTab: true }); };
    const tabButton = (id) => el(g.doc, 'button', { type: 'button', role: 'tab', class: `city-tab${cityTab === id ? ' on' : ''}`, dataset: { cityTab: id }, 'aria-selected': String(cityTab === id), onclick: () => { cityTab = id; g.render(); } }, g.tt(`city.tab.${id}`));
    const yieldChip = (k, value) => el(g.doc, 'span', { class: `city-y ${k}` }, icon(g.doc, k, { size: 16 }), el(g.doc, 'span', {}, value));
    const queueRows = c.queue.map((item, i) => el(g.doc, 'li', { dataset: { queueIndex: String(i) } },
      el(g.doc, 'span', { class: 'name' }, `${i + 1}. ${g.itemName(item)}`),
      el(g.doc, 'span', { class: 'queue-arrows' },
        el(g.doc, 'button', { type: 'button', class: 'icon-btn', disabled: i === 0, 'aria-label': g.tt('city.queueUp', { item: g.itemName(item) }), dataset: { queueUp: String(i) }, onclick: () => g.cityCmd({ type: 'moveQueueItem', index: i, to: i - 1 }) }, '▲'),
        el(g.doc, 'button', { type: 'button', class: 'icon-btn', disabled: i === c.queue.length - 1, 'aria-label': g.tt('city.queueDown', { item: g.itemName(item) }), dataset: { queueDown: String(i) }, onclick: () => g.cityCmd({ type: 'moveQueueItem', index: i, to: i + 1 }) }, '▼'),
        el(g.doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': g.tt('city.queueRemove', { item: g.itemName(item) }), dataset: { queueRemove: String(i) }, onclick: () => g.cityCmd({ type: 'removeQueueItem', index: i }) }, '✕'))));
    const chooseList = (list) => el(g.doc, 'ul', { class: 'choose', dataset: { field: 'options' } }, ...list.map((o) => el(g.doc, 'li', {},
      el(g.doc, 'button', { type: 'button', class: `choose-item${head?.id === o.item.id ? ' current' : ''}`, dataset: { item: o.item.id }, onclick: () => g.cityCmd({ type: 'setProduction', item: o.item }) },
        el(g.doc, 'span', { class: 'name' }, icon(g.doc, o.item.kind === 'unit' ? unitIconName(g.ruleset, o.item.id) : 'production', { size: 16 }), g.itemName(o.item)),
        el(g.doc, 'span', { class: 'turns' }, g.tt('city.turns', { n: o.turns })),
        el(g.doc, 'span', { class: 'reason' }, o.reason)),
      el(g.doc, 'button', { type: 'button', class: 'queue-add', 'aria-label': g.tt('city.queueAdd', { item: g.itemName(o.item) }), title: g.tt('city.queueAdd', { item: g.itemName(o.item) }), onclick: () => g.cityCmd({ type: 'queueProduction', item: o.item }) }, '+'))));

    const production = [
      el(g.doc, 'div', { class: 'city-building' },
        el(g.doc, 'p', { dataset: { field: 'building' } }, head
          ? g.tt('city.building', { item: g.itemName(head), n: Math.max(1, Math.ceil((itemCost(g.ruleset, head, world, c) - c.progress) / prod)) })
          : g.tt('city.buildingNothing')),
        head && price !== null ? el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'buy' }, disabled: (g.v.stocks?.gold ?? 0) < price, onclick: () => g.cityCmd({ type: 'buyItem' }) }, icon(g.doc, 'gold', { size: 16 }), g.tt('city.buy', { price })) : null,
        ...faithBuys(c, world)),
      c.queue.length ? el(g.doc, 'h3', {}, g.tt('city.queueTitle')) : null,
      c.queue.length ? el(g.doc, 'ol', { class: 'city-queue', dataset: { field: 'queue' } }, ...queueRows) : null,
      el(g.doc, 'h3', {}, g.tt('city.choose')),
      chooseList(shown),
      options.length > 4 ? el(g.doc, 'button', { type: 'button', class: 'btn small link', onclick: () => { g.showAllOptions = !g.showAllOptions; g.render(); } },
        g.showAllOptions ? g.tt('city.showFewer') : g.tt('city.showAll', { n: options.length })) : null,
    ];
    const canAlsoBuild = options.filter((o) => o.item.kind !== 'unit');
    const buildingsTab = [
      el(g.doc, 'h3', {}, g.tt('city.buildings')),
      buildingList(c),
      el(g.doc, 'h3', {}, g.tt('city.available')),
      canAlsoBuild.length ? el(g.doc, 'ul', { class: 'can-build' }, ...canAlsoBuild.map((o) => el(g.doc, 'li', {}, el(g.doc, 'strong', {}, g.itemName(o.item)), ` ${o.reason}`)))
        : el(g.doc, 'p', { class: 'muted small' }, g.tt('city.noneAvailable')),
    ];
    const citizens = [
      el(g.doc, 'h3', {}, g.tt('city.focus')),
      el(g.doc, 'div', { class: 'focus', role: 'group' }, ...focuses.map((f) => el(g.doc, 'button', {
        type: 'button', class: `btn small${c.focus === f.id ? ' primary' : ''}`, dataset: { focus: f.id }, 'aria-pressed': String(c.focus === f.id),
        onclick: () => g.cityCmd({ type: 'setFocus', focus: f.id }),
      }, g.ruleset.text[f.nameKey] ?? f.id))),
      Object.keys(c.specialists ?? {}).length ? el(g.doc, 'p', { class: 'muted small', dataset: { field: 'specialists' } },
        g.tt('city.specialists', { list: Object.entries(c.specialists).map(([k, n]) => `${n} ${g.tt(`yield.${k}`)}`).join(', ') })) : null,
      el(g.doc, 'p', { class: 'small' }, g.tt('city.citizensNote')),
      el(g.doc, 'p', { class: 'muted small' }, g.tt('city.border', { n: borderIn })),
      el(g.doc, 'p', { class: 'muted small' }, g.tt('city.lockHint')),
    ];

    fill(card, ...[
      el(g.doc, 'div', { class: 'city-head' },
        el(g.doc, 'button', { type: 'button', class: 'icon-btn city-step', dataset: { action: 'city-prev' }, disabled: mine.length < 2, 'aria-label': g.tt('city.prev'), title: g.tt('city.prev'), onclick: () => step(-1) }, '◀'),
        el(g.doc, 'h2', {}, c.name),
        el(g.doc, 'button', { type: 'button', class: 'icon-btn city-step', dataset: { action: 'city-next' }, disabled: mine.length < 2, 'aria-label': g.tt('city.next'), title: g.tt('city.next'), onclick: () => step(1) }, '▶'),
        el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-city' }, onclick: () => g.select(null) }, g.tt('city.close'))),
      el(g.doc, 'p', { class: 'muted' }, g.tt('city.pop', { pop: c.pop })),
      mood(y.amenities),
      el(g.doc, 'p', { class: 'muted small', dataset: { field: 'city-hp' } }, g.tt('city.hp', { hp: c.hp ?? cityHpMax(g.ruleset, c), max: cityHpMax(g.ruleset, c), strength: cityStrength(world, g.ruleset, c) })),
      cityHasWalls(g.ruleset, c) ? el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'shoot' }, disabled: c.shotTurn === g.v.turn,
        onclick: () => { g.shootingCity = c.id; g.toast(g.tt('city.shootPick', { n: g.ruleset.tuning?.combat?.cityRange ?? 2 })); } },
      c.shotTurn === g.v.turn ? g.tt('city.shot') : g.tt('city.shoot', { n: g.ruleset.tuning?.combat?.cityRange ?? 2 })) : null,
      el(g.doc, 'p', { class: 'city-food', dataset: { field: 'city-food' } }, `${g.tt('city.food', { rate: signed(y.surplus) })} (${growth})`),
      el(g.doc, 'div', { class: 'city-yields', title: [g.tt('city.production', { n: fmt(y.total.production) }), g.tt('city.gold', { n: fmt(y.total.gold) }), g.tt('city.science', { n: fmt(y.total.science) }), g.tt('city.culture', { n: fmt(y.total.culture) }), g.tt('city.faith', { n: fmt(y.total.faith) })].join(', ') },
        yieldChip('production', fmt(y.total.production)), yieldChip('gold', fmt(y.total.gold)), yieldChip('science', fmt(y.total.science)), yieldChip('culture', fmt(y.total.culture)), yieldChip('faith', fmt(y.total.faith))),
      el(g.doc, 'div', { class: 'city-tabs', role: 'tablist' }, tabButton('production'), tabButton('buildings'), tabButton('citizens')),
      el(g.doc, 'div', { class: 'city-tabpanel', role: 'tabpanel', dataset: { cityPanel: cityTab } }, ...(cityTab === 'buildings' ? buildingsTab : cityTab === 'citizens' ? citizens : production)),
    ].filter(Boolean));
    fill(actions, );
    g.$('[data-field="hint"]').textContent = '';
  }

  /** Open on a tab (a city opens on Production unless you step between cities). */
  const setCityTab = (id) => { cityTab = id; };

  return { faithBuys, canBuildHere, mood, buildingList, renderCityDrawer, setCityTab };
}
