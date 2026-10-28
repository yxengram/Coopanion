/**
 * The 「语音输入」 panel (the desktop-pet World's `voice` panel, src/webui/client.ts) over a started World: 启动 is
 * greyed out while voice input is off, so a switched-off engine is not started from there (upstream #312).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { createWebUi } from 'cortico/web/client/ui/index.ts';
import { DESKTOP_PET_DEFAULTS } from '../packages/cortico-world-desktop-pet/src/config.ts';
import { DesktopPetWorld } from '../packages/cortico-world-desktop-pet/src/world.ts';
import { petText } from '../packages/cortico-world-desktop-pet/src/i18n/index.ts';
import bundle from '../packages/cortico-world-desktop-pet/src/webui/client.ts';
import { FakeHost } from '../packages/cortico-world-desktop-pet/tests/helpers/fake-host.ts';

// Node environment with a window of its own: under the jsdom environment Vite rewrites the World's
// `new URL(path, import.meta.url)` file paths into http URLs.
let world, panel;

afterEach(async () => {
  panel?.unmount();
  vi.unstubAllGlobals();
  await world?.stop();
});

/** Writes a config patch into the live section, as Core does with a World's persist. */
const merge = (to, patch) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) merge(to[k], v);
    else to[k] = v;
  }
};

/** The panel over a started World with voice input off and no model on disk; `secrets` holds the transcription key. */
async function mount(language, change = () => {}) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  Object.assign(cfg, { enabled: true, port: 0 });
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  cfg.asr.engine = 'funasr';
  cfg.asr.mic.mode = 'always';
  change(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'console-voice-'));
  const secrets = { key: '' };
  const calls = [];
  world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', persist: (patch) => merge(cfg, patch), runtimesRoot: () => join(dir, 'rt'), modelsDir: () => join(dir, 'm'),
    asrApiKey: () => secrets.key, storeAsrApiKey: (key) => { secrets.key = key; },
  });
  await world.start(new FakeHost());
  const { window } = new JSDOM('<!doctype html><body></body>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  // the panel's signal and its DOM come from the same window
  const controller = new window.AbortController();
  const timers = [];
  panel = { unmount: () => { controller.abort(); timers.forEach(clearInterval); } };
  const root = window.document.createElement('div');
  window.document.body.append(root);
  bundle.panels.voice.mount({
    pageId: 'world:desktop-pet', panelId: 'voice', language, root, signal: controller.signal,
    ui: createWebUi({ doc: window.document, overlayHost: window.document.body, signal: controller.signal, memo: { get: (_, fallback) => fallback, set() {} } }),
    invoke: async (method, args = []) => {
      calls.push([method, args]);
      return JSON.parse(JSON.stringify(await world.webUi(language).invoke('voice', method, args)));
    },
    interval: (fn, ms) => { const id = setInterval(fn, ms); timers.push(id); return { dispose: () => clearInterval(id) }; },
    own: (d) => { controller.signal.addEventListener('abort', () => d.dispose()); return d; },
    stream: () => ({ dispose() {}, send() {}, open: false }),
  });
  const t = petText(language).panel;
  const start = [...root.querySelectorAll('button')].find((b) => b.textContent === t.start);
  const enabled = root.querySelector('input[role="switch"]');
  return { start, enabled, Event: window.Event, cfg, root, t, secrets, calls, window };
}

it.each(['zh', 'en'])('greys out Start (%s) while voice input is off and enables it once voice input is on', async (language) => {
  const { start, enabled, Event, cfg } = await mount(language);
  await vi.waitFor(() => expect(start.disabled).toBe(true));
  expect(enabled.checked).toBe(false);
  enabled.checked = true;
  enabled.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(start.disabled).toBe(false));
  expect(cfg.asr.enabled).toBe(true);
});

/** The transcription service's rows (upstream #380): name → { row, input, state }. */
const apiRowsOf = (root, t) => Object.fromEntries([t.apiUrl, t.apiModel, t.apiKey].map((name) => {
  const row = [...root.querySelectorAll('.mountrow')].find((r) => r.querySelector('.mname')?.textContent === name);
  return [name, { row, input: row?.querySelector('input'), state: row?.querySelector('.mstate') }];
}));

it.each(['zh', 'en'])('shows the address, model and API Key rows (%s) only for the transcription service, and never shows the key', async (language) => {
  const { root, t, cfg, secrets, calls, Event, window } = await mount(language, (c) => { c.asr.enabled = true; });
  const engineSel = root.querySelector('.mountrow select');
  await vi.waitFor(() => expect([...engineSel.options].map((o) => o.value)).toContain('api'));
  expect([...engineSel.options].find((o) => o.value === 'api').textContent).toBe(t.api);
  let rows = apiRowsOf(root, t);
  for (const r of Object.values(rows)) expect(r.row.style.display).toBe('none');

  engineSel.value = 'api';
  engineSel.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(rows[t.apiUrl].row.style.display).toBe(''));
  expect(cfg.asr.engine).toBe('api');
  expect(rows[t.apiKey].state.textContent).toBe(t.keyMissing);
  expect(rows[t.apiKey].input.type).toBe('password');
  // the model row is hidden: nothing to download
  const modelRow = [...root.querySelectorAll('.mountrow')].find((r) => r.querySelector('.mname')?.textContent === t.model);
  expect(modelRow.style.display).toBe('none');
  // the 识别服务 row says why it cannot run yet, in the app language as every engine's reason (zh here)
  const server = [...root.querySelectorAll('.mountrow')].find((r) => r.querySelector('.mname')?.textContent === t.server);
  await vi.waitFor(() => expect(server.querySelector('.mdetail').textContent).toBe(petText('zh').transcription.noUrl));

  rows[t.apiUrl].input.value = 'http://127.0.0.1:9/v1';
  rows[t.apiUrl].input.dispatchEvent(new Event('change'));
  rows[t.apiModel].input.value = 'whisper-1';
  rows[t.apiModel].input.dispatchEvent(new Event('change'));
  rows[t.apiKey].input.value = 'sk-test-123';
  rows[t.apiKey].input.dispatchEvent(new Event('change'));
  // cleared at once, not waiting for the answer
  expect(rows[t.apiKey].input.value).toBe('');
  await vi.waitFor(() => expect(rows[t.apiKey].state.textContent).toBe(t.keySaved));
  expect(cfg.asr.api).toEqual({ baseUrl: 'http://127.0.0.1:9/v1', model: 'whisper-1' });
  expect(secrets.key).toBe('sk-test-123');
  expect(JSON.stringify(cfg)).not.toContain('sk-test-123');
  expect(calls.filter(([m]) => m === 'setApi').map(([, a]) => a[0])).toEqual([{ baseUrl: 'http://127.0.0.1:9/v1' }, { model: 'whisper-1' }, { key: 'sk-test-123' }]);
  // every state the panel was sent: the key is only ever "saved"
  const state = await world.webUi(language).invoke('voice', 'state', []);
  expect(JSON.stringify(state)).not.toContain('sk-test-123');
  expect(state.api).toEqual({ baseUrl: 'http://127.0.0.1:9/v1', model: 'whisper-1', keySaved: true });
  await vi.waitFor(() => expect(server.querySelector('.mstate').textContent).toBe(t.ready));
  expect(rows[t.apiUrl].input.value).toBe('http://127.0.0.1:9/v1');
  void window;
});

it('says in the panel language why a key with a space is refused', async () => {
  const { root, t, secrets, Event } = await mount('en', (c) => { c.asr.enabled = true; c.asr.engine = 'api'; });
  const rows = apiRowsOf(root, t);
  await vi.waitFor(() => expect(rows[t.apiKey].row.style.display).toBe(''));
  rows[t.apiKey].input.value = 'sk one';
  rows[t.apiKey].input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.textContent).toContain(petText('en').transcription.badKey));
  expect(secrets.key).toBe('');
});
