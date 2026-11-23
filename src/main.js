// Entry point. Wires the pieces together and starts the interface.
//
// Fetching JSON happens only here (docs/PLAN.md section 7): everything else
// receives text, so the same loader and rules run in Node for tests and tools.

import { startApp } from './ui/app.js';

async function getText(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

/** Everything the mod loader needs: the index, every mod's manifest and files, and the engine's own text. */
async function loadModSources() {
  const [indexText, engineText] = await Promise.all([getText('rules/index.json'), getText('text/engine.en-GB.json')]);
  const index = JSON.parse(indexText);
  const available = {};
  await Promise.all(index.mods.map(async (entry) => {
    const manifest = await getText(`${entry.path}mod.json`);
    const files = {};
    let names = [];
    try { names = JSON.parse(manifest).files ?? []; } catch { names = []; }
    await Promise.all(names.map(async (name) => {
      try { files[name] = await getText(`${entry.path}${name}`); } catch { /* the loader reports it as missing */ }
    }));
    available[entry.id] = { manifest, files };
  }));
  return { index, available, engineText: JSON.parse(engineText).strings };
}

startApp(document, { loadModSources });
