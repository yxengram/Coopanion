import { describe, expect, it } from 'vitest';
import type { Language } from 'cortico/core/language.ts';
import { CUA_CONFIG_GROUP, CUA_DEFAULTS, cuaConfigGroup } from '../src/config.ts';
import { cuaDefinition } from '../src/definition.ts';
import { CUA_TEXT, cuaText } from '../src/strings.ts';
import { CuaWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';

/** Chinese and Japanese characters, CJK punctuation and full-width forms. */
const CJK = /[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/;

/** Every key path of `v`, functions with their arity, so two tables can be compared. */
function shape(v: unknown, at = ''): string[] {
  if (typeof v === 'function') return [`${at}/${v.length}`];
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => shape(x, `${at}.${k}`));
  return [at];
}

/** Every string in `v`, functions called with sample arguments. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (typeof v === 'function') return strings((v as (...a: unknown[]) => unknown)('Bot', 30));
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

/** A world over `language` whose engine answers every request at once; `sent` collects the requests. */
function stubWorld(language: Language | undefined, permission: typeof CUA_DEFAULTS.permission = 'ask-each-turn') {
  const cfg = { ...structuredClone(CUA_DEFAULTS), permission };
  cfg.screenshot.afterAction = false;
  const asked: string[] = [];
  const sent: Array<Record<string, unknown>> = [];
  const w = new CuaWorld({
    cfg, timezone: 'Asia/Shanghai', botName: 'Bot',
    ...(language ? { language: () => language } : {}),
    // no pet page: the system dialog asks
    askPermission: async (q) => { asked.push(q); return null; },
  });
  const inner = w as unknown as { spawn: () => unknown; pending: Map<number, { done: (v: unknown) => void; timer: NodeJS.Timeout }> };
  inner.spawn = () => ({
    exitCode: null,
    send({ id, req }: { id: number; req: Record<string, unknown> }) {
      sent.push(req);
      const value = req.op === 'confirm' ? 'no' : req.op === 'windows' ? [] : { yielded: false, waitedMs: 0, cursor: { x: 0, y: 0 }, foreground: null };
      const p = inner.pending.get(id)!;
      inner.pending.delete(id);
      clearTimeout(p.timer);
      p.done(value);
    },
  });
  const call = (name: string, args: Record<string, unknown>) =>
    w.tools().find((t) => t.name === name)!.handler(args, { role: 'main', log: new FakeHost().log }) as Promise<{ text: string; failed?: true }>;
  return { w, cfg, asked, sent, call };
}

describe('the text people see', () => {
  it('has the same keys and arities in zh and en', () => {
    expect(shape(CUA_TEXT.en)).toEqual(shape(CUA_TEXT.zh));
  });

  it('has no Chinese in en', () => {
    for (const s of strings(CUA_TEXT.en)) expect(s, s).not.toMatch(CJK);
  });

  it('reads zh for zh-Hant and en for every other language', () => {
    expect(cuaText('zh-Hant')).toBe(CUA_TEXT.zh);
    expect(cuaText('ja')).toBe(CUA_TEXT.en);
    expect(cuaText('fr')).toBe(CUA_TEXT.en);
  });

  it('keeps the Chinese config group as it was, and only words change in en', () => {
    expect(cuaConfigGroup('zh')).toEqual(CUA_CONFIG_GROUP);
    expect(CUA_CONFIG_GROUP.schema.title).toBe('电脑操作');
    expect(CUA_CONFIG_GROUP.schema.properties['worlds.cua.grantMinutes']!['x-suffix']).toBe('分钟');
    const en = cuaConfigGroup('en');
    expect(JSON.stringify(en)).not.toMatch(CJK);
    expect([en.id, en.owner, Object.keys(en.schema.properties)]).toEqual([CUA_CONFIG_GROUP.id, CUA_CONFIG_GROUP.owner, Object.keys(CUA_CONFIG_GROUP.schema.properties)]);
    expect(en.schema.properties['worlds.cua.permission']!.enum).toEqual(CUA_CONFIG_GROUP.schema.properties['worlds.cua.permission']!.enum);
  });

  it('renders the console page in the request language', () => {
    const { w, cfg } = stubWorld(undefined);
    for (const permission of ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const) {
      cfg.permission = permission;
      for (const control of [true, false]) {
        cfg.control = control;
        const en = w.console('en');
        // the template's file path is left out: a checkout may sit under any folder
        expect(JSON.stringify({ ...en, promptDocs: en.promptDocs?.map((d) => ({ ...d, path: '' })) }), `${permission} ${control}`).not.toMatch(CJK);
        expect(JSON.stringify(w.console('ja').badges)).toBe(JSON.stringify(en.badges));
      }
    }
    const zh = w.console('zh');
    expect([zh.label, zh.lamps?.[0]?.label, zh.lamps?.[0]?.hint, zh.badges?.map((b) => b.label)]).toEqual(['电脑操作', '操作引擎', '按需启动', ['操作', '询问']]);
    cfg.permission = 'ask-once';
    expect(w.console('zh').badges?.[1]?.value).toBe('30 分钟一次');
    expect(w.console('en').badges?.[1]?.value).toBe('Once per 30 min');
    expect(w.console('en').promptDocs?.[0]?.vars?.map((v) => v.name)).toEqual(zh.promptDocs?.[0]?.vars?.map((v) => v.name));
  });

  it('shows an engine exit in the console language and tells the bot in Chinese', async () => {
    const { w } = stubWorld('en', 'never-ask');
    const inner = w as unknown as { engineError: string | null; engineExit: number | null };
    inner.engineError = '引擎进程退出(退出码 3)';
    inner.engineExit = 3;
    expect(w.console('en').lamps?.[0]).toEqual({ label: 'Input engine', state: 'error', hint: 'The engine process exited (exit code 3)' });
    expect(w.console('zh').lamps?.[0]?.hint).toBe('引擎进程退出(退出码 3)');
  });

  it('asks the permission question in the app language, live, with the system dialog labelled to match', async () => {
    let language: Language = 'en';
    const { w, asked, sent, call } = stubWorld(undefined);
    (w as unknown as { opts: { language: () => Language } }).opts.language = () => language;
    const shot = await call('cua_screenshot', {});
    expect(asked[0]).toBe('Bot wants to use your computer: look at the screen and use the mouse and keyboard. OK this time?');
    expect(sent.find((r) => r.op === 'confirm')).toMatchObject({ op: 'confirm', text: asked[0], caption: 'Computer use', yes: 'Allow', no: 'Not now' });
    // the receipt the bot reads stays Chinese
    expect(shot.text).toContain('没有允许');
    w.onTurnEnded();
    language = 'zh';
    await call('cua_screenshot', {});
    expect(asked[1]).toBe('Bot 想用你的电脑:看屏幕、动鼠标和键盘。这一次可以吗?');
    expect(sent.filter((r) => r.op === 'confirm')[1]).toMatchObject({ caption: '电脑操作', yes: '可以', no: '不行' });
  });

  it('asks in Chinese without a language, and in en for the other permission levels', async () => {
    const zh = stubWorld(undefined, 'ask-once');
    await zh.call('cua_click', { x: 1, y: 1 });
    expect(zh.asked[0]).toBe('Bot 想动你的鼠标和键盘。接下来 30 分钟里都可以吗?');
    for (const permission of ['ask-before-acting', 'ask-once'] as const) {
      const s = stubWorld('en', permission);
      await s.call('cua_click', { x: 1, y: 1 });
      expect(s.asked[0]).not.toMatch(CJK);
    }
  });

  it('keeps every receipt Chinese in en', async () => {
    const { cfg, call } = stubWorld('en');
    cfg.control = false;
    expect((await call('cua_click', { x: 1, y: 1 })).text).toContain('没执行');
    cfg.control = true;
    expect((await call('cua_click', { x: 5000, y: 1 })).text).toContain('不在截图范围内');
  });

  it('gives the preflight reason in the app language', () => {
    const was = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...was, value: 'aix' });
    try {
      expect(() => cuaDefinition({ language: () => 'en' }).preflight?.({} as never)).toThrow('Computer use runs on Windows, macOS and Linux only.');
      expect(() => cuaDefinition().preflight?.({} as never)).toThrow('电脑操作 World 只支持 Windows、macOS 和 Linux。');
    } finally {
      Object.defineProperty(process, 'platform', was);
    }
  });
});

describe('the definition\'s name', () => {
  it('is Chinese by default and follows labelLanguage when an app gives one', () => {
    expect(cuaDefinition().label).toBe('电脑操作');
    let language: Language = 'zh';
    const def = cuaDefinition({ language: () => 'en', labelLanguage: () => language });
    expect(def.label).toBe('电脑操作');
    language = 'en';
    expect(def.label).toBe('Computer use');
  });
});
