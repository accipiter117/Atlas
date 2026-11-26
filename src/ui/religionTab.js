// The Empire overlay's Religion tab (phase 13): your faith and what it buys
// next (a pantheon, then a religion you name), your religion's cities, and
// every religion in the world with its founder, beliefs and followers.

import { t } from '../data/text.js';
import { takenBeliefs, pantheonOf, foundedBy, religionLimit, holyCityOptions, followerCities, pantheonFaith, foundFaith, missionaryFaith } from '../sim/index.js';

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

/** Name of a founded religion: the one its founder gave it, else the ruleset's. */
export function religionName(ruleset, view, id) {
  return view.religion?.religions?.[id]?.name || ruleset.text[ruleset.religions?.[id]?.nameKey] || id;
}

/** act: { pantheon(belief), found({ religion, name, follower, founder, city }) }. form: the founding choices so far. */
export function renderReligionTab(doc, { world, view, ruleset, text, name, form, act }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key) => ruleset.text[key] ?? '';
  const me = view.me;
  const faith = view.stocks?.faith ?? 0;
  const taken = takenBeliefs(world);
  const belief = (id) => el(doc, 'span', {}, el(doc, 'strong', {}, say(ruleset.beliefs[id]?.nameKey)), ` ${say(ruleset.beliefs[id]?.descriptionKey)}`);
  const pan = pantheonOf(world, me);
  const mine = foundedBy(world, me);
  const parts = [el(doc, 'p', { class: 'empire-now', dataset: { field: 'faith' } }, tt('rel.faith', { n: Math.floor(faith) }))];

  // Pantheon.
  if (pan) parts.push(el(doc, 'p', { dataset: { field: 'pantheon' } }, tt('rel.yourPantheon'), ' ', belief(pan)));
  else if (faith >= pantheonFaith(world, ruleset)) {
    parts.push(el(doc, 'h3', {}, tt('rel.choosePantheon')),
      el(doc, 'div', { class: 'card-list-plain' }, ...Object.values(ruleset.beliefs).filter((b) => b.kind === 'pantheon' && !taken.has(b.id))
        .map((b) => el(doc, 'button', { type: 'button', class: 'card-option', dataset: { pantheon: b.id }, onclick: () => act.pantheon(b.id) }, belief(b.id)))));
  } else parts.push(el(doc, 'p', { class: 'muted' }, tt('rel.pantheonAt', { n: pantheonFaith(world, ruleset) })));

  // Founding.
  if (pan && !mine) {
    const slotsLeft = Object.keys(view.religion?.religions ?? {}).length < religionLimit(world, ruleset);
    const holy = holyCityOptions(world, ruleset, me);
    const need = foundFaith(world, ruleset);
    if (!slotsLeft) parts.push(el(doc, 'p', { class: 'muted' }, tt('rel.noneLeft')));
    else if (!holy.length) parts.push(el(doc, 'p', { class: 'muted' }, tt('rel.needShrine', { n: need })));
    else if (faith < need) parts.push(el(doc, 'p', { class: 'muted' }, tt('rel.foundAt', { n: need })));
    else {
      const free = (kind) => Object.values(ruleset.beliefs).filter((b) => b.kind === kind && !taken.has(b.id));
      const religions = Object.values(ruleset.religions).filter((r) => !view.religion?.religions?.[r.id]);
      const f = { religion: religions[0]?.id, follower: free('follower')[0]?.id, founder: free('founder')[0]?.id, city: holy[0], name: '', ...form };
      const pick = (label, field, options) => el(doc, 'label', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, label),
        el(doc, 'select', { name: `found-${field}`, onchange: (e) => act.form({ ...f, [field]: e.target.value }) },
          ...options.map(([v, l]) => { const o = el(doc, 'option', { value: v }, l); o.selected = v === f[field]; return o; })));
      parts.push(el(doc, 'section', { class: 'dip-deal', dataset: { field: 'found' } },
        el(doc, 'h3', {}, tt('rel.found')),
        pick(tt('rel.religion'), 'religion', religions.map((r) => [r.id, say(r.nameKey)])),
        el(doc, 'label', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, tt('rel.name')),
          el(doc, 'input', { type: 'text', name: 'found-name', maxlength: '30', value: f.name, placeholder: say(ruleset.religions[f.religion]?.nameKey), onchange: (e) => act.form({ ...f, name: e.target.value }) })),
        pick(tt('rel.follower'), 'follower', free('follower').map((b) => [b.id, `${say(b.nameKey)}: ${say(b.descriptionKey)}`])),
        pick(tt('rel.founder'), 'founder', free('founder').map((b) => [b.id, `${say(b.nameKey)}: ${say(b.descriptionKey)}`])),
        pick(tt('rel.holyCity'), 'city', holy.map((id) => [id, world.cities[id]?.name ?? id])),
        el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'found-religion' }, onclick: () => act.found({ religion: f.religion, follower: f.follower, founder: f.founder, city: f.city, ...(f.name.trim() ? { name: f.name.trim() } : {}) }) }, tt('rel.foundButton', { n: need }))));
    }
  }
  if (mine) {
    parts.push(el(doc, 'p', { class: 'ok', dataset: { field: 'my-religion' } }, tt('rel.yours', { name: religionName(ruleset, view, mine.id), n: followerCities(world, mine.id) })),
      el(doc, 'p', { class: 'small muted' }, tt('rel.missionaryHint', { n: missionaryFaith(world, ruleset) })));
  }

  // The world's religions.
  const all = Object.values(view.religion?.religions ?? {});
  parts.push(el(doc, 'h3', {}, tt('rel.world', { n: all.length, max: religionLimit(world, ruleset) })));
  parts.push(all.length ? el(doc, 'ul', { class: 'rel-list' }, ...all.map((r) => el(doc, 'li', { dataset: { religion: r.id } },
    el(doc, 'span', { class: 'swatch', style: `background:${ruleset.religions[r.id]?.colour ?? '#888'}` }),
    el(doc, 'strong', {}, religionName(ruleset, view, r.id)), ' ',
    tt('rel.line', { faction: name(r.founder), n: followerCities(world, r.id), city: world.cities[r.holyCity]?.name ?? '?' }),
    el(doc, 'span', { class: 'small muted rel-beliefs' }, r.beliefs.map((b) => say(ruleset.beliefs[b]?.nameKey)).join(', ')))))
    : el(doc, 'p', { class: 'muted' }, tt('rel.noneYet')));
  return el(doc, 'div', { class: 'religion-tab' }, ...parts);
}
