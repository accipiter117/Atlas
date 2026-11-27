// The in-game menu: save to a named slot, export a code (copy or download),
// see victory progress, or go back to the title screen. Saving itself is done
// by the caller (app.js owns the browser storage); this only draws and asks.

import { t } from '../data/text.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/** A box holding an export code, with Copy and Download buttons. */
export function codeBox(doc, text, code, fileName) {
  const tt = (k, a) => t(text, k, a);
  const area = el(doc, 'textarea', { class: 'code-box', readonly: 'readonly', rows: '4', 'aria-label': tt('menu.code'), dataset: { field: 'export-code' } });
  area.value = code;
  const status = el(doc, 'span', { class: 'small muted', role: 'status' });
  return el(doc, 'div', { class: 'code-wrap' }, area,
    el(doc, 'div', { class: 'end-actions' },
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'copy-code' }, onclick: () => {
        area.select();
        const done = () => { status.textContent = tt('menu.copied'); };
        doc.defaultView.navigator.clipboard?.writeText(code).then(done, () => { doc.execCommand?.('copy'); done(); }) ?? done();
      } }, tt('menu.copy')),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'download-code' }, onclick: () => {
        const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
        const a = el(doc, 'a', { href: url, download: fileName });
        doc.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }, tt('menu.download')),
      status));
}

/**
 * The in-game menu (graphics overhaul G7, docs/OVERHAUL.md 5.1): Resume, Save, Load,
 * Settings, Help and Exit to title. Save opens a small dialog in place with the save's
 * name, Save, and "Share as code".
 */
export function renderGameMenu(doc, host, { text, label, onSave, onExport, onLoad, onSettings, onHelp, onTitle, onClose }) {
  const tt = (k, a) => t(text, k, a);
  const name = el(doc, 'input', { type: 'text', name: 'saveName', maxlength: '60', value: label, 'aria-label': tt('menu.saveName') });
  const out = el(doc, 'div', { dataset: { field: 'menu-out' }, 'aria-live': 'polite' });
  const dialog = el(doc, 'section', { class: 'save-dialog', dataset: { field: 'save-dialog' }, hidden: 'hidden' },
    el(doc, 'h3', {}, tt('menu.saveTitle')),
    el(doc, 'label', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, tt('menu.saveName')), name),
    el(doc, 'div', { class: 'end-actions' },
      el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'save-game' }, onclick: () => onSave(name.value.trim() || label, out) }, tt('menu.save')),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'export-game' }, onclick: () => onExport(out) }, tt('menu.share'))),
    el(doc, 'p', { class: 'small muted' }, tt('menu.autosaveNote')),
    out);
  const item = (action, label2, onclick, primary = false) => el(doc, 'button', { type: 'button', class: `btn${primary ? ' primary' : ''}`, dataset: { action }, onclick }, label2);
  host.replaceChildren(
    el(doc, 'div', { class: 'tree-head' }, el(doc, 'h2', {}, tt('menu.title')), el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-menu' }, onclick: onClose }, tt('tree.close'))),
    el(doc, 'div', { class: 'menu-body game-menu' },
      el(doc, 'div', { class: 'menu-list' },
        item('resume', tt('menu.resume'), onClose, true),
        item('open-save', tt('menu.saveGame'), () => { dialog.hidden = false; name.focus({ preventScroll: true }); }),
        item('open-load', tt('menu.load'), onLoad),
        item('open-settings', tt('menu.settings'), onSettings),
        item('open-help', tt('menu.help'), onHelp),
        item('to-title', tt('menu.toTitle'), onTitle)),
      dialog));
  host.querySelector('[data-action="resume"]').focus({ preventScroll: true });
}
