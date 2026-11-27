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

/** Keep at least some of the map on screen. */
export function clampToWorld(cam, world, viewW, viewH, margin = 120) {
  const minX = -viewW / cam.zoom + margin;
  const minY = -viewH / cam.zoom + margin;
  const maxX = world.width - margin;
  const maxY = world.height - margin;
  return { ...cam, x: Math.min(maxX, Math.max(minX, cam.x)), y: Math.min(maxY, Math.max(minY, cam.y)) };
}

/** Centre the camera on a world point. */
export function centreOn(cam, wx, wy, viewW, viewH) {
  return { ...cam, x: wx - viewW / 2 / cam.zoom, y: wy - viewH / 2 / cam.zoom };
}
