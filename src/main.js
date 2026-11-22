// Entry point. Wires the pieces together and starts the interface.
// Later phases add loading the ruleset (fetching JSON happens only here),
// saves and the game loop.

import { startApp } from './ui/app.js';

startApp(document);
