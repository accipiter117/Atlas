// Small helpers shared by the game screen and its HUD and screen modules
// (split out of src/ui/game.js, graphics overhaul G1).

import { worldFromView, cityYields, buildOptions, itemCost, buildingDef, adjacencyBonus, UNEXPLORED } from '../../sim/index.js';

export function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/** Replace an element's children, skipping empty entries (null, undefined, false). */
export function fill(node, ...children) {
  node.replaceChildren(...children.filter((c) => c !== null && c !== undefined && c !== false));
}

export const fmt = (n) => (Math.round(n * 10) / 10).toString();
export const signed = (n) => (n >= 0 ? `+${fmt(n)}` : fmt(n));

/** A state-shaped object built from a view, so planning and previews use only what the player knows. */
export function knownWorld(v) {
  return worldFromView(v);
}

/** Rank what a city could build, best first, each with a one-line reason (section 10.4). */
export function rankOptions(v, ruleset, city, tt) {
  const world = knownWorld(v);
  const me = v.me;
  const prod = Math.max(1, cityYields(world, ruleset, city).total.production);
  const myUnits = v.units.filter((u) => u.faction === me);
  const defended = myUnits.some((u) => u.tile === city.tile && !ruleset.unitClasses[ruleset.units[u.type].class]?.civilian);
  const explored = v.fog.filter((f) => f !== UNEXPLORED).length / v.fog.length;
  const settlersAround = myUnits.filter((u) => (ruleset.units[u.type].tags ?? []).includes('founder')).length;
  return buildOptions(world, ruleset, city).map((item) => {
    const turns = Math.max(1, Math.ceil((itemCost(ruleset, item, world, city) - (city.queue[0]?.id === item.id ? city.progress : 0)) / prod));
    let score = 1;
    let reason;
    if (item.kind === 'building' || item.kind === 'wonder') {
      const def = buildingDef(ruleset, item.id);
      reason = ruleset.text[def.descriptionKey] ?? tt('prod.reason.building', { city: city.name });
      if (item.kind === 'wonder') reason = tt('prod.reason.wonder', { text: reason });
      // Value what it gives here: yields (with adjacency in this city) and amenities.
      const adj = (def.adjacency ?? []).length ? adjacencyBonus(world, ruleset, { ...city, buildings: [...city.buildings, item.id] }, item.id).reduce((n, a) => n + a.amount, 0) : 0;
      const gives = Object.values(def.yields ?? {}).reduce((n, x) => n + x, 0) + adj + (def.amenities ?? 0) * 1.5 + (def.effects?.length ?? 0);
      score = (item.kind === 'wonder' ? 2.5 : 2) + gives * 0.6;
    } else {
      const def = ruleset.units[item.id];
      const cls = ruleset.unitClasses[def.class] ?? {};
      const tags = def.tags ?? [];
      if (tags.includes('founder')) { reason = tt('prod.reason.settle'); score = city.pop >= 2 && settlersAround === 0 ? 9 : 4; }
      else if (tags.includes('worker')) { reason = tt('prod.reason.improve'); score = 1; }
      else if (cls.domain === 'sea') { reason = tt('prod.reason.naval'); score = 2; }
      else if (def.class === 'recon') { reason = tt('prod.reason.explore'); score = explored < 0.25 ? 7 : 2; }
      else if (cls.combat === 'ranged') { reason = tt('prod.reason.ranged'); score = 4; }
      else if (def.class === 'anti_cavalry') { reason = tt('prod.reason.antiCavalry'); score = 3.5; }
      else if (!defended) { reason = tt('prod.reason.defendNone', { city: city.name }); score = 8; }
      else { reason = tt('prod.reason.defend'); score = 3; }
    }
    return { item, turns, reason, score: score - turns * 0.05 };
  }).sort((a, b) => b.score - a.score || a.turns - b.turns || a.item.id.localeCompare(b.item.id));
}
