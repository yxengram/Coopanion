import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nullLogger } from 'cortico/core/util.ts';
import { GenerationError } from 'cortico/core/generation.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import type { Request, StreamEvent } from 'cortico/protocol/open-responses/index.ts';
import { message } from 'cortico/protocol/open-responses/context.ts';
import COO, { VENDORS, VENDOR_ICONS, protocolOf, vendorEntry, vendorOf } from '../src/index.ts';
import { ClaudeProvider } from '../src/anthropic/client.ts';
import { THINKING_BINDING_BETA, claudeRequest, thinkingParams } from '../src/anthropic/wire.ts';

const anthropic = VENDORS.find((v) => v.id === 'anthropic')!;
const host = (secret = 'sk-ant-test') => ({
  stateDir: mkdtempSync(join(tmpdir(), 'coo-claude-')), secret: () => secret, readBlob: () => null,
  keepThinking: () => true, log: nullLogger(),
});
const entry = (patch: Partial<LLMProviderEntry> = {}): LLMProviderEntry => ({
  ...(vendorEntry(anthropic) as unknown as LLMProviderEntry), ...patch,
});

/** A unary Messages API reply. */
const reply = (content: unknown[] = [{ type: 'text', text: 'ok' }], stop = 'end_turn') => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: anthropic.model, content, stop_reason: stop, stop_sequence: null,
  usage: { input_tokens: 5, cache_creation_input_tokens: 20, cache_read_input_tokens: 75, output_tokens: 3 },
});

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; vi.unstubAllGlobals(); });

type Seen = { path: string; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };
/** A local Messages API: `answers` are served in order, the last one repeats. */
async function fake(answers: Array<{ status: number; body?: unknown; headers?: Record<string, string>; sse?: unknown[] }>): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    seen.push({ path: req.url ?? '', headers: req.headers, body: JSON.parse(raw) as Record<string, unknown> });
    const a = answers[Math.min(seen.length - 1, answers.length - 1)]!;
    if (a.sse) {
      res.writeHead(a.status, { 'content-type': 'text/event-stream', 'request-id': `req_${seen.length}`, ...a.headers });
      for (const event of a.sse) res.write(`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
      return;
    }
    res.writeHead(a.status, { 'content-type': 'application/json', 'request-id': `req_${seen.length}`, ...a.headers }).end(JSON.stringify(a.body ?? {}));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return { url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`, seen };
}

const ask = (model = anthropic.model, effort = 'high'): Request => ({ model, input: [], reasoning: { effort } } as unknown as Request);

describe('Anthropic vendor', () => {
  it('is listed with its own protocol, the COO_ key name, a letter tile and Haiku as the cheap vision default', () => {
    expect(anthropic).toMatchObject({
      baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', secret: 'COO_ANTHROPIC_API_KEY', model: 'claude-haiku-5-5',
    });
    expect(anthropic.vision).toContain(anthropic.model);
    expect(vendorOf('https://api.anthropic.com/')?.id).toBe('anthropic');
    expect(protocolOf('https://api.anthropic.com')).toBe('anthropic');
    // a proxy path under it is Anthropic for prices, but not sent as the Messages API by itself
    expect(protocolOf('https://api.anthropic.com/proxy')).toBe('responses');
    expect(VENDOR_ICONS.anthropic).toMatch(/<rect [^>]*stroke="currentColor"/);
    expect(VENDOR_ICONS.anthropic).toMatch(/>A<\/text><\/svg>$/);
    expect(VENDOR_ICONS.anthropic).not.toMatch(/<path/);
  });

  it('posts to /v1/messages through the SDK with x-api-key, the binding beta, both cache breakpoints and the effort', async () => {
    const seen: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', async (url: string | URL, init: RequestInit) => {
      seen.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return new Response(JSON.stringify(reply()), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_x' } });
    });
    const instance = COO.create('anthropic', entry(), host() as never);
    const context = [message('system', '你是 Coo'), message('user', '在吗')];
    const out = await instance.client.respond({ ...ask(anthropic.model, 'max'), instructions: '说中文' } as Request,
      { context, nativeSpec: { model: anthropic.model, thinking: true, reasoningEffort: 'max', maxTokens: 8192 } });
    expect(out.response.output.find((i) => i.type === 'message')).toMatchObject({ content: [{ text: 'ok' }] });
    expect(out.attempts).toHaveLength(1);
    expect(out.attempts[0]).toMatchObject({ outcome: 'completed', status: 200, requestId: 'req_x', meters: { input: 100, cachedInput: 75, uncachedInput: 25, output: 3 } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url.split('?')[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(seen[0]!.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(seen[0]!.headers.get('authorization')).toBeNull();
    expect(seen[0]!.headers.get('anthropic-beta')).toContain(THINKING_BINDING_BETA);
    expect(seen[0]!.body).toMatchObject({
      model: 'claude-haiku-5-5', max_tokens: 8192, cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: '说中文\n\n你是 Coo', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: '在吗' }] }],
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'max' },
    });
    expect(seen[0]!.body.temperature).toBeUndefined();
    expect(seen[0]!.body.betas).toBeUndefined();
    expect(instance.compatibilityKey!()).toEqual(['anthropic', 'anthropic', 'anthropic']);
  });

  it('charges fresh input, cache writes, cache reads and output at their own rates, and the long-prompt card past 100K', () => {
    const quotes = COO.prices(entry(), ask(), { startedAt: '2026-10-09T12:00:00.000Z', requestedServiceTier: null });
    const haiku = quotes.find((q) => q.models.includes('claude-haiku-5-5'))!;
    expect(haiku.rules.map((r) => [r.meter, r.perMillion])).toEqual([
      ['detail:fresh_input', 0.10], ['detail:cache_write', 0.125], ['cachedInput', 0.01], ['output', 0.50],
    ]);
    expect(haiku.inputBands?.[0]?.from).toBe(100_001);
    for (const m of anthropic.vision!) expect(quotes.some((q) => q.models.includes(m)), m).toBe(true);
  });

  it('lists models from GET /v1/models with the windows the API states', async () => {
    vi.stubGlobal('fetch', async (url: string | URL) => {
      expect(String(url).split('?')[0]).toBe('https://api.anthropic.com/v1/models');
      return new Response(JSON.stringify({
        data: [{ type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z', max_input_tokens: 400_000, max_tokens: 64_000 }],
        has_more: false, first_id: 'claude-haiku-5-5', last_id: 'claude-haiku-5-5',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const instance = COO.create('anthropic', entry(), host() as never);
    expect(await instance.listModels!()).toEqual([{ id: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5', contextWindow: 400_000, maxOutputTokens: 64_000 }]);
    expect(instance.contextWindow!('claude-haiku-5-5')).toBe(400_000);
  });

  it("reads the Messages API's `prompt is too long` as a context overflow", () => {
    const err = (body: string) => ({ status: 400, body }) as never;
    expect(COO.contextOverflow!(err('{"type":"invalid_request_error","message":"prompt is too long: 210000 tokens > 200000 maximum"}'))).toBe(true);
    expect(COO.contextOverflow!(err('{"message":"max_tokens: must be positive"}'))).toBe(false);
  });
});

describe('thinkingParams', () => {
  it('sends adaptive thinking with the binding beta and the effort when on', () => {
    expect(thinkingParams({ model: 'claude-haiku-5-5', thinking: true, reasoningEffort: 'low' })).toEqual({
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } }, effort: 'low', betas: [THINKING_BINDING_BETA],
    });
  });

  it('turns thinking off the way each model accepts', () => {
    // Haiku takes `disabled`, and an effort only below xhigh
    expect(thinkingParams({ model: 'claude-haiku-5-5', thinking: false, reasoningEffort: 'high' })).toEqual({ thinking: { type: 'disabled' }, effort: 'high', betas: [] });
    expect(thinkingParams({ model: 'claude-haiku-5-5', thinking: false, reasoningEffort: 'max' })).toEqual({ thinking: { type: 'disabled' }, betas: [] });
    // Sonnet 5.5 thinks only between tool calls
    expect(thinkingParams({ model: 'claude-sonnet-5-5', thinking: false })).toEqual({ thinking: { type: 'between_tools' }, betas: [] });
    // Opus 5.5 always thinks: off is the lowest effort
    expect(thinkingParams({ model: 'claude-opus-5-5', thinking: false })).toMatchObject({ thinking: { type: 'adaptive' }, effort: 'low', betas: [THINKING_BINDING_BETA] });
  });

  it('maps the four app levels from the request: none is thinking off, the rest pass through as effort', () => {
    const none = claudeRequest(ask('claude-haiku-5-5', 'none'), { context: [message('user', 'hi')] });
    expect(none.params.thinking).toEqual({ type: 'disabled' });
    expect(none.params.output_config).toBeUndefined();
    expect(none.betas).toEqual([]);
    for (const level of ['low', 'high', 'max']) {
      const on = claudeRequest(ask('claude-haiku-5-5', level), { context: [message('user', 'hi')] });
      expect(on.params.output_config, level).toEqual({ effort: level });
      expect(on.params.thinking?.type, level).toBe('adaptive');
    }
  });

  it('downgrades a forced tool choice on models that reject one, and keeps tools eager when streaming', () => {
    const tools = [{ type: 'function', name: 'say', description: 'speak', parameters: { type: 'object', properties: {} } }];
    const req = (model: string) => ({ ...ask(model), tools, tool_choice: 'required' } as unknown as Request);
    expect(claudeRequest(req('claude-haiku-5-5'), { context: [message('user', 'hi')] }).params.tool_choice).toEqual({ type: 'any' });
    expect(claudeRequest(req('claude-opus-5-5'), { context: [message('user', 'hi')] }).params.tool_choice).toEqual({ type: 'auto' });
    const streamed = claudeRequest(req('claude-haiku-5-5'), { context: [message('user', 'hi')], onEvent: () => {} });
    expect(streamed.params.tools).toEqual([{ name: 'say', description: 'speak', input_schema: { type: 'object', properties: {} }, eager_input_streaming: true }]);
  });
});

describe('ClaudeProvider errors and retries', () => {
  it('fails with 401 before sending anything when the endpoint has no key', async () => {
    const { url, seen } = await fake([{ status: 200, body: reply() }]);
    const client = new ClaudeProvider({ baseUrl: url });
    const err = await client.respond(ask(), { context: [message('user', 'hi')] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('retries a 429 after its Retry-After and records one attempt per request', async () => {
    const { url, seen } = await fake([
      { status: 429, headers: { 'retry-after': '0' }, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } },
      { status: 200, body: reply() },
    ]);
    const out = await new ClaudeProvider({ baseUrl: url, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')] });
    expect(seen).toHaveLength(2);
    expect(out.attempts.map((a) => [a.ordinal, a.status, a.outcome])).toEqual([[0, 429, 'failed'], [1, 200, 'completed']]);
    expect(out.attempts[0]!.requestId).toBe('req_1');
  });

  it('retries an overloaded 529 too', async () => {
    const { url, seen } = await fake([
      { status: 529, headers: { 'retry-after': '0' }, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } },
      { status: 200, body: reply() },
    ]);
    const out = await new ClaudeProvider({ baseUrl: url, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')] });
    expect(seen).toHaveLength(2);
    expect(out.response.status).toBe('completed');
  });

  it('does not retry a 400, and carries the status, body and request id in the error', async () => {
    const { url, seen } = await fake([{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad model' } } }]);
    const err = await new ClaudeProvider({ baseUrl: url, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')] }).catch((e: unknown) => e) as GenerationError;
    expect(err).toBeInstanceOf(GenerationError);
    expect(seen).toHaveLength(1);
    expect(err.status).toBe(400);
    expect(err.body).toContain('bad model');
    expect(err.message).toContain('[req=req_1]');
    expect(err.attempts).toHaveLength(1);
  });

  it('ends a refusal incomplete as a content filter, without retrying it', async () => {
    const { url, seen } = await fake([{ status: 200, body: reply([{ type: 'text', text: '' }], 'refusal') }]);
    const out = await new ClaudeProvider({ baseUrl: url, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')] });
    expect(out.response).toMatchObject({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } });
    expect(seen).toHaveLength(1);
  });

  it('does not retry an answered request that stopped for an unknown reason (it would be billed again)', async () => {
    const { url, seen } = await fake([{ status: 200, body: reply([{ type: 'text', text: '' }], 'some_new_reason') }]);
    const err = await new ClaudeProvider({ baseUrl: url, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')] }).catch((e: unknown) => e) as GenerationError;
    expect(err).toBeInstanceOf(GenerationError);
    expect(seen).toHaveLength(1);
    expect(err.attempts.map((a) => [a.status, a.outcome])).toEqual([[200, 'failed']]);
  });
});

describe('ClaudeProvider and the shell environment', () => {
  const NAMES = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'] as const;
  let saved: Record<string, string | undefined> = {};
  beforeEach(() => { saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]])); });
  afterEach(() => {
    for (const n of NAMES) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
  });

  it("sends only the endpoint's key: no shell ANTHROPIC_AUTH_TOKEN, ANTHROPIC_CUSTOM_HEADERS or ANTHROPIC_API_KEY", async () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'shell-token';
    process.env.ANTHROPIC_CUSTOM_HEADERS = 'X-Leak: yes\nx-api-key: shell-key';
    process.env.ANTHROPIC_API_KEY = 'shell-api-key';
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
    const { url, seen } = await fake([{ status: 200, body: reply() }]);
    const out = await new ClaudeProvider({ baseUrl: url, apiKey: 'sk-ant-endpoint' }).respond(ask(), { context: [message('user', 'hi')] });
    expect(out.response.status).toBe('completed');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers['x-api-key']).toBe('sk-ant-endpoint');
    expect(seen[0]!.headers.authorization).toBeUndefined();
    expect(seen[0]!.headers['x-leak']).toBeUndefined();
    // the variable is back for anything else in the process
    expect(process.env.ANTHROPIC_CUSTOM_HEADERS).toBe('X-Leak: yes\nx-api-key: shell-key');
  });

  it('takes a base URL ending in /v1 as the API root', async () => {
    expect(protocolOf('https://api.anthropic.com/v1')).toBe('anthropic');
    expect(protocolOf('https://api.anthropic.com/v1/')).toBe('anthropic');
    expect(protocolOf('https://api.anthropic.com/v1/proxy')).toBe('responses');
    const { url, seen } = await fake([{ status: 200, body: reply() }]);
    await new ClaudeProvider({ baseUrl: `${url}/v1/`, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')] });
    expect(seen[0]!.path).toMatch(/^\/v1\/messages(\?|$)/);
  });
});

describe('ClaudeProvider streaming', () => {
  it('streams text and a tool call through the SDK as Open Responses events, signed thinking kept', async () => {
    const sse = [
      { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: anthropic.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '想想' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '好' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'say', input: {} } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"text":"hi"}' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 12 } },
      { type: 'message_stop' },
    ];
    const { url, seen } = await fake([{ status: 200, sse }]);
    const events: StreamEvent[] = [];
    const out = await new ClaudeProvider({ baseUrl: url, apiKey: 'k' }).respond(ask(), { context: [message('user', 'hi')], onEvent: (e) => events.push(e) });
    expect(seen[0]!.body.stream).toBe(true);
    expect(out.response.status).toBe('completed');
    expect(out.response.output.map((i) => i.type)).toEqual(['reasoning', 'message', 'function_call']);
    expect(out.response.output[0]).toMatchObject({ encrypted_content: 'SIG' });
    expect(out.response.output[2]).toMatchObject({ call_id: 'toolu_1', name: 'say', arguments: '{"text":"hi"}', status: 'completed' });
    expect(out.attempts[0]!.meters).toMatchObject({ input: 10, output: 12, reasoning: null });
    expect(events.some((e) => e.type === 'response.output_text.delta')).toBe(true);
  });
});
