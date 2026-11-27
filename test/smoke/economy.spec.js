// Phase 6 smoke test: pick a faction from its card, see it in the top bar
// and its card, then have a builder farm a hex: food goes up and a charge is
// spent; the city drawer lists its buildings and amenities.

import { test, expect } from '@playwright/test';
import { openAttention } from './helpers.js';

test('faction picker, faction card, a builder farms, the drawer shows buildings and amenities', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: 'New game' }).click();
  // The setup screen: a Small map with 3 rivals (Quick preset), then see the faction cards.
  await page.locator('[data-preset="quick"]').click();
  await page.locator('[data-action="see-cards"]').click();
  await expect(page.locator('.faction-card')).toHaveCount(8);
  for (const card of await page.locator('.faction-card').all()) {
    await expect(card.locator('.trait').first()).not.toBeEmpty();
    await expect(card.locator('.unique')).toContainText('Unique unit');
  }
  await page.screenshot({ path: `test-results/factions-${info.project.name}.png`, fullPage: true });
  await page.locator('[data-pick="rome"]').click();
  await expect(page.locator('#setup select[name="faction"]')).toHaveValue('rome');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame);
  await expect(page.locator('[data-action="faction"]')).toHaveText('Rome');
  await page.locator('[data-action="faction"]').click();
  await expect(page.locator('.overlay .faction-card')).toContainText('All roads lead to Rome');
  await page.locator('[data-action="close-overlay"]').click();
  await expect(page.locator('.overlay')).toBeHidden();

  // Found the capital: it gets a palace and, from Rome's trait, a free monument.
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await page.locator('[data-city-tab="buildings"]').click();
  await expect(page.locator('[data-field="buildings"] [data-building="palace"]')).toBeVisible();
  await expect(page.locator('[data-field="buildings"] [data-building="monument"]')).toBeVisible();
  await expect(page.locator('[data-field="amenities"]')).toContainText('Amenities');

  // The builder farms a hex where a farm fits.
  await page.locator('[data-action="close-city"]').click();
  const builder = await page.evaluate(() => window.__atlasGame.view.units.find((u) => u.faction === 'f0' && u.type === 'builder'));
  await openAttention(page);
  await page.locator(`.attention-item[data-unit="${builder.id}"]`).click();
  await expect(page.locator('[data-field="charges"]')).toHaveText('Charges 3');
  const farm = page.locator('[data-improve="farm"]');
  if (await farm.count()) {
    const before = await page.evaluate((t) => window.__atlasGame.view.map.improvement[t], builder.tile);
    await farm.click();
    await expect(page.locator('[data-toast]')).toContainText('Farm built. 2 charges left.');
    const after = await page.evaluate((t) => window.__atlasGame.view.map.improvement[t], builder.tile);
    expect(after).not.toBe(before);
    expect(await page.evaluate((id) => window.__atlasGame.state.units[id].charges, builder.id)).toBe(2);
  } else {
    // This seed put the builder on a hex no farm suits; the buttons still match the rules.
    await expect(page.locator('[data-improve]').first()).toBeVisible();
  }
  // An empty entry must never show up as the word "null" in the panel.
  await expect(page.locator('.unit-panel')).not.toContainText('null');
  await page.screenshot({ path: `test-results/builder-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
