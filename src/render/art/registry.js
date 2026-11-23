// The art registry (docs/PLAN.md section 10.5).
//
// Everything visual is asked for by id, never by file path:
//   getArt(registry, 'unit', 'legionary', { faction: 'rome', class: 'melee' })
//   tries unit.legionary.rome -> unit.legionary -> unit.class.melee -> placeholder
// The skin's "art" entries (merged across mods, so a conversion overrides
// only what it provides) fill the registry. Anything missing falls back to a
// code-drawn placeholder, so nothing ever breaks while art is missing.

/** The ids to try, most specific first. */
export function fallbackChain(kind, id, { faction, class: cls } = {}) {
  const chain = [];
  if (faction) chain.push(`${kind}.${id}.${faction}`);
  chain.push(`${kind}.${id}`);
  if (cls) chain.push(`${kind}.class.${cls}`);
  return chain;
}

export function createRegistry(skin = {}) {
  return { entries: skin.art ?? {}, palette: skin.palette ?? {}, placeholders: skin.placeholders ?? {} };
}

/**
 * Find the art for something.
 * @returns {{ kind: string, id: string, found: string|null, entry: object|null, placeholder: boolean }}
 */
export function getArt(registry, kind, id, opts = {}) {
  for (const key of fallbackChain(kind, id, opts)) {
    if (Object.hasOwn(registry.entries, key)) return { kind, id, found: key, entry: registry.entries[key], placeholder: false };
  }
  return { kind, id, found: null, entry: null, placeholder: true };
}
