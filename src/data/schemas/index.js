// Every content type the loader knows, by name. A file whose contentType is
// not listed here is refused, so a typo cannot quietly load nothing.

import * as map from './map.js';
import * as units from './units.js';
import * as city from './city.js';
import * as progression from './progression.js';
import * as religion from './religion.js';
import * as systems from './systems.js';
import * as factions from './factions.js';
import * as ui from './ui.js';

/** Entry-list content types: each file holds { contentType, entries: [...] }. */
export const ENTRY_SCHEMAS = Object.freeze(Object.fromEntries(
  [map, units, city, progression, religion, systems, factions, ui]
    .flatMap((m) => Object.values(m))
    .filter((s) => s && s.kind === 'entries')
    .map((s) => [s.contentType, s]),
));

/** Whole-object content types, merged by key rather than by entry id. */
export const OBJECT_TYPES = Object.freeze(['tuning', 'text', 'skin']);

export const CONTENT_TYPES = Object.freeze([...Object.keys(ENTRY_SCHEMAS), ...OBJECT_TYPES]);
