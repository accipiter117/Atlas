# Phase 8: base-ancient's tech tree, the later units it unlocks, and the tech
# each building, wonder, unit and improvement needs. Run after
# base-ancient-content.py (it edits that script's JSON in place and can be
# re-run safely): python3 tools/gen/base-ancient-techs.py
import json, collections
B = 'rules/base-ancient/'
text = {}
def T(k, v): text[k] = v; return k
def load(name): return json.load(open(B + name), object_pairs_hook=collections.OrderedDict)
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

# id, name, era, col, row, cost, requires, boost (trigger, id, count, text) or None
TECHS = [
    ('pottery', 'Pottery', 'ancient', 0, 0, 25, [], None),
    ('animal_husbandry', 'Animal Husbandry', 'ancient', 0, 1, 25, [], None),
    ('mining', 'Mining', 'ancient', 0, 2, 25, [], None),
    ('sailing', 'Sailing', 'ancient', 0, 3, 50, [], ('citiesFounded', None, 2, 'Found a second city')),
    ('astrology', 'Astrology', 'ancient', 0, 4, 50, [], ('unitBuilt', 'scout', 1, 'Train a scout')),
    ('irrigation', 'Irrigation', 'ancient', 1, 0, 50, ['pottery'], ('improvementBuilt', 'farm', 1, 'Build a farm')),
    ('archery', 'Archery', 'ancient', 1, 1, 50, ['animal_husbandry'], ('unitKilled', None, 1, 'Destroy an enemy unit')),
    ('writing', 'Writing', 'ancient', 1, 2, 50, ['pottery'], ('citiesFounded', None, 2, 'Found a second city')),
    ('masonry', 'Masonry', 'ancient', 1, 3, 50, ['mining'], ('improvementBuilt', 'quarry', 1, 'Build a quarry')),
    ('bronze_working', 'Bronze Working', 'ancient', 1, 4, 50, ['mining'], ('unitKilled', None, 2, 'Destroy two enemy units')),
    ('wheel', 'The Wheel', 'ancient', 2, 1, 80, ['mining'], ('improvementBuilt', 'mine', 1, 'Build a mine')),
    ('celestial_navigation', 'Celestial Navigation', 'classical', 3, 3, 120, ['sailing', 'astrology'], ('improvementBuilt', 'fishing_boats', 2, 'Build fishing boats twice')),
    ('currency', 'Currency', 'classical', 3, 0, 120, ['writing'], ('buildingBuilt', 'library', 1, 'Build a library')),
    ('horseback_riding', 'Horseback Riding', 'classical', 3, 1, 120, ['archery'], ('improvementBuilt', 'pasture', 1, 'Build a pasture')),
    ('iron_working', 'Iron Working', 'classical', 3, 4, 120, ['bronze_working'], ('improvementBuilt', 'mine', 2, 'Build two mines')),
    ('mathematics', 'Mathematics', 'classical', 4, 2, 150, ['currency'], ('buildingBuilt', 'market', 1, 'Build a market')),
    ('construction', 'Construction', 'classical', 4, 3, 150, ['masonry', 'wheel'], ('buildingBuilt', 'walls', 1, 'Build walls')),
    ('philosophy', 'Philosophy', 'classical', 4, 0, 150, ['writing', 'astrology'], ('buildingBuilt', 'shrine', 2, 'Build two shrines')),
    ('drama_poetry', 'Drama and Poetry', 'classical', 4, 1, 150, ['philosophy'], ('buildingBuilt', 'monument', 2, 'Build two monuments')),
    ('engineering', 'Engineering', 'classical', 5, 3, 180, ['construction'], ('buildingBuilt', 'water_mill', 1, 'Build a water mill')),
    ('shipbuilding', 'Shipbuilding', 'classical', 5, 4, 180, ['celestial_navigation'], ('unitBuilt', 'trireme', 2, 'Build two triremes')),
    ('apprenticeship', 'Apprenticeship', 'medieval', 6, 2, 260, ['mathematics'], ('improvementBuilt', 'mine', 3, 'Build three mines')),
    ('education', 'Education', 'medieval', 6, 0, 260, ['mathematics', 'philosophy'], ('buildingBuilt', 'library', 2, 'Build two libraries')),
    ('machinery', 'Machinery', 'medieval', 6, 3, 260, ['engineering'], ('unitBuilt', 'archer', 3, 'Train three archers')),
    ('stirrups', 'Stirrups', 'medieval', 6, 1, 260, ['horseback_riding'], ('unitBuilt', 'horseman', 2, 'Train two horsemen')),
    ('feudalism', 'Feudalism', 'medieval', 7, 1, 300, ['stirrups'], ('improvementBuilt', 'farm', 6, 'Build six farms')),
    ('military_engineering', 'Military Engineering', 'medieval', 7, 3, 300, ['machinery'], ('buildingBuilt', 'walls', 2, 'Build walls twice')),
    ('metal_casting', 'Metal Casting', 'medieval', 7, 4, 300, ['apprenticeship', 'iron_working'], ('buildingBuilt', 'workshop', 2, 'Build two workshops')),
    ('banking', 'Banking', 'medieval', 7, 0, 300, ['currency', 'education'], ('buildingBuilt', 'market', 3, 'Build three markets')),
    ('castles', 'Castles', 'medieval', 8, 3, 340, ['military_engineering'], ('buildingBuilt', 'walls', 3, 'Build walls three times')),
    ('guilds', 'Guilds', 'medieval', 8, 0, 340, ['banking'], ('citiesFounded', None, 6, 'Found six cities')),
    ('theology', 'Theology', 'medieval', 8, 1, 340, ['philosophy', 'education'], ('buildingBuilt', 'temple', 2, 'Build two temples')),
    ('cartography', 'Cartography', 'renaissance', 9, 4, 420, ['shipbuilding', 'education'], ('unitBuilt', 'trireme', 4, 'Build four triremes')),
    ('gunpowder', 'Gunpowder', 'renaissance', 9, 3, 420, ['metal_casting', 'military_engineering'], ('buildingBuilt', 'castle', 1, 'Build a castle')),
    ('printing', 'Printing', 'renaissance', 9, 0, 420, ['guilds', 'theology'], ('buildingBuilt', 'university', 1, 'Build a university')),
    ('astronomy', 'Astronomy', 'renaissance', 9, 1, 420, ['education'], ('buildingBuilt', 'observatory', 1, 'Build an observatory')),
    ('metallurgy', 'Metallurgy', 'renaissance', 10, 3, 480, ['gunpowder'], ('unitKilled', None, 10, 'Destroy ten enemy units')),
    ('economics', 'Economics', 'renaissance', 10, 0, 480, ['printing', 'banking'], ('buildingBuilt', 'bank', 2, 'Build two banks')),
    ('navigation', 'Navigation', 'renaissance', 10, 4, 480, ['cartography'], ('unitBuilt', 'caravel', 2, 'Build two caravels')),
    ('scientific_method', 'Scientific Method', 'renaissance', 11, 1, 520, ['astronomy', 'printing'], ('buildingBuilt', 'university', 3, 'Build three universities')),
]
unlocks = collections.defaultdict(lambda: collections.defaultdict(list))
techs = []
for (tid, name, era, col, row, cost, req, boost) in TECHS:
    e = {'id': tid, 'nameKey': T(f'tech.{tid}.name', name), 'era': era, 'cost': cost, 'requires': req, 'treePos': {'col': col, 'row': row}}
    if boost:
        trig, bid, count, btext = boost
        b = {'trigger': trig, 'count': count, 'textKey': T(f'boost.{tid}', btext)}
        if bid: b['id'] = bid
        e['boost'] = b
    techs.append(e)

# New later units.
units = load('units.json')['entries']
ids = {u['id'] for u in units}
def unit(id, name, desc, **kw):
    e = {'id': id, 'nameKey': T(f'unit.{id}.name', name), 'descriptionKey': T(f'unit.{id}.text', desc)}
    e.update(kw); e.setdefault('domain', 'land'); e.setdefault('sight', 2); e.setdefault('upkeep', 2); e.setdefault('sprite', f'unit.{id}')
    return e
later = [
    unit('pikeman', 'Pikeman', 'Long pikes that break cavalry charges.', **{'class': 'anti_cavalry', 'era': 'medieval', 'strength': 41, 'moves': 2, 'cost': 200, 'abilities': [{'effect': 'combatBonus', 'amount': 10, 'vs': {'class': 'cavalry'}}], 'tags': ['infantry']}),
    unit('man_at_arms', 'Man-at-arms', 'Armoured medieval infantry. Needs iron.', **{'class': 'melee', 'era': 'medieval', 'strength': 45, 'moves': 2, 'cost': 220, 'requires': {'resource': 'iron'}, 'tags': ['infantry']}),
    unit('knight', 'Knight', 'Heavy mounted shock troops. Needs horses.', **{'class': 'cavalry', 'era': 'medieval', 'strength': 48, 'moves': 4, 'cost': 240, 'upkeep': 3, 'requires': {'resource': 'horses'}, 'tags': ['mounted']}),
    unit('trebuchet', 'Trebuchet', 'Counterweight siege engine for breaking castles.', **{'class': 'siege', 'era': 'medieval', 'strength': 35, 'rangedStrength': 45, 'range': 2, 'moves': 2, 'cost': 220, 'tags': ['siege']}),
    unit('caravel', 'Caravel', 'Ocean-going ship that can cross deep water.', **{'class': 'naval_melee', 'domain': 'sea', 'era': 'renaissance', 'strength': 50, 'moves': 5, 'sight': 3, 'cost': 280, 'tags': ['ship']}),
    unit('musketman', 'Musketman', 'Gunpowder infantry; the end of the age of swords.', **{'class': 'melee', 'era': 'renaissance', 'strength': 55, 'moves': 2, 'cost': 320, 'upkeep': 3, 'tags': ['infantry']}),
    unit('bombard', 'Bombard', 'Gunpowder siege cannon.', **{'class': 'siege', 'era': 'renaissance', 'strength': 43, 'rangedStrength': 55, 'range': 2, 'moves': 2, 'cost': 340, 'upkeep': 3, 'tags': ['siege']}),
]
units = [u for u in units if u['id'] not in {x['id'] for x in later}] + later
UNIT_TECH = {'archer': 'archery', 'horseman': 'horseback_riding', 'chariot': 'wheel', 'swordsman': 'iron_working', 'catapult': 'mathematics',
             'trireme': 'sailing', 'spearman': 'bronze_working', 'legionary': 'iron_working', 'hoplite': 'bronze_working', 'maryannu': 'wheel',
             'immortal': 'archery', 'quinquereme': 'sailing', 'crossbowman': 'archery', 'pikeman': 'feudalism', 'man_at_arms': 'metal_casting',
             'knight': 'stirrups', 'trebuchet': 'military_engineering', 'caravel': 'cartography', 'musketman': 'gunpowder', 'bombard': 'metallurgy'}
for u in units:
    if u['id'] in UNIT_TECH:
        u.setdefault('requires', collections.OrderedDict())
        u['requires']['tech'] = UNIT_TECH[u['id']]
    if u['id'] == 'swordsman': u['upgradesTo'] = 'man_at_arms'
    if u['id'] == 'spearman': u['upgradesTo'] = 'pikeman'
dump('units.json', 'units', units)

BUILDING_TECH = {'granary': 'pottery', 'shrine': 'astrology', 'walls': 'masonry', 'barracks': 'bronze_working', 'library': 'writing', 'market': 'currency',
    'lighthouse': 'sailing', 'water_mill': 'wheel', 'workshop': 'apprenticeship', 'temple': 'philosophy', 'amphitheatre': 'drama_poetry', 'arena': 'construction',
    'aqueduct': 'engineering', 'harbour': 'celestial_navigation', 'stable': 'horseback_riding', 'forge': 'metal_casting', 'bank': 'banking', 'university': 'education',
    'courthouse': 'mathematics', 'herbalist': 'irrigation', 'caravanserai': 'currency', 'observatory': 'mathematics', 'scriptorium': 'theology', 'mint': 'metal_casting',
    'sawmill': 'construction', 'castle': 'castles', 'guildhall': 'guilds', 'watchtower': 'archery',
    'bath': 'engineering', 'acropolis': 'drama_poetry', 'mortuary_temple': None, 'pairidaeza': 'currency', 'cothon': 'celestial_navigation', 'oppidum': 'masonry',
    'roundhouse': 'pottery', 'examination_hall': 'writing'}
b = load('buildings.json')['entries']
for e in b:
    t = BUILDING_TECH.get(e['id'])
    if t:
        e.setdefault('requires', collections.OrderedDict())
        e['requires']['tech'] = t
dump('buildings.json', 'buildings', b)
WONDER_TECH = {'pyramids': 'masonry', 'hanging_gardens': 'irrigation', 'colossus': 'currency', 'great_library': 'philosophy', 'temple_of_artemis': 'archery',
               'stonehenge': 'astrology', 'oracle': 'drama_poetry', 'great_lighthouse': 'celestial_navigation',
               'great_observatory': 'scientific_method', 'atlas_of_the_world': 'cartography', 'voyage_beyond': 'navigation'}
w = load('wonders.json')['entries']
# Phase 9: the science victory's three final projects. Each faction builds its
# own (project: true); Voyage Beyond needs the other two first.
PROJECTS = [
    ('great_observatory', 'Great Observatory', 'Science victory project 1 of 3: chart every star in the sky.', 700, None),
    ('atlas_of_the_world', 'Atlas of the World', 'Science victory project 2 of 3: map every coast and river.', 700, None),
    ('voyage_beyond', 'Voyage Beyond', 'Science victory project 3 of 3: sail past the edge of the known world. Needs the other two projects first.', 1000, ['great_observatory', 'atlas_of_the_world']),
]
w = [e for e in w if not e.get('project')]
for pid, name, desc, cost, needs in PROJECTS:
    e = collections.OrderedDict([('id', pid), ('nameKey', T(f'wonder.{pid}.name', name)), ('descriptionKey', T(f'wonder.{pid}.text', desc)),
                                 ('era', 'renaissance'), ('cost', cost), ('upkeep', 0), ('icon', f'wonder.{pid}'), ('project', True)])
    if needs: e['requires'] = collections.OrderedDict([('projects', needs)])
    w.append(e)
for e in w:
    e.setdefault('requires', collections.OrderedDict())
    e['requires']['tech'] = WONDER_TECH[e['id']]
dump('wonders.json', 'wonders', w)
IMP_TECH = {'mine': 'mining', 'pasture': 'animal_husbandry', 'plantation': 'irrigation', 'quarry': 'masonry', 'camp': 'animal_husbandry', 'fishing_boats': 'sailing', 'fort': 'military_engineering'}
im = load('improvements.json')['entries']
for e in im:
    if e['id'] in IMP_TECH:
        e['requires'] = {'tech': IMP_TECH[e['id']]}
dump('improvements.json', 'improvements', im)
r = load('resources.json')['entries']
for e in r:
    if e['id'] == 'horses': e['revealedBy'] = 'animal_husbandry'
    if e['id'] == 'iron': e['revealedBy'] = 'bronze_working'
dump('resources.json', 'resources', r)

for t in techs:
    ul = collections.OrderedDict()
    for kind, src in [('units', UNIT_TECH), ('buildings', BUILDING_TECH), ('wonders', WONDER_TECH), ('improvements', IMP_TECH)]:
        got = [k for k, v in src.items() if v == t['id']]
        if got: ul[kind] = got
    if ul: t['unlocks'] = ul
dump('techs.json', 'techs', techs)

tx = load('text/en-GB.json'); tx['strings'].update(text)
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')
m = load('mod.json')
if 'techs.json' not in m['files']: m['files'].insert(m['files'].index('eras.json') + 1, 'techs.json')
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2) + '\n')
print(len(techs), 'techs;', len(later), 'new units')
