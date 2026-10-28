/**
 * Upstream Coopanion v0.2.11 (#408, Cortico fa57ab1): a Responses service echoes the request's `instructions`
 * and `tools` inside `response.created` / `in_progress` / `completed`, so the size of those events follows the
 * input, not the output. Cortico up to ace4c64 capped an SSE line or event at `max_output_tokens × 12 × 2`
 * characters, 196 608 with the 8192 the fork seeds (`core/seed.ts`); a bigger echo failed with
 * `SSE line longer than 196608 characters`, was retried three times with backoff, and the bubble showed the
 * failure. The decoder now has no line or event cap; the runaway-output guard (decoded output characters) stays.
 *
 * Checked through the fork's own Responses client (`VendorResponses`, which every Responses vendor and the
 * ChatGPT plan go through) against a local SSE server.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { VendorResponses } from '../packages/cortico-provider-coo/src/responses.ts';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

/** A Responses SSE server whose `response.created` and `response.completed` echo `instructions` of `echo` characters. */
async function echoServer(echo: number): Promise<{ baseUrl: string; hits: () => number }> {
  let hits = 0;
  const instructions = 'x'.repeat(echo);
  const message = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'hi', annotations: [] }] };
  const base = { id: 'resp_1', object: 'response', created_at: 1, model: 'deepseek-flash', instructions, tools: [] };
  const events: Array<Record<string, unknown>> = [
    { type: 'response.created', response: { ...base, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', output_index: 0, item_id: 'msg_1', content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', output_index: 0, item_id: 'msg_1', content_index: 0, delta: 'hi' },
    { type: 'response.output_text.done', output_index: 0, item_id: 'msg_1', content_index: 0, text: 'hi' },
    { type: 'response.content_part.done', output_index: 0, item_id: 'msg_1', content_index: 0, part: { type: 'output_text', text: 'hi', annotations: [] } },
    { type: 'response.output_item.done', output_index: 0, item: message },
    {
      type: 'response.completed',
      response: { ...base, status: 'completed', output: [message], usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 } },
    },
  ];
  server = createServer((req, res) => {
    hits++;
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      // Cortico rejects an event without a sequence number ("Non-increasing event sequence")
      for (const [i, e] of events.entries()) res.write(`event: ${e.type}\ndata: ${JSON.stringify({ ...e, sequence_number: i })}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/v1`, hits: () => hits };
}

it('a 300 KB instructions echo in response.created completes on the first request', async () => {
  const { baseUrl, hits } = await echoServer(300_000);
  const events: string[] = [];
  const out = await new VendorResponses({ baseUrl, apiKey: 'k' }, () => undefined).respond(
    { model: 'deepseek-flash', input: [], max_output_tokens: 8192 },
    { onEvent: (e) => { events.push((e as { type: string }).type); } },
  );
  expect(out.response.status).toBe('completed');
  expect(hits()).toBe(1);
  expect(events).toContain('response.output_text.delta');
});

it('a small output maximum no longer shrinks the room for the echo', async () => {
  // below about 1 130 output tokens the old cap fell under the fork's own 27 KB first-request echo
  const { baseUrl, hits } = await echoServer(30_000);
  const out = await new VendorResponses({ baseUrl, apiKey: 'k' }, () => undefined).respond(
    { model: 'deepseek-flash', input: [], max_output_tokens: 1000 },
    { onEvent: () => {} },
  );
  expect(out.response.status).toBe('completed');
  expect(hits()).toBe(1);
});
