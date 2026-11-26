// The Mods screen. Lists every mod in rules/index.json, lets you tick them,
// change their order with buttons and set their options, and shows the
// loader's report grouped into errors, warnings and info. The Stack check
// button (phase 17) goes further: it starts a small game with the ticked mods
// and lets the computer play a few rounds of it, to show the combination
// really plays. Games themselves are set up on the setup screen.

import { loadRuleset } from '../data/loader.js';
import { groupReport } from '../data/report.js';
import { t } from '../data/text.js';
import { ENGINE_VERSION, createGame } from '../sim/index.js';
import { createSeatRunner } from '../ai/index.js';

/** Put `ids` in backticks into <code> elements, safely. */
function richText(doc, sentence) {
  const frag = doc.createDocumentFragment();
  sentence.split(/(`[^`]*`)/).forEach((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      const code = doc.createElement('code');
      code.textContent = part.slice(1, -1);
      frag.append(code);
    } else if (part) {
      frag.append(doc.createTextNode(part));
    }
  });
  return frag;
}

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export function createModManager(doc, root, sources) {
  const { index, available, engineText: text } = sources;
  const manifests = Object.fromEntries(index.mods.map((m) => [m.id, JSON.parse(available[m.id].manifest)]));
  const devIds = new Set(index.mods.filter((m) => m.dev).map((m) => m.id));
  const state = {
    order: index.mods.map((m) => m.id),
    ticked: new Set(index.mods.filter((m) => manifests[m.id].type === 'ruleset').slice(0, 1).map((m) => m.id)),
    options: {},
  };
  let lastRuleset = null;
  let focusAfterRender = null;

  const listEl = root.querySelector('[data-field="mod-list"]');
  const reportEl = root.querySelector('[data-field="report"]');
  const statusEl = root.querySelector('[data-field="status"]');
  const hashEl = root.querySelector('[data-field="hash"]');
  const checkBtn = root.querySelector('[data-action="stack-check"]');
  const checkEl = root.querySelector('[data-field="stack-result"]');
  checkBtn?.addEventListener('click', () => stackCheck());

  function move(id, delta) {
    const i = state.order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= state.order.length) return;
    [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
    focusAfterRender = { id, selector: `[data-move="${delta < 0 ? 'up' : 'down'}"]` };
    render();
  }

  function row(id, position) {
    const m = manifests[id];
    const name = m.name;
    const checkbox = el(doc, 'input', { type: 'checkbox', checked: state.ticked.has(id), id: `mod-${id}` });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.ticked.add(id); else state.ticked.delete(id);
      focusAfterRender = { id, selector: 'input' };
      render();
    });
    const kind = devIds.has(id) ? t(text, 'mods.dev') : t(text, `mods.${m.type}`);
    const up = el(doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': t(text, 'mods.up', { name }), disabled: position === 0, dataset: { move: 'up' } }, '▲');
    const down = el(doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': t(text, 'mods.down', { name }), disabled: position === state.order.length - 1, dataset: { move: 'down' } }, '▼');
    up.addEventListener('click', () => move(id, -1));
    down.addEventListener('click', () => move(id, 1));
    // Options of a ticked mod (lock-era's era), chosen from the loaded rules.
    const opts = state.ticked.has(id) ? (m.options ?? []).filter((o) => o.type === 'choice' && o.source && lastRuleset?.[o.source]).map((o) => {
      const sel = el(doc, 'select', { name: `opt-${id}-${o.id}` },
        ...Object.values(lastRuleset[o.source]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((x) => el(doc, 'option', { value: x.id, selected: (state.options[id]?.[o.id] ?? o.default) === x.id }, lastRuleset.text?.[x.nameKey] ?? x.id)));
      sel.addEventListener('change', () => { state.options[id] = { ...(state.options[id] ?? {}), [o.id]: sel.value }; render(); });
      return el(doc, 'label', { class: 'mod-option' }, el(doc, 'span', {}, lastRuleset.text?.[o.labelKey] ?? text[o.labelKey] ?? o.id), sel);
    }) : [];
    return el(doc, 'li', { class: `mod-row${state.ticked.has(id) ? ' on' : ''}`, dataset: { mod: id } },
      el(doc, 'label', { class: 'mod-tick', for: `mod-${id}` },
        checkbox,
        el(doc, 'span', { class: 'mod-text' },
          el(doc, 'span', { class: 'mod-name' }, name, el(doc, 'span', { class: 'chip' }, kind), el(doc, 'span', { class: 'version' }, m.version)),
          m.description ? el(doc, 'span', { class: 'mod-desc' }, m.description) : null)),
      el(doc, 'span', { class: 'mod-order' }, up, down),
      opts.length ? el(doc, 'div', { class: 'mod-options' }, ...opts) : null);
  }

  /** Load the ticked mods, then let the computer play a few rounds of a small game with them. */
  function stackCheck() {
    const selection = state.order.filter((id) => state.ticked.has(id));
    const options = Object.fromEntries(selection.filter((id) => state.options[id]).map((id) => [id, state.options[id]]));
    const result = loadRuleset({ available, selection, options, engineVersion: ENGINE_VERSION });
    if (!result.ok) { checkEl.className = 'small blocked'; checkEl.textContent = t(text, 'mods.checkBlocked', { n: result.report.errors }); return; }
    const rounds = 5;
    try {
      const rs = result.ruleset;
      let s = createGame(rs, { seed: 1, players: Array.from({ length: 4 }, () => ({ kind: 'ai' })), map: { size: 'small', type: Object.keys(rs.mapTypes ?? {})[0] ?? 'continents' }, raiders: 'on', events: 'occasional' });
      const ids = s.factions.map((f) => f.id);
      const runner = createSeatRunner(rs, ids, { recordOff: true });
      let refused = 0;
      for (let r = 0; r < rounds && !s.winner; r += 1) {
        const before = s.turn;
        while (s.turn === before && !s.winner) { const out = runner.play(s, { maxSeats: ids.length }); s = out.state; refused += out.refusals.length; }
      }
      const names = s.factions.map((f) => rs.text?.[rs.factions[f.civ]?.nameKey] ?? f.civ).join(', ');
      checkEl.className = `small ${refused ? 'blocked' : 'ok'}`;
      checkEl.textContent = t(text, 'mods.checkDone', { errors: result.report.errors, warnings: result.report.warnings, rounds, refused, factions: names });
    } catch (e) {
      checkEl.className = 'small blocked';
      checkEl.textContent = t(text, 'mods.checkCrashed', { error: String(e?.message ?? e) });
    }
  }

  function render() {
    const selection = state.order.filter((id) => state.ticked.has(id));
    const options = Object.fromEntries(selection.filter((id) => state.options[id]).map((id) => [id, state.options[id]]));
    const result = loadRuleset({ available, selection, options, engineVersion: ENGINE_VERSION });
    if (result.ok) lastRuleset = result.ruleset;
    if (checkEl) checkEl.textContent = '';
    const groups = groupReport(text, result.report);

    statusEl.className = `mods-status ${result.ok ? 'ok' : 'blocked'}`;
    statusEl.textContent = result.ok
      ? t(text, 'mods.ready', { n: result.order.length, hash: result.hash })
      : t(text, 'mods.blocked', { n: result.report.errors });
    hashEl.textContent = result.hash;
    listEl.replaceChildren(...state.order.map((id, i) => row(id, i)));

    const sections = [['error', 'mods.errors'], ['warning', 'mods.warnings'], ['info', 'mods.info']].map(([level, key]) => {
      const items = groups[level];
      return el(doc, 'section', { class: `report-group ${level}`, dataset: { level } },
        el(doc, 'h3', {}, t(text, key, { n: items.length })),
        items.length
          ? el(doc, 'ul', {}, ...items.map((m) => el(doc, 'li', { dataset: { code: m.code } }, richText(doc, m.text))))
          : el(doc, 'p', { class: 'none' }, t(text, 'mods.none')));
    });
    reportEl.replaceChildren(...sections);

    if (focusAfterRender) {
      const { id, selector } = focusAfterRender;
      const target = root.querySelector(`[data-mod="${id}"] ${selector}`);
      (target && !target.disabled ? target : root.querySelector(`#mod-${id}`))?.focus();
      focusAfterRender = null;
    }
    return result;
  }

  return { render, state, stackCheck };
}
