// Killzone Extrasolar War K7: the landing planner (where a landing can go, and where enemy
// anti-air covers) and the War room (war support over time, glory, the council).
import { test, expect } from '@playwright/test';

test('K7: the landing planner and the War room', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=5&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('select[name="conversion"]').selectOption('killzone-war');
  await page.locator('[data-tab="players"]').click();
  await page.locator('select[name="faction"]').selectOption('isa_fleet');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60_000 });

  // The landing planner: embark at Vekta, fly to Halcyon, then Land: the zones show on its map.
  await page.locator('[data-action="starmap"]').click();
  await page.locator('.world-card[data-world="vekta"]').click();
  await page.locator('.fleet-btn').first().click();
  await page.locator('[data-action="embark"]').click();
  await page.locator('[data-field="embark"] input[type="checkbox"]').nth(0).check();
  await page.locator('[data-action="embark-go"]').click();
  await page.locator('[data-action="move-halcyon"]').click();
  await page.locator('[data-action="land-0"]').click();
  await expect(page.locator('.panel-overlay')).toBeHidden();
  const zones = await page.evaluate(() => window.__atlasGame.mapView.zonesForTest());
  expect(zones.ok.length).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/k7-landing-planner-${info.project.name}.png` });
  await page.locator('#game-map').focus();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__atlasGame.mapView.zonesForTest())).toBe(null);

  // A few turns so the War room's chart has a line.
  await page.evaluate(() => window.__atlasGame.debug.autoplay(4));
  await page.waitForFunction(() => !window.__atlasGame.busy);
  await page.locator('[data-action="starmap"]').click();
  await page.locator('[data-action="war-room"]').click();
  const room = page.locator('[data-field="war-room"]');
  await expect(room).toBeVisible();
  await expect(room.locator('[data-field="glory-table"] tr')).toHaveCount(4); // a header and three allies
  await expect(room.locator('[data-field="war-council"] li')).toHaveCount(3);
  await expect(room.locator('polyline')).toHaveCount(2);
  await page.screenshot({ path: `test-results/k7-war-room-${info.project.name}.png` });
  await room.locator('[data-action="war-back"]').click();
  await expect(page.locator('.world-card')).toHaveCount(8);
  expect(errors).toEqual([]);
});
