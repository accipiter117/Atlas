import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodec, CODE_PREFIX, bytesToBase64, base64ToBytes } from '../../src/save/codec.js';
import { createSave, saveToSlot, loadFromSlot, exportCode, importCode, memoryStorage, readSave } from '../../src/save/save.js';
import { upgrade, CURRENT_SAVE_VERSION } from '../../src/save/migrations.js';
import { fingerprint, applyCommand, currentFactionId } from '../../src/sim/index.js';
import { playEndTurns } from '../sim/helpers.js';

const sample = { text: 'Ŵales, Rome & Han', list: Array.from({ length: 2000 }, (_, i) => ({ t: 'mv', u: i, to: i * 7 })) };

for (const backend of ['stream', 'zlib']) {
  test(`codec round trip (${backend})`, async () => {
    const codec = createCodec(backend);
    const packed = await codec.pack(sample);
    assert.ok(packed.length < JSON.stringify(sample).length / 3, 'actually compresses');
    assert.deepEqual(await codec.unpack(packed), sample);
    const code = await codec.toCode(sample);
    assert.ok(code.startsWith(CODE_PREFIX));
    assert.deepEqual(await codec.fromCode(`  ${code}\n`), sample);
  });
}

test('browser and Node backends read each other\'s saves', async () => {
  const stream = createCodec('stream');
  const zlib = createCodec('zlib');
  assert.deepEqual(await zlib.unpack(await stream.pack(sample)), sample);
  assert.deepEqual(await stream.unpack(await zlib.pack(sample)), sample);
});

test('a code without the ATLAS1 prefix is refused with a clear message', async () => {
  await assert.rejects(createCodec().fromCode('HELLO'), /ATLAS1/);
});

test('base64 handles large byte arrays', () => {
  const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('save round trip: slot and export code both restore the same game', async () => {
  const { state, log } = playEndTurns(20);
  const save = createSave({ state, log, label: 'Test, turn 6', now: '2026-11-22T21:40:00Z' });
  assert.equal(save.format, 'atlas-save');
  assert.equal(save.saveVersion, 1);
  assert.equal(save.fingerprint, fingerprint(state));

  const storage = memoryStorage();
  await saveToSlot(storage, 'a', save);
  const fromSlot = await loadFromSlot(storage, 'a');
  assert.equal(fingerprint(fromSlot.snapshot.state), fingerprint(state));
  assert.equal(await loadFromSlot(storage, 'missing'), null);

  const fromCode = await importCode(await exportCode(save));
  assert.deepEqual(fromCode, fromSlot);

  // Play on from the restored game and from the original: still identical.
  let a = state;
  let b = fromCode.snapshot.state;
  for (let i = 0; i < 5; i += 1) {
    a = applyCommand(a, { type: 'endTurn', faction: currentFactionId(a) }).state;
    b = applyCommand(b, { type: 'endTurn', faction: currentFactionId(b) }).state;
  }
  assert.equal(fingerprint(a), fingerprint(b));
});

test('saves from a newer version or of the wrong format are refused', () => {
  assert.throws(() => upgrade({ saveVersion: CURRENT_SAVE_VERSION + 1 }), /newer/);
  assert.throws(() => upgrade({}), /saveVersion/);
  assert.throws(() => readSave({ format: 'something-else', saveVersion: 1 }), /not an Atlas save/);
});
