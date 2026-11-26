# Phase 17: the Witcher conversion (docs/PLAN.md section 4.8), a data-only mod
# that stacks on base-ancient. Re-runnable: python3 tools/gen/witcher.py
#
# Setting names (kingdoms, cities, rulers, faiths) come from the Northern Wars
# project's data; every sentence here is original wording in British English.
import json, collections, os
W = 'rules/witcher/'
os.makedirs(W + 'text', exist_ok=True)
os.makedirs(W + 'skin', exist_ok=True)
OD = collections.OrderedDict
text = {}
def T(k, v): text[k] = v; return k

def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(W + name, 'w').write('\n'.join(lines))

# ---------- Factions, leaders, unique units and buildings ----------
# id, name, adjective, description, colours, start bias, trait (id, name, text, effects),
# leader (id, name, trait id, trait name, trait text, effects, agenda id, name, text, likes, hates, personality, bias),
# unique unit, unique building, city names
U = lambda **k: k
FACTIONS = [
    dict(id='temeria', name='Temeria', adj='Temerian', desc='A rich northern crown of farmland and river towns, ruled from Vizima.',
         colours=('#1f3a6b', '#ece4cf'), bias={'terrain': ['grassland', 'plains']},
         trait=('lily_crown', 'The Lily Crown', 'Every city gains +1 gold, and cities grow 10% faster.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 1}, {'effect': 'growthPercent', 'amount': 10}]),
         leader=('foltest', 'Foltest', 'kings_peace', "The King's Peace", '+1 production in every city.', [{'effect': 'yieldBonus', 'yield': 'production', 'amount': 1}],
                 'lion_of_vizima', 'The Lion of Vizima', 'Respects rulers who keep their word; despises surprise attacks.', 'keptPromises', 'surpriseWar', 'builder_conqueror',
                 {'conquest': 1.2, 'science': 1.0, 'culture': 1.0, 'religious': 0.9, 'score': 1.1}),
         unit=U(id='blue_stripes', name='Blue Stripes', text='Temeria\'s commandos: a scout that fights like a warrior and moves through rough country.', cls='recon', era='ancient', strength=24, moves=3, cost=45, replaces='scout', requires={}, tags=['infantry']),
         building=U(id='royal_granary', name='Royal granary', text='Temeria\'s granary: +3 food and +1 gold.', replaces='granary', yields={'food': 3, 'gold': 1}, tech='pottery', cost=65),
         cities=['Vizima', 'Maribor', 'Gors Velen', 'Ellander', 'Carreras', 'Wyzima Castle', 'White Bridge', 'Anchor', 'Dorian', 'Tegmond', 'Acorn Bay', 'Findetann', 'Murky Waters', 'White Orchard', 'Brenna', 'Mayena']),
    dict(id='redania', name='Redania', adj='Redanian', desc='The largest northern kingdom, home of great Novigrad and the scholars of Oxenfurt.',
         colours=('#a3171b', '#f0e6d2'), bias={'terrain': ['plains', 'grassland']},
         trait=('eyes_of_the_crown', 'Eyes of the Crown', 'Spies cost 50% less, and the capital gains +2 science.', [{'effect': 'costPercent', 'target': 'spy', 'amount': -50}, {'effect': 'yieldBonus', 'yield': 'science', 'amount': 2, 'scope': 'capital'}]),
         leader=('radovid', 'Radovid', 'cold_reason', 'Cold Reason', '+10% science in every city.', [{'effect': 'yieldPercent', 'yield': 'science', 'amount': 10}],
                 'steel_hand', 'The Steel Hand', 'Admires a strong army; scorns rulers who neglect theirs.', 'largeArmy', 'weakArmy', 'conqueror',
                 {'conquest': 1.3, 'science': 1.1, 'culture': 0.9, 'religious': 0.9, 'score': 1.0}),
         unit=U(id='redanian_crossbowman', name='Redanian crossbowman', text='Redania\'s archer: steadier and harder hitting than the bowmen it replaces.', cls='ranged', era='ancient', strength=17, ranged=28, moves=2, cost=65, replaces='archer', requires={'tech': 'archery'}, tags=['infantry']),
         building=U(id='oxenfurt_college', name='Oxenfurt college', text='Redania\'s university: +5 science and +1 culture.', replaces='university', yields={'science': 5, 'culture': 1}, tech='education', cost=240, era='classical'),
         cities=['Tretogor', 'Novigrad', 'Oxenfurt', 'Rinde', 'Gelibol', 'Montecalvo', 'Murivel', 'Blaviken', 'Luton', 'Roggeven', 'Baldhorn', 'Coppertown', 'Pindal', 'Jamurlak', 'Egremont', 'Drakenborg']),
    dict(id='kaedwen', name='Kaedwen', adj='Kaedweni', desc='A hard, mountainous kingdom on the edge of the wilds, proud of its soldiers.',
         colours=('#4a5d3a', '#d9c27a'), bias={'terrain': ['tundra', 'plains'], 'avoid': ['desert']},
         trait=('mountain_watch', 'The Mountain Watch', 'Walls cost 50% less; units heal 5 more each turn.', [{'effect': 'costPercent', 'target': 'walls', 'amount': -50}, {'effect': 'healBonus', 'amount': 5}]),
         leader=('henselt', 'Henselt', 'iron_levy', 'The Iron Levy', 'Melee units cost 15% less.', [{'effect': 'costPercent', 'target': 'melee', 'amount': -15}],
                 'king_of_the_north', 'King of the North', 'Wants a large realm; looks down on rulers with few cities.', 'largeEmpire', 'fewCities', 'conqueror',
                 {'conquest': 1.4, 'science': 0.8, 'culture': 0.9, 'religious': 0.9, 'score': 1.0}),
         unit=U(id='kaedweni_halberdier', name='Kaedweni halberdier', text='Kaedwen\'s spearman: a longer blade and a stubborn line.', cls='anti_cavalry', era='ancient', strength=29, moves=2, cost=65, replaces='spearman', requires={'tech': 'bronze_working'}, tags=['infantry']),
         building=U(id='border_keep', name='Border keep', text='Kaedwen\'s walls: +100 city defence and +1 production.', replaces='walls', yields={'production': 1}, defence=100, tech='masonry', cost=80),
         cities=['Ard Carraigh', 'Vattweir', 'Daevon', 'Leyda', 'Ban Glean', 'Ban Ard', 'Kaer Morhen', 'Est Haemlet', 'Tiel', 'Kalkar', 'Hagge Pass', 'Grey Rock', 'Kestrel Ford', 'Pinewatch', 'Coldwell', 'Blue Mountain']),
    dict(id='aedirn', name='Aedirn', adj='Aedirnian', desc='A wealthy kingdom of mines and markets in the shadow of the Mahakam mountains.',
         colours=('#c8a028', '#5a1e1e'), bias={'terrain': ['grassland', 'plains']},
         trait=('dwarven_partners', 'Dwarven Partners', 'Mines give +1 production and +1 gold.', [{'effect': 'tileYield', 'yield': 'production', 'amount': 1, 'improvement': 'mine'}, {'effect': 'tileYield', 'yield': 'gold', 'amount': 1, 'improvement': 'mine'}]),
         leader=('demavend', 'Demavend', 'royal_treasury', 'The Royal Treasury', '+2 gold in the capital and markets cost 25% less.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 2, 'scope': 'capital'}, {'effect': 'costPercent', 'target': 'market', 'amount': -25}],
                 'quiet_borders', 'Quiet Borders', 'Values peace; hates rulers who invade their neighbours.', 'peace', 'invaders', 'builder',
                 {'conquest': 0.8, 'science': 1.1, 'culture': 1.1, 'religious': 1.0, 'score': 1.2}),
         unit=U(id='aedirnian_militia', name='Aedirnian militia', text='Aedirn\'s warriors: cheap, plentiful and better armed than most.', cls='melee', era='ancient', strength=23, moves=2, cost=40, replaces='warrior', requires={}, tags=['infantry']),
         building=U(id='guild_exchange', name='Guild exchange', text='Aedirn\'s market: +4 gold.', replaces='market', yields={'gold': 4}, tech='currency', cost=90),
         cities=['Vengerberg', 'Vergen', 'Hagge', 'Asheberg', 'Gulet', 'Eysenlaan', 'Aldersberg', 'Hoshberg', 'Spalla', 'Scala', 'Dillmoor', 'Ratsburg', 'Lyria', 'Rivia', 'Riverbend', 'Stonecross']),
    dict(id='nilfgaard', name='Nilfgaard', adj='Nilfgaardian', desc='The great southern empire, disciplined and patient, forever pressing north across the Yaruga.',
         colours=('#111111', '#d4a017'), bias={'terrain': ['plains', 'desert']},
         trait=('imperial_provinces', 'Imperial Provinces', 'Settlers cost 20% less; captured cities gain +10% production.', [{'effect': 'costPercent', 'target': 'settler', 'amount': -20}, {'effect': 'yieldPercent', 'yield': 'production', 'amount': 10, 'scope': 'capturedCities'}]),
         leader=('emhyr', 'Emhyr', 'white_flame', 'The White Flame', '+10% production in the capital and +1 culture in every city.', [{'effect': 'yieldPercent', 'yield': 'production', 'amount': 10, 'scope': 'capital'}, {'effect': 'yieldBonus', 'yield': 'culture', 'amount': 1}],
                 'empire_without_end', 'An Empire Without End', 'Admires great realms; looks down on rulers with few cities.', 'largeEmpire', 'fewCities', 'builder_conqueror',
                 {'conquest': 1.4, 'science': 1.1, 'culture': 1.0, 'religious': 0.8, 'score': 1.0}),
         unit=U(id='impera_guard', name='Impera Guard', text='The Emperor\'s elite heavy infantry, tougher than the swordsmen they replace. Needs iron.', cls='melee', era='classical', strength=42, moves=2, cost=120, replaces='swordsman', requires={'tech': 'iron_working', 'resource': 'iron'}, tags=['infantry']),
         building=U(id='imperial_garrison', name='Imperial garrison', text='Nilfgaard\'s barracks: +1 production and +1 amenity.', replaces='barracks', yields={'production': 1}, amenities=1, tech='bronze_working', cost=70),
         cities=['City of Golden Towers', 'Nazair', 'Metinna', 'Vellmont', 'Rhys-Rhun', 'Wyndhal', 'Assengard', 'Tergano', 'Dun Turga', 'Corvaine', 'Ebbing', 'Tarnmouth', 'Fennick', 'Saltreeve', 'Cintra', 'Attre']),
    dict(id='skellige', name='Skellige', adj='Skelligan', desc='Islands of storm-wise clans who live by the sea and the axe.',
         colours=('#2e5e7e', '#c9b88a'), bias={'terrain': ['coast', 'tundra']},
         trait=('clans_of_the_isles', 'Clans of the Isles', 'Sea units move 1 further and cost 25% less.', [{'effect': 'moveBonus', 'amount': 1, 'domain': 'sea'}, {'effect': 'costPercent', 'target': 'seaUnits', 'amount': -25}]),
         leader=('bran', 'Bran', 'raiders_tithe', "The Raider's Tithe", 'Every city gains +1 faith and +1 production.', [{'effect': 'yieldBonus', 'yield': 'faith', 'amount': 1}, {'effect': 'yieldBonus', 'yield': 'production', 'amount': 1, 'scope': 'capital'}],
                 'masters_of_the_sea', 'Masters of the Sea', 'Respects a strong fleet; scorns rulers without one.', 'navy', 'noNavy', 'explorer',
                 {'conquest': 1.2, 'science': 0.9, 'culture': 1.0, 'religious': 1.2, 'score': 1.0}),
         unit=U(id='drakkar', name='Drakkar', text='Skellige\'s longship: faster and harder than the galley it replaces.', cls='naval_melee', era='ancient', strength=30, moves=4, cost=70, replaces='trireme', requires={'tech': 'sailing'}, tags=['ship']),
         building=U(id='mead_hall', name='Mead hall', text='Skellige\'s arena: +2 amenities and +1 faith.', replaces='arena', yields={'faith': 1}, amenities=2, tech='construction', cost=90),
         cities=['Kaer Trolde', 'Arinbjorn', "Holmstein's Port", 'Kaer Muire', 'Svorlag', 'Larvik', 'Fyresdal', 'Urialla', 'Rogne', 'Lofoten', 'Harviken', 'Gedyneith', 'Kaer Gelen', 'Spikeroog', 'An Skellig', 'Hindarsfjall']),
    dict(id='kovir', name='Kovir', adj='Kovirian', desc='A cold, rich northern realm of merchants and mines that prefers coin to war.',
         colours=('#6b4c9a', '#e3d5a5'), bias={'terrain': ['tundra', 'coast']},
         trait=('merchant_princes', 'Merchant Princes', 'Mines give +1 gold, and banks cost 50% less.', [{'effect': 'tileYield', 'yield': 'gold', 'amount': 1, 'improvement': 'mine'}, {'effect': 'costPercent', 'target': 'bank', 'amount': -50}]),
         leader=('esterad', 'Esterad', 'neutral_crown', 'The Neutral Crown', '+15% gold in every city.', [{'effect': 'yieldPercent', 'yield': 'gold', 'amount': 15}],
                 'friends_in_every_port', 'Friends in Every Port', 'Admires rulers with many friends; distrusts the isolated.', 'manyFriends', 'isolation', 'trader',
                 {'conquest': 0.7, 'science': 1.2, 'culture': 1.1, 'religious': 0.9, 'score': 1.3}),
         unit=U(id='kovirian_cuirassier', name='Kovirian cuirassier', text='Kovir\'s mercenary horse: heavier than the horsemen it replaces. Needs horses.', cls='cavalry', era='classical', strength=39, moves=4, cost=90, replaces='horseman', requires={'tech': 'horseback_riding', 'resource': 'horses'}, tags=['mounted']),
         building=U(id='counting_house', name='Counting house', text='Kovir\'s bank: +5 gold.', replaces='bank', yields={'gold': 5}, tech='banking', cost=240, era='classical'),
         cities=['Pont Vanis', 'Lan Exeter', 'Talgar', 'Tridam', 'Hengfors', 'Malleore', 'Creyden', 'Crinfrid', 'Barefield', 'Tancarville', 'Narok', 'Velhad', 'Toyne', 'Ard Gaeth', 'Caingorn', 'Gelibol Sound']),
    dict(id='scoiatael', name="Scoia'tael", adj="Scoia'tael", desc='Elven and dwarven commandos of the forests, fighting to win back the land of the Elder Races.',
         colours=('#3a6b35', '#d8c690'), bias={'terrain': ['grassland'], 'avoid': ['desert', 'tundra']},
         trait=('children_of_the_forest', 'Children of the Forest', 'Forests give +1 production; land units move 1 further.', [{'effect': 'tileYield', 'yield': 'production', 'amount': 1, 'feature': 'forest'}, {'effect': 'moveBonus', 'amount': 1, 'domain': 'land'}]),
         leader=('francesca', 'Francesca', 'daisy_of_the_valleys', 'Daisy of the Valleys', '+1 culture and +1 amenity in the capital.', [{'effect': 'yieldBonus', 'yield': 'culture', 'amount': 1}, {'effect': 'amenityBonus', 'amount': 1, 'scope': 'capital'}],
                 'old_blood', 'The Old Blood', 'Keeps to herself; hates rivals who settle close to her people.', 'distance', 'settledNear', 'philosopher',
                 {'conquest': 1.0, 'science': 1.1, 'culture': 1.4, 'religious': 0.9, 'score': 1.0}),
         unit=U(id='squirrel_archer', name='Squirrel archer', text="The Scoia'tael's bowmen: quick through the trees, deadly from cover.", cls='ranged', era='ancient', strength=16, ranged=27, moves=3, cost=60, replaces='archer', requires={'tech': 'archery'}, tags=['infantry']),
         building=U(id='aen_seidhe_garden', name='Aen Seidhe garden', text="The Scoia'tael's amphitheatre: +4 culture and +1 amenity. Needs a monument.", replaces='amphitheatre', yields={'culture': 4}, amenities=1, tech='drama_poetry', cost=110, needs=['monument'], influence=2),
         cities=['Dol Blathanna', 'Ban Blathanna', 'Lower Posada', 'Duen Canell', 'Shaerrawedd', 'Loc Muinne', 'Tir Tochair', 'Ard Modron', 'Aen Arse', 'Brokilon Glade', 'Elder Grove', 'Silverleaf', 'Mahakam Gate', 'Mount Carbon', 'Glevitzingen', 'Mirefall']),
]

factions, leaders, units, buildings, cityNames = [], [], [], [], []
factions.append({'op': 'remove', 'where': {'tags': {'has': 'historical'}}, 'cascade': True})
for f in FACTIONS:
    fid = f['id']
    tid, tname, ttext, tfx = f['trait']
    lid, lname, ltid, ltname, lttext, ltfx, aid, aname, atext, likes, hates, pers, bias = f['leader']
    u, b = f['unit'], f['building']
    factions.append(OD([('id', fid), ('nameKey', T(f'faction.{fid}.name', f['name'])), ('adjectiveKey', T(f'faction.{fid}.adj', f['adj'])),
        ('descriptionKey', T(f'faction.{fid}.text', f['desc'])),
        ('colours', {'primary': f['colours'][0], 'secondary': f['colours'][1]}), ('leaders', [lid]), ('startBias', f['bias']),
        ('trait', OD([('id', tid), ('nameKey', T(f'trait.{tid}.name', tname)), ('descriptionKey', T(f'trait.{tid}.text', ttext)), ('effects', tfx)])),
        ('uniqueUnits', [u['id']]), ('uniqueBuildings', [b['id']]), ('cityNames', f'w_{fid}'), ('tags', ['witcher'])]))
    leaders.append(OD([('id', lid), ('faction', fid), ('nameKey', T(f'leader.{lid}.name', lname)),
        ('trait', OD([('id', ltid), ('nameKey', T(f'trait.{ltid}.name', ltname)), ('descriptionKey', T(f'trait.{ltid}.text', lttext)), ('effects', ltfx)])),
        ('agenda', OD([('id', aid), ('nameKey', T(f'agenda.{aid}.name', aname)), ('descriptionKey', T(f'agenda.{aid}.text', atext)), ('likes', likes), ('hates', hates), ('weight', 6)])),
        ('portrait', f'leader.{lid}'), ('ai', OD([('personality', pers), ('victoryBias', bias)]))]))
    ue = OD([('id', u['id']), ('nameKey', T(f"unit.{u['id']}.name", u['name'])), ('class', u['cls']), ('era', u['era']), ('strength', u['strength'])])
    if 'ranged' in u: ue['rangedStrength'] = u['ranged']; ue['range'] = 2
    ue.update([('moves', u['moves']), ('cost', u['cost']), ('upkeep', 1), ('requires', {**u['requires'], 'faction': fid}), ('replaces', u['replaces']),
               ('sprite', f"unit.{u['id']}"), ('tags', u['tags']), ('descriptionKey', T(f"unit.{u['id']}.text", u['text']))])
    if u['cls'] == 'naval_melee': ue['domain'] = 'sea'
    units.append(ue)
    be = OD([('id', b['id']), ('nameKey', T(f"building.{b['id']}.name", b['name'])), ('descriptionKey', T(f"building.{b['id']}.text", b['text'])),
             ('era', b.get('era', 'ancient')), ('cost', b['cost']), ('upkeep', 1), ('icon', f"building.{b['id']}")])
    if b.get('yields'): be['yields'] = b['yields']
    if b.get('amenities'): be['amenities'] = b['amenities']
    if b.get('defence'): be['defence'] = b['defence']
    if b.get('influence'): be['influence'] = b['influence']
    req = {'faction': fid, 'tech': b['tech']}
    if b.get('needs'): req['buildings'] = b['needs']
    be['requires'] = req
    be['replaces'] = b['replaces']
    buildings.append(be)
    cityNames.append(OD([('id', f'w_{fid}'), ('names', f['cities'])]))

# Witchers: a school anyone can build, and monster hunters trained there.
buildings.append(OD([('id', 'witcher_school'), ('nameKey', T('building.witcher_school.name', 'Witcher school')),
    ('descriptionKey', T('building.witcher_school.text', 'A hall where witchers are trained: lets this city train witchers. +1 science.')),
    ('era', 'ancient'), ('cost', 90), ('upkeep', 1), ('icon', 'building.witcher_school'), ('yields', {'science': 1}), ('requires', {'tech': 'bronze_working'})]))
units.append(OD([('id', 'witcher'), ('nameKey', T('unit.witcher.name', 'Witcher')), ('class', 'melee'), ('era', 'ancient'), ('strength', 32), ('moves', 3), ('cost', 80), ('upkeep', 1),
    ('requires', {'tech': 'bronze_working', 'building': 'witcher_school'}), ('abilities', [{'effect': 'combatBonus', 'amount': 15, 'vs': {'tags': 'monster'}}]),
    ('sprite', 'unit.witcher'), ('tags', ['infantry']), ('descriptionKey', T('unit.witcher.text', 'A mutant monster hunter, swift and sure: +15 against monsters. Needs a witcher school.'))]))

# Monsters: the raiders of this setting. Only raiders field them.
MON = [('drowner', 'Drowner', 'Pale things from the marshes that drag travellers under.', 20, 2), ('nekker', 'Nekker', 'Small, quick and many: they swarm whatever strays near their burrows.', 26, 3),
       ('ghoul', 'Ghoul', 'Corpse-eaters drawn to battlefields, harder to kill than they look.', 32, 2), ('wyvern', 'Wyvern', 'A winged beast that strikes from the sky and is gone again.', 40, 4)]
for mid, mname, mtext, st, mv in MON:
    units.append(OD([('id', mid), ('nameKey', T(f'unit.{mid}.name', mname)), ('class', 'melee'), ('era', 'ancient'), ('strength', st), ('moves', mv), ('cost', 50),
        ('raiderOnly', True), ('sprite', f'unit.{mid}'), ('tags', ['monster']), ('descriptionKey', T(f'unit.{mid}.text', mtext))]))
# Two base units change their look in the north.
units.append({'op': 'change', 'id': 'spearman', 'set': {'sprite': 'unit.pikeman_north'}})
units.append({'op': 'change', 'id': 'scout', 'set': {'sprite': 'unit.scout_north'}})

cityNames.insert(0, {'op': 'remove', 'where': {'tags': {'has': 'historical'}}})

dump('factions.json', 'factions', factions)
dump('leaders.json', 'leaders', leaders)
dump('units.json', 'units', units)
dump('buildings.json', 'buildings', buildings)
dump('cityNames.json', 'cityNames', cityNames)

# ---------- Religions: the setting's faiths replace the base ones ----------
REL = [('eternal_fire', 'The Eternal Fire', '#e2582a'), ('melitele', 'Melitele', '#7fb069'), ('old_ways', 'The Old Ways', '#5d7a3a'),
       ('great_sun', 'The Great Sun', '#d4a017'), ('kreve', 'Kreve', '#8c3b2f'), ('lebioda', 'Lebioda', '#5f7fb0'), ('freya', 'Freya', '#3f7f8f')]
rel = [{'op': 'remove', 'where': {'tags': {'has': 'base'}}}]
for rid, rname, col in REL:
    rel.append(OD([('id', rid), ('nameKey', T(f'religion.{rid}.name', rname)), ('colour', col), ('tags', ['witcher'])]))
dump('religions.json', 'religions', rel)

# ---------- Events: monster nests and omens ----------
def y(yld, amount, turns): return {'effect': 'yieldBonus', 'yield': yld, 'amount': amount, 'turns': turns}
def am(amount, turns): return {'effect': 'amenityBonus', 'amount': amount, 'turns': turns}
EV = [
    ('monster_nest', 'A monster nest', 'Something has made a nest in the woods near {city}. Woodcutters will not go out.', 0.04, [{'cityPopAtLeast': 2}], False, [
        ('Hire a witcher (-3 gold a turn for 4 turns, +1 amenity for 8 turns).', [y('gold', -3, 4), am(1, 8)]),
        ('Burn the woods yourselves (-2 production for 5 turns).', [y('production', -2, 5)])]),
    ('wild_hunt_omen', 'The Wild Hunt', 'Spectral riders were seen in the sky above {city} on a frozen night. The people are afraid.', 0.02, [{'cityPopAtLeast': 4}], False, [
        ('Ring every bell and pray (+3 faith, -1 amenity, both for 6 turns).', [y('faith', 3, 6), am(-1, 6)]),
        ('Send for a sorceress to read the signs (+3 science for 6 turns, -2 gold for 6 turns).', [y('science', 3, 6), y('gold', -2, 6)])]),
    ('witch_hunters', 'Witch hunters', 'Zealots of the Eternal Fire are hunting mages and non-humans in {city}.', 0.03, [{'cityPopAtLeast': 5}], False, [
        ('Let them be (+2 faith for 8 turns, -1 amenity for 8 turns).', [y('faith', 2, 8), am(-1, 8)]),
        ('Disband them by royal order (-1 faith for 6 turns, +1 culture for 8 turns).', [y('faith', -1, 6), y('culture', 1, 8)])]),
    ('dwarven_smiths', 'Dwarven smiths', 'A dwarven clan from Mahakam asks to open a forge in {city}.', 0.03, [{'cityPopAtLeast': 3}], False, [
        ('Grant them a charter (+3 production for 10 turns).', [y('production', 3, 10)]),
        ('Tax their wares (+4 gold a turn for 6 turns).', [y('gold', 4, 6)])]),
    ('striga_curse', 'A cursed tower', 'Folk in {city} whisper that something walks the old tower by night.', 0.015, [{'cityHasBuilding': 'palace'}], True, [
        ('Pay a witcher to lift the curse (-4 gold a turn for 5 turns).', [y('gold', -4, 5)]),
        ('Wall the tower up and hope (-2 amenities for 6 turns).', [am(-2, 6)])]),
]
ev = []
for eid, name, body, chance, conds, disaster, choices in EV:
    e = OD([('id', eid), ('nameKey', T(f'event.{eid}.name', name)), ('textKey', T(f'event.{eid}.text', body)),
            ('when', OD([('trigger', 'turnStart'), ('chance', chance), ('conditions', conds)])),
            ('choices', [OD([('textKey', T(f'event.{eid}.choice{i + 1}', ct)), ('effects', fx)]) for i, (ct, fx) in enumerate(choices)])])
    if disaster: e['disaster'] = True
    ev.append(e)
dump('events.json', 'events', ev)

# ---------- Tuning: monsters instead of raiders, a little more often ----------
tuning = OD([('contentType', 'tuning'), ('set', OD([
    ('raiders.nameKey', T('raiders.monsters', 'Monsters')),
    ('raiders.spawnEvery', 5),
    ('raiders.campEvery', 8),
    ('raiders.units', [{'fromTurn': 0, 'unit': 'drowner'}, {'fromTurn': 30, 'unit': 'nekker'}, {'fromTurn': 60, 'unit': 'ghoul'}, {'fromTurn': 100, 'unit': 'wyvern'}]),
]))])
open(W + 'tuning.json', 'w').write(json.dumps(tuning, indent=2, ensure_ascii=False) + '\n')

# ---------- Wonders and other base wording that names the real world ----------
REN = {
    'wonder.pyramids.name': 'The Mahakam Delvings', 'wonder.hanging_gardens.name': 'The Gardens of Beauclair', 'wonder.colossus.name': 'The Novigrad Harbour',
    'wonder.great_library.name': 'The Oxenfurt Library', 'wonder.temple_of_artemis.name': 'The Temple of Melitele', 'wonder.stonehenge.name': 'The Circle of Elements',
    'wonder.oracle.name': 'The Shrine of Hindarsfjall', 'wonder.great_lighthouse.name': 'The Beacon of Cidaris',
    'mapType.inland_sea.text': 'Land all round a central sea, like the waters between the northern kingdoms and the Empire.',
}
text.update(REN)
text['mod.witcher.summary'] = 'The Northern Kingdoms at war'

# ---------- Skin: a grim northern palette ----------
skin = OD([('contentType', 'skin'), ('values', OD([
    ('id', 'witcher'),
    ('palette', OD([('ink', '#1b1d22'), ('paper', '#e7e2d4'), ('accent', '#7a1f1f'), ('water', '#2a4f66'), ('land', '#7d8a5a')])),
    ('fonts', OD([('display', 'Cinzel'), ('body', 'Inter')])),
    ('art', {}), ('sounds', {}),
    ('factionColours', True),
    ('raiderColour', '#2b2b2b'),
]))])
open(W + 'skin/skin.json', 'w').write(json.dumps(skin, indent=2, ensure_ascii=False) + '\n')

open(W + 'text/en-GB.json', 'w').write(json.dumps(OD([('contentType', 'text'), ('strings', text)]), indent=2, ensure_ascii=False) + '\n')
mod = OD([('id', 'witcher'), ('name', 'The Witcher: Northern Wars'), ('version', '1.0.0'), ('type', 'conversion'), ('engine', '>=0.1.0'),
    ('description', 'The Northern Kingdoms and the Empire instead of the ancient world: eight setting factions, the setting\'s faiths, monsters for raiders and witchers to hunt them.'),
    ('dependsOn', ['base-ancient']), ('loadAfter', []), ('incompatibleWith', []), ('options', []),
    ('files', ['factions.json', 'leaders.json', 'units.json', 'buildings.json', 'cityNames.json', 'religions.json', 'events.json', 'tuning.json', 'text/en-GB.json', 'skin/skin.json']),
    ('credits', 'Original Atlas content, MIT licence. Fan work: setting names belong to their owners; no text, art or code is taken from the books or games.')])
open(W + 'mod.json', 'w').write(json.dumps(mod, indent=2, ensure_ascii=False) + '\n')
print(len(factions) - 1, 'factions,', len(units), 'unit entries,', len(buildings), 'buildings,', len(rel) - 1, 'religions,', len(ev), 'events,', len(text), 'strings')
