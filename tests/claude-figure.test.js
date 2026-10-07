import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPet, FACES, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_FACES, PLUS_MOTIONS, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import {
  anchorsOf, approach, ARM_BOTH, ARM_FALLBACK, ARM_ONE, armPlan, buildRig, createMotion, extentOf, FACE_ARMS, feetFromLegs, fxPointsOf,
  GROUP, hitsOf, MOOD, pitchFromLean, pointOf, POSE_ALT, POSE_KIND, poseMix, SIT_LOW, sitAnchors, sitMix, sitRaise,
} from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import { createFacePainter, MOUTHS, planFace, TALK_SHAPES } from '../packages/cortico-world-desktop-pet/web/claude-chan/face.js';
import { fxMarkup } from '../packages/cortico-world-desktop-pet/web/claude-chan/fx.js';
import { createClaudeFigure, GESTURES } from '../packages/cortico-world-desktop-pet/web/claude-chan/figure.js';

const DIR = new URL('../packages/cortico-world-desktop-pet/web/claude-chan/', import.meta.url);
const SRC = ['figure.js', 'face.js', 'motion.js', 'fx.js'];
const MODEL_URL = new URL('model.json', DIR);
const real = existsSync(MODEL_URL) ? JSON.parse(readFileSync(MODEL_URL, 'utf8')) : null;
const realFeat = !!real?.feat?.eyes;
const realPoses = real?.poses ? Object.keys(real.poses).filter(k => real.poses[k]?.required?.length) : [];
const BOUNDS = () => ({ W: 1200, H: 400, floorY: 380, S: .42 });
const ALL_FACES = [...new Set([...Object.keys(FACES), ...Object.keys(PLUS_FACES)])];
const ALL_WORDS = [...KIT_MOTIONS, ...PLUS_MOTIONS];

/** Width, height and colour type of a PNG, from its header. */
function png(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}
const inside = ([x, y], [x0, y0, x1, y1], m = 0) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;

/* ---------- a made-up model with every drawing, so the code is tested before (and beyond) the art ---------- */
const FAMS = ['happy', 'sleep', 'surprised', 'love', 'dizzy', 'drag', 'cry', 'smug', 'angry', 'sad', 'wink', 'halflid', 'shy', 'determined'];
const MOUTH_SPRITES = ['neutral_mouth', ...TALK_SHAPES.map(s => `mouth_${s}`), ...['frown', 'pout', 'cat', 'grin', 'tongue', 'smile'].map(s => `mouth_${s}`)];
const ARM_POSES = ['book', 'bookside', 'wave', 'chin', 'scratch', 'idea', 'salute', 'vsign', 'point', 'cover', 'fist', 'read', 'write', 'search',
  'cheer', 'heart', 'cup', 'pray', 'hips', 'hug', 'cross', 'stretch', 'curtsy', 'oops', 'shy', 'offer'];
function synthModel() {
  const eye = (x0, x1) => {
    const cx = (x0 + x1) / 2;
    return {
      lash: [x0 - 10, 470, x1 + 10, 530], ball: [x0, 480, x1, 560], iris: [x0 + 8, 482, x1 - 8, 558], rim: [x0, 480, x1, 560],
      lidFit: [.01, -.02 * cx, .01 * cx * cx + 485], rimFit: [-.01, .02 * cx, -.01 * cx * cx + 555],
    };
  };
  const sprites = { ...Object.fromEntries(MOUTH_SPRITES.map(n => [n, [500, 590, 524, 606]])) };
  for (const f of FAMS) Object.assign(sprites, { [`${f}_eyeL`]: [420, 470, 500, 560], [`${f}_eyeR`]: [524, 470, 604, 560], [`${f}_mouth`]: [500, 590, 524, 606] });
  const poses = {};
  for (const id of ARM_POSES) {
    poses[id] = { required: [{ id: `arm_${id}`, tex: `arm_${id}`, z: 6.5, parent: `arm_${id}`, grid: [4, 4], box: [88, 118, 72, 60] }], pivots: { [`arm${id[0].toUpperCase()}${id.slice(1)}`]: [100, 150] }, wrist: [92, 124] };
  }
  poses.point.wrist = [70, 140];
  const floor = (id, extra = {}) => ({
    required: [{ id: `${id}_body`, tex: `${id}_body`, z: 21, parent: id, grid: [8, 8], box: [40, 40, 176, 216] }],
    overlays: ['shut', 'smile', 'talk'].map((u, i) => ({ id: `${id}_${u}`, tex: `${id}_${u}`, z: 21.1 + i / 100, parent: id, grid: [2, 2], box: [100, 80, 40, 20], use: u })),
    pivots: { [id]: [128, 256] }, ...extra,
  });
  Object.assign(poses, {
    lie: {
      ...floor('lie'), pivots: { lie: [128, 256], lieChin: [180, 200] },
      rects: { back: [10, 150, 246, 256], head: [150, 120, 246, 230], legs: [10, 150, 120, 256] },
      legAxis: { knee: [60, 220], shoe: [30, 170], gap: 6, far: -10 },
      anchors: { gaze: [200, 180], tear: [195, 190], z: [220, 130], hearts: [150, 230, 130], bubble: [190, 110], glints: [[160, 140], [230, 150]], hit: [128, 200, 116, 50], halfW: 118 },
      fx: { from: [128, 60], to: [200, 170], s: .8 },
    },
    kneel: { ...floor('kneel'), headDrop: 20 },
    sit: floor('sit'),
    back: { required: [{ id: 'back_body', tex: 'back_body', z: 21.2, parent: 'backTail', grid: [8, 8], box: [40, 20, 176, 236] }], rects: { hair: [40, 20, 216, 230] } },
    roll: { required: [{ id: 'roll_ball', tex: 'roll_ball', z: 30, parent: 'rollBall', grid: [2, 2], box: [28, 46, 200, 210] }], pivots: { rollBall: [128, 160] }, support: Array(72).fill(96) },
  });
  return {
    units: { S: .2, X0: 512, FEET: 1333, DS: 1, featDS: 1 },
    pivots: { body: [128, 256], waist: [124.6, 159.4], neck: [124.6, 123], head: [124.6, 83.4], armL: [99.5, 150.6], armR: [152.5, 149.3], footL: [117, 253], footR: [131.8, 253], ornament: [163.6, 53] },
    rects: { head: [58, 20, 198, 130], hair: [39, 23.6, 217, 227.6] },
    parts: [
      { id: 'hair_back', tex: 'hair_back', z: 1, parent: 'hairSway', grid: [10, 14], box: [39, 23.6, 178, 204] },
      { id: 'shoe_l', tex: 'shoe_l', z: 2, parent: 'footL', grid: [3, 4], box: [109.4, 227, 15.4, 29.4] },
      { id: 'shoe_r', tex: 'shoe_r', z: 2.05, parent: 'footR', grid: [3, 4], box: [124.2, 227.2, 15.6, 29.2] },
      { id: 'skirt', tex: 'skirt', z: 3, parent: 'skirt', grid: [8, 6], box: [72.8, 156.4, 104.2, 81] },
      { id: 'torso', tex: 'torso', z: 4, parent: 'waist', grid: [6, 3], box: [109, 147, 43.8, 17] },
      { id: 'arm_l', tex: 'arm_l', z: 5, parent: 'armL', grid: [4, 6], box: [73.6, 140.6, 41, 50.4] },
      { id: 'arm_r', tex: 'arm_r', z: 5.05, parent: 'armR', grid: [4, 6], box: [141.6, 140.4, 33.2, 50.4] },
      { id: 'capelet', tex: 'capelet', z: 6, parent: 'waist', grid: [8, 4], box: [88.4, 109.2, 72.6, 44.6] },
      { id: 'face', tex: 'face', z: 8, parent: 'headMid', grid: [6, 6], box: [91, 45, 62.6, 74.8] },
      { id: 'brows', tex: 'brows', z: 8.6, parent: 'headFeat', grid: [12, 2], box: [97.2, 74.2, 52.8, 4.4] },
      { id: 'bangs', tex: 'bangs', z: 13, parent: 'bangsSway', grid: [8, 10], box: [91, 35, 64.4, 64.4] },
      { id: 'ornament', tex: 'ornament', z: 14, parent: 'ornament', grid: [4, 8], box: [150.4, 40.6, 48.4, 85.4] },
    ],
    feat: {
      eyes: { eyeL: eye(430, 490), eyeR: eye(534, 594) },
      sprites,
      face: { rect: [380, 400, 264, 260], cheeks: [[440, 590, 30, 16], [584, 590, 30, 16]], mouth: [512, 598], tearEnd: { eyeL: 640, eyeR: 640 }, browSplit: 512, ink: '#4a2420', mouthDy: {} },
    },
    schemes: [{ id: 'original', brand: 'Claude 娘', label: '原版', accent: '#D97757', ready: true }],
    view: [-12, -8, 268, 272],
    poses,
  };
}
const SYNTH = synthModel();

/** Every number in this frame's deformer states and alphas is finite; alphas lie in 0..1. Returns what is wrong. */
function badValues(R, out) {
  const bad = [];
  for (const [id, s] of Object.entries(out.st)) {
    if (id === 'alpha') {
      for (const [p, a] of Object.entries(s)) if (!(a >= 0 && a <= 1)) bad.push(`alpha ${p}=${a}`);
      continue;
    }
    if (typeof s !== 'object' || !s) { if (!Number.isFinite(s)) bad.push(`${id}=${s}`); continue; }
    for (const k of ['a', 'tx', 'ty', 'sx', 'sy', 's']) if (k in s && !Number.isFinite(s[k])) bad.push(`${id}.${k}=${s[k]}`);
    const d = R.deformers[id];
    if (!d) { bad.push(`state for unknown deformer ${id}`); continue; }
    if (s.fn) {
      const [x0, y0, x1, y1] = d.rect;
      for (const [u, v] of [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]]) {
        const r = s.fn(u, v, x0 + u * (x1 - x0), y0 + v * (y1 - y0));
        if (!Number.isFinite(r[0]) || !Number.isFinite(r[1])) bad.push(`${id}.fn(${u},${v})`);
      }
    }
  }
  for (const p of R.parts) {
    const q = pointOf(R.deformers, p.parent, out.st, p.box[0] + p.box[2] / 2, p.box[1] + p.box[3] / 2);
    if (!q.every(Number.isFinite)) bad.push(`point of ${p.id}`);
  }
  if (!out.look.every(Number.isFinite) || !out.turn.every(Number.isFinite)) bad.push('look/turn');
  return bad;
}

/** A figure with no page under it: her motion runs on every frame, and what it gives back is checked. */
function stubFigure(model, can = true, without = []) {
  const R = buildRig(model), motion = createMotion(model, R), P = fxPointsOf(model, R);
  const caps = { pose: id => can && !without.includes(id) && (!!R.ARM[id] || !!R.W[id]), tex: () => true };
  const sprites = new Set(Object.keys(model.feat?.sprites || {}));
  const has = n => can && sprites.has(n);
  const seen = { frames: 0, bad: [], last: null, arms: {} };
  const fig = {
    draw(petG, fc, o) {
      const out = motion.step(fc, o, 1 / 60, caps);
      seen.frames++; seen.last = out;
      for (const [k, a] of Object.entries(motion.arms)) seen.arms[k] = Math.max(seen.arms[k] || 0, a);
      const bad = badValues(R, out);
      if (model.feat?.eyes) {
        const plan = planFace(fc, o.face, { ...o, look: out.look }, o.t, has);
        if (plan.eyes.length !== 2 || !plan.mouth) bad.push(`face ${o.face}`);
      }
      const id = (x, y) => [x, y];
      const s = fxMarkup(fc, o.t, { P, at: id, pt: (d, x, y) => pointOf(R.deformers, d, out.st, x, y), lying: out.poseShown > .5, steam: out.steam, steamAt: out.steamAt, puffK: out.puffK, turn: out.turn });
      if (/NaN|undefined/.test(s)) bad.push(`fx ${o.face}`);
      if (bad.length) seen.bad.push(`${o.mode}/${o.face}/${o.gesture?.kind}: ${bad.slice(0, 4).join(', ')}`);
    },
    groupTilt: motion.groupTilt,
    gestures: GESTURES,
    get poses() { return { lie: can && !!R.W.lie, back: true }; },
    anchors: anchorsOf(model, R), extent: extentOf(model, R), hits: hitsOf(model, R),
  };
  return { fig, motion, R, seen };
}
function barePet(fig) {
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: BOUNDS });
  pet.resize();
  return pet;
}
const run = (pet, seconds) => { for (let i = 0; i < seconds * 60; i++) { pet.step(1 / 60); pet.render(); } };

/** A 2D context that only records what is drawn, and a canvas around it. */
function recCanvas(w = 1, h = 1) {
  const log = [], grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      return (...a) => { log.push([k, a]); };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => ctx, ctx, log };
}

describe('Claude-chan: the source', () => {
  const src = Object.fromEntries(SRC.map(f => [f, readFileSync(new URL(f, DIR), 'utf8')]));
  it('enters the kit statically with the plus body, and never fetches', () => {
    expect(src['figure.js']).toMatch(/^import \* as kit from '\.\.\/kit\/body\.js';$/m);
    expect(src['figure.js']).toMatch(/export async function createClaudeBody\(base, opts\) \{\s*return kit\.createBody\(opts\.host, \{ figure: await createClaudeFigure\(base, opts\), plus: true \}\);/);
    expect(src['figure.js']).toMatch(/export async function createClaudeFigure\(/);
    for (const [f, s] of Object.entries(src)) {
      expect(s, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s*\(/);
    }
  });
  it('imports only from its own directory and the kit', () => {
    for (const [f, s] of Object.entries(src)) {
      for (const [, path] of s.matchAll(/^import [^;]*? from '([^']+)';$/gm)) expect(path, `${f}: ${path}`).toMatch(/^\.\/[\w-]+\.js$|^\.\.\/kit\/[\w-]+\.js$/);
    }
  });
});

describe('Claude-chan: motion helpers', () => {
  it('turns a forward lean into a pitch of the head and a shorter upper body, keeping at most a little in-plane', () => {
    expect(pitchFromLean(0)).toEqual({ pitch: 0, neckTy: 0, waistSy: 1, waistTy: 0, rot: 0 });
    const a = pitchFromLean(10), b = pitchFromLean(20, .3);
    expect(b.pitch).toBeGreaterThan(a.pitch);
    expect(b.waistSy).toBeLessThan(a.waistSy);
    expect(Math.abs(pitchFromLean(80, .3).rot)).toBeLessThanOrEqual(6);
    expect(pitchFromLean(-10).pitch).toBeLessThan(0);
    // the group takes a share of the lean only while she moves; standing she bends it all herself
    expect(GROUP.walk).toEqual([.5, .15]);
    expect(GROUP.idle).toBeUndefined();
  });
  it('keeps the shoes on the floor standing and lifts the stepping one', () => {
    for (const f of feetFromLegs(STAND)) { expect(f.ty).toBeCloseTo(0); expect(f.tx).toBeCloseTo(0); }
    const [l, r] = feetFromLegs([[104, 212, 112, 230], [150, 212, 146, 241]]);
    expect(l.ty).toBeLessThan(-5);
    expect(r.ty).toBeCloseTo(0);
    expect(Math.abs(l.tx)).toBeLessThanOrEqual(4);
  });
  it('crossfades at a steady pace and never overshoots', () => {
    let v = 0;
    for (let i = 0; i < 9; i++) v = approach(v, 1, 1 / 60, .15);
    expect(v).toBeCloseTo(1);
    expect(approach(.5, 0, 1, .15)).toBe(0);
    expect(poseMix(1)).toEqual({ poseA: 1, standA: 0, hide: true });
  });
  it('holds the book when calm, gestures with armL hugging it in armR, and falls back to her plain arms', () => {
    const all = Object.assign(() => true, { kind: id => POSE_KIND[id] || 'both' });
    const none = () => false;
    const only = ids => Object.assign(id => ids.includes(id), { kind: id => POSE_KIND[id] || 'both' });
    expect(armPlan({ mode: 'idle', gesture: null, face: 'neutral' }, all)).toEqual({ L: 'book', R: 'book', fallback: null });
    expect(armPlan({ mode: 'walk', gesture: null, face: 'neutral' }, all).L).toBe('book');
    expect(armPlan({ mode: 'run', gesture: null, face: 'neutral' }, all).L).toBe('hangL');
    expect(armPlan({ mode: 'drag', gesture: { kind: 'wave', k: .5 }, face: 'neutral' }, all).L).toBe('hangL');
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .5 }, face: 'happy' }, all)).toEqual({ L: 'wave', R: 'bookside', fallback: null });
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .5 }, face: 'happy' }, only(['wave']))).toEqual({ L: 'wave', R: 'hangR', fallback: null });
    expect(armPlan({ mode: 'idle', gesture: { kind: 'read', k: .5 }, face: 'reading' }, all)).toEqual({ L: 'read', R: 'read', fallback: null });
    // a missing drawing: the book stands in for reading, the plain arms act out a wave
    expect(armPlan({ mode: 'idle', gesture: { kind: 'read', k: .5 }, face: 'reading' }, only(['book'])).L).toBe('book');
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .5 }, face: 'happy' }, only(['book']))).toEqual({ L: 'hangL', R: 'hangR', fallback: 'wave' });
    expect(armPlan({ mode: 'idle', gesture: null, face: 'neutral' }, none).L).toBe('hangL');
    // the gesture's arms go back before it ends; a settled face poses them only while she is still
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .95 }, face: 'happy' }, all).L).toBe('book');
    expect(armPlan({ mode: 'idle', gesture: null, face: 'thinking' }, all).L).toBe('chin');
    expect(armPlan({ mode: 'idle', gesture: null, face: 'thinking', faceOK: false }, all).L).toBe('book');
    expect(armPlan({ mode: 'walk', gesture: null, face: 'thinking' }, all).L).toBe('book');
    // kneeling with no drawing of it: the book is put aside
    expect(armPlan({ mode: 'sit', gesture: null, face: 'neutral', kneel: true }, all)).toEqual({ L: 'hangL', R: 'hangR', fallback: null });
  });
  it('has a drawing (or the plain arms\' way) for every arm gesture, and draws only words the kit has', () => {
    const words = new Set(ALL_WORDS);
    for (const g of [...Object.keys(ARM_ONE), ...Object.keys(ARM_BOTH), ...GESTURES]) expect(words.has(g), g).toBe(true);
    for (const pose of [...Object.values(ARM_ONE), ...Object.values(ARM_BOTH)]) expect(ARM_FALLBACK[pose], pose).toBeTruthy();
    for (const pose of [...Object.values(FACE_ARMS), ...Object.values(POSE_ALT).flat()]) expect(ARM_POSES, pose).toContain(pose);
    for (const f of Object.keys(FACE_ARMS)) expect(ALL_FACES, f).toContain(f);
  });
  it('builds every arm drawing on its own turn and hand warp, and the whole-body ones off the standing tree', () => {
    const R = buildRig(SYNTH);
    expect(R.unknownParents).toEqual([]);
    for (const id of ARM_POSES) {
      const A = R.ARM[id];
      expect(A, id).toBeTruthy();
      expect(R.deformers[A.rot].parent, id).toBe(id === 'cover' ? 'neck' : 'waist');
      for (const p of A.parts) { expect(p.parent).toBe(A.lift); expect(R.STANDING[p.id]).toBe(true); }
    }
    for (const id of ['lie', 'kneel', 'sit', 'back', 'roll']) {
      for (const p of R.W[id].parts) {
        expect(R.STANDING[p.id], p.id).toBeUndefined();
        let d = p.parent;
        while (R.deformers[d].parent) d = R.deformers[d].parent;
        expect(['lie', 'kneel', 'sit', 'body', 'rollBall'], p.id).toContain(d);
      }
    }
    // the ornament's ribbons swing on a warp under the flower's turn; the brows show faintly through the fringe
    expect(R.parts.find(p => p.id === 'ornament').parent).toBe('ribbons');
    expect(R.parts.find(p => p.id === 'brows_through').z).toBeGreaterThan(R.parts.find(p => p.id === 'bangs').z);
    expect(R.parts.find(p => p.id === 'faceFx').parent).toBe('headFeat');
  });
});

describe('Claude-chan: every word on the kit', () => {
  for (const can of [true, false]) {
    it(`plays every word ${can ? 'with every drawing' : 'with no pose drawings or sprites'}, every frame finite`, () => {
      for (const w of ALL_WORDS) {
        const { fig, seen } = stubFigure(SYNTH, can);
        const pet = barePet(fig);
        run(pet, .5);
        expect(pet.doWord(w), w).toBe(true);
        run(pet, 5);
        expect(seen.bad, w).toEqual([]);
        expect(seen.frames).toBeGreaterThan(300);
        // the gesture's own drawing came fully in
        const pose = ARM_ONE[w] || ARM_BOTH[w];
        if (pose) expect(seen.arms[pose] ?? 0, w).toBe(can ? 1 : 0);
      }
    });
  }
  it('makes every face, held a while, every frame finite', () => {
    const { fig, seen } = stubFigure(SYNTH);
    const pet = barePet(fig);
    for (const f of [...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS]) { expect(pet.doWord(f), f).toBe(true); run(pet, 1.5); }
    expect(seen.bad).toEqual([]);
  });
  it('holds the book standing, waves with armL while armR hugs it, and gives both up for a two-arm gesture', () => {
    const { fig, motion } = stubFigure(SYNTH);
    const pet = barePet(fig);
    run(pet, 1);
    expect(motion.arms.book).toBeCloseTo(1);
    expect(motion.arms.hangL ?? 0).toBe(0);
    pet.doWord('wave');
    run(pet, .7);
    expect(motion.arms.wave).toBeCloseTo(1);
    expect(motion.arms.bookside).toBeCloseTo(1);
    expect(motion.arms.book ?? 0).toBe(0);
    run(pet, 2);
    expect(motion.arms.book).toBeCloseTo(1);
    pet.doWord('read');
    run(pet, 1);
    expect(motion.arms.read).toBeCloseTo(1);
    expect(motion.arms.bookside ?? 0).toBe(0);
  });
  it('hangs her arms free when carried or without the drawings', () => {
    const { fig, motion } = stubFigure(SYNTH, false);
    const pet = barePet(fig);
    run(pet, 1);
    expect(motion.arms.hangL).toBeCloseTo(1);
    pet.doWord('cheer');
    run(pet, .8);
    expect(motion.arms.hangL).toBeCloseTo(1);
    expect(Object.keys(motion.arms).sort()).toEqual(['hangL', 'hangR']);
  });
  it('has her own back (never thin when turning) and lies only with the lying drawing', () => {
    expect(stubFigure(SYNTH).fig.poses).toEqual({ lie: true, back: true });
    expect(stubFigure(SYNTH, false).fig.poses).toEqual({ lie: false, back: true });
  });
});

describe('Claude-chan: faces', () => {
  const R = buildRig(SYNTH);
  const full = new Set(Object.keys(SYNTH.feat.sprites)), fullHas = n => full.has(n), noHas = () => false;
  const frame = (face, o = {}) => ({ look: [0, 0], t: .5, blink: 0, eyeClose: 0, talk: 0, talkShape: 0, face, ...o });
  it('knows a mouth and a mood for every face the kit and the plus body can make', () => {
    for (const f of ALL_FACES) { expect(MOUTHS[f], f).toBeTruthy(); expect(MOOD[f], f).toBeTruthy(); }
  });
  it('paints every face with the drawn sprites, and with strokes alone when none are there', () => {
    for (const f of ALL_FACES) {
      const fc = (PLUS_FACES[f] ?? FACES[f]).f(.5, { exprAt: 0, exprUntil: 9, modeT: 1, drowse: 0 });
      for (const [has, name] of [[fullHas, 'all'], [noHas, 'none']]) {
        const plan = planFace(fc, f, frame(f), .5, has);
        expect(plan.eyes, `${f} ${name}`).toHaveLength(2);
        for (const p of [...plan.eyes, plan.mouth]) {
          if (p.kind === 'sprite') expect(has(p.name), `${f} ${p.name}`).toBe(true);
          for (const v of Object.values(p)) if (typeof v === 'number') expect(Number.isFinite(v), `${f} ${name}`).toBe(true);
        }
      }
    }
  });
  it('uses each face\'s own drawn eyes and mouths where it has them', () => {
    const eyesOf = (f, t = .5) => planFace((PLUS_FACES[f] ?? FACES[f]).f(t, { exprAt: 0, exprUntil: 9, modeT: 1 }), f, frame(f, { t }), t, fullHas).eyes.map(e => e.name || e.kind);
    expect(eyesOf('cry')).toEqual(['cry_eyeL', 'cry_eyeR']);
    expect(eyesOf('smug')).toEqual(['smug_eyeL', 'smug_eyeR']);
    expect(eyesOf('angry')).toEqual(['angry_eyeL', 'angry_eyeR']);
    expect(eyesOf('happy')).toEqual(['happy_eyeL', 'happy_eyeR']);
    expect(eyesOf('wink')).toEqual(['open', 'wink_eyeR']);
    // (between yawns; mid-yawn the lids nearly shut and the drawn lid goes)
    expect(eyesOf('sleepy', 3)).toEqual(['halflid_eyeL', 'halflid_eyeR']);
    expect(eyesOf('sleepy', .5)).toEqual(['open', 'open']);
    expect(eyesOf('neutral')).toEqual(['open', 'open']);
    const talk = k => planFace(FACES.neutral.f(0), 'neutral', frame('neutral', { talk: 1, talkShape: k, t: Math.PI / 34 }), Math.PI / 34, fullHas).mouth.name;
    expect([0, 1, 2, 3].map(talk)).toEqual(['mouth_a', 'mouth_i', 'mouth_u', 'mouth_e']);
    expect(planFace(FACES.angry.f(0), 'angry', frame('angry'), .5, fullHas).mouth.name).toBe('angry_mouth');
    expect(planFace(PLUS_FACES.coax.f(0), 'coax', frame('coax'), .5, fullHas).mouth.name).toBe('mouth_cat');
    expect(planFace(PLUS_FACES.coax.f(0), 'coax', frame('coax'), .5, noHas).mouth.kind).toBe('cat');
    expect(planFace(PLUS_FACES.tongue.f(0), 'tongue', frame('tongue'), .5, noHas).mouth.kind).toBe('tongue');
  });
  it('draws every face into the texture without throwing, sprites or none', () => {
    const painter = createFacePainter(SYNTH, { makeCanvas: recCanvas });
    expect(painter.rect).toEqual({ x: 380, y: 400, w: 264, h: 260 });
    const base = Object.fromEntries(['eyeL', 'eyeR'].flatMap(k => ['lash', 'ball', 'iris', 'rim'].map(n => [`${k}_${n}`, { n: `${k}_${n}` }])));
    const allImg = { ...base, ...Object.fromEntries([...full].map(n => [n, { n }])) };
    for (const f of ALL_FACES) {
      const fc = (PLUS_FACES[f] ?? FACES[f]).f(.5, { exprAt: 0, exprUntil: 9, modeT: 1 });
      for (const img of [allImg, base]) {
        const c = recCanvas();
        painter.paint(c.ctx, img, { ...fc, blush: .5 }, f, frame(f, { talk: .5 }), .5);
        expect(c.log.some(([k]) => k === 'drawImage' || k === 'stroke' || k === 'fill'), f).toBe(true);
      }
    }
    expect(R.FACE).toEqual(painter.rect);
  });
  it('draws every effect at finite points', () => {
    const P = fxPointsOf(SYNTH, R), id = (x, y) => [x, y];
    const fc = { orbit: true, listen: true, think: true, sweat: true, anger: true, bang: true, gloom: true, question: true, crack: .6 };
    const s = fxMarkup(fc, 1.3, { P, at: id, pt: (d, x, y) => [x, y], lying: false, steam: .8, steamAt: ['body', [128, 150]], puffK: .5, turn: [.3, .2] });
    expect(s).not.toMatch(/NaN|undefined/);
    expect((s.match(/<path|<circle|<g/g) || []).length).toBeGreaterThan(15);
  });
});

/* ---------- the real model and its files ---------- */
describe.skipIf(!real)('Claude-chan: model.json and its files', () => {
  const R = real && buildRig(real);
  const texOk = (url, w, h, what) => {
    expect(existsSync(url), what).toBe(true);
    const p = png(url);
    expect(p.colorType, `${what} is RGBA`).toBe(6);
    expect(Math.abs(p.w - w), `${what} width ${p.w} vs ${w}`).toBeLessThanOrEqual(2);
    expect(Math.abs(p.h - h), `${what} height ${p.h} vs ${h}`).toBeLessThanOrEqual(2);
  };
  const K = real ? real.units.DS / real.units.S : 1;
  it('hangs every part from a deformer the figure defines, in a sensible order', () => {
    expect(R.unknownParents).toEqual([]);
    const z = id => real.parts.find(p => p.id === id)?.z;
    for (const id of ['hair_back', 'face', 'bangs', 'ornament']) expect(z(id), id).toBeTypeOf('number');
    expect(z('hair_back')).toBeLessThan(z('face'));
    expect(z('face')).toBeLessThan(z('bangs'));
    expect(z('bangs')).toBeLessThan(z('ornament'));
    if (z('capelet') != null) for (const a of ['arm_l', 'arm_r']) if (z(a) != null) expect(z(a), a).toBeLessThan(z('capelet'));
    if (z('skirt') != null && z('shoe_l') != null) expect(z('shoe_l')).toBeLessThan(z('skirt'));
  });
  it('has every part texture, RGBA, sized to its box', () => {
    for (const p of real.parts) texOk(new URL(`tex/${p.tex}.png`, DIR), p.box[2] * K, p.box[3] * K, p.tex);
  });
  it('keeps her pivots mirrored about her middle, and every point inside the view', () => {
    const PV = real.pivots, mid = PV.head?.[0] ?? 128, view = real.view;
    for (const [l, r] of [['armL', 'armR'], ['footL', 'footR']]) {
      expect(Math.abs((PV[l][0] + PV[r][0]) / 2 - mid), `${l}/${r}`).toBeLessThan(5);
      expect(Math.abs(PV[l][1] - PV[r][1]), `${l}/${r}`).toBeLessThan(5);
    }
    expect(PV.head[1]).toBeLessThan(PV.neck[1]);
    expect(PV.neck[1]).toBeLessThan(PV.waist[1]);
    for (const [k, p] of Object.entries(PV)) expect(inside(p, view), k).toBe(true);
    const A = anchorsOf(real, R);
    for (const k of ['gaze', 'tear', 'z', 'bubble']) expect(inside(A[k], view), k).toBe(true);
    for (const t of A.tears) expect(inside(t, view)).toBe(true);
    const P = fxPointsOf(real, R);
    for (const k of ['orbit', 'think', 'listen', 'sweat', 'anger', 'bang', 'question', 'puff']) expect(inside(P[k], view), k).toBe(true);
    for (const [x, y0, y1] of P.gloom) expect(Number.isFinite(x + y0 + y1) && y0 < y1).toBe(true);
    for (const p of P.crack) expect(inside(p, view)).toBe(true);
  });
  it.skipIf(!realFeat)('has every face file, RGBA, sized to its box, and every sprite on the face texture', () => {
    const feat = real.feat, F = feat.face, r = Array.isArray(F.rect) ? F.rect : [F.rect.x, F.rect.y, F.rect.w, F.rect.h];
    const face = [r[0], r[1], r[0] + r[2], r[1] + r[3]];
    for (const k of ['eyeL', 'eyeR']) {
      const e = feat.eyes[k];
      for (const n of ['lash', 'ball', 'iris', ...(e.rim ? ['rim'] : [])]) {
        const b = e[n];
        texOk(new URL(`feat/${k}_${n}.png`, DIR), b[2] - b[0], b[3] - b[1], `${k}_${n}`);
        expect(inside([b[0], b[1]], face, 2) && inside([b[2], b[3]], face, 2), `${k}_${n} on the face`).toBe(true);
      }
      for (const fit of [e.lidFit, e.rimFit]) expect(fit).toHaveLength(3);
    }
    for (const [n, b] of Object.entries(feat.sprites)) {
      texOk(new URL(`feat/${n}.png`, DIR), b[2] - b[0], b[3] - b[1], n);
      expect(inside([b[0], b[1]], face, 2) && inside([b[2], b[3]], face, 2), `${n} on the face`).toBe(true);
    }
    for (const k of ['cheeks', 'mouth']) expect(F[k], k).toBeTruthy();
    // the faces paint with what the model has
    const has = n => n in feat.sprites;
    for (const f of ALL_FACES) {
      const plan = planFace((PLUS_FACES[f] ?? FACES[f]).f(.5, { exprAt: 0, exprUntil: 9, modeT: 1 }), f, { look: [0, 0], t: .5 }, .5, has);
      expect(plan.eyes, f).toHaveLength(2);
    }
  });
  it.skipIf(!realPoses.length)('has every pose file, RGBA, sized to its box, its pivot and hand on the drawing', () => {
    for (const id of realPoses) {
      const pose = real.poses[id];
      for (const p of [...pose.required, ...(pose.overlays || [])]) texOk(new URL(`tex/${p.tex}.png`, DIR), p.box[2] * K, p.box[3] * K, `${id} ${p.tex}`);
      const A = R.ARM[id];
      if (!A) continue;
      expect(inside(A.pivot, A.rect, 12), `${id} pivot`).toBe(true);
      expect(inside(A.wrist, A.rect, 4), `${id} wrist`).toBe(true);
    }
  });
  it('lays out every whole-body drawing the way her motion reads it', () => {
    const P = real.poses, view = real.view;
    for (const id of ['back', 'lie', 'kneel', 'roll', 'sit']) {
      expect(P[id]?.required?.length, id).toBeGreaterThan(0);
      expect(R.W[id], id).toBeTruthy();
      for (const o of P[id].overlays || []) expect(['shut', 'smile', 'talk'], o.id).toContain(o.use);
    }
    // lying: its own points for the kit, the head and legs it turns, the kick's axis, the effects' map
    const L = P.lie;
    for (const k of ['gaze', 'tear', 'z', 'bubble', 'hearts', 'glints', 'hit', 'halfW']) expect(L.anchors[k], k).toBeTruthy();
    for (const k of ['head', 'back', 'legs']) expect(L.rects[k], k).toHaveLength(4);
    for (const k of ['lie', 'lieChin']) expect(inside(L.pivots[k], view), k).toBe(true);
    expect(L.legAxis.knee).toHaveLength(2);
    expect(L.fx.s).toBeGreaterThan(.5);
    expect(L.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
    for (const k of ['gaze', 'bubble', 'tear', 'z']) expect(inside(L.anchors[k], view), k).toBe(true);
    const A = anchorsOf(real, R);
    expect(A.lie.hit).toEqual(L.anchors.hit);
    expect(A.lie.spout).toHaveLength(2);
    // kneeling: her head sits a little higher than the kit's seated sink
    expect(P.kneel.headDrop).toBeGreaterThan(0);
    expect(P.kneel.headDrop).toBeLessThanOrEqual(SIT_LOW);
    expect(A.kneelRaise).toBeCloseTo(SIT_LOW - P.kneel.headDrop, 1);
    expect(P.kneel.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
    // the ball rolls on its edge: a support sample every 5°, all within the ball
    expect(P.roll.support).toHaveLength(72);
    expect(P.roll.around).toBeGreaterThan(0);
    const rb = P.roll.required[0].box;
    for (const v of P.roll.support) expect(v > 0 && v <= Math.max(rb[2], rb[3]) * .6).toBe(true);
    expect(inside(P.roll.pivots.rollBall, [rb[0], rb[1], rb[0] + rb[2], rb[1] + rb[3]])).toBe(true);
    // her back stands on the floor, centred under her
    expect(P.back.pivots.backFlip).toEqual([128, 256]);
    const bb = P.back.required[0].box;
    expect(Math.abs(bb[1] + bb[3] - 256)).toBeLessThan(30);
    // seated: the body hangs on its own deformers, the head sinks a sane amount
    expect(P.sit.headDrop).toBeGreaterThan(10);
    expect(P.sit.headDrop).toBeLessThanOrEqual(SIT_LOW);
    for (const p of P.sit.required) expect(['sitTop', 'sitBase'], p.id).toContain(p.parent);
  });
  it('lies, kneels and rolls with her drawings on the real rig', () => {
    const { fig, motion, R: RR, seen } = stubFigure(real);
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? 0;
    run(pet, .5);
    pet.doWord('lie'); run(pet, 3);
    expect(motion.lieK).toBeGreaterThan(.95);
    expect(alpha('lie_body')).toBe(1);
    expect(seen.last.hideFront).toBe(true);
    pet.doWord('stand'); run(pet, 4);
    // she goes down through the seated body, and the kneeling drawing covers it
    pet.doWord('kneel'); run(pet, .4);
    expect(alpha('sit_skirt')).toBeGreaterThan(0);
    run(pet, 2.6);
    expect(alpha('kneel_body')).toBe(1);
    expect(alpha('sit_skirt')).toBe(0);
    pet.doWord('sit'); run(pet, 2);
    expect(alpha('kneel_body')).toBe(0);
    expect(alpha('sit_skirt')).toBe(1);
    pet.doWord('stand'); run(pet, 4);
    expect(alpha('sit_skirt')).toBe(0);
    pet.doWord('roll');
    let ball = 0;
    for (let i = 0; i < 90; i++) { run(pet, 1 / 60); ball = Math.max(ball, alpha('roll_ball')); }
    expect(ball).toBe(1);
    expect(seen.bad).toEqual([]);
    expect(RR.W.roll.parts[0].parent).toBe('rollBall');
  });
  it('hides the seated body under the ball and her back, and lets the back go gently when she sits turned away', () => {
    for (const from of ['sit', 'kneel']) {
      const { fig, seen } = stubFigure(real);
      const pet = barePet(fig);
      const alpha = id => seen.last.st.alpha[id] ?? 0;
      run(pet, .3);
      pet.doWord(from); run(pet, 3);
      pet.doWord('roll');
      let covered = 0;
      for (let i = 0; i < 90; i++) {
        run(pet, 1 / 60);
        if (alpha('roll_ball') < 1) continue;
        covered++;
        expect([alpha('sit_skirt'), alpha('sit_top')], from).toEqual([0, 0]);
      }
      expect(covered, from).toBeGreaterThan(0);
    }
    const { fig, seen } = stubFigure(real);
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? 0;
    run(pet, .3);
    pet.doWord('away'); run(pet, .8);
    expect(alpha('back_body')).toBe(1);
    // her hem and shoes stay on the floor while the back hair sways
    expect(seen.last.st.backHair.fn(.5, 1).map(Math.abs)).toEqual([0, 0]);
    pet.doWord('sit');
    let prev = 1, drop = 0;
    for (let i = 0; i < 60; i++) {
      run(pet, 1 / 60);
      const a = alpha('back_body');
      drop = Math.max(drop, prev - a); prev = a;
      if (a >= 1) expect(alpha('sit_skirt')).toBe(0);
    }
    expect(prev).toBe(0);
    expect(drop).toBeLessThan(.2);
  });
  it('squashes her for the roll only when the ball is hers (else the kit does)', () => {
    const minSy = without => {
      const { fig, seen } = stubFigure(real, true, without);
      const pet = barePet(fig);
      run(pet, .3);
      pet.doWord('roll');
      let m = 1;
      for (let i = 0; i < 90; i++) { run(pet, 1 / 60); m = Math.min(m, seen.last.st.body.sy); }
      return m;
    };
    expect(minSy([])).toBeLessThan(.9);
    expect(minSy(['roll'])).toBeGreaterThan(.95);
  });
  it('plays every word on the real rig, every frame finite', () => {
    for (const w of ALL_WORDS) {
      const { fig, seen } = stubFigure(real);
      const pet = barePet(fig);
      run(pet, .3);
      expect(pet.doWord(w), w).toBe(true);
      run(pet, 4);
      expect(seen.bad, w).toEqual([]);
    }
  });
});

describe('Claude-chan: sitting', () => {
  it('raises the kit\'s points by what her head sinks less than the kit\'s 29', () => {
    expect(sitRaise(0, 22)).toBe(0);
    expect(sitRaise(1, 22)).toBeCloseTo(7);
    expect(sitRaise(.5, 22)).toBeCloseTo(3.5);
    expect(sitRaise(1, 40)).toBe(0);
    const A = { gaze: [128, 90], tear: [110, 100], tears: [[110, 100], [146, 100]], hearts: [90, 170, 50], bubble: [128, 16] };
    expect(sitAnchors(A, 0)).toBe(A);
    const up = sitAnchors(A, 5);
    expect(up.gaze).toEqual([128, 85]);
    expect(up.tears[1]).toEqual([146, 95]);
    expect(up.hearts).toEqual([90, 170, 45]);
    expect(sitMix(1, 1)).toEqual({ sitA: 1, topA: 1 });
    expect(sitMix(1, 0).topA).toBe(0);
    expect(sitMix(0, 1).sitA).toBe(0);
  });
});

/* ---------- the figure itself, on a stand-in page ---------- */
describe.skipIf(!real)('Claude-chan: the figure', () => {
  const make = async (missing = []) => {
    const doc = globalThis.document;
    globalThis.document = { createElement: () => recCanvas(), createElementNS: () => recCanvas() };
    try {
      return await createClaudeFigure(DIR, {
        model: real, asset: p => String(p),
        loadImage: url => (missing.some(n => String(url).endsWith(`tex/${n}.png`)) ? Promise.reject(new Error('missing')) : Promise.resolve({ url })),
      });
    } finally { globalThis.document = doc; }
  };
  it('lies with the lying drawing, rolls with the ball, and has her back', async () => {
    const fig = await make();
    expect(fig.poses).toEqual({ lie: true, back: true });
    expect(fig.roll).toBeUndefined();
    expect(fig.gestures).toContain('roll');
    expect(fig.anchors.lie.hit).toEqual(real.poses.lie.anchors.hit);
    expect(fig.anchors.kneelRaise).toBeCloseTo(SIT_LOW - real.poses.kneel.headDrop, 1);
  });
  it('stays seated without the lying drawing, and the kit spins her without the ball', async () => {
    const fig = await make(['lie_body', 'roll_ball']);
    expect(fig.poses).toEqual({ lie: false, back: true });
    expect(fig.roll).toBe('spin');
    expect(fig.gestures).not.toContain('roll');
  });
  it('kneels without a kneelRaise when the kneeling drawing is missing (the seated raise already covers it)', async () => {
    const fig = await make(['kneel_body']);
    expect(fig.anchors.kneelRaise).toBe(0);
  });
});
