// Map thumbnails for the Continue and Load cards (graphics overhaul G7).
//
// mapThumb(view, ruleset, human) turns what the player knows into a tiny text
// map, one character per cell, rows joined by "/": "." unexplored, "~" water,
// "^" mountains, "#" land, "Y" your land, "R" a rival's, "*" your city, "+" a
// rival's city. It is stored with the save, so the cards need no rules to draw.
// drawThumb(canvas, thumb, colour) paints it.

const MAX_W = 56;

export function mapThumb(view, ruleset, human) {
  const map = view.map;
  const w = Math.min(MAX_W, map.width);
  const h = Math.max(1, Math.round((w * map.height * 1.5) / (map.width * Math.sqrt(3))));
  const owner = map.owner ?? [];
  const cityAt = new Map(view.cities.map((c) => [c.tile, c]));
  const factionOfCity = new Map(view.cities.map((c) => [c.id, c.faction]));
  const rows = [];
  for (let y = 0; y < h; y += 1) {
    let row = '';
    for (let x = 0; x < w; x += 1) {
      const i = Math.floor((y * map.height) / h) * map.width + Math.floor((x * map.width) / w);
      if (view.fog && view.fog[i] === 0) { row += '.'; continue; }
      const city = cityAt.get(i);
      if (city) { row += city.faction === human ? '*' : '+'; continue; }
      const o = owner[i];
      const f = o === null || o === undefined ? null : factionOfCity.get(o);
      if (f) { row += f === human ? 'Y' : 'R'; continue; }
      const t = ruleset.terrain[map.terrainIds[map.terrain[i]]];
      row += t?.water ? '~' : t?.mapgen?.role === 'mountain' ? '^' : '#';
    }
    rows.push(row);
  }
  return rows.join('/');
}

const PALETTE = { '.': '#cdbb8e', '~': '#3f74a0', '#': '#7f9a52', '^': '#8a8278', R: '#a08a6a', '+': '#5a4630' };

/** Draw a thumbnail into a canvas element, 3 pixels a cell; `colour` is the player's. */
export function drawThumb(canvas, thumb, colour = '#c9a227') {
  const rows = String(thumb ?? '').split('/').filter(Boolean);
  if (!rows.length) return false;
  const k = 3;
  canvas.width = rows[0].length * k;
  canvas.height = rows.length * k;
  const g = canvas.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      g.fillStyle = ch === 'Y' ? colour : ch === '*' ? '#fff4d6' : PALETTE[ch] ?? '#cdbb8e';
      g.fillRect(x * k, y * k, k, k);
      if (ch === '*') { g.fillStyle = colour; g.fillRect(x * k + 1, y * k + 1, 1, 1); }
    }
  });
  return true;
}
