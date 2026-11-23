// Checking entries against their schemas, and finding every reference in them.
//
// Problems come back as small objects (a path, a kind and the numbers
// involved) rather than sentences, so report.js can word them from the text
// file and nothing player-facing is hard-coded here.

import { effectSchema } from './effects-compile.js';

const COLOUR = /^#[0-9a-fA-F]{6}$/;

function describe(value) {
  if (value === undefined) return 'nothing';
  return JSON.stringify(value);
}

function join(path, key) {
  return path ? `${path}.${key}` : String(key);
}

/**
 * Validate a value against a field spec.
 * @returns {{errors: object[], warnings: object[]}}
 */
export function validateValue(spec, value, path = '', out = { errors: [], warnings: [] }) {
  const fail = (kind, params = {}) => out.errors.push({ path, kind, params, got: describe(value) });

  if (value === undefined) {
    if (spec.req) fail('required');
    return out;
  }
  if (value === null) {
    if (!spec.nullable && spec.req) fail('required');
    return out;
  }

  switch (spec.t) {
    case 'any':
      break;
    case 'string':
    case 'key':
    case 'ref':
      if (typeof value !== 'string' || value.length === 0) fail(spec.t === 'key' ? 'key' : spec.t === 'ref' ? 'ref' : 'string', { to: spec.to });
      break;
    case 'int':
      if (!Number.isInteger(value) || value < spec.min || value > spec.max) fail('int', { min: spec.min, max: spec.max });
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) fail('number', { min: spec.min, max: spec.max });
      break;
    case 'bool':
      if (typeof value !== 'boolean') fail('bool');
      break;
    case 'colour':
      if (typeof value !== 'string' || !COLOUR.test(value)) fail('colour');
      break;
    case 'enum':
      if (!spec.values.includes(value)) fail('enum', { values: spec.values.join(', ') });
      break;
    case 'list':
      if (!Array.isArray(value)) { fail('list'); break; }
      if (spec.min && value.length < spec.min) fail('listMin', { min: spec.min });
      value.forEach((item, i) => validateValue(spec.of, item, join(path, i), out));
      break;
    case 'map':
      if (typeof value !== 'object' || Array.isArray(value)) { fail('object'); break; }
      for (const [k, v] of Object.entries(value)) {
        if (spec.keys) validateValue(spec.keys, k, join(path, k), out);
        validateValue(spec.of, v, join(path, k), out);
      }
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) { fail('object'); break; }
      validateFields(spec.fields, value, path, out, spec.open);
      break;
    case 'effects':
      if (!Array.isArray(value)) { fail('list'); break; }
      value.forEach((effect, i) => {
        const p = join(path, i);
        const schema = effect && typeof effect === 'object' ? effectSchema(effect.effect) : null;
        if (!schema) out.errors.push({ path: p, kind: 'effect', params: {}, got: describe(effect?.effect) });
        else validateValue(schema, effect, p, out);
      });
      break;
    default:
      throw new Error(`Schema bug: unknown field type "${spec.t}" at ${path}`);
  }
  return out;
}

function validateFields(fields, value, path, out, open = false) {
  for (const [name, spec] of Object.entries(fields)) validateValue(spec, value[name], join(path, name), out);
  if (!open) {
    for (const name of Object.keys(value)) {
      if (!Object.hasOwn(fields, name) && name !== 'eraIndex') out.warnings.push({ path: join(path, name), kind: 'unknownField', params: {} });
    }
  }
}

/** Validate a whole entry against its content type's schema. */
export function validateEntry(schema, entry) {
  const out = { errors: [], warnings: [] };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    out.errors.push({ path: '', kind: 'object', params: {}, got: describe(entry) });
    return out;
  }
  validateFields(schema.fields, entry, '', out);
  return out;
}

/**
 * Every reference inside a value, with what cascade should do if its target goes.
 * Each result has: to (content type), id, path, cascade ('remove' | 'prune' | 'clear'),
 * and apply() which prunes or clears it in place.
 */
export function collectRefs(spec, value, path = '', out = [], holder = null) {
  if (value === undefined || value === null) return out;
  switch (spec.t) {
    case 'ref':
      if (typeof value === 'string') out.push({ to: spec.to, id: value, path, cascade: spec.cascade, ...holder });
      break;
    case 'list':
      if (Array.isArray(value)) {
        value.forEach((item, i) => collectRefs(spec.of, item, join(path, i), out, spec.of.t === 'ref'
          ? { apply: () => { const at = value.indexOf(item); if (at >= 0) value.splice(at, 1); } }
          : holder));
      }
      break;
    case 'map':
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          if (spec.keys) collectRefs(spec.keys, k, join(path, k), out, { apply: () => { delete value[k]; } });
          collectRefs(spec.of, v, join(path, k), out, holder);
        }
      }
      break;
    case 'object':
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [name, s] of Object.entries(spec.fields)) {
          collectRefs(s, value[name], join(path, name), out, s.t === 'ref' ? { apply: () => { delete value[name]; } } : holder);
        }
      }
      break;
    case 'effects':
      if (Array.isArray(value)) {
        value.forEach((effect, i) => {
          const schema = effect && typeof effect === 'object' ? effectSchema(effect.effect) : null;
          if (!schema) return;
          // A dangling reference inside an effect drops that effect from the list.
          const drop = { cascade: 'prune', apply: () => { const at = value.indexOf(effect); if (at >= 0) value.splice(at, 1); } };
          const found = collectRefs(schema, effect, join(path, i), []);
          for (const r of found) out.push({ ...r, ...drop });
        });
      }
      break;
    default:
      break;
  }
  return out;
}

/** All references in an entry. */
export function entryRefs(schema, entry) {
  return collectRefs({ t: 'object', fields: schema.fields }, entry);
}
