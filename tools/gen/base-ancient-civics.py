# Phase 11: base-ancient's civics tree, governments and policy cards.
# Run after base-ancient-techs.py (it adds files beside that script's JSON and
# can be re-run safely): python3 tools/gen/base-ancient-civics.py
import json, collections
B = 'rules/base-ancient/'
text = {}
def T(k, v): text[k] = v; return k
def load(name): return json.load(open(B + name), object_pairs_hook=collections.OrderedDict)
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

# id, name, era, col, row, cost, requires, boost (trigger, id, count, text) or None
CIVICS = [
    ('code_of_laws', 'Code of Laws', 'ancient', 0, 1, 20, [], None),
    ('craftsmanship', 'Craftsmanship', 'ancient', 1, 0, 40, ['code_of_laws'], ('improvementBuilt', 'farm', 3, 'Build three farms')),
    ('foreign_trade', 'Foreign Trade', 'ancient', 1, 2, 40, ['code_of_laws'], ('citiesFounded', None, 2, 'Found a second city')),
    ('military_tradition', 'Military Tradition', 'ancient', 2, 0, 50, ['craftsmanship'], ('unitKilled', None, 1, 'Destroy an enemy unit')),
    ('state_workforce', 'State Workforce', 'ancient', 2, 1, 70, ['craftsmanship'], ('buildingBuilt', 'monument', 1, 'Build a monument')),
    ('early_empire', 'Early Empire', 'ancient', 2, 2, 70, ['foreign_trade'], ('citiesFounded', None, 3, 'Found a third city')),
    ('mysticism', 'Mysticism', 'ancient', 2, 3, 50, ['foreign_trade'], ('buildingBuilt', 'shrine', 1, 'Build a shrine')),
    ('political_philosophy', 'Political Philosophy', 'classical', 3, 1, 110, ['state_workforce', 'early_empire'], ('buildingBuilt', 'monument', 3, 'Build three monuments')),
    ('games_recreation', 'Games and Recreation', 'classical', 3, 0, 140, ['state_workforce'], ('buildingBuilt', 'arena', 1, 'Build an arena')),
    ('theatre', 'Theatre', 'classical', 4, 2, 140, ['political_philosophy'], ('buildingBuilt', 'amphitheatre', 1, 'Build an amphitheatre')),
    ('military_training', 'Military Training', 'classical', 4, 0, 120, ['military_tradition', 'games_recreation'], ('buildingBuilt', 'barracks', 1, 'Build barracks')),
    ('defensive_tactics', 'Defensive Tactics', 'classical', 4, 1, 175, ['games_recreation', 'political_philosophy'], ('buildingBuilt', 'walls', 1, 'Build walls')),
    ('recorded_history', 'Recorded History', 'classical', 5, 2, 175, ['theatre'], ('buildingBuilt', 'library', 2, 'Build two libraries')),
    ('naval_tradition', 'Naval Tradition', 'classical', 5, 3, 200, ['mysticism', 'defensive_tactics'], ('unitBuilt', 'trireme', 2, 'Build two triremes')),
    ('feudalism', 'Feudalism', 'medieval', 6, 0, 275, ['military_training', 'defensive_tactics'], ('improvementBuilt', 'farm', 6, 'Build six farms')),
    ('civil_service', 'Civil Service', 'medieval', 6, 1, 275, ['defensive_tactics', 'recorded_history'], ('citiesFounded', None, 5, 'Found a fifth city')),
    ('divine_right', 'Divine Right', 'medieval', 7, 1, 290, ['civil_service', 'mysticism'], ('buildingBuilt', 'temple', 2, 'Build two temples')),
    ('mercenaries', 'Mercenaries', 'medieval', 7, 0, 290, ['feudalism'], ('unitKilled', None, 5, 'Destroy five enemy units')),
    ('medieval_faires', 'Medieval Faires', 'medieval', 7, 2, 385, ['civil_service'], ('buildingBuilt', 'market', 3, 'Build three markets')),
    ('guilds', 'Guilds', 'medieval', 8, 2, 385, ['medieval_faires'], ('buildingBuilt', 'workshop', 2, 'Build two workshops')),
    ('exploration', 'Exploration', 'renaissance', 9, 3, 400, ['mercenaries', 'medieval_faires', 'naval_tradition'], ('unitBuilt', 'caravel', 2, 'Build two caravels')),
    ('humanism', 'Humanism', 'renaissance', 9, 1, 540, ['guilds', 'divine_right'], ('buildingBuilt', 'university', 2, 'Build two universities')),
    ('diplomatic_service', 'Diplomatic Service', 'renaissance', 9, 2, 540, ['guilds'], ('citiesFounded', None, 8, 'Found an eighth city')),
    ('reformed_church', 'Reformed Church', 'renaissance', 10, 1, 600, ['humanism'], ('buildingBuilt', 'temple', 5, 'Build five temples')),
    ('mercantilism', 'Mercantilism', 'renaissance', 10, 2, 600, ['humanism', 'diplomatic_service'], ('buildingBuilt', 'bank', 2, 'Build two banks')),
]

def y(yld, amount, scope='everyCity'): return {'effect': 'yieldBonus', 'yield': yld, 'amount': amount, 'scope': scope}
def pct(yld, amount): return {'effect': 'yieldPercent', 'yield': yld, 'amount': amount}
def cost(target, amount): return {'effect': 'costPercent', 'target': target, 'amount': amount}

# id, name, slot, civic, description, effects
POLICIES = [
    # Military
    ('discipline', 'Discipline', 'military', 'code_of_laws', 'Units heal 10 more each turn.', [{'effect': 'healBonus', 'amount': 10}]),
    ('survey', 'Survey', 'military', 'code_of_laws', 'Scouts move one hex further.', [{'effect': 'moveBonus', 'amount': 1, 'class': 'recon'}]),
    ('agoge', 'Agoge', 'military', 'military_tradition', 'Melee and anti-cavalry units cost 30% less.', [cost('melee', -30), cost('anti_cavalry', -30)]),
    ('maneuver', 'Manoeuvre', 'military', 'military_tradition', 'Cavalry costs 30% less.', [cost('cavalry', -30)]),
    ('conscription', 'Conscription', 'military', 'military_training', 'Unit upkeep is 25% lower.', [{'effect': 'upkeepPercent', 'target': 'units', 'amount': -25}]),
    ('drill_grounds', 'Drill Grounds', 'military', 'military_training', 'Barracks and stables cost half.', [cost('barracks', -50), cost('stable', -50)]),
    ('limes', 'Limes', 'military', 'defensive_tactics', 'Walls and castles cost half.', [cost('walls', -50), cost('castle', -50)]),
    ('lookouts', 'Lookouts', 'military', 'defensive_tactics', 'Land units see one hex further.', [{'effect': 'sightBonus', 'amount': 1, 'domain': 'land'}]),
    ('maritime_raiders', 'Maritime Raiders', 'military', 'naval_tradition', 'Sea units move one hex further.', [{'effect': 'moveBonus', 'amount': 1, 'domain': 'sea'}]),
    ('feudal_contract', 'Feudal Contract', 'military', 'feudalism', 'Anti-cavalry units cost half.', [cost('anti_cavalry', -50)]),
    ('professional_army', 'Professional Army', 'military', 'mercenaries', 'Land units cost 15% less.', [cost('landUnits', -15)]),
    ('chivalry', 'Chivalry', 'military', 'divine_right', 'Cavalry moves one hex further.', [{'effect': 'moveBonus', 'amount': 1, 'class': 'cavalry'}]),
    ('press_gangs', 'Press Gangs', 'military', 'exploration', 'Sea units cost half.', [cost('seaUnits', -50)]),
    # Economic
    ('urban_planning', 'Urban Planning', 'economic', 'code_of_laws', '+1 production in every city.', [y('production', 1)]),
    ('god_king', 'God King', 'economic', 'code_of_laws', '+1 gold and +1 faith in the capital.', [y('gold', 1, 'capital'), y('faith', 1, 'capital')]),
    ('skilled_labour', 'Skilled Labour', 'economic', 'craftsmanship', 'Builders cost 30% less.', [cost('builder', -30)]),
    ('caravans', 'Caravans', 'economic', 'foreign_trade', '+3 gold in the capital.', [y('gold', 3, 'capital')]),
    ('colonisation', 'Colonisation', 'economic', 'early_empire', 'Settlers cost half.', [cost('settler', -50)]),
    ('frontier_grants', 'Frontier Grants', 'economic', 'early_empire', 'Borders grow 50% faster.', [{'effect': 'borderGrowthPercent', 'amount': 50}]),
    ('corvee', 'Corvee', 'economic', 'state_workforce', 'Wonders cost 15% less.', [cost('wonders', -15)]),
    ('insulae', 'Insulae', 'economic', 'games_recreation', '+1 amenity in every city.', [{'effect': 'amenityBonus', 'amount': 1}]),
    ('natural_philosophy', 'Natural Philosophy', 'economic', 'recorded_history', '+10% science.', [pct('science', 10)]),
    ('serfdom', 'Serfdom', 'economic', 'feudalism', 'Cities grow 15% faster.', [{'effect': 'growthPercent', 'amount': 15}]),
    ('town_charters', 'Town Charters', 'economic', 'guilds', '+15% gold.', [pct('gold', 15)]),
    ('trade_fairs', 'Trade Fairs', 'economic', 'medieval_faires', '+2 gold in every city.', [y('gold', 2)]),
    ('grand_tour', 'Grand Tour', 'economic', 'humanism', 'Wonders cost 25% less.', [cost('wonders', -25)]),
    ('simultaneum', 'Simultaneum', 'economic', 'reformed_church', '+2 faith in every city.', [y('faith', 2)]),
    ('rationalism', 'Rationalism', 'economic', 'mercantilism', '+15% science and +5% production.', [pct('science', 15), pct('production', 5)]),
    # Diplomatic
    ('charismatic_leader', 'Charismatic Leader', 'diplomatic', 'political_philosophy', '+2 culture in the capital.', [y('culture', 2, 'capital')]),
    ('patronage', 'Patronage', 'diplomatic', 'theatre', '+10% culture.', [pct('culture', 10)]),
    ('royal_envoys', 'Royal Envoys', 'diplomatic', 'divine_right', '+1 culture in every city.', [y('culture', 1)]),
    ('merchant_league', 'Merchant League', 'diplomatic', 'diplomatic_service', '+10% gold and +1 amenity in the capital.', [pct('gold', 10), {'effect': 'amenityBonus', 'amount': 1, 'scope': 'capital'}]),
]

# id, name, civic, slots, description, effects
GOVERNMENTS = [
    ('chiefdom', 'Chiefdom', 'code_of_laws', {'military': 1, 'economic': 1}, 'The first government: one military and one economic card.', []),
    ('autocracy', 'Autocracy', 'political_philosophy', {'military': 2, 'economic': 1, 'diplomatic': 1, 'wildcard': 1}, 'Rule by one: +2 production and +1 gold in the capital, and land units cost 10% less.', [y('production', 2, 'capital'), y('gold', 1, 'capital'), cost('landUnits', -10)]),
    ('republic', 'Republic', 'political_philosophy', {'military': 1, 'economic': 2, 'diplomatic': 1, 'wildcard': 1}, 'Rule by the citizens: +1 gold in every city and +5% science.', [y('gold', 1), pct('science', 5)]),
    ('monarchy', 'Monarchy', 'divine_right', {'military': 2, 'economic': 2, 'diplomatic': 1, 'wildcard': 1}, 'A crowned house: walls cost half and +2 culture in the capital.', [cost('walls', -50), y('culture', 2, 'capital')]),
]

pol_by_civic = collections.defaultdict(list)
for p in POLICIES: pol_by_civic[p[3]].append(p[0])
gov_by_civic = collections.defaultdict(list)
for g in GOVERNMENTS: gov_by_civic[g[2]].append(g[0])

civics = []
for cid, name, era, col, row, c, req, boost in CIVICS:
    e = collections.OrderedDict([('id', cid), ('nameKey', T(f'civic.{cid}.name', name)), ('era', era), ('cost', c), ('requires', req), ('treePos', {'col': col, 'row': row})])
    if boost:
        trig, bid, count, btext = boost
        b = collections.OrderedDict([('trigger', trig), ('count', count), ('textKey', T(f'boost.civic.{cid}', btext))])
        if bid: b['id'] = bid
        e['boost'] = b
    ul = collections.OrderedDict()
    if gov_by_civic[cid]: ul['governments'] = gov_by_civic[cid]
    if pol_by_civic[cid]: ul['policies'] = pol_by_civic[cid]
    if ul: e['unlocks'] = ul
    civics.append(e)
dump('civics.json', 'civics', civics)

govs = []
for gid, name, civic, slots, desc, effects in GOVERNMENTS:
    e = collections.OrderedDict([('id', gid), ('nameKey', T(f'government.{gid}.name', name)), ('descriptionKey', T(f'government.{gid}.text', desc)), ('slots', slots)])
    if effects: e['effects'] = effects
    e['requires'] = {'civic': civic}
    govs.append(e)
dump('governments.json', 'governments', govs)

pols = []
for pid, name, slot, civic, desc, effects in POLICIES:
    pols.append(collections.OrderedDict([('id', pid), ('nameKey', T(f'policy.{pid}.name', name)), ('descriptionKey', T(f'policy.{pid}.text', desc)), ('slot', slot), ('effects', effects), ('requires', {'civic': civic})]))
dump('policies.json', 'policies', pols)

# The palace gives every faction one wildcard slot (freePolicySlot), from its capital.
b = load('buildings.json')['entries']
for e in b:
    if e['id'] == 'palace':
        e['effects'] = [{'effect': 'freePolicySlot', 'slot': 'wildcard', 'amount': 1}]
        text['building.palace.text'] = 'The seat of government: production, gold, science, culture, an amenity, and one wildcard policy slot.'
dump('buildings.json', 'buildings', b)

tx = load('text/en-GB.json'); tx['strings'].update(text)
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')
m = load('mod.json')
for f in ['civics.json', 'governments.json', 'policies.json']:
    if f not in m['files']: m['files'].insert(m['files'].index('techs.json') + 1, f)
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print(len(civics), 'civics;', len(govs), 'governments;', len(pols), 'policies')
