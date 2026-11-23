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

## Later

- Nothing yet.
