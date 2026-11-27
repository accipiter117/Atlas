// Graphics overhaul G5 (docs/OVERHAUL.md 4.4 and 4.5): each city on the map knows
// its era, walls and health, and your own cities show what they are building and
// in how many turns on their name plate.

import { test, expect } from '@playwright/test';

test('G5: city plates show the build and turns; walls change the town', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough for the art');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await expect.poll(() => page.evaluate(() => window.__atlasGame.view.cities.length)).toBe(1);
  const city = await page.evaluate(() => window.__atlasGame.view.cities[0]);

  // Choose something to build: the plate data carries its icon and the turns left.
  await page.evaluate((id) => window.__atlasGame.openCity(id), city.id);
  await page.locator('.choose-item').first().click();
  await expect.poll(() => page.evaluate((id) => window.__atlasGame.mapView.stats.cityExtras[id]?.build?.turns ?? 0, city.id)).toBeGreaterThan(0);
  const extra = await page.evaluate((id) => window.__atlasGame.mapView.stats.cityExtras[id], city.id);
  expect(extra.maxHp).toBeGreaterThan(0);
  expect(extra.walls).toBe(false);
  expect(typeof extra.build.icon).toBe('string');

  // Walls appear on the map once the city has them.
  await page.evaluate((id) => window.__atlasGame.debug.addBuilding(id, 'walls'), city.id);
  await expect.poll(() => page.evaluate((id) => window.__atlasGame.mapView.stats.cityExtras[id].walls, city.id)).toBe(true);
  await page.evaluate((t) => { const v = window.__atlasGame.mapView; v.setCamera({ ...v.camera, zoom: 1.6 }); v.centreOnTile(t); v.drawNow(); }, city.tile);
  await page.screenshot({ path: `test-results/g5-city-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
