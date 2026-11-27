// The title screen and everything around a game: setup, the faction cards,
// Continue, Load, Import code, Mods and Settings, plus saving (this file owns
// the browser's storage; the game screen only asks).
//
// Words on fixed screens live in index.html markup; words built on the fly
// come from text/engine.en-GB.json, so this file holds no player-facing sentences.

import { ENGINE_VERSION } from '../sim/index.js';
import { loadRuleset } from '../data/loader.js';
import { t } from '../data/text.js';
// The game screen (and the map renderer under it) loads when a game starts, not with the
// title screen, keeping the first page load small (graphics overhaul: docs/OVERHAUL.md 7).
let gameModule = null;
const loadGameScreen = () => (gameModule ??= import('./game.js'));
import { showFactionPicker } from './factionCards.js';
import { createModManager } from './modManager.js';
import { renderSetup, defaultSetup, toSetup, selectionOf, optionsOf } from './setup.js';
import { codeBox } from './gameMenu.js';
import { setTooltipDelay } from './hud/tooltip.js';
import { createAudio } from '../render/audio/index.js';
import {
  createSave, saveToSlot, autosave, listSaves, latestSave, loadSave, deleteSave, exportCode, importCode, memoryStorage, modCheck, SaveTooBigError,
} from '../save/save.js';

let toastTimer = 0;

/** Short messages. Several at once (a farm built and the boost it earned) stack, newest last, up to four. */
function toast(doc, message) {
  const el = doc.querySelector('[data-toast]');
  const line = doc.createElement('div');
  line.textContent = message;
  if (el.classList.contains('show')) {
    el.append(line);
    while (el.childElementCount > 4) el.firstElementChild.remove();
  } else {
    el.replaceChildren(line);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600 + 900 * (el.childElementCount - 1));
}

/** Tokens a skin set on the page (skin.json "tokens"), cleared when you leave the game. */
let skinTokens = [];
function show(doc, id) {
  // A conversion's skin (its colour tokens in css/tokens.css) dresses the game screen only.
  if (id !== 'game') {
    delete doc.documentElement.dataset.skin;
    for (const k of skinTokens) doc.documentElement.style.removeProperty(`--${k}`);
    skinTokens = [];
  }
  for (const screen of doc.querySelectorAll('.screen')) screen.hidden = screen.id !== id;
  const first = doc.querySelector(`#${id} .btn:not(:disabled)`);
  first?.focus({ preventScroll: true });
  doc.defaultView.scrollTo?.(0, 0);
}

/** A fresh random seed from the browser. Only the seed is random; the game itself is fully seeded. */
function newSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1_000_000_000;
}

/** localStorage, or an in-memory stand-in if the browser blocks it (private windows). */
function browserStorage(win) {
  try {
    const s = win.localStorage;
    s.setItem('atlas:probe', '1');
    s.removeItem('atlas:probe');
    return s;
  } catch {
    return memoryStorage();
  }
}

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

export function startApp(doc, { loadModSources, loadSheets } = {}) {
  const win = doc.defaultView;
  const storage = browserStorage(win);
  const modsScreen = doc.getElementById('mods');
  const gameScreen = doc.getElementById('game');
  const params = new URLSearchParams(win.location.search);
  // Sounds (graphics overhaul G1): synthesised, silent until you first click or press a key.
  const audio = createAudio(win);
  let modManager = null;
  let game = null;
  let sourcesPromise = null;
  let setupCfg = null;      // the setup screen's choices, kept while it is open
  let returnTo = 'title';   // where the faction cards' back button goes
  let engineText = {};
  const sources = () => {
    sourcesPromise ??= loadModSources().then((s) => { engineText = s.engineText; return s; });
    return sourcesPromise;
  };
  const tt = (k, a) => t(engineText, k, a);
  const say = (m) => toast(doc, m);

  // ---------- Settings (atlas:settings) ----------
  const SETTINGS_DEFAULTS = { motion: 'device', developer: false, uiScale: '1', tooltipDelay: 'short', volumeMaster: '70', volumeEffects: '70', volumeMusic: '70', animSpeed: 'normal', rivalMoves: 'quick', combatCamera: true };
  function readSettings() {
    try { return { ...SETTINGS_DEFAULTS, ...JSON.parse(storage.getItem('atlas:settings') ?? '{}') }; } catch { return { ...SETTINGS_DEFAULTS }; }
  }
  function applySettings() {
    const s = readSettings();
    doc.documentElement.dataset.motion = s.motion;
    // Animation settings (graphics overhaul G6), read by the game screen when it plays events.
    doc.documentElement.dataset.animSpeed = s.animSpeed;
    doc.documentElement.dataset.rivalMoves = s.rivalMoves;
    doc.documentElement.dataset.combatCamera = s.combatCamera ? 'on' : 'off';
    // Interface size (graphics overhaul G1): one CSS variable scales every panel and screen.
    doc.documentElement.style.setProperty('--ui-scale', String(Number(s.uiScale) || 1));
    doc.documentElement.dataset.tooltips = s.tooltipDelay;
    setTooltipDelay(s.tooltipDelay);
    audio.setVolumes({ master: Number(s.volumeMaster) / 100, effects: Number(s.volumeEffects) / 100, music: Number(s.volumeMusic) / 100 });
    for (const n of doc.querySelectorAll('[data-dev-link]')) n.hidden = !s.developer;
    for (const input of doc.querySelectorAll('[data-setting]')) {
      const value = s[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = String(value);
    }
  }
  doc.querySelector('[data-action="test-sound"]')?.addEventListener('click', () => audio.play('techDone'));
  for (const input of doc.querySelectorAll('[data-setting]')) {
    input.addEventListener('change', () => {
      const s = readSettings();
      s[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
      try { storage.setItem('atlas:settings', JSON.stringify(s)); } catch { /* settings are a nicety */ }
      applySettings();
    });
  }

  // ---------- Rulesets ----------
  async function rulesFor(selection, options = {}) {
    const src = await sources();
    const result = loadRuleset({ available: src.available, selection, options, engineVersion: ENGINE_VERSION });
    if (!result.ok) return { error: tt('app.rulesErrors', { n: result.report.errors }) };
    return { ruleset: result.ruleset, text: { ...src.engineText, ...result.ruleset.text }, src };
  }
  async function versions() {
    const src = await sources();
    return Object.fromEntries(Object.entries(src.available).map(([id, m]) => { try { return [id, JSON.parse(m.manifest).version]; } catch { return [id, null]; } }));
  }

  // ---------- Saving (hooks the game screen calls) ----------
  function makeHooks() {
    return {
      async saveSlot(snap, label) {
        try {
          const save = createSave({ state: snap.state, log: snap.log, label, now: new Date().toISOString(), journal: snap.journal });
          await saveToSlot(storage, `s${Date.now().toString(36)}`, save);
          refreshTitle();
          return { ok: true };
        } catch (e) {
          return { ok: false, message: e instanceof SaveTooBigError ? tt('save.tooBig') : String(e.message ?? e) };
        }
      },
      async autosave(snap, label) {
        try {
          await autosave(storage, createSave({ state: snap.state, log: snap.log, label, now: new Date().toISOString(), journal: snap.journal }));
          refreshTitle();
        } catch (e) {
          say(e instanceof SaveTooBigError ? tt('save.autosaveTooBig') : tt('save.autosaveFailed'));
        }
      },
      exportCode(snap, label) {
        return exportCode(createSave({ state: snap.state, log: snap.log, label, now: new Date().toISOString() }));
      },
      quit() { game?.destroy(); game = null; refreshTitle(); show(doc, 'title'); },
      newGame() { game?.destroy(); game = null; refreshTitle(); actions.new(); },
    };
  }

  async function startGame({ setup = null, resume = null, selection = ['base-ancient'], options = {}, quick = null }) {
    const loaded = await rulesFor(selection, options);
    if (loaded.error) { say(loaded.error); return; }
    const [{ createGameScreen }, sheets] = await Promise.all([loadGameScreen(), loadSheets(loaded.ruleset.skin.art)]);
    game?.destroy();
    show(doc, 'game');
    if (loaded.ruleset.skin?.id && loaded.ruleset.skin.id !== 'ancient') doc.documentElement.dataset.skin = loaded.ruleset.skin.id;
    // A skin may restyle the overhaul's tokens (only tokens change, never layout).
    for (const [k, v] of Object.entries(loaded.ruleset.skin?.tokens ?? {})) {
      if (/^[a-z-]+$/.test(k) && typeof v === 'string') { doc.documentElement.style.setProperty(`--${k}`, v); skinTokens.push(k); }
    }
    audio.setOverrides(loaded.ruleset.skin?.sounds);
    game = createGameScreen(doc, gameScreen, {
      ruleset: loaded.ruleset, text: loaded.text, sheets, toast: say, sound: (id) => audio.play(id), setup, resume, debug: params.has('debug'), hooks: makeHooks(), ...(quick ?? {}),
    });
    gameScreen.querySelector('#game-map').focus({ preventScroll: true });
  }

  /** Open a save: check its mods, warn about changed ones, then carry on from the snapshot. */
  async function openSave(save) {
    const check = modCheck(save, await versions());
    if (check.missing.length) { say(tt('save.missingMods', { list: check.missing.join(', ') })); return false; }
    const selection = (save.setup?.mods ?? ['base-ancient']).map((m) => String(m).split('@')[0]);
    if (check.changed.length) say(tt('save.modsChanged', { list: check.changed.map((c) => tt('save.modChange', c)).join(', '), turn: save.snapshot.turn }));
    await startGame({ resume: { state: save.snapshot.state, log: save.log, journal: save.recorder?.journal ?? null }, selection, options: save.setup?.modOptions ?? {} });
    return true;
  }

  // ---------- Title, Load and Import ----------
  function refreshTitle() {
    const btn = doc.querySelector('[data-action="continue"]');
    const latest = latestSave(storage);
    btn.disabled = !latest;
    btn.title = latest ? latest.label : '';
  }

  function renderLoad() {
    const list = doc.querySelector('[data-field="save-list"]');
    const saves = listSaves(storage);
    if (!saves.length) { list.replaceChildren(el(doc, 'li', { class: 'muted' }, tt('load.none'))); return; }
    list.replaceChildren(...saves.map((entry) => el(doc, 'li', { class: 'save-item', dataset: { save: entry.id } },
      el(doc, 'div', { class: 'save-info' },
        el(doc, 'strong', {}, entry.label || entry.id),
        el(doc, 'span', { class: 'small muted' }, tt(entry.kind === 'autosave' ? 'load.autosave' : 'load.saved', { when: new Date(entry.savedAt).toLocaleString(), kb: Math.ceil((entry.bytes ?? 0) / 1000) }))),
      el(doc, 'div', { class: 'end-actions' },
        el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { loadSave: entry.id }, onclick: async () => { const s = await loadSave(storage, entry).catch(() => null); if (s) await openSave(s); else say(tt('load.broken')); } }, tt('load.load')),
        el(doc, 'button', { type: 'button', class: 'btn small', dataset: { exportSave: entry.id }, onclick: async (e) => {
          const s = await loadSave(storage, entry).catch(() => null);
          if (!s) return;
          const li = e.target.closest('li');
          li.querySelector('.code-wrap')?.remove();
          li.append(codeBox(doc, engineText, await exportCode(s), `atlas-turn-${entry.turn}.txt`));
        } }, tt('load.export')),
        el(doc, 'button', { type: 'button', class: 'btn small', dataset: { deleteSave: entry.id }, onclick: (e) => {
          const b = e.target.closest('button');
          if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = tt('load.reallyDelete'); return; }
          deleteSave(storage, entry);
          renderLoad();
          refreshTitle();
        } }, tt('load.delete'))))));
  }

  const importStatus = (msg, cls = 'warn') => doc.querySelector('[data-field="import-status"]').replaceChildren(el(doc, 'p', { class: cls }, msg));
  doc.querySelector('[data-field="import-file"]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) doc.querySelector('[data-field="import-code"]').value = (await file.text()).trim();
  });

  // ---------- Setup ----------
  async function openSetup() {
    const base = await rulesFor(['base-ancient']);
    if (base.error) { say(base.error); return; }
    const { src } = base;
    const manifests = Object.fromEntries(Object.entries(src.available).map(([id, m]) => { try { return [id, JSON.parse(m.manifest)]; } catch { return [id, {}]; } }));
    const devIds = new Set(src.index.mods.filter((m) => m.dev).map((m) => m.id));
    // In rules/index.json order, whatever order the files arrived in.
    const listed = src.index.mods.map((m) => manifests[m.id]).filter(Boolean);
    const mods = listed.filter((m) => m.type === 'tweak' && !devIds.has(m.id));
    const conversions = listed.filter((m) => m.type === 'conversion' && !devIds.has(m.id));
    if (!setupCfg) {
      const previous = readLastSetup();
      setupCfg = defaultSetup(base.ruleset, { seed: params.has('seed') ? Number.parseInt(params.get('seed'), 10) || 0 : newSeed(), previous });
      // A first game on a phone starts from the phone preset (a Small map), since bigger maps are slower there.
      const phonePreset = base.ruleset.tuning?.setup?.phonePreset;
      const preset = base.ruleset.tuning?.setup?.presets?.[phonePreset];
      if (!previous && preset && (doc.defaultView?.innerWidth ?? 1200) < 900) Object.assign(setupCfg, { preset: phonePreset, ais: preset.ais, speed: preset.speed, map: { ...setupCfg.map, size: preset.size } });
    }
    // Mods that are no longer installed drop out of a remembered setup.
    if (setupCfg.conversion && setupCfg.conversion !== 'none' && !manifests[setupCfg.conversion]) setupCfg.conversion = 'none';
    setupCfg.tweaks = (setupCfg.tweaks ?? []).filter((id) => mods.some((m) => m.id === id));
    const host = doc.querySelector('[data-field="setup-body"]');
    // The rules for the chosen mods, reloaded only when the choice changes.
    let loaded = null;
    let loadedKey = null;
    async function rulesForCfg(cfg) {
      const key = JSON.stringify([selectionOf(cfg), optionsOf(cfg)]);
      if (key === loadedKey) return loaded;
      const next = await rulesFor(selectionOf(cfg), optionsOf(cfg));
      if (next.error) { say(next.error); return loaded; }
      loaded = next;
      loadedKey = key;
      // Faction picks from other rules no longer apply.
      if (cfg.faction && !loaded.ruleset.factions[cfg.faction]) cfg.faction = null;
      cfg.aiFactions = (cfg.aiFactions ?? []).map((f) => (f && loaded.ruleset.factions[f] ? f : null));
      return loaded;
    }
    const draw = async () => {
      const { ruleset, text } = await rulesForCfg(setupCfg);
      renderSetup(doc, host, {
        ruleset, text, mods, conversions, cfg: setupCfg, newSeed, limit: { maxAis: ruleset.tuning?.setup?.maxAis ?? 11 },
        onRulesChange: () => { draw(); },
        onBack: () => { setupCfg = null; show(doc, 'title'); },
        onPickFaction: (cfg) => {
          returnTo = 'setup';
          show(doc, 'pick');
          showFactionPicker(doc, doc.getElementById('pick'), ruleset, text, (civ) => { cfg.faction = civ; returnTo = 'title'; show(doc, 'setup'); draw(); });
        },
        onStart: async (cfg) => {
          const { setup, selection, options } = toSetup(ruleset, cfg, { manifests, text });
          rememberSetup(cfg);
          setupCfg = null;
          await startGame({ setup, selection, options });
        },
      });
    };
    await draw();
    show(doc, 'setup');
  }
  function readLastSetup() {
    try {
      const s = JSON.parse(storage.getItem('atlas:lastSetup') ?? 'null');
      return s && typeof s === 'object' ? s : null;
    } catch { return null; }
  }
  function rememberSetup(cfg) {
    const { seed: _seed, ...rest } = cfg;
    try { storage.setItem('atlas:lastSetup', JSON.stringify(rest)); } catch { /* a nicety */ }
  }

  const actions = {
    async new() {
      await sources();
      // ?faction=<id> skips setup with a quick default game (used by the browser tests and for quick checks).
      if (params.has('faction')) {
        const loaded = await rulesFor(['base-ancient']);
        if (loaded.ruleset?.factions?.[params.get('faction')]) {
          const seed = params.has('seed') ? Number.parseInt(params.get('seed'), 10) || 0 : newSeed();
          await startGame({ quick: { seed, faction: params.get('faction') } });
          return;
        }
      }
      await openSetup();
    },
    async continue() {
      await sources();
      const latest = latestSave(storage);
      if (!latest) return;
      const save = await loadSave(storage, latest).catch(() => null);
      if (save) await openSave(save); else say(tt('load.broken'));
    },
    async load() { await sources(); renderLoad(); show(doc, 'load'); },
    async import() { await sources(); doc.querySelector('[data-field="import-status"]').replaceChildren(); show(doc, 'import'); },
    async 'import-go'() {
      const code = doc.querySelector('[data-field="import-code"]').value.trim();
      if (!code) { importStatus(tt('import.empty')); return; }
      let save;
      try { save = await importCode(code); } catch (e) { importStatus(tt('import.bad', { problem: String(e.message ?? e) })); return; }
      importStatus(tt('import.ok', { label: save.label }), 'ok');
      await openSave(save);
    },
    settings() { applySettings(); show(doc, 'settings'); },
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
    back() {
      if (!doc.getElementById('pick').hidden && returnTo === 'setup') { returnTo = 'title'; show(doc, 'setup'); return; }
      show(doc, 'title');
    },
  };

  // Fetch the game screen while the player reads the title screen, so starting a game does not wait.
  const idle = doc.defaultView.requestIdleCallback ?? ((fn) => doc.defaultView.setTimeout(fn, 1500));
  idle(() => { loadGameScreen().catch(() => { gameModule = null; }); });

  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled || !gameScreen.hidden && gameScreen.contains(btn)) return;
    if (btn.dataset.say) { say(btn.dataset.say); return; }
    actions[btn.dataset.action]?.();
  });

  // Keyboard extras: arrow keys move through a menu, Escape leaves a side screen.
  doc.addEventListener('keydown', (e) => {
    const menu = e.target.closest?.('[data-menu]');
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const buttons = [...menu.querySelectorAll('.btn:not(:disabled)')];
      const i = buttons.indexOf(e.target);
      const next = buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
      next.focus();
      e.preventDefault();
    } else if (e.key === 'Escape' && ['mods', 'pick', 'load', 'import', 'settings'].some((id) => !doc.getElementById(id).hidden)) {
      actions.back();
    }
  });

  applySettings();
  refreshTitle();
  show(doc, 'title');
}
