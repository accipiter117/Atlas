import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createGame, cityYields, tileYields, itemCost, amenitiesFor, upkeepOf, adjacencyBonus, HANDLERS, currentFactionId, fingerprint } from '../../src/sim/index.js';
import { maxMoves } from '../../src/sim/units.js';
import { sightRange } from '../../src/sim/visibility.js';
import { healAmount } from '../../src/sim/unitCommands.js';
import { clone } from '../../src/core/clone.js';
import { ruleset, fixtureGame, play, passRound } from './fixtures.js';

const LAND = ['.......', '.hhf...', '..hF...', '.......', 'pp.....', '.......', '.......'];
const MID = 3 * 7 + 3;

/** Rules where Rome's only trait effects are the given ones (its leader's trait emptied). */
function rulesWith(effects) {
  const r = clone(ruleset);
  r.factions.rome.trait.effects = effects;
  r.leaders.trajan.trait.effects = [];
  return r;
}

function cityGame(rules = ruleset, rows = LAND, extra = []) {
  let s = fixtureGame(rows, [{ type: 'settler', at: MID }, ...extra], { rules });
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }, rules).state;
  return { s, city: Object.values(s.cities)[0] };
}

test('the registry has exactly the 14 phase 6 effect handlers', () => {
  assert.deepEqual(Object.keys(HANDLERS).sort(), ['amenityBonus', 'autoRoad', 'cityYieldPercent', 'costPercent', 'freeBuilding', 'freeUnit', 'growthPercent',
    'healBonus', 'moveBonus', 'sightBonus', 'tileYield', 'upkeepPercent', 'yieldBonus', 'yieldPercent']);
});

test('yieldBonus adds a flat yield where its scope reaches', () => {
  const plain = rulesWith([]);
  const bonus = rulesWith([{ effect: 'yieldBonus', yield: 'science', amount: 3, scope: 'capital' }]);
  const { s, city } = cityGame(plain);
  assert.equal(cityYields(s, bonus, city).total.science - cityYields(s, plain, city).total.science, 3);
});

test('yieldPercent and cityYieldPercent multiply after flat bonuses', () => {
  const plain = rulesWith([]);
  const { s, city } = cityGame(plain);
  const base = cityYields(s, plain, city).total.production;
  assert.equal(cityYields(s, rulesWith([{ effect: 'yieldPercent', yield: 'production', amount: 50 }]), city).total.production, base * 1.5);
  const timed = clone(s);
  timed.cities[city.id].timed = [{ effect: 'cityYieldPercent', yield: 'production', amount: -50, turns: 2 }];
  assert.equal(cityYields(timed, plain, timed.cities[city.id]).total.production, base * 0.5);
  const later = passRound(passRound(timed, plain), plain);
  assert.equal(later.cities[city.id].timed.length, 0, 'timed effects wear off');
});

test('tileYield adds to matching tiles only', () => {
  const rules = rulesWith([{ effect: 'tileYield', yield: 'gold', amount: 2, terrain: 'plains' }]);
  const { s } = cityGame(rules);
  const effects = [{ ...rules.factions.rome.trait.effects[0], scope: 'everyCity' }];
  assert.equal(tileYields(s, rules, 4 * 7 + 0, effects, 'f0').gold, 2, 'plains');
  assert.equal(tileYields(s, rules, 0, effects, 'f0').gold, 0, 'grassland');
});

test('costPercent makes matching items cheaper', () => {
  const rules = rulesWith([{ effect: 'costPercent', target: 'builder', amount: -25 }]);
  const { s, city } = cityGame(rules);
  assert.equal(itemCost(rules, { kind: 'unit', id: 'builder' }, s, city), Math.round(ruleset.units.builder.cost * 0.75));
  assert.equal(itemCost(rules, { kind: 'unit', id: 'settler' }, s, city), ruleset.units.settler.cost);
});

test('upkeepPercent cuts unit upkeep', () => {
  const extra = [{ type: 'warrior', at: 0 }, { type: 'warrior', at: 1 }, { type: 'warrior', at: 2 }, { type: 'warrior', at: 3 }, { type: 'warrior', at: 4 }];
  const plain = rulesWith([]);
  const cheap = rulesWith([{ effect: 'upkeepPercent', target: 'units', amount: -50 }]);
  const { s } = cityGame(plain, LAND, extra);
  // 5 warriors at 1 gold, 3 of upkeep free (2 + 1 for the city).
  assert.equal(upkeepOf(s, plain, 'f0').units, 2);
  assert.equal(upkeepOf(s, cheap, 'f0').units, 0, 'halved to 3 (rounded up), then the free 3');
});

test('growthPercent speeds growth', () => {
  const plain = rulesWith([]);
  const fast = rulesWith([{ effect: 'growthPercent', amount: 100 }]);
  const { s, city } = cityGame(plain);
  const a = passRound(s, plain).cities[city.id].food;
  const b = passRound(s, fast).cities[city.id].food;
  assert.ok(b > a && Math.abs(b - 2 * a) < 1e-9, `${a} then ${b}`);
});

test('amenityBonus raises amenities; thresholds change yields', () => {
  const plain = rulesWith([]);
  const happy = rulesWith([{ effect: 'amenityBonus', amount: 3 }]);
  const { s, city } = cityGame(plain);
  const c = s.cities[city.id];
  c.pop = 6;
  const sad = amenitiesFor(s, plain, 'f0')[c.id];
  assert.equal(sad.need, 3);
  assert.ok(sad.balance <= -1, `balance ${sad.balance}`);
  const glad = amenitiesFor(s, happy, 'f0')[c.id];
  assert.equal(glad.balance, sad.balance + 3);
  // Thresholds: +2 or more gives +10% yields; -1 to -2 gives -15% and slower growth.
  const rows = ruleset.tuning.amenities.thresholds;
  assert.equal(glad.threshold.yieldPercent, rows.find((r) => glad.balance >= r.atLeast).yieldPercent);
  const yHappy = cityYields(s, happy, c).total.production;
  const yPlain = cityYields(s, plain, c).total.production;
  assert.ok(yHappy > yPlain, 'a happy city makes more');
});

test('freeBuilding: Rome\'s new cities start with a monument', () => {
  const { city } = cityGame(ruleset);
  assert.ok(city.buildings.includes('monument'));
  assert.ok(city.buildings.includes('palace'), 'the capital gets its palace');
});

test('freeUnit: a building can grant units when built', () => {
  const rules = rulesWith([]);
  rules.buildings.barracks.effects = [{ effect: 'freeUnit', unit: 'warrior', count: 1 }];
  let { s, city } = cityGame(rules);
  s.factions[0].stocks.gold = 1000;
  s = play(s, { type: 'setProduction', faction: 'f0', city: city.id, item: { kind: 'building', id: 'barracks' } }, rules).state;
  const r = play(s, { type: 'buyItem', faction: 'f0', city: city.id }, rules);
  assert.ok(r.events.some((e) => e.type === 'unitBuilt' && e.unitType === 'warrior' && e.free));
});

test('moveBonus, sightBonus and healBonus change units', () => {
  const plain = rulesWith([]);
  const boosted = rulesWith([{ effect: 'moveBonus', amount: 1, domain: 'land' }, { effect: 'sightBonus', amount: 1 }, { effect: 'healBonus', amount: 5 }]);
  const { s } = cityGame(plain, LAND, [{ type: 'warrior', at: 0 }]);
  const w = s.units.u_0002;
  assert.equal(maxMoves(boosted, w, s), maxMoves(plain, w, s) + 1);
  assert.equal(sightRange(s, boosted, w), sightRange(s, plain, w) + 1);
  assert.equal(healAmount(s, boosted, w), healAmount(s, plain, w) + 5);
  const hurt = clone(s);
  hurt.units.u_0002.hp = 50;
  const after = passRound(hurt, plain);
  assert.equal(after.units.u_0002.hp, 50 + healAmount(hurt, plain, hurt.units.u_0002), 'a resting unit heals');
});

test('autoRoad joins new cities to the capital', () => {
  const rows = ['............', '............', '............', '............', '............'];
  let s = fixtureGame(rows, [{ type: 'settler', at: 13 }, { type: 'settler', at: 21 }]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  const r = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0002' });
  assert.ok(r.events.some((e) => e.type === 'roadBuilt'));
  assert.ok(r.state.map.road[13] && r.state.map.road[21]);
});

test('adjacency counts matching tiles: a library gets +1 science per 2 mountains in the city\'s land', () => {
  // Three mountains in the ring around the city at (3, 3).
  const rows = ['.......', '.......', '...mm..', '.......', '...m...', '.......', '.......'];
  const { s, city } = cityGame(ruleset, rows);
  const c = s.cities[city.id];
  // The city owns its ring; count the mountains in it.
  const mountain = s.map.terrainIds.indexOf('mountain');
  const owned = s.owner.map((o, i) => (o === c.id && i !== c.tile && s.map.terrain[i] === mountain ? 1 : 0)).reduce((a, b) => a + b, 0);
  c.buildings.push('library');
  const [lib] = adjacencyBonus(s, ruleset, c, 'library');
  assert.equal(lib.count, owned);
  assert.equal(lib.amount, Math.floor(owned / 2));
  const [obs] = adjacencyBonus(s, ruleset, c, 'observatory');
  assert.ok(obs.count >= owned, 'the observatory counts mountains next to the city');
});

test('wonders are one per world; the loser gets its production back as gold', () => {
  const rows = ['............', '............', '............', '............', '............', '............'];
  let s = fixtureGame(rows, [{ type: 'settler', at: 13 }, { type: 'settler', faction: 'f1', at: 4 * 12 + 9 }]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  s = passRound(s);
  s = play(s, { type: 'endTurn', faction: 'f0' }).state;
  s = play(s, { type: 'foundCity', faction: 'f1', unit: 'u_0002' }).state;
  const [a, b] = Object.values(s.cities);
  s.cities[b.id].queue = [{ kind: 'wonder', id: 'stonehenge' }];
  s.cities[b.id].progress = 40;
  s.cities[a.id].queue = [{ kind: 'wonder', id: 'stonehenge' }];
  s.cities[a.id].progress = 179;
  const goldBefore = s.factions[1].stocks.gold;
  // One full round: each city's production is added at the start of its owner's turn; Rome's finishes first.
  s = play(s, { type: 'endTurn', faction: 'f1' }).state;
  const all = passRound(s);
  assert.equal(all.wondersBuilt.stonehenge, a.id);
  assert.ok(all.cities[a.id].buildings.includes('stonehenge'));
  assert.ok(!all.cities[b.id].queue.some((q) => q.id === 'stonehenge'));
  assert.ok(all.factions[1].stocks.gold >= goldBefore + 40, 'refunded as gold');
  const again = applyCommand(all, { type: 'setProduction', faction: currentFactionId(all), city: currentFactionId(all) === 'f0' ? a.id : b.id, item: { kind: 'wonder', id: 'stonehenge' } }, ruleset);
  assert.equal(again.ok, false, 'nobody can start it again');
});

function bankruptGame() {
  const extra = Array.from({ length: 8 }, (_, k) => ({ type: 'warrior', at: k }));
  const { s } = cityGame(ruleset, LAND, extra);
  s.factions[0].stocks.gold = 9;
  return s;
}

test('bankruptcy: warned two turns ahead, then a unit disbands, the same one every time', () => {
  const run = () => {
    let s = bankruptGame();
    const events = [];
    for (let k = 0; k < 6; k += 1) {
      const me = currentFactionId(s);
      do {
        const r = play(s, { type: 'endTurn', faction: currentFactionId(s) });
        s = r.state;
        events.push(...r.events.filter((e) => e.faction === 'f0'));
      } while (currentFactionId(s) !== me);
    }
    return { s, events };
  };
  const a = run();
  const b = run();
  const warn = a.events.findIndex((e) => e.type === 'goldWarning');
  const gone = a.events.findIndex((e) => e.type === 'unitDisbanded' && e.reason === 'bankrupt');
  assert.ok(warn >= 0 && gone > warn, 'a warning comes before the first disbanding');
  assert.ok(a.events.filter((e) => e.type === 'goldWarning').some((e) => e.turns === 2), 'two turns ahead');
  assert.equal(fingerprint(a.s), fingerprint(b.s));
  assert.deepEqual(a.events.filter((e) => e.reason === 'bankrupt').map((e) => e.unit), b.events.filter((e) => e.reason === 'bankrupt').map((e) => e.unit));
  assert.ok(a.s.factions[0].stocks.gold >= 0, 'gold never stays below zero');
});

test('a builder farms: food goes up, a charge is spent, and the last charge uses it up', () => {
  let { s, city } = cityGame(ruleset, LAND, [{ type: 'builder', at: MID - 1 }]);
  const tile = MID - 1;
  const before = tileYields(s, ruleset, tile).food;
  assert.equal(s.units.u_0002.charges, 3);
  s = play(s, { type: 'buildImprovement', faction: 'f0', unit: 'u_0002', improvement: 'farm' }).state;
  assert.equal(tileYields(s, ruleset, tile).food, before + 1);
  assert.equal(s.units.u_0002.charges, 2);
  const refuse = (cmd) => applyCommand(s, cmd, ruleset).error?.code;
  assert.equal(refuse({ type: 'buildImprovement', faction: 'f0', unit: 'u_0002', improvement: 'farm' }), 'noMoves');
  s = passRound(s);
  assert.equal(refuse({ type: 'buildImprovement', faction: 'f0', unit: 'u_0002', improvement: 'farm' }), 'alreadyBuilt');
  assert.equal(refuse({ type: 'buildImprovement', faction: 'f0', unit: 'u_0002', improvement: 'mine' }), 'needsHills');
  assert.equal(refuse({ type: 'buildImprovement', faction: 'f0', unit: 'u_0002', improvement: 'plantation' }), 'needsResource');
  s.units.u_0002.charges = 1;
  s.map.improvement[tile] = -1;
  const r = play(s, { type: 'buildImprovement', faction: 'f0', unit: 'u_0002', improvement: 'farm' });
  assert.equal(r.state.units.u_0002, undefined, 'used up');
  assert.ok(city);
});

test('every base faction starts a game cleanly and its trait shows in the numbers', () => {
  for (const civ of Object.keys(ruleset.factions)) {
    const s = createGame(ruleset, { seed: 4, players: [{ kind: 'human', faction: civ }, { kind: 'ai' }], map: { size: 'small', type: 'continents' } });
    assert.equal(s.factions[0].civ, civ);
    const settler = Object.values(s.units).find((u) => u.faction === 'f0' && u.type === 'settler');
    const me = s.seatOrder[0] === 'f0' ? s : (() => { let x = s; x = play(x, { type: 'endTurn', faction: x.seatOrder[0] }).state; return x; })();
    const r = applyCommand(me, { type: 'foundCity', faction: 'f0', unit: settler.id }, ruleset);
    assert.equal(r.ok, true, `${civ}: ${r.error?.code}`);
    const city = Object.values(r.state.cities)[0];
    const y = cityYields(r.state, ruleset, city);
    assert.ok(Number.isFinite(y.total.food) && y.total.production >= 1, civ);
    if (civ === 'rome') assert.ok(city.buildings.includes('monument'));
    if (civ === 'greece') assert.ok(y.sources.some((x) => x.kind === 'effects' && x.yields.culture >= 1));
  }
});
