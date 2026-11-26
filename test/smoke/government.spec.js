// Phase 11 smoke test: the civics tree (C), adopting a government and
// slotting a policy card on the Empire screen (E), and seeing it change a cost.

import { test, expect } from '@playwright/test';

test('civics, governments and policy cards', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  const touch = Boolean(info.project.use.hasTouch);
  const panel = page.locator('[data-field="panel"]');

  // The civics tree: C (or the culture figure in the top bar); choose Code of Laws.
  if (touch) await page.locator('[data-action="civics"]').click(); else await page.keyboard.press('c');
  await expect(panel.locator('[data-tab="civics"]')).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('.tech')).toHaveCount(await page.evaluate(() => Object.keys(window.__atlasGame.ruleset.civics).length));
  await expect(panel.locator('[data-tech="craftsmanship"]')).toContainText('Boost:');
  await panel.locator('[data-tech="code_of_laws"] .tech-main').click();
  await expect(panel).toContainText('Studying: Code of Laws');
  await page.screenshot({ path: `test-results/civics-${info.project.name}.png` });
  await panel.locator('[data-tab="techs"]').click();
  await expect(panel.locator('[data-tech="pottery"]')).toBeVisible();
  await panel.locator('[data-action="close-tree"]').click();

  // Found the capital and learn the civics for Autocracy and the Agoge card.
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await page.evaluate(() => window.__atlasGame.debug.learn('civics', ['code_of_laws', 'craftsmanship', 'state_workforce', 'foreign_trade', 'early_empire', 'political_philosophy', 'military_tradition']));
  const before = await page.evaluate(() => window.__atlasGame.debug.cost('unit', 'warrior'));

  // Empire: adopt Autocracy; it arrives next turn.
  await page.locator('[data-action="empire"]').click();
  await expect(panel).toContainText('No government yet.');
  await panel.locator('[data-adopt="autocracy"]').click();
  await expect(panel.locator('[data-field="government-pending"]')).toContainText('Autocracy');
  // Pick a military card: the short list shows only military cards.
  await panel.locator('[data-slot="military"][data-index="0"]').click();
  await expect(panel.locator('[data-field="card-list"]')).toContainText('Agoge');
  await expect(panel.locator('[data-field="card-list"]')).not.toContainText('Urban Planning');
  await panel.locator('[data-card="agoge"]').click();
  await expect(panel.locator('[data-slot="military"][data-index="0"]')).toContainText('Agoge');
  await page.screenshot({ path: `test-results/empire-${info.project.name}.png` });
  await panel.locator('[data-action="close-empire"]').click();
  expect(await page.evaluate(() => window.__atlasGame.debug.cost('unit', 'warrior'))).toBe(before);

  // End the turn: Autocracy (land units 10% cheaper) and Agoge (melee 30% cheaper) now apply.
  const turn = await page.evaluate(() => window.__atlasGame.state.turn);
  const next = page.locator('[data-action="next"]');
  for (let i = 0; i < 40 && (await page.evaluate(() => window.__atlasGame.state.turn)) === turn; i += 1) {
    const skip = page.locator('[data-act="skip"]:not([disabled])');
    const option = page.locator('.choose-item:not([disabled])').first();
    if (await skip.count()) await skip.first().click();
    else if ((await next.textContent()) === 'Choose production' && await option.count() && await option.isVisible()) await option.click();
    else { await next.click(); await page.waitForFunction(() => !window.__atlasGame.busy); }
  }
  // The turn number ticks over at the end of the round; wait until your own next turn has started.
  await page.waitForFunction(() => { const g = window.__atlasGame; return !g.busy && g.state.seatOrder[g.state.seatIndex] === g.human; });
  expect(await page.evaluate(() => window.__atlasGame.state.factions[0].government.id)).toBe('autocracy');
  const after = await page.evaluate(() => window.__atlasGame.debug.cost('unit', 'warrior'));
  expect(after).toBe(Math.round(before * 0.6));
  await page.locator('[data-action="empire"]').click();
  await expect(panel.locator('[data-field="government-now"]')).toContainText('Autocracy');
  expect(await panel.innerText()).not.toContain('undefined');
  expect(errors).toEqual([]);
});
