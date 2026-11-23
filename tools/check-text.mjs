#!/usr/bin/env node
// Writing-style check (CLAUDE.md, "Writing style").
//
// 1. No em dashes or en dashes anywhere in the repo's own text: code, docs,
//    player text, config. Use round brackets or commas instead.
// 2. Player text (rules/<mod>/text/*.json and the visible words in
//    index.html) uses British spelling. Common American spellings fail the
//    check. CSS keeps "color" because CSS requires it, which is why the
//    spelling rule only reads player text.
//
// Run:  node tools/check-text.mjs [root]

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listFiles, readText, lineOf } from './lib-files.mjs';

const TEXT_EXTENSIONS = /\.(js|mjs|cjs|json|md|html|css|yml|yaml|txt|webmanifest)$/;
const SKIP_FILES = new Set(['package-lock.json']);
const DASHES = /[\u2013\u2014]/g;

// American spelling -> British. Whole words, any capitalisation.
const AMERICAN = {
  color: 'colour', colors: 'colours', colored: 'coloured',
  center: 'centre', centers: 'centres', centered: 'centred',
  defense: 'defence', defenses: 'defences',
  armor: 'armour', armored: 'armoured',
  favor: 'favour', favorite: 'favourite', favored: 'favoured',
  honor: 'honour', behavior: 'behaviour',
  neighbor: 'neighbour', neighbors: 'neighbours', neighboring: 'neighbouring',
  labor: 'labour', gray: 'grey', theater: 'theatre',
  organize: 'organise', organized: 'organised', realize: 'realise',
  recognize: 'recognise', civilization: 'civilisation', civilizations: 'civilisations',
};
const AMERICAN_RE = new RegExp(`\\b(${Object.keys(AMERICAN).join('|')})\\b`, 'gi');

function isPlayerText(file) {
  return /^rules\/[^/]+\/text\/.+\.json$/.test(file) || /^text\/.+\.json$/.test(file) || file === 'index.html';
}

/** The words a player can actually read in an HTML file (no tags, attributes, styles or scripts). */
export function visibleHtmlText(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<[^>]*>/g, (m) => {
      // Keep the words in attributes a player sees (button labels for screen readers, tooltips, data-say messages).
      const said = [...m.matchAll(/\b(?:aria-label|title|alt|data-say)="([^"]*)"/g)].map((a) => a[1]).join(' ');
      return ` ${said} ${'\n'.repeat(m.split('\n').length - 1)}`;
    });
}

export async function checkText(root) {
  const problems = [];
  const files = (await listFiles(root)).filter((f) => TEXT_EXTENSIONS.test(f) && !SKIP_FILES.has(f.split('/').pop()));
  for (const file of files) {
    const text = await readText(root, file);
    for (const m of text.matchAll(DASHES)) {
      const name = m[0] === '\u2014' ? 'em dash' : 'en dash';
      problems.push(`${file}:${lineOf(text, m.index)}  ${name} (use round brackets or a comma)`);
    }
    if (isPlayerText(file)) {
      let readable = text;
      if (file.endsWith('.html')) readable = visibleHtmlText(text);
      else readable = JSON.stringify(Object.values(flatten(JSON.parse(text))));
      for (const m of readable.matchAll(AMERICAN_RE)) {
        const word = m[1].toLowerCase();
        const line = file.endsWith('.html') ? lineOf(readable, m.index) : '?';
        problems.push(`${file}:${line}  American spelling "${m[1]}" (use "${AMERICAN[word]}")`);
      }
    }
  }
  return problems;
}

function flatten(value, out = {}, prefix = '') {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, out, prefix ? `${prefix}.${k}` : k);
  } else if (typeof value === 'string') {
    out[prefix] = value;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = await checkText(root);
  if (problems.length) {
    console.error(`check-text: ${problems.length} problem(s)\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('check-text: ok');
}
