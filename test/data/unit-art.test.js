// Graphics overhaul G4 (docs/OVERHAUL.md 4.3): every unit in every ruleset has
// its own sprite sheet, every leader a portrait, the files exist, and every
// LPC layer used names its authors and the licence it is used under.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadReal, REPO } from './helpers.js';

async function sheetOf(art, id) {
  const entry = art[id];
  if (!entry?.sheet) return null;
  const desc = JSON.parse(await readFile(join(REPO, entry.sheet), 'utf8'));
  assert.ok((await stat(join(REPO, desc.src))).size > 0, `${desc.src} exists`);
  return desc;
}

for (const stack of [['base-ancient'], ['base-ancient', 'witcher'], ['base-ancient', 'killzone']]) {
  test(`${stack.join(' + ')}: every unit and leader has credited art`, async () => {
    const { ruleset } = await loadReal(stack);
    const art = ruleset.skin.art ?? {};
    const civs = Object.keys(ruleset.factions);
    for (const u of Object.values(ruleset.units)) {
      // Killzone draws each side's own trooper; elsewhere one sheet serves every faction.
      const own = await Promise.all(civs.map((c) => sheetOf(art, `unit.${u.id}.${c}`)));
      const shared = await sheetOf(art, `unit.${u.id}`);
      assert.ok(shared || own.every(Boolean), `${u.id} has a sprite sheet`);
      for (const desc of [shared, ...own].filter(Boolean)) {
        assert.ok(desc.credits && desc.credits.length > 20, `${desc.id} has credits`);
        assert.ok(desc.frame.w > 0 && desc.frame.h > 0 && Number.isFinite(desc.anchor.x) && Number.isFinite(desc.anchor.y), `${desc.id} frame and anchor`);
        for (const layer of desc.layers ?? []) {
          assert.ok(layer.credits.length, `${desc.id}: ${layer.def} has credits`);
          for (const c of layer.credits) {
            assert.ok(c.authors.length, `${desc.id}: ${layer.def} names its authors`);
            assert.ok(c.licence && c.licences.includes(c.licence), `${desc.id}: ${layer.def} uses a licence it offers`);
          }
        }
      }
    }
    for (const f of Object.values(ruleset.factions)) {
      for (const l of f.leaders ?? []) assert.ok(await sheetOf(art, `leader.${l}`), `leader ${l} has a portrait`);
    }
  });
}

test('every unit type looks different: no two sheets in a ruleset share an image', async () => {
  const { ruleset } = await loadReal(['base-ancient', 'witcher']);
  const srcs = new Map();
  for (const [id, entry] of Object.entries(ruleset.skin.art)) {
    if (!id.startsWith('unit.') || !entry.sheet) continue;
    const desc = JSON.parse(await readFile(join(REPO, entry.sheet), 'utf8'));
    const bytes = (await readFile(join(REPO, desc.src))).toString('base64');
    assert.ok(!srcs.has(bytes), `${id} looks the same as ${srcs.get(bytes)}`);
    srcs.set(bytes, id);
  }
});
