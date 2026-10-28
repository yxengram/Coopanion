/**
 * Where the kit puts the four girls' marks seated and kneeling: every head point it takes from her (figure.anchors:
 * the sneeze's mist at `mouth`, the tears, the z's and notes, the hearts, the glints, the bubble and what hangs off it:
 * the ghost, the cloud, the dots, the bulb, the spout) is where her live head draws it, in both outfits. The kit sinks
 * its points by its `low` (29 seated), her head sinks less (her seated or kneeling drawing's headDrop): her motion's
 * sitRaise lifts them by the difference (liveAnchors). The whale had no such lift seated and her points sat 7-9 units
 * under her head (tests/whale-pose.test.js, SEAT_LIFT); this pins that the girls never do.
 * `describeSeatAnchors` runs the same test on each.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPet } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';
import { outfitModel } from '../../packages/cortico-world-desktop-pet/web/kit/outfit.js';

/** `name` her name in the titles, `dir` her web directory, `M` her motion.js, `GESTURES` her figure's. */
export function describeSeatAnchors(name, { dir, M, GESTURES }) {
  const full = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));

  function onKit(model) {
    const R = M.buildRig(model), motion = M.createMotion(model, R);
    const caps = { pose: id => !!R.ARM[id] || !!R.W[id], tex: () => true };
    const base = M.anchorsOf(model, R);
    const s = { R, motion, base, last: null };
    s.fig = {
      draw(g, fc, o) { s.last = motion.step(fc, o, 1 / 60, caps); },
      groupTilt: motion.groupTilt, gestures: GESTURES,
      get poses() { return { lie: !!R.W.lie, back: true }; },
      get kneelArms() { return !!R.W.kneelLow; },
      get anchors() { return M.liveAnchors(base, motion.sitRaise); },
      extent: M.extentOf(model, R), hits: M.hitsOf(model, R),
    };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    s.pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: s.fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    s.pet.resize();
    s.run = sec => { for (let i = 0; i < Math.round(sec * 60); i++) { s.pet.step(1 / 60); s.pet.render(); } };
    return s;
  }
  /** Each head point the kit uses: [name, where the kit puts it (logo units), where her head draws it this frame]. */
  function offsets(s) {
    const A = s.fig.anchors, B = s.base, low = s.pet.pet.low - (s.pet.pet.kneel ? (A.kneelRaise || 0) : 0);
    const at = p => M.pointOf(s.R.deformers, 'headFeat', s.last.st, ...p);
    const out = [];
    for (const k of ['gaze', 'tear', 'z', 'bubble', 'bulb', 'mouth']) if (B[k]) out.push([k, A[k], B[k]]);
    for (const k of ['tears', 'glints']) for (let i = 0; i < (B[k]?.length ?? 0); i++) out.push([`${k}${i}`, A[k][i], B[k][i]]);
    if (B.hearts) out.push(['hearts', [(A.hearts[0] + A.hearts[1]) / 2, A.hearts[2]], [(B.hearts[0] + B.hearts[1]) / 2, B.hearts[2]]]);
    return out.map(([k, a, b]) => { const d = at(b); return [k, a[0] - d[0], a[1] + low - d[1]]; });
  }

  describe(`${name}: the kit's points on her head seated and kneeling`, () => {
    for (const outfit of (full.outfits || [{ id: 'classic' }]).map(o => o.id)) {
      it(`${outfit}: standing, seated and kneeling, every head point the kit takes from her is where her head is drawn`, () => {
        const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
        try {
          const s = onKit(outfitModel(full, outfit));
          s.run(1);
          for (const scene of ['stand', 'sit', 'kneel']) {
            if (scene !== 'stand') { s.pet.doWord(scene); s.run(3); }
            if (scene === 'sit') expect(s.motion.sitRaise, outfit).toBeGreaterThan(0);
            if (scene === 'kneel') expect(s.last.st.alpha.kneel_body, outfit).toBe(1);
            // (a few units are left, as standing: her breath scales the body about her feet, the idle tilt turns the
            // head, and the kit reads the points a frame before she draws)
            for (const [k, dx, dy] of offsets(s)) {
              expect(Math.abs(dx), `${outfit} ${scene} ${k}`).toBeLessThan(3.5);
              expect(Math.abs(dy), `${outfit} ${scene} ${k}`).toBeLessThan(3.5);
            }
          }
        } finally { rand.mockRestore(); }
      });
    }
  });
}
