// Phase 19 smoke test: a Killzone game starts on its fixed map with a front
// line instead of settlers; attacking opens the platoon battle, and its result
// comes back to the map and moves the front.

import { test, expect } from '@playwright/test';

test('Killzone: a front instead of settlers, and a platoon battle that moves it', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=7&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await page.locator('select[name="conversion"]').selectOption('killzone');
  await expect(page.locator('select[name="mapPreset"]')).toHaveValue('corinth_front');
  await expect(page.locator('select[name="faction"] option')).toHaveText(['Random', 'The ISA', 'The Helghast']);
  await expect(page.locator('select[name="ais"]')).toHaveValue('1');
  await expect(page.locator('select[name="battleMode"]')).toHaveValue('ask');
  await expect(page.locator('select[name="battleModule"]')).toHaveValue('killzone');
  await page.locator('select[name="faction"]').selectOption('isa');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame);

  const start = await page.evaluate(() => {
    const g = window.__atlasGame;
    const mine = Object.values(g.state.cities).filter((c) => c.faction === 'f0').length;
    const settlers = Object.values(g.state.units).filter((u) => u.type === 'settler').length;
    return { mine, settlers, sites: Object.keys(g.state.frontline.sites).length, control: g.state.frontline.control.filter((x) => x > 0).length };
  });
  expect(start.mine).toBe(3);
  expect(start.settlers).toBe(0);
  expect(start.sites).toBe(3);
  expect(start.control).toBeGreaterThan(100);
  await page.screenshot({ path: `test-results/killzone-map-${info.project.name}.png` });

  // An enemy rifle squad next to ours: attack it, fight the platoon battle.
  const setup = await page.evaluate(() => {
    const g = window.__atlasGame;
    const mine = g.view.units.find((u) => u.faction === 'f0' && u.type === 'warrior');
    const map = g.view.map;
    const w = map.width;
    const r = Math.floor(mine.tile / w);
    const c = mine.tile - r * w;
    const around = [[c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1], [c + (r % 2 ? 1 : -1), r - 1], [c + (r % 2 ? 1 : -1), r + 1]];
    const spot = around.map(([cc, rr]) => rr * w + cc).find((t) => !g.view.units.some((u) => u.tile === t) && !g.view.cities.some((x) => x.tile === t) && map.terrainIds[map.terrain[t]] !== 'coast');
    const enemy = g.debug.spawn('warrior', 'f1', spot);
    return { mine: mine.id, enemy, spot, control: g.state.frontline.control[spot] };
  });
  const res = await page.evaluate(({ mine, spot }) => window.__atlasGame.debug.run({ type: 'attack', faction: 'f0', unit: mine, target: spot }), setup);
  expect(res?.ok).toBe(true);
  const card = page.locator('[data-field="overlay"]');
  await expect(card.locator('[data-battle="fight"]')).toBeVisible();
  await card.locator('[data-battle="fight"]').click();
  const screen = page.locator('[data-field="battle-screen"]');
  await expect(screen.locator('[data-field="kz-platoons"]')).toContainText('Your platoons');
  await screen.locator('[data-kz="begin"]').click();
  await screen.locator('[data-kz="speed-8"]').click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `test-results/killzone-battle-${info.project.name}.png` });
  await screen.locator('[data-kz="finish"]').click();
  await expect(screen.locator('[data-field="kz-outcome"]')).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: `test-results/killzone-end-${info.project.name}.png` });
  await screen.locator('[data-kz="continue"]').click();
  await expect(screen).toBeHidden();
  const after = await page.evaluate(({ spot }) => {
    const g = window.__atlasGame;
    return { module: g.state.battleLog.at(-1).module, control: g.state.frontline.control[spot], pending: g.state.pendingBattle };
  }, setup);
  expect(after.module).toBe('killzone');
  expect(after.pending).toBeNull();
  expect(after.control).not.toBe(setup.control);
  expect(errors).toEqual([]);
});
