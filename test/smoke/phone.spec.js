// Phase 21: the phone layout, taps only, in portrait (390x844) and landscape
// (844x390); every visible target at least 44px; and the game opening and
// playing offline once the service worker has cached it.

import { test, expect } from '@playwright/test';

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
};

/** Every visible thing you can tap: at least 44 by 44 (a tick box counts by its label). */
async function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    for (const el of document.querySelectorAll('button, a[href], select, input, [role="button"], [role="tab"]')) {
      if (!visible(el) || el.closest('[hidden]') || el.closest('.attention') && !document.querySelector('.screen.game.drawer-open')) continue;
      let r = el.getBoundingClientRect();
      if (el.matches('input[type="checkbox"], input[type="radio"]')) r = (el.closest('label') ?? el).getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

test('the phone layout plays with taps only, every target big enough', async ({ page }, info) => {
  const errors = watchErrors(page);
  const portrait = info.project.name.includes('390x844');
  await page.goto('/?seed=42&nosw=1');
  expect(await smallTargets(page)).toEqual([]);
  await page.getByRole('button', { name: 'New game' }).tap();
  await expect(page.locator('#setup')).toBeVisible();
  // A first game on a phone starts on a Small map, with the advice to keep to Small or Standard.
  await expect(page.locator('select[name="mapSize"]')).toHaveValue('small');
  await expect(page.locator('[data-field="phone-maps"]')).toBeVisible();
  await expect(page.locator('select[name="mapSize"] option[value="large"]')).toContainText('slow on phones');
  expect(await smallTargets(page)).toEqual([]);
  await page.screenshot({ path: `test-results/phone-setup-${info.project.name}.png` });
  await page.locator('[data-action="start-game"]').tap();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);

  // The bar shows icons; the attention list is a drawer behind "!" with its count.
  const bar = page.locator('.game-bar');
  await expect(bar.locator('[data-action="empire"] .label')).toBeHidden();
  const count = Number(await page.locator('[data-field="attention-count"]').textContent());
  expect(count).toBeGreaterThan(0);
  await expect(page.locator('.attention')).not.toBeInViewport();
  expect(await smallTargets(page)).toEqual([]);
  await page.screenshot({ path: `test-results/phone-game-${info.project.name}.png` });
  await page.locator('[data-action="attention-toggle"]').tap();
  await expect(page.locator('.attention')).toBeInViewport();
  expect(await smallTargets(page)).toEqual([]);
  await page.locator('.attention-item', { hasText: 'Settler' }).tap();
  await expect(page.locator('.attention')).not.toBeInViewport();

  // Found the capital from the sheet, with taps.
  await expect(page.locator('.unit-card h2')).toHaveText('Settler');
  await page.locator('[data-act="foundCity"]').tap();
  await expect(page.locator('.unit-panel')).toContainText('Production');
  if (portrait) {
    // The sheet folds away with its handle and comes back.
    await page.locator('[data-action="sheet-toggle"]').tap();
    await expect(page.locator('.unit-card')).toBeHidden();
    await expect(page.locator('[data-action="next"]')).toBeVisible();
    await page.locator('[data-action="sheet-toggle"]').tap();
    await expect(page.locator('.unit-card')).toBeVisible();
  }
  // An overlay fills the screen.
  await page.locator('[data-action="victory"]').tap();
  const card = page.locator('[data-field="panel"] .panel-card');
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  const vp = page.viewportSize();
  expect(Math.round(box.width)).toBe(vp.width);
  expect(await smallTargets(page)).toEqual([]);
  await page.locator('[data-action="close-victory"]').tap();

  // End the turn with taps: the Next button takes you through what blocks it.
  const turn = await page.evaluate(() => window.__atlasGame.state.turn);
  for (let i = 0; i < 30 && (await page.evaluate(() => window.__atlasGame.state.turn)) === turn; i += 1) {
    const close = page.locator('[data-action="close-city"]');
    if (await close.count() && await close.isVisible()) {
      // A city with nothing to build: pick the first choice, then close it.
      const idleCity = await page.locator('.unit-panel').innerText().then((t) => t.includes('nothing yet'));
      const option = page.locator('.choose-item:not([disabled])').first();
      if (idleCity && await option.count()) { await option.scrollIntoViewIfNeeded(); await option.tap(); continue; }
      await close.tap();
      continue;
    }
    const skip = page.locator('[data-act="skip"]:not([disabled])');
    if (await skip.count() && await skip.first().isVisible()) { await skip.first().tap(); continue; }
    const next = page.locator('[data-action="next"]');
    await next.scrollIntoViewIfNeeded();
    await next.tap();
    await page.waitForFunction(() => !window.__atlasGame.busy);
  }
  expect(await page.evaluate(() => window.__atlasGame.state.turn)).toBe(turn + 1);
  expect(errors).toEqual([]);
});

test('offline: once cached by the service worker, the game opens and plays in flight mode', async ({ page, context }, info) => {
  test.skip(!info.project.name.includes('390x844'), 'one phone size is enough for the offline check');
  await page.goto('/?seed=42');
  // Wait until the worker has installed (every file cached) and controls the page.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const code = keys.find((k) => k.startsWith('atlas-') && k !== 'atlas-art-v1');
    return code ? (await (await caches.open(code)).keys()).length : 0;
  });
  expect(cached).toBeGreaterThan(100);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  await page.getByRole('button', { name: 'New game' }).tap();
  await expect(page.locator('#setup')).toBeVisible();
  await page.locator('[data-action="start-game"]').tap();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);
  await expect(page.locator('[data-field="turn"]')).toContainText('Turn 1');
  await context.setOffline(false);
});
