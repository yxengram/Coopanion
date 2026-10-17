import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LANGUAGES, isLanguage, languageOfLocale as corticoLanguageOfLocale } from 'cortico/core/language.ts';
import { renderWorldEnvPrompt } from 'cortico/core/prefix.ts';
import { appLanguage, modelLanguage, newInstallLanguage, replyLanguage } from '../core/language.ts';
import { noticeDefinition } from '../core/notice.ts';
import { DEPLOYMENT, seed } from '../core/seed.ts';
const require = createRequire(import.meta.url);

type Table = Record<string, string | ((...args: unknown[]) => string)>;
const i18n = require('../app/i18n/index.cjs') as {
  LANGUAGES: string[];
  languageOfLocale(tag: unknown): string | undefined;
  systemLanguage(app: { getPreferredSystemLanguages(): string[]; getLocale(): string }): string;
  systemLanguage(app: { getPreferredSystemLanguages(): string[]; getLocale(): string }, env: Record<string, string | undefined>): string;
  configuredLanguage(home: string): string | null;
  textOf(language: unknown): Table;
};
const zh = require('../app/i18n/zh.cjs') as Table;
const en = require('../app/i18n/en.cjs') as Table;
const { trayTemplate } = require('../app/tray-menu.cjs') as {
  trayTemplate(t: Table, state: { running: boolean; login: boolean; packaged: boolean }, on: Record<string, (...a: unknown[]) => void>): Array<{ label?: string; type?: string; enabled?: boolean; checked?: boolean; click?: (item: { checked: boolean }) => void }>;
};
const { CoreHost } = require('../app/core-host.cjs') as {
  CoreHost: new (opts: Record<string, unknown>) => { text(): { coreRestarting(code: number): string } };
};

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
const configFile = (home: string) => join(home, DEPLOYMENT, 'config.json');

describe('main-process text tables', () => {
  it('zh and en have the same keys, each a string or a function of the same arity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const key of Object.keys(zh)) {
      expect(typeof en[key], key).toBe(typeof zh[key]);
      if (typeof zh[key] === 'function') expect((en[key] as (...a: unknown[]) => string).length, key).toBe((zh[key] as (...a: unknown[]) => string).length);
    }
  });

  it('zh-Hant reads zh, every other language and anything unknown reads en', () => {
    expect(i18n.textOf('zh')).toBe(zh);
    expect(i18n.textOf('zh-Hant')).toBe(zh);
    for (const l of ['en', 'ja', 'ru', 'pt-BR', undefined, 'xx']) expect(i18n.textOf(l)).toBe(en);
  });

  it('lists the languages Cortico has', () => {
    expect(i18n.LANGUAGES).toEqual([...LANGUAGES]);
  });

  it('the tray menu in English', () => {
    const calls: string[] = [];
    const on = { openSettings: () => calls.push('settings'), showPet: () => calls.push('pet'), setLogin: (v: unknown) => calls.push(`login:${v}`), restart: () => calls.push('restart'), quit: () => calls.push('quit') };
    const menu = trayTemplate(i18n.textOf('en'), { running: false, login: true, packaged: true }, on);
    expect(menu.map((i) => i.label ?? i.type)).toEqual(['Open settings', 'Show pet', 'separator', 'Start at login', 'Restart', 'Quit']);
    expect(menu[1]!.enabled).toBe(false);
    expect(menu[3]).toMatchObject({ type: 'checkbox', checked: true, enabled: true });
    menu[3]!.click!({ checked: false });
    menu[5]!.click!({ checked: false });
    expect(calls).toEqual(['login:false', 'quit']);
    expect(trayTemplate(i18n.textOf('zh'), { running: true, login: false, packaged: false }, on).map((i) => i.label ?? i.type))
      .toEqual(['打开设置', '显示桌宠', 'separator', '开机自动启动', '重新启动', '退出']);
  });

  it('the Core host says its states in the language it is given, Chinese by default', () => {
    const base = { appRoot: '/x', env: {}, logDir: '/x/logs', resolveProxy: async () => 'DIRECT' };
    expect(new CoreHost(base).text().coreRestarting(3)).toBe('Core 意外退出(退出码 3),3 秒后重启');
    expect(new CoreHost({ ...base, text: () => i18n.textOf('en') }).text().coreRestarting(3)).toBe('The Core exited unexpectedly (exit code 3); restarting in 3 seconds');
  });
});

describe('the system language', () => {
  const TAGS = ['zh-CN', 'zh_TW.UTF-8', 'zh-Hans-HK', 'zh-Hant', 'zh-HK', 'zh-MO', 'zh', 'ZH-tw', 'en-US', 'en_GB', 'ja-JP', 'ko', 'fr-CA', 'de-AT',
    'es-MX', 'es', 'pt', 'pt-PT', 'it-IT', 'ru', 'nl-NL', 'C', 'en_US@euro', '', '  ', undefined, null];

  it('maps a locale as Cortico does', () => {
    for (const tag of TAGS) expect(i18n.languageOfLocale(tag), String(tag)).toBe(corticoLanguageOfLocale(tag as string | undefined));
  });

  it('takes the first preferred language, then the UI locale, else English', () => {
    const app = (preferred: string[], locale: string) => ({ getPreferredSystemLanguages: () => preferred, getLocale: () => locale });
    expect(i18n.systemLanguage(app(['zh-Hans-CN', 'en-US'], 'en-US'))).toBe('zh');
    expect(i18n.systemLanguage(app(['zh-TW'], 'en'))).toBe('zh-Hant');
    expect(i18n.systemLanguage(app(['en-GB', 'zh-CN'], 'zh-CN'))).toBe('en');
    expect(i18n.systemLanguage(app(['', 'de-DE'], 'en'))).toBe('de');
    expect(i18n.systemLanguage(app([], 'ja'))).toBe('ja');
    expect(i18n.systemLanguage(app([], ''))).toBe('en');
    expect(i18n.systemLanguage({ getPreferredSystemLanguages: () => { throw new Error('not ready'); }, getLocale: () => 'zh' })).toBe('en');
  });

  it('COOPANION_SYSTEM_LANGUAGE at launch stands in for the system when it is a language', () => {
    const app = { getPreferredSystemLanguages: () => ['zh-CN'], getLocale: () => 'zh-CN' };
    expect(i18n.systemLanguage(app, { COOPANION_SYSTEM_LANGUAGE: 'en' })).toBe('en');
    expect(i18n.systemLanguage(app, { COOPANION_SYSTEM_LANGUAGE: 'en-US' })).toBe('zh');
    expect(i18n.systemLanguage(app, {})).toBe('zh');
  });
});

describe('the console language an older version saved', () => {
  /** Runs app/settings-preload.cjs against a fake localStorage and main process; returns what each load sent. */
  function load(storage: Map<string, string>, main: { language: string }) {
    const sent: Array<[string, unknown]> = [];
    const ipcRenderer = {
      sendSync(channel: string, arg?: unknown) {
        sent.push([channel, arg]);
        return main.language;
      },
    };
    const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, String(v)); } };
    const source = readFileSync(join(import.meta.dirname, '../app/settings-preload.cjs'), 'utf8');
    new Function('require', 'localStorage', source)(() => ({ ipcRenderer }), localStorage);
    return sent;
  }

  it('only ever changed the console\'s look: a Chinese app stays Chinese and the console follows it', () => {
    for (const before of ['en', 'ja', 'zh-Hant', undefined]) {
      const storage = new Map<string, string>(before ? [['cortico.console.language', before]] : []);
      const main = { language: 'zh' };
      // the preload only asks for the app language; it hands nothing over
      expect(load(storage, main)).toEqual([['settings:language', undefined]]);
      expect(main.language).toBe('zh');
      expect(storage.get('cortico.console.language')).toBe('zh');
    }
  });

  it('a later change of the app language reaches the console at the next load', () => {
    const storage = new Map([['cortico.console.language', 'zh']]);
    const main = { language: 'en' };
    load(storage, main);
    expect(storage.get('cortico.console.language')).toBe('en');
  });

  it('the main process takes no language from the settings window', () => {
    const main = readFileSync(join(import.meta.dirname, '../app/main.cjs'), 'utf8');
    expect(main).not.toContain('settings:adopt-language');
    expect(main).not.toContain('language-adopted');
    expect(Object.keys(i18n)).not.toContain('adoptedLanguage');
  });
});

describe('the configured language', () => {
  it('reads config.json: none before the first start, Chinese for a config without a language or with a wrong one', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
    expect(i18n.configuredLanguage(home)).toBeNull();
    mkdirSync(join(home, DEPLOYMENT), { recursive: true });
    const write = (v: unknown) => writeFileSync(configFile(home), typeof v === 'string' ? v : JSON.stringify(v));
    write({ displayName: 'Coo' });
    expect(i18n.configuredLanguage(home)).toBe('zh');
    write({ language: 'klingon' });
    expect(i18n.configuredLanguage(home)).toBe('zh');
    write('{ not json');
    expect(i18n.configuredLanguage(home)).toBe('zh');
    for (const l of ['en', 'zh-Hant', 'ja']) {
      write({ language: l });
      expect(i18n.configuredLanguage(home)).toBe(l);
    }
  });

  it('appLanguage: a language as stored, anything else Chinese', () => {
    expect(appLanguage('en')).toBe('en');
    expect(appLanguage('zh-Hant')).toBe('zh-Hant');
    for (const v of [undefined, null, '', 'EN', 'klingon', 3]) expect(appLanguage(v)).toBe('zh');
    for (const l of LANGUAGES) expect(modelLanguage(l)).toBe('zh');
  });
});

describe('the seed takes the system language for a new install only', () => {
  it('a new install starts in the system language the app passed', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
    seed(home, newInstallLanguage({ COOPANION_SYSTEM_LANGUAGE: 'en' }));
    expect(read(configFile(home)).language).toBe('en');
  });

  it('a new install outside zh hears its own language without the Simplified conversion, and outside Chinese calls the person 「Pal」; zh writes nothing more', () => {
    const worlds = (language: string) => {
      const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
      seed(home, language);
      return read(configFile(home)).worlds;
    };
    expect(worlds('zh')).toBeUndefined();
    expect(worlds('en')).toEqual({ 'desktop-pet': { user: 'Pal', asr: { language: 'en', simplified: false } } });
    expect(worlds('ja')).toEqual({ 'desktop-pet': { user: 'Pal', asr: { language: 'ja', simplified: false } } });
    expect(worlds('fr')).toEqual({ 'desktop-pet': { user: 'Pal', asr: { language: 'auto', simplified: false } } });
    expect(worlds('zh-Hant')).toEqual({ 'desktop-pet': { asr: { language: 'zh', simplified: false } } });
  });

  it('without the variable (a Core run outside the app), or with one that is not a language, Chinese', () => {
    for (const env of [{}, { COOPANION_SYSTEM_LANGUAGE: '' }, { COOPANION_SYSTEM_LANGUAGE: 'en-US' }]) {
      const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
      seed(home, newInstallLanguage(env));
      expect(read(configFile(home)).language).toBe('zh');
    }
    const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
    seed(home);
    expect(read(configFile(home)).language).toBe('zh');
  });

  it('an existing config is left as it is: its language, or none', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
    seed(home, 'zh');
    seed(home, 'en');
    expect(read(configFile(home)).language).toBe('zh');
    const old = { displayName: 'Coo', activeProvider: 'deepseek', web: { port: 17788 } };
    writeFileSync(configFile(home), JSON.stringify(old));
    seed(home, 'ja');
    expect(read(configFile(home))).toEqual(old);
    expect(i18n.configuredLanguage(home)).toBe('zh');
  });
});

describe('the reply-language line', () => {
  it('none in Chinese (Simplified or Traditional) or for a value that is not a language', () => {
    for (const v of ['zh', 'zh-Hant', undefined, null, 'klingon']) expect(replyLanguage(v)).toBeNull();
  });

  it('one Chinese line naming the language for every other language', () => {
    expect(replyLanguage('en')).toBe('对方用的是英语:用英语和对方说话,气泡里的话、提问和选项都用英语写。');
    for (const l of LANGUAGES.filter((x) => x !== 'zh' && x !== 'zh-Hant')) {
      const line = replyLanguage(l)!;
      expect(line, l).toMatch(/^对方用的是.+和对方说话/);
      expect(line.includes('\n'), l).toBe(false);
    }
    expect(LANGUAGES.every(isLanguage)).toBe(true);
  });

  it('is the coopanion World\'s whole prompt, and in Chinese it has none', async () => {
    const world = (language: unknown) => noticeDefinition({
      version: 'dev', notesDir: '/nowhere', stateFile: '/nowhere/notice.json', alarmsFile: join(mkdtempSync(join(tmpdir(), 'cc-lang-')), 'alarms.json'),
      newInstall: () => true, read: () => undefined, petConnected: () => false, guiding: () => false,
      replyLanguage: () => replyLanguage(language),
    }).create({ cfg: { enabled: true }, timezone: 'UTC' } as never);
    for (const l of ['zh', 'zh-Hant', undefined]) {
      const w = world(l);
      expect(w.envPromptVars()).toBeNull();
      expect(w.console!().promptDocs).toBeUndefined();
      expect((await renderWorldEnvPrompt(w)).text).toBe('');
    }
    const w = world('en');
    expect((await renderWorldEnvPrompt(w)).text).toBe(replyLanguage('en'));
    expect(w.console!('en').promptDocs?.[0]).toMatchObject({ key: 'worlds.coopanion.envPrompt', title: 'Reply language', role: 'envPrompt' });
  });
});
