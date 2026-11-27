// Graphics overhaul G3 (docs/OVERHAUL.md 4.1 and 4.2): the terrain renderer
// draws the same picture every time for the same map, unexplored land is
// parchment rather than black, the strategic view takes over below 60% zoom,
// water sparkle only runs when motion is allowed, and a frame stays fast.

import { test, expect } from '@playwright/test';

test('G3: terrain, parchment, strategic view and motion', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough for the renderer');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=42&faction=rome&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);

  // The same chunks drawn twice give the same pixels (the cosmetic stream is seeded by tile).
  const sums = await page.evaluate(() => {
    const v = window.__atlasGame.mapView;
    const sum = () => {
      v.drawNow();
      const c = v.canvas;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let k = 0; k < d.length; k += 97) h = (h * 31 + d[k]) >>> 0;
      return h;
    };
    v.setAmbient(false);
    return [sum(), sum()];
  });
  expect(sums[0]).toBe(sums[1]);

  // Past what you have explored, the map is parchment (warm and light), not a black void.
  // (The camera keeps to the explored part, G9, so zoomed out the corner of the view is beyond it.)
  const corner = await page.evaluate(() => {
    const v = window.__atlasGame.mapView;
    v.setCamera({ x: -2000, y: -2000, zoom: 0.3 });
    v.drawNow();
    const c = v.canvas;
    const [r, g, b] = c.getContext('2d').getImageData(4, Math.floor(c.height / 2), 1, 1).data;
    return { r, g, b };
  });
  expect(corner.r).toBeGreaterThan(150);
  expect(corner.r).toBeGreaterThan(corner.b);

  // Below 60% zoom the strategic view takes over; above it, the detailed one.
  const modes = await page.evaluate(() => {
    const v = window.__atlasGame.mapView;
    const first = window.__atlasGame.view.units[0].tile;
    v.setCamera({ ...v.camera, zoom: 0.5 });
    v.centreOnTile(first);
    v.drawNow();
    const far = v.stats.strategic;
    v.setCamera({ ...v.camera, zoom: 1 });
    v.centreOnTile(first);
    const ms = v.drawNow();
    return { far, near: v.stats.strategic, ms };
  });
  expect(modes).toMatchObject({ far: true, near: false });
  expect(modes.ms).toBeLessThan(50);

  // Water sparkle keeps the map redrawing a few times a second only when motion is allowed.
  const framesOver = async (motion) => page.evaluate(async (m) => {
    document.documentElement.dataset.motion = m;
    const v = window.__atlasGame.mapView;
    v.setAmbient(true);
    await new Promise((r) => setTimeout(r, 200));
    const before = v.stats.frames;
    await new Promise((r) => setTimeout(r, 900));
    return v.stats.frames - before;
  }, motion);
  expect(await framesOver('reduce')).toBe(0);
  expect(await framesOver('full')).toBeGreaterThan(2);

  // Being at war with someone does not break drawing (their border turns dashed).
  await page.evaluate(() => {
    const g = window.__atlasGame;
    g.mapView.setWar(g.view.factions.filter((f) => f.id !== g.human).map((f) => f.id));
    g.mapView.drawNow();
  });
  await page.screenshot({ path: `test-results/g3-terrain-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
