# Changelog

## Phase 11: Culture, civics and government

What you can try: press C (or tap the culture figure in the top bar) for the Civics tree, which culture fills just as science fills the techs, with boosts and queueing. Code of Laws unlocks Chiefdom; press E (or Empire) and adopt it, then tap a slot and pick a card from the short list. Political Philosophy brings Autocracy and Republic, Divine Right brings Monarchy. Changes take effect at the start of your next turn, and switching from one government to another means one turn of anarchy (no government or cards), so choose with care. Try Autocracy with Agoge in a military slot: a warrior's cost drops by 40% from your next turn. The advice line now suggests a civic, a government to adopt and empty slots to fill. In the AI journal (J) you can watch rivals study civics, adopt governments and slot cards.

- 25 civics, 4 governments (Chiefdom, Autocracy, Republic, Monarchy) and 32 policy cards in base-ancient, all as data, all working through the effects registry.
- Two new effects: `freePolicySlot` (the palace now gives every faction one wildcard slot) and `borderGrowthPercent` (Frontier Grants grows borders 50% faster).
- Commands `setGovernment` and `setPolicy`; a starting era now grants earlier civics too, and lock-era removes later ones.
- The Empire overlay (E) with its Government tab.
- The AI's civics and policy planner: civics ranked like techs, cards valued by what their effects add to the empire as it is, governments chosen by their best possible layout, with a margin before switching. Science victories rose from 10% to 43% of AI games (see `docs/AI_TUNING.md`).
- Tests: 185 unit tests (civic costs and boosts, slot counts, one-turn changes and anarchy, card effects stacking and coming off cleanly, the AI never slotting an invalid card) and 39 browser tests (the civics tree, adopting Autocracy and seeing a unit's cost fall).

## Phase 10: Simulator, speed and the first tuning pass

What you can try: start a Standard game (a Large map with 7 rivals) and end a turn. The rivals now move in the background ("Rivals are moving..." in the advice line) while you can still pan the map, and their turns are 4 to 5 times quicker than before. The setup screen's Difficulty now works, from Settler to Deity, and shows exactly what each level gives (Emperor: AI +20% production, science, culture and gold; +1 settler, +1 warrior). On the developer page (Settings, Developer mode, then the map viewer link) open Simulation tools: Mini-simulation plays AI-only games and shows who won and how; Jump turns plays to any turn and shows how long each of the last rounds took. `docs/AI_TUNING.md` has the win tables by faction and victory type.

- Speed: pathfinding no longer scans every unit on the map for every hex it considers, and each move no longer copies the map layers that never change. Games play exactly as before (same fingerprints). A Large 8-faction round at turn 200 takes about 0.2 s in Node and under 0.3 s in Chromium.
- The rivals play in a Web Worker, with the same code as the page, and a test proves both give exactly the same game.
- `npm run sim`: the AI against AI simulator, in parallel threads, with challenger against champion and seats swapped. `npm run perf` times Large rounds at turn 200. `npm run replay` rebuilds an exported save and names the first refused command.
- AI tuning, kept only when the new version beats the old: rivals may now fight two wars at once (wars never end until diplomacy), and armies on the conquest path head for capitals. Three other versions lost their head-to-head batches and were reverted; all are recorded in `docs/AI_TUNING.md`.
- Difficulty levels in `difficulty.json`, the only advantages anyone gets.
- Tests: 176 unit tests (worker against direct play, the simulator's repeatability and seat swapping, difficulty) and 36 browser tests (the worker in Chromium, the page drawing frames while rivals move, the developer tools).

## Phase 9: Victory, setup and saves (the playable core)

What you can try: press New game and you get the setup screen. Pick the Quick preset (a Small map, 3 rivals, Quick speed) or set every option yourself: map type, size, sea level, resources, world age, seed, your faction (or See the cards), each rival's faction, which victories count, the turn limit, game speed, starting era, raiders, fog of war, the AI journal and autosave. Options whose systems come later are shown greyed with the phase they arrive in. Play, and the game autosaves at the start of each of your turns. Menu saves to a named slot, exports a code (copy or download) and takes you back to the title, where Continue picks up your latest save; Load lists every save and autosave (load, export or delete), and Import code takes a pasted code or a .txt file. Press V (or Victory) to see how close everyone is to each victory. When someone wins (or you are knocked out) the end screen shows the winner, the victory, a score table, the world seed and an export button.

- Victories: conquest (hold every original capital), science (finish the Great Observatory, Atlas of the World and Voyage Beyond) and score (highest score at the turn limit: 220 turns at Quick, 330 at Standard). Checked at the end of each round; a won game accepts no more moves.
- Factions with no cities and no settler are knocked out at the end of a round.
- Saves: named slots, three rolling autosaves, short command keys, gzip, a clear message and an export code when a save will not fit, mod checks on loading, and replay from the seed.
- A small Settings screen: motion (follow my device, reduce, full) and developer mode (shows the map viewer link).
- Tests: 169 unit tests (victories in scripted scenarios and not before, saves, the v1 migration fixture, and five full Small Quick AI games played to a win with no refused commands) and 34 browser tests, including a whole Small Quick game played to the end screen. The size check plays a 330-turn game and saves it: 44 KB for a Small game, 132 KB for a Large 8-faction game, against a 1,500 KB budget.

## Phase 8: Technology and the first real AI

What you can try: start a game and press R (or tap the science figure in the top bar) to open the technology tree. Pick a tech to research it now; press Queue path on a locked one and every tech needed to reach it is queued in order. Each tech shows its turns, what it unlocks and its boost (for example, founding a second city pays 40% of Writing at once); a toast tells you when a boost lands. The top bar now shows your era and what you are researching, and the advice line reminds you to choose research. Units, buildings and improvements now need their tech, and horses and iron only appear on the map once you know Animal Husbandry and Bronze Working. Rivals now expand, build armies, declare war when clearly stronger and attack at good odds. Press J (or AI journal) to read why each rival did what it did. You are at peace with everyone at the start: point at a rival's unit or city and the odds panel offers a Declare war button.

- Technology: 40 techs across four eras, costs scaled by era and game speed, overflow into the queue, boosts with five kinds of trigger, eras by share of techs known, and content gated by tech.
- War and peace: factions start at peace and declare war before attacking; raiders are always at war with everyone. Units cannot walk into a foreign city.
- The AI (`src/ai`): picks a victory path (conquest, science or score), plans research, city sites, production and war, moves every unit, and writes a journal of reasons with the next two options it weighed. It reads only its own view and sends ordinary commands.
- Cities now earn a little science and culture per citizen, so research moves at a sensible pace.
- Toasts stack, so a farm built and the boost it earned both show.
- Tests: 150 unit tests (10 for research, five full 150-turn AI games with no refused commands, the fairness poison test, Large map AI turns under 2 seconds, and same seed, same game) and 30 browser tests, including the tree, queueing and the journal on all three screen sizes.

## Phase 7: Combat and the battle module interface

What you can try: start a game and wait for raiders (camps appear in land nobody can see from about turn 6, marked with a dark tent once found). Select a fighting unit and point at an enemy (first tap on touch): the panel shows your win chance, the HP each side should lose, both strengths and every modifier (hills, forest, river crossing, flanking, wounds, fortified, promotions). Click (or tap again) to attack; if the enemy is out of reach your unit walks to the nearest hex it can attack from. A report says what each side dealt. Units earn experience; at 15 a promotion appears under Needs attention and you pick one of two. Take a city with a melee unit once its defence is at 0 HP and choose Keep or Raze (original capitals cannot be razed). Cities show their defence HP and, once they have walls, can shoot once a turn. Walk into an empty raider camp for 30 gold. For experimenting, `?debug=1` in the address adds developer cheats (see DECISIONS).

- Combat with Civ VI's damage curve (equal strength costs each side 24 to 36 HP), every modifier from the plan, ranged attacks with no damage back, city strength, HP, walls, healing and city shots, capture with Keep or Raze, and capturing civilians.
- The battle module interface from section 5: a registry, the instant auto module, battle specs and checked results, a seed per battle, waiting for an interactive module's screen, and a log of every result.
- Experience and 22 promotions across every unit class.
- Raiders: camps, raiders that attack nearby units and cities (but never take them), and gold for clearing camps.
- Odds before every attack, worked out without ever touching the game's dice.
- Tests: 131 unit tests (17 new for combat, odds, capture, promotions, raiders, 200 scripted battles and a fake interactive battle module) and 27 browser tests, which now also check the side panel never shows a stray "null".

## Phase 6: Economy, buildings, improvements and factions

What you can try: New game now starts with a choice of eight peoples (Rome, Greece, Egypt, Persia, Carthage, Gaul, the Britons and Han), each card showing its leader, two traits, unique unit, unique building and agenda. Your faction's name sits in the top bar; tap it to see its card again. Found a city and open it: your capital has a palace, Rome's cities also get a free monument, and the drawer lists buildings (with any adjacency bonus written out, such as a library's science from mountains), amenities and specialists. The build list now holds 30 buildings and 8 wonders as well as units. Select a builder to see a button for each improvement that fits its hex; each one spends a charge. Gold in the top bar is now after upkeep; if it is falling towards zero you are warned two turns ahead, and when it runs out a unit disbands.

- Effects system (`src/sim/effects`): 14 effect handlers behind one registry, used by traits, buildings and wonders.
- Buildings with prerequisites, adjacency bonuses, specialist slots and faction versions; wonders one per world, with the loser's production refunded as gold.
- Improvements and builder charges; roads (Rome's new cities get one to the capital); strategic resources (horses, iron) now gate the units that need them.
- Amenities with thresholds that change yields and growth; luxuries count once improved.
- Unit and building upkeep, a small free allowance, 10 starting gold, warnings and deterministic disbanding when broke; units heal when they rest.
- Content: 20 units (8 unique), 38 buildings (8 unique), 8 wonders, 9 improvements and the 8 factions, all in original text.
- Fixed: the hidden game screen could show below the title screen on tall windows.
- Tests: 114 unit tests (every effect, adjacency, wonders, bankruptcy, amenities, builders, every faction) and 24 browser tests.

## Phase 5: Cities, citizens and yields

What you can try: start a new game and follow the advice line under the top bar. Do it selects your settler; press B (or Found city) and your capital claims the ring of hexes around it and takes a name from your faction's list. The city drawer opens on the right: food and turns to grow, production, gold, science, culture and faith, what it is building (with a Buy button), and a short list of things to build, best first, each with a one-line reason (+ adds to the queue). Switch the citizen focus to Production and the citizen moves onto hills or forest. Tap any hex in the city's land to lock a citizen there (a padlock appears; tap again to unlock). Hexes the city could buy show their price; tap one twice to buy it. Borders also grow by themselves as culture builds up. The computer rivals now found cities and build units too.

- Cities (`src/sim`): founding (at least 4 hexes apart, never on foreign land), names per faction, capital, growth on Civ VI's curve (10% faster beside a river), starvation, citizens placed by focus with locks, production of units with a queue, buying with gold, borders that grow with culture, buying tiles.
- Yields from one function in a fixed order: tiles, then flat bonuses, then percentages last; Rome's +1 production in the capital and Egypt's floodplain food already work this way.
- Commands: found city, set and queue production, buy, set focus, lock and unlock a tile, buy a tile.
- The top bar shows gold, science, culture and faith per turn and your stocks. The advice line picks the most useful next step from `rules/base-ancient/ui/advice.json`; Needs attention adds cities with nothing to build and starving cities; the Next button reads "Choose production" first.
- Map: faction borders, walled-town city markers with a name and population banner, worked tiles and padlocks for the open city.
- Tests: 97 unit tests (growth thresholds 1 to 20, yields in order, borders, founding rules, focus and locks, production and buying, and 100 turns of four AIs founding cities that replay exactly and stay in range) and a browser test of the whole city flow on all three screen sizes.

## Phase 4: Units, turns and fog of war

What you can try: press New game. You start with a settler, a warrior and a builder on a Small map against three computer rivals (who only end their turns for now). Pick the warrior from Needs attention, point at a hex three tiles away (mouse) or tap it (touch): a path appears with numbers where each turn ends. Click (or tap again) and the warrior walks there, finishing at the start of your next turn. Forests and hills slow units; rivers stop them on the far bank. Unexplored land is black, places you have seen are greyed, and what your units see now is bright. The Next button walks you through units needing orders, then ends the turn. Keys: Space next unit, Enter next, F fortify, S skip, Z sleep, Delete disband, Escape deselect; drag, arrows or WASD to pan.

- Units, movement and fog of war rules (`src/sim`): terrain, hills and feature costs from data, the river rule, the full-moves rule, zone of control (cavalry ignore it), one combat unit and one civilian per tile, A* paths with per-turn waypoints over explored tiles only, sight with hills bonus and mountain and forest shadows, and `view()` so neither you nor the AI can see through the fog.
- Commands: move, fortify, skip, sleep, wake, disband. Starting units come from `eras.json`. A placeholder AI that ends its turn.
- The game screen: needs attention list, unit panel with every action, path preview with turn numbers, Next button, walking animation (units jump instead when your system asks for reduced motion).
- Sprite sheets in the plan's descriptor format with the LPC layout, and one test sheet: an LPC warrior composed from five Universal LPC Spritesheet Character Generator layers, credited in full (OGA-BY 3.0). Other units use code-drawn shields until art exists. `check-data` now fails on any sprite sheet without credits and lists them in `CREDITS.md`.
- Tests: 88 unit tests (15 new for units, movement, fog, the poison test and 100 rounds of random moves that replay exactly) and browser tests of a real game on all three screen sizes, including touch-only and reduced motion.

## Phase 3: The hex world

What you can try: open the map viewer from the link on the title screen (or go to `dev.html`). Pick a map type and size, type a seed, press Regenerate. The same seed always gives the same map (the "map" fingerprint stays the same). Drag or use the arrow keys to pan; use the mouse wheel, a two-finger pinch or + and - to zoom. Numbered hexes are the start positions; tick Grid to see every hex.

- Map generator (`src/sim/mapgen.js`): Continents, Pangaea, Islands, Inland Sea and Highlands in four sizes, all from data. Land share always lands on the recipe's target. Mountains, hills, lakes, coast and ocean; terrain chosen by temperature and moisture; rivers along hex edges that always reach water (or join a river that does); forests, jungles, marshes, floodplains, oases and reefs; resources only where their data allows; fair starts (2+ good food tiles and fresh water within 3 hexes, 9+ hexes apart on Large) that can always reach each other by land or coast.
- New games now build their map from the seed (on a separate stream, so the map never changes any other dice roll).
- Map drawing (`src/render`): pixel-art placeholder terrain with seeded patterns, cached in 16x16-hex chunks so a Huge map pans smoothly; rivers, resource gems, a grid toggle; camera with drag, wheel, pinch and keyboard, 50% to 200%.
- The art registry with its fallback chain (faction art, then the unit's own, then its class, then a code-drawn placeholder).
- Tests: identical maps from identical seeds, 50 seeds of every map type checked for land share, valid resources and features, rivers reaching water, fair and reachable starts, Large spacing, and Huge generation under 1.5 s (it takes about 50 ms). 73 unit tests in all, plus a browser test of the viewer on all three screen sizes.

## Phase 2: Rules as data and the mod loader

What you can try: open Mods from the title screen. Tick and untick mods and watch the report on the right update. Tick Lock to one era without Ancient world to see a red error naming the missing mod. Tick both test scout mods and use the arrows to swap their order: the "Last one wins" line flips between 2 and 4.

- The mod loader (`src/data`): load order from mod types, dependencies and your order; add, replace, change and remove with `where` selectors and cascade; `$opt:` options; schemas for all 31 content types and the 24 effects; reference and text checks; a frozen ruleset with a stable fingerprint (the same in the browser as in Node).
- A plain-English report of everything each mod did, with errors (block play), warnings and info. Its wording lives in `text/engine.en-GB.json`.
- `base-ancient` ruleset data: tuning with every number from the plan's section 3, eras, terrain, features, resources, map sizes and types, unit classes, 6 units, Rome and Egypt as test factions with leaders and city names, victories, text and skin.
- `lock-era` and `no-religious-victory` tweaks (section 4.9). Lock to one era shows three warnings until techs, civics and wonders exist; that is expected.
- Two test mods (swift and slow scouts) that clash on purpose, to show load order at work.
- Mods screen: tick, reorder with arrow buttons (44px, touch-friendly), live report.
- `tools/check-data.mjs` loads every mod and standard stack on each check and regenerates `CREDITS.md`. Fixture mods produce every report message; 58 unit tests and smoke tests on all three screen sizes.

## Phase 1: Repo, rules of the road and the empty engine

What you can try: open the GitHub Pages link, see the title screen, press New game and end a few turns. The seat order changes every game (it comes from the seed), and computer seats pass instantly because there is no AI yet.

- Title screen with Continue (disabled until saves exist), New game, Load, Mods and Settings. Works with mouse, keyboard (arrow keys, Enter, Escape) and touch; every button is at least 44px.
- A temporary phase 1 test bench behind New game: turn counter, seat order, End turn, plus the seed and the game's fingerprint.
- Deterministic core: seeded randomness (mulberry32 with named sub-streams), hex maths (pointy-top axial: distance, neighbours, rings, lines, pixel conversion), stable hashing, copying and ids.
- Minimal rules engine: `createGame`, `applyCommand` with the `endTurn` command, seat order from the seed, `fingerprint`.
- Saves: gzip codec that works in the browser and in Node, `ATLAS1:` export codes, a save skeleton at save version 1 and the migration runner.
- Checks: module boundaries (section 7), no em or en dashes, British spelling in player text, first-load size budget, eslint at 0 warnings, 39 unit tests and browser smoke tests at 1366x768, 1920x1080 and touch-only 820x1180.
- GitHub Actions runs `npm ci`, `npm run check` and `npm run smoke` on every push.
