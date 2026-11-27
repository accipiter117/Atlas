// The safety net for the several-worlds work (Killzone Extrasolar War, docs/KILLZONE.md 8.1):
// the three turn-120 fixture games replay command by command to exactly the states they
// reached before worlds existed. The digest covers the fingerprint after every command
// (leaving out rulesetHash, which changes whenever any rule data does).
//
// If a later change is MEANT to alter how these games play (a rule or balance change),
// re-run this test, check the change is the intended one, and update the digests here
// with a note in docs/DECISIONS.md. A change to the worlds engine alone must never need it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadReal, REPO } from '../data/helpers.js';
import { createGame, applyCommand } from '../../src/sim/index.js';
import { importCode } from '../../src/save/save.js';
import { hashValue } from '../../src/core/hash.js';

const EXPECTED = {
  base: { commands: 3387, digest: '48263f31', final: 'd68eee52' },
  witcher: { commands: 3113, digest: 'e9411ed8', final: 'd954031d' },
  killzone: { commands: 798, digest: '1fc97c6f', final: '86d515fb' },
};

const print = (state) => { const { rulesetHash: _h, ...rest } = state; return hashValue(rest); };

for (const [id, want] of Object.entries(EXPECTED)) {
  test(`${id}: the turn-120 game replays to exactly the same states as before worlds existed`, async () => {
    const code = (await readFile(join(REPO, 'test', 'fixtures', 'saves', `${id}-turn120.txt`), 'utf8')).trim();
    const save = await importCode(code);
    const { ruleset } = await loadReal(save.setup.mods.map((m) => String(m).split('@')[0]));
    let state = createGame(ruleset, save.setup);
    assert.equal(state.worlds, undefined, 'a one-world game');
    const prints = [print(state)];
    for (const cmd of save.log) {
      const r = applyCommand(state, cmd, ruleset);
      assert.ok(r.ok, `command ${prints.length} refused: ${r.error?.message}`);
      state = r.state;
      prints.push(print(state));
    }
    assert.equal(save.log.length, want.commands);
    assert.equal(prints.at(-1), want.final);
    assert.equal(hashValue(prints), want.digest);
  });
}
