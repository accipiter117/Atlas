// The Empire's Cities tab (graphics overhaul G8, docs/OVERHAUL.md 5.3): every one of
// your cities in a table (population, food, production, gold, science, culture,
// faith, what it builds), sorted by any column with a click on its heading. A row
// opens that city.

import { t } from '../data/text.js';
import { cityYields, itemCost } from '../sim/index.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

let sortBy = 'pop';
let descending = true;
const COLUMNS = ['name', 'pop', 'food', 'production', 'gold', 'science', 'culture', 'faith', 'build'];

export function renderCityTable(doc, { world, view, ruleset, text, itemName, onOpen, onSort }) {
  const tt = (k, a) => t(text, k, a);
  const rows = view.cities.filter((c) => c.faction === view.me).map((c) => {
    const y = cityYields(world, ruleset, c);
    const head = c.queue[0];
    const turns = head ? Math.max(1, Math.ceil((itemCost(ruleset, head, world, c) - (c.progress ?? 0)) / Math.max(1, y.total.production))) : null;
    return { c, name: c.name, pop: c.pop, food: y.surplus, production: y.total.production, gold: y.total.gold, science: y.total.science, culture: y.total.culture, faith: y.total.faith, build: head ? `${itemName(head)} (${turns})` : '' };
  });
  rows.sort((a, b) => {
    const x = a[sortBy];
    const y = b[sortBy];
    const d = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return (descending ? -d : d) || a.name.localeCompare(b.name);
  });
  const fmt = (n) => (typeof n === 'number' ? String(Math.round(n * 10) / 10) : n);
  if (!rows.length) return el(doc, 'p', { class: 'muted' }, tt('cities.none'));
  return el(doc, 'table', { class: 'city-table', dataset: { field: 'city-table' } },
    el(doc, 'thead', {}, el(doc, 'tr', {}, ...COLUMNS.map((col) => el(doc, 'th', { scope: 'col', 'aria-sort': col === sortBy ? (descending ? 'descending' : 'ascending') : 'none' },
      el(doc, 'button', { type: 'button', class: `sort${col === sortBy ? ' on' : ''}`, dataset: { sort: col }, onclick: () => { if (sortBy === col) descending = !descending; else { sortBy = col; descending = col !== 'name' && col !== 'build'; } onSort?.(); } },
        tt(`cities.col.${col}`), col === sortBy ? (descending ? ' ▾' : ' ▴') : ''))))),
    el(doc, 'tbody', {}, ...rows.map((r) => el(doc, 'tr', { dataset: { city: r.c.id } },
      el(doc, 'th', { scope: 'row' }, el(doc, 'button', { type: 'button', class: 'link-row', dataset: { openCity: r.c.id }, onclick: () => onOpen(r.c.id) }, r.name)),
      ...COLUMNS.slice(1).map((col) => el(doc, 'td', { class: col === 'build' ? 'build' : 'num' }, fmt(r[col])))))));
}
