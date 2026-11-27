# Unit art tools (graphics overhaul G4)

Used only by `tools/gen/lpc-units.mjs`, never loaded by the game.

- `compose.html`, `compose.js`: run in headless Chromium. They composite LPC
  layers into one sheet per unit, turn the "tint" layers into the reserved
  mask colour (the game recolours it to each faction's colour), and draw the
  units the LPC generator has no parts for (horses, chariots, elephants,
  siege engines, ships, the Witcher's monsters) as original pixel art in code.
- `killzone/`: `pixel-troopers.js`, `puppet.js` and `tanks.js` copied
  unchanged from Matthew's own Killzone: Front Line project
  (github.com/accipiter117/Killzone, `src/render/`, commit 21dcd10), used to
  draw the ISA and Helghast troopers and tanks for the Killzone conversion.
