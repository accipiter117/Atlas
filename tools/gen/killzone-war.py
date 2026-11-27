"""Writes rules/killzone-war: Killzone: Extrasolar War (docs/KILLZONE.md, phase K2).

Eight worlds on placeholder maps (drawn here from a fixed seed, so the output never
changes unless this script does), the eleven lanes between them, the ships, the starting
fleets and the Balanced war scenario. Real maps and art come in K4 and K7.

Run: python3 tools/gen/killzone-war.py
"""
import json
import os
import random

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'rules', 'killzone-war')
LEGEND = {
    '.': {'terrain': 'grassland'}, ',': {'terrain': 'plains'}, ':': {'terrain': 'desert'}, ';': {'terrain': 'tundra'},
    'h': {'terrain': 'plains', 'hills': True}, 'g': {'terrain': 'grassland', 'hills': True}, 'd': {'terrain': 'desert', 'hills': True},
    't': {'terrain': 'tundra', 'hills': True}, 'f': {'terrain': 'grassland', 'feature': 'forest'}, 'F': {'terrain': 'plains', 'feature': 'forest'},
    'm': {'terrain': 'plains', 'feature': 'marsh'}, '^': {'terrain': 'mountain'}, '~': {'terrain': 'coast'}, 'o': {'terrain': 'ocean'}, 'l': {'terrain': 'lake'},
}


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


def main():
    rng = random.Random(1201)
    presets = []
    # Vekta: temperate fields and forests, ISA home.
    v = blob(36, 24, rng, '.', scatter=[('f', 0.16), (',', 0.18), ('g', 0.08), ('l', 0.02)])
    presets.append(preset('kw_vekta', v, 'side0',
                          place(v, [(12, 11, {'pop': 4}), (22, 7, {'pop': 3}), (20, 16, {'pop': 3})], 0),
                          place(v, [(13, 11, {'type': 'warrior'}), (21, 7, {'type': 'archer'}), (19, 16, {'type': 'spearman'}), (12, 12, {'type': 'warrior'})], 0)))
    # Helghan: ash plains, dust and storms, Helghast home.
    hgl = blob(36, 24, rng, ':', scatter=[(';', 0.2), ('d', 0.12), ('t', 0.06), ('^', 0.05), (',', 0.1)])
    presets.append(preset('kw_helghan', hgl, 'side1',
                          place(hgl, [(23, 12, {'pop': 4}), (13, 7, {'pop': 3}), (15, 17, {'pop': 3})], 1),
                          place(hgl, [(22, 12, {'type': 'warrior'}), (14, 7, {'type': 'archer'}), (16, 17, {'type': 'spearman'}), (23, 13, {'type': 'warrior'})], 1)))
    # Halcyon: a grey moon of craters, ISA mining outposts.
    hal = blob(24, 18, rng, ';', sea='o', edge='o', fill=0.7, scatter=[('t', 0.25), (':', 0.1)])
    presets.append(preset('kw_halcyon', hal, 'side0', place(hal, [(12, 9, {'pop': 2})], 0), place(hal, [(13, 9, {'type': 'warrior'})], 0)))
    # Morrow: penal mines on thin-aired plains, Helghast labour camps.
    mor = blob(24, 18, rng, ',', sea='o', edge='o', fill=0.7, scatter=[('h', 0.2), (':', 0.12), ('^', 0.04)])
    presets.append(preset('kw_morrow', mor, 'side1', place(mor, [(11, 9, {'pop': 2})], 1), place(mor, [(12, 9, {'type': 'warrior'})], 1)))
    # Bastion Station and Ardent Platform: decks.
    bas = decks(16, 12, rng)
    presets.append(preset('kw_bastion', bas, 'side0', place(bas, [(7, 6, {'pop': 1})], 0), place(bas, [(8, 6, {'type': 'warrior'})], 0)))
    ard = decks(16, 12, rng)
    presets.append(preset('kw_ardent', ard, 'side1', place(ard, [(8, 6, {'pop': 1})], 1), place(ard, [(9, 6, {'type': 'warrior'})], 1)))
    # Midway Relay: neutral decks. Kerberos Belt: neutral rocks with a refinery to claim.
    mid = decks(14, 10, rng)
    presets.append(preset('kw_midway', mid, 'neutral', [], []))
    ker = rocks(18, 12, rng)
    kc, kr = nearest_land(ker, 10, 8)
    presets.append(preset('kw_kerberos', ker, 'neutral', [], [], [{'site': 'refinery', 'col': kc, 'row': kr}]))

    worlds = [
        ('vekta', 'homeworld', 0, 'kw_vekta', True, [{'side': 0, 'ships': ['isa_cruiser', 'isa_destroyer', 'isa_intruder', 'isa_transport']}]),
        ('helghan', 'homeworld', 1, 'kw_helghan', False, [{'side': 1, 'ships': ['helghast_cruiser', 'helghast_destroyer', 'helghast_dropship', 'helghast_transport']}]),
        ('halcyon', 'moon', 2, 'kw_halcyon', False, []),
        ('morrow', 'moon', 3, 'kw_morrow', False, []),
        ('bastion', 'station', 4, 'kw_bastion', False, [{'side': 0, 'ships': ['isa_destroyer']}]),
        ('ardent', 'station', 5, 'kw_ardent', False, [{'side': 1, 'ships': ['helghast_destroyer']}]),
        ('midway', 'station', 6, 'kw_midway', False, []),
        ('kerberos', 'asteroid', 7, 'kw_kerberos', False, []),
    ]
    world_entries = []
    for wid, kind, order, pre, start, fleets in worlds:
        e = {'id': wid, 'nameKey': f'world.{wid}.name', 'descriptionKey': f'world.{wid}.text', 'kind': kind, 'order': order, 'map': {'preset': pre}}
        if start:
            e['start'] = True
        if fleets:
            e['fleets'] = fleets
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
            {'id': f'{prefix}_destroyer', 'cls': 'escort', 'strength': 30, 'cost': 150, 'space': {'capacity': 0, 'builtAt': ['homeworld', 'station']}},
            {'id': drop, 'cls': 'dropship', 'strength': 0, 'cost': 120, 'space': {'capacity': 1, 'lands': True, 'builtAt': ['homeworld', 'station']}},
            {'id': f'{prefix}_transport', 'cls': 'transport', 'strength': 0, 'cost': 100, 'space': {'capacity': 2, 'builtAt': ['homeworld', 'station']}},
        ]
        for s in ships[-4:]:
            s['faction'] = side
    unit_entries = [{'id': s['id'], 'nameKey': f"unit.{s['id']}.name", 'descriptionKey': f"unit.{s['id']}.text", 'class': s['cls'], 'domain': 'space', 'strength': s['strength'],
                     'moves': 1, 'cost': s['cost'], 'upkeep': 2, 'requires': {'faction': s['faction']}, 'space': s['space'], 'tags': ['ship']} for s in ships]

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
        wid = p['id'][3:]
        names[f"mapPreset.{p['id']}.name"] = names[f'world.{wid}.name'] + ' (placeholder)'
        names[f"mapPreset.{p['id']}.text"] = 'A stand-in map until K4 draws this world.'

    os.makedirs(os.path.join(ROOT, 'text'), exist_ok=True)

    def write(name, content_type, entries):
        with open(os.path.join(ROOT, name), 'w') as f:
            f.write('{\n  "contentType": "%s",\n  "entries": [\n%s\n  ]\n}\n' % (content_type, ',\n'.join('    ' + json.dumps(e) for e in entries)))

    write('mapPresets.json', 'mapPresets', presets)
    write('worlds.json', 'worlds', world_entries)
    write('lanes.json', 'lanes', lane_entries)
    write('unitClasses.json', 'unitClasses', classes)
    write('units.json', 'units', unit_entries)
    write('scenarios.json', 'scenarios', [{'id': 'balanced_war', 'nameKey': 'scenario.balanced_war.name', 'descriptionKey': 'scenario.balanced_war.text', 'default': True, 'presets': {}}])
    with open(os.path.join(ROOT, 'text', 'en-GB.json'), 'w') as f:
        f.write(json.dumps({'contentType': 'text', 'strings': names}, indent=2, ensure_ascii=False) + '\n')
    manifest = {
        'id': 'killzone-war', 'name': 'Killzone: Extrasolar War', 'version': '0.1.0', 'type': 'conversion', 'engine': '>=0.1.0',
        'description': 'The Killzone war across eight worlds: move fleets on a star map, take orbit, land armies and fight a front on every world. Early build: placeholder maps, and the star map rules only (Killzone Extrasolar War, phase K2).',
        'dependsOn': ['killzone'], 'loadAfter': [], 'incompatibleWith': [], 'options': [],
        'files': ['unitClasses.json', 'units.json', 'mapPresets.json', 'worlds.json', 'lanes.json', 'scenarios.json', 'text/en-GB.json'],
        'credits': 'Original Atlas content, MIT licence. Fan work: setting names belong to their owners; no text, art or code is taken from the games.',
    }
    with open(os.path.join(ROOT, 'mod.json'), 'w') as f:
        f.write(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
