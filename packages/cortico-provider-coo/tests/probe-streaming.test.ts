/**
 * Cortico 0.2.9 (upstream Coopanion #452): the connection test (测试连接, `ProviderSettings.probeClient`) and every
 * main-loop request pass `onEvent`, so they stream. Cortico's own tests cover its Responses and Chat clients; this
 * runs the probe through this provider's clients, each of which decides streaming by `onEvent` itself, against local
 * services that refuse a non-streaming request. (The ChatGPT client always streams: `chatgpt.test.ts`.)
 * In the app, a connection to a local address is always the Responses protocol (`protocolOf`), so the Anthropic and
 * Gemini wire can only be tried this way.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import type { CoreConfig, ModelSpec } from 'cortico/core/types.ts';
import type { ResponseClient } from 'cortico/core/generation.ts';
import { ProviderSettings } from 'cortico/providers/webui/settings.ts';
import { VendorResponses } from '../src/responses.ts';
import { ClaudeProvider } from '../src/anthropic/client.ts';
import { GeminiProvider } from '../src/gemini/client.ts';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

interface Seen { url: string; body: Record<string, unknown> }

/** A local service that answers a streaming request with `events` as SSE and refuses any other with a 400. */
async function service(streaming: (url: string, body: Record<string, unknown>) => boolean, events: unknown[]): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    seen.push({ url: req.url ?? '', body });
    if (!streaming(req.url ?? '', body)) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Only streaming requests are accepted' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const e of events) {
      const type = (e as { type?: string }).type;
      res.write(`${type ? `event: ${type}\n` : ''}data: ${JSON.stringify(e)}\n\n`);
    }
    res.end();
  });
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, seen };
}

const probe = (client: ResponseClient, model: string) =>
  new ProviderSettings({ providers: {} } as unknown as CoreConfig, null as never, '', '', [])
    .probeClient(client, { model, maxTokens: 8192 } as ModelSpec, 'zh');

it('Responses (DeepSeek and the other OpenAI-compatible services): the probe streams', async () => {
  const message = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'pong', annotations: [] }] };
  const base = { id: 'resp_1', object: 'response', created_at: 1, model: 'deepseek-flash' };
  const events = [
    { type: 'response.created', response: { ...base, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', output_index: 0, item_id: 'msg_1', content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', output_index: 0, item_id: 'msg_1', content_index: 0, delta: 'pong' },
    { type: 'response.output_text.done', output_index: 0, item_id: 'msg_1', content_index: 0, text: 'pong' },
    { type: 'response.content_part.done', output_index: 0, item_id: 'msg_1', content_index: 0, part: { type: 'output_text', text: 'pong', annotations: [] } },
    { type: 'response.output_item.done', output_index: 0, item: message },
    { type: 'response.completed', response: { ...base, status: 'completed', output: [message], usage: { input_tokens: 7, output_tokens: 1, total_tokens: 8 } } },
  ].map((e, i) => ({ ...e, sequence_number: i }));
  const { url, seen } = await service((_url, body) => body.stream === true, events);
  const out = await probe(new VendorResponses({ baseUrl: `${url}/v1`, apiKey: 'k' }, () => undefined), 'deepseek-flash');
  expect(out).toMatchObject({ ok: true, usage: { input: 7, output: 1 } });
  expect(seen).toHaveLength(1);
  expect(seen[0]!.body.stream).toBe(true);
});

it('Anthropic (Messages API): the probe streams', async () => {
  const events = [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, usage: { input_tokens: 9, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'pong' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ];
  const { url, seen } = await service((_url, body) => body.stream === true, events);
  const out = await probe(new ClaudeProvider({ baseUrl: url, apiKey: 'k' }), 'claude-haiku-5-5');
  expect(out).toMatchObject({ ok: true, usage: { input: 9, output: 2 } });
  expect(seen).toHaveLength(1);
  expect(seen[0]!.body.stream).toBe(true);
});

it('Gemini: the probe uses streamGenerateContent', async () => {
  const events = [
    { candidates: [{ content: { role: 'model', parts: [{ text: 'po' }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'ng' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3, totalTokenCount: 14 } },
  ];
  const { url, seen } = await service((path) => path.includes(':streamGenerateContent?alt=sse'), events);
  const out = await probe(new GeminiProvider({ baseUrl: url, apiKey: 'k' }), 'gemini-3-flash');
  expect(out).toMatchObject({ ok: true, usage: { input: 11, output: 3 } });
  expect(seen).toHaveLength(1);
  expect(seen[0]!.url).toBe('/models/gemini-3-flash:streamGenerateContent?alt=sse');
});
