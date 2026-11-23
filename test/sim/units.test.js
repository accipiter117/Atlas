import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, findPath, enterCost, view, fingerprint, createGame, currentFactionId, idleUnits, VISIBLE, EXPLORED, UNEXPLORED } from '../../src/sim/index.js';
import { clone } from '../../src/core/clone.js';
import { createRng } from '../../src/core/rng.js';
import { spiral } from '../../src/core/hex.js';
import { tileHex, tileIndex } from '../../src/sim/map.js';
import { ruleset, fixtureGame, at, addRiver, play, passRound } from './fixtures.js';

const OPEN = ['........', '........', '........', '........', '........'];

test('movement costs from data: flat 1, hills 2, forest 2, forest on hills 3', () => {
  const s = fixtureGame(['.hfF....', '........'], []);
  const m = s.map;
  assert.equal(enterCost(s, ruleset, at(m, 0, 1), at(m, 0, 0)).cost, 1);
  assert.equal(enterCost(s, ruleset, at(m, 0, 0), at(m, 1, 0)).cost, 2);
  assert.equal(enterCost(s, ruleset, at(m, 1, 0), at(m, 2, 0)).cost, 2);
  assert.equal(enterCost(s, ruleset, at(m, 2, 0), at(m, 3, 0)).cost, 3);
});

test('a warrior three tiles away arrives over the right number of turns, carrying on by itself', () => {
  let s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }]);
  const target = at(s.map, 3, 0);
  const plan = findPath(s, ruleset, s.units.u_0001, target);
  assert.deepEqual(plan.tiles, [at(s.map, 1, 0), at(s.map, 2, 0), target]);
  assert.equal(plan.arrivesOnTurn, 1, 'two moves a turn: three tiles takes two turns');
  assert.deepEqual(plan.ends, [at(s.map, 2, 0), target]);
  const r = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: target });
  s = r.state;
  assert.equal(s.units.u_0001.tile, at(s.map, 2, 0));
  assert.equal(s.units.u_0001.goto, target);
  assert.deepEqual(r.events.find((e) => e.type === 'unitMoved').path, [0, 1, 2]);
  s = passRound(s);
  assert.equal(s.units.u_0001.tile, target, 'finished the walk at the start of its next turn');
  assert.equal(s.units.u_0001.goto, null);
  assert.equal(s.units.u_0001.moves, 1);
});

test('forests and hills slow units; full movement may always enter one tile', () => {
  let s = fixtureGame(['.F......', '........'], [{ type: 'warrior', at: 0 }]);
  s = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: 1 }).state;
  assert.equal(s.units.u_0001.tile, 1, 'cost 3 with 2 moves: allowed because moves were full');
  assert.equal(s.units.u_0001.moves, 0);
  let t = fixtureGame(['..f.....', '........'], [{ type: 'warrior', at: 0 }]);
  t = play(t, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: 2 }).state;
  assert.equal(t.units.u_0001.tile, 1, 'one move left is not enough for the forest');
  assert.equal(t.units.u_0001.goto, 2);
});

test('crossing a river uses all remaining movement', () => {
  const s0 = fixtureGame(OPEN, [{ type: 'scout', at: 0 }]);
  // The corner tile's only two neighbours are across the river, so the scout must cross.
  addRiver(s0.map, 0, 1);
  addRiver(s0.map, 0, at(s0.map, 0, 1));
  const s = play(s0, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: 1 }).state;
  assert.equal(s.units.u_0001.tile, 1);
  assert.equal(s.units.u_0001.moves, 0, 'three moves, all spent on the crossing');
});

// A two-hex-wide corridor between mountains; any way east passes next to the enemy at (4, 1).
const CORRIDOR = ['mmmmmmmm', '........', '........', 'mmmmmmmm'];

test('zone of control: entering a hex next to an enemy combat unit stops movement; cavalry ignore it', () => {
  let s = fixtureGame(CORRIDOR, [{ type: 'scout', at: at({ width: 8 }, 0, 2) }, { type: 'warrior', faction: 'f1', at: at({ width: 8 }, 4, 1) }]);
  const target = at(s.map, 7, 2);
  s = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: target }).state;
  assert.equal(s.units.u_0001.tile, at(s.map, 3, 2), 'three moves along open ground');
  s = passRound(s);
  assert.equal(s.units.u_0001.tile, at(s.map, 4, 2), 'stopped on entering the enemy\'s zone');
  assert.equal(s.units.u_0001.moves, 0);
  assert.equal(s.units.u_0001.goto, target, 'still heading there');

  const rules = clone(ruleset);
  rules.units.horseman = { ...rules.units.scout, id: 'horseman', class: 'cavalry', moves: 4, strength: 36 };
  let h = fixtureGame(CORRIDOR, [{ type: 'horseman', at: at({ width: 8 }, 0, 2) }, { type: 'warrior', faction: 'f1', at: at({ width: 8 }, 4, 1) }], { rules });
  h = play(h, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: target }, rules).state;
  assert.equal(h.units.u_0001.tile, at(h.map, 4, 2));
  h = passRound(h, rules);
  assert.equal(h.units.u_0001.tile, target, 'cavalry ride straight past');
});

test('pathfinding never routes through impassable hexes, and finds the gap', () => {
  const walled = ['..m.....', '..m.....', '..m.....', '..m.....', '..m.....'];
  const s = fixtureGame(walled, [{ type: 'warrior', at: 0 }]);
  assert.equal(findPath(s, ruleset, s.units.u_0001, at(s.map, 4, 0)), null);
  const gap = ['..m.....', '..m.....', '........', '..m.....', '..m.....'];
  const g = fixtureGame(gap, [{ type: 'warrior', at: 0 }]);
  const plan = findPath(g, ruleset, g.units.u_0001, at(g.map, 4, 0));
  assert.ok(plan);
  const mountain = Object.keys(ruleset.terrain).indexOf('mountain');
  assert.ok(plan.tiles.every((t) => g.map.terrain[t] !== mountain));
  assert.ok(plan.tiles.includes(at(g.map, 2, 2)));
  // Land units never path over water.
  const sea = fixtureGame(['..~.....', '..~.....', '..~.....', '..~.....', '..~.....'], [{ type: 'warrior', at: 0 }]);
  assert.equal(findPath(sea, ruleset, sea.units.u_0001, at(sea.map, 4, 0)), null);
});

test('stacking: one combat unit and one civilian per tile; never into an enemy tile', () => {
  const s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'warrior', at: 1 }, { type: 'settler', at: 2 }, { type: 'warrior', faction: 'f1', at: 4 }]);
  const refused = applyCommand(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: 1 }, ruleset);
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'noPath');
  const ok = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0002', to: 2 }).state;
  assert.equal(ok.units.u_0002.tile, 2, 'combat unit joins a civilian');
  const enemy = applyCommand(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0003', to: 4 }, ruleset);
  assert.equal(enemy.error.code, 'noPath');
  // Passing through a friendly unit is fine.
  const pass = fixtureGame(['........'], [{ type: 'scout', at: 0 }, { type: 'warrior', at: 1 }]);
  assert.equal(play(pass, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: 2 }).state.units.u_0001.tile, 2);
});

test('visibility: moving reveals tiles, old ones turn grey, mountains hide what lies behind', () => {
  const rows = ['............', '............', '............', '............', '............'];
  let s = fixtureGame(rows, [{ type: 'warrior', at: 0 }], { fog: true });
  const fog = () => s.fog.f0;
  assert.equal(fog()[0], VISIBLE);
  assert.equal(fog()[at(s.map, 5, 0)], UNEXPLORED);
  s = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: at(s.map, 2, 0) }).state;
  assert.equal(fog()[at(s.map, 4, 0)], VISIBLE);
  s = passRound(s);
  s = play(s, { type: 'moveUnit', faction: 'f0', unit: 'u_0001', to: at(s.map, 4, 0) }).state;
  assert.equal(fog()[0], EXPLORED, 'seen before, out of sight now');

  const ridge = fixtureGame(['.m..........', '............'], [{ type: 'warrior', at: 0 }], { fog: true });
  assert.equal(ridge.fog.f0[1], VISIBLE, 'the mountain itself is seen');
  assert.equal(ridge.fog.f0[2], UNEXPLORED, 'what lies behind it is not');
  const hill = fixtureGame(['h...........', '............'], [{ type: 'warrior', at: 0 }], { fog: true });
  assert.equal(hill.fog.f0[3], VISIBLE, 'hills add one to sight');
});

test('view never leaks unseen tiles or units (poison test)', () => {
  const rows = ['............', '............', '............', '............', '............'];
  const s = fixtureGame(rows, [{ type: 'warrior', at: 0 }, { type: 'warrior', faction: 'f1', at: at({ width: 12 }, 11, 4) }], { fog: true });
  const POISON = 987654;
  s.fog.f0.forEach((v, i) => {
    if (v === UNEXPLORED) {
      s.map.terrain[i] = POISON; s.map.feature[i] = POISON; s.map.resource[i] = POISON; s.map.river[i] = POISON; s.map.hills[i] = POISON; s.map.road[i] = POISON;
    }
  });
  s.units.u_0002.secretPlan = 'invade';
  const v = view(s, 'f0');
  const text = JSON.stringify(v);
  assert.ok(!text.includes(String(POISON)), 'no hidden tile data');
  assert.ok(!text.includes('invade') && !v.units.some((u) => u.faction === 'f1'), 'no hidden units');
  // A visible enemy shows only its outside.
  s.units.u_0002.tile = 2;
  const seen = view(s, 'f0').units.find((u) => u.faction === 'f1');
  assert.deepEqual(Object.keys(seen).sort(), ['faction', 'hp', 'id', 'tile', 'type']);
});

test('fortify, skip, sleep, wake and disband; refusals name the reason', () => {
  let s = fixtureGame(OPEN, [{ type: 'warrior', at: 0 }, { type: 'settler', at: 1 }, { type: 'scout', faction: 'f1', at: 20 }]);
  const refuse = (cmd) => applyCommand(s, cmd, ruleset).error?.code;
  assert.equal(refuse({ type: 'fortify', faction: 'f0', unit: 'u_0002' }), 'cannotFortify');
  assert.equal(refuse({ type: 'skip', faction: 'f0', unit: 'u_0003' }), 'notYourUnit');
  assert.equal(refuse({ type: 'skip', faction: 'f0', unit: 'u_9999' }), 'unknownUnit');
  assert.equal(refuse({ type: 'wake', faction: 'f0', unit: 'u_0001' }), 'notAsleep');
  assert.equal(refuse({ type: 'skip', faction: 'f1', unit: 'u_0003' }), 'notYourTurn');
  assert.equal(refuse({ type: 'moveUnit', faction: 'f0', unit: 'u_0001' }), 'badTarget');

  assert.equal(idleUnits(s, 'f0').length, 2);
  s = play(s, { type: 'fortify', faction: 'f0', unit: 'u_0001' }).state;
  s = play(s, { type: 'sleep', faction: 'f0', unit: 'u_0002' }).state;
  assert.equal(idleUnits(s, 'f0').length, 0);
  s = passRound(passRound(s));
  assert.equal(s.units.u_0001.fortifiedTurns, 2);
  assert.equal(s.units.u_0002.activity, 'sleep', 'sleeping lasts until woken');
  s = play(s, { type: 'wake', faction: 'f0', unit: 'u_0002' }).state;
  s = play(s, { type: 'skip', faction: 'f0', unit: 'u_0002' }).state;
  assert.equal(s.units.u_0002.activity, 'skip');
  s = passRound(s);
  assert.equal(s.units.u_0002.activity, 'none', 'a skip lasts one turn');
  const r = play(s, { type: 'disband', faction: 'f0', unit: 'u_0002' });
  assert.equal(r.state.units.u_0002, undefined);
  assert.equal(r.events[0].type, 'unitDisbanded');
});

test('starting units from eras.json stand at each start', () => {
  const s = createGame(ruleset, { seed: 21, players: [{ kind: 'human' }, { kind: 'ai' }, { kind: 'ai' }], map: { size: 'small', type: 'pangaea' } });
  for (const [n, f] of s.factions.entries()) {
    const mine = Object.values(s.units).filter((u) => u.faction === f.id);
    assert.deepEqual(mine.map((u) => u.type).sort(), ['builder', 'settler', 'warrior']);
    const start = s.map.starts[n];
    assert.ok(mine.find((u) => u.type === 'settler').tile === start);
    assert.ok(mine.find((u) => u.type === 'warrior').tile === start, 'a warrior guards the settler');
    assert.notEqual(mine.find((u) => u.type === 'builder').tile, start, 'two civilians cannot share');
    assert.equal(s.fog[f.id][start], VISIBLE);
  }
});

/** Play `turns` rounds where every unit tries a random reachable destination. Returns the final state and log. */
function randomGame(seed, turns) {
  const setup = { seed, players: [{ kind: 'human' }, { kind: 'ai' }, { kind: 'ai' }], map: { size: 'small', type: 'continents' } };
  let s = createGame(ruleset, setup);
  const rng = createRng(seed * 31 + 7);
  const log = [];
  const doCmd = (cmd) => {
    const r = applyCommand(s, cmd, ruleset);
    if (r.ok) { s = r.state; log.push(cmd); }
  };
  for (let n = 0; n < turns * s.factions.length; n += 1) {
    const f = currentFactionId(s);
    for (const u of Object.values(s.units).filter((x) => x.faction === f)) {
      const roll = rng.next();
      if (roll < 0.75) {
        const near = spiral(tileHex(s.map, u.tile), 4).map((h) => tileIndex(s.map, h.q, h.r)).filter((t) => t >= 0);
        doCmd({ type: 'moveUnit', faction: f, unit: u.id, to: rng.pick(near) });
      }
      else if (roll < 0.85) doCmd({ type: 'fortify', faction: f, unit: u.id });
      else if (roll < 0.95) doCmd({ type: 'skip', faction: f, unit: u.id });
      else if (roll < 0.97) doCmd({ type: 'sleep', faction: f, unit: u.id });
    }
    doCmd({ type: 'endTurn', faction: f });
  }
  return { s, log, setup };
}

test('100 turns of random legal moves stay deterministic and replay exactly', () => {
  const a = randomGame(5, 100);
  const b = randomGame(5, 100);
  assert.equal(fingerprint(a.s), fingerprint(b.s));
  assert.equal(a.s.turn, 101);
  assert.ok(a.log.filter((c) => c.type === 'moveUnit').length > 100, 'units really moved');
  let replay = createGame(ruleset, a.setup);
  for (const cmd of a.log) replay = applyCommand(replay, cmd, ruleset).state;
  assert.equal(fingerprint(replay), fingerprint(a.s));
  // Rules hold throughout: no two units of one kind share a tile, nobody on water or mountains.
  const seen = new Set();
  for (const u of Object.values(a.s.units)) {
    const key = `${u.tile}:${ruleset.unitClasses[ruleset.units[u.type].class].civilian ? 'c' : 'm'}`;
    assert.ok(!seen.has(key), `two units stacked on ${u.tile}`);
    seen.add(key);
    const t = ruleset.terrain[a.s.map.terrainIds[a.s.map.terrain[u.tile]]];
    assert.ok(!t.water && !t.impassable);
  }
});
