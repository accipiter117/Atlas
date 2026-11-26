// Phase 10 smoke test: the developer page's mini-simulation and jump turns run
// in a Web Worker and report back.

import { test, expect } from '@playwright/test';

test('dev page: mini-simulation and jump turns', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough');
  test.setTimeout(3 * 60_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/dev.html?seed=1234&type=continents&size=small');
  await page.locator('[data-field="tools"] summary').click();

  await page.locator('#jump-size').selectOption('small');
  await page.locator('#jump-players').fill('4');
  await page.locator('#jump-turn').fill('30');
  await page.locator('#jump-run').click();
  await expect(page.locator('[data-field="jump-status"]')).toContainText('Reached turn 30', { timeout: 60_000 });
  await expect(page.locator('[data-field="jump-status"]')).toContainText('Refused AI commands: 0');

  await page.locator('#mini-games').fill('2');
  await page.locator('#mini-players').fill('2');
  await page.locator('#mini-run').click();
  await expect(page.locator('[data-field="mini-status"]')).toContainText('finished', { timeout: 150_000 });
  await expect(page.locator('[data-field="mini-status"]')).toContainText('refused AI commands: 0');
  await expect(page.locator('[data-field="mini-victories"] tr')).not.toHaveCount(1);
  await page.screenshot({ path: `test-results/dev-tools-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
