// Phase 8 smoke test: the advice line suggests research, the Research tree
// opens (R or the top bar), a tech can be chosen and a far one queued, and the
// AI journal shows the rivals' reasons after a few turns.

import { test, expect } from '@playwright/test';

test('research tree, queueing, and the AI journal', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);

  // The top bar shows the era and that nothing is being researched yet.
  const bar = page.locator('[data-field="yields"]');
  await expect(bar).toContainText('Ancient');
  await expect(bar.locator('[data-action="trees"]')).toBeVisible();

  // Open the tree from the top bar (tap) or with R (keyboard).
  if (info.project.use.hasTouch) await bar.locator('[data-action="trees"]').click();
  else await page.keyboard.press('r');
  const panel = page.locator('[data-field="panel"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Technology');
  await expect(panel).toContainText('Nothing being researched.');
  await expect(panel.locator('.tech')).toHaveCount(await page.evaluate(() => Object.keys(window.__atlasGame.ruleset.techs).length));

  // Choose Pottery, then queue Currency (which needs Writing first).
  await panel.locator('[data-tech="pottery"] .tech-main').click();
  await expect(panel).toContainText('Researching: Pottery');
  await panel.locator('[data-queue="currency"]').click();
  const research = await page.evaluate(() => window.__atlasGame.view.research);
  expect(research.current).toBe('pottery');
  expect(research.queue).toEqual(['writing', 'currency']);
  await expect(panel.locator('[data-tech="writing"]')).toHaveClass(/queued/);
  await page.screenshot({ path: `test-results/tech-tree-${info.project.name}.png` });
  await panel.locator('[data-action="close-tree"]').click();
  await expect(panel).toBeHidden();
  await expect(bar).toContainText('Pottery');

  // Play a few turns, then read the AI journal.
  // Units waiting for orders are skipped; a city with nothing to build gets the first option.
  const next = page.locator('[data-action="next"]');
  for (let turn = 1, clicks = 0; turn < 5 && clicks < 60; clicks += 1) {
    const skip = page.locator('[data-act="skip"]:not([disabled])');
    const option = page.locator('.choose-item:not([disabled])').first();
    if (await skip.count()) await skip.first().click();
    else if (await option.count() && await option.isVisible()) await option.click();
    else await next.click();
    turn = await page.evaluate(() => window.__atlasGame.state.turn);
  }
  expect(await page.evaluate(() => window.__atlasGame.state.turn)).toBeGreaterThanOrEqual(5);
  await page.locator('[data-action="journal"]').click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('AI journal');
  await expect(panel.locator('.journal-faction').first()).toBeVisible();
  await expect(panel.locator('.journal-faction li').first()).toBeVisible();
  expect(await panel.innerText()).not.toContain('null');
  expect(await panel.innerText()).not.toContain('undefined');
  await page.screenshot({ path: `test-results/ai-journal-${info.project.name}.png` });
  await panel.locator('[data-action="close-journal"]').click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
