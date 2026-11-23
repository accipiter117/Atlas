// Turning loader report messages into sentences, using the text file.
//
// Messages are stored as codes with parameters so they can be worded (and
// later translated) in text, never in code. Ids are wrapped in `backticks`;
// the Mods screen shows those as code.

import { t } from './text.js';

function counts(text, bucket) {
  return Object.entries(bucket)
    .filter(([, n]) => n > 0)
    .map(([type, n]) => t(text, 'report.count', { n, type }))
    .join(', ');
}

/** One report message as a sentence. */
export function formatMessage(text, msg) {
  const p = { ...msg.params, mod: msg.mod ?? '' };
  switch (msg.code) {
    case 'schema':
      return t(text, 'report.schema', { ...p, problem: t(text, `schema.${p.problem}`, p) });
    case 'lastOneWins': {
      const chain = p.changes.map((c) => t(text, 'report.change', c)).join(t(text, 'report.then'));
      return t(text, 'report.lastOneWins', { ...p, chain });
    }
    case 'modSummary': {
      const parts = [];
      for (const kind of ['added', 'replaced', 'changed', 'removed']) {
        const list = counts(text, p.detail[kind]);
        if (list) parts.push(t(text, `report.summary.${kind}`, { list }));
      }
      const cascaded = counts(text, p.detail.cascaded);
      if (cascaded) parts.push(t(text, 'report.summary.cascaded', { list: cascaded }));
      return t(text, 'report.modSummary', { mod: p.mod, parts: parts.join('; ') });
    }
    default:
      return t(text, `report.${msg.code}`, p);
  }
}

/** Group a report's messages by level, already worded. */
export function groupReport(text, report) {
  const groups = { error: [], warning: [], info: [] };
  for (const m of report.messages) groups[m.level].push({ ...m, text: formatMessage(text, m) });
  return groups;
}
