// Tooltips (graphics overhaul G1, docs/OVERHAUL.md section 3): one shared
// floating card with a title, lines (each with an optional icon) and a key
// hint. They appear after the delay chosen in Settings when the mouse rests on
// something, at once when it gets keyboard focus, and on a long press on touch.
// Never hover-only: whatever a tooltip explains is also one click away.
//
//   attachTooltip(element, () => ({ title, lines: [{ icon, text }], key }))
//
// The content is built when the tooltip opens, so it is always current.

import { icon } from './icons.js';

const DELAYS = { instant: 0, short: 400, long: 900 };
let mode = 'short';
let tip = null;
let timer = null;
let current = null;

/** Settings: instant, short, long or off. */
export function setTooltipDelay(value) {
  mode = Object.hasOwn(DELAYS, value) || value === 'off' ? value : 'short';
  if (mode === 'off') hideTooltip();
}

function ensure(doc) {
  if (tip && tip.ownerDocument === doc && tip.isConnected) return tip;
  tip = doc.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'atlas-tooltip';
  tip.hidden = true;
  doc.body.append(tip);
  return tip;
}

function render(doc, content) {
  const t = ensure(doc);
  const parts = [];
  if (content.title) { const h = doc.createElement('div'); h.className = 'tooltip-title'; h.textContent = content.title; parts.push(h); }
  for (const line of content.lines ?? []) {
    const row = doc.createElement('div');
    row.className = `tooltip-line${line.total ? ' total' : ''}${line.muted ? ' muted' : ''}`;
    if (line.icon) row.append(icon(doc, line.icon, { size: 16 }));
    const span = doc.createElement('span');
    span.textContent = line.text;
    row.append(span);
    if (line.value !== undefined) { const v = doc.createElement('span'); v.className = 'tooltip-value'; v.textContent = line.value; row.append(v); }
    parts.push(row);
  }
  if (content.key) { const k = doc.createElement('div'); k.className = 'tooltip-key'; k.textContent = content.key; parts.push(k); }
  t.replaceChildren(...parts);
  return t;
}

function place(t, target) {
  const win = target.ownerDocument.defaultView;
  const r = target.getBoundingClientRect();
  t.hidden = false;
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), win.innerWidth - w - 8);
  let y = r.bottom + 8;
  if (y + h > win.innerHeight - 8) y = Math.max(8, r.top - h - 8);
  t.style.left = `${Math.round(x)}px`;
  t.style.top = `${Math.round(y)}px`;
}

/** Show a tooltip for `target` now. */
export function showTooltip(target, content) {
  if (mode === 'off' || !content) return;
  const t = render(target.ownerDocument, content);
  current = target;
  target.setAttribute('aria-describedby', t.id);
  place(t, target);
}

export function hideTooltip() {
  clearTimeout(timer);
  timer = null;
  if (tip) tip.hidden = true;
  if (current) current.removeAttribute('aria-describedby');
  current = null;
}

/** Give an element a tooltip. contentFn() returns { title, lines, key } (or null for none). */
export function attachTooltip(target, contentFn) {
  const win = target.ownerDocument.defaultView;
  let press = null;
  const later = (ms) => {
    clearTimeout(timer);
    timer = win.setTimeout(() => showTooltip(target, contentFn()), ms);
  };
  target.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || mode === 'off') return;
    later(DELAYS[mode] ?? 400);
  });
  target.addEventListener('pointerleave', () => { if (current === target || timer) hideTooltip(); });
  target.addEventListener('focus', () => { if (mode !== 'off') showTooltip(target, contentFn()); });
  target.addEventListener('blur', () => { if (current === target) hideTooltip(); });
  // Touch: a long press shows it; lifting the finger after a long press does not also click.
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { hideTooltip(); return; }
    press = { long: false };
    clearTimeout(timer);
    timer = win.setTimeout(() => { press.long = true; showTooltip(target, contentFn()); }, 500);
  });
  target.addEventListener('pointerup', () => { if (press && !press.long) clearTimeout(timer); });
  target.addEventListener('click', (e) => {
    if (press?.long) { e.preventDefault(); e.stopImmediatePropagation(); }
    press = null;
  }, true);
  target.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTooltip(); });
}
