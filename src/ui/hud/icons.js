// Icons for the interface (graphics overhaul G1): <svg><use href="assets/icons.svg#i-name">,
// from the sprite drawn by tools/gen/icons.mjs. Pixel-crisp at any size that is
// a multiple of 16. Decorative by default; pass a label to make one speak.

const SVG = 'http://www.w3.org/2000/svg';
export const ICON_SPRITE = 'assets/icons.svg';

/** An icon element: icon(doc, 'gold', { size: 16, label: 'Gold' }). */
export function icon(doc, name, { size = 16, label = null, className = '' } = {}) {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `icon icon-${name}${className ? ` ${className}` : ''}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('shape-rendering', 'crispEdges');
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(SVG, 'use');
  use.setAttribute('href', `${ICON_SPRITE}#i-${name}`);
  svg.append(use);
  return svg;
}
