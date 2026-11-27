// Help (graphics overhaul G7, docs/OVERHAUL.md 5.1): a plain-English "How to
// play", every keyboard shortcut, and a glossary of the game's terms. The same
// content serves the title screen's Help and the in-game Help sheet (? key).

function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

// The keys the game listens for (src/ui/game.js and src/ui/input.js).
export const SHORTCUTS = [
  ['Space', 'help.key.nextUnit'], ['Enter', 'help.key.next'], ['Shift+Enter', 'help.key.endNow'], ['B', 'help.key.found'], ['F', 'help.key.fortify'],
  ['S', 'help.key.skip'], ['Z', 'help.key.sleep'], ['Del', 'help.key.disband'], ['R', 'help.key.techs'], ['C', 'help.key.civics'],
  ['E', 'help.key.empire'], ['D', 'help.key.diplomacy'], ['V', 'help.key.victory'], ['J', 'help.key.journal'], ['L', 'help.key.lens'],
  ['Y', 'help.key.yields'], ['G', 'help.key.grid'], ['[ ]', 'help.key.cities'], ['?', 'help.key.help'], ['Esc', 'help.key.escape'],
  ['W A S', 'help.key.pan'], ['+ -', 'help.key.zoom'],
];

const BASICS = ['help.basic.select', 'help.basic.move', 'help.basic.attack', 'help.basic.city', 'help.basic.attention', 'help.basic.end', 'help.basic.minimap'];
const HOW = ['help.how.goal', 'help.how.start', 'help.how.grow', 'help.how.research', 'help.how.war', 'help.how.win'];
const GLOSSARY = ['food', 'production', 'gold', 'science', 'culture', 'faith', 'amenities', 'housing', 'era', 'boost', 'government', 'policy', 'agenda', 'raiders', 'specialist', 'route'];

/** The Help content: How to play, the basics, shortcuts and the glossary. tt(key, args) gives the text. */
export function helpBody(doc, tt) {
  return el(doc, 'div', { class: 'help-body' },
    el(doc, 'section', {},
      el(doc, 'h3', {}, tt('help.howTitle')), ...HOW.map((k) => el(doc, 'p', {}, tt(k))),
      el(doc, 'h3', {}, tt('help.basics')), ...BASICS.map((k) => el(doc, 'p', {}, tt(k)))),
    el(doc, 'section', {},
      el(doc, 'h3', {}, tt('help.keys')),
      el(doc, 'dl', { class: 'help-keys' }, ...SHORTCUTS.flatMap(([key, text]) => [el(doc, 'dt', {}, el(doc, 'kbd', {}, key)), el(doc, 'dd', {}, tt(text))])),
      el(doc, 'h3', {}, tt('help.glossary')),
      el(doc, 'dl', { class: 'help-glossary' }, ...GLOSSARY.flatMap((k) => [el(doc, 'dt', {}, tt(`help.term.${k}`)), el(doc, 'dd', {}, tt(`help.def.${k}`))]))));
}
