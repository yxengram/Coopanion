/**
 * The app language switched while a step of the introduction is up in the pet's bubble (core/guide.ts `talker`):
 * the same step is said again in the new language in place (`PetDialogHandle.update`, its line, marks and input,
 * not shown anew), and the record quotes the step as it was when it was answered.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Language } from 'cortico/core/language.ts';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer, PetDialogUpdate } from 'cortico-world-desktop-pet';
import { VENDORS } from 'cortico-provider-coo';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { askForKey, guideFigures, guideStrings, runGuide, type GuideEnd } from '../core/guide.ts';

const CJK = /[　-〿㐀-䶿一-鿿＀-￯]/;
const PACKS = figurePacks([]).packs;
const ZH = guideStrings('zh');
const EN = guideStrings('en');

/** One step on the fake pet: what was shown, its updates, and a way to answer it. */
interface Up {
  d: PetDialog;
  updates: PetDialogUpdate[];
  answer(a: PetDialogAnswer): void;
}

/** A pet whose bubble answers each step with `auto`, or holds it (undefined) until the test answers. */
function fakePet(auto: (d: PetDialog) => PetDialogAnswer | undefined) {
  const shown: Up[] = [];
  const pet = {
    petState: () => ({ connected: true, url: 'http://127.0.0.1:7797/pet', skin: { figure: 'coo' } }),
    voiceState: (language: Language = 'zh') => ({ enabled: true, engine: 'system', input: { mode: 'hold', hint: language === 'en' ? 'hold Right Alt and talk' : '按住右 Alt 说话', keyLabel: 'Right Alt', taps: 0 } }),
    packs: () => PACKS,
    installVoice: async () => {},
    dialog(d: PetDialog) {
      let settle: (a: PetDialogAnswer) => void = () => {};
      const answer = new Promise<PetDialogAnswer>((resolve) => { settle = resolve; });
      const up: Up = { d, updates: [], answer: (a) => settle(a) };
      shown.push(up);
      const a = auto(d);
      if (a) settle(a);
      return { answer, dropped: [], update: (patch: PetDialogUpdate) => { up.updates.push(patch); }, close: () => settle({ done: true }) };
    },
  } as unknown as DesktopPetWorld;
  /** The first step shown whose line is `text`, once it is up. */
  const waitFor = async (text: string): Promise<Up> => {
    for (let i = 0; i < 200; i++) {
      const up = shown.find((s) => s.d.text === text);
      if (up) return up;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`never shown: ${text}`);
  };
  /** The step's first update, once it came (the guide looks at the language every half second). */
  const updated = async (up: Up): Promise<PetDialogUpdate> => {
    for (let i = 0; i < 100 && !up.updates.length; i++) await new Promise((r) => setTimeout(r, 25));
    if (!up.updates.length) throw new Error(`never relabelled: ${up.d.text}`);
    return up.updates[0]!;
  };
  return { pet, shown, waitFor, updated };
}

/** The usual answer to a step: the last button, the card already picked, the text box's value or a name, a key put off. */
function answerOf(d: PetDialog): PetDialogAnswer {
  const input = d.input;
  return input?.kind === 'buttons' ? { index: input.options.length - 1 }
    : input?.kind === 'choices' ? { index: input.value ?? 0 }
      : input?.kind === 'text' ? (input.secret ? { alt: true } : { text: input.value || 'Sam' })
        : { done: true };
}

function stubConsole(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    const reply = url.endsWith('/api/status') ? { modelConnection: { ready: false } } : url.endsWith('/api/config') ? { groups: [] } : { ok: true };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('a step up when the app language changes', () => {
  it('is said again in the new language in place: the name box, the figure cards, the record quoting what was answered', async () => {
    stubConsole();
    let language: Language = 'zh';
    const held = new Set([ZH.askName, EN.askFigure]);
    const { pet, shown, waitFor, updated } = fakePet((d) => (held.has(d.text) ? undefined : answerOf(d)));
    let end: GuideEnd | null = null;
    const run = runGuide({
      pet: () => pet, console: 'http://127.0.0.1:17788', doneFile: join(mkdtempSync(join(tmpdir(), 'guide-relabel-')), 'guide.json'),
      openDress() {}, onEnd: (e) => { end = e; }, language: () => language,
    });

    // the name box in Chinese; switched to English while it is up
    const name = await waitFor(ZH.askName);
    expect(name.d.input).toMatchObject({ kind: 'text', submit: ZH.nameSend, placeholder: ZH.namePlaceholder });
    const before = shown.length;
    language = 'en';
    const u = await updated(name);
    expect(u).toEqual({ text: EN.askName, marks: [], input: { kind: 'text', submit: EN.nameSend, placeholder: EN.namePlaceholder, value: '', maxLength: 20 } });
    // the same step, not a new one: nothing else was shown, and nothing more is sent while the language stays
    expect(shown.length).toBe(before);
    await new Promise((r) => setTimeout(r, 1100));
    expect(name.updates).toHaveLength(1);
    name.answer({ text: 'Sam' });

    // the figure cards in English, picked one kept by the page; back to Chinese while they are up
    const figures = await waitFor(EN.askFigure);
    language = 'zh';
    const f = await updated(figures);
    expect(f.text).toBe(ZH.askFigure);
    expect(f.marks).toEqual([ZH.figureMark]);
    if (f.input?.kind !== 'choices' || figures.d.input?.kind !== 'choices') throw new Error('not cards');
    expect(f.input.confirm).toBe(ZH.figureOk);
    expect(f.input.value).toBe(figures.d.input.value);
    expect(f.input.options.map((o) => o.label)).toEqual(guideFigures(PACKS).map((p) => ZH.figures[p.id]?.label ?? p.id));
    expect(f.input.options.map((o) => o.image)).toEqual(figures.d.input.options.map((o) => o.image));
    figures.answer({ index: f.input.value ?? 0 });

    await run;
    // the steps after the switch are in Chinese; the record quotes each step as it was answered
    expect(shown.find((s) => s.d.text === ZH.figureKept)).toBeTruthy();
    const record = end!.transcript;
    expect(record).toContain(`Coo:${EN.askName}`);
    expect(record).not.toContain(`Coo:${ZH.askName}`);
    expect(record).toContain(`Coo:${ZH.askFigure}`);
    expect(record).not.toContain(`Coo:${EN.askFigure}`);
    expect(record).toContain('对方:Sam');
  }, 30_000);

  it('the talk step takes the World\'s talk hint in the new language (asked for in the app language, as the step itself)', async () => {
    stubConsole();
    let language: Language = 'zh';
    const isTalk = (d: PetDialog) => d.input?.kind === 'buttons' && !!d.input.keys;
    const { pet, waitFor, updated } = fakePet((d) => (isTalk(d) ? undefined : answerOf(d)));
    const run = runGuide({
      pet: () => pet, console: 'http://127.0.0.1:17788', doneFile: join(mkdtempSync(join(tmpdir(), 'guide-relabel-')), 'guide.json'),
      openDress() {}, language: () => language,
    });
    const talk = await waitFor(`${ZH.talk('按住右 Alt 说话')}${ZH.talkType}`);
    language = 'en';
    const u = await updated(talk);
    expect(u.text).toBe(`${EN.talk('hold Right Alt and talk')}${EN.talkType}`);
    expect(JSON.stringify(u)).not.toMatch(CJK);
    talk.answer({ index: 0 });
    await run;
  }, 30_000);

  it('the key box asked for later follows too: the service cards and the key step', async () => {
    stubConsole();
    let language: Language = 'en';
    let keySet = false;
    const { pet, waitFor, updated } = fakePet(() => undefined);
    const asking = askForKey({ pet: () => pet, console: 'http://127.0.0.1:17788', language: () => language }, () => keySet, () => false, 0);

    const cards = await waitFor(EN.ask.first);
    expect(cards.d.input).toMatchObject({ kind: 'choices', confirm: EN.vendorOk });
    language = 'zh';
    const c = await updated(cards);
    expect(c.text).toBe(ZH.ask.first);
    if (c.input?.kind !== 'choices') throw new Error('not cards');
    expect(c.input.confirm).toBe(ZH.vendorOk);
    expect(c.input.options.map((o) => o.label)).toEqual(VENDORS.map((v) => ZH.vendorName(v)));
    cards.answer({ index: 0 });

    const model = await waitFor(ZH.pickModel(VENDORS[0]!));
    model.answer({ text: VENDORS[0]!.model });
    const key = await waitFor(ZH.askKey(VENDORS[0]!));
    language = 'en';
    const k = await updated(key);
    expect(k.text).toBe(EN.askKey(VENDORS[0]!));
    expect(k.input).toMatchObject({ kind: 'text', submit: EN.keySend, secret: true, alt: EN.askLater, link: { label: EN.keyLink(VENDORS[0]!) } });
    expect(JSON.stringify(k)).not.toMatch(CJK);
    key.answer({ closed: true });
    keySet = true;
    await asking;
  }, 30_000);
});
