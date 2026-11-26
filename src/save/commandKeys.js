// Short keys for the command log in storage (section 8.2).
//
// A long game logs tens of thousands of commands, so each one is stored with
// short field names and type codes: { type: 'moveUnit', unit: 'u_0412', to: 1907 }
// becomes { T: 'MV', U: 'u_0412', D: 1907 }. Short keys are capital letters and
// command fields are always camelCase, so the two can never clash; anything
// not in the tables is stored as it is, so new commands still save.

const TYPES = {
  endTurn: 'E', moveUnit: 'MV', fortify: 'FT', skip: 'SK', sleep: 'SL', wake: 'WK', disband: 'DB',
  buildImprovement: 'BI', foundCity: 'FC', setProduction: 'SP', queueProduction: 'QP', buyItem: 'BY',
  setFocus: 'SF', lockTile: 'LT', unlockTile: 'UT', buyTile: 'BT', attack: 'AT', cityAttack: 'CA',
  resolveBattle: 'RB', autoResolveBattle: 'AB', captureChoice: 'CC', promote: 'PR',
  setResearch: 'SR', queueResearch: 'QR', declareWar: 'DW',
};
const FIELDS = {
  type: 'T', faction: 'F', unit: 'U', to: 'D', city: 'C', item: 'I', tile: 'L', target: 'G',
  choice: 'H', promotion: 'P', focus: 'O', improvement: 'M', tree: 'R', result: 'S',
};

const invert = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const TYPES_BACK = invert(TYPES);
const FIELDS_BACK = invert(FIELDS);

export function packCommand(cmd) {
  const out = {};
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'type') out.T = TYPES[v] ?? v;
    else out[FIELDS[k] ?? k] = v;
  }
  return out;
}

export function unpackCommand(short) {
  const out = {};
  for (const [k, v] of Object.entries(short)) {
    if (k === 'T') out.type = TYPES_BACK[v] ?? v;
    else out[FIELDS_BACK[k] ?? k] = v;
  }
  return out;
}

export const packLog = (log) => log.map(packCommand);
export const unpackLog = (log) => log.map(unpackCommand);
