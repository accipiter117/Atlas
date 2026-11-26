// City focuses (section 3.2) and the advice line's priority list (section 10.1).

import { entryType, req, int, num, map, oneOf, key, YIELDS } from './fields.js';

export const focuses = entryType('focuses', {
  weights: req(map(oneOf(YIELDS), num(0, 10))),
  default: { t: 'bool' },
});

// Conditions are checks the engine knows how to make; the text and order are
// data, so a conversion can reword or reorder the advice.
export const ADVICE_CONDITIONS = Object.freeze([
  'noCities', 'cityNoProduction', 'cityStarving', 'goldRunningOut', 'noResearch', 'noCivic', 'governmentReady', 'emptyPolicySlot', 'unitsNeedOrders', 'cityCanBuyTile', 'readyToEnd',
]);

export const advice = entryType('advice', {
  priority: req(int(0, 1000)),
  condition: req(oneOf(ADVICE_CONDITIONS)),
  textKey: req(key()),
  actionKey: key(),
  action: req(oneOf(['selectSettler', 'openCity', 'selectUnit', 'endTurn', 'research', 'civic', 'empire'])),
});

