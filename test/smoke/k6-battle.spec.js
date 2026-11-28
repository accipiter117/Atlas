// Killzone Extrasolar War K6: a platoon battle fought on a fortified hex names the works it is
// fought over, and the defenders fight dug in.
import { test, expect } from '@playwright/test';

test('K6: a platoon battle over a trench line', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=5&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('select[name="conversion"]').selectOption('killzone-war');
  await page.locator('[data-tab="advanced"]').click();
  await page.locator('select[name="battleMode"]').selectOption('ask');
  await page.locator('[data-tab="players"]').click();
  await page.locator('select[name="faction"]').selectOption('isa');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60_000 });

  // Make Vekta the game's active world with a harmless order there (a sentry fortifies).
  await page.evaluate(() => {
    const g = window.__atlasGame;
    const u = g.view.units.find((x) => x.faction === g.human && g.ruleset.units[x.type].strength > 0);
    g.debug.run({ type: 'fortify', faction: g.human, unit: u.id, world: g.viewWorld ?? 'vekta' });
  });
  // A Helghast squad dug into a trench beside one of ours on Vekta.
  const setup = await page.evaluate(() => {
    const g = window.__atlasGame;
    const me = g.human;
    // The world the game has active (where a debug spawn lands).
    const units = Object.values(g.state.units);
    const cities = Object.values(g.state.cities);
    const mine = units.find((u) => u.faction === me && g.ruleset.units[u.type].strength > 0) ?? units.find((u) => u.faction === me);
    const map = g.state.map;
    const w = map.width;
    const r = Math.floor(mine.tile / w);
    const c = mine.tile - r * w;
    const around = [[c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1], [c + (r % 2 ? 1 : -1), r - 1], [c + (r % 2 ? 1 : -1), r + 1]];
    const land = (t) => !g.ruleset.terrain[map.terrainIds[map.terrain[t]]]?.water && !g.ruleset.terrain[map.terrainIds[map.terrain[t]]]?.impassable;
    const spot = around.map(([cc, rr]) => rr * w + cc).find((t) => land(t) && !units.some((u) => u.tile === t) && !cities.some((x) => x.tile === t));
    const foe = g.state.factions.find((f) => f.civ === 'helghast').id;
    g.debug.spawn('assault_trooper', foe, spot);
    // The spawn made a new copy of the game: dig the trench into that one.
    const now = g.state.map;
    now.works = { ...(now.works ?? {}), [spot]: { faction: foe, fired: 0 } };
    now.improvement[spot] = now.improvementIds.indexOf('trench');
    return { mine: mine.id, spot, me, world: g.state.world };
  });
  const why = await page.evaluate(async ({ mine, spot }) => {
    const sim = await import('/src/sim/index.js');
    const g = window.__atlasGame;
    const st = g.state;
    const u = st.units[mine];
    return u ? sim.attackProblem(st, g.ruleset, u, spot) : `no unit ${mine} on ${st.world}`;
  }, setup);
  expect(why).toBe(null);
  const res = await page.evaluate(({ mine, spot, world }) => window.__atlasGame.debug.run({ type: 'attack', faction: window.__atlasGame.human, unit: mine, target: spot, world }), setup);
  expect(res?.ok, JSON.stringify(res?.error)).toBe(true);
  const card = page.locator('[data-field="overlay"]');
  await expect(card.locator('[data-battle="fight"]')).toBeVisible();
  await card.locator('[data-battle="fight"]').click();
  const screen = page.locator('[data-field="battle-screen"]');
  await expect(screen.locator('[data-field="kz-ground"]')).toContainText('Trench');
  await screen.locator('[data-kz="begin"]').click();
  await screen.locator('[data-kz="speed-8"]').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `test-results/k6-trench-battle-${info.project.name}.png` });
  await screen.locator('[data-kz="finish"]').click();
  await expect(screen.locator('[data-field="kz-outcome"]')).toBeVisible({ timeout: 60_000 });
  await screen.locator('[data-kz="continue"]').click();
  await expect(screen).toBeHidden();
  expect(errors).toEqual([]);
});
