// Phase 18 smoke test: with "Ask each time", attacking offers Fight or
// Auto-resolve with the odds; fighting opens the battlefield, the battle plays
// out, and the map shows the survivors with the health the battle left them.

import { test, expect } from '@playwright/test';
import { openAttention } from './helpers.js';

async function pointOf(page, tile) {
  const box = await page.locator('#game-map canvas').boundingBox();
  const p = await page.evaluate((target) => {
    const mv = window.__atlasGame.mapView;
    mv.centreOnTile(target);
    const { w, h } = mv.viewport();
    let best = null;
    for (let sy = 0; sy < h; sy += 3) for (let sx = 0; sx < w; sx += 3) {
      if (mv.tileAt(sx, sy) !== target) continue;
      const d = (sx - w / 2) ** 2 + (sy - h / 2) ** 2;
      if (!best || d < best.d) best = { sx, sy, d };
    }
    return best;
  }, tile);
  return { x: box.x + p.sx, y: box.y + p.sy };
}

async function raiderNextToWarrior(page) {
  return page.evaluate(() => {
    const g = window.__atlasGame;
    const w = g.view.units.find((u) => u.faction === 'f0' && u.type === 'warrior');
    const map = g.view.map;
    const width = map.width;
    const r = Math.floor(w.tile / width);
    const c = w.tile - r * width;
    const around = [[c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1], [c + (r % 2 ? 1 : -1), r - 1], [c + (r % 2 ? 1 : -1), r + 1]];
    const ok = (t) => map.terrain[t] >= 0 && !['ocean', 'coast', 'lake', 'mountain'].includes(map.terrainIds[map.terrain[t]])
      && !g.view.units.some((u) => u.tile === t) && !g.view.cities.some((x) => x.tile === t) && g.view.fog[t] === 2;
    const spot = around.map(([cc, rr]) => rr * width + cc).find(ok);
    const raider = g.debug.spawn('warrior', 'raiders', spot);
    return { warrior: w.id, spot, raider };
  });
}

async function attack(page, info, setup) {
  await openAttention(page);
  await page.locator(`.attention-item[data-unit="${setup.warrior}"]`).click();
  const pt = await pointOf(page, setup.spot);
  if (info.project.use.hasTouch) { await page.touchscreen.tap(pt.x, pt.y); await page.touchscreen.tap(pt.x, pt.y); } else await page.mouse.click(pt.x, pt.y);
}

test('ask each time: Fight opens the battlefield and the result reaches the map', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame?.debug);
  await page.evaluate(() => window.__atlasGame.debug.battleMode('ask'));
  const setup = await raiderNextToWarrior(page);
  await attack(page, info, setup);

  // The card: Fight or Auto-resolve, with the auto odds.
  const card = page.locator('[data-field="overlay"]');
  await expect(card.locator('[data-field="battle-odds"]')).toContainText('% you win');
  await expect(card.locator('[data-battle="fight"]')).toBeVisible();
  await expect(card.locator('[data-battle="auto"]')).toBeVisible();
  // Nothing else can happen while the battle waits.
  expect(await page.evaluate(() => Boolean(window.__atlasGame.state.pendingBattle))).toBe(true);
  await card.locator('[data-battle="fight"]').click();

  const screen = page.locator('[data-field="battle-screen"]');
  await expect(screen).toBeVisible();
  await expect(screen.locator('[data-field="tactical-status"]')).toContainText('Begin');
  await screen.locator('[data-tactical="charge"]').click();
  await expect(screen.locator('[data-field="tactical-order"]')).toContainText('Charging');
  await screen.locator('[data-tactical="begin"]').click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `test-results/tactical-${info.project.name}.png` });
  await screen.locator('[data-tactical="finish"]').click();
  await expect(screen.locator('[data-field="tactical-outcome"]')).toBeVisible();
  const shown = await screen.locator('[data-field="tactical-end"]').innerText();
  await page.screenshot({ path: `test-results/tactical-end-${info.project.name}.png` });
  await screen.locator('[data-tactical="continue"]').click();
  await expect(screen).toBeHidden();

  // The map now holds what the battle left: the same HP the battle screen reported.
  const after = await page.evaluate(({ warrior, raider }) => {
    const g = window.__atlasGame;
    const log = g.state.battleLog.at(-1);
    return { pending: g.state.pendingBattle, module: log.module, result: log.result, mine: g.state.units[warrior]?.hp ?? 0, theirs: g.state.units[raider]?.hp ?? 0 };
  }, setup);
  expect(after.pending).toBeNull();
  expect(after.module).toBe('tactical');
  expect(after.mine).toBe(after.result.units.find((u) => u.ref === setup.warrior).hp);
  expect(after.theirs).toBe(after.result.units.find((u) => u.ref === setup.raider).hp);
  if (after.mine > 0) expect(shown).toContain(`${after.mine} HP left`);
  expect(errors).toEqual([]);
});

test('ask each time: Auto-resolve settles it at once', async ({ page }, info) => {
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame?.debug);
  await page.evaluate(() => window.__atlasGame.debug.battleMode('ask'));
  const setup = await raiderNextToWarrior(page);
  await attack(page, info, setup);
  await page.locator('[data-battle="auto"]').click();
  await expect(page.locator('[data-toast]')).toContainText('attacked');
  const log = await page.evaluate(() => window.__atlasGame.state.battleLog.at(-1).module);
  expect(log).toBe('auto');
});

test('setup: the battle modes can be chosen', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('[data-tab="advanced"]').click();
  await page.locator('select[name="battleMode"]').selectOption('ask');
  await expect(page.locator('select[name="battleModule"]')).toHaveValue('tactical');
  await expect(page.locator('select[name="battleModule"]')).toBeEnabled();
});
