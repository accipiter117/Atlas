# Strategy Engine Build Plan

Nov 22, 2026 · @Matthew Hawkes

This plan builds Atlas (working name), one hex-based, Civ-style strategy engine played in a laptop browser, with every faction, unit, rule and franchise delivered as stackable data mods. It is written for Claude Code (cloud) to build in 22 phases, with a playable game of settling, cities, tech and conquest by phase 9 and the full version 1 (religion, culture, trade, espionage, diplomacy) by phase 17.

## 1. Vision, pillars and decisions

Atlas is a Civilization-style game you can reskin and re-rule endlessly: start a historical ancient world tonight, then stack a Witcher conversion and a "lock to one era" mod on top tomorrow, without anyone touching engine code.

**Design pillars**

- **Every level of management matters.** Armies use terrain and unit types, cities place citizens on tiles and juggle yields, and the empire grows by settling, conquest, faith or influence.
- **Content is data, rules are code.** The engine knows what a "unit" is, never what a "Legionary" is. Adding a faction or a franchise means adding files.
- **Replayability comes from combinations.** Victory paths, faction traits, rulesets and match options multiply each other, the way your 200 Civ mods do.
- **One tap, one decision.** The game tells you what needs attention and what to do next, so a 300-turn match never turns into hunting through screens.
- **Fair and reproducible.** The AI plays by your rules with your commands, and any game can be rebuilt exactly from its seed and command log.

**Decisions taken from your answers**

| Topic | Decision | What it changes in the plan |
| --- | --- | --- |
| Map grid | Hexes (pointy-top, axial coordinates) | Six equal neighbours; all movement, range and area rules use hex distance |
| Main device | Laptop browser first, touch-safe | Desktop layout with mouse and keyboard shortcuts; nothing hover-only, so a phone layout can be added later without rework. Phone becomes a later phase (phase 21) |
| Match length | Full Civ length | Default 8 factions on a 74x46 hex map, about 330 turns at Standard speed. This makes turn speed and save size real engineering targets (section 11) |
| First ruleset | Historical (ancient to medieval) | Neutral base called `base-ancient`, reusing Britannia ideas |
| Proving skin | Witcher conversion | Stacked on top of the base to prove reskinning works; reuses Northern Wars data where it fits |
| Version 1 systems | Diplomacy, culture and civics, religion, trade, espionage | All in version 1, but each lands in its own phase after the core is playable |
| Sequencing | Playable core first | Phases 1 to 9 make a complete conquest and science game; phases 10 to 17 add the remaining systems |
| Players | Solo against AI | Pass-and-play and Supabase online are later phases; the command log keeps the door open from day one |
| Map look | Top-down pixel hexes | Canvas 2D, 64px hex art at 100% zoom, LPC-style unit sprites |

**What Atlas is not.** It is not a universal engine. Squad tactics (Arkside), stealth, and board game adaptations (My Arrakis) keep their own engines. A franchise twist, such as Killzone's two-sided shifting front, becomes a ruleset option inside Atlas, not a fork.

## 2. Version 1 scope

Version 1 is a complete, single-player, laptop-browser Civ-style game with two rulesets (historical base and Witcher conversion), five victory paths, and every system you asked for, each kept deliberately shallower than Civ VI's.

**In version 1**

| System | Version 1 depth | Civ VI comparison |
| --- | --- | --- |
| Map | Hex map, 5 map types, 4 sizes, 9 base terrains, 6 features, 3 resource classes, rivers on hex edges | Close to Civ VI |
| Settlements | Found, grow, work tiles, borders, production queue, capture or raze | Close; no districts in version 1 |
| Yields | Food, production, gold, science, culture, faith, plus amenities (happiness) | Same six yields |
| Buildings | Single buildings inside the city (about 30 in the base set) | No districts; buildings have tile adjacency bonuses instead |
| Units | Land and naval units, 6 combat classes, builders, settlers, traders, missionaries, spies | No air units, no corps or armies merging |
| Combat | Hex combat with strength, terrain, flanking, odds preview; auto-resolve battle module | Same core formula family |
| Progression | Tech tree and civics tree, 4 eras in the base set | Shorter trees (about 40 techs, 25 civics) |
| Government | 4 governments, policy cards in 3 slot types | Simplified card system |
| Religion | Pantheon, found a religion, 3 beliefs, missionaries, theological combat skipped | Missionaries and conversion pressure only |
| Trade | Trader units create routes between cities, yields to both ends | Close, without trading posts |
| Espionage | Spies placed in cities, 5 missions, success odds shown | Simplified |
| Diplomacy | War, peace, open borders, deals, opinion with visible reasons, alliances | No World Congress |
| Victory | Conquest, science, culture, religious, score (turn limit) | Diplomatic victory deferred |
| AI | Same commands as player, per-faction weights, per-victory planners, decision recorder | Aims for a fair, readable opponent |
| Fog of war | Unexplored, explored (last seen), visible | Same |
| Saves | localStorage, versioned, export and import as text code, autosave every turn | Same |
| Setup | Full match setup screen (section 6) | Close |
| Mods | Load order, add, change, remove, conflict report, mod manager screen | Similar to Civ mods |
| Art | Code-drawn placeholders for everything, LPC sprite sheet loader, art registry | Placeholder-first |

**Deliberately left out of version 1 (with their slot already in place)**

- **Districts.** Buildings carry adjacency rules instead. The settlement data has a `districts: []` field reserved so a later mod can add them.
- **Great people, city-states, World Congress, diplomatic victory.** Each would be a new system file plus data; the turn loop has named hooks (`onTurnStart`, `onCityGrow`, `onEraChange`) so they can attach later.
- **Air units and nukes.** The unit `domain` field accepts `"land"` and `"sea"`; `"air"` is reserved.
- **Real-time battle modules.** The interface is built and tested in version 1 with auto-resolve; the Britannia-style and Killzone modules plug in during phases 18 and 19.
- **Multiplayer.** Commands and determinism make it possible; pass-and-play (phase 20) and online (phase 22) come after version 1.
- **Phone layout.** The UI stays touch-safe throughout; a proper phone layout is phase 21.
- **Painted art and audio.** Placeholders and a sound registry ship; real assets drop in later with no code changes.

## 3. Core systems

Each system below is a file in `src/sim/`, reads only the merged ruleset (never raw mod files), and changes the game only through commands. Every number shown is a default in `rules/base-ancient/tuning.json`, not in code.

### 3.1 Map and terrain

- **Grid.** Pointy-top hexes in axial coordinates `{q, r}`, stored as a flat array indexed by `r * width + q` for speed. Hex distance drives movement, range, sight and area effects.
- **Map sizes.** Small 44x26 (4 factions), Standard 60x38 (6), Large 74x46 (8, the default), Huge 90x56 (10). Defined in `mapSizes.json`.
- **Map types.** Continents, Pangaea, Islands, Inland Sea, Highlands. Each is a generator recipe in `mapTypes.json` (land share, number of landmasses, mountain share, river count) run through one generator in `src/sim/mapgen.js` using the game seed.
- **Terrain.** Each tile has one base terrain, at most one feature, at most one resource, and river flags on its six edges. Base set: grassland, plains, desert, tundra, snow, coast, ocean, lake, mountain (impassable), with a `hills` flag on land tiles.
- **Features.** Forest, jungle, marsh, floodplain, oasis, reef.
- **Resources.** Bonus (extra yield, eg wheat), luxury (amenities, eg wine), strategic (needed to build some units, eg iron, horses). Strategic resources are revealed by a tech.
- **Rivers.** Crossing a river edge costs all remaining movement unless the faction knows `bridgeTech`. Cities next to rivers get +1 housing-free growth bonus (`riverGrowthBonus: 0.1`, so 10% faster growth).

Data read: `terrain.json`, `features.json`, `resources.json`, `mapSizes.json`, `mapTypes.json`.

### 3.2 Settlements and citizens

- **Founding.** A settler uses `foundCity` on a tile at least 4 hexes from another city (`minCityDistance: 4`). The city claims every tile within 1 hex.
- **Working radius.** A city can work tiles up to 3 hexes away, but only tiles inside its own borders.
- **Citizens.** Each population point is one citizen working one tile (or, later, a specialist slot in a building). The governor auto-assigns using a focus you pick (Balanced, Food, Production, Gold, Science, Culture, Faith). You can lock any citizen to a tile with one tap.
- **Growth.** Each citizen eats 2 food. Surplus food fills a box; when full, the city grows. Food needed to reach population n+1 is `15 + 8(n-1) + (n-1)^1.5`, rounded down (Civ VI's curve, in `tuning.json` as `growth.base`, `growth.linear`, `growth.exponent`).
- **Starvation.** A negative food box loses one citizen and resets to empty.
- **Borders.** Culture in the city fills a border box; when full, the city claims the best adjacent unowned tile. Cost of the next tile is `10 + 6 × tilesClaimedSoFar` culture. Tiles can also be bought with gold at `goldPerTile: 25 × distance`.
- **Capture and raze.** Taking a city gives a choice: keep it (loses 50% population, `captureLoss: 0.5`) or raze it (one population per turn until gone). Original capitals cannot be razed.

Data read: `tuning.json` (growth, borders), `focuses.json`.

### 3.3 Yields and economy

- **Six yields.** Food (growth), production (building things), gold (buying, upkeep), science (techs), culture (civics and borders), faith (religion and faith purchases).
- **Tile yields** come from terrain + feature + resource + improvement + adjacent river, all from data. Example: grassland 2 food; grassland with a farm 3 food; plains hills with a mine 1 food 3 production.
- **City yields** = worked tiles + buildings + specialists + trade routes + policy cards + faction trait, multiplied by percentage bonuses last (so a +10% library bonus applies to everything).
- **Upkeep.** Each building and each unit costs gold per turn (from its data). If gold falls below zero, a random unit (seeded) disbands each turn until upkeep is covered, and the advice line warns you two turns ahead.
- **Amenities (happiness).** Each city needs 1 amenity per 2 citizens. Each luxury resource gives 1 amenity to up to 4 of your cities. Amenity balance changes yields: +2 or more gives +10% yields, 0 to +1 normal, -1 to -2 gives -15% and slower growth, -3 or worse risks rebel units. Thresholds live in `amenities.json`.

### 3.4 Buildings and improvements

- **Buildings** sit inside the city and are bought with production (or gold, at `goldPerProduction: 2`). Each has prerequisites (tech or civic, other buildings, adjacent terrain), yields, effects and upkeep.
- **Adjacency instead of districts.** A building can declare `adjacency` rules, for example the Library gives +1 science per 2 mountain tiles within the city's borders. This gives Civ VI's placement puzzle without a district layer.
- **Wonders** are unique buildings: one per world, with an `era` and a world announcement event. If another faction finishes first, your production converts to gold.
- **Improvements** (farm, mine, pasture, plantation, quarry, camp, fishing boats, road) are built by builder units, each builder having 3 charges (`builderCharges: 3`).

Data read: `buildings.json`, `improvements.json`, `wonders.json`.

### 3.5 Units

- **Classes.** Melee, ranged, cavalry, siege, naval melee, naval ranged, plus civilian (settler, builder, trader, missionary, spy). Class drives default rules; data can override per unit.
- **Stats.** `strength` (melee), `rangedStrength`, `range`, `moves`, `sight`, `cost`, `upkeep`, `requires` (tech, resource), `upgradesTo`.
- **Movement.** Movement points per turn. Terrain costs: flat 1, hills 2, forest 2, jungle 2, marsh 2, road 0.5 (from data). A unit may always move at least one tile if it has full moves.
- **Zone of control.** Entering a hex next to an enemy combat unit ends movement (cavalry ignore this, by class rule `ignoresZoc: true`).
- **Stacking.** One combat unit and one civilian per tile.
- **Experience and promotions.** Units earn experience from combat (`xpPerAttack: 5`, `xpPerDefence: 3`) and choose one promotion from their class tree at thresholds 15, 45, 90, 150.
- **Healing.** 10 HP per turn in neutral land, 15 in friendly, 20 in a city; none if the unit moved or fought.

Data read: `units.json`, `unitClasses.json`, `promotions.json`.

### 3.6 Combat and auto-resolve

- **Every unit has 100 HP.** Damage dealt uses Civ VI's curve: `damage = 30 × e^(difference / 25) × random(0.8 to 1.2)`, where `difference` is attacker strength minus defender strength after modifiers. At equal strength each side loses about 30 HP.
- **Modifiers** (all in `combat.json`): hills +3 defence, forest or jungle +3 defence, river crossing -5 for attacker, each adjacent friendly unit +2 (flanking, melee only), fortified +4 after two turns still, wounded units lose 1 strength per 10 HP missing, unit-class bonuses (spearmen +10 against cavalry).
- **Ranged attacks** deal damage without taking any back.
- **Cities** have their own strength (based on the strongest unit you could build, plus walls) and a ranged attack once walls exist. A city is captured when its HP hits 0 and a melee unit moves in.
- **Odds before attacking.** Hovering or tapping an enemy shows expected HP lost on both sides and a win chance, computed by running the same formula across the random range without touching the game RNG (section 10).
- **Battle modules.** When a combat starts, the engine calls the active battle module (section 5). Version 1 ships `auto` which applies the formula above in one step.

### 3.7 Progression (tech and civics)

- **Two trees.** Science fills the tech tree; culture fills the civics tree. Each item has a cost, prerequisites, era and what it unlocks.
- **Boosts.** Each item can have a boost condition (for example "build a quarry" boosts Masonry) that pays `boostShare: 0.4` (40%) of its cost when met. Boost triggers are data: `{"trigger": "improvementBuilt", "id": "quarry", "count": 1}`.
- **Eras.** Base set has Ancient, Classical, Medieval, Renaissance. A faction's era is the latest era in which it owns at least 50% of the techs. Eras gate content and are what the "lock to one era" mod uses (section 4).
- **Governments and policies.** Civics unlock 4 governments (Chiefdom, Autocracy, Republic, Monarchy) each with military, economic and diplomatic card slots. Policy cards are data (`+1 production in every city`, `-50% unit upkeep`).

Data read: `techs.json`, `civics.json`, `eras.json`, `governments.json`, `policies.json`.

### 3.8 Religion

- **Faith** accumulates per faction. At 25 faith you choose a **pantheon** belief (one per faction, unique in the world).
- **Founding.** A faction earning enough faith (from shrines and temples, `foundReligionFaith: 200`) founds a religion: picks a name and 2 more beliefs (follower and founder). Number of religions = factions ÷ 2, rounded up.
- **Spread.** Each city has followers per religion. Cities exert pressure on cities within 10 hexes (`pressureRange: 10`); trade routes carry pressure too. Missionaries (bought with faith) convert directly.
- **Effects.** Follower beliefs apply to every city that follows the religion; founder beliefs pay the founder per follower city.

Data read: `beliefs.json`, `religions.json` (names and colours per skin).

### 3.9 Trade

- **Traders** are built in a city and set a route to any city within 15 hexes (land) or 30 (sea). Routes last 30 turns, then the trader can be re-routed.
- **Yields.** The origin gets yields based on the destination (domestic routes give food and production; foreign give gold and science); the destination gets a smaller share. Exact tables in `trade.json`.
- **Roads.** Each route automatically builds road along its path.
- **Deals.** Luxury and strategic resources can be traded in diplomacy (section 3.11).

### 3.10 Espionage

- **Spies** are unlocked by a civic, capped at `1 + era index` per faction, and placed in any known city (yours to defend, theirs to act).
- **Missions** (each takes 4 to 8 turns): Gather Intel (see their cities and research), Siphon Funds (steal gold), Steal Tech Boost, Sabotage Production, Incite Unrest (lower amenities). Success odds are shown before you commit: `base 60% + spy level × 10% - city defence`.
- **Outcomes.** Success, success but identified (opinion penalty), failed and escaped, or captured (spy lost).

Data read: `espionage.json`.

### 3.11 Diplomacy

- **States.** Unmet, war, peace, open borders, defensive pact, alliance. Peace treaties last at least 10 turns.
- **Opinion.** Each AI keeps an opinion score of every other faction, made of named modifiers with reasons you can see ("You share our religion +6", "You attacked our friend -10"). Modifiers decay by 1 per 5 turns. All modifiers and their values live in `diplomacy.json`.
- **Deals.** Gold, gold per turn (30 turns), resources, open borders, peace, alliance, joint war. The AI accepts a deal when its value to the AI, scaled by opinion, is positive.
- **War weariness.** Each turn at war adds weariness that costs amenities; peace reduces it.
- **Leader agendas.** Each leader has one visible agenda (likes large armies, hates factions that spread religion near it). Agendas are opinion modifiers in faction data.

### 3.12 Victory paths

| Victory | Condition (default) | Data switch |
| --- | --- | --- |
| Conquest | Hold every original capital | `victories.conquest` |
| Science | Finish the 3 final projects of the last era (in base-ancient: Great Observatory, Atlas of the World, Voyage Beyond) | `victories.science` |
| Culture | Your accumulated influence (from wonders, great buildings, policies) exceeds every rival's lifetime culture | `victories.culture` |
| Religious | Your religion is the majority in more than half the cities of every living faction | `victories.religious` |
| Score | Highest score when the turn limit is reached (default turn 330 at Standard speed) | `victories.score` |

Each victory is a small module in `src/sim/victories/` registered by id, so a mod can add a new victory type by data where it combines existing conditions, or by a new module where it needs new rules.

### 3.13 AI

The AI is a player that issues commands. Its approach, weights and testing are in section 9.

### 3.14 Turn structure

1. **World start of round.** Turn counter advances; scheduled events fire (`onTurnStart`).
2. **Each faction in seat order** (seat order is random per game, from the seed, then fixed):
   1. Start of turn: collect yields, grow or starve, finish production, research progress, heal units, refresh moves, tick diplomacy timers.
   2. Act: the human acts through the UI, or the AI issues its commands.
   3. `endTurn` command closes the faction's turn.
3. **End of round.** Victory checks, autosave, decision recorder flush.

Only the human's seat waits for input. An 8-faction round should complete its AI turns in under 2 seconds on a laptop (performance target, section 11).

### 3.15 Fog of war

- Each faction has a visibility layer with three states per tile: unexplored (black), explored (last seen terrain and cities, greyed), visible (live).
- Sight: default 2 hexes, +1 from hills, blocked by mountains and forests for tiles behind them (simple line check).
- The AI uses exactly the same visibility as the player. It never reads the true state of tiles it cannot see (enforced by giving the AI a `view(state, factionId)` object, not raw state).

## 4. Ruleset and mod system

Every piece of content is a JSON entry with an `id`, mods are folders that add, change or remove entries in a fixed load order, and the engine only ever sees the single merged result plus a report of what each mod did.

### 4.1 Mod types and folder layout

| Mod type | Role | Rule |
| --- | --- | --- |
| `ruleset` | A complete base game (eg `base-ancient`) | Exactly one per match, always loaded first |
| `conversion` | A franchise total conversion (eg `witcher`) | Zero or one per match; brings its own skin |
| `tweak` | A small rule change (eg `lock-era`, `no-religious-victory`) | Any number, in your chosen order |

GitHub Pages cannot list folders, so every mod is registered in `rules/index.json`.

```
rules/
  index.json                  list of available mods: [{"id": "base-ancient", "path": "rules/base-ancient/"}, ...]
  base-ancient/
    mod.json                  manifest
    tuning.json               every global number (growth, combat, borders...)
    terrain.json  features.json  resources.json  mapSizes.json  mapTypes.json
    units.json  unitClasses.json  promotions.json
    buildings.json  wonders.json  improvements.json
    techs.json  civics.json  eras.json  governments.json  policies.json
    beliefs.json  religions.json  trade.json  espionage.json  diplomacy.json
    factions.json  leaders.json  cityNames.json  events.json  victories.json
    ai/personalities.json  ai/weights.json
    text/en-GB.json           every player-facing string, by key
    skin/skin.json            palette, fonts, art registry entries, sounds
  witcher/  (same shape, only the files it needs)
  lock-era/ (mod.json plus one or two files)
```

### 4.2 The manifest (`mod.json`)

```json
{
  "id": "witcher",
  "name": "The Northern Kingdoms",
  "version": "1.0.0",
  "type": "conversion",
  "engine": ">=1.0.0",
  "dependsOn": ["base-ancient"],
  "loadAfter": [],
  "incompatibleWith": ["killzone"],
  "options": [],
  "files": ["factions.json", "leaders.json", "units.json", "religions.json", "events.json", "text/en-GB.json", "skin/skin.json"],
  "credits": "Fan project, non-commercial. Setting by Andrzej Sapkowski and CD PROJEKT RED. All text and art original."
}
```

- `dependsOn`: mods that must be present and loaded earlier (error if missing).
- `loadAfter`: soft ordering; if present, load after them.
- `options`: settings shown on the setup screen when the mod is ticked (see the lock-era example). Option values are substituted wherever `"$opt:<id>"` appears in that mod's files.

### 4.3 Content files and the three operations

Every content file has the same wrapper: a content type and a list of entries. An entry with no `op` is an **add**.

```json
{
  "contentType": "units",
  "entries": [
    { "id": "legionary", "class": "melee", "strength": 40, "moves": 2, "cost": 110 },
    { "op": "change", "id": "archer", "set": { "rangedStrength": 27 }, "add": { "tags": ["volley"] } },
    { "op": "replace", "id": "chariot", "class": "cavalry", "strength": 30, "moves": 3, "cost": 90 },
    { "op": "remove", "id": "war_elephant", "cascade": true },
    { "op": "remove", "where": { "era": { "in": ["medieval", "renaissance"] } }, "cascade": true }
  ]
}
```

| Operation | What it does | Fails when |
| --- | --- | --- |
| add (default) | Creates a new entry | The id already exists (use `replace`) |
| `replace` | Swaps the whole entry | The id does not exist |
| `change` | `set` overwrites fields (dot paths allowed, eg `"yields.food"`); `add` appends to lists; `remove` takes items out of lists | The id or field does not exist |
| `remove` | Deletes by `id`, or every entry matching `where` | Nothing matches (warning only) |

- **`where` selectors** match on any field with `eq`, `in`, `notIn`, `has` (list contains), so bulk edits stay short.
- **`cascade: true`** also removes everything that depends on the removed entry (units that require a removed tech, buildings unlocked by it). Without cascade, a dangling reference is an error, so nothing breaks silently.
- **Tuning** uses dot paths: `{"contentType": "tuning", "set": {"combat.flankingBonus": 3, "growth.base": 12}}`.
- **Text** files are flat key maps; later mods overwrite keys: `{"contentType": "text", "strings": {"unit.legionary.name": "Temerian Guard"}}`.

### 4.4 Load order

1. The ruleset loads first.
2. Then the conversion, if any.
3. Then tweaks, in the order you set on the setup screen (drag handles or up and down buttons).
4. `dependsOn` and `loadAfter` are enforced by a stable topological sort; your order wins where the rules allow it. A cycle is an error.
5. Inside a mod, files load in the order listed in `files`.
6. After all mods: options substituted, references checked, schemas validated, effects compiled, and the merged ruleset frozen (`Object.freeze`, deep) and hashed.

The save records the mod list with versions and the merged ruleset hash, so a save always reloads with exactly the rules it was played with (section 8).

### 4.5 Conflict report

The loader returns `{ruleset, report}`. The report lists every message with the mod that caused it and is shown on the setup screen and the mod manager screen. Errors block **Start**; warnings do not.

| Level | Example message |
| --- | --- |
| Error | `witcher` needs `base-ancient`, which is not ticked |
| Error | `units.temerian_guard.requires.tech` points to `iron_working_2`, which does not exist |
| Error | `units.json` entry 4: `strength` must be a whole number from 1 to 200, got "forty" |
| Error | `witcher` cannot be used with `killzone` (only one conversion per match) |
| Warning | `units.archer.rangedStrength`: changed by `balance-pack` (27) then by `witcher` (25). Last one wins: 25 |
| Warning | `remove where era in [medieval]` in `lock-era` matched 0 wonders |
| Info | `lock-era` removed 61 entries (cascade): 22 techs, 14 civics, 15 units, 10 buildings |

### 4.6 Schemas

Schemas are plain JS objects in `src/data/schemas/` (no libraries): each field has a type, whether it is required, a range, and for references the content type it must point to. Below are the main content types; the rest follow the same pattern and are listed in the schema folder.

**Faction** (`factions.json`)

```json
{
  "id": "rome",
  "nameKey": "faction.rome.name",
  "adjectiveKey": "faction.rome.adj",
  "colours": { "primary": "#8c1c13", "secondary": "#e8c36a" },
  "leaders": ["trajan"],
  "startBias": { "terrain": ["plains", "grassland"], "avoid": ["tundra"] },
  "trait": { "id": "all_roads", "effects": [
    { "effect": "freeBuilding", "building": "monument", "scope": "everyCity" },
    { "effect": "autoRoad", "scope": "cityToCapital" }
  ]},
  "uniqueUnits": ["legionary"],
  "uniqueBuildings": ["bath"],
  "cityNames": "rome",
  "tags": ["historical", "mediterranean"]
}
```

**Leader** (`leaders.json`)

```json
{
  "id": "trajan",
  "faction": "rome",
  "nameKey": "leader.trajan.name",
  "trait": { "id": "trajans_column", "effects": [
    { "effect": "freePolicySlot", "slot": "military", "amount": 1 }
  ]},
  "agenda": { "id": "optimus_princeps", "likes": "largeEmpire", "hates": "fewCities", "weight": 6 },
  "ai": { "personality": "builder_conqueror", "victoryBias": { "conquest": 1.3, "science": 0.9, "culture": 1.0, "religious": 0.6, "score": 1.0 } },
  "portrait": "leader.trajan"
}
```

**Unit** (`units.json`)

```json
{
  "id": "legionary",
  "nameKey": "unit.legionary.name",
  "class": "melee",
  "domain": "land",
  "era": "classical",
  "strength": 40,
  "rangedStrength": 0,
  "range": 0,
  "moves": 2,
  "sight": 2,
  "cost": 110,
  "upkeep": 2,
  "requires": { "tech": "iron_working", "resource": "iron", "faction": "rome" },
  "replaces": "swordsman",
  "upgradesTo": "man_at_arms",
  "abilities": [{ "effect": "buildCharge", "improvement": "fort", "charges": 1 }],
  "sprite": "unit.legionary",
  "tags": ["infantry"]
}
```

**Building** (`buildings.json`)

```json
{
  "id": "library",
  "nameKey": "building.library.name",
  "cost": 90,
  "upkeep": 1,
  "requires": { "tech": "writing", "buildings": [] },
  "yields": { "science": 2 },
  "adjacency": [{ "yield": "science", "amount": 1, "per": 2, "countTiles": { "terrain": "mountain" }, "within": "borders" }],
  "specialistSlots": { "science": 1 },
  "effects": [],
  "era": "ancient",
  "icon": "building.library"
}
```

**Terrain** (`terrain.json`) and **resource** (`resources.json`)

```json
{ "id": "plains", "nameKey": "terrain.plains.name", "yields": { "food": 1, "production": 1 }, "moveCost": 1, "defence": 0, "allowsHills": true, "art": "terrain.plains" }
```

```json
{ "id": "iron", "class": "strategic", "yields": { "production": 1 }, "revealedBy": "bronze_working", "improvement": "mine", "improvedYields": { "production": 2 }, "validTerrain": ["plains", "grassland", "desert", "tundra"], "needsHills": false, "frequency": 1.0, "art": "resource.iron" }
```

**Tech** (`techs.json`), civics use the same shape

```json
{ "id": "writing", "nameKey": "tech.writing.name", "era": "ancient", "cost": 50, "requires": ["pottery"], "boost": { "trigger": "cityMet", "count": 1, "textKey": "boost.writing" }, "unlocks": { "buildings": ["library"] }, "treePos": { "col": 2, "row": 3 } }
```

**Era** (`eras.json`)

```json
{ "id": "classical", "index": 1, "nameKey": "era.classical.name", "costMultiplier": 1.0, "startUnits": ["settler", "warrior", "builder"] }
```

**Event** (`events.json`): optional turn events with a choice, Northern Wars dilemma style

```json
{
  "id": "plague_rumours",
  "when": { "trigger": "turnStart", "chance": 0.02, "conditions": [{ "cityPopAtLeast": 8 }] },
  "textKey": "event.plague_rumours.text",
  "choices": [
    { "textKey": "event.plague_rumours.quarantine", "effects": [{ "effect": "cityYieldPercent", "yield": "gold", "amount": -25, "turns": 5 }] },
    { "textKey": "event.plague_rumours.ignore", "effects": [{ "effect": "popChange", "amount": -2, "chance": 0.5 }] }
  ]
}
```

**Victory** (`victories.json`)

```json
{ "id": "religious", "module": "religious", "enabled": true, "params": { "shareOfCities": 0.5 }, "nameKey": "victory.religious.name" }
```

### 4.7 The effects vocabulary

Traits, beliefs, policies, buildings and events all speak the same small language of effects, so new content rarely needs new code. Each effect type is one handler in `src/sim/effects/`, registered by name. Version 1 ships these 24:

`yieldBonus`, `yieldPercent`, `cityYieldPercent`, `tileYield`, `freeBuilding`, `freeUnit`, `freeTech`, `freePolicySlot`, `combatBonus` (with `vs` and `when` filters), `moveBonus`, `sightBonus`, `healBonus`, `costPercent` (units, buildings, tiles), `upkeepPercent`, `growthPercent`, `borderGrowthPercent`, `amenityBonus`, `faithPurchase`, `religiousPressure`, `tradeRouteYield`, `spyBonus`, `opinionModifier`, `popChange`, `autoRoad`.

A mod needing something new can ship a new effect only as engine code (a pull request to the engine), never as code inside the mod. Mods are data only, which keeps saves safe and the game deterministic.

### 4.8 Worked example 1: the Witcher conversion

Goal: play the Northern Wars on the historical engine, with Northern Kingdoms factions, renamed units, original-text lore, monster raiders instead of barbarians, and the setting's faiths.

```
rules/witcher/
  mod.json            type "conversion", dependsOn ["base-ancient"]
  factions.json       removes all historical factions; adds Temeria, Redania, Kaedwen, Aedirn, Nilfgaard, Skellige, Kovir, Scoia'tael
  leaders.json        one leader each, with traits and agendas
  units.json          renames via text, adds unique units, changes two base units
  religions.json      replaces religion names and colours
  events.json         adds monster nests and Wild Hunt omen events
  tuning.json         barbarians renamed to monsters, raider spawn rate up 30%
  text/en-GB.json     every name and description in the setting's voice (original wording)
  skin/skin.json      grim northern palette, art registry overrides, fonts
```

`factions.json` (extract)

```json
{
  "contentType": "factions",
  "entries": [
    { "op": "remove", "where": { "tags": { "has": "historical" } }, "cascade": true },
    {
      "id": "nilfgaard",
      "nameKey": "faction.nilfgaard.name",
      "colours": { "primary": "#111111", "secondary": "#d4a017" },
      "leaders": ["emhyr"],
      "startBias": { "terrain": ["plains", "desert"] },
      "trait": { "id": "imperial_provinces", "effects": [
        { "effect": "costPercent", "target": "settler", "amount": -20 },
        { "effect": "yieldPercent", "yield": "production", "amount": 10, "scope": "capturedCities" }
      ]},
      "uniqueUnits": ["impera_guard"],
      "cityNames": "nilfgaard",
      "tags": ["witcher", "south"]
    }
  ]
}
```

`units.json` (extract)

```json
{
  "contentType": "units",
  "entries": [
    { "op": "change", "id": "spearman", "set": { "sprite": "unit.pikeman_north" } },
    { "id": "impera_guard", "class": "melee", "domain": "land", "era": "classical", "strength": 42, "moves": 2, "cost": 120, "upkeep": 2, "requires": { "tech": "iron_working", "faction": "nilfgaard" }, "replaces": "swordsman", "sprite": "unit.impera_guard" },
    { "id": "witcher_hunter", "class": "melee", "era": "classical", "strength": 35, "moves": 3, "cost": 80, "abilities": [{ "effect": "combatBonus", "amount": 15, "vs": { "tags": "monster" } }], "requires": { "building": "witcher_school" }, "sprite": "unit.witcher" }
  ]
}
```

`religions.json` (extract)

```json
{ "contentType": "religions", "entries": [
  { "op": "remove", "where": { "tags": { "has": "historical" } } },
  { "id": "eternal_fire", "nameKey": "religion.eternal_fire", "colour": "#e2582a", "icon": "religion.flame" },
  { "id": "melitele", "nameKey": "religion.melitele", "colour": "#7fb069", "icon": "religion.mother" }
]}
```

What the loader reports for this mod on a clean load: 0 errors, 0 warnings, and an info line such as "witcher removed 12 historical factions and 9 unique units (cascade), added 8 factions, 8 leaders, 11 units, 4 religions". Your Northern Wars `data/` files are the source for faction names, regions and flavour; Claude Code should translate them into this format, not copy code.

### 4.9 Worked example 2: "lock to one era"

Goal: an endless sandbox in one era, like Real Era Stop. You pick the era on the setup screen; techs and civics past it disappear, earlier ones are granted at the start, science victory and the turn limit switch off.

`rules/lock-era/mod.json`

```json
{
  "id": "lock-era",
  "name": "Lock to one era",
  "version": "1.0.0",
  "type": "tweak",
  "dependsOn": ["base-ancient"],
  "options": [
    { "id": "era", "labelKey": "opt.lockEra.era", "type": "choice", "source": "eras", "default": "classical" }
  ],
  "files": ["rules.json"]
}
```

`rules/lock-era/rules.json` (one file may hold several content types using `blocks`)

```json
{
  "blocks": [
    { "contentType": "techs",     "entries": [{ "op": "remove", "where": { "eraIndex": { "gt": "$opt:era.index" } }, "cascade": true }] },
    { "contentType": "civics",    "entries": [{ "op": "remove", "where": { "eraIndex": { "gt": "$opt:era.index" } }, "cascade": true }] },
    { "contentType": "wonders",   "entries": [{ "op": "remove", "where": { "eraIndex": { "gt": "$opt:era.index" } } }] },
    { "contentType": "victories", "entries": [
      { "op": "change", "id": "science", "set": { "enabled": false } },
      { "op": "change", "id": "score", "set": { "params.turnLimit": null } }
    ]},
    { "contentType": "tuning", "set": {
      "start.grantErasBefore": "$opt:era",
      "start.era": "$opt:era",
      "ai.lateGameMode": "sandbox"
    }}
  ]
}
```

- `eraIndex` is a field the loader adds to every entry with an `era`, so selectors can compare eras by order (`gt`, `lt`, `gte`, `lte`).
- With `era = classical` the report reads roughly: "lock-era removed 22 techs, 14 civics, 15 units, 10 buildings, 6 wonders (cascade); science victory off; turn limit off".
- `ai.lateGameMode: sandbox` tells the AI to keep expanding, warring and building wonders rather than chasing a science win that no longer exists (section 9).

**A smaller tweak:** `no-religious-victory` is one file with one line: `{"contentType": "victories", "entries": [{"op": "change", "id": "religious", "set": {"enabled": false}}]}`. The setup screen also has victory tick boxes, so this mod exists mainly to show how small a tweak can be.

## 5. Battle module interface

When armies meet, the engine packs everything about the fight into a **battle spec**, hands it to the chosen module, and gets back a **battle result** it can check and apply. The strategic game stores the result itself in its command log, so a saved game replays correctly even if a battle module is later changed or removed.

### 5.1 The contract

Every module lives in `src/battles/<id>/` and exports one object from `src/battles/<id>/index.js`:

```js
export default {
  id: 'auto',                 // matches the setup option value
  version: 1,
  kind: 'instant',            // 'instant' (resolves inside the sim) or 'interactive' (needs a screen)
  canHandle(spec) { return true; },          // eg a naval module refuses land battles
  resolve(spec, rng) { /* instant only: pure, deterministic */ return result; },
  simulate(spec, rng) { /* interactive only: fast headless run for AI vs AI and tests */ return result; },
  mount(spec, host) { /* interactive only: draws the battle in host.element, calls host.finish(result) */ },
};
```

### 5.2 What the engine passes in (`BattleSpec`)

```json
{
  "battleId": "t142-b3",
  "seed": 918273645,
  "turn": 142,
  "kind": "field",
  "attacker": {
    "faction": "rome", "human": true,
    "units": [
      { "ref": "u_0412", "type": "legionary", "class": "melee", "strength": 40, "hp": 100, "xp": 22, "promotions": ["battlecry"], "tags": ["infantry"], "sprite": "unit.legionary" }
    ],
    "support": [{ "ref": "u_0398", "type": "archer", "rangedStrength": 25, "hp": 80 }]
  },
  "defender": {
    "faction": "gaul", "human": false,
    "units": [{ "ref": "u_0555", "type": "swordsman", "class": "melee", "strength": 35, "hp": 64, "xp": 0, "promotions": [], "tags": ["infantry"], "sprite": "unit.swordsman" }],
    "city": null
  },
  "ground": {
    "centre": { "terrain": "grassland", "hills": true, "feature": "forest", "river": false },
    "ring": [ { "terrain": "plains", "hills": false, "feature": null }, "... six neighbours ..." ],
    "riverCrossing": true
  },
  "modifiers": { "attacker": [{ "source": "flanking", "amount": 2 }], "defender": [{ "source": "hills", "amount": 3 }, { "source": "forest", "amount": 3 }] },
  "tuning": { "baseDamage": 30, "strengthScale": 25, "spread": 0.2 },
  "skin": "witcher"
}
```

- `seed` is drawn from the game RNG once per battle, so the module has its own random stream and cannot disturb the strategic one.
- `modifiers` are already worked out by the engine, so a module never needs to re-implement Civ rules; it decides only how the fight plays out.
- `support` lists ranged units in range that may join (auto ignores them except for a bombard before melee; a tactical module can deploy them).
- `tuning` is the slice of `tuning.json` under `battle.<moduleId>`.

### 5.3 What comes back (`BattleResult`)

```json
{
  "battleId": "t142-b3",
  "module": "auto", "moduleVersion": 1,
  "winner": "attacker",
  "margin": "clear",
  "units": [
    { "ref": "u_0412", "hp": 71, "alive": true, "xpGained": 5 },
    { "ref": "u_0555", "hp": 0, "alive": false, "xpGained": 3 }
  ],
  "city": null,
  "attackerAdvances": true,
  "summaryKey": "battle.summary.clear_win",
  "replay": null
}
```

The engine validates every result before applying it: every `ref` was in the spec, `hp` is between 0 and its starting value, a dead unit has `hp` 0, and `winner` agrees with who survived. A bad result is rejected with a clear error, never half-applied.

### 5.4 Flow inside the game

1. Player or AI issues `{type: "attack", unit, target}`.
2. The engine builds the spec and looks up the module for this battle (setup option plus `canHandle`).
3. **Instant module, or no human involved:** the engine calls `resolve` (or `simulate`) inside `applyCommand` and applies the result straight away. AI against AI always goes this way.
4. **Interactive module with a human side:** the game enters a `pendingBattle` state (no other commands allowed except `resolveBattle` and `autoResolveBattle`). The UI mounts the module's screen. When the battle ends, the UI issues `{type: "resolveBattle", result}`.
5. The command log keeps the result (and the module's own replay log, if it provides one), so replays and saves never need to re-run the interactive battle.

### 5.5 Plugging in a real-time module later

Both your existing battle systems already fit this shape, which is why the contract looks the way it does.

| Existing system | Entry point today | Adapter work |
| --- | --- | --- |
| Killzone platoon battles | `createMatch({seed, options: {forces}})`, `runToEnd`, `state.result` with survivors per squad | Map each strategic unit to a platoon (strength sets squad count), map `result.platoons[].survivors` back to HP, `margin` maps directly |
| Britannia pixel soldiers | `createBattle({region, attacker, defender, siege, seed})` | Map unit class to Britannia unit types, map men remaining to HP |

Rules for any interactive module:

- It keeps its own sim, render and UI folders inside `src/battles/<id>/`, following the same determinism rules (own seeded RNG, own command log, no DOM in its sim).
- It must provide `simulate` so the AI vs AI simulator and the test suite can run thousands of its battles headless.
- Tuning lives in the ruleset under `battle.<id>`, so a conversion mod can retune a module (Killzone's front-line ruleset can lengthen battles without code changes).
- A **Fight it yourself / Auto-resolve** choice appears before each battle when the setup option is "Ask each time", with auto-resolve odds shown either way.

## 6. Match setup options

The setup screen is one scrolling page with three presets at the top (Quick, Standard, Epic) and every option below; the chosen options are saved into the game state as `state.setup` and never change after the match starts.

| Group | Option | Values (default in bold) | Stored as |
| --- | --- | --- | --- |
| Rules | Ruleset | **base-ancient** | `setup.mods[0]` |
| Rules | Conversion | **None**, Witcher, later Killzone and others | `setup.mods[1]` |
| Rules | Tweak mods | Tick boxes with order controls; each ticked mod shows its own options | `setup.mods[2..]`, `setup.modOptions` |
| Map | Map type | **Continents**, Pangaea, Islands, Inland Sea, Highlands | `setup.map.type` |
| Map | Map size | Small, Standard, **Large**, Huge | `setup.map.size` |
| Map | Sea level | Low, **Normal**, High | `setup.map.seaLevel` |
| Map | Resources | Sparse, **Standard**, Abundant | `setup.map.resources` |
| Map | World age (hilliness) | New, **Standard**, Old | `setup.map.age` |
| Map | Seed | Random (**shown and copyable**), or type one in | `setup.seed` |
| Players | Your faction and leader | Any from the merged ruleset, or **Random** | `setup.players[0]` |
| Players | AI opponents | 1 to 11 (default from map size: **7** on Large) | `setup.players[1..]` |
| Players | AI factions | Each **Random** or chosen; option "no duplicates" **on** | `setup.players[n].faction` |
| Players | Teams | **Off**, or assign team numbers | `setup.players[n].team` |
| Victory | Enabled victories | Tick boxes: **Conquest, Science, Culture, Religious, Score** (whatever the merged ruleset offers) | `setup.victories` |
| Victory | Turn limit | **Default for speed** (330 at Standard), custom, or none | `setup.turnLimit` |
| Pace | Game speed | Online (0.5x costs), Quick (0.67x), **Standard**, Epic (1.5x), Marathon (3x) | `setup.speed` |
| Pace | Starting era | **First era of ruleset**, or any later era | `setup.startEra` |
| Difficulty | Difficulty | Settler, Chieftain, Warlord, **Prince**, King, Emperor, Immortal, Deity | `setup.difficulty` |
| Difficulty | AI bonuses shown | Always listed on the setup screen and in the faction panel (eg "Emperor: AI +20% production, +1 starting settler") | from `difficulty.json` |
| World | Barbarians or raiders | Off, **On**, Raging (conversion may rename them) | `setup.raiders` |
| World | Events | Off, **Occasional**, Frequent | `setup.events` |
| World | Disasters (floods, plague) | **Off**, On | `setup.disasters` |
| Battles | Battle mode | **Auto-resolve always**, Ask each time, Always fight my battles (available once an interactive module exists) | `setup.battleMode` |
| Battles | Battle module | **auto**; others listed when installed | `setup.battleModule` |
| Advanced | Fog of war | **On**, Off (for testing) | `setup.fog` |
| Advanced | AI decision recorder | **On**, Off | `setup.recordAI` |
| Advanced | Autosave | **Every turn**, every 5 turns, off | `setup.autosave` |

Difficulty bonuses come only from `difficulty.json` in the ruleset, are labelled in the UI, and are the only advantage the AI ever gets. Prince is level ground (no bonuses either way).

## 7. Folder structure and module boundaries

The repo is a static site with the rules engine in the middle: everything may call the sim through its public `src/sim/index.js`, and the sim calls nothing above it. A script (`tools/check-boundaries.mjs`, the Grognards pattern) fails the build if any file imports across a forbidden line.

[Diagram in the original doc: module boundaries · 7 layers, calls only go downwards]

Arrows show what each layer may call. The UI may also call `src/sim/index.js` directly, and battle modules import only `core/`.

```
atlas/
  index.html                 the whole app (setup screen and game), loads src/main.js
  manifest.webmanifest  sw.js   offline install (stubs until phase 21)
  CLAUDE.md  README.md  CHANGELOG.md  CREDITS.md
  package.json               dev only: @playwright/test, eslint (no runtime dependencies)
  css/        tokens.css  base.css  game.css
  rules/      index.json  base-ancient/  witcher/  lock-era/  no-religious-victory/   (section 4)
  assets/     sprites/  terrain/  icons/  portraits/  audio/   (optional; art registry falls back to code-drawn art)
  src/
    main.js                  wires data, sim, ai, save, render and ui; owns the game loop
    core/     rng.js  hex.js  ids.js  clone.js  hash.js
    data/     loader.js  merge.js  selectors.js  validate.js  options.js  effects-compile.js  text.js  schemas/*.js
    sim/      index.js (public API)  state.js  commands.js (applyCommand)  turn.js  queries.js  view.js
              mapgen.js  map.js  visibility.js  movement.js  units.js  combat.js  promotions.js
              cities.js  growth.js  yields.js  borders.js  amenities.js  buildings.js  improvements.js
              progression.js  government.js  religion.js  trade.js  espionage.js  diplomacy.js
              events.js  score.js  effects/*.js  victories/*.js
    battles/  index.js (registry)  auto/index.js   (later: tactical/, killzone/)
    ai/       index.js  controller.js  evaluate.js  tactics.js  recorder.js
              planners/ expansion.js economy.js military.js science.js culture.js religion.js trade.js espionage.js diplomacy.js
    save/     save.js  codec.js  migrations.js
    render/   canvas.js  camera.js  hexDraw.js  layers/{terrain,borders,cities,units,fog,overlays}.js  fxRandom.js
              art/registry.js  art/placeholders.js  art/spriteSheet.js  art/lpc.js
    ui/       app.js  input.js  shortcuts.js  advice.js  attention.js  odds.js  toast.js
              screens/ setup.js map.js city.js tech.js civics.js government.js religion.js trade.js espionage.js diplomacy.js modManager.js recorder.js endgame.js
  tools/      sim.mjs (AI vs AI)  replay.mjs  perf.mjs  check-boundaries.mjs  check-data.mjs  check-text.mjs  check-size.mjs
  test/       core/ data/ sim/ ai/ save/ battles/ *.test.js   smoke/*.spec.js
  docs/       PLAN.md (this plan)  DECISIONS.md  MODDING.md  AI_TUNING.md  SPRITES.md
```

| Folder | May import | Must never import or touch |
| --- | --- | --- |
| `core/` | nothing | anything else, DOM |
| `data/` | `core/` | `sim/`, `ai/`, `render/`, `ui/`, DOM (it receives JSON text, it does not fetch) |
| `sim/` | `core/`, `battles/index.js` | `data/` internals (it receives the frozen ruleset as an argument), `ai/`, `save/`, `render/`, `ui/`, DOM, `Math.random`, `Date`, timers |
| `battles/` | `core/` | `sim/`, `ui/`, DOM in any `sim` subfolder of a module |
| `ai/` | `core/`, `sim/index.js` | sim internals, `render/`, `ui/`, DOM, `Math.random` |
| `save/` | `core/`, `sim/index.js` | `render/`, `ui/` (it is handed a storage object, so tests use an in-memory one) |
| `render/` | `core/`, `sim/index.js` (queries only), `data/text.js` | `ai/`, `save/`, game RNG (cosmetic randomness uses `fxRandom.js`) |
| `ui/` | everything above through public files | sim internals, game RNG |
| `tools/`, `test/` | anything | nothing forbidden |

Fetching JSON happens only in `src/main.js` (browser) and `tools/` (Node file reads), which pass text to `data/loader.js`. That is what lets the same loader and sim run headless in Node.

## 8. Save format and versioning

A save stores the setup, the seed, the full command log and a snapshot of the latest state, so loading is instant (from the snapshot) and any doubt can be settled by replaying from the seed (which must produce the same fingerprint).

### 8.1 Save shape

```json
{
  "format": "atlas-save",
  "saveVersion": 1,
  "engineVersion": "0.9.0",
  "createdAt": "2026-11-22T21:40:00Z",
  "label": "Rome, turn 142, Large Continents",
  "setup": { "seed": 918273645, "mods": ["base-ancient@1.0.0", "lock-era@1.0.0"], "modOptions": { "lock-era": { "era": "classical" } }, "map": {}, "players": [], "difficulty": "prince" },
  "rulesetHash": "a91f03c2",
  "log": [ { "n": 1, "turn": 1, "faction": 0, "type": "foundCity", "unit": "u_0001" } ],
  "snapshot": { "turn": 142, "stateVersion": 1, "state": { } },
  "fingerprint": "5c2e19aa",
  "recorder": { "included": false }
}
```

- `createdAt` is set by `save/` from the browser clock. The sim itself never reads the clock.
- `fingerprint` is a short hash of the state (turn, every faction's yields and stocks, every unit and city). Replay tests compare fingerprints.
- The AI decision recorder is stored separately (`atlas:recorder:<slot>`) because it grows fast; it is attached to exports only when you tick "include AI log".

### 8.2 Storage

| Key | Holds |
| --- | --- |
| `atlas:index` | List of slots: id, label, turn, faction, mods, saved time |
| `atlas:slot:<id>` | One save (compressed, see below) |
| `atlas:autosave:<n>` | Rolling autosaves, last 3 turns |
| `atlas:recorder:<id>` | AI decision log for that slot (capped at last 50 turns) |
| `atlas:settings` | UI settings (zoom, reduced motion, sound) |

**Size budget.** A full 330-turn, 8-faction game logs roughly 60,000 to 90,000 commands. Raw JSON would reach several megabytes, past the usual 5 MB localStorage limit. So:

- Commands use short keys in storage (`{t: "mv", u: 412, to: 1907}`), mapped by `save/codec.js`.
- The save is compressed with the browser's built-in `CompressionStream('gzip')` (no library), then base64. Node tests use `zlib` through the same codec interface.
- The snapshot keeps only the latest state; older states are rebuilt by replay when needed.
- Target: under 1.5 MB per late-game save. `tools/check-size.mjs` fails the build if the 330-turn test game's save is larger. If a slot will not fit, the UI says so and offers export instead.

### 8.3 Export and import

- **Export** produces a text code: `ATLAS1:` followed by the base64 of the compressed save, offered as "Copy code" and "Download .txt".
- **Import** accepts the code pasted into a box or a `.txt` file. It checks the prefix, decompresses, checks `format`, runs migrations, checks the mods are available (missing mods are listed by name and version), then loads.

### 8.4 Versioning and upgrades

Two version numbers, because two different things change:

- **`saveVersion`** changes when the save wrapper or the state shape changes. `save/migrations.js` holds one function per step:

```js
export const MIGRATIONS = {
  1: (save) => { /* 1 -> 2: cities gain amenities field */ save.snapshot.state.cities.forEach((c) => { c.amenities ??= 0; }); return save; },
  2: (save) => { /* 2 -> 3: rename 'culture' stock to 'influence' */ return save; },
};
export function upgrade(save) {
  while (save.saveVersion < CURRENT_SAVE_VERSION) { save = MIGRATIONS[save.saveVersion](save); save.saveVersion += 1; }
  return save;
}
```

- **Rules changes** (a mod updated, so the merged ruleset hash differs). The game loads the snapshot and keeps playing under the new rules, but warns: "This save was made with lock-era 1.0.0; you have 1.1.0. The game continues from turn 142; replays before this point may differ." A save can always be continued, even if it can no longer be replayed from turn 1.
- Every migration has a test that loads a stored fixture save from `test/save/fixtures/v<n>.json` and checks it upgrades and plays one more turn without errors.

## 9. AI approach

The AI is a scoring player: it picks a victory path every 10 turns, each specialist planner proposes commands with a score and a reason, and the highest-scoring legal commands are issued through the same `applyCommand` you use. Every weight is data, every choice is logged, and a new AI version is only kept if it beats the old one in the simulator.

### 9.1 Three levels of thinking

| Level | How often | What it decides | Main inputs |
| --- | --- | --- | --- |
| Grand strategy | Every 10 turns, or when war is declared on it | Primary and secondary victory path; war targets; peace wishes | Victory progress for every faction, leader `victoryBias`, trait tags, map situation |
| Planners | Every turn | City production, research, civics, policies, settling spots, religion, trade routes, spies, deals | Weights for the current path, faction personality, city needs |
| Tactics | Every turn, per unit group | Where each unit moves and what it attacks | Odds calculator, threat map, terrain, unit class |

### 9.2 Choosing a victory path

For each enabled victory, the AI computes a **path score** from 0 to 100:

`pathScore = progress × w.progress + feasibility × w.feasibility + leaderBias × w.bias + traitFit × w.trait - rivalLead × w.rival`

- `progress`: how far along it is (eg share of capitals held, share of science projects done).
- `feasibility`: whether the world allows it (religious victory scores 0 if it has no religion and none are left to found; conquest drops on Islands maps for factions with no navy techs).
- `leaderBias`: from the leader's `victoryBias` (section 4.6).
- `traitFit`: tags on traits and unique units (`"tags": ["conquest"]`) add to matching paths.
- `rivalLead`: how far the best rival is ahead on this path.

The top path becomes primary, the second becomes secondary. Hysteresis stops dithering: a new path must beat the current one by 15 points (`switchMargin`) to replace it.

### 9.3 Planners and scoring

Each planner proposes candidate commands, each with a score:

`score = baseValue × pathWeight[path][category] × personality[category] × urgency`

- `baseValue` is worked out by the planner (a library in a city with 3 mountains nearby is worth more than one with none).
- `pathWeight` comes from `ai/weights.json` (below).
- `personality` comes from the leader's personality in `ai/personalities.json`.
- `urgency` rises with threats (an enemy army 4 hexes from a city multiplies defensive units by up to 3).

`rules/base-ancient/ai/weights.json` (extract)

```json
{
  "science":   { "settle": 1.2, "science": 1.6, "military": 0.7, "culture": 0.8, "faith": 0.5, "gold": 1.0, "wonder": 1.0 },
  "conquest":  { "settle": 1.0, "science": 0.9, "military": 1.8, "culture": 0.6, "faith": 0.5, "gold": 1.1, "wonder": 0.6 },
  "culture":   { "settle": 1.0, "science": 0.9, "military": 0.7, "culture": 1.7, "faith": 0.8, "gold": 1.0, "wonder": 1.5 },
  "religious": { "settle": 1.0, "science": 0.8, "military": 0.8, "culture": 0.9, "faith": 1.9, "gold": 0.9, "wonder": 0.8 },
  "score":     { "settle": 1.3, "science": 1.1, "military": 1.0, "culture": 1.1, "faith": 0.9, "gold": 1.0, "wonder": 1.2 },
  "thresholds": { "attackMinWinChance": 0.6, "cityAttackMinWinChance": 0.7, "declareWarMinStrengthRatio": 1.4, "acceptPeaceBelowStrengthRatio": 0.8 },
  "sandbox": { "settle": 1.3, "military": 1.3, "wonder": 1.3 }
}
```

`rules/base-ancient/ai/personalities.json` (extract)

```json
{ "id": "builder_conqueror", "military": 1.2, "science": 1.0, "culture": 0.9, "faith": 0.7, "gold": 1.0, "wonder": 1.1, "settle": 1.2, "boldness": 0.6, "loyalty": 0.7, "grudge": 0.8 }
```

A conversion can retune the AI entirely in data: the Witcher mod might make Skellige's personality `military 1.5, naval 1.6`, without code.

### 9.4 Tactics

- Units are grouped into **task forces** (defend city X, attack city Y, escort settler, explore).
- Attacks are only made when the odds calculator gives a win chance above `attackMinWinChance` (0.6), or 0.7 against cities, unless the unit would die anyway next turn.
- Movement uses a **threat map** (sum of enemy attack strength that can reach each hex next turn) to avoid ending turns in danger, and prefers hills, forests and river lines when defending.
- Ranged units attack before melee; melee units move in to capture when a city's HP is 0.
- Settlers pick spots from a site score (food, production, luxuries, fresh water, coast, distance to capital, threat), recalculated every 5 turns.

### 9.5 Fairness and difficulty

- The AI reads only `view(state, factionId)`: its own fog of war, its own known techs, public diplomacy. No peeking.
- Its only advantages are the labelled difficulty bonuses from `difficulty.json`. Below Prince, the AI also plays less sharply (it looks at fewer candidate settle spots and skips some tactical look-ahead); this is labelled too ("Chieftain: AI plans less carefully").
- Players never see a hidden modifier. If something is not on the difficulty card, the AI does not have it.

### 9.6 AI decision recorder

Every issued command (and the top two rejected alternatives) is logged:

```json
{ "turn": 87, "faction": "gaul", "planner": "military", "command": { "type": "attack", "unit": "u_0555", "target": "u_0412" }, "score": 74, "reasonKey": "ai.reason.attack_good_odds", "reasonArgs": { "chance": 68, "target": "Legionary" }, "alternatives": [ { "type": "fortify", "score": 51 } ], "path": "conquest" }
```

- Reasons are text keys with arguments, so they read naturally: "Attacked the Legionary at 68% odds (conquest path; fortifying scored 51)."
- The **AI journal** screen (section 10) filters by faction, turn and planner. Grand strategy changes are pinned at the top ("Turn 80: Gaul switched from science to conquest. Rome is 2 capitals ahead and weakly defended.").
- The recorder is off in the simulator by default (speed) and on in normal games.

### 9.7 Measuring the AI

`tools/sim.mjs` runs whole AI-only games headless:

```
node tools/sim.mjs --games 20 --size small --speed quick --mods base-ancient --seeds 1000-1019
node tools/sim.mjs --challenger ai-v7 --champion ai-v6 --games 20 --swap-seats
```

It reports, per batch:

| Report line | Healthy range |
| --- | --- |
| Win rate by faction | No faction above 2x the average, none at 0% across 40 games |
| Win rate by victory type | Each enabled type wins at least 5% of games |
| Average turn of victory | 150 to 260 at Quick speed on Small maps |
| Stalled games (no victory by limit) | Under 20% |
| Errors | 0 rule errors, 0 NaN, 0 rejected AI commands |
| Turn time | Under 2 seconds per AI round on a Large map (Node, measured by `tools/perf.mjs`) |

**Keep-or-revert rule** (from Grognards): an AI change is a challenger version. The challenger plays half the seats against the champion in the other half, seats swapped, 20 games. It is kept only if it wins more than 55% of the decided games and breaks none of the healthy ranges; otherwise the change is reverted. Results go into `docs/AI_TUNING.md` with date, versions, seeds and win shares. Stalled games are reported separately and never counted as wins.

## 10. UI, skins and sprites

The game lives on one map screen with drawers and overlays, designed for a 1366x768 laptop window with mouse and keyboard, while every action is also a button of at least 44px so touch works and a phone layout can come later without redesign.

### 10.1 UI rules

- **One advice line** under the top bar always says the single most useful next step, with a **Do it** button that jumps there. Priority order lives in `rules/<mod>/ui/advice.json`, so conversions can reword it.
- **Needs attention list** on the left replaces hunting through screens: idle units, cities choosing production, research or civic finished, empty policy slot, pantheon or religion available, trade route expired, spy mission finished, deal offered, war declared, city under attack, starving or unhappy city. Clicking an item opens exactly the right place.
- **Next Turn** button turns into the next required action ("Choose production") until nothing blocks the turn. Enter does the same.
- **Odds before attacking.** Selecting a unit and pointing at an enemy shows win chance and expected HP loss on both sides; on touch, the first tap on an enemy shows odds and the second tap attacks.
- **Few screens.** The map, a city drawer, a full-screen trees overlay (tech and civics), an Empire overlay with tabs (cities, government, religion, trade, spies), a diplomacy overlay, the AI journal, plus setup, mod manager and end-game screens.
- **Nothing hover-only.** Tooltips appear on hover and on long-press; every tooltip's content is also reachable by click.
- **Keyboard shortcuts** (`ui/shortcuts.js`, listed in a help panel): Enter next turn or next item, Space next unit, F fortify, S skip, B found city, R research tree, C civics tree, E Empire, D diplomacy, J AI journal, arrow keys or WASD to pan, mouse wheel to zoom, right-click to move.
- **Reduced motion** respected (`prefers-reduced-motion`): units jump instead of sliding, no screen shake.

### 10.2 Screen list

| Screen | Opens from | Main decisions |
| --- | --- | --- |
| Title | Start | Continue, New game, Load, Import code, Mods, Settings |
| Setup | New game | Everything in section 6 |
| Mod manager | Title or setup | Tick mods, order them, read the conflict report, set mod options |
| Map (main) | Always | Move, attack, found, build improvements, end turn |
| City drawer | Click a city | Production, buy, citizen focus, lock tiles, buy tiles |
| Trees overlay | R or C or advice line | Pick research, pick civic, see boosts |
| Empire overlay | E | Government and policy cards, religion, trade routes, spies, city list |
| Diplomacy overlay | D or a leader portrait | Declare war, make peace, propose and answer deals, see opinion reasons |
| Battle prompt | Attack with an interactive module set to "Ask" | Fight it yourself or auto-resolve (odds shown) |
| AI journal | J | Read why each AI did what it did |
| End game | Victory or defeat | Scores, timeline graph, replay seed, export |

### 10.3 Wireframes (laptop, 1366x768)

**Map screen**

```
+--------------------------------------------------------------------------------------------------+
| ROME  Turn 142  Classical | Sci +34 Philosophy 3t | Cul +21 Drama 5t | Gold 412 (+18) | Faith 96 (+7) | [=] |
+--------------------------------------------------------------------------------------------------+
| > Neapolis has nothing to build. Choose its next project.                              [Do it]   |
+----------------------+--------------------------------------------------+------------------------+
| NEEDS ATTENTION (5)  |                                                  | LEGIONARY (Rome)       |
| [!] Neapolis: build  |                                                  | HP 100   XP 22/45      |
| [!] 2 idle units     |                  HEX MAP                         | Moves 2/2              |
| [!] Policy slot free |          (pan, zoom, click to select)            | [Move] [Fortify]       |
| [!] Gaul offers peace|                                                  | [Skip] [Build fort]    |
| [!] Trader returned  |                                                  | ---------------------- |
|                      |                                                  | Odds vs Swordsman      |
|                      |                                                  | Win 72%                |
|                      |                                                  | You lose ~28 HP        |
| +------------------+ |                                                  | They lose ~64 HP       |
| |     minimap      | |                                                  |                        |
| +------------------+ |                                                  | [   CHOOSE PRODUCTION ]|
+----------------------+--------------------------------------------------+------------------------+
```

**City drawer** (slides over the right panel; the map stays visible and shows worked tiles)

```
+------------------------------------------+
| NEAPOLIS   Pop 7   Amenities +1  [x]     |
| Food +4 (grows in 6)  Prod 14  Gold 6    |
| Sci 5  Cul 3  Faith 1                    |
+------------------------------------------+
| BUILDING: Library  4 turns   [Buy 180g]  |
| Queue: Archer > Granary          [Edit]  |
+------------------------------------------+
| CHOOSE (best first, reasons shown)       |
| Library      4t  +2 sci, +1 per 2 mts    |
| Granary      5t  +2 food                 |
| Settler      8t  new city                |
| Archer       3t  defence                 |
| [Show all 14]                            |
+------------------------------------------+
| Focus: (Balanced) Food Prod Gold Sci ... |
| Tap a tile on the map to lock a citizen  |
| Buildings: Monument, Shrine, Walls       |
+------------------------------------------+
```

**Trees overlay** (tech and civics share one component; tabs at top)

```
+--------------------------------------------------------------------------------+
| [Technology] [Civics]          Researching: Philosophy (3 turns)       [Close]  |
+--------------------------------------------------------------------------------+
| ANCIENT          | CLASSICAL               | MEDIEVAL                | ...       |
| [Pottery] ---> [Writing] ---> [Philosophy*] ---> [Education]                    |
| [Mining]  ---> [Bronze]  ---> [Iron Working] --> [Machinery]                    |
|   * boost: build a temple (40% done)                                            |
| Click a tech to research it now, or shift-click to queue a path.               |
+--------------------------------------------------------------------------------+
```

**Diplomacy overlay**

```
+-------------------------------------------------------------------+
| LEADERS             | GAUL (Vercingetorix)   At war, 12 turns      |
| Gaul      war  -14  | Opinion -14:                                |
| Carthage  peace +6  |  -10 You captured their city                |
| Egypt     peace +2  |   -6 You are close to their borders         |
|                     |   +2 Trade route between you                |
|                     | Agenda: respects strong armies (you: yes)   |
|                     | [Propose peace] [Make a deal] [Denounce]    |
|                     | DEAL: You give [ ]   They give [ ]           |
|                     | AI answer preview: "Likely yes"             |
+-------------------------------------------------------------------+
```

### 10.4 How each Civ decision fits one action

| Decision | Civ VI way | Atlas way |
| --- | --- | --- |
| Next production | Open city, scroll list | Attention item opens the city drawer on a short list ranked best first with a one-line reason; one click picks |
| Research | Open tree, find item | Advice line suggests one; one click accepts, or open the tree |
| Move a unit | Select, right-click | Same; or click unit then click destination (touch-safe) |
| Attack | Move onto enemy | Point to see odds, click to attack (two taps on touch) |
| Citizen tiles | City screen, click tiles | Focus buttons cover most needs; clicking a tile on the map locks it |
| Policy cards | Government screen, drag cards | Click a slot, pick from a short list (dragging optional) |
| Trade route | Select trader, browse destinations | Destinations listed with yields each way, best first |
| Spy mission | Select spy, choose city and mission | Same list style, with success odds shown |
| Deals | Trade screen | Deal panel shows the AI's likely answer before sending |
| End turn | Button | Button names what still blocks it |

### 10.5 Skins and the art registry

Every picture, colour, sound and font is asked for by id through `render/art/registry.js`, never by file path:

```js
getArt('unit', 'legionary', { faction: 'rome' })
// tries: unit.legionary.rome  ->  unit.legionary  ->  unit.class.melee  ->  code-drawn placeholder
```

- **Placeholders drawn in code** (`render/art/placeholders.js`): terrain hexes as base colour plus a seeded pixel pattern (grass tufts, hill bumps, forest dots); units as a faction-coloured shield with a class glyph; buildings and techs as icons from a small pixel glyph set; leaders as a coloured silhouette with initials. The game is fully playable on placeholders alone.
- **`skin/skin.json`** in a ruleset or conversion supplies: palette tokens (`--ink`, `--paper`, `--accent`), fonts (system stacks or a bundled `.woff2`), art entries (`"unit.legionary": {"sheet": "sprites/legionary.json"}`), terrain art set, sound ids, and faction colour overrides.
- **Load order applies to skins too:** the Witcher skin overrides any art id it provides; anything it leaves out falls back to the base skin, then to placeholders. Nothing breaks while art is missing.
- `tools/check-data.mjs` lists every art id the merged ruleset uses and whether it has real art, a base fallback or only a placeholder (the Spice Raiders asset list idea), written to `docs/ART_STATUS.md`.

### 10.6 Sprite sheet format and LPC loader

One standard descriptor for every sheet, with a layout adapter for LPC:

```json
{
  "id": "unit.legionary",
  "src": "assets/sprites/legionary.png",
  "frame": { "w": 64, "h": 64 },
  "anchor": { "x": 32, "y": 58 },
  "layout": "lpc",
  "attackAnim": "thrust",
  "fps": 8,
  "credits": "Universal LPC Spritesheet Character Generator, layers: body (Stephen Challener), armour (...) CC-BY-SA 3.0"
}
```

- **Atlas animations:** `idle`, `walk`, `attack`, `hurt`, `die`, each in 4 directions (`n`, `w`, `s`, `e`). Hex movement's 6 directions map to the nearest of the 4.
- **`layout: "lpc"`** (`render/art/lpc.js`) maps the standard LPC sheet: walk rows 8 to 11 (9 frames), attack from `slash` rows 12 to 15, `thrust` rows 4 to 7 or `shoot` rows 16 to 19 (chosen by `attackAnim`), hurt and die from row 20, idle as walk frame 0. Row order in each block is up, left, down, right.
- **`layout: "grid"`** is for your own sheets: `"anims": {"walk": {"row": 0, "frames": 6, "dirs": ["s", "w", "e", "n"]}}`.
- **`layout: "code"`** points to a drawing function id for code-drawn sprites, so Killzone-style pixel troopers fit the same registry.
- On the strategy map a unit sprite is drawn at 48px at 100% zoom inside a 72px-wide hex, with a faction-coloured base disc and an HP bar.
- Every sheet's `credits` is collected into `CREDITS.md` by `tools/check-data.mjs`, and a sheet without credits fails the check, so LPC attribution is never forgotten.

## 11. Testing and tooling

All checks run in Claude Code's cloud container and again in GitHub Actions on every push, so nothing is ever installed on your laptop; what you check yourself happens in the browser on the GitHub Pages build.

### 11.1 Commands (`package.json`, dev dependencies only)

| Command | What it runs | When |
| --- | --- | --- |
| `npm test` | Node `node:test` suites in `test/` (core, data, sim, ai, save, battles) | Before every commit |
| `npm run check` | `check-boundaries`, `check-data`, `check-text`, `check-size`, eslint (0 warnings), then `npm test` | Before every push and in CI |
| `npm run smoke` | Playwright in Chromium at 1366x768 and 1920x1080, plus one touch-emulated 820x1180 run | Before every push and in CI |
| `npm run sim -- <args>` | AI vs AI simulator (section 9.7) | AI or balance changes |
| `npm run perf` | Times AI rounds and map drawing on a Large map | Phases 10, 16, 21 and any slow-down report |
| `npm run replay -- <save.txt>` | Replays an exported save from its seed and log, prints first fingerprint mismatch | When a bug report comes with a save code |

### 11.2 Sim tests that must always pass

- **Determinism:** the same seed and command log give the same fingerprint, every 10 turns, over a 100-turn AI-only game on a Small map, for 5 seeds.
- **No NaN or Infinity** anywhere in state after every turn (a recursive scan, Northern Wars style).
- **Values in range:** HP 0 to 100, population at least 1, yields not negative (except gold per turn), amenities within -10 to +20, opinion within -100 to +100, no unit on an impassable tile, no two combat units on one tile.
- **Conservation:** gold change per turn equals income minus upkeep minus purchases (logged per turn, checked).
- **Save round trip:** save, export code, import, compare fingerprint; then play 5 more turns both ways and compare again.
- **Migration fixtures:** every older `saveVersion` fixture upgrades and plays one turn.
- **Mod loader:** each operation, each error and warning in section 4.5, both worked examples, and a "stack everything" test (base + witcher + lock-era + no-religious-victory) with 0 errors.
- **Commands:** every command type has a test for success and for each refusal reason; illegal commands never change state.
- **AI fairness:** the AI's `view` never contains unexplored tiles or other factions' hidden data (a test fills hidden tiles with poison values and fails if the AI reads them).
- **Battle modules:** results are validated; a hand-made bad result is refused cleanly.

### 11.3 Repo checks

- `tools/check-boundaries.mjs`: enforces the import table in section 7.
- `tools/check-data.mjs`: loads every mod in `rules/index.json` alone and in the standard stacks; writes `docs/ART_STATUS.md` and `CREDITS.md`; fails on missing credits.
- `tools/check-text.mjs`: fails on any em dash or en dash in `rules/**/text`, `src/**`, `docs/**` and `README.md`; flags common American spellings (color, center, defense, armor, favor) in player text. (Colour stays `color` only where CSS requires it.)
- `tools/check-size.mjs`: late-game save under 1.5 MB; total page weight for first load under 1 MB without art.

### 11.4 Browser smoke tests (`test/smoke/`)

- Load the title screen, start a Quick Small game with a fixed seed, check no console errors, play 5 turns through the UI (select unit, move, found city, pick production, end turn), save, reload, continue.
- Open every overlay and the mod manager; take screenshots into `test-results/` for review.
- One touch-emulated run that does the same five turns with taps only, proving nothing is hover-only.
- From phase 21: portrait and landscape phone sizes (390x844, 844x390) added.

### 11.5 Developer page

`dev.html` on GitHub Pages (linked from Settings when "developer mode" is ticked) gives you checks you can do from the laptop browser: set seed, reveal map, toggle fog, give gold, jump turns with AI playing all seats, open the AI journal, paste a save code and step through its replay turn by turn, run a 10-game mini-simulation in a Web Worker and show the win table.

### 11.6 Performance targets (laptop, Chrome)

| Measure | Target |
| --- | --- |
| AI round, 8 factions, Large map, turn 200 | Under 2 s (sim in a Web Worker so the page stays responsive) |
| Map redraw while panning | 60 fps, terrain cached in chunked offscreen canvases |
| Save and autosave | Under 300 ms |
| First load (no art) | Under 2 s |

## 12. Phased milestones

22 phases in four stages: foundations (1 to 4), a playable core you can win by conquest or science (5 to 9), the remaining version 1 systems plus the Witcher conversion (10 to 17), then battle modules, multiplayer and phone (18 to 22).

[Diagram in the original doc: roadmap · 22 phases, 4 stages, 2 gates]

Each stage ends with something you can check in the browser; the two gates are the points to stop, play several full games, and adjust the plan before going on.

**How to use the prompts.** Before phase 1, create the public repo `accipiter117/Atlas` with an MIT licence, turn on GitHub Pages from the main branch root, export this doc as Markdown and commit it as `docs/PLAN.md`. Then paste each phase's prompt into a new Claude Code (cloud) session on that repo. Every prompt relies on the "Definition of done" in `CLAUDE.md` (section 13), so prompts stay short. Acceptance checks are things you can do yourself in the laptop browser on the GitHub Pages build (`https://accipiter117.github.io/Atlas/`).

### Stage 1: Foundations

### Phase 1: Repo, rules of the road and the empty engine

**Goal.** A live GitHub Pages site with the full check pipeline, a deterministic core, and an engine that can start a game and end turns (with nothing in it yet).

**Build.**

- `CLAUDE.md` (section 13), `README.md`, `CHANGELOG.md`, `CREDITS.md`, LICENSE (MIT, in Matthew's name), `docs/DECISIONS.md`, `package.json` (dev only), eslint config, `.github/workflows/check.yml` running `npm ci`, `npm run check`, `npm run smoke`.
- `src/core/`: `rng.js` (mulberry32, state stored as a number in `state.rng`, plus `fork(state, label)` for named sub-streams), `hex.js` (axial coords, neighbours, distance, ring, line, pixel conversion), `hash.js`, `clone.js`, `ids.js`.
- `src/sim/`: `createGame(ruleset, setup)`, `applyCommand(state, cmd)` returning `{ok, state, events}` or `{ok: false, error}`, `endTurn` command, seat order, `fingerprint(state)`, `index.js` public API.
- `src/save/codec.js` (gzip via `CompressionStream` in browser, `zlib` in Node) and `save.js` skeleton with `saveVersion: 1`.
- `tools/check-boundaries.mjs`, `check-text.mjs` (em and en dash ban, American spelling flags), `check-size.mjs` stub.
- `index.html` title screen with Continue (disabled), New game, Load, Mods, Settings, styled with `css/tokens.css`.

**Check on your laptop.**

- [ ] The GitHub Pages link opens a title screen with five buttons, no errors in the browser console (F12).
- [ ] The repo's Actions tab shows a green tick on the latest commit.
- [ ] `docs/PLAN.md` is in the repo.

**Tests that must pass.** RNG gives identical sequences for identical seeds and different ones otherwise; hex maths (distance, neighbours, rings) against hand-worked cases; `createGame` then 50 `endTurn` commands gives the same fingerprint twice; an illegal command is refused without changing state; save codec round trip; boundary and text checks.

**Prompt**

```text
Phase 1 of the Atlas build. Read docs/PLAN.md fully (sections 1, 7, 8, 11 and 13 matter most now).

Set up the repo exactly as section 7 describes, with no runtime dependencies. Create CLAUDE.md from section 13 word for word, then follow it. Keep the MIT LICENSE in my name, and say in README.md that it covers the code only: franchise names belong to their owners and LPC art keeps its own licence. Build src/core (rng.js with mulberry32 and named forks, hex.js with axial pointy-top maths, hash.js, clone.js, ids.js), a minimal src/sim (createGame, applyCommand with only the endTurn command, seat order from the seed, fingerprint, index.js as the only public entry), src/save/codec.js (CompressionStream gzip in the browser, zlib in Node, same interface) and a save.js skeleton with saveVersion 1.

Add tools/check-boundaries.mjs enforcing the import table in section 7, tools/check-text.mjs banning em and en dashes and flagging American spellings in player text, and a check-size.mjs stub. Add a GitHub Actions workflow that runs npm ci, npm run check and npm run smoke on every push.

index.html should show a simple title screen (Continue disabled, New game, Load, Mods, Settings) that works with mouse, keyboard and touch, with 44px minimum targets.

Write the tests listed for phase 1 in section 12. Then follow the Definition of done in CLAUDE.md.
```

### Phase 2: Rules as data and the mod loader

**Goal.** The loader can stack mods in order, apply add, change, replace and remove operations, check every reference and schema, and explain itself in a report.

**Build.**

- `src/data/`: `loader.js`, `merge.js`, `selectors.js` (`eq`, `in`, `notIn`, `has`, `gt`, `lt`, `gte`, `lte`), `options.js` (`$opt:` substitution), `validate.js`, `effects-compile.js` (checks effect names and fields), `text.js` (string lookup with `{name}` arguments), `schemas/` for every content type in section 4.
- `rules/index.json`, `rules/base-ancient/` with real `mod.json`, `tuning.json`, terrain, features, resources, map sizes and types, 6 units, 2 test factions, and `text/en-GB.json`.
- Test fixture mods in `test/fixtures/mods/` covering every operation and error.
- `rules/lock-era/` and `rules/no-religious-victory/` written as in section 4.9 (they will report warnings until techs exist, which is expected).
- Mod manager screen (read-only for now): lists mods from `rules/index.json`, lets you tick and order them, shows the report grouped into errors, warnings and info.

**Check on your laptop.**

- [ ] Mods screen lists base-ancient, lock-era and no-religious-victory.
- [ ] Ticking lock-era without base-ancient shows a red error naming the missing mod.
- [ ] Reordering mods changes the report's "last one wins" lines in the test stack.

**Tests that must pass.** Every operation succeeds and fails as section 4.3 says; every message type in section 4.5 is produced by a fixture; cascade removal removes dependents; options substitute; the merged ruleset is deeply frozen and its hash is stable across runs; loading in Node and in the browser gives the same hash.

**Prompt**

```text
Phase 2 of the Atlas build. Read docs/PLAN.md section 4 closely, plus sections 3.1 and 7.

Build src/data exactly as section 4 describes: manifest handling (dependsOn, loadAfter, incompatibleWith, options), load order with a stable topological sort, the add, replace, change and remove operations with where selectors and cascade, $opt substitution, schema validation using plain JS schema objects in src/data/schemas (one per content type in section 4.6, including the ones whose systems come later), reference checking, an eraIndex field added to every entry with an era, deep freezing, and a stable ruleset hash. The loader takes JSON text, never fetches; src/main.js and tools/ do the fetching or file reading.

Create rules/index.json and rules/base-ancient with mod.json, tuning.json (all numbers named in section 3), terrain, features, resources, mapSizes, mapTypes, 6 units, 2 test factions and en-GB text. Create rules/lock-era and rules/no-religious-victory as in section 4.9. Add fixture mods under test/fixtures/mods that trigger every message in the section 4.5 table.

Add a read-only Mods screen: tick, order (buttons, not drag only) and show the report grouped by level. Add tools/check-data.mjs that loads each mod alone and the standard stack.

Write the phase 2 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 3: The hex world

**Goal.** Seeded maps of every type and size, drawn as top-down pixel hexes you can pan and zoom smoothly.

**Build.**

- `src/sim/mapgen.js`: continents, pangaea, islands, inland sea, highlands; elevation and moisture noise from the seed; hills, mountains, rivers along hex edges flowing to the sea, features, resources by frequency and valid terrain, and fair start positions (each start has at least 2 food tiles and fresh water within 3 hexes, starts at least 9 hexes apart on Large).
- `src/render/`: canvas, camera (drag to pan, wheel and pinch to zoom, 50% to 200%, keyboard pan), hex drawing, terrain layer cached in 16x16-hex offscreen chunks, river edges, resource icons, grid toggle.
- `src/render/art/registry.js` and `placeholders.js`: seeded pixel patterns per terrain (on the cosmetic RNG stream, never the game one).
- `dev.html` map viewer: seed box, type and size pickers, regenerate, start positions shown.

**Check on your laptop.**

- [ ] In `dev.html`, each map type looks different and plausible; the same seed always gives the same map.
- [ ] Panning and zooming a Huge map stays smooth (no visible stutter).
- [ ] Rivers run along hex edges and reach water.

**Tests that must pass.** Same seed gives an identical map (hash); 50 seeds per type produce valid maps (land share within 5% of target, every start reachable by land or coast, no resources on invalid terrain, rivers end in water); generation of a Huge map under 1.5 s in Node.

**Prompt**

```text
Phase 3 of the Atlas build. Read docs/PLAN.md sections 3.1, 10.5 and 11.6.

Write src/sim/mapgen.js that builds a map from the game seed and the merged ruleset: the five map types and four sizes from mapTypes.json and mapSizes.json, elevation and moisture noise, hills, mountains, rivers stored as flags on hex edges and flowing to water, features, resources placed by frequency and validTerrain, and fair start positions (at least 2 food tiles and fresh water within 3 hexes, minimum spacing set in tuning.json). Store the map as flat arrays for speed.

Write src/render with a canvas, a camera (drag pan, wheel zoom, pinch zoom, keyboard pan, 50% to 200%), pointy-top hex drawing, a terrain layer cached in 16x16-hex offscreen chunks, river edges and resource icons. Start src/render/art/registry.js with the fallback chain in section 10.5 and placeholders.js with seeded pixel patterns per terrain, using a cosmetic random stream that never touches the game RNG.

Add dev.html with a seed box, map type and size pickers and start positions marked.

Write the phase 3 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 4: Units, turns and fog of war

**Goal.** You can select units, move them by the rules, end turns, and only see what your units can see.

**Build.**

- `src/sim/units.js`, `movement.js` (path cost from terrain data, roads, river crossing rule, zone of control, one combat plus one civilian per tile, pathfinding with A\*), `visibility.js` (unexplored, explored, visible; sight rules in section 3.15), `view.js` (the filtered view any player or AI gets).
- Commands: `moveUnit`, `fortify`, `skip`, `sleep`, `wake`, `disband`.
- Starting units from `eras.json` placed at start positions; dummy AI that ends its turn.
- UI: map selection, right panel with unit card and action buttons, path preview with turn numbers, Space for next unit, needs attention list v1 (idle units), Next Turn button.
- `render/art/spriteSheet.js` and `lpc.js`: the descriptor format in section 10.6, one LPC test sheet in `assets/sprites/` with credits, walk animation when units move (instant when reduced motion is on).

**Check on your laptop.**

- [ ] Click a warrior, click a hex three tiles away: a path with turn counts appears and the unit walks there over the right number of turns.
- [ ] Forests and hills slow units; entering a hex next to an enemy stops movement.
- [ ] Unexplored hexes are black, explored ones grey, visible ones bright.
- [ ] The LPC test unit walks facing the right direction.

**Tests that must pass.** Movement costs and zone of control by fixture maps; pathfinding never routes through impassable hexes; stacking rules; visibility updates after moves; `view` never leaks unseen tiles (poison test from section 11.2); 100 turns of random legal moves stay deterministic.

**Prompt**

```text
Phase 4 of the Atlas build. Read docs/PLAN.md sections 3.5, 3.14, 3.15, 10.1 and 10.6.

Add units, movement and fog of war to src/sim: units.js, movement.js (terrain and road costs from data, the river crossing rule, zone of control with the ignoresZoc class flag, one combat unit and one civilian per tile, A* pathfinding returning per-turn waypoints), visibility.js (three states, sight from data, hills bonus, mountains and forests block sight lines), and view.js which gives a player or AI only what that faction can see. Add the moveUnit, fortify, skip, sleep, wake and disband commands. Place starting units from eras.json. Add a placeholder AI that just ends its turn.

In the UI: selection, a right-hand unit panel with buttons for every action, a path preview showing turns, Space for next unit, Enter or the Next Turn button, and a first needs attention list showing idle units.

Build render/art/spriteSheet.js and lpc.js for the descriptor in section 10.6, with one credited LPC test sheet, and animate unit movement (instant under prefers-reduced-motion).

Write the phase 4 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Stage 2: Playable core

### Phase 5: Cities, citizens and yields

**Goal.** Found cities that claim land, grow, work tiles, produce units, and show their numbers clearly.

**Build.**

- `cities.js`, `growth.js`, `yields.js`, `borders.js`: founding rules, work radius 3, citizen auto-assignment by focus, locked tiles, growth curve, starvation, border growth by culture, buying tiles with gold.
- Commands: `foundCity`, `setProduction`, `queueProduction`, `buyItem`, `setFocus`, `lockTile`, `unlockTile`, `buyTile`.
- City names from `cityNames.json` per faction.
- UI: city drawer (wireframe in 10.3), worked tiles shown on the map, top bar yields, the advice line with its priority list from `ui/advice.json`, needs attention items for production and growth problems.

**Check on your laptop.**

- [ ] Found a city with B; it claims the ring of tiles around it and gets a name.
- [ ] The city drawer shows food, production and turns to grow; switching focus to Production moves citizens onto hills and forests.
- [ ] Clicking a tile locks a citizen there (a lock icon appears).
- [ ] The advice line tells you to choose production when the queue is empty, and Do it opens the city.

**Tests that must pass.** Growth thresholds match the formula for populations 1 to 20; yields add up from tile, building and modifier sources in the documented order; borders claim the best tile when the culture box fills; minimum city distance refused; a 100-turn game with dummy AIs founding cities stays deterministic and in range.

**Prompt**

```text
Phase 5 of the Atlas build. Read docs/PLAN.md sections 3.2, 3.3, 10.1 to 10.4.

Add settlements to src/sim: cities.js, growth.js, yields.js and borders.js following section 3.2 and 3.3 exactly, with every number read from tuning.json. Add the foundCity, setProduction, queueProduction, buyItem, setFocus, lockTile, unlockTile and buyTile commands. Yields must be computed in one function with the order: tile, then flat bonuses, then percentage bonuses last, so later systems slot in.

In the UI add the city drawer from the wireframe in 10.3 with a short ranked production list showing a one-line reason for each option, worked tiles drawn on the map, a top bar with per-turn yields and stocks, the advice line (priorities from rules/base-ancient/ui/advice.json, with a Do it button) and needs attention items for empty production and starving cities. Give the dummy AI a simple rule to found cities so tests can run.

Write the phase 5 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 6: Economy, buildings, improvements and factions

**Goal.** Cities build buildings and wonders, builders improve land, gold and happiness matter, and the 8 base factions each play differently.

**Build.**

- `buildings.js` (prerequisites, adjacency, specialists, wonders one per world), `improvements.js` and builder charges, `amenities.js`, upkeep and disbanding when bankrupt.
- `src/sim/effects/` with the first 14 effect handlers (all yield, cost, upkeep, growth, free building, free unit, move, sight, heal, autoRoad).
- `base-ancient` content: about 30 buildings, 8 wonders, 9 improvements, 8 factions with leaders, traits, agendas (agendas used in phase 12), unique units and buildings. Suggested set: Rome, Greece, Egypt, Persia, Carthage, Gaul, Britons, Han.
- UI: buildings in the city drawer, wonder announcement toast, amenities shown per city, faction card on the setup preview.

**Check on your laptop.**

- [ ] A builder can make a farm (food goes up) and its charges count down.
- [ ] A Library next to mountains shows the adjacency bonus in its tooltip.
- [ ] Letting gold run negative shows a warning two turns before a unit disbands.
- [ ] Each faction's trait is visible on its card and actually changes numbers (eg Rome's free Monument appears in new cities).

**Tests that must pass.** Each effect handler has a unit test; adjacency counts by fixture; one-per-world wonders; bankruptcy disbands deterministically; amenity thresholds apply the right yield changes; every base faction loads with 0 errors.

**Prompt**

```text
Phase 6 of the Atlas build. Read docs/PLAN.md sections 3.3, 3.4, 4.6 and 4.7.

Add buildings.js (prerequisites, adjacency rules, specialist slots, wonders limited to one per world with production converting to gold if beaten), improvements.js with builder charges, amenities.js with the thresholds in amenities.json, unit and building upkeep with deterministic disbanding when gold is negative (warn two turns ahead through an event the UI shows).

Create src/sim/effects with one handler file per effect and a registry, implementing the first 14 effects from section 4.7 (yield, percent, tile yield, cost, upkeep, growth, free building, free unit, move, sight, heal, autoRoad and their scopes). Traits, buildings and policies must all go through this registry.

Fill rules/base-ancient with about 30 buildings, 8 wonders, 9 improvements and 8 factions (Rome, Greece, Egypt, Persia, Carthage, Gaul, Britons, Han), each with a leader, a trait, an agenda, one unique unit and one unique building, written in original British English text. Show buildings in the city drawer, a wonder toast, per-city amenities and faction cards.

Write the phase 6 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 7: Combat and the battle module interface

**Goal.** Units and cities fight using Civ VI-style maths through a battle module, with odds shown before every attack.

**Build.**

- `combat.js`: the damage formula and modifiers in section 3.6, ranged attacks, city strength, walls, city ranged attack, capture and raze, promotions and experience, healing.
- `src/battles/index.js` registry and `src/battles/auto/index.js`; the full BattleSpec and BattleResult in section 5 with result validation; `pendingBattle` state and `resolveBattle` command (tested with a fake interactive module in tests).
- `ui/odds.js`: odds computed by sampling the random range without touching the game RNG.
- Raiders (barbarians): camps spawn in fog, raider units attack nearby, clearing a camp gives gold.

**Check on your laptop.**

- [ ] Pointing at an enemy shows win chance and expected HP loss before you attack.
- [ ] Attacking uphill across a river is clearly worse than on open ground (the odds say so, and the result agrees on average).
- [ ] Taking a city offers Keep or Raze; capitals cannot be razed.
- [ ] A unit earns a promotion and you pick it from a short list.

**Tests that must pass.** Damage formula against hand-worked values (equal strength gives 24 to 36 HP); modifiers stack as documented; odds preview never changes `state.rng`; a fake interactive module returning a bad result is refused; capture rules; 200 AI-free scripted battles deterministic.

**Prompt**

```text
Phase 7 of the Atlas build. Read docs/PLAN.md sections 3.6 and 5 in full.

Write combat.js with the damage formula and every modifier from combat.json, ranged attacks with no return damage, city combat strength, walls and city ranged attacks, capture with Keep or Raze (capitals cannot be razed), experience, promotions from promotions.json, and healing rules.

Build the battle module interface exactly as section 5 describes: src/battles/index.js registry, src/battles/auto as an instant module, BattleSpec built by the engine with modifiers already worked out, BattleResult validation, a per-battle seed drawn once from the game RNG, the pendingBattle state and resolveBattle and autoResolveBattle commands. Test the interactive path with a fake module in test/battles.

Add ui/odds.js that estimates win chance and expected HP loss by sampling the damage range with its own throwaway RNG, never the game one, and show it whenever an enemy is pointed at with a unit selected (first tap on touch). Add raider camps and raider units with simple behaviour.

Write the phase 7 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 8: Technology and the first real AI

**Goal.** A tech tree with boosts and eras, and AI opponents that settle, build, research and fight using the same commands as you.

**Build.**

- `progression.js` for techs (civics reuse it in phase 11): costs scaled by game speed, boosts by trigger, eras, unlocks, strategic resource reveal.
- About 40 techs over 4 eras in `base-ancient`, with tree positions.
- Trees overlay (wireframe in 10.3), research choice in the advice line, boost toasts.
- `src/ai/`: controller, grand strategy (conquest, science, score for now), planners for expansion, economy, military and science, tactics with task forces and a threat map, `evaluate.js`, `recorder.js`; data files `ai/weights.json` and `ai/personalities.json`.
- AI journal screen (J) reading the recorder.

**Check on your laptop.**

- [ ] The tech tree opens with R, shows boosts, and lets you pick or queue research.
- [ ] AI factions expand to at least 4 cities by turn 80 on Standard speed.
- [ ] An AI declares war when it is clearly stronger, and its attacks happen at good odds.
- [ ] The AI journal explains each decision in a plain sentence.

**Tests that must pass.** Tech costs and boost triggers; era calculation; AI never issues a refused command over 5 seeds of 150 turns; the AI fairness poison test; AI turn under 2 s on a Large map at turn 150 in Node.

**Prompt**

```text
Phase 8 of the Atlas build. Read docs/PLAN.md sections 3.7 and 9 in full.

Write progression.js for the tech tree (written generically so civics can reuse it), with speed-scaled costs, data-driven boost triggers paying 40%, eras computed as in section 3.7, unlocks, and strategic resources revealed by techs. Add about 40 base-ancient techs over Ancient, Classical, Medieval and Renaissance with tree positions and boosts. Add the trees overlay, research suggestions on the advice line and boost toasts.

Build src/ai as section 9 describes: a controller that only reads view(state, faction) and only issues commands, grand strategy with path scores and hysteresis (conquest, science and score for now), planners for expansion, economy, military and science, tactics with task forces, a threat map and odds thresholds, all weights in rules/base-ancient/ai. Add recorder.js logging each command with a reason key and the top two alternatives, and an AI journal screen on J.

Write the phase 8 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 9: Victory, setup and saves (Playable core)

**Goal.** A complete game from setup screen to victory screen, saved and resumed safely. This is the first milestone where you can play a whole match.

**Build.**

- `src/sim/victories/`: conquest, science (3 final projects as buildable city projects), score with turn limit; victory progress panel.
- Setup screen with every option in section 6 that already has a system behind it (others shown greyed with "coming in a later phase").
- Saves: slots, rolling autosaves, export and import codes, migrations framework with a v1 fixture, size check against the 1.5 MB budget, Continue on the title screen.
- End game screen: winner, victory type, score table, seed, export.

**Check on your laptop.**

- [ ] Set up a Small map with 3 AIs on Quick speed and play to a win or loss.
- [ ] Close the tab mid-game; Continue brings you back to the same turn.
- [ ] Export a code, start a new game, import the code: you are back where you were.
- [ ] The victory panel shows how close everyone is on each path.

**Tests that must pass.** Each victory fires in a scripted scenario and not before; save round trip with fingerprints; migration fixture; save size of a 330-turn AI game under 1.5 MB; a full Small game AI-only to victory with 0 errors for 5 seeds.

**Prompt**

```text
Phase 9 of the Atlas build, the Playable core milestone. Read docs/PLAN.md sections 3.12, 6 and 8 in full.

Add src/sim/victories with conquest, science (three final-era projects built as city projects) and score with a turn limit, each a module registered by id and switched by victories.json and setup. Add a victory progress panel.

Build the setup screen with every option from section 6; options whose systems do not exist yet are shown greyed out with a note. Presets Quick, Standard and Epic at the top.

Complete src/save: named slots, three rolling autosaves, export and import codes with the ATLAS1 prefix, the migrations framework with a v1 fixture, a clear message if a save will not fit, and Continue on the title screen. Make tools/check-size.mjs generate a 330-turn AI game and fail above 1.5 MB.

Add the end game screen. Then play-test a Small Quick game end to end in Playwright with the AI on all seats, and fix anything that stops a game finishing.

Write the phase 9 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Stage 3: Version 1 systems

### Phase 10: Simulator, speed and the first tuning pass

**Goal.** Measure the game before adding more to it: the AI vs AI simulator, the keep-or-revert method, and full-length games that stay fast.

**Build.**

- `tools/sim.mjs` with every report line in section 9.7, `--challenger`, `--champion`, `--swap-seats`, JSON and Markdown output; AI version tags in `src/ai/version.js`.
- Sim moved into a Web Worker in the browser (`src/main.js` talks to it by messages), so the page never freezes during AI turns.
- Performance work to hit section 11.6 targets on a Large 8-faction map (cached pathfinding, incremental yield recalculation, chunked fog redraw).
- `docs/AI_TUNING.md` with the first baseline; dev page mini-simulation.

**Check on your laptop.**

- [ ] On a Large map with 7 AIs, AI turns take about 2 seconds or less at turn 200 (use dev page "jump turns").
- [ ] The page stays scrollable and clickable while AIs move.
- [ ] `docs/AI_TUNING.md` shows a win table by faction and victory type.

**Tests that must pass.** Worker and direct runs give identical fingerprints; simulator output reproducible for a fixed seed list; `npm run perf` meets targets; healthy ranges in 9.7 met for conquest, science and score.

**Prompt**

```text
Phase 10 of the Atlas build. Read docs/PLAN.md sections 9.7, 11.1, 11.5 and 11.6.

Build tools/sim.mjs with all the options and report lines in section 9.7, including champion against challenger with seats swapped. Tag AI versions in src/ai/version.js. Move the sim into a Web Worker in the browser so the page never freezes, and prove worker and direct runs give the same fingerprints. Profile a Large 8-faction game with tools/perf.mjs and make it meet the section 11.6 targets (cache paths, recalculate yields only for changed cities, redraw fog by chunk). Run a baseline batch and record it in docs/AI_TUNING.md; tune AI weights only in data, keeping each change only if it beats the previous version as section 9.7 requires. Add the mini-simulation to dev.html.

Write the phase 10 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 11: Culture, civics and government

**Goal.** A second tree fed by culture, with governments and policy cards that change how your empire plays.

**Build.** Civics on the shared progression code (about 25 civics), 4 governments and about 30 policy cards in `base-ancient`, `setGovernment`, `setPolicy` commands with a one-turn change cost, the Empire overlay with its Government tab, AI civics and policy planner, policy effects through the effects registry (remaining effects such as `freePolicySlot`).

**Check on your laptop.**

- [ ] Press C: the civics tree shows, with boosts like techs.
- [ ] Switching to Autocracy and slotting a military card changes numbers you can see (eg unit cost).
- [ ] AI factions change government during a game (visible in the AI journal).

**Tests that must pass.** Civic costs and boosts; slot counts per government; policy effects stack and unstack cleanly when swapped; AI never slots an invalid card.

**Prompt**

```text
Phase 11 of the Atlas build. Read docs/PLAN.md sections 3.7 and 9.3.

Add the civics tree using the generic progression code from phase 8, fed by culture, with about 25 base-ancient civics and boosts. Add governments.json (Chiefdom, Autocracy, Republic, Monarchy with military, economic and diplomatic slots) and about 30 policy cards in policies.json, all working through the effects registry (add any missing effect handlers from section 4.7). Add setGovernment and setPolicy commands. Build the Empire overlay (E) with its Government tab where you click a slot then pick from a short list. Add the AI civics and policy planner with weights in ai/weights.json. Run the simulator before and after and record it in docs/AI_TUNING.md.

Write the phase 11 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 12: Diplomacy

**Goal.** AI leaders you can read and bargain with: war and peace, deals, opinion with visible reasons, alliances and agendas.

**Build.** `diplomacy.js` with states and timers, opinion modifiers from `diplomacy.json`, agendas from leader data, war weariness, deal evaluation; commands `declareWar`, `proposeDeal`, `answerDeal`, `denounce`; diplomacy overlay (wireframe in 10.3) with "likely answer" preview; AI diplomacy planner; teams setup option switched on.

**Check on your laptop.**

- [ ] Open diplomacy with D: each leader's opinion lists its reasons.
- [ ] A deal the AI would refuse says "Likely no" before you send it.
- [ ] An AI at war and losing offers peace on its own.

**Tests that must pass.** Opinion decays as specified; peace minimum length enforced; deal values symmetric where they should be; AI answers deterministic; war weariness reduces amenities.

**Prompt**

```text
Phase 12 of the Atlas build. Read docs/PLAN.md sections 3.11 and 9.

Write diplomacy.js: states (unmet, war, peace, open borders, defensive pact, alliance) with minimum durations, named opinion modifiers from diplomacy.json that decay over time, leader agendas from leaders.json, war weariness feeding amenities, and deal evaluation the AI uses for both proposing and answering (the same function feeds the UI's likely-answer preview). Add declareWar, proposeDeal, answerDeal and denounce commands. Build the diplomacy overlay from the wireframe in section 10.3. Add the AI diplomacy planner and turn on the teams setup option. Simulator before and after, recorded in docs/AI_TUNING.md.

Write the phase 12 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 13: Religion

**Goal.** Faith, pantheons, founded religions spreading by pressure and missionaries, and a religious victory.

**Build.** `religion.js` per section 3.8, beliefs in `beliefs.json` (about 8 pantheon, 8 follower, 6 founder), `religions.json` names and colours, missionary unit and faith purchases, religious lens on the map (city followers as coloured pips), religion tab in the Empire overlay, religious victory module, AI religion planner.

**Check on your laptop.**

- [ ] Earn a pantheon, then found a religion and name it.
- [ ] The religion lens shows your faith spreading to nearby cities over turns.
- [ ] With religious victory on, an AI that leans religious visibly pursues it (AI journal).

**Tests that must pass.** Pressure maths by fixture; religion count limit; belief effects; religious victory fires exactly at the threshold; healthy ranges in 9.7 for religious wins.

**Prompt**

```text
Phase 13 of the Atlas build. Read docs/PLAN.md sections 3.8, 3.12 and 9.

Write religion.js exactly as section 3.8 describes, with every number in tuning.json: faith stock, pantheon at 25 faith, founding at 200 faith, religion limit of factions divided by 2 rounded up, pressure within 10 hexes and along trade routes, missionaries bought with faith. Add beliefs.json and religions.json for base-ancient with original text, belief effects through the effects registry, a religion map lens, the Religion tab in the Empire overlay, the religious victory module and the AI religion planner. Simulator before and after.

Write the phase 13 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 14: Trade

**Goal.** Traders link cities with routes that pay both ends, build roads, and carry religion; resources become tradeable in deals.

**Build.** `trade.js` per section 3.9 with tables in `trade.json`, trader unit, `startTradeRoute` command, route list with yields each way, automatic roads, resources in deals, Trade tab, AI trade planner.

**Check on your laptop.**

- [ ] Selecting a trader lists destinations, best first, with what each end gets.
- [ ] A road appears along the route.
- [ ] You can offer a spare luxury to an AI for gold per turn.

**Tests that must pass.** Route ranges; yields by table; route expiry after 30 turns; road building path; resource deal transfers amenities correctly.

**Prompt**

```text
Phase 14 of the Atlas build. Read docs/PLAN.md sections 3.9 and 3.11.

Write trade.js as section 3.9 describes with all tables in trade.json: trader units, startTradeRoute with land and sea ranges, 30-turn routes, yields to both ends, automatic roads along the path, and religious pressure carried along routes. Make luxury and strategic resources tradeable in deals. Add the Trade tab in the Empire overlay with destinations ranked best first and yields shown each way. Add the AI trade planner. Simulator before and after.

Write the phase 14 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 15: Espionage

**Goal.** Spies that defend your cities and run missions abroad, with odds shown before you commit.

**Build.** `espionage.js` per section 3.10, `espionage.json`, spy unit and levels, `assignSpy` and `startMission` commands, mission outcomes as events, Spies tab, identification feeding diplomacy opinion, AI espionage planner.

**Check on your laptop.**

- [ ] A spy mission shows its success chance before you start.
- [ ] Being caught spying changes that AI's opinion with a visible reason.
- [ ] AI spies appear in your cities and you get a notice when one is caught.

**Tests that must pass.** Odds formula; outcome probabilities over 10,000 seeded rolls within 1% of target; spy cap per era; mission effects.

**Prompt**

```text
Phase 15 of the Atlas build. Read docs/PLAN.md sections 3.10 and 3.11.

Write espionage.js as section 3.10 describes with espionage.json holding caps, mission lengths, odds and outcomes. Add spy units with levels, assignSpy and startMission commands, outcomes as events, an opinion modifier when identified, and the Spies tab with success odds shown before committing. Add the AI espionage planner, both offensive and defensive. Simulator before and after.

Write the phase 15 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 16: Culture victory, events and the full balance pass

**Goal.** All five victory paths live and balanced, plus events with choices, so matches feel varied.

**Build.** Influence and culture victory per section 3.12, the events system (`events.js`, about 20 events in `base-ancient` with choices), event dialog, disasters option, AI planners tuned per victory path, `ai.lateGameMode: sandbox` behaviour, simulator batches across all 5 victories and 8 factions.

**Check on your laptop.**

- [ ] Over a few games on Quick speed, you see different AI factions winning in different ways.
- [ ] Events pop up with two or three choices and their effects are clear.
- [ ] `docs/AI_TUNING.md` shows every healthy range met.

**Tests that must pass.** Culture victory threshold; events fire only when conditions hold and choices apply their effects; all section 9.7 healthy ranges over 40 games; perf targets still met.

**Prompt**

```text
Phase 16 of the Atlas build. Read docs/PLAN.md sections 3.12, 4.6 (events) and 9.

Add the culture victory module with influence from wonders, chosen buildings and policies, as section 3.12 describes. Build events.js with triggers, conditions, chance and choices running through the effects registry, about 20 original base-ancient events, an event dialog and the disasters setup option. Make the AI pursue all five victory paths and honour ai.lateGameMode sandbox. Then run simulator batches across all victories and factions and tune data until every healthy range in section 9.7 holds, keeping each change only if it beats the previous version. Record everything in docs/AI_TUNING.md.

Write the phase 16 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 17: The Witcher conversion and the full mod manager (Version 1)

**Goal.** Prove the engine is reusable: the Witcher conversion stacks on the base, mods have working options and ordering, and the full stack plays cleanly. This completes version 1.

**Build.** `rules/witcher/` as in section 4.8 with 8 factions, leaders, unique units, religions, monster raiders, events, text and a skin; mod options on the setup screen; mod manager complete (order, options, report, "Stack check" button); `docs/MODDING.md` explaining how to write a mod; Witcher art ids listed in `docs/ART_STATUS.md` with placeholders in place.

**Check on your laptop.**

- [ ] Start base-ancient plus Witcher plus lock-era (Classical) plus no-religious-victory: 0 errors, and the setup screen shows Northern Kingdoms factions only.
- [ ] Names, colours and religion names are all Witcher; nothing historical leaks through.
- [ ] Science victory and turn limit are off in that game, as the lock-era mod promises.
- [ ] The game is fully playable on placeholder art.

**Tests that must pass.** The "stack everything" loader test; a 150-turn AI-only Witcher game with 0 errors for 5 seeds; no text key falls back to base-ancient wording (a test lists any key the conversion does not override where the base text names a real-world place or people).

**Prompt**

```text
Phase 17 of the Atlas build, completing version 1. Read docs/PLAN.md sections 4.8, 4.9, 6 and 10.5.

Create rules/witcher as section 4.8 describes: remove historical factions with cascade, add Temeria, Redania, Kaedwen, Aedirn, Nilfgaard, Skellige, Kovir and the Scoia'tael with leaders, traits, agendas, unique units and buildings, the setting's religions, monster raiders and setting events, plus a skin with a grim northern palette. All text must be original wording in British English; setting names are fine, quotes from the books or games are not. Use the Northern Wars repo's data only as a source of names and facts.

Finish the mod manager and setup screen: mod options (lock-era's era picker), ordering with buttons, the full report, and a Stack check button. Write docs/MODDING.md for a hobbyist. Make sure the full stack base-ancient + witcher + lock-era + no-religious-victory loads with 0 errors and plays.

Write the phase 17 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Stage 4: After version 1

### Phase 18: Tactical battle module (Britannia style)

**Goal.** Fight your own battles with pixel soldiers on a small battlefield, while AI-only battles still auto-resolve.

**Build.** `src/battles/tactical/` adapted from Britannia's battle code (rewritten to the Atlas rules, not copied wholesale): its own sim, render and UI subfolders, a battlefield generated from the spec's centre and ring hexes, unit classes mapped to formations, `simulate` for headless runs, results mapped back to HP. Battle mode setup options switched on. A pre-battle card with Fight or Auto-resolve and the auto odds.

**Check on your laptop.**

- [ ] With "Ask each time", attacking offers Fight or Auto-resolve.
- [ ] Fighting a hill-and-forest defence feels harder than open ground, matching the auto odds roughly.
- [ ] After the battle, the map shows the right survivors and HP.

**Tests that must pass.** `simulate` deterministic; over 500 simulated battles, win rates within 10 points of auto-resolve odds for the same spec (so choosing to fight is not a cheat); result validation; strategic replay uses stored results.

**Prompt**

```text
Phase 18 of the Atlas build. Read docs/PLAN.md section 5 in full, then read github.com/accipiter117/Britannia simulation/battle and ui/battleView.js for ideas.

Build src/battles/tactical as an interactive battle module following the section 5 contract: its own sim (seeded, no DOM), render and UI subfolders, a battlefield generated from the spec's ground, unit classes mapped to formations, mount() drawing into the host element, simulate() for headless runs, and results mapped back to HP and survivors. Rewrite rather than copy Britannia's code so it follows Atlas's rules and folder boundaries. Switch on the battle mode options in setup and add the pre-battle Fight or Auto-resolve card. Calibrate so simulated outcomes stay within 10 points of the auto odds.

Write the phase 18 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 19: Killzone front-line ruleset and platoon battles

**Goal.** Show that a franchise twist is a ruleset option, not a new engine: a two-sided Killzone war with a shifting front and capturable sites, fought with your platoon battle module.

**Build.**

- Engine: a generic, optional `frontline.js` system switched on by `tuning.frontline.enabled`: two teams, tile control from -100 to 100 shifting with army presence, capturable sites (factory, power plant, refinery) with tied bonuses, settling turned off, fixed map presets loaded from data (`mapPresets.json`).
- `rules/killzone/` conversion: ISA and Helghast (more factions later), units, sites, text, skin.
- `src/battles/killzone/`: an adapter around the Killzone repo's battle sim (`createMatch`, `runToEnd`, `result.platoons[].survivors`) following section 5.5, with its own config tuning in `battle.killzone`.

**Check on your laptop.**

- [ ] A Killzone game starts with a front line across the map rather than lone settlers.
- [ ] Winning battles pushes the front; holding a factory gives its bonus.
- [ ] Fighting a battle opens the platoon battle and its result moves the front.

**Tests that must pass.** Front control maths; sites switch owners correctly; Killzone adapter deterministic via `simulate`; base-ancient games unaffected (frontline off).

**Prompt**

```text
Phase 19 of the Atlas build. Read docs/PLAN.md sections 1, 4 and 5, and the Killzone repo (github.com/accipiter117/Killzone) src/sim/match.js and battle.js.

Add an optional engine system src/sim/frontline.js, switched on only by tuning.frontline.enabled, with two teams, tile control from -100 to 100 shifting with army presence each turn, capturable sites with bonuses from data, settling disabled, and fixed maps from a new mapPresets.json content type (add its schema). Create rules/killzone as a conversion with ISA and Helghast, units, sites, original text and a skin. Build src/battles/killzone as an interactive module that adapts the Killzone battle sim as section 5.5 describes, including simulate() for headless use. base-ancient and witcher games must behave exactly as before.

Write the phase 19 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 20: Pass-and-play

**Goal.** Several humans on one laptop, taking turns, with each player's fog of war hidden from the others.

**Build.** Multiple human seats in setup, a "pass to" screen between seats that hides the map, per-seat advice and attention lists, saves that remember every seat, battle prompts only for the seat whose turn it is.

**Check on your laptop.**

- [ ] Set up 2 humans and 2 AIs; the map is hidden between turns behind a "Pass to Matthew" screen.
- [ ] Each player sees only their own fog and notices.

**Tests that must pass.** Seat switching never leaks another seat's view; a 2-human save reloads at the right seat.

**Prompt**

```text
Phase 20 of the Atlas build. Read docs/PLAN.md sections 3.14, 6 and 8.

Allow several human seats in setup. Between human turns show a full-screen pass screen that hides the map until the next player clicks Ready. Each seat gets its own advice line, needs attention list and fog of war, built from view(state, seat). Saves remember all seats and resume at the right one. Interactive battles prompt only the seat whose turn it is; battles between two humans when it is neither one's turn auto-resolve.

Write the phase 20 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 21: Phone layout and offline install

**Goal.** The same game playable on your phone in portrait and landscape, installable and working offline.

**Build.** Responsive layout: at widths under 900px the left and right panels become a bottom sheet and a slide-in attention drawer; the top bar collapses to icons with numbers; pinch zoom and two-finger pan tuned; safe-area insets; service worker caching per build and a manifest; performance pass on a mid-range phone profile (Small and Standard maps recommended on phones, shown in setup).

**Check on your phone.**

- [ ] Portrait and landscape both work; every button is easy to hit.
- [ ] Add to Home Screen, turn on flight mode, and the game still opens and plays.
- [ ] A Standard map stays smooth when panning.

**Tests that must pass.** Playwright at 390x844 and 844x390 with taps only; service worker serves the app offline in tests; no element under 44px tappable size.

**Prompt**

```text
Phase 21 of the Atlas build. Read docs/PLAN.md sections 10 and 11.

Add a phone layout for widths under 900px: the right panel becomes a bottom sheet, the attention list a slide-in drawer, the top bar collapses to icons with numbers, overlays go full screen. Tune pinch zoom and two-finger pan, respect safe-area insets, keep every target at least 44px. Add a service worker that caches per build (network first for code and data, cache first for art, the Grognards pattern) and a web manifest so the game installs and plays offline. Do a performance pass for phones and recommend Small or Standard maps on small screens in setup. Add Playwright runs at 390x844 and 844x390 using taps only.

Write the phase 21 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

### Phase 22: Online play with Supabase

**Goal.** Play-by-turn online with friends: each player takes their turn when they like, and the game stays identical on every device.

**Build.** Supabase tables `games` (setup, seats, status) and `commands` (game id, sequence number, seat, command JSON) with row-level security so only seated players can write their own commands; clients rebuild state by replaying the log and compare fingerprints; turn notifications in the app; a lobby (create, join by code, invite); AI seats run by the game's host client.

**Check on your laptop and phone.**

- [ ] Create a game on the laptop, join it on your phone with a code, and take turns between the two.
- [ ] Both devices show the same fingerprint after each turn (visible on the dev page).

**Tests that must pass.** Replay from the server log matches local state; a command from the wrong seat is refused by the database rules and by the client; reconnecting mid-game resumes correctly.

**Prompt**

```text
Phase 22 of the Atlas build. Read docs/PLAN.md sections 5.4, 8 and 9.5, and the Grognards repo (github.com/hawkeshead/travelbattle-solo) supabase folder for the pattern I already use.

Add turn-by-turn online play with Supabase: a games table and a commands table with row-level security so a player can only append commands for their own seat in sequence. Clients rebuild state by replaying the command log, compare fingerprints after every turn, and show a clear message if they ever disagree. Add a lobby to create a game, join by code and see whose turn it is. AI seats are played by the host's client and their commands are stored like anyone else's. Keep the Supabase keys in a config file that is safe to publish (anon key only).

Write the phase 22 tests in section 12, then follow the Definition of done in CLAUDE.md.
```

## 13. Draft CLAUDE.md

Commit this as `CLAUDE.md` in phase 1; it holds every standing rule plus the Definition of done that every phase prompt points to.

```markdown
# Atlas: working rules

## What this is
A Civilization-style strategy engine (hex map, cities, units, tech and civics, religion, trade,
espionage, diplomacy, five victory paths) that is reskinned and re-ruled by stacking data mods.
Fan project, non-commercial, original code, text and art only. Full plan: docs/PLAN.md.
Current phase and decisions: CHANGELOG.md and docs/DECISIONS.md.

## The owner
Matthew designs games as a hobby; he is not a programmer. He builds only through Claude Code in
the cloud and tests in a laptop browser (and later his phone) on GitHub Pages. He cannot install
anything locally. Explain decisions in gameplay terms, not jargon.

## Writing style (code comments, commit messages, docs, player text)
- British spelling, plain natural language.
- Never use em dashes or en dashes. Use round brackets or commas. tools/check-text.mjs enforces it.
- Player text lives in rules/<mod>/text/en-GB.json by key, never hard-coded in src/.

## Tech
- Vanilla JavaScript ES modules, HTML and CSS. No frameworks, no bundler, no build step,
  no runtime dependencies. Static hosting on GitHub Pages from the repo root.
- Dev-only tools: node:test, Playwright, eslint. Node 22+.

## Architecture (see docs/PLAN.md section 7 for the import table)
- src/sim is rules only: no DOM, window, timers, Date or Math.random. Runs headless in Node.
- Every player and AI action is a command object through applyCommand(state, cmd) in
  src/sim/commands.js. A game must be reproducible from seed plus command log.
- Game randomness only from the seeded RNG (mulberry32) stored in state.rng. Cosmetic randomness
  uses src/render/fxRandom.js so visuals never change outcomes.
- The AI reads only view(state, faction), uses the same commands and rules as the player, and gets
  no advantages except the labelled bonuses in difficulty.json.
- All content and every tuning number lives in rules/ as JSON. Adding a faction, unit or franchise
  must mean adding data, not editing engine code. If new content truly needs new behaviour, add a
  generic effect or system to the engine and drive it from data.
- Mods are data only. Never execute code from a mod.
- Battle modules follow the contract in docs/PLAN.md section 5. The strategic log stores results.
- All art, sound and fonts go through src/render/art/registry.js by id, with code-drawn
  placeholders, so nothing breaks while art is missing. Every sprite sheet carries credits.
- Saves: localStorage, saveVersion plus migrations in src/save/migrations.js, export and import
  as an ATLAS1 text code. Never break old saves without a migration and a fixture test.

## UI rules
- Laptop browser first, touch-safe always: nothing hover-only, targets at least 44px, every
  action reachable by click or tap, keyboard shortcuts as extras.
- One advice line saying what to do next; a needs attention list; odds shown before attacks;
  few screens; one click per decision where possible.
- Respect prefers-reduced-motion.

## AI changes
- AI tuning lives in rules/<mod>/ai/*.json.
- Keep an AI change only if it beats the previous version in tools/sim.mjs (challenger against
  champion, seats swapped, 20 games, more than 55% of decided games, healthy ranges intact).
  Otherwise revert. Record every batch in docs/AI_TUNING.md.
- Keep test batches small: 20 games per comparison unless results are close, then 40. Never
  more without asking.

## Definition of done (every phase and every change)
1. npm run check passes (boundaries, data, text, size, eslint at 0 warnings, all tests).
2. npm run smoke passes; screenshots saved to test-results/.
3. New behaviour has tests: determinism, no NaN, values in range, and the phase's listed tests.
4. CHANGELOG.md updated; any design choice not in docs/PLAN.md recorded in docs/DECISIONS.md.
5. Long commit messages explaining what changed and why. Commit and push work in progress
   during long tasks.
6. Finish by telling Matthew, in plain British English and in a short list, what he can now try
   on the GitHub Pages link and anything he should look out for.

## Never
- Copy art, text or code from the source games or other projects' assets.
- Put tuning numbers in code.
- Let the UI or AI change state except through applyCommand.
- Push with failing checks.
```

## 14. Risks and open questions

The biggest risk is size: full-length matches with every system in version 1 make this the largest of your projects, so the plan protects a playable game at phase 9 and makes every later system optional to finish.

| Risk | Why it matters here | How the plan reduces it |
| --- | --- | --- |
| Scope creep | Five victory paths, six systems and two rulesets in version 1, plus 200 mods' worth of ideas | Playable core gate at phase 9; each later system is its own phase with a hard "in version 1" list (section 2); new ideas go to `docs/DECISIONS.md` under "Later", not into the current phase |
| AI quality | Civ-style AIs are notoriously weak; a passive AI kills replayability | Per-victory planners, data weights, the simulator with keep-or-revert from phase 10, the AI journal so you can spot silly choices and report them with a save code |
| Turn speed on long games | 8 factions, Large map, 330 turns | Web Worker sim, cached paths, incremental yields, 2 s target measured in CI by `npm run perf` |
| Save size | Command logs grow with every action | Short keys, gzip, snapshot plus log, 1.5 MB budget checked by `check-size` |
| UI complexity | Civ's depth drowns a small screen in panels | Advice line, attention list, ranked short lists with reasons, few overlays; phone layout deferred to phase 21 where it gets a dedicated pass |
| Mod system complexity | Overrides, cascades and conflicts are easy to get subtly wrong | Built and fully tested in phase 2 before any content depends on it; every message type has a fixture; the report shows exactly what each mod did |
| Determinism slips | One stray `Math.random` or object key order bug breaks saves and online play | Boundary checks ban it, fingerprint tests every 10 turns, worker and direct runs compared, replay tool for bug reports |
| Art bottleneck | Asset creation is your hardest part | Placeholders are first-class, LPC for humans, art status report shows exactly what is missing, nothing blocks on art |
| Interactive battles unfairly easy or hard | Fighting yourself could become an exploit | Phase 18 test: simulated results must land within 10 points of auto-resolve odds |
| IP | Fan conversions of real franchises | Non-commercial, original text and art only, credits in every mod manifest, setting names and facts only |

**Open questions**

- [ ] **Engine name and repo.** Decided: Atlas, in the public repo `accipiter117/Atlas`, with an MIT licence.
- [ ] **Base-ancient faction list.** Rome, Greece, Egypt, Persia, Carthage, Gaul, Britons and Han are suggested; you may want Britannia's Celtic tribes or others instead.
- [ ] **Witcher faction list.** Eight are suggested; confirm whether the Scoia'tael should be a full faction or a raider type, and whether Nilfgaard should start with a bonus as the empire.
- [ ] **Diplomatic victory and World Congress.** Left out of version 1; confirm you are happy to add them after phase 17.
- [ ] **Districts.** Buildings with adjacency stand in for districts. If district placement is a big part of what you love in Civ VI, it should be planned as a phase after 17.
- [ ] **Interactive battle frequency.** On full-length games, fighting every battle yourself would take a long time. Phase 18 assumes "Ask each time" with auto-resolve as default; you may prefer "only battles with 3 or more units".
- [ ] **Hosting of user mods.** Version 1 mods ship inside the repo. Pasting or importing your own mod files in the browser (stored in localStorage) would be a small later phase if you want to share mods with friends.
- [ ] **Killzone repo direction.** Phase 19 assumes the Killzone war map moves into Atlas while the battle prototype stays its own module. Confirm, as it changes what you build in the Killzone repo meanwhile.
