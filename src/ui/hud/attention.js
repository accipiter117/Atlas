// Notifications (graphics overhaul G2, docs/OVERHAUL.md section 3): the
// needs-attention list as a walnut panel in the top right. Each item has an
// icon and jumps to its place when clicked; a right-click (or a long press
// on touch, through the context menu event) dismisses it until something
// changes or the next turn starts. At most six show, then "and N more".
// On a phone it is still the drawer behind the "!" button (phase 21).

import { combatKind, promotionsAvailable } from '../../sim/index.js';
import { el } from './shared.js';
import { icon, unitIconName } from './icons.js';

const MAX_SHOWN = 6;

export function createAttention(g) {
  let dismissed = new Set();
  let dismissedTurn = null;

  function renderAttention() {
    if (dismissedTurn !== g.state.turn) { dismissed = new Set(); dismissedTurn = g.state.turn; }
    const all = [
      ...g.noProduction().map((c) => ({ key: `p${c.id}`, icon: 'production', label: g.tt('game.attention.production', { city: c.name }), go: () => g.openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...g.starving().map((c) => ({ key: `s${c.id}`, icon: 'food', label: g.tt('game.attention.starving', { city: c.name }), go: () => g.openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...g.myUnits().filter((u) => promotionsAvailable(g.ruleset, u) > 0 && combatKind(g.ruleset, u) !== 'none').map((u) => ({ key: `pr${u.id}`, icon: 'xp', label: g.tt('game.attention.promote', { unit: g.unitName(u) }), go: () => g.select(u.id, { centre: true }) })),
      ...(g.v.diplomacy?.deals ?? []).filter((d) => d.to === g.human).map((d) => ({ key: `deal${d.id}`, icon: 'diplomacy', label: g.tt('game.attention.offer', { faction: g.civName(d.from) }), go: () => g.openDiplomacy(d.from), urgent: true })),
      ...g.idle().map((u) => ({ key: u.id, icon: unitIconName(g.ruleset, u.type), label: g.tt('game.attention.idle', { unit: g.unitName(u) }), go: () => g.select(u.id, { centre: true }), unit: u.id })),
    ];
    const items = all.filter((it) => !dismissed.has(it.key));
    g.$('[data-field="attention-title"]').textContent = g.tt('game.attention', { n: items.length });
    g.$('[data-field="attention-count"]').textContent = String(items.length);
    // On a phone the list is a drawer: picking an item closes it. Phones show the whole list.
    const phone = g.root.classList.contains('drawer-open') || g.doc.defaultView.matchMedia?.('(max-width: 899px)').matches;
    const shown = phone ? items : items.slice(0, MAX_SHOWN);
    const lis = shown.map((it) => {
      const button = el(g.doc, 'button', { type: 'button', class: `attention-item${it.urgent ? ' urgent' : ''}`, dataset: { key: it.key, ...(it.unit ? { unit: it.unit } : {}) },
        title: g.tt('game.attention.dismissHint'), onclick: () => { g.setDrawer(false); it.go(); } }, icon(g.doc, it.icon, { size: 18 }), el(g.doc, 'span', {}, it.label));
      button.addEventListener('contextmenu', (e) => { e.preventDefault(); dismissed.add(it.key); renderAttention(); });
      return el(g.doc, 'li', {}, button);
    });
    if (items.length > shown.length) lis.push(el(g.doc, 'li', { class: 'more' }, g.tt('game.attention.more', { n: items.length - shown.length })));
    g.$('[data-field="attention"]').replaceChildren(...(lis.length ? lis : [el(g.doc, 'li', { class: 'none' }, g.tt('game.attention.none'))]));
    // An empty list on a laptop needs no panel at all: the end-turn button says the same.
    g.root.querySelector('.attention').classList.toggle('empty', !items.length);
  }

  return { renderAttention };
}
