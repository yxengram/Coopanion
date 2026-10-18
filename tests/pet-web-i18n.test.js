// The pet's pages and window process in the app language (packages/cortico-world-desktop-pet/web/i18n.js,
// web/i18n/{zh,en}.js, host/text.cjs): both tables carry the same keys and placeholders, the English one has no
// Chinese in it, the Chinese one is the text the pages showed before, and no text a person reads is left written
// into the pages outside the tables. What the page reports to the World for the bot (why a figure did not load) and
// log lines stay Chinese. The window process's tray menu follows the language the page tells it.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zh from '../packages/cortico-world-desktop-pet/web/i18n/zh.js';
import en from '../packages/cortico-world-desktop-pet/web/i18n/en.js';
import { cooLabel, language, nameIn, setLanguage, t, tableOf } from '../packages/cortico-world-desktop-pet/web/i18n.js';
import { ACC_COLORS, LINKED, PALETTES, SLOT_LISTS } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const source = (path) => readFileSync(new URL(path, PKG), 'utf8');
const CJK = /[　-〿㐀-鿿＀-￯]/;
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => { setLanguage('zh'); });

describe('the pages\' text tables', () => {
  it('have the same keys, each with the same placeholders', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const key of Object.keys(zh)) expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]));
  });

  it('have no Chinese in English, and every value filled', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, key).toMatch(/\S/);
      expect(value, key).not.toMatch(CJK);
    }
    for (const [key, value] of Object.entries(zh)) expect(value, key).toMatch(/\S/);
  });

  it('keep the Chinese the pages showed before', () => {
    expect(zh['action.chat']).toBe('打字和我说话');
    expect(zh['action.roam']).toBe('行为模式:{level} · {name} · 点一下换成「{next}」');
    expect(zh['action.themeDark']).toBe('夜间模式:开(浅色身体)· 点一下换白天');
    expect(zh['bubble.typePlaceholder']).toBe('想说什么…');
    // 'heard.done' (听到了) went with #241: what was heard stays beside the pet as a settled line, with no hint under it
    expect(zh['heard.listening']).toBe('正在听…');
    expect(zh['heard.more']).toBe('还在听…');
    expect(zh['dress.offline']).toBe('没保存上:连不上桌宠服务');
    expect(zh['import.done']).toBe('导入好了:{names}。在上面的形象里点它就能换上。');
    expect(zh['theme.toLight']).toBe('切到白天模式');
  });

  it('name every one of Coo\'s options, and Chinese is coo.js\'s own label (the bot is told those)', () => {
    const all = [
      ...PALETTES.map((p) => ['palette', p.id, p.label]),
      ...Object.entries(SLOT_LISTS).flatMap(([slot, list]) => list.map(([id, label]) => [slot, id, label])),
      ...[...LINKED, ...ACC_COLORS].map((c) => ['color', c.id, c.label]),
    ];
    for (const [kind, id, label] of all) {
      expect(zh[`${kind}.${id}`], `${kind}.${id}`).toBe(label);
      expect(en[`${kind}.${id}`], `${kind}.${id}`).toBeTruthy();
      expect(cooLabel(kind, id, label)).toBe(label);
    }
    setLanguage('en');
    for (const [kind, id, label] of all) expect(cooLabel(kind, id, label)).not.toMatch(CJK);
  });
});

describe('the pages\' language', () => {
  it('reads Chinese for zh and zh-Hant and English for every other language, as Cortico\'s pick', () => {
    expect(['zh', 'zh-Hant', 'en', 'ja', 'fr', 'pt-BR'].map(tableOf)).toEqual(['zh', 'zh', 'en', 'en', 'en', 'en']);
    expect(t('menu.settings')).toBe('打开设置');
    expect(setLanguage('ja')).toBe(true);
    expect(language()).toBe('ja');
    expect(t('menu.settings')).toBe('Open settings');
    expect(t('action.voiceNotReady', { detail: t('action.voiceNoService') })).toBe('Voice input: on · Speech recognition is not ready · click to turn off');
    // another language reading the same table changes nothing drawn; back to Chinese does
    expect(setLanguage('en')).toBe(false);
    expect(setLanguage('zh-Hant')).toBe(true);
    expect(t('menu.settings')).toBe('打开设置');
  });

  it('ignores what is not a language code, and marks the page', () => {
    const doc = { documentElement: { lang: 'zh-CN' } };
    expect(setLanguage(undefined, doc)).toBe(false);
    expect(setLanguage('<b>', doc)).toBe(false);
    expect(doc.documentElement.lang).toBe('zh-CN');
    expect(setLanguage('en', doc)).toBe(true);
    expect(doc.documentElement.lang).toBe('en');
    setLanguage('zh', doc);
    expect(doc.documentElement.lang).toBe('zh-CN');
  });

  it('shows a figure pack\'s names in the page\'s language', () => {
    expect(nameIn({ zh: '千问', en: 'Qwen' })).toBe('千问');
    setLanguage('en');
    expect(nameIn({ zh: '千问', en: 'Qwen' })).toBe('Qwen');
    expect(nameIn({ zh: '只有中文' })).toBe('只有中文');
    setLanguage('ja');
    expect(nameIn({ zh: '冬装', en: 'Winter outfit', ja: '冬服' })).toBe('冬服');
    expect(nameIn({ zh: '冬装', en: 'Winter outfit' })).toBe('Winter outfit');
    expect(nameIn({ fr: 'X', zh: '冬装' })).toBe('冬装');
  });

  it('in Chinese, a name without zh is the first one, as before the page had languages and as the World names it', () => {
    setLanguage('zh');
    expect(nameIn({ ja: 'X', en: 'Y' })).toBe('X');
    expect(nameIn({ fr: 'X', en: 'Y', zh: '中' })).toBe('中');
    setLanguage('zh-Hant');
    expect(nameIn({ ja: 'X', en: 'Y' })).toBe('X');
    expect(nameIn({ 'zh-Hant': '冬裝', zh: '冬装' })).toBe('冬裝');
    setLanguage('zh');
  });

  it('has English for every option name the built-in figures show on the dressing page', () => {
    for (const id of ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']) {
      const m = JSON.parse(source(`web/${id}/figure.json`));
      const names = [m.name, ...m.axes.flatMap((a) => [a.name, ...a.options.map((o) => o.name)]), ...(m.presets ?? []).map((p) => p.name)];
      // a name with no Chinese in it (DeepSeek, Kimi) reads the same in English
      for (const n of names) expect(n.en ?? (CJK.test(n.zh) ? undefined : n.zh), `${id}: ${JSON.stringify(n)}`).toBeTruthy();
    }
  });
});

/** Every line of `text` with Chinese in it outside comments (`//`, `/* … *\/`, `<!-- -->`). */
function chineseLines(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  return bare.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).filter((l) => CJK.test(l)).map((l) => l.trim());
}

describe('no text a person reads is written into the pages', () => {
  // the bot's (reported to the World as why a figure did not load), log lines, a value the page never shows, and the
  // punctuation a bubble's typing pauses on
  const allowed = [/new Error\('没有装这个形象'\)/, /console\.(warn|error|log)\(/, /user: '伙伴'/, /^const PAUSE = /];
  it.each(['web/pet-app.js', 'web/dress.js', 'web/ui.js', 'web/i18n.js'])('%s', (file) => {
    const left = chineseLines(source(file)).filter((l) => !allowed.some((re) => re.test(l)));
    expect(left).toEqual([]);
  });

  it('web/dress.html: its Chinese is only the default of text the table replaces', () => {
    const left = chineseLines(source('web/dress.html')).filter((l) => !/data-i18n(-label)?="/.test(l));
    expect(left).toEqual([]);
    for (const key of [...source('web/dress.html').matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((m) => m[1])) expect(zh[key], key).toBeTruthy();
  });

  it('host/electron-main.cjs: only its log lines', () => {
    expect(chineseLines(source('host/electron-main.cjs')).filter((l) => !/console\.log\(/.test(l))).toEqual([]);
  });
});

/* ---------- the window process ---------- */

const HOST = fileURLToPath(new URL('host/', PKG));
const realRequire = createRequire(import.meta.url);

/** `file` and what it requires from host/, run as CommonJS with `electron` stood in. */
function loadModule(file, electron) {
  const proc = { platform: 'linux', argv: [], env: {}, pid: 4242, kill() {} };
  const cache = new Map();
  const requireFrom = (from) => (spec) => {
    if (spec === 'electron') return electron;
    if (spec === 'koffi') throw new Error('koffi not here');
    if (spec.startsWith('node:')) return realRequire(spec);
    const path = join(from, spec);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const fn = runInThisContext(`(function (exports, require, module, __filename, __dirname, process) {${readFileSync(path, 'utf8')}\n})`, { filename: path });
    fn(module.exports, requireFrom(dirname(path)), module, path, dirname(path), proc);
    return module.exports;
  };
  return requireFrom(HOST)(file);
}

/** Electron as far as the host's start, its tray and its windows' titles go. */
function fakeElectron() {
  const ipc = new Map(), wins = [], trays = [];
  const display = { id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  class BrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.webContents = { on() {}, send() {}, setWindowOpenHandler() {}, setZoomLevel() {}, getURL: () => '' };
      wins.push(this);
    }
    on() {} once() {} setBounds() {} getBounds() { return { x: 0, y: 0, width: 1, height: 1 }; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {} showInactive() {} hide() {}
    isVisible() { return false; } loadURL() {} show() {} focus() {}
  }
  class Tray {
    constructor() { trays.push(this); }
    setToolTip(tip) { this.tip = tip; }
    setContextMenu(menu) { this.menu = menu; }
    on() {}
  }
  const state = {};
  const electron = {
    app: { whenReady: () => Promise.resolve(), once() {}, on() {}, quit() {}, dock: { hide() {} } },
    BrowserWindow, Tray,
    Menu: { buildFromTemplate: (template) => template },
    nativeImage: { createFromBitmap: () => ({ setTemplateImage() {} }) },
    ipcMain: { on: (ch, f) => ipc.set(ch, f), handle() {} },
    screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display, getDisplayNearestPoint: () => display, getCursorScreenPoint: () => ({ x: 0, y: 0 }), on() {} },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    shell: { openExternal() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted' },
    contextBridge: { exposeInMainWorld: (_name, api) => { state.petHost = api; } },
    ipcRenderer: { send: (ch, v) => ipc.get(ch)?.({}, v), on() {}, invoke: async () => null },
  };
  return { electron, ipc, wins, trays, state };
}

describe('the pet window process in the app language', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('draws its tray menu in Chinese until the page says the language, then in it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const fake = fakeElectron();
    const { runPetHost } = loadModule('./electron-main.cjs', fake.electron);
    runPetHost({ url: 'http://127.0.0.1:9/pet' });
    for (let i = 0; i < 10 && !fake.trays.length; i++) await Promise.resolve();
    const tray = fake.trays[0];
    const labels = () => tray.menu.filter((m) => m.label).map((m) => m.label);
    expect(fake.wins[0].opts.title).toBe('Cortico 桌宠');
    expect(tray.tip).toBe('Cortico 桌宠');
    expect(labels()).toEqual(['显示桌宠', '隐藏桌宠', '装扮…', '关闭桌宠窗口']);

    // the page's side: the preload passes on what the World said
    loadModule('./preload.cjs', fake.electron);
    fake.state.petHost.setLanguage('en');
    expect(tray.tip).toBe('Cortico desktop pet');
    expect(labels()).toEqual(['Show pet', 'Hide pet', 'Dress up…', 'Close the pet window']);
    for (const l of labels()) expect(l).not.toMatch(CJK);
    fake.ipc.get('pet:openDress')({});
    expect(fake.wins[1].opts.title).toBe('Dress up');

    // not a language: kept as it was; back to Chinese
    fake.state.petHost.setLanguage('<x>');
    expect(tray.tip).toBe('Cortico desktop pet');
    fake.state.petHost.setLanguage('zh-Hant');
    expect(labels()).toEqual(['显示桌宠', '隐藏桌宠', '装扮…', '关闭桌宠窗口']);
  });

  it('has the same keys in both of its tables, English without Chinese', () => {
    const { TEXT } = realRequire('../packages/cortico-world-desktop-pet/host/text.cjs');
    expect(Object.keys(TEXT.en).sort()).toEqual(Object.keys(TEXT.zh).sort());
    for (const v of Object.values(TEXT.en)) expect(v).not.toMatch(CJK);
  });
});
