import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createPet, FACES, ROLL_D as KIT_ROLL_D, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_FACES, PLUS_MIXES, PLUS_MOTIONS, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import {
  anchorsOf, approach, ARM_BOTH, ARM_FALLBACK, ARM_ONE, armPlan, ballAngle, bowPose, buildRig, createMotion, extentOf, FACE_ARMS, feetFromLegs,
  fxPointsOf, GROUP, hitsOf, MOOD, pitchFromLean, pointOf, POSE_ALT, POSE_KIND, poseMix, ROLL_D, SIT_BESIDE, SIT_LOW, sitAnchors, sitOwnArms, sitRaise,
  tailField, WHOLE_POSES, WING, wingStates, liveAnchors,
} from '../packages/cortico-world-desktop-pet/web/gpt-chan/motion.js';
import { createFacePainter, MOUTHS, planFace, TALK_SHAPES } from '../packages/cortico-world-desktop-pet/web/gpt-chan/face.js';
import { appendagesOf, drawnTurn, LIE_DRAWN, WINGBEAT, gesturesOf, HEAD_PITCH, headMoves, KNEEL_HEAD, kneelHeadField, partsOf, TILT_BACK, TILT_DEG, tiltEased, DROOP, BODY_LEAN } from '../packages/cortico-world-desktop-pet/web/gpt-chan/motion.js';
import { fxMarkup } from '../packages/cortico-world-desktop-pet/web/gpt-chan/fx.js';
import * as KneelMotion from '../packages/cortico-world-desktop-pet/web/gpt-chan/motion.js';
import { describeKneelArms } from './helpers/kneel-arms.js';
import { describeFloorFace } from './helpers/floor-face.js';
import * as FaceModule from '../packages/cortico-world-desktop-pet/web/gpt-chan/face.js';
import { createGptFigure, GESTURES } from '../packages/cortico-world-desktop-pet/web/gpt-chan/figure.js';

const DIR = new URL('../packages/cortico-world-desktop-pet/web/gpt-chan/', import.meta.url);
const SRC = ['figure.js', 'face.js', 'motion.js', 'fx.js'];
const MODEL_URL = new URL('model.json', DIR);
const real = existsSync(MODEL_URL) ? JSON.parse(readFileSync(MODEL_URL, 'utf8')) : null;
const realFeat = !!real?.feat?.eyes;
const realPoses = real?.poses ? Object.keys(real.poses).filter(k => real.poses[k]?.required?.length) : [];
const realArmPoses = realPoses.filter(id => !WHOLE_POSES.includes(id));
const BOUNDS = () => ({ W: 1200, H: 400, floorY: 380, S: .42 });
const ALL_FACES = [...new Set([...Object.keys(FACES), ...Object.keys(PLUS_FACES)])];
const ALL_WORDS = [...KIT_MOTIONS, ...PLUS_MOTIONS];

/** Width, height and colour type of a PNG, from its header. */
function png(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}
/** The alpha channel of an 8-bit RGBA, non-interlaced PNG: { w, h, a }. */
function alphaOf(url) {
  const b = readFileSync(url), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  expect(b[24] === 8 && b[25] === 6 && b[28] === 0, 'an 8-bit RGBA PNG, not interlaced').toBe(true);
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
/** Sizes of the connected regions where `on(i)` holds (8-connected, or 4-), and whether each touches the border. */
function regions({ w, h }, on, eight = true) {
  const seen = new Uint8Array(w * h), out = [], st = [];
  const nb = eight ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !on(s)) continue;
    let n = 0, edge = false;
    seen[s] = 1; st.push(s);
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i - x) / w;
      n++;
      if (!x || !y || x === w - 1 || y === h - 1) edge = true;
      for (const [dx, dy] of nb) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && !seen[j] && on(j)) { seen[j] = 1; st.push(j); }
      }
    }
    out.push({ n, edge });
  }
  return out;
}
const inside = ([x, y], [x0, y0, x1, y1], m = 0) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;
const rectOf = b => [b[0], b[1], b[0] + b[2], b[1] + b[3]];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

/* ---------- a made-up model with every drawing, so the code is tested before (and beyond) the art ---------- */
const FAMS = ['happy', 'sleep', 'surprised', 'love', 'dizzy', 'drag', 'cry', 'smug', 'angry', 'sad', 'wink', 'halflid', 'shy', 'determined'];
const MOUTH_SPRITES = ['neutral_mouth', ...TALK_SHAPES.map(s => `mouth_${s}`), ...['frown', 'pout', 'cat', 'grin', 'tongue', 'smile'].map(s => `mouth_${s}`)];
// her arm drawings: two-arm ones, then armL's own
const BOTH_POSES = ['cheer', 'pray', 'cross', 'oops', 'search', 'read', 'write', 'heart', 'hips', 'stretch', 'shy', 'cup', 'hug', 'curtsy'];
const ONE_POSES = ['chin', 'salute', 'cover', 'scratch', 'vsign', 'fist', 'wave', 'idea', 'point'];
const ARM_POSES = [...BOTH_POSES, ...ONE_POSES];
function synthModel() {
  const eye = (x0, x1) => {
    const cx = (x0 + x1) / 2;
    return {
      lash: [x0 - 10, 470, x1 + 10, 530], ball: [x0, 480, x1, 560], iris: [x0 + 8, 482, x1 - 8, 558], rim: [x0, 480, x1, 560],
      lidFit: [.01, -.02 * cx, .01 * cx * cx + 485], rimFit: [-.01, .02 * cx, -.01 * cx * cx + 555],
    };
  };
  const sprites = { ...Object.fromEntries(MOUTH_SPRITES.map(n => [n, [484, 590, 508, 606]])) };
  for (const f of FAMS) Object.assign(sprites, { [`${f}_eyeL`]: [404, 470, 484, 560], [`${f}_eyeR`]: [508, 470, 588, 560], [`${f}_mouth`]: [484, 590, 508, 606] });
  const poses = {};
  for (const id of ARM_POSES) {
    const one = ONE_POSES.includes(id);
    poses[id] = {
      required: [{ id: `pose_${id}`, tex: `pose_${id}`, z: one ? 15.8 : 15.5, parent: `pose${id[0].toUpperCase()}${id.slice(1)}`, grid: [4, 4], box: one ? [74, 108, 40, 52] : [90, 118, 76, 50] }],
      pivots: { [`pose${id[0].toUpperCase()}${id.slice(1)}`]: one ? [103, 145] : [128, 145] }, wrist: one ? [86, 120] : [128, 150], kind: one ? 'armL' : 'both',
    };
  }
  poses.point.wrist = [52, 130];
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
    sit: {
      required: [
        { id: 'sit_skirt', tex: 'sit_skirt', z: 3.1, parent: 'sitBase', grid: [8, 6], box: [30, 180, 200, 76] },
        { id: 'sit_top', tex: 'sit_top', z: 6.5, parent: 'sitTop', grid: [8, 8], box: [92, 110, 74, 80] },
      ],
      pivots: { sitBase: [128, 256], sitTop: [128, 161.4] }, headDrop: 22,
    },
    back: { required: [{ id: 'back_body', tex: 'back_body', z: 21.2, parent: 'backFlip', grid: [8, 8], box: [40, 20, 176, 236] }], rects: { hair: [40, 60, 216, 256] } },
    roll: { required: [{ id: 'roll_ball', tex: 'roll_ball', z: 30, parent: 'rollBall', grid: [2, 2], box: [50, 100, 156, 156] }], pivots: { rollBall: [128, 178] }, support: Array(72).fill(78), around: 490 },
  });
  return {
    units: { S: .2, X0: 496, FEET: 1333, DS: 1, featDS: 1 },
    pivots: {
      body: [128, 256], waist: [128, 161.4], neck: [128, 119.8], head: [128, 79.4], armL: [108.4, 134.6], armR: [148.4, 134.6],
      footL: [119.8, 253], footR: [136.8, 253], ornament: [166.4, 67.8], wingL: [123.6, 144.6], wingR: [132.4, 144.6], tail: [156.8, 181.4],
    },
    rects: { head: [62.8, 17.4, 193.2, 129.4], hair: [53, 19.2, 215, 248.2], tail: [148.6, 128.8, 225.4, 243.2] },
    parts: [
      { id: 'wing_l', tex: 'wing_l', z: .3, parent: 'wingL', grid: [6, 4], box: [36, 116.6, 92.4, 57.4] },
      { id: 'wing_r', tex: 'wing_r', z: .35, parent: 'wingR', grid: [6, 4], box: [127.6, 116.4, 98.8, 57.2] },
      { id: 'horns', tex: 'horns', z: .6, parent: 'headBack', grid: [6, 4], box: [78.2, 18.6, 106, 51.2] },
      { id: 'hair_back', tex: 'hair_back', z: 1, parent: 'hairSway', grid: [10, 14], box: [53, 19.2, 162, 229] },
      { id: 'tail', tex: 'tail', z: 1.5, parent: 'tail', grid: [6, 8], box: [148.6, 128.8, 76.8, 114.4] },
      { id: 'shoe_l', tex: 'shoe_l', z: 2, parent: 'footL', grid: [3, 4], box: [110.2, 226.4, 18.2, 30] },
      { id: 'shoe_r', tex: 'shoe_r', z: 2.05, parent: 'footR', grid: [3, 4], box: [127.6, 226.4, 19.4, 30.2] },
      { id: 'skirt', tex: 'skirt', z: 3, parent: 'skirt', grid: [10, 8], box: [63.6, 155.2, 132, 101.4] },
      { id: 'torso', tex: 'torso', z: 4, parent: 'waist', grid: [6, 4], box: [94.4, 117, 67.8, 47.8] },
      { id: 'arm_l', tex: 'arm_l', z: 5, parent: 'armL', grid: [4, 8], box: [60.8, 133, 53.6, 94.6] },
      { id: 'arm_r', tex: 'arm_r', z: 5.05, parent: 'armR', grid: [4, 8], box: [141.8, 133, 55.4, 95] },
      { id: 'face', tex: 'face', z: 8, parent: 'headMid', grid: [6, 6], box: [78.4, 32.8, 103.4, 87] },
      { id: 'brows', tex: 'brows', z: 8.6, parent: 'headFeat', grid: [12, 2], box: [104.6, 78.6, 45.8, 4.6] },
      { id: 'bangs', tex: 'bangs', z: 13, parent: 'bangsSway', grid: [8, 10], box: [94.2, 32.8, 67, 68.4] },
      { id: 'ornament', tex: 'ornament', z: 14, parent: 'ornament', grid: [4, 8], box: [155, 54.4, 28.6, 61] },
    ],
    feat: {
      eyes: { eyeL: eye(414, 474), eyeR: eye(518, 578) },
      sprites,
      face: { rect: [360, 400, 272, 260], cheeks: [[424, 590, 30, 16], [568, 590, 30, 16]], mouth: [496, 598], tearEnd: { eyeL: 640, eyeR: 640 }, browSplit: 496, ink: '#4a3a52', mouthDy: {} },
    },
    schemes: [{ id: 'original', brand: 'GPT 娘', label: '原版', accent: '#7A8FA8', ready: true }],
    view: [-12, -8, 268, 272],
    poses,
  };
}
const SYNTH = synthModel();
// the same model with none of the later drawings: no face drawings, no pose drawings (her model.json as it starts)
const BARE = { ...SYNTH, feat: {}, poses: {} };

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
  // the wings never swing far, nor narrow or widen past their bounds
  for (const w of ['wingL', 'wingR']) {
    const s = out.st[w];
    if (!s) { bad.push(`no ${w}`); continue; }
    if (Math.abs(s.a) > 25) bad.push(`${w}.a=${s.a}`);
    if (s.sx < WING.narrow - 1e-9 || s.sx > WING.wide + 1e-9) bad.push(`${w}.sx=${s.sx}`);
  }
  if (!out.st.tailRot || !out.st.tail) bad.push('no tail');
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
      const plan = planFace(fc, o.face, { ...o, look: out.look }, o.t, has);
      if (plan.eyes.length !== 2 || !plan.mouth) bad.push(`face ${o.face}`);
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
function barePet(fig, opts = {}) {
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const fxG = el();
  const pet = createPet({ petG: el(), shadowEl: el(), fxG }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: BOUNDS, ...opts });
  pet.resize();
  // the kit's particles and marks, as last drawn
  pet.fxHtml = () => fxG.innerHTML;
  return pet;
}
const run = (pet, seconds) => { for (let i = 0; i < seconds * 60; i++) { pet.step(1 / 60); pet.render(); } };

/**
 * Her motion alone, held in `face` (and `mode`) for `settle` seconds, then sampled over one breath of the wings (4.5 s):
 * the mean lift of the wings (wingL's turn less wingR's, halved), their width, the tail's turn at the root and where the
 * tail's outer edge goes (y; down +).
 */
function held(model, face, { mode = 'idle', settle = 3, o = {} } = {}) {
  const R = buildRig(model), motion = createMotion(model, R), caps = { pose: () => false, tex: () => true };
  const [x0, , x1, y1] = R.deformers.tail.rect, edge = [x1, (R.deformers.tailRot.pivot[1] + y1) / 2];
  let t = 0;
  const step = () => { t += 1 / 60; return motion.step({}, { t, mode, face, ...o }, 1 / 60, caps); };
  for (let i = 0; i < settle * 60; i++) step();
  const lift = [], sx = [], root = [], tip = [];
  for (let i = 0; i < 270; i++) {
    const { st } = step();
    lift.push((st.wingL.a - st.wingR.a) / 2); sx.push(st.wingL.sx); root.push(st.tailRot.a);
    tip.push(pointOf(R.deformers, 'tail', st, ...edge)[1]);
  }
  return { lift: mean(lift), sx: mean(sx), root: mean(root), tip: mean(tip), x0 };
}

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

describe('GPT-chan: the source', () => {
  const src = Object.fromEntries(SRC.map(f => [f, readFileSync(new URL(f, DIR), 'utf8')]));
  it('has no spout: her words leave it out, so none of her code draws one', () => {
    expect(JSON.parse(readFileSync(new URL('figure.json', DIR), 'utf8')).vocab.map(w => w.id)).not.toContain('spout');
    expect(GESTURES).not.toContain('spout');
    for (const [f, s] of Object.entries(src)) expect(s, f).not.toMatch(/spout/i);
  });
  it('enters the kit statically with the plus body, and never fetches', () => {
    expect(src['figure.js']).toMatch(/^import \* as kit from '\.\.\/kit\/body\.js';$/m);
    expect(src['figure.js']).toMatch(/export async function createGptBody\(base, opts\) \{\s*return kit\.createBody\(opts\.host, \{ figure: await createGptFigure\(base, opts\), plus: true \}\);/);
    expect(src['figure.js']).toMatch(/export async function createGptFigure\(/);
    for (const [f, s] of Object.entries(src)) {
      expect(s, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s*\(/);
    }
  });
  it('imports only from its own directory and the kit, and is nobody else\'s copy', () => {
    for (const [f, s] of Object.entries(src)) {
      for (const [, path] of s.matchAll(/^import [^;]*? from '([^']+)';$/gm)) expect(path, `${f}: ${path}`).toMatch(/^\.\/[\w-]+\.js$|^\.\.\/kit\/[\w-]+\.js$/);
      expect(s, f).not.toMatch(/claude|Claude/);
      expect(s, f).toMatch(/gpt-chan|GPT-chan/);
    }
  });
});

describe('GPT-chan: motion helpers', () => {
  it('turns a forward lean into a pitch of the head and a shorter upper body, keeping at most a little in-plane', () => {
    expect(pitchFromLean(0)).toEqual({ pitch: 0, neckTy: 0, waistSy: 1, waistTy: 0, rot: 0 });
    const a = pitchFromLean(10), b = pitchFromLean(20, .3);
    expect(b.pitch).toBeGreaterThan(a.pitch);
    expect(b.waistSy).toBeLessThan(a.waistSy);
    expect(Math.abs(pitchFromLean(80, .3).rot)).toBeLessThanOrEqual(6);
    expect(GROUP.walk).toEqual([.5, .15]);
    expect(GROUP.idle).toBeUndefined();
  });
  it('keeps the shoes on the floor standing and lifts the stepping one', () => {
    for (const f of feetFromLegs(STAND)) { expect(f.ty).toBeCloseTo(0); expect(f.tx).toBeCloseTo(0); }
    const [l, r] = feetFromLegs([[104, 212, 112, 230], [150, 212, 146, 241]]);
    expect(l.ty).toBeLessThan(-5);
    expect(r.ty).toBeCloseTo(0);
  });
  it('rolls a ball (when she has one) without slipping, as far as the kit carries her', () => {
    expect(ROLL_D).toBe(KIT_ROLL_D);
    expect(ballAngle(0)).toBeCloseTo(0);
    expect(ballAngle(1)).toBeCloseTo(360);
    for (const travel of [ROLL_D, 250, 0]) expect((ballAngle(1, 490, travel) - ballAngle(0, 490, travel)) / 360 * 490).toBeCloseTo(travel, 6);
  });
  it('crossfades at a steady pace and never overshoots', () => {
    let v = 0;
    for (let i = 0; i < 9; i++) v = approach(v, 1, 1 / 60, .15);
    expect(v).toBeCloseTo(1);
    expect(approach(.5, 0, 1, .15)).toBe(0);
    expect(poseMix(1)).toEqual({ poseA: 1, standA: 0, hide: true });
  });
  it('mirrors her wings: spread they rise and widen, folded they turn in and narrow, a lag turns both alike', () => {
    const rest = wingStates(0, 0);
    for (const side of ['wingL', 'wingR']) { expect(rest[side].a).toBeCloseTo(0); expect(rest[side].sx).toBe(1); }
    const up = wingStates(WING.up, 0);
    expect(up.wingL.a).toBeGreaterThan(0);
    expect(up.wingR.a).toBeCloseTo(-up.wingL.a);
    expect(up.wingL.sx).toBeCloseTo(WING.wide);
    const folded = wingStates(0, 1);
    expect(folded.wingL.a).toBeLessThan(0);
    expect(folded.wingR.a).toBeGreaterThan(0);
    expect(folded.wingL.sx).toBeCloseTo(WING.narrow);
    // their own flutters, and a lag the same way for both
    const f = wingStates(0, 0, 2, -1, 3);
    expect([f.wingL.a, f.wingR.a]).toEqual([5, 4]);
    // never past the bounds, whatever comes in; a few degrees at most from the mood
    for (const [s, k] of [[40, 0], [-40, 3], [0, -2]]) {
      const w = wingStates(s, k);
      for (const side of ['wingL', 'wingR']) expect(w[side].sx >= WING.narrow && w[side].sx <= WING.wide).toBe(true);
    }
    expect(WING.up + WING.fold).toBeLessThan(15);
    // which way is up: a + turn lifts the far end of the wing on the viewer's left (and a − one the right one's)
    const R = buildRig(SYNTH), tipL = [40, 130], tipR = [222, 130];
    expect(pointOf(R.deformers, 'wingL', { wingL: up.wingL }, ...tipL)[1]).toBeLessThan(tipL[1]);
    expect(pointOf(R.deformers, 'wingR', { wingR: up.wingR }, ...tipR)[1]).toBeLessThan(tipR[1]);
  });
  it('bends her tail about its root, the tip most, and runs a swing out along it', () => {
    const pv = [156.8, 181.4], f = tailField(pv, 90, 10, 0, 0);
    expect(f(0, 0, ...pv)).toEqual([0, 0]);
    const near = f(0, 0, pv[0] + 20, pv[1]), far = f(0, 0, pv[0] + 80, pv[1]);
    expect(far[1]).toBeGreaterThan(near[1] * 4);
    // + bends it the way a + turn goes: on her right side, down; − curls it up
    expect(far[1]).toBeGreaterThan(0);
    expect(tailField(pv, 90, -10, 0, 0)(0, 0, pv[0] + 80, pv[1])[1]).toBeLessThan(0);
    // a pure turn: the distance from the root stays
    const p = [pv[0] + 60, pv[1] + 30], q = f(0, 0, ...p);
    expect(Math.hypot(p[0] + q[0] - pv[0], p[1] + q[1] - pv[1])).toBeCloseTo(Math.hypot(60, 30), 6);
    // the swing reaches the tip later than the middle (it runs outward)
    const sw = ph => tailField(pv, 90, 0, 10, ph);
    const peak = d => { let best = 0, at = 0; for (let ph = 0; ph < 2 * Math.PI; ph += .01) { const y = sw(ph)(0, 0, pv[0] + d, pv[1])[1]; if (y > best) { best = y; at = ph; } } return at; };
    expect(peak(80)).toBeGreaterThan(peak(30));
  });
  it('lets her arms hang when calm, gestures with armL while armR hangs, and falls back to her plain arms', () => {
    const all = Object.assign(() => true, { kind: id => POSE_KIND[id] || 'both' });
    const none = () => false;
    const only = ids => Object.assign(id => ids.includes(id), { kind: id => POSE_KIND[id] || 'both' });
    const hang = { L: 'hangL', R: 'hangR', fallback: null };
    for (const mode of ['idle', 'walk', 'sit', 'run']) expect(armPlan({ mode, gesture: null, face: 'neutral' }, all), mode).toEqual(hang);
    expect(armPlan({ mode: 'drag', gesture: { kind: 'wave', k: .5 }, face: 'neutral' }, all)).toEqual(hang);
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .5 }, face: 'happy' }, all)).toEqual({ L: 'wave', R: 'hangR', fallback: null });
    expect(armPlan({ mode: 'idle', gesture: { kind: 'read', k: .5 }, face: 'reading' }, all)).toEqual({ L: 'read', R: 'read', fallback: null });
    expect(armPlan({ mode: 'idle', gesture: { kind: 'peek', k: .5 }, face: 'peeking' }, all)).toEqual({ L: 'search', R: 'search', fallback: null });
    // a missing drawing: the notebook stands in for the book, the magnifier's for the book; the plain arms act out a wave
    expect(armPlan({ mode: 'idle', gesture: { kind: 'read', k: .5 }, face: 'reading' }, only(['write'])).L).toBe('write');
    expect(armPlan({ mode: 'idle', gesture: { kind: 'peek', k: .5 }, face: 'peeking' }, only(['read'])).L).toBe('read');
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .5 }, face: 'happy' }, none)).toEqual({ ...hang, fallback: 'wave' });
    expect(armPlan({ mode: 'idle', gesture: { kind: 'read', k: .5 }, face: 'reading' }, none)).toEqual({ ...hang, fallback: 'read' });
    // the gesture's arms go back before it ends; a settled face poses them only while she is still
    expect(armPlan({ mode: 'idle', gesture: { kind: 'wave', k: .95 }, face: 'happy' }, all)).toEqual(hang);
    expect(armPlan({ mode: 'idle', gesture: null, face: 'thinking' }, all)).toEqual({ L: 'chin', R: 'hangR', fallback: null });
    // her faces' arm poses as words of their own, under any face (托腮 with a happy face): a finger to her chin, a fist,
    // the notebook, fingertips together; standing, seated and walking alike, gone again before the gesture ends
    for (const [w, pose, R] of [['muse', 'chin', 'hangR'], ['fist', 'fist', 'hangR'], ['jot', 'write', 'write'], ['twiddle', 'shy', 'shy']]) {
      for (const mode of ['idle', 'sit', 'walk']) expect(armPlan({ mode, gesture: { kind: w, k: .5 }, face: 'happy' }, all), `${w} ${mode}`).toEqual({ L: pose, R, fallback: null });
      expect(armPlan({ mode: 'idle', gesture: { kind: w, k: .95 }, face: 'sad' }, all).L, w).not.toBe(pose);
    }
    expect(armPlan({ mode: 'idle', gesture: null, face: 'listening' }, all).L).toBe('write');
    expect(armPlan({ mode: 'idle', gesture: null, face: 'thinking', faceOK: false }, all)).toEqual(hang);
    expect(armPlan({ mode: 'walk', gesture: null, face: 'thinking' }, all)).toEqual(hang);
    // seated, the seated body's arms are hers while nothing else is asked of them; its torso goes beside them
    expect(sitOwnArms(hang)).toBe(true);
    expect(sitOwnArms({ L: 'wave', R: 'hangR' })).toBe(false);
    expect(SIT_BESIDE).toEqual(['torso']);
  });
  it('has a drawing (or the plain arms\' way) for every arm gesture, and asks only for drawings she has a place for', () => {
    const words = new Set(ALL_WORDS);
    for (const g of [...Object.keys(ARM_ONE), ...Object.keys(ARM_BOTH), ...GESTURES]) expect(words.has(g), g).toBe(true);
    for (const pose of [...Object.values(ARM_ONE), ...Object.values(ARM_BOTH)]) expect(ARM_FALLBACK[pose], pose).toBeTruthy();
    for (const pose of [...Object.values(ARM_ONE), ...Object.values(ARM_BOTH), ...Object.values(FACE_ARMS), ...Object.values(POSE_ALT).flat()]) expect(ARM_POSES, pose).toContain(pose);
    for (const f of Object.keys(FACE_ARMS)) expect(ALL_FACES, f).toContain(f);
    // the one-arm drawings are armL's; nothing is armR's alone (her other arm just hangs)
    expect(Object.keys(POSE_KIND).sort()).toEqual([...ONE_POSES].sort());
    expect(new Set(Object.values(POSE_KIND))).toEqual(new Set(['armL']));
    // and no drawing, stand-in or plain-arms way that nothing asks for
    const asked = new Set([...Object.values(ARM_ONE), ...Object.values(ARM_BOTH), ...Object.values(FACE_ARMS)]);
    for (const k of [...Object.keys(POSE_ALT), ...Object.keys(ARM_FALLBACK)]) expect(asked.has(k), k).toBe(true);
    for (const id of ARM_POSES) expect(asked.has(id), id).toBe(true);
  });
  it('builds every arm drawing on its own turn and hand warp, and the whole-body ones off the standing tree', () => {
    const R = buildRig(SYNTH);
    expect(R.unknownParents).toEqual([]);
    for (const id of ARM_POSES) {
      const A = R.ARM[id];
      expect(A, id).toBeTruthy();
      expect(A.kind, id).toBe(ONE_POSES.includes(id) ? 'armL' : 'both');
      expect(R.deformers[A.rot].parent, id).toBe(id === 'cover' ? 'neck' : 'waist');
      for (const p of A.parts) { expect(p.parent).toBe(A.lift); expect(R.STANDING[p.id]).toBe(true); }
    }
    for (const id of ['lie', 'kneel', 'sit', 'back', 'roll']) {
      for (const p of R.W[id].parts) {
        expect(R.STANDING[p.id], p.id).toBeUndefined();
        let d = p.parent;
        while (R.deformers[d].parent) d = R.deformers[d].parent;
        expect(['lie', 'kneel', 'body', 'rollBall'], p.id).toContain(d);
      }
    }
    // the knot's tassel swings on a warp under its turn; the brows show faintly through the fringe
    expect(R.parts.find(p => p.id === 'ornament').parent).toBe('tassel');
    expect(R.deformers.tassel).toMatchObject({ kind: 'warp', parent: 'ornament' });
    expect(R.parts.find(p => p.id === 'brows_through').z).toBeGreaterThan(R.parts.find(p => p.id === 'bangs').z);
    expect(R.parts.find(p => p.id === 'faceFx').parent).toBe('headFeat');
  });
  it('hangs her wings on her upper back and her tail from its root, on the model\'s pivots, with fallbacks', () => {
    const R = buildRig(SYNTH);
    expect(R.deformers.wingL).toEqual({ kind: 'rot', parent: 'waist', pivot: SYNTH.pivots.wingL });
    expect(R.deformers.wingR).toEqual({ kind: 'rot', parent: 'waist', pivot: SYNTH.pivots.wingR });
    expect(R.deformers.tailRot).toEqual({ kind: 'rot', parent: 'body', pivot: SYNTH.pivots.tail });
    expect(R.deformers.tail).toEqual({ kind: 'warp', parent: 'tailRot', rect: SYNTH.rects.tail });
    expect(R.parts.find(p => p.id === 'tail').parent).toBe('tail');
    // without the pivots and the rect: beside her spine between neck and waist, and over the tail part
    const { wingL, wingR, tail, ...pivots } = SYNTH.pivots, { tail: tr, ...rects } = SYNTH.rects;
    const B = buildRig({ ...SYNTH, pivots, rects });
    expect(B.unknownParents).toEqual([]);
    for (const d of ['wingL', 'wingR']) {
      expect(B.deformers[d].pivot[1]).toBeGreaterThan(pivots.neck[1]);
      expect(B.deformers[d].pivot[1]).toBeLessThan(pivots.waist[1]);
    }
    expect(B.deformers.tail.rect).toEqual(rectOf(SYNTH.parts.find(p => p.id === 'tail').box));
    // and a model without wings or a tail at all still has them, empty (her motion sets them every frame)
    const C = buildRig({ ...SYNTH, pivots, rects, parts: SYNTH.parts.filter(p => !/^wing|^tail/.test(p.id)) });
    expect(C.deformers.tail.rect).toHaveLength(4);
  });
});

describe('GPT-chan: wings and tail with her moods', () => {
  for (const [name, model] of [['every drawing', SYNTH], ['no drawings yet', BARE]]) {
    it(`spreads her wings glad, folds them low or asleep (${name})`, () => {
      const [calm, glad, sad, asleep] = [held(model, 'neutral'), held(model, 'happy'), held(model, 'sad'), held(model, 'neutral', { mode: 'sleep' })];
      expect(glad.lift).toBeGreaterThan(calm.lift + 2);
      expect(glad.sx).toBeGreaterThan(1.02);
      expect(sad.lift).toBeLessThan(calm.lift - 4);
      expect(sad.sx).toBeLessThan(.93);
      expect(asleep.sx).toBeLessThan(.92);
      expect(Math.abs(calm.lift)).toBeLessThan(1);
      expect(calm.sx).toBeCloseTo(1, 2);
    });
    it(`curls her tail up glad and lets it droop sad or asleep (${name})`, () => {
      const [calm, glad, sad, asleep] = [held(model, 'neutral'), held(model, 'excited'), held(model, 'sad'), held(model, 'neutral', { mode: 'sleep' })];
      expect(glad.tip).toBeLessThan(calm.tip - 3);
      expect(sad.root).toBeGreaterThan(calm.root + 3);
      expect(sad.tip).toBeGreaterThan(calm.tip + 3);
      expect(asleep.tip).toBeGreaterThan(calm.tip + 2);
    });
  }
  it('wags her tail more glad than calm, and only lazily at rest', () => {
    const spread = (face) => {
      const R = buildRig(SYNTH), motion = createMotion(SYNTH, R), caps = { pose: () => false, tex: () => true };
      const edge = [R.deformers.tail.rect[2], 200], ys = [];
      for (let i = 0; i < 360; i++) {
        const { st } = motion.step({}, { t: i / 60, mode: 'idle', face }, 1 / 60, caps);
        if (i >= 180) ys.push(pointOf(R.deformers, 'tail', st, ...edge)[1]);
      }
      return Math.max(...ys) - Math.min(...ys);
    };
    const calm = spread('neutral'), glad = spread('happy');
    expect(calm).toBeGreaterThan(.3);
    expect(glad).toBeGreaterThan(calm * 2);
  });
  it('jitters her wings flustered, buzzes them angry, each its own way', () => {
    const R = buildRig(SYNTH), motion = createMotion(SYNTH, R), caps = { pose: () => false, tex: () => true };
    const wiggle = face => {
      motion.reset();
      const d = [];
      let prev = null;
      for (let i = 0; i < 240; i++) {
        const { st } = motion.step({}, { t: i / 60, mode: 'idle', face }, 1 / 60, caps);
        if (prev != null && i > 120) d.push(Math.abs(st.wingL.a - prev));
        prev = st.wingL.a;
      }
      return mean(d);
    };
    const calm = wiggle('neutral');
    expect(wiggle('flustered')).toBeGreaterThan(calm * 5);
    expect(wiggle('angry')).toBeGreaterThan(calm * 5);
  });
  it('keeps the tail\'s root under the skirt, standing and seated', () => {
    const R = buildRig(SYNTH), motion = createMotion(SYNTH, R), caps = { pose: () => false, tex: () => true }, pv = R.deformers.tailRot.pivot;
    for (const [sit, low] of [[0, 0], [1, 29]]) {
      let out;
      for (let i = 0; i < 120; i++) out = motion.step({}, { t: i / 60, mode: sit ? 'sit' : 'idle', face: 'neutral', sit, low }, 1 / 60, caps);
      const a = pointOf(R.deformers, 'tail', out.st, ...pv), b = pointOf(R.deformers, 'skirt', out.st, ...pv);
      expect(a[0]).toBeCloseTo(b[0], 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
      if (sit) expect(a[1]).toBeGreaterThan(pv[1] + 10);
    }
  });
});

describe('GPT-chan: every word on the kit', () => {
  it("puts the kit's own marks by her head: the rain cloud and the dots beside it standing (her bulb spot), by the lying head lying", () => {
    const { fig } = stubFigure(SYNTH);
    const pet = barePet(fig);
    run(pet, 1);
    // the cloud's group and the dots' group: translate(x y) at the spot (the cloud bobs 2 units about 6 above it)
    const spot = (re) => { const m = pet.fxHtml().match(re); return m && [+m[1], +m[2]]; };
    const CLOUD = /<g opacity="[\d.]+" transform="translate\(([-\d.]+) ([-\d.]+)\)/, DOTS = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\([\d.]+\)" opacity="[\d.]+"><g fill="#fff"/;
    const near = (p, q, d) => expect(Math.hypot(p[0] - q.x, p[1] - q.y)).toBeLessThan(d);
    const [bx, by] = fig.anchors.bulb, S = pet.toStage(0, 1).y - pet.toStage(0, 0).y;
    pet.setExpr('gloomy');
    run(pet, .5);
    near(spot(CLOUD), pet.toStage(bx, by - 6), 3 * S);
    pet.setExpr('speechless');
    run(pet, 1);
    near(spot(DOTS), pet.toStage(bx, by), .5);
    pet.act('lie');
    run(pet, 2.5);
    expect(pet.pet.lieK).toBeGreaterThan(.95);
    const [lx, ly] = fig.anchors.lie.bubble;
    pet.setExpr('speechless');
    run(pet, 1);
    near(spot(DOTS), pet.toStage(lx + 62, ly + 28), .5);
  });
  for (const [name, model, can] of [['with every drawing', SYNTH, true], ['with no pose drawings or sprites', SYNTH, false], ['with none in the model', BARE, true]]) {
    it(`plays every word ${name}, every frame finite`, () => {
      for (const w of ALL_WORDS) {
        const { fig, seen } = stubFigure(model, can);
        const pet = barePet(fig);
        run(pet, .5);
        expect(pet.doWord(w), w).toBe(true);
        run(pet, 5);
        expect(seen.bad, w).toEqual([]);
        expect(seen.frames).toBeGreaterThan(300);
        // the gesture's own drawing came fully in
        const pose = ARM_ONE[w] || ARM_BOTH[w];
        if (pose) expect(seen.arms[pose] ?? 0, w).toBe(can && model === SYNTH ? 1 : 0);
      }
    });
  }
  it('makes every face, held a while, every frame finite', () => {
    for (const model of [SYNTH, BARE]) {
      const { fig, seen } = stubFigure(model);
      const pet = barePet(fig);
      for (const f of [...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS]) { expect(pet.doWord(f), f).toBe(true); run(pet, 1.5); }
      expect(seen.bad).toEqual([]);
    }
  });
  it('lets her arms hang standing, waves with armL while armR hangs, and takes both for a two-arm gesture', () => {
    const { fig, motion } = stubFigure(SYNTH);
    const pet = barePet(fig);
    run(pet, 1);
    expect(motion.arms).toEqual({ hangL: 1, hangR: 1 });
    pet.doWord('wave');
    run(pet, .7);
    expect(motion.arms.wave).toBeCloseTo(1);
    expect(motion.arms.hangR).toBeCloseTo(1);
    expect(motion.arms.hangL ?? 0).toBe(0);
    run(pet, 2);
    expect(motion.arms.hangL).toBeCloseTo(1);
    pet.doWord('read');
    run(pet, 1);
    expect(motion.arms.read).toBeCloseTo(1);
    expect(motion.arms.hangR ?? 0).toBe(0);
  });
  it('hangs her arms free without the drawings', () => {
    const { fig, motion } = stubFigure(SYNTH, false);
    const pet = barePet(fig);
    run(pet, 1);
    pet.doWord('cheer');
    run(pet, .8);
    expect(Object.keys(motion.arms).sort()).toEqual(['hangL', 'hangR']);
  });
});

describe('GPT-chan: faces', () => {
  const full = new Set(Object.keys(SYNTH.feat.sprites)), fullHas = n => full.has(n), noHas = () => false;
  const frame = (face, o = {}) => ({ look: [0, 0], t: .5, blink: 0, eyeClose: 0, talk: 0, talkShape: 0, face, ...o });
  const fcOf = f => (PLUS_FACES[f] ?? FACES[f]).f(.5, { exprAt: 0, exprUntil: 9, modeT: 1, drowse: 0 });
  it('knows a mouth and a mood for every face the kit and the plus body can make', () => {
    for (const f of ALL_FACES) { expect(MOUTHS[f], f).toBeTruthy(); expect(MOOD[f], f).toBeTruthy(); }
  });
  it('plans every face with the drawn sprites, and with strokes alone when none are there', () => {
    for (const f of ALL_FACES) {
      for (const [has, name] of [[fullHas, 'all'], [noHas, 'none']]) {
        const plan = planFace(fcOf(f), f, frame(f), .5, has);
        expect(plan.eyes, `${f} ${name}`).toHaveLength(2);
        for (const p of [...plan.eyes, plan.mouth]) {
          if (p.kind === 'sprite') expect(has(p.name), `${f} ${p.name}`).toBe(true);
          for (const v of Object.values(p)) if (typeof v === 'number') expect(Number.isFinite(v), `${f} ${name}`).toBe(true);
        }
      }
    }
  });
  it('only wobbles a drawn dizzy eye (its lashes and lid would spin with it), and spins the stroked spiral whole', () => {
    for (const rot of [0, 1, 2.5, 6, 40]) {
      const fc = { eyes: [{ shape: 'spiral', rot }, { shape: 'spiral', rot }] };
      const drawn = planFace(fc, 'dizzy', frame('dizzy'), .5, fullHas).eyes, stroked = planFace(fc, 'dizzy', frame('dizzy'), .5, noHas).eyes;
      for (const e of drawn) { expect(e.kind).toBe('sprite'); expect(Math.abs(e.rot)).toBeLessThanOrEqual(.12); }
      for (const e of stroked) { expect(e.kind).toBe('stroke'); expect(e.rot).toBeCloseTo(rot * .6); }
    }
  });
  it('draws every face into the texture without throwing, with eye drawings or none', () => {
    const base = Object.fromEntries(['eyeL', 'eyeR'].flatMap(k => ['lash', 'ball', 'iris', 'rim'].map(n => [`${k}_${n}`, { n: `${k}_${n}` }])));
    const allImg = { ...base, ...Object.fromEntries([...full].map(n => [n, { n }])) };
    for (const [model, imgs] of [[SYNTH, [allImg, base]], [BARE, [{}]]]) {
      const R = buildRig(model), painter = createFacePainter(model, { makeCanvas: recCanvas, rect: R.FACE });
      expect(R.FACE).toEqual(painter.rect);
      for (const f of ALL_FACES) {
        for (const img of imgs) {
          const c = recCanvas();
          painter.paint(c.ctx, img, { ...fcOf(f), blush: .5 }, f, frame(f, { talk: .5 }), .5);
          expect(c.log.some(([k]) => k === 'drawImage' || k === 'stroke' || k === 'fill'), f).toBe(true);
          for (const [k, a] of c.log) for (const v of a) if (typeof v === 'number') expect(Number.isFinite(v), `${f} ${k}`).toBe(true);
          // without the eye drawings nothing asks for their images
          if (model === BARE) expect(c.log.filter(([k]) => k === 'drawImage')).toEqual([]);
        }
      }
    }
  });
  it('puts a plain eye just over each of the kit\'s tear points', () => {
    const model = { ...BARE, anchors: { tears: [[111.6, 107.4], [144, 107.4]] } };
    const R = buildRig(model), painter = createFacePainter(model, { makeCanvas: recCanvas, rect: R.FACE });
    const c = recCanvas();
    painter.paint(c.ctx, {}, fcOf('neutral'), 'neutral', frame('neutral'), .5);
    const at = c.log.filter(([k]) => k === 'translate').map(([, a]) => [a[0] + R.FACE.x, a[1] + R.FACE.y]);
    const { X0, FEET, S } = model.units;
    for (const [x, y] of anchorsOf(model, R).tears) {
      const mx = X0 + (x - 128) / S, my = FEET - (256 - y) / S;
      expect(at.some(([ax, ay]) => Math.abs(ax - mx) < 1 && ay < my && ay > my - 30 / S), `${x}`).toBe(true);
    }
  });
  it('draws every effect at finite points', () => {
    const R = buildRig(SYNTH), P = fxPointsOf(SYNTH, R), id = (x, y) => [x, y];
    const fc = { orbit: true, listen: true, think: true, sweat: true, anger: true, bang: true, gloom: true, question: true, crack: .6 };
    const s = fxMarkup(fc, 1.3, { P, at: id, pt: (d, x, y) => [x, y], lying: false, steam: .8, steamAt: ['body', [128, 150]], puffK: .5, turn: [.3, .2] });
    expect(s).not.toMatch(/NaN|undefined/);
    expect((s.match(/<path|<circle|<g/g) || []).length).toBeGreaterThan(15);
  });
});

describe('GPT-chan: sitting and bowing', () => {
  it('raises the kit\'s points by what her head sinks less than the kit\'s 29', () => {
    expect(sitRaise(0, 22)).toBe(0);
    expect(sitRaise(1, 22)).toBeCloseTo(7);
    const A = { gaze: [128, 90], tear: [110, 100], tears: [[110, 100], [146, 100]], hearts: [90, 170, 50], bubble: [128, 16] };
    expect(sitAnchors(A, 0)).toBe(A);
    expect(sitAnchors(A, 5).tears[1]).toEqual([146, 95]);
  });
  it('bows deep: the upper body foreshortens and drops, the head drops further and pitches down', () => {
    expect(bowPose(0)).toEqual({ pitch: 0, neckTy: 0, neckSy: 1, neckSx: 1, waistSy: 1, waistSx: 1, waistTy: 0 });
    expect(bowPose(1).pitch).toBeGreaterThan(.9);
    expect(bowPose(2)).toEqual(bowPose(1));
  });
  it('hides only the standing parts the seated drawing says it draws itself (poses.sit.hides)', () => {
    const withTail = { ...SYNTH, poses: { ...SYNTH.poses, sit: { ...SYNTH.poses.sit, hides: ['tail'] } } };
    for (const [model, tailA] of [[SYNTH, 1], [withTail, 0]]) {
      const { fig, R, seen } = stubFigure(model);
      const pet = barePet(fig);
      const alpha = id => seen.last.st.alpha[id] ?? (R.STANDING[id] ? 1 : 0);
      run(pet, .5);
      pet.doWord('sit'); run(pet, 2);
      expect(alpha('sit_skirt')).toBe(1);
      expect(alpha('tail')).toBe(tailA);
      expect(alpha('skirt')).toBe(0);
      pet.doWord('stand'); run(pet, 4);
      expect(alpha('tail')).toBe(1);
    }
  });
  it('lets the standing tail go as the seated drawing\'s own comes, so the two never both show in the cut', () => {
    const model = { ...SYNTH, poses: { ...SYNTH.poses, sit: { ...SYNTH.poses.sit, hides: ['tail'] } } };
    const R = buildRig(model), motion = createMotion(model, R), caps = { pose: () => true, tex: () => true };
    // (on a fast screen the one-frame cut spans a few frames)
    let mixed = 0, t = 0;
    for (const sit of [1, 0]) {
      for (let i = 0; i < 240; i++) {
        const { st } = motion.step({}, { t: t += 1 / 240, mode: sit ? 'sit' : 'idle', sit }, 1 / 240, caps);
        const a = st.alpha.sit_skirt ?? 0;
        if (a > 0 && a < 1) mixed++;
        expect((st.alpha.tail ?? 1) + a).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(mixed).toBeGreaterThan(0);
  });
  it('keeps her shoes opaque while she sinks toward a drawing that hides them, and fades them only with none to come', () => {
    for (const [model, word] of [[SYNTH, 'sit'], [SYNTH, 'kneel'], [BARE, 'sit'], ...(real ? [[real, 'sit'], [real, 'kneel']] : [])]) {
      const { fig, seen } = stubFigure(model);
      const pet = barePet(fig);
      const alpha = id => seen.last.st.alpha[id] ?? 1;
      run(pet, .5);
      pet.doWord(word);
      const part = [];
      for (let i = 0; i < 120; i++) {
        run(pet, 1 / 60);
        const a = alpha('shoe_l');
        // (once a drawing is opaque over her the whole standing rig goes with it: hideFront)
        if (a > 0 && a < 1 && !seen.last.hideFront) part.push(a);
      }
      if (model === BARE) expect(alpha('shoe_l')).toBeLessThan(.05);
      else expect(part, `${word}`).toEqual([]);
    }
  });
  it.skipIf(!real)('on the real rig: the kit\'s points stay on her kneeling head while she gets up, and end seated after a sit word', () => {
    // her points as figure.js gives them to the kit: liveAnchors over anchorsOf, raised by her motion each frame
    const { fig, motion, R: RR, seen } = stubFigure(real);
    const base = anchorsOf(real, RR);
    Object.defineProperty(fig, 'anchors', { get: () => liveAnchors(base, motion.sitRaise) });
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? (RR.STANDING[id] ? 1 : 0);
    // how far the bubble's spot is below her standing one, in kit units (the kit's own transform undone)
    const sink = () => {
      const p = pet.anchor(), c = pet.pet.xf, r = c.rot * Math.PI / 180;
      return (-(p.x - c.AX) * Math.sin(r) + (p.y - c.AY) * Math.cos(r)) / c.ky + c.ay - base.bubble[1];
    };
    const kneelDrop = real.poses.kneel.headDrop;
    run(pet, 1);
    pet.doWord('kneel'); run(pet, 3);
    expect(alpha('kneel_body')).toBe(1);
    // kneeling they are on the drawing's head: raised once (hers), not twice (hers and a kneelRaise of the kit's)
    expect(fig.anchors.kneelRaise).toBe(0);
    expect(sink()).toBeCloseTo(kneelDrop, 0);
    // getting up the kit's kneel is off from the first frame, while she wakes (a second at sit 1) on the kneeling
    // drawing: the points stay on its head, and from there they only go up with her (never down toward the seated sink)
    pet.doWord('stand');
    let still = 0, off = 0, down = 0, shown = 0, last = sink();
    for (let i = 0; i < 4 * 60; i++) {
      run(pet, 1 / 60);
      const s = sink();
      down = Math.max(down, s - last);
      last = s;
      if (alpha('kneel_body') < 1) continue;
      shown++;
      if (pet.pet.sitK > .999) { still++; off = Math.max(off, Math.abs(s - kneelDrop)); }
    }
    expect(still).toBeGreaterThan(30);
    expect(shown).toBeGreaterThan(still);
    expect(off).toBeLessThan(.5);
    expect(down).toBeLessThan(.5);
    expect(sink()).toBeCloseTo(0, 0);
    // a sit word after a kneel: the kneeling drawing goes and they end at the seated body's sink
    pet.doWord('kneel'); run(pet, 3);
    pet.doWord('sit'); run(pet, 2);
    expect(alpha('kneel_body')).toBe(0);
    expect(alpha('sit_skirt')).toBe(1);
    expect(sink()).toBeCloseTo(real.poses.sit.headDrop, 0);
    expect(seen.bad).toEqual([]);
  });
  it.skipIf(!real)('from a kneel to sitting, the seated drawing sits at its own sink from its first frame, not floating', () => {
    const { fig, motion, seen } = stubFigure(real);
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? 0;
    run(pet, .5);
    pet.doWord('kneel'); run(pet, 3);
    expect(alpha('kneel_body')).toBe(1);
    // (the kneeling drawing's head sinks much less than the seated one's: 6 against 24)
    expect(real.poses.sit.headDrop - real.poses.kneel.headDrop).toBeGreaterThan(10);
    pet.doWord('sit');
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      run(pet, 1 / 60);
      if (alpha('sit_skirt') >= 1) worst = Math.max(worst, motion.sitRaise - sitRaise(1, real.poses.sit.headDrop));
    }
    expect(worst).toBeLessThan(.5);
  });
  it('gets up from kneeling on the kneeling drawing, never the seated one', () => {
    const { fig, seen } = stubFigure(SYNTH);
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? 0;
    run(pet, .5);
    pet.doWord('kneel'); run(pet, 3);
    expect(alpha('kneel_body')).toBe(1);
    pet.doWord('stand');
    for (let i = 0; i < 120; i++) { run(pet, 1 / 60); expect(alpha('sit_skirt')).toBe(0); }
    expect(alpha('kneel_body')).toBe(0);
    // and from kneeling to sitting the seated drawing does take over
    pet.doWord('kneel'); run(pet, 3);
    pet.doWord('sit'); run(pet, 2);
    expect(alpha('sit_skirt')).toBe(1);
  });
  it('sits on the seated drawing when there is one, and as the standing rig when not', () => {
    for (const model of [SYNTH, BARE]) {
      const { fig, seen } = stubFigure(model);
      const pet = barePet(fig);
      const alpha = id => seen.last.st.alpha[id] ?? 0;
      run(pet, .5);
      pet.doWord('sit'); run(pet, 2);
      expect(alpha('sit_skirt')).toBe(model === SYNTH ? 1 : 0);
      // (seated on the drawing, its bodice and arms stand in for her torso)
      if (model === SYNTH) expect(alpha('torso')).toBe(0);
      pet.doWord('stand'); run(pet, 4);
      expect(alpha('sit_skirt')).toBe(0);
      expect(seen.bad).toEqual([]);
    }
  });
});

/* ---------- the real model and its files ---------- */
describe.skipIf(!real)('GPT-chan: model.json and its files', () => {
  const R = real && buildRig(real);
  const texOk = (url, w, h, what) => {
    expect(existsSync(url), what).toBe(true);
    const p = png(url);
    expect(p.colorType, `${what} is RGBA`).toBe(6);
    expect(Math.abs(p.w - w), `${what} width ${p.w} vs ${w}`).toBeLessThanOrEqual(2);
    expect(Math.abs(p.h - h), `${what} height ${p.h} vs ${h}`).toBeLessThanOrEqual(2);
  };
  const K = real ? real.units.DS / real.units.S : 1;
  const z = id => real.parts.find(p => p.id === id)?.z;
  it('hangs every part from a deformer the figure defines, in a sensible order', () => {
    expect(R.unknownParents).toEqual([]);
    for (const id of ['wing_l', 'wing_r', 'horns', 'hair_back', 'tail', 'skirt', 'torso', 'face', 'bangs', 'ornament']) expect(z(id), id).toBeTypeOf('number');
    // the wings behind everything, the horns behind the hair over them, the tail out from behind the skirt
    for (const w of ['wing_l', 'wing_r']) expect(z(w)).toBeLessThan(z('hair_back'));
    expect(z('horns')).toBeLessThan(z('face'));
    expect(z('tail')).toBeLessThan(z('skirt'));
    expect(z('hair_back')).toBeLessThan(z('face'));
    expect(z('face')).toBeLessThan(z('bangs'));
    expect(z('bangs')).toBeLessThan(z('ornament'));
    if (z('shoe_l') != null) expect(z('shoe_l')).toBeLessThan(z('skirt'));
    const parent = id => real.parts.find(p => p.id === id).parent;
    expect([parent('wing_l'), parent('wing_r'), parent('tail'), parent('horns')]).toEqual(['wingL', 'wingR', 'tail', 'headBack']);
    expect(real.parts.map(p => p.id)).not.toContain('capelet');
  });
  it('has every part texture, RGBA, sized to its box', () => {
    for (const p of real.parts) texOk(new URL(`tex/${p.tex}.png`, DIR), p.box[2] * K, p.box[3] * K, p.tex);
  });
  it('ships exactly the files model.json names under tex/ and feat/ (none missing, none left over)', () => {
    // the pack export copies the whole folder: a stale drawing would ship too
    const tex = new Set(real.parts.map(p => p.tex));
    const walk = o => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') { if (typeof o.tex === 'string') tex.add(o.tex); Object.values(o).forEach(walk); }
    };
    walk(real.poses);
    const feat = new Set(Object.keys(real.feat?.sprites || {}));
    for (const [e, f] of Object.entries(real.feat?.eyes || {})) for (const n of ['lash', 'ball', 'iris', 'rim']) if (f[n]) feat.add(`${e}_${n}`);
    const files = d => (existsSync(new URL(`${d}/`, DIR)) ? readdirSync(new URL(`${d}/`, DIR)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort() : []);
    expect(files('tex')).toEqual([...tex].sort());
    expect(files('feat')).toEqual([...feat].sort());
  });
  it('keeps her pivots mirrored about her middle, wings and tail where they hang from, every point inside the view', () => {
    const PV = real.pivots, mid = PV.head?.[0] ?? 128, view = real.view;
    for (const [l, r] of [['armL', 'armR'], ['footL', 'footR'], ['wingL', 'wingR']]) {
      expect(Math.abs((PV[l][0] + PV[r][0]) / 2 - mid), `${l}/${r}`).toBeLessThan(5);
      expect(Math.abs(PV[l][1] - PV[r][1]), `${l}/${r}`).toBeLessThan(5);
    }
    expect(PV.head[1]).toBeLessThan(PV.neck[1]);
    expect(PV.neck[1]).toBeLessThan(PV.waist[1]);
    for (const [k, p] of Object.entries(PV)) expect(inside(p, view), k).toBe(true);
    // each wing turns about its root on her back: the inner end of its drawing, between her neck and waist
    for (const [w, part] of [['wingL', 'wing_l'], ['wingR', 'wing_r']]) {
      const b = rectOf(real.parts.find(p => p.id === part).box);
      expect(inside(PV[w], b, 6), w).toBe(true);
      expect(Math.abs(PV[w][0] - mid)).toBeLessThan(15);
      expect(PV[w][1] > PV.neck[1] && PV[w][1] < PV.waist[1], w).toBe(true);
    }
    // the tail's root is hidden under the skirt, its warp over the whole tail drawing
    expect(inside(PV.tail, rectOf(real.parts.find(p => p.id === 'skirt').box)), 'tail root under the skirt').toBe(true);
    expect(R.deformers.tail.rect).toEqual(real.rects.tail);
    expect(real.rects.tail).toEqual(rectOf(real.parts.find(p => p.id === 'tail').box).map(v => Math.round(v * 10) / 10));
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
    for (const [n, b] of Object.entries(feat.sprites || {})) {
      texOk(new URL(`feat/${n}.png`, DIR), b[2] - b[0], b[3] - b[1], n);
      expect(inside([b[0], b[1]], face, 2) && inside([b[2], b[3]], face, 2), `${n} on the face`).toBe(true);
    }
    for (const k of ['cheeks', 'mouth']) expect(F[k], k).toBeTruthy();
  });
  it.skipIf(!realPoses.length)('has every pose file, RGBA, sized to its box, its pivot and hand on the drawing', () => {
    for (const id of realPoses) {
      const pose = real.poses[id];
      for (const p of [...pose.required, ...(pose.overlays || []), ...(pose.face?.parts || [])]) texOk(new URL(`tex/${p.tex}.png`, DIR), p.box[2] * K, p.box[3] * K, `${id} ${p.tex}`);
      const A = R.ARM[id];
      if (!A) continue;
      expect(ARM_POSES, id).toContain(id);
      expect(A.kind, id).toBe(ONE_POSES.includes(id) ? 'armL' : 'both');
      expect(inside(A.pivot, A.rect, 12), `${id} pivot`).toBe(true);
      expect(inside(A.wrist, A.rect, 4), `${id} wrist`).toBe(true);
    }
  });
  it('plays every word on the real rig, every frame finite', () => {
    for (const w of ALL_WORDS) {
      const { fig, seen } = stubFigure(real);
      const pet = barePet(fig);
      run(pet, .3);
      expect(pet.doWord(w), w).toBe(true);
      run(pet, 4);
      expect(seen.bad, w).toEqual([]);
      const pose = ARM_ONE[w] || ARM_BOTH[w];
      if (pose && realArmPoses.includes(pose)) expect(seen.arms[pose] ?? 0, w).toBe(1);
    }
  });
  it('moves her wings and tail with her moods on the real rig', () => {
    const [calm, glad, sad] = [held(real, 'neutral'), held(real, 'happy'), held(real, 'sad')];
    expect(glad.lift).toBeGreaterThan(calm.lift + 2);
    expect(sad.sx).toBeLessThan(.93);
    expect(sad.tip).toBeGreaterThan(calm.tip + 3);
    expect(glad.tip).toBeLessThan(calm.tip);
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
    const A = anchorsOf(real, R);
    expect(A.lie.hit).toEqual(L.anchors.hit);
    // kneeling: her head no lower than the kit's seated sink
    expect(P.kneel.headDrop).toBeGreaterThan(0);
    expect(P.kneel.headDrop).toBeLessThanOrEqual(SIT_LOW);
    expect(A.kneelRaise).toBeCloseTo(SIT_LOW - P.kneel.headDrop, 1);
    expect(P.kneel.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
    // the ball rolls on its edge: a support sample every 5°, touching the floor; 'around' is its own perimeter
    expect(P.roll.support).toHaveLength(72);
    const rb = P.roll.required[0].box;
    for (const v of P.roll.support) expect(v > 0 && v <= Math.max(rb[2], rb[3]) * .6).toBe(true);
    expect(P.roll.pivots.rollBall[1] + P.roll.support[0]).toBeCloseTo(256, 0);
    expect(P.roll.around).toBeGreaterThan(Math.PI * Math.min(rb[2], rb[3]) * .95);
    expect(P.roll.around).toBeLessThan(Math.PI * Math.max(rb[2], rb[3]) * 1.05);
    // her back: the body on the flip, the hair on its warp over it, and her wings, horns, flower and tail over the hair,
    // on the flip again (they stay put while the hair sways under them)
    expect(P.back.pivots.backFlip).toEqual([128, 256]);
    const bp = Object.fromEntries(P.back.required.map(p => [p.id, p]));
    expect(Object.keys(bp).sort()).toEqual(['back_body', 'back_hair', 'back_top']);
    expect([bp.back_body.parent, bp.back_hair.parent, bp.back_top.parent]).toEqual(['backFlip', 'backHair', 'backFlip']);
    expect(R.W.back.parts.map(p => p.parent)).toEqual(P.back.required.map(p => p.parent));
    expect(bp.back_body.z).toBeLessThan(bp.back_hair.z);
    expect(bp.back_hair.z).toBeLessThan(bp.back_top.z);
    expect(R.deformers.backHair.rect).toEqual(P.back.rects.hair);
    // seated: the body on its own deformers, the head sunk a sane amount; the drawing has her tail, so the standing one goes
    expect(P.sit.headDrop).toBeGreaterThan(10);
    expect(P.sit.headDrop).toBeLessThanOrEqual(SIT_LOW);
    for (const p of P.sit.required) expect(['sitTop', 'sitBase'], p.id).toContain(p.parent);
    for (const id of P.sit.hides || []) expect(real.parts.map(p => p.id), id).toContain(id);
    expect(R.W.sit.hides).toEqual(P.sit.hides || []);
  });
  it('lies, kneels, sits and rolls with her drawings on the real rig', () => {
    const { fig, motion, R: RR, seen } = stubFigure(real);
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? (RR.STANDING[id] ? 1 : 0);
    run(pet, .5);
    pet.doWord('lie'); run(pet, 3);
    expect(motion.lieK).toBeGreaterThan(.95);
    expect(alpha('lie_body')).toBe(1);
    expect(seen.last.hideFront).toBe(true);
    pet.doWord('stand'); run(pet, 4);
    pet.doWord('kneel');
    for (let i = 0; i < 180; i++) { run(pet, 1 / 60); expect(alpha('sit_skirt')).toBe(0); }
    expect(alpha('kneel_body')).toBe(1);
    pet.doWord('sit'); run(pet, 2);
    expect(alpha('kneel_body')).toBe(0);
    expect(alpha('sit_skirt')).toBe(1);
    // her seated drawing has her tail: the standing one is gone (with the skirt and shoes), the wings stay
    for (const id of real.poses.sit.hides || []) expect(alpha(id), id).toBe(0);
    expect(alpha('skirt')).toBe(0);
    expect(alpha('wing_l')).toBe(1);
    pet.doWord('stand'); run(pet, 4);
    expect(alpha('sit_skirt')).toBe(0);
    expect(alpha('tail')).toBe(1);
    pet.doWord('roll');
    let ball = 0;
    for (let i = 0; i < 90; i++) { run(pet, 1 / 60); ball = Math.max(ball, alpha('roll_ball')); }
    expect(ball).toBe(1);
    expect(seen.bad).toEqual([]);
  });
  it('keeps the tips of her long hair above the floor seated (they would hang out under the pool)', () => {
    const { fig, R: RR, seen } = stubFigure(real);
    const pet = barePet(fig);
    const lowest = () => {
      const [x0, , x1, y1] = RR.deformers.hairSway.rect;
      let m = -Infinity;
      for (let x = x0; x <= x1; x += 4) m = Math.max(m, pointOf(RR.deformers, 'hairSway', seen.last.st, x, y1)[1]);
      return m;
    };
    run(pet, 1);
    const standing = lowest();
    pet.doWord('sit');
    let worst = 0;
    for (let i = 0; i < 150; i++) { run(pet, 1 / 60); worst = Math.max(worst, lowest()); }
    expect(standing, "standing").toBeLessThan(256);
    expect(worst, "seated").toBeLessThan(256);
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
    expect(['back_body', 'back_hair', 'back_top'].map(alpha)).toEqual([1, 1, 1]);
    // the back hair sways from the nape under the top layer; her body and the top layer (on the flip) stay put
    expect(seen.last.st.backHair.fn(.5, 0).map(Math.abs)).toEqual([0, 0]);
    expect(seen.last.st.backFlip.a ?? 0).toBe(0);
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
  it('cuts her back drawings clean: no stray specks off them, no pinholes the swaying hair would open', () => {
    // the back is cut from a dark-glow picture along its segmentation map; a cut along the map's (stepped, a few px off)
    // edge leaves bits of her outline as specks, and the map's line-join dots as 'flower' punch holes in hair and body
    for (const tex of ['back_body', 'back_hair', 'back_top']) {
      const t = alphaOf(new URL(`tex/${tex}.png`, DIR)), a = t.a;
      const specks = regions(t, i => a[i] >= 128).filter(r => r.n < 50).length;
      const holes = regions(t, i => a[i] < 128, false).filter(r => !r.edge && r.n < 200).length;
      expect(specks + holes, `${tex}: ${specks} specks, ${holes} pinholes`).toBeLessThanOrEqual(3);
    }
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
  it('bows on the real rig: her head drops a good way while the skirt stays', () => {
    const { fig, R: RR, seen } = stubFigure(real);
    const pet = barePet(fig);
    const chin = () => pointOf(RR.deformers, 'headMid', seen.last.st, 128, RR.HEAD[3] - 20)[1];
    const hem = () => pointOf(RR.deformers, 'skirt', seen.last.st, 128, RR.SKIRT[3])[1];
    run(pet, 1);
    const [c0, h0] = [chin(), hem()];
    pet.doWord('bow');
    let deep = 0;
    for (let i = 0; i < 96; i++) { run(pet, 1 / 60); deep = Math.max(deep, chin() - c0); expect(Math.abs(hem() - h0)).toBeLessThan(1); }
    expect(deep).toBeGreaterThan(12);
    expect(seen.bad).toEqual([]);
  });
});

/* ---------- the figure itself, on a stand-in page ---------- */
describe.skipIf(!real)('GPT-chan: the figure', () => {
  const make = async (missing = [], model = real) => {
    const doc = globalThis.document, loaded = [];
    globalThis.document = { createElement: () => recCanvas(), createElementNS: () => recCanvas() };
    try {
      const fig = await createGptFigure(DIR, {
        model, asset: p => String(p),
        loadImage: url => { loaded.push(String(url)); return missing.some(n => String(url).endsWith(`tex/${n}.png`)) ? Promise.reject(new Error('missing')) : Promise.resolve({ url }); },
      });
      return { fig, loaded };
    } finally { globalThis.document = doc; }
  };
  it('builds from her model.json as it is, loading every part texture and only the face files it names', async () => {
    const { fig, loaded } = await make();
    for (const p of real.parts) expect(loaded).toContain(`tex/${p.tex}.png`);
    if (!realFeat) expect(loaded.filter(u => u.startsWith('feat/'))).toEqual(Object.keys(real.feat?.sprites ?? {}).map(n => `feat/${n}.png`));
    expect(fig.schemes.map(s => s.id)).toEqual(['original']);
    expect(fig.colors).toEqual({ z: '#7A8FA8' });
    expect(fig.gestures).toEqual(expect.arrayContaining(['wave', 'cheer', 'read', 'curtsy']));
    expect(fig.poses).toEqual({ lie: !!real.poses?.lie?.required?.length, back: true });
    expect(fig.roll).toBe(real.poses?.roll?.required?.length ? undefined : 'spin');
    expect(fig.gestures.includes('roll')).toBe(!!real.poses?.roll?.required?.length);
    expect(fig.anchors.gaze).toHaveLength(2);
    expect(fig.extent).toHaveLength(4);
  });
  it('builds without the eye drawings and without the pose drawings too', async () => {
    const { fig, loaded } = await make([], { ...real, feat: {}, poses: {} });
    expect(loaded.filter(u => u.startsWith('feat/'))).toEqual([]);
    expect(fig.poses).toEqual({ lie: false, back: true });
    expect(fig.roll).toBe('spin');
  });
  it('stays seated without the lying drawing, and the kit spins her without the ball', async () => {
    const { fig } = await make(['lie_body', 'roll_ball']);
    expect(fig.poses).toEqual({ lie: false, back: true });
    expect(fig.roll).toBe('spin');
    expect(fig.gestures).not.toContain('roll');
  });
});

describe('GPT-chan: a head gesture beside the arms\' one, kneeling, and faces made of others', () => {
  const R0 = buildRig(real);
  const caps = { pose: id => !!R0.ARM[id] || !!R0.W[id], tex: () => true };
  const sprites = new Set(Object.keys(real.feat?.sprites || {})), has = n => sprites.has(n);
  /** A still frame of the kit's, standing, with `x` over it. */
  const frame = (x = {}) => ({ t: 1, mode: 'idle', face: 'neutral', look: [0, 0], legs: [[104, 212, 104, 241], [150, 212, 150, 241]], low: 0, sit: 0, tilt: 0, lean: 0, facing: 1, swing: 0, gesture: null, ...x });
  /** One frame on a fresh motion. */
  const once = (o, fc = FACES[o.face]?.f(0) ?? FACES.neutral.f(0)) => createMotion(real, R0).step(fc, o, 1 / 60, caps);
  /** The pet with the figure on it, keeping the last frame's face and frame. */
  function watched(opts = {}) {
    const s = stubFigure(real), draw = s.fig.draw, seen = { ...s, fc: null, o: null };
    s.fig.draw = (g, fc, o) => { seen.fc = fc; seen.o = o; draw(g, fc, o); };
    seen.pet = barePet(s.fig, opts);
    return seen;
  }

  it('plays a nod on its own clock beside a wave: the arms wave at the wave\'s k, the head nods at the nod\'s', () => {
    const both = once(frame({ gesture: { kind: 'wave', k: .2 }, head: { kind: 'nod', k: .6 } }));
    const arms = once(frame({ gesture: { kind: 'wave', k: .2 }, head: null }));
    const nod = headMoves({ kind: 'nod', k: .6 }).nod;
    expect(nod).toBeCloseTo(Math.sin(1.2 * Math.PI) ** 2 * (1 - .3 * .6), 9);
    expect(both.plan).toEqual(arms.plan);
    expect(both.plan.L).toBe('wave');
    expect(both.turn[1] - arms.turn[1]).toBeCloseTo(.9 * nod, 6);
    expect(both.st.neck.ty - arms.st.neck.ty).toBeCloseTo(2 * nod, 6);
    expect(gesturesOf({ gesture: { kind: 'wave', k: .2 }, head: { kind: 'nod', k: .6 } })).toEqual({ arm: { kind: 'wave', k: .2 }, head: { kind: 'nod', k: .6 } });
  });

  it('takes a nod, a shake, a sigh, a tilt or a droop from the gesture when the kit has no head channel (upstream\'s), as before it had one', () => {
    const still = once(frame());
    for (const kind of ['nod', 'shake', 'sigh', 'tilt', 'droop']) {
      for (const k of [.15, .4, .6, .85]) {
        const old = once(frame({ gesture: { kind, k } })), now = once(frame({ head: { kind, k } }));
        expect(now.turn, `${kind} ${k}`).toEqual(old.turn);
        expect(now.st.neck, `${kind} ${k}`).toEqual(old.st.neck);
        expect(now.st.waist, `${kind} ${k}`).toEqual(old.st.waist);
        expect(now.puffK, `${kind} ${k}`).toBe(old.puffK);
        expect(old.plan, `${kind} ${k}`).toEqual(still.plan);
      }
    }
    expect(once(frame({ head: { kind: 'nod', k: .25 } })).turn[1]).not.toBe(still.turn[1]);
    // v0.2.6's formulas, unchanged
    const m = headMoves({ kind: 'sigh', k: .5 });
    expect(m.inh).toBeCloseTo(0, 9);
    expect(m.exh).toBeCloseTo(.84375, 9);
    expect(m.puffK).toBeCloseTo(.12 / .45, 9);
    expect(headMoves({ kind: 'shake', k: .3 }).shake).toBeCloseTo(Math.sin(1.8 * Math.PI) * .7, 9);
    expect(headMoves(null)).toEqual({ nod: 0, shake: 0, inh: 0, exh: 0, puffK: 0, tilt: 0, down: 0 });
  });

  it('sings under an asked-for face with the song\'s body: pray hands, chin up, the singing mouth on the beat, the asked eyes', () => {
    const w = watched();
    run(w.pet, 1);
    w.pet.setExpr('angry');
    expect(w.pet.act('song')).toBe(true);
    let mouths = new Set();
    for (let i = 0; i < 90; i++) {
      run(w.pet, 1 / 60);
      mouths.add(planFace(w.fc, w.o.face, w.o, w.o.t, has).mouth.name);
    }
    expect(w.o.face).toBe('angry+singing+singing');
    expect(w.seen.last.plan).toMatchObject({ L: 'pray', R: 'pray' });
    expect(w.motion.arms.pray).toBeCloseTo(1);
    expect(planFace(w.fc, w.o.face, w.o, w.o.t, has).eyes.map(e => e.name)).toEqual(['angry_eyeL', 'angry_eyeR']);
    expect(mouths.has('mouth_u')).toBe(true);
    // the song's chin up: the same frame as a plain angry face pitches the head by HEAD_PITCH.singing
    const plain = once({ ...w.o, face: 'angry' }, { ...w.fc, parts: undefined }), mixed = once(w.o, w.fc);
    expect(mixed.turn[1] - plain.turn[1]).toBeCloseTo(HEAD_PITCH.singing, 6);
  });

  it('nods, shakes and sighs kneeling: the kneeling drawing\'s head moves, its sides and bottom and the knees stay', () => {
    const w = watched(), R = w.R;
    expect(R.W.kneel.parts.every(p => p.parent === 'kneelHead')).toBe(true);
    const [x0, y0, x1, y1] = R.deformers.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    /** How far the head's warp moves rest point (x, y) this frame. */
    const off = (x, y) => {
      const st = w.seen.last.st, a = pointOf(R.deformers, 'kneelHead', st, x, y), b = pointOf(R.deformers, 'kneelHead', { ...st, kneelHead: null }, x, y);
      return [a[0] - b[0], a[1] - b[1]];
    };
    const still = () => { for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1], [cx, 236]]) for (const d of off(x, y)) expect(Math.abs(d)).toBeLessThan(1e-9); };
    run(w.pet, .5);
    w.pet.doWord('kneel'); run(w.pet, 3);
    expect(w.seen.last.st.alpha.kneel_body).toBe(1);
    expect(off(cx, cy)).toEqual([0, 0]);
    w.pet.doWord('nod'); run(w.pet, .17);
    expect(w.o.kneel).toBe(true);
    expect(w.o.head.kind).toBe('nod');
    expect(off(cx, cy)[1]).toBeGreaterThan(3);
    expect(Math.abs(off(cx, cy)[0])).toBeLessThan(1e-9);
    // (the top of the head goes down further than the middle: it squashes toward the chin)
    expect(off(cx, y0 + 4)[1]).toBeGreaterThan(off(cx, cy)[1]);
    still();
    run(w.pet, 1);
    w.pet.doWord('shake'); run(w.pet, .08);
    expect(Math.abs(off(cx, cy)[0])).toBeGreaterThan(2);
    expect(Math.abs(off(cx, cy)[1])).toBeLessThan(1e-9);
    still();
    run(w.pet, 1);
    w.pet.doWord('sigh'); run(w.pet, .5);
    expect(off(cx, cy)[1]).toBeLessThan(-1);
    run(w.pet, .7);
    expect(off(cx, cy)[1]).toBeGreaterThan(1.5);
    still();
    expect(w.o.kneel).toBe(true);
    expect(w.seen.bad).toEqual([]);
    // (the field alone: nothing at the edges, all of a nod at the middle)
    const f = kneelHeadField([0, 0, 100, 100], { nod: 1 });
    expect(f(.5, .5, 50, 50)).toEqual([0, KNEEL_HEAD.nod + KNEEL_HEAD.squash * 50]);
    expect(f(0, .5, 0, 50)).toEqual([0, 0]);
    expect(f(1, .5, 100, 50)).toEqual([0, 0]);
    expect(f(.5, 1, 50, 100)).toEqual([0, 0]);
  });

  it('tilts her head curiously (歪头) standing, seated, kneeling and lying: over to one side, held about 1.2 s, back', () => {
    // (her idle glances, at random, move her head by up to ±2.5°: here she looks straight ahead)
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched(), R = w.R;
      const neck = () => w.seen.last.st.neck.a;
      /** The neck's angle over `s` seconds, averaged (her idle sway is ±1.2°). */
      const mean = s => { let a = 0, n = 0; for (let i = 0; i < s * 60; i++) { run(w.pet, 1 / 60); a += neck(); n++; } return a / n; };
      run(w.pet, 1);
      const rest = mean(.4);
      expect(w.pet.doWord('tilt')).toBe(true);
      run(w.pet, .5);
      expect(w.o.head).toMatchObject({ kind: 'tilt' });
      expect(w.o.gesture).toBe(null);
      // over toward +x (a plain face leans neither way), held
      expect(mean(.6) - rest).toBeGreaterThan(TILT_DEG * .8);
      run(w.pet, 1.2);
      expect(w.o.head).toBe(null);
      expect(Math.abs(mean(.4) - rest)).toBeLessThan(TILT_DEG * .4);
      // with a face that leans the other way (confused), the tilt goes that way, to the same TILT_DEG in all
      w.pet.setExpr('confused', 4); run(w.pet, 1);
      const leaning = mean(.3);
      w.pet.doWord('tilt'); run(w.pet, .5);
      expect(mean(.6)).toBeLessThan(Math.min(leaning, rest) - 4);
      expect(mean(.3) - rest).toBeLessThan(-TILT_DEG * .8);
      run(w.pet, 1.5);
      w.pet.setExpr('neutral', .1); run(w.pet, 1);
      // beside a wave: the arms wave, the head tilts
      expect(w.pet.doGroup(['wave', 'tilt'])).toEqual([true, true]);
      run(w.pet, .5);
      expect(w.o.gesture?.kind).toBe('wave');
      expect(w.o.head?.kind).toBe('tilt');
      expect(neck() - rest).toBeGreaterThan(5);
      run(w.pet, 2);
      // seated
      w.pet.doWord('sit'); run(w.pet, 2.5);
      const seated = mean(.4);
      w.pet.doWord('tilt'); run(w.pet, .5);
      expect(w.o.mode).toBe('sit');
      expect(mean(.6) - seated).toBeGreaterThan(TILT_DEG * .8);
      run(w.pet, 1.5);
      // kneeling: the kneeling drawing's head turns about the chin, its sides and bottom stay
      const [x0, y0, x1, y1] = R.deformers.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const off = (d, x, y) => {
        const st = w.seen.last.st, a = pointOf(R.deformers, d, st, x, y), b = pointOf(R.deformers, d, { ...st, [d]: null }, x, y);
        return [a[0] - b[0], a[1] - b[1]];
      };
      w.pet.doWord('kneel'); run(w.pet, 3);
      expect(w.seen.last.st.alpha.kneel_body).toBe(1);
      w.pet.doWord('tilt'); run(w.pet, .8);
      expect(w.o.kneel).toBe(true);
      expect(w.o.head?.kind).toBe('tilt');
      // (the top of the head goes over to +x, more than the middle)
      expect(off('kneelHead', cx, y0 + 6)[0]).toBeGreaterThan(5);
      expect(off('kneelHead', cx, y0 + 6)[0]).toBeGreaterThan(off('kneelHead', cx, cy)[0]);
      for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1]]) for (const d of off('kneelHead', x, y)) expect(Math.abs(d)).toBeLessThan(1e-9);
      run(w.pet, 1.5);
      expect(w.o.kneel).toBe(true);
      expect(Math.hypot(...off('kneelHead', cx, y0 + 6))).toBeLessThan(1e-9);
      // lying: the head turns about the chin on her hands
      w.pet.doWord('lie'); run(w.pet, 3);
      expect(w.o.lie).toBeCloseTo(1, 3);
      const L = real.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const lyingTop = () => w.seen.last.st.lieHead.fn(.5, .1, ...top);
      const before = lyingTop();
      w.pet.doWord('tilt'); run(w.pet, .8);
      expect(w.o.head?.kind).toBe('tilt');
      expect(Math.abs(lyingTop()[0] - before[0])).toBeGreaterThan(3);
      expect(w.seen.bad).toEqual([]);
      // (the field alone: a full tilt turns the top of the rect over, the middle of its bottom edge stays)
      const f = kneelHeadField([0, 0, 100, 100], { tilt: 1 }), a = KNEEL_HEAD.tilt * Math.PI / 180;
      expect(f(.5, .3, 50, 30)[0]).toBeCloseTo(a * 70, 9);
      expect(f(.5, .3, 50, 30)[1]).toBeCloseTo(0, 9);
      expect(f(.5, 1, 50, 100)).toEqual([0, 0]);
      expect(headMoves({ kind: 'tilt', k: .5 }).tilt).toBe(1);
      expect(headMoves({ kind: 'tilt', k: 0 }).tilt).toBe(0);
      expect(headMoves({ kind: 'tilt', k: 1 }).tilt).toBe(0);
    } finally { rand.mockRestore(); }
  });

  it('kneeling and lying, a head gesture cutting a held tilt short brings her head back over a few frames, not in one', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched(), R = w.R;
      const [x0, y0, x1] = R.deformers.kneelHead.rect, cx = (x0 + x1) / 2;
      // (x only: a nod and a sigh move the kneeling head up and down, a tilt turns it over)
      const kneelTop = () => {
        const st = w.seen.last.st;
        return pointOf(R.deformers, 'kneelHead', st, cx, y0 + 6)[0] - pointOf(R.deformers, 'kneelHead', { ...st, kneelHead: null }, cx, y0 + 6)[0];
      };
      const L = real.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const lieTop = () => w.seen.last.st.lieHead.fn(.5, .1, ...top)[0];
      /** The largest move of `at` in one frame over `s` seconds. */
      const steepest = (at, s) => { let p = at(), m = 0; for (let i = 0; i < s * 60; i++) { run(w.pet, 1 / 60); const v = at(); m = Math.max(m, Math.abs(v - p)); p = v; } return m; };
      run(w.pet, 1);
      w.pet.doWord('kneel'); run(w.pet, 3);
      // a tilt from rest, over and back, at its fastest
      w.pet.doWord('tilt');
      const fresh = steepest(kneelTop, 2.2);
      expect(fresh).toBeGreaterThan(.3);
      for (const second of ['tilt', 'nod', 'sigh']) {
        w.pet.doWord('tilt'); run(w.pet, .8);
        expect(w.o.head?.kind).toBe('tilt');
        expect(kneelTop()).toBeGreaterThan(5);
        expect(w.pet.doWord(second)).toBe(true);
        expect(steepest(kneelTop, .4)).toBeLessThan(fresh * 1.5);
        expect(w.o.kneel).toBe(true);
        run(w.pet, 3);
        expect(Math.abs(kneelTop())).toBeLessThan(1e-9);
      }
      // lying, another tilt
      w.pet.doWord('lie'); run(w.pet, 3);
      expect(w.o.lie).toBeCloseTo(1, 3);
      w.pet.doWord('tilt');
      const lieFresh = steepest(lieTop, 2.2);
      w.pet.doWord('tilt'); run(w.pet, .8);
      w.pet.doWord('tilt');
      expect(steepest(lieTop, .4)).toBeLessThan(lieFresh * 1.5);
      expect(w.seen.bad).toEqual([]);
      // (tiltEased: it follows a tilt over and back, and lets a cut one back at TILT_BACK)
      expect(tiltEased(.4, .6, 1 / 60)).toBe(.6);
      expect(tiltEased(.6, .55, 1 / 60)).toBe(.55);
      expect(tiltEased(1, 0, 1 / 60)).toBeCloseTo(1 - TILT_BACK / 60, 12);
      expect(tiltEased(-1, 0, 1 / 60)).toBeCloseTo(-1 + TILT_BACK / 60, 12);
      expect(tiltEased(0, 0, 1 / 60)).toBe(0);
    } finally { rand.mockRestore(); }
  });

  it('droops her head (低头) standing, seated, kneeling and lying, held and back, and a nod cutting it short eases it back', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched(), R = w.R;
      const pitch = () => w.seen.last.turn[1];
      const mean = (at, s) => { let a = 0, n = 0; for (let i = 0; i < s * 60; i++) { run(w.pet, 1 / 60); a += at(); n++; } return a / n; };
      run(w.pet, 1);
      const rest = mean(pitch, .3);
      expect(w.pet.doWord('droop')).toBe(true);
      run(w.pet, .5);
      expect(w.o.head).toMatchObject({ kind: 'droop' });
      expect(w.o.gesture).toBe(null);
      // the face pitches down (and the eyes look down with it), held, then back
      expect(mean(pitch, .6) - rest).toBeGreaterThan(DROOP.pitch * .8);
      run(w.pet, 1.2);
      expect(Math.abs(mean(pitch, .3) - rest)).toBeLessThan(.1);
      // seated
      w.pet.doWord('sit'); run(w.pet, 2.5);
      const seated = mean(pitch, .3);
      w.pet.doWord('droop'); run(w.pet, .5);
      expect(mean(pitch, .6) - seated).toBeGreaterThan(DROOP.pitch * .8);
      run(w.pet, 1.5);
      // kneeling: the drawing's head drops, its sides and bottom stay; a nod cutting it short brings it back over frames
      const [x0, y0, x1, y1] = R.deformers.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const off = (x, y) => {
        const st = w.seen.last.st, a = pointOf(R.deformers, 'kneelHead', st, x, y), b = pointOf(R.deformers, 'kneelHead', { ...st, kneelHead: null }, x, y);
        return [a[0] - b[0], a[1] - b[1]];
      };
      w.pet.doWord('kneel'); run(w.pet, 3);
      w.pet.doWord('droop'); run(w.pet, .8);
      expect(w.o.kneel).toBe(true);
      expect(off(cx, y0 + 6)[1]).toBeGreaterThan(2);
      for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1]]) for (const d of off(x, y)) expect(Math.abs(d)).toBeLessThan(1e-9);
      const before = off(cx, y0 + 6)[1];
      w.pet.doWord('nod'); run(w.pet, 1 / 60);
      expect(before - off(cx, y0 + 6)[1]).toBeLessThan(before * .5);
      run(w.pet, 2);
      expect(w.o.kneel).toBe(true);
      // lying: the head turns forward about the chin
      w.pet.doWord('lie'); run(w.pet, 3);
      const L = real.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const lyingTop = () => w.seen.last.st.lieHead.fn(.5, .1, ...top);
      const flat = lyingTop();
      w.pet.doWord('droop'); run(w.pet, .8);
      expect(Math.abs(lyingTop()[0] - flat[0])).toBeGreaterThan(3);
      expect(w.seen.bad).toEqual([]);
    } finally { rand.mockRestore(); }
  });

  it('leans in toward you (凑近), back (后仰) and sways (晃来晃去) standing or seated, and stamps (跺脚) with a shoe', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched();
      const over = (word, s, at) => { w.pet.doWord(word); const xs = []; for (let i = 0; i < s * 60; i++) { run(w.pet, 1 / 60); xs.push(at()); } return xs; };
      run(w.pet, 1);
      for (const mode of ['stand', 'sit']) {
        w.pet.doWord(mode); run(w.pet, 2.5);
        // nearer: her upper body and head larger; further off and chin up leaning back
        const near = over('closer', 2.1, () => w.seen.last.st.waist.sx);
        expect(Math.max(...near), mode).toBeGreaterThan(1 + BODY_LEAN.near * .8);
        expect(w.o.mode, mode).toBe(mode === 'stand' ? 'idle' : 'sit');
        const back = over('leanback', 1.7, () => w.seen.last.st.waist.sx);
        expect(Math.min(...back), mode).toBeLessThan(1 - BODY_LEAN.far * .7);
        const rock = over('sway', 2.5, () => w.seen.last.st.body.a);
        expect(Math.max(...rock) - Math.min(...rock), mode).toBeGreaterThan(BODY_LEAN.swayBody * 1.5);
      }
      // a stamp gets her up and lifts a shoe off the floor
      const lift = over('stamp', 1.4, () => Math.min(w.seen.last.st.footL.ty, w.seen.last.st.footR.ty));
      expect(w.o.mode).toBe('idle');
      expect(Math.min(...lift)).toBeLessThan(-8);
      expect(w.seen.bad).toEqual([]);
    } finally { rand.mockRestore(); }
  });

  it('draws a face made of others from its parts: the eyes, brows, mouth and body language of each', () => {
    const w = watched();
    run(w.pet, .5);
    w.pet.setExpr('smug+happy', 3);
    run(w.pet, .5);
    expect(w.o.face).toBe('smug+happy');
    expect(w.fc.parts).toEqual({ eyes: 'smug', brows: 'smug', mouth: 'happy', body: 'smug' });
    const plan = planFace(w.fc, w.o.face, { ...w.o, blink: 0, eyeClose: 0 }, w.o.t, has);
    expect(plan.eyes.map(e => e.name)).toEqual(['smug_eyeL', 'smug_eyeR']);
    expect(plan.mouth.name).toBe('happy_mouth');
    expect(partsOf({}, 'happy')).toEqual({ eyes: 'happy', brows: 'happy', mouth: 'happy', body: 'happy' });
    // brows from one face, body language (the head's pitch) from another, frame after frame
    const fc = { ...FACES.happy.f(0), parts: { eyes: 'happy', brows: 'angry', mouth: 'happy', body: 'reading' } };
    const [m, a, r] = [0, 1, 2].map(() => createMotion(real, R0));
    let mixed, angry, reading;
    for (let i = 0; i < 60; i++) {
      const o = frame({ t: 1 + i / 60 });
      mixed = m.step(fc, { ...o, face: 'happy+happy+reading' }, 1 / 60, caps);
      angry = a.step(FACES.happy.f(0), { ...o, face: 'angry' }, 1 / 60, caps);
      reading = r.step(FACES.happy.f(0), { ...o, face: 'reading' }, 1 / 60, caps);
    }
    for (const x of [R0.deformers.brows.rect[0] + 2, 128, R0.deformers.brows.rect[2] - 2]) expect(mixed.st.brows.fn(.5, .5, x)).toEqual(angry.st.brows.fn(.5, .5, x));
    expect(mixed.turn[1]).toBeCloseTo(reading.turn[1], 9);
    expect(mixed.turn[1] - once(frame({ t: 2 }), FACES.happy.f(0)).turn[1]).toBeCloseTo(HEAD_PITCH.reading, 1);
  });
  it('draws every face made of parts (PLUS_MIXES) from her own art: the eyes of its eyes\' face, the mouth of its mouth\'s', () => {
    const w = watched();
    run(w.pet, .5);
    const kitFace = n => PLUS_FACES[n] ?? FACES[n];
    const shown = p => (p.kind === 'sprite' ? p.name : p.kind);
    for (const [n, d] of Object.entries(PLUS_MIXES)) {
      expect(w.pet.doWord(n), n).toBe(true);
      run(w.pet, .4);
      expect(w.o.face, n).toBe(n);
      const o = { ...w.o, blink: 0, eyeClose: 0, talk: 0 }, p = w.pet.pet;
      const plan = planFace(w.fc, n, o, o.t, has);
      expect(plan.eyes, n).toHaveLength(2);
      // every eye is drawn art (a sprite of hers, or her own eye with its lid), never the stroked stand-in
      for (const e of plan.eyes) expect(e.kind, n).not.toBe('stroke');
      for (const e of [...plan.eyes, plan.mouth]) if (e.kind === 'sprite') expect(sprites.has(e.name), `${n}: ${e.name}`).toBe(true);
      const eyes = planFace(kitFace(d.eyes).f(o.t, p), d.eyes, o, o.t, has), mouth = planFace(kitFace(d.mouth).f(o.t, p), d.mouth, o, o.t, has);
      expect(plan.eyes.map(shown), n).toEqual(eyes.eyes.map(shown));
      expect(shown(plan.mouth), n).toEqual(shown(mouth.mouth));
    }
  });
  it('draws two faces of one group shown as one (`eyes+mouth`: test samples, and every pair her manifest composes, as the World sends it) from her own art', () => {
    const listed = Object.values(readManifest(fileURLToPath(DIR), true).pairs).filter((v) => !('as' in v));
    const table = [{ eyes: 'surprised', mouth: 'happy' }, { eyes: 'smug', mouth: 'coax' }, ...listed];
    const w = watched();
    run(w.pet, .5);
    const kitFace = n => PLUS_FACES[n] ?? FACES[n];
    const shown = p => (p.kind === 'sprite' ? p.name : p.kind);
    for (const d of table) {
      const k = `${d.eyes}+${d.mouth}`;
      expect(w.pet.doGroup([d.eyes, d.mouth]), k).toEqual([true, true]);
      run(w.pet, .4);
      expect(w.o.face, k).toBe(k);
      expect(w.fc.parts, k).toEqual({ eyes: d.eyes, brows: d.eyes, mouth: d.mouth, body: d.eyes });
      const o = { ...w.o, blink: 0, eyeClose: 0, talk: 0 }, p = w.pet.pet;
      const plan = planFace(w.fc, k, o, o.t, has);
      for (const e of plan.eyes) expect(e.kind, k).not.toBe('stroke');
      for (const e of [...plan.eyes, plan.mouth]) if (e.kind === 'sprite') expect(sprites.has(e.name), `${k}: ${e.name}`).toBe(true);
      const eyes = planFace(kitFace(d.eyes).f(o.t, p), d.eyes, o, o.t, has), mouth = planFace(kitFace(d.mouth).f(o.t, p), d.mouth, o, o.t, has);
      expect(plan.eyes.map(shown), k).toEqual(eyes.eyes.map(shown));
      expect(shown(plan.mouth), k).toEqual(shown(mouth.mouth));
      w.pet.setExpr('neutral', .01);
      run(w.pet, .2);
    }
  });

  it('wags her tail (摇尾巴) wider and faster than any mood, then hands it back to the mood', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched(), R = w.R, [, , x1, y1] = R.deformers.tail.rect;
      const range = (sec, at) => { const xs = []; for (let i = 0; i < sec * 60; i++) { run(w.pet, 1 / 60); xs.push(at()); } return Math.max(...xs) - Math.min(...xs); };
      const tip = () => w.seen.last.st.tail.fn(1, 1, x1, y1)[0];
      run(w.pet, 1);
      w.pet.setExpr('excited', 12); run(w.pet, 1.5);
      const glad = range(2, tip);
      expect(w.pet.act('wag')).toBe(true);
      run(w.pet, .3);
      expect(w.o.appendages.tail).toMatchObject({ kind: 'wag' });
      expect(range(1.8, tip)).toBeGreaterThan(glad * 1.6);
      run(w.pet, 1);
      expect(w.o.appendages.tail).toBe(null);
      expect(range(1.5, tip)).toBeLessThan(glad * 1.3);
      expect(w.seen.bad).toEqual([]);
    } finally { rand.mockRestore(); }
  });

  it('beats her wings (扇翅膀) standing, seated, kneeling (her live upper body over the drawing\'s lower one) and lying (the drawn wing)', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched();
      const range = (sec, at) => { const xs = []; for (let i = 0; i < sec * 60; i++) { run(w.pet, 1 / 60); xs.push(at()); } return Math.max(...xs) - Math.min(...xs); };
      const wing = () => w.seen.last.st.wingL.a;
      run(w.pet, 1);
      w.pet.setExpr('excited', 30); run(w.pet, 1);
      const flutter = range(2, wing);
      for (const mode of ['stand', 'sit']) {
        w.pet.doWord(mode); run(w.pet, 2.5);
        expect(w.pet.act('wingbeat'), mode).toBe(true);
        run(w.pet, .3);
        expect(range(1.5, wing), mode).toBeGreaterThan(Math.max(flutter * 1.5, WINGBEAT.amp * 1.5));
        expect(w.o.mode, mode).toBe(mode === 'stand' ? 'idle' : 'sit');
        run(w.pet, 1);
      }
      // kneeling: the kneeling drawing's wings cannot move, so the hybrid shows while they beat; she stays kneeling
      w.pet.setExpr('neutral', .1);
      w.pet.doWord('kneel'); run(w.pet, 3);
      expect(w.motion.kneelArmsK).toBe(0);
      w.pet.act('wingbeat'); run(w.pet, .5);
      expect(w.motion.kneelArmsK).toBe(1);
      expect(w.o.kneel).toBe(true);
      expect(range(1, wing)).toBeGreaterThan(WINGBEAT.amp);
      run(w.pet, 3);
      expect(w.o.kneel).toBe(true);
      // lying: the wing drawn into the lying drawing turns about its root; nothing far from it moves
      w.pet.doWord('lie'); run(w.pet, 3);
      // (a point of the wing off her shin, which stays: LIE_DRAWN.wing.keep)
      const [wx, wy] = [90, 180];
      expect(drawnTurn(LIE_DRAWN.wing, 10, 66, 180)).toEqual([0, 0]);
      const drawn = (x, y) => { const f = w.seen.last.st.lieParts?.fn; return f ? f(0, 0, x, y) : [0, 0]; };
      expect(drawn(wx, wy)).toEqual([0, 0]);
      w.pet.act('wingbeat'); run(w.pet, .3);
      expect(range(1.2, () => drawn(wx, wy)[1])).toBeGreaterThan(4);
      expect(drawn(200, 150)).toEqual([0, 0]);
      expect(w.seen.bad).toEqual([]);
    } finally { rand.mockRestore(); }
  });

  it('takes 摇尾巴 and 扇翅膀 from the gesture when the kit has no slot for them (upstream\'s); a drawn part bends from its root', () => {
    expect(appendagesOf({ gesture: { kind: 'wag', k: .3 } })).toEqual({ tail: { kind: 'wag', k: .3 } });
    expect(appendagesOf({ gesture: { kind: 'wave', k: .3 } })).toEqual({});
    const both = { tail: null, wings: { kind: 'wingbeat', k: .5 } };
    expect(appendagesOf({ gesture: { kind: 'wave', k: .3 }, appendages: both })).toEqual(both);
    const W = { ...LIE_DRAWN.wing, keep: undefined }, [rx, ry] = W.path[0], [tx, ty] = W.path.at(-1);
    expect(drawnTurn(W, 10, rx, ry)).toEqual([0, 0]);
    const d = drawnTurn(W, 10, tx, ty), len = Math.hypot(tx - rx, ty - ry);
    expect(Math.hypot(...d)).toBeCloseTo(2 * len * Math.sin(5 * Math.PI / 180), 6);
    expect(drawnTurn(W, 10, tx, ty - 40)).toEqual([0, 0]);
    // the drawn wing sits on the lying drawing it was measured on
    expect(R0.deformers.lieParts.rect).toEqual(LIE_DRAWN.box.map((v, i) => (i < 2 ? v : v + LIE_DRAWN.box[i - 2])));
  });
});

/* ---------- kneeling with her arms posed (the three girls share these: tests/helpers/kneel-arms.js) ---------- */
describeKneelArms('GPT-chan', {
  dir: DIR, M: KneelMotion, GESTURES,
  make: async (missing = []) => {
    const model = JSON.parse(readFileSync(new URL('model.json', DIR), 'utf8')), doc = globalThis.document;
    globalThis.document = { createElement: () => recCanvas(), createElementNS: () => recCanvas() };
    try {
      return await createGptFigure(DIR, {
        model, asset: p => String(p),
        loadImage: url => (missing.some(n => String(url).endsWith(`tex/${n}.png`)) ? Promise.reject(new Error('missing')) : Promise.resolve({ url })),
      });
    } finally { globalThis.document = doc; }
  },
});

/* ---------- live faces on the kneeling and lying drawings (the three girls share these: tests/helpers/floor-face.js) ---------- */
describeFloorFace('GPT-chan', { dir: DIR, M: KneelMotion, F: FaceModule, GESTURES });
