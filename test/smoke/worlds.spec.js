// Killzone Extrasolar War K1b: a two-world Killzone game (the test mod, offered in New game in
// developer mode) shows a world switcher; switching changes the map and minimap; your orders
// go to the world on screen; the computer plays both worlds; nothing breaks.
import { test, expect } from '@playwright/test';

test('K1b: two worlds, a switcher, orders for the world on screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('atlas:settings', JSON.stringify({ developer: true })));
  await page.goto('/?seed=7&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('select[name="conversion"]').selectOption('killzone');
  await page.locator('input[name="mod-test-killzone-worlds"]').check();
  await page.locator('[data-tab="players"]').click();
  await page.locator('select[name="faction"]').selectOption('isa');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);

  const worlds = page.locator('[data-field="worlds"] .world-btn');
  await expect(worlds).toHaveText(['Vekta', 'Helghan']);
  await expect(worlds.first()).toHaveAttribute('aria-pressed', 'true');
  const vekta = await page.evaluate(() => ({ terrain: window.__atlasGame.view.map.terrain.join(), world: window.__atlasGame.viewWorld }));
  expect(vekta.world).toBe('vekta');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/k1b-vekta-${info.project.name}.png` });

  // The switcher button changes the map, the minimap and the panels; nothing in the game changes.
  const before = await page.evaluate(() => window.__atlasGame.fingerprint());
  await worlds.nth(1).click();
  await expect(worlds.nth(1)).toHaveAttribute('aria-pressed', 'true');
  const hel = await page.evaluate(() => ({ terrain: window.__atlasGame.view.map.terrain.join(), world: window.__atlasGame.viewWorld, mine: window.__atlasGame.view.cities.filter((c) => c.faction === window.__atlasGame.human).length }));
  expect(hel.world).toBe('helghan');
  expect(hel.terrain).not.toBe(vekta.terrain);
  expect(hel.mine).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__atlasGame.fingerprint())).toBe(before);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/k1b-helghan-${info.project.name}.png` });

  // An order on Helghan is tagged with Helghan and lands there.
  const order = await page.evaluate(() => {
    const g = window.__atlasGame;
    const u = g.view.units.find((x) => x.faction === g.human);
    g.selectUnit(u.id);
    return u.id;
  });
  await page.locator('.actions [data-act]').first().click();
  const tagged = await page.evaluate((id) => {
    const g = window.__atlasGame;
    const last = g.log.at(-1);
    return { last, there: g.state.worlds?.helghan ? g.state.worlds.helghan.units[id] : g.state.units[id] };
  }, order);
  expect(tagged.last).toMatchObject({ world: 'helghan', unit: order });
  expect(tagged.there, 'the unit is still on Helghan').toBeTruthy();

  // The Next button and the attention list point at a world still waiting for orders.
  const waiting = await page.evaluate(() => window.__atlasGame.waitingWorldNow());
  expect(waiting).toBe('vekta');
  await expect(page.locator('.attention-item').first()).toContainText('Vekta needs orders');

  // W goes back to Vekta; the next turn plays both worlds for the computer.
  await page.locator('#game-map').focus();
  await page.keyboard.press('w');
  await expect(worlds.first()).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-field="turn"]')).toHaveText('Turn 2', { timeout: 60_000 });
  const rivals = await page.evaluate(() => window.__atlasGame.log.filter((c) => c.faction !== window.__atlasGame.human && c.world).map((c) => c.world));
  expect(new Set(rivals)).toEqual(new Set(['vekta', 'helghan']));
  expect(errors).toEqual([]);
});
