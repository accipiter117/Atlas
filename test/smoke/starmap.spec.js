// Killzone Extrasolar War K2: the star map. Start Killzone: Extrasolar War, open the star map,
// embark troops at Vekta, fly to Halcyon, and land them at the base there by clicking its hex.
import { test, expect } from '@playwright/test';

test('K2: the star map, embarking, moving a fleet and landing', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=5&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('select[name="conversion"]').selectOption('killzone-war');
  await page.locator('[data-tab="players"]').click();
  await page.locator('select[name="faction"]').selectOption('isa');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60_000 });

  // The top bar's star map button, and M.
  await expect(page.locator('[data-action="starmap"]')).toBeVisible();
  await page.locator('#game-map').focus();
  await page.keyboard.press('m');
  await expect(page.locator('.world-card')).toHaveCount(8);
  await page.screenshot({ path: `test-results/k2-starmap-${info.project.name}.png` });

  // Vekta's fleet: embark two units from beside the bases.
  await page.locator('.world-card[data-world="vekta"]').click();
  await page.locator('.fleet-btn').first().click();
  await page.locator('[data-action="embark"]').click();
  const ticks = page.locator('[data-field="embark"] input[type="checkbox"]');
  expect(await ticks.count()).toBeGreaterThan(1);
  await ticks.nth(0).check();
  await ticks.nth(1).check();
  await page.locator('[data-action="embark-go"]').click();
  const fleet = await page.evaluate(() => Object.values(window.__atlasGame.state.space.fleets).find((f) => f.faction === window.__atlasGame.human && f.at === 'vekta' && f.cargo.length));
  expect(fleet.cargo[0].length).toBe(2);

  // Fly to Halcyon.
  await page.locator('[data-action="move-halcyon"]').click();
  expect(await page.evaluate((id) => window.__atlasGame.state.space.fleets[id].at, fleet.id)).toBe('halcyon');
  await page.screenshot({ path: `test-results/k2-fleet-${info.project.name}.png` });

  // Land group 1: the star map closes, Halcyon shows, and a click on the base lands them.
  await page.locator('[data-action="land-0"]').click();
  await expect(page.locator('.panel-overlay')).toBeHidden();
  expect(await page.evaluate(() => window.__atlasGame.viewWorld)).toBe('halcyon');
  const at = await page.evaluate(() => {
    const g = window.__atlasGame;
    const base = g.view.cities.find((c) => c.faction === g.human);
    const p = g.mapView.tileToScreen(base.tile);
    const r = document.querySelector('#game-map').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  const before = await page.evaluate(() => window.__atlasGame.view.units.filter((u) => u.faction === window.__atlasGame.human).length);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => window.__atlasGame.view.units.filter((u) => u.faction === window.__atlasGame.human).length)).toBe(before + 2);
  expect(await page.evaluate((id) => window.__atlasGame.state.space.fleets[id].cargo.length, fleet.id)).toBe(0);
  await page.screenshot({ path: `test-results/k2-landed-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
