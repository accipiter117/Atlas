# Atlas graphics and UI overhaul

Nov 27, 2026 · @Matthew Hawkes

Atlas plays as a complete game, but it looks like a web form wrapped around a pixel map. This plan rebuilds the look in 8 phases (G1 to G8): a warm Civ VI-style HUD with a full-screen map, a much richer map, a distinct sprite for every unit, and proper menus and settings for long laptop sessions.

## 1. Review: where the game stands

The rules engine is in excellent shape. The presentation is a prototype: 94 of 95 art slots in base-ancient are still code placeholders, and the screen layout gives the map less than half the window.

**What I checked.** The latest build (33 commits, phases 1 to 19 and 21) passes all 258 Node tests and 78 browser tests. I generated a turn-120 game on a Standard map with 6 factions, loaded it through Import code, and screenshotted it at 1366x768 and 1920x1080 alongside every screen the smoke tests capture.

**Strong already**

- Every system works and is reachable: cities, tech and civics trees, government cards, religion, trade, spies, diplomacy deals, victory progress, events, tactical and Killzone battles, Witcher and Killzone conversions.
- The game is fast. An 8-faction Large map stays well under the 2-second AI turn target, and rivals run in a Web Worker so the page never freezes.
- The pixel terrain has a consistent look, and the advice line plus the needs-attention list work as intended.

**The gaps, in order of how much they hurt**

| Area | What you see today | Why it matters |
| --- | --- | --- |
| Unit art | Every soldier is the same LPC warrior; everything else is a shield with a letter | You can't tell an archer from a horseman, or a Roman from a Helghast rifle squad |
| Screen space | Top bar 105px, advice bar 52px, left list 220px, right panel 300px. The map gets 846x610 of a 1366x768 window (49%) | The map is the game; panels sit mostly empty |
| Map depth | Hard-edged hexes, a strong grid, no coastlines, flat mountains and forests, a black void around the world | Hard to read terrain at a glance and it looks unfinished |
| Borders | A thick line round every owned hex | Clutters the map and hides terrain |
| Cities and resources | Every city is the same small white building; resources are coloured dots | No sense of a city growing; you can't tell iron from wine |
| HUD | Yields are underlined text links, buttons wrap ("AI journal" on two lines), no icons | Reads like a website, not a game |
| Missing laptop basics | No minimap, no hover tooltips on tiles or units, no sound, no keyboard shortcut help, Settings has only two options | Long sessions need these to feel comfortable |
| Screens | Setup is one 2,500px scroll with the Start button overlapping a heading; the tech tree is cards with no connecting lines; the menu shows a raw save code | Functional but tiring |
| Feedback | Attacks and moves happen with almost no animation or effect | Combat feels like a spreadsheet update |
| Skins | Witcher and Killzone change names and colours but use the same art | Conversions don't feel like different games yet |

The screenshots below are from the turn-120 game: first at normal zoom on a 1366x768 laptop, then zoomed out at 1920x1080.

[Image: Turn 120 at 1366x768: panels take half the window and every soldier is the same sprite\]

[Image: Turn 120 zoomed out at 1920x1080: hard hex edges, a border line round every hex, and a black void around the world\]

## 2. Design direction

The look is "a general's campaign table": the map fills the screen, and dark walnut panels trimmed in brass float over it. Parchment is kept for menus and documents (setup, trees, diplomacy letters), and the pixel map gains light, depth and edges.

**Palette** (stored as tokens in `css/tokens.css`, overridable by each skin)

| Token | Base value | Used for |
| --- | --- | --- |
| `--panel` | #2b2118 walnut, 94% opaque | HUD panels over the map |
| `--panel-edge` | #b08d57 brass, 1.5px with a 1px #5a4630 inner line | Panel borders, dividers |
| `--panel-ink` | #f1e6cf | Text on panels |
| `--parchment` | #efe3c6 with a subtle paper grain drawn in code | Menus, trees, full-screen screens |
| `--ink` | #2a1f14 | Text on parchment |
| `--accent` | #c9a227 gold | Selection, focus, the end-turn button glow |
| `--danger` | #a63a2b | War, damage, starving |
| Yield colours | food #7cb342, production #c97b2a, gold #e6b422, science #4fa3d9, culture #b46ad4, faith #e8e2d0 | Icons and numbers, always paired with an icon so colour is never the only cue |

Skin overrides: **Witcher** swaps walnut for cold slate (#24282b) and brass for iron (#8d969b); **Killzone** uses gunmetal (#1d2226) with ISA blue or Helghast orange-red accents. Only tokens change, never layout.

**Type.** Headings in **Cinzel** (Roman inscription capitals, fits the base game), body in **Alegreya Sans** (readable at 13px). Both are free (SIL Open Font Licence), bundled as `.woff2` from the `@fontsource` packages so they work offline, and credited. Skins may swap fonts. Minimum body size 13px at 100% UI scale.

**Icons.** One set of about 60 pixel icons (16x16, drawn at 2x for crisp edges) made by code in `tools/gen/icons.mjs` into a single SVG sprite: the six yields, amenities, housing, strength, ranged strength, moves, HP, every unit class, every lens, every screen button, every status (fortified, asleep, healing, embarked) and every resource. Text never stands in for an icon, and every icon has a tooltip.

**Panel style.** Rounded 6px corners, a soft drop shadow over the map, headers with a thin brass rule, no web-style underlined links anywhere in the HUD. Buttons have three states (normal, hover with a warm glow, pressed) and a keyboard focus ring in gold.

**Motion.** Panels slide 120ms, numbers tick up when they change, the end-turn button pulses gently when nothing else needs you. Everything respects reduced motion.

## 3. Laptop HUD

The map becomes the whole window and every panel floats over it, so on a 1366x768 laptop you see about 74% of the screen as map instead of 49% (roughly 50% more map), with nothing important more than one click away.

**Layout at 1366x768**

```
+------------------------------------------------------------------------------------------------------+
|[=] ROME  (food)+24 (prod)+31 (gold)412 +18 (sci)+34 (cul)+21 (faith)96 +7 (amen)+2 | Turn 142 | 1,240 BC |[E][D][V][J][?]|  44px
+------------------------------------------------------------------------------------------------------+
| +------------------------+                                                    +--------------------+ |
| | (sci) Philosophy  3t ==|                                                    | ! Neapolis: build  | |
| | (cul) Drama       5t ==|                                                    | ! 2 idle units     | |
| +------------------------+                                                    | ! Gaul offers peace| |
|                                                                               +--------------------+ |
|                                                                                                      |
|                                   FULL-SCREEN MAP                                                    |
|                     (hover any hex: terrain, yields, owner, improvement tooltip)                    |
|                                                                                                      |
| +------------------------------------+                                    +-------------+            |
| | [portrait] LEGIONARY   HP ====== 92|                                    |   minimap   |            |
| | (str)40  (mov)2/2  XP 22/45        |                                    |             |            |
| | [Fortify][Skip][Sleep][Build fort] |                                    +-------------+            |
| | Odds vs Swordsman: favourable      |     > Neapolis needs a project.    [  CHOOSE PRODUCTION  ]   |
| +------------------------------------+       (advice line)                [ lens ][ yields ][grid]  |
+------------------------------------------------------------------------------------------------------+
```

| Element | Where | Size at 1366x768 | Behaviour |
| --- | --- | --- | --- |
| Top bar | Full width, top | 44px tall | Icons plus numbers for every yield, each with a tooltip breaking it down by source; turn and date; icon buttons for Empire (E), Diplomacy (D), Victory (V), Journal (J), Help (?) |
| Progress widget | Top left | 260x96 | Current research and civic with progress rings; click opens the tree |
| Notifications | Top right | 280 wide, grows with items, max 6 then "and 4 more" | Replaces the left needs-attention column; each item has an icon and jumps to its place; dismiss with right-click |
| Selection panel | Bottom left | 380x200 | Unit: portrait, HP bar, stats with icons, action buttons with their keys shown. City: summary with a button to open the full city screen |
| Minimap | Bottom right | 240x160 | Fog-aware, faction colours, click to jump, a frame showing the current view |
| End-turn cluster | Bottom right, left of minimap | 300 wide | Big button naming what blocks the turn; the advice line sits just above it in one line |
| Map toggles | Under the end-turn button | Three 32px icon buttons | Lenses menu, yield overlay, hex grid |

**Rules for the HUD**

- Panels never cover the selected unit: the camera eases the selection into the clear centre area if a panel would hide it.
- Hover tooltips everywhere on desktop (400ms delay, set in Settings), with the same content one click away for touch.
- UI scale setting (90%, 100%, 110%, 125%) so 1920x1080 screens can use bigger text, applied through one CSS variable.
- Full screens (city, trees, Empire, diplomacy, victory, journal, menu) open as parchment sheets over a dimmed map with Escape to close, and the map stays visible behind them where possible (city screen keeps the map, see section 5).
- Phone layout is frozen: the new HUD targets screens 1280px wide and up, and the phone tests are switched off until a later phone pass.

## 4. Map and art

The map keeps its pixel style but gains light, depth and soft edges. Every unit gets its own sprite built automatically from LPC layers, and cities grow visibly as they grow in size. All of it still goes through the art registry, so missing art never breaks a game.

### 4.1 Terrain

- **Soft edges between terrains.** Each hex blends into its neighbours with dithered pixel masks (grass fringing into plains, sand into coast), baked once into the existing 16x16-hex chunk cache, so drawing speed is unchanged.
- **Coastlines.** A pale shallow-water band with a line of foam pixels along every shore, darker deep ocean further out, and a slow cosmetic sparkle on water (switchable off).
- **One light direction, top left,** for every hill, mountain, tree, city and unit shadow.
- **Tall things overlap.** Mountains, forests, jungle and cities are drawn as props in a depth-sorted layer, taller than their hex, so a mountain range reads as a range and a forest as a forest rather than dots on a tile.
- **No black void.** Unexplored land is parchment with ink cloud swirls, like an old campaign map, and the world's edge fades into it. Explored-but-unseen tiles keep a grey wash.
- **Grid off by default.** The hovered hex gets a soft outline; G toggles a faint full grid.
- **Rivers and roads.** Rivers 3px wide with a lighter centre, widening towards the sea. Roads become dirt tracks with stones; bridges appear where a road crosses a river.
- **Improvements.** Distinct pixel art for farm rows, mine entrances, pasture fences, plantation rows, quarry cuts, camp tents, fishing boats and forts.
- **Strategic zoom.** Below 60% zoom, units become faction-coloured class icons on small banners, cities become name plates, and terrain simplifies, so a whole Large map stays readable.

### 4.2 Borders

- One continuous outer edge per territory: a 2px line in the faction colour with a 2px darker line inside it, plus a 12% colour tint on owned land. Lines between your own cities disappear.
- At war, an enemy's border line becomes dashed. Tiles you could buy show their price only when the city screen is open.

### 4.3 Units

- **One sprite per unit, built from LPC layers.** A new tool, `tools/gen/lpc-units.mjs`, downloads the Universal LPC Spritesheet Character Generator from GitHub at a fixed version into a cache (not committed), then builds each unit's 64px sheet from a recipe in `rules/<mod>/art/units.recipes.json`. Each recipe lists the body, head, hair, armour, helmet, weapon and shield layers. The tool collects every layer's author and licence into the sheet's `credits` and into `CREDITS.md` automatically, and a sheet with a missing credit fails the check.

```json
{ "unit": "legionary", "base": "body/male/light", "layers": ["torso/armour/plate/male", "legs/armour/plate/male", "head/helmet/legion/male", "weapon/sword/gladius", "shield/scutum"], "tint": ["torso/clothes/tunic"], "attackAnim": "slash" }
```

- **Faction colours by palette swap.** Cloth layers named in `tint` are drawn in a reserved mask colour, recoloured to the faction's colours when the game loads and cached, so one sheet serves all eight factions.
- **What LPC can't do is drawn in code** in the same 64px style: horses (with the LPC rider's upper body on top), chariots, elephants, siege engines, ships, and the Witcher's monsters. For Killzone, your own pixel trooper code from the Killzone repo is adapted as `layout: "code"` sheets, so the ISA and Helghast look like your battle prototype.
- **On the map.** Each unit stands on a small faction-coloured base with a class pennant. The HP bar shows only when the unit is hurt, plus status badges (fortified, asleep, healing) and a count when a civilian shares the hex.
- **Portraits from the same layers.** Unit and leader portraits are the LPC character at 4x scale, cropped to head and shoulders inside a brass frame. Leaders get a recipe of their own (crown, laurel, headdress), so diplomacy has faces without a painter.

### 4.4 Cities

- Code-drawn city sprites in 4 size tiers (population 1 to 3, 4 to 6, 7 to 10, 11 and over), with a different building style per era and per skin: mudbrick and stone for the ancient world, timber and slate for the Witcher, bunkers and pylons for Killzone.
- Walls appear as a ring when built, a star marks the capital, and smoke rises from a city that is producing.
- The name plate shows population, the current build with its turns left, a faction banner, and an HP bar when damaged.

### 4.5 Resources

A 16px pixel icon per resource on a small round token (wheat, rice, cattle, deer, fish, stone, wine, incense, silk, horses, iron and the rest), drawn from the icon set. Strategic resources stay hidden until their tech, as now.

### 4.6 Animation and feedback

| Moment | What you see and hear |
| --- | --- |
| Move | Walk cycle along the path at the chosen speed (normal, fast, instant) |
| Melee attack | Attacker lunges, spark and flash on impact, red damage numbers float up from both units, a clash sound |
| Ranged attack | Arrow or stone arc to the target, then the hit |
| Death | Unit fades and drops its banner |
| City founded or captured | Short banner across the screen in the faction's colours |
| Tech or civic finished | Chime, plus the progress ring glows gold |
| New turn | "Turn 143" ribbon for one second, then the camera goes to the first thing that needs you |
| Rival turns | Optional quick view of rival moves you can see, at double speed (Settings) |

**Sound** is synthesised in the browser (no recordings needed): clicks, end-turn horn, sword clash, bow release, building finished and so on. They go through a sound registry, like the art registry, so real recordings can replace them later. There are separate volume sliders for effects and music, and music stays an empty slot for now.

## 5. Menus, screens and settings

Every screen is redesigned around a laptop session: start or continue in two clicks, find any information in one, and change how the game feels without restarting.

### 5.1 Menus

| Screen | Today | Redesign |
| --- | --- | --- |
| Title | Cream card of six buttons over a hex pattern | A generated world slowly panning behind the menu (seeded, cosmetic only); Continue shows the latest save's faction, turn and a small map thumbnail; Quick start (last setup, new seed) one click away |
| New game setup | One 2,500px scroll, Start button overlapping a heading | Two-pane sheet that fits 1366x768 without scrolling: tabs on the left (Rules, Map, Players, Victory, Advanced), choices in the middle, and a summary card on the right with the chosen faction's portrait, trait, unique unit and building, plus the Start button. Faction picker as a grid of leader portraits. Rival rows collapse into "3 random rivals" unless opened |
| Load | Plain list | Cards with faction, leader portrait, turn, date and a map thumbnail; sort by date; delete with confirm; autosaves grouped separately |
| In-game menu | Save name box, buttons and a raw save code | Resume, Save, Load, Settings, Help, Exit to title. "Share as code" moves into the Save dialog |
| Settings | Motion and developer mode only | The full list below, reachable from the title and in game, applied at once and remembered |
| Help | None | Keyboard shortcuts sheet (also on ?), a short "How to play" in plain English, and the glossary of yields and terms |

### 5.2 Settings for laptop play

| Group | Setting | Values (default in bold) |
| --- | --- | --- |
| Interface | UI scale | 90%, **100%**, 110%, 125% |
| Interface | Tooltip delay | Instant, **Short (400ms)**, Long, Off |
| Interface | Confirm before ending a turn with units unmoved | **On**, Off |
| Interface | Auto end turn when nothing needs you | **Off**, On |
| Map | Hex grid | **Off**, On (also G) |
| Map | Yield icons on tiles | **Off**, On (also Y) |
| Map | Edge scrolling with the mouse | **Off**, Slow, Fast |
| Map | Zoom speed | Slow, **Normal**, Fast |
| Map | Water and cloud animation | **On**, Off |
| Pace | Unit movement speed | **Normal**, Fast, Instant |
| Pace | Show rival moves you can see | **Quick**, Full, Off |
| Pace | Camera follows combat | **On**, Off |
| Sound | Master, effects, music volume | Sliders, **70%** |
| Accessibility | Faction colours | **Standard**, Colour-blind safe |
| Accessibility | Motion | **Follow my device**, Reduce, Full |
| Saves | Autosave | **Every turn**, Every 5 turns, Off; keep **3** to 10 |
| Developer | Developer mode | **Off**, On |

### 5.3 Game screens

- **City screen.** A left-side parchment panel (420px) with the map still showing on the right, and worked tiles, yields and buyable tiles drawn on the map. Tabs: Production (ranked list with icons, turns, gold and faith prices, the queue with drag or arrows), Buildings (built and available, with what each gives), Citizens (focus buttons and locks). Previous and next city arrows, plus \[ and \] keys.
- **Tech and civics trees.** A real tree: era bands left to right, connecting lines between prerequisites, the current path highlighted in gold, finished items dimmed, boosts shown as a small badge. Pan with drag or the mouse wheel, search box, zoom out to see the whole tree.
- **Empire.** Keep the tabs, but give the government screen card art (policy cards as small illustrated cards in slot colours) and a city overview table (population, yields, production, sortable).
- **Diplomacy.** Leader portrait large, opinion meter with its reasons, relationship timeline, and a two-column deal table (you give, they give) where items are clicked across instead of typed into number boxes.
- **Victory.** The same five panels, plus a small line chart of each faction's score and progress over time.
- **AI journal.** Filters by faction, turn range and planner, with strategy changes pinned at the top.
- **Battle card and tactical battle.** Odds card shows both units' portraits and a list of modifiers. The tactical field gets the same terrain art, LPC soldiers instead of stick figures, and a slimmer control panel.
- **Turn summary.** At the start of each turn, a small collapsible list of what happened while you were away (cities grown, buildings finished, units attacked, deals offered), each item clickable.

## 6. Phases G1 to G8

Eight phases, each one visible on its own: G1 lays the foundations nobody sees but every later phase needs, G2 to G6 transform the main game screen, and G7 and G8 redo the menus and the full-screen screens.

**Before G1.** Export this doc as Markdown and commit it as `docs/OVERHAUL.md` (same way as `docs/PLAN.md`). Each prompt below is pasted into a new Claude Code (cloud) session on the Atlas repo.

**How visual work is checked.** G1 adds `npm run shots`, which loads three fixed turn-120 saves (base game, Witcher, Killzone) and captures a standard set of screenshots at 1366x768 and 1920x1080. Every phase must run it before and after, look at the images itself and fix what looks wrong, then commit the "after" set to `docs/shots/G<n>/` so you can browse them on GitHub from your laptop.

### G1: Foundations for the new look

**Goal.** The tools, tokens, fonts, icons, tooltips and sound registry that every later phase uses, plus the screenshot harness. The game looks almost the same afterwards.

**Check on your laptop.**

- [ ] `docs/shots/G1/` on GitHub shows the turn-120 game for all three rulesets at both sizes.
- [ ] Hovering any yield in the top bar shows a tooltip breaking it down by source.
- [ ] Settings has a UI scale option and changing it resizes the whole interface.
- [ ] Buttons and headings use the new fonts.

**Prompt**

```text
Graphics and UI overhaul, phase G1. Read docs/OVERHAUL.md fully (sections 2, 3 and 7 matter most now) and CLAUDE.md.

1. Freeze the phone layout: switch off the phone Playwright projects (keep the files, mark them skipped with a note pointing to docs/OVERHAUL.md) and note in docs/DECISIONS.md that the overhaul targets screens 1280px wide and up.
2. Add npm run shots (tools/shots.mjs): build three deterministic turn-120 saves in Node (base-ancient, witcher, killzone; the human seat played by the AI, Standard map, fixed seeds) into test/fixtures/saves/, load each through Import code in Playwright, and capture the map at normal and zoomed-out view, a selected unit, the city drawer, the tech tree, Empire, Diplomacy, Victory, the menu, setup and title, at 1366x768 and 1920x1080, into shots/ (git-ignored). Add an option to copy a set into docs/shots/<name>/.
3. Split src/ui/game.js (1,399 lines) into focused files under src/ui/hud/ and src/ui/screens/ with no change in behaviour.
4. Design tokens from section 2 in css/tokens.css (walnut, brass, parchment, ink, accent, yield colours), skin overrides for witcher and killzone through skin.json, and a --ui-scale variable driven by a new UI scale setting.
5. Fonts: Cinzel and Alegreya Sans from the @fontsource packages, copied as woff2 into assets/fonts/ by a tool, credited in CREDITS.md, licence files included.
6. Icons: tools/gen/icons.mjs draws about 60 16x16 pixel icons (yields, amenities, strength, ranged strength, moves, HP, unit classes, lenses, screen buttons, statuses, every resource) into one SVG sprite at assets/icons.svg, with an <Icon> helper for the UI and an art id for the map.
7. A tooltip system (src/ui/hud/tooltip.js): delay from settings, rich content (title, lines with icons, a key hint), long-press on touch, never hover-only. Wire it to the top bar yields now.
8. A sound registry (src/render/audio/) like the art registry, with sounds synthesised by WebAudio for click, end turn, clash, bow, built, tech done and city founded, volume settings, and silence until the player first interacts.

Run npm run shots before you start and after you finish, look at both sets yourself, and commit the after set to docs/shots/G1/. Then follow the Definition of done in CLAUDE.md.
```

### G2: The new HUD

**Goal.** A full-screen map with walnut-and-brass panels floating over it, as in section 3, giving about 50% more visible map at 1366x768.

**Check on your laptop.**

- [ ] The map fills the window under a slim top bar; no empty side columns.
- [ ] Notifications sit top right and each one jumps to its place.
- [ ] The minimap shows the world and clicking it moves the camera.
- [ ] Hovering a hex shows its terrain, yields, owner and improvement.
- [ ] The end-turn button names what blocks the turn, with the advice line above it.

**Prompt**

```text
Graphics and UI overhaul, phase G2. Read docs/OVERHAUL.md sections 2 and 3, and look at docs/shots/G1/.

Rebuild the game screen as section 3 describes: the map canvas fills the window under a 44px top bar; floating walnut panels with brass edges for the progress widget (top left, research and civic with progress rings), notifications (top right, replacing the left needs-attention column, icons, click to jump, right-click to dismiss, max 6 shown), the selection panel (bottom left, 380x200, portrait slot, HP bar, stats with icons, action buttons showing their keys), the minimap (bottom right, 240x160, fog-aware, faction colours, view frame, click and drag to move the camera) and the end-turn cluster with the advice line above it and three map toggles (lenses menu, yield icons, hex grid) below.

The top bar shows every yield as icon plus number with breakdown tooltips, the turn and date, and icon buttons for Empire, Diplomacy, Victory, Journal and Help. No underlined links anywhere in the HUD. Add hex hover tooltips (terrain, feature, resource, yields, owner, improvement, units) and a unit tooltip. The camera keeps the selected unit out from under panels. Escape closes any open sheet.

Keep every existing feature reachable and every browser test passing (update selectors as needed). Run npm run shots before and after, look at both sets yourself, fix anything cramped or overlapping at 1366x768, and commit the after set to docs/shots/G2/. Then follow the Definition of done in CLAUDE.md.
```

### G3: Terrain, borders and the strategic view

**Goal.** The map gains soft edges, coastlines, light, tall mountains and forests, clean borders and a readable zoomed-out view, as in sections 4.1 and 4.2.

**Check on your laptop.**

- [ ] Coasts have a shallow band and foam; grassland fades into plains instead of stopping at a hard edge.
- [ ] Mountains and forests stand up from the map and overlap the hex behind them.
- [ ] Unexplored areas look like parchment and clouds, not black.
- [ ] Borders are one clean line round each territory with a light tint.
- [ ] Zooming right out turns units into small banners and the whole map stays readable.

**Prompt**

```text
Graphics and UI overhaul, phase G3. Read docs/OVERHAUL.md sections 2 and 4.1 to 4.2, and look at docs/shots/G2/.

Rework the terrain renderer as section 4.1 says, keeping the chunk cache and the frame-time budget: dithered blending between neighbouring terrains baked into chunks, coastlines with a shallow band and foam, deep and shallow water, one light direction (top left) for all shading and shadows, mountains, hills, forests and jungle as depth-sorted props taller than their hex, unexplored land as parchment with ink clouds and the world edge fading into it, the grid off by default with a hover outline and a G toggle, wider rivers that widen to the sea, dirt roads with bridges, and distinct art for every improvement. Draw borders as section 4.2 says: one outer edge per territory with a darker inner line and a 12% tint, dashed when at war. Add the strategic view below 60% zoom.

All terrain art must stay code-drawn and go through the art registry with ids, so a skin can replace it. Give Witcher and Killzone their own terrain palettes through skin.json (colder and darker for Witcher, scorched greys and rust for Helghan in Killzone). Water sparkle and cloud drift go on the cosmetic random stream and respect the animation setting.

Measure frame time on the turn-120 Large fixture before and after; it must stay under the section 11.6 target in docs/PLAN.md. Run npm run shots, look at the results critically against section 4.1, fix what reads badly, and commit the after set to docs/shots/G3/. Then follow the Definition of done in CLAUDE.md.
```

### G4: A sprite for every unit

**Goal.** Every unit in every ruleset has its own recognisable sprite and portrait, in faction colours, as in section 4.3.

**Check on your laptop.**

- [ ] In the base game, a warrior, spearman, archer, swordsman, horseman, catapult, builder, settler and trireme all look different.
- [ ] Two factions' swordsmen look alike but in their own colours.
- [ ] The Witcher has witchers with two swords and drowners; Killzone's ISA and Helghast look like your battle prototype.
- [ ] `CREDITS.md` lists every LPC artist used.

**Prompt**

```text
Graphics and UI overhaul, phase G4. Read docs/OVERHAUL.md section 4.3, docs/PLAN.md section 10.6, and the Universal LPC Spritesheet Character Generator repository on GitHub (its layer folders and its credits data).

Write tools/gen/lpc-units.mjs: download the generator at a pinned commit into a git-ignored cache, read recipes from rules/<mod>/art/units.recipes.json, composite each unit's layers into a 64px sheet in the classic LPC layout (pngjs as a dev dependency is fine), draw the layers listed in "tint" in a reserved mask colour, and write assets/sprites/<skin>/<unit>.png plus its descriptor with full per-layer credits. Fail if any layer has no licence or author. Regenerate CREDITS.md from the descriptors.

Write recipes for every base-ancient land unit (warriors, spears, archers, slingers, swords, unique units with fitting gear, builders and settlers in work clothes, traders, missionaries, spies) and every Witcher unit (Temerian, Redanian and Nilfgaardian soldiers in their colours, witchers with two swords). Add a runtime palette swap that recolours the mask to each faction's colours once and caches it.

Draw what LPC cannot, in code and the same 64px style, through layout "code": horses carrying the LPC rider's upper body, chariots, elephants, siege engines, ships, and the Witcher monsters. For Killzone, adapt the pixel trooper and vehicle drawing from the accipiter117/Killzone repo (my own code) into layout "code" sheets for every ISA and Helghast unit.

On the map: a faction-coloured base disc, a class pennant, the HP bar only when hurt, status badges and a civilian count. Build portraits (head and shoulders at 4x in a brass frame) for units and for every leader from a leader recipe, and show them in the selection panel and diplomacy.

Run npm run shots, check every unit is distinct at 100% and in the strategic view, and commit the after set plus a contact sheet of all unit sprites to docs/shots/G4/. Then follow the Definition of done in CLAUDE.md.
```

### G5: Cities, resources and improvements

**Goal.** Cities that visibly grow and look like their culture, resources you can tell apart, and readable city name plates, as in sections 4.4 and 4.5.

**Check on your laptop.**

- [ ] A size 2 village and a size 12 city look clearly different.
- [ ] Walls appear around a city once built; the capital has a star.
- [ ] Iron, horses, wheat and wine are recognisable without hovering.
- [ ] Witcher towns look northern and timbered; Killzone cities look like fortified bases.

**Prompt**

```text
Graphics and UI overhaul, phase G5. Read docs/OVERHAUL.md sections 4.4 and 4.5, and look at docs/shots/G4/.

Draw cities in code as depth-sorted props: four size tiers (population 1 to 3, 4 to 6, 7 to 10, 11 and over), a building style per era (taken from the faction's current era) and per skin (ancient mudbrick and stone; Witcher timber, thatch and slate; Killzone bunkers, pylons and floodlights), a wall ring when any wall building exists, a capital star, production smoke on the cosmetic stream, and the faction banner. Rebuild the city name plate: population, current build icon and turns, faction colours, an HP bar when damaged, readable at every zoom and simplified in the strategic view.

Replace resource dots with the resource icons from assets/icons.svg on a small round token, and make every improvement's art match section 4.1 if G3 left any gaps. All of it through art ids so skins can replace it.

Run npm run shots, compare village, town and city at both screen sizes for all three rulesets, and commit the after set to docs/shots/G5/. Then follow the Definition of done in CLAUDE.md.
```

### G6: Movement, combat and sound

**Goal.** Actions feel physical: units walk, attacks land, numbers fly, turns have a rhythm, and you hear it all, as in section 4.6.

**Check on your laptop.**

- [ ] An attack shows a lunge, a flash and damage numbers on both units, with a clash sound.
- [ ] Archers fire a visible arrow.
- [ ] A new turn shows a short ribbon, then the camera goes to the first thing that needs you.
- [ ] With "Show rival moves" on Quick, you see visible enemy moves at double speed.
- [ ] A turn summary lists what happened while you were away.

**Prompt**

```text
Graphics and UI overhaul, phase G6. Read docs/OVERHAUL.md section 4.6, and look at docs/shots/G5/.

Add an animation layer in src/render that plays events from the sim after they happen (it never changes the game): walk cycles along paths at the chosen speed (normal, fast, instant), melee lunges with an impact flash and floating damage numbers, ranged projectiles, death fades, city founded and captured banners, a turn ribbon, the progress ring glowing on tech or civic completion, and camera moves to combat when the setting is on. Rival turns: queue the events of rival moves you can see and replay them quickly, fully or not at all according to the setting, without slowing the worker.

Wire the synthesised sounds from G1 to these events and to buttons, with volume settings. Add the turn summary panel (collapsible, clickable items) built from last round's events.

Everything respects reduced motion (instant moves, no flashes) and the animation settings. Add browser tests that the animation layer never changes the game fingerprint. Run npm run shots plus a short screen recording of one attack if Playwright can capture video, and commit the after set to docs/shots/G6/. Then follow the Definition of done in CLAUDE.md.
```

### G7: Title, setup, load, menu, settings and help

**Goal.** The menus fit a laptop screen and get you into a game in two clicks, with the full settings list from section 5.2.

**Check on your laptop.**

- [ ] The title screen has a moving world behind it, and Continue shows your latest game's turn and faction.
- [ ] The whole setup fits on a 1366x768 screen without scrolling, with a summary and the Start button always visible.
- [ ] Picking a faction shows leader portraits in a grid.
- [ ] Settings has every option in section 5.2, and changes apply straight away.
- [ ] Pressing ? in game shows the keyboard shortcuts.

**Prompt**

```text
Graphics and UI overhaul, phase G7. Read docs/OVERHAUL.md sections 2, 5.1 and 5.2, and look at docs/shots/G6/.

Rebuild the menus in the new style: the title with a seeded generated world slowly panning behind it (cosmetic only, paused under reduced motion), Continue showing faction, leader portrait, turn and a map thumbnail, and Quick start (last setup, new seed). Rebuild setup as a two-pane sheet that fits 1366x768 without scrolling: tabs for Rules, Map, Players, Victory and Advanced; a summary card with the faction's portrait, trait, unique unit and building and the Start button always visible; the faction picker as a portrait grid; rival rows collapsed into a summary unless opened. Rebuild Load as cards with thumbnails, autosaves grouped, delete with confirm. Make the in-game menu Resume, Save, Load, Settings, Help and Exit, with "Share as code" inside the Save dialog.

Build Settings with every option in section 5.2, available from the title and in game, applied immediately and stored in atlas:settings. Make sure every setting actually does something (add the missing behaviours: edge scrolling, zoom speed, confirm before ending a turn with units unmoved, auto end turn, colour-blind faction palette). Add Help with the keyboard shortcuts sheet (also on ?), a plain-English How to play and a glossary.

Run npm run shots, check the setup and settings at 1366x768 have no scrollbars or overlaps, and commit the after set to docs/shots/G7/. Then follow the Definition of done in CLAUDE.md.
```

### G8: The full-screen screens, and a final polish pass

**Goal.** The city screen, trees, Empire, diplomacy, victory, journal and battle screens match the new look and work comfortably with a mouse, then one last pass over the whole game.

**Check on your laptop.**

- [ ] Opening a city keeps the map visible, with worked tiles and yields drawn on it; \[ and \] move between cities.
- [ ] The tech tree has connecting lines, your path in gold, and a search box.
- [ ] Diplomacy shows the leader's portrait and lets you click items across in a deal.
- [ ] The tactical battle uses the new terrain and LPC soldiers.
- [ ] A full Quick game from setup to victory feels consistent from start to end.

**Prompt**

```text
Graphics and UI overhaul, phase G8. Read docs/OVERHAUL.md sections 4.3 and 5.3, and look at docs/shots/G7/.

Rebuild each full screen in the new style as section 5.3 describes: the city screen as a 420px parchment panel beside the live map (Production, Buildings and Citizens tabs, gold and faith prices, the queue with arrows, previous and next city with [ and ]); the tech and civics trees as real trees with era bands, connecting lines, the current path in gold, boost badges, drag and wheel panning, search and zoom-out; Empire with illustrated policy cards and a sortable city table; diplomacy with a large leader portrait, opinion meter and reasons, relationship timeline and a click-across deal table; Victory with a score-over-time chart; the AI journal with faction, turn and planner filters and pinned strategy changes; the battle card with both portraits and the modifier list; and the tactical battlefield with the G3 terrain style, LPC soldiers and a slimmer control panel.

Then polish the whole game: play a Quick Small game through Playwright from setup to victory in each ruleset, read every screenshot, and fix inconsistencies (spacing, fonts, colours, icon use, wording, any leftover underlined link or web-style control). Check the first load stays within the size budget, with art and fonts loaded after the title appears.

Commit the after set to docs/shots/G8/ and write docs/shots/README.md listing what changed from G1 to G8. Then follow the Definition of done in CLAUDE.md.
```

## 7. Other findings and CLAUDE.md additions

A few non-visual issues turned up during the review. They are small enough to fold into the overhaul phases, and are listed so they don't get lost.

| Finding | Where | Suggested fix and phase |
| --- | --- | --- |
| An AI won a culture victory on turn 115 at Standard speed (seed 3, Standard map, 6 factions) | Balance | Far earlier than the 150 to 260 range in the plan. Run the simulator on Standard maps and raise the influence threshold or slow influence gain. Any phase, as a separate short task |
| The tactical battle header still says "Auto-resolve odds: 0% win, 0% loss, otherwise both sides survive" | Tactical battle | Use the same plain verdict (good, even, poor) as the map odds panel. G8 |
| City panel says "Amenities +1 (1 of 0 needed)" | City drawer | Reword as "Amenities: 1 spare" or "needs 1 more". G8 |
| `src/ui/game.js` has grown to 1,399 lines | Code | Split in G1 before any HUD work |
| The phone layout is frozen | Phone | Add a phone pass after G8, rebuilding the bottom sheet and drawer in the new style |
| First load is about 797 KB of the 1 MB budget, before fonts, icons and sprites | Size | Load fonts, icons and sprites after the title appears, and keep sprites out of the first-load count. G1 and G8 |

**Add to CLAUDE.md in G1**

```markdown
## Visual work (graphics and UI overhaul, docs/OVERHAUL.md)
- Target screens 1280px wide and up. The phone layout is frozen until a later phone pass;
  phone Playwright projects are skipped, not deleted.
- Use the tokens in css/tokens.css and the icons in assets/icons.svg. No hard-coded colours,
  no text standing in for an icon, no underlined links in the HUD.
- One light direction (top left) for every shadow and highlight on the map.
- All art and sound go through the registries by id, with code placeholders, so skins can
  replace anything and nothing breaks while art is missing.
- Run npm run shots before and after any visual change, look at the images yourself, fix what
  looks wrong, and commit the after set to docs/shots/<phase>/.
- Animation is presentation only: it plays events after they happen and must never change
  the game. Respect reduced motion and the animation settings.
- Every LPC layer used must have its author and licence recorded; check-data fails otherwise.
```
