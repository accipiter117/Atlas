#!/usr/bin/env node
// npm run shots (docs/OVERHAUL.md, "How visual work is checked").
//
// Three fixed turn-120 games (base-ancient, the Witcher, Killzone; the human
// seat played by the computer) live in test/fixtures/saves/ as Import codes.
// This tool loads each through the real Import code screen in Chromium and
// captures a standard set of screens at 1366x768 and 1920x1080 into shots/
// (git-ignored), so every visual phase can be compared before and after.
//
//   npm run shots                     capture into shots/
//   npm run shots -- --build-saves    (re)build the three saves first (slow, about a minute each)
//   npm run shots -- --copy G1        also copy the set into docs/shots/G1/
//   npm run shots -- --only base      one ruleset only
//
// Screens: title, setup, the map at normal and zoomed-out view, a selected
// unit, the city drawer, the tech tree, Empire, Diplomacy, Victory and the
// in-game menu.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createGame, currentFactionId } from '../src/sim/index.js';
import { createSeatRunner } from '../src/ai/index.js';
import { createSave, exportCode } from '../src/save/save.js';
import { createCodec } from '../src/save/codec.js';
import { rulesFor } from './lib-sim.mjs';
import { readRules } from './lib-mods.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAVES = join(ROOT, 'test', 'fixtures', 'saves');
const OUT = join(ROOT, 'shots');
const PORT = 4179;
const SIZES = [[1366, 768], [1920, 1080]];

/** The three fixture games: which mods, which seed, which map. */
export const SHOT_GAMES = [
  { id: 'base', mods: ['base-ancient'], seed: 3, players: 6, map: { size: 'standard', type: 'continents' } },
  { id: 'witcher', mods: ['base-ancient', 'witcher'], seed: 5, players: 6, map: { size: 'standard', type: 'continents' } },
  { id: 'killzone', mods: ['base-ancient', 'killzone'], seed: 7, players: 2, map: { preset: 'corinth_front' } },
];
const TURNS = 120;

/** Play one fixture game to turn 120 with the computer on every seat, and return its Import code. */
export async function buildSave(game) {
  const { ruleset } = await rulesFor(game.mods);
  const { available } = await readRules(ROOT);
  const version = (id) => JSON.parse(available[id].manifest).version;
  const setup = {
    seed: game.seed,
    mods: game.mods.map((id) => `${id}@${version(id)}`),
    players: [{ kind: 'human', name: 'You' }, ...Array.from({ length: game.players - 1 }, (_, i) => ({ kind: 'ai', name: `Rival ${i + 1}` }))],
    map: game.map, speed: 'standard', raiders: 'on', events: 'occasional', disasters: 'off', fog: 'on', recordAI: 'off', autosave: 'off',
    battleMode: 'auto', battleModule: 'auto', difficulty: 'prince', turnLimit: null,
  };
  let state = createGame(ruleset, setup);
  const ids = state.factions.map((f) => f.id);
  const runner = createSeatRunner(ruleset, ids, { recordOff: true });
  const log = [];
  while (state.turn < TURNS && !state.winner) {
    const r = runner.play(state, { maxSeats: ids.length });
    state = r.state;
    log.push(...r.commands);
  }
  // Stop at the start of your own turn, so the game opens ready to play.
  const human = state.factions[0].id;
  if (!state.winner && currentFactionId(state) !== human) {
    const r = runner.play(state, { stopAt: human });
    state = r.state;
    log.push(...r.commands);
  }
  const save = createSave({ state, log, label: `Shots: ${game.id}, turn ${state.turn}`, now: '2026-11-27T00:00:00.000Z' });
  return { code: await exportCode(save, createCodec('zlib')), turn: state.turn, winner: state.winner };
}

async function serve() {
  const child = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) return child; } catch { /* starting */ }
    await new Promise((res) => setTimeout(res, 100));
  }
  child.kill();
  throw new Error('the dev server did not start');
}

async function capture(browser, game, code, [w, h]) {
  const dir = join(OUT, `${w}x${h}`, game.id);
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const shot = (name) => page.screenshot({ path: join(dir, `${name}.png`) });
  const base = `http://127.0.0.1:${PORT}/?nosw=1&seed=42`;
  await page.goto(base);
  await page.waitForSelector('[data-action="new"]');
  await shot('01-title');
  await page.locator('[data-action="new"]').click();
  await page.waitForSelector('#setup:not([hidden])');
  if (game.id !== 'base') await page.locator('select[name="conversion"]').selectOption(game.mods[1]);
  await page.waitForTimeout(200);
  await shot('02-setup');
  // Load the turn-120 game through Import code.
  await page.goto(base);
  await page.locator('[data-action="import"]').click();
  await page.locator('[data-field="import-code"]').fill(code);
  await page.locator('[data-action="import-go"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60000 });
  const overlay = page.locator('[data-field="overlay"]');
  if (await overlay.isVisible()) await overlay.locator('[data-action="close-overlay"]').click({ force: true }).catch(() => {});
  // The map, centred on the capital.
  await page.evaluate(() => {
    const g = window.__atlasGame;
    const cap = g.view.cities.find((c) => c.faction === g.human && c.capital) ?? g.view.cities.find((c) => c.faction === g.human);
    if (cap) g.mapView.centreOnTile(cap.tile);
  });
  await page.waitForTimeout(300);
  await shot('03-map');
  await page.evaluate(() => { const mv = window.__atlasGame.mapView; mv.setCamera({ ...mv.camera, zoom: 0.3 }); });
  await page.waitForTimeout(300);
  await shot('04-map-zoomed-out');
  await page.evaluate(() => { const mv = window.__atlasGame.mapView; mv.setCamera({ ...mv.camera, zoom: 1 }); });
  // A selected unit.
  const unit = await page.evaluate(() => window.__atlasGame.view.units.find((u) => u.faction === window.__atlasGame.human)?.id ?? null);
  if (unit) {
    await page.evaluate((id) => { const g = window.__atlasGame; const u = g.view.units.find((x) => x.id === id); g.mapView.centreOnTile(u.tile); }, unit);
    const toggle = page.locator('[data-action="attention-toggle"]');
    if (await toggle.isVisible()) await toggle.click();
    const item = page.locator(`.attention-item[data-unit="${unit}"]`);
    if (await item.count()) await item.click(); else await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await shot('05-unit');
  }
  // The city drawer.
  const city = await page.evaluate(() => window.__atlasGame.view.cities.find((c) => c.faction === window.__atlasGame.human)?.id ?? null);
  if (city) {
    await page.evaluate((id) => window.__atlasGame.openCity(id), city);
    await page.waitForTimeout(250);
    await shot('06-city');
    const close = page.locator('[data-action="close-city"]');
    if (await close.isVisible()) await close.click();
  }
  const panel = page.locator('[data-field="panel"]');
  const openAndShoot = async (action, name, closeSel) => {
    const b = page.locator(`[data-action="${action}"]`).first();
    if (!(await b.count()) || !(await b.isVisible())) return;
    await b.click();
    await page.waitForTimeout(300);
    await shot(name);
    const c = page.locator(closeSel).first();
    if (await c.count() && await c.isVisible()) await c.click(); else await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    if (await panel.isVisible()) await page.keyboard.press('Escape');
  };
  await openAndShoot('trees', '07-tech-tree', '[data-action="close-trees"], [data-action="close-tree"]');
  await openAndShoot('empire', '08-empire', '[data-action="close-empire"]');
  await openAndShoot('diplomacy', '09-diplomacy', '[data-action="close-diplomacy"]');
  await openAndShoot('victory', '10-victory', '[data-action="close-victory"]');
  await openAndShoot('game-menu', '11-menu', '[data-action="close-menu"], [data-action="resume"]');
  await ctx.close();
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const copy = args.includes('--copy') ? args[args.indexOf('--copy') + 1] : null;
  const games = SHOT_GAMES.filter((g) => !only || g.id === only);
  await mkdir(SAVES, { recursive: true });
  for (const game of games) {
    const file = join(SAVES, `${game.id}-turn${TURNS}.txt`);
    let exists = true;
    try { await readFile(file); } catch { exists = false; }
    if (args.includes('--build-saves') || !exists) {
      const t0 = Date.now();
      const { code, turn, winner } = await buildSave(game);
      await writeFile(file, `${code}\n`);
      console.log(`shots: built ${game.id} (turn ${turn}${winner ? `, won by ${winner.faction}` : ''}, ${Math.round(code.length / 1024)} KB code) in ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  }
  const server = await serve();
  const browser = await chromium.launch();
  try {
    await rm(OUT, { recursive: true, force: true });
    for (const game of games) {
      const code = (await readFile(join(SAVES, `${game.id}-turn${TURNS}.txt`), 'utf8')).trim();
      for (const size of SIZES) await capture(browser, game, code, size);
      console.log(`shots: ${game.id} captured`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  if (copy) {
    const dest = join(ROOT, 'docs', 'shots', copy);
    await rm(dest, { recursive: true, force: true });
    await cp(OUT, dest, { recursive: true });
    console.log(`shots: copied to docs/shots/${copy}/`);
    // Keep the repository light: 256-colour PNGs (needs Python with Pillow; skipped without it).
    await new Promise((res) => {
      const p = spawn('python3', [join(ROOT, 'tools', 'shrink-shots.py'), dest], { stdio: 'inherit' });
      p.on('error', () => res());
      p.on('exit', () => res());
    });
  }
  let n = 0;
  for (const size of await readdir(OUT)) for (const g of await readdir(join(OUT, size))) n += (await readdir(join(OUT, size, g))).length;
  console.log(`shots: ${n} screenshots in shots/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
