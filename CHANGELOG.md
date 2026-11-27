# Changelog

## Graphics overhaul G7: title, setup, load, menu, settings and help

The menus now fit a laptop screen and get you into a game in two clicks.

What you can try: open the game and watch a generated world drift behind the title. Continue shows your latest save's leader, faction, turn and a little map; Quick start plays your last setup on a brand new world. New game is now one screen with tabs (Rules, Map, Players, Victory, Advanced) and a card on the right showing your faction's leader, trait and unique unit and building, with Start always in view; the rivals and teams fold away unless you open them, and the faction cards show each leader's portrait. Load shows cards with portraits and map thumbnails, your saves above the autosaves. In a game, the menu offers Resume, Save game (with Share as code inside), Load, Settings, Help and Exit to title. Settings now has everything: interface size and tooltips, ask before ending a turn with units waiting (Shift+Enter ends a turn early), end the turn by itself when nothing needs you, grid and yield icons on from the start, moving the map at the screen edge, zoom speed, water and cloud animation, unit and rival animation speeds, the combat camera, volumes, colour-blind safe faction colours, motion, and how often to autosave and how many to keep. Help (on the title, in the menu or with ?) explains how to play, every key and the game's terms.

- `src/ui/titleWorld.js`, `src/ui/thumb.js`, `src/ui/helpContent.js`; `src/ui/setup.js` laid out as tabs and a summary card; `src/ui/gameMenu.js` rebuilt; Settings in `index.html` and `src/ui/app.js`.
- Settings that now do something new: edge scrolling, zoom speed, confirm before ending a turn, auto end turn, the colour-blind palette, water and cloud animation, the grid and yield icons, autosave frequency and count.
- Fixed: a map view hidden behind another screen no longer loses its place.
- Tests: setup and settings fit 1366x768 without scrolling, Help, Quick start, the Continue card, and a browser check that the grid, colour-blind palette, edge scrolling, Shift+Enter with its question, and auto end turn all work; a unit test for the number of autosaves kept.

## Graphics overhaul G6: movement, combat and sound

Actions now feel physical: units walk, attacks land, numbers fly, turns have a rhythm, and you hear it all.

What you can try: attack something. Melee units lean into the enemy, there is a flash where the blow lands and the damage floats up over both sides; archers, slingers and siege engines send an arrow or a stone on an arc. A unit that falls leaves a puff of dust. Found a city and a banner rises over it with a fanfare; a captured city gets a banner in its new owner's colour. When you end the turn, the rivals' moves you can see play one after another, then "Turn N" sweeps across the map and the camera goes to your first job. When you finish a tech or civic its ring glows and a chime plays. The notifications panel now has "Last round": what happened to you while the rivals moved, and clicking an item moves the map there. Settings has three new choices: unit animation speed (normal, fast, instant), rivals' moves (in full, quickly, or not at all) and whether the map moves to battles against you; "Reduce motion" turns the movement off but keeps the numbers and banners. A short recording of an attack is in `docs/shots/G6/attack.webm`.

- `src/render/layers/effects.js`: flashes, floating numbers, projectiles, dust and city banners, presentation only.
- `src/render/layers/units.js`: walks that wait their turn and melee lunges.
- `src/ui/hud/playback.js`: turns events into effects and sounds, queues rivals' moves, the turn ribbon, the ring glow and the turn summary.
- Sounds (G1's synthesised set) on attacks, arrows, founding a city, finishing a build or a tech, and ending the turn.
- Battle events now say which hex the attack came from.
- Tests: the same three turns with every animation on and with them all off end in exactly the same game; an attack really plays its effects.

## Faster first load

The title screen now opens without downloading the game screen and map renderer; they load quietly in the background while you read the title, or when you start a game. The first page load drops from about 936 KB to 651 KB (the budget is 1,000 KB), which leaves room for the rest of the overhaul. This was planned for G8 (docs/OVERHAUL.md section 7) and is done now because G6 adds more code.

## Graphics overhaul G5: cities, resources and improvements

Cities now visibly grow and look like their culture, resources are icons you can tell apart, and the name plates say what each of your cities is building.

What you can try: found a city and watch it grow: a village of two houses (population 1 to 3), a town (4 to 6), a city with a temple or tower (7 to 10) and a great city (11 and over). Build walls and a stone ring with towers appears round it. In the base game cities start as mudbrick and stone with flat roofs and temples, and switch to stone and red tiles once their owner reaches the medieval era; Witcher cities are timber-framed with thatch and slate, Killzone ones are concrete bunkers with comms pylons and floodlights. Each flies its faction's banner, and smoke rises from your chimneys while a city is building (unless motion is reduced). The name plate shows population, a star for a capital, the name, the icon of what it is building and the turns left, and a health bar when the city is damaged. Units in a city stand to its sides so you can see the town. Resources are now round tokens with their icon (wheat, cattle, fish, stone, wine, silk, incense, horses, iron, deer) in the corner of their hex.

- `src/render/art/cityArt.js`: cities drawn in code at pixel-art size, four tiers, four styles, walls, banner, lit from the top left; each look cached. Styles come from each skin's `cityArt`.
- `src/render/layers/cities.js`: the town under the units, the plate on top; smoke on the cosmetic clock; strategic view keeps the dot and slim plate.
- `src/render/layers/overlays.js`: resource tokens at screen resolution (the old gems are gone from the terrain chunks).
- Tests: tiers and styles in Node; a browser test that your city's plate carries its build and turns and that walls reach the map.

## Graphics overhaul G4: a sprite for every unit

Every unit in the base game, the Witcher and Killzone now has its own sprite in its faction's colours, and every leader has a portrait.

What you can try: start any game and look at the map. Settlers carry packs, builders wear overalls and carry a hoe, warriors have spears, archers bows and quivers, legionaries Roman armour and helmets, knights ride armoured horses, chariots and catapults roll on turning wheels, and ships have oars or sails in your colours. In the Witcher, Temerian, Redanian and Nilfgaardian soldiers wear their kingdom's colours, the witcher has his long sword and white hair, and drowners, nekkers, ghouls and wyverns are proper monsters. In Killzone every unit is an ISA or Helghast trooper (riflemen, heavies, snipers, jump troops, engineers) or a tank. Each unit has a small pennant in its faction's colour with its class icon, a shield badge when fortified, a sleep badge when asleep, a number when several share a hex, and its health bar only when hurt. Select a unit for its portrait in the selection panel; open Diplomacy for each leader's portrait. All 101 unit sheets are on one contact sheet in `docs/shots/G4/contact-sheet.png`.

- `tools/gen/lpc-units.mjs`: fetches the Universal LPC Spritesheet Character Generator at a pinned commit into a git-ignored cache (only the folders it needs), reads `rules/<mod>/art/units.recipes.json`, composites each unit's layers in headless Chromium into the classic LPC layout, draws the "tint" layers in a mask colour, and writes `assets/sprites/<skin>/<unit>.png` with a descriptor carrying full per-layer credits. It fails if a layer has no author or licence, and points each skin's art at the sheets.
- Code-drawn units in the same style (`tools/gen/unit-art/compose.js`): horses carrying an LPC rider, chariots, siege engines, ships and the Witcher's monsters. Killzone's troopers and tanks come from Matthew's own Killzone code, copied unchanged.
- In the game: faction colour by recolouring the mask per frame (`src/render/art/spriteSheet.js`), a faction's own sheet first (Killzone), pennants, status badges and stack counts on the map, portraits in the selection panel and Diplomacy. `tools/check-data.mjs` fails on any sprite layer without an author or licence and lists every sheet in CREDITS.md.
- Tests: every unit and leader in every ruleset has credited art and no two units share a picture; a browser test that sprites take each faction's colour and that unit and leader portraits show.

## Graphics overhaul G3: terrain, borders and the strategic view

The map has soft edges, coastlines, light and tall terrain now, and what you have not explored is an old campaign map rather than a black void.

What you can try: look at any coast (a pale shallow band, a line of foam, a fringe of beach) and where two kinds of land meet (they fray into each other instead of stopping at a hard hex edge). Mountains rise above their hexes with snow caps, hills are lit from the top left, forests and jungle are proper stands of trees, rivers are wider with a light centre and widen towards the sea, roads are dirt tracks with bridges over rivers, and every improvement has its own little picture (farm rows, mine entrance, fenced pasture, plantation bushes, quarry cuts, tents, fishing boats, a fort). Unexplored land is parchment with ink clouds, and your explored land frays into it. Borders are a coloured edge with a darker line inside and a faint tint over the land; borders between your own cities are gone, and a faction you are at war with has a dashed border. Zoom right out (now down to 30%): below 60% the map switches to a strategic view with plain terrain, units as small flags with their class icon, and cities as name plates. Rest the mouse on a hex for its soft outline even with nothing selected; G still shows the grid. The Witcher has a colder, darker land and Killzone scorched greys and rust. Water sparkles and clouds drift slowly unless Settings says Reduce motion.

- `src/render/layers/terrain.js` rewritten: the ground is drawn pixel by pixel into the chunk cache with dithered blending, foam, beaches, shallow water and frayed edges; then patterns, rivers, roads and bridges, props in row order, improvements and resources. A second, simpler set of chunks for the strategic view. Chunks just outside the screen are built while the page is idle.
- `src/render/art/terrainProps.js`: mountains, hills, trees and improvement art in code, lit from the top left; all colours through the art registry, so a skin's `placeholders` replace them (`tools/gen/witcher.py` and `killzone.py` now write terrain palettes).
- Borders (`src/render/layers/cities.js`): one edge per territory, inner line, 12% tint, dashed at war. Cities and units have a strategic form.
- Tests: a browser test that the terrain draws the same pixels twice, unexplored land is parchment, the strategic view switches at 60%, sparkle only runs with motion allowed, war borders draw, and a frame stays fast; the Huge map panning test still passes (zoom limit updated). Screenshots are in `docs/shots/G3/`.

## Graphics overhaul G2: the new game screen

The map now fills the whole window and everything else floats over it in walnut panels with brass edges, so at 1366x768 you see far more of the map than before.

What you can try: start or load a game. The top bar shows every yield (food, production, gold, science, culture, faith) as an icon and a number; rest the mouse on one for where it comes from (cities for food and production). The turn and era sit on the right with icon buttons for Empire, Diplomacy, Victory, the AI journal and Help. Top left, your research and civic show as rings filling up with turns left; click one to open its tree. Top right, the needs-attention list has an icon per item; click to go there, right-click to dismiss it until next turn (six show at most, then "and N more"). Bottom left, the selected unit has a portrait slot, a health bar, its stats as icons and buttons showing their keys (F, S, Z, Del, B); a city's panel takes the whole left side. Bottom right, the minimap (click or drag it to move the map), and beside it the advice line, the big end-turn button and three toggles: the religion lens, yield icons on every hex (Y) and the hex grid (G). Rest the mouse on any hex to see its terrain, feature, resource, yields, owner, improvement and units. Press ? for Help with every shortcut; Escape closes whatever sheet is open.

- `index.html` and `css/base.css`: the floating HUD over a full-screen map, coloured from the overhaul's tokens (so the Witcher and Killzone skins restyle it); no underlined links in the HUD.
- `src/render/minimap.js`: fog-aware, faction colours, cities, the view frame, click and drag.
- `src/render/canvas.js`: the clear area (insets from the panels' real positions), so centring aims at what the panels leave and a selected unit is never left under a panel; the yield-icon overlay from the icon atlas.
- `src/ui/hud/mapHud.js`: the minimap, toggles, hex tooltips, the clear area and the Help sheet. The top bar, notifications and unit card modules are rebuilt for the new look.
- Fixed a slip from the G1 split that could have broken the "adopt a government" advice.
- Tests: a browser test of the HUD (panels in their corners and never overlapping, every yield with its icon, no underlined links, the selected unit clear of the panels, a hex tooltip, the progress widget, dismissing a notification, the minimap moving the camera, the grid and yield toggles, Help and Escape, the city panel); unit tests of the minimap's maths. Screenshots of this phase are in `docs/shots/G2/`.

## Graphics overhaul G1: foundations for the new look

The plan for the overhaul is now in the repository as `docs/OVERHAUL.md` (eight phases, G1 to G8). G1 lays the groundwork; the game looks almost the same afterwards.

What you can try: hover the gold, science, culture or faith figures in the top bar to see where each comes from (worked tiles, citizens, buildings, specialists, trade routes, bonuses, and for gold the upkeep it costs). On a touch screen, press and hold. Open Settings from the title screen: Interface size (90% to 125%) makes every panel and screen bigger or smaller without touching the map; Tooltips chooses how quickly they appear (or turns them off); three volume sliders and "Play a test sound". Headings now use Cinzel and text Alegreya Sans, bundled with the game so they work offline.

- `npm run shots`: three fixed turn-120 games (base game, Witcher, Killzone, in `test/fixtures/saves/`) loaded through Import code and photographed at 1366x768 and 1920x1080 (title, setup, map, zoomed-out map, a unit, a city, tech tree, Empire, Diplomacy, Victory, menu). The set for this phase is in `docs/shots/G1/`.
- `src/ui/game.js` split into `src/ui/hud/` (top bar, advice line, attention list, unit card, shared helpers, tooltips, icons) and `src/ui/screens/` (city panel, dialogs, full-screen sheets), with no change in behaviour: from 1,400 lines to about 960.
- The overhaul's design tokens in `css/tokens.css` (walnut, brass, parchment, gold, danger, yield colours, heading and text fonts) and a `--ui-scale` variable; the Witcher and Killzone skins restyle the tokens through `skin.json`.
- 65 pixel icons drawn in code (`tools/gen/icons.mjs`): yields, stats, unit classes, lenses, screen buttons, statuses and every resource, as an SVG sprite for the interface and a PNG atlas for the map.
- A tooltip system (delay from Settings, long press on touch, keyboard focus) and a sound registry with seven sounds synthesised in the browser (click, end turn, clash, bow, built, tech done, city founded), silent until you first interact.
- The phone layout is frozen for the overhaul: its tests are skipped, not deleted.
- Tests: a browser test of the yield tooltips, the UI scale, the fonts, the icon sprite and the test sound.

## Phase 21: Phone layout and offline play

Phase 20 (pass-and-play) is skipped for now, at Matthew's request; everything in it was about several people sharing one screen.

What you can try: open the game on your phone. In portrait, the map fills the middle; the panel for your unit or city is a sheet along the bottom (tap its handle to fold it away and give the map more room); the "!" button at the top, with its number, slides in the needs-attention list; the top bar is a row of icons (menu, empire, diplomacy, victory, journal) with your turn and a strip of yields you can swipe sideways. Turn the phone on its side and the panel moves to the right of the map. Overlays (the Empire, the trees, the Victory panel, battles) fill the screen. Pinch to zoom and drag with two fingers to pan. Then use your browser's "Add to Home Screen": the game installs with its own icon and opens like an app. Once it has been opened online, it keeps working in flight mode. On a phone, a first new game starts on a Small map, and the setup screen recommends Small or Standard maps (Large and Huge are marked "slow on phones").

- The phone layout (under 900px wide) in `css/base.css`: the bottom sheet (a fixed height, so the map never shifts under your finger when the panel changes), the attention drawer, the icon top bar, full-screen overlays, safe-area insets for notches and the home bar, and every target at least 44px.
- Pinch tuning: lifting the second finger after a pinch can no longer register as a tap (which could send a unit somewhere), and fingers almost touching no longer make the zoom jump. The map keeps its centre when its area changes size.
- `sw.js`, the service worker, stamped per build by `tools/build-sw.mjs` (run by `npm run check`; CI fails if it is stale): every app file cached on install, code, rules and text network first, art cache first; and `manifest.webmanifest` with code-drawn icons (`tools/gen/icons.py`).
- Performance: on a Standard map at phone size with the processor slowed four times, a map frame takes about 2 ms (under 5 ms nine times in ten).
- Tests: phone runs at 390x844 and 844x390 with taps only (setup, the drawer, founding a city, the sheet, a full-screen overlay, ending a turn), no visible target under 44px, and the game opening and starting a new game offline once cached; unit tests that sw.js is current and precaches every file, that any change gives a new build, and that the manifest's icons exist at their sizes.

## Phase 19: Killzone front line and platoon battles

What you can try: start a new game and set Conversion to "Killzone: The Front". There are two sides, the ISA and the Helghast, one rival, and a fixed battlefield (the Corinth front): Vekta's green fields in the west, Helghan's grey plains in the east. There are no settlers. Each side starts with three cities and an army, already at war, and the whole map is known. The map is tinted in each side's colour with a dashed line where the front runs. Each round your armies push the front forward wherever they stand, and every battle pushes it towards whoever came off better. Three sites are worth taking: a factory (+2 production in every city), a power plant (+2 science, +1 production) and a refinery (+3 gold). Each belongs to whoever holds the ground it stands on, and a message tells you when one changes hands. There is no peace: the war is fought to the end. Battles default to "Ask each time" with Killzone platoons: Fight opens a real-time platoon battle (your units become platoons, their strength sets how many squads they field and their health how many soldiers are present). Pick a platoon, tap the field to send it, or tell it to take an objective, hold or fall back; orders cost order points that refill over time. Hold more objectives to win on points, or break the enemy outright. The result goes back to the map and moves the front.

- Engine: `src/sim/frontline.js`, an optional system switched on only by `tuning.frontline.enabled`: two sides (`frontSide` on factions), tile control from -100 to 100 pushed by army presence and battles, capturable sites with their bonuses through the effects registry, settling and raiders off, no peace, and fixed maps from a new `mapPresets` content type (plus a new `sites` type). Base-ancient and the Witcher leave it off and play exactly as before.
- `rules/killzone/` (written by `tools/gen/killzone.py`): the ISA and the Helghast with leaders, traits, agendas and a unique unit each, every unit renamed for the setting, three sites, the Corinth front map, original text and a skin.
- `src/battles/killzone/`: your Killzone project's own battle sim, vendored unchanged (credited in its README), with an adapter that turns Atlas units into platoons and survivors back into health, `simulate()` for headless runs, and an Atlas-drawn platoon screen.
- The rules can now choose the default battle mode and module (`tuning.setup`), and cap the number of rivals.
- The size check now measures what the first page load really fetches (static imports from the page and the worker); the Killzone sim loads only when a platoon battle opens, so the first load is 797 KB.
- Tests: front control maths, sites changing hands and moving their bonus, battles pushing the front, no settling, raiders or peace, the fixed map, base-ancient untouched; the Killzone adapter deterministic, its results valid, strength and health mapping, sides and maps; two 100-turn computer-only Killzone games with no refused commands; a browser test of a Killzone game and a platoon battle that moves the front.

## Phase 18: Tactical battles

What you can try: on the setup screen, under Battles, set Battle mode to "Ask each time" (or "Always fight my battles"); the module becomes Tactical. Now when you attack, a card shows the auto-resolve odds and offers Fight it yourself or Auto-resolve. Fight opens a small battlefield built from the ground you are attacking: defenders on a hill stand on raised ground, woods are thick with trees, a river runs across the middle if you attack over one, and a city has walls. Each unit is a band of pixel soldiers (one for every 10 HP) in a formation that suits it: a line of swordsmen, a block of spears, a loose screen of archers, a wedge of horse. Pick Advance, Charge (faster, and +3 strength for the first moments of the clash) or Hold, or tap the field to march somewhere; hitting the enemy from the side or behind adds +3. Press Begin (or Space), change the speed (1x, 2x, 4x), pause, withdraw to keep what health you have left, or let the computer finish it. When it ends, the map shows exactly the survivors and health the battle left.

- `src/battles/tactical/` with its own sim (seeded, no screen, no clock), render and UI folders, following the battle module contract in docs/PLAN.md section 5: `simulate` for headless runs, `mount` for the screen, results checked by the engine before they are applied.
- The battle uses the same strengths, modifiers and luck as auto-resolve, so over 500 computer-only battles the outcomes stay within 2 points of auto (the test allows 10). What you add is tactics: charges, flanks and when to withdraw.
- Battle numbers live in `tuning.battle.tactical` (field size, speeds, how long a clash lasts, the charge and flank bonuses).
- Battles between computer players, and attacks on you during their turns, still settle at once, so their turns never wait for a screen.
- A new boundary check: a battle module's sim folder can never touch the screen, the clock or loose dice.
- Tests: simulate is deterministic; 500 battles within 10 points of auto-resolve, overall and for each kind (field, ranged, city); a wooded hill makes the same attack harder; every result passes the engine's checks; recorded orders replay exactly; withdrawing; land battles only; a game replays from its stored battle result even with the module removed; browser tests for the card, a fought battle reaching the map, auto-resolve and the setup options.

## Phase 17: The Witcher conversion and the full mod manager (version 1)

What you can try: on the setup screen, set Conversion to "The Witcher: Northern Wars". The faction lists switch to the eight setting factions (Temeria, Redania, Kaedwen, Aedirn, Nilfgaard, Skellige, Kovir and the Scoia'tael), each with its own leader, trait, agenda, unique unit, unique building, colours and city names. Faiths become the setting's (the Eternal Fire, Melitele, the Old Ways and others), raiders become Monsters (drowners first, wyverns later), and any city with a witcher school can train witchers, who fight better against monsters. Tick "Lock to one era", pick its era, and tick "No religious victory": the tweaks load in the order shown, with up and down arrows, and the Victory and turn limit options show what the mods switch off. On the Mods screen, mods with options show them when ticked, and Stack check loads the ticked mods and lets the computer play five rounds of a small game with them.

- `rules/witcher/` (written by `tools/gen/witcher.py`): 8 factions, 8 leaders, 8 unique units and 8 unique buildings, witchers and the witcher school, 4 monsters, 7 religions, 5 setting events (monster nests, the Wild Hunt, witch hunters), monster raiders, setting names for the base wonders, and a colder skin with each faction in its own colours. All words are original.
- Engine: units can be `raiderOnly`; raiders take their name from the rules (`tuning.raiders.nameKey`); a skin can ask for faction colours; the game screen wears the conversion's colour tokens.
- Setup screen: the Conversion picker, ordered tweaks with their options, and the faction, victory and turn limit choices following the loaded mods.
- Mods screen: options for ticked mods and the Stack check button.
- `docs/MODDING.md`, a guide to writing a mod; `docs/ART_STATUS.md`, every art id each ruleset and conversion uses (written by `npm run check`).
- Base data: religions are tagged `base` and city name lists `historical`, so a conversion can remove them in one line.
- Tests: the "stack everything" load (base-ancient, witcher, lock-era at Classical, no-religious-victory: 0 errors), five 150-turn AI-only Witcher games with 0 errors, no base wording that names the real world showing through, monsters only for raiders and the witcher's bonus; browser tests for the Witcher setup and the Stack check.

## Phase 16: Culture victory, events and the balance pass

What you can try: start a new game and look at the World section of the setup screen: Events (Off, Occasional or Frequent, Occasional by default) and Disasters (Off or On). Every so often something happens in one of your cities: a bountiful harvest, wandering scholars, a merchant caravan, a festival, veteran mercenaries and so on (twenty in all). A dialog tells the story and offers two choices, each saying exactly what it does ("+3 production for 8 turns"). You must choose before ending your turn; the advice line reminds you. With Disasters on, five unwelcome ones can strike too (plague, flood, earthquake, drought, great fire), each with a choice of how to cope. The culture victory is now live: wonders (3 each), the monument, amphitheatre, temple and a few others, and some policy cards earn influence every turn; once your influence is at least 100 and higher than the lifetime culture of every living rival, you win. The Victory panel shows how many rivals you have overtaken.

- `culture.js` and the culture victory module; influence values on buildings and policy cards in data.
- `events.js`: twenty events in `events.json` (five disasters) with conditions, chance and choices through the effects registry; a new `popChange` effect and an instant form of `freeUnit`; the `chooseEvent` command; the event dialog and its advice line.
- The AI answers events (choosing what is worth most to its plans), pursues all five victory paths (a culture path that values influence), and still honours `ai.lateGameMode: sandbox`.
- AI ai-v12: armies on the conquest path gather four strong before attacking a city, and wear cities down with melee (kept after beating ai-v10 12 games to 8).
- Balance: Trajan's +1 production now applies in every city, not just the capital (Rome had won none of 60 games); Pericles leans towards culture.
- Tests: 224 unit tests (events fire only when their conditions hold and never when switched off, disasters only with the option, choices apply their effects, the turn waits for a choice, the culture victory exactly at its threshold) and 57 browser tests (the event dialog, the new setup options and the culture victory on the Victory panel).

## Phase 15: Espionage

What you can try: after the Recorded History civic, cities can train spies (one per faction, plus one for each era you reach). Select a new spy and tap "Post this spy", or open Empire (E) and the Spies tab: send it to one of your cities to defend it, or to any rival city you know. Each mission lists its success chance before you commit (60%, plus 10% for each level your spy has, less 15 or more for each spy defending that city), how long it takes, and the risk of being found out or caught: Gather Intel (see the land around the city and what its owner is researching), Siphon Funds (a fifth of their gold, at most 120), Steal Tech Boost (40% towards a tech they know and you do not), Sabotage Production (their current build loses its progress) and Incite Unrest (-2 amenities for 10 turns). A spy that succeeds gains a level. Recognised or caught, your spy costs you opinion with that leader ("We caught your spies"), and rival spies caught in your cities are announced to you.

- `espionage.js` with missions, odds, outcomes and every number in `espionage.json` and `tuning.espionage`; the spy unit; `assignSpy` and `startMission`; outcomes as events with one roll of the game's dice.
- The Spies tab, a Post button on the spy's card, toasts for results and for rival spies caught or recognised.
- A new opinion reason, "We caught your spies".
- The AI's espionage planner, defending its capital first and then sending spies abroad.
- Tests: 216 unit tests (the odds formula, outcomes over 10,000 seeded rolls within 1% of their chances, the spy cap per era, every mission's effect, opinion when caught) and 51 browser tests (posting a spy and seeing the odds before starting a mission).

## Phase 14: Trade

What you can try: research the Foreign Trade civic and build a trader. Select it in one of your cities and its card lists every city it can reach, best first, with what your city gets and what they get. Tap one: the trader becomes a 30-turn route, a road is laid along the way at once, and both ends gain (domestic routes bring food and production, foreign ones gold and science, plus a little for each resource the destination works; a market adds 2 gold to foreign routes). When the route ends the trader comes home to be sent again; a war with the destination ends it early. Routes also carry your religion to the far city. Empire (E) now has a Trade tab with every route and its yields each way. In Diplomacy, a spare luxury (one you have twice) is worth offering to a rival for gold per turn; give away your only copy and you lose its amenity.

- `trade.js` with the route tables in `trade.json`: traders, `startTradeRoute`, 15 hexes by land and 30 by sea between coastal cities, 30-turn routes, yields to both ends, roads along land routes, routes ending at war, and religious pressure along routes.
- The trader unit (after Foreign Trade); the market's `tradeRouteYield` effect (a new handler).
- Resource deals now really hand the resource over: the giver loses the amenity (or the units it allows) unless it has a spare copy, and the AI values a spare copy far below its last one.
- The trader's destination list, the Trade tab, toasts for routes starting, ending and arriving.
- The AI's trade planner.
- Fixed: units that need a civic (the trader is the first) could never be built, because of a leftover check from phase 6; buildings needing a civic now check it properly too.
- Tests: 210 unit tests (route ranges by land and sea, yields by table, roads along the path, 30-turn expiry and war ending routes, religion along routes, luxuries changing hands) and 48 browser tests (a trader's destinations with yields each way, the road, the Trade tab).

## Phase 13: Religion

What you can try: faith now has a purpose. Build a shrine; at 25 faith (scaled by game speed, so less at Quick) the advice line offers a pantheon: tap Faith in the top bar (or E, then Religion) and choose one, unique in the world. At 200 faith, with a shrine or temple in a city, found a religion there: pick one of eight, give it your own name if you like, and choose a follower belief (it helps every city that follows your religion, whoever owns it) and a founder belief (yours alone, some paying per follower city). Your holy city converts at once, and every city spreads its religion to cities within 10 hexes each turn. Press L (or Religion lens) to see coloured pips above each city, one per citizen. In a city that follows your religion, the city drawer offers a missionary for faith: walk it next to any city and Preach to convert two people (three uses). If most people in more than half of every faction's cities follow your religion, you win a religious victory. Only half as many religions as factions can exist, so do not wait too long.

- `religion.js`: faith, pantheons, founding (with a name), the religion limit, pressure within 10 hexes and conversion, missionaries bought with faith, buying shrines and temples with faith (a founder belief).
- 22 beliefs (8 pantheon, 8 follower, 6 founder) and 8 religions with colours, all original, all through the effects registry; two new effect handlers, `religiousPressure` and `faithPurchase`.
- The religious victory module, the religion lens, the Religion tab, faith purchases in the city drawer and Preach for missionaries; advice for a pantheon and for founding.
- The AI's religion planner and a religious victory path; missionaries walk to the best cities and preach.
- Tests: 203 unit tests (pressure maths by fixture, conversion order, the religion limit, pantheon and founding, belief effects, missionaries, the religious victory exactly at its threshold) and 45 browser tests (pantheon, founding a named religion, the lens and a missionary).

## Phase 12: Diplomacy

What you can try: press D (or Diplomacy) once you have met a rival (explore until you see one of their units or cities). Each leader shows their status and their opinion of you, and picking one lists every reason behind it ("You denounced us -8", "Agenda: The road to Babylon +6") and whether their agenda likes what you do. Make a deal: gold, gold per turn, luxury and strategic resources, open borders, a defensive pact, an alliance or a joint war on someone else; the panel says "Likely yes" or "Likely no" before you send it, and they answer on their turn. Denounce a rival first and your later war is a formal one; attack without warning and everyone remembers the surprise war. At war, Propose peace; a peace treaty then stops either side declaring war again for 10 turns. Long wars build war weariness, which costs amenities in every city. Rivals make friends, denounce and, when losing, offer you peace (it appears under Needs attention). On the setup screen, Teams now works: teammates start as permanent allies and win conquest together.

- `diplomacy.js`: relations (unmet, war, peace, open borders, defensive pact, alliance) with minimum durations; opinion from named reasons in `diplomacy.json` that fade by 1 every 5 turns, live reasons and leader agendas; war weariness; deals and their evaluation; commands `declareWar`, `proposeDeal`, `answerDeal` and `denounce`.
- Defensive pacts and alliances pull partners into wars on their friends; joint wars start together.
- Luxuries received in a deal count for amenities; strategic ones let you build the units that need them.
- The diplomacy overlay (D), offers under Needs attention, toasts for meetings, treaties, denouncements, peace and answers.
- The AI's diplomacy planner, and the AI now denounces before it declares war.
- Teams on the setup screen.
- D now opens diplomacy instead of panning right (arrow keys and W, A, S still pan).
- Tests: 196 unit tests (opinion fading, the peace minimum, symmetric deal values, deterministic AI answers, war weariness and amenities, surprise wars, defensive pacts, offers lapsing, teams, traded luxuries, a losing AI offering peace) and 42 browser tests (the diplomacy overlay with likely answers, denouncing, war and a peace offer).

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
