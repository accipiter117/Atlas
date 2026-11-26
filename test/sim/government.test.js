// Phase 11: civics, governments and policy cards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleset, fixtureGame, play, passRound } from './fixtures.js';
import { applyCommand, costOf, cityYields, slotsOf, researchOf, knows, itemCost } from '../../src/sim/index.js';
import { addResearch, applyBoosts } from '../../src/sim/progression.js';

const ROWS = ['........', '........', '........', '........'];
const f0 = (s) => s.factions.find((f) => f.id === 'f0');

/** f0 with a capital (so a palace and its wildcard slot), knowing the given civics. */
function withCapital(civics = []) {
  let s = fixtureGame(ROWS, [{ type: 'settler', at: 9 }, { type: 'warrior', faction: 'f1', at: 30 }]);
  s = play(s, { type: 'foundCity', faction: 'f0', unit: 'u_0001' }).state;
  researchOf(f0(s), 'civics').known.push(...civics);
  return s;
}
const capital = (s) => Object.values(s.cities).find((c) => c.faction === 'f0');
const refused = (s, cmd) => { const r = applyCommand(s, cmd, ruleset); return r.ok ? null : r.error.code; };

test('civic costs follow data, era and speed; culture fills the civics tree', () => {
  const s = withCapital();
  assert.equal(costOf(s, ruleset, 'code_of_laws', 'civics'), ruleset.civics.code_of_laws.cost);
  s.setup = { ...s.setup, speed: 'epic' };
  assert.equal(costOf(s, ruleset, 'code_of_laws', 'civics'), Math.round(ruleset.civics.code_of_laws.cost * ruleset.tuning.speeds.epic));
  s.setup = { ...s.setup, speed: 'standard' };
  researchOf(f0(s), 'civics').current = 'code_of_laws';
  const events = [];
  addResearch(s, ruleset, 'f0', 25, events, 'civics');
  assert.ok(knows(s, 'f0', 'code_of_laws', 'civics'));
  assert.ok(events.some((e) => e.type === 'civicLearned' && e.item === 'code_of_laws'));
  assert.ok(!knows(s, 'f0', 'code_of_laws'), 'techs are a separate tree');
});

test('civic boosts pay their share, separately from tech boosts', () => {
  const s = withCapital();
  const events = [{ type: 'cityFounded', faction: 'f0' }, { type: 'cityFounded', faction: 'f0' }];
  applyBoosts(s, ruleset, events, 'civics');
  const boosted = events.filter((e) => e.type === 'boost' && e.tree === 'civics').map((e) => e.item);
  assert.ok(boosted.includes('foreign_trade'));
  assert.equal(researchOf(f0(s), 'civics').progress.foreign_trade, Math.round(costOf(s, ruleset, 'foreign_trade', 'civics') * ruleset.tuning.progression.boostShare));
});

test('slot counts per government, plus the palace wildcard', () => {
  const s = withCapital();
  for (const [id, gov] of Object.entries(ruleset.governments)) {
    const slots = slotsOf(s, ruleset, 'f0', id);
    for (const kind of ['military', 'economic', 'diplomatic']) assert.equal(slots[kind], gov.slots[kind] ?? 0, `${id} ${kind}`);
    assert.equal(slots.wildcard, (gov.slots.wildcard ?? 0) + 1, `${id} wildcard (with the palace)`);
  }
  assert.deepEqual(slotsOf(s, ruleset, 'f0', null), { military: 0, economic: 0, diplomatic: 0, wildcard: 0 });
});

test('a government needs its civic, and takes effect at the start of your next turn', () => {
  let s = withCapital();
  assert.equal(refused(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }), 'governmentLocked');
  researchOf(f0(s), 'civics').known.push('code_of_laws');
  s = play(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }).state;
  assert.equal(f0(s).government.id, null, 'not yet');
  assert.equal(f0(s).pendingGovernment.id, 'chiefdom');
  assert.equal(refused(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }), 'alreadyGovernment');
  s = passRound(s);
  assert.equal(f0(s).government.id, 'chiefdom');
  assert.equal(f0(s).pendingGovernment, null);
});

test('card rules: right slot type (any in a wildcard), unlocked, not twice, slot exists', () => {
  let s = withCapital(['code_of_laws', 'craftsmanship', 'military_tradition']);
  s = play(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }).state;
  s = passRound(s);
  const setP = (slot, index, policy) => ({ type: 'setPolicy', faction: 'f0', slot, index, policy });
  assert.equal(refused(s, setP('military', 0, 'urban_planning')), 'wrongSlot');
  assert.equal(refused(s, setP('military', 0, 'conscription')), 'policyLocked');
  assert.equal(refused(s, setP('military', 1, 'discipline')), 'noSuchSlot');
  assert.equal(refused(s, setP('diplomatic', 0, 'discipline')), 'noSuchSlot');
  s = play(s, setP('military', 0, 'agoge')).state;
  s = play(s, setP('wildcard', 0, 'urban_planning')).state;
  assert.equal(refused(s, setP('economic', 0, 'urban_planning')), 'alreadySlotted');
  s = play(s, setP('economic', 0, 'skilled_labour')).state;
  assert.equal(refused(s, setP('banana', 0, 'agoge')), 'unknownSlot');
});

test('card effects stack, and come off cleanly when swapped (from your next turn)', () => {
  let s = withCapital(['code_of_laws']);
  const prod = (st) => cityYields(st, ruleset, capital(st)).total.production;
  const settlerCost = (st) => itemCost(ruleset, { kind: 'unit', id: 'settler' }, st, capital(st));
  const base = prod(s);
  const baseGold = cityYields(s, ruleset, capital(s)).total.gold;
  s = play(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }).state;
  s = play(s, { type: 'setPolicy', faction: 'f0', slot: 'economic', index: 0, policy: 'urban_planning' }).state;
  s = play(s, { type: 'setPolicy', faction: 'f0', slot: 'wildcard', index: 0, policy: 'god_king' }).state;
  assert.equal(prod(s), base, 'nothing changes this turn');
  s = passRound(s);
  assert.equal(prod(s), base + 1, 'Urban Planning: +1 production');
  assert.equal(cityYields(s, ruleset, capital(s)).total.gold, baseGold + 1, 'God King stacks: +1 gold in the capital');
  // Swap Urban Planning out for Colonisation (needs Early Empire).
  researchOf(f0(s), 'civics').known.push('foreign_trade', 'early_empire');
  const before = settlerCost(s);
  s = play(s, { type: 'setPolicy', faction: 'f0', slot: 'economic', index: 0, policy: 'colonisation' }).state;
  assert.equal(prod(s), base + 1, 'still on until next turn');
  s = passRound(s);
  assert.equal(prod(s), base, 'Urban Planning is gone');
  assert.equal(settlerCost(s), Math.round(before / 2), 'Colonisation halves settlers');
  assert.equal(cityYields(s, ruleset, capital(s)).total.gold, baseGold + 1, 'God King stays');
});

test('changing government means anarchy until your next turn; cards that fit come along', () => {
  let s = withCapital(['code_of_laws', 'craftsmanship', 'state_workforce', 'foreign_trade', 'early_empire', 'political_philosophy']);
  const prod = (st) => cityYields(st, ruleset, capital(st)).total.production;
  s = play(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }).state;
  s = play(s, { type: 'setPolicy', faction: 'f0', slot: 'economic', index: 0, policy: 'urban_planning' }).state;
  s = passRound(s);
  const withCard = prod(s);
  s = play(s, { type: 'setGovernment', faction: 'f0', government: 'autocracy' }).state;
  assert.equal(f0(s).government.anarchy, true);
  assert.equal(prod(s), withCard - 1, 'anarchy: no cards');
  s = passRound(s);
  assert.equal(f0(s).government.id, 'autocracy');
  assert.deepEqual(f0(s).government.policies.economic, ['urban_planning'], 'the card came along');
  assert.equal(prod(s), withCard + 2, 'Autocracy: +2 production in the capital');
});

test('Frontier Grants makes borders grow faster (borderGrowthPercent)', () => {
  let s = withCapital(['code_of_laws', 'foreign_trade', 'early_empire']);
  s = play(s, { type: 'setGovernment', faction: 'f0', government: 'chiefdom' }).state;
  s = play(s, { type: 'setPolicy', faction: 'f0', slot: 'economic', index: 0, policy: 'frontier_grants' }).state;
  s = passRound(s);
  const c = capital(s);
  const before = c.culture;
  const plain = withCapital();
  const p0 = capital(plain).culture;
  const s2 = passRound(s);
  const p2 = passRound(plain);
  const grown = capital(s2).culture - before;
  const grownPlain = capital(p2).culture - p0;
  if (grownPlain > 0 && capital(s2).tilesClaimed === c.tilesClaimed) assert.ok(Math.abs(grown - grownPlain * 1.5) < 1e-9, `${grown} vs ${grownPlain}`);
});

test('the AI never slots an invalid card, and adopts governments', async () => {
  const { aiGame } = await import('../ai/harness.js');
  const g = aiGame(ruleset, { seed: 11, turns: 120, speed: 'quick' });
  assert.deepEqual(g.refusals, []);
  let governments = 0;
  for (const f of g.state.factions) {
    const gov = f.government;
    if (!gov?.id) continue;
    governments += 1;
    const slots = slotsOf(g.state, ruleset, f.id, gov.id);
    const seen = new Set();
    for (const [kind, list] of Object.entries(gov.policies)) {
      assert.ok(list.length <= slots[kind], `${f.id} ${kind}: ${list.length} cards in ${slots[kind]} slots`);
      for (const id of list) {
        assert.ok(ruleset.policies[id], id);
        assert.ok(kind === 'wildcard' || ruleset.policies[id].slot === kind, `${id} in ${kind}`);
        assert.ok(knows(g.state, f.id, ruleset.policies[id].requires.civic, 'civics'), `${id} unlocked`);
        assert.ok(!seen.has(id), `${id} twice`);
        seen.add(id);
      }
    }
  }
  assert.ok(governments >= 3, `only ${governments} factions have a government by turn 120`);
});
