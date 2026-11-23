// Loading fixture and real mods for data tests.

import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModFolder, readRules, readEngineText } from '../../tools/lib-mods.mjs';
import { loadRuleset } from '../../src/data/loader.js';
import { ENGINE_VERSION } from '../../src/sim/index.js';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = join(REPO, 'test', 'fixtures', 'mods');

let fixtureCache = null;
export async function fixtureMods() {
  if (!fixtureCache) {
    fixtureCache = {};
    for (const d of await readdir(FIXTURES)) fixtureCache[d] = await readModFolder(join(FIXTURES, d));
  }
  return fixtureCache;
}

export async function realMods() {
  return (await readRules(REPO)).available;
}

export const engineText = () => readEngineText(REPO);

export async function loadFixtures(selection, options = {}) {
  return loadRuleset({ available: await fixtureMods(), selection, options, engineVersion: ENGINE_VERSION });
}

export async function loadReal(selection, options = {}) {
  return loadRuleset({ available: await realMods(), selection, options, engineVersion: ENGINE_VERSION });
}

export const codes = (result, level) => result.report.messages.filter((m) => !level || m.level === level).map((m) => m.code);
