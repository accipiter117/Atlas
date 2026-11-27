// Graphics overhaul G1 (docs/OVERHAUL.md): tooltips on the top bar's yields,
// the UI scale setting, the bundled fonts, the icon sprite, and the sound
// test button (silent until you interact, never an error).

import { test, expect } from '@playwright/test';

test('G1: yield tooltips, UI scale, fonts, icons and sounds', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'hover tooltips are for laptops (long press is the touch path)');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&nosw=1');

  // Settings: interface size scales every panel; a test sound plays without errors.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('[data-action="test-sound"]').click();
  const before = await page.locator('#settings .card').boundingBox();
  await page.locator('select[name="uiScale"]').selectOption('1.25');
  await expect.poll(async () => (await page.locator('#settings .card').boundingBox()).height).toBeGreaterThan(before.height * 1.15);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim())).toBe('1.25');
  await page.locator('select[name="uiScale"]').selectOption('1');
  await page.getByRole('button', { name: 'Title screen' }).click();

  // Into a game: the fonts are the bundled ones.
  await page.goto('/?seed=42&faction=rome&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 18px Cinzel'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.game-turn')).fontFamily)).toContain('Cinzel');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.advice-line')).fontFamily)).toContain('Alegreya Sans');

  // Hovering gold shows where it comes from, with icons.
  await page.locator('.game-yields .y.gold').hover();
  const tip = page.locator('.tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Gold');
  await expect(tip).toContainText('Each turn');
  await expect(tip.locator('svg.icon use')).not.toHaveCount(0);
  await page.screenshot({ path: `test-results/g1-tooltip-${info.project.name}.png` });
  await page.locator('.game-yields .y.science').hover();
  await expect(tip).toContainText('Science');
  await expect(tip).toContainText('tech tree');
  // Somewhere with no tooltip of its own (the gap in the top bar).
  await page.mouse.move(760, 22);
  await expect(tip).toBeHidden();

  // The icon sprite is served and holds the yields.
  const sprite = await page.evaluate(async () => (await fetch('assets/icons.svg')).text());
  for (const id of ['gold', 'science', 'culture', 'faith', 'food', 'production', 'res-iron']) expect(sprite).toContain(`id="i-${id}"`);
  expect(errors).toEqual([]);
});
