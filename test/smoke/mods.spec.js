// Phase 2 smoke test: the Mods screen in a real browser, and the same rules
// fingerprint in the browser as in Node.

import { test, expect } from '@playwright/test';
import { loadRuleset } from '../../src/data/loader.js';
import { ENGINE_VERSION } from '../../src/sim/index.js';
import { readRules } from '../../tools/lib-mods.mjs';
import { REPO } from '../data/helpers.js';

const press = async (page, info, locator) => (info.project.use.hasTouch ? locator.tap() : locator.click());

test('Mods screen: lists mods, reports a missing base game, reorders, matches Node\'s fingerprint', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await press(page, info, page.getByRole('button', { name: 'Mods', exact: true }));
  const rows = page.locator('.mod-row');
  await expect(rows).toHaveCount(5);
  for (const name of ['Ancient world', 'Lock to one era', 'No religious victory']) await expect(page.locator('.mod-list')).toContainText(name);
  await expect(page.locator('[data-field="status"]')).toHaveText(/Ready to play/);

  // Same rules fingerprint as Node computes for base-ancient alone.
  const { available } = await readRules(REPO);
  const node = loadRuleset({ available, selection: ['base-ancient'], engineVersion: ENGINE_VERSION });
  await expect(page.locator('[data-field="hash"]')).toHaveText(node.hash);

  for (const btn of await page.locator('#mods button:visible, #mods .mod-tick').all()) {
    const box = await btn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/mods-${info.project.name}.png`, fullPage: true });

  // Lock-era without the base game: a red error naming the missing mod.
  await press(page, info, page.locator('label[for="mod-lock-era"]'));
  await press(page, info, page.locator('label[for="mod-base-ancient"]'));
  const errorsList = page.locator('.report-group.error li');
  await expect(errorsList.filter({ hasText: 'lock-era needs base-ancient, which is not ticked' })).toHaveCount(1);
  await expect(errorsList.first()).toHaveCSS('color', /rgb/);
  await page.screenshot({ path: `test-results/mods-error-${info.project.name}.png`, fullPage: true });

  // The test pair: reordering changes the "last one wins" line.
  await press(page, info, page.locator('label[for="mod-base-ancient"]'));
  await press(page, info, page.locator('label[for="mod-lock-era"]'));
  await press(page, info, page.locator('label[for="mod-test-swift-scouts"]'));
  await press(page, info, page.locator('label[for="mod-test-slow-scouts"]'));
  const wins = page.locator('[data-code="lastOneWins"]');
  await expect(wins).toContainText('Last one wins: 2');
  await press(page, info, page.locator('[data-mod="test-slow-scouts"] [data-move="up"]'));
  await expect(wins).toContainText('Last one wins: 4');
  await expect(wins).toContainText('changed by test-slow-scouts (2) then by test-swift-scouts (4)');

  await press(page, info, page.getByRole('button', { name: 'Title screen' }));
  await expect(page.locator('#title')).toBeVisible();
  expect(errors).toEqual([]);
});
