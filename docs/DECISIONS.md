# Decisions

Design and build choices not spelt out in `docs/PLAN.md`, with the reason for each. Ideas for after version 1 go under "Later".

## Phase 1

- **Built before the GitHub repo existed.** Phase 1 was built in a Claude Code container with its own git history, then pushed to `accipiter117/Atlas` once the repo was created.
- **Temporary test bench behind New game.** The plan's phase 1 only needs a title screen, but a small screen that starts a game and ends turns lets you see the engine working in the browser. It is replaced by the real setup screen and map in later phases.
- **Player text sits in `index.html` for now.** CLAUDE.md says player text lives in `rules/<mod>/text/en-GB.json`; that needs the data loader from phase 2. Until then the few words on screen live in the HTML (never in `src/`), and phase 2 moves them.
- **Short command keys in saves wait for phase 4.** Section 8.2 maps commands to short keys (`{t: "mv"}`). With only `endTurn` there is nothing worth shortening, so the key table arrives with movement commands.
- **Both gzip backends, one interface.** Node 22 also has the browser's CompressionStream, so `createCodec` offers both backends and the tests prove each reads the other's saves. The browser one is the default everywhere.
- **The New game seed uses `crypto.getRandomValues`.** Only the seed is random; every roll after it comes from the seeded generator. `Math.random` stays banned in the sim, AI, render and UI layers.
- **`src/core` files may import each other** (for example `rng.js` uses `hash.js` for named forks). Section 7 says core imports "nothing", which was read as "nothing outside core".
- **The dash ban covers the whole repo**, including tools, tests and config, not only the folders listed in section 11.3. It is simpler to never have them.
- **A tiny built-in static server (`tools/serve.mjs`)** replaces `http-server`, keeping dev dependencies to eslint and Playwright.
- **`@playwright/test` is pinned to 1.63.0** to match the browser pre-installed in Claude Code's cloud container; CI installs its own Chromium.
- **The touch smoke run uses an 820x1180 tablet with mobile emulation**, which is what makes Playwright refuse hover and use real taps.
- **PLAN.md is a Markdown export of the Claude Docs plan.** Its two diagrams (module boundaries, roadmap) export as placeholders; the tables and text carry the same information.

## Phase 2

- **Engine text lives in `text/engine.en-GB.json`.** The report and Mods screen need words even when no mod loads (for example "No ruleset is ticked"), so they cannot live inside `base-ancient`. Report messages are stored as codes with parameters and worded from this file. Fixed screen labels stay as HTML markup.
- **Editing a content type nothing defines yet is a warning, not an error.** Section 4.3 makes `change` on a missing id an error, but lock-era edits techs, civics and wonders before any exist, and the plan expects warnings there. So: an edit aimed at a whole content type no loaded mod defines gives a warning ("no loaded mod defines techs yet"); an edit aimed at a missing id in a type that exists is still an error. References into a type nobody defines are warnings for the same reason.
- **Three cascade rules, set per reference in the schemas.** "remove" drops whatever needed the removed entry (a unit requiring a removed tech, a tech requiring a removed tech, a leader of a removed faction); "prune" takes it out of a list (a faction's unique units, a resource's valid terrain); "clear" drops an optional link (a unit's upgradesTo, a faction's city names). Inside effects, an effect pointing at a removed entry is dropped from its list.
- **Options are substituted as each mod loads**, not after all mods (section 4.4 step 6), because `where` selectors such as `"$opt:era.index"` need their values at the moment they run.
- **"Last one wins" warns only when two or more mods besides the ruleset write the same field.** A conversion overriding the base game's text or numbers is the point of a conversion, not a clash.
- **Tuning `set` paths must already exist**, so a misspelt setting is an error rather than a silent new key. Only the ruleset may define tuning wholesale (`values`).
- **base-ancient has a few more files than the phase 2 list**: eras (units have an era, and lock-era's option reads them), unit classes (units refer to them), leaders and city names (factions refer to them) and victories (so no-religious-victory has something to switch off).
- **Combat and amenity numbers sit in `tuning.json`** (under `combat` and `amenities`) rather than separate `combat.json` and `amenities.json` files mentioned in section 3, keeping every global number in one place.
- **Resources do not name a revealing tech or improvement yet**; those fields return when techs (phase 8) and improvements (phase 6) exist, so base-ancient loads with zero warnings.
- **Egypt's test leader is Hatshepsut.** Rome and Egypt are placeholder test factions; the final base-ancient faction list is still an open question in the plan.
- **lock-era lists a text file** for its option label, as well as `rules.json`.
- **Test mods are flagged `dev`** in `rules/index.json` and shown as "Test mod" on the Mods screen. They can be hidden from players later.
- **`buildCharge` is not an effect.** The plan's legionary example uses it, but it is not in the 24-effect vocabulary of section 4.7, so the loader refuses it. If wanted, it should be added to the vocabulary when builders arrive (phase 6).

## Phase 3

- **Map layout.** Tiles are stored row by row (index `r * width + c`, where column `c = q + floor(r / 2)`), which makes the map a rectangle on screen. Section 3.1 writes `r * width + q`; this is the same idea adjusted so rows line up. The map does not wrap east to west.
- **Climate settings live in the data.** Terrain gets a `mapgen` block (its role: land, mountain, coast, ocean or lake, plus a temperature and moisture point) and features get a `mapgen` block (chance and climate window). The generator never names "grassland" or "forest", so a conversion can bring its own terrain and the generator uses it.
- **Start spacing is set per map size** in `mapSizes.json` (`startSpacing`: 7, 8, 9, 10) rather than in `tuning.json`, because the plan's "9 hexes apart on Large" depends on the size. Other generator numbers (resource density, river lengths, lake size, sea level and world age effects, start food rule) are in `tuning.json` under `mapgen`.
- **Only basic arithmetic in generation.** Noise and shaping use `+ - * /`, `floor` and `sqrt`, which every browser computes identically; functions like `sin` may differ slightly between browsers and would break "same seed, same map" across devices.
- **Fresh water means a river or a lake.** Oases do not count yet.
- **Rivers can join other rivers.** A river that meets an existing river ends there and shares its mouth. River sources are spread apart first, so fresh water is not bunched on one side of the map.
- **Sea lanes.** If a start cannot reach the others by land or coast, the shortest stretch of ocean between them becomes coast, so no player is stranded before ships exist.
- **Start fallback order.** Starts first must meet the food and water rule at full spacing; if the best-first pick cannot fit them, a spread-out pick is tried; only then does spacing relax by one hex at a time, and only after that the food and water rule. In 300 test maps (Large and Huge, every type) spacing never needed relaxing.
- **Islands get 16 rivers** (up from 8) so island starts have fresh water.
- **Pixel art at three times scale.** Terrain is drawn at 14 pixels from hex centre to corner, then scaled up three times with smoothing off: crisp pixels, a 72px-wide hex at 100% zoom (section 10.6), and small cached chunks. Hexes are filled as whole pixel rows so no dark seams show between them.
- **The map viewer is linked from the title screen** for now; the plan's Settings "developer mode" switch arrives with Settings in phase 9.
- **The frame-time test measures the JavaScript side of drawing**, not the graphics card, which a browser does not expose; it catches slow code rather than proving the frame rate.

## Phase 4

- **`applyCommand(state, cmd, ruleset)`.** Moving needs the rules (terrain costs, unit classes), so the merged ruleset is passed in as a third argument. The state already records which ruleset it was made with (`rulesetHash`).
- **Every other faction counts as an enemy** for zone of control and stacking until diplomacy (phase 12) adds war and peace.
- **Movement costs add up**: hills add 1 and a feature adds its extra cost, so forest on hills costs 3 (as in Civ VI). Zone of control applies to civilians too.
- **Paths are planned on what you know.** A* uses only explored tiles and only enemies you can see. The walk itself checks the real world step by step, so a hidden enemy or a newly seen zone of control stops the unit, and it never ends on a tile it cannot share.
- **Units carry on walking.** A destination more than one turn away is remembered, and the unit continues at the start of each of its turns.
- **Fog is drawn from the view, not covered up.** Unexplored terrain is never drawn at all (each map chunk redraws when new tiles are explored); explored tiles get a grey wash.
- **Mouse and touch.** With the mouse, pointing previews the path and a click moves (right-click also moves). On touch, the first tap previews and a second tap on the same hex moves. Tapping a hex with your own units selects them (tap again to cycle), unless the selected unit could share that hex, in which case it moves there.
- **Keys.** The plan lists S as both "skip" and part of WASD panning. S skips when a unit is selected and pans otherwise. Z sleeps; Delete disbands (press twice, as with the button).
- **Next button.** While units need orders it reads "Next unit" and selects the next one; Skip or Sleep a unit to clear it. It reads "Next turn" when nothing is waiting.
- **New game, for now**: a Small Continents map, you plus three computer rivals, a random seed (add `?seed=42` to the address for a repeatable game). The setup screen arrives in phase 9. The phase 1 test bench is gone.
- **Fortify** counts turns now; its +4 defence arrives with combat in phase 7. **Sleeping** units stay asleep until woken; waking when an enemy appears comes later.
- **The LPC test sheet** is composed from body, head, trousers, chainmail and helmet layers of the Universal LPC Spritesheet Character Generator, arranged in the classic LPC layout the plan describes (the generator now ships one file per animation). It is used under OGA-BY 3.0, the licence all five layers share; full credits are in `assets/sprites/lpc-test-warrior.CREDITS.md`. Only the warrior has art; other units show a faction-coloured shield with their initial.
- **Seat colours** come from `seatColours` in the base skin until factions are chosen on the setup screen.

## Phase 5

- **Every player plays a faction from the ruleset** (for city names, traits and later unique units): your choice once the setup screen exists, until then drawn from the seed, with no repeats until every faction is taken. base-ancient has only two test factions, so with four players two pairs share a faction; they share its name list but never a city name.
- **Every city makes 1 culture** (`cities.baseCulture`), so borders grow before any culture building exists. The city centre always yields at least 2 food and 1 production (`cities.centreMinimum`), and hills add 1 production (`yields.hillsProduction`), as in Civ VI.
- **Gold has income only for now.** Unit upkeep and running out of gold arrive with the economy in phase 6. Science, culture and faith collect in your stocks and start being spent in phases 8, 11 and 13.
- **Buying** costs 2 gold per point of production still missing (`economy.goldPerProduction`), and the item appears at once.
- **Settlers do not cost population**; the plan does not ask for it.
- **Citizens** go on locked tiles first, then the best tiles for the focus (weights in `focuses.json`). If that would starve the city, food is weighted up until it does not, where the land allows. Locking more tiles than the city has citizens releases the oldest lock. Citizens with no tile to work produce nothing until specialists arrive in phase 6.
- **Sight**: a city sees 2 hexes around itself, and you always see all your own land.
- **The river growth bonus** applies to a city with a river along any edge of its own hex.
- **Advice and focuses are data.** Two content types were added: `focuses` and `advice`. The engine knows a small set of conditions it can check (no cities yet, nothing being built, starving, units need orders, ready to end); which advice shows, in what order and in what words is in `rules/base-ancient/ui/advice.json` and its text, so a conversion can reword or reorder it.
- **What blocks the turn**, in order: a city with nothing to build, then units needing orders. At the start of your turn a city with nothing to build opens by itself.
- **The build list's ranking and reasons** come from each unit's role (founder, worker, recon, ranged, anti-cavalry, naval, melee), not its name, so they work for any ruleset. Units needing a tech, civic, building or strategic resource stay hidden until those systems exist.
- **Tapping in the city drawer**: a hex in the city's land locks or unlocks a citizen there; a hex with a price asks once and buys on the second tap; tapping the city itself closes the drawer.
- **The computer players** follow simple rules until the real AI in phase 8: found where allowed or walk to the best site within six hexes, build settlers while they have fewer than four cities, keep a warrior per city, fortify or sleep everything else.

## Phase 6

- **Nothing is tech-gated yet.** Buildings, wonders and units would normally need techs, which arrive in phase 8; until then they are gated by their other requirements (other buildings, coast or river, capital, faction, strategic resources). Phase 8 adds the tech requirements.
- **A free upkeep allowance.** With upkeep on, a new faction (no city, a warrior costing 1 gold) went broke on turn 1. Units now get a free allowance of 2 gold plus 1 per city (`economy.freeUpkeep`, `freeUpkeepPerCity`), and everyone starts with 10 gold (`economy.startingGold`).
- **Bankruptcy.** Gold never stays below zero: when it would, one unit with upkeep is chosen by the seeded dice, disbands, and gold is set to zero. A warning event fires (and the advice line speaks) when gold will run out within 2 turns.
- **Amenities.** A city needs 1 amenity per 2 citizens, rounded down. Luxuries count only once improved (a plantation on wine), each kind going to up to 4 cities, unhappiest first. The thresholds live in `tuning.json` rather than a separate `amenities.json`. Unhappiness cuts every yield except the food citizens eat; rebel units are left for later.
- **Specialists** give 2 of their yield each (`specialists.yield`); citizens take a specialist slot whenever it beats the best free tile for the city's focus.
- **The palace** is given free to the capital (`cities.capitalBuilding`).
- **Unique buildings count as the original** for prerequisites (Egypt's mortuary temple satisfies "needs a monument"), and a faction never sees the building its unique one replaces.
- **Wonders** cannot be bought. Only the wonder a city was working on refunds its production; one waiting further down a queue is simply removed.
- **Effect scopes**: traits reach every city by default and buildings only their own city; `capital`, `withBuilding:<id>` (Han's Silk Road) and `capturedCities` are also understood. `moveBonus` and `sightBonus` gained an optional `domain` (land or sea). `costPercent` targets an item id, a unit class or tag, or `units`, `buildings`, `wonders`, `landUnits`, `seaUnits`. Effects on a building that grant units or buildings fire when it is built; on a trait, when each city is founded.
- **Builders** improve only their own faction's land (roads go anywhere on land), build fishing boats from the shore, may mine an iron hex without hills because the iron names the mine, and use all their moves doing it. Resources now name their improvement and improved yields; deer was added so camps have something to improve.
- **Healing** (section 3.5) is in now: units that did not act heal 10, 15 or 20 depending on where they rest, plus healBonus effects.
- **Picking a faction.** The plan puts the faction card on the setup screen (phase 9); until then New game opens a faction picker, and `?faction=rome` in the address skips it.
- **The eight factions** follow the plan's suggested set. Leaders: Trajan, Pericles, Hatshepsut, Cyrus, Dido, Ambiorix, Boudica and Emperor Wu. Agendas are stored now and used by diplomacy in phase 12. City names are real historical places (facts); every description is original.
- **The content is generated** by `tools/gen/base-ancient-content.py`, which keeps ids, text keys and references in step; either the script or the JSON can be edited afterwards.
- **`buildCharge`** is still not an effect; legionaries do not build forts. The fort exists as a normal builder improvement.

## Later

- Nothing yet.
