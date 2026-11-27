// The full-screen sheets: trees, diplomacy, Empire, journal, victory, the game menu and the end screen.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { renderTrees } from '../trees.js';
import { renderEmpire } from '../empire.js';
import { renderDiplomacy } from '../diplomacy.js';
import { renderReligionTab } from '../religionTab.js';
import { renderTradeTab } from '../tradeTab.js';
import { renderSpiesTab } from '../spiesTab.js';
import { renderJournal } from '../journal.js';
import { renderVictory, renderEnd } from '../victoryPanel.js';
import { renderGameMenu, codeBox } from '../gameMenu.js';
import { el, knownWorld } from '../hud/shared.js';

export function createOverlays(g) {
  function openTrees(tree = g.lastTree) {
    g.lastTree = tree === 'civics' && g.ruleset.civics ? 'civics' : 'techs';
    const rate = g.myCities().reduce((n, c) => n + g.yieldsOf(c).total[g.lastTree === 'civics' ? 'culture' : 'science'], 0);
    const civ = g.lastTree === 'civics' ? { tree: 'civics' } : {};
    renderTrees(g.doc, g.panel.querySelector('[data-field="panel-body"]'), {
      world: knownWorld(g.v), view: g.v, ruleset: g.ruleset, text: g.text, tree: g.lastTree, rate,
      onResearch: (id) => { g.run({ type: 'setResearch', faction: g.human, item: id, ...civ }); openTrees(g.lastTree); },
      onQueue: (id) => { g.run({ type: 'queueResearch', faction: g.human, item: id, ...civ }); openTrees(g.lastTree); },
      onTab: (t2) => openTrees(t2),
      onClose: () => { g.panel.hidden = true; },
    });
    g.panel.hidden = false;
  }

  function openDiplomacy(select = g.dipUi.selected) {
    g.dipUi.selected = select ?? Object.keys(g.v.opinions ?? {})[0] ?? null;
    const civOf = (id) => g.v.factions.find((f) => f.id === id)?.civ;
    renderDiplomacy(g.doc, g.panel.querySelector('[data-field="panel-body"]'), {
      world: knownWorld(g.v), view: g.v, ruleset: g.ruleset, text: g.text, ui: g.dipUi, name: g.civName,
      leaderName: (id) => g.ruleset.text[g.ruleset.leaders?.[g.ruleset.factions?.[civOf(id)]?.leaders?.[0]]?.nameKey] ?? '',
      // Graphics overhaul G4: the leader's portrait, if the skin has one.
      portrait: (id) => g.sheets[`leader.${g.ruleset.factions?.[civOf(id)]?.leaders?.[0]}`]?.src ?? null,
      act: {
        select: (id) => { g.dipUi.selected = id; g.dipUi.deal = null; openDiplomacy(id); },
        editDeal: (deal) => { g.dipUi.deal = deal; openDiplomacy(); },
        propose: (target, give, get) => { if (g.run({ type: 'proposeDeal', faction: g.human, target, give, get })) { g.toast(g.tt('dip.sent', { faction: g.civName(target) })); g.dipUi.deal = null; } openDiplomacy(); },
        answer: (deal, accept) => { g.run({ type: 'answerDeal', faction: g.human, deal, accept }); openDiplomacy(); },
        denounce: (target) => { g.run({ type: 'denounce', faction: g.human, target }); openDiplomacy(); },
        declareWar: (target) => { g.run({ type: 'declareWar', faction: g.human, target }); openDiplomacy(); },
        close: () => { g.dipUi.deal = null; g.panel.hidden = true; },
      },
    });
    g.panel.hidden = false;
  }

  function openEmpire(tab = g.empireTab) {
    g.empireTab = tab;
    const world = knownWorld(g.v);
    renderEmpire(g.doc, g.panel.querySelector('[data-field="panel-body"]'), {
      world, view: g.v, ruleset: g.ruleset, text: g.text, pick: g.pickSlot, tab,
      onTab: (t2) => { g.pickSlot = null; openEmpire(t2); },
      tradeTab: g.ruleset.trade ? () => renderTradeTab(g.doc, { world, view: g.v, ruleset: g.ruleset, text: g.text, name: g.civName }) : null,
      spiesTab: g.ruleset.espionage ? () => renderSpiesTab(g.doc, {
        world, view: g.v, ruleset: g.ruleset, text: g.text, name: g.civName,
        act: {
          assignUnit: (unit, city) => { g.run({ type: 'assignSpy', faction: g.human, unit, city }); openEmpire('spies'); },
          move: (spy, city) => { g.run({ type: 'assignSpy', faction: g.human, spy, city }); openEmpire('spies'); },
          mission: (spy, mission) => { g.run({ type: 'startMission', faction: g.human, spy, mission }); openEmpire('spies'); },
        },
      }) : null,
      religionTab: g.ruleset.beliefs ? () => renderReligionTab(g.doc, {
        world, view: g.v, ruleset: g.ruleset, text: g.text, name: g.civName, form: g.foundForm,
        act: {
          pantheon: (belief) => { g.run({ type: 'choosePantheon', faction: g.human, belief }); openEmpire('religion'); },
          form: (f) => { g.foundForm = f; openEmpire('religion'); },
          found: (f) => { if (g.run({ type: 'foundReligion', faction: g.human, ...f })) g.foundForm = {}; openEmpire('religion'); },
        },
      }) : null,
      onGovernment: (id) => { g.pickSlot = null; g.run({ type: 'setGovernment', faction: g.human, government: id }); openEmpire(); },
      onPolicy: (kind, index, policy) => { g.pickSlot = null; g.run({ type: 'setPolicy', faction: g.human, slot: kind, index, policy }); openEmpire(); },
      onPick: (slot) => { g.pickSlot = slot; openEmpire(); },
      onClose: () => { g.pickSlot = null; g.panel.hidden = true; },
    });
    g.panel.hidden = false;
  }

  function openJournal() {
    renderJournal(g.doc, g.panel.querySelector('[data-field="panel-body"]'), {
      ais: Object.fromEntries(Object.entries(g.journals).map(([id, journal]) => [id, { memory: { journal } }])), factions: g.v.factions, ruleset: g.ruleset, text: g.text, factionName: (id) => (id === 'raiders' ? g.raidersName() : g.civName(id)), onClose: () => { g.panel.hidden = true; },
    });
    g.panel.hidden = false;
  }

  const nameOf = (id) => (id === g.human ? g.tt('victory.you', { faction: g.civName(id) }) : g.civName(id));

  function openVictory() {
    renderVictory(g.doc, g.panel.querySelector('[data-field="panel-body"]'), { state: g.state, ruleset: g.ruleset, text: g.text, human: g.human, name: nameOf, colours: g.colours, onClose: () => { g.panel.hidden = true; } });
    g.panel.hidden = false;
  }

  async function exportInto(out) {
    if (!g.hooks.exportCode) return;
    out.replaceChildren(el(g.doc, 'p', { class: 'small muted' }, g.tt('menu.working')));
    const code = await g.hooks.exportCode(g.snapshot(), g.saveLabel());
    out.replaceChildren(codeBox(g.doc, g.text, code, `atlas-turn-${g.state.turn}.txt`));
  }

  function openMenu() {
    renderGameMenu(g.doc, g.panel.querySelector('[data-field="panel-body"]'), {
      text: g.text, label: g.saveLabel(),
      onSave: async (label, out) => {
        out.replaceChildren(el(g.doc, 'p', { class: 'small muted' }, g.tt('menu.working')));
        const r = await g.hooks.saveSlot?.(g.snapshot(), label);
        if (r?.ok) out.replaceChildren(el(g.doc, 'p', { class: 'ok', dataset: { field: 'saved' } }, g.tt('menu.saved', { label })));
        else {
          out.replaceChildren(el(g.doc, 'p', { class: 'warn' }, r?.message ?? g.tt('menu.saveFailed')));
          await exportInto(out.appendChild(el(g.doc, 'div')));
        }
      },
      onExport: (out) => exportInto(out),
      onVictory: openVictory,
      onTitle: () => { g.panel.hidden = true; g.hooks.quit?.(); },
      onClose: () => { g.panel.hidden = true; },
    });
    g.panel.hidden = false;
  }

  function showEnd() {
    renderEnd(g.doc, g.panel.querySelector('[data-field="panel-body"]'), {
      state: g.state, ruleset: g.ruleset, text: g.text, human: g.human, name: nameOf,
      onExport: () => exportInto(g.panel.querySelector('[data-field="end-code"]')),
      onNew: () => { g.panel.hidden = true; g.hooks.newGame?.(); },
      onTitle: () => { g.panel.hidden = true; g.hooks.quit?.(); },
      onClose: () => { g.panel.hidden = true; },
    });
    g.panel.hidden = false;
    g.hooks.ended?.();
  }

  return { openTrees, openDiplomacy, openEmpire, openJournal, nameOf, openVictory, exportInto, openMenu, showEnd };
}
