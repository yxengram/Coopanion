// Upstream #455 (f28929d8), web/mic.js; the first four cases are upstream's, the rest the fork's (#364 and the retries).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMic } from '../packages/cortico-world-desktop-pet/web/mic.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The page's microphone over a media device list whose system default the test moves. Like
 * Chromium's, the list leads with a 'default' entry that keeps its deviceId while the input
 * behind it changes, and a capture stays on the device it opened on.
 */
function page({ micDevice = '', deny = false, gone = [], fresh = false } = {}) {
  const messages = [], streams = [], contexts = [];
  const prefs = { mic: true, micDevice };
  const media = new EventTarget();
  const inputs = [
    { kind: 'audioinput', deviceId: 'virtual', groupId: 'g-virtual', label: 'Virtual input' },
    { kind: 'audioinput', deviceId: 'array', groupId: 'g-array', label: 'Microphone array' },
  ];
  let defaultId = 'virtual';
  // `fresh`: no access asked for yet, so the entries carry no deviceId or label until getUserMedia is called
  let granted = !fresh;
  media.enumerateDevices = async () => {
    const d = inputs.find((i) => i.deviceId === defaultId);
    const all = [{ ...d, deviceId: 'default', label: `Default - ${d.label}` }, ...inputs];
    return granted ? all : all.map((i) => ({ ...i, deviceId: '', label: '' }));
  };
  media.getUserMedia = async ({ audio }) => {
    if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
    granted = true;
    // a chosen device that is no longer there, or one the system cannot open
    const want = audio.deviceId?.exact ?? defaultId;
    if (gone.includes(want)) throw new DOMException(`Could not open ${want}`, audio.deviceId ? 'OverconstrainedError' : 'NotReadableError');
    const input = inputs.find((i) => i.deviceId === (audio.deviceId?.exact ?? defaultId));
    const track = Object.assign(new EventTarget(), { label: input.label, live: true, stop() { this.live = false; } });
    const stream = { id: input.deviceId, track, getTracks: () => [track], getAudioTracks: () => [track] };
    streams.push(stream);
    return stream;
  };
  vi.stubGlobal('navigator', { mediaDevices: media });
  vi.stubGlobal('AudioContext', class {
    closed = false;
    audioWorklet = { addModule: async () => {} };
    constructor() { contexts.push(this); }
    createMediaStreamSource() { return { connect() {} }; }
    close() { this.closed = true; }
  });
  vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null }; });
  const mic = createMic({ prefs, send: (m) => messages.push(m), sendAudio: () => {} });
  return {
    mic, prefs, messages, contexts,
    streams: () => streams,
    /** The devices with a capture open on them. */
    live: () => streams.filter((s) => s.track.live).map((s) => s.id),
    /** Makes `id` the system default and fires the device change. */
    setDefault: (id) => { defaultId = id; media.dispatchEvent(new Event('devicechange')); },
    /** Fires a device change, the default unchanged (a device plugged in or out). */
    change: () => media.dispatchEvent(new Event('devicechange')),
    gone,
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('pet microphone', () => {
  it('moves to the new system default input when none is chosen', async () => {
    const p = page();
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual(['array']);
    expect(p.contexts[0].closed).toBe(true);
    expect(p.messages.filter((m) => m.t === 'mic').at(-1)).toMatchObject({ state: 'on', detail: 'Microphone array' });
  });

  it('stays on the chosen input when the system default changes', async () => {
    const p = page({ micDevice: 'virtual' });
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual(['virtual']);
    expect(p.contexts).toHaveLength(1);
  });

  it('does not try again after a permission denial when devices change', async () => {
    const p = page({ deny: true });
    await p.mic.start();
    p.setDefault('array');
    await settle();
    expect(p.messages.filter((m) => m.t === 'mic')).toEqual([expect.objectContaining({ state: 'denied' })]);
  });

  // fork additions: #364 (the list on a failed open) and the retry after one
  it('lists the inputs when an open fails for any reason but a denial, so another one can be chosen (upstream #364)', async () => {
    const p = page({ micDevice: 'unplugged', gone: ['unplugged'], fresh: true });
    await p.mic.start();
    await settle();
    // before the open the entries were unreadable
    expect(p.messages[0]).toEqual({ t: 'devices', list: [] });
    expect(p.messages.filter((m) => m.t === 'mic')).toEqual([expect.objectContaining({ state: 'error' })]);
    expect(p.messages.filter((m) => m.t === 'devices').at(-1)).toEqual({ t: 'devices', list: [{ id: 'virtual', label: 'Virtual input' }, { id: 'array', label: 'Microphone array' }] });
    expect(p.live()).toEqual([]);
  });

  it('lists nothing after a denial', async () => {
    const p = page({ deny: true, fresh: true });
    await p.mic.start();
    await settle();
    // the list read before opening is sent; none after the denial
    const after = p.messages.slice(p.messages.findIndex((m) => m.t === 'mic'));
    expect(after.some((m) => m.t === 'devices')).toBe(false);
  });

  it('tries a failed open again on the next device change, once the input opens', async () => {
    const p = page({ gone: ['virtual'] });
    await p.mic.start();
    await settle();
    expect(p.live()).toEqual([]);
    p.gone.length = 0;
    p.change();
    await settle();
    expect(p.live()).toEqual(['virtual']);
    expect(p.messages.filter((m) => m.t === 'mic').at(-1)).toMatchObject({ state: 'on', detail: 'Virtual input' });
  });

  it('opens again when the track ends while the World still wants the microphone', async () => {
    const p = page();
    await p.mic.start();
    p.streams()[0].track.live = false;
    p.streams()[0].track.dispatchEvent(new Event('ended'));
    await settle();
    expect(p.live()).toEqual(['virtual']);
    expect(p.contexts).toHaveLength(2);
    expect(p.contexts[0].closed).toBe(true);
  });

  it('a device change with the default unchanged keeps the capture', async () => {
    const p = page();
    await p.mic.start();
    p.change();
    await settle();
    expect(p.live()).toEqual(['virtual']);
    expect(p.contexts).toHaveLength(1);
  });

  it('releases the capture on stop and opens nothing on a later device change', async () => {
    const p = page();
    await p.mic.start();
    p.mic.stop();
    p.setDefault('array');
    await settle();
    expect(p.live()).toEqual([]);
    expect(p.contexts.every((c) => c.closed)).toBe(true);
    expect(p.messages.filter((m) => m.t === 'mic').at(-1)).toEqual({ t: 'mic', state: 'off' });
  });
});
