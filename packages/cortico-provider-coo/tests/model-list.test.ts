import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type RequestListener, type Server } from 'node:http';
import { nullLogger } from 'cortico/core/util.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import COO from '../src/index.ts';
import { ClaudeProvider } from '../src/anthropic/client.ts';
import { MODEL_PAGES_MAX, listGeminiModels } from '../src/gemini/client.ts';

const servers: Server[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const server of servers.splice(0)) server.close(); });

/** A local service on a free port; resolves to its origin. */
function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
}

describe('model lists', () => {
  it('Gemini stops at a page token it has seen, and after the page limit when every token is new', async () => {
    let repeats = 0;
    const repeating = await serve((_req, res) => { repeats++; res.end(JSON.stringify({ models: [{ name: 'models/a' }], nextPageToken: 'same' })); });
    expect(await listGeminiModels(repeating, 'key')).toHaveLength(2);
    expect(repeats).toBe(2);
    let pages = 0;
    const endless = await serve((_req, res) => { pages++; res.end(JSON.stringify({ models: [{ name: `models/m${pages}` }], nextPageToken: `t${pages}` })); });
    expect(await listGeminiModels(endless, 'key')).toHaveLength(MODEL_PAGES_MAX);
    expect(pages).toBe(MODEL_PAGES_MAX);
  });

  it('a redirect fails the listing, and the address it points to is never asked with the key', async () => {
    const asked: string[] = [];
    const target = await serve((req, res) => { asked.push(String(req.headers['x-goog-api-key'] ?? req.headers['x-api-key'])); res.end('{"models":[],"data":[]}'); });
    const moved = await serve((req, res) => { res.writeHead(307, { location: `${target}${req.url}` }).end(); });
    await expect(listGeminiModels(moved, 'key')).rejects.toThrow();
    const claude = new ClaudeProvider({ baseUrl: moved, apiKey: 'key' });
    await expect((async () => { for await (const _ of claude.client().models.list()) break; })()).rejects.toThrow();
    // a request the SDK sends for a reply, not only the list, does not follow it either
    await expect(claude.client().messages.create({ model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  it("stops the Anthropic listing at 2000 models when the service always says there is more", async () => {
    let pages = 0;
    const endless = await serve((_req, res) => {
      pages++;
      const data = Array.from({ length: 100 }, (_, i) => ({ type: 'model', id: `m${pages}-${i}`, display_name: `M ${pages}-${i}`, created_at: '2026-01-01T00:00:00Z' }));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data, has_more: true, first_id: data[0]!.id, last_id: data.at(-1)!.id }));
    });
    // a listed service's protocol applies only at its own base URL: its requests are sent on to the local service
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string | URL | Request, init?: RequestInit) => real(String(url instanceof Request ? url.url : url).replace('https://api.anthropic.com', endless), init));
    const entry: LLMProviderEntry = { kind: 'coo', baseUrl: 'https://api.anthropic.com', secret: 'KEY', spec: { model: 'claude-haiku-5-5', thinking: true } };
    const instance = COO.create('anthropic', entry, { secret: () => 'key', readBlob: () => null, keepThinking: () => true, log: nullLogger() } as never);
    expect(await instance.listModels!()).toHaveLength(2000);
    expect(pages).toBeLessThanOrEqual(21);
  }, 20_000);
});
