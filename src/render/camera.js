// The camera: where the map is looked at from and how close.
//
// World units are screen pixels at 100% zoom. Zoom runs from 50% to 200%
// (section 10). All the maths is pure, so it is tested in Node.

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;

export function createCamera(x = 0, y = 0, zoom = 1) {
  return { x, y, zoom };
}

export function clampZoom(z) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function worldToScreen(cam, wx, wy) {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
}

export function screenToWorld(cam, sx, sy) {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}

/** Move by a drag of (dx, dy) screen pixels. */
export function pan(cam, dx, dy) {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}

/** Zoom by a factor, keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(cam, factor, sx, sy) {
  const zoom = clampZoom(cam.zoom * factor);
  const before = screenToWorld(cam, sx, sy);
  return { zoom, x: before.x - sx / zoom, y: before.y - sy / zoom };
}

/**
 * Keep the world filling the view (graphics overhaul G9): at most `margin` world pixels of
 * parchment past any edge. `area` is { width, height } from the origin, or { x, y, width,
 * height } for a part of the world (the explored part, in a game). The camera may not zoom out
 * further than the point where `area` plus that margin fills the view, except that it may always
 * zoom out as far as `reach` (so a small explored area never locks you in close); panning keeps
 * to `area`, centred on it on an axis where the view is wider.
 */
export function clampToWorld(cam, area, viewW, viewH, margin = 120, reach = MAX_ZOOM) {
  if (!viewW || !viewH) return { ...cam };
  const zoom = Math.max(cam.zoom, Math.min(reach, fillZoom(area, viewW, viewH, margin)));
  const axis = (pos, span, size) => (span >= size + 2 * margin ? (size - span) / 2 : Math.min(size + margin - span, Math.max(-margin, pos)));
  const ox = area.x ?? 0;
  const oy = area.y ?? 0;
  return { ...cam, zoom, x: ox + axis(cam.x - ox, viewW / zoom, area.width), y: oy + axis(cam.y - oy, viewH / zoom, area.height) };
}

/** The furthest out the camera can zoom on this world and view (see clampToWorld). */
export function fillZoom(world, viewW, viewH, margin = 120) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.max(viewW / (world.width + 2 * margin), viewH / (world.height + 2 * margin))));
}

/** Centre the camera on a world point. */
export function centreOn(cam, wx, wy, viewW, viewH) {
  return { ...cam, x: wx - viewW / 2 / cam.zoom, y: wy - viewH / 2 / cam.zoom };
}
