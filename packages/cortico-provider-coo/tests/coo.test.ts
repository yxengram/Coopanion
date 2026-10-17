import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dryMountProvider } from 'cortico/extensions/dry-mount.ts';
import { priceUsage, unknownMeters } from 'cortico/core/generation.ts';
import { snapshotPrice } from 'cortico/providers/pricebook.ts';
import { nullLogger } from 'cortico/core/util.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { functionCall, functionResult, message } from 'cortico/protocol/open-responses/context.ts';
import { RESERVED_FRAME_NAMES } from 'cortico/core/loop.ts';
import { blobLine } from 'cortico/core/blobs.ts';
import COO, { OFF_PEAK, VENDORS, VENDOR_ICONS, protocolOf, vendorEntry, vendorOf } from '../src/index.ts';
import { connectVendor, saveVendorKey, testEndpoint, type ConsoleCall } from '../src/connect.ts';

const entry = (patch: Partial<LLMProviderEntry> = {}): LLMProviderEntry => ({
  kind: 'coo', baseUrl: 'https://api.deepseek.com', secret: 'KEY',
  spec: { model: 'deepseek-flash', thinking: true, reasoningEffort: 'high' }, multimodal: true, ...patch,
});
const AT = { startedAt: '2026-10-09T12:00:00.000Z', requestedServiceTier: null };
const host = (secret = 'sk-test') => ({
  stateDir: mkdtempSync(join(tmpdir(), 'ds-')), secret: () => secret, readBlob: () => null,
  keepThinking: () => true, log: nullLogger(),
});

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

async function stub(): Promise<{ url: string; seen: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> }> {
  const seen: Array<{ path: string; auth: string | undefined; body: Record<string, unknown> }> = [];
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    seen.push({ path: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(raw) as Record<string, unknown> });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      id: 'resp_1', object: 'response', model: 'deepseek-flash', status: 'completed', created_at: 1,
      output: [{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '你好', annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 4 }, output_tokens_details: { reasoning_tokens: 0 } },
    }));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`, seen };
}

describe('Coo Pet Provider', () => {
  it('passes the provider dry mount', () => {
    const report = dryMountProvider(COO, { scratchDir: mkdtempSync(join(tmpdir(), 'ds-dry-')) });
    expect(report.failures).toEqual([]);
  });

  it('posts to /responses with the key, keeps effort none for no thinking, and asks no encrypted reasoning back', async () => {
    const { url, seen } = await stub();
    const instance = COO.create('deepseek', entry({ baseUrl: url }), host() as never);
    const request = { model: 'deepseek-flash', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '在吗' }] }], reasoning: { effort: 'none' } } as unknown as Request;
    const out = await instance.client.respond(request, {});
    expect(out.response.output[0]).toMatchObject({ type: 'message' });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('/responses');
    expect(seen[0].auth).toBe('Bearer sk-test');
    expect(seen[0].body).toMatchObject({ model: 'deepseek-flash', store: false, reasoning: { effort: 'none' } });
    expect(seen[0].body.include).toBeUndefined();
  });

  it('charges double inside the peak windows (UTC 01–04 and 06–10 on workdays)', () => {
    const [flash] = COO.prices(entry(), {} as Request, AT);
    const meters = { ...unknownMeters(), input: 1_000_000, uncachedInput: 1_000_000, cachedInput: 0, output: 0, total: 1_000_000, reasoning: 0 };
    const cost = (at: string) => priceUsage(meters, [snapshotPrice(flash, { startedAt: at, requestedServiceTier: null })])[0].amount;
    expect(cost('2026-09-22T02:30:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput * 2, 6); // Tuesday, peak
    expect(cost('2026-09-22T12:00:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput, 6); // Tuesday, off-peak
    expect(cost('2026-09-26T02:30:00.000Z')).toBeCloseTo(OFF_PEAK['deepseek-flash'].uncachedInput, 6); // Saturday
  });

  it('accepts images only for a multimodal endpoint on a model that reads them', () => {
    const spec = (model: string) => ({ model, thinking: true });
    expect(COO.accepts!(entry(), spec('deepseek-flash'), 'image/jpeg')).toBe(true);
    expect(COO.accepts!(entry(), spec('deepseek-v4-pro'), 'image/jpeg')).toBe(false);
    expect(COO.accepts!(entry({ multimodal: false }), spec('deepseek-flash'), 'image/png')).toBe(false);
  });

  it('sends each service the thinking level it takes, or none where it documents none', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reply = { id: 'r', object: 'response', model: 'm', status: 'completed', created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    try {
      const send = async (id: string, effort: string, model?: string) => {
        const v = VENDORS.find((x) => x.id === id)!;
        const instance = COO.create(id, entry({ baseUrl: v.baseUrl, spec: { model: model ?? v.model, thinking: true } }), host() as never);
        await instance.client.respond({ model: model ?? v.model, input: [], reasoning: { effort } } as unknown as Request, {});
        return bodies.at(-1)!.reasoning;
      };
      expect(await send('deepseek', 'max')).toEqual({ effort: 'max' });
      expect(await send('qwen', 'high')).toEqual({ effort: 'medium' });
      expect(await send('qwen', 'none')).toEqual({ effort: 'none' });
      expect(await send('kimi', 'none')).toEqual({ effort: 'low' });
      expect(await send('stepfun', 'max')).toEqual({ effort: 'high' });
      expect(await send('qianfan', 'high')).toBeUndefined();
      expect(await send('openai', 'none')).toEqual({ effort: 'none' });
      expect(await send('openai', 'none', 'gpt-6-astra')).toEqual({ effort: 'low' });
      expect(await send('xai', 'none')).toEqual({ effort: 'none' });
      expect(await send('xai', 'max')).toEqual({ effort: 'xhigh' });
      expect(await send('xai', 'none', 'grok-4.7')).toEqual({ effort: 'low' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends images only from the newest delivered batch on; earlier ones keep their text line', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reply = { id: 'r', object: 'response', model: 'm', status: 'completed', created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const instance = COO.create('deepseek', entry(), { ...host(), readBlob: () => Buffer.from('jpeg') } as never);
    const [frame] = RESERVED_FRAME_NAMES;
    const shot = (handle: string) => ({ handle, mime: 'image/jpeg', name: 'screen.jpg', fallbackText: '屏幕截图' });
    const shotResult = (callId: string, handle: string) => functionResult(callId, blobLine(shot(handle)), { blobs: [shot(handle)] });
    const context = [
      message('user', '开始'),
      functionCall('f1', frame!, '{}'), functionResult('f1', '[打字] 看看屏幕'),
      functionCall('c1', 'look', '{}'), shotResult('c1', 'blob:a.jpg'),
      functionCall('f2', frame!, '{}'), functionResult('f2', '[打字] 再看看'),
      functionCall('c2', 'look', '{}'), shotResult('c2', 'blob:b.jpg'),
    ];
    try {
      await instance.client.respond({ model: 'deepseek-flash', input: context.map((r) => r.item) } as unknown as Request, { context });
    } finally {
      vi.unstubAllGlobals();
    }
    const outputs = (bodies[0].input as Array<{ type: string; call_id?: string; output?: unknown }>)
      .filter((i) => i.type === 'function_call_output' && (i.call_id === 'c1' || i.call_id === 'c2'));
    expect(outputs[0].output).toBe(blobLine(shot('blob:a.jpg')));
    expect(outputs[1].output).toContainEqual(expect.objectContaining({ type: 'input_image' }));
  });

  it('prices the default model of DeepSeek, OpenAI, Anthropic, Gemini and xAI, and no other service', () => {
    for (const v of VENDORS) {
      const quotes = COO.prices(entry({ baseUrl: v.baseUrl }), { model: v.model } as Request, AT);
      expect(quotes.some((q) => q.models.includes(v.model)), v.id).toBe(['deepseek', 'openai', 'anthropic', 'gemini', 'xai'].includes(v.id));
    }
  });

  it('asks OpenAI and xAI for their signed reasoning back (encrypted replay); DeepSeek replays plain text', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const reply = { id: 'r', object: 'response', model: 'm', status: 'completed', created_at: 1, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    try {
      for (const id of ['openai', 'xai', 'deepseek']) {
        const v = VENDORS.find((x) => x.id === id)!;
        const instance = COO.create(id, entry({ baseUrl: v.baseUrl, spec: { model: v.model, thinking: true } }), host() as never);
        await instance.client.respond({ model: v.model, input: [], reasoning: { effort: 'high' } } as unknown as Request, {});
        const include = bodies.at(-1)!.include as string[] | undefined;
        expect(include?.includes('reasoning.encrypted_content') ?? false, id).toBe(id !== 'deepseek');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends Gemini to generateContent with its key header and lists its models from /models', async () => {
    const seen: Array<{ url: string; key: string | undefined; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal('fetch', async (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      const headers = new Headers(init.headers);
      seen.push({ url: String(url), key: headers.get('x-goog-api-key') ?? undefined, body: init.body ? JSON.parse(init.body) as Record<string, unknown> : null });
      const out = String(url).includes(':generateContent')
        ? { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }
        : { models: [{ name: 'models/gemini-3.5-flash-lite', inputTokenLimit: 1_048_576, outputTokenLimit: 65_536 }] };
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const gemini = VENDORS.find((v) => v.id === 'gemini')!;
    try {
      const instance = COO.create('gemini', entry({ baseUrl: gemini.baseUrl, spec: { model: gemini.model, thinking: true } }), host() as never);
      const out = await instance.client.respond({ model: gemini.model, input: [] } as unknown as Request, { context: [message('user', '在吗')] });
      expect(out.response.output.find((item) => item.type === 'message')).toMatchObject({ content: [{ text: 'ok' }] });
      expect(await instance.listModels!()).toEqual([{ id: 'gemini-3.5-flash-lite', contextWindow: 1_048_576, maxOutputTokens: 65_536 }]);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen.map((s) => s.url.split('?')[0])).toEqual([`${gemini.baseUrl}/models/${gemini.model}:generateContent`, `${gemini.baseUrl}/models`]);
    expect(seen.map((s) => s.key)).toEqual(['sk-test', 'sk-test']);
    expect(seen[0]!.body).toMatchObject({ contents: [{ role: 'user', parts: [{ text: '在吗' }] }], generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } });
  });

  it('tells the service from the base URL, trailing slash or not, and nothing else', () => {
    for (const v of VENDORS) {
      expect(vendorOf(v.baseUrl)?.id).toBe(v.id);
      expect(vendorOf(`${v.baseUrl}/`)?.id).toBe(v.id);
      expect(VENDOR_ICONS[v.id], v.id).toMatch(/^<svg /);
      expect(vendorEntry(v)).toMatchObject({ kind: 'coo', baseUrl: v.baseUrl, secret: v.secret, spec: { model: v.model } });
    }
    expect(new Set(VENDORS.map((v) => v.id)).size).toBe(VENDORS.length);
    expect(VENDORS[0]!.id).toBe('deepseek');
    expect(vendorOf('https://api.openai.com/v1')?.id).toBe('openai');
    expect(vendorOf('https://generativelanguage.googleapis.com/v1beta')?.id).toBe('gemini');
    expect(vendorOf('https://api.x.ai/v1')?.id).toBe('xai');
    expect(vendorOf('https://api.anthropic.com')?.id).toBe('anthropic');
    // Zhipu's Responses endpoint is not under its chat path
    expect(vendorOf('https://open.bigmodel.cn/api/paas/v4')).toBeNull();
    expect(vendorOf('http://127.0.0.1:1234/v1')).toBeNull();
  });

  it("speaks the Gemini API only at Gemini's own base URL; its OpenAI-compatible path goes out as Responses", async () => {
    const gemini = VENDORS.find((v) => v.id === 'gemini')!;
    expect(protocolOf(gemini.baseUrl)).toBe('gemini');
    expect(protocolOf(`${gemini.baseUrl}/`)).toBe('gemini');
    expect(protocolOf(`${gemini.baseUrl}/openai`)).toBe('responses');
    expect(protocolOf('https://api.openai.com/v1')).toBe('responses');
    expect(protocolOf(undefined)).toBe('responses');
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(String(url));
      return new Response(JSON.stringify({
        id: 'resp_1', object: 'response', model: 'gemini-3.5-flash-lite', status: 'completed', created_at: 1,
        output: [{ type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    try {
      const instance = COO.create('g', entry({ baseUrl: `${gemini.baseUrl}/openai`, spec: { model: gemini.model, thinking: true } }), host() as never);
      await instance.client.respond({ model: gemini.model, input: [] } as unknown as Request, { context: [message('user', '在吗')] });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen).toEqual([`${gemini.baseUrl}/openai/responses`]);
  });

  it('keeps the keys of OpenAI, Anthropic, Gemini and xAI under names a shell environment does not already set', () => {
    // Cortico reads the process environment before an endpoint's .env, so OPENAI_API_KEY in the shell would win
    for (const id of ['openai', 'anthropic', 'gemini', 'xai']) expect(VENDORS.find((v) => v.id === id)!.secret).toBe(`COO_${id.toUpperCase()}_API_KEY`);
    expect(new Set(VENDORS.map((v) => v.secret)).size).toBe(VENDORS.length);
  });
});

describe('connecting a service through the console routes', () => {
  /** A console that knows the endpoints in `existing`, records every call, and tests with `testOk`. */
  function fakeConsole(existing: string[], testOk: boolean) {
    const calls: Array<[string, unknown]> = [];
    const call = (async (path: string, body?: unknown) => {
      calls.push([path, body]);
      if (path === '/api/providers' && body === undefined) return { providers: existing.map((name) => ({ name })) };
      if (path.endsWith('/test')) return testOk ? { ok: true, elapsedMs: 42 } : { ok: false, hint: '密钥无效' };
      if (body === undefined) return { name: path.split('/').pop(), entry: { kind: 'coo', spec: { model: 'mine' } }, revision: 'r1' };
      return {};
    }) as ConsoleCall;
    return { call, calls };
  }
  const qwen = VENDORS.find((v) => v.id === 'qwen')!;

  it('creates the endpoint the first time, tests it, makes it active and resumes', async () => {
    const { call, calls } = fakeConsole(['deepseek'], true);
    expect(await connectVendor(call, qwen, 'sk-1')).toEqual({ ok: true, ms: 42, why: null });
    expect(calls.map(([p]) => p)).toEqual(['/api/providers', '/api/providers', '/api/providers/qwen/test', '/api/providers/qwen/activate', '/api/run/resume']);
    expect(calls[1]![1]).toEqual({ name: 'qwen', entry: vendorEntry(qwen), secretValue: 'sk-1' });
  });

  it("keeps an existing endpoint's own settings and only replaces its key", async () => {
    const { call, calls } = fakeConsole(['qwen'], true);
    await connectVendor(call, qwen, 'sk-2');
    expect(calls[2]).toEqual(['/api/providers/qwen/save', { name: 'qwen', entry: { kind: 'coo', spec: { model: 'mine' } }, expectedRevision: 'r1', secretValue: 'sk-2' }]);
  });

  it('sets the model typed in, keeps the saved key when none is typed, and starts a new endpoint on it', async () => {
    const saved = fakeConsole(['qwen'], true);
    await connectVendor(saved.call, qwen, '', 'qwen3.8-plus');
    expect(saved.calls[2]).toEqual(['/api/providers/qwen/save', {
      name: 'qwen', entry: { kind: 'coo', spec: { model: 'qwen3.8-plus' }, multimodal: false }, expectedRevision: 'r1', secretValue: undefined,
    }]);
    const fresh = fakeConsole([], true);
    await connectVendor(fresh.call, qwen, 'sk-3', 'qwen3.8-flash');
    expect(fresh.calls[1]![1]).toEqual({ name: 'qwen', entry: vendorEntry(qwen, 'qwen3.8-flash'), secretValue: 'sk-3' });
  });

  it('does not switch to an endpoint whose test fails', async () => {
    const { call, calls } = fakeConsole([], false);
    expect(await connectVendor(call, qwen, 'bad')).toEqual({ ok: false, ms: null, why: '密钥无效' });
    expect(calls.some(([p]) => p.endsWith('/activate') || p === '/api/run/resume')).toBe(false);
  });

  it("reads Gemini's 400 to the test as a likely wrong key, and leaves other services' 400 as the console said", async () => {
    const reply = (status: number) => (async () => ({ ok: false, status, error: `LLM API ${status}` })) as ConsoleCall;
    expect((await testEndpoint(reply(400), 'gemini')).why).toMatch(/Key 不对/);
    expect((await testEndpoint(reply(400), 'qwen')).why).toBe('LLM API 400');
    expect((await testEndpoint(reply(500), 'gemini')).why).toBe('LLM API 500');
  });

  it('saves a key for another use without activating anything (the pet\'s decider key)', async () => {
    const or = VENDORS.find((v) => v.id === 'openrouter')!;
    const fresh = fakeConsole(['deepseek'], true);
    expect(await saveVendorKey(fresh.call, or, ' sk-or-1 ')).toEqual({ ok: true, why: null });
    expect(fresh.calls).toEqual([['/api/providers', undefined], ['/api/providers', { name: 'openrouter', entry: vendorEntry(or), secretValue: 'sk-or-1' }]]);
    const existing = fakeConsole(['openrouter'], true);
    await saveVendorKey(existing.call, or, 'sk-or-2');
    expect(existing.calls.map(([p]) => p)).toEqual(['/api/providers', '/api/providers/openrouter', '/api/providers/openrouter/save']);
    expect(existing.calls[2]![1]).toMatchObject({ entry: { kind: 'coo', spec: { model: 'mine' } }, secretValue: 'sk-or-2' });
    expect(await saveVendorKey(existing.call, or, '  ')).toEqual({ ok: false, why: '密钥是空的' });
  });
});
