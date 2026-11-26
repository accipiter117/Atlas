import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, loadReal, engineText, codes, fixtureMods } from './helpers.js';
import { formatMessage } from '../../src/data/report.js';
import { loadRuleset, sortMods } from '../../src/data/loader.js';

// Scenarios that between them must produce every report message in text/engine.en-GB.json.
const SCENARIOS = [
  { sel: ['fx-base', 'fx-ops'], expect: ['duplicateId', 'missingId', 'missingField', 'badOperation', 'missingIdField', 'badSelector', 'noMatch', 'modSummary'] },
  { sel: ['fx-base', 'fx-bad-content'], expect: ['schema', 'badReference', 'unknownField', 'refTypeMissing', 'missingText'] },
  { sel: ['fx-base', 'fx-bad-files'], expect: ['badJson', 'missingFile', 'badFile', 'unknownContentType', 'badText', 'tuningValuesNotRuleset', 'missingSetting', 'contentTypeMissing'] },
  { sel: ['fx-base', 'fx-needs-missing'], expect: ['missingDependency'] },
  { sel: ['fx-base', 'fx-conv-a', 'fx-conv-b'], expect: ['twoConversions'] },
  { sel: ['fx-base', 'fx-ops', 'fx-incompat'], expect: ['incompatible'] },
  { sel: ['fx-base', 'fx-ruleset-2'], expect: ['twoRulesets'] },
  { sel: ['fx-ops'], expect: ['noRuleset'] },
  { sel: ['fx-base', 'fx-cycle-a', 'fx-cycle-b'], expect: ['dependencyCycle'] },
  { sel: ['fx-base', 'fx-engine', 'fx-dep-failed'], expect: ['engineVersion', 'dependencyFailed'] },
  { sel: ['fx-base', 'fx-bad-manifest'], expect: ['badManifest'] },
  { sel: ['fx-base', 'fx-after', 'fx-ops'], expect: ['reordered'] },
  { sel: ['fx-base', 'fx-balance-a', 'fx-balance-b'], expect: ['lastOneWins'] },
  { sel: ['fx-ghost', 'fx-base'], expect: ['unknownMod'] },
  { sel: ['fx-base', 'fx-lock'], options: { 'fx-lock': { era: 'atlantis' } }, expect: ['badOption'] },
  { sel: ['fx-base', 'fx-bad-option-use'], expect: ['unknownOption'] },
  { sel: ['fx-base', 'fx-option-source'], expect: ['optionSourceMissing'] },
  { sel: ['fx-base', 'fx-remove-iron'], expect: ['badReference'] },
];

test('every message type in the report is produced by a fixture', async () => {
  const text = await engineText();
  const all = Object.keys(text)
    .filter((k) => k.startsWith('report.') && !/^report\.(count|then|change|summary\.)/.test(k))
    .map((k) => k.slice('report.'.length));
  const seen = new Set();
  for (const s of SCENARIOS) {
    const result = await loadFixtures(s.sel, s.options);
    const got = codes(result);
    for (const c of s.expect) assert.ok(got.includes(c), `${s.sel.join(' + ')} should report ${c}; got ${got.join(', ')}`);
    got.forEach((c) => seen.add(c));
    for (const m of result.report.messages) {
      const sentence = formatMessage(text, m);
      assert.doesNotMatch(sentence, /\[report\.|\{\w+\}|undefined/, `${m.code} is fully worded: ${sentence}`);
    }
  }
  assert.deepEqual(all.filter((c) => !seen.has(c)), [], 'no message type without a fixture');
});

test('errors block, warnings and info do not', async () => {
  assert.equal((await loadFixtures(['fx-base', 'fx-ops'])).ok, false);
  const warned = await loadFixtures(['fx-base', 'fx-balance-a', 'fx-balance-b']);
  assert.equal(warned.ok, true);
  assert.ok(warned.report.warnings > 0);
});

test('operations: add, replace, change (set, add, remove) and remove behave as section 4.3 says', async () => {
  const { ruleset } = await loadFixtures(['fx-base', 'fx-ops']);
  const u = ruleset.units;
  assert.ok(u.slinger, 'add creates');
  assert.equal(u.warrior.strength, 20, 'a refused duplicate add changes nothing');
  assert.equal(u.chariot.strength, 30, 'replace swaps the whole entry');
  assert.equal(u.chariot.nameKey, undefined, 'replace drops fields the new entry lacks');
  assert.equal(u.archer.rangedStrength, 27, 'change set');
  assert.deepEqual(u.archer.tags, ['volley'], 'change add then remove on a list');
  assert.equal(u.archer.flavour, undefined, 'an unknown field is refused, not created');
  assert.equal(u.war_elephant, undefined, 'remove by id');
  assert.equal(u.knight, undefined, 'remove where');
  assert.equal(u.hoplite, undefined);
});

test('dot paths in change set, including inside open params', async () => {
  const { ruleset } = await loadFixtures(['fx-base', 'fx-lock']);
  assert.equal(ruleset.victories.score.params.turnLimit, null);
  assert.equal(ruleset.victories.science.enabled, false);
});

test('cascade removes dependents, prunes lists and clears optional links', async () => {
  const { ruleset, ok } = await loadFixtures(['fx-base', 'fx-lock'], { 'fx-lock': { era: 'ancient' } });
  assert.equal(ok, true);
  assert.deepEqual(Object.keys(ruleset.techs), ['bronze']);
  assert.equal(ruleset.units.legionary, undefined, 'unit requiring a removed tech');
  assert.equal(ruleset.units.knight, undefined);
  assert.equal(ruleset.buildings.armoury, undefined, 'building requiring a removed tech');
  assert.ok(ruleset.buildings.barracks);
  assert.deepEqual(ruleset.factions.fxrome.uniqueUnits, [], 'pruned from a list');
  assert.equal(ruleset.units.warrior.upgradesTo, undefined, 'optional link cleared');
  assert.deepEqual(Object.keys(ruleset.wonders), ['pyramids']);
});

test('without cascade, a dangling reference is an error naming the field', async () => {
  const result = await loadFixtures(['fx-base', 'fx-remove-iron']);
  const text = await engineText();
  const lines = result.report.messages.filter((m) => m.code === 'badReference').map((m) => formatMessage(text, m));
  assert.ok(lines.includes('`techs.steel.requires.0` points to `iron`, which does not exist'), lines.join('\n'));
  assert.ok(lines.includes('`units.legionary.requires.tech` points to `iron`, which does not exist'));
});

test('options substitute: the default era and a chosen one remove different things', async () => {
  const classical = await loadFixtures(['fx-base', 'fx-lock']);
  assert.deepEqual(Object.keys(classical.ruleset.techs), ['bronze', 'iron']);
  assert.equal(classical.ruleset.tuning.start.era, 'classical');
  assert.equal(classical.ruleset.tuning.start.grantErasBefore, 'classical');
  assert.equal(classical.ruleset.tuning.ai.lateGameMode, 'sandbox');
  const ancient = await loadFixtures(['fx-base', 'fx-lock'], { 'fx-lock': { era: 'ancient' } });
  assert.equal(ancient.ruleset.tuning.start.era, 'ancient');
  assert.notEqual(classical.hash, ancient.hash);
});

test('eraIndex is added to every entry with an era', async () => {
  const { ruleset } = await loadFixtures(['fx-base']);
  assert.equal(ruleset.units.knight.eraIndex, 2);
  assert.equal(ruleset.techs.bronze.eraIndex, 0);
  assert.equal(ruleset.units.knight.era, 'medieval');
});

test('the merged ruleset is deeply frozen and its hash is stable', async () => {
  const a = await loadReal(['base-ancient', 'lock-era']);
  const b = await loadReal(['base-ancient', 'lock-era']);
  assert.equal(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]{8}$/);
  assert.ok(Object.isFrozen(a.ruleset));
  assert.ok(Object.isFrozen(a.ruleset.units.warrior));
  assert.ok(Object.isFrozen(a.ruleset.tuning.combat));
  assert.throws(() => { 'use strict'; a.ruleset.units.warrior.strength = 99; }, TypeError);
});

test('the loader never changes the files it is given', async () => {
  const available = structuredClone(await fixtureMods());
  const before = JSON.stringify(available);
  loadRuleset({ available, selection: ['fx-base', 'fx-ops', 'fx-lock'], options: {} });
  assert.equal(JSON.stringify(available), before);
});

test('base-ancient loads cleanly; lock-era warns until techs exist; the test pair shows last one wins', async () => {
  const base = await loadReal(['base-ancient']);
  assert.equal(base.ok, true);
  assert.deepEqual(codes(base, 'error'), []);
  assert.deepEqual(codes(base, 'warning'), []);
  assert.equal(Object.keys(base.ruleset.factions).length, 8);
  assert.equal(Object.keys(base.ruleset.wonders).length, 11); // 8 wonders and the 3 science projects
  assert.ok(Object.keys(base.ruleset.buildings).length >= 30);
  assert.equal(Object.keys(base.ruleset.improvements).length, 9);

  const locked = await loadReal(['base-ancient', 'lock-era', 'no-religious-victory']);
  assert.equal(locked.ok, true);
  // Civics do not exist yet; wonders do, but none come after the Classical era.
  assert.deepEqual(codes(locked, 'warning'), ['contentTypeMissing', 'noMatch']);
  assert.ok(Object.values(locked.ruleset.techs).every((t) => locked.ruleset.eras[t.era].index <= 1), 'later techs removed');
  assert.ok(!locked.ruleset.units.knight, 'and the units they unlock (cascade)');
  assert.equal(locked.ruleset.victories.religious.enabled, false);
  assert.equal(locked.ruleset.victories.science.enabled, false);

  const text = await engineText();
  const swiftLast = await loadReal(['base-ancient', 'test-slow-scouts', 'test-swift-scouts']);
  const slowLast = await loadReal(['base-ancient', 'test-swift-scouts', 'test-slow-scouts']);
  assert.equal(swiftLast.ruleset.units.scout.moves, 4);
  assert.equal(slowLast.ruleset.units.scout.moves, 2);
  const line = (r) => formatMessage(text, r.report.messages.find((m) => m.code === 'lastOneWins'));
  assert.equal(line(slowLast), '`units.scout.moves`: changed by `test-swift-scouts` (4) then by `test-slow-scouts` (2). Last one wins: 2');
  assert.notEqual(line(swiftLast), line(slowLast));
});

test('lock-era alone reports the missing base game by name', async () => {
  const text = await engineText();
  const result = await loadReal(['lock-era']);
  const errors = result.report.messages.filter((m) => m.level === 'error').map((m) => formatMessage(text, m));
  assert.ok(errors.includes('`lock-era` needs `base-ancient`, which is not ticked'), errors.join('\n'));
});

test('load order: type first, then dependencies, otherwise the player\'s order', () => {
  const m = (id, type, extra = {}) => [id, { id, type, dependsOn: [], loadAfter: [], ...extra }];
  const manifests = new Map([
    m('t1', 'tweak'), m('base', 'ruleset'), m('conv', 'conversion', { dependsOn: ['base'] }),
    m('t2', 'tweak', { loadAfter: ['t3'] }), m('t3', 'tweak'),
  ]);
  assert.deepEqual(sortMods(manifests, ['t1', 't2', 't3', 'conv', 'base']).order, ['base', 'conv', 't1', 't3', 't2']);
  assert.deepEqual(sortMods(manifests, ['t3', 't1', 'base']).order, ['base', 't3', 't1']);
});
