#!/usr/bin/env node
// Enforces the module boundaries in docs/PLAN.md section 7.
//
// Why it matters for the game: the rules (src/sim) must run with no browser at
// all, so the AI simulator and tests can play thousands of turns in Node, and
// so a game replays identically everywhere. That only holds if the rules never
// reach up into the screen, the clock or unseeded dice. This check fails the
// build the moment a file imports across a forbidden line.
//
// Run:  node tools/check-boundaries.mjs [root]

import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import { listFiles, readText, stripComments, lineOf } from './lib-files.mjs';

const ANY = (target) => target.startsWith('src/');
const isFile = (path) => (target) => target === path;
const inDir = (dir) => (target) => target.startsWith(`src/${dir}/`);

// What each layer may import (anything else under src/ is refused).
const ALLOWED = {
  core: [inDir('core')],
  data: [inDir('core')],
  sim: [inDir('core'), inDir('sim'), isFile('src/battles/index.js')],
  battles: [inDir('core'), inDir('battles')],
  ai: [inDir('core'), inDir('ai'), isFile('src/sim/index.js')],
  save: [inDir('core'), inDir('save'), isFile('src/sim/index.js')],
  render: [inDir('core'), inDir('render'), isFile('src/sim/index.js'), isFile('src/data/text.js')],
  ui: [
    inDir('ui'), inDir('data'), inDir('save'), inDir('render'),
    isFile('src/sim/index.js'), isFile('src/ai/index.js'), isFile('src/battles/index.js'),
    (t) => t.startsWith('src/core/') && t !== 'src/core/rng.js',
  ],
  main: [
    inDir('ui'), inDir('data'), inDir('save'), inDir('render'),
    isFile('src/sim/index.js'), isFile('src/ai/index.js'), isFile('src/battles/index.js'),
    (t) => t.startsWith('src/core/') && t !== 'src/core/rng.js',
  ],
};

// Words a layer must never use, outside comments.
const DOM = ['window', 'document', 'navigator', 'localStorage', 'fetch'];
const BANNED = {
  core: DOM,
  data: DOM,
  sim: [...DOM, 'Math.random', 'Date', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'performance'],
  ai: [...DOM, 'Math.random', 'Date', 'setTimeout', 'setInterval'],
  render: ['Math.random'],
  ui: ['Math.random'],
};

function layerOf(file) {
  if (file === 'src/main.js') return 'main';
  const m = /^src\/([^/]+)\//.exec(file);
  return m ? m[1] : null;
}

function importsOf(source) {
  const out = [];
  const patterns = [
    /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[\w*{}\s,$]+\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      out.push({ spec: m[1], index: m.index, dynamic: m[0].includes('(') });
    }
  }
  return out;
}

export async function checkBoundaries(root) {
  const problems = [];
  const files = (await listFiles(root, join(root, 'src'))).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const layer = layerOf(file);
    const source = stripComments(await readText(root, file));
    const report = (index, msg) => problems.push(`${file}:${lineOf(source, index)}  ${msg}`);

    if (!layer || !ALLOWED[layer]) {
      report(0, `is not in a known layer (allowed: ${Object.keys(ALLOWED).join(', ')})`);
      continue;
    }

    for (const { spec, index, dynamic } of importsOf(source)) {
      if (spec.startsWith('node:')) {
        // Only the save codec may reach Node's zlib, and only lazily, so the browser never loads it.
        if (!(layer === 'save' && dynamic && spec === 'node:zlib')) report(index, `imports ${spec} (Node built-ins are not allowed in src/)`);
        continue;
      }
      if (!spec.startsWith('.')) {
        report(index, `imports package "${spec}" (Atlas has no runtime dependencies)`);
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(file), spec));
      if (!ANY(target)) {
        report(index, `imports ${target}, which is outside src/`);
        continue;
      }
      if (!ALLOWED[layer].some((ok) => ok(target))) {
        report(index, `${layer}/ may not import ${target} (see docs/PLAN.md section 7)`);
      }
    }

    for (const word of BANNED[layer] ?? []) {
      const re = new RegExp(`(?<![\\w.$])${word.replace('.', '\\.')}(?![\\w$])`, 'g');
      for (const m of source.matchAll(re)) report(m.index, `${layer}/ must not use ${word}`);
    }

    // Battle modules keep their rules (any sim/ subfolder) free of the page.
    if (layer === 'battles' && /\/sim\//.test(file)) {
      for (const word of DOM) {
        const re = new RegExp(`(?<![\\w.$])${word}(?![\\w$])`, 'g');
        for (const m of source.matchAll(re)) report(m.index, `battle module rules must not use ${word}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = await checkBoundaries(root);
  if (problems.length) {
    console.error(`check-boundaries: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('check-boundaries: ok');
}
