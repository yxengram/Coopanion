import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { CLAP, createPet, FACES, ROLL_D as KIT_ROLL_D, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_FACES, PLUS_MIXES, PLUS_MOTIONS, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import {
  anchorsOf, tearDropOf, approach, ARM_BOTH, BODY_CUT, bodyAlphas, bodyStep, bodyWant, bowPose, SIT_CUT, ARM_FALLBACK, ARM_ONE, armPlan, BACK_HAIR_REACH, backHairField, ballAngle, ballLift, buildRig, createMotion, extentOf, FACE_ARMS,
  feetFromLegs, fxPointsOf, GROUP, hitsOf, MOOD, pitchFromLean, pointOf, POSE_ALT, POSE_KIND, poseMix, SIT_LOW, sitAnchors, sitMix, sitRaise,
  ROLL_D, WHOLE_POSES, liveAnchors, ARM_TWIN, armPoseOf, NECK_POSES,
} from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import { createFacePainter, DRAWN_SHUT, MOUTHS, planFace, TALK_SHAPES } from '../packages/cortico-world-desktop-pet/web/claude-chan/face.js';
import { gesturesOf, HEAD_PITCH, headMoves, KNEEL_HEAD, kneelHeadField, partsOf, TILT_BACK, TILT_DEG, tiltEased, DROOP, BODY_LEAN } from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import { fxMarkup } from '../packages/cortico-world-desktop-pet/web/claude-chan/fx.js';
import * as KneelMotion from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import { describeKneelArms } from './helpers/kneel-arms.js';
import { describeArmCut } from './helpers/arm-cut.js';
import { describeFloorFace } from './helpers/floor-face.js';
import * as FaceModule from '../packages/cortico-world-desktop-pet/web/claude-chan/face.js';
import { createClaudeFigure, GESTURES } from '../packages/cortico-world-desktop-pet/web/claude-chan/figure.js';
import { spring } from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import { upstreamKit } from './helpers/upstream-kit.js';

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
const inside = ([x, y], [x0, y0, x1, y1], m = 0) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m;

/* ---------- a made-up model with every drawing, so the code is tested before (and beyond) the art ---------- */
const FAMS = ['happy', 'sleep', 'surprised', 'love', 'dizzy', 'drag', 'cry', 'smug', 'angry', 'sad', 'wink', 'halflid', 'shy', 'determined'];
// (expr2: eye-only drawings, no mouth of their own; drool's and shocked's own mouths)
const EYE_FAMS = ['eyeroll', 'shocked', 'deadpan'];
const MOUTH_SPRITES = ['neutral_mouth', ...TALK_SHAPES.map(s => `mouth_${s}`), ...['frown', 'pout', 'cat', 'grin', 'tongue', 'smile', 'drool', 'gasp'].map(s => `mouth_${s}`)];
const ARM_POSES = ['book', 'bookside', 'wave', 'chin', 'scratch', 'idea', 'salute', 'vsign', 'point', 'cover', 'fist', 'read', 'write', 'search',
  'cheer', 'heart', 'cup', 'pray', 'hips', 'hug', 'cross', 'stretch', 'curtsy', 'oops', 'shy',
  'raise', 'thumbs', 'shush', 'wipe', 'clap', 'clapo', 'shrug', 'headhold'];
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
  for (const f of EYE_FAMS) Object.assign(sprites, { [`${f}_eyeL`]: [420, 470, 500, 560], [`${f}_eyeR`]: [524, 470, 604, 560] });
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
  it('has no spout: her words leave it out, so none of her code draws one', () => {
    expect(JSON.parse(readFileSync(new URL('figure.json', DIR), 'utf8')).vocab.map(w => w.id)).not.toContain('spout');
    expect(GESTURES).not.toContain('spout');
    for (const [f, s] of Object.entries(src)) expect(s, f).not.toMatch(/spout/i);
  });
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
  it('swings her back hair from the nape, the tips most, trailing the same way mirrored or not', () => {
    const f = backHairField(1, 0, 0, 0), m = backHairField(1, 0, 0, 0, -1);
    expect(f(.5, 0).map(Math.abs)).toEqual([0, 0]);
    expect(Math.abs(f(.5, 1)[0])).toBeGreaterThan(Math.abs(f(.5, .5)[0]) * 2);
    expect(f(.5, 1)[0]).toBeGreaterThan(4);
    expect(m(.5, 1)[0]).toBeCloseTo(-f(.5, 1)[0]);
    // carried, the hair lifts
    expect(backHairField(0, -1, 0, 0)(.5, 1)[1]).toBeLessThan(-5);
    // and at the spring's full swing (1.8) and a swish it stays within the fill under it, either way
    for (const t of [0, .3, 1, 2.2]) {
      for (const [hair, flip] of [[1.8, 1], [-1.8, 1], [1.8, -1]]) {
        expect(Math.abs(backHairField(hair, 0, 1, t, flip)(.5, 1)[0])).toBeLessThanOrEqual(BACK_HAIR_REACH);
      }
    }
    expect(BACK_HAIR_REACH).toBeLessThanOrEqual(10);
  });
  it('rolls the ball without slipping, curling up tilted back and coming up tilted forward as much', () => {
    expect(KIT_ROLL_D).toBeCloseTo(2 * Math.PI * 100);
    // without the kit's travel (upstream's kit) ballAngle takes the full roll: the two must not drift apart
    expect(ROLL_D).toBe(KIT_ROLL_D);
    // a ball as big round as the kit's roll turns once, upright at both ends
    expect(ballAngle(0)).toBeCloseTo(0);
    expect(ballAngle(1)).toBeCloseTo(360);
    for (const around of [300, 420, 504.55, 560]) {
      const a0 = ballAngle(0, around), a1 = ballAngle(1, around);
      // the perimeter it rolls over is the way the kit carries her
      expect((a1 - a0) / 360 * around).toBeCloseTo(KIT_ROLL_D, 6);
      expect(((a1 % 360) + 360) % 360).toBeCloseTo(((-a0 % 360) + 360) % 360, 6);
      expect(Math.abs(a0)).toBeLessThanOrEqual(90);
      // it only turns while she travels (the kit's rollTurn: k .2 .. .8)
      expect(ballAngle(.1, around)).toBe(a0);
      expect(ballAngle(.9, around)).toBe(a1);
      // no travel given (upstream's kit) is the full roll
      expect(ballAngle(.5, around, undefined)).toBe(ballAngle(.5, around));
      expect(ballAngle(.5, around, NaN)).toBe(ballAngle(.5, around));
    }
  });
  it('rolls the ball only as far as the kit carries her, near a screen edge too', () => {
    for (const around of [300, 504.55, ROLL_D]) {
      for (const travel of [ROLL_D, 400, 250, 120, 3, 0, -2]) {
        const a0 = ballAngle(0, around, travel), a1 = ballAngle(1, around, travel);
        // the perimeter it rolls over is the way she goes
        expect((a1 - a0) / 360 * around, `${around} ${travel}`).toBeCloseTo(travel, 6);
        // the rest of a whole turn split: tilted back as much coming in as forward going out
        expect(((a1 % 360) + 360) % 360).toBeCloseTo(((-a0 % 360) + 360) % 360, 6);
        expect(Math.abs(a0)).toBeLessThanOrEqual(90);
        // in step with the way along
        const turn = k => { const u = Math.min(1, Math.max(0, (k - .2) / .6)); return u * u * (3 - 2 * u); };
        if (travel) for (const k of [.3, .5, .7]) expect((ballAngle(k, around, travel) - a0) / (a1 - a0)).toBeCloseTo(turn(k), 9);
      }
    }
    // with no room at all it does not turn
    expect(ballAngle(0, 504.55, 0)).toBe(0);
    expect(ballAngle(1, 504.55, 0)).toBe(0);
  });
  it('turns the ball on the rig as far as the kit rolls her, which a screen edge cuts short', () => {
    const W = 400, S = .42;
    const { fig, seen } = stubFigure(SYNTH);
    const frames = [], draw = fig.draw;
    fig.draw = (g, fc, o) => { draw.call(fig, g, fc, o); frames.push({ travel: o.gesture?.travel, a: seen.last.st.rollBall?.a }); };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', startX: 200, bounds: () => ({ ...BOUNDS(), W }) });
    pet.resize();
    run(pet, .3);
    pet.pet.facing = 1;
    const x0 = pet.pet.x, xs = [];
    expect(pet.doWord('roll')).toBe(true);
    const from = frames.length;
    for (let i = 0; i < 100; i++) { run(pet, 1 / 60); xs.push(pet.pet.x); }
    const roll = frames.slice(from, from + 100), travel = roll[0].travel;
    // short of the full roll: the room ahead, in rig units
    expect(travel).toBeCloseTo((W - 104 * S - 8 - x0) / S, 6);
    expect(travel).toBeLessThan(ROLL_D * .6);
    // the ball's turn, frame by frame, is the way she goes (around = ROLL_D here)
    expect(roll.filter(f => f.travel === travel).length).toBeGreaterThan(85);
    for (let i = 1; i < roll.length; i++) {
      if (roll[i].travel === undefined) continue; // the roll is over
      expect((roll[i].a - roll[i - 1].a) / 360 * ROLL_D * S, `frame ${i}`).toBeCloseTo(xs[i] - xs[i - 1], 6);
    }
    expect((xs.at(-1) - x0) / S).toBeCloseTo(travel, 6);
    expect(seen.bad).toEqual([]);
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
    // her faces' arm poses as words of their own, under any face (托腮 with a happy face): a finger to her chin, a fist,
    // the notebook, fingertips together; standing, seated and walking alike, gone again before the gesture ends
    for (const [w, pose, R] of [['muse', 'chin', 'bookside'], ['fist', 'fist', 'bookside'], ['jot', 'write', 'write'], ['twiddle', 'shy', 'shy']]) {
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
    for (const [w, R] of [['raise', 'bookside'], ['thumbs', 'bookside'], ['shush', 'bookside'], ['wipe', 'bookside'], ['shrug', 'shrug'], ['headhold', 'headhold']]) {
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
  it('has a drawing (or the plain arms\' way) for every arm gesture, and draws only words the kit has', () => {
    const words = new Set(ALL_WORDS);
    for (const g of [...Object.keys(ARM_ONE), ...Object.keys(ARM_BOTH), ...GESTURES]) expect(words.has(g), g).toBe(true);
    for (const pose of [...Object.values(ARM_ONE), ...Object.values(ARM_BOTH)]) expect(ARM_FALLBACK[pose], pose).toBeTruthy();
    for (const pose of [...Object.values(FACE_ARMS), ...Object.values(POSE_ALT).flat(), ...Object.values(ARM_TWIN)]) expect(ARM_POSES, pose).toContain(pose);
    for (const pose of Object.values(ARM_TWIN)) expect(ARM_FALLBACK[pose], pose).toBeTruthy();
    for (const f of Object.keys(FACE_ARMS)) expect(ALL_FACES, f).toContain(f);
  });
  it('keeps no arm drawing, stand-in or plain-arms way that nothing asks for', () => {
    // asked for: by a gesture, by a face, or held (the book)
    const asked = new Set(['book', 'bookside', ...Object.values(ARM_ONE), ...Object.values(ARM_BOTH), ...Object.values(FACE_ARMS), ...Object.values(ARM_TWIN)]);
    for (const k of [...Object.keys(POSE_ALT), ...Object.keys(ARM_FALLBACK)]) expect(asked.has(k), k).toBe(true);
    for (const id of realPoses.filter(id => !WHOLE_POSES.includes(id))) expect(asked.has(id), `drawing ${id}`).toBe(true);
    expect(existsSync(new URL('tex/pose_offer.png', DIR))).toBe(false);
  });
  it('builds every arm drawing on its own turn and hand warp, and the whole-body ones off the standing tree', () => {
    const R = buildRig(SYNTH);
    expect(R.unknownParents).toEqual([]);
    for (const id of ARM_POSES) {
      const A = R.ARM[id];
      expect(A, id).toBeTruthy();
      // (a hand on her face or head rides the neck: NECK_POSES)
      expect(R.deformers[A.rot].parent, id).toBe(['cover', 'shush', 'wipe', 'headhold'].includes(id) ? 'neck' : 'waist');
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
  it('keeps every warp drawn through a frame that took no time, on our kit and on upstream\'s; a spring handed a number that is not finite holds (#87)', async () => {
    // on our kit a frame of dt 0 while she walks is skipped; upstream's (v0.1.17, a pack exported to it) leaves its
    // swing NaN for good after one, and she reads that as none. Either way every frame after it is whole
    const up = await upstreamKit('upstream-kit-v0.1.17-claude');
    for (const make of [createPet, up?.createPet].filter(Boolean)) {
      const { fig, seen } = stubFigure(SYNTH), el = () => ({ setAttribute() {}, innerHTML: '' });
      const at = make({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: BOUNDS });
      at.resize();
      run(at, .5);
      at.walkTo(at.pet.x + 300, false, 1);
      run(at, .3);
      at.step(0); at.render();
      run(at, .3);
      expect(seen.bad, make === createPet ? 'ours' : 'upstream').toEqual([]);
      if (make === createPet) expect(Number.isFinite(at.pet.swing)).toBe(true);
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // a spring handed a target or a dt that is not a number holds where it was, and goes on from there
      const s = spring(55, 7, 1.8);
      for (let i = 0; i < 10; i++) s.step(1, 1 / 60);
      const was = { x: s.x, v: s.v };
      for (const [target, dt] of [[NaN, 1 / 60], [Infinity, 1 / 60], [1, NaN], [1, Infinity]]) s.step(target, dt);
      expect({ x: s.x, v: s.v }).toEqual(was);
      expect(Number.isFinite(s.step(1, 1 / 60))).toBe(true);
      // her motion handed a frame that took no time (her figure.js clamps a clock that did not move to dt 0) draws
      // every warp, that frame and the ones after it
      const R = buildRig(SYNTH), motion = createMotion(SYNTH, R), caps = { pose: () => false, tex: () => true }, fc = FACES.neutral.f(0);
      for (const mode of ['walk', 'drag']) {
        let t = 1, out;
        for (let i = 0; i < 30; i++) out = motion.step(fc, { t: t += 1 / 60, mode, face: 'neutral', swing: 8 }, 1 / 60, caps);
        out = motion.step(fc, { t, mode, face: 'neutral', swing: 8 }, 0, caps);
        expect(badValues(R, out), `${mode}, no time`).toEqual([]);
        for (let i = 0; i < 3; i++) out = motion.step(fc, { t: t += 1 / 60, mode, face: 'neutral', swing: 8 }, 1 / 60, caps);
        expect(badValues(R, out), mode).toEqual([]);
      }
    } finally { warn.mockRestore(); }
  });
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
  it('ships exactly the files model.json names under tex/ and feat/ (none missing, none left over)', () => {
    // the pack export copies the whole folder: a stale drawing would ship too
    const tex = new Set(real.parts.map(p => p.tex));
    const walk = o => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') { if (typeof o.tex === 'string') tex.add(o.tex); Object.values(o).forEach(walk); }
    };
    walk(real.poses);
    const feat = new Set(Object.keys(real.feat.sprites || {}));
    for (const [e, f] of Object.entries(real.feat.eyes)) for (const n of ['lash', 'ball', 'iris', 'rim']) if (f[n]) feat.add(`${e}_${n}`);
    const files = d => readdirSync(new URL(`${d}/`, DIR)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
    expect(files('tex')).toEqual([...tex].sort());
    expect(files('feat')).toEqual([...feat].sort());
  });
  it('leaves the side of her head on her right to the back hair: the fringe part stops well inside its outline', () => {
    // the head's parallax parts the two by up to ~5 units there; a fringe edge across the outline shows as a nick
    const part = id => ({ box: real.parts.find(p => p.id === id).box, ...alphaOf(new URL(`tex/${id}.png`, DIR)) });
    const hb = part('hair_back'), fr = part('bangs');
    const at = (t, x, y) => {
      const i = Math.floor((x - t.box[0]) * K), j = Math.floor((y - t.box[1]) * K);
      return i < 0 || j < 0 || i >= t.w || j >= t.h ? 0 : t.a[j * t.w + i];
    };
    let rows = 0;
    // from just under the top of the head (where the outline changes hands, nearly level) down past the brows
    for (let y = 38; y <= 74; y += .6) {
      let edge = null;
      for (let x = hb.box[0]; x < 128 && edge == null; x += 1 / K) if (at(hb, x, y) > 200) edge = x;
      if (edge == null) continue;
      rows++;
      for (let x = edge - 2; x < edge + 5; x += 1 / K) expect(at(fr, x, y), `fringe at ${x.toFixed(1)}, ${y.toFixed(1)}`).toBeLessThan(8);
    }
    expect(rows).toBeGreaterThan(50);
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
      for (const p of [...pose.required, ...(pose.overlays || []), ...(pose.face?.parts || [])]) texOk(new URL(`tex/${p.tex}.png`, DIR), p.box[2] * K, p.box[3] * K, `${id} ${p.tex}`);
      const A = R.ARM[id];
      if (!A) continue;
      // (both hands on her head, a hand raised high: the drawing may end well above the shoulder it turns about)
      expect(inside(A.pivot, A.rect, ['headhold', 'raise', 'wipe'].includes(id) ? 30 : 12), `${id} pivot`).toBe(true);
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
    expect(A.lie.spout).toBeUndefined();
    // kneeling: her head sits a little higher than the kit's seated sink
    expect(P.kneel.headDrop).toBeGreaterThan(0);
    expect(P.kneel.headDrop).toBeLessThanOrEqual(SIT_LOW);
    expect(A.kneelRaise).toBeCloseTo(SIT_LOW - P.kneel.headDrop, 1);
    expect(P.kneel.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
    // the ball rolls on its edge: a support sample every 5°, all within the ball
    expect(P.roll.support).toHaveLength(72);
    const rb = P.roll.required[0].box;
    for (const v of P.roll.support) expect(v > 0 && v <= Math.max(rb[2], rb[3]) * .6).toBe(true);
    expect(inside(P.roll.pivots.rollBall, [rb[0], rb[1], rb[0] + rb[2], rb[1] + rb[3]])).toBe(true);
    // curled up she is well under her standing height (232), and 'around' is the ball's own perimeter
    expect(rb[2]).toBeGreaterThan(130);
    expect(Math.max(rb[2], rb[3])).toBeLessThan(180);
    expect(P.roll.around).toBeGreaterThan(Math.PI * Math.min(rb[2], rb[3]) * .95);
    expect(P.roll.around).toBeLessThan(Math.PI * Math.max(rb[2], rb[3]) * 1.05);
    // at every turn the ball touches the floor: its lowest point is support[a] below the pivot
    const [, py] = P.roll.pivots.rollBall;
    expect(py + P.roll.support[0]).toBeCloseTo(256, 0);
    // her back stands on the floor, centred under her
    expect(P.back.pivots.backFlip).toEqual([128, 256]);
    const bb = P.back.required[0].box;
    expect(Math.abs(bb[1] + bb[3] - 256)).toBeLessThan(30);
    // ...in three pieces: the body on the flip, the hair on its warp over it and (filled on behind her) under it
    const bp = Object.fromEntries(P.back.required.map(p => [p.id, p]));
    expect(Object.keys(bp).sort()).toEqual(['back_body', 'back_hair', 'back_hair_under']);
    expect(bp.back_body.parent).toBe('backFlip');
    expect([bp.back_hair.parent, bp.back_hair_under.parent]).toEqual(['backHair', 'backHair']);
    expect(bp.back_hair_under.z).toBeLessThan(bp.back_body.z);
    expect(bp.back_hair.z).toBeGreaterThan(bp.back_body.z);
    expect(bp.back_hair_under.under).toBe(true);
    // the warp starts at the nape (the head above it stays) and reaches the lowest tip
    const hr = P.back.rects.hair, hb = bp.back_hair.box, ub = bp.back_hair_under.box;
    expect(hr[1]).toBeGreaterThan(hb[1] + 60);
    expect(hr[3]).toBeCloseTo(Math.max(hb[1] + hb[3], ub[1] + ub[3]), 1);
    expect(hr[0]).toBeLessThanOrEqual(Math.min(hb[0], ub[0]) + .01);
    expect(hr[2]).toBeGreaterThanOrEqual(Math.max(hb[0] + hb[2], ub[0] + ub[2]) - .01);
    expect(R.deformers.backHair.rect).toEqual(hr);
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
    // she goes down as the standing rig, and the kneeling drawing takes over from it (never the seated body between)
    pet.doWord('kneel');
    for (let i = 0; i < 180; i++) { run(pet, 1 / 60); expect(alpha('sit_skirt')).toBe(0); }
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
    expect([alpha('back_hair'), alpha('back_hair_under')]).toEqual([1, 1]);
    // the back hair sways from the nape; the head and her body (on the flip, not the warp) stay put
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
  it('hands over between bodies at the sit\'s cut, with a margin either way, never half in between', () => {
    expect(bodyWant('stand', SIT_CUT.down - .01, { sitOK: true })).toBe('stand');
    expect(bodyWant('stand', SIT_CUT.down + .01, { sitOK: true })).toBe('sit');
    expect(bodyWant('sit', SIT_CUT.down - .01, { sitOK: true })).toBe('sit');
    expect(bodyWant('sit', SIT_CUT.up - .01, { sitOK: true })).toBe('stand');
    expect(bodyWant('stand', 1, { kneel: true })).toBe('kneel');
    expect(bodyWant('stand', 1, { kneel: true, sitOK: true })).toBe('kneel');
    // no seated drawing: she stays the standing rig
    expect(bodyWant('stand', 1)).toBe('stand');
    // the upper body of the two dissolves; the lower stays opaque under it, so the two never both show part-way
    let B = { from: 'stand', to: 'stand', x: 1 };
    expect(bodyAlphas(B)).toEqual({ stand: 1, sit: 0, kneelArms: 0, kneel: 0 });
    for (const [want, up] of [['sit', 'sit'], ['kneel', 'kneel'], ['sit', 'kneel'], ['stand', 'sit']]) {
      let frames = 0;
      do {
        B = bodyStep(B, want, 1 / 120);
        const a = bodyAlphas(B), part = Object.values(a).filter(v => v > 0 && v < 1);
        expect(part.length, want).toBeLessThanOrEqual(1);
        if (part.length) expect(a[up], want).toBe(part[0]);
        frames++;
      } while (B.x < 1);
      expect(frames / 120, want).toBeLessThanOrEqual(BODY_CUT + 1e-9);
      expect(bodyAlphas(B)[want]).toBe(1);
    }
    // a change of mind halfway runs the hand-over back from where it is
    B = bodyStep({ from: 'stand', to: 'sit', x: .3 }, 'stand', 0);
    expect(B).toEqual({ from: 'sit', to: 'stand', x: .7 });
  });
  it('bows deep: the upper body foreshortens and drops, the head drops further and pitches down', () => {
    expect(bowPose(0)).toEqual({ pitch: 0, neckTy: 0, neckSy: 1, neckSx: 1, waistSy: 1, waistSx: 1, waistTy: 0 });
    const b = bowPose(1);
    expect(b.pitch).toBeGreaterThan(.9);
    expect(b.waistSy).toBeLessThan(.85);
    expect(b.neckTy).toBeGreaterThan(5);
    expect(bowPose(2)).toEqual(b);
  });
  it.skipIf(!real)('on the real rig: a bow drops her head a good way while the skirt stays, and sitting or kneeling is a clean cut', () => {
    const { fig, R: RR, seen } = stubFigure(real);
    const pet = barePet(fig);
    // (a standing part with no alpha set is drawn whole)
    const alpha = id => seen.last.st.alpha[id] ?? (RR.STANDING[id] ? 1 : 0);
    const chin = () => pointOf(RR.deformers, 'headMid', seen.last.st, 128, RR.HEAD[3] - 20)[1];
    const hem = () => pointOf(RR.deformers, 'skirt', seen.last.st, 128, RR.SKIRT[3])[1];
    run(pet, 1);
    const [c0, h0] = [chin(), hem()];
    pet.doWord('bow');
    let deep = 0;
    for (let i = 0; i < 96; i++) { run(pet, 1 / 60); deep = Math.max(deep, chin() - c0); expect(Math.abs(hem() - h0)).toBeLessThan(1); }
    expect(deep).toBeGreaterThan(12);
    run(pet, 1);
    // down, up, down kneeling, and up again through the seated body: the standing skirt is opaque whenever the pool
    // is part-way, the seated body (or the standing one) whenever the kneeling drawing is, and each cut takes a frame
    const parts = ['skirt', 'sit_skirt', 'sit_top', 'kneel_body'];
    // (kneeling, the whole standing rig is hidden under the drawing: hideFront)
    const ends = { sit: [0, 1, 1, 0], stand: [1, 0, 0, 0], kneel: [1, 0, 0, 1] };
    for (const [w, secs] of [['sit', 2], ['stand', 4], ['kneel', 2], ['sit', 1], ['stand', 4]]) {
      pet.doWord(w);
      let mixed = 0;
      for (let i = 0; i < secs * 60; i++) {
        run(pet, 1 / 60);
        const [sk, pool, , kn] = parts.map(alpha);
        if (pool > 0 && pool < 1) { expect(sk, w).toBe(1); mixed++; }
        if (kn > 0 && kn < 1) { expect(Math.max(sk, pool), w).toBe(1); mixed++; }
      }
      expect(mixed, w).toBeLessThanOrEqual(1);
      expect(parts.map(alpha), w).toEqual(ends[w]);
      expect(seen.last.hideFront, w).toBe(w === 'kneel');
    }
    expect(seen.bad).toEqual([]);
  });
  it.skipIf(!real)('on the real rig: lying down and getting up (jump or stand), the lying drawing cuts, never two of her at once', () => {
    const { fig, seen } = stubFigure(real);
    const pet = barePet(fig);
    run(pet, 1);
    for (const up of ['jump', 'stand']) {
      let both = 0;
      pet.doWord('lie');
      for (let i = 0; i < 3 * 60; i++) { run(pet, 1 / 60); if (seen.last.poseShown > 0 && !seen.last.hideFront) both++; }
      expect(seen.last.hideFront, up).toBe(true);
      pet.doWord(up);
      for (let i = 0; i < 3 * 60; i++) { run(pet, 1 / 60); if (seen.last.poseShown > 0 && !seen.last.hideFront) both++; }
      expect(seen.last.poseShown, up).toBe(0);
      // (a frame each way at most)
      expect(both, up).toBeLessThanOrEqual(2);
    }
    expect(seen.bad).toEqual([]);
  });
  it.skipIf(!real)('on the real rig: getting up from a kneel she stays the kneeling drawing until she stands, never the seated one', () => {
    const { fig, R: RR, seen } = stubFigure(real);
    const pet = barePet(fig);
    const alpha = id => seen.last.st.alpha[id] ?? (RR.STANDING[id] ? 1 : 0);
    run(pet, 1);
    pet.doWord('kneel');
    run(pet, 2);
    expect(alpha('kneel_body')).toBe(1);
    pet.doWord('stand');
    let seated = 0;
    for (let i = 0; i < 4 * 60; i++) { run(pet, 1 / 60); seated = Math.max(seated, alpha('sit_top'), alpha('sit_skirt')); }
    expect(seated).toBe(0);
    expect(alpha('kneel_body')).toBe(0);
    expect(alpha('skirt')).toBe(1);
    expect(seen.bad).toEqual([]);
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
  it('cries small drops (tearDrop, the kit\'s): about a quarter of an eye across, sliding from under each eye to the face\'s outline', async () => {
    const fig = await make(), R = buildRig(real), td = tearDropOf(real, R), A = anchorsOf(real, R);
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
  it('lies with the lying drawing, rolls with the ball, and has her back', async () => {
    const fig = await make();
    expect(fig.poses).toEqual({ lie: true, back: true });
    expect(fig.roll).toBeUndefined();
    expect(fig.gestures).toContain('roll');
    expect(fig.anchors.lie.hit).toEqual(real.poses.lie.anchors.hit);
    // (kneeling she raises the kit's points herself, by her motion's sitRaise: the kit adds no kneelRaise)
    expect(fig.anchors.kneelRaise).toBe(0);
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

describe('Claude-chan: a head gesture beside the arms\' one, kneeling, and faces made of others', () => {
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
});

/* ---------- kneeling with her arms posed (the four girls share these: tests/helpers/kneel-arms.js) ---------- */
describeKneelArms('Claude-chan', {
  dir: DIR, M: KneelMotion, GESTURES,
  make: async (missing = []) => {
    const model = JSON.parse(readFileSync(new URL('model.json', DIR), 'utf8')), doc = globalThis.document;
    globalThis.document = { createElement: () => recCanvas(), createElementNS: () => recCanvas() };
    try {
      return await createClaudeFigure(DIR, {
        model, asset: p => String(p),
        loadImage: url => (missing.some(n => String(url).endsWith(`tex/${n}.png`)) ? Promise.reject(new Error('missing')) : Promise.resolve({ url })),
      });
    } finally { globalThis.document = doc; }
  },
});

/* ---------- live faces on the kneeling and lying drawings (the four girls share these: tests/helpers/floor-face.js) ---------- */
describeFloorFace('Claude-chan', { dir: DIR, M: KneelMotion, F: FaceModule, GESTURES });

/* ---------- arm drawings cut in for each other, never half seen at once (the four girls share these: tests/helpers/arm-cut.js) ---------- */
describeArmCut('Claude-chan', { dir: DIR, M: KneelMotion, GESTURES });
