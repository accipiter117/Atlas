# Phase 14: base-ancient's trade route tables, the trader and trade tuning.
# Run after base-ancient-religion.py (it adds files beside that script's JSON
# and can be re-run safely): python3 tools/gen/base-ancient-trade.py
import json, collections
B = 'rules/base-ancient/'
text = {}
def T(k, v): text[k] = v; return k
def load(name): return json.load(open(B + name), object_pairs_hook=collections.OrderedDict)
def dump(name, ctype, entries):
    lines = ['{', f'  "contentType": "{ctype}",', '  "entries": [', ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries), '  ]', '}', '']
    open(B + name, 'w').write('\n'.join(lines))

# Domestic routes feed the origin (food and production); foreign routes pay it (gold and science).
# The destination gets a smaller share. perResource: extra for the origin per kind of improved
# luxury or strategic resource the destination city works.
ROUTES = [
    ('domestic_land', 'domestic', 'land', {'food': 2, 'production': 1}, {'food': 1}, {'production': 0.5}),
    ('domestic_sea', 'domestic', 'sea', {'food': 3, 'production': 1}, {'food': 1}, {'food': 0.5}),
    ('foreign_land', 'foreign', 'land', {'gold': 3, 'science': 1}, {'gold': 1}, {'gold': 1}),
    ('foreign_sea', 'foreign', 'sea', {'gold': 4, 'science': 1}, {'gold': 1, 'science': 1}, {'gold': 1}),
]
dump('trade.json', 'trade', [collections.OrderedDict([('id', rid), ('nameKey', T(f'trade.{rid}.name', rid.replace('_', ' ').capitalize() + ' route')), ('kind', kind), ('domain', domain),
    ('originYields', o), ('destinationYields', d), ('perResource', p)]) for rid, kind, domain, o, d, p in ROUTES])

units = [u for u in load('units.json')['entries'] if u['id'] != 'trader']
units.append(collections.OrderedDict([
    ('id', 'trader'), ('nameKey', T('unit.trader.name', 'Trader')), ('descriptionKey', T('unit.trader.text', 'Sets up a trade route from its city to another, yours or a rival\'s, for 30 turns: both ends gain, and a road is laid along the way.')),
    ('class', 'civilian'), ('era', 'ancient'), ('cost', 60), ('strength', 0), ('moves', 2), ('upkeep', 0), ('tags', ['trader']), ('requires', {'civic': 'foreign_trade'})]))
dump('units.json', 'units', units)

# Markets make foreign routes from their city pay more (tradeRouteYield).
b = load('buildings.json')['entries']
for e in b:
    if e['id'] == 'market':
        e['effects'] = [x for x in e.get('effects', []) if x.get('effect') != 'tradeRouteYield'] + [{'effect': 'tradeRouteYield', 'yield': 'gold', 'amount': 2, 'kind': 'foreign', 'scope': 'thisCity'}]
dump('buildings.json', 'buildings', b)
text['building.market.text'] = text.get('building.market.text') or None

t = load('tuning.json')
t['values']['trade'] = collections.OrderedDict([('landRange', 15), ('seaRange', 30), ('routeTurns', 30), ('routesPerCity', 3), ('religiousPressureShare', 1.0), ('roads', True)])
open(B + 'tuning.json', 'w').write(json.dumps(t, indent=2, ensure_ascii=False) + '\n')

tx = load('text/en-GB.json')
text = {k: v for k, v in text.items() if v is not None}
tx['strings'].update(text)
if 'building.market.text' in tx['strings']:
    s = tx['strings']['building.market.text']
    if 'trade route' not in s: tx['strings']['building.market.text'] = s.rstrip('.') + '. Foreign trade routes from this city pay +2 gold.'
open(B + 'text/en-GB.json', 'w').write(json.dumps(tx, indent=2, ensure_ascii=False) + '\n')
m = load('mod.json')
if 'trade.json' not in m['files']: m['files'].insert(m['files'].index('victories.json'), 'trade.json')
open(B + 'mod.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print(len(ROUTES), 'route tables; trader added')
