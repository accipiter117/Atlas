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
