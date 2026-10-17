/**
 * The Core's own text in English: the introduction in the pet's bubble (core/guide.ts), the figure colour schemes on
 * the appearance page (core/console-theme.ts) and the coopanion World's name. Every table has the keys of its Chinese
 * one, and what a person sees in English has no Chinese in it. (The Chinese text is pinned by i18n-zh-snapshot.test.ts.)
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { VENDORS } from 'cortico-provider-coo';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { figureStep, guideFigures, guideStrings, noteStep, runGuide, talkStep, type GuideEnd } from '../core/guide.ts';
import { figureSchemes } from '../core/console-theme.ts';
import { noticeDefinition } from '../core/notice.ts';

const CJK = /[　-〿㐀-䶿一-鿿＀-￯]/;
const PACKS = figurePacks([]).packs;

/** Every leaf of `value` as [path, value]; a function as itself. */
function leaves(value: unknown, path = ''): Array<[string, unknown]> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [[path, value]];
}

/** The shape of a table: each leaf's path with its kind (a function's arity, an array's length). */
function shape(value: unknown): Record<string, string> {
  return Object.fromEntries(leaves(value).map(([p, v]) => [p, typeof v === 'function' ? `fn/${v.length}` : Array.isArray(v) ? `array/${v.length}` : typeof v]));
}

/** Every text a table gives: strings, array items, and what each function returns for sample arguments. */
function texts(table: ReturnType<typeof guideStrings>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [path, v] of leaves(table)) {
    if (typeof v === 'string') out.push([path, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => out.push([`${path}.${i}`, String(x)]));
    else if (typeof v === 'function') {
      const fn = v as (...args: unknown[]) => unknown;
      if (path === 'packName') out.push([path, String(fn({ zh: '某个形象', en: 'A figure' }))]);
      else if (['vendorName', 'keyHint', 'pickModel', 'askKey', 'keyLink', 'keyOk'].includes(path)) {
        for (const vendor of VENDORS) out.push([`${path}(${vendor.id})`, String(fn(vendor, 'some-model'))]);
      } else if (path === 'askModel') out.push([path, String(fn(232))]);
      else out.push([path, String(fn('reason', 'model'))]);
    } else out.push([path, String(v)]);
  }
  return out;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the introduction in English', () => {
  it('has every key of the Chinese text, functions taking the same arguments', () => {
    expect(shape(guideStrings('en'))).toEqual(shape(guideStrings('zh')));
  });

  it('says nothing in Chinese', () => {
    for (const [path, text] of texts(guideStrings('en'))) expect(text, path).not.toMatch(CJK);
  });

  it('is read for every language but Chinese', () => {
    expect(guideStrings('zh-Hant')).toBe(guideStrings('zh'));
    expect(guideStrings('ja')).toBe(guideStrings('en'));
    expect(guideStrings()).toBe(guideStrings('zh'));
  });

  it('names the figure cards and the talk step in English', () => {
    const d = figureStep(guideFigures(PACKS), 'en');
    if (d.input?.kind !== 'choices') throw new Error('not cards');
    expect(d.input.options.map((o) => o.label)).toEqual(['Coo', 'Whale', 'Claude-chan', 'GPT-chan', 'Gemini-chan', 'Grok-chan']);
    for (const o of d.input.options) expect(`${o.label} ${o.line}`).not.toMatch(CJK);
    const talk = talkStep({ enabled: true, input: { mode: 'hold', hint: 'hold Right Alt and talk.', keyLabel: 'Right Alt' } }, 'en');
    expect(talk.text).toBe('To talk to me: hold Right Alt and talk. You can also rest the pointer on me and click the bubble button beside me to type.');
    expect(talkStep({ enabled: false }, 'en').text).not.toMatch(CJK);
  });

  it('walks through in English, its console calls asking for English; the record keeps its Chinese framing only', async () => {
    const headers: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const h = init?.headers as Record<string, string> | undefined;
      if (h?.['x-cortico-language']) headers.push(h['x-cortico-language']);
      const reply = url.endsWith('/api/status') ? { modelConnection: { ready: false } }
        : url.endsWith('/api/config') ? { groups: [] } : { ok: true };
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const shown: PetDialog[] = [];
    const gpt = guideFigures(PACKS).findIndex((p) => p.id === 'gpt-chan');
    const pet = {
      petState: () => ({ connected: true, url: 'http://127.0.0.1:7797/pet', skin: { figure: 'coo' } }),
      voiceState: () => ({ enabled: true, engine: 'funasr', model: { phase: 'absent', done: 0, total: null, bytes: 240 * 1048576, detail: null }, input: { mode: 'hold', hint: 'hold Right Alt and talk', keyLabel: 'Right Alt', taps: 0 } }),
      packs: () => PACKS,
      installVoice: async () => {},
      dialog(d: PetDialog) {
        shown.push(d);
        const input = d.input;
        const figures = input?.kind === 'choices' && input.options.some((o) => o.label === 'GPT-chan');
        const a: PetDialogAnswer = figures ? { index: gpt }
          : input?.kind === 'buttons' ? { index: input.options.length - 1 }
            : input?.kind === 'choices' ? { index: input.value ?? 0 }
              : input?.kind === 'text' ? (input.secret ? { alt: true } : { text: input.value || 'Sam' }) as PetDialogAnswer
                : { done: true } as PetDialogAnswer;
        return { answer: Promise.resolve(a), dropped: [], update() {}, close() {} };
      },
    } as unknown as DesktopPetWorld;
    let end: GuideEnd | null = null;
    await runGuide({
      pet: () => pet, console: 'http://127.0.0.1:17788', doneFile: join(mkdtempSync(join(tmpdir(), 'guide-en-')), 'guide.json'),
      openDress() {}, onEnd: (e) => { end = e; }, language: () => 'en',
    });
    expect(shown.length).toBeGreaterThan(10);
    expect(shown.some((d) => d.text === "All changed! Now I'm GPT-chan!")).toBe(true);
    for (const d of shown) {
      const input = d.input as Record<string, unknown> | undefined;
      const seen = [d.text, ...(d.marks ?? []), JSON.stringify({ ...input, options: (input?.options as Array<Record<string, unknown>> | undefined)?.map(({ image: _i, ...o }) => o) })];
      for (const text of seen) expect(text, d.text).not.toMatch(CJK);
    }
    expect(headers.length).toBeGreaterThan(0);
    expect(new Set(headers)).toEqual(new Set(['en']));
    // the record quotes what was shown; its framing (`Coo:`, `对方:`) stays Chinese for the bot
    const record = end!.transcript.map((line) => line.replace(/^(Coo:|对方:)/, ''));
    for (const line of record) expect(line).not.toMatch(CJK);
  }, 30_000);

  it('records an answer in the language it was given in', () => {
    expect(noteStep({ text: 'Hi!', input: { kind: 'buttons', options: [{ label: 'Hi, Coo!' }] } }, { index: 0 })).toEqual(['Coo:Hi!', '对方:Hi, Coo!']);
  });
});

describe('other Core text in English', () => {
  it('names the figure colour schemes in the app language', () => {
    const zh = figureSchemes(PACKS);
    const en = figureSchemes(PACKS, 'en');
    expect(en.map((s) => s.id)).toEqual(zh.map((s) => s.id));
    expect(zh.find((s) => s.id === 'coo-fig-gpt-chan-original')).toMatchObject({ name: 'GPT 娘 · 原版', note: '桌宠换成GPT 娘的「原版」时自动换上' });
    expect(en.find((s) => s.id === 'coo-fig-gpt-chan-original')).toMatchObject({ name: 'GPT-chan · Original', note: 'Put on when the pet changes to GPT-chan\'s "Original"' });
    for (const s of en) expect(`${s.name} ${s.note}`).not.toMatch(CJK);
  });

  it('names the coopanion World in the app language', () => {
    let language: 'zh' | 'en' = 'zh';
    const def = noticeDefinition({
      version: 'dev', notesDir: '/nowhere', stateFile: '/nowhere/notice.json', alarmsFile: '/nowhere/alarms.json',
      newInstall: () => true, read: () => undefined, petConnected: () => false, guiding: () => false, labelLanguage: () => language,
    });
    expect(def.label).toBe('应用通知');
    language = 'en';
    expect(def.label).toBe('App notifications');
  });
});

describe('the Core process\'s own lines in English (core/companion.ts)', () => {
  it('has every key of the Chinese, and nothing in Chinese', async () => {
    const { FAILURE_HINT, LENT_TEXT, SETTINGS_TEXT, UPDATE_TEXT, companionGroup } = await import('../core/companion.ts');
    for (const table of [FAILURE_HINT, LENT_TEXT, SETTINGS_TEXT, UPDATE_TEXT]) {
      expect(shape(table.en)).toEqual(shape(table.zh));
      for (const [path, v] of leaves(table.en)) {
        const text = typeof v === 'function' ? String((v as (...a: unknown[]) => unknown)(5, 'v1.2.3', 'reason')) : String(v);
        expect(text, path).not.toMatch(CJK);
      }
    }
    const group = companionGroup('en');
    expect(group.id).toBe('companion');
    expect(Object.keys(group.schema.properties)).toEqual(Object.keys(companionGroup('zh').schema.properties));
    expect(JSON.stringify(group)).not.toMatch(CJK);
    expect(companionGroup('zh').schema.properties.language!.title).toBe('界面语言');
  });
});
