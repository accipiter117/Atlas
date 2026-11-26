#!/usr/bin/env node
// Writes test/save/fixtures/v<saveVersion>.json: a short two-faction AI game,
// saved in the current format and kept forever, so every future migration is
// tested against a real old save (section 8.4). Only run this when the save
// version goes up, to add the new version's fixture; never overwrite an old one.

import { writeFileSync, existsSync } from 'node:fs';
import { ruleset } from '../../test/sim/fixtures.js';
import { aiGame } from '../../test/ai/harness.js';
import { createSave } from '../../src/save/save.js';
import { CURRENT_SAVE_VERSION } from '../../src/save/migrations.js';

const path = `test/save/fixtures/v${CURRENT_SAVE_VERSION}.json`;
if (existsSync(path) && !process.argv.includes('--force')) {
  console.error(`${path} already exists; old fixtures are never overwritten`);
  process.exit(1);
}
const g = aiGame(ruleset, { seed: 7, players: 2, turns: 12 });
const save = createSave({ state: g.state, log: g.log, label: 'Fixture, turn 13', now: '2026-11-26T12:00:00.000Z' });
save.setup = { ...save.setup, mods: ['base-ancient@0.1.0'] };
writeFileSync(path, `${JSON.stringify(save)}\n`);
console.log(`wrote ${path} (${Math.round(JSON.stringify(save).length / 1000)} KB, ${save.log.length} commands)`);
