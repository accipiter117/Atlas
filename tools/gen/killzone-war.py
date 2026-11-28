"""Writes rules/killzone-war: Killzone: Extrasolar War (docs/KILLZONE.md, phase K2).

Eight worlds on placeholder maps (drawn here from a fixed seed, so the output never
changes unless this script does), the eleven lanes between them, the ships, the starting
fleets and the Balanced war scenario. Real maps and art come in K4 and K7.

Run: python3 tools/gen/killzone-war.py
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import killzone_war_k4 as k4mod  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'rules', 'killzone-war')
LEGEND = {
    '.': {'terrain': 'grassland'}, ',': {'terrain': 'plains'}, ':': {'terrain': 'desert'}, ';': {'terrain': 'tundra'},
    'h': {'terrain': 'plains', 'hills': True}, 'g': {'terrain': 'grassland', 'hills': True}, 'd': {'terrain': 'desert', 'hills': True},
    't': {'terrain': 'tundra', 'hills': True}, 'f': {'terrain': 'grassland', 'feature': 'forest'}, 'F': {'terrain': 'plains', 'feature': 'forest'},
    'm': {'terrain': 'plains', 'feature': 'marsh'}, '^': {'terrain': 'mountain'}, '~': {'terrain': 'coast'}, 'o': {'terrain': 'ocean'}, 'l': {'terrain': 'lake'},
    'P': {'terrain': 'desert', 'resource': 'petrusite'}, 'U': {'terrain': 'plains', 'resource': 'fuel'},
}


def put(rows, c, r, ch):
    """Set one map letter (resources next to a base, so its borders take them in)."""
    cc, rr = nearest_land(rows, c, r)
    row = list(rows[rr])
    row[cc] = ch
    rows[rr] = ''.join(row)


def blob(w, h, rng, land, sea='o', edge='~', fill=0.62, scatter=()):
    """A landmass: an ellipse with a ragged edge, coast around it, ocean beyond; scatter = [(char, share)]."""
    rows = []
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for r in range(h):
        row = ''
        for c in range(w):
            dx, dy = (c - cx) / (w / 2), (r - cy) / (h / 2)
            d = (dx * dx + dy * dy) ** 0.5 + rng.uniform(-0.08, 0.08)
            if d < fill + 0.18:
                ch = land
                for k, share in scatter:
                    if rng.random() < share:
                        ch = k
                        break
            elif d < fill + 0.3:
                ch = edge
            else:
                ch = sea
            row += ch
        rows.append(row)
    return rows


def decks(w, h, rng):
    """A station: decks of plains with bulkheads (mountains) and a few openings."""
    rows = []
    for r in range(h):
        row = ''
        for c in range(w):
            wall = r in (0, h - 1) or c in (0, w - 1) or (c % 5 == 0 and r % 4 != 2 and rng.random() < 0.8)
            row += '^' if wall else ','
        rows.append(row)
    return rows


def rocks(w, h, rng):
    """An asteroid colony: rocks of desert and hills in the void, linked here and there."""
    rows = [['o'] * w for _ in range(h)]
    centres = [(3, 3), (9, 2), (14, 4), (4, 8), (10, 8), (15, 9)]
    for (cc, rr) in centres:
        for r in range(h):
            for c in range(w):
                if abs(c - cc) + abs(r - rr) <= 2 + rng.randint(0, 1):
                    rows[r][c] = rng.choice(':::d')
    for r in range(h):
        if rng.random() < 0.5:
            for c in range(w):
                if rows[r][c] == 'o' and 0 < c < w - 1 and rows[r][c - 1] != 'o':
                    rows[r][c] = '~'
    return [''.join(x) for x in rows]


def land_at(rows, c, r):
    return rows[r][c] not in 'o~l^'


def nearest_land(rows, c, r):
    for d in range(0, 20):
        for rr in range(max(0, r - d), min(len(rows), r + d + 1)):
            for cc in range(max(0, c - d), min(len(rows[0]), c + d + 1)):
                if land_at(rows, cc, rr):
                    return cc, rr
    raise ValueError('no land')


def place(rows, spots, side, extra=None):
    out = []
    used = set()
    for (c, r, *rest) in spots:
        cc, rr = nearest_land(rows, c, r)
        while (cc, rr) in used:
            cc, rr = nearest_land(rows, cc + 1, rr)
        used.add((cc, rr))
        e = {'side': side, 'col': cc, 'row': rr}
        if rest:
            e.update(rest[0])
        if extra:
            e.update(extra)
        out.append(e)
    return out


def preset(pid, rows, start, cities, units, sites=()):
    return {'id': pid, 'nameKey': f'mapPreset.{pid}.name', 'descriptionKey': f'mapPreset.{pid}.text', 'legend': LEGEND, 'rows': rows,
            'front': len(rows[0]) // 2, 'start': start, 'cities': cities, 'units': units, 'sites': list(sites)}


# Theatre rules (docs/KILLZONE.md 3.4).
STATION = {'noVehicles': True, 'objective': 'reactor'}
THEATRE = {
    'helghan': {'storm': {'every': 4, 'offset': 1, 'sight': -1, 'blocksOrbit': True}, 'toxic': {'damage': 5, 'terrain': ['desert'], 'immune': ['helghast']}},
    'halcyon': {'lowGravity': {'moves': 1, 'tag': 'jump'}},
    'morrow': {'lowGravity': {'moves': 1, 'tag': 'jump'}},
    'bastion': STATION, 'ardent': STATION, 'midway': STATION,
}

# War infrastructure (docs/KILLZONE.md 3.2): engineers build these wherever their side holds the ground.
FEATURES = ['forest', 'jungle', 'marsh', 'floodplain', 'oasis']
WORKS = [
    ('trench', 2, 4, {'zoc': True}, 'Trench line', '+4 defence, and a zone of control even when empty: the enemy stops when it comes next to it.'),
    ('wire', 1, 0, {'stopsEntry': True}, 'Sandbags and razor wire', 'An enemy that walks in loses the rest of its moves.'),
    ('mg_nest', 2, 2, {'freeShot': 15}, 'Machine gun nest', '+2 defence, and a free shot at the first enemy that stops beside it each turn.'),
    ('bunker', 4, 8, {'strikeArmour': 50}, 'Bunker', '+8 defence; the garrison takes half damage from orbital strikes and artillery.'),
    ('artillery_battery', 3, 0, {'bombard': {'strength': 45, 'range': 3, 'crew': True}}, 'Artillery battery', 'With one of your units standing in it, shells the nearest enemy within 3 hexes each turn.'),
    ('anti_air_battery', 3, 0, {'antiAir': 2}, 'Anti-air battery', 'No enemy drop zone or orbital strike within 2 hexes.'),
    ('arc_tower', 3, 0, {'arcDamage': 15, 'faction': 'helghast'}, 'Arc tower', 'Helghast only: arcs hit every enemy beside it each turn.'),
    ('minefield', 1, 0, {'hidden': True, 'mineDamage': 35}, 'Minefield', 'Hidden from the enemy; the first of them to walk in sets it off.'),
    ('landing_bay', 4, 0, {'landingBay': True, 'supply': 2}, 'Landing bay', 'Army groups land here from orbit without dropships; supplies 2 hexes.'),
    ('supply_depot', 3, 0, {'supply': 3}, 'Supply depot', 'Supplies every hex your side holds within 3.'),
    ('command_post', 4, 0, {'supply': 3}, 'Forward command post', 'Supplies every hex your side holds within 3.'),
    ('field_hospital', 2, 0, {'heal': 20}, 'Field hospital', 'Your units here heal 20 more each turn.'),
    ('comms_relay', 2, 0, {'reveal': 2}, 'Comms relay', 'Reveals enemy minefields within 2 hexes.'),
]


def main():
    rng = random.Random(1201)
    presets = []
    # Vekta: temperate fields and forests, ISA home.
    v = blob(36, 24, rng, '.', scatter=[('f', 0.16), (',', 0.18), ('g', 0.08), ('l', 0.02)])
    put(v, 11, 10, 'U')
    put(v, 21, 15, 'U')
    presets.append(preset('kw_vekta', v, 'side0',
                          place(v, [(12, 11, {'pop': 4, 'civ': 'isa'}), (22, 7, {'pop': 3, 'civ': 'home_guard'}), (20, 16, {'pop': 3, 'civ': 'isa_fleet'})], 0),
                          place(v, [(13, 11, {'type': 'rifle_squad', 'civ': 'isa'}), (21, 7, {'type': 'home_guard_militia', 'civ': 'home_guard'}), (19, 16, {'type': 'rifle_squad', 'civ': 'isa_fleet'}),
                                    (12, 12, {'type': 'combat_engineers', 'civ': 'isa'}), (22, 8, {'type': 'rifle_squad', 'civ': 'home_guard'}), (20, 17, {'type': 'recon_team', 'civ': 'isa_fleet'})], 0)))
    # Helghan: ash plains, dust and storms, Helghast home.
    hgl = blob(36, 24, rng, ':', scatter=[(';', 0.2), ('d', 0.12), ('t', 0.06), ('^', 0.05), (',', 0.1)])
    put(hgl, 24, 11, 'P')
    put(hgl, 12, 7, 'P')
    put(hgl, 16, 16, 'P')
    presets.append(preset('kw_helghan', hgl, 'side1',
                          place(hgl, [(23, 12, {'pop': 4, 'civ': 'helghast'}), (13, 7, {'pop': 3, 'civ': 'stahl'}), (15, 17, {'pop': 3, 'civ': 'helghast_navy'})], 1),
                          place(hgl, [(22, 12, {'type': 'assault_trooper', 'civ': 'helghast'}), (14, 7, {'type': 'assault_trooper', 'civ': 'stahl'}), (16, 17, {'type': 'assault_trooper', 'civ': 'helghast_navy'}),
                                    (23, 13, {'type': 'pioneer_squad', 'civ': 'helghast'}), (13, 8, {'type': 'pioneer_squad', 'civ': 'stahl'}), (15, 18, {'type': 'scout_sniper', 'civ': 'helghast_navy'})], 1)))
    # Halcyon: a grey moon of craters, ISA mining outposts.
    hal = blob(24, 18, rng, ';', sea='o', edge='o', fill=0.7, scatter=[('t', 0.25), (':', 0.1)])
    put(hal, 11, 9, 'U')
    presets.append(preset('kw_halcyon', hal, 'side0', place(hal, [(12, 9, {'pop': 2, 'civ': 'home_guard'})], 0), place(hal, [(13, 9, {'type': 'rifle_squad', 'civ': 'home_guard'})], 0)))
    # Morrow: penal mines on thin-aired plains, Helghast labour camps.
    mor = blob(24, 18, rng, ',', sea='o', edge='o', fill=0.7, scatter=[('h', 0.2), (':', 0.12), ('^', 0.04)])
    presets.append(preset('kw_morrow', mor, 'side1', place(mor, [(11, 9, {'pop': 2, 'civ': 'helghast'})], 1), place(mor, [(12, 9, {'type': 'assault_trooper', 'civ': 'helghast'})], 1)))
    # Bastion Station and Ardent Platform: decks.
    # K4b scenarios: other starting ownership for some worlds.
    vi = list(v)
    presets.append({**preset('kw_vekta_invaded', vi, 'front',
                             place(vi, [(12, 11, {'pop': 4, 'civ': 'isa'}), (22, 7, {'pop': 3, 'civ': 'home_guard'}), (20, 16, {'pop': 3, 'civ': 'isa_fleet'})], 0),
                             place(vi, [(13, 11, {'type': 'rifle_squad', 'civ': 'isa'}), (21, 7, {'type': 'home_guard_militia', 'civ': 'home_guard'}), (19, 16, {'type': 'rifle_squad', 'civ': 'isa_fleet'}),
                                        (12, 12, {'type': 'combat_engineers', 'civ': 'isa'}), (22, 8, {'type': 'rifle_squad', 'civ': 'home_guard'})], 0)
                             + place(vi, [(30, 9, {'type': 'assault_trooper', 'civ': 'helghast_navy'}), (31, 11, {'type': 'assault_trooper', 'civ': 'helghast_navy'}), (30, 13, {'type': 'helghast_heavy', 'civ': 'helghast'}),
                                          (31, 14, {'type': 'assault_trooper', 'civ': 'helghast'})], 1)), 'front': 26})
    hal_h = list(hal)
    presets.append(preset('kw_halcyon_held', hal_h, 'side1', place(hal_h, [(12, 9, {'pop': 2, 'civ': 'helghast_navy'})], 1), place(hal_h, [(13, 9, {'type': 'assault_trooper', 'civ': 'helghast_navy'})], 1)))

    def reactor(rows, c, r):
        cc, rr = nearest_land(rows, c, r)
        return [{'site': 'reactor', 'col': cc, 'row': rr}]
    bas = decks(16, 12, rng)
    presets.append(preset('kw_bastion', bas, 'side0', place(bas, [(7, 6, {'pop': 1, 'civ': 'isa_fleet'})], 0), place(bas, [(8, 6, {'type': 'rifle_squad', 'civ': 'isa_fleet'})], 0), reactor(bas, 11, 5)))
    ard = decks(16, 12, rng)
    presets.append(preset('kw_ardent', ard, 'side1', place(ard, [(8, 6, {'pop': 1, 'civ': 'helghast_navy'})], 1), place(ard, [(9, 6, {'type': 'assault_trooper', 'civ': 'helghast_navy'})], 1), reactor(ard, 4, 5)))
    # Midway Relay: neutral decks round a reactor. Kerberos Belt: neutral rocks with a refinery to claim.
    mid = decks(14, 10, rng)
    presets.append(preset('kw_midway', mid, 'neutral', [], [], reactor(mid, 7, 5)))
    mid_i = decks(14, 10, random.Random(77))
    presets.append(preset('kw_midway_isa', mid_i, 'side0', [], place(mid_i, [(6, 5, {'type': 'rifle_squad', 'civ': 'isa_fleet'})], 0), reactor(mid_i, 7, 5)))
    mor_i = list(mor)
    presets.append(preset('kw_morrow_isa', mor_i, 'side0', place(mor_i, [(11, 9, {'pop': 2, 'civ': 'isa'})], 0), place(mor_i, [(12, 9, {'type': 'rifle_squad', 'civ': 'isa'})], 0)))
    ker = rocks(18, 12, rng)
    for (c, r) in [(3, 3), (9, 2), (14, 4), (4, 8)]:
        put(ker, c, r, 'P')
    kc, kr = nearest_land(ker, 10, 8)
    presets.append(preset('kw_kerberos', ker, 'neutral', [], [], [{'site': 'refinery', 'col': kc, 'row': kr}]))

    worlds = [
        ('vekta', 'homeworld', 0, 'kw_vekta', True, [{'side': 0, 'faction': 'isa_fleet', 'ships': ['isa_cruiser', 'isa_destroyer', 'isa_intruder', 'isa_transport']}]),
        ('helghan', 'homeworld', 1, 'kw_helghan', False, [{'side': 1, 'faction': 'helghast_navy', 'ships': ['helghast_cruiser', 'helghast_destroyer', 'helghast_dropship', 'helghast_transport']}]),
        ('halcyon', 'moon', 2, 'kw_halcyon', False, []),
        ('morrow', 'moon', 3, 'kw_morrow', False, []),
        ('bastion', 'station', 4, 'kw_bastion', False, [{'side': 0, 'faction': 'isa_fleet', 'ships': ['isa_destroyer']}]),
        ('ardent', 'station', 5, 'kw_ardent', False, [{'side': 1, 'faction': 'helghast_navy', 'ships': ['helghast_destroyer']}]),
        ('midway', 'station', 6, 'kw_midway', False, []),
        ('kerberos', 'asteroid', 7, 'kw_kerberos', False, []),
    ]
    pos = {'vekta': (9, 50), 'bastion': (28, 26), 'halcyon': (28, 74), 'midway': (50, 22), 'kerberos': (50, 78), 'ardent': (72, 26), 'morrow': (72, 74), 'helghan': (91, 50)}
    world_entries = []
    for wid, kind, order, pre, start, fleets in worlds:
        e = {'id': wid, 'nameKey': f'world.{wid}.name', 'descriptionKey': f'world.{wid}.text', 'kind': kind, 'order': order, 'map': {'preset': pre}, 'pos': {'x': pos[wid][0], 'y': pos[wid][1]}}
        if start:
            e['start'] = True
        if fleets:
            e['fleets'] = fleets
        if wid in THEATRE:
            e['theatre'] = THEATRE[wid]
        if wid == 'vekta':
            e['homeOf'] = 0
        if wid == 'helghan':
            e['homeOf'] = 1
        world_entries.append(e)
    lanes = [('vekta', 'bastion'), ('vekta', 'halcyon'), ('bastion', 'halcyon'), ('helghan', 'ardent'), ('helghan', 'morrow'), ('ardent', 'morrow'),
             ('bastion', 'midway'), ('ardent', 'midway'), ('halcyon', 'kerberos'), ('morrow', 'kerberos')]
    lane_entries = [{'id': f'{a}_{b}', 'from': a, 'to': b, 'turns': 1} for a, b in lanes]
    lane_entries.append({'id': 'vekta_helghan', 'from': 'vekta', 'to': 'helghan', 'turns': 3, 'heavyOnly': True})

    classes = [
        {'id': 'capital_ship', 'nameKey': 'unitClass.capital_ship.name', 'domain': 'space', 'combat': 'none'},
        {'id': 'escort', 'nameKey': 'unitClass.escort.name', 'domain': 'space', 'combat': 'none'},
        {'id': 'dropship', 'nameKey': 'unitClass.dropship.name', 'domain': 'space', 'combat': 'none'},
        {'id': 'transport', 'nameKey': 'unitClass.transport.name', 'domain': 'space', 'combat': 'none'},
    ]
    ships = []
    for side, prefix, drop in [('isa', 'isa', 'isa_intruder'), ('helghast', 'helghast', 'helghast_dropship')]:
        ships += [
            {'id': f'{prefix}_cruiser', 'cls': 'capital_ship', 'strength': 60, 'cost': 320, 'space': {'capacity': 3, 'bombard': True, 'heavy': True, 'builtAt': ['homeworld', 'station']}},
            {'id': f'{prefix}_destroyer', 'cls': 'escort', 'strength': 30, 'cost': 90, 'space': {'capacity': 0, 'builtAt': ['homeworld', 'station']}},
            {'id': drop, 'cls': 'dropship', 'strength': 0, 'cost': 120, 'space': {'capacity': 1, 'lands': True, 'builtAt': ['homeworld', 'station']}},
            {'id': f'{prefix}_transport', 'cls': 'transport', 'strength': 0, 'cost': 100, 'space': {'capacity': 2, 'builtAt': ['homeworld', 'station']}},
        ]
        for s in ships[-4:]:
            s['faction'] = side
    improvement_entries = []
    for wid_, turns, defence, war, name, text in WORKS:
        e = {'id': wid_, 'nameKey': f'improvement.{wid_}.name', 'descriptionKey': f'improvement.{wid_}.text', 'turns': turns, 'charges': 1,
             'validTerrain': ['grassland', 'plains', 'desert', 'tundra', 'snow'], 'validFeatures': FEATURES, 'war': war}
        if defence:
            e['defence'] = defence
        if k4mod.WORK_TECH.get(wid_):
            e['requires'] = {'tech': k4mod.WORK_TECH[wid_]}
        improvement_entries.append(e)
    # K4: the extractor works petrusite and fuel (inside a base's borders, so the base can use it).
    improvement_entries.append({'id': 'extractor', 'nameKey': 'improvement.extractor.name', 'descriptionKey': 'improvement.extractor.text', 'turns': 3, 'charges': 1,
                                'needsResource': True, 'yields': {'production': 1}, 'requires': {'tech': 'deep_core_extraction'}})
    improvement_entries.insert(0, k4mod.wipe(keep=['farm']))
    unit_entries = [{'id': s['id'], 'nameKey': f"unit.{s['id']}.name", 'descriptionKey': f"unit.{s['id']}.text", 'class': s['cls'], 'domain': 'space', 'strength': s['strength'],
                     'moves': 1, 'cost': s['cost'], 'upkeep': 2, 'requires': {'faction': s['faction']}, 'space': s['space'], 'tags': ['ship', 'dropship'] if s['cls'] == 'dropship' else ['ship']} for s in ships]

    names = {
        'world.vekta.name': 'Vekta', 'world.vekta.text': 'The ISA home world: temperate fields, cities and coast.',
        'world.helghan.name': 'Helghan', 'world.helghan.text': 'The Helghast home world: ash plains, storms and refineries.',
        'world.halcyon.name': 'Halcyon', 'world.halcyon.text': 'A low-gravity moon of craters, with ISA mining outposts.',
        'world.morrow.name': 'Morrow', 'world.morrow.text': 'A moon of penal mines and thin air, worked by Helghast labour camps.',
        'world.bastion.name': 'Bastion Station', 'world.bastion.text': 'The ISA orbital dock that builds and repairs ships and guards Vekta.',
        'world.ardent.name': 'Ardent Platform', 'world.ardent.text': 'The Helghast arc defence station guarding Helghan.',
        'world.midway.name': 'Midway Relay', 'world.midway.text': 'A neutral deep-space station: the chokepoint of the war.',
        'world.kerberos.name': 'Kerberos Belt', 'world.kerberos.text': 'A neutral asteroid colony, rich in fuel ore, waiting to be claimed.',
        'scenario.balanced_war.name': 'Balanced war', 'scenario.balanced_war.text': 'Each side holds its home world, a moon and a station; Midway and Kerberos wait in between.',
        'unitClass.capital_ship.name': 'Capital ship', 'unitClass.escort.name': 'Escort', 'unitClass.dropship.name': 'Dropship', 'unitClass.transport.name': 'Transport',
        'unit.isa_cruiser.name': 'ISA cruiser', 'unit.isa_cruiser.text': 'A slow, powerful warship. Carries three army groups and can strike the ground from orbit.',
        'unit.isa_destroyer.name': 'ISA destroyer', 'unit.isa_destroyer.text': 'An escort that fights other ships.',
        'unit.isa_intruder.name': 'Intruder wing', 'unit.isa_intruder.text': 'Dropships that land an army group anywhere enemy anti-air does not cover.',
        'unit.isa_transport.name': 'ISA transport', 'unit.isa_transport.text': 'Carries two army groups between worlds but cannot fight.',
        'unit.helghast_cruiser.name': 'Helghast cruiser', 'unit.helghast_cruiser.text': 'A slow, powerful warship. Carries three army groups and can strike the ground from orbit.',
        'unit.helghast_destroyer.name': 'Helghast destroyer', 'unit.helghast_destroyer.text': 'An escort that fights other ships.',
        'unit.helghast_dropship.name': 'Helghast dropships', 'unit.helghast_dropship.text': 'Dropships that land an army group anywhere enemy anti-air does not cover.',
        'unit.helghast_transport.name': 'Helghast transport', 'unit.helghast_transport.text': 'Carries two army groups between worlds but cannot fight.',
    }
    for p in presets:
        wid = p['id'][3:].split('_')[0]
        names[f"mapPreset.{p['id']}.name"] = names[f'world.{wid}.name'] + ' (placeholder)'
        names[f"mapPreset.{p['id']}.text"] = 'This world\'s map: generated from a fixed seed by tools/gen/killzone-war.py.'
        names[f"mapPreset.{p['id']}.name"] = names[f'world.{wid}.name']

    for wid_, turns, defence, war, name, text in WORKS:
        names[f'improvement.{wid_}.name'] = name
        names[f'improvement.{wid_}.text'] = text
    names['improvement.extractor.name'] = 'Extractor'
    names['improvement.extractor.text'] = 'Works petrusite or fuel inside a base\'s borders, so the base can use it. +1 industry.'
    k4files, k4art = k4mod.k4({}, None, names)
    k4units = k4files.pop('units.json')[1]
    # Units: clear the ancient ones (keeping the ships), add the ships, then the war's own and the ships' requirements.
    unit_entries = [k4units[0]] + unit_entries + k4units[1:]
    names.update(k4mod.ERA_NAMES)
    names.update(k4mod.YIELD_NAMES)
    names['site.reactor.name'] = 'Reactor'
    names['site.reactor.text'] = 'The heart of a station: whoever holds it holds the station.'
    os.makedirs(os.path.join(ROOT, 'text'), exist_ok=True)

    def write(name, content_type, entries):
        os.makedirs(os.path.dirname(os.path.join(ROOT, name)), exist_ok=True)
        with open(os.path.join(ROOT, name), 'w') as f:
            f.write('{\n  "contentType": "%s",\n  "entries": [\n%s\n  ]\n}\n' % (content_type, ',\n'.join('    ' + json.dumps(e) for e in entries)))

    write('mapPresets.json', 'mapPresets', presets)
    write('worlds.json', 'worlds', world_entries)
    write('lanes.json', 'lanes', lane_entries)
    write('unitClasses.json', 'unitClasses', classes)
    write('units.json', 'units', unit_entries)
    for fname, (ctype, entries) in k4files.items():
        write(fname, ctype, entries)
    write('improvements.json', 'improvements', improvement_entries)
    write('sites.json', 'sites', [{'id': 'reactor', 'nameKey': 'site.reactor.name', 'descriptionKey': 'site.reactor.text', 'icon': 'site.power_plant', 'effects': [{'effect': 'yieldBonus', 'yield': 'production', 'amount': 1}]}])
    with open(os.path.join(ROOT, 'tuning.json'), 'w') as f:
        f.write(json.dumps({'contentType': 'tuning', 'set': {'supply.enabled': True, 'warSupport.enabled': True, 'warSupport.gloryBattle': 5, 'warSupport.gloryCity': 10, 'warSupport.gloryCapital': 25, 'warSupport.gloryWorld': 15, 'warSupport.propagandaPer': 40, 'warSupport.propagandaMax': 1, 'victory.turnLimits': {'online': 80, 'quick': 80, 'standard': 120, 'epic': 200, 'marathon': 200}, 'setup.maxAis': 5, 'space.loadRange': 3, 'supply.siteRange': 3, 'supply.attrition': 5, 'supply.surrenderTurns': 5, 'supply.dropRadius': 3, 'warSupport.sharedSight': True,
                                                             'raiders.units': [{'fromTurn': 0, 'unit': 'scout_sniper'}]}}, indent=2) + '\n')
    write('scenarios.json', 'scenarios', [
        {'id': 'balanced_war', 'nameKey': 'scenario.balanced_war.name', 'descriptionKey': 'scenario.balanced_war.text', 'default': True, 'presets': {}},
        {'id': 'invasion_of_vekta', 'nameKey': 'scenario.invasion_of_vekta.name', 'descriptionKey': 'scenario.invasion_of_vekta.text', 'presets': {'vekta': 'kw_vekta_invaded', 'halcyon': 'kw_halcyon_held'}},
        {'id': 'road_to_helghan', 'nameKey': 'scenario.road_to_helghan.name', 'descriptionKey': 'scenario.road_to_helghan.text', 'presets': {'midway': 'kw_midway_isa', 'morrow': 'kw_morrow_isa'}},
    ])
    names['scenario.invasion_of_vekta.name'] = 'The invasion of Vekta'
    names['scenario.invasion_of_vekta.text'] = 'The Helghast hold Halcyon and have already landed on Vekta\'s eastern shore.'
    names['scenario.road_to_helghan.name'] = 'The road to Helghan'
    names['scenario.road_to_helghan.text'] = 'The ISA hold Midway Relay and the moon of Morrow: Helghan is next.'
    with open(os.path.join(ROOT, 'text', 'en-GB.json'), 'w') as f:
        f.write(json.dumps({'contentType': 'text', 'strings': names}, indent=2, ensure_ascii=False) + '\n')
    # The star map's planets are drawn in code; these are their colours, by art id, through the skin.
    os.makedirs(os.path.join(ROOT, 'skin'), exist_ok=True)
    with open(os.path.join(ROOT, 'skin', 'skin.json'), 'w') as f:
        f.write(json.dumps({'contentType': 'skin', 'values': {'placeholders': {'world': {
            'vekta': '#4f8a5b', 'helghan': '#9a4a2c', 'halcyon': '#9a9a94', 'morrow': '#7d6a58',
            'bastion': '#8fa3b8', 'ardent': '#b0653a', 'midway': '#a8a49a', 'kerberos': '#8a7a62', 'space': '#0b0e17', 'lane': '#5a6478'}},
            # K4: every unit of every faction wears its side's sprite.
            'art': k4art}}, indent=2) + '\n')
    manifest = {
        'id': 'killzone-war', 'name': 'Killzone: Extrasolar War', 'version': '0.1.0', 'type': 'conversion', 'engine': '>=0.1.0',
        'description': 'The Killzone war across eight worlds: move fleets on a star map, take orbit, land armies and fight a front on every world. Six splinter factions, the war\'s own units, bases, projects, research and doctrines (Killzone Extrasolar War, phases K2 to K4).',
        'dependsOn': ['killzone'], 'loadAfter': [], 'incompatibleWith': [], 'options': [],
        # Order matters: the ancient trees go first (cascading what needs them), then the war's own content.
        'files': ['tuning.json', 'sites.json', 'techs.json', 'civics.json', 'governments.json', 'policies.json', 'improvements.json', 'resources.json',
                  'buildings.json', 'wonders.json', 'unitClasses.json', 'units.json', 'beliefs.json', 'victories.json', 'ai/weights.json', 'factions.json', 'leaders.json', 'cityNames.json',
                  'mapPresets.json', 'worlds.json', 'lanes.json', 'scenarios.json', 'text/en-GB.json', 'skin/skin.json'],
        'credits': 'Original Atlas content, MIT licence. Fan work: setting names belong to their owners; no text, art or code is taken from the games.',
    }
    with open(os.path.join(ROOT, 'mod.json'), 'w') as f:
        f.write(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
