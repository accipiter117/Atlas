// Beliefs and religions (section 3.8).

import { entryType, req, oneOf, effects, colour, str, key } from './fields.js';

export const beliefs = entryType('beliefs', {
  kind: req(oneOf(['pantheon', 'follower', 'founder', 'worship'])),
  effects: req(effects()),
  descriptionKey: key(),
});

export const religions = entryType('religions', {
  colour: req(colour()),
  icon: str(),
});
