// Phase 1 smoke test: the title screen and the empty engine, in a real browser.
// Runs at 1366x768, 1920x1080 and on a touch-only 820x1180 tablet.

import { test, expect } from '@playwright/test';

test('title screen: five buttons, no console errors, big enough to tap, engine ends turns', async ({ page }, info) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page).toHaveTitle('Atlas');
  const menu = page.locator('#title [data-menu] .btn');
  await expect(menu).toHaveText(['Continue', 'New game', 'Load', 'Mods', 'Settings']);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

  for (const btn of await page.locator('.btn:visible').all()) {
    const box = await btn.boundingBox();
    expect(box.height, await btn.textContent()).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/title-${info.project.name}.png` });

  const touch = info.project.use.hasTouch;
  const press = (name) => (touch ? page.getByRole('button', { name, exact: true }).tap() : page.getByRole('button', { name, exact: true }).click());

  await press('Load');
  await expect(page.locator('[data-toast]')).toHaveText(/phase 9/);

  await press('New game');
  await expect(page.locator('#bench')).toBeVisible();
  await expect(page.locator('#bench [data-field="turn"]')).toHaveText('1');
  await expect(page.locator('.seats li')).toHaveCount(4);
  await expect(page.locator('.seats li[aria-current="true"]')).toContainText('You');

  for (let turn = 2; turn <= 4; turn += 1) {
    await press('End turn');
    await expect(page.locator('#bench [data-field="turn"]')).toHaveText(String(turn));
  }
  await expect(page.locator('.seats li[aria-current="true"]')).toContainText('You');
  await page.screenshot({ path: `test-results/bench-${info.project.name}.png` });

  await press('Title screen');
  await expect(page.locator('#title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keyboard: arrows move through the menu, Enter and Escape work on the bench', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'keyboard run is for laptops');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New game' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Load' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#bench')).toBeVisible();
  await page.locator('#bench h2').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bench [data-field="turn"]')).toHaveText('2');
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();
});
