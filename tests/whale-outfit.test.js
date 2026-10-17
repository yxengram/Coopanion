// The whale's outfits (the pack's second axis, `<scheme>-<outfit>`): the maid dress and upstream's winter outfit (cape),
// as her own figure.js draws them without a GPU (its rig keeps the last frame's states and the tree it was built with).
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rigSeen = vi.hoisted(() => ({ st: null, tree: null, up: [], rigs: 0, disposed: 0, hidden: null }));
vi.mock('../packages/cortico-world-desktop-pet/web/kit/rig.js', () => ({
  createRig: (_canvas, tree) => (rigSeen.tree = tree, rigSeen.rigs++, {
    upload(n) { rigSeen.up.push(n); }, render(st, o) { rigSeen.st = st; rigSeen.hidden = o?.hidden ?? null; }, point: (_d, _st, x, y) => [x, y], dispose() { rigSeen.disposed++; },
  }),
}));

import { createWhaleFigure, hinge, pickOf, posePaths, ballLift, BOTH_HANDS, NEAR_RAISES } from '../packages/cortico-world-desktop-pet/web/whale/figure.js';
import { createPet, FACES } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { upstreamKit } from './helpers/upstream-kit.js';
import { packFiles } from '../packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs';

const WHALE = new URL('../packages/cortico-world-desktop-pet/web/whale/', import.meta.url);
const model = JSON.parse(readFileSync(new URL('model.json', WHALE), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('figure.json', WHALE), 'utf8'));
const CAPE = model.outfits.find(o => o.id === 'cape');
const SCHEMES = model.schemes.map(s => s.id);
/** Every pose part (model.poses: lying, kneeling, the back, the ball, the drawn arms and the floor faces' parts). */
const POSE_PARTS = Object.values(model.poses).flatMap(P => [...(P.required || []), ...(P.overlays || []), ...(P.face?.parts || []),
  ...Object.values(P.arms || {}).flatMap(a => a.required)]);
const POSE_TEX = new Set(POSE_PARTS.map(p => p.tex));
/** The arm drawings (every pose part drawn as `arm_*`, the standing rig's arms not among them), in model.poses' order. */
const ARM_TEX = [...new Set(POSE_PARTS.map(p => p.tex).filter(t => t.startsWith('arm_')))];
const ARM_IDS = new Set(POSE_PARTS.filter(p => p.tex.startsWith('arm_')).map(p => p.id));
/** The whole-body drawings (lying, kneeling and its hybrid, the back, the ball, the floor faces): one file per scheme in the winter outfit. */
const BODY_TEX = [...POSE_TEX].filter(t => !t.startsWith('arm_'));
const BODY_IDS = new Set(POSE_PARTS.filter(p => !p.tex.startsWith('arm_')).map(p => p.id));
/** A pose part's box in the winter outfit (its own `poseParts` box where it has one, else the pose's). */
const capeBox = p => CAPE.poseParts?.[p.id]?.box ?? p.box;
/** Texture pixels per rig unit (the master's DS over the rig's S), as the maid files are cut. */
const TEX_PER_UNIT = model.units.DS / model.units.S;
/** Each arm word and the pose (model.poses) that draws it. */
const ARM_WORDS = { wave: 'wave', cheer: 'cheer', heart: 'heart', muse: 'chin', ...BOTH_HANDS, ...NEAR_RAISES };
/** The pixels of an 8-bit RGBA, non-interlaced PNG: { w, h, px } (4 bytes a pixel), as tests/whale-pose.test.js reads them. */
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
/** Width, height, bit depth, colour type and interlacing of a PNG, from its header. */
function png(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25], interlace: b[28] };
}

// a do-nothing stand-in for whatever DOM or 2D canvas call the figure makes (numbers read as 0)
const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
/** As the app loads her textures: a file that is not in the package fails (the figure then does without that pose). */
const loadImage = async url => {
  const p = String(url);
  if (!existsSync(new URL(p, WHALE))) throw new Error(`no ${p}`);
  return { width: 1, height: 1, src: p };
};
const asset = p => p;
async function figureIn(scheme, load = loadImage) {
  const doc = globalThis.document;
  globalThis.document = { createElement: () => any, createElementNS: () => any };
  const loads = [];
  try {
    const fig = await createWhaleFigure(WHALE, { model, scheme, asset, loadImage: async u => { loads.push(String(u)); return load(u); } });
    return { fig, loads, done: () => { globalThis.document = doc; } };
  } catch (e) { globalThis.document = doc; throw e; }
}
/** Her figure on the kit's body (plus, or the `make` of another kit: upstream's v0.1.17 for the exported pack). */
async function onKit(scheme, make = createPet, load) {
  const { fig, loads, done } = await figureIn(scheme, load);
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
  const figure = { ...fig, draw: (g, fc, o) => fig.draw(g, fc, o) };
  for (const k of ['anchors', 'poses', 'kneelArms', 'kneelArmsK', 'scheme']) Object.defineProperty(figure, k, { get: () => fig[k] });
  const pet = make({ petG, shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
  pet.resize();
  const run = (s, each = () => {}) => { for (let i = 0; i < Math.round(s * 60); i++) { pet.step(1 / 60); pet.render(); each(rigSeen.st); } };
  return { pet, run, fig, loads, done };
}
/** What in a frame's deformer states is not a finite number: the rotations and moves, and each warp at its corners and middle. */
function notFinite(tree, st) {
  const bad = [];
  for (const [id, s] of Object.entries(st)) {
    if (typeof s !== 'object' || !s || id === 'alpha') continue;
    for (const k of ['a', 'tx', 'ty', 'sx', 'sy']) if (k in s && !Number.isFinite(s[k])) bad.push(`${id}.${k}`);
    if (!s.fn) continue;
    const [x0, y0, x1, y1] = tree.deformers[id]?.rect ?? [0, 0, 256, 256];
    for (const [u, v] of [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]]) if (!s.fn(u, v, x0 + u * (x1 - x0), y0 + v * (y1 - y0)).every(Number.isFinite)) bad.push(`${id}.fn`);
  }
  return bad;
}

// the kit's idle fidgets (a look round, a hop) are random: seeded, every run sees the same ones
const random = Math.random;
beforeEach(() => { let seed = 11; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); });
afterEach(() => { Math.random = random; });

describe('the whale\'s outfits: `<scheme>-<outfit>`', () => {
  it('reads a look as its scheme and outfit: a bare scheme is the maid dress, an unknown part the first option of its axis', () => {
    expect(pickOf(model, 'claude')).toEqual({ scheme: 'claude', outfit: 'maid' });
    expect(pickOf(model, 'claude-cape')).toEqual({ scheme: 'claude', outfit: 'cape' });
    expect(pickOf(model, 'qwen-maid')).toEqual({ scheme: 'qwen', outfit: 'maid' });
    // (another version's outfit or scheme: the first option, never the whole string taken as a scheme)
    expect(pickOf(model, 'claude-tuxedo')).toEqual({ scheme: 'claude', outfit: 'maid' });
    expect(pickOf(model, 'nope-cape')).toEqual({ scheme: 'deepseek', outfit: 'cape' });
    for (const id of [undefined, '', null]) expect(pickOf(model, id)).toEqual({ scheme: 'deepseek', outfit: 'maid' });
    // a model without outfits (an older one) is all maid dress
    expect(pickOf({ schemes: model.schemes }, 'kimi-cape')).toEqual({ scheme: 'kimi', outfit: 'maid' });
  });

  it('is a second axis of the pack: 服装 with the maid dress and the winter outfit, every preset in the maid dress', () => {
    expect(manifest.axes.map(a => a.id)).toEqual(['scheme', 'outfit']);
    expect(manifest.axes[1]).toMatchObject({ name: { zh: '服装' }, options: [{ id: 'maid', name: { zh: '女仆装' }, thumb: 'thumbs/maid.png' }, { id: 'cape', name: { zh: '冬装' }, thumb: 'thumbs/cape.png' }] });
    expect(manifest.axes[1].options.map(o => o.id)).toEqual(model.outfits.map(o => o.id));
    for (const p of manifest.presets) expect(p.pick, p.id).toEqual({ scheme: p.id, outfit: 'maid' });
    // the World reads it (a preset missing the outfit would fail the whole pack)
    const read = readManifest(fileURLToPath(WHALE), true);
    expect(typeof read === 'string' ? read : null).toBeNull();
    expect(read.axes.map(a => a.id)).toEqual(['scheme', 'outfit']);
    // the about text describes both outfits and no vendor's mark
    expect(manifest.about.zh).toMatch(/女仆装.*冬装/);
    expect(JSON.stringify(manifest.about)).not.toMatch(/logo|标志|商标/i);
    // the outfit thumbnails are full-body pictures of 144×144, like upstream's
    for (const o of manifest.axes[1].options) {
      const b = readFileSync(new URL(o.thumb, WHALE));
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], o.id).toEqual([144, 144]);
    }
  });

  it('builds each outfit\'s parts: the winter outfit\'s own from outfits/cape/, the hair, face and tail kept, the maid\'s dress gone', async () => {
    const { fig, loads, done } = await figureIn('claude-cape');
    try {
      expect(fig.scheme).toBe('claude-cape');
      fig.draw({ setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' }, FACES.neutral.f(0),
        { t: 1, mode: 'idle', face: 'neutral', look: [0, 0], legs: [[104, 212, 104, 241], [150, 212, 150, 241]], low: 0, sit: 0, tilt: 0, lean: 0, facing: 1, swing: 0, gesture: null });
      const ids = rigSeen.tree.parts.map(p => p.id);
      for (const p of CAPE.parts) expect(ids, p.id).toContain(p.id);
      for (const id of ['torso_up', 'headdress', 'bow', 'waist_bow_front', 'waist_bow_sit_front', 'fin_near', 'fin_far', 'ahoge']) expect(ids).not.toContain(id);
      // the outfit's own textures are the outfit's files, the same in every scheme; what it keeps is the scheme's
      for (const p of CAPE.parts.filter(q => q.src)) { expect(p.src).toBe(`outfits/cape/${p.id}.png`); expect(loads).toContain(p.src); }
      for (const p of CAPE.parts.filter(q => !q.src)) expect(loads).toContain(`schemes/claude/tex/${p.tex}.png`);
      // its pendulums (the hood ties' pompoms swing freely, the scarf's ends half) and its own pivots for the hood's fins and spout
      const D = rigSeen.tree.deformers;
      expect(Object.fromEntries(Object.entries(CAPE.deformers).map(([k, d]) => [k, d.gain]))).toEqual({ tieNear: 1, tieFar: 1, scarfFront: .5, scarfBack: .5 });
      for (const [k, d] of Object.entries(CAPE.deformers)) expect(D[k]).toEqual({ kind: 'rot', parent: d.parent, pivot: d.pivot });
      for (const k of ['finNear', 'finFar', 'ahoge']) expect(D[k].pivot).toEqual(CAPE.pivots[k]);
      // the legs swing about the hip on the outfit's own boxes
      expect(D.legBack.rect).toEqual((([x, y, w, h]) => [x, y, x + w, y + h])(CAPE.parts.find(p => p.id === 'leg_back').box));
      // every pose's deformers are there as in the maid dress, so a drawing made for the outfit drops in
      for (const k of ['lie', 'lieHead', 'armWave', 'armChin', 'armCheerNear', 'armHeart', 'armCup', 'armCupLift', 'armScratch', 'backFlip', 'backTail', 'rollBall', 'kneel', 'kneelHead', 'kneelLow']) expect(D, k).toHaveProperty(k);
      for (const p of POSE_PARTS) expect(ids, p.id).toContain(p.id);
      // the pose drawings lie at the maid pose's depths, but for six the outfit lays at its own (poseZ): the hand over
      // her mouth and the finger at her lips cross the scarf's collar (6.2), so their near arm goes over it, and the fist
      // raised in front of her shoulder goes over the cape's shoulder fur (6.1), which showed beside its cuff (the sleeve
      // now covers most of it; a small puff still shows beside the sleeve); the arm
      // scratching her head and the salute go over the hood ties' pompoms (13.35), which would show through the fading
      // edge of the hand's copy over her head; the kneeling hybrid's lower body (its cloak drawn whole from the shoulders
      // down) goes under the far arm's cuff (5.1) and the near arm (6), over the hidden cloak's place
      expect(CAPE.poseZ).toEqual({ arm_shush: 6.25, arm_cover: 6.25, arm_fist: 6.25, arm_scratch: 13.4, arm_salute: 13.4, kneel_low: 5.08 });
      const z = Object.fromEntries(rigSeen.tree.parts.map(p => [p.id, p.z])), maidZ = Object.fromEntries(POSE_PARTS.map(p => [p.id, p.z]));
      for (const p of POSE_PARTS) expect(z[p.id], p.id).toBe(CAPE.poseZ[p.id] ?? maidZ[p.id]);
      expect(z.arm_shush).toBeGreaterThan(z.scarf_neck);
      expect(z.arm_shush).toBeLessThan(z.sidelocks);
      expect(z.arm_scratch).toBeGreaterThan(z.hood_tie_near);
      expect(z.arm_scratch).toBeLessThan(z.arm_scratch_top);
      expect(z.kneel_low).toBeGreaterThan(z.skirt);
      expect(z.kneel_low).toBeLessThan(Math.min(z.arm_far_end_front, z.arm_near, z.arm_wave));
      // the floor faces' blank and fringe are cut from the outfit's own drawings, wider or narrower than the maid's: their
      // own boxes there (poseParts), on the same deformers and meshes; the live face's box and placement stay the pose's
      expect(Object.keys(CAPE.poseParts).sort()).toEqual(['kneel_blank', 'kneel_fringe', 'lie_blank']);
      const tree = Object.fromEntries(rigSeen.tree.parts.map(p => [p.id, p]));
      for (const p of POSE_PARTS) {
        expect(tree[p.id].box, p.id).toEqual(capeBox(p));
        expect(tree[p.id].grid, p.id).toEqual(p.grid);
      }
      for (const id of ['kneel', 'lie']) expect(tree[`${id}_live`].box).toEqual(model.poses[id].face.box);
    } finally { done(); }
  });

  it('never shows a maid drawing on the winter outfit: it has its own arm drawings (one file for every scheme) and whole-body drawings (one per scheme)', async () => {
    // where a pose texture comes from: the maid's in its scheme's tex/; an outfit's only as its `poses` lists it
    expect(posePaths(model, 'deepseek', 'maid', 'arm_wave')).toEqual(['tex/arm_wave.png']);
    expect(posePaths(model, 'claude', 'maid', 'kneel_body')).toEqual(['schemes/claude/tex/kneel_body.png']);
    expect(posePaths(model, 'claude', 'cape', 'arm_wave')).toEqual(['outfits/cape/poses/arm_wave.png']);
    expect(posePaths(model, 'claude', 'cape', 'kneel_body')).toEqual(['outfits/cape/schemes/claude/poses/kneel_body.png', 'outfits/cape/poses/kneel_body.png']);
    expect(posePaths(model, 'deepseek', 'cape', 'lie_body')[0]).toBe('outfits/cape/schemes/deepseek/poses/lie_body.png');
    // a texture an outfit does not list is not drawn there
    const bare = { ...model, outfits: model.outfits.map(o => (o.id === 'cape' ? { ...o, poses: { arm_wave: 'shared' } } : o)) };
    expect(posePaths(bare, 'claude', 'cape', 'lie_body')).toEqual([]);
    // the winter outfit lists every pose drawing, in model.poses' order: the arms one shared file each (its sleeves are
    // the same in every scheme), the whole-body drawings (lying, kneeling and its hybrid, the back, the ball, the floor
    // faces and the eyes-shut, smile and talk patches) one per scheme (her hair, eyes, skin and tail take its colours)
    expect(CAPE.poses).toEqual(Object.fromEntries([...POSE_TEX].map(t => [t, t.startsWith('arm_') ? 'shared' : 'scheme'])));
    expect([ARM_TEX.length, BODY_TEX.length]).toEqual([41, 16]);
    // (her fist, notebook and fingertips (加油, 记笔记, 对手指) among them: drawn in the winter sleeves, not the maid's files)
    for (const t of ['arm_fist', 'arm_fist_top', 'arm_jot', 'arm_twiddle']) {
      expect(CAPE.poses[t], t).toBe('shared');
      expect(readFileSync(new URL(`outfits/cape/poses/${t}.png`, WHALE)).equals(readFileSync(new URL(`tex/${t}.png`, WHALE))), t).toBe(false);
    }
    for (const sc of ['deepseek', 'claude']) {
      const { fig, loads, done } = await figureIn(`${sc}-cape`);
      try {
        // every pose texture it loads is the outfit's own, and no maid file (tex/, schemes/<id>/tex/)
        const poseLoads = loads.filter(u => POSE_TEX.has(u.split('/').pop().replace(/\.png$/, '')));
        expect(poseLoads.sort()).toEqual([...ARM_TEX.map(t => `outfits/cape/poses/${t}.png`), ...BODY_TEX.map(t => `outfits/cape/schemes/${sc}/poses/${t}.png`)].sort());
        expect(loads.filter(u => /(^|\/)tex\/(arm_(?!far|near)|lie_|kneel_|back_|roll_)/.test(u))).toEqual([]);
        // she lies and turns her back in it, and kneels with her arms posed on the kneeling hybrid
        expect(fig.poses).toEqual({ lie: true, back: true });
        expect(fig.kneelArms).toBe(true);
      } finally { done(); }
    }
    // (the maid dress has every pose too)
    const { fig, done } = await figureIn('claude');
    try { expect(fig.poses).toEqual({ lie: true, back: true }); expect(fig.kneelArms).toBe(true); } finally { done(); }
  });

  it('has a file for each of its arm drawings, an 8-bit RGBA PNG the maid drawing\'s size, so the pose\'s box, pivots and anchors hold', () => {
    for (const t of ARM_TEX) {
      const cape = png(new URL(`outfits/cape/poses/${t}.png`, WHALE)), maid = png(new URL(`tex/${t}.png`, WHALE));
      expect([cape.depth, cape.colorType, cape.interlace], t).toEqual([8, 6, 0]);
      expect([cape.w, cape.h], t).toEqual([maid.w, maid.h]);
    }
  });

  it('has each whole-body drawing in all 8 schemes: an 8-bit RGBA PNG sized to its box, the same shape in every scheme (only her colours change)', () => {
    expect(SCHEMES.length).toBe(8);
    for (const p of POSE_PARTS.filter(q => BODY_IDS.has(q.id))) {
      const [, , bw, bh] = capeBox(p);
      let first = null;
      for (const sc of SCHEMES) {
        const url = new URL(`outfits/cape/schemes/${sc}/poses/${p.tex}.png`, WHALE), head = png(url);
        expect([head.depth, head.colorType, head.interlace], `${sc} ${p.tex}`).toEqual([8, 6, 0]);
        expect(Math.abs(head.w - bw * TEX_PER_UNIT), `${sc} ${p.tex} width`).toBeLessThanOrEqual(2);
        expect(Math.abs(head.h - bh * TEX_PER_UNIT), `${sc} ${p.tex} height`).toBeLessThanOrEqual(2);
        // (the recolour keeps every pixel's coverage: the outline, holes and edges are deepseek's)
        const { w, h, px } = rgbaOf(url), a = px.filter((_, i) => i % 4 === 3);
        if (!first) first = { w, h, a };
        else {
          expect([w, h], `${sc} ${p.tex}`).toEqual([first.w, first.h]);
          let off = 0;
          for (let i = 0; i < a.length; i++) if (a[i] !== first.a[i]) off++;
          expect(off, `${sc} ${p.tex} alpha`).toBe(0);
        }
      }
    }
    // the cape lies in the maid's box (her drawing, 4 rows taller at the top for the hood's spout, and the maid's padded
    // the same), and the kneeling hybrid is the kneeling drawing's size; the floor faces' own boxes are the cape's cuts
    expect(model.poses.lie.required.find(p => p.id === 'lie_body').box).toEqual([9.6, 105.13, 236.96, 151.03]);
    for (const sc of SCHEMES) {
      expect([png(new URL(`outfits/cape/schemes/${sc}/poses/lie_body.png`, WHALE)).h, png(new URL(`${sc === 'deepseek' ? '' : `schemes/${sc}/`}tex/lie_body.png`, WHALE)).h], sc).toEqual([477, 477]);
    }
  });

  it('keeps only her winter clothes in those drawings: no maid apron, shirt or bow left around the arms, no sleeve cut by the canvas, no navy fade over the hair', () => {
    const at = (t, x, y) => { const { w, px } = rgbaOf(new URL(`outfits/cape/poses/${t}.png`, WHALE)); return px[(y * w + x) * 4 + 3]; };
    // spots (texture pixels) where the maid drawing showed her dress around the forearms, now open: the cloak shows there
    const DRESS = {
      arm_cross: [[30, 55], [13, 53]],        // the apron waistband and a knot of its bow at the elbow
      arm_pray: [[80, 106]],                  // the bib's top between the forearms
      arm_heart: [[92, 59], [105, 60]],       // the shirt front and its collar tab between the cuffs
      arm_clap: [[110, 85]],                  // the bib under the hands
      arm_clapo: [[97, 64]],                  // the bib / shirt block beside the left palm
      arm_book: [[110, 95]], arm_cup: [[110, 72]],                    // the bib under the book, the mug
      arm_cover: [[9, 128], [32, 61]],        // the waistband's end, the shirt at the cuff
      arm_curtsy: [[15, 25], [215, 80]], arm_hips: [[12, 62], [195, 40]],   // the apron bow's loop, the apron's edge
      arm_shush: [[46, 70]], arm_headhold: [[263, 62]],
    };
    for (const [t, pts] of Object.entries(DRESS)) for (const [x, y] of pts) expect(at(t, x, y), `${t} (${x}, ${y})`).toBe(0);
    // the hands are all there: every opaque skin pixel of the maid drawing is opaque in the winter one (fur may cover it)
    for (const t of ARM_TEX) {
      const m = rgbaOf(new URL(`tex/${t}.png`, WHALE)), c = rgbaOf(new URL(`outfits/cape/poses/${t}.png`, WHALE));
      let skin = 0, kept = 0;
      for (let i = 0; i < m.w * m.h; i++) {
        const [r, g, b, a] = m.px.subarray(i * 4, i * 4 + 4);
        if (r > 200 && g > 150 && b > 120 && r - b > 25 && a > 200) { skin++; if (c.px[i * 4 + 3] > 128) kept++; }
      }
      expect(kept / skin, t).toBeGreaterThan(.99);
    }
    // the clap's right cuff ends inside its canvas (rounded and inked), not cut by the canvas edge
    const clap = rgbaOf(new URL('outfits/cape/poses/arm_clap.png', WHALE));
    for (let y = 0; y < clap.h; y++) for (let x = 161; x < clap.w; x++) expect(clap.px[(y * clap.w + x) * 4 + 3], `clap (${x}, ${y})`).toBeLessThan(8);
    // sleeves that faded out over the hair end at the cuff instead (stretch, the _top copies) or in a rounded, inked end (headhold)
    for (const [t, x, y] of [['arm_stretch', 16, 106], ['arm_cheer_near_top', 119, 94], ['arm_cheer_far_top', 69, 94], ['arm_vsign_top', 11, 111], ['arm_wave_top', 45, 117]])
      expect(at(t, x, y), `${t} (${x}, ${y})`).toBe(0);
    const hh = rgbaOf(new URL('outfits/cape/poses/arm_headhold.png', WHALE));
    expect(Math.max(...[...hh.px].filter((_, i) => i % 4 === 3 && Math.floor(i / 4 / hh.w) >= 199))).toBe(0);
    // (no navy fade over the hair: in the sleeves' last 20 rows only their antialiased edges are half there; a fade had
    // about a hundred half-transparent pixels a row)
    let half = 0;
    for (let y = 179; y < 199; y++) for (let x = 0; x < hh.w; x++) { const a = hh.px[(y * hh.w + x) * 4 + 3]; if (a > 0 && a < 200) half++; }
    expect(half).toBeLessThan(200);
  });

  /** Plays every word of hers in a look; which pose parts each one shows (`<word>:<part id>`), and any non-finite state. */
  async function everyWord(look) {
    const { pet, run, done } = await onKit(look);
    try {
      run(.5);
      const shown = new Set(), bad = [];
      for (const w of manifest.vocab.map(v => v.id)) {
        // (as the World does: a word is played, it says whether it was taken; in either outfit every one is)
        expect(pet.doWord(w), `${look} ${w}`).toBe(true);
        run(w === 'kneel' || w === 'lie' || w === 'sit' ? 2.5 : 1.2, st => {
          for (const p of POSE_PARTS) if ((st.alpha[p.id] ?? 0) > 0) shown.add(`${w}:${p.id}`);
          bad.push(...notFinite(rigSeen.tree, st).map(b => `${w}:${b}`));
        });
        pet.doWord('stand'); run(1.5);
      }
      return { shown, bad: [...new Set(bad)] };
    } finally { done(); }
  }

  it('does every word of hers in the winter outfit with its own drawings: each word shows the drawing it shows in the maid dress', async () => {
    const cape = await everyWord('deepseek-cape'), maid = await everyWord('deepseek');
    expect(cape.bad).toEqual([]);
    // lying, kneeling, the back (turning, spinning, turning away) and the ball: the same whole-body drawings, word by word
    const body = set => [...set].filter(s => BODY_IDS.has(s.split(':')[1])).sort();
    expect(body(cape.shown)).toEqual(body(maid.shown));
    for (const [w, id] of [['kneel', 'kneel_body'], ['lie', 'lie_body'], ['lie', 'lie_blank'], ['lie', 'lie_fringe'], ['kneel', 'kneel_blank'], ['kneel', 'kneel_fringe'], ['turn', 'back_body'], ['spin', 'back_body'], ['away', 'back_body'], ['roll', 'roll_ball']])
      expect(cape.shown, `${w} shows ${id}`).toContain(`${w}:${id}`);
    // each arm gesture shows its own drawing (the clap its hands together), and musing her hand under her chin
    for (const [w, pose] of Object.entries(ARM_WORDS)) {
      const P = model.poses[pose], first = P.arms ? Object.values(P.arms).map(a => a.required[0].id) : [P.required[0].id];
      for (const id of first) expect(cape.shown, `${w} shows ${id}`).toContain(`${w}:${id}`);
    }
    expect([...cape.shown].filter(s => ARM_IDS.has(s.split(':')[1])).sort()).toEqual([...maid.shown].filter(s => ARM_IDS.has(s.split(':')[1])).sort());
  });

  it('kneels with her arms posed on the kneeling hybrid: its lower body drawn with the whole cloak, the live cloak and scarf ends hidden', async () => {
    expect(CAPE.kneelLowHides).toEqual(['cloak', 'scarf_tail_front', 'scarf_tail_back']);
    const { pet, run, done } = await onKit('deepseek-cape');
    try {
      run(.5);
      pet.doWord('kneel'); run(2.5);
      expect(rigSeen.st.alpha.kneel_body).toBe(1);
      expect(rigSeen.st.alpha.kneel_live).toBe(1);
      expect(rigSeen.st.alpha.kneel_low).toBe(0);
      // (a kneel and an arm gesture at once stay together: she waves kneeling, with the drawn arm over the hybrid)
      for (const g of [['kneel', 'wave'], ['kneel', 'heart']]) {
        pet.doGroup(g);
        let A = null;
        const arm0 = model.poses[g[1]].required[0].id;
        run(2.5, st => { if (!A && st.alpha.kneel_low === 1 && st.alpha[arm0] === 1) A = { ...st.alpha }; });
        expect(A, g.join('+')).not.toBeNull();
        expect(pet.pet.kneel).toBe(true);
        expect(A.kneel_body).toBe(0);
        for (const id of [...CAPE.kneelLowHides, 'skirt', 'skirt_sit', 'tail']) expect(A[id], `${g} hides ${id}`).toBe(0);
        // the upper body is the live rig: the hood, the scarf's collar and the shoulder's fur
        for (const id of ['hood_front', 'scarf_neck', 'cloak_shoulder_cover']) expect([undefined, 1], id).toContain(A[id]);
        pet.doWord('kneel'); run(1.5);
      }
    } finally { done(); }
    // and what the hybrid hid comes back with her standing (the frame's alphas carry over: the cloak, the scarf's ends and
    // the tail stayed hidden after a kneeling gesture), in the maid dress too (its tail)
    for (const [look, ids] of [['deepseek-cape', [...CAPE.kneelLowHides, 'tail']], ['deepseek', ['tail']]]) {
      const k = await onKit(look);
      try {
        k.run(.5);
        k.pet.doWord('kneel'); k.run(3); k.pet.doWord('kneel'); k.run(1.5);
        let low = 0, both = 0;
        // (the cheer's far arm, the one arm drawn under kneel_low's z, never shows over the hybrid: the hybrid has gone
        // before the arm comes up)
        k.pet.doWord('cheer'); k.run(1.5, st => { low = Math.max(low, st.alpha.kneel_low ?? 0); if ((st.alpha.kneel_low ?? 0) > 0 && (st.alpha.arm_cheer_far ?? 0) > 0) both++; });
        expect(low, look).toBe(1);
        expect(both, look).toBe(0);
        for (const id of ids) expect([undefined, 1], `${look} seated ${id}`).toContain(rigSeen.st.alpha[id]);
        k.pet.doWord('stand'); k.run(2);
        for (const id of ids) expect([undefined, 1], `${look} standing ${id}`).toContain(rigSeen.st.alpha[id]);
      } finally { k.done(); }
    }
  });

  it('cuts to another outfit in one frame, a rig of its parts built anew; another scheme in the same outfit still crossfades', async () => {
    const { pet, run, fig, done } = await onKit('deepseek');
    try {
      run(.5);
      const rigs = rigSeen.rigs;
      rigSeen.up.length = 0;
      const disposed = rigSeen.disposed;
      await fig.setScheme('deepseek-cape', { fade: .45 });
      expect(fig.scheme).toBe('deepseek-cape');
      // the old rig (its canvas) stays up until the frame that mounts the new one: no blank refresh in between
      expect(rigSeen.disposed).toBe(disposed);
      run(1 / 60);
      expect(rigSeen.disposed).toBe(disposed + 1);
      // the very next frame is the winter outfit, whole: a new rig, its textures uploaded as they are, no crossfade
      expect(rigSeen.rigs).toBe(rigs + 1);
      expect(rigSeen.tree.parts.map(p => p.id)).toContain('hood_front');
      expect(rigSeen.up).toContain('cape_hood_front');
      expect(rigSeen.up.filter(n => n.endsWith('@mix'))).toEqual([]);
      expect(rigSeen.st.mix).toBe(0);
      // a scheme within it crossfades (the outfit's own parts the same on both sides)
      rigSeen.up.length = 0;
      await fig.setScheme('claude-cape', { fade: .45 });
      run(.2);
      expect(rigSeen.rigs).toBe(rigs + 1);
      expect(rigSeen.up).toContain('hair_back@mix');
      expect(rigSeen.st.mix).toBeGreaterThan(0);
      expect(rigSeen.st.mix).toBeLessThan(1);
      run(.5);
      expect(fig.scheme).toBe('claude-cape');
      // and back to the maid dress, a cut again, with every pose
      await fig.setScheme('claude', { fade: .45 });
      run(1 / 60);
      expect(fig.scheme).toBe('claude-maid');
      expect(rigSeen.rigs).toBe(rigs + 2);
      expect(rigSeen.tree.parts.map(p => p.id)).toContain('torso_up');
      expect(fig.poses).toEqual({ lie: true, back: true });
      pet.doWord('lie'); run(2.5);
      expect(rigSeen.st.alpha.lie_body).toBe(1);
    } finally { done(); }
  });

  it('swings the hood ties\' pompoms and the scarf\'s ends as pendulums, finite and settling, walking, held and turning', async () => {
    const { pet, run, done } = await onKit('deepseek-cape');
    try {
      const K = ['tieNear', 'tieFar', 'scarfFront', 'scarfBack'];
      /** How far each piece swings over `s` seconds (the spread of its angle), every frame finite. */
      const spread = s => {
        const lo = {}, hi = {};
        run(s, st => { for (const k of K) { expect(Number.isFinite(st[k].a), k).toBe(true); lo[k] = Math.min(lo[k] ?? Infinity, st[k].a); hi[k] = Math.max(hi[k] ?? -Infinity, st[k].a); } });
        return Object.fromEntries(K.map(k => [k, hi[k] - lo[k]]));
      };
      run(.5);
      // standing still they only sway a little (the idle sway: about ±8° for the pompoms, half that for the scarf)
      const rest = spread(2.5);
      pet.walkTo(pet.pet.x + 300, false, 1);
      const walk = spread(2);
      pet.doWord('shake'); const shake = spread(1.5);
      // picked up and swung from side to side
      const at = { x: pet.pet.x, y: 380 - 40 };
      expect(pet.pointerDown(at)).toBe(true);
      const lo = {}, hi = {};
      for (let i = 0; i < 90; i++) {
        pet.pointerMove({ x: at.x + 60 * Math.sin(i / 6), y: at.y - 80 });
        run(1 / 60, st => { for (const k of K) { expect(Number.isFinite(st[k].a), k).toBe(true); lo[k] = Math.min(lo[k] ?? Infinity, st[k].a); hi[k] = Math.max(hi[k] ?? -Infinity, st[k].a); } });
      }
      pet.pointerUp();
      run(3);
      const held = Object.fromEntries(K.map(k => [k, hi[k] - lo[k]]));
      for (const k of K) {
        expect(rest[k], k).toBeLessThan(k.startsWith('tie') ? 20 : 12);
        // they swing walking, as the face turns and held, more than standing still (held, the angle also takes back the
        // whole group's swing, so that the piece keeps hanging down)
        expect(Math.max(walk[k], shake[k], held[k]), k).toBeGreaterThan(1.5 * rest[k]);
      }
      // the scarf's ends (cloth, half free) swing less than the pompoms on their strings
      expect(walk.scarfFront).toBeLessThan(walk.tieNear);
    } finally { done(); }
  });

  it('rolls as the ball drawing, on the winter ball\'s own outline (rollSupport), the hood ties\' pompoms clear of her face', async () => {
    // (the cape's ball has the spout and the far hood fin sticking out where the maid's has the ahoge loop: its own heights,
    // every 1°: between 5° samples the lowest point jumps from corner to corner and a straight line across floated the ball
    // by up to 1.5 units, 2-3 px, mid-roll)
    expect(CAPE.rollSupport).toHaveLength(360);
    {
      const [p] = model.poses.roll.required, [bx, by, bw, bh] = p.box, [cx, cy] = model.poses.roll.pivots.rollBall;
      const { w, h, px } = rgbaOf(new URL('outfits/cape/schemes/deepseek/poses/roll_ball.png', WHALE));
      const pts = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= 128) pts.push(bx + (x + .5) * bw / w - cx, by + (y + .5) * bh / h - cy);
      let worst = 0, at = 0;
      for (let deg = 0; deg < 360; deg += .5) {
        const t = deg * Math.PI / 180, s = Math.sin(t), c = Math.cos(t);
        let low = -Infinity;
        for (let i = 0; i < pts.length; i += 2) low = Math.max(low, pts[i] * s + pts[i + 1] * c);
        // (the spout's corner near 208° is where the 5° table floated most)
        const e = Math.abs(ballLift(CAPE.rollSupport, deg) - low);
        if (e > worst) { worst = e; at = deg; }
      }
      expect(worst, `cape ball at ${at}°`).toBeLessThan(.4);
    }
    for (const [look, support] of [['deepseek-cape', CAPE.rollSupport], ['deepseek', model.poses.roll.support]]) {
      const { pet, run, done } = await onKit(look);
      try {
        run(.5);
        pet.doWord('roll');
        let ball = 0, frames = 0, seen = 0;
        run(2.5, st => {
          ball = Math.max(ball, st.alpha.roll_ball ?? 0);
          if ((st.alpha.roll_ball ?? 0) > 0) {
            frames++;
            // the ball's middle rides at this outfit's height for its turn
            expect(Math.abs(st.rollBall.ty - (support[0] - ballLift(support, st.rollBall.a))), look).toBeLessThan(1e-9);
          }
          // the pompoms show only while she is there herself (the rig is hidden under the whole ball), and never flung
          // across her eye: popping out of the ball they swing on from the swing they took inside it (with the kit's whole
          // swing, about 40° there and 53° inside; walking they reach about 30°)
          if (look === 'deepseek-cape' && !rigSeen.hidden) seen = Math.max(seen, Math.abs(st.tieNear.a), Math.abs(st.tieFar.a));
        });
        expect(ball, look).toBe(1);
        expect(frames, look).toBeGreaterThan(30);
        expect(seen, look).toBeLessThan(32);
      } finally { done(); }
    }
  });

  it('cuts between her and the ball in one frame each way, in both outfits, from standing, sitting, kneeling and lying, at any frame rate', async () => {
    // (a hand-over between bodies is a cut: the ball faded in and out over 2-3 frames, both bodies half see-through)
    for (const look of ['deepseek', 'deepseek-cape']) for (const from of ['stand', 'sit', 'kneel', 'lie']) for (const dt of [1 / 60, 1 / 144]) {
      const { pet, run, done } = await onKit(look);
      try {
        run(.5);
        if (from !== 'stand') { pet.doWord(from); run(3); }
        // (down on the floor, her own drawing shows first)
        if (from === 'kneel' || from === 'lie') expect(rigSeen.st.alpha[`${from}_body`], `${look} ${from}`).toBe(1);
        pet.doWord('roll');
        let prev = 0, flips = 0, shown = 0;
        for (let i = 0; i < Math.round(2.2 / dt); i++) {
          pet.step(dt); pet.render();
          const a = rigSeen.st.alpha.roll_ball ?? 0;
          expect([0, 1], `${look} ${from} 1/${Math.round(1 / dt)} frame ${i}`).toContain(a);
          // the ball shows only with the whole standing rig hidden under it, and the rig only without the ball
          if (a) expect(!!rigSeen.hidden, `${look} ${from} frame ${i}`).toBe(true);
          else if (from === 'stand') expect(!!rigSeen.hidden, `${look} frame ${i}`).toBe(false);
          // (from any start, the ball cuts out straight to her standing rig: never a frame with neither the ball nor a body)
          if (!a && prev) expect(!!rigSeen.hidden, `${look} ${from} 1/${Math.round(1 / dt)} frame ${i}: ball out`).toBe(false);
          // ...and no floor drawing (kneeling, its hybrid, lying, their live faces) still showing round it
          if (a) for (const id of ['lie_body', 'lie_tail', 'lie_blank', 'lie_fringe', 'lie_live', 'kneel_body', 'kneel_blank', 'kneel_fringe', 'kneel_live', 'kneel_low', 'sit_skirt', 'sit_top']) expect(rigSeen.st.alpha[id] ?? 0, `${look} ${from} frame ${i} ${id}`).toBe(0);
          if (a !== prev) flips++;
          prev = a; shown += a;
        }
        expect(flips, `${look} ${from}`).toBe(2);
        expect(shown * dt, `${look} ${from}`).toBeGreaterThan(1);
      } finally { done(); }
    }
  });

  it('runs the ninja run on the hinged legs: the near leg (leg_back) over the far one, in both outfits', () => {
    for (const parts of [model.parts, CAPE.parts]) {
      const back = parts.find(p => p.id === 'leg_back'), front = parts.find(p => p.id === 'leg_front');
      expect(back.z).toBeGreaterThan(front.z);
      expect([back.grid, front.grid]).toEqual([[3, 10], [3, 10]]);
    }
    // the hinge turns the leg below the hip and leaves the bloomer's top where it was drawn
    const pv = model.pivots.legBack, f = hinge(pv, 30, -5);
    expect(f(0, 0, pv[0] + 10, pv[1] - 6)).toEqual([0, 0]);
    const [dx, dy] = f(0, 1, pv[0], pv[1] + 40);
    expect(dx).toBeLessThan(-15);
    expect(Math.abs(dy + 5 - 40 * (Math.cos(Math.PI / 6) - 1))).toBeLessThan(1e-9);
  });

  it('leans into the ninja run, both arms swept back, the far cuff gone behind her', async () => {
    const { pet, run, fig, done } = await onKit('deepseek');
    try {
      run(.5);
      pet.walkTo(pet.pet.x + 400, true, 1);
      let arms = null, cuff = 1, lean = 0;
      run(1, st => { arms = [st.armNear.a, st.armFar.a]; cuff = Math.min(cuff, st.alpha.arm_far_end_front); lean = Math.max(lean, fig.groupTilt('run', 0, 0)); });
      expect(pet.pet.mode).toBe('run');
      expect(arms[0]).toBeGreaterThan(25);
      expect(arms[1]).toBeGreaterThan(20);
      expect(cuff).toBeLessThan(.2);
      expect(lean).toBeGreaterThan(10);
    } finally { done(); }
  });
});

describe('the whale exported as a pack, in her winter outfit on upstream\'s kit (v0.1.17)', () => {
  it('draws the winter outfit there, whole and finite', async () => {
    const up = await upstreamKit('upstream-kit-v0.1.17-whale-outfit');
    if (!up) return;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rigSeen.up.length = 0;
    // only the files the pack ships: a texture left out of it does not load
    const shipped = new Set((await packFiles()).map(f => f.to));
    const { pet, run, fig, loads, done } = await onKit('qwen-cape', up.createPet, u => shipped.has(String(u)) ? loadImage(u) : Promise.reject(new Error(`not in the pack: ${u}`)));
    try {
      expect(fig.scheme).toBe('qwen-cape');
      for (const p of CAPE.parts.filter(p => p.src)) expect(loads, p.id).toContain(p.src);
      run(1);
      const ids = rigSeen.tree.parts.map(p => p.id);
      for (const id of ['hood_front', 'cloak', 'scarf_neck', 'hood_tie_near', 'spout']) expect(ids).toContain(id);
      expect(ids).not.toContain('torso_up');
      expect(rigSeen.up).toEqual(expect.arrayContaining(['cape_hood_front', 'cape_cloak', 'hair_back']));
      // its pose drawings are in the pack (each loaded from the shipped files): the arms shared, the whole-body ones the scheme's
      for (const t of ARM_TEX) expect(loads, t).toContain(`outfits/cape/poses/${t}.png`);
      for (const t of BODY_TEX) expect(loads, t).toContain(`outfits/cape/schemes/qwen/poses/${t}.png`);
      const shown = new Set();
      for (const w of ['walk', 'wave', 'sit', 'lie', 'kneel', 'roll', 'turn', 'jump']) {
        pet.doWord(w); run(w === 'lie' || w === 'kneel' ? 2.5 : 1.5, st => {
          expect(notFinite(rigSeen.tree, st), w).toEqual([]);
          for (const p of POSE_PARTS) if ((st.alpha[p.id] ?? 0) >= 1) shown.add(`${w}:${p.id}`);
        });
        pet.doWord('stand'); run(1);
      }
      // (upstream's own kit has none of the fork's floor poses or the roll: there she waves with the drawn arm and shows
      // the back drawing as she turns round to walk; the pack's bundled kit does the rest, as tests above)
      for (const s of ['wave:arm_wave', 'walk:back_body']) expect(shown).toContain(s);
      expect([...shown].filter(s => /:(lie|kneel|roll)_/.test(s))).toEqual([]);
      // standing again, the cloak and the hood are drawn whole
      for (const id of ['cloak', 'hood_front']) expect([undefined, 1], id).toContain(rigSeen.st.alpha[id]);
    } finally { done(); warn.mockRestore(); }
  });
});
