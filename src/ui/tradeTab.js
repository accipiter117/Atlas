// Trade on screen (phase 14): a trader's destinations, best first, with what
// each end gets; and the Empire overlay's Trade tab with every route that
// starts or ends in your cities.

import { t } from '../data/text.js';
import { previewRoute, routeProblem, routeYields } from '../sim/index.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const ORDER = ['food', 'production', 'gold', 'science', 'culture', 'faith'];
/** "+2 food, +1 production" from a yields object. */
export function yieldsText(tt, y) {
  const parts = ORDER.filter((k) => y[k]).map((k) => tt('trade.yield', { n: Math.round(y[k] * 10) / 10, yield: tt(`trade.y.${k}`) }));
  return parts.length ? parts.join(', ') : tt('trade.nothing');
}

/** Destinations for a trader, best first: [{ city, preview, value }]. Value: everything you get, at either end. */
export function traderDestinations(world, view, ruleset, unit) {
  const origin = view.cities.find((c) => c.tile === unit.tile && c.faction === view.me);
  if (!origin) return [];
  const out = [];
  for (const c of view.cities) {
    if (routeProblem(world, ruleset, view.me, unit.id, c.id)) continue;
    const p = previewRoute(world, ruleset, origin.id, c.id);
    if (!p) continue;
    const sum = (y) => ORDER.reduce((n, k) => n + (y[k] ?? 0), 0);
    out.push({ city: c, preview: p, value: sum(p.origin) + (p.kind === 'domestic' ? sum(p.dest) : 0) });
  }
  return out.sort((a, b) => b.value - a.value || (a.city.id < b.city.id ? -1 : 1));
}

/** The destination list shown on a trader's card. */
export function renderTraderList(doc, { world, view, ruleset, text, unit, name, onStart }) {
  const tt = (k, a) => t(text, k, a);
  const list = traderDestinations(world, view, ruleset, unit);
  const inCity = view.cities.some((c) => c.tile === unit.tile && c.faction === view.me);
  if (!inCity) return el(doc, 'p', { class: 'muted small' }, tt('trade.goToCity'));
  if (!list.length) return el(doc, 'p', { class: 'muted small' }, tt('trade.noDestinations'));
  return el(doc, 'div', { class: 'trade-dests', dataset: { field: 'destinations' } },
    el(doc, 'h4', {}, tt('trade.destinations')),
    ...list.slice(0, 8).map(({ city, preview }) => el(doc, 'button', { type: 'button', class: 'card-option trade-dest', dataset: { dest: city.id }, onclick: () => onStart(city.id) },
      el(doc, 'strong', {}, city.name), el(doc, 'span', { class: 'small muted' }, ` ${city.faction === view.me ? tt('trade.domestic') : name(city.faction)}, ${tt(`trade.by.${preview.domain}`)}`),
      el(doc, 'span', { class: 'small' }, tt('trade.youGet', { list: yieldsText(tt, preview.origin) })),
      el(doc, 'span', { class: 'small muted' }, tt('trade.theyGet', { list: yieldsText(tt, preview.dest) })))));
}

/** The Trade tab. */
export function renderTradeTab(doc, { world, view, ruleset, text, name }) {
  const tt = (k, a) => t(text, k, a);
  const routes = view.trade?.routes ?? [];
  const cityName = (id) => world.cities?.[id]?.name ?? '?';
  const mine = routes.filter((r) => r.faction === view.me);
  const theirs = routes.filter((r) => r.faction !== view.me);
  const row = (r) => {
    const y = routeYields(world, ruleset, r);
    return el(doc, 'li', { dataset: { route: r.id } },
      el(doc, 'strong', {}, tt('trade.routeLine', { from: cityName(r.origin), to: cityName(r.dest) })),
      el(doc, 'span', { class: 'small muted' }, ` ${tt(`trade.by.${r.domain}`)}, ${tt('trade.turnsLeft', { n: Math.max(0, r.until - view.turn) })}`),
      el(doc, 'span', { class: 'small' }, tt('trade.originGets', { city: cityName(r.origin), list: yieldsText(tt, y.origin) })),
      el(doc, 'span', { class: 'small' }, tt('trade.destGets', { city: cityName(r.dest), list: yieldsText(tt, y.dest) })));
  };
  const traders = view.units.filter((u) => u.faction === view.me && (ruleset.units[u.type]?.tags ?? []).includes('trader'));
  return el(doc, 'div', { class: 'religion-tab' },
    el(doc, 'h3', {}, tt('trade.yourRoutes', { n: mine.length })),
    mine.length ? el(doc, 'ul', { class: 'trade-list' }, ...mine.map(row)) : el(doc, 'p', { class: 'muted' }, tt('trade.noneYet')),
    theirs.length ? el(doc, 'h3', {}, tt('trade.toYou')) : null,
    theirs.length ? el(doc, 'ul', { class: 'trade-list' }, ...theirs.map((r) => el(doc, 'li', {}, row(r), el(doc, 'span', { class: 'small muted' }, tt('trade.from', { faction: name(r.faction) }))))) : null,
    el(doc, 'p', { class: 'small muted' }, traders.length ? tt('trade.idleTraders', { n: traders.length }) : tt('trade.howTo')));
}
