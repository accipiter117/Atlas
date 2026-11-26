// The setup screen (section 6): one scrolling page with three presets at the
// top and every match option below. Options whose systems do not exist yet are
// shown greyed out with a note saying when they arrive. The chosen options
// become state.setup and never change once the match starts.
//
// Presets and defaults come from tuning.setup; option names from the ruleset's
// text and text/engine.en-GB.json.

import { t } from '../data/text.js';
import { VICTORY_MODULES } from '../sim/index.js';

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

/** The starting choices: the default preset, or the last setup used. */
export function defaultSetup(ruleset, { seed, previous = null } = {}) {
  const conf = ruleset.tuning?.setup ?? {};
  const preset = conf.presets?.[conf.defaultPreset ?? 'standard'] ?? {};
  const sizes = Object.values(ruleset.mapSizes ?? {});
  const size = preset.size ?? sizes.find((s) => s.default)?.id ?? sizes[0]?.id;
  const base = {
    preset: conf.defaultPreset ?? 'standard',
    tweaks: [],
    modOptions: {},
    map: { type: Object.keys(ruleset.mapTypes ?? {})[0] ?? 'continents', size, seaLevel: 'normal', resources: 'standard', age: 'standard' },
    seed,
    faction: null,
    ais: preset.ais ?? Math.max(1, (ruleset.mapSizes?.[size]?.factions ?? 4) - 1),
    aiFactions: [],
    noDuplicates: true,
    victories: Object.values(ruleset.victories ?? {}).filter((v) => v.enabled && VICTORY_MODULES[v.module]).map((v) => v.id),
    turnLimit: 'default',
    customTurns: 300,
    speed: preset.speed ?? 'standard',
    startEra: Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index)[0]?.id ?? null,
    raiders: 'on',
    fog: 'on',
    recordAI: 'on',
    autosave: 'every',
  };
  return previous ? { ...base, ...previous, seed } : base;
}

/** Turn the screen's choices into state.setup (section 6) plus the mods to load. */
export function toSetup(ruleset, cfg, { manifests, text }) {
  const tt = (k, a) => t(text, k, a);
  const firstEra = Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index)[0]?.id;
  const selection = ['base-ancient', ...cfg.tweaks];
  const setup = {
    seed: cfg.seed,
    mods: selection.map((id) => `${id}@${manifests[id]?.version ?? '0.0.0'}`),
    modOptions: Object.fromEntries(cfg.tweaks.filter((id) => cfg.modOptions[id]).map((id) => [id, cfg.modOptions[id]])),
    map: { ...cfg.map },
    players: [
      { kind: 'human', name: tt('game.you'), ...(cfg.faction ? { faction: cfg.faction } : {}) },
      ...Array.from({ length: cfg.ais }, (_, i) => ({ kind: 'ai', name: tt('game.rival', { n: i + 1 }), ...(cfg.aiFactions[i] ? { faction: cfg.aiFactions[i] } : {}) })),
    ],
    victories: cfg.victories.slice(),
    speed: cfg.speed,
    raiders: cfg.raiders,
    fog: cfg.fog,
    recordAI: cfg.recordAI,
    autosave: cfg.autosave,
    battleMode: 'auto',
    battleModule: 'auto',
    difficulty: 'prince',
  };
  if (cfg.turnLimit === 'none') setup.turnLimit = null;
  if (cfg.turnLimit === 'custom') setup.turnLimit = Math.max(10, Math.min(2000, Math.round(Number(cfg.customTurns) || 300)));
  if (cfg.startEra && cfg.startEra !== firstEra) setup.startEra = cfg.startEra;
  return { setup, selection, options: setup.modOptions };
}

/**
 * Draw the setup screen into `host`.
 * mods: [{ id, name, description, version, options }] (tweak mods on offer)
 * onStart(cfg), onBack(), onPickFaction(cfg) (opens the faction cards), newSeed()
 */
export function renderSetup(doc, host, { ruleset, text, mods, cfg, onStart, onBack, onPickFaction, newSeed, limit }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key, fallback) => text[key] ?? ruleset.text?.[key] ?? fallback;
  const conf = ruleset.tuning?.setup ?? {};
  const later = (phase) => el(doc, 'span', { class: 'later' }, tt('setup.later', { phase }));
  const rerender = () => renderSetup(doc, host, { ruleset, text, mods, cfg, onStart, onBack, onPickFaction, newSeed, limit });

  function select(name, value, options, onChange, { disabled = false } = {}) {
    return el(doc, 'select', { name, disabled, onchange: (e) => { onChange(e.target.value); rerender(); } },
      ...options.map((o) => el(doc, 'option', { value: o.value, selected: String(o.value) === String(value), disabled: Boolean(o.disabled) }, o.label)));
  }
  const row = (label, control, note = null, field = null) => el(doc, 'div', { class: 'setup-row', ...(field ? { dataset: { setting: field } } : {}) },
    el(doc, 'label', {}, el(doc, 'span', { class: 'setup-label' }, label), control), note);
  const group = (title, ...rows) => el(doc, 'section', { class: 'setup-group' }, el(doc, 'h3', {}, title), ...rows);
  const choose = (prefix, ids) => ids.map((id) => ({ value: id, label: tt(`${prefix}.${id}`) }));

  // Presets.
  const presets = el(doc, 'div', { class: 'presets', role: 'group', 'aria-label': tt('setup.presets') },
    ...Object.entries(conf.presets ?? {}).map(([id, p]) => el(doc, 'button', {
      type: 'button', class: `btn small${cfg.preset === id ? ' primary' : ''}`, dataset: { preset: id }, 'aria-pressed': String(cfg.preset === id),
      onclick: () => { Object.assign(cfg, { preset: id, ais: p.ais, speed: p.speed, map: { ...cfg.map, size: p.size } }); rerender(); },
    }, el(doc, 'strong', {}, tt(`setup.preset.${id}`)), el(doc, 'span', { class: 'small' }, tt('setup.presetText', { size: say(ruleset.mapSizes[p.size]?.nameKey, p.size), ais: p.ais, speed: tt(`setup.speed.${p.speed}`) })))));

  const changed = () => { cfg.preset = null; };
  const factionIds = Object.keys(ruleset.factions ?? {});
  const factionName = (id) => say(ruleset.factions[id]?.nameKey, id);
  const taken = (except) => new Set([cfg.faction, ...cfg.aiFactions].filter((f, i) => f && i !== except));

  // Rules.
  const tweakRows = mods.map((m) => {
    const on = cfg.tweaks.includes(m.id);
    const opts = on ? (m.options ?? []).filter((o) => o.type === 'choice' && o.source && ruleset[o.source]).map((o) => {
      const current = cfg.modOptions[m.id]?.[o.id] ?? o.default;
      return row(say(o.labelKey, o.id), select(`opt-${m.id}-${o.id}`, current, Object.values(ruleset[o.source]).map((x) => ({ value: x.id, label: say(x.nameKey, x.id) })), (v) => { cfg.modOptions[m.id] = { ...(cfg.modOptions[m.id] ?? {}), [o.id]: v }; }));
    }) : [];
    return el(doc, 'div', { class: 'setup-tweak' },
      el(doc, 'label', { class: 'tick' },
        el(doc, 'input', { type: 'checkbox', name: `mod-${m.id}`, checked: on, onchange: (e) => { cfg.tweaks = e.target.checked ? [...cfg.tweaks, m.id] : cfg.tweaks.filter((x) => x !== m.id); rerender(); } }),
        el(doc, 'span', {}, el(doc, 'strong', {}, m.name), el(doc, 'span', { class: 'small muted' }, ` ${m.description ?? ''}`))),
      ...opts);
  });
  const rules = group(tt('setup.group.rules'),
    row(tt('setup.ruleset'), select('ruleset', 'base-ancient', [{ value: 'base-ancient', label: tt('setup.baseAncient') }], () => {}, { disabled: true })),
    row(tt('setup.conversion'), select('conversion', 'none', [{ value: 'none', label: tt('setup.none') }], () => {}, { disabled: true }), later(17)),
    el(doc, 'div', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, tt('setup.tweaks')), el(doc, 'div', { class: 'setup-tweaks' }, ...tweakRows)));

  // Map.
  const sizeIds = Object.values(ruleset.mapSizes ?? {}).map((s) => s.id);
  const map = group(tt('setup.group.map'),
    row(tt('setup.mapType'), select('mapType', cfg.map.type, Object.values(ruleset.mapTypes ?? {}).map((m) => ({ value: m.id, label: say(m.nameKey, m.id) })), (v) => { cfg.map.type = v; })),
    row(tt('setup.mapSize'), select('mapSize', cfg.map.size, sizeIds.map((id) => ({ value: id, label: say(ruleset.mapSizes[id].nameKey, id) })), (v) => { cfg.map.size = v; changed(); })),
    row(tt('setup.seaLevel'), select('seaLevel', cfg.map.seaLevel, choose('setup.sea', Object.keys(ruleset.tuning?.mapgen?.seaLevels ?? { low: 1, normal: 1, high: 1 })), (v) => { cfg.map.seaLevel = v; })),
    row(tt('setup.resources'), select('resources', cfg.map.resources, choose('setup.res', Object.keys(ruleset.tuning?.mapgen?.resourceLevels ?? { sparse: 1, standard: 1, abundant: 1 })), (v) => { cfg.map.resources = v; })),
    row(tt('setup.age'), select('age', cfg.map.age, choose('setup.age', Object.keys(ruleset.tuning?.mapgen?.ages ?? { new: 1, standard: 1, old: 1 })), (v) => { cfg.map.age = v; })),
    row(tt('setup.seed'), el(doc, 'span', { class: 'seed-row' },
      el(doc, 'input', { type: 'number', name: 'seed', inputmode: 'numeric', value: String(cfg.seed), min: '0', onchange: (e) => { cfg.seed = Math.max(0, Math.round(Number(e.target.value) || 0)); } }),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'new-seed' }, onclick: () => { cfg.seed = newSeed(); rerender(); } }, tt('setup.newSeed')),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'copy-seed' }, onclick: () => doc.defaultView.navigator.clipboard?.writeText(String(cfg.seed)).catch(() => {}) }, tt('setup.copy')))));

  // Players.
  const aiRows = Array.from({ length: cfg.ais }, (_, i) => {
    const used = cfg.noDuplicates ? taken(i + 1) : new Set();
    return row(tt('setup.aiFaction', { n: i + 1 }), select(`ai-${i}`, cfg.aiFactions[i] ?? '', [{ value: '', label: tt('setup.random') }, ...factionIds.map((id) => ({ value: id, label: factionName(id), disabled: used.has(id) }))], (v) => { cfg.aiFactions[i] = v || null; }));
  });
  const used0 = cfg.noDuplicates ? taken(0) : new Set();
  const players = group(tt('setup.group.players'),
    row(tt('setup.yourFaction'), el(doc, 'span', { class: 'seed-row' },
      select('faction', cfg.faction ?? '', [{ value: '', label: tt('setup.random') }, ...factionIds.map((id) => ({ value: id, label: factionName(id), disabled: used0.has(id) }))], (v) => { cfg.faction = v || null; }),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'see-cards' }, onclick: () => onPickFaction(cfg) }, tt('setup.seeCards')))),
    row(tt('setup.ais'), select('ais', cfg.ais, Array.from({ length: limit.maxAis }, (_, i) => ({ value: i + 1, label: String(i + 1) })), (v) => { cfg.ais = Number(v); cfg.aiFactions = cfg.aiFactions.slice(0, cfg.ais); changed(); })),
    ...aiRows,
    el(doc, 'label', { class: 'tick setup-row' }, el(doc, 'input', { type: 'checkbox', name: 'noDuplicates', checked: cfg.noDuplicates, onchange: (e) => { cfg.noDuplicates = e.target.checked; rerender(); } }), el(doc, 'span', {}, tt('setup.noDuplicates'))),
    row(tt('setup.teams'), select('teams', 'off', [{ value: 'off', label: tt('setup.off') }], () => {}, { disabled: true }), later(12)));

  // Victory.
  const victoryRows = Object.values(ruleset.victories ?? {}).map((v) => {
    const ready = v.enabled && VICTORY_MODULES[v.module];
    return el(doc, 'label', { class: 'tick' },
      el(doc, 'input', { type: 'checkbox', name: `victory-${v.id}`, checked: ready && cfg.victories.includes(v.id), disabled: !ready, onchange: (e) => { cfg.victories = e.target.checked ? [...cfg.victories, v.id] : cfg.victories.filter((x) => x !== v.id); rerender(); } }),
      el(doc, 'span', {}, say(v.nameKey, v.id)), !v.enabled ? el(doc, 'span', { class: 'later' }, tt('setup.offByMod')) : !ready ? later(v.id === 'religious' ? 13 : 16) : null);
  });
  const speedDefault = ruleset.tuning?.victory?.turnLimits?.[cfg.speed];
  const victory = group(tt('setup.group.victory'),
    el(doc, 'div', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, tt('setup.victories')), el(doc, 'div', { class: 'setup-ticks' }, ...victoryRows)),
    row(tt('setup.turnLimit'), el(doc, 'span', { class: 'seed-row' },
      select('turnLimit', cfg.turnLimit, [{ value: 'default', label: tt('setup.turnDefault', { n: speedDefault ?? '' }) }, { value: 'custom', label: tt('setup.custom') }, { value: 'none', label: tt('setup.noLimit') }], (v) => { cfg.turnLimit = v; }),
      cfg.turnLimit === 'custom' ? el(doc, 'input', { type: 'number', name: 'customTurns', min: '10', max: '2000', value: String(cfg.customTurns), onchange: (e) => { cfg.customTurns = e.target.value; } }) : null)),
    cfg.victories.length ? null : el(doc, 'p', { class: 'warn' }, tt('setup.noVictory')));

  // Pace, difficulty, world, battles, advanced.
  const eras = Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index);
  const pace = group(tt('setup.group.pace'),
    row(tt('setup.speed'), select('speed', cfg.speed, Object.keys(ruleset.tuning?.speeds ?? {}).map((id) => ({ value: id, label: tt(`setup.speed.${id}`) })), (v) => { cfg.speed = v; changed(); })),
    row(tt('setup.startEra'), select('startEra', cfg.startEra, eras.map((e) => ({ value: e.id, label: say(e.nameKey, e.id) })), (v) => { cfg.startEra = v; })));
  const difficulty = group(tt('setup.group.difficulty'),
    row(tt('setup.difficulty'), select('difficulty', 'prince', [{ value: 'prince', label: tt('setup.prince') }], () => {}, { disabled: true }), later(10)),
    el(doc, 'p', { class: 'small muted' }, tt('setup.princeNote')));
  const world = group(tt('setup.group.world'),
    row(tt('setup.raiders'), select('raiders', cfg.raiders, choose('setup.raidersOpt', ['off', 'on', 'raging']), (v) => { cfg.raiders = v; })),
    row(tt('setup.events'), select('events', 'off', [{ value: 'off', label: tt('setup.off') }], () => {}, { disabled: true }), later(16)),
    row(tt('setup.disasters'), select('disasters', 'off', [{ value: 'off', label: tt('setup.off') }], () => {}, { disabled: true }), later(16)));
  const battles = group(tt('setup.group.battles'),
    row(tt('setup.battleMode'), select('battleMode', 'auto', [{ value: 'auto', label: tt('setup.battleAuto') }, { value: 'ask', label: tt('setup.battleAsk'), disabled: true }, { value: 'fight', label: tt('setup.battleFight'), disabled: true }], () => {}), el(doc, 'span', { class: 'later' }, tt('setup.battleNote'))),
    row(tt('setup.battleModule'), select('battleModule', 'auto', [{ value: 'auto', label: tt('setup.moduleAuto') }], () => {}, { disabled: true })));
  const advanced = group(tt('setup.group.advanced'),
    row(tt('setup.fog'), select('fog', cfg.fog, choose('setup.onOff', ['on', 'off']), (v) => { cfg.fog = v; })),
    row(tt('setup.recorder'), select('recordAI', cfg.recordAI, choose('setup.journalOpt', ['on', 'off']), (v) => { cfg.recordAI = v; })),
    row(tt('setup.autosave'), select('autosave', cfg.autosave, choose('setup.autosaveOpt', ['every', 'five', 'off']), (v) => { cfg.autosave = v; })));

  host.replaceChildren(
    el(doc, 'div', { class: 'mods-head' }, el(doc, 'h2', { id: 'setup-heading' }, tt('setup.title')), el(doc, 'button', { type: 'button', class: 'btn back', onclick: onBack }, tt('setup.back'))),
    presets,
    el(doc, 'div', { class: 'setup-groups' }, rules, map, players, victory, pace, difficulty, world, battles, advanced),
    el(doc, 'div', { class: 'setup-start' },
      el(doc, 'button', { type: 'button', class: 'btn primary', dataset: { action: 'start-game' }, disabled: !cfg.victories.length && cfg.turnLimit === 'none', onclick: () => onStart(cfg) }, tt('setup.start'))));
}
