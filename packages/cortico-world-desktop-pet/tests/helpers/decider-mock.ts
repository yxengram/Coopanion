/**
 * A local stand-in for OpenRouter's `POST /api/alpha/decisions` (and `GET /api/v1/models`, the listing of models): records each request (body and Authorization
 * header) and answers with what `answer` returns for it; `delayMs` holds the answer, `status` fails it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockRequest { auth: string | undefined; body: { model: string; state: string; questions: Record<string, { type: string; instructions?: string; criteria: Record<string, string> }> } }

export class DeciderMock {
  readonly requests: MockRequest[] = [];
  /** Each listing of models: its path and query, and the Authorization header (there should be none). */
  readonly listed: Array<{ url: string; auth: string | undefined }> = [];
  /** The listing's status; not 200 fails it. */
  listStatus = 200;
  /** The listing, shaped as OpenRouter's GET /api/v1/models. */
  models: unknown[] = [
    { id: 'perplexity/pplx-decider-v1.1-27b', name: 'Perplexity: Decider 27B', context_length: 32768, pricing: { prompt: '0.00000002', completion: '0' }, architecture: { output_modalities: ['decisions'] } },
    { id: 'mock/free-decider:free', name: 'Mock free', context_length: 16384, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['decisions'] } },
    { id: 'mock/tiny', name: 'Mock tiny context', context_length: 2048, pricing: { prompt: '0.00000001' }, architecture: { output_modalities: ['decisions'] } },
    { id: 'mock/chat', name: 'Not a decider', context_length: 128000, pricing: { prompt: '0.000001' }, architecture: { output_modalities: ['text'] } },
  ];
  modelsUrl = '';
  delayMs = 0;
  status = 200;
  /** Per question, the option key and its probability; questions left out answer their keep option (the first). */
  answer: (req: MockRequest) => Record<string, [string, number] | Array<[string, number]>> = () => ({});
  private server: Server | null = null;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        // the listing of decision models (GET <url>/models)
        if (req.method === 'GET') {
          this.listed.push({ url: req.url ?? '', auth: req.headers.authorization });
          res.writeHead(this.listStatus, { 'Content-Type': 'application/json' });
          res.end(this.listStatus === 200 ? JSON.stringify({ data: this.models }) : '{"error":{"message":"down"}}');
          return;
        }
        const r: MockRequest = { auth: req.headers.authorization, body: JSON.parse(raw) };
        this.requests.push(r);
        const send = () => {
          if (res.destroyed) return;
          if (this.status !== 200) { res.writeHead(this.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'mock failure' } })); return; }
          const picked = this.answer(r);
          const answers: Record<string, unknown> = {};
          for (const [q, def] of Object.entries(r.body.questions)) {
            const keys = Object.keys(def.criteria);
            const list = (picked[q] ? (Array.isArray(picked[q]![0]) ? picked[q] : [picked[q]]) : [[keys[0], .9]]) as Array<[string, number]>;
            for (const [k] of list) if (!keys.includes(k)) throw new Error(`mock: ${q} has no option ${k}`);
            answers[q] = { type: 'choice', choice: list[0][0], probabilities: Object.fromEntries(list), confidence: .8 };
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ answers, usage: { input_tokens: 2400, output_tokens: 0, cost: 0.00005 } }));
        };
        if (this.delayMs) setTimeout(send, this.delayMs); else send();
      });
    });
    await new Promise<void>((done) => this.server!.listen(0, '127.0.0.1', () => done()));
    const origin = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    this.url = `${origin}/api/alpha/decisions`;
    this.modelsUrl = `${origin}/api/v1/models?output_modalities=decisions`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((done) => this.server ? this.server.close(() => done()) : done());
  }
}
