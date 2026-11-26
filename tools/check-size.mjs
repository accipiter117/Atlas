#!/usr/bin/env node
// Size budgets (docs/PLAN.md section 11.3).
//
// Live now: the first page load (HTML, CSS and the JavaScript the page loads
// at once, no art) must stay under 1 MB, so the game opens quickly on a slow
// connection.
//
// Live from phase 9: the late-game save budget. A 330-turn AI game is played
// headless, saved exactly as the browser saves it (short command keys, gzip,
// base64) and must come in under 1.5 MB (section 8.2). By default this plays a
// Small 4-faction game (under a minute); --full plays the Large 8-faction game
// the budget is really about (several minutes until the phase 10 speed work),
// which CI runs on every push.
//
// Run:  node tools/check-size.mjs [--full] [--skip-save] [root]

import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { listFiles } from './lib-files.mjs';
import { loadReal } from '../test/data/helpers.js';
import { aiGame } from '../test/ai/harness.js';
import { createSave, packSave, SAVE_BUDGET } from '../src/save/save.js';
import { createCodec } from '../src/save/codec.js';

export const FIRST_LOAD_BUDGET = 1_000_000;

/**
 * What the first page load really fetches: the page, its stylesheets, and every
 * script reachable by static imports from the page's entry points (src/main.js
 * and the computer players' worker). A module loaded later by a dynamic
 * import() (the Killzone platoon battle, phase 19) is not part of it.
 */
export async function firstLoadBytes(root) {
  const entries = ['src/main.js', 'src/aiWorker.js'];
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let source;
    try { source = await readFile(join(root, file), 'utf8'); } catch { continue; }
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/\b(?:import|export)\s+(?:[\w*{}\s,$]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) {
      queue.push(posix.normalize(posix.join(posix.dirname(file), m[1])));
    }
  }
  const files = ['index.html', ...(await listFiles(root, join(root, 'css'))).filter((f) => f.endsWith('.css')), ...seen];
  let total = 0;
  for (const f of files) total += (await stat(join(root, f))).size;
  return { total, files: files.length };
}

/** Play a full-length AI game and measure its save exactly as the browser stores it. */
export async function lateGameSaveBytes({ full = false } = {}) {
  const { ruleset } = await loadReal(['base-ancient']);
  const opts = full ? { seed: 3, players: 8, size: 'large' } : { seed: 3, players: 4, size: 'small' };
  const g = aiGame(ruleset, { ...opts, turns: 330 });
  const { bytes } = await packSave(createSave({ state: g.state, log: g.log, label: 'size check' }), createCodec('zlib'));
  return { bytes, turn: g.state.turn, commands: g.log.length, ...opts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const { total, files } = await firstLoadBytes(root);
  const kb = Math.floor(total / 1000);
  if (total > FIRST_LOAD_BUDGET) {
    console.error(`check-size: first load is ${kb} KB across ${files} files, over the 1,000 KB budget`);
    process.exit(1);
  }
  let saveNote = 'save check skipped';
  if (!args.includes('--skip-save')) {
    const r = await lateGameSaveBytes({ full: args.includes('--full') });
    const saveKb = Math.ceil(r.bytes / 1000);
    if (r.bytes > SAVE_BUDGET) {
      console.error(`check-size: a ${r.turn}-turn ${r.size} ${r.players}-faction save is ${saveKb} KB, over the 1,500 KB budget`);
      process.exit(1);
    }
    saveNote = `${r.size} ${r.players}-faction save at turn ${r.turn} with ${r.commands} commands is ${saveKb} KB of 1,500 KB`;
  }
  console.log(`check-size: ok (first load ${kb} KB of 1,000 KB; ${saveNote})`);
}
