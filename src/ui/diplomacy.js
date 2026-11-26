// The diplomacy overlay (D), from the wireframe in section 10.3: the leaders
// you have met with their status and opinion of you; for the one selected,
// every reason behind that opinion, their agenda, and buttons to make peace,
// make a deal, denounce or declare war. The deal panel shows the likely
// answer before you send, using the same evaluateDeal the AI answers with
// (from what you can see, so "likely"). Offers made to you wait at the top.

import { t, formatText } from '../data/text.js';
import { statusOf, wouldAccept, dealProblem, atWar, pairKey } from '../sim/index.js';

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean') node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

/** Improved luxury and strategic resources a faction is known to have (from the tiles you have seen). */
export function knownResources(world, ruleset, factionId) {
  const map = world.map;
  const out = new Set();
  for (let i = 0; i < (map.owner ?? []).length; i += 1) {
    const o = map.owner[i];
    if (!o || world.cities[o]?.faction !== factionId || map.resource[i] < 0 || map.improvement?.[i] < 0) continue;
    const id = map.resourceIds[map.resource[i]];
    const res = ruleset.resources[id];
    if (res && res.class !== 'bonus' && map.improvementIds[map.improvement[i]] === res.improvement) out.add(id);
  }
  return [...out].sort();
}

/** One sentence for a deal item. */
function itemText(tt, ruleset, name, x) {
  if (x.type === 'gold') return tt('dip.item.gold', { n: x.amount });
  if (x.type === 'goldPerTurn') return tt('dip.item.goldPerTurn', { n: x.amount, turns: ruleset.tuning?.diplomacy?.dealValues?.goldPerTurnTurns ?? 30 });
  if (x.type === 'resource') return ruleset.text[ruleset.resources[x.resource]?.nameKey] ?? x.resource;
  if (x.type === 'jointWar') return tt('dip.item.jointWar', { faction: name(x.target) });
  return tt(`dip.item.${x.type}`);
}

export function dealSentence(tt, ruleset, name, me, deal) {
  const theyGive = deal.from === me ? deal.get : deal.give;
  const youGive = deal.from === me ? deal.give : deal.get;
  const list = (xs) => (xs.length ? xs.map((x) => itemText(tt, ruleset, name, x)).join(', ') : tt('dip.nothing'));
  return tt('dip.dealLine', { give: list(youGive), get: list(theyGive) });
}

/**
 * state: { selected, deal: { give, get } | null } kept by the caller.
 * act: { propose(target, give, get), answer(dealId, accept), denounce(target), declareWar(target), select(id), editDeal(deal), close() }
 */
export function renderDiplomacy(doc, host, { world, view, ruleset, text, name, leaderName, ui, act }) {
  const tt = (k, a) => t(text, k, a);
  const say = (key) => ruleset.text[key] ?? text[key] ?? '';
  const me = view.me;
  const met = view.factions.filter((f) => f.id !== me && f.alive && view.opinions?.[f.id]);
  const statusText = (id) => {
    const s = statusOf(world, me, id);
    const d = view.diplomacy ?? {};
    const k = pairKey(me, id);
    if (s === 'war') return tt('dip.status.war', { n: Math.max(0, view.turn - (d.warSince?.[k] ?? view.turn)) });
    const treaty = d.treaties?.[k];
    if (treaty?.team) return tt('dip.status.team');
    if (treaty) return tt(`dip.status.${treaty.kind}`, { n: Math.max(0, treaty.until - view.turn) });
    const lock = (d.peaceUntil?.[k] ?? 0) - view.turn;
    return lock > 0 ? tt('dip.status.peaceTreaty', { n: lock }) : tt('dip.status.peace');
  };
  const signed = (n) => (n > 0 ? `+${n}` : String(n));

  // Offers made to you.
  const incoming = (view.diplomacy?.deals ?? []).filter((x) => x.to === me);
  const offers = incoming.length ? el(doc, 'section', { class: 'dip-offers', dataset: { field: 'offers' } },
    el(doc, 'h3', {}, tt('dip.offers')),
    ...incoming.map((deal) => el(doc, 'div', { class: 'dip-offer', dataset: { deal: deal.id } },
      el(doc, 'p', {}, el(doc, 'strong', {}, name(deal.from)), ' ', dealSentence(tt, ruleset, name, me, deal)),
      el(doc, 'div', { class: 'end-actions' },
        el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { accept: deal.id }, onclick: () => act.answer(deal.id, true) }, tt('dip.accept')),
        el(doc, 'button', { type: 'button', class: 'btn small', dataset: { decline: deal.id }, onclick: () => act.answer(deal.id, false) }, tt('dip.decline')))))) : null;

  // The leaders list.
  const list = el(doc, 'ul', { class: 'dip-leaders' }, ...met.map((f) => {
    const op = view.opinions[f.id].theirs.total;
    return el(doc, 'li', {}, el(doc, 'button', { type: 'button', class: `dip-leader${ui.selected === f.id ? ' selected' : ''}`, dataset: { leader: f.id }, onclick: () => act.select(f.id) },
      el(doc, 'strong', {}, name(f.id)),
      el(doc, 'span', { class: 'small' }, statusText(f.id)),
      el(doc, 'span', { class: `dip-op ${op > 0 ? 'good' : op < 0 ? 'bad' : ''}` }, signed(op))));
  }));
  if (!met.length) list.append(el(doc, 'li', { class: 'muted' }, tt('dip.noneMet')));

  // The selected leader.
  let detail = null;
  const sel = met.find((f) => f.id === ui.selected);
  if (sel) {
    const theirs = view.opinions[sel.id].theirs;
    const war = atWar(world, me, sel.id);
    const agendaReason = theirs.reasons.find((r) => r.id === 'agendaLike' || r.id === 'agendaHate');
    const civ = ruleset.factions?.[sel.civ];
    const agenda = ruleset.leaders?.[civ?.leaders?.[0]]?.agenda;
    const reasons = theirs.reasons.map((r) => el(doc, 'li', { class: r.amount > 0 ? 'good' : 'bad', dataset: { reason: r.id } },
      el(doc, 'span', { class: 'dip-amount' }, signed(r.amount)), ' ', formatText(say(r.reasonKey), { agenda: say(r.params?.agendaKey) })));
    const deal = ui.deal;
    let dealPanel = null;
    if (deal) {
      const full = { from: me, to: sel.id, give: deal.give, get: deal.get };
      const problem = deal.give.length || deal.get.length ? dealProblem(world, ruleset, full) : 'emptyDeal';
      const likely = !problem && wouldAccept(world, ruleset, sel.id, full, { opinion: theirs.total });
      const has = (side, type, extra = {}) => deal[side].some((x) => x.type === type && Object.entries(extra).every(([k, v]) => x[k] === v));
      const toggle = (side, item) => {
        const exists = deal[side].findIndex((x) => x.type === item.type && (x.resource ?? null) === (item.resource ?? null) && (x.target ?? null) === (item.target ?? null));
        const nextSide = exists >= 0 ? deal[side].filter((_, i) => i !== exists) : [...deal[side], item];
        act.editDeal({ ...deal, [side]: nextSide });
      };
      const amount = (side, type) => {
        const cur = deal[side].find((x) => x.type === type);
        return el(doc, 'label', { class: 'dip-amount-field' }, tt(`dip.item.${type}Label`),
          el(doc, 'input', { type: 'number', min: '0', step: type === 'gold' ? '10' : '1', value: String(cur?.amount ?? 0), name: `${side}-${type}`, onchange: (e) => {
            const n = Math.max(0, Math.round(Number(e.target.value) || 0));
            const rest = deal[side].filter((x) => x.type !== type);
            act.editDeal({ ...deal, [side]: n ? [...rest, { type, amount: n }] : rest });
          } }));
      };
      const tick = (side, item, label) => el(doc, 'label', { class: 'tick small' },
        el(doc, 'input', { type: 'checkbox', checked: has(side, item.type, item.resource ? { resource: item.resource } : item.target ? { target: item.target } : {}), dataset: { item: `${side}:${item.type}:${item.resource ?? item.target ?? ''}` }, onchange: () => toggle(side, item) }), el(doc, 'span', {}, label));
      const mineRes = knownResources(world, ruleset, me);
      const theirRes = knownResources(world, ruleset, sel.id);
      const mutual = war ? [{ type: 'peace' }] : ['openBorders', 'defensivePact', 'alliance'].map((type) => ({ type }));
      const thirds = met.filter((f) => f.id !== sel.id && view.opinions[f.id]);
      dealPanel = el(doc, 'section', { class: 'dip-deal', dataset: { field: 'deal' } },
        el(doc, 'h3', {}, tt('dip.makeDeal')),
        el(doc, 'div', { class: 'dip-sides' },
          el(doc, 'div', {}, el(doc, 'h4', {}, tt('dip.youGive')), amount('give', 'gold'), amount('give', 'goldPerTurn'), ...mineRes.map((r) => tick('give', { type: 'resource', resource: r }, say(ruleset.resources[r].nameKey)))),
          el(doc, 'div', {}, el(doc, 'h4', {}, tt('dip.theyGive')), amount('get', 'gold'), amount('get', 'goldPerTurn'), ...theirRes.map((r) => tick('get', { type: 'resource', resource: r }, say(ruleset.resources[r].nameKey)))),
          el(doc, 'div', {}, el(doc, 'h4', {}, tt('dip.both')), ...mutual.map((x) => tick('give', x, tt(`dip.item.${x.type}`))),
            ...(war ? [] : thirds.map((f) => tick('give', { type: 'jointWar', target: f.id }, tt('dip.item.jointWar', { faction: name(f.id) })))))),
        el(doc, 'p', { class: `dip-preview ${problem ? 'muted' : likely ? 'good' : 'bad'}`, dataset: { field: 'likely' } },
          problem ? tt(`dip.problem.${problem}`, {}) : tt(likely ? 'dip.likelyYes' : 'dip.likelyNo')),
        el(doc, 'div', { class: 'end-actions' },
          el(doc, 'button', { type: 'button', class: 'btn small primary', dataset: { action: 'send-deal' }, disabled: Boolean(problem), onclick: () => act.propose(sel.id, deal.give, deal.get) }, tt('dip.send')),
          el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'cancel-deal' }, onclick: () => act.editDeal(null) }, tt('dip.cancel'))));
    }
    const pendingMine = (view.diplomacy?.deals ?? []).find((x) => x.from === me && x.to === sel.id);
    detail = el(doc, 'section', { class: 'dip-detail', dataset: { field: 'leader' } },
      el(doc, 'h3', {}, tt('dip.leaderTitle', { faction: name(sel.id), leader: leaderName(sel.id) })),
      el(doc, 'p', { class: 'dip-status' }, statusText(sel.id)),
      el(doc, 'p', {}, tt('dip.opinion', { n: signed(theirs.total) })),
      el(doc, 'ul', { class: 'dip-reasons', dataset: { field: 'reasons' } }, ...(reasons.length ? reasons : [el(doc, 'li', { class: 'muted' }, tt('dip.noReasons'))])),
      agenda ? el(doc, 'p', { class: 'small' }, tt('dip.agenda', { name: say(agenda.nameKey), text: say(agenda.descriptionKey) }), ' ',
        el(doc, 'strong', {}, tt(agendaReason?.id === 'agendaLike' ? 'dip.agendaYes' : agendaReason?.id === 'agendaHate' ? 'dip.agendaNo' : 'dip.agendaNeither'))) : null,
      pendingMine ? el(doc, 'p', { class: 'small muted' }, tt('dip.waiting')) : null,
      el(doc, 'div', { class: 'end-actions' },
        war ? el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'propose-peace' }, onclick: () => act.editDeal({ give: [{ type: 'peace' }], get: [] }) }, tt('dip.proposePeace')) : null,
        el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'make-deal' }, onclick: () => act.editDeal({ give: [], get: [] }) }, tt('dip.makeDeal')),
        !war ? el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'denounce' }, onclick: () => act.denounce(sel.id) }, tt('dip.denounce')) : null,
        !war ? el(doc, 'button', { type: 'button', class: 'btn small danger', dataset: { action: 'dip-declare-war' }, onclick: () => act.declareWar(sel.id) }, tt('dip.declareWar')) : null),
      dealPanel);
  }

  host.replaceChildren(
    el(doc, 'div', { class: 'tree-head' }, el(doc, 'h2', {}, tt('dip.title')),
      el(doc, 'p', { class: 'tree-now small' }, tt('dip.weariness', { n: view.diplomacy?.weariness?.[me] ?? 0 })),
      el(doc, 'button', { type: 'button', class: 'btn small', dataset: { action: 'close-diplomacy' }, onclick: act.close }, tt('tree.close'))),
    el(doc, 'div', { class: 'dip-body' },
      el(doc, 'aside', { class: 'dip-left' }, el(doc, 'h3', {}, tt('dip.leaders')), list),
      el(doc, 'div', { class: 'dip-right' }, offers, detail ?? (met.length ? el(doc, 'p', { class: 'muted' }, tt('dip.pick')) : null))));
}

