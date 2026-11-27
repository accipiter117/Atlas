// The advice line: the most useful next step, with a button that does it.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { slotsOf, workingGovernment, governmentAvailable, policyAvailable, pantheonOf, foundedBy, pantheonFaith, foundFaith, holyCityOptions, religionLimit } from '../../sim/index.js';
import { rankTechs, rankCivics } from '../../ai/index.js';
import { el, fill, knownWorld } from './shared.js';

export function createAdvice(g) {
  /** The civic the AI's planner would pick in your place. */
  function civicSuggestion() {
    return g.ruleset.civics ? rankCivics(knownWorld(g.v), g.v, g.ruleset, { path: 'score' })[0]?.cmd.item ?? null : null;
  }

  /** A government you could adopt and have not (only when you have none yet). */
  function readyGovernment() {
    if (!g.ruleset.governments || g.v.government?.id || g.v.government?.anarchy || g.v.pendingGovernment) return null;
    return Object.values(g.ruleset.governments).find((gov) => governmentAvailable(knownWorld(g.v), g.ruleset, g.human, gov.id))?.id ?? null;
  }

  /** Is a policy slot of your working government empty while a card could fill it? */
  function emptySlot() {
    const world = knownWorld(g.v);
    const work = workingGovernment(world, g.human);
    if (!work.id) return false;
    const slots = slotsOf(world, g.ruleset, g.human, work.id);
    const inUse = new Set(Object.values(work.policies).flat().filter(Boolean));
    const cards = Object.values(g.ruleset.policies ?? {}).filter((p) => !inUse.has(p.id) && policyAvailable(world, g.ruleset, g.human, p.id));
    return Object.entries(slots).some(([kind, n]) => (work.policies[kind] ?? []).filter(Boolean).length < n && cards.some((p) => kind === 'wildcard' || p.slot === kind));
  }

  /** The tech the AI's own science planner would pick in your place. */
  function suggestion() {
    return rankTechs(knownWorld(g.v), g.v, g.ruleset, { path: 'score' })[0]?.cmd.item ?? null;
  }

  /** The advice line: the highest-priority piece of advice whose condition holds (rules/<mod>/ui/advice.json). */
  function currentAdvice() {
    const checks = {
      eventPending: () => g.v.pendingEvent && { city: g.v.cities.find((c) => c.id === g.v.pendingEvent.city)?.name ?? '' },
      noCities: () => g.myCities().length === 0 && g.myUnits().some(g.isFounder) && {},
      cityStarving: () => g.starving().length && { city: g.starving()[0].name, target: g.starving()[0].id },
      cityNoProduction: () => g.noProduction().length && { city: g.noProduction()[0].name, target: g.noProduction()[0].id },
      noResearch: () => g.ruleset.techs && !g.v.research?.current && !(g.v.research?.queue ?? []).length && suggestion() && { tech: g.techName(suggestion()) },
      noCivic: () => g.ruleset.civics && !g.v.civicResearch?.current && !(g.v.civicResearch?.queue ?? []).length && civicSuggestion() && { civic: g.civicName(civicSuggestion()) },
      governmentReady: () => readyGovernment() && { government: g.ruleset.text[g.ruleset.governments[readyGovernment()].nameKey] },
      emptyPolicySlot: () => emptySlot() && {},
      pantheonReady: () => g.ruleset.beliefs && !pantheonOf(knownWorld(g.v), g.human) && (g.v.stocks?.faith ?? 0) >= pantheonFaith(knownWorld(g.v), g.ruleset) && {},
      religionReady: () => {
        const w = knownWorld(g.v);
        return g.ruleset.beliefs && pantheonOf(w, g.human) && !foundedBy(w, g.human) && (g.v.stocks?.faith ?? 0) >= foundFaith(w, g.ruleset)
          && holyCityOptions(w, g.ruleset, g.human).length && Object.keys(g.v.religion?.religions ?? {}).length < religionLimit(w, g.ruleset) && {};
      },
      goldRunningOut: () => g.goldTurnsLeft() <= (g.ruleset.tuning?.economy?.bankruptcyWarningTurns ?? 2) && { n: g.goldTurnsLeft() },
      unitsNeedOrders: () => g.idle().length && { n: g.idle().length },
      cityCanBuyTile: () => false,
      readyToEnd: () => ({}),
    };
    const list = Object.values(g.ruleset.advice ?? {}).sort((a, b) => b.priority - a.priority);
    for (const a of list) {
      const args = checks[a.condition]?.();
      if (args) return { ...a, args };
    }
    return null;
  }

  function doAdvice(a) {
    if (a.action === 'selectSettler') { const s = g.myUnits().find(g.isFounder); if (s) g.select(s.id, { centre: true }); }
    else if (a.action === 'openCity') g.openCityDrawer(a.args.target, { centre: true });
    else if (a.action === 'selectUnit') g.selectNextIdle();
    else if (a.action === 'endTurn') g.endTurn();
    else if (a.action === 'research') g.run({ type: 'setResearch', faction: g.human, item: suggestion() });
    else if (a.action === 'civic') g.run({ type: 'setResearch', faction: g.human, item: civicSuggestion(), tree: 'civics' });
    else if (a.action === 'empire') g.openEmpire('government');
    else if (a.action === 'religion') g.openEmpire('religion');
    else if (a.action === 'event') g.showEventDialog();
  }

  function renderAdvice() {
    const a = currentAdvice();
    const line = g.$('[data-field="advice"]');
    if (!a) { fill(line, ); return; }
    fill(line, 
      el(g.doc, 'span', { class: 'advice-text' }, g.tt(a.textKey, a.args)),
      el(g.doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'advice' }, onclick: () => doAdvice(a) }, g.tt(a.actionKey ?? 'advice.do')),
    );
  }

  return { civicSuggestion, readyGovernment, emptySlot, suggestion, currentAdvice, doAdvice, renderAdvice };
}
