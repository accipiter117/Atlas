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
  if (out.belief) out.belief = say(ruleset.beliefs?.[out.belief]?.nameKey) ?? out.belief;
  if (out.religion) out.religion = say(ruleset.religions?.[out.religion]?.nameKey) ?? out.religion;
  if (out.mission) out.mission = say(ruleset.espionage?.[out.mission]?.nameKey) ?? out.mission;
  if (out.civic) out.civic = say(ruleset.civics?.[out.civic]?.nameKey) ?? out.civic;
  if (out.government) out.government = say(ruleset.governments?.[out.government]?.nameKey) ?? out.government;
  if (out.policy) out.policy = say(ruleset.policies?.[out.policy]?.nameKey) ?? out.policy;
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
  return p.tech ?? p.civic ?? p.government ?? p.policy ?? p.item ?? p.path ?? p.improvement ?? p.promotion ?? p.target ?? sentence(ruleset, text, factionName, entry);
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

// Which planner made a decision, from the command it led to (graphics overhaul G8 filters).
const PLANNER = {
  strategy: 'strategy', setResearch: 'research', queueResearch: 'research', setProduction: 'production', queueProduction: 'production', buyItem: 'production',
  setGovernment: 'government', setPolicy: 'government', declareWar: 'diplomacy', proposeDeal: 'diplomacy', answerDeal: 'diplomacy', denounce: 'diplomacy',
  makePeace: 'diplomacy', choosePantheon: 'faith', foundReligion: 'faith', spreadReligion: 'faith', buyWithFaith: 'faith', startTradeRoute: 'economy',
  buildImprovement: 'economy', setFocus: 'economy', buyTile: 'economy', assignSpy: 'spies', startMission: 'spies',
};
export const plannerOf = (entry) => PLANNER[entry.type] ?? (['moveUnit', 'attack', 'fortify', 'promote', 'cityAttack', 'sleep', 'skip', 'disband'].includes(entry.type) ? 'military' : 'other');
const PLANNERS = ['strategy', 'research', 'production', 'military', 'economy', 'government', 'diplomacy', 'faith', 'spies'];
const filters = { faction: 'all', turns: 'all', planner: 'all' };

export function renderJournal(doc, host, { ais, factions, ruleset, text, factionName, onClose }) {
  const tt = (k, a) => t(text, k, a);
  const turnNow = Math.max(0, ...Object.values(ais).flatMap((a) => (a.memory.journal ?? []).map((e) => e.turn)));
  const keep = (f, e) => (filters.faction === 'all' || filters.faction === f.id)
    && (filters.turns === 'all' || e.turn > turnNow - Number(filters.turns))
    && (filters.planner === 'all' || plannerOf(e) === filters.planner);
  const rerender = () => renderJournal(doc, host, { ais, factions, ruleset, text, factionName, onClose });
  const pick = (name, value, options) => el(doc, 'label', { class: 'journal-filter' }, el(doc, 'span', { class: 'small' }, tt(`journal.filter.${name}`)),
    (() => {
      const sel = el(doc, 'select', { name: `journal-${name}` }, ...options.map(([v, label]) => { const o = el(doc, 'option', { value: v }, label); if (v === value) o.selected = true; return o; }));
      sel.addEventListener('change', () => { filters[name] = sel.value; rerender(); });
      return sel;
    })());
  const known = factions.filter((f) => ais[f.id]);
  const bar = el(doc, 'div', { class: 'journal-filters' },
    pick('faction', filters.faction, [['all', tt('journal.all')], ...known.map((f) => [f.id, factionName(f.id)])]),
    pick('turns', filters.turns, [['all', tt('journal.allTurns')], ['10', tt('journal.lastN', { n: 10 })], ['30', tt('journal.lastN', { n: 30 })]]),
    pick('planner', filters.planner, [['all', tt('journal.all')], ...PLANNERS.map((p) => [p, tt(`journal.planner.${p}`)])]));
  // Strategy changes, pinned above the rest: each faction's latest.
  const pinned = known.filter((f) => filters.faction === 'all' || filters.faction === f.id).map((f) => {
    const last = (ais[f.id].memory.journal ?? []).filter((e) => e.type === 'strategy').at(-1);
    return last ? el(doc, 'li', {}, el(doc, 'strong', {}, `${factionName(f.id)}: `), sentence(ruleset, text, factionName, last), el(doc, 'span', { class: 'muted small' }, ` (${tt('journal.turn', { n: last.turn })})`)) : null;
  }).filter(Boolean);
  const sections = known.filter((f) => filters.faction === 'all' || filters.faction === f.id).map((f) => {
    const journal = (ais[f.id].memory.journal ?? []).filter((e) => e.type !== 'endTurn' && keep(f, e)).slice(-40).reverse();
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
    el(doc, 'div', { class: 'tree-head' }, el(doc, 'h2', {}, tt('journal.title')), bar, el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-journal' }, onclick: onClose }, tt('journal.close'))),
    pinned.length ? el(doc, 'section', { class: 'journal-pinned', dataset: { field: 'journal-pinned' } }, el(doc, 'h3', {}, tt('journal.pinned')), el(doc, 'ul', {}, ...pinned)) : null,
    el(doc, 'div', { class: 'journal' }, ...sections));
}
