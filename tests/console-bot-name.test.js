// @vitest-environment jsdom
/**
 * 「Coo 的名字」 (upstream #320), read from the console's staged place in build/cortico (run `pnpm run build:cortico`
 * after changing it): the 习惯 page writes Core's `displayName` and tells the rail at once; cleared, it saves Coo.
 * An open chat page follows a `bot` frame from the desktop-pet World.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/bot-name.ts`);

class MemoryStorage {
  #map = new Map();
  get length() { return this.#map.size; }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  clear() { this.#map.clear(); }
}

async function load(language, ...files) {
  localStorage.setItem('cortico.webui.language', language);
  vi.resetModules();
  const out = [];
  for (const file of files) out.push(await import(/* @vite-ignore */ `${CLIENT}${file}`));
  return out;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A Core whose `core` group holds `displayName`; `reject` makes config writes fail. */
function fakeCore(language, state) {
  const sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (method === 'POST') sent.push({ path, body });
    if (path === '/api/config' && method === 'GET') {
      return json({ groups: [{ group: { id: 'companion' }, values: { language } }, { group: { id: 'core' }, values: { displayName: state.name } }] });
    }
    if (path === '/api/config' && method === 'POST') {
      if (state.reject) return json({ error: 'write failed' }, 500);
      if (body.group === 'core') state.name = body.values.displayName;
      return json({ result: body.group });
    }
    return json({});
  }));
  return sent;
}

class FakeSocket {
  static last = null;
  readyState = 0; onopen = null; onclose = null; onerror = null; onmessage = null;
  sent = [];
  constructor(url) { this.url = url; FakeSocket.last = this; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  frame(f) { this.onmessage?.({ data: JSON.stringify(f) }); }
}

const settle = () => new Promise((r) => setTimeout(r, 30));

async function mount(feature, [{ createWebUi }, { Lifecycle }]) {
  const lifecycle = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createWebUi({ memo: { get: (_k, d) => d, set: () => {} }, overlayHost: document.body, signal: lifecycle.signal, doc: document });
  const router = { route: { segments: [feature.route] }, navigate: () => {}, replace: () => {} };
  await feature.mount({ root, lifecycle, signal: lifecycle.signal, ui, router, route: router.route, capabilities: {}, onError: (err) => { throw err; }, refreshNav: () => {} });
  await settle();
  return { root, lifecycle };
}

const BASE = ['ui/index.ts', 'core/lifecycle.ts'];

describe.skipIf(!STAGED && !process.env.CI)("Coo's name", () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it.each(['zh', 'en'])('the 习惯 page (%s) shows displayName, saves a new one and tells the rail; cleared it saves Coo', async (language) => {
    const state = { name: 'Coo', reject: false };
    const sent = fakeCore(language, state);
    const [ui, life, pet] = await load(language, ...BASE, 'features/pet/index.ts');
    const { root, lifecycle } = await mount(pet.petFeature, [ui, life]);
    const label = pet.TEXT[language].botName;
    const row = [...root.querySelectorAll('.companion-row')].find((r) => r.querySelector('.companion-label')?.textContent === label);
    expect(row, label).toBeDefined();
    expect(row.textContent).toContain(pet.TEXT[language].botNameHint);
    const input = row.querySelector('input');
    expect([input.value, input.placeholder]).toEqual(['Coo', 'Coo']);
    const told = [];
    window.addEventListener('companion-name-saved', (e) => told.push(e.detail), { signal: lifecycle.signal });

    input.value = '  Mochi ';
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(told).toEqual(['Mochi']));
    expect(sent.filter((s) => s.body.group === 'core')).toEqual([{ path: '/api/config', body: { group: 'core', values: { displayName: 'Mochi' } } }]);
    expect(input.value).toBe('Mochi');
    // the same name again sends nothing
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(sent.filter((s) => s.body.group === 'core')).toHaveLength(1);

    input.value = '';
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(told).toEqual(['Mochi', 'Coo']));
    expect(state.name).toBe('Coo');
    expect(input.value).toBe('Coo');

    // a write that fails tells the rail nothing
    state.reject = true;
    input.value = 'Pip';
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(told).toEqual(['Mochi', 'Coo']);
    expect(state.name).toBe('Coo');
    lifecycle.dispose();
  });

  it.each([['zh', '和 Mochi 说点什么…'], ['en', 'Say something to Mochi…']])('an open chat page (%s) follows a bot frame', async (language, placeholder) => {
    fakeCore(language, { name: 'Coo' });
    window.WebSocket = FakeSocket;
    const [ui, life, chat] = await load(language, ...BASE, 'features/chat/index.ts');
    const { root, lifecycle } = await mount(chat.chatFeature, [ui, life]);
    const socket = FakeSocket.last;
    socket.open();
    socket.frame({ t: 'init', bot: 'Coo', paused: false, more: false, before: null, imagesSeen: true, phase: null, activity: null, pending: [], items: [] });
    // the composer is a React field: its hint is drawn on the next render
    const hint = () => root.querySelector('textarea')?.getAttribute('placeholder');
    await vi.waitFor(() => expect(hint()).toBe(placeholder.replace('Mochi', 'Coo')));
    socket.frame({ t: 'bot', bot: 'Mochi' });
    await vi.waitFor(() => expect(hint()).toBe(placeholder));
    lifecycle.dispose();
  });
});
