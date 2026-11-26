// The trees overlay (wireframe in section 10.3): techs laid out by their
// tree position in era columns, each showing cost in turns, boost and what
// it unlocks. Tap a tech you can research to research it now; Queue plans
// the whole path to any tech. Civics share this screen from phase 11.

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

export function renderTrees(doc, host, { world, view, ruleset, text, science, onResearch, onQueue, onClose }) {
  const tt = (k, a) => t(text, k, a);
  const r = view.research ?? { known: [], queue: [], progress: {}, boosted: [] };
  const can = new Set(available(world, ruleset, view.me));
  const name = (id) => ruleset.text[ruleset.techs[id]?.nameKey] ?? id;
  const turns = (id) => Math.max(1, Math.ceil((costOf(world, ruleset, id) - (r.progress[id] ?? 0)) / Math.max(1, science)));
  const eras = Object.values(ruleset.eras).sort((a, b) => a.index - b.index);
  const cols = Math.max(...Object.values(ruleset.techs).map((x) => x.treePos?.col ?? 0)) + 1;
  const rows = Math.max(...Object.values(ruleset.techs).map((x) => x.treePos?.row ?? 0)) + 1;
  const current = r.current;
  const head = el(doc, 'div', { class: 'tree-head' },
    el(doc, 'div', { class: 'tabs', role: 'tablist' },
      el(doc, 'button', { type: 'button', class: 'btn small primary', role: 'tab', 'aria-selected': 'true' }, tt('tree.title.techs')),
      el(doc, 'button', { type: 'button', class: 'btn small', role: 'tab', disabled: true, title: tt('tree.civicsLater') }, tt('tree.title.civics'))),
    el(doc, 'p', { class: 'tree-now' }, current ? tt('tree.researching', { item: name(current), n: turns(current) }) : tt('tree.nothing')),
    el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-tree' }, onclick: onClose }, tt('tree.close')));
  const grid = el(doc, 'div', { class: 'tree-grid', style: `--cols:${cols};--rows:${rows}` },
    ...eras.map((e) => {
      const ids = Object.values(ruleset.techs).filter((x) => x.era === e.id).map((x) => x.treePos?.col ?? 0);
      if (!ids.length) return null;
      return el(doc, 'div', { class: 'tree-era', style: `grid-column:${Math.min(...ids) + 1} / ${Math.max(...ids) + 2}` }, ruleset.text[e.nameKey] ?? e.id);
    }),
    ...Object.values(ruleset.techs).map((tech) => {
      const known = r.known.includes(tech.id);
      const state = known ? 'known' : tech.id === current ? 'current' : can.has(tech.id) ? 'available' : r.queue.includes(tech.id) ? 'queued' : 'locked';
      const unlocks = [...(tech.unlocks?.units ?? []).map((u) => ruleset.text[ruleset.units[u]?.nameKey]), ...(tech.unlocks?.buildings ?? []).map((b) => ruleset.text[ruleset.buildings[b]?.nameKey]),
        ...(tech.unlocks?.wonders ?? []).map((b) => ruleset.text[ruleset.wonders[b]?.nameKey]), ...(tech.unlocks?.improvements ?? []).map((b) => ruleset.text[ruleset.improvements[b]?.nameKey])].filter(Boolean);
      const boost = tech.boost ? (r.boosted.includes(tech.id) ? tt('tree.boosted') : tt('tree.boost', { text: ruleset.text[tech.boost.textKey] ?? '' })) : null;
      const progress = known ? 1 : Math.min(1, (r.progress[tech.id] ?? 0) / costOf(world, ruleset, tech.id));
      return el(doc, 'div', { class: `tech ${state}`, dataset: { tech: tech.id }, style: `grid-column:${(tech.treePos?.col ?? 0) + 1};grid-row:${(tech.treePos?.row ?? 0) + 2}` },
        el(doc, 'button', { type: 'button', class: 'tech-main', disabled: !can.has(tech.id), onclick: () => onResearch(tech.id) },
          el(doc, 'span', { class: 'tech-name' }, name(tech.id)),
          el(doc, 'span', { class: 'tech-turns' }, known ? tt('tree.known') : tt('tree.turns', { n: turns(tech.id) })),
          el(doc, 'span', { class: 'tech-bar' }, el(doc, 'span', { style: `width:${Math.round(progress * 100)}%` })),
          unlocks.length ? el(doc, 'span', { class: 'tech-unlocks' }, tt('tree.unlocks', { list: unlocks.join(', ') })) : null,
          boost ? el(doc, 'span', { class: 'tech-boost' }, boost) : null),
        !known && !can.has(tech.id) ? el(doc, 'button', { type: 'button', class: 'tech-queue', dataset: { queue: tech.id }, onclick: () => onQueue(tech.id), title: pathTo(world, ruleset, view.me, tech.id).map(name).join(', ') }, tt('tree.queue')) : null);
    }));
  host.replaceChildren(head, el(doc, 'p', { class: 'muted small' }, tt('tree.hint')), el(doc, 'div', { class: 'tree-scroll' }, grid));
}
