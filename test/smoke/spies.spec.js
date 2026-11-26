// Phase 15 smoke test: post a spy to a rival city and see each mission's
// success chance before starting it, on the Empire overlay's Spies tab.

import { test, expect } from '@playwright/test';

test('spies: post a spy, odds before committing, start a mission', async ({ page }, info) => {
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
  // Let a few rounds pass so rivals have cities, then meet everyone and see the map.
  await page.evaluate(() => window.__atlasGame.debug.autoplay(10));
  await page.evaluate(() => { window.__atlasGame.debug.meetAll(); window.__atlasGame.debug.reveal(); });
  const spy = await page.evaluate(() => { const g = window.__atlasGame; return g.debug.spawn('spy', 'f0', Object.values(g.state.cities).find((c) => c.faction === 'f0').tile); });
  await page.locator(`.attention-item[data-unit="${spy}"]`).click();
  await page.locator('[data-action="post-spy"]').click();
  await expect(panel.locator('[data-tab="spies"]')).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('[data-field="spy-count"]')).toContainText('Spies: 1');

  // Post it to a rival's city.
  const target = await page.evaluate(() => { const g = window.__atlasGame; return g.view.cities.find((c) => c.faction !== 'f0').id; });
  await panel.locator(`select[name="post-${spy}"]`).selectOption(target);
  await panel.locator(`[data-action="post-${spy}"]`).click();
  const card = panel.locator('[data-spy]').first();
  await expect(card.locator('[data-mission="siphon_funds"]')).toContainText('60% to succeed');
  await expect(card.locator('[data-mission="steal_boost"]')).toBeDisabled();
  await page.screenshot({ path: `test-results/spies-${info.project.name}.png` });
  await card.locator('[data-mission="siphon_funds"]').click();
  await expect(panel.locator('[data-spy]').first()).toContainText('On a mission: Siphon Funds');
  expect(await panel.innerText()).not.toContain('undefined');
  expect(errors).toEqual([]);
});
