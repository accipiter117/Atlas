# Phase 16: base-ancient's events with choices, and influence for the culture
# victory (buildings and policy cards). Run after base-ancient-espionage.py
# (re-runnable): python3 tools/gen/base-ancient-events.py
import json, collections
B = 'rules/base-ancient/'
text = {}
def T(k, v): text[k] = v; return k
def load(name): return json.load(open(B + name), object_pairs_hook=collections.OrderedDict)
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

def y(yld, amount, turns): return {'effect': 'yieldBonus', 'yield': yld, 'amount': amount, 'turns': turns}
def pc(yld, amount, turns): return {'effect': 'cityYieldPercent', 'yield': yld, 'amount': amount, 'turns': turns}
def am(amount, turns): return {'effect': 'amenityBonus', 'amount': amount, 'turns': turns}
def gr(amount, turns): return {'effect': 'growthPercent', 'amount': amount, 'turns': turns}
def pop(amount, chance=None):
    e = {'effect': 'popChange', 'amount': amount}
    if chance is not None: e['chance'] = chance
    return e
def unit(u): return {'effect': 'freeUnit', 'unit': u}
def cost(target, amount, turns): return {'effect': 'costPercent', 'target': target, 'amount': amount, 'turns': turns}

# id, name, text, chance, conditions, disaster, [(choice text, effects)]
EVENTS = [
    ('bountiful_harvest', 'A bountiful harvest', '{city} has brought in its best harvest in memory.', 0.04, [{'cityPopAtLeast': 3}, {'cityOnRiver': True}], False, [
        ('Fill the granaries (the city grows 25% faster for 10 turns).', [gr(25, 10)]),
        ('Sell the surplus (+4 gold a turn for 6 turns).', [y('gold', 4, 6)])]),
    ('wandering_scholars', 'Wandering scholars', 'A band of scholars asks to settle in {city}.', 0.03, [{'cityHasBuilding': 'library'}], False, [
        ('Give them a hall (+3 science for 10 turns, -1 gold for 10 turns).', [y('science', 3, 10), y('gold', -1, 10)]),
        ('Let them teach in the square (+1 culture for 8 turns).', [y('culture', 1, 8)])]),
    ('merchant_caravan', 'A merchant caravan', 'Traders from far away have reached {city}.', 0.04, [{'cityPopAtLeast': 3}], False, [
        ('Let them trade freely (+3 gold a turn for 8 turns).', [y('gold', 3, 8)]),
        ('Tax them hard (+8 gold a turn for 3 turns, -1 amenity for 5 turns).', [y('gold', 8, 3), am(-1, 5)])]),
    ('festival', 'A summer festival', 'The people of {city} want a festival.', 0.04, [{'cityPopAtLeast': 4}], False, [
        ('Hold a grand festival (+2 amenities for 6 turns, -2 gold for 6 turns).', [am(2, 6), y('gold', -2, 6)]),
        ('Keep the money (+1 gold a turn for 6 turns).', [y('gold', 1, 6)])]),
    ('veteran_mercenaries', 'Veteran mercenaries', 'A company of hardened soldiers offers its swords near {city}.', 0.05, [{'atWar': True}], False, [
        ('Hire them (a spearman joins you, -2 gold a turn for 10 turns).', [unit('spearman'), y('gold', -2, 10)]),
        ('Send them on their way.', [])]),
    ('border_dispute', 'A border dispute', 'Herders around {city} argue over grazing land.', 0.03, [{'citiesAtLeast': 3}], False, [
        ('Settle it by law (+2 culture for 10 turns).', [y('culture', 2, 10)]),
        ('Let the elders decide (+1 amenity for 10 turns).', [am(1, 10)])]),
    ('sacred_spring', 'A sacred spring', 'A spring near {city} is said to heal the sick.', 0.03, [{'cityPopAtLeast': 2}], False, [
        ('Make it a place of pilgrimage (+3 faith for 10 turns).', [y('faith', 3, 10)]),
        ('Use the water for fields (+2 food for 10 turns).', [y('food', 2, 10)])]),
    ('inventor', 'An inventor', 'A tinkerer in {city} has built a strange machine.', 0.03, [{'eraAtLeast': 1}], False, [
        ('Fund the workshop (+4 science for 8 turns, -2 gold for 8 turns).', [y('science', 4, 8), y('gold', -2, 8)]),
        ('Put it to work (+2 production for 8 turns).', [y('production', 2, 8)])]),
    ('good_omens', 'Good omens', 'Strange lights in the sky over {city} are taken as a blessing.', 0.03, [], False, [
        ('Celebrate (+2 culture for 8 turns).', [y('culture', 2, 8)]),
        ('Give thanks at the shrines (+2 faith for 8 turns).', [y('faith', 2, 8)])]),
    ('refugees', 'Refugees', 'Families fleeing the war arrive at {city}.', 0.05, [{'atWar': True}, {'cityPopAtLeast': 2}], False, [
        ('Take them in (+1 citizen).', [pop(1)]),
        ('Turn them away (+1 amenity for 5 turns).', [am(1, 5)])]),
    ('master_builder', 'A master builder', 'A famous builder offers to work in {city}.', 0.03, [{'cityPopAtLeast': 5}], False, [
        ('Raise a wonder (wonders cost 20% less here for 10 turns).', [cost('wonders', -20, 10)]),
        ('Improve the streets (buildings cost 15% less here for 10 turns).', [cost('buildings', -15, 10)])]),
    ('royal_wedding', 'A royal wedding', 'A great wedding is held in {city}.', 0.02, [{'cityHasBuilding': 'palace'}], False, [
        ('Invite the whole country (+3 culture for 8 turns).', [y('culture', 3, 8)]),
        ('Keep it modest (+4 gold a turn for 5 turns).', [y('gold', 4, 5)])]),
    ('rich_seam', 'A rich seam', 'Miners near {city} have struck a rich seam.', 0.03, [{'cityPopAtLeast': 3}], False, [
        ('Dig deep (+3 production for 8 turns).', [y('production', 3, 8)]),
        ('Sell the ore (+4 gold a turn for 6 turns).', [y('gold', 4, 6)])]),
    ('storyteller', 'A storyteller', 'A storyteller\'s tales draw crowds in {city}.', 0.03, [], False, [
        ('Record the tales (+2 culture for 10 turns).', [y('culture', 2, 10)]),
        ('Teach them in schools (+2 science for 10 turns).', [y('science', 2, 10)])]),
    ('shipwreck', 'A shipwreck', 'A merchant ship has run aground near {city}.', 0.03, [{'cityCoastal': True}], False, [
        ('Salvage the cargo (+5 gold a turn for 4 turns).', [y('gold', 5, 4)]),
        ('Rescue and shelter the crew (+1 culture for 10 turns, +1 amenity for 5 turns).', [y('culture', 1, 10), am(1, 5)])]),
    # Disasters (only with the Disasters setup option on).
    ('plague_rumours', 'Plague rumours', 'Sickness is spreading in the crowded streets of {city}.', 0.02, [{'cityPopAtLeast': 7}], True, [
        ('Quarantine the city (-25% gold here for 5 turns).', [pc('gold', -25, 5)]),
        ('Hope it passes (half a chance of losing 2 citizens).', [pop(-2, 0.5)])]),
    ('flood', 'A flood', 'The river has burst its banks at {city}.', 0.02, [{'cityOnRiver': True}, {'cityPopAtLeast': 3}], True, [
        ('Rebuild at once (-50% production here for 3 turns).', [pc('production', -50, 3)]),
        ('Let the waters fall (-2 food for 8 turns).', [y('food', -2, 8)])]),
    ('earthquake', 'An earthquake', 'The ground shook under {city}.', 0.015, [{'cityPopAtLeast': 4}], True, [
        ('Repair the walls and homes (-3 production for 5 turns).', [y('production', -3, 5)]),
        ('Pray for mercy (+2 faith, -1 amenity, both for 5 turns).', [y('faith', 2, 5), am(-1, 5)])]),
    ('drought', 'A drought', 'No rain has fallen on {city} for months.', 0.02, [{'cityPopAtLeast': 3}], True, [
        ('Dig new wells (-2 production for 6 turns).', [y('production', -2, 6)]),
        ('Ration the water (the city grows 30% slower for 8 turns).', [gr(-30, 8)])]),
    ('great_fire', 'A great fire', 'Fire has swept through the wooden quarter of {city}.', 0.015, [{'cityPopAtLeast': 6}], True, [
        ('Rebuild in stone (-4 production for 5 turns).', [y('production', -4, 5)]),
        ('Rebuild quickly (lose 1 citizen).', [pop(-1)])]),
]

entries = []
for eid, name, body, chance, conds, disaster, choices in EVENTS:
    e = collections.OrderedDict([('id', eid), ('nameKey', T(f'event.{eid}.name', name)), ('textKey', T(f'event.{eid}.text', body)),
        ('when', collections.OrderedDict([('trigger', 'turnStart'), ('chance', chance), ('conditions', conds)])),
        ('choices', [collections.OrderedDict([('textKey', T(f'event.{eid}.choice{i + 1}', ct)), ('effects', fx)]) for i, (ct, fx) in enumerate(choices)])])
    if disaster: e['disaster'] = True
    entries.append(e)
dump('events.json', 'events', entries)

# Influence for the culture victory: great buildings and some policy cards.
INF = {'amphitheatre': 2, 'acropolis': 3, 'monument': 1, 'temple': 1, 'scriptorium': 1, 'mortuary_temple': 1, 'university': 1}
b = load('buildings.json')['entries']
for e in b:
    if INF.get(e['id']): e['influence'] = INF[e['id']]
dump('buildings.json', 'buildings', b)
PI = {'patronage': 2, 'charismatic_leader': 1, 'royal_envoys': 2, 'grand_tour': 2, 'merchant_league': 1}
p = load('policies.json')['entries']
for e in p:
    if e['id'] in PI: e['influence'] = PI[e['id']]
dump('policies.json', 'policies', p)

t = load('tuning.json')
t['values']['events'] = collections.OrderedDict([('frequency', collections.OrderedDict([('off', 0), ('occasional', 1), ('frequent', 2)])), ('minGap', 10), ('defaultTurns', 10)])
open(B + 'tuning.json', 'w').write(json.dumps(t, indent=2, ensure_ascii=False) + '\n')

tx = load('text/en-GB.json'); tx['strings'].update(text)
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')
m = load('mod.json')
if 'events.json' not in m['files']: m['files'].insert(m['files'].index('victories.json'), 'events.json')
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print(len(entries), 'events (', sum(1 for e in entries if e.get('disaster')), 'disasters )')
