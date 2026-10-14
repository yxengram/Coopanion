/**
 * The three girls' arm drawings cut in for each other in a frame (the same code in each motion.js: armShown): the arms
 * still move on their shares (armA, over ARM_FADE), but each drawing shows whole or not at all, so one arm is never
 * drawn twice at once, half seen (a double exposure), standing, seated (the seated arms and book too) or in the
 * kneeling hybrid. `describeArmCut` runs the same tests on each.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPet, KIT_MOTIONS, PLUS_MOTIONS } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';

/** `name` her name in the titles, `dir` her web directory, `M` her motion.js, `GESTURES` her figure's. */
export function describeArmCut(name, { dir, M, GESTURES }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  const WORDS = [...new Set([...Object.keys(M.ARM_ONE), ...Object.keys(M.ARM_BOTH)])].filter(w => KIT_MOTIONS.includes(w) || PLUS_MOTIONS.includes(w));

  /** Her motion on the kit (plus), and per frame which drawings each arm shows (any alpha over `min`). */
  function onKit() {
    const R = M.buildRig(model), motion = M.createMotion(model, R);
    const caps = { pose: id => !!R.ARM[id] || !!R.W[id], tex: () => true };
    // every drawing of an arm: the plain arms, the arm drawings (by the arms they replace) and the seated arms and book
    const groups = [['hangL', 'L', R.HANG.hangL], ['hangR', 'R', R.HANG.hangR]];
    for (const [id, A] of Object.entries(R.ARM)) {
      const kind = A.kind || M.POSE_KIND[id] || 'both';
      groups.push([id, kind === 'armL' ? 'L' : kind === 'armR' ? 'R' : 'LR', A.parts.map(p => p.id)]);
    }
    const sitTop = (model.poses.sit?.required || []).filter(p => p.parent === 'sitTop').map(p => p.id);
    if (sitTop.length) groups.push(['sitTop', 'LR', sitTop]);
    const armIds = new Set(groups.flatMap(g => g[2]));
    const s = { motion, last: null };
    const fig = {
      draw(g, fc, o) { s.last = motion.step(fc, o, 1 / 60, caps); },
      groupTilt: motion.groupTilt, gestures: GESTURES,
      get poses() { return { lie: !!R.W.lie, back: true }; },
      get kneelArms() { return !!R.W.kneelLow; },
      get anchors() { return M.liveAnchors(M.anchorsOf(model, R), motion.sitRaise); },
      extent: M.extentOf(model, R), hits: M.hitsOf(model, R),
    };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    s.pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    s.pet.resize();
    /** What each arm shows this frame: { L: [drawing, ...], R: [...] } (none under an opaque whole-body drawing). */
    s.arms = (min = .02) => {
      const out = { L: [], R: [] };
      if (s.last.hideFront) return null;
      for (const [g, side, ids] of groups) {
        const a = Math.max(0, ...ids.map(i => s.last.st.alpha[i] ?? 0));
        if (a > min) for (const x of side) out[x].push(g);
      }
      return out;
    };
    /** Arm parts drawn part way (neither 0 nor 1) this frame. */
    s.partway = () => s.last.hideFront ? [] : [...armIds].filter(i => { const a = s.last.st.alpha[i] ?? 0; return a > 1e-6 && a < 1 - 1e-6; });
    /** Runs `sec` seconds, checking every frame: each arm shows one drawing, whole. */
    s.run = (sec, bad, tag) => {
      for (let i = 0; i < Math.round(sec * 60); i++) {
        s.pet.step(1 / 60); s.pet.render();
        const a = s.arms();
        if (a) for (const x of ['L', 'R']) if (a[x].length !== 1) bad.push(`${tag} f${i} ${x}: ${a[x].join('+') || 'none'}`);
        const p = s.partway();
        if (p.length) bad.push(`${tag} f${i} part way: ${p.slice(0, 3).join(',')}`);
      }
    };
    return s;
  }

  describe(`${name}: arm drawings cut in for each other (armShown)`, () => {
    it('keeps the drawings shown till each one planned has ARM_CUT of its share, or one shown has none left', () => {
      expect(M.ARM_CUT).toBe(.5);
      const book = { L: 'book', R: 'book' }, wave = { L: 'wave', R: 'bookside' };
      expect(M.armShown(book, wave, { book: .6, wave: .4, bookside: .4 })).toBe(book);
      expect(M.armShown(book, wave, { book: .6, wave: .6, bookside: .4 })).toBe(book);
      expect(M.armShown(book, wave, { book: .4, wave: .6, bookside: .6 })).toEqual(wave);
      // a drawing already in (the other arm's) counts at its share
      expect(M.armShown({ L: 'wave', R: 'bookside' }, { L: 'chin', R: 'bookside' }, { wave: .45, chin: .55, bookside: 1 })).toEqual({ L: 'chin', R: 'bookside' });
      // the plan back to what shows: it stays, whatever the shares
      expect(M.armShown(book, { L: 'book', R: 'book' }, { book: .1, wave: .9 })).toBe(book);
      // a drawing shown that has gone (cut under a kneel, or faded out) gives way at once
      expect(M.armShown(book, wave, { wave: .1, bookside: .1 })).toEqual(wave);
      expect(M.armShown(null, wave, {})).toEqual(wave);
    });

    for (const scene of ['stand', 'sit', 'kneel']) {
      it(`shows each arm one drawing, whole, through every arm gesture ${scene === 'stand' ? 'standing' : scene === 'sit' ? 'seated' : 'kneeling'}`, () => {
        const bad = [], seen = new Set();
        for (const w of WORDS) {
          const s = onKit();
          s.run(.5, bad, `${w} before`);
          if (scene !== 'stand') { s.pet.doWord(scene); s.run(3, bad, `${w} ${scene}`); }
          s.pet.doWord(w);
          for (let i = 0; i < 4 * 60; i++) {
            s.run(1 / 60, bad, `${scene} ${w} @${i}`);
            const a = s.arms();
            if (a) for (const g of [...a.L, ...a.R]) seen.add(g);
          }
        }
        expect(bad.slice(0, 10)).toEqual([]);
        // (and the gestures' drawings did show)
        for (const id of ['wave', 'hug', 'cheer', 'clap', 'clapo', 'shrug']) if (model.poses[id]) expect(seen.has(id), id).toBe(true);
      });
    }

    it('cuts in a frame at the middle of the arms\' move, for a gesture right after another and a face\'s pose', () => {
      const bad = [];
      // back to back, the second asked part way through the first's move in, and once it is in
      for (const [a, b, gap] of [['wave', 'hug', .05], ['hug', 'wave', .1], ['heart', 'point', .5], ['cheer', 'cross', .3]]) {
        const s = onKit();
        s.run(.5, bad, 'start');
        s.pet.doWord(a); s.run(gap, bad, `${a}`);
        s.pet.doWord(b); s.run(3, bad, `${a}→${b}`);
      }
      // a face that poses her arms (thinking: her chin on her hand), standing and seated, then a gesture over it
      for (const scene of ['stand', 'sit']) {
        const s = onKit();
        s.run(.5, bad, 'start');
        if (scene === 'sit') { s.pet.doWord('sit'); s.run(3, bad, 'sit'); }
        s.pet.setExpr('thinking', 30); s.run(1.5, bad, `${scene} thinking`);
        expect(s.motion.shown.L, scene).toBe('chin');
        s.pet.doWord('wave'); s.run(2.5, bad, `${scene} thinking wave`);
        s.pet.setExpr('neutral', 30); s.run(1.5, bad, `${scene} neutral`);
        expect(s.motion.shown.L, scene).not.toBe('chin');
      }
      expect(bad.slice(0, 10)).toEqual([]);
      // the move in takes ARM_FADE; the drawing shows from its middle on, in one frame
      const s = onKit();
      s.run(.5, bad, 'start');
      s.pet.doWord('hug');
      let cut = -1;
      for (let i = 0; i < 30 && cut < 0; i++) { s.run(1 / 60, bad, 'hug'); if (s.motion.shown.L === 'hug') cut = i; }
      expect(s.motion.arms.hug).toBeGreaterThanOrEqual(M.ARM_CUT);
      expect(s.motion.arms.hug).toBeLessThan(M.ARM_CUT + 1 / 60 / M.ARM_FADE + 1e-9);
      expect(cut).toBeGreaterThan(0);
    });
  });
}
