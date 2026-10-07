/**
 * Claude-chan's effects over the figure, as SVG (like the built-in figure's): orbiting stars, listening arcs, thought
 * bubbles, sweat, anger mark, ! and ?, gloom lines, a sigh's breath, a cup's steam and a petrified crack.
 *
 * Every point comes from model.fx (rig units; see motion.js fxPointsOf for the keys and their defaults) and is moved
 * with her this frame by the caller's `at` (head points) and `pt(deformer, x, y)`; this file only writes markup.
 */
import { clamp, f1, lerp } from './motion.js';

/**
 * The markup for face `fc` at time `t`. `e`: { P (fx points), at(x, y), pt(deformer, x, y), lying (the lying drawing
 * shows), accent, steam (0..1), steamAt ([deformer, [x, y]]), puffK (0..1), turn ([angleX, angleY]) }.
 */
export function fxMarkup(fc, t, e) {
  const { P, at, pt } = e, ac = e.accent || '#D97757';
  let s = '';
  if (e.steam > .02 && e.steamAt) {
    // three wisps curling up off the cup, each fading as it rises
    const [x, y] = e.steamAt[1];
    for (let i = 0; i < 3; i++) {
      const q = (t * .6 + i / 3) % 1, c = pt(e.steamAt[0], x - 7 + 7 * i + 2.5 * Math.sin(t * 2 + i * 2 + q * 5), y - 3 - 22 * q);
      const d = `M${f1(c[0])} ${f1(c[1] + 6)}q3 -3 0 -6t0 -6`, a = f1(.75 * Math.sin(Math.PI * q) * e.steam);
      s += `<path fill="none" stroke="#7d86a8" stroke-width="3.6" stroke-linecap="round" opacity="${f1(a * .35)}" d="${d}"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="${a}" d="${d}"/>`;
    }
  }
  if (fc.crack > 0) {
    // a jagged crack down her, growing from the top of the head (drawn over her: stone cannot really split)
    const pts = e.lying && P.crackLie ? P.crackLie.map(([x, y]) => pt('lie', x, y)) : P.crack.map(([x, y]) => pt(y < P.neckY ? 'neck' : 'body', x, y));
    const n = (pts.length - 1) * clamp(fc.crack, 0, 1), i = Math.floor(n), q = n - i;
    const line = pts.slice(0, i + 1).concat(i < pts.length - 1 ? [[lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)]] : []);
    const d = 'M' + line.map(p => `${f1(p[0])} ${f1(p[1])}`).join('L');
    s += `<path fill="none" stroke="#f2f3f6" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round" d="${d}"/><path fill="none" stroke="#3b3f4a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="${d}"/>`;
  }
  if (e.puffK > 0 && e.puffK < 1 && !e.lying) {
    // the breath of a sigh: two little clouds drifting out from the mouth, out and down, fading
    const m = pt('headFeat', P.puff[0], P.puff[1]);
    for (let i = 0; i < 2; i++) {
      const q = clamp(e.puffK * 1.3 - i * .3, 0, 1), x = m[0] + 8 + 20 * q, y = m[1] + 3 + 9 * q, r = 5 + 5 * q;
      if (q > 0) s += `<g opacity="${f1(.9 * Math.sin(Math.PI * q))}" fill="#fff" stroke="#8a93b0" stroke-width="1.8"><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/><circle cx="${f1(x + r * .9)}" cy="${f1(y + r * .3)}" r="${f1(r * .7)}"/></g>`;
    }
  }
  if (fc.orbit) {
    const top = at(...P.orbit), R = P.orbitR || 56;
    for (let i = 0; i < 3; i++) {
      const a = t * 3.2 + i * 2.094, sn = Math.sin(a);
      s += `<path fill="#ffd23f" stroke="#3a2f7a" stroke-width="1.6" stroke-linejoin="round" opacity="${sn < 0 ? .55 : 1}" transform="translate(${f1(top[0] + R * Math.cos(a))} ${f1(top[1] - 4 + 10 * sn)}) scale(${sn < 0 ? .7 : 1})" d="M0 -7L2 -2L7 -2L3 1L4.5 6.5L0 3.3L-4.5 6.5L-3 1L-7 -2L-2 -2Z"/>`;
    }
  }
  if (fc.listen) {
    const c = at(...P.listen);
    for (let i = 0; i < 3; i++) {
      const p = (t * .9 + i / 3) % 1, r = 36 - 24 * p;
      s += `<path fill="none" stroke="${ac}" stroke-width="5" stroke-linecap="round" opacity="${f1(Math.sin(Math.PI * p))}" d="M${f1(c[0] + r * Math.cos(-.55))} ${f1(c[1] + r * Math.sin(-.55))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(c[0] + r * Math.cos(.55))} ${f1(c[1] + r * Math.sin(.55))}"/>`;
    }
  }
  if (fc.think) {
    const side = at(...P.think);
    for (let i = 0; i < 3; i++) {
      const k = (t * .8 + i / 3) % 1;
      s += `<circle fill="#fff4ec" stroke="${ac}" stroke-width="3" cx="${f1(side[0] + 10 * i)}" cy="${f1(side[1] - 20 * i - 6 * k)}" r="${4 + 3 * i}" opacity="${f1(.4 + .6 * Math.sin(Math.PI * k))}"/>`;
    }
  }
  if (fc.sweat) {
    const c = at(P.sweat[0], P.sweat[1] + 3 * Math.sin(t * 7));
    s += `<path fill="#8fd0ff" stroke="#2f5fae" stroke-width="1.4" transform="translate(${f1(c[0])} ${f1(c[1])}) scale(1.4)" d="M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z"/>`;
  }
  if (fc.anger) {
    const c = at(...P.anger), k = 1 + .12 * Math.sin(t * 10);
    s += `<g transform="translate(${f1(c[0])} ${f1(c[1])}) scale(${f1(k)})" fill="none" stroke="#e5484d" stroke-width="5" stroke-linecap="round"><path d="M-11 -3Q-3 -3 -3 -11M3 -11Q3 -3 11 -3M11 3Q3 3 3 11M-3 11Q-3 3 -11 3"/></g>`;
  }
  if (fc.bang) {
    const c = at(...P.bang);
    s += `<g transform="translate(${f1(c[0])} ${f1(c[1])})"><path fill="none" stroke="#3a2420" stroke-width="8" stroke-linecap="round" d="M0 -16V3"/><circle fill="#3a2420" cx="0" cy="14" r="4.5"/></g>`;
  }
  if (fc.gloom) {
    // three strokes on the fringe above the brows, moved with the face's turn (at() follows only the neck);
    // a pale edge keeps them readable on her hair
    const [ax, ay] = e.turn || [0, 0];
    let d = '';
    for (const [x, y0, y1] of P.gloom) {
      const a = at(x + ax * 3, y0 + ay * 2), b = at(x + ax * 3, y1 + ay * 2);
      d += `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
    }
    s += `<g fill="none" stroke-linecap="round"><path stroke="#fff" stroke-width="5.4" opacity=".75" d="${d}"/><path stroke="#3a2420" stroke-width="3" d="${d}"/></g>`;
  }
  if (fc.question) {
    const c = at(...P.question), k = 1 + .06 * Math.sin(t * 3);
    s += `<g transform="translate(${f1(c[0])} ${f1(c[1])}) scale(${f1(k)})"><path fill="none" stroke="#3a2420" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M-8 -9Q-8 -19 0 -19Q9 -19 9 -11Q9 -4 0 -1V4"/><circle fill="#3a2420" cx="0" cy="14" r="4.5"/></g>`;
  }
  return s;
}
