// The title screen's world (graphics overhaul G7, docs/OVERHAUL.md 5.1): a
// generated map from a fixed seed, drawn by the game's own map view and
// panning slowly behind the menu. Purely cosmetic: it is never a game, it
// takes no input, it stops while the title is hidden, and it holds still
// under reduced motion. Loaded with import() after the title appears, so it
// costs the first page load nothing.

import { generateMap } from '../sim/index.js';
import { createMapView } from '../render/canvas.js';

export function createTitleWorld(host, ruleset, { seed = 20260 } = {}) {
  const map = generateMap(ruleset, { seed, size: 'small', type: 'continents' });
  const fog = new Array(map.width * map.height).fill(2);
  const view = createMapView(host, { map, ruleset, fog, units: [] });
  view.setWorld({ map, fog, units: [], cities: [], camps: [] });
  view.setAmbient(true);
  const win = host.ownerDocument.defaultView;
  let dir = 1;
  let last = win.performance.now();
  let stopped = false;
  view.setCamera({ ...view.camera, zoom: 0.9 });
  view.centreOnWorld(view.world.width * 0.3, view.world.height * 0.5);
  function tick(now) {
    if (stopped) return;
    const dt = Math.min(100, now - last);
    last = now;
    const screen = host.closest('.screen');
    if (screen && !screen.hidden && !view.reducedMotion()) {
      const cam = view.camera;
      const { w } = view.viewport();
      const maxX = view.world.width - w / cam.zoom - 40;
      if (cam.x > maxX) dir = -1;
      if (cam.x < 40) dir = 1;
      view.setCamera({ ...cam, x: cam.x + dir * dt * 0.018, y: cam.y });
    }
    win.requestAnimationFrame(tick);
  }
  win.requestAnimationFrame(tick);
  return { destroy() { stopped = true; view.destroy(); } };
}
