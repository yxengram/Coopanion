import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nullLogger } from 'cortico/core/util.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { functionCall, functionResult, message } from 'cortico/protocol/open-responses/context.ts';
import COO, { VENDORS } from 'cortico-provider-coo';
import { FAILURE_HINT, SYNTHETIC_REASONING_OFF } from '../core/companion.ts';

// The pet's failure bubble tells a refusal for the missing placeholder reasoning by the words Cortico adds to the
// error (core/companion.ts hintFailures): this holds them to what Cortico's Responses provider actually says.
describe('a 400 for the placeholder reasoning OpenRouter is sent without', () => {
  it('reaches the Core with the words the failure bubble looks for', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'Missing reasoning_text before function_call c1' } }), { status: 400, headers: { 'content-type': 'application/json' } }));
    try {
      const v = VENDORS.find((x) => x.id === 'openrouter')!;
      const host = { stateDir: mkdtempSync(join(tmpdir(), 'sr-')), secret: () => 'sk-or-test', readBlob: () => null, keepThinking: () => true, log: nullLogger() };
      const instance = COO.create('openrouter', { kind: 'coo', baseUrl: v.baseUrl, secret: v.secret, spec: { model: v.model, thinking: true } }, host as never);
      const context = [message('user', '几点了'), functionCall('c1', 'clock', '{}'), functionResult('c1', '12:00')];
      const err = await instance.client.respond({ model: v.model, input: context.map((r) => r.item) } as unknown as Request, { context }).then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain(SYNTHETIC_REASONING_OFF);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is said with a request to report it and no settings button, in both languages', () => {
    expect(FAILURE_HINT.zh.reasoningReplay(5)).toMatch(/^我连着 5 次.*回传思考内容.*https:\/\/github\.com\/yxengram\/Coopanion\/issues$/);
    expect(FAILURE_HINT.en.reasoningReplay(5)).toMatch(/^My last 5 requests.*https:\/\/github\.com\/yxengram\/Coopanion\/issues$/);
  });
});

describe('the failure bubble after five failed requests in a row (hintFailures)', () => {
  async function bubbleAfter(err: Error) {
    const { hintFailures } = await import('../core/companion.ts');
    const shown: Array<{ text: string; options: Array<{ label: string; primary?: boolean }> }> = [];
    const core = { llm: { respond: async () => { throw err; } } };
    const pet = {
      petState: () => ({ connected: true }),
      dialog: (d: { text: string; input: { options: Array<{ label: string; primary?: boolean }> } }) => {
        shown.push({ text: d.text, options: d.input.options });
        return { answer: new Promise(() => {}) };
      },
    };
    hintFailures(core as never, { language: 'zh' } as never, () => pet as never);
    for (let i = 0; i < 5; i++) await core.llm.respond().catch(() => {});
    return shown;
  }

  it('asks to report a refusal for the placeholder reasoning, with only an OK button', async () => {
    const shown = await bubbleAfter(new Error(`Bad request: 400 body names reasoning_text while ${SYNTHETIC_REASONING_OFF}`));
    expect(shown).toEqual([{ text: FAILURE_HINT.zh.reasoningReplay(5), options: [{ label: FAILURE_HINT.zh.ok, primary: true }] }]);
  });

  it('finds those words in an error that wraps the provider\'s', async () => {
    const shown = await bubbleAfter(new Error('request failed', { cause: new Error(`400 body names reasoning_text while ${SYNTHETIC_REASONING_OFF}`) }));
    expect(shown[0]!.text).toBe(FAILURE_HINT.zh.reasoningReplay(5));
  });

  it('says a failure with no status (no connection) by its reason alone, with only an OK button (upstream #438)', async () => {
    const shown = await bubbleAfter(new Error('getaddrinfo ENOTFOUND api.example'));
    expect(shown).toEqual([{ text: FAILURE_HINT.zh.text(5, 0, 'getaddrinfo ENOTFOUND api.example', ''), options: [{ label: FAILURE_HINT.zh.ok, primary: true }] }]);
  });
});
