// The selection panel's unit card (graphics overhaul G2): a portrait slot, the HP bar,
// stats with icons, action buttons showing their keys, odds against the enemy pointed
// at, promotions.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { foundingProblem, improvementProblem, builderTargets, preachTarget, combatKind, promotionOptions } from '../../sim/index.js';
import { renderTraderList } from '../tradeTab.js';
import { el, fill, knownWorld } from './shared.js';
import { icon, unitIconName } from './icons.js';

// The keys the game screen listens for (src/ui/game.js), shown on the buttons.
const ACTION_KEYS = {
  foundCity: { label: 'B', aria: 'B' },
  fortify: { label: 'F', aria: 'F' },
  skip: { label: 'S', aria: 'S' },
  sleep: { label: 'Z', aria: 'Z' },
  wake: { label: 'Z', aria: 'Z' },
  disband: { label: 'Del', aria: 'Delete' },
};

export function createUnitCard(g) {
  function oddsPanel() {
    if (!g.aim) return null;
    const target = g.aim.spec?.defender.city ? g.tt('odds.city', { name: g.aim.spec.defender.city.name })
      : (() => { const e = g.v.units.find((x) => x.tile === g.aim.tile && x.faction !== g.human); return e ? g.nameOfUnit(e.type, e.faction) : ''; })();
    if (g.aim.peaceWith) {
      return el(g.doc, 'div', { class: 'odds', dataset: { field: 'odds' } }, el(g.doc, 'h3', {}, g.tt('odds.title', { target })),
        el(g.doc, 'p', {}, g.tt('game.refused.atPeace')),
        el(g.doc, 'button', { type: 'button', class: 'btn small wide danger', dataset: { action: 'declare-war' },
          onclick: () => { g.run({ type: 'declareWar', faction: g.human, target: g.aim.peaceWith }); g.aimAt(g.aim.tile); } }, g.tt('game.declareWar', { faction: g.civName(g.aim.peaceWith) })));
    }
    if (!g.aim.odds) return el(g.doc, 'div', { class: 'odds', dataset: { field: 'odds' } }, el(g.doc, 'h3', {}, g.tt('odds.title', { target })));
    const o = g.aim.odds;
    const modText = (side) => {
      const list = g.aim.spec.modifiers[side].map((m) => `${m.amount > 0 ? '+' : ''}${m.amount} ${g.tt(`odds.mod.${m.source.split(':')[0]}`)}`).join(', ');
      return list ? el(g.doc, 'p', { class: 'muted small' }, g.tt('odds.mods', { side: g.tt(`odds.${side}`), list })) : null;
    };
    return el(g.doc, 'div', { class: `odds${o.win > 0.5 ? ' good' : o.lose > 0.3 ? ' bad' : ''}`, dataset: { field: 'odds' } },
      el(g.doc, 'h3', {}, g.tt('odds.title', { target })),
      el(g.doc, 'p', { class: 'win' }, g.tt('odds.win', { p: Math.round(o.win * 100) })),
      o.ranged ? null : el(g.doc, 'p', {}, g.tt('odds.youLose', { hp: Math.round(o.attackerLoss) })),
      el(g.doc, 'p', {}, g.tt('odds.theyLose', { hp: Math.round(o.defenderLoss) })),
      el(g.doc, 'p', { class: 'muted small' }, g.tt('odds.strength', { a: o.attack, d: o.defence })),
      modText('attacker'), modText('defender'));
  }

  function promotionPanel(u) {
    const options = promotionOptions(g.ruleset, u);
    if (!options.length) return null;
    return el(g.doc, 'div', { class: 'promote', dataset: { field: 'promote' } },
      el(g.doc, 'h3', {}, g.tt('promote.title')),
      ...options.map((id) => {
        const p = g.ruleset.promotions[id];
        return el(g.doc, 'button', { type: 'button', class: 'btn small wide', dataset: { promotion: id },
          onclick: () => { g.run({ type: 'promote', faction: g.human, unit: u.id, promotion: id }); g.render(); } },
        g.tt('promote.pick', { name: g.ruleset.text[p.nameKey] ?? id, text: g.ruleset.text[p.descriptionKey] ?? '' }));
      }));
  }

  function renderUnitCard(u) {
    const card = g.$('[data-field="unit-card"]');
    const actions = g.$('[data-field="actions"]');
    const def = g.ruleset.units[u.type];
    const turnsLeft = u.goto !== null ? (g.plan(u, u.goto)?.arrivesOnTurn ?? 0) + 1 : 0;
    const status = u.goto !== null ? g.tt('game.unit.status.goto', { turns: turnsLeft }) : g.tt(`game.unit.status.${u.activity}`, { turns: u.fortifiedTurns });
    const thresholds = g.ruleset.tuning?.experience?.promotionThresholds ?? [15, 45, 90, 150];
    const nextAt = thresholds.find((x) => x > (u.xp ?? 0));
    const strength = def.strength ?? 0;
    const hpClass = u.hp >= 70 ? '' : u.hp >= 35 ? ' hurt' : ' low';
    const me = g.v.factions.find((f) => f.id === u.faction);
    // The portrait (graphics overhaul G4): head and shoulders from the unit's sprite sheet in its
    // faction's colour, or its class icon until the sheet has loaded.
    const sheet = g.mapView.sheetFor(u.type, u.faction);
    const face = g.doc.createElement('canvas');
    face.width = 64;
    face.height = 64;
    face.className = 'portrait-art';
    const drawn = sheet?.drawPortrait(face.getContext('2d'), 64, g.colours[u.faction]);
    const worker = (def.tags ?? []).includes('worker');
    // Not loaded yet: draw the card again once it is.
    if (sheet && !drawn) sheet.image?.decode?.().then(() => { if (g.selected === u.id) g.render(); }).catch(() => {});
    const portrait = el(g.doc, 'div', { class: 'portrait', 'aria-hidden': 'true' }, drawn ? face : icon(g.doc, unitIconName(g.ruleset, u.type), { size: 32 }));
    portrait.style.setProperty('--faction-soft', g.ruleset.factions?.[me?.civ]?.colours.primary ?? '');
    const stat = (name, label, value) => el(g.doc, 'li', { title: label }, icon(g.doc, name, { size: 16, label }), el(g.doc, 'span', {}, value));
    // Compact (graphics overhaul G9): about 200px at 1366x768. The portrait, then the name and class
    // on one line with the health bar under them, then every stat and the status on one row.
    fill(card,
      el(g.doc, 'div', { class: 'unit-head' }, portrait,
        el(g.doc, 'div', { class: 'unit-title' },
          el(g.doc, 'p', { class: 'unit-name' }, el(g.doc, 'h2', {}, g.unitName(u)),
            el(g.doc, 'span', { class: 'muted' }, g.isCivilian(u) ? g.tt('game.unit.civilian') : (g.ruleset.text[g.ruleset.unitClasses[def.class]?.nameKey] ?? def.class))),
          el(g.doc, 'div', { class: `hp-bar${hpClass}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(u.hp), 'aria-label': g.tt('game.unit.health', { hp: u.hp }) },
            el(g.doc, 'span', { style: `width:${Math.max(0, Math.min(100, u.hp))}%` })),
          el(g.doc, 'ul', { class: 'stats' },
            g.isCivilian(u) ? null : stat('strength', g.tt('stat.strength'), String(strength)),
            def.rangedStrength ? stat('ranged', g.tt('stat.ranged'), `${def.rangedStrength} (${def.range ?? 1})`) : null,
            stat('moves', g.tt('stat.moves'), el(g.doc, 'span', { dataset: { field: 'moves' } }, `${u.moves}/${def.moves}`)),
            stat('hp', g.tt('stat.hp'), String(u.hp)),
            combatKind(g.ruleset, u) === 'none' ? null : stat('xp', g.tt('stat.xp'), `${u.xp ?? 0}/${nextAt ?? '-'}`),
            worker ? el(g.doc, 'li', { dataset: { field: 'charges' }, title: g.tt('game.unit.charges', { n: u.charges ?? 0 }) }, g.tt('game.unit.charges', { n: u.charges ?? 0 })) : null,
            el(g.doc, 'li', { class: 'status' }, status)))),
      (u.promotions ?? []).length ? el(g.doc, 'p', { class: 'muted small' }, g.tt('game.unit.promotions', { list: u.promotions.map((p) => g.ruleset.text[g.ruleset.promotions[p]?.nameKey] ?? p).join(', ') })) : null,
      promotionPanel(u),
      oddsPanel(),
    );
    // Each button shows its key (and says it to screen readers through aria-keyshortcuts).
    const button = (type, label, disabled = false, extra = '') => el(g.doc, 'button', { type: 'button', class: `btn small${extra}${type === 'disband' && g.confirmDisband ? ' danger' : ''}`, dataset: { act: type }, disabled, onclick: () => g.act(type),
      ...(ACTION_KEYS[type] ? { 'aria-keyshortcuts': ACTION_KEYS[type].aria } : {}) },
    el(g.doc, 'span', {}, label), ACTION_KEYS[type] ? el(g.doc, 'span', { class: 'key', 'aria-hidden': 'true' }, ACTION_KEYS[type].label) : null);
    const foundable = g.isFounder(u) && u.moves > 0 && !foundingProblem(knownWorld(g.v), g.ruleset, g.human, u.tile);
    // Builders: one button per improvement that fits a hex they can reach now.
    const improve = [];
    if (worker) {
      const world = knownWorld(g.v);
      for (const [id, imp] of Object.entries(g.ruleset.improvements ?? {})) {
        for (const tile of builderTargets(world, g.ruleset, id, u.tile)) {
          if (improvementProblem(world, g.ruleset, g.human, id, tile)) continue;
          const label = g.tt('game.action.improve', { name: g.ruleset.text[imp.nameKey] ?? id });
          improve.push(el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { improve: id }, title: g.ruleset.text[imp.descriptionKey] ?? '', disabled: u.moves <= 0,
            onclick: () => { const r = g.run({ type: 'buildImprovement', faction: g.human, unit: u.id, improvement: id, tile }); if (r) g.afterOrders(); } }, label));
          break;
        }
      }
    }
    const preach = g.ruleset.units[u.type]?.faithOnly && u.religion ? preachTarget(g.world0(), u) : null;
    const isTrader = (g.ruleset.units[u.type]?.tags ?? []).includes('trader');
    if ((g.ruleset.units[u.type]?.tags ?? []).includes('spy')) improve.push(el(g.doc, 'button', { type: 'button', class: 'btn small primary wide', dataset: { action: 'post-spy' }, onclick: () => g.openEmpire('spies') }, g.tt('spies.postFromCard')));
    if (isTrader) improve.push(renderTraderList(g.doc, { world: g.world0(), view: g.v, ruleset: g.ruleset, text: g.text, unit: u, name: g.civName,
      onStart: (city) => { const r = g.run({ type: 'startTradeRoute', faction: g.human, unit: u.id, city }); if (r) g.afterOrders(); } }));
    fill(actions, ...improve, ...[
      preach ? el(g.doc, 'button', { type: 'button', class: 'btn small primary wide', dataset: { act: 'spreadReligion' }, disabled: u.moves <= 0,
        onclick: () => { const r = g.run({ type: 'spreadReligion', faction: g.human, unit: u.id }); if (r) g.afterOrders(); } }, g.tt('game.action.preach', { city: preach.name })) : null,
      g.isFounder(u) ? button('foundCity', g.tt('game.action.found'), !foundable, ' primary') : null,
      g.isCivilian(u) ? null : button('fortify', g.tt('game.action.fortify'), u.activity === 'fortify'),
      button('skip', g.tt('game.action.skip'), u.moves <= 0 || u.activity === 'skip'),
      u.activity === 'sleep' ? button('wake', g.tt('game.action.wake')) : button('sleep', g.tt('game.action.sleep')),
      button('disband', g.confirmDisband ? g.tt('game.action.confirmDisband') : g.tt('game.action.disband')),
    ].filter(Boolean));
    // The how-to hint lives in Help and the empty panel; on a phone (taps differ) it stays here.
    g.$('[data-field="hint"]').textContent = g.lastTouch ? g.tt('game.hint.moveTouch') : '';
  }

  return { oddsPanel, promotionPanel, renderUnitCard };
}
