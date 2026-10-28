/**
 * Engine `api` end to end inside the World: PCM frames over the pet socket → segmenter → one POST to
 * a stand-in for an OpenAI-compatible transcription service on a local port → `desktop-pet.speech`,
 * and what the voice panel shows when the service fails. Ported from upstream a2a314d1 (#380); the fork's own cases
 * (an old config without `asr.api`, a key with whitespace, the engine on every platform, the provider's address rule) follow.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld } from '../src/world.ts';
import { petText } from '../src/i18n/index.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

const t = petText('zh');

const tone = (ms: number, amp: number) => {
  const frames: Int16Array[] = [];
  for (let f = 0; f < ms / 20; f++) {
    const fr = new Int16Array(320);
    for (let i = 0; i < 320; i++) fr[i] = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 440 * (f * 320 + i) / 16000));
    frames.push(fr);
  }
  return frames;
};
/** 900 ms of speech and the pause that ends the sentence. */
const sentence = () => [...tone(900, .3), ...tone(900, 0)];

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

interface Request { method: string; path: string; auth: string | undefined; fields: Record<string, string>; file: { name: string; type: string; bytes: Buffer } | null }

/** A transcription service on a local port: `answer` replies to each request, in order; all are recorded. */
async function service(...answers: Array<(res: ServerResponse) => void>) {
  const seen: Request[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData();
    const fields: Record<string, string> = {};
    let file: Request['file'] = null;
    for (const [name, value] of form) {
      if (typeof value === 'string') fields[name] = value;
      else file = { name: value.name, type: value.type, bytes: Buffer.from(await value.arrayBuffer()) };
    }
    seen.push({ method: req.method ?? '', path: req.url ?? '', auth: req.headers.authorization, fields, file });
    (answers[seen.length - 1] ?? answers.at(-1)!)(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  cleanup.push(() => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, seen };
}

const json = (status: number, body: unknown) => (res: ServerResponse) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

/** A talk key the test presses (as voice.test.ts's). */
function scriptedKey() {
  const key = { press: (_down: boolean) => {} };
  const watch = async (_hotkey: unknown, onChange: (down: boolean) => void) => {
    key.press = onChange;
    return { stop: () => {} };
  };
  return { key, watch: watch as never as typeof import('../src/asr/hotkey.ts').watchHotkey };
}

/** Writes a config patch into the live section, as Core does with a World's persist. */
const merge = (to: Record<string, unknown>, patch: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(patch)) {
    // as Cortico's assignDeep: a section the config lacks is added whole
    if (v && typeof v === 'object' && !Array.isArray(v) && to[k] && typeof to[k] === 'object') merge(to[k] as Record<string, unknown>, v as Record<string, unknown>);
    else to[k] = v;
  }
};

/** A started World on engine `api` at `baseUrl`, listening all the time, with its secrets in `secrets`. */
async function setup(baseUrl: string, change: (cfg: DesktopPetConfigSection) => void = () => {}, language: 'zh' | 'en' = 'zh', watchHotkey?: ReturnType<typeof scriptedKey>['watch']) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.engine = 'api';
  cfg.asr.mic.mode = 'always';
  cfg.asr.api = { baseUrl, model: 'test-model' };
  change(cfg);
  const secrets = { key: '' };
  const dir = mkdtempSync(join(tmpdir(), 'pet-api-'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: (patch) => merge(cfg as never, patch as never), runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
    asrApiKey: () => secrets.key, storeAsrApiKey: (key) => { secrets.key = key; },
    ...(watchHotkey ? { watchHotkey } : {}),
  });
  const host = new FakeHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
  cleanup.push(() => page.close());
  const panel = (method: string, args: unknown[] = []) => world.webUi(language).invoke!('voice', method, args) as Promise<Record<string, unknown>>;
  const engine = () => world.voiceState(language).server as { phase: string; detail: string | null; url: string };
  return { cfg, world, host, page, panel, engine, secrets };
}

describe('engine api', () => {
  it('sends a finished sentence as 16 kHz mono 16-bit WAV with the model, the language and the json format, and delivers the text', async () => {
    const { url, seen } = await service(json(200, { text: ' 今天天气怎么样 ' }));
    const { cfg, host, page, panel, engine, secrets } = await setup(url);
    await panel('setApi', [{ key: 'test-key' }]);
    expect(secrets.key).toBe('test-key');
    expect(JSON.stringify(cfg)).not.toContain('test-key');
    expect((await panel('state')).api).toEqual({ baseUrl: url, model: 'test-model', keySaved: true });
    await expect.poll(() => engine().phase).toBe('running');

    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.speech', senderKey: 'desktop-pet.voice', text: '[语音] 伙伴:今天天气怎么样' });
    const [req] = seen;
    expect(req).toMatchObject({ method: 'POST', path: '/v1/audio/transcriptions', auth: 'Bearer test-key', fields: { model: 'test-model', language: 'zh', response_format: 'json' } });
    expect(req!.file!.type).toBe('audio/wav');
    const wav = req!.file!.bytes;
    expect([wav.toString('ascii', 0, 4), wav.toString('ascii', 8, 16), wav.toString('ascii', 36, 40)]).toEqual(['RIFF', 'WAVEfmt ', 'data']);
    expect({ format: wav.readUInt16LE(20), channels: wav.readUInt16LE(22), rate: wav.readUInt32LE(24), bits: wav.readUInt16LE(34) }).toEqual({ format: 1, channels: 1, rate: 16000, bits: 16 });
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
    // the whole sentence: at least the 900 ms spoken
    expect(wav.length - 44).toBeGreaterThanOrEqual(900 * 16 * 2);

    // auto names no language: the service tells it
    cfg.asr.language = 'auto';
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => seen.length, { timeout: 5000 }).toBe(2);
    expect(seen[1]!.fields).not.toHaveProperty('language');
  });

  it("shows a failed request's status and message as the engine's state and sends nothing more (one request) until a new key starts it again", async () => {
    const { url, seen } = await service(json(401, { error: { message: 'Invalid API key' } }), (res) => { res.writeHead(503); res.end('upstream down'); });
    const { world, host, page, panel, engine } = await setup(url);
    await expect.poll(() => engine().phase).toBe('running');

    for (const fr of sentence()) page.audio(fr);
    const failed = t.transcription.status(401, 'Invalid API key');
    await expect.poll(() => engine()).toMatchObject({ phase: 'error', detail: failed });
    expect(world.voiceState().recent).toMatchObject([{ text: t.voice.failedLine(failed), dropped: true }]);
    // the pet page closes the microphone, and its button says why
    await page.next((m) => m.t === 'prefs' && m.mic === false && (m.voice as { detail?: string })?.detail === failed);
    for (const fr of sentence()) page.audio(fr);
    await new Promise((r) => setTimeout(r, 1500));
    expect(seen).toHaveLength(1);
    expect(host.events).toHaveLength(0);

    await panel('setApi', [{ key: 'another-key' }]);
    expect(engine().phase).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => engine().detail, { timeout: 5000 }).toBe(t.transcription.status(503, 'upstream down'));
    expect(seen.map((r) => r.auth)).toEqual([undefined, 'Bearer another-key']);
  });

  it.each([307, 308])('fails the sentence on a %i redirect instead of sending the recording on, to plain http included', async (status) => {
    const other = await service(json(200, { text: '不该到这里' }));
    const { url, seen } = await service((res) => { res.writeHead(status, { location: `${other.url}/audio/transcriptions` }); res.end(); });
    const { host, page, engine } = await setup(url);
    await expect.poll(() => engine().phase).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => engine().phase, { timeout: 5000 }).toBe('error');
    expect(engine().detail).toBe(t.transcription.redirect);
    expect(seen).toHaveLength(1);
    expect(other.seen).toHaveLength(0);
    expect(host.events).toHaveLength(0);
  });

  it('gives up on a service that does not answer within asr.timeoutMs', async () => {
    const { url } = await service(() => {});
    const { page, engine } = await setup(url, (cfg) => { cfg.asr.timeoutMs = 300; });
    await expect.poll(() => engine().phase).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => engine(), { timeout: 5000 }).toMatchObject({ phase: 'error', detail: t.transcription.timeout(300) });
  });

  it('says what is missing before anything is sent, and starts once the address is filled in', async () => {
    const { url, seen } = await service(json(200, { text: '好' }));
    const { cfg, panel, engine } = await setup('');
    await expect.poll(() => engine()).toMatchObject({ phase: 'error', detail: t.transcription.noUrl });
    await panel('setApi', [{ baseUrl: ` ${url} ` }]);
    expect(cfg.asr.api.baseUrl).toBe(url);
    expect(engine()).toMatchObject({ phase: 'running', detail: null });
    expect(seen).toHaveLength(0);
  });

  it('reads a config written before asr.api as empty: the engine says the address is missing and nothing is sent', async () => {
    const { url, seen } = await service(json(200, { text: '好' }));
    const { cfg, panel, engine, world } = await setup('', (c) => { delete (c.asr as { api?: unknown }).api; });
    expect(cfg.asr).not.toHaveProperty('api');
    await expect.poll(() => engine()).toMatchObject({ phase: 'error', detail: t.transcription.noUrl, url: '' });
    expect(world.voiceState().api).toEqual({ baseUrl: '', model: '', keySaved: false });
    // the model alone is saved with an empty address beside it, not a half section
    await panel('setApi', [{ model: 'm1' }]);
    expect(cfg.asr.api).toEqual({ baseUrl: '', model: 'm1' });
    await panel('setApi', [{ baseUrl: url }]);
    expect(cfg.asr.api).toEqual({ baseUrl: url, model: 'm1' });
    expect(engine()).toMatchObject({ phase: 'running', url: `${url}/audio/transcriptions` });
    expect(seen).toHaveLength(0);
  });

  it('refuses a remote http address and an address that is not http(s), and takes http on this computer and the local network', async () => {
    const { panel, engine } = await setup('http://example.com/v1');
    await expect.poll(() => engine()).toMatchObject({ phase: 'error', detail: t.transcription.httpRemote });
    await panel('setApi', [{ baseUrl: 'ftp://example.com/v1' }]);
    expect(engine()).toMatchObject({ phase: 'error', detail: t.transcription.badUrl('ftp://example.com/v1') });
    await panel('setApi', [{ baseUrl: 'http://192.168.1.20:8000/v1' }]);
    expect(engine()).toMatchObject({ phase: 'running', detail: null });
    await panel('setApi', [{ baseUrl: 'https://api.example.com/v1/' }]);
    expect(engine()).toMatchObject({ phase: 'running', url: 'https://api.example.com/v1/audio/transcriptions' });
    await panel('setApi', [{ model: '' }]);
    expect(engine()).toMatchObject({ phase: 'error', detail: t.transcription.noModel });
  });

  it('refuses an API Key with whitespace in the panel language, before anything is saved', async () => {
    const { url } = await service(json(200, { text: 'hi' }));
    const { panel, secrets, cfg } = await setup(url, () => {}, 'en');
    await expect(panel('setApi', [{ key: 'two words', model: 'other' }])).rejects.toThrow(petText('en').transcription.badKey);
    expect(secrets.key).toBe('');
    expect(cfg.asr.api.model).toBe('test-model');
    // only the edges are trimmed
    await panel('setApi', [{ key: '  sk-1  ' }]);
    expect(secrets.key).toBe('sk-1');
    expect(cfg.asr.api).toEqual({ baseUrl: url, model: 'test-model' });
  });

  it('runs on every platform, and is chosen from the panel', async () => {
    const { url } = await service(json(200, { text: 'x' }));
    const { cfg, world, panel, engine } = await setup(url, (c) => { c.asr.engine = 'funasr'; });
    expect(world.engine()).toBe('funasr');
    const state = await panel('setEngine', ['api']);
    expect(cfg.asr.engine).toBe('api');
    expect(state).toMatchObject({ engine: 'api', api: { baseUrl: url, model: 'test-model', keySaved: false } });
    expect(engine().phase).toBe('running');
    for (const platform of ['darwin', 'linux', 'win32']) {
      const was = process.platform;
      Object.defineProperty(process, 'platform', { value: platform });
      try { expect(world.engine()).toBe('api'); } finally { Object.defineProperty(process, 'platform', { value: was }); }
    }
  });

  it('starts again when the address changes in the config page, a failed engine included', async () => {
    const first = await service(json(500, { error: { message: 'boom' } }));
    const second = await service(json(200, { text: '你好' }));
    const { cfg, host, page, engine } = await setup(first.url);
    await expect.poll(() => engine().phase).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => engine().detail, { timeout: 5000 }).toBe(t.transcription.status(500, 'boom'));
    // as the advanced config page does: the live section edited, the World polls it
    cfg.asr.api.baseUrl = second.url;
    await expect.poll(() => engine().phase, { timeout: 5000 }).toBe('running');
    for (const fr of sentence()) page.audio(fr);
    await expect.poll(() => host.events.length, { timeout: 5000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ text: '[语音] 伙伴:你好' });
    expect(first.seen).toHaveLength(1);
  });

  it('closes the listening bubble when the service fails before the closing pause: the microphone closes, so that pause never comes', async () => {
    const { url } = await service(json(401, { error: { message: 'Invalid API key' } }));
    const { host, page, engine } = await setup(url);
    await expect.poll(() => engine().phase).toBe('running');
    // the sentence is sent off after 250 ms of quiet, before the 600 ms that end it; nothing comes after the failure
    for (const fr of [...tone(900, .3), ...tone(300, 0)]) page.audio(fr);
    await expect.poll(() => engine().phase, { timeout: 5000 }).toBe('error');
    await page.next((m) => m.t === 'listen' && m.phase === 'none', 3000);
    expect(host.events).toHaveLength(0);
  });

  it('still delivers what was heard before the failure when it ends the episode', async () => {
    const { url, seen } = await service(json(200, { text: '第一句' }), json(401, { error: { message: 'Invalid API key' } }));
    const { host, page, engine } = await setup(url);
    await expect.poll(() => engine().phase).toBe('running');
    for (const fr of [...tone(900, .3), ...tone(300, 0)]) page.audio(fr);
    await expect.poll(() => seen.length, { timeout: 5000 }).toBe(1);
    for (const fr of [...tone(900, .3), ...tone(300, 0)]) page.audio(fr);
    await expect.poll(() => engine().phase, { timeout: 5000 }).toBe('error');
    await expect.poll(() => host.events.length, { timeout: 3000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ text: '[语音] 伙伴:第一句' });
  });

  // hold sends the sentence when the key is let go, so its failure comes after the release; toggle sends at each pause
  it.each(['toggle', 'hold'] as const)('%s: a failure switches the talk key off and closes the listening bubble; the key afterwards changes nothing', async (mode) => {
    const { url, seen } = await service(json(401, { error: { message: 'Invalid API key' } }));
    const { key, watch } = scriptedKey();
    const { host, page, engine, world } = await setup(url, (cfg) => { cfg.asr.mic.mode = mode; }, 'zh', watch);
    await expect.poll(() => engine().phase).toBe('running');
    key.press(true);
    if (mode === 'toggle') key.press(false);
    await page.next((m) => m.t === 'listen' && m.phase === 'start');
    for (const fr of [...tone(900, .3), ...tone(300, 0)]) page.audio(fr);
    await new Promise((r) => setTimeout(r, 100));
    if (mode === 'hold') key.press(false);
    await expect.poll(() => engine().phase, { timeout: 5000 }).toBe('error');
    await page.next((m) => m.t === 'listen' && m.phase === 'none', 3000);
    expect((world.voiceState().input as { open: boolean }).open).toBe(false);
    // the key afterwards: nothing is sent, nothing more is asked of the service
    key.press(true);
    key.press(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(host.events).toHaveLength(0);
    expect(seen).toHaveLength(1);
  });
});

