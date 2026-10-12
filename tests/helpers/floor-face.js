/**
 * Live faces on the floor drawings of the three girls (Claude-chan, GPT-chan, Gemini-chan: one design, the same code in
 * each face.js / motion.js / figure.js): kneeling or lying, the standing face (every face, pair, blink, gaze and talking
 * mouth) is painted a second time into the drawing's own live texture `<pid>Fx`, each feature through its own matrix
 * (model poses.<pid>.face.place), between a blank face cut from a generated edit (`<pid>_blank`) and the drawing's hair
 * over the face (`<pid>_fringe`). `describeFloorFace` runs the same tests on each (face-paint.js has the frozen-fixture
 * driver of the standing face: tests/fixtures/face-paint-<figure>.json).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPet, FACES, PLUS_FACES } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';
import { IMGS, paintRecord, recCanvas } from './face-paint.js';
import { meshGap } from './mesh.js';

/**
 * The tests of the floor faces for one girl: `name` her name in the titles, `dir` her web directory, `M` her motion.js,
 * `F` her face.js, `GESTURES` her figure's.
 */
export function describeFloorFace(name, { dir, M, F, GESTURES }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  const id = dir.pathname.split('/').filter(Boolean).pop();
  const fixture = JSON.parse(readFileSync(new URL(`../fixtures/face-paint-${id}.json`, import.meta.url), 'utf8'));
  const R0 = M.buildRig(model);
  const PIDS = ['kneel', 'lie'];
  const fcOf = (n, t = 1) => (FACES[n] || PLUS_FACES[n]).f(t);
  const faceMod = { createFacePainter: F.createFacePainter };

  /** Her motion on the kit (plus), as the figure runs it, recording every frame's output. */
  function onKit({ files = true } = {}) {
    const R = M.buildRig(model), motion = M.createMotion(model, R);
    const caps = { pose: k => !!R.ARM[k] || !!R.W[k], tex: n => files || !/^(kneel|lie)_(blank|fringe)$/.test(n) };
    const seen = { R, motion, last: null, o: null, fc: null, frames: [] };
    const fig = {
      draw(g, fc, o) {
        const out = motion.step(fc, o, 1 / 60, caps);
        seen.last = out; seen.o = o; seen.fc = fc;
        seen.frames.push({ floorFace: out.floorFace, hideFront: out.hideFront, kneel: out.st.alpha.kneel_body ?? 0, low: out.st.alpha.kneel_low ?? 0, live: out.st.alpha.kneel_live ?? 0 });
      },
      groupTilt: motion.groupTilt,
      gestures: GESTURES,
      get poses() { return { lie: !!R.W.lie, back: true }; },
      get kneelArms() { return !!R.W.kneelLow; },
      extent: M.extentOf(model, R), hits: M.hitsOf(model, R), anchors: M.anchorsOf(model, R),
    };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    seen.pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    seen.pet.resize();
    seen.run = (s, each = () => {}) => { for (let i = 0; i < Math.round(s * 60); i++) { seen.pet.step(1 / 60); seen.pet.render(); each(); } };
    seen.alpha = k => seen.last.st.alpha[k] ?? 0;
    /** What the painter would draw this frame (the figure paints the floor face from the same frame). */
    seen.plan = () => F.planFace(seen.fc, seen.o.face, { ...seen.o, look: seen.last.look }, seen.o.t, n => !!model.feat.sprites?.[n]);
    return seen;
  }

  describe(`${name}: live faces on the kneeling and lying drawings`, () => {
    it('paints the standing face call for call as before the floor faces (frozen at 298977d)', () => {
      expect(paintRecord(faceMod, model, R0.FACE)).toEqual(fixture.faces);
    });

    it('paints each feature through its own matrix (an eye with its cheek and tear, the mouth), the nose left to the drawing', () => {
      const log0 = [], log1 = [];
      const p0 = F.createFacePainter(model, { rect: R0.FACE, makeCanvas: (w, h) => recCanvas([], '', w, h) });
      const a = recCanvas(log0, '', 300, 200), b = recCanvas(log1, '', 300, 200);
      const place = { eyeL: [1, 0, 0, 1, 1000, 0], eyeR: [1, 0, 0, 1, 2000, 0], mouth: [.5, 0, 0, .5, 3000, 0] };
      const fc = { ...fcOf('cry'), blush: .7 };
      p0.paint(a.ctx, IMGS, fc, 'cry', { t: 1, look: [0, 0] }, 1);
      p0.paint(b.ctx, IMGS, fc, 'cry', { t: 1, look: [0, 0] }, 1, place);
      // the whole live texture is cleared, not just the standing face rect's share of it
      expect(log1[0]).toEqual(['setTransform', 1, 0, 0, 1, 0, 0]);
      expect(log1[1]).toEqual(['clearRect', 0, 0, 300, 200]);
      // each feature's drawing is the standing one under its matrix: the same calls, wrapped in save/transform/restore
      const transforms = log1.filter(c => c[0] === 'transform').map(c => c.slice(1));
      expect(transforms.filter(m => m[4] === 1000).length).toBeGreaterThanOrEqual(2);  // the eye, and its cheek and tear
      expect(transforms.filter(m => m[4] === 2000).length).toBeGreaterThanOrEqual(2);
      expect(transforms.filter(m => m[4] === 3000)).toHaveLength(1);
      const strip = log => log.filter(c => !['save', 'restore', 'transform', 'clearRect'].includes(c[0]) && c[0] !== 'nose');
      const drawn = log => strip(log).filter(c => c[0] === 'drawImage').map(c => c[1]);
      expect(drawn(log1)).not.toContain('nose');
      expect(drawn(log0).filter(n => n !== 'nose').sort()).toEqual(drawn(log1).sort());
      // the blush: one per eye, each under its eye's matrix
      expect(log1.filter(c => c[0] === 'createRadialGradient').length).toBe(log0.filter(c => c[0] === 'createRadialGradient').length);
    });

    it('has each floor drawing\'s blank and fringe files, sized to their boxes, and its live face on the drawing\'s head', () => {
      for (const pid of PIDS) {
        const f = model.poses[pid].face;
        expect(f, pid).toBeTruthy();
        expect(f.parts.map(p => p.id)).toEqual([`${pid}_blank`, `${pid}_fringe`]);
        for (const p of f.parts) {
          const b = readFileSync(new URL(`tex/${p.tex}.png`, dir));
          expect(Math.abs(b.readUInt32BE(16) - p.box[2] * 5), p.tex).toBeLessThanOrEqual(2);
          expect(Math.abs(b.readUInt32BE(20) - p.box[3] * 5), p.tex).toBeLessThanOrEqual(2);
          expect(p.use).toBe('face');
        }
        // (not in overlays: those are exactly the drawn patches, which stay as the fallback)
        expect(model.poses[pid].overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
        const W = R0.W[pid].face, head = pid === 'kneel' ? (R0.deformers.kneelHead ? 'kneelHead' : 'kneel') : 'lieLegs';
        expect(W.live).toMatchObject({ id: `${pid}_live`, tex: `${pid}Fx`, parent: head, box: f.box });
        expect([...W.parts, W.live].every(p => p.parent === head)).toBe(true);
        const z = k => R0.parts.find(p => p.id === k).z, body = model.poses[pid].required.at(-1).z;
        expect(body < z(`${pid}_blank`) && z(`${pid}_blank`) < z(`${pid}_live`) && z(`${pid}_live`) < z(`${pid}_fringe`)).toBe(true);
        // under the overlays' patches' place in z or not, they are off whenever the live face is on (next test)
        for (const p of [...W.parts, W.live]) expect(R0.STANDING[p.id]).toBeFalsy();
        // its matrices keep the features upright and near their size (a turned, foreshortened head, not a mirror)
        for (const k of ['eyeL', 'eyeR', 'mouth']) {
          const [a, b, c, d] = W.place[k], det = a * d - b * c;
          expect(det, `${pid} ${k}`).toBeGreaterThan(.45);
          expect(det, `${pid} ${k}`).toBeLessThan(1.7);
          expect(Math.abs(Math.atan2(b, a)), `${pid} ${k}`).toBeLessThan(.4);
        }
        // the live texture: one texel per master px over its box
        expect(Math.round(f.box[2] / R0.S)).toBeGreaterThan(R0.FACE.w * .6);
      }
    });

    it('shows the live face kneeling and lying while its files are there, else the drawn patches as before', () => {
      for (const pid of PIDS) {
        for (const files of [true, false]) {
          const motion = M.createMotion(model, R0);
          const caps = { pose: () => true, tex: n => files || !/_(blank|fringe)$/.test(n) };
          let out, t = 0;
          const o = pid === 'kneel' ? { mode: 'sit', sit: 1, low: 29, kneel: true } : { mode: 'lie', lie: 1 };
          for (let i = 0; i < 240; i++) { t += 1 / 60; out = motion.step(fcOf('happy', t), { t, face: 'happy', talk: 1, look: [0, 0], ...o }, 1 / 60, caps); }
          const a = k => out.st.alpha[k] ?? 0;
          expect(a(`${pid}_body`), `${pid} body`).toBe(1);
          if (files) {
            expect(out.floorFace).toBe(pid);
            for (const k of [`${pid}_blank`, `${pid}_live`, `${pid}_fringe`]) expect(a(k), k).toBe(1);
            for (const u of ['shut', 'smile', 'talk']) expect(a(`${pid}_${u}`), u).toBe(0);
          } else {
            expect(out.floorFace).toBeFalsy();
            for (const k of [`${pid}_blank`, `${pid}_live`, `${pid}_fringe`]) expect(a(k), k).toBe(0);
            expect(a(`${pid}_smile`) + a(`${pid}_talk`), `${pid} patches`).toBeGreaterThan(0);
          }
        }
      }
    });

    it('kneeling, an asked face shows on the drawing (sad: no arm pose, so she stays in the drawing), and through getting up', () => {
      const s = onKit();
      s.run(.5);
      expect(s.last.floorFace).toBeFalsy();
      s.pet.doWord('kneel');
      s.run(3);
      expect(s.alpha('kneel_body')).toBe(1);
      expect(s.last.floorFace).toBe('kneel');
      s.pet.doWord('sad');
      s.run(.6);
      expect(s.alpha('kneel_body')).toBe(1);
      expect(s.last.floorFace).toBe('kneel');
      expect(s.alpha('kneel_shut') + s.alpha('kneel_smile') + s.alpha('kneel_talk')).toBe(0);
      const plan = s.plan();
      expect(plan.eyes.map(e => e.name)).toEqual(['sad_eyeL', 'sad_eyeR']);
      // getting up: the face stays live on the drawing as long as it shows, and goes with it
      s.frames.length = 0;
      s.pet.doWord('stand');
      s.run(3);
      expect(s.frames.some(f => f.kneel >= 1)).toBe(true);
      for (const f of s.frames) expect(f.floorFace === 'kneel', JSON.stringify(f)).toBe(f.kneel > 0);
      expect(s.last.floorFace).toBeFalsy();
    });

    it('lying, a face made of two (smug+happy) shows on the drawing\'s head', () => {
      const s = onKit();
      s.run(.5);
      s.pet.doGroup(['lie', 'smug', 'happy']);
      s.run(3);
      expect(s.alpha('lie_body')).toBe(1);
      expect(s.last.floorFace).toBe('lie');
      const plan = s.plan();
      expect(plan.eyes.map(e => e.name)).toEqual(['smug_eyeL', 'smug_eyeR']);
      expect(M.partsOf(s.fc, s.o.face).mouth).toBe('happy');
      expect(s.alpha('lie_live')).toBe(1);
      expect(s.alpha('lie_smile') + s.alpha('lie_talk') + s.alpha('lie_shut')).toBe(0);
    });

    it('lying, the face\'s meshes stay on the drawing as her head nods and turns (the fringe never slides off its hair)', () => {
      const motion = M.createMotion(model, R0), caps = { pose: () => true, tex: () => true };
      const P = Object.fromEntries(R0.parts.map(p => [p.id, p])), body = P.lie_body;
      let t = 0, worst = 0, shut = 0;
      for (let i = 0; i < 150; i++) {
        t += 1 / 60;
        const out = motion.step(fcOf('happy', t), { t, face: 'happy', talk: 1, look: [6, 0], mode: 'lie', lie: 1, head: { kind: 'nod', k: (t / 1.2) % 1 } }, 1 / 60, caps);
        if (i % 5) continue;
        for (const k of ['lie_blank', 'lie_live', 'lie_fringe']) worst = Math.max(worst, meshGap(R0.deformers, out.st, P[k], body));
        shut = Math.max(shut, meshGap(R0.deformers, out.st, P.lie_shut, body));
      }
      // (the drawn eyes-shut patch, on its [8, 6] mesh, as the yardstick: about .1 here; the face on [4, 4] slid ~1)
      expect(worst).toBeLessThan(Math.max(.3, 2 * shut));
    });

    it('hands the face over with the body at the hybrid\'s cut: never a frame with no face, never two faces at rest', () => {
      const s = onKit();
      s.run(.5);
      s.pet.doWord('kneel');
      s.run(3);
      s.frames.length = 0;
      s.pet.doWord('wave');
      s.run(5);
      expect(s.frames.some(f => f.low >= 1 && f.kneel === 0)).toBe(true);  // the hybrid showed
      expect(s.frames.at(-1).kneel).toBe(1);  // and she kneels in the drawing again
      let both = 0;
      for (const f of s.frames) {
        // the floor face goes with the drawing, at the drawing's alpha (it cuts with it)
        expect(f.floorFace === 'kneel', JSON.stringify(f)).toBe(f.kneel > 0);
        expect(f.live).toBe(f.kneel);
        // the standing face shows whenever the drawing does not cover her: one of the two is always painted
        expect(f.hideFront || f.floorFace === 'kneel' || f.low > 0, JSON.stringify(f)).toBe(true);
        if (!f.hideFront && f.floorFace) both++;
      }
      // both only in the cut's frame or two (the same face on both heads, the drawing dissolving over the hybrid)
      expect(both).toBeLessThanOrEqual(2 * Math.ceil(M.BODY_CUT * 60));
    });

    it('standing or sitting, no floor face is painted', () => {
      const s = onKit();
      s.run(.5);
      s.pet.doWord('sit');
      s.run(2);
      s.pet.doWord('happy');
      s.run(1);
      expect(s.frames.every(f => !f.floorFace)).toBe(true);
    });

    it('without its files the floor drawings keep the drawn patches (the live face never shows)', () => {
      const s = onKit({ files: false });
      s.run(.5);
      s.pet.doWord('kneel');
      s.run(3);
      s.pet.doWord('happy');
      s.run(1);
      expect(s.alpha('kneel_body')).toBe(1);
      expect(s.frames.every(f => !f.floorFace && f.live === 0)).toBe(true);
      expect(s.alpha('kneel_smile')).toBeGreaterThan(0);
    });
  });
}
