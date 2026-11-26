# Atlas

A hex-based, Civilization-style strategy game for the laptop browser. Every faction, unit, rule and franchise arrives as a stackable data mod, so the same engine can play an ancient world tonight and a Witcher conversion tomorrow.

Play it: https://accipiter117.github.io/Atlas/

## Where things stand

Phase 8 of 22. Pick one of eight peoples, found cities, research a 40-tech tree with boosts, raise buildings and wonders, improve the land, and face rivals who expand, declare war and explain themselves in a journal, with odds shown before every attack, on a seeded hex world under fog of war. The rules load from stackable data mods (see the Mods screen). Victory, game setup and saving come next. See `CHANGELOG.md` for progress and `docs/PLAN.md` for the whole plan.

## Running it

Everything runs in the browser from GitHub Pages; nothing needs installing to play. For development (in Claude Code or any machine with Node 22):

- `npm ci` installs the dev tools
- `npm start` serves the game at http://127.0.0.1:4173/
- `npm run check` runs the repo checks, lint and unit tests
- `npm run smoke` runs the browser tests and saves screenshots to `test-results/`

## Licence

The MIT licence in `LICENSE` covers the code only. Franchise names and settings used by conversion mods belong to their owners; Atlas is a non-commercial fan project and uses names and facts only, never copied text or art. LPC sprite art keeps its own licence, credited per sheet in `CREDITS.md`.
