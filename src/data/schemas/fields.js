// Building blocks for content schemas (docs/PLAN.md section 4.6).
//
// A schema is a plain object describing each field: its type, whether it is
// required, its range, and for references the content type it must point to.
// No libraries: validate.js reads these objects directly.
//
// References carry a cascade rule, used when an entry they point to is removed
// with cascade: true. "remove" removes the whole entry that holds the reference
// (a unit that requires a removed tech), "prune" just takes the item out of a
// list (a faction's list of unique units).

export const YIELDS = Object.freeze(['food', 'production', 'gold', 'science', 'culture', 'faith']);
export const ERA_FIELD = 'era';

export const str = (o = {}) => ({ t: 'string', ...o });
export const key = (o = {}) => ({ t: 'key', ...o });
export const int = (min, max, o = {}) => ({ t: 'int', min, max, ...o });
export const num = (min, max, o = {}) => ({ t: 'number', min, max, ...o });
export const bool = (o = {}) => ({ t: 'bool', ...o });
export const colour = (o = {}) => ({ t: 'colour', ...o });
export const oneOf = (values, o = {}) => ({ t: 'enum', values, ...o });
export const ref = (to, o = {}) => ({ t: 'ref', to, cascade: 'remove', ...o });
export const list = (of, o = {}) => ({ t: 'list', of, ...o });
/** A list of references; by default a removed target is pruned from the list. */
export const refs = (to, o = {}) => ({ t: 'list', of: { t: 'ref', to, cascade: o.cascade ?? 'prune' }, ...o });
export const obj = (fields, o = {}) => ({ t: 'object', fields, ...o });
export const map = (keys, of, o = {}) => ({ t: 'map', keys, of, ...o });
export const effects = (o = {}) => ({ t: 'effects', ...o });
export const any = (o = {}) => ({ t: 'any', ...o });

export const req = (spec) => ({ ...spec, req: true });

/** A map of yield name to amount, e.g. { food: 2, production: 1 }. */
export const yields = (o = {}) => map(oneOf(YIELDS), num(-100, 100), o);

/** The fields almost every entry shares. */
export const base = {
  id: req(str()),
  nameKey: key(),
  tags: list(str()),
};

/** Define an entry-list content type. */
export function entryType(contentType, fields, o = {}) {
  return { contentType, kind: 'entries', fields: { ...base, ...fields }, ...o };
}
