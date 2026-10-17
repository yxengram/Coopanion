// The words a body reports when it is ready (figure-frame.js `ready { words }`, body-host.js knownWords), which the
// World keeps the bot's vocabulary to: every built-in pack's body, made by its own factory as the figure frame makes
// it, must report exactly its manifest's vocabulary (the kit's words, the plus words and the figure's own), or the bot
// loses words. Also the page's side of a body that lists none, and the hidden window's bare steps.
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

vi.mock('../packages/cortico-world-desktop-pet/web/kit/rig.js', () => ({
  createRig: () => ({ upload() {}, render() {}, point: (_d, _st, x, y) => [x, y], dispose() {} }),
}));

import * as kit from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { bodyWords, createBody, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_MOTIONS } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { knownWords, pageLoop, slices, HIDDEN_EVERY_MS, HIDDEN_STEP_MAX } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { cooFigure, defaultSkin } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const PACKS = ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan'];
const BOUNDS = () => ({ W: 1200, H: 400, floorY: 380, S: .42 });

// a do-nothing stand-in for whatever DOM or 2D canvas call a figure makes (numbers read as 0)
const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === Symbol.iterator ? undefined : any), set: () => true, apply: () => any });
/** The figure frame's document as the kit's createBody uses it: a style, an svg with its three children. */
function frameDoc() {
  const el = () => ({ setAttribute() {}, innerHTML: '', textContent: '', remove() {}, appendChild() {}, append() {}, contains: () => true, getScreenCTM: () => null, style: {} });
  const kids = [el(), el(), el()];
  return { head: { appendChild() {} }, documentElement: { dataset: {} }, createElement: el, createElementNS: () => ({ ...el(), children: kids }) };
}
/**
 * A built-in pack's body, made the way figure-frame.js makes it: `factory(base, { model, scheme, kit, loadImage, asset, host })`,
 * with a texture that is not in the package failing as it would (the figure does without it).
 */
async function packBody(id, scheme) {
  const base = new URL(`${id}/`, WEB);
  const manifest = JSON.parse(readFileSync(new URL('figure.json', base), 'utf8'));
  const model = manifest.model ? JSON.parse(readFileSync(new URL(manifest.model, base), 'utf8')) : undefined;
  const mod = await import(new URL(manifest.entry, base).href);
  const doc = globalThis.document;
  globalThis.document = { createElement: () => any, createElementNS: () => any };
  try {
    const loadImage = async (url) => {
      if (!existsSync(new URL(String(url), base))) throw new Error(`no ${url}`);
      return { width: 1, height: 1, src: String(url) };
    };
    const host = { root: { ownerDocument: frameDoc(), appendChild() {} }, bounds: BOUNDS, emit() {}, sound() {}, start: { x: 600, facing: 1, skin: { ...defaultSkin(), figure: id, scheme } } };
    const body = await mod[manifest.export](base, { model, scheme, kit, loadImage, asset: (p) => new URL(p, base), host });
    return { body, manifest, done: () => { globalThis.document = doc; } };
  } catch (e) { globalThis.document = doc; throw e; }
}
/** As figure-frame.js posts it in `ready`. */
const readyWords = (body) => (Array.isArray(body.words) ? body.words.filter((w) => typeof w === 'string').slice(0, 1000) : null);

describe("a built-in pack's body reports exactly its manifest's vocabulary", () => {
  const cases = [['coo', undefined], ...PACKS.slice(1).map((id) => [id, 'deepseek']), ['whale', 'deepseek-maid'], ['whale', 'deepseek-cape']];
  for (const [id, scheme] of cases) {
    it(`${id}${scheme ? ` (${scheme})` : ''}`, async () => {
      const { body, manifest, done } = await packBody(id, scheme);
      onTestFinished(done);
      const ids = manifest.vocab.map((w) => w.id);
      const reported = readyWords(body);
      expect(Array.isArray(reported), 'the body lists its words').toBe(true);
      // every manifest word is one the body knows: none kept from the bot
      expect(ids.filter((w) => !reported.includes(w)), 'manifest words the body does not list').toEqual([]);
      expect(knownWords(manifest.vocab, reported)).toEqual(ids);
      // the plus words and the figure's own are there, not just the kit's (upstream's list would drop them)
      expect(ids.filter((w) => !KIT_EXPRESSIONS.includes(w) && !KIT_MOTIONS.includes(w)).length).toBeGreaterThan(0);
      body.step(1 / 60);
      body.dispose?.();
    });
  }

  // each pack's own body, not only the bare kit body below: a figure-specific word it lists must be one its do() takes
  for (const [id, scheme] of cases) {
    it(`${id}${scheme ? ` (${scheme})` : ''}: its do() takes every manifest word, on a body at rest`, async () => {
      const { manifest } = await packBody(id, scheme).then((r) => { r.done(); return r; });
      const refused = [];
      for (const w of manifest.vocab.map((v) => v.id)) {
        const { body, done } = await packBody(id, scheme);
        try {
          for (let i = 0; i < 30; i++) body.step(1 / 60);
          if (body.do(w) === false) refused.push(w);
          body.step(1 / 60);
          body.dispose?.();
        } finally { done(); }
      }
      expect(refused).toEqual([]);
      const { body, done } = await packBody(id, scheme);
      onTestFinished(done);
      expect(body.do('no-such-word')).toBe(false);
    }, 60_000);
  }

  it('the whale outfits are both on the second axis (so the two cases above are her two outfits)', () => {
    const m = JSON.parse(readFileSync(new URL('whale/figure.json', WEB), 'utf8'));
    expect(m.axes.map((a) => a.id)).toEqual(['scheme', 'outfit']);
    expect(m.axes[1].options.map((o) => o.id)).toEqual(['maid', 'cape']);
  });
});

describe("the kit body's word list (bodyWords)", () => {
  const bare = (opts) => createBody({ root: { ownerDocument: frameDoc(), appendChild() {} }, bounds: BOUNDS, emit() {}, sound() {}, start: { skin: defaultSkin() } }, { figure: cooFigure(), ...opts });

  it("is upstream's for a body without plus (the kit's words and the pack's own), the plus words on top with plus", () => {
    const words = { yawn: { expression: { like: 'sleepy' } }, bounce: { motion: { seconds: 1 } }, nothing: {} };
    expect(bodyWords({ words })).toEqual([...KIT_EXPRESSIONS, ...KIT_MOTIONS, 'yawn', 'bounce']);
    const plus = bodyWords({ words, plus: true });
    expect(plus).toEqual([...new Set([...KIT_EXPRESSIONS, ...KIT_MOTIONS, 'yawn', 'bounce', ...PLUS_EXPRESSIONS, ...PLUS_MOTIONS])]);
    expect(new Set(plus).size).toBe(plus.length);
    // only a plus body carries the list: one without plus is upstream's body, taken at its manifest's word
    expect(bare({}).words).toBe(undefined);
    expect(bare({ plus: true }).words).toEqual(bodyWords({ plus: true }));
  });

  it('lists only words its do() knows: each one, on a body at rest, is taken (a word it does not know is not)', () => {
    const refused = [];
    for (const w of bodyWords({ plus: true })) {
      const body = bare({ plus: true, roam: 'off' });
      for (let i = 0; i < 60; i++) body.step(1 / 60);
      if (body.do(w) === false) refused.push(w);
      body.dispose();
    }
    expect(refused).toEqual([]);
    const body = bare({ plus: true });
    expect(body.do('fly')).toBe(false);
  });

  it("(plus) steps without drawing while the window is hidden, and draws again on the next frame", () => {
    let draws = 0;
    const fig = cooFigure(), draw = fig.draw.bind(fig);
    fig.draw = (...a) => { draws++; return draw(...a); };
    const body = createBody({ root: { ownerDocument: frameDoc(), appendChild() {} }, bounds: BOUNDS, emit() {}, sound() {}, start: { skin: defaultSkin() } }, { figure: fig, plus: true });
    body.step(1 / 60);
    expect(draws).toBe(1);
    const x0 = body.layout().x;
    expect(body.walk(x0 > 600 ? 200 : 1000, false, 7)).toBeTruthy();
    for (let i = 0; i < 40; i++) body.step(.05, { draw: false });
    expect(draws).toBe(1);
    // she walked on meanwhile
    expect(Math.abs(body.layout().x - x0)).toBeGreaterThan(50);
    body.step(1 / 60);
    expect(draws).toBe(2);
    // a body without plus draws every step, as upstream's
    let plain = 0;
    const f2 = cooFigure(), d2 = f2.draw.bind(f2);
    f2.draw = (...a) => { plain++; return d2(...a); };
    const up = createBody({ root: { ownerDocument: frameDoc(), appendChild() {} }, bounds: BOUNDS, emit() {}, sound() {}, start: { skin: defaultSkin() } }, { figure: f2 });
    up.step(1 / 60, { draw: false });
    expect(plain).toBe(1);
  });
});

describe("the page's side of a body's words (body-host.js knownWords)", () => {
  const vocab = [{ id: 'happy' }, { id: 'nod' }, { id: 'spout' }, { id: 'roll' }];
  it("keeps the manifest's words the body lists, in the manifest's order", () => {
    expect(knownWords(vocab, ['roll', 'nod', 'happy', 'fly'])).toEqual(['happy', 'nod', 'roll']);
  });
  it("a body that lists none is taken at its manifest's word", () => {
    expect(knownWords(vocab, null)).toEqual(['happy', 'nod', 'spout', 'roll']);
    expect(knownWords(vocab, undefined)).toEqual(['happy', 'nod', 'spout', 'roll']);
    expect(knownWords(vocab, 'happy')).toEqual(['happy', 'nod', 'spout', 'roll']);
  });
  it('reads only strings, and no more than a thousand of them', () => {
    expect(knownWords(vocab, [1, null, { id: 'nod' }, 'nod'])).toEqual(['nod']);
    expect(knownWords(vocab, [...Array(1000).fill('x'), 'happy'])).toEqual([]);
    expect(knownWords([{ id: 'a' }, null, { id: 3 }], ['a'])).toEqual(['a']);
  });
});

describe("the page's loop while its window is hidden (body-host.js pageLoop)", () => {
  /** A fake page clock: display frames every 16 ms, timers, performance.now. */
  function fakePage() {
    let t = 0;
    const frames = [], timers = [];
    return {
      now: () => t,
      raf: (fn) => { frames.push(fn); },
      after: (fn, ms) => { timers.push({ at: t + ms, fn }); },
      /** Runs the page for `ms`: each 16 ms a display frame (the ones asked for), and the timers due. */
      run(ms) {
        const end = t + ms;
        while (t < end) {
          t = Math.min(end, t + 16);
          for (const d of timers.filter((x) => x.at <= t)) { timers.splice(timers.indexOf(d), 1); d.fn(); }
          for (const fn of frames.splice(0)) fn(t);
        }
      },
      pending: () => frames.length + timers.length,
    };
  }
  function setup() {
    const page = fakePage(), seen = { draws: 0, steps: [] };
    const loop = pageLoop({
      draw: () => { seen.draws++; loop.next(); },
      step: (dt) => seen.steps.push(dt),
      raf: page.raf, after: page.after, now: page.now,
    });
    loop.next();
    return { page, loop, seen };
  }

  it('draws on frames while shown; hidden, steps a few times a second in real time and draws nothing', () => {
    const { page, loop, seen } = setup();
    page.run(1000);
    expect(seen.draws).toBeGreaterThan(55);
    expect(seen.steps).toEqual([]);
    expect(loop.set(false)).toBe(true);
    const drawn = seen.draws;
    page.run(3000);
    expect(seen.draws).toBe(drawn);
    // (the fake page's timers fire on its 16 ms frames, so a little late)
    expect(seen.steps.length).toBeGreaterThanOrEqual(Math.floor(3000 / (HIDDEN_EVERY_MS + 16)));
    expect(seen.steps.length).toBeLessThanOrEqual(Math.floor(3000 / HIDDEN_EVERY_MS));
    // the steps add up to the time hidden (up to the last one): a walk takes as long as it would have
    expect(Math.abs(seen.steps.reduce((a, b) => a + b, 0) - 3)).toBeLessThan((HIDDEN_EVERY_MS + 16) / 1000);
  });

  it('shown again: drawing resumes with the next display frame, the hidden steps stop, and only one loop runs', () => {
    const { page, loop, seen } = setup();
    page.run(500);
    loop.set(false);
    page.run(1000);
    const drawn = seen.draws;
    expect(loop.set(true)).toBe(true);
    expect(loop.set(true)).toBe(false);
    // (set(true) stepped the time since the last hidden step, once)
    const steps = seen.steps.length;
    page.run(16);
    expect(seen.draws).toBe(drawn + 1);
    page.run(1000);
    expect(seen.steps.length).toBe(steps);
    // one frame per display frame, not two loops
    expect(seen.draws - drawn).toBeLessThanOrEqual(64);
    expect(page.pending()).toBe(1);
  });

  it('the hidden steps and the one taken on the show add up to the real time hidden (nothing lost per hide)', () => {
    const { page, loop, seen } = setup();
    page.run(500);
    for (const hidden of [1100, 230, 90, 5]) {
      seen.steps.length = 0;
      loop.set(false);
      page.run(hidden);
      loop.set(true);
      expect(seen.steps.reduce((a, b) => a + b, 0), `${hidden} ms hidden`).toBeCloseTo(hidden / 1000, 9);
      page.run(100);
    }
  });

  it('a quick hide and show (and back) leaves one loop, whatever was asked for before', () => {
    const { page, loop, seen } = setup();
    page.run(100);
    loop.set(false); loop.set(true); loop.set(false); loop.set(true);
    const drawn = seen.draws;
    // the two shows stepped no time (none passed); no hidden tick ran
    expect(seen.steps).toEqual([0, 0]);
    page.run(1000);
    expect(seen.steps).toEqual([0, 0]);
    expect(seen.draws - drawn).toBeLessThanOrEqual(64);
    expect(page.pending()).toBe(1);
  });

  it('a long gap (a machine that slept) is one step of at most HIDDEN_STEP_MAX, and a body takes it in frame-sized slices', () => {
    let t = 0;
    const steps = [], timers = [];
    const loop = pageLoop({ draw() {}, step: (dt) => steps.push(dt), raf() {}, after: (fn) => timers.push(fn), now: () => t });
    loop.set(false);
    t = 60_000;
    timers.shift()();
    expect(steps).toEqual([HIDDEN_STEP_MAX]);
    expect(slices(.2)).toEqual([.05, .05, .05, .05].map((x, i) => (i < 3 ? x : expect.closeTo(.05, 9))));
    expect(slices(.12).length).toBe(3);
    expect(slices(.12).reduce((a, b) => a + b, 0)).toBeCloseTo(.12, 9);
    expect(slices(0)).toEqual([]);
    expect(slices(NaN)).toEqual([]);
  });
});
