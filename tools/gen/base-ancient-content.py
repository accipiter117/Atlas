# Generates base-ancient's units, buildings, wonders, improvements, factions,
# leaders and city names (phase 6) so ids, text keys and references stay in
# step. Run from the repo root: python3 tools/gen/base-ancient-content.py
# The JSON it writes is the source of truth afterwards; edit either.
import json, collections
B = 'rules/base-ancient/'
text = {}

def T(key, value):
    text[key] = value
    return key

def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [']
    lines.append(',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries))
    lines += ['  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

# ---------- Units ----------
units = json.load(open(B + 'units.json'))['entries']
base_units = {u['id']: u for u in units}
def unit(id, name, desc, **kw):
    e = {'id': id, 'nameKey': T(f'unit.{id}.name', name), 'descriptionKey': T(f'unit.{id}.text', desc)}
    e.update(kw)
    e.setdefault('domain', 'land'); e.setdefault('sight', 2); e.setdefault('upkeep', 1)
    e.setdefault('sprite', f'unit.{id}')
    return e
for u in units:
    desc = {
        'settler': 'Founds a new city.', 'builder': 'Builds farms, mines and other improvements. Each use spends a charge.',
        'warrior': 'Cheap early infantry.', 'scout': 'Fast and far-sighted; built to explore.',
        'slinger': 'Weak ranged infantry for the earliest wars.', 'spearman': 'Sturdy infantry that holds against cavalry.',
    }[u['id']]
    u['descriptionKey'] = T(f'unit.{u["id"]}.text', desc)
extra = [
    unit('archer', 'Archer', 'Ranged infantry that wears down attackers from two hexes.', **{'class': 'ranged', 'era': 'ancient', 'strength': 15, 'rangedStrength': 25, 'range': 2, 'moves': 2, 'cost': 60, 'tags': ['infantry']}),
    unit('horseman', 'Horseman', 'Fast light cavalry. Needs horses.', **{'class': 'cavalry', 'era': 'classical', 'strength': 36, 'moves': 4, 'cost': 80, 'requires': {'resource': 'horses'}, 'tags': ['mounted']}),
    unit('chariot', 'Heavy chariot', 'Hard-hitting chariot for open ground. Needs horses.', **{'class': 'cavalry', 'era': 'ancient', 'strength': 28, 'moves': 3, 'cost': 65, 'requires': {'resource': 'horses'}, 'tags': ['mounted']}),
    unit('swordsman', 'Swordsman', 'Iron-armed infantry, the backbone of classical armies. Needs iron.', **{'class': 'melee', 'era': 'classical', 'strength': 35, 'moves': 2, 'cost': 90, 'upkeep': 2, 'requires': {'resource': 'iron'}, 'tags': ['infantry']}),
    unit('catapult', 'Catapult', 'Siege engine that batters walls from range.', **{'class': 'siege', 'era': 'classical', 'strength': 23, 'rangedStrength': 35, 'range': 2, 'moves': 2, 'cost': 120, 'upkeep': 2, 'tags': ['siege']}),
    unit('trireme', 'Trireme', 'Oared warship that hugs the coast.', **{'class': 'naval_melee', 'domain': 'sea', 'era': 'ancient', 'strength': 25, 'moves': 3, 'cost': 65, 'tags': ['ship']}),
]
uniques = [
    unit('legionary', 'Legionary', 'Roman heavy infantry; tougher than the swordsman it replaces. Needs iron.', **{'class': 'melee', 'era': 'classical', 'strength': 40, 'moves': 2, 'cost': 110, 'upkeep': 2, 'requires': {'faction': 'rome', 'resource': 'iron'}, 'replaces': 'swordsman', 'tags': ['infantry']}),
    unit('hoplite', 'Hoplite', 'Greek spearman who fights best beside another hoplite.', **{'class': 'anti_cavalry', 'era': 'ancient', 'strength': 28, 'moves': 2, 'cost': 65, 'requires': {'faction': 'greece'}, 'replaces': 'spearman', 'abilities': [{'effect': 'combatBonus', 'amount': 10, 'vs': {'class': 'cavalry'}}], 'tags': ['infantry']}),
    unit('maryannu', 'Maryannu chariot', 'Egyptian chariot archers, swift over flat land. Needs horses.', **{'class': 'cavalry', 'era': 'ancient', 'strength': 25, 'rangedStrength': 25, 'range': 1, 'moves': 4, 'cost': 70, 'requires': {'faction': 'egypt', 'resource': 'horses'}, 'replaces': 'chariot', 'tags': ['mounted']}),
    unit('immortal', 'Immortal', 'Persian guardsman who can fight hand to hand or with the bow.', **{'class': 'ranged', 'era': 'classical', 'strength': 35, 'rangedStrength': 25, 'range': 2, 'moves': 2, 'cost': 85, 'requires': {'faction': 'persia'}, 'replaces': 'archer', 'tags': ['infantry']}),
    unit('quinquereme', 'Quinquereme', 'Carthaginian warship with five banks of oars.', **{'class': 'naval_melee', 'domain': 'sea', 'era': 'ancient', 'strength': 30, 'moves': 4, 'cost': 70, 'requires': {'faction': 'carthage'}, 'replaces': 'trireme', 'tags': ['ship']}),
    unit('gaesatae', 'Gaesatae', 'Gaulish spear warriors who fight hardest against stronger foes.', **{'class': 'melee', 'era': 'ancient', 'strength': 24, 'moves': 2, 'cost': 45, 'requires': {'faction': 'gaul'}, 'replaces': 'warrior', 'tags': ['infantry']}),
    unit('woad_raider', 'Woad raider', 'British skirmisher who moves through rough country with ease.', **{'class': 'recon', 'era': 'ancient', 'strength': 20, 'moves': 3, 'sight': 3, 'cost': 45, 'requires': {'faction': 'britons'}, 'replaces': 'scout', 'tags': ['infantry']}),
    unit('crossbowman', 'Han crossbowman', 'Massed crossbows that strike hard from range.', **{'class': 'ranged', 'era': 'classical', 'strength': 20, 'rangedStrength': 32, 'range': 2, 'moves': 2, 'cost': 75, 'requires': {'faction': 'han'}, 'replaces': 'archer', 'tags': ['infantry']}),
]
for u in units:
    if u['id'] == 'warrior': u['upgradesTo'] = 'swordsman'
dump('units.json', 'units', units + extra + uniques)

# ---------- Improvements ----------
def imp(id, name, desc, **kw):
    e = {'id': id, 'nameKey': T(f'improvement.{id}.name', name), 'descriptionKey': T(f'improvement.{id}.text', desc), 'art': f'improvement.{id}'}
    e.update(kw); e.setdefault('charges', 1)
    return e
improvements = [
    imp('farm', 'Farm', '+1 food on flat grassland, plains or floodplain.', yields={'food': 1}, validTerrain=['grassland', 'plains', 'desert'], validFeatures=['floodplain']),
    imp('mine', 'Mine', '+1 production on hills; improves iron.', yields={'production': 1}, needsHills=True, validTerrain=['grassland', 'plains', 'desert', 'tundra', 'snow']),
    imp('pasture', 'Pasture', 'Improves cattle and horses.', yields={'production': 1}, needsResource=True),
    imp('plantation', 'Plantation', 'Improves wine, silk and incense.', yields={'gold': 1}, needsResource=True),
    imp('quarry', 'Quarry', 'Improves stone.', yields={'production': 1}, needsResource=True),
    imp('camp', 'Camp', 'Improves forest game.', yields={'gold': 1}, needsResource=True),
    imp('fishing_boats', 'Fishing boats', 'Improves fish; built from the shore.', yields={'food': 1}, needsResource=True, water=True),
    imp('fort', 'Fort', 'A fortified camp: +4 defence for the unit inside.', yields={}, defence=4, validTerrain=['grassland', 'plains', 'desert', 'tundra', 'snow'], validFeatures=['forest', 'jungle', 'marsh', 'floodplain', 'oasis']),
    imp('road', 'Road', 'Faster movement: half a move per hex between roads.', road=True, charges=0, validTerrain=['grassland', 'plains', 'desert', 'tundra', 'snow'], validFeatures=['forest', 'jungle', 'marsh', 'floodplain', 'oasis']),
]
dump('improvements.json', 'improvements', improvements)

res = json.load(open(B + 'resources.json'))['entries']
improve = {'wheat': ('farm', {'food': 1}), 'cattle': ('pasture', {'food': 1}), 'stone': ('quarry', {'production': 1}), 'fish': ('fishing_boats', {'food': 1}),
           'wine': ('plantation', {'gold': 1}), 'silk': ('plantation', {'gold': 1}), 'incense': ('plantation', {'gold': 1}),
           'horses': ('pasture', {'production': 1}), 'iron': ('mine', {'production': 1})}
for r in res:
    r['improvement'], r['improvedYields'] = improve[r['id']]
    if r['id'] == 'iron': r['validTerrain'] = ['plains', 'grassland', 'desert', 'tundra']
res.append({'id': 'deer', 'nameKey': T('resource.deer.name', 'Deer'), 'class': 'bonus', 'yields': {'production': 1}, 'validTerrain': ['grassland', 'plains', 'tundra'], 'validFeatures': ['forest'], 'frequency': 0.8, 'art': 'resource.deer', 'improvement': 'camp', 'improvedYields': {'gold': 1}})
dump('resources.json', 'resources', res)

# ---------- Buildings ----------
def bld(id, name, desc, cost, **kw):
    e = {'id': id, 'nameKey': T(f'building.{id}.name', name), 'descriptionKey': T(f'building.{id}.text', desc), 'era': kw.pop('era', 'ancient'), 'cost': cost, 'upkeep': kw.pop('upkeep', 1), 'icon': f'building.{id}'}
    e.update(kw)
    return e
buildings = [
    bld('palace', 'Palace', 'The seat of government. Built free in your capital.', 1, upkeep=0, yields={'production': 2, 'gold': 4, 'science': 2, 'culture': 1}, amenities=1, requires={'capital': True}),
    bld('monument', 'Monument', '+2 culture: borders grow faster.', 60, yields={'culture': 2}),
    bld('granary', 'Granary', '+2 food.', 65, yields={'food': 2}),
    bld('shrine', 'Shrine', '+2 faith.', 70, yields={'faith': 2}),
    bld('walls', 'Ancient walls', 'Stone walls: +100 city defence (used once combat arrives).', 80, upkeep=0, defence=100),
    bld('barracks', 'Barracks', '+1 production; land units built here train faster.', 90, yields={'production': 1}, effects=[{'effect': 'costPercent', 'target': 'landUnits', 'amount': -15}]),
    bld('library', 'Library', '+2 science, and +1 science for every 2 mountains in the city\'s land. One scholar slot.', 90, yields={'science': 2}, specialistSlots={'science': 1},
        adjacency=[{'yield': 'science', 'amount': 1, 'per': 2, 'countTiles': {'terrain': 'mountain'}, 'within': 'borders'}]),
    bld('market', 'Market', '+3 gold. One merchant slot.', 100, yields={'gold': 3}, specialistSlots={'gold': 1}),
    bld('lighthouse', 'Lighthouse', '+1 food and +1 gold; sea units built here cost less. Coastal cities only.', 80, yields={'food': 1, 'gold': 1}, requires={'nearTerrain': 'coast'}, effects=[{'effect': 'costPercent', 'target': 'seaUnits', 'amount': -25}]),
    bld('water_mill', 'Water mill', '+1 food and +1 production. River cities only.', 80, yields={'food': 1, 'production': 1}, requires={'river': True}),
    bld('workshop', 'Workshop', '+2 production. One artisan slot.', 110, yields={'production': 2}, specialistSlots={'production': 1}),
    bld('temple', 'Temple', '+3 faith and +1 amenity. Needs a shrine.', 110, upkeep=2, yields={'faith': 3}, amenities=1, requires={'buildings': ['shrine']}),
    bld('amphitheatre', 'Amphitheatre', '+3 culture and +1 amenity. Needs a monument.', 120, upkeep=2, yields={'culture': 3}, amenities=1, requires={'buildings': ['monument']}),
    bld('arena', 'Arena', '+2 amenities.', 130, upkeep=2, amenities=2),
    bld('aqueduct', 'Aqueduct', 'Cities grow 25% faster.', 120, effects=[{'effect': 'growthPercent', 'amount': 25}]),
    bld('harbour', 'Harbour', '+2 food and +1 gold. Coastal cities only.', 110, yields={'food': 2, 'gold': 1}, requires={'nearTerrain': 'coast'}),
    bld('stable', 'Stable', '+1 production; mounted units built here cost less.', 100, yields={'production': 1}, effects=[{'effect': 'costPercent', 'target': 'mounted', 'amount': -25}]),
    bld('forge', 'Forge', '+2 production, +1 production for every mine in the city\'s land. Needs a workshop.', 150, upkeep=2, yields={'production': 2}, requires={'buildings': ['workshop']},
        adjacency=[{'yield': 'production', 'amount': 1, 'per': 1, 'countTiles': {'improvement': 'mine'}, 'within': 'borders'}]),
    bld('bank', 'Bank', '+4 gold and +10% gold. Needs a market.', 170, era='classical', upkeep=0, yields={'gold': 4}, requires={'buildings': ['market']}, effects=[{'effect': 'yieldPercent', 'yield': 'gold', 'amount': 10}]),
    bld('university', 'University', '+3 science and +10% science. Needs a library.', 180, era='classical', upkeep=2, yields={'science': 3}, requires={'buildings': ['library']}, specialistSlots={'science': 1}, effects=[{'effect': 'yieldPercent', 'yield': 'science', 'amount': 10}]),
    bld('courthouse', 'Courthouse', '+1 gold and +1 amenity.', 100, yields={'gold': 1}, amenities=1),
    bld('herbalist', 'Herbalist', 'Units in or near this city heal 10 more each turn.', 70, effects=[{'effect': 'healBonus', 'amount': 10}]),
    bld('caravanserai', 'Caravanserai', '+2 gold, +1 for every 2 desert hexes in the city\'s land.', 90, yields={'gold': 2},
        adjacency=[{'yield': 'gold', 'amount': 1, 'per': 2, 'countTiles': {'terrain': 'desert'}, 'within': 'borders'}]),
    bld('observatory', 'Observatory', '+1 science for every mountain next to the city.', 100, yields={'science': 1},
        adjacency=[{'yield': 'science', 'amount': 1, 'per': 1, 'countTiles': {'terrain': 'mountain'}, 'within': 'adjacent'}]),
    bld('scriptorium', 'Scriptorium', '+1 science and +1 culture.', 80, yields={'science': 1, 'culture': 1}),
    bld('mint', 'Mint', '+1 gold for every mine in the city\'s land.', 120, yields={'gold': 1},
        adjacency=[{'yield': 'gold', 'amount': 1, 'per': 1, 'countTiles': {'improvement': 'mine'}, 'within': 'borders'}]),
    bld('sawmill', 'Sawmill', '+1 production for every 2 forest hexes in the city\'s land.', 90, yields={'production': 1},
        adjacency=[{'yield': 'production', 'amount': 1, 'per': 2, 'countTiles': {'feature': 'forest'}, 'within': 'borders'}]),
    bld('castle', 'Castle', '+100 more city defence. Needs ancient walls.', 160, era='classical', upkeep=0, defence=100, requires={'buildings': ['walls']}),
    bld('guildhall', 'Guildhall', '+2 gold and +1 production.', 140, era='classical', upkeep=2, yields={'gold': 2, 'production': 1}),
    bld('watchtower', 'Watchtower', 'Units built here see one hex further.', 60, effects=[{'effect': 'sightBonus', 'amount': 1}]),
]
ub = [
    bld('bath', 'Roman bath', 'Rome\'s aqueduct: cities grow 25% faster and gain +2 amenities.', 110, amenities=2, requires={'faction': 'rome'}, replaces='aqueduct', effects=[{'effect': 'growthPercent', 'amount': 25}]),
    bld('acropolis', 'Acropolis', 'Greece\'s amphitheatre: +4 culture and +1 amenity. Needs a monument.', 110, upkeep=2, yields={'culture': 4}, amenities=1, requires={'faction': 'greece', 'buildings': ['monument']}, replaces='amphitheatre'),
    bld('mortuary_temple', 'Mortuary temple', 'Egypt\'s monument: +2 culture and +1 faith.', 60, yields={'culture': 2, 'faith': 1}, requires={'faction': 'egypt'}, replaces='monument'),
    bld('pairidaeza', 'Pairidaeza', 'Persia\'s caravanserai: a walled garden giving +3 gold and +1 amenity.', 90, yields={'gold': 3}, amenities=1, requires={'faction': 'persia'}, replaces='caravanserai'),
    bld('cothon', 'Cothon', 'Carthage\'s harbour: +2 food, +1 gold, +2 production. Coastal cities only.', 110, yields={'food': 2, 'gold': 1, 'production': 2}, requires={'faction': 'carthage', 'nearTerrain': 'coast'}, replaces='harbour'),
    bld('oppidum', 'Oppidum', 'Gaul\'s walls: +100 city defence and +2 production.', 80, upkeep=0, yields={'production': 2}, defence=100, requires={'faction': 'gaul'}, replaces='walls'),
    bld('roundhouse', 'Roundhouse', 'The Britons\' granary: +3 food.', 60, yields={'food': 3}, requires={'faction': 'britons'}, replaces='granary'),
    bld('examination_hall', 'Examination hall', 'Han\'s library: +3 science and +1 culture, two scholar slots.', 90, yields={'science': 3, 'culture': 1}, specialistSlots={'science': 2}, requires={'faction': 'han'}, replaces='library'),
]
dump('buildings.json', 'buildings', buildings + ub)

def wonder(id, name, desc, era, cost, **kw):
    e = {'id': id, 'nameKey': T(f'wonder.{id}.name', name), 'descriptionKey': T(f'wonder.{id}.text', desc), 'era': era, 'cost': cost, 'upkeep': 0, 'icon': f'wonder.{id}'}
    e.update(kw)
    return e
wonders = [
    wonder('pyramids', 'Pyramids', 'Builders in every city cost 25% less, and this city gains +2 production.', 'ancient', 220, yields={'production': 2}, effects=[{'effect': 'costPercent', 'target': 'builder', 'amount': -25, 'scope': 'everyCity'}]),
    wonder('hanging_gardens', 'Hanging Gardens', 'Every city grows 15% faster.', 'ancient', 240, effects=[{'effect': 'growthPercent', 'amount': 15, 'scope': 'everyCity'}]),
    wonder('colossus', 'Colossus', '+4 gold. Coastal cities only.', 'ancient', 200, yields={'gold': 4}, requires={'nearTerrain': 'coast'}),
    wonder('great_library', 'Great Library', '+4 science and two scholar slots.', 'classical', 300, yields={'science': 4}, specialistSlots={'science': 2}),
    wonder('temple_of_artemis', 'Temple of Artemis', '+1 amenity in every city.', 'ancient', 260, effects=[{'effect': 'amenityBonus', 'amount': 1, 'scope': 'everyCity'}]),
    wonder('stonehenge', 'Stonehenge', '+4 faith.', 'ancient', 180, yields={'faith': 4}),
    wonder('oracle', 'Oracle', '+3 culture and +2 faith.', 'classical', 250, yields={'culture': 3, 'faith': 2}),
    wonder('great_lighthouse', 'Great Lighthouse', 'Sea units move one hex further. Coastal cities only.', 'ancient', 230, requires={'nearTerrain': 'coast'}, effects=[{'effect': 'moveBonus', 'amount': 1, 'domain': 'sea', 'scope': 'everyCity'}]),
]
dump('wonders.json', 'wonders', wonders)

# ---------- Factions and leaders ----------
F = [
    ('rome', 'Rome', 'Roman', '#8c1c13', '#e8c36a', ['plains', 'grassland'], ['tundra'],
     ('all_roads', 'All roads lead to Rome', 'Every new city starts with a free monument and a road to the capital.', [{'effect': 'freeBuilding', 'building': 'monument'}, {'effect': 'autoRoad', 'scope': 'cityToCapital'}]),
     'trajan', 'Trajan', ('trajans_column', 'Trajan\'s Column', '+1 production in the capital.', [{'effect': 'yieldBonus', 'yield': 'production', 'amount': 1, 'scope': 'capital'}]),
     ('optimus_princeps', 'Optimus princeps', 'Admires large empires; looks down on rulers with few cities.', 'largeEmpire', 'fewCities'),
     'legionary', 'bath', ['Roma', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Arretium', 'Mediolanum', 'Arpinum', 'Circei', 'Setia', 'Ostia', 'Velitrae', 'Tarentum', 'Brundisium', 'Capua', 'Verona']),
    ('greece', 'Greece', 'Greek', '#2c5aa0', '#f2f2f2', ['hills', 'grassland'], [],
     ('plato_republic', 'Plato\'s Republic', '+1 culture in every city.', [{'effect': 'yieldBonus', 'yield': 'culture', 'amount': 1}]),
     'pericles', 'Pericles', ('golden_age', 'Age of Pericles', '+10% culture in every city.', [{'effect': 'yieldPercent', 'yield': 'culture', 'amount': 10}]),
     ('delian_league', 'Delian League', 'Values friends who trade and talk; distrusts loners.', 'manyFriends', 'isolation'),
     'hoplite', 'acropolis', ['Athens', 'Sparta', 'Corinth', 'Argos', 'Thebes of Boeotia', 'Delphi', 'Eretria', 'Megara', 'Rhodes', 'Syracuse', 'Miletus', 'Ephesus', 'Olympia', 'Chalcis', 'Pylos', 'Mycenae']),
    ('egypt', 'Egypt', 'Egyptian', '#1f5fa8', '#e6c34a', ['desert', 'plains'], ['tundra', 'snow'],
     ('gifts_of_the_river', 'Gifts of the river', '+1 food on every floodplain, and wonders cost 15% less.', [{'effect': 'tileYield', 'yield': 'food', 'amount': 1, 'feature': 'floodplain'}, {'effect': 'costPercent', 'target': 'wonders', 'amount': -15}]),
     'hatshepsut', 'Hatshepsut', ('expedition_to_punt', 'Expedition to Punt', '+1 gold in every city.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 1}]),
     ('great_builder', 'Great builder', 'Respects rulers who raise wonders; scorns those who raze cities.', 'wonders', 'razing'),
     'maryannu', 'mortuary_temple', ['Thebes', 'Memphis', 'Akhetaten', 'Heliopolis', 'Abydos', 'Elephantine', 'Hermopolis', 'Bubastis', 'Sais', 'Edfu', 'Kom Ombo', 'Tanis', 'Avaris', 'Buto', 'Nekhen', 'Coptos']),
    ('persia', 'Persia', 'Persian', '#6b3a8c', '#f0c05a', ['plains', 'desert'], [],
     ('satrapies', 'Satrapies', '+2 gold in the capital, and land units move one hex further.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 2, 'scope': 'capital'}, {'effect': 'moveBonus', 'amount': 1, 'domain': 'land'}]),
     'cyrus', 'Cyrus', ('king_of_kings', 'King of kings', 'Units cost 10% less gold to keep.', [{'effect': 'upkeepPercent', 'target': 'units', 'amount': -10}]),
     ('fall_of_babylon', 'The road to Babylon', 'Likes rivals who keep their word; hates surprise wars.', 'keptPromises', 'surpriseWar'),
     'immortal', 'pairidaeza', ['Pasargadae', 'Persepolis', 'Susa', 'Ecbatana', 'Babylon', 'Sardis', 'Gordium', 'Bactra', 'Arbela', 'Gaza', 'Tarsus', 'Rhagae', 'Zranka', 'Hecatompylos', 'Maracanda', 'Carmana']),
    ('carthage', 'Carthage', 'Carthaginian', '#7a2e8c', '#e4e4e4', ['coast', 'plains'], [],
     ('merchant_republic', 'Merchant republic', 'Harbours and lighthouses cost 50% less, and ships move one hex further.', [{'effect': 'costPercent', 'target': 'harbour', 'amount': -50}, {'effect': 'costPercent', 'target': 'lighthouse', 'amount': -50}, {'effect': 'moveBonus', 'amount': 1, 'domain': 'sea'}]),
     'dido', 'Dido', ('founder_of_carthage', 'Founder of Carthage', '+1 gold and +1 production in the capital.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 1, 'scope': 'capital'}, {'effect': 'yieldBonus', 'yield': 'production', 'amount': 1, 'scope': 'capital'}]),
     ('queen_of_the_sea', 'Queen of the sea', 'Respects great navies; dislikes rivals with none.', 'navy', 'noNavy'),
     'quinquereme', 'cothon', ['Qart-hadasht', 'Utica', 'Hippo', 'Hadrumetum', 'Leptis', 'Gades', 'Malaca', 'Panormus', 'Motya', 'Lilybaeum', 'Tharros', 'Nora', 'Sulcis', 'Kerkouane', 'Thapsus', 'Ebusus']),
    ('gaul', 'Gaul', 'Gaulish', '#2f7a3f', '#d9a441', ['hills', 'grassland'], ['desert'],
     ('hallstatt_smiths', 'Hallstatt smiths', '+1 production on every mine, and mines go quicker: builders cost 15% less.', [{'effect': 'tileYield', 'yield': 'production', 'amount': 1, 'improvement': 'mine'}, {'effect': 'costPercent', 'target': 'builder', 'amount': -15}]),
     'ambiorix', 'Ambiorix', ('king_of_the_eburones', 'King of the Eburones', 'Melee units cost 10% less to build.', [{'effect': 'costPercent', 'target': 'melee', 'amount': -10}]),
     ('war_band', 'Chief of the war band', 'Admires big armies; despises the weak.', 'largeArmy', 'weakArmy'),
     'gaesatae', 'oppidum', ['Bibracte', 'Alesia', 'Gergovia', 'Avaricum', 'Cenabum', 'Lutetia', 'Vesontio', 'Durocortorum', 'Samarobriva', 'Lugdunum', 'Burdigala', 'Tolosa', 'Massalia', 'Nemausus', 'Genava', 'Agedincum']),
    ('britons', 'Britons', 'British', '#3a6a7a', '#c9d6dc', ['grassland', 'tundra'], ['desert'],
     ('island_folk', 'Island folk', 'Units heal 5 more each turn, and cities grow 10% faster.', [{'effect': 'healBonus', 'amount': 5}, {'effect': 'growthPercent', 'amount': 10}]),
     'boudica', 'Boudica', ('iceni_revolt', 'Revolt of the Iceni', '+1 amenity in every city.', [{'effect': 'amenityBonus', 'amount': 1}]),
     ('defender_of_the_tribes', 'Defender of the tribes', 'Likes those who leave her land alone; hates invaders.', 'peace', 'invaders'),
     'woad_raider', 'roundhouse', ['Camulodunon', 'Verlamion', 'Eburacon', 'Isca', 'Venta', 'Calleva', 'Durnovaria', 'Londinion', 'Lindon', 'Deva', 'Corinion', 'Ratae', 'Viroconion', 'Dubris', 'Moridunon', 'Luguvalion']),
    ('han', 'Han', 'Han', '#b8860b', '#7a1f1f', ['grassland', 'plains'], [],
     ('mandate_of_heaven', 'Mandate of heaven', '+1 science in every city, and builders cost 25% less.', [{'effect': 'yieldBonus', 'yield': 'science', 'amount': 1}, {'effect': 'costPercent', 'target': 'builder', 'amount': -25}]),
     'emperor_wu', 'Emperor Wu', ('silk_road', 'The Silk Road', '+1 gold in every city with a market.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 1, 'scope': 'withBuilding:market'}]),
     ('great_wall', 'Builder of walls', 'Respects strong borders; dislikes rivals who settle close by.', 'distance', 'settledNear'),
     'crossbowman', 'examination_hall', ['Chang\'an', 'Luoyang', 'Linzi', 'Handan', 'Chengdu', 'Wan', 'Jiangling', 'Shouchun', 'Xuchang', 'Ye', 'Jinyang', 'Panyu', 'Xiangping', 'Dunhuang', 'Jiuquan', 'Wuwei']),
]
factions, leaders, citynames = [], [], []
for (fid, name, adj, c1, c2, bias, avoid, trait, lid, lname, ltrait, agenda, uu, ubid, names) in F:
    tid, tname, tdesc, teff = trait
    factions.append({'id': fid, 'nameKey': T(f'faction.{fid}.name', name), 'adjectiveKey': T(f'faction.{fid}.adj', adj),
                     'colours': {'primary': c1, 'secondary': c2}, 'leaders': [lid],
                     'startBias': {'terrain': [b for b in bias if b != 'hills'], 'avoid': avoid},
                     'trait': {'id': tid, 'nameKey': T(f'trait.{tid}.name', tname), 'descriptionKey': T(f'trait.{tid}.text', tdesc), 'effects': teff},
                     'uniqueUnits': [uu], 'uniqueBuildings': [ubid], 'cityNames': fid, 'tags': ['historical']})
    lt, ltn, ltd, lte = ltrait
    aid, an, ad, likes, hates = agenda
    leaders.append({'id': lid, 'faction': fid, 'nameKey': T(f'leader.{lid}.name', lname),
                    'trait': {'id': lt, 'nameKey': T(f'trait.{lt}.name', ltn), 'descriptionKey': T(f'trait.{lt}.text', ltd), 'effects': lte},
                    'agenda': {'id': aid, 'nameKey': T(f'agenda.{aid}.name', an), 'descriptionKey': T(f'agenda.{aid}.text', ad), 'likes': likes, 'hates': hates, 'weight': 6},
                    'portrait': f'leader.{lid}'})
    citynames.append({'id': fid, 'names': names})
dump('factions.json', 'factions', factions)
dump('leaders.json', 'leaders', leaders)
dump('cityNames.json', 'cityNames', citynames)

# ---------- Text ----------
tx = json.load(open(B + 'text/en-GB.json'), object_pairs_hook=collections.OrderedDict)
for k in list(tx['strings']):
    if k.startswith(('faction.', 'leader.')): del tx['strings'][k]
tx['strings'].update(text)
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')

m = json.load(open(B + 'mod.json'), object_pairs_hook=collections.OrderedDict)
files = m['files']
for f in ['improvements.json', 'buildings.json', 'wonders.json']:
    if f not in files: files.insert(files.index('units.json') + 1, f)
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2) + '\n')
print(len(units + extra + uniques), 'units;', len(buildings + ub), 'buildings;', len(wonders), 'wonders;', len(improvements), 'improvements;', len(factions), 'factions')
