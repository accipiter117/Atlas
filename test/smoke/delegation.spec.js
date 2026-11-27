// Killzone Extrasolar War K5: theatre delegation. Start as Strategic Command, hand Vekta to your
// generals on Advance from the star map, end the turn, read the theatre report, take it back.
import { test, expect } from '@playwright/test';

test('K5: delegating a theatre, its turn report, and taking it back', async ({ page }, info) => {
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

  // The star map: Vekta's panel has the Theatre command buttons.
  await page.locator('[data-action="starmap"]').click();
  await page.locator('.world-card[data-world="vekta"]').click();
  const box = page.locator('[data-field="delegation"]');
  await expect(box.locator('button')).toHaveCount(4);
  await expect(box.locator('[data-action="delegate-off"]')).toHaveAttribute('aria-pressed', 'true');
  await box.locator('[data-action="delegate-advance"]').click();
  await expect(box.locator('[data-action="delegate-advance"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.world-card[data-world="vekta"]')).toContainText('delegated');
  const me = await page.evaluate(() => window.__atlasGame.human);
  expect(await page.evaluate((id) => window.__atlasGame.state.delegation[id], me)).toEqual({ vekta: 'advance' });
  await page.screenshot({ path: `test-results/k5-delegate-${info.project.name}.png` });
  await page.locator('[data-action="close-starmap"]').click();

  // End the turn: the generals play Vekta first, and the report shows as a message.
  const turn = await page.evaluate(() => window.__atlasGame.state.turn);
  await page.locator('#game-map').focus();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await page.waitForFunction((t) => window.__atlasGame.state.turn > t && !window.__atlasGame.busy, turn, { timeout: 60_000 });
  await expect(page.locator('[data-toast]')).toContainText('Vekta (Advance)');
  await page.screenshot({ path: `test-results/k5-report-${info.project.name}.png` });

  // Take it back. The star map keeps the last report for Vekta.
  await page.locator('[data-action="starmap"]').click();
  await page.locator('.world-card[data-world="vekta"]').click();
  await expect(page.locator('[data-field="theatre-report"]')).toContainText('Vekta (Advance)');
  await page.screenshot({ path: `test-results/k5-starmap-report-${info.project.name}.png` });
  await page.locator('[data-field="delegation"] [data-action="delegate-off"]').click();
  expect(await page.evaluate((id) => window.__atlasGame.state.delegation[id], me)).toEqual({});
  expect(errors).toEqual([]);
});
