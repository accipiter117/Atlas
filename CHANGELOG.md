# Changelog

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
