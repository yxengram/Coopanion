/**
 * The model-facing text in Chinese, pinned byte for byte: what the bot reads must not change by a single byte for
 * the app language `zh`, nor for a config without a language, while the text people read gets other languages.
 *
 * Pinned: the desktop-pet World's environment prompt and tools in classic and decider mode for every built-in figure
 * (whale in both outfits), a tool receipt, the decider's request, small talk, the CUA World's prompt (per platform)
 * and tools, the `coopanion` World's events and its (absent) prompt, the introduction's lines and record as Coo
 * hears them (per platform), and the seeded self-description.
 *
 * The expected text is in tests/fixtures/i18n-zh/*.json, generated from the code at 084a201. To write them again
 * (only when a change to the Chinese model text is meant): UPDATE_I18N_ZH=1 node_modules/.bin/vitest run tests/i18n-zh-snapshot.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWorldEnvPrompt } from 'cortico/core/prefix.ts';
import type { ToolDef } from 'cortico/core/types.ts';
import type { WorldContext } from 'cortico/world.ts';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { desktopPetDefinition, type DesktopPetAssembly } from '../packages/cortico-world-desktop-pet/src/definition.ts';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../packages/cortico-world-desktop-pet/src/config.ts';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { buildQuestions, buildRequest, buildState } from '../packages/cortico-world-desktop-pet/src/decider.ts';
import { smallTalkText } from '../packages/cortico-world-desktop-pet/src/smalltalk.ts';
import { FakeHost } from '../packages/cortico-world-desktop-pet/tests/helpers/fake-host.ts';
import { cuaDefinition } from '../packages/cortico-world-cua/src/definition.ts';
import { CUA_DEFAULTS, PERMISSION_LEVELS, type CuaConfigSection } from '../packages/cortico-world-cua/src/config.ts';
import { changedText, guideText, noticeDefinition, settingChanges, updatedText } from '../core/notice.ts';
import { SEED_DIR } from '../core/seed.ts';
import { appLanguage, replyLanguage } from '../core/language.ts';
import type { Language } from 'cortico/core/language.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/i18n-zh/', import.meta.url));
const UPDATE = process.env.UPDATE_I18N_ZH === '1' && !process.env.CI;
const PLATFORMS = ['darwin', 'win32', 'linux'] as const;

/**
 * The language arguments a run is made with: none (as at 084a201), and once the Worlds take a language, `zh` and a
 * config without one. Every variant must give the same text.
 */
const VARIANTS: ReadonlyArray<{ name: string; language?: () => Language }> = [
  { name: 'no language option' },
  { name: 'language zh', language: () => appLanguage('zh') },
  { name: 'config without a language', language: () => appLanguage(undefined) },
];

/** `actual` against the fixture `name`; with UPDATE, writes the fixture instead. */
function expectFixture(name: string, actual: Record<string, unknown>): void {
  const file = join(FIXTURES, `${name}.json`);
  if (UPDATE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  if (!existsSync(file)) throw new Error(`missing fixture ${file}: generate it with UPDATE_I18N_ZH=1`);
  const expected = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const key of Object.keys(expected)) expect(actual[key], `${name}: ${key}`).toEqual(expected[key]);
}

/** Tools as the model gets them: name, description and parameters (handlers and flags left out). */
const toolDecls = (tools: ToolDef[]) => tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

async function withPlatformAsync<T>(platform: string, fn: () => Promise<T>): Promise<T> {
  const was = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...was, value: platform });
  try { return await fn(); } finally { Object.defineProperty(process, 'platform', was); }
}

/** A WorldContext as Cortico's assembly gives one, over `cfg`, in a scratch deployment. */
function contextOf<S extends { enabled: boolean }>(id: string, cfg: S): WorldContext<S> {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-zh-'));
  return {
    id, cfg, timezone: 'Asia/Shanghai', botName: 'Coo', botDir: join(dir, 'deploy'), packageDir: join(dir, 'pkg'),
    dataDir: join(dir, 'data'), repoRoot: dir,
    secret: () => '', storeSecret: () => {}, persist: (p) => { Object.assign(cfg, p); }, restart: async () => {},
  };
}

/** The pet World as core/companion.ts assembles it (the chat page lent), with `figure` (and `scheme`) on. */
function petWorld(figure: string, scheme: string | undefined, decider: boolean, extra: Partial<DesktopPetAssembly> = {}): DesktopPetWorld {
  const cfg: DesktopPetConfigSection = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.skin.figure = figure;
  if (scheme) cfg.skin.scheme = scheme;
  cfg.decider.enabled = decider;
  let made: DesktopPetWorld | null = null;
  desktopPetDefinition({
    controls: { isPaused: () => false, setPaused: () => {}, openSettings: () => {}, openChat: () => {}, openDress: () => {}, quit: () => {}, quitLabel: '退出应用', guide: () => {} },
    deciderKey: () => (decider ? 'sk-or-test' : ''),
    onCreate: (w) => { made = w; },
    ...extra,
  }).create(contextOf('desktop-pet', cfg));
  return made!;
}

const LOOKS: ReadonlyArray<[string, string | undefined]> = [
  ['coo', undefined], ['whale', 'deepseek'], ['whale', 'deepseek-cape'],
  ['claude-chan', undefined], ['gpt-chan', undefined], ['gemini-chan', undefined], ['grok-chan', undefined],
];

afterEach(() => { vi.unstubAllGlobals(); });

describe('model-facing text in Chinese stays byte-identical', () => {
  for (const variant of VARIANTS) {
    const lang = variant.language ? { language: variant.language } : {};

    it(`desktop-pet World: environment prompt and tools (${variant.name})`, async () => {
      // the same on every platform: one fixture for all three
      const byPlatform: Array<Record<string, unknown>> = [];
      for (const platform of PLATFORMS) {
        byPlatform.push(await withPlatformAsync(platform, async () => {
          const texts: Record<string, unknown> = {};
          for (const decider of [false, true]) {
            const mode = decider ? 'decider' : 'classic';
            for (const [figure, scheme] of LOOKS) {
              const world = petWorld(figure, scheme, decider, lang);
              expect(world.petMode).toBe(mode);
              const env = await renderWorldEnvPrompt(world);
              texts[`${mode}.env.${figure}${scheme ? `.${scheme}` : ''}`] = env.text;
              if (figure === 'coo') texts[`${mode}.envSource`] = env.sourceKey;
            }
            texts[`${mode}.tools`] = toolDecls(petWorld('coo', undefined, decider, lang).tools());
          }
          return texts;
        }));
      }
      for (const texts of byPlatform.slice(1)) expect(texts).toEqual(byPlatform[0]);
      const out: Record<string, unknown> = { ...byPlatform[0] };
      // the receipt of a tool the bot calls with no pet page connected
      const world = petWorld('coo', undefined, false, lang);
      await world.start(new FakeHost());
      try {
        const say = world.tools().find((t) => t.name === 'pet_say')!;
        out['classic.receipt.pet_say.noPage'] = await say.handler({ script: '你好' }, { role: 'main', log: new FakeHost().log } as never);
      } finally { await world.stop(); }
      expectFixture('pet', out);
    });
  }

  it('decision model request and small talk', () => {
    const out: Record<string, unknown> = {};
    for (const id of ['whale', 'claude-chan']) {
      const pack = figurePacks([]).packs.find((p) => p.id === id)!;
      const state = buildState({
        body: '测试身体', feeling: '有点开心', text: '你好呀', heard: { who: '小明', text: '在吗', via: '打字', agoMs: 30_000 },
        posture: 'stand', place: '屏幕偏右', facing: -1, recent: [{ words: ['happy', 'nod'], agoMs: 120_000 }], time: '周三 23:40',
      });
      out[`decider.request.${id}`] = buildRequest('perplexity/pplx-decider-v1.1-27b', state, buildQuestions(pack.manifest.vocab));
      out[`decider.request.${id}.forSay`] = buildRequest('m', state, buildQuestions(pack.manifest.vocab, { forSay: true, posture: 'sit' }), false);
    }
    out['smalltalk.idle'] = smallTalkText({ go: true, occasion: 'lull', sinceTalkMin: 75, idleMin: 3, awayMin: 0 } as never, '小明', 14 * 60 + 5, { text: '今天好累', agoMin: 130 });
    out['smalltalk.back'] = smallTalkText({ go: true, occasion: 'back', sinceTalkMin: 200, idleMin: 0, awayMin: 42 } as never, '伙伴', 8 * 60, null);
    expectFixture('decider-smalltalk', out);
  });

  for (const variant of VARIANTS) {
    it(`CUA World: environment prompt per platform and tools (${variant.name})`, async () => {
      const out: Record<string, unknown> = {};
      for (const platform of PLATFORMS) {
        for (const permission of PERMISSION_LEVELS) {
          for (const control of [true, false]) {
            const cfg: CuaConfigSection = { ...structuredClone(CUA_DEFAULTS), enabled: true, permission, control };
            const world = cuaDefinition(variant.language ? { language: variant.language } : {}).create(contextOf('cua', cfg));
            out[`env.${platform}.${permission}.${control ? 'control' : 'look'}`] = await withPlatformAsync(platform, async () => (await renderWorldEnvPrompt(world)).text);
          }
        }
      }
      const world = cuaDefinition(variant.language ? { language: variant.language } : {}).create(contextOf('cua', { ...structuredClone(CUA_DEFAULTS), enabled: true }));
      out.tools = toolDecls(world.tools());
      expectFixture('cua', out);
    });
  }

  for (const variant of VARIANTS) it(`the coopanion World: its events, and no prompt of its own (${variant.name})`, async () => {
    const out: Record<string, unknown> = {};
    const world = noticeDefinition({
      version: 'dev', notesDir: '/nowhere', stateFile: '/nowhere/notice.json', alarmsFile: join(mkdtempSync(join(tmpdir(), 'i18n-zh-')), 'alarms.json'),
      newInstall: () => true, read: () => undefined, petConnected: () => false, guiding: () => false,
      ...(variant.language ? { replyLanguage: () => replyLanguage(variant.language!()) } : {}),
    }).create(contextOf('coopanion', { enabled: true }));
    out.envPromptVars = world.envPromptVars() ?? null;
    out.env = (await renderWorldEnvPrompt(world)).text;
    out.tools = toolDecls(world.tools());
    out['updated.one'] = updatedText('0.9.0', '0.9.1', [{ version: '0.9.1', text: '## 新功能\n- 冬装' }]);
    out['updated.many'] = updatedText(null, '0.9.1', [{ version: '0.9.0', text: 'a' }, { version: '0.9.1', text: 'b' }]);
    out['updated.none'] = updatedText('0.9.0', '0.9.1', []);
    const P = 'worlds.desktop-pet';
    const before = {
      [`${P}.user`]: '"伙伴"', [`${P}.skin.palette`]: '"mint"', [`${P}.skin.head`]: '"none"', [`${P}.skin.colors`]: '{}', [`${P}.window.scale`]: '1',
      [`${P}.theme`]: '"light"', [`${P}.roam`]: '"calm"', [`${P}.sound`]: 'true', [`${P}.asr.enabled`]: 'true', [`${P}.smallTalk.enabled`]: 'false',
      [`${P}.smallTalk.frequency`]: '"mid"', 'worlds.cua.enabled': 'false', 'worlds.cua.control': 'true', 'worlds.cua.permission': '"ask-once"',
    };
    const after = {
      [`${P}.user`]: '"小明"', [`${P}.skin.palette`]: '"rose"', [`${P}.skin.head`]: '"bow"', [`${P}.skin.colors`]: '{"a":1}', [`${P}.window.scale`]: '1.5',
      [`${P}.theme`]: '"dark"', [`${P}.roam`]: '"free"', [`${P}.sound`]: 'false', [`${P}.asr.enabled`]: 'false', [`${P}.smallTalk.enabled`]: 'true',
      [`${P}.smallTalk.frequency`]: '"high"', 'worlds.cua.enabled': 'true', 'worlds.cua.control': 'false', 'worlds.cua.permission': '"never-ask"',
    };
    const lines = settingChanges(before, after, { palettes: { rose: '玫瑰' }, accessories: { bow: '蝴蝶结' } });
    out['settings.lines'] = lines;
    out['settings.changed'] = changedText(lines);
    out['guide.finished'] = guideText({ finished: true, name: '小明', step: 5, transcript: ['Coo:你好', '对方:你好'] });
    out['guide.closed'] = guideText({ finished: false, name: null, step: 2, transcript: ['Coo:你好'] });
    out.constitution = createHash('sha256').update(readFileSync(join(SEED_DIR, 'CONSTITUTION.md'), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
    expectFixture('notice', out);
  });

  for (const variant of VARIANTS) it(`the introduction: every line, and the record Coo is handed, per platform (${variant.name})`, async () => {
    const out: Record<string, unknown> = {};
    for (const platform of PLATFORMS) {
      for (const path of ['walk', 'close'] as const) {
        const run = await withPlatformAsync(platform, () => walkGuide(path, variant.language));
        out[`${platform}.${path}.dialogs`] = run.dialogs;
        out[`${platform}.${path}.record`] = run.record;
      }
    }
    expectFixture('guide', out);
  }, 60_000);
});

/** A dialog as the bubble shows it, pictures left out. */
function shownOf(d: PetDialog): unknown {
  const input = d.input as (PetDialog['input'] & { options?: Array<Record<string, unknown>> }) | undefined;
  return {
    text: d.text, marks: d.marks ?? null, actions: d.actions ?? null, step: d.step ?? null,
    input: input ? { ...input, ...(input.options ? { options: input.options.map(({ image: _i, ...o }) => o) } : {}) } : null,
  };
}

/**
 * Runs the introduction (core/guide.ts, loaded afresh so a platform read at load time is the stubbed one) against
 * a pet page that takes each step's first answer and a console whose model is not connected yet; `close` closes the
 * bubble at the figure step. The key step is put off. Returns what was shown and the record handed to Coo.
 */
async function walkGuide(path: 'walk' | 'close', language?: () => Language): Promise<{ dialogs: unknown[]; record: string }> {
  vi.resetModules();
  const { runGuide } = await import('../core/guide.ts');
  const { guideText: recordText } = await import('../core/notice.ts');
  const { VENDORS } = await import('cortico-provider-coo');
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    const reply = url.endsWith('/api/status') ? { modelConnection: { ready: false } }
      : url.endsWith('/api/config') ? { groups: [] } : { ok: true };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  const dialogs: unknown[] = [];
  const pet = {
    petState: () => ({ connected: true, url: 'http://127.0.0.1:7797/pet', skin: { figure: 'coo' } }),
    voiceState: () => ({ enabled: true, engine: 'funasr', model: { phase: 'ready', done: 0, total: null, bytes: 0, detail: null }, input: { mode: 'hold', hint: '按住右 Alt 说话', keyLabel: 'Alt', taps: 0 } }),
    packs: () => figurePacks([]).packs,
    installVoice: async () => {},
    dialog(d: PetDialog) {
      dialogs.push(shownOf(d));
      const input = d.input;
      const isFigures = input?.kind === 'choices' && input.options.some((o) => o.label === 'GPT 娘');
      const a: PetDialogAnswer = path === 'close' && isFigures ? { closed: true }
        : input?.kind === 'buttons' ? { index: 0 }
          : input?.kind === 'choices' ? { index: input.value ?? 0 }
            : input?.kind === 'text' ? (input.secret ? { alt: true } : { text: input.value || '小明' }) as PetDialogAnswer
              : { done: true } as PetDialogAnswer;
      return { answer: Promise.resolve(a), dropped: [], update() {}, close() {} };
    },
  } as unknown as DesktopPetWorld;
  let record = '';
  await runGuide({
    pet: () => pet, console: 'http://127.0.0.1:17788', doneFile: join(mkdtempSync(join(tmpdir(), 'i18n-zh-guide-')), 'guide.json'),
    openDress() {}, onEnd: (end) => { record = recordText(end); },
    ...(language ? { language } : {}),
  });
  expect(VENDORS.length).toBeGreaterThan(0);
  return { dialogs, record };
}
