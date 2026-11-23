// Mod options and "$opt:" substitution (docs/PLAN.md sections 4.2 and 4.9).
//
// A mod declares options in mod.json, for example lock-era's era picker:
//   { "id": "era", "type": "choice", "source": "eras", "default": "classical" }
// Anywhere in that mod's own files, "$opt:era" becomes the chosen era's id and
// "$opt:era.index" becomes a field of that era's entry (its index), so one
// rule like { "eraIndex": { "gt": "$opt:era.index" } } works for any era.

const WHOLE = /^\$opt:([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_.]+))?$/;
const INSIDE = /\$opt:([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_.]+))?/g;

export class OptionError extends Error {
  constructor(code, params) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/**
 * Work out each option's value for a mod: the player's choice if valid, else the default.
 * `content` is the merged ruleset so far (for "source" choices).
 * Returns { values, problems } where problems are option errors to report.
 */
export function resolveOptions(manifest, chosen = {}, content = {}) {
  const values = {};
  const problems = [];
  for (const opt of manifest.options ?? []) {
    const has = Object.hasOwn(chosen, opt.id);
    let value = has ? chosen[opt.id] : opt.default;
    const valid = (v) => {
      switch (opt.type) {
        case 'bool': return typeof v === 'boolean';
        case 'int': return Number.isInteger(v) && (opt.min === undefined || v >= opt.min) && (opt.max === undefined || v <= opt.max);
        case 'choice':
          if (opt.source) return typeof v === 'string' && Object.hasOwn(content[opt.source] ?? {}, v);
          return (opt.values ?? []).includes(v);
        default: return false;
      }
    };
    if (opt.type === 'choice' && opt.source && !content[opt.source]) {
      problems.push({ code: 'optionSourceMissing', params: { option: opt.id, source: opt.source } });
      continue;
    }
    if (!valid(value)) {
      problems.push({ code: 'badOption', params: { option: opt.id, value: JSON.stringify(value) } });
      value = has && valid(opt.default) ? opt.default : undefined;
      if (value === undefined) continue;
    }
    values[opt.id] = value;
  }
  return { values, problems };
}

function lookup(manifest, values, content, name, field) {
  const opt = (manifest.options ?? []).find((o) => o.id === name);
  if (!opt) throw new OptionError('unknownOption', { option: name });
  if (!Object.hasOwn(values, name)) throw new OptionError('badOption', { option: name, value: 'nothing' });
  const value = values[name];
  if (!field) return value;
  if (!opt.source) throw new OptionError('unknownOption', { option: `${name}.${field}` });
  let v = content[opt.source]?.[value];
  for (const part of field.split('.')) v = v?.[part];
  if (v === undefined) throw new OptionError('unknownOption', { option: `${name}.${field}` });
  return v;
}

/** Replace every "$opt:" in a parsed file with its value. Returns a new value; throws OptionError. */
export function substitute(value, manifest, values, content) {
  if (typeof value === 'string') {
    const whole = WHOLE.exec(value);
    if (whole) return lookup(manifest, values, content, whole[1], whole[2]);
    if (value.includes('$opt:')) return value.replace(INSIDE, (_, n, f) => String(lookup(manifest, values, content, n, f)));
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, manifest, values, content));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitute(v, manifest, values, content);
    return out;
  }
  return value;
}

/** Does an engine version satisfy a range like ">=0.1.0" or ">=0.1.0 <2.0.0"? */
export function satisfies(version, range) {
  if (!range) return true;
  const parse = (v) => v.split('.').map(Number);
  const cmp = (a, b) => {
    const x = parse(a);
    const y = parse(b);
    for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  return range.trim().split(/\s+/).every((part) => {
    const m = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(part);
    if (!m) return false;
    const c = cmp(version, m[2]);
    switch (m[1] ?? '=') {
      case '>=': return c >= 0;
      case '<=': return c <= 0;
      case '>': return c > 0;
      case '<': return c < 0;
      default: return c === 0;
    }
  });
}
