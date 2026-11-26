// Phase 17: the Witcher conversion. The "stack everything" load, the setting's
// factions, faiths and monsters, and no base wording that names the real
// world showing through in the merged game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadReal, codes, engineText } from './helpers.js';
import { formatMessage } from '../../src/data/report.js';
import { canBuild } from '../../src/sim/cities.js';
import { combatBonuses } from '../../src/sim/combat.js';

const STACK = ['base-ancient', 'witcher', 'lock-era', 'no-religious-victory'];

test('stack everything: base-ancient + witcher + lock-era (Classical) + no-religious-victory loads with 0 errors', async () => {
  const r = await loadReal(STACK, { 'lock-era': { era: 'classical' } });
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r, 'error'), []);
  // The only warning is lock-era finding no wonders past the Classical era to remove.
  assert.deepEqual(codes(r, 'warning'), ['noMatch']);
  const rs = r.ruleset;
  assert.deepEqual(Object.keys(rs.factions).sort(), ['aedirn', 'kaedwen', 'kovir', 'nilfgaard', 'redania', 'scoiatael', 'skellige', 'temeria']);
  for (const f of Object.values(rs.factions)) {
    assert.ok(f.tags.includes('witcher'), f.id);
    assert.ok(rs.leaders[f.leaders[0]], `${f.id} has its leader`);
    assert.ok(rs.cityNames[f.cityNames]?.names.length >= 12, `${f.id} has city names`);
  }
  assert.equal(Object.keys(rs.leaders).length, 8);
  assert.deepEqual(Object.keys(rs.religions).sort(), ['eternal_fire', 'freya', 'great_sun', 'kreve', 'lebioda', 'melitele', 'old_ways']);
  assert.ok(Object.keys(rs.cityNames).every((id) => id.startsWith('w_')));
  // lock-era: science victory and the turn limit off; the game starts in the Classical era.
  assert.equal(rs.victories.science.enabled, false);
  assert.equal(rs.victories.religious.enabled, false);
  assert.equal(rs.victories.score.params.turnLimit, null);
  assert.equal(rs.tuning.start.era, 'classical');
  // The summary says what the conversion removed and added.
  const text = await engineText();
  const summary = r.report.messages.filter((m) => m.code === 'modSummary' && m.mod === 'witcher').map((m) => formatMessage(text, m)).join(' ');
  assert.match(summary, /removed .*8 factions/);
  assert.match(summary, /added .*8 factions/);
});

test('every faction of the base game and its unique units and buildings are gone', async () => {
  const rs = (await loadReal(['base-ancient', 'witcher'])).ruleset;
  for (const id of ['rome', 'greece', 'egypt', 'persia', 'carthage', 'gaul', 'britons', 'han']) assert.equal(rs.factions[id], undefined);
  for (const id of ['legionary', 'hoplite', 'maryannu', 'immortal', 'quinquereme', 'gaesatae', 'woad_raider', 'crossbowman']) assert.equal(rs.units[id], undefined);
  for (const id of ['bath', 'acropolis', 'mortuary_temple', 'pairidaeza', 'cothon', 'oppidum', 'roundhouse', 'examination_hall']) assert.equal(rs.buildings[id], undefined);
  for (const f of Object.values(rs.factions)) {
    for (const u of f.uniqueUnits) assert.equal(rs.units[u].requires.faction, f.id);
    for (const b of f.uniqueBuildings) assert.equal(rs.buildings[b].requires.faction, f.id);
  }
});

// Words that name real-world places, peoples, rulers or monuments. Any text key the
// merged Witcher game still uses must not say one of these in base-ancient's wording.
const REAL_WORLD = /\b(Rom(e|an|ans|a)|Greek|Greece|Egypt\w*|Persia\w*|Carthag\w*|Gaul(s|ish)?|Britons?|Britain|British|Han|China|Chinese|Athens|Sparta\w*|Babylon\w*|Alexandria|Rhodes|Olympi\w*|Pharos|Pyramids?|Celt\w*|Latin|Trajan|Pericles|Hatshepsut|Cyrus|Dido|Ambiorix|Boudica|Pharaoh|Nile|Mediterranean|Delphi|Colossus|Hanging Gardens|Stonehenge|Great Wall|Artemis|Zeus|Oracle|Acropolis|Parthenon|Phoenicia\w*|Confucius|Buddh\w*|Christ\w*|Islam\w*|Hindu\w*|Mesopotamia\w*|Sumer\w*|Caesar|Macedon\w*|Punic|Byzant\w*)\b/;

function usedKeys(value, out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) usedKeys(v, out); return out; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && /Key$/.test(k)) out.add(v);
      else usedKeys(v, out);
    }
  }
  return out;
}

test('no text key falls back to base-ancient wording that names the real world', async () => {
  const base = (await loadReal(['base-ancient'])).ruleset;
  for (const stack of [['base-ancient', 'witcher'], STACK]) {
    const rs = (await loadReal(stack)).ruleset;
    const { text, ...content } = rs;
    const keys = usedKeys(content);
    // Text shown without a *Key field: map types' descriptions and every entry's name.
    for (const k of Object.keys(text)) if (/^(mapType|wonder|building|unit|religion|faction|leader|trait|agenda)\./.test(k)) keys.add(k);
    const leaks = [...keys].filter((k) => text[k] !== undefined && text[k] === base.text[k] && REAL_WORLD.test(text[k]) && isShown(rs, k));
    assert.deepEqual(leaks, [], `${stack.join(' + ')}: ${leaks.map((k) => `${k} = "${text[k]}"`).join('; ')}`);
  }
});

/** A text key belongs to something still in the merged rules (removed factions' words never appear). */
function isShown(rs, key) {
  const [kind, id] = key.split('.');
  const table = { faction: rs.factions, leader: rs.leaders, unit: rs.units, building: rs.buildings, wonder: rs.wonders, religion: rs.religions, mapType: rs.mapTypes }[kind];
  if (table) return Boolean(table[id]);
  if (kind === 'trait' || kind === 'agenda') return [...Object.values(rs.factions), ...Object.values(rs.leaders)].some((x) => x.trait?.id === id || x.agenda?.id === id);
  return true;
}

test('monsters are raiders only; witchers are trained at a school and hunt them', async () => {
  const rs = (await loadReal(['base-ancient', 'witcher'])).ruleset;
  const monsters = Object.values(rs.units).filter((u) => u.tags?.includes('monster'));
  assert.deepEqual(monsters.map((u) => u.id).sort(), ['drowner', 'ghoul', 'nekker', 'wyvern']);
  for (const m of monsters) assert.equal(m.raiderOnly, true);
  assert.ok(rs.tuning.raiders.units.every((u) => rs.units[u.unit]?.raiderOnly));
  assert.equal(rs.text[rs.tuning.raiders.nameKey], 'Monsters');
  // No city can train a monster, and the witcher needs the school.
  const city = { id: 'c1', faction: 'f0', tile: 0, pop: 5, buildings: ['palace', 'witcher_school'], queue: [], timed: [] };
  const state = { factions: [{ id: 'f0', civ: 'temeria', research: { known: Object.keys(rs.techs) }, civics: { known: Object.keys(rs.civics ?? {}) } }], cities: { c1: city }, units: {}, map: null };
  for (const m of monsters) assert.equal(canBuild(state, rs, city, { kind: 'unit', id: m.id }), false, m.id);
  assert.equal(canBuild(state, rs, city, { kind: 'unit', id: 'witcher' }), true);
  assert.equal(canBuild(state, rs, { ...city, buildings: ['palace'] }, { kind: 'unit', id: 'witcher' }), false, 'needs the school');
  assert.equal(combatBonuses(rs, { type: 'witcher' }, { role: 'attacker', opponent: { class: 'melee', tags: ['monster'] } })[0]?.amount, 15);
  assert.deepEqual(combatBonuses(rs, { type: 'witcher' }, { role: 'attacker', opponent: { class: 'melee', tags: ['infantry'] } }), []);
});
