// The AI journal (J): why each computer player did what it did, in plain
// sentences, newest first, with the next options it weighed.

import { t, formatText } from '../data/text.js';

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

/** Turn ids in a journal entry's parameters into names the player reads. */
function named(ruleset, text, factionName, params) {
  const out = { ...params };
  const say = (k) => text[k] ?? k;
  if (out.tech) out.tech = say(ruleset.techs?.[out.tech]?.nameKey) ?? out.tech;
  for (const k of ['item', 'from', 'unit']) {
    const id = out[k];
    if (!id) continue;
    const def = ruleset.units?.[id] ?? ruleset.buildings?.[id] ?? ruleset.wonders?.[id];
    if (def) out[k] = say(def.nameKey);
  }
  if (out.improvement) out.improvement = say(ruleset.improvements?.[out.improvement]?.nameKey);
  if (out.promotion) out.promotion = say(ruleset.promotions?.[out.promotion]?.nameKey);
  if (out.target) out.target = factionName(out.target);
  if (out.path) out.path = say(`path.${out.path}`);
  return out;
}

export function sentence(ruleset, text, factionName, entry) {
  const template = text[entry.reasonKey];
  return template ? formatText(template, named(ruleset, text, factionName, entry.params)) : entry.reasonKey;
}

/** A short name for an option the AI weighed: the tech, item or path itself. */
function shortName(ruleset, text, factionName, entry) {
  const p = named(ruleset, text, factionName, entry.params ?? {});
  return p.tech ?? p.item ?? p.path ?? p.improvement ?? p.promotion ?? p.target ?? sentence(ruleset, text, factionName, entry);
}

/** Merge repeats on the same turn ("A unit explores the unknown" four times becomes one line). */
function grouped(ruleset, text, factionName, journal) {
  const out = [];
  for (const e of journal) {
    const line = sentence(ruleset, text, factionName, e);
    const last = out[out.length - 1];
    if (last && last.turn === e.turn && last.line === line && !e.alternatives?.length) last.n += 1;
    else out.push({ turn: e.turn, line, n: 1, alternatives: e.alternatives ?? [] });
  }
  return out;
}

export function renderJournal(doc, host, { ais, factions, ruleset, text, factionName, onClose }) {
  const tt = (k, a) => t(text, k, a);
  const sections = factions.filter((f) => ais[f.id]).map((f) => {
    const journal = (ais[f.id].memory.journal ?? []).filter((e) => e.type !== 'endTurn').slice(-40).reverse();
    return el(doc, 'section', { class: 'journal-faction', dataset: { faction: f.id } },
      el(doc, 'h3', {}, factionName(f.id)),
      journal.length ? el(doc, 'ol', {}, ...grouped(ruleset, text, factionName, journal).slice(0, 25).map((g) => el(doc, 'li', {},
        el(doc, 'span', { class: 'muted small' }, `${tt('journal.turn', { n: g.turn })}: `),
        g.line,
        g.n > 1 ? el(doc, 'span', { class: 'muted small' }, ` ${tt('journal.times', { n: g.n })}`) : null,
        g.alternatives.length ? el(doc, 'span', { class: 'muted small journal-alt' }, tt('journal.instead', { list: g.alternatives.map((a) => shortName(ruleset, text, factionName, a)).join(', ') })) : null)))
        : el(doc, 'p', { class: 'muted' }, tt('journal.empty')));
  });
  host.replaceChildren(
    el(doc, 'div', { class: 'tree-head' }, el(doc, 'h2', {}, tt('journal.title')), el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-journal' }, onclick: onClose }, tt('journal.close'))),
    el(doc, 'div', { class: 'journal' }, ...sections));
}
