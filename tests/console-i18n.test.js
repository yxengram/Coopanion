// @vitest-environment jsdom
/**
 * The settings window's own pages (console/, read from their staged place in build/cortico: run
 * `pnpm run build:cortico` after changing them) in Chinese and English: every string table has the
 * same keys in zh and en, nothing in an en table is Chinese, the pages mounted in English show no
 * Chinese, and the app language is switched through the Core's config API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// the path from the module's own file URL: jsdom's global URL is not the one node:url takes
const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/language.ts`);
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

/** Every table of the overlay, by module, and the names they are exported under. */
const TABLES = {
  'main.ts': ['TEXT'],
  'features/language.ts': ['TEXT'],
  'features/release.ts': ['TEXT'],
  'features/clear-session.ts': ['TEXT'],
  'features/voice/index.ts': ['TEXT'],
  'features/dress/index.ts': ['TEXT'],
  'features/home/index.ts': ['TEXT'],
  'features/chatgpt/index.ts': ['TEXT'],
  'features/cua/index.ts': ['TEXT'],
  'features/chat/index.ts': ['TEXT', 'STEP_TEXT'],
  'features/pet/index.ts': ['TEXT'],
};

/** Browser storage: Node's own `localStorage` global (unusable without a file) hides jsdom's. */
class MemoryStorage {
  #map = new Map();
  get length() { return this.#map.size; }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  clear() { this.#map.clear(); }
}

/** Loads console modules fresh with `language` as the stored console language (strings are picked at module load). */
async function load(language, ...files) {
  localStorage.setItem('cortico.webui.language', language);
  vi.resetModules();
  const out = [];
  for (const file of files) out.push(await import(/* @vite-ignore */ `${CLIENT}${file}`));
  return out;
}

/** Same keys, same kinds of value and functions of the same arity, all the way down. */
function sameShape(zh, en, path) {
  if (typeof zh === 'function') {
    expect(typeof en, path).toBe('function');
    expect(en.length, path).toBe(zh.length);
  } else if (Array.isArray(zh)) {
    expect(Array.isArray(en) && en.length, path).toBe(zh.length);
    zh.forEach((v, i) => sameShape(v, en[i], `${path}[${i}]`));
  } else if (zh && typeof zh === 'object') {
    expect(Object.keys(en).sort(), path).toEqual(Object.keys(zh).sort());
    for (const k of Object.keys(zh)) sameShape(zh[k], en[k], `${path}.${k}`);
  } else {
    expect(typeof en, path).toBe(typeof zh);
  }
}

/** Every string a table gives, functions called with 1 for each argument. */
function strings(value, path, out = []) {
  if (typeof value === 'string') out.push([path, value]);
  else if (typeof value === 'function') strings(value(...Array(value.length).fill(1)), `${path}()`, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  return out;
}

/** Text a person sees in `root`: text nodes and the attributes read out or shown; a part tagged with a Chinese `lang` is named in itself. */
function visible(root) {
  const out = [];
  const walk = (el) => {
    if (/^zh/.test(el.getAttribute?.('lang') ?? '')) return;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) out.push(node.textContent.trim());
      else if (node.nodeType === 1) {
        for (const a of ['placeholder', 'title', 'aria-label', 'label', 'alt']) {
          const v = node.getAttribute(a);
          if (v) out.push(v);
        }
        if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' && node.tagName !== 'svg') walk(node);
      }
    }
  };
  walk(root);
  return out;
}

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** A Core that answers the routes the pages read, and records what they send. */
function fakeCore(language, { decider = { mode: 'classic', enabled: true, keySet: false }, deciderModel } = {}) {
  const sent = [];
  const reply = (path, method, body) => {
    if (method === 'POST') sent.push({ path, body });
    if (path === '/api/config' && method === 'GET') {
      return {
        groups: [
          { group: { id: 'companion' }, values: language ? { language } : {} },
          { group: { id: 'world:desktop-pet' }, values: { 'worlds.desktop-pet.user': 'Sam', 'worlds.desktop-pet.window.hideWhenFullscreen': true, 'worlds.desktop-pet.smallTalk.enabled': true } },
          { group: { id: 'world:cua' }, values: { 'worlds.cua.permission': 'ask-once', 'worlds.cua.grantMinutes': 30 } },
          ...(deciderModel ? [{ group: { id: 'world:desktop-pet:decider' }, values: { 'worlds.desktop-pet.decider.enabled': true, 'worlds.desktop-pet.decider.model': deciderModel } }] : []),
        ],
      };
    }
    if (path.endsWith('/panels/pet/state')) return { connected: false, url: null, dressUrl: null, decider, smallTalk: { enabled: true, presence: false } };
    if (path.endsWith('/panels/pet/deciders')) return { models: [{ id: 'typesafe/jev-1.14', name: 'Decider', promptPerM: 0.042, context: 262144 }], source: 'live' };
    if (path === '/api/status') return { loop: { paused: false }, modelConnection: null };
    if (path === '/api/worlds') return { worlds: [{ id: 'cua', status: 'active' }] };
    if (path === '/api/config' && method === 'POST') return { result: body.group };
    return {};
  };
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    return json(reply(path, init.method ?? 'GET', init.body ? JSON.parse(init.body) : undefined));
  }));
  return sent;
}

/** A socket that never connects; the test plays the server's frames. */
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

async function mount(feature, mods, extra = {}) {
  const [{ createWebUi }, { Lifecycle }] = mods;
  const lifecycle = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const memo = { get: (_k, d) => d, set: () => {} };
  const ui = createWebUi({ memo, overlayHost: document.body, signal: lifecycle.signal, doc: document });
  const router = { route: { segments: [feature.route] }, navigate: () => {}, replace: () => {} };
  await feature.mount({ root, lifecycle, signal: lifecycle.signal, ui, router, route: router.route, capabilities: {}, onError: (err) => { throw err; }, refreshNav: () => {}, ...extra });
  await settle();
  return { root, ui, lifecycle };
}

const BASE_MODS = ['ui/index.ts', 'core/lifecycle.ts'];

describe.skipIf(!STAGED && !process.env.CI)('console text in zh and en', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('every table has the same keys in zh and en, and nothing Chinese in en', async () => {
    const files = Object.keys(TABLES);
    const mods = await load('zh', ...files);
    files.forEach((file, i) => {
      for (const name of TABLES[file]) {
        const table = mods[i][name];
        expect(table, `${file} ${name}`).toBeDefined();
        sameShape(table.zh, table.en, `${file} ${name}`);
        for (const [path, text] of strings(table.en, `${file} ${name}.en`)) expect(text, path).not.toMatch(CJK);
      }
    });
  });

  it('the pet pages mounted in English show no Chinese', async () => {
    fakeCore('en');
    const [ui, life, home, pet, cua, dress, voice] = await load('en', ...BASE_MODS,
      'features/home/index.ts', 'features/pet/index.ts', 'features/cua/index.ts', 'features/dress/index.ts', 'features/voice/index.ts');
    const roots = [];
    for (const feature of [home.homeFeature, pet.petFeature, cua.cuaFeature, dress.dressFeature, voice.voiceFeature]) {
      expect(feature.label).not.toMatch(CJK);
      const { root, lifecycle } = await mount(feature, [ui, life]);
      roots.push(root);
      const shown = visible(root);
      expect(shown.length, feature.route).toBeGreaterThan(0);
      expect(shown.filter((t) => CJK.test(t)), feature.route).toEqual([]);
      lifecycle.dispose();
    }
    // the service row and the key box name the services in English
    expect(roots[0].querySelector('.home-vendors').textContent).toContain('Qwen');
    // the language row offers 中文 and English, named in themselves, on the stored language
    const select = roots[1].querySelector('select');
    expect([...select.options].map((o) => [o.value, o.textContent, o.lang])).toEqual([['zh', '中文', 'zh-CN'], ['en', 'English', 'en']]);
    expect(select.value).toBe('en');
  });

  it('the chat page in English: its own words, the bot\'s words as they came', async () => {
    fakeCore('en');
    window.WebSocket = FakeSocket;
    const [ui, life, chat] = await load('en', ...BASE_MODS, 'features/chat/index.ts');
    const { root, lifecycle } = await mount(chat.chatFeature, [ui, life]);
    const socket = FakeSocket.last;
    socket.open();
    socket.frame({
      t: 'init', bot: 'Coo', paused: false, more: true, before: 1, imagesSeen: true,
      phase: { state: 'tools', running: ['pet_feel'] },
      activity: { steps: ['cua_click', 'pet_feel'], startedAt: Date.now() },
      pending: [5],
      items: [
        { kind: 'user', cursor: 1, ts: '', via: 'voice', text: 'hello' },
        { kind: 'say', cursor: 2, ts: '', beats: [{ text: 'Hi there', mood: { id: 'laughcry', zh: '笑哭' } }, { text: 'and', mood: { id: 'newface', zh: '新脸' } }] },
        { kind: 'activity', cursor: 3, ts: '', steps: ['cua_click', 'cua_type'], ms: 2400 },
        { kind: 'ask', cursor: 4, ts: '', askId: 'a', question: 'Tea?', options: ['Yes', 'No'], own: true },
        { kind: 'user', cursor: 5, ts: '', via: 'chat', text: 'wait', images: [{ ref: 'r', mime: 'image/png' }] },
      ],
    });
    const shown = visible(root);
    expect(shown).toEqual(expect.arrayContaining(['Chat', 'Using the computer · 2 steps', 'Show a feeling', 'laughing to tears', 'newface', 'Send now', 'wait [1 image]']));
    expect(shown.filter((t) => CJK.test(t))).toEqual([]);
    lifecycle.dispose();
  });

  it('every expression of the built-in figures has an English tag on the chat page', async () => {
    const [chat] = await load('en', 'features/chat/index.ts');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'cortico-world-desktop-pet', 'web');
    const ids = new Set();
    for (const id of ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']) {
      for (const v of JSON.parse(readFileSync(join(root, id, 'figure.json'), 'utf8')).vocab) if (v.kind === 'expression') ids.add(v.id);
    }
    expect(ids.size).toBeGreaterThan(50);
    expect([...ids].filter((id) => !chat.MOOD_EN[id])).toEqual([]);
    for (const [id, name] of Object.entries(chat.MOOD_EN)) expect(name, id).not.toMatch(CJK);
  });

  it('the 习惯 card: a chosen model OpenRouter serves nowhere, the default used instead, and the default gone too', async () => {
    const gone = { mode: 'decider', enabled: true, keySet: true, last: { ms: 480, ok: true }, calls: 2, cost: 0.00056, unavailable: 'nobody/no-such-decider', defaultGone: false, defaultModel: 'typesafe/jev-1.14' };
    const texts = { zh: [], en: [] };
    for (const language of ['zh', 'en']) {
      fakeCore(language, { decider: gone, deciderModel: 'nobody/no-such-decider' });
      const [ui, life, pet] = await load(language, ...BASE_MODS, 'features/pet/index.ts');
      const { root, lifecycle } = await mount(pet.petFeature, [ui, life]);
      await settle();
      texts[language] = visible(root).join('\n');
      lifecycle.dispose();
      document.body.replaceChildren();
      fakeCore(language, { decider: { ...gone, unavailable: null, defaultGone: true, last: { ms: 300, ok: false, reason: 'x' } }, deciderModel: 'typesafe/jev-1.14' });
      const again = await mount(pet.petFeature, [ui, life]);
      await settle();
      texts[`${language}2`] = visible(again.root).join('\n');
      again.lifecycle.dispose();
      document.body.replaceChildren();
    }
    expect(texts.zh).toContain('nobody/no-such-decider 在 OpenRouter 上用不了(没有提供它的服务端),这次运行改用默认的 typesafe/jev-1.14。');
    // not in the live list either
    expect(texts.zh).toContain('这个模型不在 OpenRouter 的决策模型列表里');
    expect(texts.zh).toContain('默认 typesafe/jev-1.14');
    expect(texts.en).toContain('nobody/no-such-decider is not available on OpenRouter (no endpoint serves it); using the default typesafe/jev-1.14 this run.');
    expect(texts.en).toContain("This model is not in OpenRouter's list of decision models");
    expect(texts.zh2).toContain('默认的 typesafe/jev-1.14 在 OpenRouter 上也用不了');
    expect(texts.zh2).not.toContain('这次运行改用默认的');
    expect(texts.en2).toContain('The default typesafe/jev-1.14 is not available on OpenRouter either');
    expect(texts.en.split('\n').filter((t) => CJK.test(t))).toEqual([]);
    expect(texts.en2.split('\n').filter((t) => CJK.test(t))).toEqual([]);
  });

  it('an old config without a language shows Chinese on the 习惯 page', async () => {
    fakeCore(undefined);
    const [ui, life, pet] = await load('zh', ...BASE_MODS, 'features/pet/index.ts');
    const { root, lifecycle } = await mount(pet.petFeature, [ui, life]);
    expect(root.querySelector('select').value).toBe('zh');
    expect(visible(root)).toContain('语言');
    lifecycle.dispose();
  });

  it('a language the config holds that is not a choice is shown by its own name', async () => {
    fakeCore('ja');
    const [ui, life, pet] = await load('ja', ...BASE_MODS, 'features/pet/index.ts');
    const { root, lifecycle } = await mount(pet.petFeature, [ui, life]);
    const select = root.querySelector('select');
    expect(select.value).toBe('ja');
    expect(select.selectedOptions[0].textContent).toBe('日本語');
    // Japanese reads the en tables
    expect(visible(root)).toContain('Language');
    lifecycle.dispose();
  });

  it('switching writes the app language, saves the console language and reloads', async () => {
    const sent = fakeCore('zh');
    const [{ setAppLanguage, storedLanguage }] = await load('zh', 'features/language.ts');
    const storage = new Map();
    const reload = vi.fn();
    await setAppLanguage('en', undefined, { storage: { setItem: (k, v) => storage.set(k, v) }, reload });
    expect(sent).toEqual([{ path: '/api/config', body: { group: 'companion', values: { language: 'en' } } }]);
    expect(storage.get('cortico.webui.language')).toBe('en');
    expect(reload).toHaveBeenCalledOnce();
    expect(storedLanguage([{ group: { id: 'companion' }, values: {} }])).toBe('zh');
    expect(storedLanguage([{ group: { id: 'companion' }, values: { language: 'xx' } }])).toBe('zh');
    expect(storedLanguage(undefined)).toBe('zh');
  });

  it('a failed switch does not reload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 400 })));
    const [{ setAppLanguage }] = await load('zh', 'features/language.ts');
    const reload = vi.fn();
    await expect(setAppLanguage('en', undefined, { storage: { setItem: () => {} }, reload })).rejects.toThrow('nope');
    expect(reload).not.toHaveBeenCalled();
  });

  it("Cortico's Settings → Language buttons write the app language", async () => {
    const sent = fakeCore('en');
    const [ui, life, settings, language, main] = await load('en', ...BASE_MODS, 'features/settings/index.ts', 'features/language.ts', 'main.ts');
    // the console's page table carries the wrapped settings page
    expect(main.FEATURES.find((f) => f.route === 'settings').mount).not.toBe(settings.settingsFeature.mount);
    const reload = vi.fn();
    const { root, lifecycle } = await mount(settings.settingsFeature, [ui, life]);
    const ctx = { root, signal: lifecycle.signal, ui: ui.createWebUi({ memo: { get: (_k, d) => d, set: () => {} }, overlayHost: document.body, signal: lifecycle.signal, doc: document }), onError: (err) => { throw err; } };
    language.routeLanguageButtons(ctx, { storage: localStorage, reload });
    root.querySelector('#settings-general button[lang="ja"]').click();
    await settle();
    const cards = document.querySelectorAll('.confirm-card');
    expect(cards.length).toBe(1);
    [...cards[0].querySelectorAll('button')].find((b) => b.textContent === 'Confirm').click();
    await settle();
    expect(sent).toContainEqual({ path: '/api/config', body: { group: 'companion', values: { language: 'ja' } } });
    expect(localStorage.getItem('cortico.webui.language')).toBe('ja');
    expect(reload).toHaveBeenCalledOnce();
    expect(root.querySelector('#settings-general').textContent).toContain('the window reloads after a change');
    lifecycle.dispose();
  });
});
