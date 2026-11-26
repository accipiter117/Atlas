# Atlas

A hex-based, Civilization-style strategy game for the laptop browser. Every faction, unit, rule and franchise arrives as a stackable data mod, so the same engine can play an ancient world tonight and a Witcher conversion tomorrow.

Play it: https://accipiter117.github.io/Atlas/

## Where things stand

Phase 12 of 22: the playable core with civics, governments, policy cards and diplomacy (deals, treaties, alliances and teams), fast on big maps, with difficulty levels and rivals that move in the background: set up a match, play a whole game against computer rivals to a conquest, science or score victory, and save, load, export and import it. Pick one of eight peoples, research a 40-tech tree, raise buildings and wonders, and fight with odds shown before every attack, on a seeded hex world under fog of war. The rules load from stackable data mods (see the Mods screen). Religion comes next. `npm run sim` plays AI against AI; see `docs/AI_TUNING.md`. See `CHANGELOG.md` for progress and `docs/PLAN.md` for the whole plan.

## Running it

Everything runs in the browser from GitHub Pages; nothing needs installing to play. For development (in Claude Code or any machine with Node 22):

- `npm ci` installs the dev tools
- `npm start` serves the game at http://127.0.0.1:4173/
- `npm run check` runs the repo checks, lint and unit tests
- `npm run smoke` runs the browser tests and saves screenshots to `test-results/`

## Licence

The MIT licence in `LICENSE` covers the code only. Franchise names and settings used by conversion mods belong to their owners; Atlas is a non-commercial fan project and uses names and facts only, never copied text or art. LPC sprite art keeps its own licence, credited per sheet in `CREDITS.md`.
