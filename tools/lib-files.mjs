// Small file helpers shared by the repo checks.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);

/** Every file under dir (recursively), as paths relative to root with forward slashes. */
export async function listFiles(root, dir = root) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(root, full)));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out.sort();
}

export function readText(root, rel) {
  return readFile(join(root, rel), 'utf8');
}

/** Blank out comments (keeping line numbers) so banned words in explanations do not count. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}
