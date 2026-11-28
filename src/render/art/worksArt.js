// War works on the map (Killzone Extrasolar War K3 rules, K7 art): trenches, wire, machine gun
// nests, bunkers, gun and anti-air batteries, arc towers, minefields, landing bays, depots,
// command posts, field hospitals and comms relays, drawn in code as pixel art in a hex's art
// space (about 20 by 16 art pixels round its centre). Light comes from the top left like the
// rest of the map: lit faces up and left, shade and a soft shadow down and to the right.
// Original art for Atlas. Presentation only.

import { shade } from './placeholders.js';

const SANDBAG = '#b9a77a';
const CONCRETE = '#9a9a92';
const STEEL = '#6f767d';
const GUNMETAL = '#33373c';
const SHADOW = 'rgba(0, 0, 0, 0.28)';
const ARC = '#ff8a3c';
const ARC_CORE = '#ffe6b0';
const SIGNAL = '#e05a3a';
const BAY_LIGHT = '#7fd0ff';
const MARKING = '#e8d070';
const CANVAS_WHITE = '#e9e2d0';
const CROSS = '#c0392b';

/** Draw one war work at (cx, cy) in art pixels; false when `id` is not a war work. */
export function drawWorkArt(ctx, cx, cy, id, colours) {
  const ink = colours.ink;
  const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(cx + x, cy + y, w, h); };
  // A soft shadow down and to the right of a shape's footprint.
  const shadow = (x, y, w, h) => px(x + 1, y + 1, SHADOW, w, h);
  // One sandbag: lit top left, shaded bottom right.
  const bag = (x, y) => { px(x, y, SANDBAG, 3, 2); px(x, y, shade(SANDBAG, 0.18), 2, 1); px(x + 2, y + 1, shade(SANDBAG, -0.3)); };
  switch (id) {
    case 'trench': {
      // A zigzag cut through the ground: a dark channel with duckboards, a few sandbags on the
      // lip of the enemy-facing (upper) side and pale spoil thrown up along the lower side.
      const path = [[-10, 1], [-6, -3], [-2, 1], [2, -3], [6, 1], [10, -3]];
      const cells = [];
      for (let k = 0; k < path.length - 1; k += 1) {
        const [x0, y0] = path[k];
        const [x1, y1] = path[k + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let s2 = 0; s2 <= n; s2 += 1) cells.push([Math.round(x0 + ((x1 - x0) * s2) / n), Math.round(y0 + ((y1 - y0) * s2) / n)]);
      }
      for (const [x, y] of cells) px(x, y + 2, shade(colours.spoil, 0.3), 2, 2); // spoil
      for (const [x, y] of cells) px(x, y - 1, shade(colours.spoil, -0.2), 2, 1); // the lit far wall
      for (const [x, y] of cells) px(x, y, shade(colours.spoil, -0.65), 2, 2); // the cut
      for (const [x, y] of cells) if ((x + 20) % 4 === 0) px(x, y + 1, shade(colours.timber, 0.1)); // duckboards
      for (const [x, y] of [[-7, -5], [1, -5], [9, -5]]) bag(x, y);
      return true;
    }
    case 'wire': {
      // Three crossed pickets with loops of concertina wire between them.
      for (const x of [-8, -1, 6]) {
        shadow(x, -3, 1, 6);
        px(x - 1, -3, colours.timber); px(x, -2, colours.timber); px(x + 1, -1, colours.timber);
        px(x + 1, -3, shade(colours.timber, -0.2)); px(x - 1, -1, shade(colours.timber, -0.2));
        px(x, -1, colours.timber, 1, 4);
      }
      for (let k = -9; k <= 8; k += 2) {
        const y = -2 + ((k + 9) % 4 === 0 ? 0 : 1);
        px(k, y, shade(STEEL, 0.4)); px(k + 1, y + 1, STEEL); px(k, y + 2, shade(STEEL, -0.2)); px(k - 1, y + 1, shade(STEEL, 0.15));
      }
      px(-9, 3, SHADOW, 18, 1);
      return true;
    }
    case 'mg_nest': {
      // A ring of sandbags round a dark pit, a gun on its tripod pointing out to the right.
      shadow(-7, 3, 14, 2);
      px(-5, -2, shade(colours.spoil, -0.6), 10, 5);
      for (const [x, y] of [[-7, -2], [-4, -4], [-1, -4], [2, -4], [-7, 1], [-4, 3], [-1, 3], [2, 3], [5, 1]]) bag(x, y);
      px(-1, -1, GUNMETAL, 2, 2); // receiver
      px(1, -1, GUNMETAL, 8, 1); // barrel
      px(1, -2, shade(GUNMETAL, 0.4), 6, 1);
      px(9, -2, shade(GUNMETAL, 0.2), 1, 3); // muzzle
      px(-2, 1, GUNMETAL); px(1, 1, GUNMETAL); // tripod feet
      px(-3, -2, ink, 2, 1); // the gunner's helmet
      return true;
    }
    case 'bunker': {
      // A squat concrete pillbox with a lit roof, a dark firing slit and earth heaped round it.
      shadow(-8, -3, 17, 9);
      px(-9, 2, shade(colours.spoil, 0.05), 18, 3); // earth bank
      px(-7, -4, shade(CONCRETE, -0.1), 14, 8); // walls
      px(-7, -5, shade(CONCRETE, 0.25), 14, 2); // roof, lit
      px(-7, -5, shade(CONCRETE, 0.4), 1, 8); // lit left edge
      px(6, -4, shade(CONCRETE, -0.35), 1, 8); // shaded right edge
      px(-4, -1, ink, 9, 2); // firing slit
      px(-4, -2, shade(CONCRETE, -0.45), 9, 1);
      px(-6, 2, shade(CONCRETE, -0.3), 12, 1);
      for (const x of [-5, 0, 4]) px(x, -4, shade(CONCRETE, 0.1)); // shuttering marks
      return true;
    }
    case 'artillery_battery': {
      // A field gun in a horseshoe of sandbags, its long barrel raised to the right, shells stacked.
      shadow(-8, 0, 16, 5);
      for (const [x, y] of [[-8, 1], [-8, -1], [-6, 3], [-3, 4], [0, 4], [3, 3]]) bag(x, y);
      px(-4, 1, GUNMETAL, 5, 2); // breech and trail
      px(-4, 1, shade(GUNMETAL, 0.35), 5, 1);
      for (let k = 0; k < 9; k += 1) px(1 + k, -k, k % 3 ? STEEL : shade(STEEL, 0.4), 2, 1); // barrel
      px(9, -9, GUNMETAL, 2, 2);
      px(-3, 3, ink, 2, 2); px(1, 3, ink, 2, 2); // wheels
      px(-2, 3, shade(STEEL, 0.3)); px(2, 3, shade(STEEL, 0.3));
      for (const [x, y] of [[5, 2], [6, 2], [7, 2]]) { px(x, y, MARKING); px(x, y + 1, shade(MARKING, -0.4)); } // shells
      return true;
    }
    case 'anti_air_battery': {
      // A round concrete pad, a turret and twin barrels pointing up into the sky.
      shadow(-6, 1, 13, 4);
      px(-6, 1, CONCRETE, 12, 4);
      px(-5, 0, shade(CONCRETE, 0.25), 10, 1);
      px(-6, 4, shade(CONCRETE, -0.3), 12, 1);
      px(-3, -2, STEEL, 6, 4); // turret
      px(-3, -2, shade(STEEL, 0.35), 6, 1);
      px(2, -2, shade(STEEL, -0.3), 1, 4);
      for (let k = 0; k < 7; k += 1) { px(-1 + Math.floor(k / 2), -3 - k, GUNMETAL); px(1 + Math.floor(k / 2), -3 - k, k % 2 ? GUNMETAL : shade(GUNMETAL, 0.3)); } // twin barrels
      px(-1, -3, shade(GUNMETAL, 0.4)); px(1, -3, shade(GUNMETAL, 0.4));
      px(-5, 1, SIGNAL); // a red warning light
      return true;
    }
    case 'arc_tower': {
      // A Helghast arc tower: three iron legs, a stack of coil rings and a glowing petrusite crown.
      shadow(-4, 3, 9, 2);
      for (const [x0, x1] of [[-5, -1], [5, 1], [0, 0]]) {
        for (let k = 0; k < 5; k += 1) px(Math.round(x0 + ((x1 - x0) * k) / 4), 4 - k, shade(STEEL, -0.25));
      }
      for (let k = 0; k < 4; k += 1) {
        const y = -1 - k * 2;
        px(-2, y, shade(STEEL, 0.3), 5, 1);
        px(-2, y + 1, shade(STEEL, -0.35), 5, 1);
      }
      px(0, -9, ARC, 1, 9); // the glowing core through the rings
      px(-2, -11, ARC, 5, 3); // crown
      px(-1, -11, ARC_CORE, 2, 2);
      px(-4, -12, shade(ARC, 0.2)); px(4, -10, shade(ARC, 0.2)); px(-3, -9, ARC); // sparks
      return true;
    }
    case 'minefield': {
      // Half-buried mines with their prongs showing, and a warning sign on a post.
      for (const [x, y] of [[-7, -1], [-3, 2], [1, -3], [4, 1], [-1, 4], [6, -2]]) {
        px(x, y, shade(STEEL, -0.2), 3, 1); px(x, y + 1, SHADOW, 3, 1);
        px(x + 1, y - 1, shade(STEEL, 0.35)); // the prong
      }
      px(7, 0, colours.timber, 1, 5); // post
      px(5, -3, MARKING, 5, 3); px(6, -4, MARKING, 3, 1); px(7, -2, ink); // sign
      return true;
    }
    case 'landing_bay': {
      // An octagonal concrete pad with a yellow H, edge lights and approach chevrons.
      shadow(-8, -5, 17, 11);
      px(-7, -5, CONCRETE, 14, 11);
      px(-8, -4, CONCRETE, 16, 9);
      px(-7, -5, shade(CONCRETE, 0.25), 14, 1); px(-8, -4, shade(CONCRETE, 0.2), 1, 9);
      px(-7, 5, shade(CONCRETE, -0.3), 14, 1); px(7, -4, shade(CONCRETE, -0.3), 1, 9);
      px(-3, -3, MARKING, 1, 6); px(2, -3, MARKING, 1, 6); px(-3, 0, MARKING, 6, 1); // H
      for (const [x, y] of [[-7, -5], [6, -5], [-8, 0], [7, 0], [-7, 5], [6, 5]]) px(x, y, BAY_LIGHT);
      for (const x of [9, 11]) { px(x, -1, MARKING); px(x + 1, 0, MARKING); px(x, 1, MARKING); } // chevrons
      return true;
    }
    case 'supply_depot': {
      // Strapped crates in a stack and a row of fuel drums.
      shadow(-8, -3, 12, 8);
      const crate = (x, y) => { px(x, y, colours.timber, 5, 4); px(x, y, shade(colours.timber, 0.25), 5, 1); px(x + 4, y, shade(colours.timber, -0.3), 1, 4); px(x + 2, y, shade(colours.timber, -0.15), 1, 4); };
      crate(-8, 0); crate(-3, 0); crate(-6, -4);
      for (const x of [3, 5, 7]) { px(x, 0, '#4f6a4a', 2, 4); px(x, 0, shade('#4f6a4a', 0.3), 1, 4); px(x, 1, shade('#4f6a4a', -0.3), 2, 1); } // drums
      px(3, 4, SHADOW, 6, 1);
      return true;
    }
    case 'command_post': {
      // A sandbagged hut with a radio mast, an aerial wire and a flag.
      shadow(-7, -2, 13, 7);
      px(-6, -3, shade(colours.timber, -0.1), 11, 6); // hut
      px(-7, -4, shade(colours.spoil, -0.1), 13, 2); // roof sheet
      px(-7, -4, shade(colours.spoil, 0.2), 13, 1);
      px(-2, 0, ink, 3, 3); // doorway
      for (const [x, y] of [[-8, 2], [-5, 3], [2, 3], [5, 2]]) bag(x, y);
      px(6, -10, ink, 1, 13); // mast
      px(7, -10, SIGNAL, 4, 3); px(7, -10, shade(SIGNAL, 0.25), 4, 1); // flag
      for (let k = 0; k < 6; k += 1) px(5 - k, -9 + Math.floor(k / 2), shade(STEEL, 0.2)); // aerial wire
      return true;
    }
    case 'field_hospital': {
      // A white tent with a red cross on its side and its door flap open.
      shadow(-7, -3, 15, 8);
      for (let k = 0; k < 6; k += 1) {
        px(-k - 1, -4 + k, shade(CANVAS_WHITE, 0.08), k + 1, 1); // lit side
        px(0, -4 + k, shade(CANVAS_WHITE, -0.18), k + 1, 1); // shaded side
      }
      px(-7, 2, shade(CANVAS_WHITE, -0.3), 14, 1);
      px(-4, -1, CROSS, 1, 3); px(-5, 0, CROSS, 3, 1);
      px(2, -1, shade(CANVAS_WHITE, -0.5), 2, 3); // open flap
      return true;
    }
    case 'comms_relay': {
      // A lattice mast on a concrete footing with a dish and a blinking red light.
      shadow(-2, 3, 5, 2);
      px(-3, 3, CONCRETE, 7, 2); px(-3, 3, shade(CONCRETE, 0.25), 7, 1);
      for (let k = 0; k < 12; k += 1) {
        px(-1, 2 - k, STEEL); px(1, 2 - k, shade(STEEL, -0.25));
        if (k % 2 === 0) px(0, 2 - k, shade(STEEL, 0.3)); // lattice
      }
      px(1, -10, shade(STEEL, 0.4), 4, 1); px(2, -11, shade(STEEL, 0.25), 3, 1); px(4, -9, shade(STEEL, -0.2), 1, 2); // dish
      px(0, -11, SIGNAL);
      return true;
    }
    default:
      return false;
  }
}
