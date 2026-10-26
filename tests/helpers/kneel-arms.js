/**
 * The kneeling hybrid of the four girls (Claude-chan, GPT-chan, Gemini-chan, Grok-chan: one design, the same code in
 * each motion.js): kneeling, a gesture or a face that poses her arms shows her live upper body over poses.kneelLow (the
 * kneeling drawing's lower body), cut in for the kneeling drawing in a frame, and back once her arms are at rest.
 * `describeKneelArms` runs the same tests on each; kneel-rest.js has the frozen-fixture driver (tests/fixtures/kneel-rest-*.json).
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createPet } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';

import { faceOf, frameOf, restRecord } from './kneel-rest.js';

/** Width and height of a PNG, from its header. */
function pngSize(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/**
 * The tests of the hybrid for one girl: `name` her name in the titles, `dir` her web directory, `M` her motion.js,
 * `make(missing)` her real figure on a stand-in page (textures named in `missing` fail to load), `GESTURES` her figure's.
 */
/**
 * The arm drawings added after the frozen fixtures (拍手, 摊手, 抱头, 举手, 点赞, 嘘, 擦汗; 双手捂脸, 摸摸头): never shown kneeling
 * at rest.
 */
const NEW_POSES = ['clap', 'clapo', 'shrug', 'headhold', 'raise', 'thumbs', 'shush', 'wipe', 'hideface', 'pat'];

export function describeKneelArms(name, { dir, M, make, GESTURES }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  /** model.json without the arm drawings the fixtures predate. */
  const older = { ...model, poses: Object.fromEntries(Object.entries(model.poses).filter(([k]) => !NEW_POSES.includes(k))) };
  const newParts = NEW_POSES.flatMap(k => model.poses[k]?.required.map(p => p.id) ?? []);
  const fixture = JSON.parse(readFileSync(new URL(`../fixtures/kneel-rest-${dir.pathname.split('/').filter(Boolean).pop()}.json`, import.meta.url), 'utf8'));
  const R0 = M.buildRig(model);
  /**
   * The fixture as her arms draw now: they crossfaded then, and now each arm drawing cuts in whole at the middle of the
   * arms' move (motion.armShown), so an arm drawing's alpha part way is 1 from halfway on, else 0 (the arms move as before).
   */
  const ARM_IDS = new Set([...Object.values(R0.HANG).flat(), ...Object.values(R0.ARM).flatMap(A => A.parts.map(p => p.id))]);
  const cutArms = (frames, ids) => {
    const out = [];
    for (const [n, r] of frames) {
      const [h, raise, a] = r.split('|'), al = a.split(',').map((v, i) => (ARM_IDS.has(ids[i]) && +v > 0 && +v < 1 ? (+v >= M.ARM_CUT ? '1.000' : '0.000') : v));
      const rec = `${h}|${raise}|${al.join(',')}`, last = out[out.length - 1];
      if (last && last[1] === rec) last[0] += n; else out.push([n, rec]);
    }
    return out;
  };

  /** Her motion on the kit (plus), as the figure runs it: the last frame's output, the frame, and the figure's points. */
  function onKit({ without = [] } = {}) {
    const R = M.buildRig(model), motion = M.createMotion(model, R), A = M.anchorsOf(model, R);
    const caps = { pose: id => !without.includes(id) && (!!R.ARM[id] || !!R.W[id]), tex: () => true };
    const seen = { R, motion, last: null, o: null, bad: [] };
    const fig = {
      draw(g, fc, o) {
        const out = motion.step(fc, o, 1 / 60, caps);
        seen.last = out; seen.o = o;
        for (const [id, s] of Object.entries(out.st)) {
          if (id === 'alpha') { for (const [p, a] of Object.entries(s)) if (!(a >= 0 && a <= 1)) seen.bad.push(`alpha ${p}=${a}`); continue; }
          for (const k of ['a', 'tx', 'ty', 'sx', 'sy']) if (s && k in s && !Number.isFinite(s[k])) seen.bad.push(`${id}.${k}`);
        }
      },
      groupTilt: motion.groupTilt,
      gestures: GESTURES,
      get poses() { return { lie: !!R.W.lie, back: true }; },
      get kneelArms() { return !!R.W.kneelLow && caps.pose('kneelLow') && caps.pose('kneel'); },
      get anchors() { return M.liveAnchors(A, motion.sitRaise); },
      extent: M.extentOf(model, R), hits: M.hitsOf(model, R),
    };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    seen.fig = fig;
    seen.pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    seen.pet.resize();
    /** Runs `s` seconds, calling `each` after every frame. */
    seen.run = (s, each = () => {}) => { for (let i = 0; i < Math.round(s * 60); i++) { seen.pet.step(1 / 60); seen.pet.render(); each(); } };
    seen.alpha = id => seen.last.st.alpha[id] ?? 0;
    /** Where the neck's pivot (her head) is drawn this frame. */
    seen.neck = () => M.pointOf(R.deformers, 'neck', seen.last.st, ...R.deformers.neck.pivot);
    return seen;
  }
  /** Kneels and waits till the kneeling drawing has her. */
  const kneelDown = s => { s.run(.5); s.pet.doWord('kneel'); s.run(3); expect(s.alpha('kneel_body')).toBe(1); };

  describe(`${name}: arm gestures kneeling (the kneeling hybrid over poses.kneelLow)`, () => {
    it('has the kneeling drawing\'s lower body on its box, between her skirt and her torso, off the arm drawings and the standing figure', () => {
      const K = model.poses.kneel.required[0], L = model.poses.kneelLow;
      expect(L.required).toHaveLength(1);
      const p = L.required[0];
      expect(p).toMatchObject({ id: 'kneel_low', tex: 'kneel_low', parent: 'kneelLow' });
      expect(p.box).toEqual(K.box);
      expect(L.pivots.kneelLow).toEqual([128, 256]);
      const z = id => model.parts.find(q => q.id === id).z;
      expect(p.z).toBeGreaterThan(z('skirt'));
      expect(p.z).toBeLessThan(z('torso'));
      // her own tail, if she has one, is the drawing's (the standing one goes)
      expect(L.hides ?? []).toEqual(model.parts.some(q => q.id === 'tail') ? ['tail'] : []);
      const { w, h } = pngSize(new URL('tex/kneel_low.png', dir)), { w: kw, h: kh } = pngSize(new URL('tex/kneel_body.png', dir));
      expect([w, h]).toEqual([kw, kh]);
      expect(Math.abs(w - p.box[2] * 5)).toBeLessThanOrEqual(1);
      expect(Math.abs(h - p.box[3] * 5)).toBeLessThanOrEqual(1);
      expect(M.WHOLE_POSES).toContain('kneelLow');
      expect(R0.ARM.kneelLow).toBeUndefined();
      expect(R0.W.kneelLow.parts.map(q => q.id)).toEqual(['kneel_low']);
      // (on its turn, or on a warp of its own inside it for a tail drawn in: a figure's KNEEL_DRAWN)
      expect(R0.W.kneelLow.parts.every(q => !R0.STANDING[q.id] && (q.parent === 'kneelLow' || R0.deformers[q.parent]?.parent === 'kneelLow'))).toBe(true);
      expect(R0.deformers.kneelLow.parent).toBeUndefined();
    });

    it('kneels at rest as before: the drawing, never the hybrid, through faces, listening and the head\'s gestures (frozen frames)', () => {
      // (the fixture predates the live faces on the floor drawings, poses.<id>.face: without them every frame is as it was)
      // (nor the arm drawings added since, NEW_POSES: their parts would be more columns, all 0, see the next test)
      const bare = { ...older, poses: Object.fromEntries(Object.entries(older.poses).map(([k, P]) => [k, (({ face, ...rest }) => rest)(P)])) };
      const got = restRecord(M, bare);
      expect(got.lows.every(a => a === 0)).toBe(true);
      expect(got.ids).toEqual(fixture.ids);
      expect(got.frames).toEqual(cutArms(fixture.frames, fixture.ids));
    });

    it('kneels at rest as before with the live face on, but for the drawn patches, which the live face replaces', () => {
      const got = restRecord(M, model), old = fixture.ids;
      const unrun = frames => frames.flatMap(([n, r]) => Array(n).fill(r)).map(r => { const [h, raise, a] = r.split('|'); return { h, raise, a: a.split(',') }; });
      const A = unrun(got.frames), B = unrun(cutArms(fixture.frames, fixture.ids));
      expect(A).toHaveLength(B.length);
      const ix = id => got.ids.indexOf(id);
      expect(old.every(id => got.ids.includes(id))).toBe(true);
      const patches = ['kneel', 'lie'].flatMap(p => (model.poses[p].overlays || []).map(o => o.id));
      const live = { kneel: ['kneel_blank', 'kneel_live', 'kneel_fringe'], lie: ['lie_blank', 'lie_live', 'lie_fringe'] };
      expect(got.ids.filter(id => !old.includes(id)).sort()).toEqual([...live.kneel, ...live.lie, ...newParts].sort());
      expect(newParts.length).toBeGreaterThan(0);
      let patched = 0;
      A.forEach((f, i) => {
        expect(f.h).toBe(B[i].h);
        expect(f.raise).toBe(B[i].raise);
        for (const id of old) {
          if (patches.includes(id)) { expect(f.a[ix(id)], `${id} @${i}`).toBe('0.000'); if (B[i].a[old.indexOf(id)] !== '0.000') patched++; } else expect(f.a[ix(id)], `${id} @${i}`).toBe(B[i].a[old.indexOf(id)]);
        }
        // the live face is the drawing's: shown exactly when it is
        for (const id of live.kneel) expect(f.a[ix(id)], `${id} @${i}`).toBe(f.a[ix('kneel_body')]);
        for (const id of live.lie) expect(f.a[ix(id)], `${id} @${i}`).toBe(f.a[ix('lie_body')]);
        // the arm drawings added since never show at rest
        for (const id of newParts) expect(f.a[ix(id)], `${id} @${i}`).toBe('0.000');
      });
      expect(patched).toBeGreaterThan(0);  // (the patches did show before: a smile, a blink)
    });

    it('cuts from the kneeling drawing to the hybrid in a frame for a wave, her head and points staying put, and back once her arms are down', () => {
      const s = onKit();
      kneelDown(s);
      const neck0 = s.neck(), raise0 = s.motion.sitRaise, bubble0 = s.fig.anchors.bubble;
      s.pet.doWord('wave');
      let mixed = 0, cutAt = -1, i = 0, wave = 0, hybrid = null;
      s.run(1.2, () => {
        i++;
        const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
        if (k > 0 && k < 1) mixed++;
        // (one body dissolves over the other, which is opaque: never both half there)
        expect(k >= 1 || l >= 1 || (k === 0 && l === 0)).toBe(true);
        if (l >= 1 && cutAt < 0) {
          cutAt = i;
          expect(Math.hypot(s.neck()[0] - neck0[0], s.neck()[1] - neck0[1])).toBeLessThan(.5);
        }
        if (s.motion.kneelArmsK >= 1) {
          wave = Math.max(wave, s.motion.arms.wave || 0);
          hybrid = { ...s.last, alpha: { ...s.last.st.alpha } };
        }
      });
      expect(mixed).toBeLessThanOrEqual(Math.ceil(M.BODY_CUT * 60));
      expect(cutAt).toBeGreaterThan(0);
      expect(cutAt).toBeLessThan(20);
      expect(s.o.kneel).toBe(true);
      expect(wave).toBe(1);
      expect(hybrid.hideFront).toBe(false);
      expect(hybrid.plan.R).toBe('hangR');
      for (const id of ['skirt', ...R0.SHOES, ...(model.poses.kneelLow.hides || [])]) expect(hybrid.alpha[id], id).toBe(0);
      expect(hybrid.alpha.kneel_low).toBe(1);
      expect(hybrid.alpha.kneel_body).toBe(0);
      expect(s.motion.sitRaise).toBeCloseTo(raise0, 6);
      expect(s.fig.anchors.bubble).toEqual(bubble0);
      // the wave ends: the hybrid holds KNEEL_ARMS_HOLD after her arms are at rest (the drawing's fade), then the drawing
      let back = -1, j = 0;
      s.run(3, () => { j++; if (back < 0 && s.alpha('kneel_body') >= 1) back = j; });
      expect(back).toBeGreaterThan(0);
      expect(s.alpha('kneel_low')).toBe(0);
      expect(s.last.hideFront).toBe(true);
      expect(s.o.kneel).toBe(true);
      expect(s.bad).toEqual([]);
    });

    it('stays in the hybrid from one gesture to the next, and holds it only KNEEL_ARMS_HOLD past the arms\' fade', () => {
      const s = onKit();
      kneelDown(s);
      s.pet.doWord('wave');
      s.run(.5);
      expect(s.motion.kneelArmsK).toBe(1);
      // wave, then a heart straight after: no frame of the drawing between
      let drawn = 0;
      for (let n = 0; n < 600 && s.pet.pet.pulse; n++) s.run(1 / 60, () => { if (s.alpha('kneel_body') > 0) drawn++; });
      s.pet.doWord('heart');
      s.run(1, () => { if (s.alpha('kneel_body') > 0) drawn++; });
      expect(drawn).toBe(0);
      expect(s.motion.arms.heart).toBe(1);
      // the motion alone: once her arms are planned back to rest, the drawing comes back after the hold and the fade
      const motion = M.createMotion(model, R0), caps = { pose: id => !!R0.ARM[id] || !!R0.W[id], tex: () => true };
      const down = { mode: 'sit', kneel: true, sit: 1, low: 29 };
      let t = 0;
      const step = x => { t += 1 / 60; motion.step(faceOf('neutral'), frameOf({ ...down, ...x, t }), 1 / 60, caps); return motion.kneelArmsK; };
      for (let n = 0; n < 60; n++) step({});
      for (let n = 0; n < 60; n++) step({ gesture: { kind: 'heart', k: .2 + .6 * n / 59 } });
      expect(motion.kneelArmsK).toBe(1);
      let n = 0;
      while (step({}) > 0 && n < 120) n++;
      expect(n / 60).toBeGreaterThan(M.KNEEL_ARMS_HOLD);
      expect(n / 60).toBeLessThan(M.KNEEL_ARMS_HOLD + M.ARM_FADE + .05);
    });

    it('shows the hybrid for a face that poses her arms kneeling (thinking: the chin), not for listening', () => {
      const motion = M.createMotion(model, R0), caps = { pose: id => !!R0.ARM[id] || !!R0.W[id], tex: () => true };
      const down = { mode: 'sit', kneel: true, sit: 1, low: 29 };
      let t = 0, out = null;
      const run = (x, s) => { for (let n = 0; n < s * 60; n++) { t += 1 / 60; out = motion.step(faceOf(x.face || 'neutral'), frameOf({ ...down, ...x, t }), 1 / 60, caps); } };
      run({}, 1);
      expect(motion.kneelArmsK).toBe(0);
      run({ face: 'thinking' }, 1);
      expect(out.plan.L).toBe(M.FACE_ARMS.thinking);
      expect(out.plan.R).toBe('hangR');
      expect(motion.kneelArmsK).toBe(1);
      expect(out.hideFront).toBe(false);
      run({}, 1);
      expect(motion.kneelArmsK).toBe(0);
      run({ face: 'listening' }, 1.5);
      expect(motion.kneelArmsK).toBe(0);
      expect(out.st.alpha.kneel_body).toBe(1);
      // standing, listening still poses her arms
      const stand = M.createMotion(model, R0);
      let o2 = null;
      for (let n = 0; n < 60; n++) o2 = stand.step(faceOf('listening'), frameOf({ face: 'listening', t: n / 60 }), 1 / 60, caps);
      expect(o2.plan.L).not.toMatch(/^hang/);
    });

    it('does her faces\' arm poses as words of their own kneeling (托腮, 加油, 记笔记, 对手指): the hybrid, the kneel kept, back after', () => {
      // (记笔记 too: the kneel leaves out listening's notebook, KNEEL_FACE_SKIP, which is keyed on the face, not the drawing)
      expect(M.KNEEL_FACE_SKIP).toEqual(['listening']);
      for (const [w, pose] of [['muse', 'chin'], ['fist', 'fist'], ['jot', 'write'], ['twiddle', 'shy']]) {
        const s = onKit();
        kneelDown(s);
        s.pet.doWord(w);
        let mixed = 0, posed = 0;
        s.run(1, () => {
          const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
          if (k > 0 && k < 1) mixed++;
          expect(k >= 1 || l >= 1 || (k === 0 && l === 0), w).toBe(true);
          posed = Math.max(posed, s.motion.arms[pose] || 0);
        });
        expect(mixed, w).toBeLessThanOrEqual(Math.ceil(M.BODY_CUT * 60));
        expect(s.motion.kneelArmsK, w).toBe(1);
        expect(posed, w).toBe(1);
        expect(s.o.kneel, w).toBe(true);
        s.run(4);
        expect(s.alpha('kneel_body'), w).toBe(1);
        expect(s.alpha('kneel_low'), w).toBe(0);
        expect(s.o.kneel, w).toBe(true);
        expect(s.bad, w).toEqual([]);
      }
    });

    it('does the new arm words kneeling (拍手, 摊手, 抱头, 举手, 点赞, 嘘, 擦汗): the hybrid, the kneel kept, back after', () => {
      for (const [w, poses] of [['clap', ['clap', 'clapo']], ['shrug', ['shrug']], ['headhold', ['headhold']], ['raise', ['raise']],
        ['thumbs', ['thumbs']], ['shush', ['shush']], ['wipe', ['wipe']]]) {
        const s = onKit();
        kneelDown(s);
        s.pet.doWord(w);
        let mixed = 0, both = 0;
        const posed = {};
        s.run(2.5, () => {
          const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
          if (k > 0 && k < 1) mixed++;
          expect(k >= 1 || l >= 1 || (k === 0 && l === 0), w).toBe(true);
          for (const p of poses) posed[p] = Math.max(posed[p] || 0, s.motion.arms[p] || 0);
          if (poses.length > 1 && poses.every(p => (s.motion.arms[p] || 0) > 0)) both++;
        });
        expect(mixed, w).toBeLessThanOrEqual(Math.ceil(M.BODY_CUT * 60));
        for (const p of poses) expect(posed[p], `${w} ${p}`).toBe(1);
        expect(both, w).toBe(0);
        expect(s.o.kneel, w).toBe(true);
        s.run(4);
        expect(s.alpha('kneel_body'), w).toBe(1);
        expect(s.alpha('kneel_low'), w).toBe(0);
        expect(s.o.kneel, w).toBe(true);
        expect(s.bad, w).toEqual([]);
      }
    });

    it('does 哎呀 kneeling (her flinch arms, both hands to her mouth, as a word of its own): the hybrid, the kneel kept, back after', () => {
      const s = onKit();
      kneelDown(s);
      s.pet.doWord('oops');
      let mixed = 0, posed = 0;
      s.run(2.5, () => {
        const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
        if (k > 0 && k < 1) mixed++;
        expect(k >= 1 || l >= 1 || (k === 0 && l === 0)).toBe(true);
        posed = Math.max(posed, s.motion.arms.oops || 0);
      });
      expect(mixed).toBeLessThanOrEqual(Math.ceil(M.BODY_CUT * 60));
      expect(posed).toBe(1);
      expect(s.o.kneel).toBe(true);
      s.run(4);
      expect(s.alpha('kneel_body')).toBe(1);
      expect(s.alpha('kneel_low')).toBe(0);
      expect(s.o.kneel).toBe(true);
      expect(s.bad).toEqual([]);
    });

    it('does 抹眼泪, 双手捂脸 and 摸摸头 kneeling (the 哎呀 fists at her eyes, both hands over her face, a hand held out): the hybrid, the kneel kept, back after', () => {
      for (const [w, pose] of [['weep', 'oops'], ['hideface', 'hideface'], ['pat', 'pat']]) {
        const s = onKit();
        kneelDown(s);
        s.pet.doWord(w);
        let mixed = 0, posed = 0, risen = 0;
        s.run(2.5, () => {
          const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
          if (k > 0 && k < 1) mixed++;
          expect(k >= 1 || l >= 1 || (k === 0 && l === 0), w).toBe(true);
          posed = Math.max(posed, s.motion.arms[pose] || 0);
          // (the weep's fists rise to her eyes in the hybrid too)
          if (w === 'weep' && s.motion.kneelArmsK >= 1) risen = Math.max(risen, -(s.last.st[s.R.ARM.oops.rot]?.ty ?? 0));
        });
        expect(mixed, w).toBeLessThanOrEqual(Math.ceil(M.BODY_CUT * 60));
        expect(posed, w).toBe(1);
        if (w === 'weep') expect(risen).toBeGreaterThan(.9 * M.WEEP.ty);
        expect(s.o.kneel, w).toBe(true);
        s.run(4);
        expect(s.alpha('kneel_body'), w).toBe(1);
        expect(s.alpha('kneel_low'), w).toBe(0);
        expect(s.o.kneel, w).toBe(true);
        expect(s.bad, w).toEqual([]);
      }
    });

    it('gets up from the middle of a gesture by the hybrid and the kneeling drawing, never the seated body', () => {
      const s = onKit();
      kneelDown(s);
      s.pet.doWord('wave');
      s.run(.4);
      expect(s.motion.kneelArmsK).toBe(1);
      s.pet.doWord('stand');
      let seated = 0, kneeled = 0, booked = 0;
      s.run(4, () => {
        if (s.alpha('sit_skirt') > 0) seated++;
        if (s.alpha('kneel_body') > 0 || s.alpha('kneel_low') > 0) kneeled++;
        // (Claude-chan: the book stays aside while she still kneels in the hybrid)
        if (s.alpha('kneel_low') > 0 && [s.last.plan.L, s.last.plan.R].some(k => k === 'book' || k === 'bookside')) booked++;
      });
      expect(seated).toBe(0);
      expect(booked).toBe(0);
      expect(kneeled).toBeGreaterThan(0);
      expect(s.alpha('kneel_low')).toBe(0);
      expect(s.alpha('kneel_body')).toBe(0);
      expect(s.bad).toEqual([]);
    });

    it('opens the hybrid for a gesture asked while she gets up on her arms as planned (Claude-chan: no book fading out)', () => {
      for (const after of [.15, .4, .7]) {
        const s = onKit();
        kneelDown(s);
        s.pet.doWord('stand');
        s.run(after);
        expect(s.o.kneel, `${after}`).toBe(false);
        expect(s.alpha('kneel_body'), `${after}`).toBe(1);
        s.pet.doWord('wave');
        let hybrid = 0, seated = 0;
        s.run(1.5, () => {
          if (s.alpha('sit_skirt') > 0) seated++;
          if (s.alpha('kneel_low') < 1) return;
          hybrid++;
          // (in the hybrid her arms are seen: the book is aside, not in her hands fading out)
          expect(s.motion.arms.book ?? 0, `${after}`).toBe(0);
          expect(s.motion.arms.bookside ?? 0, `${after}`).toBe(0);
          expect(s.last.plan.R, `${after}`).not.toMatch(/^book/);
        });
        expect(hybrid, `${after}`).toBeGreaterThan(0);
        expect(seated, `${after}`).toBe(0);
      }
    });

    it('kneels right after a seated gesture or a seated face\'s pose in one cut, the seated body to the drawing (no hybrid between)', () => {
      const asks = {
        wave: s => { s.pet.doWord('wave'); for (let n = 0; n < 600 && s.pet.pet.pulse; n++) s.run(1 / 60); },
        listening: s => { s.pet.setExpr('listening', 10); s.run(1.5); },
        thinking: s => { s.pet.setExpr('thinking', 1.2); s.run(1.25); },
      };
      for (const [what, ask] of Object.entries(asks)) {
        const s = onKit();
        s.run(.5);
        s.pet.doWord('sit');
        s.run(2.5);
        expect(s.alpha('sit_skirt'), what).toBe(1);
        ask(s);
        s.pet.doWord('kneel');
        let low = 0;
        s.run(2, () => { if (s.alpha('kneel_low') > 0) low++; });
        expect(low, what).toBe(0);
        expect(s.alpha('kneel_body'), what).toBe(1);
      }
    });

    it('kneels and waves at once from standing (跪坐+招手): straight into the hybrid, her head not floating', () => {
      const s = onKit();
      s.run(.5);
      expect(s.pet.doGroup(['kneel', 'wave'])).toEqual([true, true]);
      let seated = 0, drawing = 0, n = 0;
      const drop = model.poses.kneel.headDrop;
      s.run(1.2, () => {
        if (s.alpha('sit_skirt') > 0) seated++;
        if (s.alpha('kneel_body') > 0) drawing++;
        if (s.alpha('kneel_low') >= 1) {
          n++;
          // (her upper body sits on the drawing's lower body from the first frame, sunk by all of headDrop: no easing
          // down after the cut while the kit's sit still comes down)
          expect(s.last.st.waist.ty).toBeCloseTo(drop, 6);
        }
      });
      expect(seated).toBe(0);
      expect(drawing).toBe(0);
      expect(n).toBeGreaterThan(30);
    });

    it('turns and squashes the lower body with her body, so the waist never opens (a shiver kneeling)', () => {
      const s = onKit();
      kneelDown(s);
      s.pet.doWord('shiver');
      let checked = 0;
      s.run(1, () => {
        if (s.alpha('kneel_low') < 1) return;
        const { body, kneelLow } = s.last.st;
        for (const k of ['a', 'sx', 'sy']) expect(kneelLow[k]).toBe(body[k]);
        checked++;
      });
      expect(checked).toBeGreaterThan(10);
    });

    it('says the kit may keep a kneel through arm gestures only with the files there; without them a wave ends it', async () => {
      const fig = await make();
      expect(fig.kneelArms).toBe(true);
      const without = await make(['kneel_low']);
      expect(without.kneelArms).toBe(false);
      const s = onKit({ without: ['kneelLow'] });
      kneelDown(s);
      s.pet.doWord('wave');
      s.run(.3);
      expect(s.o.kneel).toBe(false);
      expect(s.alpha('kneel_low')).toBe(0);
    });
  });
}
