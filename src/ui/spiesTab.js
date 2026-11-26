// The Empire overlay's Spies tab (phase 15): every spy with its level, where
// it is and what it is doing; for an idle spy, where it can go and which
// missions it can start, each with its success chance before you commit;
// and the intel your spies have brought back. Spy units still on the map are
// posted from the same place.

import { t } from '../data/text.js';
import { missionOdds, outcomeChances, spyCap, spyCount } from '../sim/index.js';

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

/** act: { assignUnit(unitId, cityId), move(spyId, cityId), mission(spyId, missionId) }. */
export function renderSpiesTab(doc, { world, view, ruleset, text, name, act }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key) => ruleset.text[key] ?? '';
  const me = view.me;
  const spies = view.espionage?.spies ?? [];
  const units = view.units.filter((u) => u.faction === me && (ruleset.units[u.type]?.tags ?? []).includes('spy'));
  const cityOf = (id) => view.cities.find((c) => c.id === id);
  // Cities you know: yours first (to defend), then rivals' (to act), by name.
  const known = view.cities.filter((c) => c.faction !== 'raiders').sort((a, b) => (a.faction === me ? 0 : 1) - (b.faction === me ? 0 : 1) || a.name.localeCompare(b.name));
  const cityLabel = (c) => (c.faction === me ? tt('spies.defend', { city: c.name }) : tt('spies.act', { city: c.name, faction: name(c.faction) }));
  const postPicker = (id, onPick, exclude = null) => {
    const sel = el(doc, 'select', { name: `post-${id}`, dataset: { post: id } }, el(doc, 'option', { value: '' }, tt('spies.choosePost')),
      ...known.filter((c) => c.id !== exclude).map((c) => el(doc, 'option', { value: c.id }, cityLabel(c))));
    return el(doc, 'div', { class: 'seed-row' }, sel, el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: `post-${id}` }, onclick: () => { if (sel.value) onPick(sel.value); } }, tt('spies.send')));
  };

  const parts = [el(doc, 'p', { class: 'empire-now', dataset: { field: 'spy-count' } }, tt('spies.count', { n: spyCount(world, ruleset, me), cap: spyCap(world, ruleset, me) }))];
  if (units.length) {
    parts.push(el(doc, 'h3', {}, tt('spies.new')), ...units.map((u) => el(doc, 'div', { class: 'spy-card', dataset: { spyUnit: u.id } }, el(doc, 'strong', {}, tt('spies.newSpy')), postPicker(u.id, (city) => act.assignUnit(u.id, city)))));
  }
  parts.push(el(doc, 'h3', {}, tt('spies.yours')));
  if (!spies.length) parts.push(el(doc, 'p', { class: 'muted' }, tt('spies.none')));
  for (const s of spies) {
    const city = cityOf(s.city);
    const abroad = city && city.faction !== me;
    const missions = abroad && !s.mission ? Object.values(ruleset.espionage ?? {}).map((m) => {
      const locked = (m.requiresLevel ?? 0) > s.level;
      const odds = missionOdds(world, ruleset, s, m.id, city);
      const ch = outcomeChances(odds, ruleset);
      return el(doc, 'button', { type: 'button', class: 'card-option', dataset: { mission: m.id, spy: s.id }, disabled: locked, onclick: () => act.mission(s.id, m.id) },
        el(doc, 'strong', {}, say(m.nameKey)), el(doc, 'span', { class: 'spy-odds', dataset: { odds: String(odds) } }, ` ${tt('spies.odds', { n: odds })}`),
        el(doc, 'span', { class: 'small' }, say(m.descriptionKey)),
        el(doc, 'span', { class: 'small muted' }, locked ? tt('spies.needsLevel', { n: m.requiresLevel }) : tt('spies.turnsRisk', { turns: m.turns, caught: Math.round((ch.identified + ch.captured) * 100), lost: Math.round(ch.captured * 100) })));
    }) : [];
    parts.push(el(doc, 'div', { class: 'spy-card', dataset: { spy: s.id } },
      el(doc, 'strong', {}, tt('spies.spyLine', { level: s.level })), ' ',
      el(doc, 'span', {}, city ? cityLabel(city) : tt('spies.nowhere')),
      s.mission ? el(doc, 'p', { class: 'small ok' }, tt('spies.onMission', { mission: say(ruleset.espionage[s.mission.id]?.nameKey), n: Math.max(0, s.mission.until - view.turn), odds: s.mission.odds })) : null,
      missions.length ? el(doc, 'div', { class: 'card-list-plain' }, ...missions) : null,
      !s.mission ? postPicker(s.id, (c) => act.move(s.id, c), s.city) : null));
  }
  const intel = Object.entries(view.espionage?.intel ?? {});
  if (intel.length) {
    parts.push(el(doc, 'h3', {}, tt('spies.intel')), el(doc, 'ul', { class: 'rel-list' }, ...intel.map(([f, x]) => el(doc, 'li', { dataset: { intel: f } },
      el(doc, 'strong', {}, name(f)), ' ', tt('spies.intelLine', { research: x.research ? say(ruleset.techs[x.research]?.nameKey) : tt('spies.nothing'), techs: x.techs, gold: x.gold, cities: x.cities, turn: x.turn })))));
  }
  parts.push(el(doc, 'p', { class: 'small muted' }, tt('spies.howTo')));
  return el(doc, 'div', { class: 'religion-tab' }, ...parts);
}
