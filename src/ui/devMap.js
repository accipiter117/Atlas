// The developer map viewer: pick a seed, map type and size, regenerate, and
// see the start positions. Shows the map's fingerprint so "same seed, same
// map" can be checked by eye, and how long generation and drawing took.

import { loadRuleset } from '../data/loader.js';
import { generateMap, ENGINE_VERSION } from '../sim/index.js';
import { hashValue } from '../core/hash.js';
import { createMapView } from '../render/canvas.js';
import { attachMapInput } from './input.js';

export async function startMapViewer(doc, { loadModSources }) {
  const $ = (sel) => doc.querySelector(sel);
  const { available } = await loadModSources();
  const { ruleset, ok } = loadRuleset({ available, selection: ['base-ancient'], engineVersion: ENGINE_VERSION });
  if (!ok) { $('[data-field="info"]').textContent = 'base-ancient did not load.'; return; }

  const typeSel = $('#map-type');
  const sizeSel = $('#map-size');
  typeSel.replaceChildren(...Object.values(ruleset.mapTypes).map((t) => new Option(ruleset.text[t.nameKey] ?? t.id, t.id, t.default, t.default)));
  sizeSel.replaceChildren(...Object.values(ruleset.mapSizes).map((s) => new Option(`${ruleset.text[s.nameKey] ?? s.id} (${s.width}x${s.height})`, s.id, s.default, s.default)));

  const params = new URLSearchParams(doc.defaultView.location.search);
  if (params.get('seed')) $('#map-seed').value = params.get('seed');
  if (params.get('type')) typeSel.value = params.get('type');
  if (params.get('size')) sizeSel.value = params.get('size');

  let view = null;
  function regenerate() {
    const seed = Number.parseInt($('#map-seed').value, 10) || 0;
    const t0 = doc.defaultView.performance.now();
    const map = generateMap(ruleset, { seed, type: typeSel.value, size: sizeSel.value });
    const genMs = doc.defaultView.performance.now() - t0;
    view?.destroy();
    view = createMapView($('#map-host'), { map, ruleset });
    attachMapInput(view);
    view.setGrid($('#show-grid').checked);
    view.setMarkers($('#show-starts').checked ? map.starts : []);
    const n = map.width * map.height;
    const land = map.terrain.filter((t) => !ruleset.terrain[map.terrainIds[t]].water).length;
    $('[data-field="hash"]').textContent = hashValue(map);
    $('[data-field="info"]').textContent = `${map.width}x${map.height}, land ${Math.round((land / n) * 100)}%, ${map.rivers.length} rivers, ${map.starts.length} starts, generated in ${Math.round(genMs)} ms`;
    doc.defaultView.__atlasDev = { map, view, ruleset };
  }

  $('#regenerate').addEventListener('click', regenerate);
  $('#random-seed').addEventListener('click', () => {
    const buf = new Uint32Array(1);
    doc.defaultView.crypto.getRandomValues(buf);
    $('#map-seed').value = String(buf[0] % 1_000_000_000);
    regenerate();
  });
  typeSel.addEventListener('change', regenerate);
  sizeSel.addEventListener('change', regenerate);
  $('#map-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') regenerate(); });
  $('#show-grid').addEventListener('change', (e) => view?.setGrid(e.target.checked));
  $('#show-starts').addEventListener('change', (e) => view?.setMarkers(e.target.checked ? doc.defaultView.__atlasDev.map.starts : []));
  regenerate();
}
