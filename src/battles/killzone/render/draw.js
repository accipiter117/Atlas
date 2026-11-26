// Drawing the Killzone platoon battle in Atlas (phase 19): the whole battle
// map at once, top down, in a pixel style: cover (trenches, ruins, walls,
// buildings) from the battle's own grid, objectives in their holder's colour,
// and every soldier as a small figure in his side's colour. The Killzone
// project has its own full renderer and art; this one is drawn in code so the
// game stays light. Reads the battle state; never changes it.

const COVER = ['#5f5b4c', '#3b3428', '#77716a', '#4a4036', '#8b877c', '#9a8b62', '#6d6a63'];

/** The map, once: a canvas the frame copies. scale = canvas pixels per world unit. */
export function drawGround(doc, map, scale) {
  const can = doc.createElement('canvas');
  can.width = Math.ceil(map.width * scale);
  can.height = Math.ceil(map.height * scale);
  const g = can.getContext('2d');
  g.fillStyle = COVER[0];
  g.fillRect(0, 0, can.width, can.height);
  const cs = map.cell * scale;
  for (let r = 0; r < map.rows; r += 1) {
    for (let c = 0; c < map.cols; c += 1) {
      const i = r * map.cols + c;
      const kind = map.grid[i];
      const elev = map.elev?.[i] ?? 0;
      if (kind === 0 && !elev && !map.wire?.[i] && !map.surf?.[i]) continue;
      let colour = kind ? COVER[kind] ?? COVER[0] : elev ? (elev > 1 ? '#7d7865' : '#6e6a58') : COVER[0];
      if (map.surf?.[i] === 3) colour = '#2d4552';
      else if (map.surf?.[i] === 2) colour = '#4f6670';
      else if (map.surf?.[i] === 1) colour = '#6f6b62';
      else if (map.surf?.[i] === 4) colour = '#4c4232';
      if (map.wire?.[i]) colour = '#2e2a24';
      g.fillStyle = colour;
      g.fillRect(Math.floor(c * cs), Math.floor(r * cs), Math.ceil(cs), Math.ceil(cs));
    }
  }
  return can;
}

/** One frame. opts: { ground, scale, colours: [side 0, side 1], selected (platoon id), playerSide }. */
export function drawBattle(g, state, opts) {
  const { scale } = opts;
  g.imageSmoothingEnabled = false;
  g.drawImage(opts.ground, 0, 0);
  // Objectives and other sites: a ring in the holder's colour, filling as it is taken.
  for (const s of state.sites) {
    const x = s.x * scale;
    const y = s.y * scale;
    const r = Math.max(4, (s.r ?? 60) * scale);
    g.strokeStyle = s.owner === null ? '#d8d2c0' : opts.colours[s.owner];
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    if (s.kind === 'objective' || s.kind === 'hq') {
      g.fillStyle = s.owner === null ? 'rgba(216, 210, 192, 0.35)' : opts.colours[s.owner];
      g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
    }
  }
  // Soldiers: the fallen as small dark marks, the living as figures.
  for (const s of state.soldiers) {
    if (s.fled && !s.alive) continue;
    const x = Math.round(s.x * scale);
    const y = Math.round(s.y * scale);
    if (!s.alive) { g.fillStyle = 'rgba(30, 20, 16, 0.55)'; g.fillRect(x - 2, y, 5, 2); continue; }
    const sq = state.squads[s.squad];
    const mine = state.platoons[sq.platoon];
    // A soldier: body in his side's colour, helmet (ISA light, Helghast dark with red eyes).
    g.fillStyle = '#111';
    g.fillRect(x - 3, y - 4, 6, 9);
    g.fillStyle = opts.colours[s.side];
    g.fillRect(x - 2, y - 1, 4, 5);
    g.fillStyle = s.side === 0 ? '#dfe7ef' : '#2a2a2a';
    g.fillRect(x - 2, y - 4, 4, 3);
    if (s.side === 1) { g.fillStyle = '#ff6a2a'; g.fillRect(x - 1, y - 3, 1, 1); g.fillRect(x + 1, y - 3, 1, 1); }
    if (mine.id === opts.selected) { g.fillStyle = '#fff4c8'; g.fillRect(x - 3, y + 6, 6, 1); }
  }
  // Each of your platoons' orders: a line to where it is going.
  for (const pl of state.platoons) {
    if (pl.side !== opts.playerSide || !pl.order || !Number.isFinite(pl.order.x)) continue;
    const members = pl.squads.flatMap((id) => state.squads[id].soldiers.map((sid) => state.soldiers[sid])).filter((s) => s.alive);
    if (!members.length) continue;
    const cx = members.reduce((n, s) => n + s.x, 0) / members.length;
    const cy = members.reduce((n, s) => n + s.y, 0) / members.length;
    g.strokeStyle = pl.id === opts.selected ? '#fff4c8' : 'rgba(255, 244, 200, 0.4)';
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(cx * scale, cy * scale);
    g.lineTo(pl.order.x * scale, pl.order.y * scale);
    g.stroke();
    g.setLineDash([]);
  }
}
