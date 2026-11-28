// Killzone Extrasolar War K7: every world has its own look (worlds.art), shown on its map.
import { test, expect } from '@playwright/test';

test('K7: each world of the war, on its own map', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=5&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('select[name="conversion"]').selectOption('killzone-war');
  await page.locator('[data-tab="advanced"]').click();
  // Everything visible, so each world's ground shows in full.
  const fog = page.locator('select[name="fog"]');
  await fog.selectOption('off');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60_000 });
  const worlds = await page.evaluate(() => window.__atlasGame.state.worldOrder);
  expect(worlds.length).toBe(8);
  for (const [i, w] of worlds.entries()) {
    await page.evaluate((id) => window.__atlasGame.switchWorld(id), w);
    await expect.poll(() => page.evaluate(() => window.__atlasGame.viewWorld)).toBe(w);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/k7-world-${i + 1}-${w}-${info.project.name}.png` });
  }
  expect(errors).toEqual([]);
});
