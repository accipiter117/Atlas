// The developer page's simulation tools (phase 10, section 11.5): a 10-game
// mini-simulation and "jump turns", both in a Web Worker so the page never
// freezes. Developer-facing, like the rest of dev.html.

export function startDevTools(doc, ruleset) {
  const $ = (sel) => doc.querySelector(sel);
  const fill = (sel, items, chosen) => $(sel).replaceChildren(...items.map(([id, label]) => new Option(label, id, id === chosen, id === chosen)));
  const sizes = Object.values(ruleset.mapSizes).map((s) => [s.id, ruleset.text[s.nameKey] ?? s.id]);
  fill('#mini-size', sizes, 'small');
  fill('#jump-size', sizes, 'large');
  fill('#mini-speed', Object.keys(ruleset.tuning.speeds ?? { standard: 1 }).map((s) => [s, s]), 'quick');
  const name = (civ) => ruleset.text[ruleset.factions[civ]?.nameKey] ?? civ;
  const worker = () => new doc.defaultView.Worker(new URL('../devSimWorker.js', import.meta.url), { type: 'module' });
  const players = (n) => Array.from({ length: Math.max(2, Math.min(12, n)) }, () => ({ kind: 'ai' }));
  const row = (cells, tag = 'td') => { const tr = doc.createElement('tr'); for (const c of cells) { const td = doc.createElement(tag); td.textContent = String(c); tr.append(td); } return tr; };

  let mini = null;
  $('#mini-run').addEventListener('click', () => {
    mini?.terminate();
    const games = Number($('#mini-games').value) || 10;
    const setup = { players: players(Number($('#mini-players').value) || 4), map: { size: $('#mini-size').value, type: 'continents' }, speed: $('#mini-speed').value, raiders: 'on' };
    const results = [];
    const t0 = doc.defaultView.performance.now();
    const draw = () => {
      const civs = {};
      for (const g of results) for (const c of g.civs) { civs[c] ??= { games: 0, wins: 0 }; civs[c].games += 1; }
      for (const g of results) if (g.civ) civs[g.civ].wins += 1;
      $('[data-field="mini-civs"]').replaceChildren(row(['Faction', 'Wins', 'Games'], 'th'), ...Object.entries(civs).sort((a, b) => b[1].wins - a[1].wins).map(([c, x]) => row([name(c), x.wins, x.games])));
      const vic = {};
      for (const g of results) { const k = g.victory ?? 'stalled'; vic[k] ??= { n: 0, turns: 0 }; vic[k].n += 1; vic[k].turns += g.turn; }
      $('[data-field="mini-victories"]').replaceChildren(row(['Victory', 'Games', 'Average turn'], 'th'), ...Object.entries(vic).map(([k, x]) => row([k, x.n, Math.round(x.turns / x.n)])));
    };
    $('[data-field="mini-status"]').textContent = `Playing ${games} games...`;
    mini = worker();
    mini.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'game') { results.push(m); draw(); $('[data-field="mini-status"]').textContent = `${results.length} of ${games} games played; refused AI commands: ${results.reduce((n, g) => n + g.refusals, 0)}`; }
      if (m.type === 'done') { $('[data-field="mini-status"]').textContent += ` (finished in ${Math.round((doc.defaultView.performance.now() - t0) / 1000)} s)`; mini.terminate(); mini = null; }
      if (m.type === 'error') $('[data-field="mini-status"]').textContent = m.message;
    };
    mini.postMessage({ type: 'mini', ruleset, games, seed0: Number($('#mini-seed').value) || 0, setup });
  });

  let jump = null;
  $('#jump-run').addEventListener('click', () => {
    jump?.terminate();
    const turns = Number($('#jump-turn').value) || 200;
    const setup = { seed: Number($('#jump-seed').value) || 0, players: players(Number($('#jump-players').value) || 8), map: { size: $('#jump-size').value, type: 'continents' }, raiders: 'on', turnLimit: null };
    const status = $('[data-field="jump-status"]');
    status.textContent = 'Playing...';
    jump = worker();
    jump.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') status.textContent = `Turn ${m.turn} of ${turns}...`;
      if (m.type === 'jumped') {
        const ms = m.rounds.map((r) => Math.round(r.ms));
        status.textContent = `Reached turn ${m.turn}${m.winner ? ` (won by ${m.winner.victory} on turn ${m.winner.turn})` : ''}: ${m.cities} cities, ${m.units} units. Last rounds: ${ms.join(', ')} ms; worst ${Math.max(...ms)} ms (target under 2000). Refused AI commands: ${m.refusals}.`;
        jump.terminate();
        jump = null;
      }
      if (m.type === 'error') status.textContent = m.message;
    };
    jump.postMessage({ type: 'jump', ruleset, setup, turns });
  });
}
