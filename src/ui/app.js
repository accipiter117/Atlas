// The title screen, the Mods screen and the phase 1 test bench.
//
// Words on fixed screens live in index.html markup; words built on the fly
// (the mod report, button labels for screen readers) come from
// text/engine.en-GB.json, so this file holds no player-facing sentences.

import { createGame, applyCommand, currentFactionId, getFaction, fingerprint } from '../sim/index.js';
import { createModManager } from './modManager.js';

let toastTimer = 0;

function toast(doc, message) {
  const el = doc.querySelector('[data-toast]');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function show(doc, id) {
  for (const screen of doc.querySelectorAll('.screen')) screen.hidden = screen.id !== id;
  const first = doc.querySelector(`#${id} .btn:not(:disabled)`);
  first?.focus({ preventScroll: true });
}

/** A fresh random seed from the browser. Only the seed is random; the game itself is fully seeded. */
function newSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1_000_000_000;
}

function renderBench(doc, state) {
  const bench = doc.getElementById('bench');
  bench.querySelector('[data-field="turn"]').textContent = String(state.turn);
  bench.querySelector('[data-field="seed"]').textContent = String(state.setup.seed);
  bench.querySelector('[data-field="fingerprint"]').textContent = fingerprint(state);
  const list = bench.querySelector('[data-field="seats"]');
  list.replaceChildren(...state.seatOrder.map((id) => {
    const f = getFaction(state, id);
    const li = doc.createElement('li');
    const name = doc.createElement('span');
    name.textContent = f.name;
    const kind = doc.createElement('span');
    kind.className = 'kind';
    kind.textContent = f.kind === 'human' ? bench.dataset.human : bench.dataset.ai;
    li.append(name, kind);
    li.setAttribute('aria-current', String(id === currentFactionId(state)));
    return li;
  }));
}

/** Until the AI exists (phase 8), computer seats simply end their turn. */
function passComputerSeats(state) {
  let s = state;
  while (getFaction(s, currentFactionId(s)).kind === 'ai') {
    s = applyCommand(s, { type: 'endTurn', faction: currentFactionId(s) }).state;
  }
  return s;
}

export function startApp(doc, { loadModSources } = {}) {
  const bench = doc.getElementById('bench');
  const modsScreen = doc.getElementById('mods');
  let state = null;
  let modManager = null;

  const actions = {
    new() {
      state = createGame({}, {
        seed: newSeed(),
        players: [
          { kind: 'human', name: bench.dataset.you },
          ...[1, 2, 3].map((n) => ({ kind: 'ai', name: `${bench.dataset.rival} ${n}` })),
        ],
      });
      state = passComputerSeats(state);
      renderBench(doc, state);
      show(doc, 'bench');
    },
    'end-turn'() {
      if (!state) return;
      const result = applyCommand(state, { type: 'endTurn', faction: currentFactionId(state) });
      if (!result.ok) { toast(doc, result.error.message); return; }
      state = passComputerSeats(result.state);
      renderBench(doc, state);
      toast(doc, bench.dataset.aiPass);
    },
    async mods() {
      show(doc, 'mods');
      if (!modManager) {
        try {
          modManager = createModManager(doc, modsScreen, await loadModSources());
        } catch (e) {
          modsScreen.querySelector('[data-field="status"]').textContent = String(e.message ?? e);
          return;
        }
      }
      modManager.render();
    },
    back() { show(doc, 'title'); },
  };

  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.say) { toast(doc, btn.dataset.say); return; }
    actions[btn.dataset.action]?.();
  });

  // Keyboard extras: arrow keys move through a menu, Escape goes back, Enter ends the turn.
  doc.addEventListener('keydown', (e) => {
    const menu = e.target.closest?.('[data-menu]');
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const buttons = [...menu.querySelectorAll('.btn:not(:disabled)')];
      const i = buttons.indexOf(e.target);
      const next = buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      e.preventDefault();
    } else if ((!bench.hidden || !modsScreen.hidden) && e.key === 'Escape') {
      actions.back();
    } else if (!bench.hidden && e.key === 'Enter' && !e.target.closest?.('button')) {
      actions['end-turn']();
    }
  });

  show(doc, 'title');
}
