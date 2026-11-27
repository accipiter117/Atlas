// Phase 1 smoke test: the title screen and the empty engine, in a real browser.
// Runs at 1366x768, 1920x1080 and on a touch-only 820x1180 tablet.

import { test, expect } from '@playwright/test';

test('title screen: the menu, no console errors, big enough to tap', async ({ page }, info) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page).toHaveTitle('Atlas');
  const menu = page.locator('#title [data-menu] .btn');
  await expect(menu).toHaveText(['Continue', 'New game', 'Quick start', 'Load', 'Import code', 'Mods', 'Settings', 'Help']);
  await expect(page.getByRole('button', { name: 'Quick start' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expect(page.locator('#game')).toBeHidden();

  for (const btn of await page.locator('.btn:visible').all()) {
    const box = await btn.boundingBox();
    expect(box.height, await btn.textContent()).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/title-${info.project.name}.png` });

  const touch = info.project.use.hasTouch;
  const press = (name) => (touch ? page.getByRole('button', { name, exact: true }).tap() : page.getByRole('button', { name, exact: true }).click());

  // Load with nothing saved says so; Settings remembers developer mode.
  await press('Load');
  await expect(page.locator('#load')).toBeVisible();
  await expect(page.locator('[data-field="save-list"]')).toContainText('No saved games yet');
  await page.locator('#load [data-action="back"]').click();
  await press('Settings');
  await page.locator('[data-setting="developer"]').check();
  await page.locator('#settings [data-action="back"]').click();
  await expect(page.locator('#title [data-dev-link]')).toBeVisible();
  await page.reload();
  await expect(page.locator('#title [data-dev-link]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keyboard: arrows move through the menu and Enter opens the setup screen', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'keyboard run is for laptops');
  await page.goto('/?seed=42');
  await expect(page.getByRole('button', { name: 'New game' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Load' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#game')).toBeHidden();
});
