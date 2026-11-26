// Gold, upkeep and bankruptcy (section 3.3).
//
// Each turn a faction pays upkeep for every unit and building (from their
// data, adjusted by upkeepPercent effects), less a small free allowance for
// units (economy.freeUpkeep plus freeUpkeepPerCity for each city). If gold would go below zero, a
// unit chosen by the seeded dice disbands and gold stays at zero; it happens
// again each turn until upkeep is covered. While gold is falling, a warning
// event fires when it will run out within economy.bankruptcyWarningTurns.

import { random } from '../core/rng.js';
import { sumHook, buildingDef, effectsFor } from './effects/index.js';
import { citiesOf } from './cities.js';
import { factionUnits } from './units.js';

export function upkeepOf(state, ruleset, factionId) {
  const effects = effectsFor(state, ruleset, factionId);
  let units = 0;
  for (const u of factionUnits(state, factionId)) units += ruleset.units[u.type]?.upkeep ?? 0;
  let buildings = 0;
  for (const c of citiesOf(state, factionId)) for (const b of c.buildings) buildings += buildingDef(ruleset, b)?.upkeep ?? 0;
  const uPct = sumHook('upkeep', state, ruleset, factionId, { kind: 'units' }, effects);
  const bPct = sumHook('upkeep', state, ruleset, factionId, { kind: 'buildings' }, effects);
  units = Math.max(0, Math.round(units * (1 + uPct / 100)));
  // A small allowance of unit upkeep is free, so a new faction is not broke before its first city.
  const econ = ruleset.tuning?.economy ?? {};
  const free = (econ.freeUpkeep ?? 0) + (econ.freeUpkeepPerCity ?? 0) * citiesOf(state, factionId).length;
  units = Math.max(0, units - free);
  buildings = Math.max(0, Math.round(buildings * (1 + bPct / 100)));
  return { units, buildings, total: units + buildings };
}

/** Pay upkeep from a faction's gold (a working copy); disband if broke; warn ahead. */
export function payUpkeep(state, ruleset, factionId, income, events) {
  const faction = state.factions.find((f) => f.id === factionId);
  const upkeep = upkeepOf(state, ruleset, factionId);
  const net = income - upkeep.total;
  faction.stocks.gold += net;
  faction.lastNetGold = net;
  if (faction.stocks.gold < 0) {
    const payers = factionUnits(state, factionId).filter((u) => (ruleset.units[u.type]?.upkeep ?? 0) > 0)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (payers.length) {
      const victim = payers[Math.floor(random(state) * payers.length)];
      delete state.units[victim.id];
      events.push({ type: 'unitDisbanded', reason: 'bankrupt', unit: victim.id, unitType: victim.type, faction: factionId, tile: victim.tile });
    }
    faction.stocks.gold = 0;
  } else if (net < 0) {
    const turns = Math.floor(faction.stocks.gold / -net) + 1;
    if (turns <= (ruleset.tuning?.economy?.bankruptcyWarningTurns ?? 2)) events.push({ type: 'goldWarning', faction: factionId, turns, net });
  }
  return net;
}
