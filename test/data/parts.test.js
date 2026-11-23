import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, checkWhere, getPath, SelectorError } from '../../src/data/selectors.js';
import { substitute, resolveOptions, satisfies, OptionError } from '../../src/data/options.js';
import { t, formatText } from '../../src/data/text.js';
import { validateEntry } from '../../src/data/validate.js';
import { ENTRY_SCHEMAS, CONTENT_TYPES } from '../../src/data/schemas/index.js';
import { EFFECTS, effectSchema } from '../../src/data/effects-compile.js';

const unit = { id: 'a', era: 'classical', eraIndex: 1, tags: ['infantry', 'bow'], yields: { food: 2 } };

test('selectors: every operator', () => {
  assert.ok(matches(unit, { era: 'classical' }));
  assert.ok(matches(unit, { era: { eq: 'classical' } }));
  assert.ok(matches(unit, { era: { in: ['classical', 'medieval'] } }));
  assert.ok(matches(unit, { era: { notIn: ['ancient'] } }));
  assert.ok(matches(unit, { tags: { has: 'bow' } }));
  assert.ok(matches(unit, { tags: { has: ['bow', 'infantry'] } }));
  assert.ok(!matches(unit, { tags: { has: 'horse' } }));
  assert.ok(matches(unit, { eraIndex: { gt: 0, lt: 2 } }));
  assert.ok(matches(unit, { eraIndex: { gte: 1, lte: 1 } }));
  assert.ok(matches(unit, { 'yields.food': { gte: 2 } }));
  assert.ok(!matches(unit, { era: 'classical', eraIndex: { gt: 5 } }), 'all fields must match');
  assert.equal(getPath(unit, 'yields.food'), 2);
  assert.throws(() => checkWhere({ era: { near: 'x' } }), SelectorError);
  assert.throws(() => checkWhere({}), SelectorError);
});

test('options: substitution of whole values, entry fields and inside text', () => {
  const manifest = { options: [{ id: 'era', type: 'choice', source: 'eras', default: 'classical' }, { id: 'n', type: 'int', default: 3, min: 1, max: 9 }] };
  const content = { eras: { classical: { id: 'classical', index: 1 } } };
  const { values, problems } = resolveOptions(manifest, {}, content);
  assert.deepEqual(problems, []);
  assert.deepEqual(values, { era: 'classical', n: 3 });
  const out = substitute({ a: '$opt:era', b: '$opt:era.index', c: ['$opt:n'], d: 'turn $opt:n' }, manifest, values, content);
  assert.deepEqual(out, { a: 'classical', b: 1, c: [3], d: 'turn 3' });
  assert.throws(() => substitute('$opt:nope', manifest, values, content), OptionError);
  assert.equal(resolveOptions(manifest, { n: 50 }, content).problems[0].code, 'badOption');
});

test('engine version ranges', () => {
  assert.ok(satisfies('0.1.0', '>=0.1.0'));
  assert.ok(!satisfies('0.1.0', '>=1.0.0'));
  assert.ok(satisfies('1.2.3', '>=1.0.0 <2.0.0'));
  assert.ok(!satisfies('2.0.0', '>=1.0.0 <2.0.0'));
  assert.ok(satisfies('1.0.0', '1.0.0'));
  assert.ok(!satisfies('1.0.0', 'banana'));
});

test('text lookup with arguments; missing keys are visible, not fatal', () => {
  assert.equal(t({ a: 'Hello {name}' }, 'a', { name: 'Rome' }), 'Hello Rome');
  assert.equal(t({}, 'nope'), '[nope]');
  assert.equal(formatText('{a} and {b}', { a: 1 }), '1 and {b}');
});

test('there is a schema for every content type in section 4.1, and all 24 effects', () => {
  const planned = ['terrain', 'features', 'resources', 'mapSizes', 'mapTypes', 'units', 'unitClasses', 'promotions',
    'buildings', 'wonders', 'improvements', 'techs', 'civics', 'eras', 'governments', 'policies', 'beliefs', 'religions',
    'trade', 'espionage', 'diplomacy', 'factions', 'leaders', 'cityNames', 'events', 'victories', 'aiPersonalities', 'aiWeights',
    'tuning', 'text', 'skin'];
  assert.deepEqual([...CONTENT_TYPES].sort(), [...planned].sort());
  assert.equal(Object.keys(EFFECTS).length, 24);
  assert.equal(effectSchema('buildCharge'), null);
});

test('schema checks: types, ranges, required fields and effects', () => {
  const ok = validateEntry(ENTRY_SCHEMAS.units, { id: 'x', class: 'melee', strength: 10, moves: 2, cost: 30 });
  assert.deepEqual(ok, { errors: [], warnings: [] });
  const bad = validateEntry(ENTRY_SCHEMAS.units, { id: 'x', class: 'melee', strength: 'forty', moves: 0, abilities: [{ effect: 'yieldBonus', yield: 'gems' }] });
  const kinds = bad.errors.map((e) => `${e.path}:${e.kind}`);
  assert.deepEqual(kinds.sort(), ['abilities.0.amount:required', 'abilities.0.yield:enum', 'cost:required', 'moves:int', 'strength:int'].sort());
  const colour = validateEntry(ENTRY_SCHEMAS.religions, { id: 'r', colour: 'red' });
  assert.equal(colour.errors[0].kind, 'colour');
});
