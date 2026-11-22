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
