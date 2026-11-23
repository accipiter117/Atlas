// Applying one mod's content to the ruleset being built (docs/PLAN.md section 4.3).
//
// Operations on entry lists:
//   add (no op)  create a new entry; an existing id is an error (use replace)
//   replace      swap the whole entry; the id must exist
//   change       set fields (dot paths), add to lists, remove from lists
//   remove       by id or by `where`; cascade: true also removes what depended on it
// Whole-object types (tuning, text, skin) merge by key instead.
//
// Everything that happens is recorded: messages for the report, who wrote
// which field (for "last one wins" warnings) and per-mod counts for the
// summary lines.

import { clone } from '../core/clone.js';
import { ENTRY_SCHEMAS, OBJECT_TYPES } from './schemas/index.js';
import { entryRefs } from './validate.js';
import { checkWhere, matches, getPath, SelectorError } from './selectors.js';

/** The empty build context the loader threads through every mod. */
export function createContext() {
  return {
    content: {},           // contentType -> { id: entry }
    tuning: {},
    text: {},
    skin: {},
    provenance: {},        // contentType -> { id: { mod, file, index } }
    writes: new Map(),     // "units.archer.rangedStrength" -> [{ mod, value }]
    stats: new Map(),      // mod -> { added, replaced, changed, removed, cascaded: { type: n }, removedByType: { type: n } }
    messages: [],
  };
}

function statsFor(ctx, mod) {
  if (!ctx.stats.has(mod)) {
    ctx.stats.set(mod, { added: {}, replaced: {}, changed: {}, removed: {}, cascaded: {} });
  }
  return ctx.stats.get(mod);
}

function bump(bucket, type, n = 1) {
  bucket[type] = (bucket[type] ?? 0) + n;
}

function say(ctx, level, code, mod, params = {}) {
  ctx.messages.push({ level, code, mod, params });
}

function recordWrite(ctx, mod, modType, field, value) {
  if (modType === 'ruleset') return;
  if (!ctx.writes.has(field)) ctx.writes.set(field, []);
  ctx.writes.get(field).push({ mod, value });
}

/** Set a dot path, creating objects on the way. */
export function setPath(target, path, value) {
  const parts = path.split('.');
  let v = target;
  for (const part of parts.slice(0, -1)) {
    if (v[part] === null || typeof v[part] !== 'object') v[part] = {};
    v = v[part];
  }
  v[parts.at(-1)] = value;
}

/** Is a dot path a known field for this schema (or already present on the entry)? */
function fieldKnown(schema, entry, path) {
  if (getPath(entry, path) !== undefined) return true;
  let spec = { t: 'object', fields: schema.fields };
  for (const part of path.split('.')) {
    if (spec.t === 'object') {
      if (spec.open && !Object.hasOwn(spec.fields, part)) return true;
      spec = spec.fields[part];
      if (!spec) return false;
    } else if (spec.t === 'map') {
      spec = spec.of;
    } else {
      return false;
    }
  }
  return true;
}

function fieldSpec(schema, path) {
  let spec = { t: 'object', fields: schema.fields };
  for (const part of path.split('.')) {
    if (spec?.t === 'object') spec = spec.fields[part];
    else if (spec?.t === 'map') spec = spec.of;
    else return null;
  }
  return spec ?? null;
}

const stripOp = (entry) => {
  const { op: _op, cascade: _c, where: _w, ...rest } = entry;
  return rest;
};

/**
 * Remove entries, following cascade rules if asked.
 * @param {Array<[string, string]>} targets  [contentType, id] pairs
 */
export function removeEntries(ctx, mod, targets, cascade, origin) {
  const stats = statsFor(ctx, mod);
  const gone = new Set();
  let queue = targets.slice();
  let firstWave = true;
  while (queue.length) {
    for (const [type, id] of queue) {
      if (!ctx.content[type]?.[id]) continue;
      delete ctx.content[type][id];
      delete ctx.provenance[type]?.[id];
      gone.add(`${type}:${id}`);
      bump(firstWave ? stats.removed : stats.cascaded, type);
    }
    firstWave = false;
    if (!cascade) break;
    const next = [];
    for (const [type, entries] of Object.entries(ctx.content)) {
      const schema = ENTRY_SCHEMAS[type];
      for (const [id, entry] of Object.entries(entries)) {
        let removeThis = false;
        for (const r of entryRefs(schema, entry)) {
          if (!gone.has(`${r.to}:${r.id}`)) continue;
          if (r.cascade === 'remove') removeThis = true;
          else r.apply();
        }
        if (removeThis) next.push([type, id]);
      }
    }
    queue = next;
  }
  return gone.size;
}

function applyEntries(ctx, mod, modType, file, block) {
  const type = block.contentType;
  const schema = ENTRY_SCHEMAS[type];
  const stats = statsFor(ctx, mod);
  const existed = Object.hasOwn(ctx.content, type);
  if (!existed) {
    const onlyEdits = block.entries.every((e) => e && (e.op === 'change' || e.op === 'remove'));
    if (onlyEdits && block.entries.length) {
      say(ctx, 'warning', 'contentTypeMissing', mod, { file, contentType: type });
      return;
    }
    ctx.content[type] = {};
    ctx.provenance[type] = {};
  }
  const entries = ctx.content[type];
  const where = (index) => ({ file, index: index + 1, contentType: type });

  block.entries.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      say(ctx, 'error', 'badOperation', mod, { ...where(index), op: 'add' });
      return;
    }
    const op = raw.op ?? 'add';
    const id = raw.id;
    switch (op) {
      case 'add':
      case 'replace': {
        if (typeof id !== 'string' || !id) { say(ctx, 'error', 'missingIdField', mod, where(index)); return; }
        const exists = Object.hasOwn(entries, id);
        if (op === 'add' && exists) { say(ctx, 'error', 'duplicateId', mod, { ...where(index), id }); return; }
        if (op === 'replace' && !exists) { say(ctx, 'error', 'missingId', mod, { ...where(index), id, op }); return; }
        if (exists) delete entries[id];
        entries[id] = stripOp(clone(raw));
        ctx.provenance[type][id] = { mod, ...where(index) };
        bump(op === 'add' ? stats.added : stats.replaced, type);
        if (op === 'replace') recordWrite(ctx, mod, modType, `${type}.${id}`, '(replaced)');
        return;
      }
      case 'change': {
        if (!Object.hasOwn(entries, id)) { say(ctx, 'error', 'missingId', mod, { ...where(index), id, op }); return; }
        const parts = ['set', 'add', 'remove'].filter((k) => raw[k] !== undefined);
        if (!parts.length) { say(ctx, 'error', 'badOperation', mod, { ...where(index), op }); return; }
        const entry = entries[id];
        let ok = true;
        for (const [path, value] of Object.entries(raw.set ?? {})) {
          if (!fieldKnown(schema, entry, path)) { say(ctx, 'error', 'missingField', mod, { ...where(index), id, field: path }); ok = false; continue; }
          setPath(entry, path, clone(value));
          recordWrite(ctx, mod, modType, `${type}.${id}.${path}`, value);
        }
        for (const [path, items] of Object.entries(raw.add ?? {})) {
          const current = getPath(entry, path);
          const spec = fieldSpec(schema, path);
          if (current === undefined && spec && (spec.t === 'list' || spec.t === 'effects')) setPath(entry, path, []);
          const list = getPath(entry, path);
          if (!Array.isArray(list)) { say(ctx, 'error', 'missingField', mod, { ...where(index), id, field: path }); ok = false; continue; }
          list.push(...clone(Array.isArray(items) ? items : [items]));
          recordWrite(ctx, mod, modType, `${type}.${id}.${path}`, `+${JSON.stringify(items)}`);
        }
        for (const [path, items] of Object.entries(raw.remove ?? {})) {
          const list = getPath(entry, path);
          if (!Array.isArray(list)) { say(ctx, 'error', 'missingField', mod, { ...where(index), id, field: path }); ok = false; continue; }
          const drop = JSON.stringify(Array.isArray(items) ? items : [items]);
          const dropSet = new Set(JSON.parse(drop).map((x) => JSON.stringify(x)));
          setPath(entry, path, list.filter((x) => !dropSet.has(JSON.stringify(x))));
          recordWrite(ctx, mod, modType, `${type}.${id}.${path}`, `-${drop}`);
        }
        if (ok) bump(stats.changed, type);
        return;
      }
      case 'remove': {
        let ids;
        if (raw.where !== undefined) {
          try {
            checkWhere(raw.where);
            ids = Object.keys(entries).filter((k) => matches(entries[k], raw.where));
          } catch (e) {
            if (!(e instanceof SelectorError)) throw e;
            say(ctx, 'error', 'badSelector', mod, { ...where(index), problem: e.message });
            return;
          }
          if (!ids.length) say(ctx, 'warning', 'noMatch', mod, { ...where(index), where: JSON.stringify(raw.where) });
        } else if (typeof id === 'string') {
          ids = Object.hasOwn(entries, id) ? [id] : [];
          if (!ids.length) say(ctx, 'warning', 'noMatch', mod, { ...where(index), where: `id ${id}` });
        } else {
          say(ctx, 'error', 'badOperation', mod, { ...where(index), op });
          return;
        }
        removeEntries(ctx, mod, ids.map((x) => [type, x]), raw.cascade === true, where(index));
        return;
      }
      default:
        say(ctx, 'error', 'badOperation', mod, { ...where(index), op: String(op) });
    }
  });
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = clone(v);
    }
  }
  return target;
}

function applyObject(ctx, mod, modType, file, block) {
  const type = block.contentType;
  const target = ctx[type];
  if (type === 'text') {
    const strings = block.strings;
    if (!strings || typeof strings !== 'object' || Array.isArray(strings)) { say(ctx, 'error', 'badFile', mod, { file }); return; }
    for (const [k, v] of Object.entries(strings)) {
      if (typeof v !== 'string') { say(ctx, 'error', 'badText', mod, { file, key: k }); continue; }
      target[k] = v;
      recordWrite(ctx, mod, modType, `text.${k}`, v);
    }
    return;
  }
  if (block.values !== undefined) {
    if (modType !== 'ruleset' && type === 'tuning') { say(ctx, 'error', 'tuningValuesNotRuleset', mod, { file }); return; }
    deepMerge(target, block.values);
  }
  for (const [path, value] of Object.entries(block.set ?? {})) {
    if (getPath(target, path) === undefined && !(type === 'skin')) {
      say(ctx, 'error', 'missingSetting', mod, { file, contentType: type, field: path });
      continue;
    }
    setPath(target, path, clone(value));
    recordWrite(ctx, mod, modType, `${type}.${path}`, value);
  }
  if (block.values === undefined && block.set === undefined) say(ctx, 'error', 'badFile', mod, { file });
}

/** Apply one parsed block ({ contentType, ... }) from a mod's file. */
export function applyBlock(ctx, mod, modType, file, block) {
  if (!block || typeof block !== 'object' || typeof block.contentType !== 'string') {
    say(ctx, 'error', 'badFile', mod, { file });
    return;
  }
  if (OBJECT_TYPES.includes(block.contentType)) {
    applyObject(ctx, mod, modType, file, block);
  } else if (Object.hasOwn(ENTRY_SCHEMAS, block.contentType)) {
    if (!Array.isArray(block.entries)) { say(ctx, 'error', 'badFile', mod, { file }); return; }
    applyEntries(ctx, mod, modType, file, block);
  } else {
    say(ctx, 'error', 'unknownContentType', mod, { file, contentType: block.contentType });
  }
}

/** Give every entry with an era its era's index, so selectors can compare eras by order. */
export function annotateEras(ctx) {
  const eras = ctx.content.eras ?? {};
  for (const entries of Object.values(ctx.content)) {
    for (const entry of Object.values(entries)) {
      if (typeof entry.era === 'string' && Object.hasOwn(eras, entry.era) && Number.isInteger(eras[entry.era].index)) {
        entry.eraIndex = eras[entry.era].index;
      } else {
        delete entry.eraIndex;
      }
    }
  }
}
