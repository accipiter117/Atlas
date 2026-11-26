// Religion planner (phase 13, section 3.8). In order: choose a pantheon when
// the faith is there, found a religion (name, follower and founder beliefs)
// when it can, then buy missionaries when spreading pays (on the religious
// path, or with faith to spare). Beliefs are valued with the same effect
// estimates as policy cards. Missionaries themselves are moved by tactics
// (missionaryMove below). Weights live in ai/weights.json ("religion").

import { takenBeliefs, pantheonOf, foundedBy, religionLimit, holyCityOptions, majorityOf, faithPrice, preachTarget, pantheonFaith, foundFaith } from '../../sim/index.js';
import { weightsOf, categoryWeight, dist } from '../evaluate.js';
import { effectValue, empireFacts } from './government.js';

function beliefValue(ruleset, view, memory, facts, id, followers = 3) {
  const b = ruleset.beliefs[id];
  return (b.effects ?? []).reduce((n, e) => {
    const scaled = b.perFollowerCity ? { ...e, amount: e.amount * followers, scope: 'capital' } : e;
    if (e.effect === 'religiousPressure') return n + (e.amount / 100) * 10 * categoryWeight(ruleset, view, memory, 'faith');
    if (e.effect === 'faithPurchase') return n + 2 * categoryWeight(ruleset, view, memory, 'faith');
    return n + effectValue(scaled, facts, ruleset, view, memory);
  }, 0);
}

function best(ruleset, view, memory, facts, kind, taken) {
  return Object.values(ruleset.beliefs).filter((b) => b.kind === kind && !taken.has(b.id))
    .map((b) => ({ id: b.id, v: beliefValue(ruleset, view, memory, facts, b.id) }))
    .sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
}

export function nextReligion(world, view, ruleset, memory) {
  if (!ruleset.beliefs || !view.religion) return null;
  const w = weightsOf(ruleset, 'religion');
  const me = view.me;
  const faith = view.stocks?.faith ?? 0;
  const taken = takenBeliefs(world);
  const facts = empireFacts(world, view, ruleset);

  if (!pantheonOf(world, me) && faith >= pantheonFaith(world, ruleset)) {
    const ranked = best(ruleset, view, memory, facts, 'pantheon', taken);
    if (ranked.length) return { cmd: { type: 'choosePantheon', faction: me, belief: ranked[0].id }, score: ranked[0].v, reasonKey: 'ai.reason.pantheon', params: { belief: ranked[0].id } };
  }

  const holy = holyCityOptions(world, ruleset, me);
  if (pantheonOf(world, me) && !foundedBy(world, me) && faith >= foundFaith(world, ruleset) && holy.length
    && Object.keys(view.religion.religions).length < religionLimit(world, ruleset)) {
    const religion = Object.keys(ruleset.religions).find((id) => !view.religion.religions[id]);
    const follower = best(ruleset, view, memory, facts, 'follower', taken)[0];
    const founder = best(ruleset, view, memory, facts, 'founder', taken)[0];
    const city = view.cities.filter((c) => holy.includes(c.id)).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0) || b.pop - a.pop || (a.id < b.id ? -1 : 1))[0];
    if (religion && follower && founder && city) {
      return { cmd: { type: 'foundReligion', faction: me, religion, follower: follower.id, founder: founder.id, city: city.id }, score: follower.v + founder.v, reasonKey: 'ai.reason.foundReligion', params: { religion } };
    }
  }

  // Missionaries: on the religious path, or with faith piling up.
  const mine = foundedBy(world, me);
  if (mine) {
    const missionaries = view.units.filter((u) => u.faction === me && ruleset.units[u.type]?.faithOnly).length;
    const keen = memory.path === 'religious';
    const cap = keen ? (w.missionariesReligious ?? 3) : (w.missionaries ?? 1);
    const city = view.cities.find((c) => c.faction === me && faithPrice(world, ruleset, c, { kind: 'unit', id: 'missionary' }) !== null);
    if (city && missionaries < cap) {
      const price = faithPrice(world, ruleset, city, { kind: 'unit', id: 'missionary' });
      const spare = keen ? price : price * (w.faithSpareFactor ?? 2);
      if (faith >= spare && targets(view, mine.id).length) {
        return { cmd: { type: 'buyWithFaith', faction: me, city: city.id, item: { kind: 'unit', id: 'missionary' } }, score: 1, reasonKey: 'ai.reason.missionary', params: { city: city.name } };
      }
    }
  }
  return null;
}

/** Cities worth preaching to: not mostly ours, biggest first. */
function targets(view, religionId) {
  return view.cities.filter((c) => (c.followers?.[religionId] ?? 0) < c.pop && majorityOf(c) !== religionId);
}

/** A missionary's move: preach if a target city is in reach, else walk to the best one. */
export function missionaryMove(world, view, ruleset, unit, move, approach) {
  const here = preachTarget(world, unit);
  if (here && majorityOf(here) !== unit.religion && (here.followers?.[unit.religion] ?? 0) < here.pop && unit.moves > 0) {
    return { cmd: { type: 'spreadReligion', faction: view.me, unit: unit.id }, score: 3, reasonKey: 'ai.reason.preach', params: { city: here.name } };
  }
  const list = targets(view, unit.religion).sort((a, b) => (dist(view.map, unit.tile, a.tile) - a.pop * 2) - (dist(view.map, unit.tile, b.tile) - b.pop * 2) || (a.id < b.id ? -1 : 1));
  for (const c of list.slice(0, 4)) {
    // Cities of others cannot be entered: walk next to it.
    const spot = c.faction === view.me ? c.tile : approach(world, view, ruleset, unit, c.tile, 1);
    if (spot !== null && spot !== unit.tile) return move(view, unit, spot, 'ai.reason.toPreach', { city: c.name }, 1);
  }
  return null;
}
