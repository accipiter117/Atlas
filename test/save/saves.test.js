// Phase 9: saves. Slots, rolling autosaves, export codes, short command keys,
// the size limit, mod checks, replay from the seed, and the v1 migration fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ruleset } from '../sim/fixtures.js';
import { aiGame } from '../ai/harness.js';
import { fingerprint, applyCommand, currentFactionId, view, COMMANDS } from '../../src/sim/index.js';
import { createAi, runAiTurn } from '../../src/ai/index.js';
import {
  createSave, saveToSlot, loadSave, autosave, listSaves, latestSave, deleteSave, exportCode, importCode,
  memoryStorage, SaveTooBigError, modCheck, replay, readSave, packSave,
} from '../../src/save/save.js';
import { packCommand, unpackCommand } from '../../src/save/commandKeys.js';
import { createCodec } from '../../src/save/codec.js';
import { upgrade, CURRENT_SAVE_VERSION } from '../../src/save/migrations.js';

const codec = createCodec('zlib');
const game = aiGame(ruleset, { seed: 31, turns: 30 });
const at = (turn) => `2026-11-26T12:${String(turn).padStart(2, '0')}:00.000Z`;
const saveOf = (g, label = 'Test') => createSave({ state: g.state, log: g.log, label, now: at(g.state.turn % 60) });

test('save round trip through a slot keeps the exact state (fingerprints match)', async () => {
  const storage = memoryStorage();
  const save = saveOf(game);
  const entry = await saveToSlot(storage, 'one', save, codec);
  assert.equal(entry.turn, game.state.turn);
  const back = await loadSave(storage, entry, codec);
  assert.equal(fingerprint(back.snapshot.state), fingerprint(game.state));
  assert.equal(back.fingerprint, save.fingerprint);
  assert.deepEqual(back.log, game.log);
  assert.deepEqual(listSaves(storage).map((e) => e.id), ['one']);
  deleteSave(storage, entry);
  assert.equal(await loadSave(storage, entry, codec), null);
  assert.deepEqual(listSaves(storage), []);
});

test('replaying the log from the seed rebuilds the same game', () => {
  const r = replay(saveOf(game), ruleset);
  assert.equal(r.error, undefined);
  assert.ok(r.ok, 'replay fingerprint matches');
});

test('export and import codes give back the same save', async () => {
  const save = saveOf(game);
  const code = await exportCode(save, codec);
  assert.ok(code.startsWith('ATLAS1:'));
  const back = await importCode(code, codec);
  assert.equal(fingerprint(back.snapshot.state), fingerprint(game.state));
  assert.deepEqual(back.log, save.log);
  await assert.rejects(() => importCode('hello', codec), /ATLAS1/);
});

test('three rolling autosaves: the oldest is replaced, Continue picks the newest', async () => {
  const storage = memoryStorage();
  const states = [];
  let s = game.state;
  for (let i = 0; i < 5; i += 1) {
    s = { ...s, turn: 40 + i };
    states.push(s);
    await autosave(storage, createSave({ state: s, log: [], label: `Turn ${s.turn}`, now: at(10 + i) }), codec);
  }
  const autos = listSaves(storage).filter((e) => e.kind === 'autosave');
  assert.equal(autos.length, 3);
  assert.deepEqual(autos.map((e) => e.turn).sort(), [42, 43, 44]);
  assert.equal(latestSave(storage).turn, 44);
  assert.equal((await loadSave(storage, latestSave(storage), codec)).snapshot.state.turn, 44);
});

test('a save that will not fit says so instead of failing silently', async () => {
  const storage = memoryStorage(2000);
  await assert.rejects(() => saveToSlot(storage, 'big', saveOf(game), codec), SaveTooBigError);
  assert.deepEqual(listSaves(storage), [], 'the index is unchanged');
});

test('every command type survives the short storage keys', () => {
  for (const type of Object.keys(COMMANDS)) {
    const cmd = { type, faction: 'f0', unit: 'u_0001', to: 12, city: 'c_0001', item: { kind: 'unit', id: 'warrior' }, tile: 3, target: 'f1', choice: 'keep', promotion: 'p', focus: 'food', improvement: 'farm', tree: 'techs', result: { winner: 'a' }, government: 'republic', policy: 'agoge', slot: 'military', index: 1, extra: 1 };
    const packed = packCommand(cmd);
    assert.ok(JSON.stringify(packed).length < JSON.stringify(cmd).length);
    assert.deepEqual(unpackCommand(packed), cmd);
  }
});

test('missing and changed mods are listed by name and version', () => {
  const save = { setup: { mods: ['base-ancient@1.0.0', 'lock-era@1.0.0', 'witcher@2.0.0'] } };
  const r = modCheck(save, { 'base-ancient': '1.0.0', 'lock-era': '1.1.0' });
  assert.deepEqual(r.missing, ['witcher@2.0.0']);
  assert.deepEqual(r.changed, [{ id: 'lock-era', saved: '1.0.0', now: '1.1.0' }]);
});

test('saves from a newer Atlas, or not saves at all, are refused clearly', () => {
  assert.throws(() => readSave({ format: 'nope' }), /not an Atlas save/);
  assert.throws(() => upgrade({ saveVersion: CURRENT_SAVE_VERSION + 1 }), /newer version/);
});

test('migration fixture v1: loads, upgrades and plays one more full round', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/v1.json', import.meta.url), 'utf8'));
  const save = readSave(fixture);
  assert.equal(save.saveVersion, CURRENT_SAVE_VERSION);
  let state = save.snapshot.state;
  const startTurn = state.turn;
  const ais = Object.fromEntries(state.factions.map((f) => [f.id, createAi(ruleset, f.id)]));
  for (let seat = 0; seat < state.factions.length; seat += 1) {
    const me = currentFactionId(state);
    runAiTurn(ais[me], () => view(state, me, ruleset), (cmd) => {
      const res = applyCommand(state, cmd, ruleset);
      if (res.ok) state = res.state;
      return res;
    });
    assert.deepEqual(ais[me].refusals, []);
    if (currentFactionId(state) === me) state = applyCommand(state, { type: 'endTurn', faction: me }, ruleset).state;
  }
  assert.equal(state.turn, startTurn + 1);
});

test('save size of a typical game is small (the 330-turn budget runs in tools/check-size.mjs)', async () => {
  const { bytes } = await packSave(saveOf(game), codec);
  assert.ok(bytes < 200_000, `${bytes} bytes after 30 turns`);
});
