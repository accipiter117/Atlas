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

## Later

- Nothing yet.
