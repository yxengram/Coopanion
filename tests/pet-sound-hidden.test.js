// A hidden pet window plays nothing (upstream #136/#143): the window does not throttle its page, so the page's
// document.hidden stays false while the window is hidden; the window process says so (pet:shown, host/preload.cjs).
import { describe, expect, it } from 'vitest';
import { createSfx } from '../packages/cortico-world-desktop-pet/web/sound.js';

/** A window AudioContext that counts what is made and faded, installed as the page's for `fn`. */
async function withWindowAudio(fn) {
  const made = { tones: 0, clips: 0, fades: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() { made.fades++; }, setTargetAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), playbackRate: param() });
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8; this.destination = {}; }
    createGain() { return node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createOscillator() { made.tones++; return node(); }
    createBufferSource() { made.clips++; return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
    decodeAudioData() { return Promise.resolve({}); }
  }
  const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: { AudioContext: Ctx }, document: { hidden: false }, location: { href: 'http://127.0.0.1/' }, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) });
  try { await fn(made); } finally { Object.assign(globalThis, saved); }
}

describe('sound while the pet window is hidden', () => {
  it('plays nothing hidden, though the page reads as visible, and plays again once shown', async () => {
    await withWindowAudio(async (made) => {
      const sfx = createSfx({ storageKey: 'test.sfx.hidden' });
      sfx.unlock();
      sfx.usePack('/packs/robot/', { boing: { file: 'boing.ogg', kind: 'move', volume: 1 } });
      await new Promise((r) => setTimeout(r, 0));
      sfx.play('boing', 'move');
      sfx.setShown(false);
      const before = { ...made };
      sfx.play('boing', 'move'); sfx.play('look', 'move'); sfx.pop(); sfx.expr('happy');
      expect(made).toEqual(before);
      sfx.setShown(true);
      sfx.pop();
      expect(made.tones).toBeGreaterThan(before.tones);
    });
  });

  it('fades out a song still playing when the window is hidden', async () => {
    await withWindowAudio(async (made) => {
      const sfx = createSfx({ storageKey: 'test.sfx.hidden' });
      sfx.unlock();
      sfx.play('song', 'move');
      expect(made.tones).toBeGreaterThan(0);
      expect(made.fades).toBe(0);
      sfx.setShown(false);
      expect(made.fades).toBeGreaterThan(0);
    });
  });

  it('a context given to render into is no window and does not listen', async () => {
    const made = { voices: 0 };
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), playbackRate: param() });
    const ctx = {
      currentTime: 0, sampleRate: 8, destination: {},
      createGain: node, createDynamicsCompressor: node, createBiquadFilter: node,
      createOscillator() { made.voices++; return node(); }, createBufferSource() { made.voices++; return node(); },
      createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
    };
    const sfx = createSfx({ ctx });
    sfx.setShown(false);
    sfx.pop();
    expect(made.voices).toBeGreaterThan(0);
  });
});
