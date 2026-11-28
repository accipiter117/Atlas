// The Killzone platoon battle screen (phase 19). mount(spec, host) runs the
// Killzone battle sim with you commanding your side's platoons and the
// Killzone AI the other, then hands the Atlas result to host.finish.
//
// host: as for the tactical module (element, finish, t, colours, names,
// unitName, oddsText, playerSide).
//
// Orders cost order points, which refill over time (the Killzone rules): tap
// one of your platoons in the list, then tap the map to march it there, or
// send it to take the nearest objective, hold, or fall back. Battles run in
// real time at the speed you choose; "Finish automatically" hands your side
// to the computer and plays to the end.

import { createRng } from '../../../core/rng.js';
import { createMatch, issue, advance, runToEnd } from '../sim/vendor/match.js';
import { createAI } from '../sim/vendor/ai.js';
import { matchOptions, forcesFor, seedFrom, toResult } from '../sim/adapter.js';
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

/** K6: the war works this battle is fought over, by name: on the hex, and support beside it. */
export function worksLine(spec, workName = (id) => id) {
  const on = spec.ground?.centre?.work ? [workName(spec.ground.centre.work.id)] : [];
  const beside = [...new Set((spec.ground?.ring ?? []).filter((r) => r.work).map((r) => workName(r.work.id)))];
  return { on, beside };
}

export function mountKillzone(spec, host) {
  const doc = host.element.ownerDocument;
  const win = doc.defaultView;
  const tt = host.t;
  const seed = seedFrom(createRng(spec.seed).next);
  const { aSide } = forcesFor(spec);
  const side = aSide;
  const match = createMatch({ seed, options: matchOptions(spec), controllers: [createAI(1 - side)] });
  const state = match.state;
  const map = state.map;
  const scale = Math.min(1, 960 / map.width);
  const ground = drawGround(doc, map, scale);
  const colours = side === 0 ? [host.colours.attacker, host.colours.defender] : [host.colours.defender, host.colours.attacker];
  const mine = () => state.platoons.filter((p) => p.side === side && !p.reserve);
  let selected = mine()[0]?.id ?? null;
  let speed = 1;
  let running = false;
  let started = false;
  let last = null;
  let carry = 0;
  let raf = null;
  let done = false;

  const groundLine = () => {
    const { on, beside } = worksLine(spec, host.workName);
    if (!on.length && !beside.length && !spec.ground?.worldKind) return null;
    const parts = [];
    if (spec.ground?.worldKind === 'station') parts.push(tt('killzone.station'));
    if (on.length) parts.push(tt('killzone.worksOn', { list: on.join(', ') }));
    if (beside.length) parts.push(tt('killzone.worksBeside', { list: beside.join(', ') }));
    return parts.length ? el(doc, 'p', { class: 'small', dataset: { field: 'kz-ground' } }, parts.join(' ')) : null;
  };
  const canvas = el(doc, 'canvas', { class: 'tactical-field', width: String(ground.width), height: String(ground.height), 'aria-label': tt('killzone.fieldLabel'), tabindex: '0', dataset: { field: 'kz-canvas' } });
  const g = canvas.getContext('2d');
  const list = el(doc, 'div', { class: 'tactical-card', dataset: { field: 'kz-platoons' } });
  const status = el(doc, 'p', { class: 'tactical-status', 'aria-live': 'polite', dataset: { field: 'kz-status' } });
  const endPanel = el(doc, 'div', { class: 'tactical-end', hidden: true, dataset: { field: 'kz-end' } });
  const button = (label, action, onclick, extra = '') => el(doc, 'button', { type: 'button', class: `btn small${extra}`, dataset: { kz: action }, onclick }, label);
  const say = (res) => { if (res && !res.ok) status.textContent = res.reason ?? tt('killzone.refused'); };
  const order = (type, params = {}) => { if (selected === null) return; say(issue(match, side, type, { platoon: selected, ...params })); render(); };
  const takeNearest = () => {
    const pl = state.platoons[selected];
    if (!pl) return;
    const members = pl.squads.flatMap((id) => state.squads[id].soldiers).map((id) => state.soldiers[id]).filter((s) => s.alive);
    if (!members.length) return;
    const cx = members.reduce((n, s) => n + s.x, 0) / members.length;
    const cy = members.reduce((n, s) => n + s.y, 0) / members.length;
    const targets = state.sites.filter((s) => (s.kind === 'objective' || s.kind === 'hq') && s.owner !== side).sort((a, b) => ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
    if (targets[0]) order('take', { site: targets[0].id }); else status.textContent = tt('killzone.allHeld');
  };
  const begin = button(tt('tactical.begin'), 'begin', () => { started = true; setRunning(true); }, ' primary');
  const pause = button(tt('tactical.pause'), 'pause', () => setRunning(!running));
  const speeds = [1, 2, 4, 8].map((n) => button(`${n}x`, `speed-${n}`, () => { speed = n; render(); }));
  const controls = el(doc, 'div', { class: 'tactical-controls' },
    el(doc, 'div', { class: 'tactical-row' }, begin, pause, ...speeds),
    el(doc, 'div', { class: 'tactical-row' }, button(tt('tactical.finish'), 'finish', () => {
      started = true;
      match.controllers.push(createAI(side));
      runToEnd(match);
      finishIfOver();
    })));

  host.element.replaceChildren(el(doc, 'div', { class: 'tactical' },
    el(doc, 'div', { class: 'tactical-head' }, el(doc, 'h2', {}, tt('tactical.title', { attacker: host.names.attacker, defender: host.names.defender })), el(doc, 'p', { class: 'small' }, tt('killzone.intro')), groundLine(), el(doc, 'p', { class: 'small muted' }, host.oddsText ?? '')),
    el(doc, 'div', { class: 'tactical-body' }, el(doc, 'div', { class: 'tactical-canvas-wrap' }, canvas), el(doc, 'div', { class: 'tactical-side' }, list, controls, status, endPanel))));

  function setRunning(on) {
    running = on && !state.result;
    last = null;
    if (running && raf === null) raf = win.requestAnimationFrame(frame);
    render();
  }

  function renderList() {
    const op = Math.floor(state.sides[side].op);
    list.replaceChildren(
      el(doc, 'h3', {}, tt('killzone.platoons')),
      el(doc, 'p', { class: 'small', dataset: { field: 'kz-op' } }, tt('killzone.orderPoints', { n: op })),
      ...mine().map((pl) => {
        const alive = pl.squads.reduce((n, id) => n + state.squads[id].soldiers.filter((sid) => state.soldiers[sid].alive).length, 0);
        return el(doc, 'button', { type: 'button', class: `card-option${pl.id === selected ? ' current' : ''}`, dataset: { kzPlatoon: String(pl.id) }, onclick: () => { selected = pl.id; render(); } },
          el(doc, 'strong', {}, host.unitName?.(pl.name) ?? pl.name),
          el(doc, 'span', { class: 'small' }, pl.broken ? tt('killzone.broken') : tt('killzone.soldiers', { n: alive })));
      }),
      el(doc, 'div', { class: 'tactical-row' },
        button(tt('killzone.take'), 'take', takeNearest),
        button(tt('tactical.hold'), 'hold', () => order('hold')),
        button(tt('killzone.fallback'), 'fallback', () => order('fallback'))),
      el(doc, 'p', { class: 'small muted' }, tt('killzone.tapToMove')));
  }

  function render() {
    drawBattle(g, state, { ground, scale, colours, selected, playerSide: side });
    renderList();
    begin.style.display = started ? 'none' : '';
    pause.style.display = !started || state.result ? 'none' : '';
    pause.textContent = running ? tt('tactical.pause') : tt('tactical.resume');
    for (const s of speeds) s.classList.toggle('primary', s.dataset.kz === `speed-${speed}`);
    if (state.result) status.textContent = '';
    else if (started) status.textContent = tt('killzone.clock', { seconds: Math.floor(state.tick / state.cfg.tickRate), total: state.cfg.battle.durationSec, mine: state.sides[side].score | 0, theirs: state.sides[1 - side].score | 0 });
    else if (!started) status.textContent = tt('tactical.ready');
  }

  function frame(now) {
    raf = null;
    if (!running || done) return;
    if (last !== null) carry += Math.min(0.25, (now - last) / 1000) * speed * state.cfg.tickRate;
    last = now;
    while (carry >= 1 && !state.result) { advance(match); carry -= 1; }
    render();
    if (finishIfOver()) return;
    raf = win.requestAnimationFrame(frame);
  }

  function finishIfOver() {
    if (!state.result || done) { render(); return false; }
    done = true;
    running = false;
    const result = toResult(spec, state.result, { seed, commands: match.log.commands.length });
    render();
    controls.style.display = 'none';
    const won = result.winner === 'attacker';
    endPanel.replaceChildren(
      el(doc, 'h3', { dataset: { field: 'kz-outcome' } }, result.winner === 'none' ? tt('tactical.end.none') : won ? tt('tactical.end.won') : tt('tactical.end.lost')),
      el(doc, 'p', { class: 'small' }, tt(`killzone.reason.${state.result.reason}`, { margin: tt(`killzone.margin.${state.result.margin}`) })),
      el(doc, 'ul', { class: 'small' }, ...result.units.map((u) => {
        const fromAttacker = spec.attacker.units.some((x) => x.ref === u.ref);
        const unit = (fromAttacker ? spec.attacker.units : spec.defender.units).find((x) => x.ref === u.ref);
        return el(doc, 'li', {}, tt(u.alive ? 'tactical.survivor' : 'tactical.fallen', { name: host.unitName?.(unit.type) ?? unit.type, side: fromAttacker ? host.names.attacker : host.names.defender, hp: u.hp }));
      }), result.city ? el(doc, 'li', {}, tt('tactical.walls', { hp: result.city.hp })) : null),
      el(doc, 'button', { type: 'button', class: 'btn primary', dataset: { kz: 'continue' }, onclick: () => host.finish(result) }, tt('tactical.continue')));
    endPanel.hidden = false;
    endPanel.querySelector('button')?.focus();
    return true;
  }

  canvas.addEventListener('click', (e) => {
    if (done || selected === null) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * map.width;
    const y = ((e.clientY - r.top) / r.height) * map.height;
    order('move', { x, y });
  });

  render();
  return {
    match,
    destroy() { done = true; running = false; if (raf !== null) win.cancelAnimationFrame(raf); },
  };
}
