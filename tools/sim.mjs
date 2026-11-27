#!/usr/bin/env node
// The AI vs AI simulator (section 9.7). Plays whole AI-only games headless, in
// parallel threads, and reports win rates by faction and victory type, the
// average turn of victory, stalled games, errors and the slowest round.
//
//   npm run sim -- --games 20 --size small --speed quick --seeds 1000-1019
//   npm run sim -- --challenger rules-dev/ai/ai-v2.json --games 20 --swap-seats
//
// Options:
//   --games N          how many games (default 20; with --swap-seats, pairs of games)
//   --seeds A-B | A,B  seed list (default 1000 upwards)
//   --size, --type, --speed, --players, --turn-limit, --mods a,b
//   --challenger FILE  an AI weights patch to test; --champion FILE (default: as committed)
//   --swap-seats       play every seed twice with the challenger's and champion's seats swapped
//   --json FILE, --md FILE   write the report
//   --threads N        parallel games (default: CPU count)
//   --healthy          exit with an error if a healthy range (section 9.7) is broken
//   --war [PRESET]     a side war (Killzone Extrasolar War; default map preset kw_vekta, mods
//                      base-ancient,killzone,killzone-war): every faction with a side plays, a
//                      challenger takes a whole side (swapped with --swap-seats), and the report
//                      checks docs/KILLZONE.md 7.1 (sides, victory types, length, invasions, glory)
//   --scenario ID      a war scenario (with --war)
//
// Results are the same for the same options on any machine; only timings differ.

import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { report, healthProblems, warProblems, readVersion, pct } from './lib-sim.mjs';
import { AI_VERSION } from '../src/ai/version.js';

export function parseArgs(argv) {
  const o = { games: 20, size: 'small', type: 'continents', speed: 'quick', players: 4, mods: ['base-ancient'], seeds: null, swap: false, threads: cpus().length };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--games') o.games = Number(v());
    else if (a === '--size') o.size = v();
    else if (a === '--type') o.type = v();
    else if (a === '--speed') o.speed = v();
    else if (a === '--players') o.players = Number(v());
    else if (a === '--turn-limit') o.turnLimit = Number(v());
    else if (a === '--mods') o.mods = v().split(',');
    else if (a === '--seeds') {
      const s = v();
      const m = /^(\d+)-(\d+)$/.exec(s);
      o.seeds = m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, k) => Number(m[1]) + k) : s.split(',').map(Number);
    } else if (a === '--challenger') o.challenger = v();
    else if (a === '--champion') o.champion = v();
    else if (a === '--swap-seats') o.swap = true;
    else if (a === '--json') o.json = v();
    else if (a === '--md') o.md = v();
    else if (a === '--threads') o.threads = Number(v());
    else if (a === '--healthy') o.healthy = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--war') {
      o.war = { preset: argv[i + 1] && !argv[i + 1].startsWith('--') ? v() : 'kw_vekta' };
      if (!argv.includes('--mods')) o.mods = ['base-ancient', 'killzone', 'killzone-war'];
    } else if (a === '--scenario') o.scenario = v();
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

/** The list of games a batch plays. */
export function plan(o) {
  const challenger = readVersion(o.challenger);
  const champion = readVersion(o.champion);
  const count = o.swap ? Math.ceil(o.games / 2) : o.games;
  const seeds = (o.seeds ?? Array.from({ length: count }, (_, k) => 1000 + k)).slice(0, count);
  const war = o.war ? { ...o.war, ...(o.scenario ? { scenario: o.scenario } : {}) } : null;
  const base = { mods: o.mods, size: o.size, type: o.type, speed: o.speed, players: o.players, turnLimit: o.turnLimit, challenger, champion, ...(war ? { war } : {}) };
  const games = [];
  for (const seed of seeds) {
    if (!challenger) { games.push({ ...base, seed }); continue; }
    // Alternate seats: challenger in even seats, champion in odd; swapped for the second game.
    // In a side war the challenger takes a whole side: the first three seats (side 0 in kw_vekta).
    const seatsOf = o.war ? 6 : o.players;
    const a = Object.fromEntries(Array.from({ length: seatsOf }, (_, i) => [i, (o.war ? i < seatsOf / 2 : i % 2 === 0) ? 'challenger' : 'champion']));
    games.push({ ...base, seed, seats: a });
    if (o.swap) games.push({ ...base, seed, seats: Object.fromEntries(Object.entries(a).map(([i, s]) => [i, s === 'challenger' ? 'champion' : 'challenger'])) });
  }
  return games;
}

export async function runBatch(o, onDone = () => {}) {
  const jobs = plan(o);
  const results = new Array(jobs.length);
  const threads = Math.max(1, Math.min(o.threads, jobs.length));
  let next = 0;
  await Promise.all(Array.from({ length: threads }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL('./sim-worker.mjs', import.meta.url));
    const feed = () => {
      if (next >= jobs.length) { w.terminate().then(resolve); return; }
      const id = next++;
      w.postMessage({ id, game: jobs[id] });
    };
    w.on('message', (m) => { results[m.id] = m.result; onDone(m.result, results.filter(Boolean).length, jobs.length); feed(); });
    w.on('error', reject);
    feed();
  })));
  return results;
}

export function markdown(o, r, games, problems) {
  const lines = [];
  const champ = o.champion ?? `${AI_VERSION} (as committed)`;
  lines.push(`- Games: ${r.games} (${o.war ? `side war on ${o.war.preset}${o.scenario ? `, ${o.scenario}` : ''}` : `${o.size}, ${o.speed} speed, ${o.players} players`}, mods ${o.mods.join(' + ')}), seeds ${games[0]?.seed} to ${games[games.length - 1]?.seed}${o.swap ? ', seats swapped' : ''}`);
  if (o.challenger) {
    const c = r.versions.challenger ?? { wins: 0 };
    const k = r.versions.champion ?? { wins: 0 };
    const decided = c.wins + k.wins;
    lines.push(`- Challenger ${o.challenger} against champion ${champ}: challenger won ${c.wins} of ${decided} decided games (${pct(c.wins / Math.max(1, decided))}); keep only above 55%`);
  } else {
    lines.push(`- AI: ${champ}`);
  }
  lines.push(`- Wins by victory: ${Object.entries(r.winsByVictory).map(([v, n]) => `${v} ${n} (${pct(n / Math.max(1, r.games))})`).join(', ')}`);
  lines.push(`- Average victory turn: ${r.averageVictoryTurn ?? 'none'}; stalled games: ${r.stalled}`);
  lines.push(`- Win rate by faction: ${Object.entries(r.winRateByCiv).map(([c, x]) => `${c} ${x.wins}/${x.games}`).join(', ')}`);
  lines.push(`- Errors: ${r.errors.refusals} refused commands, ${r.errors.nan} NaN, ${r.errors.crashes} crashes; slowest round ${r.worstRoundMs} ms`);
  if (r.war) {
    lines.push(`- Sides: side 0 won ${r.war.sides[0]}, side 1 won ${r.war.sides[1]}, dead heats ${r.war.deadHeats} (settled by seat order, left out of the balance); average length ${r.war.averageLength} turns; a home world invaded in ${r.war.homeInvaded} of ${r.games}; landings per game ${r.war.landings}`);
    lines.push(`- Tops glory: ${Object.entries(r.war.topGlory).map(([c, n]) => `${c} ${n}`).join(', ')}`);
  }
  lines.push(`- Healthy ranges: ${problems.length ? problems.join('; ') : 'all met'}`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const o = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const games = await runBatch(o, (g, done, total) => {
    if (!o.quiet) process.stdout.write(`\r  ${done}/${total} games (last: seed ${g.seed}, ${g.winner ? `${g.winner.civ} ${g.winner.victory} turn ${g.winner.turn}` : 'stalled'})   `);
  });
  if (!o.quiet) process.stdout.write('\n');
  const r = report(games, o.war ? { victories: ['war_capitals', 'war_support', 'war_territory', 'war_time'] } : {});
  const problems = o.war ? [...warProblems(r), ...(r.errors.refusals || r.errors.nan || r.errors.crashes ? [`errors: ${r.errors.refusals} refused commands, ${r.errors.nan} NaN, ${r.errors.crashes} crashes`] : [])] : healthProblems(r, o);
  const md = markdown(o, r, games, problems);
  console.log(md);
  console.log(`  (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (o.json) writeFileSync(o.json, `${JSON.stringify({ options: { ...o, threads: undefined }, report: r, games }, null, 2)}\n`);
  if (o.md) writeFileSync(o.md, `${md}\n`);
  if (o.healthy && problems.length) process.exit(1);
}
