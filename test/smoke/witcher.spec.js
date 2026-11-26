// Phase 17 smoke test: the Witcher conversion with lock-era (Classical) and
// no-religious-victory, chosen on the setup screen, plays on placeholder art
// with only Northern Kingdoms factions; the Mods screen's Stack check plays it.

import { test, expect } from '@playwright/test';

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
};
const NORTH = ['Temeria', 'Redania', 'Kaedwen', 'Aedirn', 'Nilfgaard', 'Skellige', 'Kovir', "Scoia'tael"];

test('setup: Witcher + lock-era (Classical) + no-religious-victory starts a Northern game', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=4242&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await page.locator('[data-preset="quick"]').click();
  await page.locator('select[name="conversion"]').selectOption('witcher');
  // The faction lists now hold the Northern Kingdoms only.
  await expect(page.locator('select[name="faction"] option')).toContainText(['Random', ...NORTH]);
  await page.locator('input[name="mod-lock-era"]').check();
  await expect(page.locator('select[name="opt-lock-era-era"]')).toHaveValue('classical');
  await page.locator('input[name="mod-no-religious-victory"]').check();
  await expect(page.locator('[data-tweak="no-religious-victory"] [data-move="up"]')).toBeEnabled();
  await expect(page.locator('input[name="victory-science"]')).toBeDisabled();
  await expect(page.locator('input[name="victory-religious"]')).toBeDisabled();
  await expect(page.locator('select[name="turnLimit"] option[value="default"]')).toHaveText('No limit (switched off by a mod)');
  await page.locator('select[name="faction"]').selectOption('temeria');
  await page.screenshot({ path: `test-results/witcher-setup-${info.project.name}.png`, fullPage: true });
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame);

  const g = await page.evaluate(() => {
    const game = window.__atlasGame;
    return { civs: game.state.factions.map((f) => f.civ), mods: game.state.setup.mods, victories: game.state.setup.victories, era: game.state.factions[0].era ?? null, skin: document.documentElement.dataset.skin };
  });
  expect(g.civs[0]).toBe('temeria');
  for (const c of g.civs) expect(['temeria', 'redania', 'kaedwen', 'aedirn', 'nilfgaard', 'skellige', 'kovir', 'scoiatael']).toContain(c);
  expect(g.mods.map((m) => m.split('@')[0])).toEqual(['base-ancient', 'witcher', 'lock-era', 'no-religious-victory']);
  expect(g.victories).not.toContain('science');
  expect(g.victories).not.toContain('religious');
  expect(g.skin).toBe('witcher');
  // Found the capital: a Temerian city name.
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await expect(page.locator('body')).toContainText('Vizima');
  await page.locator('[data-action="close-city"]').click();
  await page.evaluate(() => window.__atlasGame.debug.autoplay(3));
  const body = await page.locator('body').innerText();
  for (const word of ['Rome', 'Roman', 'Greece', 'Egypt', 'Persia', 'Carthage', 'Gaul', 'Britons']) expect(body).not.toContain(word);
  await page.screenshot({ path: `test-results/witcher-game-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('Mods screen: options for lock-era and a Stack check of the Witcher stack', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Mods', exact: true }).click();
  await page.locator('#mod-witcher').check();
  await page.locator('#mod-lock-era').check();
  await expect(page.locator('select[name="opt-lock-era-era"]')).toBeVisible();
  await page.locator('select[name="opt-lock-era-era"]').selectOption('ancient');
  await page.locator('[data-action="stack-check"]').click();
  const result = page.locator('[data-field="stack-result"]');
  await expect(result).toContainText('with 0 errors', { timeout: 30000 });
  await expect(result).toContainText('0 refused moves');
  await expect(result).toContainText('Redania');
  expect(await result.innerText()).not.toMatch(/Rome|Greece|Egypt/);
  expect(errors).toEqual([]);
});
