// The star map screen (Killzone Extrasolar War K2; docs/KILLZONE.md 7.3): the worlds, lanes
// and fleets drawn by src/render/starmap.js, a status card on every world, and the fleet
// panel with every star map order. Orders that need a hex (landing, an orbital strike, a
// supply drop) switch to that world's map and wait for a click there.
//
// It only reads the view (v.space) and sends ordinary commands through g.run, like the rest
// of the screen. Everything the game screen shares comes in through `g` (see game.js).

import { spaceOdds, armsPrice, STANCES } from '../../sim/index.js';
import { createStarMap } from '../../render/starmap.js';
import { el } from './shared.js';
import { icon } from './icons.js';

export function createStarMapScreen(g) {
  let selectedWorld = null;
  let selectedFleet = null;
  let embarking = null; // { fleet, picked: Set } while choosing troops to embark
  let map = null;

  const tt = g.tt;
  const worldName = (id) => g.worldName(id);
  const sideName = (side) => {
    // A ruleset may name its sides (side.0.name); else the side's first faction.
    if (g.ruleset.text[`side.${side}.name`]) return g.ruleset.text[`side.${side}.name`];
    const f = g.v.factions.find((x) => g.sideOf(x.id) === side);
    return f ? g.civName(f.id) : tt('starmap.side', { n: side + 1 });
  };
  const space = () => g.v.space;
  const myFleet = () => space()?.fleets.find((f) => f.id === selectedFleet && f.faction === g.human) ?? null;

  /** One line saying how a world stands. */
  function status(w) {
    const parts = [];
    if (w.holder === 'contested') parts.push(w.share === null ? tt('starmap.contested') : tt('starmap.front', { share: w.share }));
    else if (w.holder === null) parts.push(tt('starmap.neutral'));
    else parts.push(sideName(w.holder));
    if (w.armies) parts.push(tt('starmap.armies', { n: w.armies }));
    if (w.orbit) parts.push(w.orbit.contested ? tt('starmap.orbitContested') : w.orbit.mine ? tt('starmap.orbitYours') : w.orbit.factions.length ? tt('starmap.orbitEnemy') : tt('starmap.orbitEmpty'));
    if (w.blockaded) parts.push(tt('starmap.blockaded'));
    if (w.storm) parts.push(tt('starmap.storm'));
    if (g.v.war?.delegation?.[w.id]) parts.push(tt('starmap.delegated'));
    return parts.join(' · ');
  }

  function open() {
    if (!space()) return;
    const body = g.panel.querySelector('[data-field="panel-body"]');
    selectedWorld ??= g.viewWorld;
    body.replaceChildren(
      el(g.doc, 'div', { class: 'tree-head' },
        el(g.doc, 'h2', {}, tt('starmap.title')),
        el(g.doc, 'span', { class: 'muted small' }, tt('starmap.hint')),
        el(g.doc, 'span', { class: 'war-status small', dataset: { field: 'war-status' } }),
        el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-starmap' }, onclick: close }, tt('help.close'))),
      el(g.doc, 'div', { class: 'starmap' },
        el(g.doc, 'div', { class: 'starmap-sky', dataset: { field: 'starmap-sky' } },
          el(g.doc, 'canvas', { class: 'starmap-canvas', dataset: { field: 'starmap-canvas' }, 'aria-label': tt('starmap.title') }),
          el(g.doc, 'div', { class: 'starmap-cards', dataset: { field: 'starmap-cards' } })),
        el(g.doc, 'aside', { class: 'starmap-side', dataset: { field: 'starmap-side' }, 'aria-live': 'polite' })));
    g.panel.classList.add('starmap-open');
    g.panel.hidden = false;
    const canvas = body.querySelector('[data-field="starmap-canvas"]');
    map = createStarMap(canvas, { ruleset: g.ruleset, factionColour: (id) => g.colours[id] ?? '#888', sideColour: (side) => g.colours[g.v.factions.find((f) => g.sideOf(f.id) === side)?.id] ?? '#888' });
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const h = map.hit(e.clientX - r.left, e.clientY - r.top);
      if (!h) return;
      if (h.kind === 'fleet') { selectedFleet = h.id; const f = space().fleets.find((x) => x.id === h.id); if (f && !f.transit) selectedWorld = f.at; }
      else { selectedWorld = h.id; if (!space().fleets.some((f) => f.id === selectedFleet && f.at === h.id)) selectedFleet = null; }
      embarking = null;
      render();
    });
    render();
    body.querySelector('[data-action="close-starmap"]').focus({ preventScroll: true });
  }

  function close() {
    g.panel.hidden = true;
    g.panel.classList.remove('starmap-open');
    map = null;
  }

  const isOpen = () => !g.panel.hidden && g.panel.classList.contains('starmap-open');

  /** War support for both sides, and your glory and rank on your side (K4b). */
  function renderWar() {
    const host = g.panel.querySelector('[data-field="war-status"]');
    const war = g.v.war;
    if (!host || !war) return;
    const mine = war.glory[g.human] ?? 0;
    const ranked = Object.values(war.glory).sort((a, b) => b - a);
    host.textContent = `${tt('starmap.support', { us: sideName(war.side), usValue: war.support[war.side], them: sideName(1 - war.side), themValue: war.support[1 - war.side] })} · ${tt('starmap.glory', { glory: mine, rank: ranked.indexOf(mine) + 1, of: ranked.length })}`;
  }

  /** K5: hand this theatre to your generals in a stance, or take it back. One click each. */
  function delegationPanel(w) {
    const now = g.v.war.delegation?.[w.id] ?? null;
    const pick = (stance) => el(g.doc, 'button', {
      type: 'button', class: `btn small${stance === now ? ' primary' : ''}`, 'aria-pressed': String(stance === now), dataset: { action: `delegate-${stance ?? 'off'}` },
      title: stance ? tt(`delegate.${stance}Note`) : '',
      onclick: () => { if (g.run({ type: 'setDelegation', faction: g.human, theatre: w.id, stance })) render(); },
    }, tt(stance ? `delegate.${stance}` : 'delegate.off'));
    const report = (g.theatreReport ?? []).find((x) => x.world === w.id);
    return [
      el(g.doc, 'h4', {}, tt('delegate.title')),
      el(g.doc, 'p', { class: 'small muted' }, now ? tt('delegate.status', { stance: tt(`delegate.${now}`) }) : tt('delegate.hint')),
      el(g.doc, 'div', { class: 'stance-picks', dataset: { field: 'delegation' } }, pick(null), ...STANCES.map(pick)),
      report ? el(g.doc, 'p', { class: 'small', dataset: { field: 'theatre-report' } }, report.text) : null,
    ].filter(Boolean);
  }

  function councilPanel(w) {
    const war = g.v.war;
    const out = [el(g.doc, 'p', { class: 'small', dataset: { field: 'council' } }, war.council ? tt('starmap.council', { world: worldName(war.council.world), turn: war.nextCouncil }) : tt('starmap.councilNone', { turn: war.nextCouncil }))];
    if (war.myProposal === w.id) out.push(el(g.doc, 'p', { class: 'small muted' }, tt('starmap.proposed', { world: worldName(w.id) })));
    else out.push(order(tt('starmap.propose', { world: worldName(w.id) }), { type: 'councilVote', faction: g.human, world: w.id }, { action: 'propose' }));
    return out;
  }

  /** Arms for sale from an ally that sells them (Stahl Arms), to your bases on this world. */
  function armsPanel(w) {
    const wv = g.viewOf(w.id);
    const base = wv.cities.find((c) => c.faction === g.human);
    if (!base) return [];
    const out = [];
    for (const seller of g.v.factions.filter((f) => f.alive && f.id !== g.human && g.sideOf(f.id) === g.v.war.side && (g.ruleset.factions[f.civ]?.sellsArms ?? []).length)) {
      const tags = g.ruleset.factions[seller.civ].sellsArms;
      const goods = Object.values(g.ruleset.units).filter((u) => !u.unique && (u.tags ?? []).some((x) => tags.includes(x)) && (u.requires?.side === undefined || u.requires.side === g.v.war.side) && u.domain !== 'space');
      if (!goods.length) continue;
      out.push(el(g.doc, 'h4', {}, tt('starmap.arms', { seller: g.civName(seller.id) })));
      out.push(el(g.doc, 'div', { class: 'fleet-actions', dataset: { field: 'arms' } }, ...goods.map((u) => {
        const label = tt('starmap.buy', { unit: g.ruleset.text[u.nameKey] ?? u.id, price: armsPrice({ arms: { sales: g.v.war.armsSales } }, g.ruleset, u.id) });
        return order(label, { type: 'buyArms', faction: g.human, seller: seller.id, unit: u.id, city: base.id, world: w.id }, { action: `buy-${u.id}` });
      })));
    }
    return out;
  }

  function render() {
    if (!map || !space()) return;
    renderWar();
    map.draw(space(), { selectedFleet, selectedWorld, me: g.human });
    renderCards();
    renderSide();
  }

  function renderCards() {
    const host = g.panel.querySelector('[data-field="starmap-cards"]');
    host.replaceChildren(...space().worlds.map((w) => {
      const p = map.worldAt(w.id);
      return el(g.doc, 'button', {
        type: 'button', class: `world-card${w.id === selectedWorld ? ' selected' : ''}`, dataset: { world: w.id },
        style: `left:${Math.round(p.x)}px;top:${Math.round(p.y + map.planetRadius(w.id) + 18)}px`, 'aria-pressed': String(w.id === selectedWorld),
        onclick: () => { selectedWorld = w.id; selectedFleet = null; embarking = null; render(); },
      }, el(g.doc, 'strong', {}, worldName(w.id)), el(g.doc, 'span', {}, status(w)));
    }));
  }

  /** A button for an order: sends it, then redraws (the game screen refreshes itself). */
  const order = (label, cmd, { action = null, primary = false, disabled = false, note = null } = {}) => el(g.doc, 'button', {
    type: 'button', class: `btn small${primary ? ' primary' : ''}`, disabled, dataset: action ? { action } : {}, title: note ?? '',
    onclick: () => {
      if (!g.run(cmd)) return;
      // The world panel follows a fleet that moved (or was lost in battle).
      if (cmd.type === 'moveFleet') {
        const f = space().fleets.find((x) => x.id === cmd.fleet);
        if (f && !f.transit) selectedWorld = f.at;
        if (!f) selectedFleet = null;
      }
      render();
    },
  }, label);

  function renderSide() {
    const side = g.panel.querySelector('[data-field="starmap-side"]');
    const w = space().worlds.find((x) => x.id === selectedWorld);
    if (!w) { side.replaceChildren(el(g.doc, 'p', { class: 'muted' }, tt('starmap.pick'))); return; }
    const here = space().fleets.filter((f) => !f.transit && f.at === w.id);
    const mine = here.filter((f) => f.faction === g.human);
    const theirs = here.filter((f) => f.faction !== g.human);
    const parts = [
      el(g.doc, 'h3', {}, worldName(w.id)),
      el(g.doc, 'p', { class: 'small' }, g.ruleset.text[g.ruleset.worlds[w.id]?.descriptionKey] ?? ''),
      el(g.doc, 'p', { class: 'small muted' }, status(w)),
      el(g.doc, 'button', { type: 'button', class: 'btn small wide', dataset: { action: 'show-world' }, onclick: () => { close(); g.switchWorld(w.id); } }, tt('starmap.showWorld', { world: worldName(w.id) })),
    ];
    if (mine.length) parts.push(el(g.doc, 'h4', {}, tt('starmap.yourFleets')), el(g.doc, 'div', { class: 'fleet-list' }, ...mine.map((f) => fleetButton(f))));
    if (theirs.length) parts.push(el(g.doc, 'h4', {}, tt('starmap.otherFleets')), el(g.doc, 'ul', { class: 'fleet-ships' }, ...theirs.map((f) => el(g.doc, 'li', { class: 'other-fleet' }, el(g.doc, 'span', { class: 'swatch', style: `background:${g.colours[f.faction] ?? '#888'}` }), tt('starmap.fleetOf', { who: g.civName(f.faction), n: f.ships.length })))));
    const inbound = space().fleets.filter((f) => f.transit?.to === w.id);
    for (const f of inbound) parts.push(el(g.doc, 'p', { class: 'small warn' }, tt('starmap.inbound', { who: f.faction === g.human ? tt('hex.yours') : g.civName(f.faction), turns: f.transit.left })));
    const f = myFleet();
    if (f) parts.push(fleetPanel(f));
    // K4b: the war council and arms deals.
    if (g.v.war) parts.push(...delegationPanel(w), ...councilPanel(w), ...armsPanel(w));
    side.replaceChildren(...parts);
  }

  function fleetButton(f) {
    return el(g.doc, 'button', { type: 'button', class: `fleet-btn${f.id === selectedFleet ? ' selected' : ''}`, dataset: { fleet: f.id }, 'aria-pressed': String(f.id === selectedFleet),
      onclick: () => { selectedFleet = f.id; embarking = null; render(); } },
    icon(g.doc, 'fleet', { size: 16 }), tt('starmap.myFleet', { n: f.ships.length }), f.cargo.length ? el(g.doc, 'span', { class: 'muted' }, tt('starmap.groupsAboard', { n: f.cargo.length })) : null);
  }

  function fleetPanel(f) {
    const box = el(g.doc, 'div', { class: 'fleet-panel', dataset: { field: 'fleet-panel' } });
    box.append(el(g.doc, 'ul', { class: 'fleet-ships' }, ...f.ships.map((s) => el(g.doc, 'li', {},
      el(g.doc, 'span', {}, g.ruleset.text[g.ruleset.units[s.type]?.nameKey] ?? s.type),
      el(g.doc, 'span', { class: 'hp-bar small', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(s.hp), 'aria-label': tt('game.unit.health', { hp: s.hp }) }, el(g.doc, 'span', { style: `width:${s.hp}%` }))))));
    if (f.transit) { box.append(el(g.doc, 'p', { class: 'small' }, tt('starmap.jumping', { world: worldName(f.transit.to), turns: f.transit.left }))); return box; }
    // Moving: one button per lane, with the odds when enemy warships wait there.
    const moves = space().lanes.filter((l) => l.from === f.at || l.to === f.at).map((l) => {
      const to = l.from === f.at ? l.to : l.from;
      const odds = spaceOdds(g.state, g.ruleset, g.human, f.id, to);
      const note = [l.turns > 1 ? tt('starmap.longJump', { turns: l.turns }) : null, l.heavyOnly ? tt('starmap.heavyOnly') : null,
        odds ? tt('starmap.odds', { win: Math.round(odds.win * 100), lose: Math.round(odds.lose * 100) }) : null].filter(Boolean).join(' · ');
      return el(g.doc, 'div', { class: 'fleet-move' }, order(tt('starmap.moveTo', { world: worldName(to) }), { type: 'moveFleet', faction: g.human, fleet: f.id, to }, { action: `move-${to}`, disabled: f.moved }),
        note ? el(g.doc, 'span', { class: `small${odds && odds.win < 0.5 ? ' warn' : ' muted'}` }, note) : null);
    });
    box.append(el(g.doc, 'h4', {}, tt('starmap.orders')), el(g.doc, 'div', { class: 'fleet-moves' }, ...moves));
    const acts = el(g.doc, 'div', { class: 'fleet-actions' });
    acts.append(el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'embark' }, onclick: () => { embarking = { fleet: f.id, picked: new Set() }; render(); } }, tt('starmap.embark')));
    f.cargo.forEach((group, i) => acts.append(el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: `land-${i}` }, onclick: () => target('land', f, { group: i }) }, tt('starmap.land', { n: i + 1, units: group.length }))));
    const cruiser = f.ships.some((s) => g.ruleset.units[s.type]?.space?.bombard);
    if (cruiser) {
      acts.append(el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'strike' }, onclick: () => target('strike', f) }, tt('starmap.strike')));
      acts.append(el(g.doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'drop' }, onclick: () => target('drop', f) }, tt('starmap.drop')));
    }
    acts.append(order(f.blockade ? tt('starmap.liftBlockade') : tt('starmap.blockade'), { type: 'setBlockade', faction: g.human, fleet: f.id, on: !f.blockade }, { action: 'blockade' }));
    box.append(acts);
    if (embarking?.fleet === f.id) box.append(embarkPicker(f));
    return box;
  }

  /** Choose up to an army group of your units at or beside your bases on the fleet's world. */
  function embarkPicker(f) {
    const wv = g.viewOf(f.at);
    const range = g.ruleset.tuning?.space?.loadRange ?? 1;
    const size = g.ruleset.tuning?.space?.groupSize ?? 4;
    const bases = wv.cities.filter((c) => c.faction === g.human);
    const near = wv.units.filter((u) => u.faction === g.human && bases.some((c) => g.hexDistance(wv, c.tile, u.tile) <= range));
    const box = el(g.doc, 'div', { class: 'embark', dataset: { field: 'embark' } }, el(g.doc, 'p', { class: 'small' }, tt('starmap.embarkPick', { n: size })));
    if (!near.length) { box.append(el(g.doc, 'p', { class: 'small muted' }, tt('starmap.embarkNone'))); return box; }
    for (const u of near) {
      const id = `emb-${u.id}`;
      const tick = el(g.doc, 'input', { type: 'checkbox', id, name: id, checked: embarking.picked.has(u.id) });
      tick.addEventListener('change', () => { if (tick.checked) embarking.picked.add(u.id); else embarking.picked.delete(u.id); });
      box.append(el(g.doc, 'label', { class: 'tick', for: id }, tick, el(g.doc, 'span', {}, g.unitName(u))));
    }
    box.append(el(g.doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'embark-go' }, onclick: () => {
      if (g.run({ type: 'loadArmy', faction: g.human, fleet: f.id, units: [...embarking.picked], world: f.at })) { embarking = null; render(); }
    } }, tt('starmap.embarkGo')));
    return box;
  }

  /** An order that needs a hex: show that world and wait for a click on it. */
  function target(kind, f, extra = {}) {
    close();
    g.switchWorld(f.at);
    g.setSpaceTarget({ kind, fleet: f.id, world: f.at, ...extra });
  }

  return { open, close, render, isOpen };
}
