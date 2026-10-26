/**
 * Two things the four girls do the same way (the same code in each motion.js), on the kit (plus):
 * - 抹眼泪 (weep) cut short by another gesture on the same 哎呀 drawing (哎呀, 后缩, 捂嘴笑 falling back to it): the fists
 *   come down from her eyes to her mouth over frames (weepK, tiltEased), never in one while the drawing shows;
 * - 打喷嚏 (sneeze): the mist bursts from her mouth (anchors.mouth, the sigh's puff point) at the jolt's peak
 *   (SNEEZE.mist), so it stays by her mouth as her head comes down from the caught breath, not over her eyes, standing,
 *   seated and kneeling.
 * `describeWeepSneeze` runs the same tests on each.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPet } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';

/** `name` her name in the titles, `dir` her web directory, `M` her motion.js, `GESTURES` her figure's. */
export function describeWeepSneeze(name, { dir, M, GESTURES }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));

  function onKit() {
    const R = M.buildRig(model), motion = M.createMotion(model, R);
    const caps = { pose: id => !!R.ARM[id] || !!R.W[id], tex: () => true };
    const base = M.anchorsOf(model, R);
    const s = { R, motion, last: null };
    s.fig = {
      draw(g, fc, o) { s.last = motion.step(fc, o, 1 / 60, caps); },
      groupTilt: motion.groupTilt, gestures: GESTURES,
      get poses() { return { lie: !!R.W.lie, back: true }; },
      get kneelArms() { return !!R.W.kneelLow; },
      get anchors() { return M.liveAnchors(base, motion.sitRaise); },
      extent: M.extentOf(model, R), hits: M.hitsOf(model, R),
    };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    s.fxG = el();
    s.pet = createPet({ petG: el(), shadowEl: el(), fxG: s.fxG }, { sfx: { play() {} }, figure: s.fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    s.pet.resize();
    s.run = sec => { for (let i = 0; i < Math.round(sec * 60); i++) { s.pet.step(1 / 60); s.pet.render(); } };
    return s;
  }

  describe(`${name}: 抹眼泪 cut short, and 打喷嚏's mist`, () => {
    it('brings the weep\'s fists down over frames when 哎呀, 后缩 or 捂嘴笑 cuts it short on the same drawing', () => {
      const A = M.buildRig(model).ARM.oops, ids = A.parts.map(p => p.id);
      for (const next of ['oops', 'flinch', 'cover']) {
        for (const scene of ['stand', 'sit']) {
          const s = onKit();
          s.run(.5);
          if (scene === 'sit') { s.pet.doWord('sit'); s.run(3); }
          s.pet.doWord('weep');
          s.run(1);
          const at = () => ({ a: Math.max(...ids.map(i => s.last.st.alpha[i] ?? 0)), ty: s.last.st[A.rot].ty, sx: s.last.st[A.rot].sx });
          const before = at();
          // (up at her eyes, the drawing whole)
          expect(before.a, `${next} ${scene}`).toBe(1);
          expect(before.ty, `${next} ${scene}`).toBeLessThan(-M.WEEP.ty * .9);
          s.pet.doWord(next);
          let was = before, dty = 0, dsx = 0;
          for (let i = 0; i < 90; i++) {
            s.run(1 / 60);
            const now = at();
            if (now.a > .5 && was.a > .5) { dty = Math.max(dty, Math.abs(now.ty - was.ty)); dsx = Math.max(dsx, Math.abs(now.sx - was.sx)); }
            was = now;
          }
          // (a full weep's lift came down in one frame before: WEEP.ty units and all of its spread)
          expect(dty, `${next} ${scene}`).toBeLessThan(M.WEEP.ty * .2);
          expect(dsx, `${next} ${scene}`).toBeLessThan(M.WEEP.spread * .2);
          // ...and they do come down, to the next gesture's own place
          expect(s.motion.arms.oops > .5 ? s.last.st[A.rot].ty : 0, `${next} ${scene}`).toBeGreaterThan(-M.WEEP.ty * .2);
        }
      }
    });

    it('has her mouth as the kit\'s mouth spot, the sigh\'s puff point: under her tear spots, raised with them seated', () => {
      const R = M.buildRig(model), A = M.anchorsOf(model, R), P = M.fxPointsOf(model, R);
      expect(A.mouth).toEqual(P.puff);
      expect(A.mouth[1]).toBeGreaterThan((A.tears[0][1] + A.tears[1][1]) / 2);
      expect(Math.abs(A.mouth[0] - (A.tears[0][0] + A.tears[1][0]) / 2)).toBeLessThan(12);
      const up = M.sitAnchors(A, 5);
      expect(up.mouth).toEqual([A.mouth[0], +(A.mouth[1] - 5).toFixed(1)]);
    });

    for (const scene of ['stand', 'sit', 'kneel']) {
      it(`sneezes her mist from her mouth ${scene === 'stand' ? 'standing' : scene === 'sit' ? 'seated' : 'kneeling'}, not from under her eyes`, () => {
        const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
        try {
          const s = onKit();
          s.run(.5);
          if (scene !== 'stand') { s.pet.doWord(scene); s.run(3); }
          s.pet.doWord('sneeze');
          const MIST = /<g fill="#8a93b0"[^>]*><circle cx="([-\d.]+)" cy="([-\d.]+)"/g;
          let xs = [];
          for (let i = 0; i < 3 * 60 && !xs.length; i++) { s.run(1 / 60); xs = [...s.fxG.innerHTML.matchAll(MIST)].map(m => [+m[1], +m[2]]); }
          expect(xs.length, scene).toBeGreaterThanOrEqual(3);
          // (a few frames on, with the head down at the bottom of the jolt)
          s.run(4 / 60);
          xs = [...s.fxG.innerHTML.matchAll(MIST)].map(m => [+m[1], +m[2]]);
          // where her mouth is drawn this frame (the sigh's puff point through her live head), on the stage
          const P = M.fxPointsOf(model, s.R), live = M.pointOf(s.R.deformers, 'headFeat', s.last.st, ...P.puff), mouth = s.pet.toStage(...live);
          const S = s.pet.toStage(0, 1).y - s.pet.toStage(0, 0).y;
          const cy = xs.reduce((a, p) => a + p[1], 0) / xs.length, cx = xs.reduce((a, p) => a + p[0], 0) / xs.length;
          // (bursting at the jolt's start, the head then fell some 7-10 units under it: the mist hung over her eyes)
          expect(Math.abs(cy - mouth.y) / S, scene).toBeLessThan(3);
          expect(Math.abs(cx - mouth.x) / S, scene).toBeLessThan(8);
        } finally { rand.mockRestore(); }
      });
    }
  });
}
