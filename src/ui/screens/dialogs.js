// Dialogs over the map: a captured city, an event, a battle card and the battle screen, and the front line data.
// Split out of src/ui/game.js (graphics overhaul G1) with no change in behaviour:
// everything the game screen shares comes in through `g` (see game.js).

import { estimateOdds, verdictKey } from '../odds.js';
import { getModule } from '../../battles/index.js';

import { el, fill } from '../hud/shared.js';
import { icon, unitIconName } from '../hud/icons.js';

export function createDialogs(g) {
  function showCaptureDialog() {
    const p = g.v.pendingCapture;
    if (!p) return;
    const c = g.v.cities.find((x) => x.id === p.city);
    const overlay = g.doc.querySelector('[data-field="overlay"]');
    const body = overlay.querySelector('[data-field="overlay-body"]');
    fill(body, 
      el(g.doc, 'h2', {}, g.tt('capture.title', { city: c.name })),
      el(g.doc, 'p', {}, g.tt('capture.text')),
      el(g.doc, 'div', { class: 'capture-choices' },
        el(g.doc, 'button', { type: 'button', class: 'btn primary', dataset: { capture: 'keep' }, onclick: () => { overlay.hidden = true; g.run({ type: 'captureChoice', faction: g.human, city: c.id, choice: 'keep' }); g.toast(g.tt('battle.captured', { city: c.name })); } }, g.tt('capture.keep', { city: c.name })),
        el(g.doc, 'button', { type: 'button', class: 'btn', dataset: { capture: 'raze' }, disabled: Boolean(c.originalCapital), onclick: () => { overlay.hidden = true; g.run({ type: 'captureChoice', faction: g.human, city: c.id, choice: 'raze' }); } }, g.tt('capture.raze', { city: c.name }))),
      c.originalCapital ? el(g.doc, 'p', { class: 'muted small' }, g.tt('capture.noRaze')) : null,
    );
    overlay.querySelector('[data-action="close-overlay"]').hidden = true;
    overlay.hidden = false;
    body.querySelector('[data-capture="keep"]').focus();
  }

  // ---------- The front line (phase 19) ----------
  /** Each side's colour (its first faction's), the control and sites, and each site's letter. */
  function frontData() {
    const sideColour = [0, 1].map((side) => g.colours[g.v.factions.find((f) => g.ruleset.factions?.[f.civ]?.frontSide === side)?.id ?? g.v.factions[side]?.id] ?? '#888');
    const letters = Object.fromEntries(Object.values(g.ruleset.sites ?? {}).map((s) => [s.id, (g.ruleset.text[s.nameKey] ?? s.id).trim().charAt(0).toUpperCase()]));
    return { control: g.v.frontline.control, sites: g.v.frontline.sites, colours: sideColour, letters };
  }

  const sideName = (factionId) => (factionId === 'raiders' ? g.raidersName() : g.civName(factionId));

  /** A battle you started waits: with "Ask each time", the Fight or Auto-resolve card; with "Always fight", straight to the field. */
  function showBattleCard() {
    const p = g.v.pendingBattle;
    if (!p || g.battleScreen?.battleId === p.spec.battleId) return;
    // A battle the module cannot fight (or a module no longer installed) settles at once.
    const mod = getModule(p.module);
    if (!mod?.mount || !mod.canHandle(p.spec)) { setTimeout(() => { if (g.v.pendingBattle) g.run({ type: 'autoResolveBattle' }); }, 0); return; }
    if ((g.setup.battleMode ?? 'auto') === 'fight') { openBattle(p); return; }
    const o = estimateOdds(p.spec);
    const overlay = g.doc.querySelector('[data-field="overlay"]');
    const body = overlay.querySelector('[data-field="overlay-body"]');
    const a = p.spec.attacker.units[0];
    const target = p.spec.defender.city ? p.spec.defender.city.name : g.unitName({ type: p.spec.defender.units[0]?.type });
    // Graphics overhaul G8: both sides face to face with their portraits, the verdict in words, and the modifiers.
    const face = (type, faction, isCity) => {
      const box = el(g.doc, 'div', { class: 'portrait battle-face', style: `--faction-soft:${g.colours[faction] ?? ''}` });
      const sheet = !isCity ? g.mapView.sheetFor(type, faction) : null;
      const c = g.doc.createElement('canvas');
      c.width = 64;
      c.height = 64;
      c.className = 'portrait-art';
      if (sheet?.drawPortrait(c.getContext('2d'), 64, g.colours[faction])) box.append(c);
      else box.append(icon(g.doc, isCity ? 'city' : unitIconName(g.ruleset, type), { size: 32 }));
      return box;
    };
    const d0 = p.spec.defender.units[0];
    const mods = (side) => (p.spec.modifiers?.[side] ?? []).map((m) => el(g.doc, 'li', {}, `${m.amount > 0 ? '+' : ''}${m.amount} ${g.tt(`odds.mod.${String(m.source).split(':')[0]}`)}`));
    fill(body,
      el(g.doc, 'h2', { dataset: { field: 'battle-title' } }, g.tt('battleCard.title', { unit: g.unitName({ type: a.type }), target, faction: sideName(p.spec.defender.faction) })),
      el(g.doc, 'div', { class: 'battle-faceoff' },
        el(g.doc, 'div', { class: 'side' }, face(a.type, p.spec.attacker.faction, false), el(g.doc, 'strong', {}, g.unitName({ type: a.type })), el(g.doc, 'span', { class: 'small muted' }, sideName(p.spec.attacker.faction)),
          el(g.doc, 'ul', { class: 'mods small' }, ...mods('attacker'))),
        el(g.doc, 'span', { class: 'vs', 'aria-hidden': 'true' }, g.tt('battleCard.vs')),
        el(g.doc, 'div', { class: 'side' }, face(d0?.type, p.spec.defender.faction, Boolean(p.spec.defender.city)), el(g.doc, 'strong', {}, target), el(g.doc, 'span', { class: 'small muted' }, sideName(p.spec.defender.faction)),
          el(g.doc, 'ul', { class: 'mods small' }, ...mods('defender')))),
      el(g.doc, 'p', { class: 'battle-verdict' }, g.tt(verdictKey(o))),
      el(g.doc, 'p', { dataset: { field: 'battle-odds' } }, g.tt('battleCard.odds', { win: Math.round(o.win * 100), lose: Math.round(o.lose * 100), taken: Math.round(o.attackerLoss), dealt: Math.round(o.defenderLoss) })),
      el(g.doc, 'p', { class: 'small muted' }, g.tt('battleCard.note')),
      el(g.doc, 'div', { class: 'capture-choices' },
        el(g.doc, 'button', { type: 'button', class: 'btn primary', dataset: { battle: 'fight' }, onclick: () => { overlay.hidden = true; openBattle(p); } }, g.tt('battleCard.fight')),
        el(g.doc, 'button', { type: 'button', class: 'btn', dataset: { battle: 'auto' }, onclick: () => { overlay.hidden = true; g.run({ type: 'autoResolveBattle' }); } }, g.tt('battleCard.auto'))));
    overlay.querySelector('[data-action="close-overlay"]').hidden = true;
    overlay.hidden = false;
    body.querySelector('[data-battle="fight"]').focus();
  }

  /** Mount the battle module's screen over the map; its result comes back as resolveBattle. */
  function openBattle(p) {
    const mod = getModule(p.module);
    if (!mod?.mount) { g.run({ type: 'autoResolveBattle' }); return; }
    const o = estimateOdds(p.spec);
    const holder = el(g.doc, 'section', { class: 'battle-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': g.tt('tactical.fieldLabel'), dataset: { field: 'battle-screen' } });
    g.root.append(holder);
    g.battleScreen = { battleId: p.spec.battleId, holder, screen: null };
    g.battleScreen.screen = mod.mount(p.spec, {
      element: holder,
      t: (k, a) => g.tt(k, a),
      colours: { attacker: g.colours[p.spec.attacker.faction], defender: g.colours[p.spec.defender.faction] },
      names: { attacker: sideName(p.spec.attacker.faction), defender: sideName(p.spec.defender.faction) },
      unitName: (type) => g.unitName({ type }),
      // K6: names of war works (trenches, nests) for the battle screen's ground line.
      workName: (id) => g.ruleset.text[g.ruleset.improvements?.[id]?.nameKey] ?? id,
      // Graphics overhaul G8: each side's units drawn with their own sprite sheets (optional for a module).
      sprite: (type, side) => g.mapView.sheetFor(type, side === 'attacker' ? p.spec.attacker.faction : p.spec.defender.faction),
      oddsText: g.tt('tactical.odds', { verdict: g.tt(verdictKey(o)), win: Math.round(o.win * 100), lose: Math.round(o.lose * 100) }),
      playerSide: 'attacker',
      finish: (result) => {
        g.battleScreen?.screen?.destroy?.();
        holder.remove();
        g.battleScreen = null;
        if (!g.run({ type: 'resolveBattle', result })) g.run({ type: 'autoResolveBattle' });
      },
    });
  }

  /** An event waits for an answer (phase 16): its text and one button per choice. */
  function showEventDialog() {
    const p = g.v.pendingEvent;
    const ev = p && g.ruleset.events?.[p.event];
    if (!ev) return;
    const c = g.v.cities.find((x) => x.id === p.city);
    const cityName = c?.name ?? '';
    const say = (key) => (g.ruleset.text[key] ?? key).replaceAll('{city}', cityName);
    const overlay = g.doc.querySelector('[data-field="overlay"]');
    const body = overlay.querySelector('[data-field="overlay-body"]');
    fill(body,
      el(g.doc, 'h2', { dataset: { field: 'event-title' } }, say(ev.nameKey)),
      el(g.doc, 'p', { class: 'small muted' }, g.tt('event.inCity', { city: cityName })),
      el(g.doc, 'p', {}, say(ev.textKey)),
      el(g.doc, 'p', { class: 'small muted' }, g.tt('event.choose')),
      el(g.doc, 'div', { class: 'event-choices' }, ...ev.choices.map((ch, i) => el(g.doc, 'button', { type: 'button', class: `btn wide${i === 0 ? ' primary' : ''}`, dataset: { eventChoice: String(i) },
        onclick: () => { overlay.hidden = true; g.run({ type: 'chooseEvent', faction: g.human, event: p.id, choice: i }); g.toast(g.tt('event.chosen', { event: say(ev.nameKey) })); g.render(); } }, say(ch.textKey)))));
    overlay.querySelector('[data-action="close-overlay"]').hidden = true;
    overlay.hidden = false;
    body.querySelector('[data-event-choice="0"]')?.focus();
  }

  return { showCaptureDialog, frontData, sideName, showBattleCard, openBattle, showEventDialog };
}
