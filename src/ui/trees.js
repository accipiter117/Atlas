// The trees overlay (wireframe in section 10.3): techs laid out by their
// tree position in era columns, each showing cost in turns, boost and what
// it unlocks. Tap a tech you can research to research it now; Queue plans
// the whole path to any tech. Civics (fed by culture) share the screen: the
// tabs switch between the two trees.

import { costOf, available, pathTo } from '../sim/index.js';
import { t } from '../data/text.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/**
 * Draw one tree: tree is 'techs' (fed by science) or 'civics' (fed by culture).
 * rate is the science or culture per turn; onTab(tree) switches tree.
 */
export function renderTrees(doc, host, { world, view, ruleset, text, tree = 'techs', rate, science, onResearch, onQueue, onClose, onTab = null }) {
  const tt = (k, a) => t(text, k, a);
  const items = ruleset[tree] ?? {};
  const r = (tree === 'civics' ? view.civicResearch : view.research) ?? { known: [], queue: [], progress: {}, boosted: [] };
  const perTurn = rate ?? science ?? 0;
  const can = new Set(available(world, ruleset, view.me, tree));
  const name = (id) => ruleset.text[items[id]?.nameKey] ?? id;
  const say = (type, id) => ruleset.text[ruleset[type]?.[id]?.nameKey];
  const turns = (id) => Math.max(1, Math.ceil((costOf(world, ruleset, id, tree) - (r.progress[id] ?? 0)) / Math.max(1, perTurn)));
  const eras = Object.values(ruleset.eras).sort((a, b) => a.index - b.index);
  const cols = Math.max(...Object.values(items).map((x) => x.treePos?.col ?? 0)) + 1;
  const rows = Math.max(...Object.values(items).map((x) => x.treePos?.row ?? 0)) + 1;
  const current = r.current;
  const tab = (id, label) => el(doc, 'button', { type: 'button', class: `btn small${tree === id ? ' primary' : ''}`, role: 'tab', 'aria-selected': String(tree === id), dataset: { tab: id }, disabled: !ruleset[id], onclick: () => onTab?.(id) }, label);
  const head = el(doc, 'div', { class: 'tree-head' },
    el(doc, 'div', { class: 'tabs', role: 'tablist' }, tab('techs', tt('tree.title.techs')), tab('civics', tt('tree.title.civics'))),
    el(doc, 'p', { class: 'tree-now' }, current ? tt(tree === 'civics' ? 'tree.studying' : 'tree.researching', { item: name(current), n: turns(current) }) : tt('tree.nothing')),
    el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-tree' }, onclick: onClose }, tt('tree.close')));
  const grid = el(doc, 'div', { class: 'tree-grid', style: `--cols:${cols};--rows:${rows}` },
    ...eras.map((e) => {
      const ids = Object.values(items).filter((x) => x.era === e.id).map((x) => x.treePos?.col ?? 0);
      if (!ids.length) return null;
      return el(doc, 'div', { class: 'tree-era', style: `grid-column:${Math.min(...ids) + 1} / ${Math.max(...ids) + 2}` }, ruleset.text[e.nameKey] ?? e.id);
    }),
    ...Object.values(items).map((item) => {
      const known = r.known.includes(item.id);
      const state = known ? 'known' : item.id === current ? 'current' : can.has(item.id) ? 'available' : r.queue.includes(item.id) ? 'queued' : 'locked';
      const u = item.unlocks ?? {};
      const unlocks = [...(u.units ?? []).map((x) => say('units', x)), ...(u.buildings ?? []).map((x) => say('buildings', x)),
        ...(u.wonders ?? []).map((x) => say('wonders', x)), ...(u.improvements ?? []).map((x) => say('improvements', x)),
        ...(u.governments ?? []).map((x) => say('governments', x)), ...(u.policies ?? []).map((x) => say('policies', x))].filter(Boolean);
      const boost = item.boost ? (r.boosted.includes(item.id) ? tt('tree.boosted') : tt('tree.boost', { text: ruleset.text[item.boost.textKey] ?? '' })) : null;
      const progress = known ? 1 : Math.min(1, (r.progress[item.id] ?? 0) / costOf(world, ruleset, item.id, tree));
      return el(doc, 'div', { class: `tech ${state}`, dataset: { tech: item.id }, style: `grid-column:${(item.treePos?.col ?? 0) + 1};grid-row:${(item.treePos?.row ?? 0) + 2}` },
        el(doc, 'button', { type: 'button', class: 'tech-main', disabled: !can.has(item.id), onclick: () => onResearch(item.id, tree) },
          el(doc, 'span', { class: 'tech-name' }, name(item.id)),
          el(doc, 'span', { class: 'tech-turns' }, known ? tt('tree.known') : tt('tree.turns', { n: turns(item.id) })),
          el(doc, 'span', { class: 'tech-bar' }, el(doc, 'span', { style: `width:${Math.round(progress * 100)}%` })),
          unlocks.length ? el(doc, 'span', { class: 'tech-unlocks' }, tt('tree.unlocks', { list: unlocks.join(', ') })) : null,
          boost ? el(doc, 'span', { class: 'tech-boost' }, boost) : null),
        !known && !can.has(item.id) ? el(doc, 'button', { type: 'button', class: 'tech-queue', dataset: { queue: item.id }, onclick: () => onQueue(item.id, tree), title: pathTo(world, ruleset, view.me, item.id, tree).map(name).join(', ') }, tt('tree.queue')) : null);
    }));
  host.replaceChildren(head, el(doc, 'p', { class: 'muted small' }, tt(tree === 'civics' ? 'tree.hintCivics' : 'tree.hint')), el(doc, 'div', { class: `tree-scroll tree-${tree}` }, grid));
}
