# Changelog

## Phase 1: Repo, rules of the road and the empty engine

What you can try: open the GitHub Pages link, see the title screen, press New game and end a few turns. The seat order changes every game (it comes from the seed), and computer seats pass instantly because there is no AI yet.

- Title screen with Continue (disabled until saves exist), New game, Load, Mods and Settings. Works with mouse, keyboard (arrow keys, Enter, Escape) and touch; every button is at least 44px.
- A temporary phase 1 test bench behind New game: turn counter, seat order, End turn, plus the seed and the game's fingerprint.
- Deterministic core: seeded randomness (mulberry32 with named sub-streams), hex maths (pointy-top axial: distance, neighbours, rings, lines, pixel conversion), stable hashing, copying and ids.
- Minimal rules engine: `createGame`, `applyCommand` with the `endTurn` command, seat order from the seed, `fingerprint`.
- Saves: gzip codec that works in the browser and in Node, `ATLAS1:` export codes, a save skeleton at save version 1 and the migration runner.
- Checks: module boundaries (section 7), no em or en dashes, British spelling in player text, first-load size budget, eslint at 0 warnings, 39 unit tests and browser smoke tests at 1366x768, 1920x1080 and touch-only 820x1180.
- GitHub Actions runs `npm ci`, `npm run check` and `npm run smoke` on every push.
