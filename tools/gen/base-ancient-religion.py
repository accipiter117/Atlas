# Phase 13: base-ancient's beliefs, religions, the missionary and religion tuning.
# Run after base-ancient-civics.py (it adds files beside that script's JSON and
# can be re-run safely): python3 tools/gen/base-ancient-religion.py
import json, collections
B = 'rules/base-ancient/'
text = {}
def T(k, v): text[k] = v; return k
def load(name): return json.load(open(B + name), object_pairs_hook=collections.OrderedDict)
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

def y(yld, amount, scope=None):
    e = {'effect': 'yieldBonus', 'yield': yld, 'amount': amount}
    if scope: e['scope'] = scope
    return e
def pct(yld, amount): return {'effect': 'yieldPercent', 'yield': yld, 'amount': amount}

# id, kind, name, description, effects, extra fields
BELIEFS = [
    # Pantheons: one per faction, each unique in the world; they work in all the faction's cities.
    ('forge_spirit', 'pantheon', 'Forge Spirit', '+1 production in every city.', [y('production', 1)], {}),
    ('harvest_mother', 'pantheon', 'Harvest Mother', 'Cities grow 10% faster.', [{'effect': 'growthPercent', 'amount': 10}], {}),
    ('river_goddess', 'pantheon', 'River Goddess', '+2 faith and +1 amenity in the capital.', [y('faith', 2, 'capital'), {'effect': 'amenityBonus', 'amount': 1, 'scope': 'capital'}], {}),
    ('war_drums', 'pantheon', 'War Drums', 'Units heal 10 more each turn.', [{'effect': 'healBonus', 'amount': 10}], {}),
    ('lady_of_the_hunt', 'pantheon', 'Lady of the Hunt', '+1 food from camps.', [{'effect': 'tileYield', 'yield': 'food', 'amount': 1, 'improvement': 'camp'}], {}),
    ('stone_circle', 'pantheon', 'Stone Circle', '+2 faith in cities with a shrine.', [y('faith', 2, 'withBuilding:shrine')], {}),
    ('sea_father', 'pantheon', 'Sea Father', '+1 food from fishing boats.', [{'effect': 'tileYield', 'yield': 'food', 'amount': 1, 'improvement': 'fishing_boats'}], {}),
    ('ancestor_hall', 'pantheon', 'Ancestor Hall', '+10% culture.', [pct('culture', 10)], {}),
    # Follower beliefs: every city that follows the religion, whoever owns it.
    ('choral_music', 'follower', 'Choral Music', '+1 culture in each following city.', [y('culture', 1)], {}),
    ('alms_houses', 'follower', 'Alms Houses', '+1 amenity in each following city.', [{'effect': 'amenityBonus', 'amount': 1}], {}),
    ('monastic_scribes', 'follower', 'Monastic Scribes', '+1 science in each following city.', [y('science', 1)], {}),
    ('feast_days', 'follower', 'Feast Days', 'Following cities grow 10% faster.', [{'effect': 'growthPercent', 'amount': 10}], {}),
    ('sacred_crafts', 'follower', 'Sacred Crafts', '+1 production in each following city.', [y('production', 1)], {}),
    ('pilgrim_roads', 'follower', 'Pilgrim Roads', '+1 gold in each following city.', [y('gold', 1)], {}),
    ('tithe_barns', 'follower', 'Tithe Barns', '+1 food in each following city.', [y('food', 1)], {}),
    ('temple_schools', 'follower', 'Temple Schools', '+10% science in each following city.', [pct('science', 10)], {}),
    # Founder beliefs: for the founder only. With perFollowerCity, the amount is paid for every
    # city in the world that follows the religion, in the holy city.
    ('tithe', 'founder', 'Tithe', '+1 gold in your holy city for every city that follows your religion.', [y('gold', 1)], {'perFollowerCity': True}),
    ('pilgrimage', 'founder', 'Pilgrimage', '+1 faith in your holy city for every city that follows your religion.', [y('faith', 1)], {'perFollowerCity': True}),
    ('scripture', 'founder', 'Scripture', '+1 science in your holy city for every city that follows your religion.', [y('science', 1)], {'perFollowerCity': True}),
    ('church_unity', 'founder', 'Church Unity', '+1 culture in your holy city for every city that follows your religion.', [y('culture', 1)], {'perFollowerCity': True}),
    ('evangelism', 'founder', 'Evangelism', 'Your cities spread your religion 30% more strongly.', [{'effect': 'religiousPressure', 'amount': 30}], {}),
    ('temple_builders', 'founder', 'Temple Builders', 'Shrines and temples can be bought with faith.', [{'effect': 'faithPurchase', 'target': 'shrine'}, {'effect': 'faithPurchase', 'target': 'temple'}], {}),
]
RELIGIONS = [
    ('solar_way', 'The Solar Way', '#e0a526'), ('starward_faith', 'Starward Faith', '#3f6fb5'), ('grove_circle', 'The Grove Circle', '#3f8a4a'),
    ('flame_covenant', 'Flame Covenant', '#c4462b'), ('river_church', 'River Church', '#2f9bb0'), ('path_of_stone', 'Path of Stone', '#7a6a58'),
    ('sky_lodge', 'Sky Lodge', '#8a63c0'), ('sea_communion', 'Sea Communion', '#24607a'),
]

beliefs = []
for bid, kind, name, desc, effects, extra in BELIEFS:
    e = collections.OrderedDict([('id', bid), ('nameKey', T(f'belief.{bid}.name', name)), ('descriptionKey', T(f'belief.{bid}.text', desc)), ('kind', kind), ('effects', effects)])
    e.update(extra)
    beliefs.append(e)
dump('beliefs.json', 'beliefs', beliefs)
dump('religions.json', 'religions', [collections.OrderedDict([('id', rid), ('nameKey', T(f'religion.{rid}.name', name)), ('colour', col)]) for rid, name, col in RELIGIONS])

# The missionary: bought with faith only, spreads its religion to a city.
units = load('units.json')['entries']
units = [u for u in units if u['id'] != 'missionary']
units.append(collections.OrderedDict([
    ('id', 'missionary'), ('nameKey', T('unit.missionary.name', 'Missionary')), ('descriptionKey', T('unit.missionary.text', 'Bought with faith. Walks to a city, yours or anyone\'s, and converts some of its people to your religion (three uses).')),
    ('class', 'civilian'), ('era', 'ancient'), ('cost', 1), ('strength', 0), ('moves', 4), ('upkeep', 0), ('tags', ['missionary']), ('faithOnly', True), ('charges', 3)]))
dump('units.json', 'units', units)

t = load('tuning.json')
t['values']['religion'] = collections.OrderedDict([
    ('pantheonFaith', 25), ('foundReligionFaith', 200), ('religionsPerFaction', 0.5), ('pressureRange', 10),
    ('pressurePerCity', 1), ('pressurePerFollower', 0.25), ('holyCityPressure', 2), ('convertAt', 30),
    ('missionaryFaith', 80), ('missionaryFollowers', 2), ('faithPerProduction', 2), ('foundNeedsBuilding', ['shrine', 'temple']),
])
open(B + 'tuning.json', 'w').write(json.dumps(t, indent=2, ensure_ascii=False) + '\n')

tx = load('text/en-GB.json'); tx['strings'].update(text)
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')
m = load('mod.json')
for f in ['beliefs.json', 'religions.json']:
    if f not in m['files']: m['files'].insert(m['files'].index('victories.json'), f)
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print(len(beliefs), 'beliefs;', len(RELIGIONS), 'religions')
