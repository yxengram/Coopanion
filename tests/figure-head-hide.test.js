// The five rig figures (the whale and the four girls) on the kit, as the app draws them: the head's resting pitch eases
// to a new face or to sleep instead of jumping in a frame (pitchEased), and the first frame drawn after the window was
// hidden shows the posture reached meanwhile, its hand-over done, instead of replaying it from the picture before the
// hide (catchUp; web/body-host.js pageLoop: a figure's own draw state moves only on drawn frames).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { figureOnKit } from './helpers/real-figures.js';
import * as WhaleM from '../packages/cortico-world-desktop-pet/web/whale/figure.js';
import * as ClaudeM from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import * as GptM from '../packages/cortico-world-desktop-pet/web/gpt-chan/motion.js';
import * as GeminiM from '../packages/cortico-world-desktop-pet/web/gemini-chan/motion.js';
import * as GrokM from '../packages/cortico-world-desktop-pet/web/grok-chan/motion.js';

const seen = vi.hoisted(() => ({ st: null, hidden: null, tree: null, renders: 0 }));
vi.mock('../packages/cortico-world-desktop-pet/web/kit/rig.js', () => ({
  createRig: (_canvas, tree) => (seen.tree = tree, { upload() {}, render(st, o) { seen.st = st; seen.hidden = o?.hidden ?? null; seen.renders++; }, point: (_d, _st, x, y) => [x, y], dispose() {} }),
}));

const MODS = { whale: WhaleM, 'claude-chan': ClaudeM, 'gpt-chan': GptM, 'gemini-chan': GeminiM, 'grok-chan': GrokM };
// the head's pitch (angleY) as drawn: the front of the head's parallax at its middle, over its gain
const KY = { whale: 2.8, 'claude-chan': ClaudeM.PARALLAX.headFront[1], 'gpt-chan': GptM.PARALLAX.headFront[1], 'gemini-chan': GeminiM.PARALLAX.headFront[1], 'grok-chan': GrokM.PARALLAX.headFront[1] };
const pitchOf = id => seen.st.headFront.fn(.5, .5, 0, 0)[1] / KY[id];
const alpha = id => seen.st.alpha[id] ?? 0;
// (the kit's idle moves, blinks and looks drawn from a fixed seed, so every run sees the same frames)
const random = Math.random;
beforeEach(() => { let seed = 11; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); });
afterEach(() => { Math.random = random; });

describe.each(Object.keys(MODS))('%s: the head pitch and the frame after a hide', (id) => {
  const M = MODS[id];

  it('eases the pitch helper: at once the first time, then never faster than PITCH_EASE.max a second', () => {
    expect(M.pitchEased(null, .8, 1 / 60)).toBe(.8);
    let v = 0, most = 0;
    for (let i = 0; i < 120; i++) { const w = M.pitchEased(v, 1.25, 1 / 60); most = Math.max(most, w - v); v = w; }
    expect(most).toBeLessThanOrEqual(M.PITCH_EASE.max / 60 + 1e-12);
    expect(v).toBeCloseTo(1.25, 2);
    // an ordinary frame catches nothing up; a long gap steps up to CATCH_UP.max in all, none longer than CATCH_UP.step
    expect(M.catchUp(0)).toEqual([]);
    expect(M.catchUp(.2)).toEqual([]);
    const s = M.catchUp(3);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(3 - M.CATCH_UP.step, 6);
    expect(Math.max(...s)).toBeLessThanOrEqual(M.CATCH_UP.step);
    expect(M.catchUp(60).reduce((a, b) => a + b, 0)).toBeCloseTo(M.CATCH_UP.max - M.CATCH_UP.step, 6);
  });

  it('falls asleep and changes face (shy, disgusted, cry, singing) with the head pitching over a few frames, never jumping', async () => {
    const h = await figureOnKit(id, seen);
    try {
      h.run(1);
      let prev = pitchOf(id) - Math.max(-1, Math.min(1, h.frame().look[1] / 4)) * .7, most = 0;
      // (less the kit's gaze, which pitches the face as she looks up or down: the kit eases it itself)
      // (and only frames with no gesture of the kit's own under way: a nod is meant to be quick)
      const each = (_, o) => {
        const p = pitchOf(id) - Math.max(-1, Math.min(1, o.look[1] / 4)) * .7;
        if (!o.head && !o.gesture) most = Math.max(most, Math.abs(p - prev));
        prev = p;
      };
      for (const face of ['shy', 'disgusted', 'cry', 'singing', 'neutral']) { h.pet.setExpr(face, 30); h.run(1.2, { each }); }
      // (a face's own pitch moved it .6 in a frame here, shy to disgusted; now it moves at most PITCH_EASE.max a second,
      // and with the kit's lean, which the girls pitch the head by, less than a nod's .125)
      expect(most, 'faces').toBeLessThan(.1);
      const awake = prev;
      most = 0;
      h.pet.doWord('sleep');
      h.run(6, { each });
      expect(h.frame().mode).toBe('sleep');
      expect(most, 'falling asleep').toBeLessThan(.1);
      // and the head does go all the way down (its .8 asleep)
      expect(prev - awake).toBeGreaterThan(.6);
    } finally { h.done(); }
  });

  it('still nods as far and as fast as before (the gestures are not eased)', async () => {
    const h = await figureOnKit(id, seen);
    try {
      h.run(1.5);
      // (less the kit's gaze, as above)
      const rest = (o) => pitchOf(id) - Math.max(-1, Math.min(1, o.look[1] / 4)) * .7;
      let lo = Infinity, hi = -Infinity, fast = 0, prev = rest(h.frame());
      h.pet.doWord('nod');
      h.run(1.5, { each: (_, o) => { const p = rest(o); lo = Math.min(lo, p); hi = Math.max(hi, p); fast = Math.max(fast, Math.abs(p - prev)); prev = p; } });
      const k = Array.from({ length: 101 }, (_, i) => M.headMoves({ kind: 'nod', k: i / 100 }).nod);
      expect(hi - lo).toBeGreaterThan(.9 * (Math.max(...k) - Math.min(0, ...k)) * .9);
      // faster than a face's pitch may move now
      expect(fast).toBeGreaterThan(M.PITCH_EASE.max / 60 * 1.5);
    } finally { h.done(); }
  });

  it('wakes with a start: a walk (or a poke) lifts the sleeping head in about a fifth of a second, not in one frame', async () => {
    const h = await figureOnKit(id, seen);
    try {
      // (less the kit's gaze, as above)
      const rest = (o) => pitchOf(id) - Math.max(-1, Math.min(1, o.look[1] / 4)) * .7;
      h.run(1);
      const awake = rest(h.frame());
      h.pet.doWord('sleep');
      h.run(6);
      expect(h.frame().mode).toBe('sleep');
      const asleep = rest(h.frame());
      expect(asleep - awake).toBeGreaterThan(.6);
      h.pet.walkTo(100);
      let prev = asleep, fast = 0;
      const ks = [];
      h.run(.5, { each: (_, o) => { const p = rest(o); fast = Math.max(fast, Math.abs(p - prev)); prev = p; ks.push(p); } });
      // (no frame jumps it: snapped awake, as before the easing, the first frame moved it .85; the sleep's own share now
      // moves at most PITCH_EASE.wake.max a second, and the girls' head follows the walk's lean on top of it)
      expect(fast, 'per frame').toBeLessThan(.2);
      expect(M.pitchEased(1, 0, 1 / 60, M.PITCH_EASE.wake) - 1).toBeCloseTo(-M.PITCH_EASE.wake.max / 60, 9);
      // a quarter of a second on, the sleep's pitch is (all but) gone; easing at the falling-asleep pace it would not be
      expect(asleep - ks[14], 'after .25 s').toBeGreaterThan(.65);
      expect(M.PITCH_EASE.wake.max).toBeGreaterThan(M.PITCH_EASE.max);
    } finally { h.done(); }
  });

  it('comes back in colour after a petrify that ended while hidden (the grey fades on through the catch-up)', async () => {
    const h = await figureOnKit(id, seen);
    try {
      h.run(1);
      h.pet.setExpr('petrify', 2.5);
      h.run(1.2);
      expect(seen.st.stone).toBeGreaterThan(.9);
      h.run(4, { draw: false });
      h.run(1 / 60);
      expect(seen.st.stone).toBe(0);
    } finally { h.done(); }
  });

  /** `word` done while hidden for `sec`, then one frame drawn: what that frame shows. */
  const hiddenThen = async (h, word, sec = 3) => {
    h.pet.doWord(word);
    h.run(sec, { draw: false });
    const n = seen.renders;
    h.run(1 / 60);
    expect(seen.renders).toBe(n + 1);
  };

  /**
   * Lying, standing up, kneeling, standing up, (the girls) seated, standing up and falling asleep, each done while
   * hidden, then one frame drawn: whether that frame shows the posture reached (its drawing whole, or gone), and for
   * sleep, the head as far down as a second later.
   */
  const postures = async (h) => {
    const out = [];
    const shows = (tag, ok) => out.push([tag, ok]);
    h.run(1);
    await hiddenThen(h, 'lie');
    shows('lie', alpha('lie_body') === 1 && seen.hidden !== null);
    await hiddenThen(h, 'stand');
    shows('up from lying', alpha('lie_body') === 0 && seen.hidden === null);
    await hiddenThen(h, 'kneel');
    shows('kneel', alpha('kneel_body') === 1 && alpha('sit_skirt') === 0);
    await hiddenThen(h, 'stand');
    shows('up from kneeling', alpha('kneel_body') === 0 && alpha('sit_skirt') === 0);
    if (id !== 'whale') {
      await hiddenThen(h, 'sit');
      shows('sit', alpha('sit_skirt') === 1);
      await hiddenThen(h, 'stand');
      shows('up from sitting', alpha('sit_skirt') === 0);
    }
    await hiddenThen(h, 'sleep', 6);
    const first = pitchOf(id);
    h.run(1);
    shows('asleep', Math.abs(pitchOf(id) - first) < .05);
    return out;
  };

  it('shows the posture reached while hidden on the first frame back: lying, kneeling, (the girls) seated, standing up, asleep', async () => {
    const h = await figureOnKit(id, seen);
    try {
      expect((await postures(h)).filter(([, ok]) => !ok).map(([tag]) => tag)).toEqual([]);
    } finally { h.done(); }
  });

  it('without the catch-up some of those frames would still be the picture from before the hide, replaying the hand-over (what it fixes)', async () => {
    const was = M.CATCH_UP.gap;
    M.CATCH_UP.gap = Infinity;
    const h = await figureOnKit(id, seen);
    try {
      expect((await postures(h)).filter(([, ok]) => !ok).length).toBeGreaterThan(0);
    } finally { h.done(); M.CATCH_UP.gap = was; }
  });

  it('draws an ordinary late frame (under CATCH_UP.gap) as before: one step, clamped', async () => {
    const h = await figureOnKit(id, seen);
    try {
      h.run(1);
      h.pet.doWord('lie');
      h.run(.2, { draw: false });
      h.run(1 / 60);
      expect(alpha('lie_body')).toBe(0);
    } finally { h.done(); }
  });
});
