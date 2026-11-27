// The victory progress panel (V) and the end game screen (section 10.2).
// Both read the progress the victory modules report, so a mod's new victory
// path shows up here without changes.

import { t } from '../data/text.js';
import { victoryProgress, scoreParts, scoreOf, turnLimit } from '../sim/index.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/** One line per faction for one victory path, best first. */
function pathRows(doc, tt, v, name, human, colours) {
  const rows = v.rows.slice().sort((a, b) => (b.value - a.value) || (a.faction < b.faction ? -1 : 1));
  const top = Math.max(1, ...rows.map((r) => r.target ?? r.value));
  return el(doc, 'ol', { class: 'victory-rows' }, ...rows.map((r) => el(doc, 'li', { class: `${r.faction === human ? 'me' : ''}${r.alive ? '' : ' out'}`, dataset: { faction: r.faction } },
    el(doc, 'span', { class: 'v-name' }, el(doc, 'span', { class: 'swatch', style: `background:${colours[r.faction] ?? '#888'}` }), name(r.faction)),
    el(doc, 'span', { class: 'v-bar', 'aria-hidden': 'true' }, el(doc, 'span', { style: `width:${Math.round(Math.min(1, r.value / top) * 100)}%` })),
    el(doc, 'span', { class: 'v-value' }, r.alive ? (r.target ? tt('victory.of', { value: r.value, target: r.target }) : String(r.value)) : tt('victory.out')))));
}

/**
 * Score over time (graphics overhaul G8): one line per faction from the history the game
 * screen keeps ([turn, score per faction in seat order]), an SVG drawn to fit its box.
 */
function scoreChart(doc, tt, state, history, name, colours, human) {
  if (!history || history.length < 2) return el(doc, 'p', { class: 'small muted', dataset: { field: 'score-chart' } }, tt('victory.chartSoon'));
  const W = 640;
  const H = 150;
  const pad = { l: 4, r: 4, t: 6, b: 4 };
  const turns = history.map((h) => h[0]);
  const t0 = Math.min(...turns);
  const t1 = Math.max(...turns);
  const top = Math.max(10, ...history.flatMap((h) => h.slice(1)));
  const x = (t) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const lines = state.factions.map((f, i) => {
    const pts = history.filter((h) => Number.isFinite(h[i + 1])).map((h) => `${x(h[0]).toFixed(1)},${y(h[i + 1]).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${colours[f.id] ?? '#888'}" stroke-width="${f.id === human ? 3 : 1.8}" stroke-linejoin="round"/>`;
  }).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tt('victory.chartLabel')}" preserveAspectRatio="none">`
    + `<line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="axis"/><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" class="axis"/>`
    + `${lines}</svg>`;
  // The labels sit outside the SVG, which stretches to fit, so the text never distorts.
  const box = el(doc, 'div', { class: 'score-chart', dataset: { field: 'score-chart' } },
    el(doc, 'span', { class: 'tick top' }, String(top)), el(doc, 'span', { class: 'tick zero' }, '0'));
  box.insertAdjacentHTML('beforeend', svg);
  box.append(el(doc, 'div', { class: 'ticks-x' }, el(doc, 'span', { class: 'tick' }, tt('victory.turnN', { n: t0 })), el(doc, 'span', { class: 'tick' }, tt('victory.turnN', { n: t1 }))));
  const legend = el(doc, 'ul', { class: 'chart-legend' }, ...state.factions.map((f) => el(doc, 'li', {}, el(doc, 'span', { class: 'swatch', style: `background:${colours[f.id] ?? '#888'}` }), name(f.id))));
  return el(doc, 'section', { class: 'victory-chart' }, el(doc, 'h3', {}, tt('victory.chartTitle')), box, legend);
}

export function renderVictory(doc, host, { state, ruleset, text, human, name, colours, history = null, onClose }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key) => text[key] ?? ruleset.text?.[key] ?? key;
  const limit = turnLimit(state, ruleset);
  const paths = victoryProgress(state, ruleset);
  host.replaceChildren(
    el(doc, 'div', { class: 'tree-head' }, el(doc, 'h2', {}, tt('victory.title')),
      el(doc, 'p', { class: 'tree-now' }, limit ? tt('victory.turnsLeft', { n: Math.max(0, limit - state.turn), limit }) : tt('victory.noLimit')),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-victory' }, onclick: onClose }, tt('tree.close'))),
    scoreChart(doc, tt, state, history, name, colours, human),
    el(doc, 'div', { class: 'victory-grid' }, ...paths.map((v) => el(doc, 'section', { class: 'victory-path', dataset: { victory: v.id } },
      el(doc, 'h3', {}, say(v.nameKey)),
      el(doc, 'p', { class: 'small muted' }, tt(`victory.how.${v.id}`, { min: ruleset.victories?.[v.id]?.params?.minInfluence ?? '' })),
      pathRows(doc, tt, v, name, human, colours)))),
  );
}

export function renderEnd(doc, host, { state, ruleset, text, human, name, onExport, onNew, onTitle, onClose }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key) => text[key] ?? ruleset.text?.[key] ?? key;
  const w = state.winner;
  const you = state.factions.find((f) => f.id === human);
  const yourTeam = state.setup?.players?.[state.factions.findIndex((f) => f.id === human)]?.team ?? null;
  const headline = w ? (w.faction !== human && w.team !== null && w.team !== undefined && w.team === yourTeam ? tt('end.teamWon', { victory: say(ruleset.victories[w.victory]?.nameKey) }) : w.faction === human ? tt('end.won', { victory: say(ruleset.victories[w.victory]?.nameKey) }) : tt('end.lost', { faction: name(w.faction), victory: say(ruleset.victories[w.victory]?.nameKey) }))
    : tt('end.defeated');
  const table = state.factions.map((f) => ({ f, parts: scoreParts(state, ruleset, f.id), total: scoreOf(state, ruleset, f.id) })).sort((a, b) => b.total - a.total);
  const cols = ['citizens', 'cities', 'techs', 'wonders', 'buildings', 'projects'];
  host.replaceChildren(
    el(doc, 'div', { class: 'end-head' },
      el(doc, 'h2', { dataset: { field: 'end-title' } }, headline),
      el(doc, 'p', {}, w ? tt('end.turn', { turn: w.turn }) : tt('end.turn', { turn: state.turn }))),
    el(doc, 'div', { class: 'end-table-wrap' }, el(doc, 'table', { class: 'end-table' },
      el(doc, 'caption', { class: 'small muted' }, tt('end.pointsNote', ruleset.tuning?.score ?? {})),
      el(doc, 'thead', {}, el(doc, 'tr', {}, el(doc, 'th', {}, tt('end.faction')), ...cols.map((c) => el(doc, 'th', {}, tt(`end.col.${c}`))), el(doc, 'th', {}, tt('end.col.total')))),
      el(doc, 'tbody', {}, ...table.map((r) => el(doc, 'tr', { class: `${r.f.id === human ? 'me' : ''}${r.f.alive ? '' : ' out'}`, dataset: { faction: r.f.id } },
        el(doc, 'td', {}, name(r.f.id), r.f.alive ? null : ` ${tt('victory.outShort')}`, w?.faction === r.f.id ? ` ${tt('end.winnerMark')}` : null),
        ...cols.map((c) => el(doc, 'td', {}, String(r.parts[c]))), el(doc, 'td', {}, el(doc, 'strong', {}, String(r.total)))))))),
    el(doc, 'p', { class: 'small' }, tt('end.seed', { seed: state.setup.seed }), you?.alive === false && !w ? ` ${tt('end.keepWatching')}` : null),
    el(doc, 'div', { class: 'end-actions' },
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'end-export' }, onclick: onExport }, tt('end.export')),
      el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'end-new' }, onclick: onNew }, tt('end.newGame')),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'end-title' }, onclick: onTitle }, tt('end.title')),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'end-close' }, onclick: onClose }, tt('end.look'))),
    el(doc, 'div', { dataset: { field: 'end-code' } }));
}
