// Phase 12 smoke test: the diplomacy overlay (D). Leaders with opinion and
// reasons, a deal with a likely answer before sending, denouncing, war and a
// peace offer.

import { test, expect } from '@playwright/test';

test('diplomacy: opinions with reasons, likely answers, war and peace', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  await page.evaluate(() => window.__atlasGame.debug.meetAll());
  const touch = Boolean(info.project.use.hasTouch);
  const panel = page.locator('[data-field="panel"]');

  if (touch) await page.locator('[data-action="diplomacy"]').click(); else await page.keyboard.press('d');
  await expect(panel).toContainText('Leaders you have met');
  await expect(panel.locator('.dip-leader')).toHaveCount(3);
  const first = await panel.locator('.dip-leader').first().getAttribute('data-leader');
  await expect(panel.locator('[data-field="leader"]')).toContainText('Their opinion of you');
  await expect(panel.locator('[data-field="leader"]')).toContainText('Agenda');

  // A deal they would refuse: they give us all their gold for nothing.
  await panel.locator('[data-action="make-deal"]').click();
  await panel.locator('input[name="get-gold"]').fill('500');
  await panel.locator('input[name="get-gold"]').dispatchEvent('change');
  await expect(panel.locator('[data-field="likely"]')).toHaveText('Likely no');
  await page.screenshot({ path: `test-results/diplomacy-${info.project.name}.png` });
  // A gift they would accept: we give them gold.
  await panel.locator('input[name="get-gold"]').fill('0');
  await panel.locator('input[name="get-gold"]').dispatchEvent('change');
  await panel.locator('input[name="give-gold"]').fill('10');
  await panel.locator('input[name="give-gold"]').dispatchEvent('change');
  await expect(panel.locator('[data-field="likely"]')).toHaveText('Likely yes');
  await panel.locator('[data-action="send-deal"]').click();
  await expect(panel).toContainText('Your offer is waiting');

  // Denounce, which then shows in their reasons; then war, and a peace offer.
  await panel.locator('[data-action="denounce"]').click();
  await expect(panel.locator('[data-field="reasons"]')).toContainText('You denounced us');
  await panel.locator('[data-action="dip-declare-war"]').click();
  await expect(panel.locator('.dip-status')).toContainText('At war');
  await expect(panel.locator('[data-reason="atWar"]')).toBeVisible();
  await panel.locator('[data-action="propose-peace"]').click();
  await expect(panel.locator('[data-field="likely"]')).toHaveText(/Likely (yes|no)/);
  expect(await page.evaluate((id) => window.__atlasGame.state.wars.some((w) => w.includes(id)), first)).toBe(true);
  expect(await panel.innerText()).not.toContain('undefined');
  expect(await panel.innerText()).not.toContain('[dip.');
  expect(errors).toEqual([]);
});
