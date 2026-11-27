# Screenshots of the graphics and UI overhaul

Each folder holds the same set of screenshots (G8 and G9 also have a page showing them all, so they can be browsed here), taken by `npm run shots` (tools/shots.mjs) from three fixed turn-120 games (the base game, the Witcher and Killzone) at 1366x768 and 1920x1080: the title, setup, the map, the map zoomed out, a selected unit, a city, the tech tree, Empire, Diplomacy, Victory and the menu. The plan is in [docs/OVERHAUL.md](../OVERHAUL.md).

| Phase | Folder | What changed |
| --- | --- | --- |
| G1 | [G1](G1/) | Foundations: design tokens, the Cinzel and Alegreya Sans fonts, 65 pixel icons, tooltips on the top bar's yields, interface size, sound settings and a sound registry. The game looks almost as before. |
| G2 | [G2](G2/) | The new game screen: the map fills the window under a 44px top bar; walnut and brass panels float over it (research and civic rings, notifications, the selection panel, the end-turn cluster with its toggles, the minimap); hex tooltips; Help. |
| G3 | [G3](G3/) | Terrain with soft dithered edges, coastlines with foam and beaches, tall mountains, hills and forests lit from the top left, rivers and dirt roads with bridges, improvement art, parchment for the unexplored, new borders, and the strategic view below 60% zoom. |
| G4 | [G4](G4/) | A sprite for every unit in every ruleset, built from LPC layers or drawn in code (and Matthew's own Killzone troopers and tanks), in faction colours, with portraits for units and leaders. See also [the contact sheet](G4/contact-sheet.png). |
| G5 | [G5](G5/) | Cities drawn by size, era and skin with walls and banners, new name plates showing the current build, and resource icons on tokens. |
| G6 | [G6](G6/) | Movement, combat and sound: walks, lunges, arrows, flashes, damage numbers, banners, the turn ribbon, rivals' moves replayed, the turn summary. [A short recording of an attack](G6/attack.webm). |
| G7 | [G7](G7/) | The menus: a living world behind the title, Continue and Load cards with portraits and map thumbnails, Quick start, setup on one screen with tabs and a summary card, the full Settings list, the new in-game menu and Help. |
| G8 | [G8](G8/) | The full screens: real tech and civics trees, the parchment city screen with tabs and a queue, Empire's illustrated cards and Cities table, the Victory score chart, journal filters, the opinion meter, the battle card's face-off and a battlefield drawn with the units' own sprites; plain-English odds and amenities. |
| G9 | [G9](G9/) | Polish after review: the zoomed-out view keeps to your explored land and centres on your empire, strategic banners show each unit's class, units without pennants and with status badges only on hover or selection, towns drawn over crowded garrisons, a compact selection panel that keeps city names clear, Killzone's own tech and civic trees, and fog of war with dithered edges. |
| K1b | [K1b](K1b/) | Killzone Extrasolar War: a two-world Killzone game with the world switcher in the top bar, on Vekta and on Helghan (a stand-in map). |
| K2 | [K2](K2/) | Killzone: Extrasolar War: the star map (eight worlds, lanes, fleets, status cards), a fleet's orders, and an army landed on Halcyon. |
| K3 | [K3](K3/) | Killzone: Extrasolar War: war infrastructure round Vekta Landing (placeholder art), a unit cut off from supply, and the star map. |
| K4 | [K4](K4/) | Killzone: Extrasolar War: six factions in setup, the Home Guard on Vekta, the war's research tree, and a base's build list. |
