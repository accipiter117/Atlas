// The needs-attention list (a drawer on narrow screens).
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { combatKind, promotionsAvailable } from '../../sim/index.js';
import { el } from './shared.js';

export function createAttention(g) {
  function renderAttention() {
    const items = [
      ...g.noProduction().map((c) => ({ key: `p${c.id}`, label: g.tt('game.attention.production', { city: c.name }), go: () => g.openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...g.starving().map((c) => ({ key: `s${c.id}`, label: g.tt('game.attention.starving', { city: c.name }), go: () => g.openCityDrawer(c.id, { centre: true }), urgent: true })),
      ...g.myUnits().filter((u) => promotionsAvailable(g.ruleset, u) > 0 && combatKind(g.ruleset, u) !== 'none').map((u) => ({ key: `pr${u.id}`, label: g.tt('game.attention.promote', { unit: g.unitName(u) }), go: () => g.select(u.id, { centre: true }) })),
      ...(g.v.diplomacy?.deals ?? []).filter((d) => d.to === g.human).map((d) => ({ key: `deal${d.id}`, label: g.tt('game.attention.offer', { faction: g.civName(d.from) }), go: () => g.openDiplomacy(d.from), urgent: true })),
      ...g.idle().map((u) => ({ key: u.id, label: g.tt('game.attention.idle', { unit: g.unitName(u) }), go: () => g.select(u.id, { centre: true }), unit: u.id })),
    ];
    g.$('[data-field="attention-title"]').textContent = g.tt('game.attention', { n: items.length });
    g.$('[data-field="attention-count"]').textContent = String(items.length);
    // On a phone the list is a drawer: picking an item closes it.
    const lis = items.map((it) => el(g.doc, 'li', {},
      el(g.doc, 'button', { type: 'button', class: `attention-item${it.urgent ? ' urgent' : ''}`, dataset: it.unit ? { unit: it.unit } : {}, onclick: () => { g.setDrawer(false); it.go(); } }, it.label)));
    g.$('[data-field="attention"]').replaceChildren(...(lis.length ? lis : [el(g.doc, 'li', { class: 'none' }, g.tt('game.attention.none'))]));
  }

  return { renderAttention };
}
