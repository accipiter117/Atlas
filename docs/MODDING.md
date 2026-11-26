# Making a mod for Atlas

A mod is a folder of JSON files. It never contains code: everything a mod can do is
describe content (factions, units, techs, events) or change numbers. You can write one
with any text editor, and the game tells you exactly what is wrong if you make a mistake.

This guide starts with the smallest possible mod and builds up to a whole conversion like
`rules/witcher`. The full reference is `docs/PLAN.md` section 4.

## The three kinds of mod

- **Ruleset**: a complete game (`base-ancient`). Everything else stacks on top of one.
- **Conversion**: re-skins and re-rules the whole game for another setting (`witcher`).
  Only one conversion can be used at a time.
- **Tweak**: a small change (`no-religious-victory`, `lock-era`). You can stack as many as you
  like, in the order you choose.

They load in that order: the ruleset, then the conversion, then the tweaks top to bottom.
When two mods change the same thing, **the later one wins**, and the report tells you so.

## Your first mod in two files

Make a folder `rules/cheap-walls/` with a `mod.json`:

```json
{
  "id": "cheap-walls",
  "name": "Cheap walls",
  "version": "1.0.0",
  "type": "tweak",
  "engine": ">=0.1.0",
  "description": "Walls cost half as much.",
  "dependsOn": ["base-ancient"],
  "files": ["buildings.json"],
  "credits": "My own work."
}
```

and a `buildings.json`:

```json
{ "contentType": "buildings", "entries": [
  { "op": "change", "id": "walls", "set": { "cost": 40 } }
] }
```

Then add one line to `rules/index.json` under `"mods"`:

```json
{ "id": "cheap-walls", "path": "rules/cheap-walls/" }
```

Open the game, go to **Mods**, tick it, and read the report on the right. Press **Stack
check** to have the computer load your mods and play a few rounds of a small game with them.
On the setup screen your tweak now appears under Tweak mods.

## Content files

Every content file looks the same: a `contentType` and a list of `entries`.
An entry without an `op` adds something new. The other operations:

| Operation | Example | What it does |
| --- | --- | --- |
| add | `{ "id": "war_dog", "class": "melee", ... }` | A new entry. Fails if the id exists. |
| `change` | `{ "op": "change", "id": "archer", "set": { "rangedStrength": 27 } }` | Changes fields. `set` takes dot paths such as `"yields.food"`; `add` appends to a list; `remove` takes items out of one. |
| `replace` | `{ "op": "replace", "id": "chariot", ... }` | Swaps the whole entry. |
| `remove` | `{ "op": "remove", "id": "chariot", "cascade": true }` | Deletes it. With `cascade`, everything that needed it goes too (units that required a removed tech, a faction's unique units). |

To change many entries at once, use `where` instead of `id`:

```json
{ "op": "remove", "where": { "tags": { "has": "historical" } }, "cascade": true }
```

`where` understands `eq`, `in`, `notIn`, `has` (a list contains it), and `gt`, `lt`, `gte`,
`lte` (for numbers, and for eras through `eraIndex`). A plain value means "equals".

**Numbers** live in `tuning.json` and are changed with dot paths:

```json
{ "contentType": "tuning", "set": { "raiders.spawnEvery": 5, "combat.flankingBonus": 3 } }
```

**Words** live in `text/en-GB.json`, by key. A later mod's key replaces an earlier one's:

```json
{ "contentType": "text", "strings": { "unit.spearman.name": "Pikeman" } }
```

Never write player-facing words straight into a content file: give the entry a `nameKey`
(and `descriptionKey`) and put the words in the text file.

## Options

A mod can ask the player a question on the setup screen. `lock-era` asks which era to stay in:

```json
"options": [
  { "id": "era", "labelKey": "opt.lockEra.era", "type": "choice", "source": "eras", "default": "classical" }
]
```

Its content then uses `"$opt:era"` (the chosen id) or `"$opt:era.index"` (its position) as a value.

## Effects: what traits, buildings and policies do

Effects are small, named rules the engine knows. A trait, building, policy, belief or event
choice lists them:

```json
"effects": [
  { "effect": "yieldBonus", "yield": "gold", "amount": 1 },
  { "effect": "costPercent", "target": "settler", "amount": -20 },
  { "effect": "yieldPercent", "yield": "production", "amount": 10, "scope": "capturedCities" }
]
```

The ones you can use: `yieldBonus`, `yieldPercent`, `cityYieldPercent`, `tileYield`,
`costPercent`, `upkeepPercent`, `growthPercent`, `amenityBonus`, `freeBuilding`, `freeUnit`,
`moveBonus`, `sightBonus`, `healBonus`, `autoRoad`, `freePolicySlot`, `borderGrowthPercent`,
`religiousPressure`, `faithPurchase`, `tradeRouteYield` and `popChange`. Units also take
`combatBonus` abilities, for example `+15 against anything tagged monster`:

```json
"abilities": [{ "effect": "combatBonus", "amount": 15, "vs": { "tags": "monster" } }]
```

Scopes say where an effect applies: `everyCity` (the default for traits), `thisCity`,
`capital`, `capturedCities`, `withBuilding:market` or `religion:<id>`.

## A conversion: how the Witcher mod is built

`rules/witcher/` is the worked example. It is written by `tools/gen/witcher.py`, so it is
easiest to read the generator, but the files it produces are ordinary content files:

- `factions.json` first removes every faction tagged `historical`, with cascade. That also
  takes away their leaders, unique units and unique buildings. Then it adds eight factions,
  each with a trait, a unique unit, a unique building and a city name list.
- `leaders.json`: one leader each, with a trait, an agenda (what they like and hate in you)
  and the computer's personality and victory leanings.
- `units.json`: the unique units, witchers (trained at a witcher school), and four monsters
  marked `raiderOnly`, so only raiders field them. It also changes the look of two base units.
- `religions.json`: removes the base faiths (tagged `base`) and adds the setting's seven.
- `cityNames.json`, `buildings.json`, `events.json` (monster nests, the Wild Hunt).
- `tuning.json`: raiders become Monsters (`raiders.nameKey`), come a little more often, and
  use the monster units.
- `text/en-GB.json`: every name and description, plus new names for base wonders that named
  real places.
- `skin/skin.json`: a colder palette and `factionColours`, so each faction plays in its own
  colours.

Load it with lock-era and no-religious-victory on top and you get a Classical-era Northern
Wars sandbox with no science or religious victory.


## A front-line war: how the Killzone mod is built

`rules/killzone/` switches on the engine's front-line system with one tuning line,
`"frontline.enabled": true`, and then:

- gives each faction a `frontSide` (0 or 1);
- adds `sites.json` (a factory, a power plant, a refinery, each with effects for the side that holds it);
- adds `mapPresets.json`: a fixed map as rows of letters with a `legend` saying what each letter is,
  the `front` column where the two sides meet, each side's cities and starting units, and where the
  sites stand;
- sets `setup.maxAis` to 1, and the default battles to "Ask each time" with its own platoon module.

The front's numbers (how fast armies push it, how far battles move it, when a site changes hands)
are all under `frontline` in tuning.

## Art

Pictures are asked for by id (`unit.witcher`, `building.witcher_school`, `leader.emhyr`).
Anything without art is drawn by a placeholder in code, so a mod is always playable before
any art exists. To give an id real art, add it to your skin:

```json
"art": { "unit.witcher": { "sheet": "assets/sprites/witcher.json" } }
```

Every sprite sheet must carry a `credits` line. `docs/ART_STATUS.md` lists every art id each
ruleset and conversion uses and whether it has art yet.

## Checking your mod

- **Mods screen**: tick your mod and read the report. Errors (red) stop a game starting;
  warnings (amber) do not, but read them; info lines summarise what each mod added and removed.
- **Stack check**: loads the ticked mods and lets the computer play five rounds of a small game.
- **On the command line**: `npm run check` loads every mod and every stack in
  `rules/index.json` and fails on any error. Add your combination to `"stacks"` there.

## House rules

- Original words only. Setting names are fine; quotes from books or games are not.
- British spelling, and no em dashes or en dashes (use round brackets or commas).
- No code in a mod, ever. If your idea needs something the engine cannot do, it becomes a new
  effect or system in the engine, driven by data, so every mod can use it.
