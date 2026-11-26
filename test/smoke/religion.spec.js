// Phase 13 smoke test: a pantheon, founding and naming a religion, the
// religion lens, and buying a missionary with faith.

import { test, expect } from '@playwright/test';

test('religion: pantheon, founding a named religion, the lens and a missionary', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  const panel = page.locator('[data-field="panel"]');

  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await page.locator('[data-action="close-city"]').click();
  const city = await page.evaluate(() => Object.values(window.__atlasGame.state.cities)[0].id);
  await page.evaluate(() => window.__atlasGame.debug.faith(40));

  // The faith figure in the top bar opens the Religion tab.
  await page.locator('[data-action="religion"]').click();
  await expect(panel.locator('[data-tab="religion"]')).toHaveAttribute('aria-selected', 'true');
  await panel.locator('[data-pantheon="forge_spirit"]').click();
  await expect(panel.locator('[data-field="pantheon"]')).toContainText('Forge Spirit');
  await expect(panel).toContainText('shrine or temple');

  // Faith and a shrine: found and name a religion.
  await page.evaluate((id) => { window.__atlasGame.debug.faith(400); window.__atlasGame.debug.addBuilding(id, 'shrine'); }, city);
  await panel.locator('[data-tab="government"]').click();
  await panel.locator('[data-tab="religion"]').click();
  await expect(panel.locator('[data-field="found"]')).toBeVisible();
  await panel.locator('input[name="found-name"]').fill('The Way of Dawn');
  await panel.locator('input[name="found-name"]').dispatchEvent('change');
  await panel.locator('[data-action="found-religion"]').click();
  await expect(panel.locator('[data-field="my-religion"]')).toContainText('The Way of Dawn');
  await expect(panel.locator('.rel-list li')).toHaveCount(1);
  await page.screenshot({ path: `test-results/religion-${info.project.name}.png` });
  await panel.locator('[data-action="close-empire"]').click();

  // The lens, and a missionary bought with faith in the holy city.
  await page.locator('[data-action="lens"]').click();
  await expect(page.locator('[data-action="lens"]')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate((id) => window.__atlasGame.mapView.centreOnTile(window.__atlasGame.state.cities[id].tile), city);
  await page.screenshot({ path: `test-results/religion-lens-${info.project.name}.png` });
  // The city drawer (the advice line opens it: the city has nothing to build) offers a missionary for faith.
  const faith = await page.evaluate(() => window.__atlasGame.state.factions[0].stocks.faith);
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-faith-buy="missionary"]').click();
  const after = await page.evaluate(() => window.__atlasGame.state);
  expect(after.factions[0].stocks.faith).toBeLessThan(faith);
  const m = Object.values(after.units).find((u) => u.type === 'missionary');
  expect(m.religion).toBe('solar_way');
  expect(errors).toEqual([]);
});
