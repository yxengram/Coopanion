/**
 * The pet page's sounds placed left to right (upstream #435): web/sound.js puts a StereoPannerNode after the master
 * gain of the page's own context, mixed to one channel, with a gain after it that gives the centre the level it had
 * without a panner (a mono panner is equal-power, about .71 a side at the centre). `setPan` moves it smoothly and
 * skips changes under .01. A context given to render into (scripts/render-sounds.cjs) gets no panner, nor does a
 * context without createStereoPanner. Checked on a fake context that records the graph.
 */
import { describe, expect, it } from 'vitest';
import { createSfx } from '../packages/cortico-world-desktop-pet/web/sound.js';

/** A context whose nodes record what they connect to and what their params are told. */
function fakeContext({ panner = true } = {}) {
  const made = [];
  const param = (name, owner) => ({ value: 0, calls: [], setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
    setTargetAtTime(v, at, k) { owner.calls.push([name, v, at, k]); } });
  const node = (kind) => {
    const n = { kind, to: [], calls: [], connect(o) { n.to.push(o); }, start() {}, stop() {} };
    for (const p of ['frequency', 'gain', 'Q', 'detune', 'playbackRate', 'pan']) n[p] = param(p, n);
    made.push(n);
    return n;
  };
  const destination = { kind: 'destination' };
  const ctx = {
    currentTime: 2, sampleRate: 8, destination, state: 'running',
    createGain: () => node('gain'), createDynamicsCompressor: () => node('compressor'), createBiquadFilter: () => node('filter'),
    createOscillator: () => node('osc'), createBufferSource: () => node('source'),
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    ...(panner ? { createStereoPanner: () => node('panner') } : {}),
  };
  /** The chain from the master gain (the first gain made) to the destination, by kind. */
  const chain = () => {
    const out = [];
    for (let n = made.find((m) => m.kind === 'gain'); n; n = n.to?.[0]) out.push(n.kind);
    return out;
  };
  return { ctx, made, chain };
}

describe('the sounds are panned (upstream #435)', () => {
  it('master → panner (one channel) → centre level → compressor; setPan moves it smoothly and skips tiny changes', () => {
    const f = fakeContext();
    const sfx = createSfx({ ctx: f.ctx, pan: true });
    sfx.setPan(-.4);
    sfx.pop();
    expect(f.chain()).toEqual(['gain', 'panner', 'gain', 'compressor', 'destination']);
    const [master, level] = f.made.filter((n) => n.kind === 'gain');
    const panner = f.made.find((n) => n.kind === 'panner');
    expect([master.channelCount, master.channelCountMode]).toEqual([1, 'explicit']);
    expect(level.gain.value).toBeCloseTo(Math.SQRT2);
    // a pan set before the first sound is where the panner starts
    expect(panner.pan.value).toBe(-.4);
    sfx.setPan(.5);
    sfx.setPan(.505);
    sfx.setPan(9);
    sfx.setPan(Number.NaN);
    expect(panner.calls).toEqual([['pan', .5, 2, .03], ['pan', 1, 2, .03]]);
  });

  it('a context given to render into is left as it was, and so is one with no StereoPannerNode', () => {
    const given = fakeContext();
    const sfx = createSfx({ ctx: given.ctx });
    sfx.setPan(1);
    sfx.pop();
    expect(given.chain()).toEqual(['gain', 'compressor', 'destination']);
    const old = fakeContext({ panner: false });
    const other = createSfx({ ctx: old.ctx, pan: true });
    other.setPan(1);
    other.pop();
    expect(old.chain()).toEqual(['gain', 'compressor', 'destination']);
  });
});
