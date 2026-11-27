// Graphics overhaul G9: Killzone has its own tech and civic trees. The tree keeps the base
// shape (same ids, places, costs and unlocks, so the AI and every requirement still work),
// but no base-ancient tech or civic name shows anywhere in a Killzone game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal } from './helpers.js';

test('Killzone: every tech and civic has its own name, and no base name appears', async () => {
  const { ruleset: base } = await loadReal(['base-ancient']);
  const { ruleset: kz } = await loadReal(['base-ancient', 'killzone']);
  const baseNames = new Set([...Object.values(base.techs), ...Object.values(base.civics)].map((e) => base.text[e.nameKey]));
  const shown = [];
  for (const kind of ['techs', 'civics']) {
    assert.deepEqual(Object.keys(kz[kind]).sort(), Object.keys(base[kind]).sort(), `${kind}: the same tree`);
    for (const e of Object.values(kz[kind])) {
      const name = kz.text[e.nameKey];
      assert.ok(name, `${kind}.${e.id} has a name`);
      assert.ok(!baseNames.has(name), `${kind}.${e.id} is still called ${name}`);
      assert.deepEqual(e.treePos, base[kind][e.id].treePos, `${kind}.${e.id} keeps its place`);
      assert.deepEqual(e.requires, base[kind][e.id].requires, `${kind}.${e.id} keeps its prerequisites`);
      shown.push(name);
    }
  }
  assert.equal(new Set(shown).size, shown.length, 'no two techs or civics share a name');
  // And nothing else in the Killzone game borrows a base tech or civic name (the old keys stay
  // in the merged text, but no entry points at them any more).
  const oldKeys = new Set([...Object.values(base.techs), ...Object.values(base.civics)].map((e) => e.nameKey));
  const leftovers = Object.entries(kz.text).filter(([k, s]) => !oldKeys.has(k) && typeof s === 'string' && baseNames.has(s)).map(([k]) => k);
  assert.deepEqual(leftovers, []);
});
