# Phase 15: base-ancient's spy missions, the spy unit and espionage tuning.
# Run after base-ancient-trade.py (re-runnable): python3 tools/gen/base-ancient-espionage.py
import json, collections
B = 'rules/base-ancient/'
text = {}
def T(k, v): text[k] = v; return k
def load(name): return json.load(open(B + name), object_pairs_hook=collections.OrderedDict)
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

# id, name, description, turns, base odds, level needed, action, amount, cap, effect turns
MISSIONS = [
    ('gather_intel', 'Gather Intel', 'See the land around the city and what its owner is researching.', 4, 60, 0, 'intel', 3, 0, None),
    ('siphon_funds', 'Siphon Funds', 'Steal a fifth of the owner\'s gold (at most 120).', 6, 60, 0, 'siphon', 0.2, 120, None),
    ('steal_boost', 'Steal Tech Boost', 'Gain a boost (40%) towards a tech they know and you do not.', 6, 60, 1, 'boost', 1, 0, None),
    ('sabotage_production', 'Sabotage Production', 'Undo the production the city has put into its current item.', 5, 60, 0, 'sabotage', 1, 0, None),
    ('incite_unrest', 'Incite Unrest', '-2 amenities in the city for 10 turns.', 8, 60, 1, 'unrest', 2, 0, 10),
]
entries = []
for mid, name, desc, turns, odds, lvl, action, amount, cap, et in MISSIONS:
    e = collections.OrderedDict([('id', mid), ('nameKey', T(f'mission.{mid}.name', name)), ('descriptionKey', T(f'mission.{mid}.text', desc)),
        ('turns', turns), ('baseOdds', odds), ('requiresLevel', lvl), ('action', action), ('amount', amount)])
    if cap: e['cap'] = cap
    if et: e['effectTurns'] = et
    entries.append(e)
dump('espionage.json', 'espionage', entries)

units = [u for u in load('units.json')['entries'] if u['id'] != 'spy']
units.append(collections.OrderedDict([
    ('id', 'spy'), ('nameKey', T('unit.spy.name', 'Spy')), ('descriptionKey', T('unit.spy.text', 'Assign it to a city you know: one of yours to defend it against rival spies, or a rival\'s to run missions there.')),
    ('class', 'civilian'), ('era', 'classical'), ('cost', 70), ('strength', 0), ('moves', 3), ('upkeep', 1), ('tags', ['spy']), ('requires', {'civic': 'recorded_history'})]))
dump('units.json', 'units', units)

t = load('tuning.json')
t['values']['espionage'] = collections.OrderedDict([
    ('capBase', 1), ('baseOdds', 60), ('oddsPerLevel', 10), ('missionTurnsMin', 4), ('missionTurnsMax', 8),
    ('defencePerSpy', 15), ('defencePerLevel', 5), ('minOdds', 5), ('maxOdds', 95),
    ('identifyChance', 0.25), ('captureChance', 0.5), ('maxLevel', 3), ('intelTurns', 20)])
open(B + 'tuning.json', 'w').write(json.dumps(t, indent=2, ensure_ascii=False) + '\n')

d = load('diplomacy.json')['entries']
d = [x for x in d if x['id'] not in ('caughtSpying',)]
d.insert(6, collections.OrderedDict([('id', 'caughtSpying'), ('amount', -8), ('reasonKey', T('opinion.caughtSpying', 'We caught your spies')), ('decays', True), ('trigger', 'spyIdentified')]))
dump('diplomacy.json', 'diplomacy', d)

tx = load('text/en-GB.json'); tx['strings'].update(text)
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')
m = load('mod.json')
if 'espionage.json' not in m['files']: m['files'].insert(m['files'].index('victories.json'), 'espionage.json')
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print(len(entries), 'missions; spy added')
