/**
 * Lying down and getting up again (with a jump, or a stand), on the kit: the lying drawing cuts in and out, so the
 * standing figure and the lying drawing are never both shown (two of her at once) for more than a frame each way.
 * `lieCutCheck(h)` runs it on any figure: `h.pet` the kit's pet, `h.frame()` one more drawn frame's `{ pose, front }`
 * (the lying drawing's share, and whether the standing figure is drawn too). `describeLieCut` runs it on one of the four
 * girls' motion.js (the same code in each), on her real model.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPet } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';

export function lieCutCheck(h) {
  const run = (sec, each = () => {}) => { for (let i = 0; i < Math.round(sec * 60); i++) each(h.frame()); };
  run(1);
  for (const up of ['jump', 'stand']) {
    let both = 0, last = null;
    const count = f => { last = f; if (f.pose > 0 && f.front) both++; };
    h.pet.doWord('lie');
    run(3, count);
    expect(last.pose, `${up}: lying`).toBe(1);
    expect(last.front, `${up}: lying`).toBe(false);
    h.pet.doWord(up);
    run(3, count);
    expect(last.pose, `${up}: up`).toBe(0);
    expect(last.front, `${up}: up`).toBe(true);
    // (a frame each way at most)
    expect(both, up).toBeLessThanOrEqual(2);
  }
}

/** `name` her name in the titles, `dir` her web directory, `M` her motion.js, `GESTURES` her figure's. */
export function describeLieCut(name, { dir, M, GESTURES }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  describe(`${name}: lying down and getting up`, () => {
    it('on the real rig: lying down and getting up (jump or stand), the lying drawing cuts, never two of her at once', () => {
      const R = M.buildRig(model), motion = M.createMotion(model, R);
      const caps = { pose: id => !!R.ARM[id] || !!R.W[id], tex: () => true };
      let last = null;
      const fig = {
        draw(g, fc, o) { last = motion.step(fc, o, 1 / 60, caps); },
        groupTilt: motion.groupTilt, gestures: GESTURES,
        get poses() { return { lie: !!R.W.lie, back: true }; },
        get kneelArms() { return !!R.W.kneelLow; },
        get anchors() { return M.liveAnchors(M.anchorsOf(model, R), motion.sitRaise); },
        extent: M.extentOf(model, R), hits: M.hitsOf(model, R),
      };
      const el = () => ({ setAttribute() {}, innerHTML: '' });
      const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
      pet.resize();
      // (and every frame's deformer states and alphas finite)
      const bad = new Set();
      const finite = () => {
        for (const [id, v] of Object.entries(last.st)) {
          if (id === 'alpha') { for (const [p, x] of Object.entries(v)) if (!(x >= 0 && x <= 1)) bad.add(`alpha ${p}`); continue; }
          if (v && typeof v === 'object') for (const k of ['a', 'tx', 'ty', 'sx', 'sy', 's']) if (k in v && !Number.isFinite(v[k])) bad.add(`${id}.${k}`);
        }
      };
      lieCutCheck({ pet, frame: () => { pet.step(1 / 60); pet.render(); finite(); return { pose: last.poseShown, front: !last.hideFront }; } });
      expect([...bad]).toEqual([]);
    });
  });
}
