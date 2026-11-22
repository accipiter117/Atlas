// Copying and freezing plain game data.
//
// The sim never edits the state it is given: applyCommand works on a copy and
// hands back the new one. That makes undo, replays and "what if" AI thinking
// safe, because an old state can never change underneath you.

/** Deep copy of plain JSON-like data (objects, arrays, numbers, strings, booleans, null). */
export function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const key of Object.keys(value)) out[key] = clone(value[key]);
  return out;
}

/** Freeze an object and everything inside it. Used for the ruleset, which must never change mid-game. */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}
