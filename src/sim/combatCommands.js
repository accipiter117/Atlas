// Combat commands (sections 3.6 and 5.4): attack, cityAttack, resolveBattle,
// autoResolveBattle, captureChoice and promote.
//
// Every fight goes through runBattle: build the spec, draw its seed from the
// game dice once, pick the module (the setup's battle module if it can handle
// this fight, otherwise auto), and either resolve it now or, for an
// interactive module with a human side, wait in state.pendingBattle for the
// screen to send back resolveBattle (or autoResolveBattle).

import { currentFactionId } from './queries.js';
import { createRng } from '../core/rng.js';
import { getModule, autoModule, validateResult } from '../battles/index.js';
import { attackProblem, buildSpec, buildCitySpec, seedBattle, applyResult, promotionsAvailable, cityHasWalls, defenderAt, combatKind } from './combat.js';
import { updateVisibility, VISIBLE } from './visibility.js';
import { distance } from './borders.js';
import { unitDef } from './units.js';

const refuse = (code, message) => ({ code, message });

function chooseModule(state, spec) {
  const wanted = getModule(state.setup?.battleModule ?? 'auto');
  return wanted && wanted.canHandle(spec) ? wanted : autoModule();
}

/** Run a battle from its spec (working copy). Returns 'pending' or 'done'. */
export function runBattle(state, ruleset, spec, events, { forceAuto = false } = {}) {
  seedBattle(state, spec);
  const mod = forceAuto ? autoModule() : chooseModule(state, spec);
  const human = spec.attacker.human || spec.defender.human;
  if (mod.kind === 'interactive' && human && (state.setup?.battleMode ?? 'auto') !== 'auto') {
    state.pendingBattle = { spec, module: mod.id };
    events.push({ type: 'battlePending', battleId: spec.battleId, module: mod.id });
    return 'pending';
  }
  const rng = createRng(spec.seed);
  const result = mod.kind === 'instant' ? mod.resolve(spec, rng.next) : mod.simulate(spec, rng.next);
  const problem = validateResult(spec, result);
  if (problem) throw new Error(`Battle module ${mod.id} returned a bad result: ${problem}`);
  applyResult(state, ruleset, spec, result, events);
  state.battleLog ??= [];
  state.battleLog.push({ battleId: spec.battleId, module: mod.id, result });
  return 'done';
}

function seenFor(state, factionId) {
  const fog = state.fog?.[factionId];
  return fog ? (t) => fog[t] === VISIBLE : null;
}

export const attack = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const unit = state.units?.[cmd.unit];
    if (!unit) return refuse('unknownUnit', `No unit "${cmd.unit}"`);
    if (unit.faction !== cmd.faction) return refuse('notYourUnit', 'Not your unit');
    const why = attackProblem(state, ruleset, unit, cmd.target, seenFor(state, cmd.faction));
    return why ? refuse(why, `Cannot attack there (${why})`) : null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    // Only civilians there: walk in and take them.
    if (!defenderAt(state, ruleset, unit.faction, cmd.target) && !Object.values(state.cities).some((c) => c.tile === cmd.target)) {
      for (const u of Object.values(state.units)) {
        if (u.tile === cmd.target && u.faction !== unit.faction) {
          u.faction = unit.faction; u.moves = 0; u.goto = null; u.activity = 'none';
          events.push({ type: 'unitCaptured', unit: u.id, unitType: u.type, faction: unit.faction, tile: cmd.target });
        }
      }
      const from = unit.tile;
      unit.tile = cmd.target;
      unit.moves = 0;
      unit.acted = true;
      events.push({ type: 'unitMoved', unit: unit.id, faction: unit.faction, path: [from, cmd.target] });
      updateVisibility(state, ruleset, unit.faction);
      return;
    }
    const spec = buildSpec(state, ruleset, unit, cmd.target);
    spec.from = unit.tile;
    runBattle(state, ruleset, spec, events);
    for (const f of [spec.attacker.faction, spec.defender.faction]) if (state.fog?.[f]) updateVisibility(state, ruleset, f);
  },
};

export const cityAttack = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const city = state.cities?.[cmd.city];
    if (!city || city.faction !== cmd.faction) return refuse('notYourCity', 'Not your city');
    if (!cityHasWalls(ruleset, city)) return refuse('needsWalls', 'A city needs walls to shoot');
    if (city.shotTurn === state.turn) return refuse('alreadyShot', 'This city has already shot this turn');
    if (distance(state.map, city.tile, cmd.target) > (ruleset.tuning?.combat?.cityRange ?? 2)) return refuse('outOfRange', 'Out of range');
    const seen = seenFor(state, cmd.faction);
    if (seen && !seen(cmd.target)) return refuse('cannotSee', 'You cannot see that hex');
    if (!defenderAt(state, ruleset, cmd.faction, cmd.target)) return refuse('noEnemy', 'No enemy unit there');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const spec = buildCitySpec(state, ruleset, state.cities[cmd.city], cmd.target);
    runBattle(state, ruleset, spec, events, { forceAuto: true });
    updateVisibility(state, ruleset, cmd.faction);
  },
};

export const resolveBattle = {
  validate(state, cmd) {
    const p = state.pendingBattle;
    if (!p) return refuse('noBattle', 'No battle is waiting');
    const problem = validateResult(p.spec, cmd.result);
    return problem ? refuse('badResult', `The battle result was refused: ${problem}`) : null;
  },
  apply(state, cmd, events, ruleset) {
    const { spec, module } = state.pendingBattle;
    state.pendingBattle = null;
    applyResult(state, ruleset, spec, cmd.result, events);
    state.battleLog ??= [];
    state.battleLog.push({ battleId: spec.battleId, module, result: cmd.result });
    for (const f of [spec.attacker.faction, spec.defender.faction]) if (state.fog?.[f]) updateVisibility(state, ruleset, f);
  },
};

export const autoResolveBattle = {
  validate(state) {
    return state.pendingBattle ? null : refuse('noBattle', 'No battle is waiting');
  },
  apply(state, cmd, events, ruleset) {
    const { spec } = state.pendingBattle;
    state.pendingBattle = null;
    const result = autoModule().resolve(spec, createRng(spec.seed).next);
    applyResult(state, ruleset, spec, result, events);
    state.battleLog ??= [];
    state.battleLog.push({ battleId: spec.battleId, module: 'auto', result });
    for (const f of [spec.attacker.faction, spec.defender.faction]) if (state.fog?.[f]) updateVisibility(state, ruleset, f);
  },
};

export const captureChoice = {
  validate(state, cmd) {
    const p = state.pendingCapture;
    if (!p || p.faction !== cmd.faction || p.city !== cmd.city) return refuse('noCapture', 'No captured city is waiting for a choice');
    if (!['keep', 'raze'].includes(cmd.choice)) return refuse('badChoice', 'Keep or raze');
    if (cmd.choice === 'raze' && state.cities[cmd.city].originalCapital) return refuse('cannotRazeCapital', 'Original capitals cannot be razed');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const city = state.cities[cmd.city];
    state.pendingCapture = null;
    if (cmd.choice === 'keep') {
      city.pop = Math.max(1, Math.floor(city.pop * (1 - (ruleset.tuning?.cities?.captureLoss ?? 0.5))));
      city.razing = false;
    } else {
      city.razing = true;
    }
    events.push({ type: 'captureChosen', city: city.id, choice: cmd.choice, faction: cmd.faction });
  },
};

/** Promotions this unit could take now. */
export function promotionOptions(ruleset, unit) {
  if (promotionsAvailable(ruleset, unit) <= 0) return [];
  const def = unitDef(ruleset, unit);
  const tree = ruleset.unitClasses?.[def.class]?.promotionTree ?? def.class;
  const have = unit.promotions ?? [];
  return Object.values(ruleset.promotions ?? {}).filter((p) => (p.class === tree || p.class === def.class) && !have.includes(p.id)
    && p.tier <= have.length + 1 && (!(p.requires ?? []).length || p.requires.some((r) => have.includes(r))))
    .map((p) => p.id);
}

export const promote = {
  validate(state, cmd, ruleset) {
    if (cmd.faction !== currentFactionId(state)) return refuse('notYourTurn', 'Wait for your turn');
    const unit = state.units?.[cmd.unit];
    if (!unit || unit.faction !== cmd.faction) return refuse('notYourUnit', 'Not your unit');
    if (combatKind(ruleset, unit) === 'none') return refuse('cannotPromote', 'Civilians cannot be promoted');
    if (!promotionOptions(ruleset, unit).includes(cmd.promotion)) return refuse('badPromotion', 'That promotion is not available');
    return null;
  },
  apply(state, cmd) {
    const unit = state.units[cmd.unit];
    unit.promotions = [...(unit.promotions ?? []), cmd.promotion];
  },
};
