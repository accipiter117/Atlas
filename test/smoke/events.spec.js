// Phase 16 smoke test: an event opens a dialog with its choices, the turn
// waits for an answer, and a choice applies; the setup screen offers events
// and disasters, and the culture victory can be ticked.

import { test, expect } from '@playwright/test';

test('events: the dialog, a choice that applies, and the turn waits for it', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);

  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await page.locator('[data-action="close-city"]').click();
  await page.evaluate(() => window.__atlasGame.debug.event('rich_seam'));
  const overlay = page.locator('[data-field="overlay"]');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('[data-field="event-title"]')).toHaveText('A rich seam');
  await expect(overlay.locator('[data-event-choice]')).toHaveCount(2);
  await expect(page.locator('[data-field="advice"]')).toContainText('needs your answer');
  await page.screenshot({ path: `test-results/events-${info.project.name}.png` });
  const before = await page.evaluate(() => (Object.values(window.__atlasGame.state.cities).find((c) => c.faction === 'f0').timed ?? []).length);
  await overlay.locator('[data-event-choice="0"]').click();
  await expect(overlay).toBeHidden();
  const after = await page.evaluate(() => { const g = window.__atlasGame; return { timed: (Object.values(g.state.cities).find((c) => c.faction === 'f0').timed ?? []).length, pending: g.view.pendingEvent }; });
  expect(after.timed).toBe(before + 1);
  expect(after.pending).toBeNull();
  expect(errors).toEqual([]);
});

test('setup: events and disasters can be chosen', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  const events = page.locator('select[name="events"]');
  await expect(events).toBeEnabled();
  await expect(events).toHaveValue('occasional');
  await events.selectOption('frequent');
  await expect(page.locator('select[name="disasters"]')).toBeEnabled();
  await expect(page.locator('input[name="victory-culture"]')).toBeEnabled();
});
