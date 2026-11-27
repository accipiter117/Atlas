// Saving and loading games (section 8).
//
// A save holds the setup, the full command log and a snapshot of the latest
// state, so loading is instant (from the snapshot) and any doubt can be
// settled by replaying the log from the seed, which must give the same
// fingerprint.
//
// Storage (section 8.2), all in one storage object (localStorage in the
// browser, memoryStorage() in tests):
//   atlas:index          the list of saves: id, kind, label, turn, faction, mods, saved time, size
//   atlas:slot:<id>      one named save, gzipped then base64
//   atlas:autosave:<n>   rolling autosaves, the last three
//
// This file never touches the page or the clock itself: storage and the
// creation time are handed in.

import { fingerprint, ENGINE_VERSION, createGame, applyCommand } from '../sim/index.js';
import { CURRENT_SAVE_VERSION, upgrade } from './migrations.js';
import { createCodec, bytesToBase64, base64ToBytes } from './codec.js';
import { packLog, unpackLog } from './commandKeys.js';

export const SAVE_FORMAT = 'atlas-save';
export const SAVE_BUDGET = 1_500_000;
export const AUTOSAVES = 3;
const INDEX_KEY = 'atlas:index';
const SLOT_PREFIX = 'atlas:slot:';
const AUTO_PREFIX = 'atlas:autosave:';

/** A save that will not fit in the browser's storage. The UI offers an export code instead. */
export class SaveTooBigError extends Error {
  constructor(bytes) {
    super(`This save needs ${Math.ceil(bytes / 1000)} KB and will not fit in the browser's storage`);
    this.bytes = bytes;
  }
}

/** Build a save object from a game. `now` is the creation time as an ISO string, supplied by the caller. */
export function createSave({ state, log = [], label = '', now, journal = null, meta = null }) {
  const save = {
    format: SAVE_FORMAT,
    saveVersion: CURRENT_SAVE_VERSION,
    engineVersion: ENGINE_VERSION,
    createdAt: now ?? new Date(0).toISOString(),
    label,
    setup: state.setup,
    rulesetHash: state.rulesetHash,
    log,
    snapshot: { turn: state.turn, stateVersion: state.stateVersion, state },
    fingerprint: fingerprint(state),
    recorder: journal ? { included: true, journal } : { included: false },
  };
  // For the Continue and Load cards (graphics overhaul G7): faction, leader portrait, colour and a
  // tiny text map. Optional: older saves simply have none, and nothing in the game reads it.
  if (meta) save.meta = meta;
  return save;
}

/** Check a save's wrapper and bring it up to the current version. */
export function readSave(save) {
  if (save?.format !== SAVE_FORMAT) throw new Error('This is not an Atlas save');
  return upgrade(save);
}

/** The stored form: the command log in short keys (section 8.2). */
function toStored(save) {
  return { ...save, log: packLog(save.log), packed: 1 };
}

function fromStored(stored) {
  if (!stored?.packed) return stored;
  const { packed: _packed, ...save } = stored;
  return { ...save, log: unpackLog(save.log) };
}

/** An in-memory stand-in for localStorage, for tests and for browsers that block storage. */
export function memoryStorage(quota = Infinity) {
  const data = new Map();
  const used = () => [...data.values()].reduce((n, v) => n + v.length, 0);
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      const text = String(v);
      if (used() - (data.get(k)?.length ?? 0) + text.length > quota) {
        const e = new Error('Quota exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      data.set(k, text);
    },
    removeItem: (k) => { data.delete(k); },
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}

/** The packed text that goes into storage, and its size. */
export async function packSave(save, codec = createCodec()) {
  const text = bytesToBase64(await codec.pack(toStored(save)));
  return { text, bytes: text.length };
}

export async function unpackSave(text, codec = createCodec()) {
  return readSave(fromStored(await codec.unpack(base64ToBytes(text))));
}

// ---------- The index ----------

export function listSaves(storage) {
  try {
    const list = JSON.parse(storage.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(list) ? list.slice().sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || (b.seq ?? 0) - (a.seq ?? 0)) : [];
  } catch {
    return [];
  }
}

function writeIndex(storage, list) {
  storage.setItem(INDEX_KEY, JSON.stringify(list));
}

function keyOf(entry) {
  return entry.kind === 'autosave' ? AUTO_PREFIX + entry.n : SLOT_PREFIX + entry.id;
}

function summary(save, extra) {
  const state = save.snapshot.state;
  const human = state.factions.find((f) => f.kind === 'human') ?? state.factions[0];
  return {
    label: save.label,
    turn: state.turn,
    civ: human?.civ ?? null,
    mods: save.setup?.mods ?? [],
    savedAt: save.createdAt,
    over: Boolean(state.winner),
    ...(save.meta ? { meta: save.meta } : {}),
    ...extra,
  };
}

function isQuotaError(e) {
  return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

async function store(storage, entry, save, codec) {
  const { text, bytes } = await packSave(save, codec);
  if (bytes > SAVE_BUDGET) throw new SaveTooBigError(bytes);
  const list = listSaves(storage).filter((e) => !(e.kind === entry.kind && (entry.kind === 'autosave' ? e.n === entry.n : e.id === entry.id)));
  const seq = Math.max(0, ...list.map((e) => e.seq ?? 0)) + 1;
  const full = { ...summary(save, entry), bytes, seq };
  try {
    storage.setItem(keyOf(full), text);
    writeIndex(storage, [...list, full]);
  } catch (e) {
    if (isQuotaError(e)) throw new SaveTooBigError(bytes);
    throw e;
  }
  return full;
}

/** Save to a named slot (a new id if none is given). Returns the index entry. */
export async function saveToSlot(storage, slotId, save, codec = createCodec()) {
  return store(storage, { kind: 'slot', id: String(slotId) }, save, codec);
}

/** Rolling autosave: overwrites the oldest once `keep` exist (three unless Settings says otherwise, up to ten). */
export async function autosave(storage, save, codec = createCodec(), keep = AUTOSAVES) {
  let autos = listSaves(storage).filter((e) => e.kind === 'autosave').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  // Fewer kept than before: the oldest go.
  while (autos.length > keep) { deleteSave(storage, autos[0]); autos = autos.slice(1); }
  let n = 0;
  if (autos.length >= keep) n = autos[0].n;
  else while (autos.some((e) => e.n === n)) n += 1;
  return store(storage, { kind: 'autosave', id: `auto-${n}`, n }, save, codec);
}

/** Load an index entry (or a slot id). Returns the save, or null if it is missing. */
export async function loadSave(storage, entryOrId, codec = createCodec()) {
  const entry = typeof entryOrId === 'object' ? entryOrId : { kind: 'slot', id: String(entryOrId) };
  const text = storage.getItem(keyOf(entry));
  if (text === null) return null;
  return unpackSave(text, codec);
}

export async function loadFromSlot(storage, slotId, codec = createCodec()) {
  return loadSave(storage, { kind: 'slot', id: String(slotId) }, codec);
}

export function deleteSave(storage, entry) {
  storage.removeItem(keyOf(entry));
  writeIndex(storage, listSaves(storage).filter((e) => !(e.kind === entry.kind && e.id === entry.id)));
}

/** The most recent save of any kind (for Continue), or null. */
export function latestSave(storage) {
  return listSaves(storage).find((e) => !e.over) ?? null;
}

// ---------- Export codes ----------

export async function exportCode(save, codec = createCodec()) {
  return codec.toCode(toStored(save));
}

export async function importCode(code, codec = createCodec()) {
  return readSave(fromStored(await codec.fromCode(code)));
}

// ---------- Checks ----------

/**
 * Which of the save's mods are missing, or at a different version, in the
 * mods on offer. `available` maps id to version.
 */
export function modCheck(save, available) {
  const missing = [];
  const changed = [];
  for (const m of save.setup?.mods ?? []) {
    const [id, version] = String(m).split('@');
    if (!Object.hasOwn(available, id)) missing.push(m);
    else if (version && available[id] !== version) changed.push({ id, saved: version, now: available[id] });
  }
  return { missing, changed };
}

/** Replay the whole log from the seed. Returns the final state and whether it matches the save. */
export function replay(save, ruleset) {
  let state = createGame(ruleset, save.setup);
  for (const cmd of save.log) {
    const r = applyCommand(state, cmd, ruleset);
    if (!r.ok) return { state, ok: false, error: r.error, command: cmd };
    state = r.state;
  }
  return { state, ok: fingerprint(state) === save.fingerprint };
}
