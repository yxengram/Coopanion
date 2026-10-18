// The four girls' outfits (the pack's second axis, `<scheme>-<outfit>`): the classic clothes and the winter outfit, as
// each one's own figure.js draws them without a GPU (the rig keeps the last frame's states and the tree it was built
// with). One rig per outfit (kit/outfit.js outfitModel): the winter outfit's own parts and pose drawings, each with its
// own box; a pose it does not list falls back as a missing drawing does, never to the classic drawing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rigSeen = vi.hoisted(() => ({ st: null, tree: null, up: [], rigs: 0, disposed: 0, hidden: null }));
vi.mock('../packages/cortico-world-desktop-pet/web/kit/rig.js', () => ({
  createRig: (_canvas, tree) => (rigSeen.tree = tree, rigSeen.rigs++, {
    upload(n) { rigSeen.up.push(n); }, render(st, o) { rigSeen.st = st; rigSeen.hidden = o?.hidden ?? null; }, point: (_d, _st, x, y) => [x, y], dispose() { rigSeen.disposed++; },
  }),
}));

import { createPet, FACES } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { outfitModel, pickOf, texPath } from '../packages/cortico-world-desktop-pet/web/kit/outfit.js';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { createClaudeFigure } from '../packages/cortico-world-desktop-pet/web/claude-chan/figure.js';
import { createGptFigure } from '../packages/cortico-world-desktop-pet/web/gpt-chan/figure.js';
import { createGeminiFigure } from '../packages/cortico-world-desktop-pet/web/gemini-chan/figure.js';
import { createGrokFigure } from '../packages/cortico-world-desktop-pet/web/grok-chan/figure.js';
import * as ClaudeM from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import * as GptM from '../packages/cortico-world-desktop-pet/web/gpt-chan/motion.js';
import * as GeminiM from '../packages/cortico-world-desktop-pet/web/gemini-chan/motion.js';
import * as GrokM from '../packages/cortico-world-desktop-pet/web/grok-chan/motion.js';
import { packFiles as claudeFiles } from '../packages/cortico-world-desktop-pet/scripts/export-claude-pack.mjs';
import { packFiles as gptFiles } from '../packages/cortico-world-desktop-pet/scripts/export-gpt-pack.mjs';
import { packFiles as geminiFiles } from '../packages/cortico-world-desktop-pet/scripts/export-gemini-pack.mjs';
import { packFiles as grokFiles } from '../packages/cortico-world-desktop-pet/scripts/export-grok-pack.mjs';
import { upstreamKit } from './helpers/upstream-kit.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
/**
 * Each girl: her factory, motion module, exported pack's files, the standing parts her winter outfit draws anew (every
 * other part is the classic one), and the classic poses it has no drawing of (it falls back as for a missing file).
 */
const GIRLS = {
  'claude-chan': { make: createClaudeFigure, M: ClaudeM, files: claudeFiles, changed: ['shoe_l', 'shoe_r', 'skirt', 'torso', 'arm_l', 'arm_r', 'capelet'], without: [] },
  'gpt-chan': { make: createGptFigure, M: GptM, files: gptFiles, changed: ['shoe_l', 'shoe_r', 'skirt', 'torso', 'arm_l', 'arm_r'], without: [] },
  'gemini-chan': { make: createGeminiFigure, M: GeminiM, files: geminiFiles, changed: ['shoe_l', 'shoe_r', 'skirt', 'torso', 'arm_l', 'arm_r'], without: [] },
  'grok-chan': { make: createGrokFigure, M: GrokM, files: grokFiles, changed: ['shoe_l', 'shoe_r', 'skirt', 'torso', 'arm_l', 'arm_r'], without: [] },
};
/** Every part of a pose (its drawing, its patches, its live face's blank and fringe). */
const partsOfPose = P => [...(P.required || []), ...(P.overlays || []), ...(P.face?.parts || [])];
/**
 * A pose drawing the winter outfit shares with the classic clothes (no `src`, not `winter_*`): never clothing, only the back
 * hair and the layer over it (horns, wings, tail, ears, crown, bows) and the floor drawings' eye and mouth patches.
 */
const HEAD_ONLY = /^(back_hair|back_hair_under|back_top|kneel_shut|kneel_smile|kneel_talk|lie_shut|lie_smile|lie_talk)$/;
/** Width, height, bit depth, colour type and interlacing of a PNG, from its header. */
function png(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25], interlace: b[28] };
}
// a do-nothing stand-in for whatever DOM or 2D canvas call the figure makes (numbers read as 0)
const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
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

describe.each(Object.keys(GIRLS))('%s: her outfits', (id) => {
  const G = GIRLS[id], DIR = new URL(`${id}/`, WEB);
  const model = JSON.parse(readFileSync(new URL('model.json', DIR), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('figure.json', DIR), 'utf8'));
  const WIN = model.outfits?.find(o => o.id === 'winter');
  const CLASSIC_POSE_TEX = new Set(Object.values(model.poses).flatMap(partsOfPose).map(p => p.tex));
  const WIN_POSE_PARTS = Object.values(WIN.poses).flatMap(partsOfPose);
  const POSE_IDS = new Set(Object.values(model.poses).flatMap(partsOfPose).map(p => p.id));
  const WITHOUT_IDS = new Set(G.without.flatMap(k => partsOfPose(model.poses[k]).map(p => p.id)));
  /** As the app loads her textures: a file that is not in the package fails (the figure then does without that pose). */
  const loadImage = async url => {
    const p = String(url);
    if (!existsSync(new URL(p, DIR))) throw new Error(`no ${p}`);
    return { width: 1, height: 1, src: p };
  };
  async function figureIn(look, load = loadImage) {
    const doc = globalThis.document;
    globalThis.document = { createElement: () => any, createElementNS: () => any };
    const loads = [];
    try {
      const fig = await G.make(DIR, { model, scheme: look, asset: p => p, loadImage: async u => { loads.push(String(u)); return load(u); } });
      return { fig, loads, done: () => { globalThis.document = doc; } };
    } catch (e) { globalThis.document = doc; throw e; }
  }
  /** Her figure on the kit's body (plus, or the `make` of another kit: upstream's v0.1.17 for the exported pack). */
  async function onKit(look, make = createPet, load) {
    const { fig, loads, done } = await figureIn(look, load);
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
    const figure = { ...fig, draw: (g, fc, o) => fig.draw(g, fc, o) };
    for (const k of ['anchors', 'poses', 'gestures', 'roll', 'kneelArms', 'scheme', 'extent', 'hits', 'tearDrop']) Object.defineProperty(figure, k, { get: () => fig[k] });
    const pet = make({ petG, shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    const run = (s, each = () => {}) => { for (let i = 0; i < Math.round(s * 60); i++) { pet.step(1 / 60); pet.render(); each(rigSeen.st); } };
    return { pet, run, fig, loads, done };
  }

  it('reads a look as its scheme and outfit: a bare scheme is the classic clothes, an unknown part the first option of its axis', () => {
    expect(pickOf(model, 'original')).toEqual({ scheme: 'original', outfit: 'classic' });
    expect(pickOf(model, 'original-winter')).toEqual({ scheme: 'original', outfit: 'winter' });
    expect(pickOf(model, 'original-cape')).toEqual({ scheme: 'original', outfit: 'classic' });
    expect(pickOf(model, 'deepseek-winter')).toEqual({ scheme: 'original', outfit: 'winter' });
    expect(pickOf(model, undefined)).toEqual({ scheme: 'original', outfit: 'classic' });
    expect(model.outfits.map(o => o.id)).toEqual(['classic', 'winter']);
    expect(model.outfits[0]).toEqual({ id: 'classic' });
  });

  it('is a second axis of the pack: 服装 with the classic clothes and the winter outfit (full-body thumbs), the preset naming both', () => {
    expect(manifest.axes.map(a => [a.id, a.options.map(o => o.id)])).toEqual([['scheme', ['original']], ['outfit', ['classic', 'winter']]]);
    const outfit = manifest.axes[1];
    expect(outfit.name).toEqual({ zh: '服装', en: 'Outfit' });
    expect(outfit.options.map(o => [o.name.zh, o.thumb])).toEqual([['常服', 'thumbs/classic.png'], ['冬装', 'thumbs/winter.png']]);
    for (const o of outfit.options) expect(png(new URL(o.thumb, DIR)), o.thumb).toMatchObject({ w: 144, h: 144, depth: 8, colorType: 6 });
    expect(manifest.presets.map(p => p.pick)).toEqual([{ scheme: 'original', outfit: 'classic' }]);
    expect(manifest.thumb).toBe('thumbs/original.png');
    // the bot is told which one she wears (bodyText: about, then the picks in brackets)
    expect(manifest.about.zh).toContain('服装是括号里选的那套');
    expect(manifest.about.zh).toContain('冬装是');
    const m = readManifest(fileURLToPath(DIR), true, []);
    expect(typeof m === 'string' ? m : null).toBeNull();
    expect(m.axes.map(a => a.id)).toEqual(['scheme', 'outfit']);
  });

  it('keeps the classic clothes as they were: the same model, the same rig', () => {
    expect(outfitModel(model, 'classic')).toBe(model);
    expect(outfitModel(model, 'nope')).toBe(model);
    const { unknownParents, ...a } = G.M.buildRig(outfitModel(model, 'classic')), { unknownParents: u2, ...b } = G.M.buildRig(model);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // (a model with no outfits at all, an older one, is its classic clothes)
    const { outfits, ...old } = model;
    expect(outfitModel(old, 'winter')).toBe(old);
    expect(pickOf(old, 'original-winter')).toEqual({ scheme: 'original', outfit: 'classic' });
  });

  it('builds the winter rig from its own parts and drawings: the same part ids, its own files at their own boxes', () => {
    const W = outfitModel(model, 'winter');
    expect(W.parts.map(p => p.id)).toEqual(model.parts.map(p => p.id));
    const classic = Object.fromEntries(model.parts.map(p => [p.id, p]));
    for (const p of W.parts) {
      if (G.changed.includes(p.id)) {
        expect(p, p.id).toMatchObject({ tex: `winter_${p.id}`, src: `outfits/winter/tex/${p.id}.png`, z: classic[p.id].z, parent: classic[p.id].parent });
      } else expect(p, p.id).toEqual(classic[p.id]);
    }
    // every file of its own: an 8-bit RGBA PNG sized to its box (texture pixels per rig unit DS / S)
    const k = model.units.DS / model.units.S;
    for (const p of [...W.parts, ...WIN_POSE_PARTS].filter(q => q.src)) {
      expect(p.src.startsWith('outfits/winter/'), p.src).toBe(true);
      expect(p.tex.startsWith('winter_'), p.tex).toBe(true);
      const f = png(new URL(p.src, DIR));
      expect([f.depth, f.colorType, f.interlace], p.src).toEqual([8, 6, 0]);
      expect(Math.abs(f.w - p.box[2] * k), `${p.src} width`).toBeLessThanOrEqual(2);
      expect(Math.abs(f.h - p.box[3] * k), `${p.src} height`).toBeLessThanOrEqual(2);
    }
    // a drawing it takes over unchanged is the head's only, from the classic tex/
    const reused = WIN_POSE_PARTS.filter(p => !p.src).map(p => p.tex);
    for (const t of reused) { expect(t, t).toMatch(HEAD_ONLY); expect(existsSync(new URL(`tex/${t}.png`, DIR)), t).toBe(true); }
    // its poses are the classic ones but those it has no drawing of; each pose's pivots, wrist, kind and the rest of its
    // geometry are the classic ones, so a later fix to a classic pose fails here until the winter one follows (only
    // boxes may grow, where a fur cuff reaches past the classic outline; what is measured on the winter drawing itself,
    // the floor faces' placement, the seated headDrop and the ball's outline, is its own)
    expect(Object.keys(WIN.poses).sort()).toEqual(Object.keys(model.poses).filter(p => !G.without.includes(p)).sort());
    for (const [pid, P] of Object.entries(WIN.poses)) {
      const C = model.poses[pid];
      for (const key of ['pivots', 'wrist', 'kind', 'rest', 'legAxis', 'head', 'hides', 'fx', 'anchors', 'cut', 'rects']) expect(P[key], `${pid}.${key}`).toEqual(C[key]);
      expect(partsOfPose(P).filter(p => !p.use || p.use === 'face').map(p => p.id), pid).toEqual(partsOfPose(C).filter(p => !p.use || p.use === 'face').map(p => p.id));
    }
    const R = G.M.buildRig(W);
    expect(R.unknownParents).toEqual([]);
    for (const pid of Object.keys(WIN.poses)) expect(!!(R.ARM[pid] || R.W[pid]), pid).toBe(true);
    for (const pid of G.without) expect(R.ARM[pid] ?? R.W[pid], pid).toBeUndefined();
    // a pose box grown in the winter outfit is the box its parts lie on in the rig
    const tree = Object.fromEntries(R.parts.map(p => [p.id, p]));
    for (const p of WIN_POSE_PARTS) expect(tree[p.id].box, p.id).toEqual(p.box);
  });

  it('never loads a classic pose drawing in the winter outfit, and loads every one of its own', async () => {
    const { fig, loads, done } = await figureIn('original-winter');
    try {
      expect(fig.scheme).toBe('original-winter');
      expect(fig.outfits.map(o => o.id)).toEqual(['classic', 'winter']);
      const own = [...WIN.parts, ...WIN_POSE_PARTS].filter(p => p.src).map(p => p.src);
      for (const s of own) expect(loads, s).toContain(s);
      // the classic files it loads are its kept parts' and the head-only drawings', none of the classic pose drawings
      const classicLoads = loads.filter(u => u.startsWith('tex/')).map(u => u.slice(4, -4));
      for (const t of classicLoads) if (CLASSIC_POSE_TEX.has(t)) expect(t, t).toMatch(HEAD_ONLY);
      for (const n of G.changed) expect(loads).not.toContain(`tex/${n}.png`);
      expect(fig.poses).toEqual({ lie: true, back: true });
      expect(fig.kneelArms).toBe(true);
      expect(fig.roll).toBeUndefined();
      // what a saved winter look loads before her first frame, well inside upstream's 20 s READY_MS from a local server
      // (the same budget as the classic start's in the export tests, which count every feat/ file: so does this)
      const feat = readdirSync(new URL('feat/', DIR)).map(f => `feat/${f}`);
      const bytes = [...new Set([...loads, ...feat])].reduce((a, u) => a + statSync(new URL(u, DIR)).size, 0);
      expect(loads.filter(u => u.startsWith('outfits/winter/')).length).toBeGreaterThan(40);
      expect(bytes).toBeLessThan(32 * 1048576);
    } finally { done(); }
    // and the classic clothes load the classic files only
    const c = await figureIn('original');
    try {
      expect(c.fig.scheme).toBe('original-classic');
      expect(c.loads.filter(u => u.startsWith('outfits/'))).toEqual([]);
    } finally { c.done(); }
  });

  it('does without a winter drawing whose file is missing (the rig\'s arms, seated instead of lying), never with the classic one', async () => {
    const gone = ['outfits/winter/poses/pose_wave.png', 'outfits/winter/poses/lie_body.png'];
    const load = u => (gone.includes(String(u)) ? Promise.reject(new Error('missing')) : loadImage(u));
    const { pet, run, fig, loads, done } = await onKit('original-winter', createPet, load);
    try {
      expect(fig.poses.lie).toBe(false);
      expect(loads).not.toContain('tex/pose_wave.png');
      expect(loads).not.toContain('tex/lie_body.png');
      run(.5);
      let most = 0;
      pet.doWord('wave'); run(1.2, st => { most = Math.max(most, st.alpha.pose_wave ?? 0); });
      expect(most).toBe(0);
      pet.doWord('lie'); run(2.5, st => { most = Math.max(most, st.alpha.lie_body ?? 0); });
      expect(most).toBe(0);
    } finally { done(); }
  });

  /** Plays every word of hers in a look; which pose parts each one shows (`<word>:<part id>`), and any non-finite state. */
  async function everyWord(look) {
    const { pet, run, done } = await onKit(look);
    try {
      run(.5);
      const shown = new Set(), bad = [];
      for (const w of manifest.vocab.map(v => v.id)) {
        expect(pet.doWord(w), `${look} ${w}`).toBe(true);
        run(w === 'kneel' || w === 'lie' || w === 'sit' ? 2.5 : 1.2, st => {
          for (const [pid, a] of Object.entries(st.alpha)) if (a > 0 && POSE_IDS.has(pid)) shown.add(`${w}:${pid}`);
          bad.push(...notFinite(rigSeen.tree, st).map(b => `${w}:${b}`));
        });
        pet.doWord('stand'); run(1.2);
      }
      return { shown, bad: [...new Set(bad)] };
    } finally { done(); }
  }

  it('does every word of hers in the winter outfit, each showing the drawings it shows in the classic clothes', async () => {
    const win = await everyWord('original-winter'), classic = await everyWord('original');
    expect(win.bad).toEqual([]);
    expect(classic.bad).toEqual([]);
    // (a pose it has no drawing of is acted out by the rig's arms: none of its parts, and nothing else instead)
    const words = new Set([...classic.shown].filter(s => WITHOUT_IDS.has(s.split(':')[1])).map(s => s.split(':')[0]));
    const keep = s => !words.has(s.split(':')[0]);
    expect([...win.shown].filter(keep).sort()).toEqual([...classic.shown].filter(keep).sort());
    for (const s of win.shown) expect(WITHOUT_IDS.has(s.split(':')[1]), s).toBe(false);
    for (const [w, pid] of [['kneel', 'kneel_body'], ['lie', 'lie_body'], ['sit', 'sit_skirt'], ['turn', 'back_body'], ['roll', 'roll_ball'], ['wave', 'pose_wave'], ['read', 'pose_read'], ['heart', 'pose_heart']])
      expect(win.shown, `${w} shows ${pid}`).toContain(`${w}:${pid}`);
  });

  it('cuts to the other outfit in one frame, a rig of its parts built anew, in the posture she was in: standing, waving, seated, kneeling, lying', async () => {
    const rigTex = () => Object.fromEntries(rigSeen.tree.parts.map(p => [p.id, p.tex]));
    for (const [word, held] of [[null, []], ['wave', ['pose_wave']], ['sit', ['sit_skirt', 'sit_top']], ['kneel', ['kneel_body', 'kneel_live']], ['lie', ['lie_body', 'lie_live']], ['kneel+wave', ['kneel_low', 'pose_wave']]]) {
      const { pet, run, fig, done } = await onKit('original');
      try {
        run(.5);
        if (word) for (const [i, w] of word.split('+').entries()) { pet.doWord(w); run(i || w === 'wave' ? .5 : 2.5); }
        for (const pid of held) expect(rigSeen.st.alpha[pid], `${word}: ${pid} before`).toBe(1);
        const hidden = !!rigSeen.hidden;
        for (const [to, prefix] of [['original-winter', 'winter_'], ['original-classic', '']]) {
          const rigs = rigSeen.rigs, disposed = rigSeen.disposed;
          rigSeen.up.length = 0;
          await fig.setScheme(to, { fade: .45 });
          expect(fig.scheme).toBe(to);
          // the old rig stays up until the frame that mounts the new one (no blank refresh in between)
          expect(rigSeen.disposed).toBe(disposed);
          run(1 / 60);
          expect(rigSeen.rigs, `${word} → ${to}`).toBe(rigs + 1);
          expect(rigSeen.disposed).toBe(disposed + 1);
          const tex = rigTex();
          for (const n of G.changed) expect(tex[n], `${word} → ${to}: ${n}`).toBe(`${prefix}${n}`);
          expect(rigSeen.up.filter(n => n.endsWith('@mix'))).toEqual([]);
          expect(rigSeen.st.mix).toBe(0);
          // the very first frame shows the same drawings whole: no easing back into the posture
          for (const pid of held) {
            expect(rigSeen.st.alpha[pid], `${word} → ${to}: ${pid}`).toBe(1);
            if (pid !== 'kneel_live' && pid !== 'lie_live') expect(tex[pid], `${word} → ${to}: ${pid}`).toBe(`${prefix}${pid}`);
          }
          expect(!!rigSeen.hidden, `${word} → ${to}: the standing rig hidden`).toBe(hidden);
          expect(notFinite(rigSeen.tree, rigSeen.st)).toEqual([]);
        }
      } finally { done(); }
    }
  });

  it('sizes the new rig\'s canvas the frame it is mounted: no blurry default-sized frames after the switch', async () => {
    const doc = globalThis.document, win = globalThis.window, canvases = [];
    const el = tag => { const o = new Proxy({ style: {} }, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : any), set: (t, k, v) => { t[k] = v; return true; } }); if (tag === 'canvas') canvases.push(o); return o; };
    globalThis.document = { createElement: () => any, createElementNS: (_ns, tag) => el(tag) };
    globalThis.window = { devicePixelRatio: 1 };
    try {
      const fig = await G.make(DIR, { model, scheme: 'original', asset: p => p, loadImage });
      const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1 }), textContent: '' };
      const frame = t => ({ t, mode: 'idle', face: 'neutral', look: [0, 0], legs: [[104, 212, 104, 241], [150, 212, 150, 241]], low: 0, sit: 0, tilt: 0, lean: 0, facing: 1, swing: 0, gesture: null });
      for (let i = 0; i < 7; i++) fig.draw(petG, FACES.neutral.f(0), frame(1 + i / 60));
      const first = canvases.at(-1);
      expect(first.width).toBeGreaterThan(16);
      await fig.setScheme('original-winter');
      fig.draw(petG, FACES.neutral.f(0), frame(2));
      const next = canvases.at(-1);
      expect(next).not.toBe(first);
      expect([next.width, next.height]).toEqual([first.width, first.height]);
    } finally { globalThis.document = doc; globalThis.window = win; }
  });

  it('keeps the last outfit asked for when an earlier one\'s textures load after it (a quick click back on the dress page)', async () => {
    let release;
    const slow = new Promise(r => { release = r; });
    const load = async u => { if (String(u).startsWith('outfits/')) await slow; return loadImage(u); };
    const { pet, run, fig, done } = await onKit('original', createPet, load);
    try {
      run(.2);
      const toWinter = fig.setScheme('original-winter');
      await fig.setScheme('original-classic');
      release();
      await toWinter;
      run(.2);
      expect(fig.scheme).toBe('original-classic');
      const tex = Object.fromEntries(rigSeen.tree.parts.map(p => [p.id, p.tex]));
      for (const n of G.changed) expect(tex[n]).toBe(n);
      // and asked again, it goes
      await fig.setScheme('original-winter');
      run(1 / 60);
      expect(fig.scheme).toBe('original-winter');
    } finally { done(); }
  });

  it('runs exported as a pack on upstream\'s kit (v0.1.17) in the winter outfit, from the shipped files only', async () => {
    const up = await upstreamKit(`upstream-kit-v0.1.17-${id}-outfit`);
    if (!up) return;
    const files = await G.files();
    const shipped = new Set(files.map(f => f.to));
    for (const p of [...WIN.parts, ...WIN_POSE_PARTS].filter(q => q.src)) expect(shipped, p.src).toContain(p.src);
    for (const o of manifest.axes[1].options) expect(shipped).toContain(o.thumb);
    expect(shipped).toContain('kit/outfit.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pet, run, fig, loads, done } = await onKit('original-winter', up.createPet, u => (shipped.has(String(u)) ? loadImage(u) : Promise.reject(new Error(`not in the pack: ${u}`))));
    try {
      expect(fig.scheme).toBe('original-winter');
      for (const p of WIN.parts.filter(q => q.src)) expect(loads).toContain(p.src);
      run(1);
      const shown = new Set();
      for (const w of ['walk', 'wave', 'sit', 'heart', 'turn', 'jump']) {
        pet.doWord(w); run(1.5, st => {
          expect(notFinite(rigSeen.tree, st), w).toEqual([]);
          for (const [pid, a] of Object.entries(st.alpha)) if (a >= 1 && POSE_IDS.has(pid)) shown.add(`${w}:${pid}`);
        });
        pet.doWord('stand'); run(1);
      }
      expect(shown).toContain('wave:pose_wave');
      // (upstream's own kit has none of the fork's floor poses: there she waves with the drawn arm and sits on the seated drawing)
      expect(shown).toContain('sit:sit_skirt');
      const tex = Object.fromEntries(rigSeen.tree.parts.map(p => [p.id, p.tex]));
      for (const n of G.changed) expect(tex[n]).toBe(`winter_${n}`);
    } finally { done(); warn.mockRestore(); }
  });
});

// (texPath: the outfit's own file, else the scheme's tex/)
describe('kit/outfit.js', () => {
  it('finds a part\'s file: its own src, else tex/ of the scheme', () => {
    expect(texPath({ tex: 'skirt' })).toBe('tex/skirt.png');
    expect(texPath({ tex: 'skirt' }, 'schemes/x/')).toBe('schemes/x/tex/skirt.png');
    expect(texPath({ tex: 'winter_skirt', src: 'outfits/winter/tex/skirt.png' }, 'schemes/x/')).toBe('outfits/winter/tex/skirt.png');
  });
  it('merges an outfit\'s pivots and rects over the model\'s, and takes its parts and poses whole', () => {
    const m = { pivots: { a: [1, 1], b: [2, 2] }, rects: { head: [0, 0, 1, 1] }, parts: [{ id: 'x' }], poses: { wave: {}, lie: {} },
      outfits: [{ id: 'classic' }, { id: 'w', parts: [{ id: 'x', src: 's' }], pivots: { b: [3, 3] }, rects: { skirt: [0, 0, 2, 2] }, poses: { wave: { w: 1 } } }, { id: 'bare' }] };
    expect(outfitModel(m, 'w')).toMatchObject({ pivots: { a: [1, 1], b: [3, 3] }, rects: { head: [0, 0, 1, 1], skirt: [0, 0, 2, 2] }, parts: [{ id: 'x', src: 's' }], poses: { wave: { w: 1 } } });
    expect(outfitModel(m, 'bare')).toBe(m);
    expect(outfitModel({ ...m, outfits: [m.outfits[0], { ...m.outfits[1], poses: undefined }] }, 'w').poses).toEqual({});
  });
});
