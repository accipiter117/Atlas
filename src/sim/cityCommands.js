// City commands: foundCity, setProduction, queueProduction, buyItem,
// setFocus, lockTile, unlockTile, buyTile. Plus the start-of-turn work for a
// faction's cities: yields, growth, production, borders and stocks.

import { frontlineOn } from './frontline.js';
import { currentFactionId } from './queries.js';
import { foundingProblem, foundCity as found, assignCitizens, canBuild, itemCost, completeItem, workable, citiesOf, cityHpMax } from './cities.js';
import { payUpkeep } from './economy.js';
import { blockadedFor } from './space.js';
import { activeWorld } from './worlds.js';
import { addResearch } from './progression.js';
import { effectsFor, sumHook } from './effects/index.js';
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
  return item && ['unit', 'building', 'wonder'].includes(item.kind) && typeof item.id === 'string';
}

export const foundCity = {
  validate(state, cmd, ruleset) {
    const turn = myTurn(state, cmd);
    if (turn) return turn;
    const unit = state.units?.[cmd.unit];
    if (!unit) return refuse('unknownUnit', `No unit "${cmd.unit}"`);
    if (unit.faction !== cmd.faction) return refuse('notYourUnit', `${cmd.unit} belongs to ${unit.faction}`);
    if (!(ruleset.units[unit.type]?.tags ?? []).includes('founder')) return refuse('notFounder', 'Only settlers can found cities');
    if (frontlineOn(ruleset)) return refuse('noSettling', 'No new cities in a front-line war');
    if (unit.moves <= 0) return refuse('noMoves', 'This unit has no moves left');
    const problem = foundingProblem(state, ruleset, cmd.faction, unit.tile);
    return problem ? refuse(problem, `Cannot found a city here (${problem})`) : null;
  },
  apply(state, cmd, events, ruleset) {
    const unit = state.units[cmd.unit];
    delete state.units[cmd.unit];
    const { city, events: extra } = found(state, ruleset, cmd.faction, unit.tile);
    events.push({ type: 'cityFounded', city: city.id, name: city.name, faction: cmd.faction, tile: city.tile }, ...extra);
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

/**
 * Reorder the queue (graphics overhaul G8: the city screen's arrows): move the item at
 * `index` to position `to`. Production carries over to whatever ends up first.
 */
export const moveQueueItem = {
  validate(state, cmd) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    const n = city.queue.length;
    if (!Number.isInteger(cmd.index) || !Number.isInteger(cmd.to) || cmd.index < 0 || cmd.to < 0 || cmd.index >= n || cmd.to >= n || cmd.index === cmd.to) return refuse('badQueueIndex', 'There is no such place in the queue');
    return null;
  },
  apply(state, cmd) {
    const q = state.cities[cmd.city].queue;
    const [item] = q.splice(cmd.index, 1);
    q.splice(cmd.to, 0, item);
  },
};

/** Take an item out of the queue (graphics overhaul G8). */
export const removeQueueItem = {
  validate(state, cmd) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index >= city.queue.length) return refuse('badQueueIndex', 'There is no such place in the queue');
    return null;
  },
  apply(state, cmd) {
    state.cities[cmd.city].queue.splice(cmd.index, 1);
  },
};

/** Gold to finish the item at the head of the queue now (wonders cannot be bought). */
export function buyPrice(ruleset, city, state = null) {
  const item = city.queue[0];
  if (!item || item.kind === 'wonder') return null;
  return Math.ceil(Math.max(0, itemCost(ruleset, item, state, city) - city.progress) * (ruleset.tuning?.economy?.goldPerProduction ?? 2));
}

export const buyItem = {
  validate(state, cmd, ruleset) {
    const [city, problem] = ownCity(state, cmd);
    if (problem) return problem;
    if (!city.queue.length) return refuse('nothingToBuy', 'Choose something to build first');
    if (city.queue[0].kind === 'wonder') return refuse('cannotBuyWonder', 'Wonders cannot be bought');
    const faction = state.factions.find((f) => f.id === cmd.faction);
    if (faction.stocks.gold < buyPrice(ruleset, city, state)) return refuse('notEnoughGold', 'Not enough gold');
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
    const price = buyPrice(ruleset, city, state);
    const item = city.queue.shift();
    const done = completeItem(state, ruleset, city, item);
    if (!done) { city.queue.unshift(item); return; }
    faction.stocks.gold -= price;
    city.progress = 0;
    events.push(...done.map((e, i) => (i === 0 ? { ...e, bought: true, price } : e)));
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

/** Start of a faction's turn (section 3.14): yields, growth, production, borders, then gold and upkeep. */
export function startCitiesTurn(state, ruleset, factionId, events) {
  const faction = state.factions.find((f) => f.id === factionId);
  let income = 0;
  let science = 0;
  let culture = 0;
  for (const city of citiesOf(state, factionId)) {
    // A city being razed loses a citizen each turn and is gone at zero.
    if (city.razing) {
      city.pop -= 1;
      if (city.pop <= 0) {
        for (let i = 0; i < state.owner.length; i += 1) if (state.owner[i] === city.id) state.owner[i] = null;
        delete state.cities[city.id];
        events.push({ type: 'cityRazed', city: city.id, name: city.name, faction: factionId, tile: city.tile });
        continue;
      }
      assignCitizens(state, ruleset, city);
    }
    // Cities mend their walls when not attacked since their last turn.
    const max = cityHpMax(ruleset, city);
    if ((city.hp ?? max) < max && (city.lastAttacked ?? -1) < state.turn - 1) city.hp = Math.min(max, city.hp + (ruleset.tuning?.combat?.cityHealPerTurn ?? 20));
    const effects = effectsFor(state, ruleset, factionId);
    const y = cityYields(state, ruleset, city, effects);
    income += y.total.gold;
    science += y.total.science;
    faction.stocks.faith += y.total.faith;
    culture += y.total.culture;

    // Growth: river, growthPercent effects and the city's mood all scale a food surplus.
    const nearRiver = state.map.river[city.tile] !== 0;
    const growthPct = sumHook('growth', state, ruleset, factionId, { city }, effects) + (y.amenities?.threshold?.growthPercent ?? 0);
    const grew = applyGrowth(city, y.surplus, ruleset.tuning, nearRiver, growthPct);
    if (grew) {
      assignCitizens(state, ruleset, city);
      events.push({ type: grew === 'grew' ? 'cityGrew' : 'cityStarved', city: city.id, pop: city.pop, faction: factionId });
    }

    if (city.queue.length) {
      const item = city.queue[0];
      if (!canBuild(state, ruleset, city, item)) {
        // Someone else finished this wonder, or a prerequisite was lost: drop it.
        city.queue.shift();
      } else {
        city.progress += y.total.production;
        const cost = itemCost(ruleset, item, state, city);
        if (city.progress >= cost) {
          city.queue.shift();
          const done = completeItem(state, ruleset, city, item);
          if (done) {
            city.progress -= cost;
            events.push(...done);
          } else {
            city.queue.unshift(item);
          }
        }
      }
    }

    const claimed = growBorders(state, ruleset, city, y.total.culture);
    if (claimed >= 0) {
      assignCitizens(state, ruleset, city);
      events.push({ type: 'borderGrew', city: city.id, tile: claimed, faction: factionId });
    }
    for (const t of city.timed ?? []) t.turns -= 1;
    if (city.timed) city.timed = city.timed.filter((t) => t.turns > 0);
  }
  // K2: a world blockaded by an enemy fleet sends its credits nowhere (its costs are still paid).
  if (state.space && income > 0 && blockadedFor(state, factionId, activeWorld(state))) {
    events.push({ type: 'blockadeCost', faction: factionId, world: activeWorld(state), gold: income });
    income = 0;
  }
  payUpkeep(state, ruleset, factionId, income, events);
  if (ruleset.techs) addResearch(state, ruleset, factionId, science, events);
  else faction.stocks.science += science;
  // Culture fills the civics tree (section 3.7), the same way science fills the techs.
  faction.lifetimeCulture = (faction.lifetimeCulture ?? 0) + culture;
  if (ruleset.civics) addResearch(state, ruleset, factionId, culture, events, 'civics');
  else faction.stocks.culture += culture;
  updateVisibility(state, ruleset, factionId);
}
