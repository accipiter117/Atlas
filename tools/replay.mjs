#!/usr/bin/env node
// Replays an exported save (section 11.1): rebuilds the game from its seed and
// command log and checks the result against the save's fingerprint. If a
// command is refused, says which one, so a bug report with a save code can be
// pinned to the exact move.
//
// Run:  npm run replay -- <save.txt>

import { readFileSync } from 'node:fs';
import { loadReal } from '../test/data/helpers.js';
import { importCode, replay } from '../src/save/save.js';
import { createCodec } from '../src/save/codec.js';

const file = process.argv[2];
if (!file) { console.error('Usage: npm run replay -- <save.txt>'); process.exit(2); }
const save = await importCode(readFileSync(file, 'utf8'), createCodec('zlib'));
const selection = (save.setup?.mods ?? ['base-ancient']).map((m) => String(m).split('@')[0]);
const { ruleset, ok, hash } = await loadReal(selection, save.setup?.modOptions ?? {});
if (!ok) { console.error('replay: the save\'s mods do not load'); process.exit(1); }
if (hash !== save.rulesetHash) console.log(`replay: note, the rules have changed since this save (${save.rulesetHash} then, ${hash} now)`);
console.log(`replay: "${save.label}", ${save.log.length} commands, turn ${save.snapshot.turn}`);
const r = replay(save, ruleset);
if (r.error) {
  console.error(`replay: command ${save.log.indexOf(r.command) + 1} refused on turn ${r.state.turn}: ${JSON.stringify(r.command)} (${r.error.code}: ${r.error.message})`);
  process.exit(1);
}
console.log(r.ok ? 'replay: ok, the fingerprint matches' : 'replay: MISMATCH, the replayed game differs from the saved one');
process.exit(r.ok ? 0 : 1);
