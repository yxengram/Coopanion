import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { CLAP, createPet, FACES, ROLL_D as KIT_ROLL_D, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_FACES, PLUS_MIXES, PLUS_MOTIONS, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import {
  anchorsOf, tearDropOf, approach, ARM_BOTH, ARM_FALLBACK, ARM_ONE, armPlan, ballAngle, bowPose, buildRig, createMotion, extentOf, FACE_ARMS, feetFromLegs,
  fxPointsOf, GROUP, hitsOf, MOOD, pitchFromLean, pointOf, POSE_ALT, POSE_KIND, poseMix, ROLL_D, SIT_BESIDE, SIT_LOW, sitAnchors, sitOwnArms, sitRaise,
  twinField, WHOLE_POSES, WING, WING_MOOD, wingFlutter, wingStates, TWIN, WINGBEAT, HAIR_FLOOR, liveAnchors, ARM_TWIN, armPoseOf, NECK_POSES,
} from '../packages/cortico-world-desktop-pet/web/grok-chan/motion.js';
import { createFacePainter, DRAWN_SHUT, MOUTHS, planFace, TALK_SHAPES } from '../packages/cortico-world-desktop-pet/web/grok-chan/face.js';
import { appendagesOf, APPENDAGE_WORDS, LIE_DRAWN, LIE_PARTS, drawnTurn, gesturesOf, HEAD_PITCH, headMoves, KNEEL_HEAD, kneelHeadField, partsOf, TILT_BACK, TILT_DEG, tiltEased, DROOP, BODY_LEAN } from '../packages/cortico-world-desktop-pet/web/grok-chan/motion.js';
import { fxMarkup } from '../packages/cortico-world-desktop-pet/web/grok-chan/fx.js';
import * as KneelMotion from '../packages/cortico-world-desktop-pet/web/grok-chan/motion.js';
import { describeKneelArms } from './helpers/kneel-arms.js';
import { describeArmCut } from './helpers/arm-cut.js';
import { describeFloorFace } from './helpers/floor-face.js';
import * as FaceModule from '../packages/cortico-world-desktop-pet/web/grok-chan/face.js';
import { createGrokFigure, GESTURES } from '../packages/cortico-world-desktop-pet/web/grok-chan/figure.js';

const DIR = new URL('../packages/cortico-world-desktop-pet/web/grok-chan/', import.meta.url);
const SRC = ['figure.js', 'face.js', 'motion.js', 'fx.js'];
const MODEL_URL = new URL('model.json', DIR);
const real = existsSync(MODEL_URL) ? JSON.parse(readFileSync(MODEL_URL, 'utf8')) : null;
const realFeat = !!real?.feat?.eyes;
const realPoses = real?.poses ? Object.keys(real.poses).filter(k => real.poses[k]?.required?.length) : [];
const realArmPoses = realPoses.filter(id => !WHOLE_POSES.includes(id));
// the whole-body drawings come one by one with her art: a test of one waits for it
const realHas = (...ids) => ids.every(id => realPoses.includes(id));
const BOUNDS = () => ({ W: 1200, H: 400, floorY: 380, S: .42 });
const ALL_FACES = [...new Set([...Object.keys(FACES), ...Object.keys(PLUS_FACES)])];
const ALL_WORDS = [...KIT_MOTIONS, ...PLUS_MOTIONS];

/** Width, height and colour type of a PNG, from its header. */
function png(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}
/** The pixels of an 8-bit RGBA, non-interlaced PNG: { w, h, px } (4 bytes a pixel). */
function rgbaOf(url) {
  const b = readFileSync(url), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  expect(b[24] === 8 && b[25] === 6 && b[28] === 0, 'an 8-bit RGBA PNG, not interlaced').toBe(true);
  const idat = [];
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const raw = inflateSync(Buffer.concat(idat)), row = w * 4, px = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
    for (let i = 0; i < row; i++) {
      const l = i >= 4 ? px[dst + i - 4] : 0, u = y ? px[dst + i - row] : 0, ul = y && i >= 4 ? px[dst + i - row - 4] : 0;
      const p = l + u - ul, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul);
      px[dst + i] = (raw[src + i] + [0, l, u, (l + u) >> 1, pa <= pb && pa <= pc ? l : pb <= pc ? u : ul][f]) & 255;
    }
  }
  return { w, h, px };
}
const inside = ([x, y], [x0, y0, x1, y1], m = 0) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;
const rectOf = b => [b[0], b[1], b[0] + b[2], b[1] + b[3]];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

/* ---------- a made-up model with every drawing, so the code is tested before (and beyond) the art ---------- */
const FAMS = ['happy', 'sleep', 'surprised', 'love', 'dizzy', 'drag', 'cry', 'smug', 'angry', 'sad', 'wink', 'halflid', 'shy', 'determined'];
// (expr2: eye-only drawings, no mouth of their own; drool's and shocked's own mouths)
const EYE_FAMS = ['eyeroll', 'shocked', 'deadpan'];
const MOUTH_SPRITES = ['neutral_mouth', ...TALK_SHAPES.map(s => `mouth_${s}`), ...['frown', 'pout', 'cat', 'grin', 'tongue', 'smile', 'drool', 'gasp'].map(s => `mouth_${s}`)];
// her arm drawings: two-arm ones, then armL's own
const BOTH_POSES = ['cheer', 'pray', 'cross', 'oops', 'search', 'read', 'write', 'heart', 'hips', 'stretch', 'shy', 'cup', 'hug', 'curtsy',
  'clap', 'clapo', 'shrug', 'headhold'];
const ONE_POSES = ['chin', 'salute', 'cover', 'scratch', 'vsign', 'fist', 'wave', 'idea', 'point', 'raise', 'thumbs', 'shush', 'wipe'];
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
  for (const f of EYE_FAMS) Object.assign(sprites, { [`${f}_eyeL`]: [404, 470, 484, 560], [`${f}_eyeR`]: [508, 470, 588, 560] });
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
      footL: [119.8, 253], footR: [136.8, 253], ornament: [128, 49.4], twinL: [78, 50], twinR: [178, 50], wingL: [72, 72], wingR: [184, 72],
    },
    rects: { head: [62.8, 17.4, 193.2, 129.4], hair: [72.4, 19.2, 183.6, 172], twinL: [36, 38, 92, 200], twinR: [164, 38, 220, 200] },
    parts: [
      { id: 'hair_back', tex: 'hair_back', z: 1, parent: 'hairSway', grid: [10, 14], box: [72.4, 19.2, 111.2, 152.8] },
      { id: 'twin_l', tex: 'twin_l', z: 1.1, parent: 'twinL', grid: [6, 16], box: [36, 38, 56, 162] },
      { id: 'twin_r', tex: 'twin_r', z: 1.15, parent: 'twinR', grid: [6, 16], box: [164, 38, 56, 162] },
      { id: 'shoe_l', tex: 'shoe_l', z: 2, parent: 'footL', grid: [3, 4], box: [110.2, 226.4, 18.2, 30] },
      { id: 'shoe_r', tex: 'shoe_r', z: 2.05, parent: 'footR', grid: [3, 4], box: [127.6, 226.4, 19.4, 30.2] },
      { id: 'skirt', tex: 'skirt', z: 3, parent: 'skirt', grid: [10, 8], box: [63.6, 155.2, 132, 101.4] },
      { id: 'torso', tex: 'torso', z: 4, parent: 'waist', grid: [6, 4], box: [94.4, 117, 67.8, 47.8] },
      { id: 'arm_l', tex: 'arm_l', z: 5, parent: 'armL', grid: [4, 8], box: [60.8, 133, 53.6, 94.6] },
      { id: 'arm_r', tex: 'arm_r', z: 5.05, parent: 'armR', grid: [4, 8], box: [141.8, 133, 55.4, 95] },
      { id: 'face', tex: 'face', z: 8, parent: 'headMid', grid: [6, 6], box: [78.4, 32.8, 103.4, 87] },
      { id: 'brows', tex: 'brows', z: 8.6, parent: 'headFeat', grid: [12, 2], box: [104.6, 78.6, 45.8, 4.6] },
      { id: 'locks', tex: 'locks', z: 12.9, parent: 'bangsSway', grid: [8, 8], box: [86, 88.8, 84, 60.6] },
      { id: 'bangs', tex: 'bangs', z: 13, parent: 'bangsSway', grid: [8, 10], box: [94.2, 32.8, 67, 68.4] },
      { id: 'wing_l', tex: 'wing_l', z: 13.5, parent: 'wingL', grid: [4, 4], box: [40, 60, 36, 24] },
      { id: 'wing_r', tex: 'wing_r', z: 13.55, parent: 'wingR', grid: [4, 4], box: [180, 60, 36, 24] },
      { id: 'ornament', tex: 'ornament', z: 14, parent: 'ornament', grid: [8, 6], box: [64.6, 9.6, 122.2, 97] },
    ],
    feat: {
      eyes: { eyeL: eye(414, 474), eyeR: eye(518, 578) },
      sprites,
      face: { rect: [360, 400, 272, 260], cheeks: [[424, 590, 30, 16], [568, 590, 30, 16]], mouth: [496, 598], tearEnd: { eyeL: 640, eyeR: 640 }, browSplit: 496, ink: '#4a3a52', mouthDy: {} },
    },
    schemes: [{ id: 'original', brand: 'Grok 娘', label: '原版', accent: '#A3304A', ready: true }],
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
  // the little wings never turn far (each is its own drawing, turned about its root behind the bow; a swing of her head
  // trails them a little further), nor narrow or widen past their bounds (a wingbeat spreads them to WING.wide)
  for (const e of ['wingL', 'wingR']) {
    const s = out.st[e];
    if (!s) { bad.push(`no ${e}`); continue; }
    if (Math.abs(s.a) > WING.max + 12) bad.push(`${e}.a=${s.a}`);
    if (s.sx < WING.foldSx - 1e-9 || s.sx > WING.wide + 1e-9) bad.push(`${e}.sx=${s.sx}`);
  }
  for (const t of ['twinL', 'twinR']) if (!out.st[t]?.fn) bad.push(`no ${t}`);
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
 * Her motion alone, held in `face` (and `mode`) for `settle` seconds, then sampled over 4.5 s: how far her wings lift
 * (mean of wingL's turn less wingR's, halved) and how wide they are (sx), how far apart the twin-tails' tips are (x)
 * and how far their tips swing (the left one's x, max less min).
 */
function held(model, face, { mode = 'idle', settle = 3, o = {} } = {}) {
  const R = buildRig(model), motion = createMotion(model, R), caps = { pose: () => false, tex: () => true };
  const tipOf = id => { const r = R.deformers[id].rect; return [(r[0] + r[2]) / 2, r[3]]; };
  let t = 0;
  const step = () => { t += 1 / 60; return motion.step({}, { t, mode, face, ...o }, 1 / 60, caps); };
  for (let i = 0; i < settle * 60; i++) step();
  const lift = [], sx = [], apart = [], xs = [];
  for (let i = 0; i < 270; i++) {
    const { st } = step();
    lift.push((st.wingL.a - st.wingR.a) / 2); sx.push(st.wingL.sx);
    const l = pointOf(R.deformers, 'twinL', st, ...tipOf('twinL')), r = pointOf(R.deformers, 'twinR', st, ...tipOf('twinR'));
    apart.push(r[0] - l[0]); xs.push(l[0]);
  }
  return { lift: mean(lift), sx: mean(sx), apart: mean(apart), swing: Math.max(...xs) - Math.min(...xs) };
}
/** Her motion run from scratch for `seconds` in `face`: each frame's states (and `o` on top of the frame). */
function frames(model, face, seconds, o = {}) {
  const R = buildRig(model), motion = createMotion(model, R), caps = { pose: () => false, tex: () => true }, list = [];
  for (let i = 0; i < seconds * 60; i++) list.push(motion.step({}, { t: i / 60, mode: 'idle', face, ...(typeof o === 'function' ? o(i / 60) : o) }, 1 / 60, caps).st);
  return { R, list };
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

describe('Grok-chan: the source', () => {
  const src = Object.fromEntries(SRC.map(f => [f, readFileSync(new URL(f, DIR), 'utf8')]));
  it('has no spout: her words leave it out, so none of her code draws one', () => {
    expect(JSON.parse(readFileSync(new URL('figure.json', DIR), 'utf8')).vocab.map(w => w.id)).not.toContain('spout');
    expect(GESTURES).not.toContain('spout');
    for (const [f, s] of Object.entries(src)) expect(s, f).not.toMatch(/spout/i);
  });
  it('enters the kit statically with the plus body, and never fetches', () => {
    expect(src['figure.js']).toMatch(/^import \* as kit from '\.\.\/kit\/body\.js';$/m);
    expect(src['figure.js']).toMatch(/export async function createGrokBody\(base, opts\) \{\s*return kit\.createBody\(opts\.host, \{ figure: await createGrokFigure\(base, opts\), plus: true \}\);/);
    expect(src['figure.js']).toMatch(/export async function createGrokFigure\(/);
    for (const [f, s] of Object.entries(src)) {
      expect(s, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s*\(/);
    }
  });
  it('imports only from its own directory and the kit, and is nobody else\'s copy', () => {
    for (const [f, s] of Object.entries(src)) {
      for (const [, path] of s.matchAll(/^import [^;]*? from '([^']+)';$/gm)) expect(path, `${f}: ${path}`).toMatch(/^\.\/[\w-]+\.js$|^\.\.\/kit\/[\w-]+\.js$/);
      expect(s, f).not.toMatch(/claude|Claude|gpt-chan|GPT-chan|gemini|Gemini|\bhorns?\b|\bears?\b|\bstar\b|charms/);
      expect(s, f).toMatch(/grok-chan|Grok-chan/);
    }
  });
});

describe('Grok-chan: motion helpers', () => {
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
  it('mirrors her wings: up they lift and spread, folded they narrow flat back, drooping they hang; a lag turns both alike', () => {
    const rest = wingStates(0, 0, 0);
    for (const side of ['wingL', 'wingR']) { expect(rest[side].a).toBeCloseTo(0); expect(rest[side].sx).toBe(1); }
    const up = wingStates(1, 0, 0);
    expect(up.wingL.a).toBeCloseTo(WING.up);
    expect(up.wingR.a).toBeCloseTo(-WING.up);
    expect(up.wingL.sx).toBeCloseTo(WING.upSx);
    const folded = wingStates(0, 1, 0);
    expect(folded.wingL.sx).toBeCloseTo(WING.foldSx);
    expect(Math.abs(folded.wingL.a)).toBeLessThan(WING.up);
    const droop = wingStates(0, 0, 1);
    expect(droop.wingL.a).toBeCloseTo(-WING.droop);
    expect(droop.wingR.a).toBeCloseTo(WING.droop);
    expect(droop.wingL.sx).toBeCloseTo(WING.droopSx);
    // each wing's own extra lift, mirrored, and a lag that turns both the same way
    const f = wingStates(0, 0, 0, 2, -1, 3);
    expect([f.wingL.a, f.wingR.a]).toEqual([5, 4]);
    for (const u of [0, .5, 1]) for (const fl of [0, .5, 1]) for (const d of [0, .5, 1]) for (const x of [-60, 0, 60]) {
      const e = wingStates(u, fl, d, x, x);
      for (const side of ['wingL', 'wingR']) {
        expect(Math.abs(e[side].a)).toBeLessThanOrEqual(WING.max);
        expect(e[side].sx >= WING.foldSx && e[side].sx <= WING.upSx).toBe(true);
      }
    }
    // which way is up: a + turn lifts the far end of the wing on the viewer's left (and a − one the right one's)
    const R = buildRig(SYNTH), tipL = [42, 72], tipR = [214, 72];
    expect(pointOf(R.deformers, 'wingL', { wingL: up.wingL }, ...tipL)[1]).toBeLessThan(tipL[1]);
    expect(pointOf(R.deformers, 'wingR', { wingR: up.wingR }, ...tipR)[1]).toBeLessThan(tipR[1]);
    expect(pointOf(R.deformers, 'wingL', { wingL: droop.wingL }, ...tipL)[1]).toBeGreaterThan(tipL[1]);
  });
  it('flutters each wing now and then on its own, the same way every run', () => {
    const seen = [[], []];
    for (let i = 0; i < 60 * 60; i++) for (const k of [0, 1]) seen[k].push(wingFlutter(i / 60, k));
    for (const v of seen) {
      // mostly still, a flutter at most WING.flick up (never down), and several a minute
      expect(v.filter(x => x === 0).length).toBeGreaterThan(v.length * .7);
      expect(Math.max(...v)).toBeGreaterThan(WING.flick * .9);
      expect(Math.max(...v)).toBeLessThanOrEqual(WING.flick);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
      let n = 0;
      for (let i = 1; i < v.length; i++) if (v[i] > 0 && v[i - 1] === 0) n++;
      expect(n).toBeGreaterThan(8);
    }
    // the two wings do not flutter together, and t alone decides
    expect(seen[0]).not.toEqual(seen[1]);
    expect(wingFlutter(12.34, 0)).toBe(wingFlutter(12.34, 0));
    for (const k of Object.keys(WING_MOOD)) expect([...ALL_FACES, 'sleep'], k).toContain(k);
  });
  it('bends a twin-tail about its root under the bow, the tip most, the root staying put', () => {
    const pv = [78, 50], len = 150, f = twinField(pv, len, { turn: 10 });
    expect(f(0, 0, ...pv)).toEqual([0, 0]);
    expect(f(0, 0, pv[0] + 20, pv[1] - 5).map(Math.abs)).toEqual([0, 0]);
    const mid = f(0, 0, pv[0], pv[1] + len / 2), tip = f(0, 0, pv[0], pv[1] + len);
    // (a + turn carries the tips toward −x)
    expect(tip[0]).toBeLessThan(0);
    expect(Math.abs(tip[0])).toBeGreaterThan(Math.abs(mid[0]) * 2.5);
    expect(tip[0]).toBeCloseTo(-len * Math.sin(10 * Math.PI / 180), 6);
    // a shift moves it whole; stretch lengthens it toward the tip; gather lifts only its lower part
    expect(twinField(pv, len, { shift: [3, -2] })(0, 0, pv[0], pv[1] + 40)).toEqual([3, -2]);
    expect(twinField(pv, len, { stretch: .1 })(0, 0, pv[0], pv[1] + len)[1]).toBeCloseTo(len * .1, 6);
    const g = twinField(pv, len, { gather: 8 });
    expect(g(0, 0, pv[0], pv[1] + len * .3)[1]).toBeCloseTo(0, 6);
    expect(g(0, 0, pv[0], pv[1] + len)[1]).toBeCloseTo(-8, 6);
  });
  it('swings a pendulum down each twin-tail that reaches the tip after the middle, and lets it hang back as the head tilts', () => {
    const pv = [78, 50], len = 150, at = (ph, d) => twinField(pv, len, { wave: 10, phase: ph })(0, 0, pv[0], pv[1] + len * d)[0] / d;
    // the phase at which the middle and the tip are swung furthest toward −x
    const peak = d => { let best = 0, ph0 = 0; for (let ph = 0; ph < 2 * Math.PI; ph += .001) { const v = -at(ph, d); if (v > best) { best = v; ph0 = ph; } } return ph0; };
    const lagged = peak(1) - peak(.5);
    expect(lagged).toBeGreaterThan(TWIN.lag * .4);
    expect(lagged).toBeLessThan(TWIN.lag * .6);
    // the head's tilt: `hang` turns all but the top back the other way, so a tilted head still has them hanging
    const h = twinField(pv, len, { hang: -6 });
    expect(h(0, 0, pv[0], pv[1] + len * .05)[0]).toBeCloseTo(0, 1);
    expect(h(0, 0, pv[0], pv[1] + len)[0]).toBeGreaterThan(5);
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
    // under a face that poses her arms itself (angry's hands on hips, thinking's chin), the gesture's arms win: 生气+加油
    // shows the fist, not the hips
    for (const [w, pose] of [['fist', 'fist'], ['twiddle', 'shy'], ['muse', 'chin'], ['jot', 'write']]) {
      for (const face of ['angry', 'thinking', 'excited', 'shy']) expect(armPlan({ mode: 'idle', gesture: { kind: w, k: .5 }, face }, all).L, `${w} ${face}`).toBe(pose);
    }
    // the new arm words (举手, 点赞, 嘘, 擦汗 with armL; 摊手, 抱头 with both): standing, seated and walking alike, under any
    // face, gone again before the gesture ends
    for (const [w, R] of [['raise', 'hangR'], ['thumbs', 'hangR'], ['shush', 'hangR'], ['wipe', 'hangR'], ['shrug', 'shrug'], ['headhold', 'headhold']]) {
      for (const mode of ['idle', 'sit', 'walk']) expect(armPlan({ mode, gesture: { kind: w, k: .5 }, face: 'happy' }, all), `${w} ${mode}`).toEqual({ L: w, R, fallback: null });
      expect(armPlan({ mode: 'idle', gesture: { kind: w, k: .5 }, face: 'angry' }, all).L, w).toBe(w);
      expect(armPlan({ mode: 'idle', gesture: { kind: w, k: .95 }, face: 'sad' }, all).L, w).not.toBe(w);
    }
    // clapping (拍手): her hands apart (clapo) till they first meet, together (clap) for each of the kit's CLAP.at, apart
    // between; with no drawing of them apart, together throughout; with neither, pressed together (pray), then the plain arms
    const clapAt = (s, has = all) => armPlan({ mode: 'idle', gesture: { kind: 'clap', k: s / CLAP.dur }, face: 'happy' }, has);
    expect(clapAt(.1)).toEqual({ L: 'clapo', R: 'clapo', fallback: null });
    for (const a of CLAP.at) {
      expect(clapAt(a + .05).L, `${a}`).toBe('clap');
      expect(clapAt(a + CLAP.shut + .05).L, `${a}`).toBe('clapo');
    }
    expect(CLAP.at.length).toBe(4);
    expect(CLAP.at[3] + CLAP.shut).toBeLessThan(.9 * CLAP.dur);
    expect(clapAt(.1, only(['clap'])).L).toBe('clap');
    expect(clapAt(.1, only(['pray'])).L).toBe('pray');
    expect(clapAt(.1, none)).toEqual({ L: 'hangL', R: 'hangR', fallback: 'clapo' });
    expect(armPoseOf('clap', .01)).toBe('clapo');
    expect(armPoseOf('wave', .5)).toBe('wave');
    expect(armPlan({ mode: 'idle', gesture: null, face: 'listening' }, all).L).toBe('write');
    expect(armPlan({ mode: 'idle', gesture: null, face: 'thinking', faceOK: false }, all)).toEqual(hang);
    expect(armPlan({ mode: 'walk', gesture: null, face: 'thinking' }, all)).toEqual(hang);
    // seated, the seated body's arms are hers while nothing else is asked of them; its torso goes beside them
    expect(sitOwnArms(hang)).toBe(true);
    expect(sitOwnArms({ L: 'wave', R: 'hangR' })).toBe(false);
    expect(SIT_BESIDE).toEqual(['torso']);
  });
  it.skipIf(!real)('claps by cutting between her two drawings of it in a frame, never both at once, four times, then lets her hands down', () => {
    const { fig, motion, seen } = stubFigure(real);
    const pet = barePet(fig);
    run(pet, .5);
    pet.doWord('clap');
    let both = 0, cuts = 0, was = null;
    const peak = { clap: 0, clapo: 0 };
    for (let i = 0; i < 3 * 60; i++) {
      run(pet, 1 / 60);
      const A = motion.arms, a = A.clap || 0, b = A.clapo || 0;
      if (a > 0 && b > 0) both++;
      peak.clap = Math.max(peak.clap, a); peak.clapo = Math.max(peak.clapo, b);
      const now = a > 0 ? 'clap' : b > 0 ? 'clapo' : null;
      if (now && was && now !== was) cuts++;
      if (now) was = now;
    }
    expect(both).toBe(0);
    expect(peak).toEqual({ clap: 1, clapo: 1 });
    // apart → together and back for each clap
    expect(cuts).toBe(2 * CLAP.at.length);
    expect((motion.arms.clap || 0) + (motion.arms.clapo || 0)).toBe(0);
    expect(seen.bad).toEqual([]);
  });
  it.skipIf(!real)('keeps a hand on her lips, her brow or her head as her head nods (【嘘+点头】): the drawing rides the neck', () => {
    expect(NECK_POSES).toEqual(['cover', 'shush', 'wipe', 'headhold']);
    const R = buildRig(real);
    for (const id of ['shush', 'wipe', 'headhold']) expect(R.deformers[R.ARM[id].rot].parent, id).toBe('neck');
    for (const id of ['raise', 'thumbs', 'clap', 'clapo', 'shrug']) expect(R.deformers[R.ARM[id].rot].parent, id).toBe('waist');
  });
  it('has a drawing (or the plain arms\' way) for every arm gesture, and asks only for drawings she has a place for', () => {
    const words = new Set(ALL_WORDS);
    for (const g of [...Object.keys(ARM_ONE), ...Object.keys(ARM_BOTH), ...GESTURES]) expect(words.has(g), g).toBe(true);
    for (const pose of [...Object.values(ARM_ONE), ...Object.values(ARM_BOTH)]) expect(ARM_FALLBACK[pose], pose).toBeTruthy();
    for (const pose of [...Object.values(ARM_ONE), ...Object.values(ARM_BOTH), ...Object.values(FACE_ARMS), ...Object.values(POSE_ALT).flat(), ...Object.values(ARM_TWIN)]) expect(ARM_POSES, pose).toContain(pose);
    for (const pose of Object.values(ARM_TWIN)) expect(ARM_FALLBACK[pose], pose).toBeTruthy();
    for (const f of Object.keys(FACE_ARMS)) expect(ALL_FACES, f).toContain(f);
    // the one-arm drawings are armL's; nothing is armR's alone (her other arm just hangs)
    expect(Object.keys(POSE_KIND).sort()).toEqual([...ONE_POSES].sort());
    expect(new Set(Object.values(POSE_KIND))).toEqual(new Set(['armL']));
    // and no drawing, stand-in or plain-arms way that nothing asks for
    const asked = new Set([...Object.values(ARM_ONE), ...Object.values(ARM_BOTH), ...Object.values(FACE_ARMS), ...Object.values(ARM_TWIN)]);
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
      // (a hand on her face or head rides the neck: NECK_POSES)
      expect(R.deformers[A.rot].parent, id).toBe(['cover', 'shush', 'wipe', 'headhold'].includes(id) ? 'neck' : 'waist');
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
    // her crown and bows are pinned in her hair on a turn of their own (nothing swings under them); the brows show
    // faintly through the fringe
    expect(R.parts.find(p => p.id === 'ornament').parent).toBe('ornament');
    expect(R.deformers.ornament).toMatchObject({ kind: 'rot', parent: 'headFront' });
    expect(R.deformers.charms).toBeUndefined();
    expect(R.parts.find(p => p.id === 'brows_through').z).toBeGreaterThan(R.parts.find(p => p.id === 'bangs').z);
    expect(R.parts.find(p => p.id === 'faceFx').parent).toBe('headFeat');
  });
  it('hangs her twin-tails under her bows and her wings behind them, on the neck, on the model\'s pivots, with fallbacks', () => {
    const R = buildRig(SYNTH);
    expect(R.deformers.twinL).toEqual({ kind: 'warp', parent: 'neck', rect: SYNTH.rects.twinL });
    expect(R.deformers.twinR).toEqual({ kind: 'warp', parent: 'neck', rect: SYNTH.rects.twinR });
    expect(R.TWINS.twinL).toEqual({ root: SYNTH.pivots.twinL, len: SYNTH.rects.twinL[3] - SYNTH.pivots.twinL[1] });
    expect(R.deformers.wingL).toEqual({ kind: 'rot', parent: 'neck', pivot: SYNTH.pivots.wingL });
    expect(R.deformers.wingR).toEqual({ kind: 'rot', parent: 'neck', pivot: SYNTH.pivots.wingR });
    expect(['twin_l', 'twin_r', 'wing_l', 'wing_r'].map(id => R.parts.find(p => p.id === id).parent)).toEqual(['twinL', 'twinR', 'wingL', 'wingR']);
    // her side locks swing on a warp of their own on the front of the head
    expect(R.deformers.locks).toEqual({ kind: 'warp', parent: 'headFront', rect: rectOf(SYNTH.parts.find(p => p.id === 'locks').box) });
    expect(R.parts.find(p => p.id === 'locks').parent).toBe('locks');
    // without the pivots and the rects: each twin-tail's warp is over its drawing, rooted near its top; each wing turns
    // about the inner end of its drawing (behind the bow)
    const { twinL, twinR, wingL, wingR, ...pivots } = SYNTH.pivots, { twinL: tl, twinR: tr, ...rects } = SYNTH.rects;
    const B = buildRig({ ...SYNTH, pivots, rects });
    expect(B.unknownParents).toEqual([]);
    expect(B.deformers.twinL.rect).toEqual(rectOf(SYNTH.parts.find(p => p.id === 'twin_l').box));
    expect(B.TWINS.twinL.root).toEqual([64, 50]);
    expect(B.deformers.wingL.pivot).toEqual([72, 72]);
    expect(B.deformers.wingR.pivot).toEqual([184, 72]);
    // and a model without twin-tails or wings at all still has them, empty (her motion sets them every frame), mirrored
    // about the head
    const C = buildRig({ ...SYNTH, pivots, rects, parts: SYNTH.parts.filter(p => !/^twin|^wing/.test(p.id)) });
    expect(C.unknownParents).toEqual([]);
    const [hx0, , hx1] = C.HEAD;
    expect(C.deformers.wingL.pivot[0] + C.deformers.wingR.pivot[0]).toBeCloseTo(hx0 + hx1, 6);
    expect(C.deformers.twinL.rect[0] + C.deformers.twinR.rect[2]).toBeCloseTo(hx0 + hx1, 6);
  });
});

describe('Grok-chan: wings and twin-tails with her moods', () => {
  for (const [name, model] of [['every drawing', SYNTH], ['no drawings yet', BARE]]) {
    it(`lifts and spreads her wings glad, startled or listening, folds them narrow scared or cross, lets them droop sad or asleep (${name})`, () => {
      const [calm, glad, listen, surprised, scared, angry, sad, sleepy, asleep] = [held(model, 'neutral'), held(model, 'happy'), held(model, 'listening'),
        held(model, 'surprised'), held(model, 'scared'), held(model, 'angry'), held(model, 'sad'), held(model, 'sleepy'), held(model, 'neutral', { mode: 'sleep' })];
      expect(Math.abs(calm.lift)).toBeLessThan(3);
      expect(calm.sx).toBeCloseTo(1, 1);
      for (const up of [glad, listen, surprised]) { expect(up.lift).toBeGreaterThan(calm.lift + 4); expect(up.sx).toBeGreaterThan(1.02); }
      for (const low of [scared, angry]) { expect(low.sx).toBeLessThan(.8); expect(low.lift).toBeLessThan(glad.lift); }
      for (const d of [sad, sleepy, asleep]) { expect(d.lift).toBeLessThan(calm.lift - 8); expect(d.sx).toBeLessThan(.97); }
    });
    it(`swings her twin-tails livelier glad, perks them out a little, draws them in close and still when low (${name})`, () => {
      const [calm, glad, sad, asleep] = [held(model, 'neutral'), held(model, 'happy'), held(model, 'sad'), held(model, 'neutral', { mode: 'sleep' })];
      expect(calm.swing).toBeGreaterThan(.5);
      expect(glad.swing).toBeGreaterThan(calm.swing * 1.5);
      expect(glad.apart).toBeGreaterThan(calm.apart);
      expect(sad.apart).toBeLessThan(calm.apart - 2);
      expect(sad.swing).toBeLessThan(calm.swing);
      expect(asleep.swing).toBeLessThan(calm.swing);
    });
  }
  it('swings her twin-tails slow at rest and faster glad', () => {
    const swing = (face) => {
      const { R, list } = frames(SYNTH, face, 8);
      const r = R.deformers.twinL.rect, xs = list.slice(180).map(st => pointOf(R.deformers, 'twinL', st, (r[0] + r[2]) / 2, r[3])[0]);
      const m = mean(xs);
      let crossings = 0;
      for (let i = 1; i < xs.length; i++) if ((xs[i - 1] - m) * (xs[i] - m) < 0) crossings++;
      return { spread: Math.max(...xs) - Math.min(...xs), crossings };
    };
    const calm = swing('neutral'), glad = swing('happy');
    expect(glad.crossings).toBeGreaterThan(calm.crossings * 1.8);
    // a slow sway at rest: a swing every few seconds
    expect(calm.crossings).toBeLessThan(12);
    expect(calm.crossings).toBeGreaterThan(2);
  });
  it('flutters her wings at rest, each on its own, but not while they hang', () => {
    const swing = (face, k) => {
      const { list } = frames(SYNTH, face, 20);
      const a = list.slice(120).map(st => Math.abs(st[k].a));
      return Math.max(...a) - Math.min(...a);
    };
    for (const k of ['wingL', 'wingR']) {
      expect(swing('neutral', k), k).toBeGreaterThan(WING.flick * .7);
      expect(swing('sad', k), k).toBeLessThan(WING.flick * .3);
    }
    const { list } = frames(SYNTH, 'neutral', 20), L = list.map(st => st.wingL.a), Rr = list.map(st => -st.wingR.a);
    expect(L).not.toEqual(Rr);
  });
  it('twitches her wings when something happens to her, jitters them flustered and buzzes them angry', () => {
    // a new face at 2 s (a poke, a pat): within a third of a second both wings shiver, then settle
    // (two faces that hold the wings alike, so all that differs from the same run without the change is the twitch)
    const { list } = frames(SYNTH, 'thinking', 4, t => (t < 2 ? {} : { face: 'reading' }));
    const { list: same } = frames(SYNTH, 'thinking', 4);
    const off = i => Math.max(Math.abs(list[i].wingL.a - same[i].wingL.a), Math.abs(list[i].wingR.a - same[i].wingR.a));
    for (let i = 0; i < 120; i++) expect(off(i)).toBe(0);
    expect(Math.max(...Array.from({ length: 20 }, (_, i) => off(120 + i)))).toBeGreaterThan(WING.twitch * .5);
    expect(off(200)).toBeLessThan(1);
    const jitter = face => { const { list: l } = frames(SYNTH, face, 4); return mean(l.slice(120).map((st, i, a) => (i ? Math.abs(st.wingL.a - a[i - 1].wingL.a) : 0))); };
    expect(jitter('flustered')).toBeGreaterThan(jitter('content') * 3);
    expect(jitter('angry')).toBeGreaterThan(jitter('scared') * 3);
  });
  it('keeps the twin-tails\' roots and the wings\' under her bows as her head turns, and the tips above the floor seated', () => {
    const R = buildRig(SYNTH), motion = createMotion(SYNTH, R), caps = { pose: () => false, tex: () => true };
    for (const [sit, low, look] of [[0, 0, [0, 0]], [0, 0, [5, -3]], [1, 29, [-4, 2]]]) {
      let out;
      for (let i = 0; i < 120; i++) out = motion.step({}, { t: i / 60, mode: sit ? 'sit' : 'idle', face: 'neutral', sit, low, look }, 1 / 60, caps);
      for (const id of ['twinL', 'twinR']) {
        const pv = R.TWINS[id].root, a = pointOf(R.deformers, id, out.st, ...pv), b = pointOf(R.deformers, 'ornament', out.st, ...pv);
        expect(Math.hypot(a[0] - b[0], a[1] - b[1]), `${id} ${look}`).toBeLessThan(.5);
        const r = R.deformers[id].rect;
        for (let x = r[0]; x <= r[2]; x += 4) expect(pointOf(R.deformers, id, out.st, x, r[3])[1], `${id} tip seated ${sit}`).toBeLessThanOrEqual(HAIR_FLOOR + 1);
      }
      for (const id of ['wingL', 'wingR']) {
        const pv = R.deformers[id].pivot, a = pointOf(R.deformers, id, out.st, ...pv), b = pointOf(R.deformers, 'ornament', out.st, ...pv);
        expect(Math.hypot(a[0] - b[0], a[1] - b[1]), `${id} ${look}`).toBeLessThan(.5);
      }
    }
  });
});

describe('Grok-chan: every word on the kit', () => {
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

describe('Grok-chan: faces', () => {
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
  it('draws expr2\'s faces with their own art: eyeroll, shocked and deadpan their drawn eyes (the painted eye past DRAWN_SHUT), drool the half lids and its mouth, shocked its gasp; without the art, the fallbacks', () => {
    const P0 = { exprAt: 0, exprUntil: 9, modeT: 1, drowse: 0 };
    const plan = (f, o = {}, has = fullHas, t = .5) => planFace(PLUS_FACES[f].f(t, P0), f, frame(f, { t, ...o }), t, has);
    for (const f of ['eyeroll', 'shocked', 'deadpan']) {
      // ring eyes, so the face's own drawing stands in for them (a lid would only for cry and smug)
      expect(PLUS_FACES[f].f(.5, P0).eyes.map(e => e.shape), f).toEqual(['ring', 'ring']);
      for (const blink of [0, .3, DRAWN_SHUT]) expect(plan(f, { blink }).eyes.map(e => e.name), `${f} blink ${blink}`).toEqual([`${f}_eyeL`, `${f}_eyeR`]);
      for (const s of [{ blink: .6 }, { blink: 1 }, { eyeClose: 1 }]) expect(plan(f, s).eyes.map(e => e.kind), `${f} ${JSON.stringify(s)}`).toEqual(['open', 'open']);
    }
    // shocked is not `wide` (the whale paints wide ring eyes with her surprised ones before her own drawn eyes)
    expect(PLUS_FACES.shocked.f(.5, P0).wide).toBeUndefined();
    expect(plan('shocked').mouth).toMatchObject({ kind: 'sprite', name: 'mouth_gasp' });
    expect(plan('eyeroll').mouth).toMatchObject({ kind: 'sprite', name: 'mouth_frown', s: .8 });
    expect(plan('deadpan').mouth).toMatchObject({ kind: 'line', form: 0, w: .9 });
    expect(plan('drool').eyes.map(e => e.name)).toEqual(['halflid_eyeL', 'halflid_eyeR']);
    expect(plan('drool').mouth).toMatchObject({ kind: 'sprite', name: 'mouth_drool' });
    // talking takes over with the talking mouths
    expect(plan('drool', { talk: 1, talkShape: 1, t: Math.PI / 34 }, fullHas, Math.PI / 34).mouth.name).toBe('mouth_i');
    // a model without expr2's art: shocked shows the surprised eyes and mouth, drool the tongue, eyeroll and deadpan the painted eyes
    const bare = n => full.has(n) && !/^(eyeroll|shocked|deadpan)_|^mouth_(drool|gasp)$/.test(n);
    expect(plan('shocked', {}, bare).eyes.map(e => e.name)).toEqual(['surprised_eyeL', 'surprised_eyeR']);
    expect(plan('shocked', {}, bare).mouth).toMatchObject({ kind: 'sprite', name: 'surprised_mouth', s: 1.1 });
    expect(plan('drool', {}, bare).mouth.name).toBe('mouth_tongue');
    for (const f of ['eyeroll', 'deadpan']) expect(plan(f, {}, bare).eyes.map(e => e.kind), f).toEqual(['open', 'open']);
    // her model has every one of them
    if (real) for (const n of [...['eyeroll', 'shocked', 'deadpan'].flatMap(f => [`${f}_eyeL`, `${f}_eyeR`]), 'mouth_drool', 'mouth_gasp']) expect(real.feat.sprites[n], n).toBeDefined();
  });
  it('only wobbles a drawn dizzy eye (its lashes and lid would spin with it), and spins the stroked spiral whole', () => {
    for (const rot of [0, 1, 2.5, 6, 40]) {
      const fc = { eyes: [{ shape: 'spiral', rot }, { shape: 'spiral', rot }] };
      const drawn = planFace(fc, 'dizzy', frame('dizzy'), .5, fullHas).eyes, stroked = planFace(fc, 'dizzy', frame('dizzy'), .5, noHas).eyes;
      for (const e of drawn) { expect(e.kind).toBe('sprite'); expect(Math.abs(e.rot)).toBeLessThanOrEqual(.12); }
      for (const e of stroked) { expect(e.kind).toBe('stroke'); expect(e.rot).toBeCloseTo(rot * .6); }
    }
  });
  it('blinks a drawn open eye shut with the painted lid and its lash line past DRAWN_SHUT, not a squashed sliver; shut drawings, winks and cry as before', () => {
    const P0 = { exprAt: 0, exprUntil: 9, modeT: 1, drowse: 0 };
    const plan = (f, o = {}, t = .5, p = P0) => planFace((PLUS_FACES[f] ?? FACES[f]).f(t, p), f, frame(f, { t, ...o }), t, fullHas).eyes;
    const names = (f, o, t, p) => plan(f, o, t, p).map(e => e.name || e.kind);
    const SHUT = [{ blink: .6 }, { blink: 1 }, { eyeClose: 1 }], amount = s => s.blink ?? s.eyeClose;
    // each face's own open eyes, the wide surprised eyes, and the half lids
    const DRAWN = [['angry', 'angry'], ['sad', 'sad'], ['worried', 'sad'], ['shy', 'shy'], ['smug', 'smug'], ['determined', 'determined'],
      ['surprised', 'surprised'], ['scared', 'surprised'], ['content', 'halflid'], ['disgusted', 'halflid'], ['reading', 'halflid'], ['sleepy', 'halflid', 3]];
    for (const [f, fam, t = .5] of DRAWN) {
      // open, and the start and end of a blink: the drawing, squashed a little about its middle
      for (const blink of [0, .3, DRAWN_SHUT]) expect(names(f, { blink }, t), `${f} blink ${blink}`).toEqual([`${fam}_eyeL`, `${fam}_eyeR`]);
      // most of the way shut and shut: the painted eye, its lid down as far as the blink
      for (const s of SHUT) {
        const eyes = plan(f, s, t);
        expect(eyes.map(e => e.kind), `${f} ${JSON.stringify(s)}`).toEqual(['open', 'open']);
        for (const e of eyes) expect(e.open, `${f} ${JSON.stringify(s)}`).toBeLessThanOrEqual(1 - amount(s) + 1e-9);
      }
    }
    // every face: an open drawing cuts to the painted eye past DRAWN_SHUT; every other drawing (cry's shut eyes, the
    // happy, sleeping, winking, heart, > < and dizzy ones) stays itself through the blink
    for (const f of ALL_FACES) {
      const fc = (PLUS_FACES[f] ?? FACES[f]).f(.5, P0), open = plan(f);
      open.forEach((e0, i) => {
        if (e0.kind !== 'sprite') return;
        const cuts = ['ring', 'lid'].includes(fc.eyes[i].shape) && !e0.name.startsWith('cry_');
        for (const s of SHUT) {
          const e = plan(f, s)[i];
          if (cuts) expect(e.kind, `${f} ${i} ${JSON.stringify(s)}`).toBe('open');
          else expect(e.name, `${f} ${i} ${JSON.stringify(s)}`).toBe(e0.name);
        }
      });
    }
    for (const s of SHUT) {
      expect(names('cry', s), JSON.stringify(s)).toEqual(['cry_eyeL', 'cry_eyeR']);
      expect(names('happy', s), JSON.stringify(s)).toEqual(['happy_eyeL', 'happy_eyeR']);
      expect(names('sleep', s), JSON.stringify(s)).toEqual(['sleep_eyeL', 'sleep_eyeR']);
      expect(names('love', s), JSON.stringify(s)).toEqual(['love_eyeL', 'love_eyeR']);
      // a wink keeps its shut eye; the open one blinks as the plain eye does
      expect(names('wink', s), JSON.stringify(s)).toEqual(['open', 'wink_eyeR']);
      // the salute: its serious eyes while the hand is up; the wink as it comes down keeps the shut eye
      const up = { ...P0, pulse: { kind: 'salute', t0: 0, dur: 2 } };
      expect(names('saluting', s, .5, up), JSON.stringify(s)).toEqual(['open', 'open']);
      expect(names('saluting', s, 1.8, up), JSON.stringify(s)).toEqual(['open', 'wink_eyeR']);
    }
    const up = { ...P0, pulse: { kind: 'salute', t0: 0, dur: 2 } };
    expect(names('saluting', { blink: .3 }, .5, up)).toEqual(['determined_eyeL', 'determined_eyeR']);
    expect(names('saluting', { blink: .3 }, 1.8, up)).toEqual(['determined_eyeL', 'wink_eyeR']);
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

describe('Grok-chan: sitting and bowing', () => {
  it.skipIf(!real?.poses?.sit)('seated, the plain skirt under her arms is black fabric: no stripes of the red lining, the frills or her hands', () => {
    // (it shows over the seated pool whenever her standing torso and gesture arms are up; carried up from the lap, the
    // red front opening, the white frills and her skin came out as red, white and pink stripes down her front)
    const p = real.poses.sit.required.find(q => q.id === 'sit_skirt'), K = real.units.DS / real.units.S;
    const { w, px } = rgbaOf(new URL(`tex/${p.tex}.png`, DIR)), ax = Math.round((128 - p.box[0]) * K);
    let opaque = 0, bright = 0;
    for (let y = 0; y < 32 * K; y++) for (let x = ax - 12 * K; x < ax + 12 * K; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 200) continue;
      opaque++;
      if (Math.max(px[i], px[i + 1], px[i + 2]) > 130) bright++;
    }
    expect(opaque).toBeGreaterThan(1000);
    expect(bright / opaque).toBeLessThan(.005);
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
    const withTwin = { ...SYNTH, poses: { ...SYNTH.poses, sit: { ...SYNTH.poses.sit, hides: ['twin_r'] } } };
    for (const [model, twinA] of [[SYNTH, 1], [withTwin, 0]]) {
      const { fig, R, seen } = stubFigure(model);
      const pet = barePet(fig);
      const alpha = id => seen.last.st.alpha[id] ?? (R.STANDING[id] ? 1 : 0);
      run(pet, .5);
      pet.doWord('sit'); run(pet, 2);
      expect(alpha('sit_skirt')).toBe(1);
      expect(alpha('twin_r')).toBe(twinA);
      expect(alpha('skirt')).toBe(0);
      pet.doWord('stand'); run(pet, 4);
      expect(alpha('twin_r')).toBe(1);
    }
  });
  it('keeps her legs (the shoe parts, thigh to sole) while she sinks toward a drawing, shortening them under the skirt', () => {
    for (const model of [SYNTH, BARE]) {
      const { fig, R, seen } = stubFigure(model);
      const pet = barePet(fig);
      const alpha = id => seen.last.st.alpha[id] ?? 1;
      run(pet, .5);
      pet.doWord('sit');
      let minA = 1, minSy = 1;
      for (let i = 0; i < 120; i++) {
        run(pet, 1 / 60);
        // (until the seated drawing has taken over and hides them)
        if ((seen.last.st.alpha.sit_skirt ?? 0) >= 1) break;
        minA = Math.min(minA, alpha('shoe_l')); minSy = Math.min(minSy, seen.last.st.footL.sy);
      }
      if (model === SYNTH) { expect(minA).toBe(1); expect(minSy).toBeLessThan(.95); }
      else expect(minA).toBe(0);
      expect(R.parts.find(p => p.id === 'shoe_l').parent).toBe('footL');
    }
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
describe.skipIf(!real)('Grok-chan: model.json and its files', () => {
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
    for (const id of ['twin_l', 'twin_r', 'wing_l', 'wing_r', 'hair_back', 'skirt', 'torso', 'face', 'locks', 'bangs', 'ornament']) expect(z(id), id).toBeTypeOf('number');
    // the twin-tails over the long hair but behind her body; the wings over her fringe and behind the bows they come
    // out of (on the ornament); the side locks under the fringe
    for (const t of ['twin_l', 'twin_r']) { expect(z(t)).toBeGreaterThan(z('hair_back')); expect(z(t)).toBeLessThan(z('skirt')); }
    for (const w of ['wing_l', 'wing_r']) { expect(z(w)).toBeGreaterThan(z('bangs')); expect(z(w)).toBeLessThan(z('ornament')); }
    expect(z('locks')).toBeLessThan(z('bangs'));
    expect(z('hair_back')).toBeLessThan(z('face'));
    expect(z('face')).toBeLessThan(z('bangs'));
    expect(z('bangs')).toBeLessThan(z('ornament'));
    if (z('shoe_l') != null) expect(z('shoe_l')).toBeLessThan(z('skirt'));
    const parent = id => real.parts.find(p => p.id === id).parent;
    expect([parent('twin_l'), parent('twin_r'), parent('wing_l'), parent('wing_r')]).toEqual(['twinL', 'twinR', 'wingL', 'wingR']);
    for (const id of ['ear_l', 'ear_r', 'tail', 'horns']) expect(real.parts.map(p => p.id)).not.toContain(id);
  });
  it('puts the mouth line on the master\'s own ω (not level with the eyes\' lower rims) and every mouth\'s middle on it', () => {
    const F = real.feat.face, S = real.feat.sprites, mid = b => (b[1] + b[3]) / 2;
    expect(Math.abs(F.mouth[1] - mid(S.neutral_mouth))).toBeLessThan(2);
    expect(Math.abs(F.mouth[0] - (S.neutral_mouth[0] + S.neutral_mouth[2]) / 2)).toBeLessThan(2);
    // (below the eyes: their lowest point is above the mouth line)
    for (const e of Object.values(real.feat.eyes)) expect(e.ball[3]).toBeLessThan(F.mouth[1]);
    for (const [n, b] of Object.entries(S)) {
      if (!n.endsWith('_mouth') && !n.startsWith('mouth_')) continue;
      // (drool's drop hangs below its mouth: the mouth, not the box with the drop, is centred on the line, so the line
      // runs through the upper part of the box)
      if (n === 'mouth_drool') { const dy = F.mouthDy[n] || 0; expect(b[1] + dy, n).toBeLessThan(F.mouth[1]); expect(mid(b) + dy, n).toBeGreaterThan(F.mouth[1]); continue; }
      expect(Math.abs(mid(b) + (F.mouthDy[n] || 0) - F.mouth[1]), n).toBeLessThan(2);
    }
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
  it('keeps her pivots mirrored about her middle, twin-tails and wings where they hang from, every point inside the view', () => {
    const PV = real.pivots, mid = PV.head?.[0] ?? 128, view = real.view;
    // (her twin-tails and wings are drawn a little unevenly: one side a few units off the other)
    for (const [l, r, dx, dy] of [['armL', 'armR', 5, 5], ['footL', 'footR', 5, 5], ['twinL', 'twinR', 5, 4], ['wingL', 'wingR', 5, 6]]) {
      expect(Math.abs((PV[l][0] + PV[r][0]) / 2 - mid), `${l}/${r}`).toBeLessThan(dx);
      expect(Math.abs(PV[l][1] - PV[r][1]), `${l}/${r}`).toBeLessThan(dy);
    }
    expect(PV.head[1]).toBeLessThan(PV.neck[1]);
    expect(PV.neck[1]).toBeLessThan(PV.waist[1]);
    for (const [k, p] of Object.entries(PV)) expect(inside(p, view), k).toBe(true);
    // each twin-tail hangs from under its bow: its root near the top of its drawing, either side of the head, its warp
    // over the whole drawing and down to below her waist
    for (const [t, part] of [['twinL', 'twin_l'], ['twinR', 'twin_r']]) {
      const b = rectOf(real.parts.find(p => p.id === part).box);
      expect(inside(PV[t], b, 4), t).toBe(true);
      expect(PV[t][1] - b[1], t).toBeLessThan((b[3] - b[1]) * .15);
      expect(Math.abs(PV[t][0] - mid), t).toBeGreaterThan(30);
      expect(real.rects[t]).toEqual(rectOf(real.parts.find(p => p.id === part).box).map(v => Math.round(v * 10) / 10));
      expect(R.deformers[t].rect).toEqual(real.rects[t]);
      expect(real.rects[t][3]).toBeGreaterThan(PV.waist[1]);
    }
    // each wing turns about its root: the inner end of its drawing (behind the bow), out beside the head
    for (const [w, part, inner] of [['wingL', 'wing_l', 2], ['wingR', 'wing_r', 0]]) {
      const b = rectOf(real.parts.find(p => p.id === part).box);
      expect(inside(PV[w], b, 4), w).toBe(true);
      expect(Math.abs(PV[w][0] - b[inner]), w).toBeLessThan((b[2] - b[0]) * .25);
      expect(PV[w][1], w).toBeLessThan(PV.neck[1]);
    }
    expect(PV.wingL[0]).toBeLessThan(mid);
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
      // (both hands on her head, a hand raised high: the drawing may end well above the shoulder it turns about; her
      // sleeves are detached, so raised the drawing is the sleeve and hand, its lower end high over the bare shoulder)
      expect(inside(A.pivot, A.rect, id === 'raise' ? 50 : ['headhold', 'wipe'].includes(id) ? 30 : 12), `${id} pivot`).toBe(true);
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
  it('moves her wings and twin-tails with her moods on the real rig', () => {
    const [calm, glad, sad, scared] = [held(real, 'neutral'), held(real, 'happy'), held(real, 'sad'), held(real, 'scared')];
    expect(glad.lift).toBeGreaterThan(calm.lift + 4);
    expect(glad.sx).toBeGreaterThan(1.02);
    expect(sad.lift).toBeLessThan(calm.lift - 8);
    expect(scared.sx).toBeLessThan(.8);
    expect(glad.swing).toBeGreaterThan(calm.swing * 1.5);
    expect(sad.apart).toBeLessThan(calm.apart - 2);
  });
  it('lays out every whole-body drawing she has the way her motion reads it', () => {
    const P = real.poses || {}, view = real.view;
    for (const id of WHOLE_POSES.filter(id => realHas(id))) {
      expect(R.W[id], id).toBeTruthy();
      for (const o of P[id].overlays || []) expect(['shut', 'smile', 'talk'], o.id).toContain(o.use);
    }
    const A = anchorsOf(real, R);
    if (realHas('lie')) {
      // lying: its own points for the kit, the head and legs it turns, the kick's axis, the effects' map
      const L = P.lie;
      for (const k of ['gaze', 'tear', 'z', 'bubble', 'hearts', 'glints', 'hit', 'halfW']) expect(L.anchors[k], k).toBeTruthy();
      for (const k of ['head', 'back', 'legs']) expect(L.rects[k], k).toHaveLength(4);
      for (const k of ['lie', 'lieChin']) expect(inside(L.pivots[k], view), k).toBe(true);
      expect(L.legAxis.knee).toHaveLength(2);
      expect(L.fx.s).toBeGreaterThan(.5);
      expect(L.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
      expect(A.lie.hit).toEqual(L.anchors.hit);
    }
    if (realHas('kneel')) {
      // kneeling: her head no lower than the kit's seated sink
      expect(P.kneel.headDrop).toBeGreaterThan(0);
      expect(P.kneel.headDrop).toBeLessThanOrEqual(SIT_LOW);
      expect(A.kneelRaise).toBeCloseTo(SIT_LOW - P.kneel.headDrop, 1);
      expect(P.kneel.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
    }
    if (realHas('roll')) {
      // the ball rolls on its edge: a support sample every 5°, touching the floor; 'around' is its own perimeter
      expect(P.roll.support).toHaveLength(72);
      const rb = P.roll.required[0].box;
      for (const v of P.roll.support) expect(v > 0 && v <= Math.max(rb[2], rb[3]) * .6).toBe(true);
      expect(P.roll.pivots.rollBall[1] + P.roll.support[0]).toBeCloseTo(256, 0);
      expect(P.roll.around).toBeGreaterThan(Math.PI * Math.min(rb[2], rb[3]) * .95);
      expect(P.roll.around).toBeLessThan(Math.PI * Math.max(rb[2], rb[3]) * 1.05);
    }
    if (realHas('back')) {
      // her back: the body on the flip, the hair on its warp over it, and what lies over the hair (her crown, bows and
      // wings) on the flip again, so it stays put while the hair sways under it
      expect(P.back.pivots.backFlip).toEqual([128, 256]);
      const bp = Object.fromEntries(P.back.required.map(p => [p.id, p]));
      expect(bp.back_body?.parent).toBe('backFlip');
      expect(bp.back_hair?.parent).toBe('backHair');
      expect(bp.back_body.z).toBeLessThan(bp.back_hair.z);
      if (bp.back_top) { expect(bp.back_top.parent).toBe('backFlip'); expect(bp.back_hair.z).toBeLessThan(bp.back_top.z); }
      expect(R.W.back.parts.map(p => p.parent)).toEqual([...P.back.required, ...(P.back.overlays || [])].map(p => p.parent));
      expect(R.deformers.backHair.rect).toEqual(P.back.rects.hair);
    }
    if (realHas('sit')) {
      // seated: the body on its own deformers, the head sunk a sane amount; what the drawing draws itself the standing
      // rig leaves out (hers draws none: her twin-tails and wings stay live)
      expect(P.sit.headDrop).toBeGreaterThan(10);
      expect(P.sit.headDrop).toBeLessThanOrEqual(SIT_LOW);
      for (const p of P.sit.required) expect(['sitTop', 'sitBase'], p.id).toContain(p.parent);
      for (const id of P.sit.hides || []) expect(real.parts.map(p => p.id), id).toContain(id);
      expect(R.W.sit.hides).toEqual(P.sit.hides || []);
    }
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
    // the skirt is gone under the seated drawing; her twin-tails and wings stay (it draws none of them itself)
    expect(real.poses.sit.hides || []).toEqual([]);
    expect(alpha('skirt')).toBe(0);
    for (const id of ['twin_l', 'twin_r', 'wing_l', 'wing_r']) expect(alpha(id), id).toBe(1);
    pet.doWord('stand'); run(pet, 4);
    expect(alpha('sit_skirt')).toBe(0);
    expect(alpha('skirt')).toBe(1);
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
    expect(real.poses.back.required.map(p => alpha(p.id))).toEqual(real.poses.back.required.map(() => 1));
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
describe.skipIf(!real)('Grok-chan: the figure', () => {
  const make = async (missing = [], model = real) => {
    const doc = globalThis.document, loaded = [];
    globalThis.document = { createElement: () => recCanvas(), createElementNS: () => recCanvas() };
    try {
      const fig = await createGrokFigure(DIR, {
        model, asset: p => String(p),
        loadImage: url => { loaded.push(String(url)); return missing.some(n => String(url).endsWith(`tex/${n}.png`)) ? Promise.reject(new Error('missing')) : Promise.resolve({ url }); },
      });
      return { fig, loaded };
    } finally { globalThis.document = doc; }
  };
  it('cries small drops (tearDrop, the kit\'s): about a quarter of an eye across, sliding from under each eye to the face\'s outline', async () => {
    const { fig } = await make(), R = buildRig(real), td = tearDropOf(real, R), A = anchorsOf(real, R);
    expect(fig.tearDrop).toEqual(td);
    // (the kit's own drop is 22.5 units across, an eye and more)
    for (const k of ['eyeL', 'eyeR']) {
      const b = real.feat.eyes[k].ball, w = R.U(b[2]) - R.U(b[0]);
      expect(td.w / w, k).toBeGreaterThan(.18);
      expect(td.w / w, k).toBeLessThan(.32);
    }
    // the slide ends where her painted streams do (feat.face.tearEnd), from the kit's tear points
    const ends = ['eyeL', 'eyeR'].map((k, i) => R.V(real.feat.face.tearEnd[k]) - A.tears[i][1]);
    expect(Math.abs(td.run - (ends[0] + ends[1]) / 2)).toBeLessThan(1);
    expect(td.run).toBeGreaterThan(2);
  });
  it('builds from her model.json as it is, loading every part texture and only the face files it names', async () => {
    const { fig, loaded } = await make();
    for (const p of real.parts) expect(loaded).toContain(`tex/${p.tex}.png`);
    if (!realFeat) expect(loaded.filter(u => u.startsWith('feat/'))).toEqual(Object.keys(real.feat?.sprites ?? {}).map(n => `feat/${n}.png`));
    expect(fig.schemes.map(s => s.id)).toEqual(['original']);
    expect(fig.colors).toEqual({ z: '#A3304A' });
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

describe('Grok-chan: a head gesture beside the arms\' one, kneeling, and faces made of others', () => {
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
    // (eyes open: a blink past DRAWN_SHUT is the painted eye closing)
    expect(planFace(w.fc, w.o.face, { ...w.o, blink: 0, eyeClose: 0 }, w.o.t, has).eyes.map(e => e.name)).toEqual(['angry_eyeL', 'angry_eyeR']);
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
        // (far enough to read at the default pet size: measured at S .42 the head box moves about 4-5 px and shrinks to
        // .86-.88, against about 1 px and .93-.96 before, which looked just like her at rest; a nod's peak is about 1 px)
        expect(Math.min(...back), mode).toBeLessThan(.89);
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

  it('beats her wings (扇翅膀) standing, seated, kneeling (her live upper body over the drawing\'s lower one) and lying (the drawn wings), then hands them back to the mood', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    try {
      const w = watched();
      const range = (sec, at) => { const xs = []; for (let i = 0; i < sec * 60; i++) { run(w.pet, 1 / 60); xs.push(at()); } return Math.max(...xs) - Math.min(...xs); };
      const wing = () => w.seen.last.st.wingL.a, wide = () => w.seen.last.st.wingL.sx;
      run(w.pet, 1);
      w.pet.setExpr('excited', 30); run(w.pet, 1);
      const flutter = range(2, wing);
      for (const mode of ['stand', 'sit']) {
        w.pet.doWord(mode); run(w.pet, 2.5);
        expect(w.pet.act('wingbeat'), mode).toBe(true);
        run(w.pet, .3);
        expect(range(1.2, wing), mode).toBeGreaterThan(Math.max(flutter * 1.3, WINGBEAT.amp * 1.5));
        // (both together: the right one mirrors the left)
        expect(w.seen.last.st.wingR.a, mode).toBeCloseTo(-w.seen.last.st.wingL.a + 2 * (w.seen.last.st.wingR.a + w.seen.last.st.wingL.a) / 2, 6);
        let most = 0;
        for (let i = 0; i < 30; i++) { run(w.pet, 1 / 60); most = Math.max(most, wide()); }
        expect(most, mode).toBeGreaterThan(WING.upSx);
        expect(w.o.mode, mode).toBe(mode === 'stand' ? 'idle' : 'sit');
        run(w.pet, 1);
        expect(w.o.appendages.wings, mode).toBe(null);
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
      // lying: the wings drawn into the lying drawing turn about their roots behind the bows; the bows and what lies far
      // from them stay
      w.pet.doWord('lie'); run(w.pet, 3);
      const drawn = (x, y) => { const f = w.seen.last.st.lieParts?.fn; return f ? f(0, 0, x, y) : [0, 0]; };
      const tipL = LIE_DRAWN.wingL.path.at(-1), tipR = LIE_DRAWN.wingR.path.at(-1);
      expect(drawn(...tipL)).toEqual([0, 0]);
      w.pet.act('wingbeat'); run(w.pet, .3);
      expect(range(1.2, () => drawn(...tipL)[1])).toBeGreaterThan(1.5);
      expect(range(1.2, () => drawn(...tipR)[1])).toBeGreaterThan(1.5);
      for (const k of ['wingL', 'wingR']) { const b = LIE_DRAWN[k].keep; expect(drawn((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), k).toEqual([0, 0]); }
      expect(drawn(60, 230)).toEqual([0, 0]);
      expect(w.seen.bad).toEqual([]);
    } finally { rand.mockRestore(); }
  });

  it('takes 扇翅膀 from the gesture when the kit has no slot for it (upstream\'s); a drawn wing bends from its root', () => {
    expect(APPENDAGE_WORDS).toEqual({ wingbeat: 'wings' });
    expect(appendagesOf({ gesture: { kind: 'wingbeat', k: .3 } })).toEqual({ wings: { kind: 'wingbeat', k: .3 } });
    for (const kind of ['wag', 'earsup', 'earflick', 'wave']) expect(appendagesOf({ gesture: { kind, k: .3 } }), kind).toEqual({});
    const given = { wings: { kind: 'wingbeat', k: .5 } };
    expect(appendagesOf({ gesture: { kind: 'wave', k: .3 }, appendages: given })).toEqual(given);
    // on upstream's kit the gesture is the beat: she beats them as she does on ours
    const once = (o) => createMotion(real, R0).step(FACES.neutral.f(0), o, 1 / 60, caps);
    let lo = Infinity, hi = -Infinity;
    const motion = createMotion(real, R0);
    for (let i = 0; i < 90; i++) { const a = motion.step(FACES.neutral.f(0), frame({ t: 1 + i / 60, gesture: { kind: 'wingbeat', k: i / 126 } }), 1 / 60, caps).st.wingL.a; if (i > 20) { lo = Math.min(lo, a); hi = Math.max(hi, a); } }
    expect(hi - lo).toBeGreaterThan(WINGBEAT.amp);
    // the word's sound (web/sound.js wingbeat, every figure's) whumps at .14 s + i × .385 s, peaking ~.05 s in: each of
    // its five whumps comes on a downstroke (her wings, as GPT-chan's, beat 2.6 a second from the word's start)
    const beat = createMotion(real, R0), a = [];
    for (let i = 0; i < 140; i++) a.push(beat.step(FACES.neutral.f(0), frame({ t: 1 + i / 60, gesture: { kind: 'wingbeat', k: Math.min(1, i / 126) } }), 1 / 60, caps).st.wingL.a);
    for (let i = 0; i < 5; i++) { const n = Math.round((.19 + i * .385) * 60); expect(a[n + 1], `whump ${i}`).toBeLessThan(a[n - 1] - 1); }
    expect(once(frame()).st.wingL.a).toBeTypeOf('number');
    // a drawn wing turns about the first point of its path: none there, more toward its tip
    const L = LIE_DRAWN.wingL, root = L.path[0], tip = L.path.at(-1);
    expect(drawnTurn(L, 10, ...root)).toEqual([0, 0]);
    expect(Math.hypot(...drawnTurn(L, 10, ...tip))).toBeGreaterThan(Math.hypot(...drawnTurn(L, 10, ...L.path[1])));
    expect(LIE_PARTS.beat).toBeGreaterThan(0);
    expect(R0.deformers.lieParts.rect).toEqual(LIE_DRAWN.box.map((v, i) => (i < 2 ? v : v + LIE_DRAWN.box[i - 2])));
  });
});

describe('her brows', () => {
  it('are the brows alone: no lash tips or lid crease under them, which showed as a second brow over shut eyes', () => {
    if (!real) return;
    const brows = real.parts.find(p => p.id === 'brows');
    // Claude 娘 and GPT 娘 have 4.4 and 4.6; cut with the lashes' tips it was 16.8
    expect(brows.box[3]).toBeLessThan(8);
  });
});

/* ---------- kneeling with her arms posed (the four girls share these: tests/helpers/kneel-arms.js) ---------- */
describeKneelArms('Grok-chan', {
  dir: DIR, M: KneelMotion, GESTURES,
  make: async (missing = []) => {
    const model = JSON.parse(readFileSync(new URL('model.json', DIR), 'utf8')), doc = globalThis.document;
    globalThis.document = { createElement: () => recCanvas(), createElementNS: () => recCanvas() };
    try {
      return await createGrokFigure(DIR, {
        model, asset: p => String(p),
        loadImage: url => (missing.some(n => String(url).endsWith(`tex/${n}.png`)) ? Promise.reject(new Error('missing')) : Promise.resolve({ url })),
      });
    } finally { globalThis.document = doc; }
  },
});

/* ---------- live faces on the kneeling and lying drawings (the four girls share these: tests/helpers/floor-face.js) ---------- */
describeFloorFace('Grok-chan', { dir: DIR, M: KneelMotion, F: FaceModule, GESTURES });

/* ---------- arm drawings cut in for each other, never half seen at once (the four girls share these: tests/helpers/arm-cut.js) ---------- */
describeArmCut('Grok-chan', { dir: DIR, M: KneelMotion, GESTURES });
