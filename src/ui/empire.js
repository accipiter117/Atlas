// The Empire overlay (E), Government tab (section 10.2). Shows your
// government and its card slots; tap a slot to see the short list of cards
// that fit it, then tap one. Changes take effect at the start of your next
// turn; changing government means one turn of anarchy. Later phases add tabs
// for religion, trade routes, spies and the city list.

import { t } from '../data/text.js';
import { slotsOf, governmentAvailable, policyAvailable, workingGovernment, SLOT_KINDS } from '../sim/index.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/**
 * pick: the slot being chosen for, { kind, index } or null.
 * onGovernment(id), onPolicy(kind, index, policyId|null), onPick(slot|null), onClose().
 */
export function renderEmpire(doc, host, { world, view, ruleset, text, pick = null, onGovernment, onPolicy, onPick, onClose, tab = 'government', onTab = null, religionTab = null }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key, fallback = '') => ruleset.text[key] ?? fallback;
  const me = view.me;
  const active = view.government ?? { id: null, policies: {} };
  const pending = view.pendingGovernment;
  const work = workingGovernment(world, me);
  const govName = (id) => say(ruleset.governments?.[id]?.nameKey, id);
  const polName = (id) => say(ruleset.policies?.[id]?.nameKey, id);
  const polText = (id) => say(ruleset.policies?.[id]?.descriptionKey);

  const status = [
    el(doc, 'p', { class: 'empire-now', dataset: { field: 'government-now' } }, active.anarchy ? tt('empire.anarchy') : active.id ? tt('empire.now', { government: govName(active.id) }) : tt('empire.none')),
    pending && pending.id !== active.id ? el(doc, 'p', { class: 'ok', dataset: { field: 'government-pending' } }, tt('empire.pending', { government: govName(pending.id) })) : null,
    pending && pending.id === active.id ? el(doc, 'p', { class: 'small muted' }, tt('empire.pendingCards')) : null,
  ];

  // Governments.
  const govs = Object.values(ruleset.governments ?? {}).map((g) => {
    const open = governmentAvailable(world, ruleset, me, g.id);
    const slots = slotsOf(world, ruleset, me, g.id);
    const isWork = work.id === g.id;
    return el(doc, 'div', { class: `gov-card${isWork ? ' current' : ''}${open ? '' : ' locked'}`, dataset: { government: g.id } },
      el(doc, 'strong', {}, govName(g.id)),
      el(doc, 'span', { class: 'small' }, say(g.descriptionKey)),
      el(doc, 'span', { class: 'small muted' }, tt('empire.slotsLine', slots)),
      isWork ? el(doc, 'span', { class: 'small ok' }, tt(active.id === g.id ? 'empire.current' : 'empire.chosen'))
        : open ? el(doc, 'button', { type: 'button', class: 'btn small', dataset: { adopt: g.id }, onclick: () => onGovernment(g.id) }, tt('empire.adopt'))
          : el(doc, 'span', { class: 'small muted' }, tt('empire.locked', { civic: say(ruleset.civics?.[g.requires?.civic]?.nameKey, '') })));
  });

  // Card slots of the working layout.
  const slots = work.id ? slotsOf(world, ruleset, me, work.id) : null;
  const slotGroups = slots ? SLOT_KINDS.filter((k) => slots[k] > 0).map((kind) => el(doc, 'div', { class: `slot-group slot-${kind}` },
    el(doc, 'h4', {}, tt(`empire.slot.${kind}`)),
    ...Array.from({ length: slots[kind] }, (_, i) => {
      const id = work.policies?.[kind]?.[i] ?? null;
      const chosen = pick && pick.kind === kind && pick.index === i;
      return el(doc, 'button', { type: 'button', class: `slot${id ? ' filled' : ''}${chosen ? ' picking' : ''}`, dataset: { slot: kind, index: String(i) }, onclick: () => onPick(chosen ? null : { kind, index: i }) },
        el(doc, 'strong', {}, id ? polName(id) : tt('empire.empty')),
        id ? el(doc, 'span', { class: 'small' }, polText(id)) : null);
    }))) : [el(doc, 'p', { class: 'muted' }, tt('empire.needGovernment'))];

  // The short list for the slot being picked.
  let list = null;
  if (pick && slots) {
    const inUse = new Set(Object.values(work.policies ?? {}).flat().filter(Boolean));
    const current = work.policies?.[pick.kind]?.[pick.index] ?? null;
    const cards = Object.values(ruleset.policies ?? {}).filter((p) => (pick.kind === 'wildcard' || p.slot === pick.kind) && policyAvailable(world, ruleset, me, p.id) && (!inUse.has(p.id) || p.id === current));
    list = el(doc, 'div', { class: 'card-list', dataset: { field: 'card-list' } },
      el(doc, 'h4', {}, tt('empire.pick')),
      cards.length ? null : el(doc, 'p', { class: 'muted small' }, tt('empire.noCards')),
      ...cards.map((p) => el(doc, 'button', { type: 'button', class: `card-option${p.id === current ? ' current' : ''}`, dataset: { card: p.id }, onclick: () => onPolicy(pick.kind, pick.index, p.id) },
        el(doc, 'strong', {}, polName(p.id)), el(doc, 'span', { class: 'small muted' }, ` ${tt(`empire.slot.${p.slot}`)}`), el(doc, 'span', { class: 'small' }, polText(p.id)))),
      current ? el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'clear-slot' }, onclick: () => onPolicy(pick.kind, pick.index, null) }, tt('empire.clear')) : null);
  }

  host.replaceChildren(
    el(doc, 'div', { class: 'tree-head' },
      el(doc, 'h2', {}, tt('empire.title')),
      el(doc, 'div', { class: 'tabs', role: 'tablist' },
        el(doc, 'button', { type: 'button', class: `btn small${tab === 'government' ? ' primary' : ''}`, role: 'tab', 'aria-selected': String(tab === 'government'), dataset: { tab: 'government' }, onclick: () => onTab?.('government') }, tt('empire.tab.government')),
        religionTab ? el(doc, 'button', { type: 'button', class: `btn small${tab === 'religion' ? ' primary' : ''}`, role: 'tab', 'aria-selected': String(tab === 'religion'), dataset: { tab: 'religion' }, onclick: () => onTab?.('religion') }, tt('empire.tab.religion')) : null),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-empire' }, onclick: onClose }, tt('tree.close'))),
    tab === 'religion' && religionTab ? el(doc, 'div', { class: 'empire-body single' }, religionTab()) : el(doc, 'div', { class: 'empire-body' },
      el(doc, 'section', { class: 'empire-left' }, ...status, el(doc, 'h3', {}, tt('empire.cards')), el(doc, 'div', { class: 'slot-groups' }, ...slotGroups), list),
      el(doc, 'section', { class: 'empire-right' }, el(doc, 'h3', {}, tt('empire.choose')), el(doc, 'p', { class: 'small muted' }, tt('empire.changeNote')), el(doc, 'div', { class: 'gov-list' }, ...govs))));
}
