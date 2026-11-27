// The trees overlay (wireframe in section 10.3; a real tree since the graphics
// overhaul G8): techs laid out by their tree position in era columns over
// alternating era bands, joined to their prerequisites by lines, the path to
// what you are researching in gold, each showing cost in turns, a boost badge
// and what it unlocks. Drag to pan, search to find one, zoom out to see the
// whole tree. Tap a tech you can research to research it now; Queue plans
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
  // The path to what you are researching, and what you have queued: drawn in gold.
  const onPath = new Set([...(current ? [current, ...pathTo(world, ruleset, view.me, current, tree)] : []), ...r.queue]);
  const tab = (id, label) => el(doc, 'button', { type: 'button', class: `btn small${tree === id ? ' primary' : ''}`, role: 'tab', 'aria-selected': String(tree === id), dataset: { tab: id }, disabled: !ruleset[id], onclick: () => onTab?.(id) }, label);
  const search = el(doc, 'input', { type: 'search', class: 'tree-search', name: 'tree-search', placeholder: tt('tree.search'), 'aria-label': tt('tree.search') });
  const zoomBtn = el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'tree-zoom' }, 'aria-pressed': 'false' }, tt('tree.zoomOut'));
  const head = el(doc, 'div', { class: 'tree-head' },
    el(doc, 'div', { class: 'tabs', role: 'tablist' }, tab('techs', tt('tree.title.techs')), tab('civics', tt('tree.title.civics'))),
    el(doc, 'p', { class: 'tree-now' }, current ? tt(tree === 'civics' ? 'tree.studying' : 'tree.researching', { item: name(current), n: turns(current) }) : tt('tree.nothing')),
    search, zoomBtn,
    el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-tree' }, onclick: onClose }, tt('tree.close')));
  const grid = el(doc, 'div', { class: 'tree-grid', style: `--cols:${cols};--rows:${rows}` },
    ...eras.flatMap((e, k) => {
      const ids = Object.values(items).filter((x) => x.era === e.id).map((x) => x.treePos?.col ?? 0);
      if (!ids.length) return [];
      const span = `grid-column:${Math.min(...ids) + 1} / ${Math.max(...ids) + 2}`;
      return [el(doc, 'div', { class: `tree-band${k % 2 ? ' odd' : ''}`, style: `${span};grid-row:1 / ${rows + 2}`, 'aria-hidden': 'true' }),
        el(doc, 'div', { class: 'tree-era', style: span }, ruleset.text[e.nameKey] ?? e.id)];
    }),
    ...Object.values(items).map((item) => {
      const known = r.known.includes(item.id);
      const state = known ? 'known' : item.id === current ? 'current' : can.has(item.id) ? 'available' : r.queue.includes(item.id) ? 'queued' : 'locked';
      const boosted = r.boosted.includes(item.id);
      const u = item.unlocks ?? {};
      const unlocks = [...(u.units ?? []).map((x) => say('units', x)), ...(u.buildings ?? []).map((x) => say('buildings', x)),
        ...(u.wonders ?? []).map((x) => say('wonders', x)), ...(u.improvements ?? []).map((x) => say('improvements', x)),
        ...(u.governments ?? []).map((x) => say('governments', x)), ...(u.policies ?? []).map((x) => say('policies', x))].filter(Boolean);
      const boost = item.boost ? (r.boosted.includes(item.id) ? tt('tree.boosted') : tt('tree.boost', { text: ruleset.text[item.boost.textKey] ?? '' })) : null;
      const progress = known ? 1 : Math.min(1, (r.progress[item.id] ?? 0) / costOf(world, ruleset, item.id, tree));
      return el(doc, 'div', { class: `tech ${state}${onPath.has(item.id) ? ' onpath' : ''}`, dataset: { tech: item.id, name: name(item.id).toLowerCase() }, style: `grid-column:${(item.treePos?.col ?? 0) + 1};grid-row:${(item.treePos?.row ?? 0) + 2}` },
        el(doc, 'button', { type: 'button', class: 'tech-main', disabled: !can.has(item.id), onclick: () => onResearch(item.id, tree) },
          el(doc, 'span', { class: 'tech-name' }, name(item.id)),
          el(doc, 'span', { class: 'tech-turns' }, known ? tt('tree.known') : tt('tree.turns', { n: turns(item.id) })),
          el(doc, 'span', { class: 'tech-bar' }, el(doc, 'span', { style: `width:${Math.round(progress * 100)}%` })),
          unlocks.length ? el(doc, 'span', { class: 'tech-unlocks' }, tt('tree.unlocks', { list: unlocks.join(', ') })) : null,
          boost ? el(doc, 'span', { class: 'tech-boost' }, boost) : null,
          item.boost ? el(doc, 'span', { class: `boost-badge${boosted ? ' done' : ''}`, title: boost, 'aria-hidden': 'true' }, boosted ? '✓' : 'B') : null),
        !known && !can.has(item.id) ? el(doc, 'button', { type: 'button', class: 'tech-queue', dataset: { queue: item.id }, onclick: () => onQueue(item.id, tree), title: pathTo(world, ruleset, view.me, item.id, tree).map(name).join(', ') }, tt('tree.queue')) : null);
    }));
  const lines = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.setAttribute('class', 'tree-lines');
  lines.setAttribute('aria-hidden', 'true');
  const scroll = el(doc, 'div', { class: `tree-scroll tree-${tree}` }, el(doc, 'div', { class: 'tree-canvas' }, lines, grid));
  host.replaceChildren(head, el(doc, 'p', { class: 'muted small' }, tt(tree === 'civics' ? 'tree.hintCivics' : 'tree.hint')), scroll);

  // The lines: from each prerequisite's right edge to the item's left edge, gold on your path.
  function drawLines() {
    const box = grid.getBoundingClientRect();
    const k = grid.offsetWidth ? box.width / grid.offsetWidth : 1;
    lines.setAttribute('width', String(grid.offsetWidth));
    lines.setAttribute('height', String(grid.offsetHeight));
    const at = (id) => { const n = grid.querySelector(`[data-tech="${id}"]`); if (!n) return null; const b = n.getBoundingClientRect(); return { l: (b.left - box.left) / k, r: (b.right - box.left) / k, y: (b.top - box.top + b.height / 2) / k }; };
    const paths = [];
    for (const item of Object.values(items)) {
      const to = at(item.id);
      if (!to) continue;
      for (const pre of item.requires ?? []) {
        const from = at(pre);
        if (!from) continue;
        const gold = onPath.has(item.id) && (onPath.has(pre) || r.known.includes(pre));
        const mx = (from.r + to.l) / 2;
        paths.push(`<path class="${gold ? 'gold' : r.known.includes(item.id) ? 'done' : ''}" d="M${from.r.toFixed(1)} ${from.y.toFixed(1)} C${mx.toFixed(1)} ${from.y.toFixed(1)} ${mx.toFixed(1)} ${to.y.toFixed(1)} ${to.l.toFixed(1)} ${to.y.toFixed(1)}"/>`);
      }
    }
    // Gold on top.
    paths.sort((a, b) => Number(a.includes('gold')) - Number(b.includes('gold')));
    lines.innerHTML = paths.join('');
  }
  doc.defaultView.requestAnimationFrame(drawLines);

  // Drag with the mouse to pan (the wheel scrolls as usual; Shift and the wheel go sideways).
  let drag = null;
  scroll.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('button, input')) return;
    drag = { x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
    scroll.setPointerCapture(e.pointerId);
    scroll.classList.add('dragging');
  });
  scroll.addEventListener('pointermove', (e) => {
    if (!drag) return;
    scroll.scrollLeft = drag.left - (e.clientX - drag.x);
    scroll.scrollTop = drag.top - (e.clientY - drag.y);
  });
  const endDrag = () => { drag = null; scroll.classList.remove('dragging'); };
  scroll.addEventListener('pointerup', endDrag);
  scroll.addEventListener('pointercancel', endDrag);

  // Search: matching items stand out, the rest fade, and the first match scrolls into view.
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let first = null;
    for (const n of grid.querySelectorAll('.tech')) {
      const hit = q && n.dataset.name.includes(q);
      n.classList.toggle('match', Boolean(hit));
      n.classList.toggle('faded', Boolean(q) && !hit);
      if (hit && !first) first = n;
    }
    first?.scrollIntoView({ block: 'nearest', inline: 'center' });
  });

  // Zoom out to see the whole tree, and back.
  zoomBtn.addEventListener('click', () => {
    const on = !scroll.classList.contains('zoomed-out');
    scroll.classList.toggle('zoomed-out', on);
    zoomBtn.setAttribute('aria-pressed', String(on));
    zoomBtn.textContent = tt(on ? 'tree.zoomIn' : 'tree.zoomOut');
    doc.defaultView.requestAnimationFrame(drawLines);
  });

  // Open on what you are researching.
  doc.defaultView.requestAnimationFrame(() => grid.querySelector('.tech.current')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
}
