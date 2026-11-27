// Icons on the map (graphics overhaul G1): the same pixel icons as the
// interface, from the atlas assets/icons.png (drawn by tools/gen/icons.mjs at
// 2x). Each icon has an art id "icon.<name>", so a skin can give any of them
// its own picture through skin.json art entries; anything missing falls back
// to the atlas, and a missing atlas draws nothing (the game never breaks).

/**
 * Load the atlas. `layout` is assets/icons.json (fetched by the page and
 * handed in). Returns { image, layout, ready }.
 */
export function loadIconAtlas(win, layout, src = 'assets/icons.png') {
  const atlas = { image: null, layout, ready: false };
  if (!win?.Image || !layout) return atlas;
  const img = new win.Image();
  img.onload = () => { atlas.ready = true; };
  img.src = src;
  atlas.image = img;
  return atlas;
}

/** The art id for an icon. */
export const iconArtId = (name) => `icon.${name}`;

/** Draw an icon centred at (x, y), `size` pixels square. Returns false if it is not available. */
export function drawIcon(ctx, atlas, name, x, y, size = 16) {
  const at = atlas?.ready ? atlas.layout.icons?.[name] : null;
  if (!at) return false;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas.image, at.x, at.y, at.w, at.h, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  ctx.imageSmoothingEnabled = smooth;
  return true;
}

const CLASS_ICONS = new Set(['melee', 'ranged', 'anti_cavalry', 'cavalry', 'siege', 'recon', 'naval_melee', 'naval_ranged', 'civilian']);

/** The icon for a unit type: its job for civilians, its class otherwise (a class's "icon" in the rules wins). */
export function unitIconName(ruleset, type) {
  const def = ruleset.units[type];
  const tags = def?.tags ?? [];
  if (tags.includes('founder')) return 'founder';
  if (tags.includes('worker')) return 'worker';
  if (tags.includes('trader')) return 'trader';
  if (tags.includes('spy')) return 'spy';
  if (def?.faithOnly) return 'missionary';
  const cls = ruleset.unitClasses?.[def?.class];
  if (cls?.icon) return cls.icon;
  return CLASS_ICONS.has(def?.class) ? `class-${def.class}` : cls?.civilian ? 'class-civilian' : 'class-melee';
}
