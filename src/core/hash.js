// Short, stable hashes. Used for fingerprints (are two games identical?),
// ruleset hashes (did the mods change?) and deriving named random streams.
//
// stableStringify sorts object keys, so two states built in a different
// order still hash the same. Object key order is a classic way for
// "identical" games to drift apart, so the fingerprint never depends on it.

/** FNV-1a, 32-bit. Returns an unsigned integer. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** JSON with object keys sorted at every level. Refuses values JSON cannot round-trip. */
export function stableStringify(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Cannot hash a non-finite number (${value})`);
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
      return `{${Object.keys(value).sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
        .join(',')}}`;
    default:
      throw new TypeError(`Cannot hash a value of type ${typeof value}`);
  }
}

/** Eight hex characters identifying any JSON-like value. */
export function hashValue(value) {
  return hashString(stableStringify(value)).toString(16).padStart(8, '0');
}
