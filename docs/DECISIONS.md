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

- **Nothing is tech-gated yet.** Buildings, wonders and units would normally need techs, which arrive in phase 8; until then they are gated by their other requirements (other buildings, coast or river, capital, faction, strategic resources). Phase 8 added the tech requirements.
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

## Phase 7

- **A home-made e^x.** Damage uses e^x, and browsers may compute `Math.exp` very slightly differently, which could make the same battle end differently on two machines. `src/core/mathdet.js` computes it with plain arithmetic (accurate to the last digit).
- **One exchange per attack, as in Civ VI.** Both sides usually survive; the result's winner is then "none". If both would fall, the attacker keeps 1 HP. Attacking ends the attacker's move; melee units must be next to their target (clicking a distant enemy walks your unit to the nearest hex it can attack from first).
- **Flanking** counts each other friendly fighting unit next to the defender (+2 each). The plan does not ask for Civ VI's defensive support bonus, so there is none. **Fortified** counts after two turn starts in the fortify stance. **Siege** units get +10 against cities (`combat.siegeVsCity`).
- **Cities**: strength is the best melee unit the owner could build (or its garrison, if stronger) + 3, + 5 per wall building, + 3 on hills. HP is 200 plus each building's defence (walls 100). Cities heal 20 a turn when not attacked since their last turn, and with walls shoot once a turn at range 2; city shots always use the auto module.
- **Capture**: a melee unit attacking a city at 0 HP takes it. Ranged attacks can bring a city to 0 HP but cannot take it. The garrison is destroyed, the palace goes, the city restarts at a quarter of its HP, and the new owner must choose Keep (half the people are lost) or Raze (one citizen a turn) before doing anything else. Original capitals cannot be razed. Captured civilians keep their type.
- **Experience** goes only to survivors: 5 for attacking, 3 for defending. Promotions have two tiers per class tree; the second needs either first-tier choice. Promotion bonuses reach the unit directly. `combatBonus` is worked out by the combat rules rather than the effects registry, because it depends on the opponent. Promoting does not heal.
- **Battle modules**: the setup's `battleModule` (default `auto`) is used when it can handle the fight, otherwise auto. An interactive module waits for its screen only when a human is involved and the setup's `battleMode` is not `auto`; base Atlas has no interactive module yet, so every battle resolves at once. Every result is kept in `state.battleLog`, and the per-battle seed is drawn once from the game dice.
- **Odds** sample the damage range 400 times with a throwaway generator private to `src/ui/odds.js`, so looking at odds can never change the game.
- **Raiders** are off unless the setup turns them on; New game turns them on (the plan's default). Camps appear from turn 6, every 10 turns, on land no player can see, at least 6 hexes from any city, up to one per 250 land hexes. Each camp sends out a raider every 6 turns while fewer than 2 are nearby (warriors, archers from turn 40, horsemen from turn 80). Raiders go for anything within 4 hexes, never take cities (a city they batter stays at 1 HP), have no fog of war, and act at the end of each round. Clearing an empty camp pays 30 gold. Raging halves the waits and doubles the camps.
- **What you see of an enemy unit** now includes whether it is fortified and its promotions, because the odds would otherwise be wrong.
- **`?debug=1`** adds developer cheats to the game (placing a unit, setting experience), like the plan's dev page. They edit the state outside the rules, so they exist only with that address; the browser tests use them to set up a fight.
- **Rival factions still do not attack**; they will once the real AI arrives in phase 8. Only raiders fight back for now.

## Phase 8

- **Wars are minimal until diplomacy (phase 12).** Every pair of factions starts at peace; one command declares war, and nothing ends one yet. You cannot attack someone you are at peace with; the odds panel offers Declare war instead. Raiders are at war with everyone.
- **Foreign cities block movement.** No unit may stop in or pass through another faction's city; the only way in is to capture it.
- **Raiders take civilians.** A raider moving onto a hex with only builders or settlers removes them (it never takes them home), so lone settlers need escorts.
- **Citizens yield a little science and culture** (`tuning.cities.perCitizen`). Without it, research crawled at one tech every 25 turns.
- **Boosts are counted from events.** Each faction keeps counters (farms built, scouts trained, units killed and so on); when a counter reaches a tech's trigger, 40% of its cost is paid once. Kills count for the killer.
- **Era** is the latest era in which you know at least half the techs. Later start eras grant every tech of the eras before (`tuning.start.grantErasBefore`).
- **The AI's memory lives outside the game state**, so saves stay small and the AI cannot sneak information past its view. It is rebuilt from nothing after loading, which costs it only its journal and remembered city sites.
- **AI war and attack thresholds** are data in `rules/base-ancient/ai/weights.json`: it declares war when its army is clearly larger than what it can see of yours, and attacks only when the win chance and the damage ratio are both good enough. It never founds a city until it has seen the hexes around the site.
- **Known leak:** a rival's city on a hex you explored earlier shows in your view even if it was founded after you last saw the hex. The AI's view has the same leak, so it is fair, but it will be fixed with the save format in phase 9.
- **Content order:** `tools/gen/base-ancient-content.py` runs first, then `tools/gen/base-ancient-techs.py`, which adds tech requirements to the content.
- **The Civics tab** is in the tree screen already but disabled until phase 11.

## Phase 9

- **Science projects are wonder entries with `project: true`** (the schema already allowed it). Each faction builds each project once, in any city; they are not stored as buildings, cannot be bought, and other cities of the same faction building one get their production back as gold. A new `requires.projects` lets Voyage Beyond need the other two. Their techs: Scientific Method, Cartography and Navigation.
- **Conquest** counts each faction's very first city (now remembered with `foundedBy`, so a faction refounding after losing everything does not get a second original capital). Nobody wins by conquest while a living rival has yet to found its capital. The last faction standing also wins by conquest.
- **Knock-outs**: a faction with no cities and no settler leaves at the end of the round. Rule tests whose maps have no cities by design switch this off with `setup.elimination: false`.
- **Score** adds citizens, cities, techs, wonders, buildings and projects, weighted by `tuning.score`. Ties go to the earlier seat.
- **Turn limits** by speed live in `tuning.victory.turnLimits`. A mod setting the score victory's `turnLimit` to null (lock-era) means no limit.
- **Victories are checked only at the end of a round** (section 3.14), so taking the last capital mid-round wins when the round ends. A won game refuses every command (`gameOver`); "one more turn" can come later.
- **The size budget test lives in `tools/check-size.mjs`**, not the unit tests, so the 330-turn game is played once per check. `npm run check` plays a Small 4-faction game (about 45 seconds); CI also runs `--full`, the Large 8-faction game the budget is about (about 6 minutes until phase 10's speed work). Measured: 44 KB and 132 KB against 1,500 KB.
- **Phase 8's 150-turn AI test** became the phase 9 "full game to a victory" test (Quick speed, so up to 220 turns), which covers it.
- **The AI's memory is saved as its journal only.** Remembered city sites and the like are rebuilt after loading; the journal travels with slots and autosaves (not with export codes, to keep them short).
- **Saving belongs to the app, not the game screen**: the game screen hands over a snapshot (state, log, journal) and the app writes it to browser storage. If the browser blocks storage (some private windows) saves last until the tab closes.
- **Difficulty** stays at Prince (no bonuses either way) and is greyed on the setup screen; the plan gives no phase for `difficulty.json`, so it is noted for the phase 10 tuning work. Teams, events, disasters, conversions and the other battle modes are greyed with the phase they arrive in.
- **Settings** (not in any phase of the plan) is a small screen: motion and developer mode, kept in `atlas:settings`.
- **`?faction=<id>` in the address still skips setup** with a quick default game (used by the browser tests); `?debug=1` adds `autoplay`, which lets an AI play your seat (the full-game browser test).
- **The city visibility leak noted in phase 8 is still open.** Fixing it means remembering what each faction last saw of each city, which changes the state shape; it waits for the next save version, with a migration.

## Phase 10

- **Speed without changing the game.** Pathfinding builds one table of who stands where per search (`occupancy`), and `applyCommand` shares the map layers that never change after generation (terrain, hills, features, resources, rivers) between the old and new state. Every timed game keeps its exact fingerprint. Nothing in the rules may write to those layers after map generation.
- **The Web Worker plays only the computer seats.** Your own commands still apply on the page straight away (so clicks feel instant); when you end your turn the state goes to the worker and comes back with the rivals' commands for the save log, the events and the AI journals. If a browser cannot start a module worker (or with `?worker=off`), the same code runs on the page. The AI's memory lives in the worker; the page keeps the journals for the J screen and saves.
- **AI versions are data patches.** A challenger is `rules-dev/ai/<tag>.json`, merged over the AI weights for its seats only; the game's rules are never patched. `src/ai/version.js` names the champion. Batch results (every game) are kept in `docs/sim/`.
- **Conquest is still under 5% of wins**, the one healthy range not met; every attempt so far lost its head-to-head batch. `docs/AI_TUNING.md` lists what was tried and the next ideas (diplomacy in phase 12 first).
- **Difficulty** (section 9.5) is `difficulty.json`: eight levels, Prince the default with no bonuses. Above Prince the AI gets percentage bonuses on production, science, culture and gold and extra starting units; below it you get the percentage bonuses. They work through the ordinary effects system (source "difficulty") and each level's summary is shown on the setup screen. The plan's "below Prince the AI also plays less sharply" is not done yet.
- **The size and speed checks run in CI**: `check-size --full` (the Large 330-turn save) and `npm run perf` (Large rounds at turn 200). Locally, `npm run check` keeps the faster Small save check.
- **Persia** won half the baseline games; with the ai-v2 AI it wins about a third (within range), so its trait (every land unit moves one hex further) is unchanged for now. Faction balance is phase 16's job.

## Phase 11

- **Changes take a turn.** The plan asks for "a one-turn change cost". A new government or card is pending and becomes active at the start of your next turn; changing from one government to another also means anarchy until then (no government and no cards). Adopting your first government has no anarchy. This keeps the rule easy to explain and needs no gold costs.
- **Cards come with you** when you change government, as far as they fit the new slots (wildcards first take nothing extra). At the start of each turn cards that no longer fit (a lost palace, say) drop out.
- **The palace gives one wildcard slot** to every faction (`freePolicySlot`). Slots from a policy card itself are ignored, so a card can never make room for itself.
- **Diplomatic cards** have no diplomacy to act on until phase 12, so the four in base-ancient give culture, gold and amenities for now.
- **Governments were rebalanced after the first AI trial**, where every AI chose Republic: Autocracy gained a wildcard slot and 10% cheaper land units, and Monarchy has two military and two economic slots (it had three military). Both Republic and Autocracy are now chosen.
- **Everyone's government is public** in each player's view (as in the board game); cards and research are not.
- **The Empire overlay** has only its Government tab for now; religion, trade routes, spies and the city list join it in later phases.
- **Content order:** `tools/gen/base-ancient-civics.py` runs after the techs script (it also gives the palace its slot).
- **The AI version is now ai-v6** (the civics and policy planner). This was not a head-to-head test, because the rules changed underneath; `docs/AI_TUNING.md` compares the same 40 seeds before and after.

## Phase 12

- **One treaty per pair**, on a ladder: open borders, then defensive pact, then alliance (each includes the ones below). Treaties last 30 turns (`tuning.diplomacy.treatyTurns`); war or denouncing ends them. Teams are a permanent alliance.
- **Open borders has no movement rule yet.** Units of factions at peace could already walk through each other's land (only cities block), so open borders currently means opinion and, from phase 14, trade routes. Keeping units out of closed borders would change every path the AI plans; it can come later if it proves needed.
- **Surprise wars:** declaring war without having denounced that faction in the last 20 turns is a surprise war, which everyone who has met you remembers. The AI denounces first and waits 3 turns (`military.warnBeforeWar`).
- **Offers are answered on the other side's turn**, so every change still goes through a command in order (saves and replays stay exact). Unanswered offers lapse at the start of the proposer's next turn.
- **One value function for everything:** `evaluateDeal` is how the AI answers, how it decides what to propose, and the screen's likely answer (which uses what you can see, hence "likely"). Gold and gold per turn are worth exactly the same to both sides; opinion adds a fixed amount per point; on deals that include peace, opinion counts for only a quarter, so a losing side takes peace even from someone it hates.
- **Opinions are a public rule output.** Each view carries the opinions between the viewer and everyone they have met, worked out by the rules from the whole game (as diplomatic modifiers are in the board game), and who is at war with whom, who has met whom, treaties and war weariness are public. Rivals' treasuries stay hidden; a deal's gold is checked when it is made.
- **War weariness** grows by 1 a turn per war, 2 per unit lost and 5 per city lost, eases by 3 a turn at peace, and costs 1 amenity in every city per 10 points (at most 3).
- **Traded resources are copies:** the receiver gains access for 30 turns and the giver keeps its own.
- **D opens diplomacy** (section 10.1), so it no longer pans the map; arrow keys and W, A, S still do.
- **The AI version is now ai-v7.** As in phase 11, a rules change, so `docs/AI_TUNING.md` compares the same 40 seeds before and after.

## Phase 13

- **Followers are citizens.** Each city records how many of its people follow each religion; the rest follow none. A city's religion is the one with the most followers (a tie is none). New citizens follow nothing; people lost leave the biggest group first.
- **Pressure and conversion:** at the end of each round every city whose people mostly follow a religion presses it on every city within 10 hexes, itself included: 1 plus a quarter per follower, doubled in the holy city, plus `religiousPressure` effects. When a city's pressure for a religion reaches 30, one citizen converts (people of no religion first, then from the biggest other group), and the rest carries over. Trade routes will carry pressure from phase 14.
- **Founding needs a holy city**: one of your cities with a shrine or temple (the plan's "faith from shrines and temples"). Founding converts the holy city at once.
- **Names:** you pick one of the eight religions (its colour and default name) and may give it your own name, up to 30 letters.
- **Founder beliefs** that pay per follower city (Tithe, Pilgrimage, Scripture, Church Unity) pay into your holy city, or your capital if the holy city is lost.
- **Faith costs scale with game speed**, like every other cost (25 and 200 faith at Standard). Missionaries cost 80 faith and convert 2 people per use, 3 uses; they can only be bought, never built.
- **Pantheons, religions and each city's followers are public** in every view (the lens shows them for cities you have seen).
- **The religious victory** counts only living factions that have cities, needs strictly more than half of each faction's cities, and only a founder can win it.
- **Two leaders lean religious** (Hatshepsut and Boudica), so the religious path is tried; without them no AI founded a religion in trial games.
- **L toggles the religion lens.** Its pips sit above the city banner so units in the city do not hide them.

## Phase 14

- **The trader becomes the route.** It leaves the map while the route runs (it cannot be attacked on the way) and comes back to its home city when the route ends, ready to be sent again. A city can start at most 3 routes (`tuning.trade.routesPerCity`), never two to the same city.
- **Land first:** a route goes by land when a land path of 15 hexes or fewer exists (ignoring units), otherwise by sea when both cities touch water and a water path of 30 or fewer exists. Roads are laid along land routes the moment they start.
- **Destinations:** any of your cities, or a city of a faction you have met and are not at war with. War with the destination's owner ends the route at your next turn.
- **perResource** in `trade.json` counts the kinds of improved luxury and strategic resource the destination city works.
- **Religion along routes:** each end of a route presses its majority religion on the other at full strength (`tuning.trade.religiousPressureShare`), however far apart they are.
- **Resource deals now transfer** (the plan's "resource deal transfers amenities"): this changes the phase 12 rule, where the giver kept its own copy. The giver keeps the resource only if it works another copy; the AI's price for giving reflects that (`dealValues.spareShare` and `lastShare`).
- **The traders' routes shown to you** are your own and those ending in your cities.

## Phase 15

- **Spies are built, then posted.** A spy is a unit until you assign it to a city you know; then it leaves the map. In your own city it defends (each defender takes 15 plus 5 per level off rivals' odds there); in a rival's city it runs missions. Moving between cities is instant, but a spy on a mission must finish first.
- **Unlocked by Recorded History** (the plan says "a civic"), capped at 1 plus your era index; the cap counts spy units and posted spies together.
- **Odds** are fixed when the mission starts and shown before you commit. The result is one roll of the game's seeded dice when the mission ends: under the odds it succeeds (a quarter of successes are recognised), otherwise it fails (half the failures are caught and the spy lost; the rest escape home to your capital).
- **Mission actions are engine code chosen by data** (`action` in `espionage.json`: intel, siphon, boost, sabotage, unrest), with their numbers in data, as with the five victory modules.
- **Rival spies are hidden.** You learn of them only when one is caught or recognised in your city.
- **Intel** lasts 20 turns and is shown in the Spies tab; the land around the city stays explored on your map.

## Phase 16

- **Influence** comes from wonders (`tuning.culture.influencePerWonder`, 3 each), buildings with an `influence` value and active policy cards with one; it builds up every turn. The culture victory needs at least `minInfluence` (100) and more influence than every living rival's lifetime culture (all culture ever earned, which now counts on each faction).
- **Events happen at the start of your turn**, at most one at a time and no closer than 10 turns apart (`tuning.events.minGap`). Each event's chance is multiplied by the setup's frequency (Occasional 1, Frequent 2). Games without an events setting (older saves) have none.
- **You must answer an event before ending the turn**, as with a captured city. The dialog can be closed to look at the map; the advice line reopens it.
- **Effects of a choice** last their `turns` in that city (default 10); `popChange` and `freeUnit` happen at once; a city never drops below one citizen; an effect with a `chance` rolls the game dice.
- **Rome's trait** (Trajan's Column) now gives +1 production in every city: a balance change, as Rome won none of 60 simulated games.
- **Conquest is still under 5%** of simulated wins; see `docs/AI_TUNING.md`.

## Later

- Nothing yet.
