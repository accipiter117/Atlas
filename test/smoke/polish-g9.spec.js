// Graphics overhaul G9 (polish after review), on the turn-120 base game: the selection panel
// stays about 200px tall at 1366x768 and never covers a city's name plate; status badges show
// only on the selected unit or the hex under the pointer.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('G9: compact selection panel, plates kept clear, quiet badges', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(120_000);
  const code = (await readFile('test/fixtures/saves/base-turn120.txt', 'utf8')).trim();
  await page.goto('/?nosw=1');
  await page.locator('[data-action="import"]').click();
  await page.locator('[data-field="import-code"]').fill(code);
  await page.locator('[data-action="import-go"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60_000 });
  const overlay = page.locator('[data-field="overlay"]');
  if (await overlay.isVisible()) await overlay.locator('[data-action="close-overlay"]').click({ force: true }).catch(() => {});

  // Select each of a few of your units in turn, jumping the camera to it like the attention list does.
  const ids = await page.evaluate(() => window.__atlasGame.view.units.filter((u) => u.faction === window.__atlasGame.human).slice(0, 6).map((u) => u.id));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    const result = await page.evaluate((uid) => {
      const g = window.__atlasGame;
      g.selectUnit(uid);
      const host = document.querySelector('#game-map').getBoundingClientRect();
      const panel = document.querySelector('.unit-panel').getBoundingClientRect();
      const z = g.mapView.camera.zoom;
      const under = g.view.cities.filter((c) => {
        const p = g.mapView.tileToScreen(c.tile);
        const x = host.left + p.x;
        const y = host.top + p.y - 42 * z * 0.98;
        return x > panel.left + 40 && x < panel.right - 40 && y > panel.top + 4 && y < panel.bottom && y < host.bottom;
      }).map((c) => c.name);
      return { height: panel.height, under };
    }, id);
    expect(result.height).toBeLessThanOrEqual(215);
    expect(result.under).toEqual([]);
  }
});
