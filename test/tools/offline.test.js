// Phase 21: the service worker and the web manifest. sw.js is stamped for
// exactly the files the game is made of (a change to any of them means a new
// build and a new cache), it precaches all of them, and the manifest's icons
// exist at the sizes it promises.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServiceWorker, appFiles } from '../../tools/build-sw.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('sw.js is up to date and precaches every app file, including the lazily loaded ones', async () => {
  const current = await readFile(join(repo, 'sw.js'), 'utf8');
  assert.equal(current, await buildServiceWorker(repo), 'run node tools/build-sw.mjs');
  const files = await appFiles(repo);
  for (const f of files) assert.ok(current.includes(`"${f}"`), f);
  for (const must of ['index.html', 'src/main.js', 'rules/index.json', 'text/engine.en-GB.json', 'src/battles/killzone/sim/adapter.js', 'manifest.webmanifest']) assert.ok(files.includes(must), must);
  assert.match(current, /networkFirst/);
  assert.match(current, /cacheFirst/);
});

test('changing any app file changes the build stamp', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-sw-'));
  for (const d of ['css', 'src', 'rules', 'text']) await cp(join(repo, d), join(root, d), { recursive: true });
  for (const f of ['index.html', 'manifest.webmanifest']) await cp(join(repo, f), join(root, f));
  const before = (await buildServiceWorker(root)).match(/BUILD = '(\w+)'/)[1];
  await writeFile(join(root, 'rules', 'index.json'), `${await readFile(join(root, 'rules', 'index.json'), 'utf8')} `);
  const after = (await buildServiceWorker(root)).match(/BUILD = '(\w+)'/)[1];
  assert.notEqual(before, after);
});

test('the manifest installs the game: standalone, with icons that exist at their sizes', async () => {
  const m = JSON.parse(await readFile(join(repo, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  for (const size of [192, 512]) {
    for (const purpose of ['any', 'maskable']) {
      const icon = m.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
      assert.ok(icon, `${size} ${purpose}`);
      const png = await readFile(join(repo, icon.src));
      // PNG width and height live at bytes 16 to 23.
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
  }
  const html = await readFile(join(repo, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
});
