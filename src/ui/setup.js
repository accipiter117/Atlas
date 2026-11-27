// The setup screen (section 6; laid out as two panes with tabs and a summary card in the
// graphics overhaul G7): three presets at the top and every match option below. Options whose systems do not exist yet are
// shown greyed out with a note saying when they arrive. The chosen options
// become state.setup and never change once the match starts.
//
// Presets and defaults come from tuning.setup; option names from the ruleset's
// text and text/engine.en-GB.json.

import { t } from '../data/text.js';
import { VICTORY_MODULES } from '../sim/index.js';
import { getModule, moduleIds } from '../battles/index.js';

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
    conversion: 'none',
    tweaks: [],
    modOptions: {},
    map: { type: Object.keys(ruleset.mapTypes ?? {})[0] ?? 'continents', size, seaLevel: 'normal', resources: 'standard', age: 'standard' },
    seed,
    faction: null,
    ais: preset.ais ?? Math.max(1, (ruleset.mapSizes?.[size]?.factions ?? 4) - 1),
    aiFactions: [],
    noDuplicates: true,
    teams: [],
    victories: Object.values(ruleset.victories ?? {}).filter((v) => v.enabled && VICTORY_MODULES[v.module]).map((v) => v.id),
    turnLimit: 'default',
    customTurns: 300,
    speed: preset.speed ?? 'standard',
    startEra: Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index)[0]?.id ?? null,
    raiders: 'on',
    events: 'occasional',
    disasters: 'off',
    fog: 'on',
    recordAI: 'on',
    autosave: 'every',
    difficulty: Object.values(ruleset.difficulty ?? {}).find((d) => d.default)?.id ?? 'prince',
  };
  return previous ? { ...base, ...previous, seed } : base;
}

/** The interactive battle module to use: the one asked for if it is interactive, else the first installed. */
export function interactiveModule(wanted, preferred = null) {
  if (getModule(wanted)?.kind === 'interactive') return wanted;
  if (getModule(preferred)?.kind === 'interactive') return preferred;
  return moduleIds().find((id) => getModule(id).kind === 'interactive') ?? 'auto';
}

/** The mods a setup loads, in order: the ruleset, the conversion (if any), then the ticked tweaks in their order. */
export function selectionOf(cfg, manifests = null) {
  // A conversion built on another (Killzone: Extrasolar War on Killzone, K2) loads what it depends on first.
  const chain = [];
  const add = (id) => {
    for (const d of manifests?.[id]?.dependsOn ?? []) if (d !== 'base-ancient' && !chain.includes(d)) add(d);
    if (!chain.includes(id)) chain.push(id);
  };
  if (cfg.conversion && cfg.conversion !== 'none') add(cfg.conversion);
  return ['base-ancient', ...chain, ...cfg.tweaks];
}

/** The options of the ticked mods only. */
export function optionsOf(cfg) {
  return Object.fromEntries(cfg.tweaks.filter((id) => cfg.modOptions[id]).map((id) => [id, cfg.modOptions[id]]));
}

/** Turn the screen's choices into state.setup (section 6) plus the mods to load. */
export function toSetup(ruleset, cfg, { manifests, text }) {
  const tt = (k, a) => t(text, k, a);
  const firstEra = Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index)[0]?.id;
  const selection = selectionOf(cfg, manifests);
  const setup = {
    seed: cfg.seed,
    mods: selection.map((id) => `${id}@${manifests[id]?.version ?? '0.0.0'}`),
    modOptions: optionsOf(cfg),
    map: { ...cfg.map },
    players: [
      { kind: 'human', name: tt('game.you'), ...(cfg.faction ? { faction: cfg.faction } : {}), ...(cfg.teams?.[0] ? { team: cfg.teams[0] } : {}) },
      ...Array.from({ length: Math.min(cfg.ais, ruleset.tuning?.setup?.maxAis ?? cfg.ais) }, (_, i) => ({ kind: 'ai', name: tt('game.rival', { n: i + 1 }), ...(cfg.aiFactions[i] ? { faction: cfg.aiFactions[i] } : {}), ...(cfg.teams?.[i + 1] ? { team: cfg.teams[i + 1] } : {}) })),
    ],
    // Only victories the loaded mods leave switched on (lock-era turns science off).
    victories: cfg.victories.filter((id) => ruleset.victories?.[id]?.enabled !== false),
    speed: cfg.speed,
    raiders: cfg.raiders,
    events: cfg.events ?? 'occasional',
    disasters: cfg.disasters ?? 'off',
    fog: cfg.fog,
    recordAI: cfg.recordAI,
    autosave: cfg.autosave,
    battleMode: cfg.battleMode ?? ruleset.tuning?.setup?.battleMode ?? 'auto',
    // Fighting your own battles needs an interactive module: the chosen one, the rules' own, else the first installed.
    battleModule: (cfg.battleMode ?? ruleset.tuning?.setup?.battleMode ?? 'auto') === 'auto' ? 'auto' : interactiveModule(cfg.battleModule, ruleset.tuning?.setup?.battleModule),
    difficulty: cfg.difficulty ?? 'prince',
  };
  if (cfg.turnLimit === 'none') setup.turnLimit = null;
  if (cfg.turnLimit === 'custom') setup.turnLimit = Math.max(10, Math.min(2000, Math.round(Number(cfg.customTurns) || 300)));
  if (cfg.startEra && cfg.startEra !== firstEra) setup.startEra = cfg.startEra;
  if (cfg.scenario && ruleset.scenarios?.[cfg.scenario]) setup.scenario = cfg.scenario;
  return { setup, selection, options: setup.modOptions };
}

/**
 * Draw the setup screen into `host`.
 * mods: [{ id, name, description, version, options }] (tweak mods on offer)
 * onStart(cfg), onBack(), onPickFaction(cfg) (opens the faction cards), newSeed()
 */
export function renderSetup(doc, host, { ruleset, text, mods, conversions = [], cfg, onStart, onBack, onPickFaction, newSeed, limit, onRulesChange = null, portrait = () => null }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key, fallback) => text[key] ?? ruleset.text?.[key] ?? fallback;
  const conf = ruleset.tuning?.setup ?? {};
  // The rules may cap the rivals (a two-sided front-line war has one).
  if (limit?.maxAis && cfg.ais > limit.maxAis) { cfg.ais = limit.maxAis; cfg.aiFactions = cfg.aiFactions.slice(0, cfg.ais); }
  const later = (phase) => el(doc, 'span', { class: 'later' }, tt('setup.later', { phase }));
  const rerender = () => renderSetup(doc, host, { ruleset, text, mods, conversions, cfg, onStart, onBack, onPickFaction, newSeed, limit, onRulesChange, portrait });
  // A change to the mods reloads the rules (the factions, eras and victories on offer follow).
  const rulesChanged = () => (onRulesChange ? onRulesChange(cfg) : rerender());

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

  // Rules: the conversion, then tweaks (ticked ones in load order, with up and down buttons and their options).
  const tickedFirst = [...cfg.tweaks.map((id) => mods.find((m) => m.id === id)).filter(Boolean), ...mods.filter((m) => !cfg.tweaks.includes(m.id))];
  const moveTweak = (id, d) => {
    const i = cfg.tweaks.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= cfg.tweaks.length) return;
    [cfg.tweaks[i], cfg.tweaks[j]] = [cfg.tweaks[j], cfg.tweaks[i]];
    rulesChanged();
  };
  const tweakRows = tickedFirst.map((m) => {
    const on = cfg.tweaks.includes(m.id);
    const at = cfg.tweaks.indexOf(m.id);
    const opts = on ? (m.options ?? []).filter((o) => o.type === 'choice' && o.source && ruleset[o.source]).map((o) => {
      const current = cfg.modOptions[m.id]?.[o.id] ?? o.default;
      const choices = Object.values(ruleset[o.source]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((x) => ({ value: x.id, label: say(x.nameKey, x.id) }));
      return el(doc, 'label', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, say(o.labelKey, o.id)),
        el(doc, 'select', { name: `opt-${m.id}-${o.id}`, onchange: (e) => { cfg.modOptions[m.id] = { ...(cfg.modOptions[m.id] ?? {}), [o.id]: e.target.value }; rulesChanged(); } },
          ...choices.map((c) => el(doc, 'option', { value: c.value, selected: c.value === current }, c.label))));
    }) : [];
    return el(doc, 'div', { class: `setup-tweak${on ? ' on' : ''}`, dataset: { tweak: m.id } },
      el(doc, 'div', { class: 'tweak-head' },
        el(doc, 'label', { class: 'tick' },
          el(doc, 'input', { type: 'checkbox', name: `mod-${m.id}`, checked: on, onchange: (e) => { cfg.tweaks = e.target.checked ? [...cfg.tweaks, m.id] : cfg.tweaks.filter((x) => x !== m.id); rulesChanged(); } }),
          el(doc, 'span', {}, el(doc, 'strong', {}, m.name), el(doc, 'span', { class: 'small muted' }, ` ${m.description ?? ''}`))),
        on ? el(doc, 'span', { class: 'mod-order' },
          el(doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': tt('mods.up', { name: m.name }), disabled: at === 0, dataset: { move: 'up' }, onclick: () => moveTweak(m.id, -1) }, '▲'),
          el(doc, 'button', { type: 'button', class: 'icon-btn', 'aria-label': tt('mods.down', { name: m.name }), disabled: at === cfg.tweaks.length - 1, dataset: { move: 'down' }, onclick: () => moveTweak(m.id, 1) }, '▼')) : null),
      ...opts);
  });
  const conversionChoices = [{ value: 'none', label: tt('setup.none') }, ...conversions.map((m) => ({ value: m.id, label: m.name }))];
  const conversionNote = conversions.find((m) => m.id === cfg.conversion)?.description ?? null;
  const rules = group(tt('setup.group.rules'),
    row(tt('setup.ruleset'), select('ruleset', 'base-ancient', [{ value: 'base-ancient', label: tt('setup.baseAncient') }], () => {}, { disabled: true })),
    row(tt('setup.conversion'), el(doc, 'select', { name: 'conversion', onchange: (e) => {
      cfg.conversion = e.target.value;
      // Factions belong to the rules: picks from the old ones no longer apply.
      cfg.faction = null;
      cfg.aiFactions = [];
      rulesChanged();
    } }, ...conversionChoices.map((o) => el(doc, 'option', { value: o.value, selected: o.value === (cfg.conversion ?? 'none') }, o.label))),
    conversionNote ? el(doc, 'p', { class: 'small muted' }, conversionNote) : null),
    el(doc, 'div', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, tt('setup.tweaks')), el(doc, 'div', { class: 'setup-tweaks' }, ...tweakRows)),
    el(doc, 'p', { class: 'small muted' }, tt('setup.tweaksOrder')));

  // Map. On a phone (a narrow screen), Small and Standard maps are recommended (phase 21).
  const phone = (doc.defaultView?.innerWidth ?? 1200) < 900;
  const sizeIds = Object.values(ruleset.mapSizes ?? {}).map((s) => s.id);
  // A front-line game (phase 19) is fought on a fixed map from the rules instead.
  const mapPresets = ruleset.tuning?.frontline?.enabled ? Object.values(ruleset.mapPresets ?? {}) : [];
  if (mapPresets.length && !ruleset.mapPresets[cfg.map.preset]) cfg.map.preset = mapPresets[0].id;
  // K4b: a war across several worlds picks a scenario (who holds what at the start) instead of a map.
  const scenarios = Object.values(ruleset.scenarios ?? {});
  if (scenarios.length && !ruleset.scenarios[cfg.scenario]) cfg.scenario = (scenarios.find((x) => x.default) ?? scenarios[0]).id;
  const map = scenarios.length ? group(tt('setup.group.map'),
    row(tt('setup.scenario'), select('scenario', cfg.scenario, scenarios.map((x) => ({ value: x.id, label: say(x.nameKey, x.id) })), (v) => { cfg.scenario = v; changed(); const p = doc.querySelector('[data-field="scenario-text"]'); if (p) p.textContent = say(ruleset.scenarios[v]?.descriptionKey, ''); })),
    el(doc, 'p', { class: 'small muted', dataset: { field: 'scenario-text' } }, say(ruleset.scenarios[cfg.scenario]?.descriptionKey, ''))) : mapPresets.length ? group(tt('setup.group.map'),
    row(tt('setup.mapPreset'), select('mapPreset', cfg.map.preset, mapPresets.map((p) => ({ value: p.id, label: say(p.nameKey, p.id) })), (v) => { cfg.map.preset = v; })),
    el(doc, 'p', { class: 'small muted', dataset: { field: 'preset-text' } }, say(ruleset.mapPresets[cfg.map.preset]?.descriptionKey, '')),
    el(doc, 'p', { class: 'small muted' }, tt('setup.frontNote'))) : group(tt('setup.group.map'),
    row(tt('setup.mapType'), select('mapType', cfg.map.type, Object.values(ruleset.mapTypes ?? {}).map((m) => ({ value: m.id, label: say(m.nameKey, m.id) })), (v) => { cfg.map.type = v; })),
    row(tt('setup.mapSize'), select('mapSize', cfg.map.size, sizeIds.map((id) => ({ value: id, label: phone && (ruleset.tuning?.setup?.phoneSlowSizes ?? []).includes(id) ? tt('setup.slowOnPhones', { size: say(ruleset.mapSizes[id].nameKey, id) }) : say(ruleset.mapSizes[id].nameKey, id) })), (v) => { cfg.map.size = v; changed(); }),
      phone ? el(doc, 'p', { class: 'small muted', dataset: { field: 'phone-maps' } }, tt('setup.phoneMaps')) : null),
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
    row(tt('setup.yourFaction'), select('faction', cfg.faction ?? '', [{ value: '', label: tt('setup.random') }, ...factionIds.map((id) => ({ value: id, label: factionName(id), disabled: used0.has(id) }))], (v) => { cfg.faction = v || null; })),
    row(tt('setup.ais'), select('ais', cfg.ais, Array.from({ length: limit.maxAis }, (_, i) => ({ value: i + 1, label: String(i + 1) })), (v) => { cfg.ais = Number(v); cfg.aiFactions = cfg.aiFactions.slice(0, cfg.ais); changed(); })),
    // The rivals one by one, folded into a summary line unless opened (graphics overhaul G7).
    foldable('rivals', el(doc, 'summary', {}, cfg.aiFactions.some(Boolean) ? tt('setup.rivalsChosen', { n: cfg.ais, chosen: cfg.aiFactions.filter(Boolean).length }) : tt('setup.rivalsRandom', { n: cfg.ais })),
      ...aiRows,
      el(doc, 'label', { class: 'tick setup-row' }, el(doc, 'input', { type: 'checkbox', name: 'noDuplicates', checked: cfg.noDuplicates, onchange: (e) => { cfg.noDuplicates = e.target.checked; rerender(); } }), el(doc, 'span', {}, tt('setup.noDuplicates')))),
    foldable('teams', el(doc, 'summary', {}, (cfg.teams ?? []).some((x) => Number(x) > 0) ? tt('setup.teamsSet') : tt('setup.teamsNone')),
      el(doc, 'div', { class: 'setup-teams' }, ...Array.from({ length: cfg.ais + 1 }, (_, i) => row(tt('setup.team', { player: i === 0 ? tt('game.you') : tt('game.rival', { n: i }) }),
        select(`team-${i}`, cfg.teams?.[i] ?? 0, [{ value: 0, label: tt('setup.noTeam') }, ...[1, 2, 3, 4].map((n) => ({ value: n, label: tt('setup.teamN', { n }) }))], (v) => { cfg.teams = Array.from({ length: cfg.ais + 1 }, (_, k) => (k === i ? Number(v) : cfg.teams?.[k] ?? 0)); })))),
      el(doc, 'p', { class: 'small muted' }, tt('setup.teamsNote'))));

  // Victory.
  const victoryRows = Object.values(ruleset.victories ?? {}).map((v) => {
    const ready = v.enabled && VICTORY_MODULES[v.module];
    return el(doc, 'label', { class: 'tick' },
      el(doc, 'input', { type: 'checkbox', name: `victory-${v.id}`, checked: ready && cfg.victories.includes(v.id), disabled: !ready, onchange: (e) => { cfg.victories = e.target.checked ? [...cfg.victories, v.id] : cfg.victories.filter((x) => x !== v.id); rerender(); } }),
      el(doc, 'span', {}, say(v.nameKey, v.id)), !v.enabled ? el(doc, 'span', { class: 'later' }, tt('setup.offByMod')) : !ready ? later(16) : null);
  });
  // A mod may switch the default limit off (lock-era sets the score victory's turnLimit to null).
  const scoreParams = ruleset.victories?.score?.params ?? {};
  const limitOff = Object.hasOwn(scoreParams, 'turnLimit') && scoreParams.turnLimit === null;
  const speedDefault = ruleset.tuning?.victory?.turnLimits?.[cfg.speed];
  const victory = group(tt('setup.group.victory'),
    el(doc, 'div', { class: 'setup-row' }, el(doc, 'span', { class: 'setup-label' }, tt('setup.victories')), el(doc, 'div', { class: 'setup-ticks' }, ...victoryRows)),
    row(tt('setup.turnLimit'), el(doc, 'span', { class: 'seed-row' },
      select('turnLimit', cfg.turnLimit, [{ value: 'default', label: limitOff ? tt('setup.turnDefaultOff') : tt('setup.turnDefault', { n: speedDefault ?? '' }) }, { value: 'custom', label: tt('setup.custom') }, { value: 'none', label: tt('setup.noLimit') }], (v) => { cfg.turnLimit = v; }),
      cfg.turnLimit === 'custom' ? el(doc, 'input', { type: 'number', name: 'customTurns', min: '10', max: '2000', value: String(cfg.customTurns), onchange: (e) => { cfg.customTurns = e.target.value; } }) : null)),
    cfg.victories.length ? null : el(doc, 'p', { class: 'warn' }, tt('setup.noVictory')));

  // Pace, difficulty, world, battles, advanced.
  const eras = Object.values(ruleset.eras ?? {}).sort((a, b) => a.index - b.index);
  const pace = group(tt('setup.group.pace'),
    row(tt('setup.speed'), select('speed', cfg.speed, Object.keys(ruleset.tuning?.speeds ?? {}).map((id) => ({ value: id, label: tt(`setup.speed.${id}`) })), (v) => { cfg.speed = v; changed(); })),
    row(tt('setup.startEra'), select('startEra', cfg.startEra, eras.map((e) => ({ value: e.id, label: say(e.nameKey, e.id) })), (v) => { cfg.startEra = v; })));
  const levels = Object.values(ruleset.difficulty ?? {}).sort((a, b) => a.index - b.index);
  const level = ruleset.difficulty?.[cfg.difficulty];
  const difficulty = group(tt('setup.group.difficulty'),
    row(tt('setup.difficulty'), select('difficulty', cfg.difficulty, levels.map((d) => ({ value: d.id, label: say(d.nameKey, d.id) })), (v) => { cfg.difficulty = v; })),
    el(doc, 'p', { class: 'small', dataset: { field: 'difficulty-bonus' } }, level ? say(level.summaryKey, '') : ''),
    el(doc, 'p', { class: 'small muted' }, tt('setup.princeNote')));
  const world = group(tt('setup.group.world'),
    row(tt('setup.raiders'), select('raiders', cfg.raiders, choose('setup.raidersOpt', ['off', 'on', 'raging']), (v) => { cfg.raiders = v; })),
    row(tt('setup.events'), select('events', cfg.events ?? 'occasional', choose('setup.eventsOpt', ['off', 'occasional', 'frequent']), (v) => { cfg.events = v; })),
    row(tt('setup.disasters'), select('disasters', cfg.disasters ?? 'off', choose('setup.raidersOpt', ['off', 'on']), (v) => { cfg.disasters = v; })));
  // Battles (phase 18): auto-resolve, or fight your own with an interactive module.
  const interactive = moduleIds().filter((id) => getModule(id).kind === 'interactive');
  const mode = cfg.battleMode ?? conf.battleMode ?? 'auto';
  const battles = group(tt('setup.group.battles'),
    row(tt('setup.battleMode'), select('battleMode', mode, [{ value: 'auto', label: tt('setup.battleAuto') }, { value: 'ask', label: tt('setup.battleAsk'), disabled: !interactive.length }, { value: 'fight', label: tt('setup.battleFight'), disabled: !interactive.length }], (v) => { cfg.battleMode = v; })),
    row(tt('setup.battleModule'), select('battleModule', mode === 'auto' ? 'auto' : interactiveModule(cfg.battleModule, conf.battleModule), mode === 'auto' ? [{ value: 'auto', label: tt('setup.moduleAuto') }] : interactive.map((id) => ({ value: id, label: tt(`setup.module.${id}`) })), (v) => { cfg.battleModule = v; }, { disabled: mode === 'auto' })),
    el(doc, 'p', { class: 'small muted' }, tt(mode === 'auto' ? 'setup.battleNoteAuto' : 'setup.battleNoteFight')));
  const advanced = group(tt('setup.group.advanced'),
    row(tt('setup.fog'), select('fog', cfg.fog, choose('setup.onOff', ['on', 'off']), (v) => { cfg.fog = v; })),
    row(tt('setup.recorder'), select('recordAI', cfg.recordAI, choose('setup.journalOpt', ['on', 'off']), (v) => { cfg.recordAI = v; })));
  // (How often to autosave moved to Settings in the graphics overhaul G7.)

  // Two panes (graphics overhaul G7, docs/OVERHAUL.md 5.1): tabs on the left, the chosen tab in the
  // middle, and a summary card with your faction and the Start button always on the right.
  const stack = (...groups) => el(doc, 'div', { class: 'setup-stack' }, ...groups);
  const tabs = [['rules', rules, stack(pace, difficulty)], ['map', map, world], ['players', players], ['victory', victory], ['advanced', battles, advanced]];
  if (!tabs.some(([id]) => id === activeTab)) activeTab = 'rules';
  const tabButtons = tabs.map(([id]) => el(doc, 'button', { type: 'button', role: 'tab', class: `setup-tab${id === activeTab ? ' on' : ''}`, dataset: { tab: id }, 'aria-selected': String(id === activeTab),
    onclick: () => {
      activeTab = id;
      for (const b of host.querySelectorAll('[data-tab]')) { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); }
      for (const p of host.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== id;
    } }, tt(`setup.tab.${id}`)));
  const panels = tabs.map(([id, ...groups]) => el(doc, 'div', { class: 'setup-tabpanel', role: 'tabpanel', dataset: { panel: id }, hidden: id !== activeTab }, ...groups));

  host.replaceChildren(
    el(doc, 'div', { class: 'mods-head' }, el(doc, 'h2', { id: 'setup-heading' }, tt('setup.title')), el(doc, 'button', { type: 'button', class: 'btn back', onclick: onBack }, tt('setup.back'))),
    presets,
    el(doc, 'div', { class: 'setup-body' },
      el(doc, 'div', { class: 'setup-tabs', role: 'tablist', 'aria-label': tt('setup.title') }, ...tabButtons),
      el(doc, 'div', { class: 'setup-pane' }, ...panels),
      summaryCard()));

  /** The summary card: your faction (portrait, leader, trait, uniques), the game in a few lines, and Start. */
  function summaryCard() {
    const f = cfg.faction ? ruleset.factions[cfg.faction] : null;
    const leader = f ? ruleset.leaders?.[f.leaders?.[0]] : null;
    const uniques = f ? [...(f.uniqueUnits ?? []).map((id) => say(ruleset.units[id]?.nameKey, id)), ...(f.uniqueBuildings ?? []).map((id) => say(ruleset.buildings?.[id]?.nameKey, id))] : [];
    const src = f ? portrait(cfg.faction) : null;
    const sizeName = say(ruleset.mapSizes?.[cfg.map.size]?.nameKey, cfg.map.size ?? '');
    const typeName = scenarios.length ? say(ruleset.scenarios[cfg.scenario]?.nameKey, cfg.scenario) : mapPresets.length ? say(ruleset.mapPresets[cfg.map.preset]?.nameKey, cfg.map.preset) : say(ruleset.mapTypes?.[cfg.map.type]?.nameKey, cfg.map.type);
    return el(doc, 'aside', { class: 'setup-summary', dataset: { field: 'setup-summary' }, style: f ? `--faction:${f.colours.primary}` : '' },
      el(doc, 'div', { class: 'summary-head' },
        src ? el(doc, 'img', { class: 'summary-face', src, alt: '' }) : el(doc, 'span', { class: 'summary-face random', 'aria-hidden': 'true' }, '?'),
        el(doc, 'div', {},
          el(doc, 'h3', {}, f ? factionName(cfg.faction) : tt('setup.randomFaction')),
          el(doc, 'p', { class: 'small muted' }, leader ? say(leader.nameKey, '') : tt('setup.randomNote')))),
      f ? el(doc, 'p', { class: 'small' }, el(doc, 'strong', {}, say(f.trait?.nameKey, '')), ` ${say(f.trait?.descriptionKey, '')}`) : null,
      uniques.length ? el(doc, 'p', { class: 'small' }, tt('setup.uniques', { list: uniques.join(', ') })) : null,
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'see-cards' }, onclick: () => onPickFaction(cfg) }, tt('setup.seeCards')),
      el(doc, 'ul', { class: 'summary-lines' },
        el(doc, 'li', {}, scenarios.length ? typeName : tt('setup.sumMap', { size: sizeName, type: typeName })),
        el(doc, 'li', {}, tt('setup.sumRivals', { n: cfg.ais })),
        el(doc, 'li', {}, tt('setup.sumPace', { speed: tt(`setup.speed.${cfg.speed}`), level: say(ruleset.difficulty?.[cfg.difficulty]?.nameKey, cfg.difficulty) })),
        el(doc, 'li', {}, tt('setup.sumVictories', { n: cfg.victories.length }))),
      el(doc, 'button', { type: 'button', class: 'btn primary', dataset: { action: 'start-game' }, disabled: !cfg.victories.length && cfg.turnLimit === 'none', onclick: () => onStart(cfg) }, tt('setup.start')));
  }

  /** A folded section (the rivals, the teams) that remembers being opened across redraws. */
  function foldable(id, summary, ...children) {
    const d = el(doc, 'details', { class: 'setup-rivals', dataset: { fold: id }, open: Boolean(openFolds[id]) }, summary, ...children);
    d.addEventListener('toggle', () => { openFolds[id] = d.open; });
    return d;
  }
}

// Which tab is showing and which folded sections are open, kept across redraws.
let activeTab = 'rules';
const openFolds = {};
