/**
 * Lettering in the Cortico wordmark's construction (vendor/cortico/assets/cortico-banner.svg):
 * monoline strokes with round caps (16 wide in the banner), a 48-unit x-height on the
 * centre line y = 110, ascenders from y = 56, letters 31 units apart skeleton to skeleton, and
 * every "o" in the accent color. A capital C is the same arc at radius 42 standing on the
 * baseline; one that starts a later word gets a little extra space before it.
 *
 * Geometry only; banner.mjs draws the repository banners and console/branding.ts from it.
 */
const f1 = (n) => Math.round(n * 10) / 10;

const R = 24, Y = 110, TOP = 86, BASE = 134, ASC = 56, GAP = 31, RC = 42, WORD = 12;
const K = R * Math.SQRT1_2;
const ring = (cx) => `M${cx} ${Y - R}A${R} ${R} 0 1 1 ${cx} ${Y + R}A${R} ${R} 0 1 1 ${cx} ${Y - R}`;

/** A capital C: the lower-case arc at radius r, centred at height cy, optionally with its own stroke width. */
const capital = (r, cy, width) => {
  const k = r * Math.SQRT1_2;
  return { w: r + k, strokes: (x) => [{ d: `M${f1(x + r + k)} ${f1(cy - k)}A${r} ${r} 0 1 0 ${f1(x + r + k)} ${f1(cy + k)}`, width }] };
};

/** Each glyph: skeleton width and its strokes at left skeleton edge x. */
const GLYPHS = {
  C: capital(RC, BASE - RC),
  c: { w: R + K, strokes: (x) => [{ d: `M${f1(x + R + K)} ${f1(Y - K)}A${R} ${R} 0 1 0 ${f1(x + R + K)} ${f1(Y + K)}` }] },
  o: { w: 2 * R, strokes: (x) => [{ d: ring(x + R), accent: true }] },
  r: { w: R, strokes: (x) => [{ d: `M${x} ${TOP}V${BASE}` }, { d: `M${x} ${Y + 2}A${R} ${R} 0 0 1 ${x + R} ${TOP + 2}` }] },
  t: { w: 32, strokes: (x) => [{ d: `M${x + 16} 70V${BASE}` }, { d: `M${x} 78H${x + 32}` }] },
  i: { w: 0, strokes: (x) => [{ d: `M${x} ${TOP}V${BASE}` }, { dot: [x, 58] }] },
  m: { w: 88, strokes: (x) => [{ d: `M${x} ${TOP}V${BASE}` }, { d: `M${x} 108A22 22 0 0 1 ${x + 44} 108V${BASE}` }, { d: `M${x + 44} 108A22 22 0 0 1 ${x + 88} 108V${BASE}` }] },
  n: { w: 2 * R, strokes: (x) => [{ d: `M${x} ${TOP}V${BASE}` }, { d: `M${x} ${Y}A${R} ${R} 0 0 1 ${x + 2 * R} ${Y}V${BASE}` }] },
  p: { w: 2 * R, strokes: (x) => [{ d: `M${x} ${TOP}V158` }, { d: ring(x + R) }] },
  a: { w: 2 * R, strokes: (x) => [{ d: ring(x + R) }, { d: `M${x + 2 * R} ${TOP}V${BASE}` }] },
  d: { w: 2 * R, strokes: (x) => [{ d: ring(x + R) }, { d: `M${x + 2 * R} ${ASC}V${BASE}` }] },
  e: { w: 2 * R, strokes: (x) => [{ d: `M${x} ${Y}H${x + 2 * R}A${R} ${R} 0 1 0 ${f1(x + R + K)} ${f1(Y + K)}` }] },
  s: { w: 30, strokes: (x) => [{ d: `M${x + 28} 93C${x + 25} 88 ${x + 21} 86 ${x + 15} 86C${x + 7} 86 ${x + 2} 91 ${x + 2} 97C${x + 2} 110 ${x + 30} 108 ${x + 30} 122C${x + 30} 129 ${x + 24} 134 ${x + 15} 134C${x + 9} 134 ${x + 4} 132 ${x + 1} 127` }] },
  k: { w: 32, strokes: (x) => [{ d: `M${x} ${ASC}V${BASE}` }, { d: `M${x + 30} ${TOP}L${x + 2} 114` }, { d: `M${x + 13} 104L${x + 32} ${BASE}` }] },
  l: { w: 0, strokes: (x) => [{ d: `M${x} ${ASC}V${BASE}` }] },
  u: { w: 2 * R, strokes: (x) => [{ d: `M${x} ${TOP}V${Y}A${R} ${R} 0 0 0 ${x + 2 * R} ${Y}` }, { d: `M${x + 2 * R} ${TOP}V${BASE}` }] },
  w: { w: 52, strokes: (x) => [{ d: `M${x} ${TOP}L${x + 13} ${BASE}L${x + 26} 94L${x + 39} ${BASE}L${x + 52} ${TOP}` }] },
  '-': { w: 22, strokes: (x) => [{ d: `M${x} ${Y}H${x + 22}` }] },
  ' ': { w: 4, strokes: () => [] },
};

/**
 * Glyph strokes laid out left to right from x = 0, with each glyph's left edge and the total
 * skeleton width. `cap` ({ r, cy, width }) replaces the capital C, e.g. with a larger, heavier initial.
 */
export function lettering(text, { cap, accentAt } = {}) {
  let cursor = 0;
  const at = [];
  const glyphs = [...text].map((ch, i) => {
    if (ch === 'C' && i > 0) cursor += WORD;
    const g = ch === 'C' && cap ? capital(cap.r, cap.cy, cap.width) : GLYPHS[ch];
    if (!g) throw new Error(`no glyph for "${ch}"`);
    at.push(cursor); cursor += g.w + GAP;
    return g.strokes(at[i]).map(s => accentAt ? { ...s, accent: accentAt.includes(i) } : s);
  });
  return { width: cursor - GAP, glyphs, at };
}
/** Vertical extent of lettering in its own units: ascender and i-dot tops, descender bottom. */
export const LETTER_BOX = { top: 40, centre: Y, bottom: 166 };
