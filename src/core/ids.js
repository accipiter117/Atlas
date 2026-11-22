// Readable, deterministic ids such as u_0001 (a unit) or c_0012 (a city).
// The counter lives in state.nextId, so ids replay identically and never
// depend on the clock or on randomness.

/** Take the next id with a prefix. The state must be a working copy. */
export function nextId(state, prefix) {
  if (!/^[a-z]+$/.test(prefix)) throw new TypeError(`Id prefix must be lower-case letters, got "${prefix}"`);
  const n = state.nextId;
  state.nextId = n + 1;
  return `${prefix}_${String(n).padStart(4, '0')}`;
}
