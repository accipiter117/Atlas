// City commands: foundCity, setProduction, queueProduction, buyItem,
// setFocus, lockTile, unlockTile, buyTile. Plus the start-of-turn work for a
// faction's cities: yields, growth, production, borders and stocks.

import { currentFactionId } from './queries.js';
import { foundingProblem, foundCity as found, assignCitizens, canBuild, itemCost, completeItem, workable, citiesOf } from './cities.js';
import { cityYields } from './yields.js';
import { applyGrowth } from './growth.js';
import { growBorders, claimable, tilePrice, claimTile } from './borders.js';
import { updateVisibility } from './visibility.js';
import { neighbourCache } from './map.js';

const refuse = (code, message) => ({ code, message });

function myTurn(state, cmd) {
  return cmd.faction === currentFactionId(state) ? null : refuse('notYourTurn', `It is not ${cmd.faction}'s turn`);
}

function ownCity(state, cmd) {
  const turn = myTurn(state, cmd);
  if (turn) return [null, turn];
  const city = state.cities?.[cmd.city];
  if (!city) return [null, refuse('unknownCity', `No city "${cmd.city}"`)];
  if (city.faction !== cmd.faction) return [null, refuse('notYourCity', `${cmd.city} belongs to ${city.faction}`)];
  return [city, null];
}

function validItem(item) {
  return item && (item.kind === 'unit' || item.kind === 'building') && typeof item.id === 'string';
}

export const foundCity = {
  validate(state, cmd, ruleset) {
    const turn = myTurn(state, cmd);
    if (turn) return turn;
    const unit = state.units?.[cmd.unit];
    if (!unit) return refuse('unknownUnit', `No unit "${cmd.unit}"`);
    if (unit.faction !== cmd.faction) return refuse('notYourUnit', `${cmd.unit} belongs to ${unit.faction}`);
    if (!(ruleset.units[unit.type]?.tags ?? []).includes('founder')) return refuse('notFounder', 'Only settlers can found cities');
    if (unit.moves <= 0) return refuse('noMoves', 'This unit has no moves left');
    const problem = foundingProblem(state, ruleset, cmd.faction, unit.tile);
    return problem ? refuse(problem, `Cannot found a city here (${problem})`) : null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    delete state.units[cmd.unit];
    const city = found(state, ruleset, cmd.faction, unit.tile);
    events.push({ type: 'cityFounded', city: city.id, name: city.name, faction: cmd.faction, tile: city.tile });
    updateVisibility(state, ruleset, cmd.faction);
  },
};

export const setProduction = {
  validate(state, cmd, ruleset) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!validItem(cmd.item) || !canBuild(state, ruleset, city, cmd.item)) return refuse('cannotBuild', 'This city cannot build that');
    return null;
  },
  apply(state, cmd) {
    const city = state.cities[cmd.city];
    const head = city.queue[0];
    // Production carries over to the new choice.
    if (!head || head.kind !== cmd.item.kind || head.id !== cmd.item.id) city.queue = [{ kind: cmd.item.kind, id: cmd.item.id }, ...city.queue.slice(1)];
  },
};

export const queueProduction = {
  validate(state, cmd, ruleset) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!validItem(cmd.item) || !canBuild(state, ruleset, city, cmd.item)) return refuse('cannotBuild', 'This city cannot build that');
    if (city.queue.length >= (ruleset.tuning?.cities?.queueLength ?? 8)) return refuse('queueFull', 'The queue is full');
    return null;
  },
  apply(state, cmd) {
    state.cities[cmd.city].queue.push({ kind: cmd.item.kind, id: cmd.item.id });
  },
};

export function buyPrice(ruleset, city) {
  const item = city.queue[0];
  if (!item) return null;
  return Math.ceil((itemCost(ruleset, item) - city.progress) * (ruleset.tuning?.economy?.goldPerProduction ?? 2));
}

export const buyItem = {
  validate(state, cmd, ruleset) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!city.queue.length) return refuse('nothingToBuy', 'Choose something to build first');
    const faction = state.factions.find((f) => f.id === cmd.faction);
    if (faction.stocks.gold < buyPrice(ruleset, city)) return refuse('notEnoughGold', 'Not enough gold');
    const item = city.queue[0];
    if (item.kind === 'unit') {
      const spots = [city.tile, ...neighbourCache(state.map)[city.tile].filter((j) => j >= 0)];
      const free = spots.some((t) => !Object.values(state.units).some((u) => u.tile === t && u.faction !== city.faction));
      if (!free) return refuse('noRoom', 'There is no room for a new unit');
    }
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const city = state.cities[cmd.city];
    const faction = state.factions.find((f) => f.id === cmd.faction);
    const price = buyPrice(ruleset, city);
    const done = completeItem(state, ruleset, city, city.queue[0]);
    if (!done) return;
    faction.stocks.gold -= price;
    city.queue.shift();
    city.progress = 0;
    events.push({ ...done, bought: true, price });
    updateVisibility(state, ruleset, cmd.faction);
  },
};

export const setFocus = {
  validate(state, cmd, ruleset) {
    const [, problem] = ownCity(state, cmd);
    if (problem) return problem;
    return ruleset.focuses?.[cmd.focus] ? null : refuse('unknownFocus', `No focus "${cmd.focus}"`);
  },
  apply(state, cmd, events, ruleset) {
    const city = state.cities[cmd.city];
    city.focus = cmd.focus;
    assignCitizens(state, ruleset, city);
  },
};

export const lockTile = {
  validate(state, cmd, ruleset) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!workable(state, ruleset, city).includes(cmd.tile)) return refuse('notWorkable', 'This city cannot work that tile');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const city = state.cities[cmd.city];
    if (!city.locks.includes(cmd.tile)) {
      city.locks.push(cmd.tile);
      // With every citizen locked, the oldest lock gives way.
      while (city.locks.length > city.pop) city.locks.shift();
    }
    assignCitizens(state, ruleset, city);
  },
};

export const unlockTile = {
  validate(state, cmd) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    return city.locks.includes(cmd.tile) ? null : refuse('notLocked', 'That tile is not locked');
  },
  apply(state, cmd, events, ruleset) {
    const city = state.cities[cmd.city];
    city.locks = city.locks.filter((t) => t !== cmd.tile);
    assignCitizens(state, ruleset, city);
  },
};

export const buyTile = {
  validate(state, cmd, ruleset) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!claimable(state, ruleset, city).includes(cmd.tile)) return refuse('cannotBuyTile', 'That tile cannot be bought by this city');
    const faction = state.factions.find((f) => f.id === cmd.faction);
    if (faction.stocks.gold < tilePrice(state, ruleset, city, cmd.tile)) return refuse('notEnoughGold', 'Not enough gold');
    return null;
  },
  apply(state, cmd, events, ruleset) {
    const city = state.cities[cmd.city];
    const faction = state.factions.find((f) => f.id === cmd.faction);
    faction.stocks.gold -= tilePrice(state, ruleset, city, cmd.tile);
    claimTile(state, city, cmd.tile);
    assignCitizens(state, ruleset, city);
    events.push({ type: 'tileBought', city: city.id, tile: cmd.tile, faction: cmd.faction });
    updateVisibility(state, ruleset, cmd.faction);
  },
};

/** Start of a faction's turn (section 3.14): collect yields, grow or starve, production, borders. */
export function startCitiesTurn(state, ruleset, factionId, events) {
  const faction = state.factions.find((f) => f.id === factionId);
  for (const city of citiesOf(state, factionId)) {
    const y = cityYields(state, ruleset, city);
    faction.stocks.gold += y.total.gold;
    faction.stocks.science += y.total.science;
    faction.stocks.faith += y.total.faith;
    faction.stocks.culture += y.total.culture;

    // A river on any edge of the city's tile means the city sits beside it.
    const nearRiver = state.map.river[city.tile] !== 0;
    const grew = applyGrowth(city, y.surplus, ruleset.tuning, nearRiver);
    if (grew) {
      assignCitizens(state, ruleset, city);
      events.push({ type: grew === 'grew' ? 'cityGrew' : 'cityStarved', city: city.id, pop: city.pop, faction: factionId });
    }

    if (city.queue.length) {
      city.progress += y.total.production;
      const item = city.queue[0];
      if (city.progress >= itemCost(ruleset, item)) {
        const done = completeItem(state, ruleset, city, item);
        if (done) {
          city.progress -= itemCost(ruleset, item);
          city.queue.shift();
          events.push(done);
        }
      }
    }

    const claimed = growBorders(state, ruleset, city, y.total.culture);
    if (claimed >= 0) {
      assignCitizens(state, ruleset, city);
      events.push({ type: 'borderGrew', city: city.id, tile: claimed, faction: factionId });
    }
  }
  updateVisibility(state, ruleset, factionId);
}
