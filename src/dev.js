// Entry point for dev.html, the developer map viewer (phase 3).
// Like main.js it is allowed to fetch; it hands text to the loader.

import { startMapViewer } from './ui/devMap.js';

async function getText(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

async function loadModSources() {
  const index = JSON.parse(await getText('rules/index.json'));
  const available = {};
  await Promise.all(index.mods.map(async (entry) => {
    const manifest = await getText(`${entry.path}mod.json`);
    const files = {};
    for (const name of JSON.parse(manifest).files ?? []) {
      try { files[name] = await getText(`${entry.path}${name}`); } catch { /* reported by the loader */ }
    }
    available[entry.id] = { manifest, files };
  }));
  return { index, available };
}

startMapViewer(document, { loadModSources });
