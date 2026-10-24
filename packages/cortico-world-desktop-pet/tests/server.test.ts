/**
 * The pet server over real HTTP and WebSocket (ported from upstream's tests/server.test.ts, #306, #316 and #317;
 * the fork has no OBS overlay source): browser writes need the server's own origin, the window needs its launch key,
 * a replaced window's late messages are dropped, a pack's files are sandboxed when opened as a page, pack installs
 * answer 409 until replacing is approved, and imported packs can be uninstalled.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { WebSocket } from 'ws';
import { figurePacks, type FigurePack } from '../src/packs.ts';
import { PetServer, type PageMessage, type PetServerOptions } from '../src/server.ts';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const servers: PetServer[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await Promise.all(servers.splice(0).map((s) => s.stop()));
});

async function serve(opts: Partial<PetServerOptions> = {}) {
  const server = new PetServer({
    port: () => 0, webDir: WEB_DIR, snapshot: () => ({}),
    onPetMessage: () => {}, onAudio: () => {}, onPetConnect: () => {}, onPetDisconnect: () => {}, onSkin: () => {}, onPrefs: () => {},
    ...opts,
  });
  servers.push(server);
  await server.start();
  return server;
}

const windowKey = (server: PetServer) => new URLSearchParams(new URL(server.windowUrl).hash.slice(1)).get('key')!;

/** A socket with the text messages it got and its close code. */
async function socket(server: PetServer, params: Record<string, string>, origin?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/socket?${new URLSearchParams(params)}`, { origin });
  sockets.push(ws);
  const texts: Array<Record<string, unknown>> = [];
  let closed: number | null = null;
  ws.on('message', (data, isBinary) => { if (!isBinary) texts.push(JSON.parse(String(data))); });
  ws.on('close', (code) => { closed = code; });
  await new Promise((done, fail) => { ws.once('open', done); ws.once('error', fail); });
  return { ws, texts, closed: () => closed };
}

/** The HTTP status a refused socket was answered with. */
function refused(server: PetServer, params: Record<string, string>, origin?: string): Promise<number> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/socket?${new URLSearchParams(params)}`, { origin });
    ws.once('open', () => { ws.close(); fail(new Error('socket accepted')); });
    ws.once('error', fail);
    ws.once('unexpected-response', (_req, res) => { res.resume(); done(res.statusCode!); ws.terminate(); });
  });
}

describe('local access (upstream #306)', () => {
  it('refuses browser writes and sockets from other ports, schemes, opaque and malformed origins', async () => {
    const server = await serve();
    const other = await serve();
    const origins = [other.origin, `http://localhost:${other.port}`, 'http://127.0.0.1', 'http://localhost',
      `https://127.0.0.1:${server.port}`, `ws://127.0.0.1:${server.port}`, `${server.origin}/path`,
      'http://example.test', 'null', 'invalid'];
    for (const origin of origins) {
      for (const path of ['/api/prefs', '/api/skin', '/api/speech', '/api/figures/import', '/api/figures/import/install', '/api/figures/import/cancel', '/api/figures/remove']) {
        expect((await fetch(`${server.origin}${path}`, { method: 'POST', headers: { origin }, body: '{}' })).status, `${origin} ${path}`).toBe(421);
      }
      expect(await refused(server, { role: 'pet' }, origin), origin).toBe(421);
    }
  });

  it('accepts its own HTTP origins and local clients without Origin, and keeps loopback reads for embedding pages', async () => {
    const changes: Record<string, unknown>[] = [];
    const server = await serve({ onPrefs: (prefs) => changes.push(prefs) });
    const other = await serve();
    for (const origin of [server.origin, `http://localhost:${server.port}`, undefined]) {
      const prefs = { theme: 'dark', from: origin ?? 'none' };
      const res = await fetch(`${server.origin}/api/prefs`, { method: 'POST', headers: origin ? { origin } : {}, body: JSON.stringify(prefs) });
      expect(res.status).toBe(200);
      expect(changes.at(-1)).toEqual(prefs);
      const page = await socket(server, { role: 'pet', host: 'tab' }, origin);
      await expect.poll(() => page.texts.some((m) => m.t === 'init')).toBe(true);
    }
    // the console (another local port) shows the pet and dressing pages in its frames; the figure frame reads as `null`
    for (const origin of [other.origin, 'null']) {
      expect((await fetch(`${server.origin}/pet`, { headers: { origin } })).status).toBe(200);
      expect((await fetch(`${server.origin}/figure-frame`, { headers: { origin } })).status).toBe(200);
    }
    const asset = await fetch(`${server.origin}/web/figure-frame.js`, { headers: { origin: 'null' } });
    expect(asset.headers.get('access-control-allow-origin')).toBe('null');
    expect(asset.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('requires the window key, keeps it out of what the pages read, and lets a tab only watch beside the window', async () => {
    const messages: PageMessage[] = [];
    const server = await serve({ onPetMessage: (msg) => messages.push(msg), snapshot: () => ({ url: `${server.origin}/pet` }) });
    expect(new URL(server.windowUrl).pathname).toBe('/pet');
    expect(await refused(server, { role: 'pet', host: 'window' }, server.origin)).toBe(403);
    expect(server.petConnected).toBe(false);
    const win = await socket(server, { role: 'pet', host: 'window', key: windowKey(server) }, server.origin);
    await expect.poll(() => server.petConnected).toBe(true);
    for (const key of ['', 'wrong', windowKey(server).toUpperCase()]) expect(await refused(server, { role: 'pet', host: 'window', key }, server.origin)).toBe(403);
    const tab = await socket(server, { role: 'pet', host: 'tab' }, server.origin);
    await expect.poll(() => tab.texts).toContainEqual({ t: 'watching' });
    server.sendPet({ t: 'confirm', id: 'permission', options: ['yes', 'no'] });
    await expect.poll(() => win.texts.some((m) => m.t === 'confirm')).toBe(true);
    expect(tab.texts.some((m) => m.t === 'confirm')).toBe(false);
    // a watching tab may still type, but not answer the window's question
    tab.ws.send(JSON.stringify({ t: 'confirmed', id: 'permission', index: 0 }));
    tab.ws.send(JSON.stringify({ t: 'text', text: 'hello' }));
    await expect.poll(() => messages).toEqual([{ t: 'text', text: 'hello' }]);
    win.ws.send(JSON.stringify({ t: 'confirmed', id: 'permission', index: 1 }));
    await expect.poll(() => messages.at(-1)).toEqual({ t: 'confirmed', id: 'permission', index: 1 });
    expect(win.closed()).toBeNull();
    for (const path of ['/api/state', '/pet', '/dress']) expect(await (await fetch(`${server.origin}${path}`)).text()).not.toContain(windowKey(server));
    expect(JSON.stringify(win.texts)).not.toContain(windowKey(server));
  });

  it('lets the window reconnect in place of its old connection, whose late messages are dropped', async () => {
    const messages: PageMessage[] = [];
    const server = await serve({ onPetMessage: (msg) => messages.push(msg) });
    const params = { role: 'pet', host: 'window', key: windowKey(server) };
    const first = await socket(server, params, server.origin);
    const next = await socket(server, params, server.origin);
    await expect.poll(first.closed).toBe(4000);
    server.sendPet({ t: 'act', actions: ['nod'] });
    await expect.poll(() => next.texts).toContainEqual({ t: 'act', actions: ['nod'] });
    next.ws.send(JSON.stringify({ t: 'text', text: 'from the new one' }));
    await expect.poll(() => messages).toEqual([{ t: 'text', text: 'from the new one' }]);
    // another server has another key
    const other = await serve();
    expect(windowKey(other)).not.toBe(windowKey(server));
    expect(await refused(other, params, other.origin)).toBe(403);
  });

  it('a replaced connection that still sends is not heard', async () => {
    const messages: PageMessage[] = [];
    const server = await serve({ onPetMessage: (msg) => messages.push(msg) });
    const first = await socket(server, { role: 'pet', host: 'tab' }, server.origin);
    // the server closes the old one with 4000, but frames it sent before that close arrives still come in
    const closing = new Promise((r) => first.ws.once('close', r));
    await socket(server, { role: 'pet', host: 'tab' }, server.origin);
    first.ws.send(JSON.stringify({ t: 'text', text: 'late' }));
    await closing;
    await new Promise((r) => setTimeout(r, 100));
    expect(messages).toEqual([]);
  });
});

describe('installed pack files (upstream #316)', () => {
  it('a pack page opened on its own is sandboxed, and its script is still served as a script to the figure frame', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pet-pack-'));
    writeFileSync(join(dir, 'page.html'), '<script>fetch("/api/state")</script>');
    writeFileSync(join(dir, 'figure.js'), 'export const figure = {};');
    const server = await serve({ packs: () => [{ id: 'p', dir, builtin: false } as FigurePack] });
    const page = await fetch(`${server.origin}/packs/p/page.html`);
    expect(page.headers.get('content-security-policy')).toBe("sandbox allow-scripts; default-src 'none'");
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    const script = await fetch(`${server.origin}/packs/p/figure.js`, { headers: { origin: 'null' } });
    expect(script.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(script.headers.get('access-control-allow-origin')).toBe('null');
    // the pages keep their own CSP
    expect((await fetch(`${server.origin}/dress`)).headers.get('content-security-policy')).toMatch(/^default-src 'self'/);
  });
});

describe('installing and uninstalling packs over HTTP (upstream #306, #317)', () => {
  const word = { id: 'nod', kind: 'action', seconds: 1, desc: { zh: '点头' } };
  const manifest = (version: string) => JSON.stringify({ manifest: 2, api: 2, id: 'robot', version, name: { zh: '机器人' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [], vocab: [word] });
  const zip = (version: string) => zipSync({ 'robot/figure.json': strToU8(manifest(version)), 'robot/figure.js': strToU8('export function createBody() {}') });

  it('answers 409 with the conflicts until replace names them, lists removable packs, and uninstalls one', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'figures-'));
    mkdirSync(join(packDir, 'old-name'));
    writeFileSync(join(packDir, 'old-name', 'figure.json'), manifest('0.9.0'));
    writeFileSync(join(packDir, 'old-name', 'figure.js'), 'export function createBody() {}');
    const server = await serve({ packs: () => figurePacks([packDir]).packs, packDir: () => packDir });
    const post = (path: string, body: unknown, type = 'application/json') => fetch(`${server.origin}${path}`, {
      method: 'POST', headers: { origin: server.origin, 'content-type': type }, body: type === 'application/json' ? JSON.stringify(body) : Buffer.from(body as Uint8Array),
    });
    const listed = await (await fetch(`${server.origin}/api/figures`)).json() as Array<{ id: string; removable: boolean }>;
    expect(listed.filter((p) => p.removable).map((p) => p.id)).toEqual(['robot']);
    expect(listed.find((p) => p.id === 'coo')!.removable).toBe(false);
    expect(listed.find((p) => p.id === 'grok-chan')!.removable).toBe(false);

    const staged = await (await post('/api/figures/import', zip('1.0.0'), 'application/zip')).json() as { token: string };
    const first = await post('/api/figures/import/install', { token: staged.token, dirs: ['robot'] });
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ conflicts: ['robot'] });
    expect(readdirSync(packDir)).toEqual(['old-name']);
    const second = await post('/api/figures/import/install', { token: staged.token, dirs: ['robot'], replace: ['robot'] });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ installed: ['robot'] });
    expect(figurePacks([packDir]).packs.find((p) => p.id === 'robot')!.manifest.version).toBe('1.0.0');

    for (const id of ['whale', 'coo', 'claude-chan', 'nobody']) {
      const res = await post('/api/figures/remove', { id });
      expect(res.status, id).toBe(400);
      expect(await res.json(), id).toHaveProperty('error');
    }
    expect((await post('/api/figures/remove', { id: 7 })).status).toBe(400);
    const removed = await post('/api/figures/remove', { id: 'robot' });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ removed: 'robot' });
    expect(readdirSync(packDir)).toEqual([]);
    expect(((await (await fetch(`${server.origin}/api/figures`)).json()) as Array<{ id: string }>).map((p) => p.id)).not.toContain('robot');
  });

  it('a server not told where packs go lists nothing removable and removes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'figures-'));
    mkdirSync(join(dir, 'robot'));
    writeFileSync(join(dir, 'robot', 'figure.json'), manifest('1.0.0'));
    writeFileSync(join(dir, 'robot', 'figure.js'), 'export function createBody() {}');
    const server = await serve({ packs: () => figurePacks([dir]).packs });
    const listed = await (await fetch(`${server.origin}/api/figures`)).json() as Array<{ id: string; removable: boolean }>;
    expect(listed.find((p) => p.id === 'robot')!.removable).toBe(false);
    expect((await fetch(`${server.origin}/api/figures/remove`, { method: 'POST', body: JSON.stringify({ id: 'robot' }) })).status).toBe(400);
    expect(readdirSync(dir)).toEqual(['robot']);
  });
});
