// Reading mods from disk for Node tools and tests. The browser does the same
// with fetch in src/main.js; both hand plain text to src/data/loader.js.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Read one mod folder into { manifest, files } (text, not parsed). Missing files are left out. */
export async function readModFolder(dir) {
  const manifest = await readFile(join(dir, 'mod.json'), 'utf8');
  const files = {};
  let names = [];
  try { names = JSON.parse(manifest).files ?? []; } catch { names = []; }
  for (const name of names) {
    try { files[name] = await readFile(join(dir, name), 'utf8'); } catch { /* reported by the loader as missingFile */ }
  }
  return { manifest, files };
}

/** Read rules/index.json and every mod it lists. */
export async function readRules(root) {
  const index = JSON.parse(await readFile(join(root, 'rules', 'index.json'), 'utf8'));
  const available = {};
  for (const entry of index.mods) available[entry.id] = await readModFolder(join(root, entry.path));
  return { index, available };
}

export async function readEngineText(root) {
  return JSON.parse(await readFile(join(root, 'text', 'engine.en-GB.json'), 'utf8')).strings;
}
