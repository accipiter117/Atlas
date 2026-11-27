// The tactical battle screen (phase 18). mount(spec, host) draws the battle
// into host.element and calls host.finish(result) when it is over.
//
// host: { element, finish(result), t(key, args), colours: { attacker, defender },
//         names: { attacker, defender }, oddsText, unitName(type), playerSide }
//
// You command your side's bands; the computer commands the rest. Give orders
// (Advance, Charge, Hold, or tap the field to march there), then Begin. The
// battle runs in steps of a tenth of a second at the speed you choose; you can
// pause, withdraw (the fight ends and both sides keep what health is left), or
// let the computer finish it for you. Every order is recorded with the step it
// was given on, so the battle can be replayed exactly.

import { createRng } from '../../../core/rng.js';
import { createBattle, stepBattle, giveOrder, playOut, battleResult, fighters } from '../sim/battle.js';
import { drawGround, drawBattle } from '../render/draw.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export function mountBattle(spec, host) {
  const doc = host.element.ownerDocument;
  const win = doc.defaultView;
  const tt = host.t;
  const side = host.playerSide ?? 'attacker';
  const rng = createRng(spec.seed);
  const b = createBattle(spec, rng.next, { playerSide: side });
  const hpPerMan = b.t.hpPerMan;
  const ground = drawGround(doc, b.field);
  let selected = b.bands.find((x) => x.side === side && !x.garrison)?.id ?? null;
  let speed = 1;
  let running = false;
  let started = false;
  let last = null;
  let carry = 0;
  let raf = null;
  let done = false;

  const canvas = el(doc, 'canvas', { class: 'tactical-field', width: String(b.field.width), height: String(b.field.height), 'aria-label': tt('tactical.fieldLabel'), tabindex: '0', dataset: { field: 'tactical-canvas' } });
  const g = canvas.getContext('2d');
  const status = el(doc, 'p', { class: 'tactical-status', 'aria-live': 'polite', dataset: { field: 'tactical-status' } });
  const card = el(doc, 'div', { class: 'tactical-card', dataset: { field: 'tactical-card' } });
  const controls = el(doc, 'div', { class: 'tactical-controls' });
  const endPanel = el(doc, 'div', { class: 'tactical-end', hidden: true, dataset: { field: 'tactical-end' } });

  const ground0 = spec.ground?.centre ?? {};
  const chips = [
    ground0.hills ? tt('tactical.chip.hills') : null,
    ['forest', 'jungle'].includes(ground0.feature) ? tt('tactical.chip.woods') : null,
    spec.ground?.riverCrossing ? tt('tactical.chip.river') : null,
    spec.defender.city ? tt('tactical.chip.walls') : null,
  ].filter(Boolean);
  const head = el(doc, 'div', { class: 'tactical-head' },
    el(doc, 'h2', {}, tt('tactical.title', { attacker: host.names.attacker, defender: host.names.defender })),
    el(doc, 'p', { class: 'small' }, host.oddsText ?? ''),
    chips.length ? el(doc, 'p', { class: 'tactical-chips' }, ...chips.map((c) => el(doc, 'span', { class: 'chip' }, c))) : null);

  const button = (label, action, onclick, extra = '') => el(doc, 'button', { type: 'button', class: `btn small${extra}`, dataset: { tactical: action }, onclick }, label);
  const order = (type) => () => { if (selected) giveOrder(b, { band: selected, type }); render(); };
  const begin = button(tt('tactical.begin'), 'begin', () => { started = true; setRunning(true); }, ' primary');
  const pause = button(tt('tactical.pause'), 'pause', () => setRunning(!running));
  const speeds = [1, 2, 4].map((n) => button(`${n}x`, `speed-${n}`, () => { speed = n; render(); }));
  controls.append(
    el(doc, 'div', { class: 'tactical-row' }, begin, pause, ...speeds),
    el(doc, 'div', { class: 'tactical-row' },
      button(tt('tactical.withdraw'), 'withdraw', () => { if (!started) started = true; giveOrder(b, { type: 'withdraw', side }); stepBattle(b); finishIfOver(); }),
      button(tt('tactical.finish'), 'finish', () => { started = true; playOut(b); finishIfOver(); })));

  host.element.replaceChildren(el(doc, 'div', { class: 'tactical' }, head, el(doc, 'div', { class: 'tactical-body' }, el(doc, 'div', { class: 'tactical-canvas-wrap' }, canvas), el(doc, 'div', { class: 'tactical-side' }, card, controls, status, endPanel))));

  function setRunning(on) {
    running = on && !b.over;
    last = null;
    if (running && raf === null) raf = win.requestAnimationFrame(frame);
    render();
  }

  function bandName(band) {
    return host.unitName?.(band.type) ?? band.type;
  }

  function renderCard() {
    const band = b.bands.find((x) => x.id === selected);
    if (!band) { card.replaceChildren(el(doc, 'p', { class: 'small muted' }, tt('tactical.noBand'))); return; }
    const men = band.alive ? Math.max(1, Math.ceil(band.hp / hpPerMan)) : 0;
    card.replaceChildren(
      el(doc, 'h3', {}, bandName(band)),
      el(doc, 'p', { class: 'small' }, tt('tactical.men', { men, hp: Math.max(0, Math.round(band.hp)) })),
      el(doc, 'p', { class: 'small muted', dataset: { field: 'tactical-order' } }, tt(`tactical.order.${band.order.type}`, { bonus: b.t.chargeBonus })),
      el(doc, 'div', { class: 'tactical-row' },
        button(tt('tactical.advance'), 'advance', order('advance')),
        button(tt('tactical.charge'), 'charge', order('charge')),
        button(tt('tactical.hold'), 'hold', order('hold'))),
      el(doc, 'p', { class: 'small muted' }, tt('tactical.tapToMove', { bonus: b.t.flankBonus })));
  }

  function render() {
    drawBattle(g, b, { colours: host.colours, selected, ground, hpPerMan, sprite: host.sprite ?? null, now: win.performance.now() });
    renderCard();
    // Buttons hide with display, since the button style outranks the hidden attribute.
    begin.style.display = started ? 'none' : '';
    pause.style.display = !started || b.over ? 'none' : '';
    pause.textContent = running ? tt('tactical.pause') : tt('tactical.resume');
    for (const s of speeds) s.classList.toggle('primary', s.dataset.tactical === `speed-${speed}`);
    const mine = fighters(b, side).reduce((n, x) => n + Math.max(0, x.hp), 0);
    const theirs = fighters(b, side === 'attacker' ? 'defender' : 'attacker').reduce((n, x) => n + Math.max(0, x.hp), 0);
    status.textContent = b.over ? '' : !started ? tt('tactical.ready') : tt('tactical.clash', { seconds: Math.round(b.time), mine: Math.round(mine), theirs: Math.round(theirs), left: Math.max(0, Math.ceil(b.t.clashSeconds - b.clash)) });
  }

  function frame(now) {
    raf = null;
    if (!running || done) return;
    if (last !== null) carry += Math.min(0.25, (now - last) / 1000) * speed;
    last = now;
    while (carry >= b.t.tick && !b.over) { stepBattle(b); carry -= b.t.tick; }
    render();
    if (finishIfOver()) return;
    raf = win.requestAnimationFrame(frame);
  }

  function finishIfOver() {
    if (!b.over || done) { render(); return false; }
    done = true;
    running = false;
    const result = battleResult(b);
    render();
    controls.style.display = 'none';
    const mine = result.winner === side;
    const line = result.winner === 'none' ? tt('tactical.end.none') : mine ? tt('tactical.end.won') : tt('tactical.end.lost');
    endPanel.replaceChildren(
      el(doc, 'h3', { dataset: { field: 'tactical-outcome' } }, line),
      el(doc, 'p', { class: 'small' }, tt(`tactical.reason.${b.endReason}`)),
      el(doc, 'ul', { class: 'small' }, ...result.units.map((u) => {
        const band = b.bands.find((x) => x.ref === u.ref);
        return el(doc, 'li', {}, tt(u.alive ? 'tactical.survivor' : 'tactical.fallen', { name: bandName(band), side: host.names[band.side], hp: u.hp }));
      }), result.city ? el(doc, 'li', {}, tt('tactical.walls', { hp: result.city.hp })) : null),
      el(doc, 'button', { type: 'button', class: 'btn primary', dataset: { tactical: 'continue' }, onclick: () => host.finish(result) }, tt('tactical.continue')));
    endPanel.hidden = false;
    endPanel.querySelector('button')?.focus();
    return true;
  }

  // Tap or click: your band selects it; anywhere else marches the selected band there.
  canvas.addEventListener('click', (e) => {
    if (done) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * b.field.width;
    const y = ((e.clientY - r.top) / r.height) * b.field.height;
    const hit = b.bands.find((band) => band.side === side && band.alive && !band.garrison && Math.abs(band.x - x) < band.width / 2 + 10 && Math.abs(band.y - y) < band.depth / 2 + 12);
    if (hit) selected = hit.id;
    else if (selected) giveOrder(b, { band: selected, type: 'move', x, y });
    render();
  });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!started) { started = true; setRunning(true); } else setRunning(!running); }
    else if (k === 'a') order('advance')();
    else if (k === 'c') order('charge')();
    else if (k === 'h') order('hold')();
  });

  render();
  canvas.focus({ preventScroll: true });
  return {
    battle: b,
    destroy() { done = true; running = false; if (raf !== null) win.cancelAnimationFrame(raf); },
  };
}
