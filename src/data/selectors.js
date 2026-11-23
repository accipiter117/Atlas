// `where` selectors for bulk edits (docs/PLAN.md section 4.3), e.g.
//   { "op": "remove", "where": { "era": { "in": ["medieval", "renaissance"] } } }
//   { "where": { "tags": { "has": "historical" } } }
// Several fields in one `where` must all match. A plain value means "equals".

export const OPERATORS = Object.freeze(['eq', 'in', 'notIn', 'has', 'gt', 'lt', 'gte', 'lte']);

export class SelectorError extends Error {}

/** Read a dot path such as "yields.food" from an object. */
export function getPath(value, path) {
  let v = value;
  for (const part of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = v[part];
  }
  return v;
}

function same(a, b) {
  return a === b || (a !== null && b !== null && typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));
}

function test(op, actual, expected) {
  switch (op) {
    case 'eq': return same(actual, expected);
    case 'in':
      if (!Array.isArray(expected)) throw new SelectorError('"in" needs a list');
      return expected.some((e) => same(actual, e));
    case 'notIn':
      if (!Array.isArray(expected)) throw new SelectorError('"notIn" needs a list');
      return !expected.some((e) => same(actual, e));
    case 'has':
      return Array.isArray(actual) && (Array.isArray(expected)
        ? expected.every((e) => actual.some((a) => same(a, e)))
        : actual.some((a) => same(a, expected)));
    case 'gt': return typeof actual === 'number' && actual > expected;
    case 'lt': return typeof actual === 'number' && actual < expected;
    case 'gte': return typeof actual === 'number' && actual >= expected;
    case 'lte': return typeof actual === 'number' && actual <= expected;
    default: throw new SelectorError(`unknown selector "${op}" (use ${OPERATORS.join(', ')})`);
  }
}

/** Throws SelectorError if a `where` is malformed, so mistakes are reported rather than silently matching nothing. */
export function checkWhere(where) {
  if (!where || typeof where !== 'object' || Array.isArray(where) || Object.keys(where).length === 0) {
    throw new SelectorError('"where" must be an object with at least one field');
  }
  for (const cond of Object.values(where)) {
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      for (const op of Object.keys(cond)) if (!OPERATORS.includes(op)) throw new SelectorError(`unknown selector "${op}" (use ${OPERATORS.join(', ')})`);
    }
  }
}

/** Does an entry match every condition in `where`? */
export function matches(entry, where) {
  return Object.entries(where).every(([path, cond]) => {
    const actual = getPath(entry, path);
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, expected]) => test(op, actual, expected));
    }
    return test('eq', actual, cond);
  });
}
