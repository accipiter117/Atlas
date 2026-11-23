// The standard LPC sheet layout (section 10.6): 64px frames, four rows per
// animation block in the order up, left, down, right.
//   thrust rows 4-7 (8 frames), walk 8-11 (9), slash 12-15 (6),
//   shoot 16-19 (13), hurt row 20 (6 frames, one direction).
// Idle is walk frame 0; die plays the hurt row.

const DIR_ROW = { n: 0, w: 1, s: 2, e: 3 };
const BLOCKS = {
  thrust: { row: 4, frames: 8 },
  walk: { row: 8, frames: 9 },
  slash: { row: 12, frames: 6 },
  shoot: { row: 16, frames: 13 },
};

/** Which row and frames an Atlas animation uses on an LPC sheet. */
export function lpcAnimation(anim, dir, attackAnim = 'slash') {
  switch (anim) {
    case 'idle': return { row: BLOCKS.walk.row + DIR_ROW[dir], frames: [0] };
    case 'walk': return { row: BLOCKS.walk.row + DIR_ROW[dir], frames: [1, 2, 3, 4, 5, 6, 7, 8] };
    case 'attack': {
      const b = BLOCKS[attackAnim] ?? BLOCKS.slash;
      return { row: b.row + DIR_ROW[dir], frames: Array.from({ length: b.frames }, (_, i) => i) };
    }
    case 'hurt': return { row: 20, frames: [0, 1, 2] };
    case 'die': return { row: 20, frames: [0, 1, 2, 3, 4, 5] };
    default: return { row: BLOCKS.walk.row + DIR_ROW[dir], frames: [0] };
  }
}
