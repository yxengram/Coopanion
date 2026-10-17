import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { DESKTOP_PET_DEFAULTS } from '../packages/cortico-world-desktop-pet/src/config.ts';
import { GUIDE_FIGURES, defaultScheme, figureStep, guideFigures, markDone, runGuide } from '../core/guide.ts';

const PACKS = figurePacks([]).packs;
const PET = 'http://127.0.0.1:7797';
const CONSOLE = 'http://127.0.0.1:17788';

/** A pet page that answers each step as `answer` says (by default the first button, the card picked to begin with, a name). */
function fakePet(answer: (d: PetDialog) => PetDialogAnswer | undefined, skin: Record<string, unknown> = { figure: 'coo', palette: 'mint' }) {
  const shown: PetDialog[] = [];
  const pet = {
    petState: () => ({ connected: true, url: `${PET}/pet`, skin }),
    voiceState: () => ({ enabled: false }),
    packs: () => PACKS,
    installVoice: async () => {},
    dialog(d: PetDialog) {
      shown.push(d);
      const input = d.input;
      const a = answer(d) ?? (input?.kind === 'buttons' ? { index: 0 } : input?.kind === 'choices' ? { index: input.value ?? 0 } : input?.kind === 'text' ? { text: '小明' } : { done: true });
      return { answer: Promise.resolve(a), dropped: [], update() {}, close() {} };
    },
  };
  return { pet: pet as unknown as DesktopPetWorld, shown };
}

/** The console's and the pet server's routes as the introduction calls them; the model is already connected. */
function stubFetch() {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const reply = url.endsWith('/api/status') ? { modelConnection: { ready: true, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' } }
      : url.endsWith('/api/config') ? { groups: [] } : { ok: true };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

const isFigureStep = (d: PetDialog) => d.input?.kind === 'choices' && d.input.options.some((o) => o.label === 'GPT 娘');
const doneFile = () => join(mkdtempSync(join(tmpdir(), 'guide-')), 'guide.json');

afterEach(() => { vi.unstubAllGlobals(); });

describe('the figure step of the introduction', () => {
  it('new installs start as Coo', () => {
    expect(DESKTOP_PET_DEFAULTS.skin.figure).toBe('coo');
  });

  it('offers the six built-in figures in order, each with a small picture, Coo picked to begin with', () => {
    const figures = guideFigures(PACKS);
    expect(figures.map((p) => p.id)).toEqual([...GUIDE_FIGURES]);
    const d = figureStep(figures);
    if (d.input?.kind !== 'choices') throw new Error('not cards');
    expect(d.input.value).toBe(0);
    expect(d.input.options.map((o) => o.label)).toEqual(['Coo', '大肥鱼', 'Claude 娘', 'GPT 娘', 'Gemini 娘', 'Grok 娘']);
    for (const o of d.input.options) expect(o.image, o.label).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(d).length).toBeLessThan(600_000);
    // an installed pack is not offered, nor a copy taking a built-in's id
    expect(guideFigures(PACKS.map((p) => (p.id === 'whale' ? { ...p, builtin: false } : p))).map((p) => p.id)).not.toContain('whale');
  });

  it('puts a figure on with its default pick: the preset of each axis\'s first option', () => {
    const scheme = (id: string) => defaultScheme(PACKS.find((p) => p.id === id)!);
    expect(scheme('gpt-chan')).toBe('original');
    expect(scheme('grok-chan')).toBe('original');
    expect(scheme('whale')).toBe('deepseek');
  });

  it('on a first start, the figure picked is saved through the pet server, the rest of the look kept', async () => {
    const calls = stubFetch();
    const gpt = guideFigures(PACKS).findIndex((p) => p.id === 'gpt-chan');
    const { pet, shown } = fakePet((d) => (isFigureStep(d) ? { index: gpt } : undefined));
    const file = doneFile();
    await runGuide({ pet: () => pet, console: CONSOLE, doneFile: file, openDress() {} });
    expect(shown.some(isFigureStep)).toBe(true);
    const skin = calls.filter((c) => c.url === `${PET}/api/skin`);
    expect(skin).toEqual([{ url: `${PET}/api/skin`, body: { skin: { figure: 'gpt-chan', scheme: 'original', palette: 'mint' } } }]);
    expect(shown.find((d) => d.text.includes('GPT 娘的样子'))).toBeTruthy();
    // the figure comes before how lively, in step 2
    const at = shown.findIndex(isFigureStep);
    expect(shown[at]!.step).toEqual([2, 5]);
    expect(shown.findIndex((d) => d.input?.kind === 'choices' && d.input.options.some((o) => o.label === '不乱动'))).toBeGreaterThan(at);
    expect(existsSync(file)).toBe(true);
  }, 15_000);

  it('keeping Coo, or closing the bubble at the cards, writes nothing', async () => {
    const calls = stubFetch();
    const { pet } = fakePet(() => undefined);
    await runGuide({ pet: () => pet, console: CONSOLE, doneFile: doneFile(), openDress() {} });
    expect(calls.some((c) => c.url.endsWith('/api/skin'))).toBe(false);

    const closedCalls = stubFetch();
    let ended: { finished: boolean } | null = null;
    const closing = fakePet((d) => (isFigureStep(d) ? { closed: true } : undefined));
    await runGuide({ pet: () => closing.pet, console: CONSOLE, doneFile: doneFile(), openDress() {}, onEnd: (e) => { ended = e; } });
    expect(closedCalls.some((c) => c.url.endsWith('/api/skin'))).toBe(false);
    expect(ended).toMatchObject({ finished: false, step: 2 });
  }, 15_000);

  it('a replay (the introduction ran before) or a pet already wearing another figure is not asked', async () => {
    stubFetch();
    const file = doneFile();
    markDone(file);
    const replay = fakePet(() => undefined);
    await runGuide({ pet: () => replay.pet, console: CONSOLE, doneFile: file, openDress() {} });
    expect(replay.shown.some(isFigureStep)).toBe(false);

    const dressed = fakePet(() => undefined, { figure: 'whale', scheme: 'claude' });
    await runGuide({ pet: () => dressed.pet, console: CONSOLE, doneFile: doneFile(), openDress() {} });
    expect(dressed.shown.some(isFigureStep)).toBe(false);
  }, 15_000);
});

