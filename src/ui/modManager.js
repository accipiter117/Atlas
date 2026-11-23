// The Mods screen (phase 2: read-only). Lists every mod in rules/index.json,
// lets you tick them and change their order with buttons, and shows the
// loader's report grouped into errors, warnings and info. Nothing here is
// saved yet; the setup screen in phase 9 uses the same pieces to start games.

import { loadRuleset } from '../data/loader.js';
import { groupReport } from '../data/report.js';
import { t } from '../data/text.js';
import { ENGINE_VERSION } from '../sim/index.js';

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
  };
  let focusAfterRender = null;

  const listEl = root.querySelector('[data-field="mod-list"]');
  const reportEl = root.querySelector('[data-field="report"]');
  const statusEl = root.querySelector('[data-field="status"]');
  const hashEl = root.querySelector('[data-field="hash"]');

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
    return el(doc, 'li', { class: `mod-row${state.ticked.has(id) ? ' on' : ''}`, dataset: { mod: id } },
      el(doc, 'label', { class: 'mod-tick', for: `mod-${id}` },
        checkbox,
        el(doc, 'span', { class: 'mod-text' },
          el(doc, 'span', { class: 'mod-name' }, name, el(doc, 'span', { class: 'chip' }, kind), el(doc, 'span', { class: 'version' }, m.version)),
          m.description ? el(doc, 'span', { class: 'mod-desc' }, m.description) : null)),
      el(doc, 'span', { class: 'mod-order' }, up, down));
  }

  function render() {
    listEl.replaceChildren(...state.order.map((id, i) => row(id, i)));
    const selection = state.order.filter((id) => state.ticked.has(id));
    const result = loadRuleset({ available, selection, engineVersion: ENGINE_VERSION });
    const groups = groupReport(text, result.report);

    statusEl.className = `mods-status ${result.ok ? 'ok' : 'blocked'}`;
    statusEl.textContent = result.ok
      ? t(text, 'mods.ready', { n: result.order.length, hash: result.hash })
      : t(text, 'mods.blocked', { n: result.report.errors });
    hashEl.textContent = result.hash;

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

  return { render, state };
}
