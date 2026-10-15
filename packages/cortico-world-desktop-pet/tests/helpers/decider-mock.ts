/**
 * A local stand-in for OpenRouter's `POST /api/alpha/decisions`: records each request (body and Authorization
 * header) and answers with what `answer` returns for it; `delayMs` holds the answer, `status` fails it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockRequest { auth: string | undefined; body: { model: string; state: string; questions: Record<string, { type: string; instructions?: string; criteria: Record<string, string> }> } }

export class DeciderMock {
  readonly requests: MockRequest[] = [];
  /** The Authorization header of each listing of models. */
  readonly listed: Array<string | undefined> = [];
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
          this.listed.push(req.headers.authorization);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: [{ id: 'perplexity/pplx-decider-v1.1-27b' }, { id: 'mock/decider-2' }] }));
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
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/alpha/decisions`;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((done) => this.server ? this.server.close(() => done()) : done());
  }
}
