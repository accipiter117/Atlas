#!/usr/bin/env node
// A sprite for every unit (graphics overhaul G4, docs/OVERHAUL.md 4.3).
//
//   node tools/gen/lpc-units.mjs
//
// 1. Fetches the Universal LPC Spritesheet Character Generator at a pinned
//    commit into .cache/lpc (git-ignored), only the layer folders the recipes
//    use.
// 2. Reads rules/<mod>/art/units.recipes.json: each unit is a list of LPC
//    layers (from the generator's sheet_definitions), some marked "tint" to
//    be drawn in the reserved mask colour the game recolours per faction; or a
//    "code" unit drawn in tools/gen/unit-art/compose.js (horses carrying an LPC
//    rider, chariots, siege engines, ships, monsters); or, for Killzone, the
//    troopers and tanks from Matthew's own Killzone project.
// 3. Composites every sheet in headless Chromium (the same Playwright the
//    tests use) and writes assets/sprites/<skin>/<unit>.png with a descriptor
//    holding full per-layer credits. It fails if any layer has no author or
//    licence. The mods' skin.json "art" entries are pointed at the sheets, and
//    a contact sheet of every unit goes to docs/shots/G4/.
//
// The game never runs any of this: it only loads the PNGs and descriptors.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LPC_REPO = 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
const LPC_COMMIT = '86a3719ee4a7e2e9fb27c7c152e29a741d3e930a';
const CACHE = join(ROOT, '.cache', 'lpc');
const PORT = 4191;
// --only <mod>: just that mod's sheets (no LPC fetch when it needs none; its own contact sheet).
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const MODS = ['base-ancient', 'witcher', 'killzone', 'killzone-war'].filter((m) => !ONLY || m === ONLY);
// Licences in the order we prefer to use them (the most permissive first).
const LICENCE_ORDER = ['CC0', 'OGA-BY 3.0', 'OGA-BY 4.0', 'CC-BY 4.0', 'CC-BY 3.0', 'CC-BY-SA 4.0', 'CC-BY-SA 3.0', 'GPL 3.0', 'GPL 2.0'];
const ANIMS = ['walk', 'hurt', 'thrust', 'slash', 'shoot'];

const git = (...args) => execFileSync('git', ['-C', CACHE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** The generator at the pinned commit, with only the files we need checked out. */
function ensureLpc(paths) {
  if (!existsSync(join(CACHE, '.git'))) {
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '1', LPC_REPO, CACHE], { stdio: 'inherit' });
  }
  if (git('rev-parse', 'HEAD') !== LPC_COMMIT) {
    git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', LPC_COMMIT);
    git('checkout', '-q', '--detach', LPC_COMMIT);
  }
  const patterns = ['/sheet_definitions/', '/CREDITS.csv', '/LICENSE', ...[...paths].map((p) => `/spritesheets/${p.replace(/\/$/, '')}/`)];
  git('sparse-checkout', 'init', '--no-cone');
  git('sparse-checkout', 'set', '--no-cone', ...patterns);
}

function chooseLicence(offered) {
  for (const l of LICENCE_ORDER) if (offered.includes(l)) return l;
  return offered[0] ?? null;
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

/** A recipe layer ("path" or { def, tint, variant }) resolved against the generator's definitions. */
async function resolveLayer(layer, body) {
  const spec = typeof layer === 'string' ? { def: layer } : layer;
  const def = await readJson(join(CACHE, 'sheet_definitions', `${spec.def}.json`)).catch(() => null);
  if (!def) throw new Error(`no LPC definition ${spec.def}`);
  const parts = Object.entries(def).filter(([k, v]) => k.startsWith('layer_') && v && !v.custom_animation && v[body])
    .map(([, v]) => ({ z: v.zPos ?? 0, path: v[body] }));
  if (!parts.length) throw new Error(`${spec.def} has no layer for the ${body} body`);
  const credits = (def.credits ?? []).map((c) => ({ file: c.file, authors: c.authors ?? [], licences: c.licenses ?? [], urls: c.urls ?? [], notes: c.notes ?? '' }));
  if (!credits.length) throw new Error(`${spec.def} has no credits`);
  for (const c of credits) {
    if (!c.authors.length) throw new Error(`${spec.def}: ${c.file} has no author`);
    if (!c.licences.length) throw new Error(`${spec.def}: ${c.file} has no licence`);
  }
  const anims = (def.animations ?? []).filter((a) => ANIMS.includes(a));
  return { def: spec.def, name: def.name ?? spec.def, tint: Boolean(spec.tint), hsl: spec.hsl ?? null, variant: spec.variant ?? def.variants?.[0] ?? null, parts, anims, credits };
}

/** The file for one part and animation: <path><anim>.png, or <path><anim>/<variant>.png. */
async function fileFor(part, anim, variant) {
  const base = join(CACHE, 'spritesheets', part.path);
  const flat = join(base, `${anim}.png`);
  if (existsSync(flat)) return `${part.path}${anim}.png`;
  const dir = join(base, anim);
  if (!existsSync(dir) || !(await stat(dir)).isDirectory()) return null;
  const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
  const pick = variant && files.includes(`${variant}.png`) ? `${variant}.png` : files[0];
  return pick ? `${part.path}${anim}/${pick}` : null;
}

function expand(recipeLayers, kits) {
  const out = [];
  for (const l of recipeLayers) {
    if (typeof l === 'object' && l.kit) out.push(...expand(kits[l.kit], kits));
    else out.push(l);
  }
  return out;
}

async function serve() {
  const child = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  for (let k = 0; k < 50; k += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return child; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('the dev server did not start');
}

const rgb = (hex) => { const n = parseInt(String(hex ?? '#888888').slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

/** The primary colour of the faction a leader leads (from any mod's factions.json). */
async function leaderColour(id) {
  for (const mod of MODS) {
    const path = join(ROOT, 'rules', mod, 'factions.json');
    if (!existsSync(path)) continue;
    const f = (await readJson(path)).entries.find((x) => (x.leaders ?? []).includes(id));
    if (f?.colours?.primary) return f.colours.primary;
  }
  return '#888888';
}

const dataToPng = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

function creditSummary(layers) {
  const authors = [...new Set(layers.flatMap((l) => l.credits.flatMap((c) => c.authors)))];
  const licences = [...new Set(layers.flatMap((l) => l.credits.map((c) => c.licence)))];
  return `Composed from the Universal LPC Spritesheet Character Generator (${LPC_REPO}, commit ${LPC_COMMIT.slice(0, 7)}), layers: ${layers.map((l) => l.def).join('; ')}. Artists: ${authors.join(', ')}. Used under ${licences.join(', ')}. Per-layer credits are in this descriptor's "layers".`;
}

async function main() {
  // ---- Read every recipe and resolve its LPC layers ----
  const recipes = [];
  for (const mod of MODS) {
    const path = join(ROOT, 'rules', mod, 'art', 'units.recipes.json');
    if (existsSync(path)) recipes.push({ mod, ...(await readJson(path)) });
  }
  if (!existsSync(join(CACHE, 'sheet_definitions')) && !(ONLY && recipes.every((r) => !r.units && !r.leaders))) ensureLpc([]);
  const lpcUnits = [];
  const paths = new Set();
  for (const r of recipes) {
    const body = r.body ?? 'male';
    const kits = r.kits ?? {};
    const want = [...Object.entries(r.units ?? {}).map(([id, u]) => ({ id, u, kind: 'lpc' })),
      ...Object.entries(r.code ?? {}).filter(([, u]) => u.rider).map(([id, u]) => ({ id, u: { ...u.rider, attack: u.attack }, kind: 'rider' })),
      ...Object.entries(r.leaders ?? {}).map(([id, u]) => ({ id, u, kind: 'leader' }))];
    for (const { id, u, kind } of want) {
      const layers = [];
      for (const l of expand(u.layers ?? [], kits)) layers.push(await resolveLayer(l, u.body ?? body));
      for (const l of layers) for (const p of l.parts) paths.add(p.path);
      lpcUnits.push({ mod: r.mod, skin: r.skin, id, kind, attack: u.attack ?? 'thrust', layers });
    }
  }
  if (paths.size || !ONLY) ensureLpc(paths);

  // ---- Composite in Chromium ----
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/tools/gen/unit-art/compose.html`);
  await page.waitForFunction(() => window.unitArtReady === true);
  const art = {};        // mod -> { artId: { sheet } }
  const contact = [];
  const riders = {};     // "<mod>:<id>" -> data URL of a rider sheet
  const write = async (skin, file, png, desc) => {
    const dir = join(ROOT, 'assets', 'sprites', skin);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${file}.png`), png);
    await writeFile(join(dir, `${file}.json`), `${JSON.stringify(desc, null, 2)}\n`);
    return `assets/sprites/${skin}/${file}.json`;
  };
  try {
    for (const u of lpcUnits) {
      const layers = [];
      for (const l of u.layers) {
        for (const part of l.parts) {
          const files = {};
          for (const anim of ['walk', 'hurt', u.attack]) {
            const f = l.anims.includes(anim) ? await fileFor(part, anim, l.variant) : null;
            if (f) files[anim] = `/.cache/lpc/spritesheets/${f}`;
          }
          layers.push({ z: part.z, tint: l.tint, hsl: l.hsl, files });
        }
      }
      const url = await page.evaluate((spec) => window.unitArt.composeLpcUrl(spec), { layers });
      if (u.kind === 'rider') { riders[`${u.mod}:${u.id}`] = url; continue; }
      if (u.kind === 'leader') {
        // A 128 pixel portrait (4x), its faction's colour baked in.
        const colour = rgb(await leaderColour(u.id));
        const portrait = await page.evaluate(([src, c]) => window.unitArt.portraitFrom(src, { row: 10, col: 0, x: 16, y: 13, w: 32, h: 32 }, 128, c), [url, colour]);
        const usedL = u.layers.map((l) => ({ def: l.def, name: l.name, tint: l.tint, credits: l.credits.map((c) => ({ ...c, licence: chooseLicence(c.licences) })) }));
        const desc = { id: `leader.${u.id}`, src: `assets/sprites/${u.skin}/leader.${u.id}.png`, frame: { w: 128, h: 128 }, anchor: { x: 64, y: 128 }, layout: 'image', credits: creditSummary(usedL), layers: usedL };
        const path = await write(u.skin, `leader.${u.id}`, dataToPng(portrait), desc);
        (art[u.mod] ??= {})[`leader.${u.id}`] = { sheet: path };
        continue;
      }
      const used = u.layers.map((l) => ({ def: l.def, name: l.name, tint: l.tint, credits: l.credits.map((c) => ({ ...c, licence: chooseLicence(c.licences) })) }));
      const desc = {
        id: `unit.${u.id}`, src: `assets/sprites/${u.skin}/${u.id}.png`, frame: { w: 64, h: 64 }, anchor: { x: 32, y: 58 }, layout: 'lpc',
        attackAnim: u.attack, fps: 8, tint: true, portrait: { row: 10, col: 0, x: 16, y: 12, w: 32, h: 32 },
        credits: creditSummary(used), layers: used,
      };
      const path = await write(u.skin, u.id, dataToPng(url), desc);
      (art[u.mod] ??= {})[`unit.${u.id}`] = { sheet: path };
      contact.push({ name: u.id, url, desc });
    }
    for (const r of recipes) {
      for (const [id, spec] of Object.entries(r.code ?? {})) {
        const riderUrl = riders[`${r.mod}:${id}`] ?? null;
        const url = await page.evaluate(([s, rider]) => window.unitArt.composeCode(s, rider), [spec, riderUrl]);
        const riderLayers = riderUrl ? lpcUnits.find((x) => x.mod === r.mod && x.id === id && x.kind === 'rider').layers
          .map((l) => ({ def: l.def, name: l.name, tint: l.tint, credits: l.credits.map((c) => ({ ...c, licence: chooseLicence(c.licences) })) })) : [];
        const own = 'Original pixel art drawn in code by tools/gen/unit-art/compose.js for Atlas (MIT licence)';
        const desc = {
          id: `unit.${id}`, src: `assets/sprites/${r.skin}/${id}.png`, frame: { w: 64, h: 64 }, anchor: { x: 32, y: 58 }, layout: 'lpc',
          attackAnim: spec.attack ?? 'thrust', fps: 8, tint: true, portrait: spec.portrait ?? { row: 11, col: 0, x: 24, y: 14, w: 32, h: 32 },
          credits: riderLayers.length ? `${own}; the rider ${creditSummary(riderLayers).replace(/^Composed/, 'composed')}` : `${own}.`,
          layers: riderLayers,
        };
        const path = await write(r.skin, id, dataToPng(url), desc);
        (art[r.mod] ??= {})[`unit.${id}`] = { sheet: path };
        contact.push({ name: id, url, desc });
      }
      // Killzone: every unit, once per side, as a trooper or a tank.
      for (const [id, spec] of Object.entries(r.killzone ?? {})) {
        for (const [civ, side] of Object.entries(r.sides)) {
          const out = await page.evaluate((s) => window.unitArt.composeKillzone(s), { ...spec, side });
          const fw = out.frame.w;
          const tank = Boolean(spec.tank || spec.vehicle);
          const desc = {
            id: `unit.${id}.${civ}`, src: `assets/sprites/${r.skin}/${id}.${civ}.png`, frame: out.frame,
            anchor: tank ? { x: 104, y: 120 } : { x: 40, y: 84 }, layout: 'grid', mapScale: tank ? 0.3 : 0.5, fps: 6,
            anims: { idle: { row: 0, frames: 1, dirs: ['e', 'w'] }, walk: { row: 2, frames: 4, dirs: ['e', 'w'] }, attack: { row: 4, frames: 4, dirs: ['e', 'w'] }, hurt: { row: 6, frames: 2 }, die: { row: 6, frames: 3 } },
            portrait: tank ? { row: 0, col: 0, x: 60, y: 30, w: 96, h: 96 } : { row: 0, col: 0, x: 18, y: 4, w: 40, h: 40 },
            credits: 'Original pixel art drawn in code in the Killzone: Front Line project (github.com/accipiter117/Killzone, src/render/pixel-troopers.js and tanks.js, commit 21dcd10), by the owner of Atlas.',
            layers: [],
          };
          const path = await write(r.skin, `${id}.${civ}`, dataToPng(out.url), desc);
          (art[r.mod] ??= {})[`unit.${id}.${civ}`] = { sheet: path };
          if (civ === Object.keys(r.sides)[0] || fw) contact.push({ name: `${id} (${civ})`, url: out.url, desc });
        }
      }
    }
    if (errors.length) throw new Error(`the composer page failed: ${errors.join('; ')}`);
    // ---- The contact sheet ----
    const sheetUrl = await page.evaluate((entries) => window.unitArt.contactSheet(entries), contact);
    await mkdir(join(ROOT, 'docs', 'shots', 'G4'), { recursive: true });
    await mkdir(join(ROOT, 'docs', 'shots', ONLY ? 'K7' : 'G4'), { recursive: true });
    await writeFile(join(ROOT, 'docs', 'shots', ONLY ? 'K7' : 'G4', ONLY ? `units-${ONLY}.png` : 'contact-sheet.png'), dataToPng(sheetUrl));
  } finally {
    await browser.close();
    server.kill();
  }

  // ---- Point each mod's skin at its sheets (other art entries are kept) ----
  for (const [mod, entries] of Object.entries(art)) {
    // A mod whose generator writes its skin (Extrasolar War maps every faction to its side's sheet) is left alone.
    if (recipes.find((r) => r.mod === mod)?.skinFromGenerator) continue;
    const path = join(ROOT, 'rules', mod, 'skin', 'skin.json');
    const skin = await readJson(path);
    const kept = Object.fromEntries(Object.entries(skin.values.art ?? {}).filter(([id]) => !id.startsWith('unit.') && !id.startsWith('leader.')));
    skin.values.art = { ...kept, ...Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) };
    await writeFile(path, `${JSON.stringify(skin, null, 2)}\n`);
  }
  console.log(`lpc-units: ${contact.length} sheets written; contact sheet in docs/shots/${ONLY ? `K7/units-${ONLY}` : 'G4/contact-sheet'}.png`);
}

main().catch((e) => { console.error(`lpc-units: ${e.message}`); process.exit(1); });
