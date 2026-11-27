// The mod loader (docs/PLAN.md section 4).
//
// Takes the text of every available mod's files (it never fetches: main.js
// does that in the browser, tools/ read files in Node), works out the load
// order, applies each mod, checks the result and returns:
//   { ruleset, report, order, hash, ok }
// ruleset is deeply frozen; hash is stable across runs and machines; report
// lists every message with the mod that caused it. Errors block starting a
// game; warnings and info do not.

import { clone, deepFreeze } from '../core/clone.js';
import { hashValue } from '../core/hash.js';
import { ENTRY_SCHEMAS } from './schemas/index.js';
import { validateValue, validateEntry, entryRefs } from './validate.js';
import { createContext, applyBlock, annotateEras } from './merge.js';
import { resolveOptions, substitute, satisfies, OptionError } from './options.js';
import { req, str, list, obj, oneOf, any, key } from './schemas/fields.js';

const TYPE_ORDER = { ruleset: 0, conversion: 1, tweak: 2 };

const MANIFEST = obj({
  id: req(str()),
  name: req(str()),
  version: req(str()),
  type: req(oneOf(['ruleset', 'conversion', 'tweak'])),
  engine: str(),
  description: str(),
  descriptionKey: key(),
  dependsOn: list(str()),
  loadAfter: list(str()),
  incompatibleWith: list(str()),
  options: list(obj({
    id: req(str()), labelKey: key(), type: req(oneOf(['choice', 'bool', 'int'])),
    source: str(), values: list(any()), default: any(), min: any(), max: any(),
  })),
  files: req(list(str())),
  credits: req(str()),
  dev: any(),
});

function parse(text) {
  return typeof text === 'string' ? JSON.parse(text) : clone(text);
}

/** Stable topological sort: dependencies first, otherwise the player's order. Returns { order, cycle }. */
export function sortMods(manifests, requested) {
  const ids = requested.filter((id) => manifests.has(id));
  const rank = (id) => [TYPE_ORDER[manifests.get(id).type] ?? 9, requested.indexOf(id)];
  const before = new Map(ids.map((id) => [id, new Set()]));
  for (const id of ids) {
    const m = manifests.get(id);
    for (const dep of [...(m.dependsOn ?? []), ...(m.loadAfter ?? [])]) {
      if (before.has(dep) && dep !== id) before.get(id).add(dep);
    }
  }
  const order = [];
  const placed = new Set();
  while (order.length < ids.length) {
    const ready = ids.filter((id) => !placed.has(id) && [...before.get(id)].every((d) => placed.has(d)));
    if (!ready.length) return { order, cycle: ids.filter((id) => !placed.has(id)) };
    ready.sort((a, b) => {
      const [ta, ia] = rank(a);
      const [tb, ib] = rank(b);
      return ta - tb || ia - ib;
    });
    order.push(ready[0]);
    placed.add(ready[0]);
  }
  return { order, cycle: [] };
}

function collectKeys(spec, value, path = '', out = []) {
  if (value === undefined || value === null) return out;
  if (spec.t === 'key' && typeof value === 'string') out.push({ path, key: value });
  else if (spec.t === 'list' && Array.isArray(value)) value.forEach((v, i) => collectKeys(spec.of, v, `${path}.${i}`, out));
  else if (spec.t === 'object' && typeof value === 'object') {
    for (const [n, s] of Object.entries(spec.fields)) collectKeys(s, value[n], path ? `${path}.${n}` : n, out);
  }
  return out;
}

/**
 * Load and merge mods.
 *
 * @param {object} args
 * @param {Object<string, {manifest: string|object, files: Object<string, string|object>}>} args.available
 * @param {string[]} args.selection  mod ids in the player's chosen order
 * @param {Object<string, object>} [args.options]  { modId: { optionId: value } }
 * @param {string} [args.engineVersion]  checked against each manifest's "engine" range
 */
export function loadRuleset({ available, selection, options = {}, engineVersion = null }) {
  const ctx = createContext();
  const say = (level, code, mod, params = {}) => ctx.messages.push({ level, code, mod, params });

  // 1. Manifests.
  const manifests = new Map();
  for (const id of selection) {
    if (!Object.hasOwn(available, id)) { say('error', 'unknownMod', id, {}); continue; }
    let manifest;
    try {
      manifest = parse(available[id].manifest);
    } catch (e) {
      say('error', 'badJson', id, { file: 'mod.json', problem: e.message });
      continue;
    }
    const check = validateValue(MANIFEST, manifest, '');
    if (check.errors.length || manifest.id !== id) {
      const first = check.errors[0];
      say('error', 'badManifest', id, { field: first?.path ?? 'id', got: first?.got ?? JSON.stringify(manifest.id) });
      continue;
    }
    manifests.set(id, manifest);
  }

  // 2. Which mods may be combined.
  const ofType = (t) => [...manifests.values()].filter((m) => m.type === t);
  const rulesets = ofType('ruleset');
  if (rulesets.length === 0) say('error', 'noRuleset', null, {});
  for (const extra of rulesets.slice(1)) say('error', 'twoRulesets', extra.id, { other: rulesets[0].id });
  const conversions = ofType('conversion');
  // Only one conversion per match, except one built on another (it names it in dependsOn, as
  // Killzone: Extrasolar War does Killzone): the two then count as one.
  const builtOn = (a, b) => (a.dependsOn ?? []).includes(b.id) || (b.dependsOn ?? []).includes(a.id);
  for (const extra of conversions.slice(1)) {
    if (conversions.every((c) => c === extra || builtOn(extra, c))) continue;
    say('error', 'twoConversions', extra.id, { other: conversions[0].id });
  }
  const reportedPairs = new Set();
  for (const m of manifests.values()) {
    for (const other of m.incompatibleWith ?? []) {
      const pair = [m.id, other].sort().join('|');
      if (manifests.has(other) && !reportedPairs.has(pair) && !(m.type === 'conversion' && manifests.get(other).type === 'conversion')) {
        reportedPairs.add(pair);
        say('error', 'incompatible', m.id, { other });
      }
    }
  }

  // Drop mods that cannot load: wrong engine, missing dependencies (and anything that needed them).
  const usable = new Map(manifests);
  for (const m of manifests.values()) {
    if (engineVersion && m.engine && !satisfies(engineVersion, m.engine)) {
      say('error', 'engineVersion', m.id, { needs: m.engine, have: engineVersion });
      usable.delete(m.id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of [...usable.values()]) {
      const missing = (m.dependsOn ?? []).find((d) => !usable.has(d));
      if (missing) {
        say('error', manifests.has(missing) ? 'dependencyFailed' : 'missingDependency', m.id, { needs: missing });
        usable.delete(m.id);
        changed = true;
      }
    }
  }

  // 3. Load order.
  const requested = selection.filter((id) => usable.has(id));
  const { order, cycle } = sortMods(usable, requested);
  if (cycle.length) say('error', 'dependencyCycle', cycle[0], { mods: cycle.join(', ') });
  const wanted = requested.slice().sort((a, b) => (TYPE_ORDER[usable.get(a).type] - TYPE_ORDER[usable.get(b).type]) || requested.indexOf(a) - requested.indexOf(b));
  order.forEach((id, i) => {
    if (wanted[i] !== id && !cycle.length) {
      const m = usable.get(id);
      const after = [...(m.dependsOn ?? []), ...(m.loadAfter ?? [])].filter((d) => order.indexOf(d) >= 0 && wanted.indexOf(d) > wanted.indexOf(id));
      if (after.length) say('info', 'reordered', id, { after: after.join(', ') });
    }
  });

  // 4. Apply each mod in order.
  for (const id of order) {
    const manifest = usable.get(id);
    const files = available[id].files ?? {};
    const { values, problems } = resolveOptions(manifest, options[id], ctx.content);
    for (const p of problems) say('error', p.code, id, p.params);
    annotateEras(ctx);
    for (const file of manifest.files) {
      if (!Object.hasOwn(files, file)) { say('error', 'missingFile', id, { file }); continue; }
      let data;
      try {
        data = parse(files[file]);
      } catch (e) {
        say('error', 'badJson', id, { file, problem: e.message });
        continue;
      }
      try {
        data = substitute(data, manifest, values, ctx.content);
      } catch (e) {
        if (!(e instanceof OptionError)) throw e;
        say('error', e.code, id, { ...e.params, file });
        continue;
      }
      const blocks = Array.isArray(data?.blocks) ? data.blocks : [data];
      for (const block of blocks) applyBlock(ctx, id, manifest.type, file, block);
    }
  }
  annotateEras(ctx);

  // 5. Checks on the merged result.
  for (const [type, entries] of Object.entries(ctx.content)) {
    const schema = ENTRY_SCHEMAS[type];
    for (const [id, entry] of Object.entries(entries)) {
      const at = ctx.provenance[type]?.[id] ?? {};
      const result = validateEntry(schema, entry);
      for (const e of result.errors) {
        say('error', 'schema', at.mod ?? null, { file: at.file, index: at.index, id, contentType: type, field: e.path, problem: e.kind, ...e.params, got: e.got });
      }
      for (const w of result.warnings) say('warning', 'unknownField', at.mod ?? null, { file: at.file, index: at.index, id, contentType: type, field: w.path });
      for (const r of entryRefs(schema, entry)) {
        if (!Object.hasOwn(ctx.content, r.to)) {
          say('warning', 'refTypeMissing', at.mod ?? null, { field: `${type}.${id}.${r.path}`, target: r.id, contentType: r.to });
        } else if (!Object.hasOwn(ctx.content[r.to], r.id)) {
          say('error', 'badReference', at.mod ?? null, { field: `${type}.${id}.${r.path}`, target: r.id, contentType: r.to });
        }
      }
      for (const k of collectKeys({ t: 'object', fields: schema.fields }, entry)) {
        if (!Object.hasOwn(ctx.text, k.key)) say('warning', 'missingText', at.mod ?? null, { field: `${type}.${id}.${k.path}`, key: k.key });
      }
    }
  }
  // Option labels need text too.
  for (const m of usable.values()) {
    for (const o of m.options ?? []) if (o.labelKey && !Object.hasOwn(ctx.text, o.labelKey)) say('warning', 'missingText', m.id, { field: `${m.id}.options.${o.id}`, key: o.labelKey });
  }

  // "Last one wins": two or more mods (besides the ruleset) wrote the same field.
  for (const [field, writes] of ctx.writes) {
    const mods = new Set(writes.map((w) => w.mod));
    if (mods.size >= 2) {
      say('warning', 'lastOneWins', writes.at(-1).mod, {
        field,
        changes: writes.map((w) => ({ mod: w.mod, value: JSON.stringify(w.value) })),
        value: JSON.stringify(writes.at(-1).value),
      });
    }
  }

  // Per-mod summary lines.
  for (const id of order) {
    const s = ctx.stats.get(id);
    if (!s) continue;
    const total = (b) => Object.values(b).reduce((a, n) => a + n, 0);
    const counts = { added: total(s.added), replaced: total(s.replaced), changed: total(s.changed), removed: total(s.removed), cascaded: total(s.cascaded) };
    if (Object.values(counts).some((n) => n > 0)) {
      say('info', 'modSummary', id, { ...counts, detail: s });
    }
  }

  // 6. Build, freeze and hash the ruleset.
  const ruleset = {
    mods: order.map((id) => ({ id, version: usable.get(id).version, type: usable.get(id).type })),
    tuning: ctx.tuning,
    text: ctx.text,
    skin: ctx.skin,
    ...ctx.content,
  };
  const hash = hashValue(ruleset);
  deepFreeze(ruleset);

  const levels = ['error', 'warning', 'info'];
  const messages = ctx.messages.slice().sort((a, b) => levels.indexOf(a.level) - levels.indexOf(b.level));
  const count = (l) => messages.filter((m) => m.level === l).length;
  const report = { messages, errors: count('error'), warnings: count('warning'), infos: count('info') };
  return { ruleset, report, order, hash, ok: report.errors === 0 };
}

