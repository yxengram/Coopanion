/**
 * The text people read, in Chinese and English (src/i18n): both tables have the same keys and arities, Chinese
 * renders as it did before there was a choice (the console's settings, panels, lamps and prompt notes are pinned in
 * fixtures/i18n-zh-console.json), English renders without Chinese where the World writes the words itself, and the
 * text the bot reads stays Chinese whatever the app language.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8 } from 'fflate';
import type { Language } from 'cortico/core/language.ts';
import { DESKTOP_PET_DEFAULTS, DESKTOP_PET_CONFIG_GROUP, DESKTOP_PET_SOUND_CONFIG_GROUP, DESKTOP_PET_ASR_CONFIG_GROUP, DESKTOP_PET_DECIDER_CONFIG_GROUP, desktopPetConfigGroups, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld, DESKTOP_PET_PANEL_DECLS, desktopPetPanelDecls, type DesktopPetWorldOptions } from '../src/world.ts';
import { comboLabel, hotkeyLabel } from '../src/asr/hotkey.ts';
import { filesFromZip } from '../src/pack-import.ts';
import { figurePacks, readManifest } from '../src/packs.ts';
import { planSettings } from '../src/self.ts';
import { resolveHostCommand } from '../src/window-host.ts';
import zh from '../src/i18n/zh.ts';
import en from '../src/i18n/en.ts';
import { petText } from '../src/i18n/index.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

const CJK = /[　-〿㐀-鿿＀-￯]/;
const ctx = { role: 'main', log: new FakeHost().log };

/** Every leaf of a table: its path, and a function's arity or a value's type. */
function shape(v: unknown, path = ''): string[] {
  if (typeof v === 'function') return [`${path} fn/${v.length}`];
  if (Array.isArray(v)) return [`${path} array/${v.length}`];
  if (v && typeof v === 'object') return Object.keys(v).sort().flatMap((k) => shape((v as Record<string, unknown>)[k], `${path}.${k}`));
  return [`${path} ${typeof v}`];
}

/** Every string in `v`, functions called with sample arguments. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (typeof v === 'function') {
    // sample arguments of each kind a table's functions take (strings, counts, lists); the ones that run are read
    const samples: unknown[][] = [['x', 2, 'y'], ['x', 2, false], [2, 3, 'x'], ['x', 'y', 2], ['x', 'y', ['z']], [['x'], 'y', 'z'], [[['a', 'b']]], ['x', null, 'y'], [true], [0]];
    return samples.flatMap((args) => {
      try { return strings((v as (...a: unknown[]) => unknown)(...args.slice(0, v.length))); } catch { return []; }
    });
  }
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

/** The console fixture's form of a declaration: what does not depend on the machine. */
function consoleShape(world: DesktopPetWorld, language: Language) {
  const d = world.console(language);
  const config = structuredClone(d.config!);
  for (const g of config) delete g.schema.properties['worlds.desktop-pet.window.hideWhenFullscreen'];
  return {
    label: d.label, lamps: d.lamps, panels: d.panels, config,
    promptDocs: d.promptDocs!.map(({ path: _path, ...rest }) => rest),
  };
}

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

function makeWorld(language: () => Language, extra: Partial<DesktopPetWorldOptions> = {}, patch: (c: DesktopPetConfigSection) => void = () => {}) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  patch(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-i18n-'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai', language,
    persist: (p) => { Object.assign(cfg, p); },
    runtimesRoot: () => join(dir, 'runtimes'), modelsDir: () => join(dir, 'models'),
    ...extra,
  });
  return { world, cfg };
}

describe('the tables', () => {
  it('zh and en have the same keys, the same functions and arities', () => {
    expect(shape(en)).toEqual(shape(zh));
  });

  it('en has no Chinese in it', () => {
    expect(strings(en).filter((s) => CJK.test(s))).toEqual([]);
  });

  it('zh-Hant reads Chinese, every other language English', () => {
    expect(petText('zh')).toBe(zh);
    expect(petText('zh-Hant')).toBe(zh);
    expect(petText(undefined)).toBe(zh);
    for (const l of ['en', 'ja', 'fr', 'ru'] as const) expect(petText(l)).toBe(en);
  });
});

describe('Chinese, as before', () => {
  it('the console declares what it did, the exported groups and panels with it', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/i18n-zh-console.json', import.meta.url), 'utf8'));
    const { world } = makeWorld(() => 'zh');
    expect(consoleShape(world, 'zh')).toEqual(fixture);
    expect(consoleShape(makeWorld(() => 'en').world, 'zh-Hant')).toEqual(fixture);
    expect(desktopPetConfigGroups('zh')).toEqual([DESKTOP_PET_CONFIG_GROUP, DESKTOP_PET_SOUND_CONFIG_GROUP, DESKTOP_PET_ASR_CONFIG_GROUP, DESKTOP_PET_DECIDER_CONFIG_GROUP]);
    expect(desktopPetPanelDecls('zh')).toEqual(DESKTOP_PET_PANEL_DECLS);
  });

  it('the consent bubble says each change as the receipt does', () => {
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    const packs = figurePacks([]).packs;
    const { changes } = planSettings({ figure: 'whale', roam: 'off', snoreSeconds: 30, sound: false, scale: 1.5, theme: 'light', user: '小明', hoverButtons: ['chat'] }, cfg, packs);
    expect(changes.length).toBe(8);
    for (const c of changes) expect(c.shown).toBe(c.say);
    const { changes: scheme } = planSettings({ figure: 'whale', scheme: 'claude' }, cfg, packs);
    for (const c of scheme) expect(c.shown).toBe(c.say);
  });
});

describe('English', () => {
  it('the console: label, lamps, panels, links, settings and prompt notes', async () => {
    const { world } = makeWorld(() => 'en');
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    for (const language of ['en', 'ja'] as const) {
      const d = world.console(language);
      const text = JSON.stringify({ label: d.label, lamps: d.lamps, panels: d.panels, links: d.links!.map((l) => l.label), config: d.config, docs: d.promptDocs!.map(({ path: _p, ...rest }) => rest) });
      expect(text).not.toMatch(CJK);
      expect(d.label).toBe('Desktop pet');
      // the same keys and limits as in Chinese
      expect(d.config!.map((g) => Object.keys(g.schema.properties))).toEqual(world.console('zh').config!.map((g) => Object.keys(g.schema.properties)));
    }
    await expect(world.console('en').invoke!('pet', 'nope', [])).rejects.toThrow('Unknown method pet.nope');
    await expect(world.console('zh').invoke!('pet', 'nope', [])).rejects.toThrow('未知方法 pet.nope');
  });

  it('the panels\' states follow the console request; the pet page\'s the app language', async () => {
    const { world } = makeWorld(() => 'en', {}, (c) => { c.asr.mic.hotkey = 'LeftAlt*2'; c.asr.mic.mode = 'toggle'; });
    const voice = world.voiceState('en') as { input: { hint: string; keyLabel: string; hotkeyLabel: string } };
    expect(voice.input.hotkeyLabel).toMatch(/^Double-press Left (Alt|Option)$/);
    expect(JSON.stringify(voice.input)).not.toMatch(CJK);
    expect((world.voiceState('zh') as typeof voice).input.hotkeyLabel).toMatch(/^双击 左 (Alt|Option)$/);
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page.close());
    expect(page.init.language).toBe('en');
    expect(JSON.stringify({ voice: page.init.voice, bot: page.init.bot })).not.toMatch(CJK);
  });

  it('a talk key that cannot be read says why in the language switched to', async () => {
    let language: Language = 'zh';
    const { world } = makeWorld(() => language, {
      watchHotkey: async (_k, _c, _p, _t, l) => (l === 'en' ? 'no keyboard here' : '这里没有键盘'),
    });
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    const hint = () => (world.voiceState(language) as { input: { hint: string } }).input.hint;
    expect(hint()).toBe('说话键不可用，暂不识别说话：这里没有键盘');
    language = 'en';
    await expect.poll(hint).toBe('The talk key is unavailable, so speech is not recognized for now: no keyboard here');
  });

  it('why voice input is not ready follows a switch of the app language', async () => {
    let language: Language = 'zh';
    const { world } = makeWorld(() => language, { watchHotkey: async () => ({ stop: () => {} }) }, (c) => { c.asr.enabled = true; });
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page.close());
    const detail = (m: Record<string, unknown>) => (m.voice as { detail?: string | null } | undefined)?.detail ?? '';
    expect(detail(page.init)).toMatch(/^识别模型还没下载/);
    language = 'en';
    const prefs = await page.next((m) => m.t === 'prefs' && (m as { language?: string }).language === 'en' && !CJK.test(detail(m)), 8000);
    expect(detail(prefs)).toMatch(/^The speech model is not downloaded yet/);
  });

  it('talk key names and the reasons a key or the window cannot be had', () => {
    expect(comboLabel('LeftCtrl+Mouse4', 'win32', 'en')).toBe('Left Ctrl + Mouse button 4');
    expect(comboLabel('LeftCtrl+Mouse4', 'win32')).toBe('左 Ctrl + 鼠标侧键 4');
    expect(hotkeyLabel('RightAlt*3', 'darwin', 'en')).toBe('Triple-press Right Option');
    const missing = resolveHostCommand('http://x/pet', join(tmpdir(), 'no-such-electron'), null, en.window);
    expect('missing' in missing && missing.missing).toMatch(/^The Electron executable does not exist/);
  });

  it('the consent bubble asks in English; the receipt stays Chinese', async () => {
    const { world } = makeWorld(() => 'en');
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    const page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page.close());
    const set = world.tools().find((t) => t.name === 'pet_set')!;
    const out = set.handler({ roam: 'off', sound: false, scale: 1.5 }, ctx) as Promise<{ text: string }>;
    const confirm = await page.next((m) => m.t === 'confirm');
    expect(confirm.question).toBe('Can I turn sounds off, change my size from 1× to 1.5×?');
    expect(confirm.options).toEqual(['OK', 'No thanks']);
    page.send({ t: 'confirmed', id: confirm.id, index: 0 });
    expect((await out).text).toBe('已改:走动 多待着 → 不乱动。\n伙伴同意了,已改:音效 关掉;在屏幕上的大小 1 倍 → 1.5 倍。');
  });

  it('names figures and their picks in English in the bubble', () => {
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    cfg.user = 'Pal';
    const packs = figurePacks([]).packs;
    const { changes } = planSettings({ figure: 'claude-chan', roam: 'off', snoreSeconds: 30, theme: 'light', user: 'Sam', hoverButtons: ['chat'] }, cfg, packs, 'en');
    expect(changes.map((c) => c.shown).filter((s) => CJK.test(s))).toEqual([]);
    expect(changes.find((c) => c.key === 'figure')!.shown).toBe('switch from Coo to Claude-chan');
    // the receipt's words stay the bot's
    expect(changes.find((c) => c.key === 'roam')!.say).toBe('走动 多待着 → 不乱动');
  });

  it('a pack import says what is wrong in English', () => {
    expect(filesFromZip(strToU8('not a zip'), en.importing)).toBe('This is not a zip file');
    const dir = mkdtempSync(join(tmpdir(), 'pet-i18n-pack-'));
    mkdirSync(join(dir, 'robot'));
    writeFileSync(join(dir, 'robot', 'figure.json'), JSON.stringify({ manifest: 2, api: 2, id: 'robot', name: { en: 'Robot' } }));
    const why = readManifest(join(dir, 'robot'), false, [], 'en');
    expect(why).toBe('about is missing');
    expect(readManifest(join(dir, 'robot'))).toBe('about 缺失');
  });
});

describe('the definition\'s name', () => {
  it('is Chinese by default and follows labelLanguage when an app gives one', async () => {
    const { desktopPetDefinition } = await import('../src/definition.ts');
    expect(desktopPetDefinition().label).toBe('桌宠');
    let language: Language = 'zh';
    const def = desktopPetDefinition({ language: () => 'en', labelLanguage: () => language });
    // the app language alone does not rename it: Cortico keeps the name read at assembly for its notices to the bot
    expect(def.label).toBe('桌宠');
    language = 'en';
    expect(def.label).toBe('Desktop pet');
  });
});

describe('the pages\' first paint', () => {
  it('a page in English comes with its text stamped in; in Chinese it goes out as the file is', async () => {
    const { PetServer } = await import('../src/server.ts');
    const webDir = join(import.meta.dirname, '..', 'web');
    let language: Language = 'en';
    const server = new PetServer({
      port: () => 0, webDir, snapshot: () => ({}), onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {},
      language: () => language,
    });
    const port = await server.start();
    cleanup.push(() => server.stop());
    const get = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`)).text();
    const dress = await get('/dress');
    expect(dress).toContain('<html lang="en"');
    expect(dress).toContain('<title data-i18n="dress.title">Dress up</title>');
    expect(dress).toContain('aria-label="Preview" data-i18n-label="dress.preview"');
    for (const label of ['Figure', 'Colors', 'Head', 'Accessory', 'Glasses', 'Neck']) expect(dress).toContain(`>${label}</div>`);
    expect(dress.replace(/<script[\s\S]*?<\/script>/g, '')).not.toMatch(CJK);
    expect(await get('/pet')).toContain('<title>Cortico desktop pet</title>');
    language = 'ja';
    expect(await get('/dress')).toContain('<html lang="ja"');
    for (const zh of ['zh', 'zh-Hant'] as const) {
      language = zh;
      expect(await get('/dress')).toBe(readFileSync(join(webDir, 'dress.html'), 'utf8'));
      expect(await get('/pet')).toBe(readFileSync(join(webDir, 'pet.html'), 'utf8'));
    }
  });
});
