#!/usr/bin/env node
// Size budgets (docs/PLAN.md section 11.3).
//
// Live now: the first page load (HTML, CSS and our own JavaScript, no art)
// must stay under 1 MB, so the game opens quickly on a slow connection.
//
// Stub until phase 9: the late-game save budget (1.5 MB for a 330-turn game).
// It needs saves with real content in them, which arrive with the playable core.
//
// Run:  node tools/check-size.mjs [root]

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { listFiles } from './lib-files.mjs';

export const FIRST_LOAD_BUDGET = 1_000_000;

export async function firstLoadBytes(root) {
  const files = ['index.html', ...(await listFiles(root, join(root, 'css'))), ...(await listFiles(root, join(root, 'src')))]
    .filter((f) => /\.(html|css|js)$/.test(f));
  let total = 0;
  for (const f of files) total += (await stat(join(root, f))).size;
  return { total, files: files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const { total, files } = await firstLoadBytes(root);
  const kb = Math.floor(total / 1000);
  if (total > FIRST_LOAD_BUDGET) {
    console.error(`check-size: first load is ${kb} KB across ${files} files, over the 1,000 KB budget`);
    process.exit(1);
  }
  console.log(`check-size: ok (first load ${kb} KB of 1,000 KB; save budget check arrives in phase 9)`);
}
