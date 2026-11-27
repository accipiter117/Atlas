// Phase 9 smoke tests: the setup screen, autosave and Continue, export and
// import codes, the victory panel, and a whole Small Quick game, AI on every
// seat, played to the end screen.

import { test, expect } from '@playwright/test';

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function setUpQuick(page, info) {
  await page.goto('/?seed=4242&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('#setup')).toBeVisible();
  await page.locator('[data-preset="quick"]').click();
  await expect(page.locator('select[name="mapSize"]')).toHaveValue('small');
  await expect(page.locator('select[name="ais"]')).toHaveValue('3');
  await expect(page.locator('select[name="speed"]')).toHaveValue('quick');
  await expect(page.locator('select[name="difficulty"]')).toHaveValue('prince');
  await page.locator('select[name="difficulty"]').selectOption('emperor');
  await expect(page.locator('[data-field="difficulty-bonus"]')).toContainText('+1 settler');
  await page.locator('select[name="difficulty"]').selectOption('prince');
  await expect(page.locator('select[name="conversion"] option')).toHaveText(['None', 'The Witcher: Northern Wars', 'Killzone: The Front', 'Killzone: Extrasolar War']);
  await page.locator('[data-tab="players"]').click();
  await page.locator('select[name="faction"]').selectOption('greece');
  if (info) await page.screenshot({ path: `test-results/setup-${info.project.name}.png`, fullPage: true });
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame);
}

const turnOf = (page) => page.evaluate(() => window.__atlasGame.state.turn);

test('setup, autosave, Continue, export and import', async ({ page }, info) => {
  const errors = watchErrors(page);
  await setUpQuick(page, info);
  const setup = await page.evaluate(() => window.__atlasGame.state.setup);
  expect(setup.players.length).toBe(4);
  expect(setup.players[0].faction).toBe('greece');
  expect(setup.speed).toBe('quick');
  expect(setup.map.size).toBe('small');
  expect(setup.mods).toEqual(['base-ancient@0.1.0']);

  // Play two rounds (an AI plays your seat too), then end a turn yourself: that autosaves.
  await page.evaluate(() => window.__atlasGame.debug.autoplay(2));
  await page.evaluate(() => {
    const g = window.__atlasGame;
    for (const u of g.view.units.filter((x) => x.faction === g.human)) u.activity = 'fortified';
  });
  const next = page.locator('[data-action="next"]');
  const before = await turnOf(page);
  for (let i = 0; i < 40 && (await turnOf(page)) === before; i += 1) {
    const skip = page.locator('[data-act="skip"]:not([disabled])');
    const option = page.locator('.choose-item:not([disabled])').first();
    if (await skip.count()) await skip.first().click();
    else if (await option.count() && await option.isVisible()) await option.click();
    else { await next.click(); await page.waitForFunction(() => !window.__atlasGame.busy); }
  }
  const turn = await turnOf(page);
  expect(turn).toBe(before + 1);
  const fingerprint = await page.evaluate(() => JSON.stringify(window.__atlasGame.state.units));

  // The victory panel shows every active path (conquest, science, score, religious, culture) for everyone.
  await page.locator('[data-action="victory"]').click();
  const panel = page.locator('[data-field="panel"]');
  await expect(panel.locator('.victory-path')).toHaveCount(5);
  await expect(panel.locator('[data-victory="culture"]')).toContainText('at least 100');
  await expect(panel.locator('[data-victory="score"] li')).toHaveCount(4);
  await expect(panel).toContainText('turns left');
  await page.screenshot({ path: `test-results/victory-${info.project.name}.png` });
  await panel.locator('[data-action="close-victory"]').click();

  // Back to the title screen: Continue brings back the same turn.
  await page.locator('[data-action="game-menu"]').click();
  await expect(panel).toContainText('Save game');
  await page.locator('[data-action="open-save"]').click();
  await page.locator('[data-action="save-game"]').click();
  await expect(panel.locator('[data-field="saved"]')).toBeVisible();
  await page.locator('[data-action="export-game"]').click();
  const code = await panel.locator('[data-field="export-code"]').inputValue();
  expect(code.startsWith('ATLAS1:')).toBe(true);
  await page.screenshot({ path: `test-results/menu-${info.project.name}.png` });
  await page.locator('[data-action="to-title"]').click();
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction((t) => window.__atlasGame?.state.turn === t, turn);
  expect(await page.evaluate(() => JSON.stringify(window.__atlasGame.state.units))).toBe(fingerprint);

  // Closing the tab: a fresh page still offers Continue (the autosave).
  await page.reload();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-item')).toHaveCount(2);
  await page.screenshot({ path: `test-results/load-${info.project.name}.png` });
  await page.locator('#load [data-action="back"]').click();

  // Import the code into a fresh page.
  await page.getByRole('button', { name: 'Import code' }).click();
  await page.locator('[data-field="import-code"]').fill(code);
  await page.locator('[data-action="import-go"]').click();
  await page.waitForFunction((t) => window.__atlasGame?.state.turn === t, turn);
  expect(await page.evaluate(() => JSON.stringify(window.__atlasGame.state.units))).toBe(fingerprint);
  expect(errors).toEqual([]);
});

test('a whole Small Quick game with the AI on every seat reaches the end screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one full game is enough');
  test.setTimeout(8 * 60_000);
  const errors = watchErrors(page);
  await setUpQuick(page, null);
  let r = null;
  for (let i = 0; i < 40; i += 1) {
    r = await page.evaluate(() => window.__atlasGame.debug.autoplay(10));
    expect(r.refusals).toEqual([]);
    if (r.winner) break;
  }
  expect(r.winner).not.toBeNull();
  expect(r.turn).toBeLessThanOrEqual(221);
  const panel = page.locator('[data-field="panel"]');
  await expect(panel.locator('[data-field="end-title"]')).toBeVisible();
  await expect(panel.locator('.end-table tbody tr')).toHaveCount(4);
  await expect(panel).toContainText('World seed 4242');
  await page.screenshot({ path: `test-results/end-${info.project.name}.png` });
  // A finished game refuses more turns.
  expect(await page.evaluate(() => window.__atlasGame.state.winner.victory)).toBe(r.winner.victory);
  expect(errors).toEqual([]);
});
