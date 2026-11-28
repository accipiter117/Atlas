"""Killzone: Extrasolar War, phase K4a content (docs/KILLZONE.md sections 4 and 5).

Imported by tools/gen/killzone-war.py. Clears the ancient world out of the war (every base
tech, doctrine, building, wonder, unit, religion and the rest that no longer fits) and puts
in the war's own: six splinter factions, their units, base buildings, strategic projects,
a research tree of about thirty techs in three eras, doctrines, war footings, and the two
strategic resources. All names and text are original.
"""

ISA, HEL = 0, 1


def wipe(keep=()):
    """Remove every entry of a content type except `keep`, following cascades."""
    return {'op': 'remove', 'where': {'id': {'notIn': list(keep) or ['__none__']}}, 'cascade': True}


# ---------- Factions ----------

FACTIONS = [
    # id, side, name, adjective, colour, secondary, leader, leader name, trait effects, trait name, trait text, agenda likes/hates, ambition
    ('isa', ISA, 'ISA Strategic Command', 'Strategic Command', '#3f7fd0', '#e6edf5', 'templar', None,
     [{'effect': 'yieldBonus', 'yield': 'production', 'amount': 1}, {'effect': 'costPercent', 'target': 'vehicle', 'amount': -15}],
     'Combined arms', 'Bases make +1 industry; vehicles cost 15% less.', ('keptPromises', 'surpriseWar'),
     'Win the most theatre battles.'),
    ('home_guard', ISA, 'Vektan Home Guard', 'Home Guard', '#5aa469', '#e8efe2', 'varga', 'Marshal Ilse Varga',
     [{'effect': 'healBonus', 'amount': 10}, {'effect': 'costPercent', 'target': 'militia', 'amount': -30}],
     'Every street a fortress', 'Units heal 10 more each turn; militia cost 30% less.', ('keptPromises', 'surpriseWar'),
     'Keep Vekta free and liberate any lost Vektan base.'),
    ('isa_fleet', ISA, 'ISA Fleet and Shadow Marshals', 'Fleet', '#7fb3e8', '#1f3550', 'kerr', 'Admiral Danel Kerr',
     [{'effect': 'sightBonus', 'amount': 1}, {'effect': 'costPercent', 'target': 'ship', 'amount': -20}],
     'Eyes in orbit', 'Units see 1 hex further; ships cost 20% less.', ('keptPromises', 'surpriseWar'),
     'Silence Ardent Platform and win orbit over Helghan.'),
    ('helghast', HEL, 'Helghast Army High Command', 'Army', '#b8321f', '#1b1b1b', 'visari', None,
     [{'effect': 'costPercent', 'target': 'infantry', 'amount': -20}, {'effect': 'healBonus', 'amount': 5}],
     'The will of Helghan', 'Infantry cost 20% less; units heal 5 more each turn.', ('keptPromises', 'surpriseWar'),
     'Hold Pyrrhus and the most theatres.'),
    ('stahl', HEL, 'Stahl Arms', 'Stahl', '#d08a2a', '#2a1f14', 'stahl', 'Jorhan Stahl',
     [{'effect': 'costPercent', 'target': 'vehicle', 'amount': -20}, {'effect': 'yieldBonus', 'yield': 'gold', 'amount': 1}],
     'The arms trade', 'Vehicles cost 20% less; bases make +1 credits.', ('keptPromises', 'surpriseWar'),
     'Control the petrusite: Kerberos and every extractor.'),
    ('helghast_navy', HEL, 'Helghast Navy', 'Navy', '#8e2a4e', '#d9c6cf', 'orlock', 'Admiral Orlock',
     [{'effect': 'costPercent', 'target': 'dropship', 'amount': -30}, {'effect': 'costPercent', 'target': 'ship', 'amount': -10}],
     'Masters of the dark', 'Dropships cost 30% less and other ships 10% less.', ('keptPromises', 'surpriseWar'),
     'Land on Vekta and take an ISA capital.'),
]

# What earns each faction glory beyond battles and conquest (docs/KILLZONE.md section 4), as data.
AMBITION = {
    'isa': [{'when': 'battleWon', 'amount': 3}],
    'home_guard': [{'when': 'holdWorld', 'world': 'vekta', 'perTurn': 1, 'every': 10}, {'when': 'captureWorld', 'world': 'vekta', 'amount': 20}],
    'isa_fleet': [{'when': 'captureWorld', 'world': 'ardent', 'amount': 25}, {'when': 'holdOrbit', 'world': 'helghan', 'perTurn': 2}, {'when': 'landOn', 'world': 'helghan', 'amount': 15}, {'when': 'landOn', 'world': 'ardent', 'amount': 8}],
    'helghast': [{'when': 'holdCapital', 'perTurn': 1, 'every': 10}, {'when': 'captureWorld', 'amount': 10}],
    'stahl': [{'when': 'resourceWorked', 'resource': 'petrusite', 'perTurn': 1, 'every': 10}, {'when': 'holdWorld', 'world': 'kerberos', 'perTurn': 2, 'every': 10}],
    'helghast_navy': [{'when': 'landOn', 'world': 'vekta', 'amount': 20}, {'when': 'captureCapital', 'amount': 25}, {'when': 'landOn', 'world': 'halcyon', 'amount': 8}, {'when': 'landOn', 'world': 'bastion', 'amount': 8}],
}

CITY_NAMES = {
    'home_guard': ['Kessler Ridge', 'Fort Tarsus', 'Highlands Post', 'Rook Valley', 'Brennan Fields', 'Old Port', 'Cedar Line', 'Mercy Hill', 'Lantern Bay', 'Greywater'],
    'isa_fleet': ['Cobalt Bay', 'Tether Point', 'Skyhook', 'Beacon Station', 'Drydock Nine', 'Signal Rock', 'Farwatch', 'Anchor Yard', 'Long Reach', 'Halo Pier'],
    'stahl': ['Stahl Foundry', 'Arc Works', 'Cinder Mill', 'Smelter Row', 'Ironvale', 'Coil Yard', 'Slag Heights', 'Forge Delta', 'Petra Shaft', 'Anvil Point'],
    'helghast_navy': ['Orlock Yards', 'Black Dock', 'Gantry Six', 'Riven Spire', 'Void Gate', 'Ashen Moor', 'Hull Point', 'Storm Mast', 'Dark Hangar', 'Grey Tide'],
}

# ---------- Units ----------
# id, side or civ, class, strength, ranged, range, moves, cost, tags, tech, resource, sprite, name, text, extra
UNITS = [
    ('rifle_squad', ISA, 'melee', 24, 0, 0, 2, 45, ['infantry'], None, None, 'warrior', 'Rifle squad', 'The backbone of the ISA line. Can dig in.', {}),
    ('assault_trooper', HEL, 'melee', 25, 0, 0, 2, 45, ['infantry'], None, None, 'warrior', 'Assault trooper', 'The backbone of the Helghast line. Can dig in.', {}),
    ('support_gunners', ISA, 'melee', 32, 0, 0, 1, 70, ['infantry', 'heavy'], 'ballistic_optics', None, 'man_at_arms', 'Support gunners', 'Heavy machine guns: strong in defence, slow.', {}),
    ('helghast_heavy', HEL, 'melee', 33, 0, 0, 1, 70, ['infantry', 'heavy'], 'ballistic_optics', None, 'helghast_heavy', 'Heavy gunner', 'A walking gun platform: strong in defence, slow.', {}),
    ('rocket_team', ISA, 'anti_cavalry', 26, 0, 0, 2, 60, ['infantry', 'antiArmour'], 'rocketry', None, 'spearman', 'Rocket team', '+10 against vehicles.', {'vsVehicle': 10}),
    ('arc_trooper', 'stahl', 'anti_cavalry', 28, 0, 0, 2, 70, ['infantry', 'antiArmour'], 'rocketry', 'petrusite', 'crossbowman', 'Arc trooper', 'Stahl Arms only. Arc rifles: +10 against vehicles. Needs petrusite.', {'vsVehicle': 10}),
    ('recon_team', ISA, 'recon', 16, 0, 0, 3, 40, ['infantry'], None, None, 'scout', 'Recon team', 'Sees 2 hexes further and ignores zones of control.', {'sight': 4}),
    ('scout_sniper', HEL, 'recon', 16, 0, 0, 3, 40, ['infantry'], None, None, 'scout', 'Scout sniper team', 'Sees 2 hexes further and ignores zones of control.', {'sight': 4}),
    ('isa_sniper', ISA, 'ranged', 16, 30, 2, 2, 70, ['infantry'], 'ballistic_optics', None, 'isa_sniper', 'Sniper team', 'Picks off enemies two hexes away.', {}),
    ('combat_engineers', ISA, 'civilian', 0, 0, 0, 2, 50, ['worker'], None, None, 'builder', 'Combat engineers', 'Build war infrastructure where your side holds the ground. Three charges.', {}),
    ('pioneer_squad', HEL, 'civilian', 0, 0, 0, 2, 50, ['worker'], None, None, 'builder', 'Pioneer squad', 'Build war infrastructure where your side holds the ground. Three charges.', {}),
    ('jetpack_trooper', 'helghast_navy', 'melee', 26, 0, 0, 3, 80, ['infantry', 'jump'], 'jump_packs', None, 'woad_raider', 'Jetpack trooper', 'Helghast Navy only. Fast, and faster still in low gravity.', {}),
    ('shadow_marshals', 'isa_fleet', 'civilian', 0, 0, 0, 3, 90, ['spy'], 'covert_operations', None, 'spy', 'Shadow Marshal team', 'ISA Fleet only. Sabotage behind the front.', {}),
    ('intelligence_cell', HEL, 'civilian', 0, 0, 0, 3, 90, ['spy'], 'covert_operations', None, 'spy', 'Intelligence cell', 'Sabotage behind the front.', {}),
    ('home_guard_militia', 'home_guard', 'melee', 16, 0, 0, 2, 25, ['infantry', 'militia'], None, None, 'slinger', 'Home Guard militia', 'Home Guard only. Cheap and weak, but every Vektan rifle counts.', {}),
    ('conscripts', 'helghast', 'melee', 16, 0, 0, 2, 25, ['infantry', 'militia'], None, None, 'slinger', 'Conscripts', 'Army only. Cheap and weak, raised in their thousands.', {}),
    ('apc', ISA, 'cavalry', 28, 0, 0, 3, 75, ['vehicle'], 'crawler_drives', None, 'chariot', 'APC', 'A fast armoured carrier.', {}),
    ('armoured_walker', HEL, 'cavalry', 29, 0, 0, 2, 75, ['vehicle'], 'crawler_drives', None, 'chariot', 'Armoured walker', 'A stalking armoured carrier.', {}),
    ('tank_platoon', ISA, 'cavalry', 46, 0, 0, 2, 150, ['vehicle'], 'heavy_armour', 'fuel', 'knight', 'Tank platoon', 'Main battle tanks. Needs fuel.', {}),
    ('stahl_battle_suit', HEL, 'cavalry', 48, 0, 0, 2, 155, ['vehicle'], 'heavy_armour', 'petrusite', 'knight', 'Stahl battle suit', 'A walking tank. Needs petrusite.', {}),
    ('field_artillery', ISA, 'siege', 14, 40, 3, 1, 110, ['vehicle'], 'fire_control', None, 'catapult', 'Field artillery', 'Shells targets 3 hexes away.', {}),
    ('arc_artillery', HEL, 'siege', 14, 42, 3, 1, 115, ['vehicle'], 'fire_control', 'petrusite', 'trebuchet', 'Arc artillery', 'Arc shells at 3 hexes. Needs petrusite.', {}),
]

# Ships (the K2 ships get requirements; the projects' flagships are new).
SHIP_REQUIRES = {
    'isa_cruiser': ('cruiser_yards', 'fuel'), 'helghast_cruiser': ('cruiser_yards', 'petrusite'),
    'isa_destroyer': (None, None), 'helghast_destroyer': (None, None),
    'isa_intruder': ('orbital_drop', None), 'helghast_dropship': ('orbital_drop', None),
    'isa_transport': (None, None), 'helghast_transport': (None, None),
}
FLAGSHIPS = [
    ('new_sun_cruiser', ISA, 'New Sun-class cruiser', 'The ISA flagship: a heavy cruiser built for one war, stronger in battle, with its own orbital guns.'),
    ('stahl_dreadnought', HEL, 'Stahl dreadnought', 'The Helghast flagship: arc batteries along a hull no other yard could build.'),
]

# ---------- Buildings and projects ----------
# id, tech, cost, upkeep, extra fields, name, text
BUILDINGS = [
    ('barracks', None, 55, 1, {'yields': {'production': 1}, 'effects': [{'effect': 'costPercent', 'target': 'infantry', 'amount': -15}]}, 'Barracks', 'Infantry trained here cost 15% less; +1 industry.'),
    ('vehicle_depot', 'crawler_drives', 90, 1, {'effects': [{'effect': 'costPercent', 'target': 'vehicle', 'amount': -15}]}, 'Vehicle depot', 'Vehicles built here cost 15% less.'),
    ('armoury', 'powered_armour', 110, 2, {'yields': {'production': 1}, 'effects': [{'effect': 'healBonus', 'amount': 5}]}, 'Armoury', '+1 industry; units in its land heal 5 more.'),
    ('factory', 'industrial_combines', 150, 2, {'yields': {'production': 3}}, 'Factory', '+3 industry.'),
    ('petrusite_refinery', 'deep_core_extraction', 120, 1, {'yields': {'production': 2, 'gold': 1}}, 'Petrusite refinery', '+2 industry and +1 credits.'),
    ('fuel_depot', 'deep_core_extraction', 100, 1, {'yields': {'gold': 2}}, 'Fuel depot', '+2 credits.'),
    ('power_plant', 'industrial_combines', 130, 2, {'yields': {'production': 2, 'science': 1}}, 'Power plant', '+2 industry and +1 research.'),
    ('comms_centre', 'encrypted_comms', 80, 1, {'yields': {'science': 3}}, 'Comms centre', '+3 research.'),
    ('propaganda_office', 'propaganda_broadcasts', 80, 1, {'yields': {'faith': 2, 'culture': 1}}, 'Propaganda office', '+2 propaganda and +1 command.'),
    ('field_academy', 'officer_academies', 120, 2, {'yields': {'culture': 2, 'science': 1}}, 'Field academy', '+2 command and +1 research.'),
    ('med_centre', 'field_logistics', 70, 1, {'effects': [{'effect': 'healBonus', 'amount': 10}]}, 'Med centre', 'Units in its land heal 10 more each turn.'),
    ('logistics_hub', 'logistics_networks', 110, 1, {'supplyRange': 2, 'yields': {'food': 1}}, 'Logistics hub', 'The base supplies 2 hexes further; +1 rations.'),
    ('shipyard', 'cruiser_yards', 140, 2, {'builtAt': ['homeworld', 'station'], 'yields': {'production': 1}}, 'Shipyard', 'Builds cruisers and destroyers. Home worlds and stations only.'),
    ('dropship_pad', 'orbital_drop', 90, 1, {'effects': [{'effect': 'costPercent', 'target': 'dropship', 'amount': -25}]}, 'Dropship pad', 'Dropships cost 25% less here.'),
    ('orbital_defence_gun', 'anti_air_systems', 160, 2, {'orbitalGuns': 15}, 'Orbital defence gun', 'Hits every enemy ship in this world\'s orbit for 15 each turn.'),
    ('bunker_complex', 'combat_engineering', 100, 1, {'defence': 10}, 'Bunker complex', '+10 base defence.'),
]
# id, side, tech, cost, extra, name, text
PROJECTS = [
    ('arc_cannon_array', HEL, 'orbital_defences', 600, {'orbitalGuns': 40, 'builtAt': ['homeworld']}, 'Arc cannon array', 'Hits every enemy ship in this world\'s orbit for 40 each turn.'),
    ('orbital_defence_grid', ISA, 'orbital_defences', 600, {'orbitalGuns': 40, 'builtAt': ['homeworld']}, 'Orbital defence grid', 'Hits every enemy ship in this world\'s orbit for 40 each turn.'),
    ('new_sun_project', ISA, 'capital_ship_design', 700, {'effects': [{'effect': 'freeUnit', 'unit': 'new_sun_cruiser', 'count': 1}], 'builtAt': ['homeworld', 'station']}, 'New Sun-class cruiser', 'Launches the ISA flagship into this world\'s orbit.'),
    ('stahl_dreadnought_project', HEL, 'capital_ship_design', 700, {'effects': [{'effect': 'freeUnit', 'unit': 'stahl_dreadnought', 'count': 1}], 'builtAt': ['homeworld', 'station']}, 'Stahl dreadnought', 'Launches the Helghast flagship into this world\'s orbit.'),
    ('total_mobilisation', None, 'mass_production', 500, {'effects': [{'effect': 'costPercent', 'target': 'militia', 'amount': -50, 'scope': 'everyCity'}]}, 'Total mobilisation', 'Militia and conscripts cost half as much in every base.'),
]

# ---------- Research: 25 techs in three eras ----------
# id, era, col, row, requires, name
TECHS = [
    ('field_logistics', 'ancient', 0, 0, [], 'Field Logistics'),
    ('ballistic_optics', 'ancient', 0, 1, [], 'Ballistic Optics'),
    ('combat_engineering', 'ancient', 0, 2, [], 'Combat Engineering'),
    ('encrypted_comms', 'ancient', 0, 3, [], 'Encrypted Comms'),
    ('hydroponics', 'ancient', 0, 4, [], 'Hydroponics'),
    ('crawler_drives', 'ancient', 1, 0, ['field_logistics'], 'Crawler Drives'),
    ('rocketry', 'ancient', 1, 1, ['ballistic_optics'], 'Rocketry'),
    ('prefab_fortifications', 'ancient', 1, 2, ['combat_engineering'], 'Prefab Fortifications'),
    ('propaganda_broadcasts', 'ancient', 1, 3, ['encrypted_comms'], 'Propaganda Broadcasts'),
    ('deep_core_extraction', 'ancient', 1, 4, ['hydroponics'], 'Deep Core Extraction'),
    ('powered_armour', 'classical', 2, 0, ['crawler_drives', 'rocketry'], 'Powered Armour'),
    ('fire_control', 'classical', 2, 1, ['rocketry'], 'Fire Control Computing'),
    ('orbital_drop', 'classical', 2, 2, ['prefab_fortifications'], 'Orbital Drop'),
    ('logistics_networks', 'classical', 2, 3, ['propaganda_broadcasts', 'field_logistics'], 'Logistics Networks'),
    ('cruiser_yards', 'classical', 2, 4, ['deep_core_extraction'], 'Cruiser Yards'),
    ('heavy_armour', 'classical', 3, 0, ['powered_armour', 'fire_control'], 'Heavy Armour'),
    ('jump_packs', 'classical', 3, 1, ['powered_armour'], 'Jump Packs'),
    ('anti_air_systems', 'classical', 3, 2, ['orbital_drop'], 'Anti-Air Systems'),
    ('industrial_combines', 'classical', 3, 3, ['logistics_networks'], 'Industrial Combines'),
    ('officer_academies', 'classical', 3, 4, ['logistics_networks'], 'Officer Academies'),
    ('arc_weaponry', 'medieval', 4, 0, ['heavy_armour'], 'Arc Weaponry'),
    ('covert_operations', 'medieval', 4, 1, ['jump_packs', 'encrypted_comms'], 'Covert Operations'),
    ('orbital_defences', 'medieval', 4, 2, ['anti_air_systems'], 'Orbital Defences'),
    ('mass_production', 'medieval', 4, 3, ['industrial_combines'], 'Mass Production'),
    ('capital_ship_design', 'medieval', 5, 3, ['orbital_defences', 'cruiser_yards'], 'Capital Ship Design'),
]
ERA_COST = {'ancient': 25, 'classical': 65, 'medieval': 130}

# Which K3 works each tech unlocks (the works' own requires are set to match).
WORK_TECH = {
    'trench': None, 'wire': None, 'minefield': 'combat_engineering', 'mg_nest': 'prefab_fortifications', 'bunker': 'prefab_fortifications',
    'comms_relay': 'encrypted_comms', 'field_hospital': 'field_logistics', 'artillery_battery': 'fire_control',
    'supply_depot': 'logistics_networks', 'command_post': 'logistics_networks', 'anti_air_battery': 'anti_air_systems', 'arc_tower': 'arc_weaponry',
    'extractor': 'deep_core_extraction',
}

# ---------- Doctrines (civics), cards (policies) and war footings (governments) ----------
DOCTRINES = [
    ('conscription', 0, 0, [], 'Conscription', ['martial_law'], ['drill_sergeants', 'ration_discipline']),
    ('war_economy', 0, 1, [], 'War Economy', [], ['war_bonds', 'factory_shifts']),
    ('propaganda_ministry', 0, 2, [], 'Propaganda Ministry', [], ['state_broadcasts', 'volunteer_drives']),
    ('defence_in_depth', 1, 0, ['conscription'], 'Defence in Depth', [], ['dig_in']),
    ('blitz_assault', 1, 1, ['conscription'], 'Blitz Assault', [], ['shock_troops']),
    ('corporate_charter_doctrine', 1, 2, ['war_economy'], 'Corporate Charter', ['corporate_charter'], ['arms_contracts']),
    ('fleet_doctrine', 1, 3, ['war_economy'], 'Fleet Doctrine', ['fleet_command'], ['orbital_supremacy']),
    ('home_defence_doctrine', 1, 4, ['propaganda_ministry'], 'Home Defence', ['home_defence'], ['partisan_warfare']),
    ('combined_arms', 2, 1, ['defence_in_depth', 'blitz_assault'], 'Combined Arms', [], ['combined_arms_card']),
    ('total_war_doctrine', 2, 2, ['corporate_charter_doctrine', 'propaganda_ministry'], 'Total War Economy', [], ['total_war_card']),
]
CIVIC_COST = [20, 50, 110]
POLICIES = [
    ('drill_sergeants', 'military', [{'effect': 'healBonus', 'amount': 10}], 'Drill sergeants', 'Units heal 10 more each turn.'),
    ('ration_discipline', 'economic', [{'effect': 'growthPercent', 'amount': 15}], 'Ration discipline', 'Bases grow 15% faster.'),
    ('war_bonds', 'economic', [{'effect': 'yieldPercent', 'yield': 'gold', 'amount': 15}], 'War bonds', '+15% credits.'),
    ('factory_shifts', 'economic', [{'effect': 'yieldPercent', 'yield': 'production', 'amount': 10}], 'Factory shifts', '+10% industry.'),
    ('state_broadcasts', 'diplomatic', [{'effect': 'yieldBonus', 'yield': 'faith', 'amount': 1}], 'State broadcasts', '+1 propaganda in every base.'),
    ('volunteer_drives', 'military', [{'effect': 'costPercent', 'target': 'militia', 'amount': -30}], 'Volunteer drives', 'Militia and conscripts cost 30% less.'),
    ('dig_in', 'military', [{'effect': 'costPercent', 'target': 'worker', 'amount': -30}], 'Dig in', 'Engineers cost 30% less.'),
    ('shock_troops', 'military', [{'effect': 'costPercent', 'target': 'vehicle', 'amount': -15}], 'Shock troops', 'Vehicles cost 15% less.'),
    ('arms_contracts', 'economic', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 2, 'scope': 'capital'}], 'Arms contracts', '+2 credits in your capital.'),
    ('orbital_supremacy', 'military', [{'effect': 'costPercent', 'target': 'ship', 'amount': -20}], 'Orbital supremacy', 'Ships cost 20% less.'),
    ('partisan_warfare', 'military', [{'effect': 'costPercent', 'target': 'militia', 'amount': -40}], 'Partisan warfare', 'Militia cost 40% less.'),
    ('combined_arms_card', 'military', [{'effect': 'costPercent', 'target': 'units', 'amount': -10}], 'Combined arms', 'Every unit costs 10% less.'),
    ('total_war_card', 'economic', [{'effect': 'yieldPercent', 'yield': 'production', 'amount': 15}], 'Total war', '+15% industry.'),
]
GOVERNMENTS = [
    ('martial_law', {'military': 2, 'economic': 1}, [{'effect': 'healBonus', 'amount': 5}], 'Martial law', 'Two military cards and one economic; units heal 5 more.'),
    ('corporate_charter', {'military': 1, 'economic': 2, 'wildcard': 1}, [{'effect': 'yieldPercent', 'yield': 'gold', 'amount': 10}], 'Corporate charter', 'Built for the arms trade: +10% credits.'),
    ('fleet_command', {'military': 2, 'economic': 1, 'diplomatic': 1}, [{'effect': 'costPercent', 'target': 'ship', 'amount': -10}], 'Fleet command', 'Ships cost 10% less.'),
    ('home_defence', {'military': 2, 'economic': 1, 'diplomatic': 1}, [{'effect': 'costPercent', 'target': 'militia', 'amount': -20}], 'Home defence', 'Militia cost 20% less.'),
]

RESOURCES = [
    ('petrusite', 'Petrusite', 'The volatile ore behind every arc weapon. Needs an extractor.', ['desert', 'tundra']),
    ('fuel', 'Fuel', 'Refined fuel for tanks and ships. Needs an extractor.', ['plains', 'grassland']),
]


def k4(base, sprites_isa, names):
    """Build the K4a files. base: {type: [ids]} of base-ancient content; names: text to add to."""
    files = {}
    side_civs = {ISA: [f[0] for f in FACTIONS if f[1] == ISA], HEL: [f[0] for f in FACTIONS if f[1] == HEL]}

    # Factions: rename the two Killzone ones, add four.
    fac = []
    lead = []
    cn = []
    for (fid, side, name, adj, col, sec, leader, lname, effects, tname, ttext, (likes, hates), ambition) in FACTIONS:
        names[f'faction.{fid}.name'] = name
        names[f'faction.{fid}.adj'] = adj
        names[f'faction.{fid}.text'] = f'{name}. Ambition: {ambition}'
        names[f'ambition.{fid}'] = ambition
        trait = {'id': f'{fid}_trait', 'nameKey': f'trait.{fid}_trait.name', 'descriptionKey': f'trait.{fid}_trait.text', 'effects': effects}
        names[f'trait.{fid}_trait.name'] = tname
        names[f'trait.{fid}_trait.text'] = ttext
        extra = {'ambition': AMBITION[fid]}
        if fid == 'stahl':
            extra['sellsArms'] = ['vehicle', 'antiArmour']
        if fid in ('isa', 'helghast'):
            fac.append({'op': 'change', 'id': fid, 'set': {'trait': trait, 'uniqueUnits': [], 'adjectiveKey': f'faction.{fid}.adj', 'nameKey': f'faction.{fid}.name', 'descriptionKey': f'faction.{fid}.text', **extra}})
            continue
        fac.append({**extra, 'id': fid, 'nameKey': f'faction.{fid}.name', 'adjectiveKey': f'faction.{fid}.adj', 'descriptionKey': f'faction.{fid}.text',
                    'colours': {'primary': col, 'secondary': sec}, 'leaders': [leader], 'startBias': {'terrain': ['plains']}, 'trait': trait,
                    'uniqueUnits': [], 'cityNames': f'k_{fid}', 'frontSide': side, 'tags': ['killzone']})
        names[f'leader.{leader}.name'] = lname
        names[f'agenda.{leader}.name'] = 'For the side'
        names[f'agenda.{leader}.text'] = 'Respects allies who keep their word; despises surprise attacks.'
        names[f'trait.{leader}_lead.name'] = 'Steady hand'
        names[f'trait.{leader}_lead.text'] = 'Units heal 5 more each turn.'
        lead.append({'id': leader, 'faction': fid, 'nameKey': f'leader.{leader}.name',
                     'trait': {'id': f'{leader}_lead', 'nameKey': f'trait.{leader}_lead.name', 'descriptionKey': f'trait.{leader}_lead.text', 'effects': [{'effect': 'healBonus', 'amount': 5}]},
                     'agenda': {'id': f'{leader}_agenda', 'nameKey': f'agenda.{leader}.name', 'descriptionKey': f'agenda.{leader}.text', 'likes': likes, 'hates': hates, 'weight': 6},
                     'portrait': f'leader.{leader}', 'ai': {'personality': 'builder_conqueror', 'victoryBias': {'conquest': 1.3, 'science': 1.0, 'culture': 0.8, 'religious': 0.5, 'score': 1.2}}})
        cn.append({'id': f'k_{fid}', 'names': CITY_NAMES[fid], 'tags': ['killzone']})
    files['factions.json'] = ('factions', fac)
    files['leaders.json'] = ('leaders', lead)
    files['cityNames.json'] = ('cityNames', cn)

    # Research and doctrines: the ancient trees go (and with them everything that needed them).
    techs = [wipe()]
    unlock = {}
    for (u, side, cls, st, rs, rg, mv, cost, tags, tech, res, sprite, name, text, extra) in UNITS:
        if tech:
            unlock.setdefault(tech, {}).setdefault('units', []).append(u)
    for b in BUILDINGS:
        if b[1]:
            unlock.setdefault(b[1], {}).setdefault('buildings', []).append(b[0])
    for p in PROJECTS:
        unlock.setdefault(p[2], {}).setdefault('wonders', []).append(p[0])
    for w, t in WORK_TECH.items():
        if t:
            unlock.setdefault(t, {}).setdefault('improvements', []).append(w)
    for ship, (t, _) in SHIP_REQUIRES.items():
        if t:
            unlock.setdefault(t, {}).setdefault('units', []).append(ship)
    for (tid, era, col, row, req, name) in TECHS:
        names[f'tech.{tid}.name'] = name
        e = {'id': tid, 'nameKey': f'tech.{tid}.name', 'era': era, 'cost': ERA_COST[era] + 10 * col, 'requires': req, 'treePos': {'col': col, 'row': row}}
        if tid in unlock:
            e['unlocks'] = unlock[tid]
        techs.append(e)
    files['techs.json'] = ('techs', techs)
    civics = [wipe()]
    for (cid, col, row, req, name, govs, pols) in DOCTRINES:
        names[f'civic.{cid}.name'] = name
        e = {'id': cid, 'nameKey': f'civic.{cid}.name', 'era': ['ancient', 'classical', 'medieval'][col], 'cost': CIVIC_COST[col], 'requires': req, 'treePos': {'col': col, 'row': row}, 'unlocks': {}}
        if govs:
            e['unlocks']['governments'] = govs
        if pols:
            e['unlocks']['policies'] = pols
        civics.append(e)
    files['civics.json'] = ('civics', civics)
    civic_of = {}
    for (cid, col, row, req, name, govs, pols) in DOCTRINES:
        for x in govs + pols:
            civic_of[x] = cid
    # (The ancient governments, cards and wonders all needed ancient techs or doctrines: the cascades took them.)
    files['governments.json'] = ('governments', [{'id': g, 'nameKey': f'government.{g}.name', 'descriptionKey': f'government.{g}.text', 'slots': slots, 'effects': eff, 'requires': {'civic': civic_of[g]}} for (g, slots, eff, n, t) in GOVERNMENTS])
    files['policies.json'] = ('policies', [{'id': p, 'nameKey': f'policy.{p}.name', 'descriptionKey': f'policy.{p}.text', 'slot': slot, 'effects': eff, 'requires': {'civic': civic_of[p]}} for (p, slot, eff, n, t) in POLICIES])
    for (g, slots, eff, n, t) in GOVERNMENTS:
        names[f'government.{g}.name'] = n
        names[f'government.{g}.text'] = t
    for (p, slot, eff, n, t) in POLICIES:
        names[f'policy.{p}.name'] = n
        names[f'policy.{p}.text'] = t

    # Buildings and projects replace the ancient lists.
    # The capital's own building stays (tuning.cities.capitalBuilding), as each faction's headquarters.
    bld = [wipe(keep=['palace'])]
    # Headquarters also broadcast: +2 propaganda, so a side can win back support.
    bld.append({'op': 'change', 'id': 'palace', 'set': {'yields': {'production': 2, 'gold': 4, 'science': 2, 'culture': 1, 'faith': 2}}})
    names['building.palace.name'] = 'Headquarters'
    names['building.palace.text'] = 'Your faction\'s command: industry, credits, research and command, and a wildcard card slot.'
    for (bid, tech, cost, upkeep, extra, name, text) in BUILDINGS:
        e = {'id': bid, 'nameKey': f'building.{bid}.name', 'descriptionKey': f'building.{bid}.text', 'cost': cost, 'upkeep': upkeep, 'icon': f'building.{bid}', **extra}
        if tech:
            e['requires'] = {'tech': tech}
        bld.append(e)
        names[f'building.{bid}.name'] = name
        names[f'building.{bid}.text'] = text
    files['buildings.json'] = ('buildings', bld)
    era_of = {t[0]: t[1] for t in TECHS}
    won = []
    for (pid, side, tech, cost, extra, name, text) in PROJECTS:
        req = {'tech': tech}
        if side is not None:
            req['side'] = side
        won.append({'id': pid, 'nameKey': f'wonder.{pid}.name', 'descriptionKey': f'wonder.{pid}.text', 'era': era_of[tech], 'cost': cost, 'upkeep': 0, 'icon': f'wonder.{pid}', 'project': True, 'requires': req, **extra})
        names[f'wonder.{pid}.name'] = name
        names[f'wonder.{pid}.text'] = text
    files['wonders.json'] = ('wonders', won)

    # Resources: only petrusite and fuel; an extractor works them.
    res = [wipe()]
    for (rid, name, text, terr) in RESOURCES:
        res.append({'id': rid, 'nameKey': f'resource.{rid}.name', 'class': 'strategic', 'yields': {'production': 1},
                    'validTerrain': terr, 'frequency': 0.0, 'improvement': 'extractor', 'improvedYields': {'production': 1}, 'art': 'resource.iron'})
        names[f'resource.{rid}.name'] = name
        names[f'resource.{rid}.text'] = text
    files['resources.json'] = ('resources', res)

    # Units: the war's own, replacing the ancient ones (ships keep theirs, with requirements now).
    units = [wipe(keep=list(SHIP_REQUIRES))]
    art = {}
    for (u, side, cls, st, rs, rg, mv, cost, tags, tech, res_, sprite, name, text, extra) in UNITS:
        e = {'id': u, 'nameKey': f'unit.{u}.name', 'descriptionKey': f'unit.{u}.text', 'class': cls, 'domain': 'land', 'era': era_of.get(tech, 'ancient'),
             'strength': st, 'moves': mv, 'cost': cost, 'upkeep': 1 if cls != 'civilian' else 0, 'tags': tags, 'sprite': f'unit.{u}'}
        if rs:
            e['rangedStrength'] = rs
            e['range'] = rg
        if 'sight' in extra:
            e['sight'] = extra['sight']
        if 'vsVehicle' in extra:
            e['abilities'] = [{'effect': 'combatBonus', 'amount': extra['vsVehicle'], 'vs': {'tags': 'vehicle'}}]
        req = {}
        if isinstance(side, int):
            req['side'] = side
            civs = side_civs[side]
        else:
            req['faction'] = side
            civs = [side]
        if tech:
            req['tech'] = tech
        if res_:
            req['resource'] = res_
        e['requires'] = req
        units.append(e)
        names[f'unit.{u}.name'] = name
        names[f'unit.{u}.text'] = text
        # Sprites: every faction of a side wears that side's sheet of the base figure.
        for c in side_civs[ISA] + side_civs[HEL]:
            look = 'isa' if c in side_civs[ISA] else 'helghast'
            art[f'unit.{u}.{c}'] = {'sheet': f'assets/sprites/killzone/{sprite}.{look}.json'}
    for ship, (tech, res_) in SHIP_REQUIRES.items():
        req = {}
        if tech:
            req['tech'] = tech
        if res_:
            req['resource'] = res_
        req['side'] = ISA if ship.startswith('isa') else HEL
        units.append({'op': 'change', 'id': ship, 'set': {'requires': req, 'era': era_of.get(tech, 'ancient')}})
    for (fid, side, name, text) in FLAGSHIPS:
        units.append({'id': fid, 'nameKey': f'unit.{fid}.name', 'descriptionKey': f'unit.{fid}.text', 'class': 'capital_ship', 'domain': 'space', 'strength': 85, 'moves': 1,
                      'cost': 1, 'upkeep': 3, 'unique': True, 'requires': {'side': side}, 'tags': ['ship'], 'space': {'capacity': 3, 'bombard': True, 'heavy': True, 'builtAt': ['homeworld', 'station']}})
        names[f'unit.{fid}.name'] = name
        names[f'unit.{fid}.text'] = text
    files['units.json'] = ('units', units)

    # Religion is off in this war (propaganda takes faith's place); so are the ancient improvements.
    files['beliefs.json'] = ('beliefs', [wipe()])
    # Victory (docs/KILLZONE.md 6.4): the side victories replace conquest and score.
    vic = [{'op': 'change', 'id': 'conquest', 'set': {'enabled': False}}, {'op': 'change', 'id': 'score', 'set': {'enabled': False}}]
    for kind, name, text, params in [
        ('capitals', 'Capture the capitals', 'Hold every enemy faction\'s capital on their home world.', {}),
        ('support', 'Break their will', 'Drive the enemy side\'s war support to nothing.', {}),
        ('territory', 'Hold the system', 'Hold 6 of the 8 worlds for 10 turns in a row.', {'worlds': 6, 'turns': 10}),
        ('time', 'Last side standing', 'When the campaign\'s time runs out, the side ahead on war support by 5 or more wins; closer than that, the side holding more worlds.', {'margin': 5}),
    ]:
        vid = f'war_{kind}'
        vic.append({'id': vid, 'nameKey': f'victory.{vid}.name', 'descriptionKey': f'victory.{vid}.text', 'module': 'sides', 'enabled': True, 'params': {'kind': kind, **params}})
        names[f'victory.{vid}.name'] = name
        names[f'victory.{vid}.text'] = text
    files['victories.json'] = ('victories', vic)
    # K5: the AI's numbers for this war (star map, theatres, fewer engineers).
    files['ai/weights.json'] = ('aiWeights', [
        {'id': 'starmap', 'planner': 'starmap', 'weights': {'enemy': 3, 'contested': 4, 'neutral': 2.5, 'own': 0, 'ambition': 3, 'council': 4, 'distance': 1.2,
                                                              'enemyFleet': 2, 'homeThreat': 14, 'minScore': 0, 'landMinDistance': 3, 'landDistance': 4, 'keepHome': 0, 'minGroup': 2, 'dareRatio': 0.9, 'dareGrowth': 0.1, 'holdTurns': 3, 'strikeBaseRange': 3, 'minAssault': 3, 'dareMax': 1.6, 'homeDare': 1.5, 'waitTurns': 6, 'shipValue': 10, 'gunValue': 8, 'carrierValue': 9}},
        {'id': 'theatre', 'planner': 'theatre', 'weights': {'works': {'trench': 3, 'wire': 2, 'mg_nest': 2.5, 'bunker': 1.5, 'anti_air_battery': 1, 'supply_depot': 1.2},
                                                             'frontBand': 2, 'beachhead': 3, 'siegeUnits': 3, 'siegeRange': 2, 'siege': {'cityAttackMinWinChance': 0.0, 'cityMeleeMinDealt': 10, 'cityMeleePaths': None, 'attackMinHpAfter': 25, 'cityMinDamageRatio': 0.4, 'attackMinWinChance': 0.4, 'attackMinDamageRatio': 0.8}, 'outnumbered': 1.5, 'lookRange': 2, 'refugeRange': 3,
                                                             'stances': {'hold': {'attackMinWinChance': 0.8, 'attackMinDamageRatio': 2.5},
                                                                         'advance': {},
                                                                         'allout': {'attackMinWinChance': 0.45, 'attackMinDamageRatio': 1.0, 'attackMinHpAfter': 20}}}},
        {'op': 'change', 'id': 'economy', 'set': {'weights.maxBuilders': 2}},
        {'op': 'change', 'id': 'military', 'set': {'weights.armyPerCityAtWar': 4}},
    ])
    for k, v in {'ai.reason.supplyDrop': 'Supplies dropped to troops cut off from supply.', 'ai.reason.strike': 'An orbital strike on the enemy beside our troops.',
                 'ai.reason.land': 'An army group lands on the target world.', 'ai.reason.embark': 'Troops embark for the target world.',
                 'ai.reason.sail': 'The fleet sails for {world}.', 'ai.reason.toKeySite': 'A unit moves to take a key site.', 'ai.reason.holdSite': 'A unit holds a key site.', 'ai.reason.siege': 'Troops gather on an enemy base.', 'ai.reason.strikeBase': 'A cruiser bombards an enemy base under siege.', 'ai.reason.siegeWait': 'Troops wait near an enemy base for the rest of the assault.', 'ai.reason.siegeAttack': 'Troops assault an enemy base ({win}% to win).', 'ai.reason.toSupply': 'A unit cut off from supply heads back to it.', 'ai.reason.ferry': 'An empty transport goes back to {world} for more troops.', 'ai.reason.blockade': 'A blockade of an enemy world.',
                 'ai.reason.dugIn': 'Outnumbered: holding our fortifications.', 'ai.reason.fallBack': 'Outnumbered: falling back to our fortifications.',
                 'ai.reason.supplyLine': 'Holding here: further on is out of supply.', 'ai.reason.warship': 'Warships to take back our home\'s orbit.', 'ai.reason.carrier': 'Transports to carry an army to the target world.'}.items():
        names[k] = v
    return files, art


ERA_NAMES = {'side.0.name': 'The ISA', 'side.1.name': 'The Helghast', 'era.ancient.name': 'Opening campaign', 'era.classical.name': 'Escalation', 'era.medieval.name': 'Total war'}
YIELD_NAMES = {
    'yield.food': 'rations', 'yield.production': 'industry', 'yield.gold': 'credits', 'yield.science': 'research', 'yield.culture': 'command', 'yield.faith': 'propaganda',
    'game.bar.gold': 'Credits {stock} ({rate})', 'game.bar.science': 'Research {rate}: {item}', 'game.bar.culture': 'Command {rate}',
    'game.bar.faith': 'Propaganda {stock} ({rate})', 'game.bar.noResearch': 'Research {rate}: choose research', 'game.bar.noCivic': 'Command {rate}: choose a doctrine',
    'game.bar.civic': 'Command {rate}: {item}', 'game.bar.food': 'Rations {rate} each turn (all bases, after eating)', 'game.bar.production': 'Industry {rate} each turn',
    'tooltip.yield.food': 'Rations', 'tooltip.yield.production': 'Industry', 'tooltip.yield.gold': 'Credits', 'tooltip.yield.science': 'Research', 'tooltip.yield.culture': 'Command', 'tooltip.yield.faith': 'Propaganda',
}
