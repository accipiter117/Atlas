// Maths that gives the same answer in every browser.
//
// JavaScript engines may compute Math.exp slightly differently. Combat uses
// e^x for damage, so a tiny difference could make the same battle end
// differently on two machines and break replays and online play. This
// version uses only + - * / and exact powers of two.

const LN2 = 0.6931471805599453;

/** e to the power x, deterministically. */
export function expDet(x) {
  if (!Number.isFinite(x)) throw new RangeError(`expDet needs a finite number, got ${x}`);
  const n = Math.round(x / LN2);
  const r = x - n * LN2; // |r| <= 0.35
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= 18; k += 1) {
    term = (term * r) / k;
    sum += term;
  }
  let scale = 1;
  if (n > 0) for (let i = 0; i < n; i += 1) scale *= 2;
  else for (let i = 0; i < -n; i += 1) scale /= 2;
  return sum * scale;
}
