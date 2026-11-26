// The computer seats, in a Web Worker (phase 10): the page stays scrollable
// and clickable while rivals take their turns. The page sends the ruleset
// once, then a state whenever the computer seats should play; this plays them
// with the same code the page would use (src/ai/seats.js) and sends back the
// new state, the commands for the save log, the events for the screen and the
// AI journals.
//
// Messages in:  { type: 'init', ruleset, factions, memories, recordOff }
//               { type: 'play', id, state, stopAt }
// Messages out: { type: 'ready' }
//               { type: 'played', id, state, commands, events, refusals, journals }
//               { type: 'error', id, message }

import { createSeatRunner } from './ai/index.js';

let runner = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      runner = createSeatRunner(msg.ruleset, msg.factions, { memories: msg.memories ?? {}, recordOff: msg.recordOff });
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'play') {
      const r = runner.play(msg.state, { stopAt: msg.stopAt });
      self.postMessage({ type: 'played', id: msg.id, ...r, journals: runner.journals() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err?.stack ?? err) });
  }
};
