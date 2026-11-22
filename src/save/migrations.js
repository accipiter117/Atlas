// Upgrading old saves when the save format changes (section 8.4).
//
// Each entry upgrades a save by exactly one version. Every migration gets a
// fixture test (test/save/fixtures/v<n>.json) that loads an old save, upgrades
// it and plays one more turn, so nobody loses a game to an update.

export const CURRENT_SAVE_VERSION = 1;

/** One function per step: MIGRATIONS[1] turns a version 1 save into version 2, and so on. */
export const MIGRATIONS = Object.freeze({});

export function upgrade(save) {
  if (!Number.isInteger(save?.saveVersion)) throw new Error('Save has no saveVersion');
  if (save.saveVersion > CURRENT_SAVE_VERSION) {
    throw new Error(`This save comes from a newer version of Atlas (save version ${save.saveVersion})`);
  }
  let out = save;
  while (out.saveVersion < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[out.saveVersion];
    if (!step) throw new Error(`No upgrade from save version ${out.saveVersion}`);
    out = step(out);
    out.saveVersion += 1;
  }
  return out;
}
