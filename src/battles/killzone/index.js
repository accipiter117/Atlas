// The Killzone platoon battle module (phase 19, docs/PLAN.md section 5.5): the
// Killzone project's own battle sim (vendored in sim/vendor), adapted to the
// Atlas battle contract in sim/adapter.js, with a light screen in ui/ and
// render/. Land battles only; its numbers live in tuning.battle.killzone.
//
// The sim is large, so it is loaded only when a platoon battle is first
// needed (a dynamic import): load() fetches it, mount() loads it first, and
// simulate() works once it is loaded. The first page load stays small.

const SEA = new Set(['naval_melee', 'naval_ranged']);
let loaded = null;

const mod = {
  id: 'killzone',
  version: 1,
  kind: 'interactive',
  canHandle(spec) {
    if (spec.kind === 'cityRanged') return false;
    const units = [...spec.attacker.units, ...spec.defender.units];
    return units.length > 0 && !units.some((u) => SEA.has(u.class) || (u.tags ?? []).includes('ship'));
  },
  /** Fetch the battle sim and screen (once). */
  async load() {
    if (!loaded) {
      const [adapter, screen] = await Promise.all([import('./sim/adapter.js'), import('./ui/screen.js')]);
      loaded = { adapter, screen };
    }
    return loaded;
  },
  get ready() {
    return loaded !== null;
  },
  simulate(spec, rng) {
    if (!loaded) throw new Error('The Killzone battle sim is not loaded yet: await load() first');
    return loaded.adapter.simulateKillzone(spec, rng);
  },
  mount(spec, host) {
    let inner = null;
    let gone = false;
    mod.load().then(({ screen }) => { if (!gone) inner = screen.mountKillzone(spec, host); });
    return { destroy() { gone = true; inner?.destroy(); } };
  },
};

export default mod;
