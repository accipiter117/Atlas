// Saving and loading games (section 8). Skeleton for phase 1: the save shape,
// slots in a storage object and export codes. Autosaves, the slot list UI and
// mod checks on import arrive with the setup screen in phase 9.
//
// Storage is handed in (localStorage in the browser, a simple in-memory object
// in tests), so this file never touches the page directly.

import { fingerprint, ENGINE_VERSION } from '../sim/index.js';
import { CURRENT_SAVE_VERSION, upgrade } from './migrations.js';
import { createCodec, bytesToBase64, base64ToBytes } from './codec.js';

export const SAVE_FORMAT = 'atlas-save';
const SLOT_PREFIX = 'atlas:slot:';

/** Build a save object from a game. `now` is the creation time as an ISO string, supplied by the caller. */
export function createSave({ state, log = [], label = '', now }) {
  return {
    format: SAVE_FORMAT,
    saveVersion: CURRENT_SAVE_VERSION,
    engineVersion: ENGINE_VERSION,
    createdAt: now ?? new Date().toISOString(),
    label,
    setup: state.setup,
    rulesetHash: state.rulesetHash,
    log,
    snapshot: { turn: state.turn, stateVersion: state.stateVersion, state },
    fingerprint: fingerprint(state),
    recorder: { included: false },
  };
}

/** Check a save's wrapper and bring it up to the current version. */
export function readSave(save) {
  if (save?.format !== SAVE_FORMAT) throw new Error('This is not an Atlas save');
  return upgrade(save);
}

/** An in-memory stand-in for localStorage, for tests and for browsers that block storage. */
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

export async function saveToSlot(storage, slotId, save, codec = createCodec()) {
  storage.setItem(SLOT_PREFIX + slotId, bytesToBase64(await codec.pack(save)));
}

export async function loadFromSlot(storage, slotId, codec = createCodec()) {
  const text = storage.getItem(SLOT_PREFIX + slotId);
  if (text === null) return null;
  return readSave(await codec.unpack(base64ToBytes(text)));
}

export async function exportCode(save, codec = createCodec()) {
  return codec.toCode(save);
}

export async function importCode(code, codec = createCodec()) {
  return readSave(await codec.fromCode(code));
}
