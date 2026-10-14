/**
 * A kneel at rest, frame by frame, for the frozen fixtures tests/fixtures/kneel-rest-<figure>.json: they were written
 * with this driver from each girl's motion.js and model.json as they were before the kneeling hybrid (commit 0fa2d0e),
 * so a kneel with her arms at rest is checked to draw exactly as it did (tests/helpers/kneel-arms.js). Grok-chan came
 * after the hybrid, so hers was written from her first motion.js on her model without its floor faces and the arm
 * drawings the others' fixtures predate, as kneel-arms.js reads it (scratch/grok/tools/fixtures.mjs).
 */
import { FACES, PLUS_FACES } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';

export const faceOf = n => (FACES[n] || PLUS_FACES[n] || FACES.neutral).f(0);
/** A still frame of the kit's, with `x` over it. */
export const frameOf = (x = {}) => ({ t: 1, mode: 'idle', face: 'neutral', look: [0, 0], legs: [[104, 212, 104, 241], [150, 212, 150, 241]], low: 0, sit: 0, tilt: 0, lean: 0, facing: 1, swing: 0, gesture: null, ...x });
/** Faces that do not pose her arms (FACE_ARMS), and listening, which kneeling she leaves out (KNEEL_FACE_SKIP). */
export const REST_FACES = ['neutral', 'happy', 'sad', 'surprised', 'love', 'wink', 'sleepy', 'smug', 'cry', 'confused', 'worried', 'gentle', 'giggle', 'listening'];

/**
 * A kneel at rest, frame by frame on motion module `M` (no kit: every frame is made here, so it is the same each run):
 * she sinks and kneels, holds the faces above and the head's gestures, and gets up. Each frame gives whether the
 * standing rig is hidden, how far her points rise, and the alpha of every part but `kneel_low` as drawn (a standing part
 * under an opaque drawing, `hideFront`, is not drawn: 0), run-length coded: [[count, record], ...]. So the standing
 * rig's arms and book sinking down and getting up are checked too, not only the floor drawings and the seated body.
 */
export function restRecord(M, model) {
  const R = M.buildRig(model), motion = M.createMotion(model, R);
  const caps = { pose: id => !!R.ARM[id] || !!R.W[id], tex: () => true };
  const ids = R.parts.filter(p => p.id !== 'kneel_low').map(p => p.id);
  const shown = (r, id) => (r.hideFront && R.STANDING[id] ? 0 : r.st.alpha[id] ?? 0);
  const out = [], lows = [];
  let t = 0;
  const step = (x, fc) => {
    t += 1 / 60;
    const r = motion.step(fc ?? faceOf(x.face || 'neutral'), frameOf({ ...x, t }), 1 / 60, caps);
    lows.push(r.st.alpha.kneel_low ?? 0);
    const rec = `${r.hideFront ? 1 : 0}|${motion.sitRaise.toFixed(4)}|${ids.map(id => shown(r, id).toFixed(3)).join(',')}`;
    const last = out[out.length - 1];
    if (last && last[1] === rec) last[0]++; else out.push([1, rec]);
  };
  for (let i = 0; i < 30; i++) step({});
  for (let i = 1; i <= 30; i++) step({ mode: 'sit', kneel: true, sit: i / 30, low: 29 * i / 30 });
  const down = { mode: 'sit', kneel: true, sit: 1, low: 29 };
  for (let i = 0; i < 120; i++) step(down);
  for (const face of REST_FACES) for (let i = 0; i < 60; i++) step({ ...down, face });
  for (const kind of ['nod', 'shake', 'sigh']) for (let i = 0; i < 60; i++) step({ ...down, head: { kind, k: i / 59 } });
  for (let i = 0; i < 30; i++) step({ ...down, kneel: false, mode: 'wake' });
  for (let i = 29; i >= 0; i--) step({ mode: 'idle', sit: i / 30, low: 29 * i / 30 });
  return { ids, frames: out, lows };
}

