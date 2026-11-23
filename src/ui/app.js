// The title screen, the Mods screen and starting a game.
//
// Words on fixed screens live in index.html markup; words built on the fly
// (the mod report, button labels for screen readers) come from
// text/engine.en-GB.json, so this file holds no player-facing sentences.

import { ENGINE_VERSION } from '../sim/index.js';
import { loadRuleset } from '../data/loader.js';
import { createGameScreen } from './game.js';
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

export function startApp(doc, { loadModSources, loadSheets } = {}) {
  const modsScreen = doc.getElementById('mods');
  const gameScreen = doc.getElementById('game');
  let modManager = null;
  let game = null;
  let sourcesPromise = null;
  const sources = () => { sourcesPromise ??= loadModSources(); return sourcesPromise; };

  const actions = {
    async new() {
      const src = await sources();
      const { ruleset, ok, report } = loadRuleset({ available: src.available, selection: ['base-ancient'], engineVersion: ENGINE_VERSION });
      if (!ok) { toast(doc, `${report.errors} errors in the rules`); return; }
      const sheets = await loadSheets(ruleset.skin.art);
      game?.destroy();
      show(doc, 'game');
      const params = new URLSearchParams(doc.defaultView.location.search);
      const seed = params.has('seed') ? Number.parseInt(params.get('seed'), 10) || 0 : newSeed();
      game = createGameScreen(doc, gameScreen, { ruleset, text: { ...src.engineText, ...ruleset.text }, sheets, seed, toast: (m) => toast(doc, m) });
      gameScreen.querySelector('#game-map').focus({ preventScroll: true });
    },
    async mods() {
      show(doc, 'mods');
      if (!modManager) {
        try {
          modManager = createModManager(doc, modsScreen, await sources());
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

  // Keyboard extras: arrow keys move through a menu, Escape leaves the Mods screen.
  doc.addEventListener('keydown', (e) => {
    const menu = e.target.closest?.('[data-menu]');
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const buttons = [...menu.querySelectorAll('.btn:not(:disabled)')];
      const i = buttons.indexOf(e.target);
      const next = buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      e.preventDefault();
    } else if (!modsScreen.hidden && e.key === 'Escape') {
      actions.back();
    }
  });

  show(doc, 'title');
}
