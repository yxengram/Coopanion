/**
 * The pet's bubble after five model requests in a row failed (core/companion.ts hintFailures, upstream #438): the
 * last failure's status picks the advice after the upstream's reason, and only a key or model problem (401, 403,
 * 404) gets the button to the settings window. Adapted from upstream Coopanion's tests/failure-bubble.test.ts to the
 * fork's inline FAILURE_HINT table.
 */
import { describe, expect, it } from 'vitest';
import type { Core } from 'cortico/core/core.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import type { DesktopPetWorld, PetDialog } from 'cortico-world-desktop-pet';
import { FAILURE_HINT, hintFailures } from '../core/companion.ts';

const origin = { instance: 'test', module: 'test', model: 'm', compatibilityDomain: 'test' };

/** Fails five model requests with `status` and the upstream's `message`, and returns the bubble the pet showed and what the button sent. */
async function bubbleFor(status: number, message: string, language: 'zh' | 'en' = 'en'): Promise<{ d: PetDialog; answer: (index: number) => Promise<unknown[]> }> {
  const shown: Array<{ d: PetDialog; resolve: (a: unknown) => void }> = [];
  const llm = {
    respond: async () => { throw new GenerationError(`LLM API ${status}`, [], null, origin, status, JSON.stringify({ error: { message } })); },
  };
  const pet = {
    petState: () => ({ connected: true }),
    dialog: (d: PetDialog) => {
      let resolve!: (a: unknown) => void;
      const answer = new Promise((r) => { resolve = r; });
      shown.push({ d, resolve });
      return { answer, close() {}, update() {} };
    },
  };
  hintFailures({ llm } as unknown as Core<CoreConfig>, { language } as CoreConfig, () => pet as unknown as DesktopPetWorld);
  for (let i = 0; i < 5; i++) await expect(llm.respond()).rejects.toBeInstanceOf(GenerationError);
  expect(shown).toHaveLength(1);
  return {
    d: shown[0]!.d,
    // picks a button and returns the messages sent to the app's main process meanwhile
    answer: async (index) => {
      const sent: unknown[] = [];
      const was = process.send;
      process.send = ((m: unknown) => { sent.push(m); return true; }) as typeof process.send;
      try {
        shown[0]!.resolve({ index });
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        process.send = was;
      }
      return sent;
    },
  };
}

const labels = (d: PetDialog) => (d.input?.kind === 'buttons' ? d.input.options.map((o) => o.label) : []);

describe('failure bubble', () => {
  const S = FAILURE_HINT.en;
  it.each([
    { status: 401, advice: S.advice.key, settings: true },
    { status: 403, advice: S.advice.key, settings: true },
    { status: 404, advice: S.advice.model, settings: true },
    { status: 429, advice: S.advice.later, settings: false },
    { status: 503, advice: S.advice.later, settings: false },
  ])('status $status follows the reason with its advice', async ({ status, advice, settings }) => {
    const { d } = await bubbleFor(status, 'upstream says no');
    expect(d.text).toBe(`My last 5 requests to the model failed. Error ${status}: upstream says no. ${advice}`);
    expect(labels(d)).toEqual(settings ? [S.open, S.ok] : [S.ok]);
  });

  it.each([400, 0])('status %i says the reason alone, with no settings button', async (status) => {
    const { d } = await bubbleFor(status, 'content rejected by moderation');
    expect(d.text.endsWith('content rejected by moderation.')).toBe(true);
    expect(labels(d)).toEqual([S.ok]);
  });

  it('opens the settings window from the button of a key problem, and not from 知道了 or a bubble with no button', async () => {
    const key = await bubbleFor(401, 'invalid api key');
    expect(await key.answer(0)).toEqual([{ type: 'companion:open', path: '#/home' }]);
    expect(await (await bubbleFor(401, 'invalid api key')).answer(1)).toEqual([]);
    expect(await (await bubbleFor(503, 'overloaded')).answer(0)).toEqual([]);
  });

  it('says the same in Chinese, the advice right after the reason', async () => {
    const Z = FAILURE_HINT.zh;
    const model = await bubbleFor(404, 'model not found', 'zh');
    expect(model.d.text).toBe(`我连着 5 次没能从模型那里拿到回复。错误 404:model not found。${Z.advice.model}`);
    expect(labels(model.d)).toEqual([Z.open, Z.ok]);
    const rejected = await bubbleFor(400, '内容审核未通过', 'zh');
    expect(rejected.d.text).toBe('我连着 5 次没能从模型那里拿到回复。错误 400:内容审核未通过。');
    expect(labels(rejected.d)).toEqual([Z.ok]);
  });
});
