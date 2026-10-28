/**
 * Voice input end to end inside the World: PCM frames over the pet socket → segmenter →
 * FunASR (a stand-in for sherpa-onnx's recognizer that answers with a set line) →
 * `desktop-pet.speech` event, with the listen phases the page shows along the way.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import type { MicMode } from '../src/config.ts';
import type { SherpaModule } from '../src/asr/funasr.ts';
import type { ModelSpec } from '../src/runtime/store.ts';
import { parseHotkey, type Hotkey } from '../src/asr/hotkey.ts';
import { rmsDb } from '../src/asr/segmenter.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { fakeSapi } from './helpers/fake-sapi.ts';

/** A recognizer that answers `reply(samples)`; `decodes` lists how many samples each decode got. */
interface FakeFunAsr { sherpa: SherpaModule; decodes: number[]; configs: Array<Record<string, unknown>>; reply: (samples: number) => string; hold?: Promise<void>; beforeLoad?: () => Promise<void> }

function fakeFunAsr(text: string | ((samples: number) => string)): FakeFunAsr {
  const fake = { decodes: [] as number[], configs: [] as Array<Record<string, unknown>>, reply: typeof text === 'string' ? () => text : text } as FakeFunAsr;
  fake.sherpa = {
    OfflineRecognizer: {
      createAsync: async (config) => {
        fake.configs.push(config);
        await fake.beforeLoad?.();
        return {
          createStream: () => {
            const stream = { samples: 0, acceptWaveform: (w: { samples: Float32Array }) => { stream.samples += w.samples.length; } };
            return stream;
          },
          decodeAsync: async (stream) => {
            const n = (stream as { samples: number }).samples;
            if (fake.hold) await fake.hold;
            fake.decodes.push(n);
            return { text: fake.reply(n) };
          },
        };
      },
    },
  };
  return fake;
}

const MODEL = Buffer.from('model');
const TOKENS = Buffer.from('tokens');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** A small stand-in for the FunASR model, fetched from `url` when not placed beforehand. */
const modelSpec = (url = 'http://127.0.0.1:9'): ModelSpec => ({
  id: 'test-model',
  files: [{ name: 'model.int8.onnx', bytes: MODEL.length, sha256: sha(MODEL) }, { name: 'tokens.txt', bytes: TOKENS.length, sha256: sha(TOKENS) }],
  sources: [(f) => `${url}/${f}`],
});
function placeModel(modelsDir: string): void {
  mkdirSync(join(modelsDir, 'test-model'), { recursive: true });
  writeFileSync(join(modelsDir, 'test-model', 'model.int8.onnx'), MODEL);
  writeFileSync(join(modelsDir, 'test-model', 'tokens.txt'), TOKENS);
}

const tone = (ms: number, amp: number) => {
  const frames: Int16Array[] = [];
  for (let f = 0; f < ms / 20; f++) {
    const fr = new Int16Array(320);
    for (let i = 0; i < 320; i++) fr[i] = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 440 * (f * 320 + i) / 16000));
    frames.push(fr);
  }
  return frames;
};

const platform = process.platform;
let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  Object.defineProperty(process, 'platform', { value: platform });
  cleanup = [];
});

/** A talk key the test presses; `problem` makes it unreadable. */
function scriptedKey(problem?: string) {
  const key = { press: (_down: boolean) => {}, tap: () => {}, hotkey: null as Hotkey | null };
  const watch = async (hotkey: Hotkey, onChange: (down: boolean) => void, _pollMs: number, onTap?: (count: number) => void) => {
    if (problem) return problem;
    key.hotkey = hotkey;
    key.press = onChange;
    key.tap = () => onTap?.(1);
    return { stop: () => {} };
  };
  return { key, watch };
}

/** Writes a config patch into the live section, as Core does with a World's persist. */
const merge = (to: Record<string, unknown>, patch: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && to[k] && typeof to[k] === 'object') merge(to[k] as Record<string, unknown>, v as Record<string, unknown>);
    else to[k] = v;
  }
};

/** `more.loadGate` holds the model load until it settles (the backend stays `starting`); `more.persist` writes what the World saves into its section. */
async function setup(text: string | ((samples: number) => string), mode: MicMode = 'always', watch?: ReturnType<typeof scriptedKey>['watch'], openOnPress = false, more: { loadGate?: Promise<void>; spawnSystemRecognizer?: ReturnType<typeof fakeSapi>['spawnImpl']; persist?: boolean; patch?: (cfg: typeof DESKTOP_PET_DEFAULTS) => void } = {}) {
  const asr = fakeFunAsr(text);
  if (more.loadGate) asr.beforeLoad = () => more.loadGate!;
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.mic.mode = mode;
  cfg.asr.mic.openOnPress = openOnPress;
  const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
  placeModel(join(dir, 'm'));
  more.patch?.(cfg);
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: more.persist ? (patch) => merge(cfg as never, patch as never) : () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
    watchHotkey: watch, loadSherpa: () => asr.sherpa, funasrModel: modelSpec(), spawnSystemRecognizer: more.spawnSystemRecognizer,
  });
  const host = new FakeHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe(more.loadGate ? 'starting' : 'running');
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  return { asr, world, host, page, cfg };
}

/** Whether the FunASR recognizer holds a loaded model. */
const modelHeld = (world: DesktopPetWorld) => (world as unknown as { funasr: { rec: unknown } }).funasr.rec !== null;

describe('voice input on and off (upstream #298, #312)', () => {
  it('unloads the recognition model when voice input is switched off and loads it again when switched on', async () => {
    const { cfg, world, page, asr } = await setup('hello');
    expect(modelHeld(world)).toBe(true);
    cfg.asr.enabled = false;
    await page.next((m) => m.t === 'prefs' && m.mic === false);
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('stopped');
    expect(modelHeld(world)).toBe(false);
    cfg.asr.enabled = true;
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    expect(asr.configs).toHaveLength(2);
  });

  it('runs a full collection after the model is dropped, once the decode under way has ended', async () => {
    let release!: () => void;
    const { cfg, world, asr } = await setup('hello');
    asr.hold = new Promise<void>((r) => { release = r; });
    const gcs: number[] = [];
    const g = globalThis as { gc?: () => void };
    const had = g.gc;
    g.gc = () => { gcs.push(asr.decodes.length); };
    try {
      const decoding = (world as unknown as { funasr: { transcribe: (pcm: Int16Array) => Promise<unknown> } }).funasr.transcribe(new Int16Array(1600));
      cfg.asr.enabled = false;
      await new Promise((r) => setTimeout(r, 400));
      // still decoding: not collected yet
      expect(gcs).toEqual([]);
      release();
      await decoding;
      await expect.poll(() => gcs).toEqual([1]);
    } finally {
      release();
      if (had) g.gc = had; else delete g.gc;
    }
  });

  it('stops the engine that runs, even when the configured engine changed before the stop request', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { spawnImpl, spawned } = fakeSapi({ final: () => 'hello' });
    const { cfg, world } = await setup('hello', 'always', undefined, false, { spawnSystemRecognizer: spawnImpl });
    cfg.asr.engine = 'system';
    await world.webUi().invoke!('voice', 'stop', []);
    cfg.asr.engine = 'funasr';
    expect((world.voiceState().server as { phase: string }).phase).toBe('stopped');
    expect(modelHeld(world)).toBe(false);
    expect(spawned).toHaveLength(0);
  });

  it('finishes unloading a model still loading before a quick off and on loads it again', async () => {
    let loaded!: () => void;
    const loadGate = new Promise<void>((resolve) => { loaded = resolve; });
    const { cfg, world, page, asr } = await setup('hello', 'always', undefined, false, { loadGate });
    try {
      cfg.asr.enabled = false;
      await page.next((m) => m.t === 'prefs' && (m.voice as { enabled?: boolean })?.enabled === false);
      cfg.asr.enabled = true;
      const restarted = world.startVoiceBackend();
      loaded();
      await restarted;
      expect((world.voiceState().server as { phase: string }).phase).toBe('running');
      expect(asr.configs).toHaveLength(2);
    } finally { loaded(); }
  });

  it('ends the Windows recognition helper when voice input is switched off', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    Object.assign(cfg, { enabled: true, port: 0 });
    cfg.window.enabled = false;
    cfg.asr.engine = 'system';
    cfg.asr.mic.mode = 'always';
    const { spawnImpl, spawned } = fakeSapi({ final: () => 'hello' });
    const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
    const world = new DesktopPetWorld({ cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'), spawnSystemRecognizer: spawnImpl });
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    cfg.asr.enabled = false;
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('stopped');
    expect(spawned[0]!.child.exitCode).toBe(0);
    expect(world.voiceState().server).toMatchObject({ pid: null });
    // switched on again: a new helper
    cfg.asr.enabled = true;
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    expect(spawned).toHaveLength(2);
  });
});

describe('voice input', () => {
  it('turns a spoken utterance into one speech event that wakes', async () => {
    const { asr, host, page } = await setup('今天天气怎么样');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.speech', senderKey: 'desktop-pet.voice', text: '[语音] 伙伴:今天天气怎么样' });
    expect(host.pushOpts[0]).toEqual({ trigger: 'flush' });
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('今天天气怎么样');
    // the last decode is the whole utterance: at least the 900 ms spoken
    expect(asr.decodes.at(-1)).toBeGreaterThanOrEqual(900 * 16);
    expect(asr.configs[0]).toMatchObject({ modelConfig: { senseVoice: { language: 'zh' }, numThreads: 2 } });
  });

  it('drops a known hallucination and tells the page nothing was heard', async () => {
    const { host, page } = await setup('谢谢观看');
    for (const fr of [...tone(900, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(host.events).toHaveLength(0);
  });

  it('hold: only audio while the talk key is down counts, and releasing the key ends the utterance', async () => {
    const { key, watch } = scriptedKey();
    const { host, page, world } = await setup('帮我看看这个', 'hold', watch);
    expect(key.hotkey).toEqual(parseHotkey(DESKTOP_PET_DEFAULTS.asr.mic.hotkey));
    for (const fr of tone(600, .3)) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
    // the quick tap before the held press: the pet perks up before it listens
    key.tap();
    await page.next((m) => m.t === 'listen' && m.phase === 'ready');
    key.press(true);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    // quiet speech still counts while the key is held, pauses included
    for (const fr of [...tone(500, .01), ...tone(800, 0), ...tone(300, .01)]) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    expect(host.events).toHaveLength(0);
    key.press(false);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:帮我看看这个');
  });

  it('hold: the microphone stays open across a press and release unless it is set to open on press', async () => {
    const { key, watch } = scriptedKey();
    const { page } = await setup('帮我看看这个', 'hold', watch);
    expect(page.init.mic).toBe(true);
    key.press(true);
    key.press(false);
    await new Promise((r) => setTimeout(r, 800));
    expect(page.messages.some((m) => m.t === 'prefs' && m.mic === false)).toBe(false);
  });

  it('hold, open on press: the page opens the microphone from the press until shortly after the release', async () => {
    const { key, watch } = scriptedKey();
    const { page, host } = await setup('帮我看看这个', 'hold', watch, true);
    expect(page.init.mic).toBe(false);
    key.press(true);
    await page.next((m) => m.t === 'prefs' && m.mic === true);
    // the bubble waits for the microphone: listening starts with the first frame from it
    expect(page.messages.some((m) => m.t === 'listen' && m.phase === 'start')).toBe(false);
    page.audio(tone(20, .01)[0]!);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    for (const fr of tone(400, .2)) page.audio(fr);
    await new Promise((r) => setTimeout(r, 200));
    const up = Date.now();
    key.press(false);
    await page.next((m) => m.t === 'prefs' && m.mic === false);
    expect(Date.now() - up).toBeGreaterThanOrEqual(400);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:帮我看看这个');
  });

  it('open on press while set to another mode: the microphone stays open', async () => {
    const { watch } = scriptedKey();
    const { page } = await setup('x', 'toggle', watch, true);
    expect(page.init.mic).toBe(true);
  });

  it("the listening bubble's cancel drops what was heard, sends nothing and closes the bubble", async () => {
    const { key, watch } = scriptedKey();
    const { host, page } = await setup('说错了', 'hold', watch);
    key.press(true);
    for (const fr of tone(600, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    page.send({ t: 'cancel' });
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    // the key comes up after the cancel: nothing is left to send
    key.press(false);
    await new Promise((r) => setTimeout(r, 500));
    expect(host.events).toHaveLength(0);
    expect(page.messages.some((m) => m.t === 'listen' && m.phase === 'heard')).toBe(false);
  });

  it('a cancel while the sentence is transcribed drops its text when it lands; toggle is switched off', async () => {
    const { key, watch } = scriptedKey();
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => { release = r; });
    const { host, page, world, asr } = await setup('不要了', 'toggle', watch);
    asr.hold = slow;
    key.press(true);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    for (const fr of [...tone(600, .3), ...tone(900, 0)]) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'transcribing');
    page.send({ t: 'cancel' });
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(world.voiceState().input).toMatchObject({ open: false });
    release();
    await slow;
    await new Promise((r) => setTimeout(r, 600));
    expect(host.events).toHaveLength(0);
    expect(page.messages.some((m) => m.t === 'listen' && m.phase === 'heard')).toBe(false);
  });

  it('a threshold set from the meter applies to the next frame: speech below it is not heard (upstream #435)', async () => {
    const { world, host, page, cfg } = await setup('不该听见', 'always', undefined, false, { persist: true });
    const speech = tone(900, .3);
    const state = await world.webUi().invoke!('voice', 'setThreshold', [rmsDb(speech[0]!) + 3]) as { thresholdDb: number };
    expect(state.thresholdDb).toBe(rmsDb(speech[0]!) + 3);
    const last = tone(20, .05)[0]!;
    for (const fr of [...speech, ...tone(900, 0), last]) page.audio(fr);
    await expect.poll(() => world.voiceState().level).toBe(rmsDb(last));
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
    expect(host.events).toHaveLength(0);
    // kept within the setting's range; anything but a number changes nothing
    await world.webUi().invoke!('voice', 'setThreshold', [-200]);
    expect(cfg.asr.segment.thresholdDb).toBe(-80);
    await world.webUi().invoke!('voice', 'setThreshold', [12]);
    expect(cfg.asr.segment.thresholdDb).toBe(0);
    await world.webUi().invoke!('voice', 'setThreshold', ['-30']);
    expect(cfg.asr.segment.thresholdDb).toBe(0);
  });

  it('the typing key is watched only once switched on, and its press opens the typing box, not while the pet is hidden (upstream #361)', async () => {
    const { key, watch } = scriptedKey();
    // listening without a key: any key watched is the typing key
    const { page, cfg, world } = await setup('', 'always', watch, false, { persist: true });
    expect(key.hotkey).toBeNull();
    const state = await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true }]) as { typeKey: unknown };
    expect(state.typeKey).toEqual({ enabled: true, hotkey: 'LeftCtrl*2', keyLabel: expect.any(String), problem: null });
    expect(key.hotkey).toEqual(parseHotkey('LeftCtrl*2'));
    key.press(true);
    await page.next((m) => m.t === 'type');
    // hidden (the menu's 隐藏, the tray, a full-screen window): no box out of sight
    page.send({ t: 'focus', shown: false });
    await new Promise((r) => setTimeout(r, 50));
    const before = page.messages.filter((m) => m.t === 'type').length;
    key.press(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(page.messages.filter((m) => m.t === 'type')).toHaveLength(before);
    // another key, and how it is pressed; one parseHotkey cannot read is not saved
    await world.webUi().invoke!('pet', 'setTypeKey', [{ hotkey: 'F8' }]);
    expect(cfg.typeKey).toEqual({ enabled: true, hotkey: 'F8' });
    expect(key.hotkey).toEqual(parseHotkey('F8'));
    await world.webUi().invoke!('pet', 'setTypeKey', [{ hotkey: 'NoSuchKey+?' }]);
    expect(cfg.typeKey.hotkey).toBe('F8');
    // switched off: the watcher goes
    let stopped = 0;
    const off = await setup('', 'always', async (hk, onChange) => { key.hotkey = hk; key.press = onChange; return { stop: () => { stopped++; } }; }, false, { persist: true });
    await off.world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true }]);
    await off.world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: false }]);
    expect(stopped).toBe(1);
  });

  it('a config from before the typing key reads it off with the default key, and switching it on writes the whole setting (upstream #361)', async () => {
    const { key, watch } = scriptedKey();
    const { cfg, world } = await setup('', 'always', watch, false, { persist: true, patch: (c) => { delete (c as Partial<typeof c>).typeKey; } });
    expect(cfg.typeKey).toBeUndefined();
    expect((world.petState('en').typeKey as { enabled: boolean; hotkey: string })).toMatchObject({ enabled: false, hotkey: 'LeftCtrl*2', problem: null });
    await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true }]);
    expect(cfg.typeKey).toEqual({ enabled: true, hotkey: 'LeftCtrl*2' });
    expect(key.hotkey).toEqual(parseHotkey('LeftCtrl*2'));
  });

  it("a typing key that cannot be read says why in the typing key's own words, on the 习惯 page only while it is on (upstream #361)", async () => {
    Object.defineProperty(process, 'platform', { value: 'aix' });
    const { world } = await setup('', 'always', undefined, false, { persist: true });
    const on = await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: true }]) as { typeKey: { problem: string | null } };
    expect(on.typeKey.problem).toBe('打字键只在 Windows、macOS 和 Linux 上可用');
    const off = await world.webUi().invoke!('pet', 'setTypeKey', [{ enabled: false }]) as { typeKey: { problem: string | null } };
    expect(off.typeKey.problem).toBeNull();
  });

  it('a talk key that cannot be read keeps the gate closed and says why', async () => {
    const { watch } = scriptedKey('no keyboard here');
    const { host, page, world } = await setup('不该听见', 'toggle', watch);
    expect(world.voiceState().input).toMatchObject({ mode: 'toggle', hotkeyProblem: 'no keyboard here', open: false });
    const hint = (world.voiceState().input as { hint: string }).hint;
    expect(hint).toContain('no keyboard here');
    expect(hint).toContain('暂不识别说话');
    // the pet's microphone button keeps the configured mode: it shows the key, never AUTO
    expect((world as unknown as { snapshot(): { voice: unknown } }).snapshot().voice).toMatchObject({ mode: 'toggle' });
    const last = tone(20, .05)[0]!;
    for (const fr of [...tone(900, .3), ...tone(900, 0), last]) page.audio(fr);
    // frames arrive in order: once the last one is metered, every sentence the others made is counted
    await expect.poll(() => world.voiceState().level).toBe(rmsDb(last));
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
    expect(host.events).toHaveLength(0);
  });

  it('the microphone button held down sends the sentence without waiting for its closing pause', async () => {
    const { host, page } = await setup('帮我开灯');
    // speech with no pause after it: the segmenter is still inside the sentence
    for (const fr of tone(600, .3)) page.audio(fr);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    await new Promise((r) => setTimeout(r, 300));
    expect(host.events).toHaveLength(0);
    page.send({ t: 'commit' });
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:帮我开灯');
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('帮我开灯');
  });

  it('toggle: sending the sentence switches the talk key off', async () => {
    const { key, watch } = scriptedKey();
    const { host, page, world } = await setup('好了', 'toggle', watch);
    key.press(true); key.press(false);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    for (const fr of tone(600, .3)) page.audio(fr);
    page.send({ t: 'commit' });
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect((world.voiceState().input as { open: boolean }).open).toBe(false);
  });

  it('the button held down with nothing heard closes the listening bubble and sends nothing', async () => {
    const { key, watch } = scriptedKey();
    const { asr, host, page } = await setup('x', 'toggle', watch);
    key.press(true); key.press(false);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    page.send({ t: 'commit' });
    await page.next((m) => m.t === 'listen' && m.phase === 'none');
    expect(asr.decodes).toHaveLength(0);
    expect(host.events).toHaveLength(0);
  });

  it('system engine: the bubble shows the sentence while it is spoken, then the event carries the final text', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    Object.assign(cfg, { enabled: true, port: 0 });
    cfg.window.enabled = false;
    cfg.asr.engine = 'system';
    cfg.asr.mic.mode = 'always';
    // one character per 100 ms of audio heard so far; the final text settles on the whole sentence
    const { spawnImpl, spawned } = fakeSapi({ partial: (n) => '听'.repeat(Math.floor(n / 3200)) || null, final: () => '听清楚了' });
    const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
    const world = new DesktopPetWorld({ cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'), spawnSystemRecognizer: spawnImpl });
    const host = new FakeHost();
    await world.start(host);
    cleanup.push(() => world.stop());
    await expect.poll(() => (world.voiceState().server as { phase: string }).phase).toBe('running');
    const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page.close());

    for (const fr of tone(600, .3)) page.audio(fr);
    const live = await page.next((m) => m.t === 'listen' && m.phase === 'partial' && typeof m.interim === 'string' && m.interim.length >= 3);
    expect(live.text).toBe('');
    expect(host.events).toHaveLength(0);
    for (const fr of tone(900, 0)) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text).toBe('[语音] 伙伴:听清楚了');
    expect((await page.next((m) => m.t === 'listen' && m.phase === 'heard')).text).toBe('听清楚了');
    // one streamed sentence, not a second pass over the finished audio
    expect(spawned[0].lines.filter((l) => l.startsWith('B '))).toHaveLength(1);
  });

  it('funasr: the bubble shows what is heard while the sentence is spoken', async () => {
    // one character per 100 ms of audio decoded so far
    const { host, page } = await setup((n) => '听'.repeat(Math.floor(n / 1600)));
    for (const fr of tone(1400, .3)) page.audio(fr);
    const live = await page.next((m) => m.t === 'listen' && m.phase === 'partial' && typeof m.interim === 'string' && m.interim.length >= 3);
    expect(live.text).toBe('');
    expect(host.events).toHaveLength(0);
    for (const fr of tone(900, 0)) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0].text.length).toBeGreaterThan('[语音] 伙伴:'.length + 13);
  });

  it('funasr without its model says so, and the download starts it', async () => {
    const MODEL_FILES: Record<string, Buffer> = { 'model.int8.onnx': Buffer.from('model'), 'tokens.txt': Buffer.from('tokens') };
    const server = createServer((req, res) => {
      const body = MODEL_FILES[(req.url ?? '').slice(1)];
      if (!body) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-length': String(body.length) }).end(body);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    cleanup.push(() => new Promise((r) => server.close(() => r())));
    const asr = fakeFunAsr('你好');
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    Object.assign(cfg, { enabled: true, port: 0 });
    cfg.window.enabled = false;
    const dir = mkdtempSync(join(tmpdir(), 'pet-voice-'));
    const world = new DesktopPetWorld({
      cfg, timezone: 'Asia/Shanghai', persist: () => {}, runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
      loadSherpa: () => asr.sherpa, funasrModel: modelSpec(`http://127.0.0.1:${(server.address() as { port: number }).port}`),
    });
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    await expect.poll(() => (world.voiceState().server as { detail: string | null }).detail).toContain('识别模型还没下载');
    expect((world.voiceState().server as { phase: string }).phase).toBe('stopped');
    expect((world.voiceState().model as { phase: string }).phase).toBe('absent');
    await world.installVoice();
    expect((world.voiceState().model as { phase: string }).phase).toBe('ready');
    expect((world.voiceState().server as { phase: string }).phase).toBe('running');
    expect(asr.configs).toHaveLength(1);
  });

  it('ignores quiet input', async () => {
    const { asr, page, world } = await setup('x');
    for (const fr of tone(1500, .002)) page.audio(fr);
    await new Promise((r) => setTimeout(r, 400));
    expect(asr.decodes).toHaveLength(0);
    expect((world.voiceState().counts as { utterances: number }).utterances).toBe(0);
  });
});
