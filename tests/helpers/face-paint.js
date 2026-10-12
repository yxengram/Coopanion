/**
 * The standing face of a girl as her face.js paints it, call for call, for the frozen fixtures
 * tests/fixtures/face-paint-<figure>.json: they were written with this driver from each girl's face.js and model.json at
 * commit 298977d, before the live faces on the floor drawings, so painting with no `place` is checked to be the same
 * (tests/helpers/floor-face.js; the fixtures: scratch/combo3/live/tools/painter_fixture.mjs).
 */
import { createHash } from 'node:crypto';
import { FACES, PLUS_FACES } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';

/** A 2D context that records every call and property set into `log` (numbers rounded), with a canvas around it. */
export function recCanvas(log, tag, w = 1, h = 1) {
  const grad = { addColorStop: (...a) => log.push([`${tag}grad.stop`, ...a.map(r4)]) };
  const cv = { width: w, height: h };
  const ctx = new Proxy({ canvas: cv }, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { log.push([tag + k, ...a.map(r4)]); return grad; };
      return (...a) => { log.push([tag + k, ...a.map(r4)]); };
    },
    set(o, k, v) { o[k] = v; log.push([`${tag}${k}=`, r4(v)]); return true; },
  });
  cv.getContext = () => ctx;
  cv.ctx = ctx;
  return cv;
}
export const r4 = v => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v && typeof v === 'object' ? (v.name ?? (v.ctx ? 'canvas' : 'obj')) : v);
/** Sprite images by name: any name the painter asks for is there. */
export const IMGS = new Proxy({}, { get: (o, n) => (typeof n === 'string' ? { name: n, width: 40, height: 30 } : undefined), has: () => true });
const PAINT_FRAMES = [
  { t: 1, look: [0, 0] },
  { t: 1.37, look: [3, -2], blink: .4 },
  { t: 2.11, look: [-4, 1], talk: 1, talkShape: 2 },
];
/**
 * The standing face as painted by face module `F` for `model`, for every kit face (and its plus faces) in a few frames:
 * a sha-256 of each face's 2D calls and their count. Frozen at commit 298977d (before the floor faces) in
 * tests/fixtures/face-paint-<figure>.json, so painting with no `place` is checked to be the same as it was, call for call.
 */
export function paintRecord(F, model, rect) {
  const out = {};
  for (const name of [...new Set([...Object.keys(FACES), ...Object.keys(PLUS_FACES)])]) {
    const log = [];
    const painter = F.createFacePainter(model, { rect, makeCanvas: (w, h) => recCanvas(log, 'eye.', w, h) });
    const cv = recCanvas(log, '', painter.rect.w, painter.rect.h);
    for (const o of PAINT_FRAMES) {
      const fc = (FACES[name] || PLUS_FACES[name]).f(o.t);
      log.push(['frame', o.t]);
      painter.paint(cv.ctx, IMGS, fc, name, o, o.t);
    }
    out[name] = { n: log.length, sha: createHash('sha256').update(JSON.stringify(log)).digest('hex').slice(0, 16) };
  }
  return out;
}

