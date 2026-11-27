# Phase 19: the Killzone conversion, a two-sided front-line war on a fixed
# map, stacking on base-ancient. Re-runnable: python3 tools/gen/killzone.py
#
# Setting names (the ISA, the Helghast, Vekta, Helghan) belong to their
# owners; every sentence here is original wording in British English.
import json, collections, os
K = 'rules/killzone/'
os.makedirs(K + 'text', exist_ok=True)
os.makedirs(K + 'skin', exist_ok=True)
OD = collections.OrderedDict
text = {}
def T(k, v): text[k] = v; return k
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(K + name, 'w').write('\n'.join(lines))

# ---------- The two sides ----------
SIDES = [
    dict(id='isa', side=0, name='The ISA', adj='ISA', desc='The Interplanetary Strategic Alliance: the colonial army of Vekta, holding the line against the Helghast.',
         colours=('#3f7fd0', '#e6edf5'), bias={'terrain': ['grassland', 'plains']},
         trait=('alliance_logistics', 'Alliance Logistics', 'Every city gains +1 production, and units cost 10% less.', [{'effect': 'yieldBonus', 'yield': 'production', 'amount': 1}, {'effect': 'costPercent', 'target': 'units', 'amount': -10}]),
         leader=('templar', 'Templar', 'steady_command', 'Steady Command', 'Units heal 5 more each turn.', [{'effect': 'healBonus', 'amount': 5}],
                 'hold_the_line', 'Hold the Line', 'Respects rulers who keep their word; hates surprise attacks.', 'keptPromises', 'surpriseWar', 'builder_conqueror',
                 {'conquest': 1.3, 'science': 1.0, 'culture': 0.8, 'religious': 0.5, 'score': 1.2}),
         unit=dict(id='isa_sniper', name='ISA sniper team', text='The ISA\'s marksmen: they hit harder and from further back than ordinary support gunners.', cls='ranged', era='ancient', strength=16, ranged=30, moves=2, cost=70, replaces='archer', requires={'tech': 'archery'}, tags=['infantry']),
         cities=['Vekta Landing', 'New Sun', 'Kessler Ridge', 'Fort Ardent', 'Cobalt Bay', 'Alhazen', 'Blue Harbour', 'Corinth Field', 'Stillwater', 'Grey Point', 'Southgate', 'Ironwood']),
    dict(id='helghast', side=1, name='The Helghast', adj='Helghast', desc='The hardened people of Helghan: a disciplined empire forged by a hostile world, fighting to take back what they lost.',
         colours=('#b8321f', '#1b1b1b'), bias={'terrain': ['plains', 'desert', 'tundra']},
         trait=('forged_by_helghan', 'Forged by Helghan', 'Units heal 10 more each turn, and melee units cost 15% less.', [{'effect': 'healBonus', 'amount': 10}, {'effect': 'costPercent', 'target': 'melee', 'amount': -15}]),
         leader=('visari', 'Visari', 'the_autarch', 'The Autarch', '+10% production in every city.', [{'effect': 'yieldPercent', 'yield': 'production', 'amount': 10}],
                 'iron_will', 'Iron Will', 'Admires a strong army; scorns rulers who neglect theirs.', 'largeArmy', 'weakArmy', 'conqueror',
                 {'conquest': 1.5, 'science': 0.9, 'culture': 0.7, 'religious': 0.5, 'score': 1.0}),
         unit=dict(id='helghast_heavy', name='Helghast heavy trooper', text='Armoured Helghast shock infantry: tougher than the assault squads they replace. Needs iron.', cls='melee', era='classical', strength=42, moves=2, cost=115, replaces='swordsman', requires={'tech': 'iron_working', 'resource': 'iron'}, tags=['infantry']),
         cities=['Pyrrhus', 'Visari Square', 'Tharsis', 'Corinth Depot', 'Suljeva', 'Maelstra', 'Ashfall', 'Stahl Works', 'Kharon', 'Blackstone', 'Redwater', 'Cinder Bay']),
]
factions = [{'op': 'remove', 'where': {'tags': {'has': 'historical'}}, 'cascade': True}]
leaders, units, cityNames = [], [], [{'op': 'remove', 'where': {'tags': {'has': 'historical'}}}]
for f in SIDES:
    fid = f['id']
    tid, tname, ttext, tfx = f['trait']
    lid, lname, ltid, ltname, lttext, ltfx, aid, aname, atext, likes, hates, pers, bias = f['leader']
    u = f['unit']
    factions.append(OD([('id', fid), ('nameKey', T(f'faction.{fid}.name', f['name'])), ('adjectiveKey', T(f'faction.{fid}.adj', f['adj'])), ('descriptionKey', T(f'faction.{fid}.text', f['desc'])),
        ('colours', {'primary': f['colours'][0], 'secondary': f['colours'][1]}), ('leaders', [lid]), ('startBias', f['bias']),
        ('trait', OD([('id', tid), ('nameKey', T(f'trait.{tid}.name', tname)), ('descriptionKey', T(f'trait.{tid}.text', ttext)), ('effects', tfx)])),
        ('uniqueUnits', [u['id']]), ('cityNames', f'k_{fid}'), ('frontSide', f['side']), ('tags', ['killzone'])]))
    leaders.append(OD([('id', lid), ('faction', fid), ('nameKey', T(f'leader.{lid}.name', lname)),
        ('trait', OD([('id', ltid), ('nameKey', T(f'trait.{ltid}.name', ltname)), ('descriptionKey', T(f'trait.{ltid}.text', lttext)), ('effects', ltfx)])),
        ('agenda', OD([('id', aid), ('nameKey', T(f'agenda.{aid}.name', aname)), ('descriptionKey', T(f'agenda.{aid}.text', atext)), ('likes', likes), ('hates', hates), ('weight', 6)])),
        ('portrait', f'leader.{lid}'), ('ai', OD([('personality', pers), ('victoryBias', bias)]))]))
    ue = OD([('id', u['id']), ('nameKey', T(f"unit.{u['id']}.name", u['name'])), ('class', u['cls']), ('era', u['era']), ('strength', u['strength'])])
    if 'ranged' in u: ue['rangedStrength'] = u['ranged']; ue['range'] = 2
    ue.update([('moves', u['moves']), ('cost', u['cost']), ('upkeep', 1), ('requires', {**u['requires'], 'faction': fid}), ('replaces', u['replaces']),
               ('sprite', f"unit.{u['id']}"), ('tags', u['tags']), ('descriptionKey', T(f"unit.{u['id']}.text", u['text']))])
    units.append(ue)
    cityNames.append(OD([('id', f'k_{fid}'), ('names', f['cities'])]))
dump('factions.json', 'factions', factions)
dump('leaders.json', 'leaders', leaders)
dump('units.json', 'units', units)
dump('cityNames.json', 'cityNames', cityNames)

# Base units fight on under new names.
REN = {'warrior': 'Rifle squad', 'scout': 'Recon team', 'slinger': 'Grenadiers', 'spearman': 'Heavy weapons team', 'archer': 'Support gunners',
       'horseman': 'Light armour', 'chariot': 'Patrol buggy', 'swordsman': 'Assault squad', 'catapult': 'Mortar team', 'trireme': 'Patrol boat',
       'pikeman': 'Anti-armour team', 'man_at_arms': 'Shock troopers', 'knight': 'Battle tank', 'trebuchet': 'Artillery battery', 'caravel': 'Gunboat',
       'musketman': 'Elite troopers', 'bombard': 'Heavy artillery', 'builder': 'Engineers', 'settler': 'Colonists', 'missionary': 'Chaplain', 'trader': 'Supply convoy', 'spy': 'Intelligence agent'}
for uid, name in REN.items(): text[f'unit.{uid}.name'] = name
for e, name in {'ancient': 'Opening campaign', 'classical': 'The long war', 'medieval': 'Total war', 'renaissance': 'The last offensive'}.items(): text[f'era.{e}.name'] = name

# ---------- Sites and the fixed map ----------
SITES = [('factory', 'Factory', 'Every city of the side that holds it gains +2 production.', [{'effect': 'yieldBonus', 'yield': 'production', 'amount': 2}]),
         ('power_plant', 'Power plant', 'Every city of the side that holds it gains +2 science and +1 production.', [{'effect': 'yieldBonus', 'yield': 'science', 'amount': 2}, {'effect': 'yieldBonus', 'yield': 'production', 'amount': 1}]),
         ('refinery', 'Petrusite refinery', 'Every city of the side that holds it gains +3 gold.', [{'effect': 'yieldBonus', 'yield': 'gold', 'amount': 3}])]
dump('sites.json', 'sites', [OD([('id', i), ('nameKey', T(f'site.{i}.name', n)), ('descriptionKey', T(f'site.{i}.text', d)), ('icon', f'site.{i}'), ('effects', fx)]) for i, n, d, fx in SITES])

# The Corinth front: Vekta's green fields in the west, Helghan's grey plains in
# the east, a ridge and a broken forest along the middle. 36 by 20 tiles.
LEGEND = OD([('.', {'terrain': 'grassland'}), (',', {'terrain': 'plains'}), (':', {'terrain': 'desert'}), (';', {'terrain': 'tundra'}),
             ('h', {'terrain': 'plains', 'hills': True}), ('g', {'terrain': 'grassland', 'hills': True}), ('f', {'terrain': 'grassland', 'feature': 'forest'}),
             ('F', {'terrain': 'plains', 'feature': 'forest'}), ('m', {'terrain': 'plains', 'feature': 'marsh'}), ('^', {'terrain': 'mountain'}),
             ('~', {'terrain': 'coast'}), ('o', {'terrain': 'ocean'}), ('l', {'terrain': 'lake'})])
ROWS = [
    'oooo~~~~~~~~~~~~~~~~~~~~~~~~~~~~oooo',
    'oo~~....ff....,,,h,,,,;;;;::::;;~~oo',
    'o~.....fff...g,,,hh,,,;;;;;::::;;;~o',
    'o~..g.......gg,,,,h^,,;;;;;;:::;;;~o',
    '~....ff......,,,,hh,,,,;;;;;;;;;;;;~',
    '~.....f..l...,,,f,,,,,,,;;;;::;;;;;~',
    '~..........,,,,fF,,,,,,,,;;;::::;;;~',
    '~...gg.....,,,,FF,,,,h,,,;;;::::;;;~',
    '~..........,,,,,,,,,hh,,,;;;;;;;;;;~',
    '~.....ff...,,,m,,,,,,,,,,,;;;;;;l;;~',
    '~.....f....,,mm,,^^,,,,,,,;;;;;;;;;~',
    '~..........,,,,,,,^,,,,,,,,;;;;;;;;~',
    '~...l......,,,,,,,,,,FF,,,,;;::::;;~',
    '~..........,,,hh,,,,,F,,,,,;;:::::;~',
    '~....gg....,,,,h,,,,,,,,,,,,;;;;;;;~',
    '~.....g....,,,,,,,,,,,,,h,,,,;;;;;;~',
    'o~....ff...,,,,,,,m,,,,hh,,,;;;;;;~o',
    'o~~........,,,,,,,mm,,,,,,,,;;;;;~~o',
    'oo~~~.....,,,,,,,,,,,,,,,,,,;;;~~~oo',
    'oooo~~~~~~~~~~~~~~~~~~~~~~~~~~~~oooo',
]
assert all(len(r) == 36 for r in ROWS), [len(r) for r in ROWS]
preset = OD([('id', 'corinth_front'), ('nameKey', T('mapPreset.corinth_front.name', 'The Corinth front')),
    ('descriptionKey', T('mapPreset.corinth_front.text', 'Vekta\'s fields in the west, Helghan\'s grey plains in the east, and a ridge between them.')),
    ('legend', LEGEND), ('rows', ROWS), ('front', 18),
    ('cities', [{'side': 0, 'col': 4, 'row': 9, 'pop': 3}, {'side': 0, 'col': 7, 'row': 3, 'pop': 2}, {'side': 0, 'col': 8, 'row': 15, 'pop': 2},
                {'side': 1, 'col': 31, 'row': 10, 'pop': 3}, {'side': 1, 'col': 28, 'row': 4, 'pop': 2}, {'side': 1, 'col': 28, 'row': 16, 'pop': 2}]),
    ('units', [{'side': 0, 'type': t, 'col': c, 'row': r} for t, c, r in [('warrior', 14, 6), ('warrior', 14, 11), ('archer', 13, 9), ('spearman', 15, 14), ('builder', 5, 10), ('scout', 12, 3)]]
             + [{'side': 1, 'type': t, 'col': c, 'row': r} for t, c, r in [('warrior', 22, 6), ('warrior', 22, 11), ('archer', 23, 9), ('spearman', 21, 14), ('builder', 30, 10), ('scout', 24, 3)]]),
    ('sites', [{'site': 'factory', 'col': 12, 'row': 12}, {'site': 'refinery', 'col': 25, 'row': 7}, {'site': 'power_plant', 'col': 18, 'row': 8}])])
dump('mapPresets.json', 'mapPresets', [preset])

# ---------- Religion, victories, tuning, skin ----------
dump('religions.json', 'religions', [{'op': 'remove', 'where': {'tags': {'has': 'base'}}}])
dump('victories.json', 'victories', [{'op': 'change', 'id': v, 'set': {'enabled': False}} for v in ['science', 'culture', 'religious']])
tuning = OD([('contentType', 'tuning'), ('set', OD([
    ('frontline.enabled', True), ('frontline.presenceRange', 2), ('frontline.presenceStrength', 0.05), ('frontline.maxStep', 20), ('frontline.spread', 0.15),
    ('frontline.captureAt', 50), ('frontline.battleShift', 40), ('frontline.winBonus', 0.5), ('frontline.startSoftness', 25),
    ('setup.maxAis', 1), ('setup.battleMode', 'ask'), ('setup.battleModule', 'killzone'),
    ('battle.killzone', OD([('durationSec', 300), ('strengthPerSquad', 12), ('minSquads', 1), ('maxSquads', 4), ('secondSide', ['helghast']),
        ('timeLoss', {'narrow': 0.1, 'clear': 0.2, 'crushing': 0.35}),
        ('roles', {'melee': ['rifle', 'assault', 'rifle', 'heavy'], 'anti_cavalry': ['heavy', 'rifle', 'engineer', 'heavy'], 'ranged': ['heavy', 'rifle', 'recon', 'heavy'],
                   'cavalry': ['assault', 'rifle', 'assault', 'engineer'], 'recon': ['recon', 'rifle', 'infiltrator', 'rifle'], 'siege': ['heavy', 'engineer', 'heavy', 'rifle'],
                   'militia': ['rifle', 'heavy', 'rifle', 'engineer'], 'default': ['rifle', 'heavy', 'engineer', 'rifle']})])),
]))])
open(K + 'tuning.json', 'w').write(json.dumps(tuning, indent=2, ensure_ascii=False) + '\n')
# Unit art entries are written by tools/gen/lpc-units.mjs (graphics overhaul G4): keep them.
try:
    kept_art = json.load(open(K + 'skin/skin.json'), object_pairs_hook=OD)['values'].get('art', {})
except (OSError, ValueError, KeyError):
    kept_art = {}
skin = OD([('contentType', 'skin'), ('values', OD([('id', 'killzone'), ('palette', OD([('ink', '#16181c'), ('paper', '#d9dcdf'), ('accent', '#b8321f'), ('water', '#2a3f4f'), ('land', '#6d6f5e')])),
    ('fonts', OD([('display', 'Cinzel'), ('body', 'Inter')])), ('art', kept_art), ('sounds', {}), ('factionColours', True),
    # Graphics overhaul tokens: gunmetal panels, ISA blue edges, Helghast orange-red for alarms.
    ('tokens', OD([('walnut', 'rgba(29, 34, 38, 0.95)'), ('walnut-solid', '#1d2226'), ('brass', '#5b7fa6'), ('brass-inner', '#2c3a48'), ('panel-ink', '#dfe6ec'), ('gold', '#e05a2a'), ('danger', '#e05a2a')])),
    # Graphics overhaul G3: Helghan's scorched greys and rust (code-drawn terrain colours, docs/OVERHAUL.md 4.1).
    ('placeholders', OD([
        ('terrain', OD([('grassland', '#5f6a4c'), ('plains', '#7a6a52'), ('desert', '#9a6a45'), ('tundra', '#6e6e68'), ('snow', '#cfd3d4'),
                        ('coast', '#3d5664'), ('ocean', '#24343f'), ('lake', '#3c5866'), ('mountain', '#5d5853')])),
        ('feature', OD([('forest', '#33402e'), ('marsh', '#4d5546')])),
        ('map', OD([('parchment', '#a9a59c'), ('parchmentInk', '#2c2f33'), ('beach', '#8f7d66'), ('foam', '#c9d3d6'), ('river', '#3b6475'),
                    ('riverLight', '#7898a4'), ('road', '#4b4038'), ('roadStone', '#8c8378'), ('crop', '#a99a5a'), ('bush', '#4f5a3a')])),
    ])),
    ('raiderColour', '#2b2b2b')]))])
open(K + 'skin/skin.json', 'w').write(json.dumps(skin, indent=2, ensure_ascii=False) + '\n')
text['mapType.inland_sea.text'] = 'Land all round a central sea.'
open(K + 'text/en-GB.json', 'w').write(json.dumps(OD([('contentType', 'text'), ('strings', text)]), indent=2, ensure_ascii=False) + '\n')
mod = OD([('id', 'killzone'), ('name', 'Killzone: The Front'), ('version', '1.0.0'), ('type', 'conversion'), ('engine', '>=0.1.0'),
    ('description', 'A two-sided war between the ISA and the Helghast on a fixed map: no settling, a front line that moves with the armies, factories and refineries to capture, and platoon battles.'),
    ('dependsOn', ['base-ancient']), ('loadAfter', []), ('incompatibleWith', []), ('options', []),
    ('files', ['factions.json', 'leaders.json', 'units.json', 'cityNames.json', 'sites.json', 'mapPresets.json', 'religions.json', 'victories.json', 'tuning.json', 'text/en-GB.json', 'skin/skin.json']),
    ('credits', 'Original Atlas content, MIT licence. Fan work: setting names belong to their owners; no text, art or code is taken from the games. The platoon battles use the battle sim from the owner\'s own Killzone: Front Line project.')])
open(K + 'mod.json', 'w').write(json.dumps(mod, indent=2, ensure_ascii=False) + '\n')
print('killzone:', len(factions) - 1, 'factions,', len(units), 'units,', len(SITES), 'sites, 1 map,', len(text), 'strings')
