// Faction cards (phase 6): leader, both traits, agenda, unique unit and
// unique building, in the ruleset's own words. Used by the picker before a
// game and the faction card in the top bar.

import { t } from '../data/text.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export function factionCard(doc, ruleset, text, civId, { onPick, portrait = null } = {}) {
  const f = ruleset.factions[civId];
  const leader = ruleset.leaders[f.leaders[0]];
  const say = (key) => text[key] ?? key;
  const uu = ruleset.units[f.uniqueUnits?.[0]];
  const ub = ruleset.buildings[f.uniqueBuildings?.[0]];
  const name = say(f.nameKey);
  const card = el(doc, 'article', { class: 'faction-card', dataset: { faction: civId }, style: `--faction:${f.colours.primary};--faction2:${f.colours.secondary}` },
    el(doc, 'header', {},
      portrait ? el(doc, 'img', { class: 'card-face', src: portrait, alt: '' }) : el(doc, 'span', { class: 'swatch', 'aria-hidden': 'true' }),
      el(doc, 'h3', {}, name),
      el(doc, 'p', { class: 'leader' }, t(text, 'pick.leader', { leader: say(leader.nameKey) }))),
    el(doc, 'p', { class: 'trait' }, t(text, 'pick.trait', { name: say(f.trait.nameKey), text: say(f.trait.descriptionKey) })),
    el(doc, 'p', { class: 'trait' }, t(text, 'pick.trait', { name: say(leader.trait.nameKey), text: say(leader.trait.descriptionKey) })),
    el(doc, 'p', { class: 'unique' }, t(text, 'pick.unique', { unit: uu ? say(uu.nameKey) : '-', building: ub ? say(ub.nameKey) : '-' })),
    leader.agenda ? el(doc, 'p', { class: 'agenda' }, t(text, 'pick.agenda', { name: say(leader.agenda.nameKey), text: say(leader.agenda.descriptionKey) })) : null,
    onPick ? el(doc, 'button', { type: 'button', class: 'btn primary', dataset: { pick: civId }, onclick: () => onPick(civId) }, t(text, 'pick.choose', { faction: name })) : null);
  return card;
}

/** Fill the picker screen with one card per faction, each with its leader's portrait (graphics overhaul G7). */
export function showFactionPicker(doc, root, ruleset, text, portraitOf, onPick) {
  const grid = root.querySelector('[data-field="factions"]');
  grid.replaceChildren(...Object.keys(ruleset.factions).map((id) => factionCard(doc, ruleset, text, id, { onPick, portrait: portraitOf?.(id) ?? null })));
  root.querySelector('[data-pick]')?.focus({ preventScroll: true });
}
