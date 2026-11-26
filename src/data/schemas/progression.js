// Techs, civics, eras, governments and policies (section 3.7).

import { entryType, req, int, num, ref, refs, obj, oneOf, effects, key, str, map } from './fields.js';

const unlocks = obj({
  units: refs('units'),
  buildings: refs('buildings'),
  wonders: refs('wonders'),
  improvements: refs('improvements'),
  governments: refs('governments'),
  policies: refs('policies'),
});

const boost = obj({ trigger: req(str()), id: str(), count: int(1, 100), textKey: key() });
const treePos = obj({ col: req(int(0, 100)), row: req(int(0, 100)) });

export const techs = entryType('techs', {
  era: req(ref('eras')),
  cost: req(int(1, 100000)),
  requires: refs('techs', { cascade: 'remove' }),
  boost,
  unlocks,
  treePos,
});

export const civics = entryType('civics', {
  era: req(ref('eras')),
  cost: req(int(1, 100000)),
  requires: refs('civics', { cascade: 'remove' }),
  boost,
  unlocks,
  treePos,
});

export const eras = entryType('eras', {
  index: req(int(0, 50)),
  costMultiplier: num(0.1, 10),
  startUnits: refs('units'),
});

const SLOTS = ['military', 'economic', 'diplomatic', 'wildcard'];

export const governments = entryType('governments', {
  slots: req(map(oneOf(SLOTS), int(0, 6))),
  effects: effects(),
  descriptionKey: key(),
  requires: obj({ civic: ref('civics') }),
});

export const policies = entryType('policies', {
  slot: req(oneOf(SLOTS)),
  effects: req(effects()),
  requires: obj({ civic: ref('civics') }),
  obsoletedBy: ref('civics', { cascade: 'clear' }),
  descriptionKey: key(),
});

