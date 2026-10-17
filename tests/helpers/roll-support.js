/**
 * The roll ball's floor contact for the four girls (Claude-chan, GPT-chan, Gemini-chan, Grok-chan):
 * poses.roll.support is how far the ball texture's lowest drawn point (alpha >= 128) sits below the rollBall pivot at
 * every turn, and the motion lifts the ball by support[0] - ballLift(support, a). `rollFloat` measures that lowest point
 * on the installed texture every `step` degrees and returns the worst gap to the interpolated table, so a table too
 * coarse for the drawing's corners (every 5° the straight line between two samples floated the ball off the floor) shows
 * up. The table is written by scratch/roll-cut/support_dense.py.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** The alpha channel of an 8-bit RGBA, non-interlaced PNG: { w, h, a }. */
export function alphaOfPng(url) {
  const b = readFileSync(url), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (!(b[24] === 8 && b[25] === 6 && b[28] === 0)) throw new Error(`${url}: not an 8-bit RGBA, non-interlaced PNG`);
  const idat = [];
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const raw = inflateSync(Buffer.concat(idat)), row = w * 4, px = new Uint8Array(row * h), a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
    for (let i = 0; i < row; i++) {
      const l = i >= 4 ? px[dst + i - 4] : 0, u = y ? px[dst + i - row] : 0, ul = y && i >= 4 ? px[dst + i - row - 4] : 0;
      const p = l + u - ul, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul);
      px[dst + i] = (raw[src + i] + [0, l, u, (l + u) >> 1, pa <= pb && pa <= pc ? l : pb <= pc ? u : ul][f]) & 255;
    }
  }
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  return { w, h, a };
}

/**
 * The worst |ballLift(support, deg) - true lowest point| over a sweep every `step` degrees: { worst, at, floor }, with
 * `floor` the measured floor line (pivot + lowest point at 0°). `dir` is the figure's web directory URL, `roll` its
 * model.json poses.roll, `ballLift` its motion.js export.
 */
export function rollFloat(dir, roll, ballLift, step = .5) {
  const [p] = roll.required, [bx, by, bw, bh] = p.box, [cx, cy] = roll.pivots.rollBall;
  const { w, h, a } = alphaOfPng(new URL(`tex/${p.tex}.png`, dir));
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x] >= 128) pts.push(bx + (x + .5) * bw / w - cx, by + (y + .5) * bh / h - cy);
  const lowAt = deg => {
    const t = deg * Math.PI / 180, s = Math.sin(t), c = Math.cos(t);
    let low = -Infinity;
    for (let i = 0; i < pts.length; i += 2) low = Math.max(low, pts[i] * s + pts[i + 1] * c);
    return low;
  };
  let worst = 0, at = 0;
  for (let deg = 0; deg < 360; deg += step) {
    const e = Math.abs(ballLift(roll.support, deg) - lowAt(deg));
    if (e > worst) { worst = e; at = deg; }
  }
  return { worst, at, floor: cy + lowAt(0) };
}
