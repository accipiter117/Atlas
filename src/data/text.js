// Looking up player text by key, with {name} arguments:
//   t(text, 'report.missingDependency', { mod: 'witcher', needs: 'base-ancient' })
// A missing key shows the key itself in square brackets, so a gap is visible
// on screen rather than crashing the game.

export function formatText(template, args = {}) {
  return template.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(args, name) ? String(args[name]) : whole));
}

export function t(text, key, args) {
  const template = text?.[key];
  if (typeof template !== 'string') return `[${key}]`;
  return formatText(template, args);
}

export function hasText(text, key) {
  return typeof text?.[key] === 'string';
}
