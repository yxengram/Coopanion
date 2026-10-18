/**
 * A ChatGPT plan (testing) in the app: the Core counts a signed-in plan as having its key, reports it as `chatgpt`
 * in the usage statistics, leaves the plan's usage limit out of the failure bubble, and the introduction takes it
 * through the OpenAI card, sending only OpenAI's sign-in page to the browser; the app forwards only that page.
 * The provider module itself is tested in packages/cortico-provider-coo/tests/chatgpt.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesktopPetWorld, PetDialog, PetDialogAnswer } from 'cortico-world-desktop-pet';
import { CHATGPT, USAGE_LIMIT, VENDORS, chatgptEntry, endpointVendor } from 'cortico-provider-coo';
import { describeEndpoint } from '../core/telemetry.ts';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';

const require = createRequire(import.meta.url);
const { CoreHost, isSignInPage } = require('../app/core-host.cjs') as {
  CoreHost: new (opts: Record<string, unknown>) => import('node:events').EventEmitter & { start(): Promise<void>; stop(): Promise<void> };
  isSignInPage: (url: unknown) => boolean;
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('the Core with a ChatGPT plan', () => {
  it('counts the plan as keyed only while it is signed in (its endpoint has no secret)', async () => {
    const home = mkdtempSync(join(tmpdir(), 'chatgpt-home-'));
    vi.stubEnv('CORTICO_HOME', home);
    vi.resetModules();
    const { hasKey } = await import('../core/companion.ts');
    const dir = join(home, 'providers', 'chatgpt');
    mkdirSync(dir, { recursive: true });
    const config = { activeProvider: 'chatgpt', providers: { chatgpt: chatgptEntry() } } as never;
    expect(hasKey(config)).toBe(false);
    writeFileSync(join(dir, '.env'), 'CHATGPT_CLIENT_ID=c\nCHATGPT_REFRESH_TOKEN=rt\nCHATGPT_SCOPE=openid,chatgpt.tokens.use.direct\n');
    expect(hasKey(config)).toBe(true);
    // a grant without the plan is not enough
    writeFileSync(join(dir, '.env'), 'CHATGPT_CLIENT_ID=c\nCHATGPT_REFRESH_TOKEN=rt\nCHATGPT_SCOPE=openid\n');
    expect(hasKey(config)).toBe(false);
  });

  it('reports the plan as vendor chatgpt, and OpenAI with a key as openai', () => {
    const plan = chatgptEntry('gpt-6-luna');
    expect(describeEndpoint(plan, 'gpt-6-luna', () => endpointVendor(plan))).toEqual({ vendor: 'chatgpt', model: 'gpt-6-luna', endpointKind: 'builtin' });
    const keyed = { kind: 'coo', baseUrl: CHATGPT.baseUrl };
    expect(describeEndpoint(keyed, 'gpt-6-luna', () => endpointVendor(keyed))).toEqual({ vendor: 'openai', model: 'gpt-6-luna', endpointKind: 'builtin' });
  });

  it('does not count a request refused for the plan\'s usage limit toward the failure bubble', async () => {
    // the error class of the same module graph as the Core's (an earlier test loaded the modules afresh)
    vi.resetModules();
    const { hintFailures } = await import('../core/companion.ts');
    const { GenerationError } = await import('cortico/core/generation.ts');
    const shown: string[] = [];
    let fail: Error = new GenerationError('ChatGPT usage limit', [], null, { instance: 'chatgpt', module: 'chatgpt', model: 'm', compatibilityDomain: 'x' }, 429,
      JSON.stringify({ error: { code: USAGE_LIMIT } }));
    const core = { llm: { respond: async () => { throw fail; } } };
    const pet = { petState: () => ({ connected: true }), dialog: (d: { text: string }) => { shown.push(d.text); return { answer: new Promise(() => {}) }; } };
    hintFailures(core as never, { language: 'zh' } as never, () => pet as never);
    for (let i = 0; i < 6; i++) await core.llm.respond().catch(() => {});
    expect(shown).toEqual([]);
    fail = new Error('getaddrinfo ENOTFOUND api.openai.com');
    for (let i = 0; i < 5; i++) await core.llm.respond().catch(() => {});
    expect(shown).toHaveLength(1);
  });
});

describe('the sign-in page the app opens', () => {
  it('is an https page of auth.openai.com and nothing else', async () => {
    const { isSignInPage: guideCheck } = await import('../core/guide.ts');
    for (const check of [isSignInPage, guideCheck]) {
      expect(check('https://auth.openai.com/api/accounts/authorize?client_id=x')).toBe(true);
      for (const bad of ['http://auth.openai.com/x', 'https://auth.openai.com.evil.example/x', 'https://evil.example/?https://auth.openai.com/',
        'https://user@auth.openai.com/x', 'https://auth.openai.com:8443/x', 'file:///etc/passwd', 'javascript:alert(1)', '', 'not a url']) {
        expect(check(bad), bad).toBe(false);
      }
    }
    expect(isSignInPage(undefined)).toBe(false);
  });

  it('is handed on from the Core as browse, and no other address is', async () => {
    const scratch = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '.cache', 'chatgpt-browse-test');
    const appRoot = join(scratch, 'app');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "process.send({ type: 'companion:browse', url: 'https://evil.example/' });",
      "process.send({ type: 'companion:browse', url: 'https://auth.openai.com/api/accounts/authorize?x=1' });",
      "process.send({ type: 'companion:browse', url: 42 });",
      "process.send({ type: 'companion:ready', port: 1, dataDir: '/d', keyMissing: true, language: 'zh' });",
      "process.on('message', (m) => { if (m?.type === 'companion:shutdown') process.exit(0); });",
      'setInterval(() => {}, 1000);',
    ].join('\n'));
    const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: require('electron') as unknown as string, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
    const opened: string[] = [];
    host.on('browse', (url: string) => opened.push(url));
    try {
      const ready = new Promise((r) => host.on('ready', r));
      await host.start();
      await ready;
      expect(opened).toEqual(['https://auth.openai.com/api/accounts/authorize?x=1']);
    } finally { await host.stop(); }
  });
});

/**
 * Runs the introduction against a console whose model is not connected and a pet that takes the OpenAI card and then
 * the ChatGPT button; the sign-in comes back done (or `outcome`) with the plan listing `plan-model`.
 */
async function walkChatGPT(language: 'zh' | 'en', authorizeUrl = 'https://auth.openai.com/api/accounts/authorize?x=1', outcome: 'done' | 'failed' = 'done',
  how: 'chatgpt' | 'key' = 'chatgpt') {
  vi.resetModules();
  const { guideStrings, runGuide } = await import('../core/guide.ts');
  const T = guideStrings(language);
  let connected = false;
  let polls = 0;
  const calls: Array<[string, unknown]> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) as unknown : undefined;
    calls.push([decodeURIComponent(path), body]);
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    if (path === '/api/status') return json({ modelConnection: connected ? { ready: true, model: 'plan-model', module: how === 'key' ? 'coo' : 'chatgpt', baseUrl: CHATGPT.baseUrl } : { ready: false } });
    if (path === '/api/config') return json({ groups: [] });
    if (path === '/api/providers' && !body) return json({ providers: [] });
    if (path.endsWith('/signIn')) return json({ url: authorizeUrl });
    if (path.endsWith('/state')) {
      polls += 1;
      return json(polls < 2 ? { phase: 'waiting', signedIn: false } : outcome === 'done'
        ? { phase: 'done', signedIn: true, email: 'a@b.c', models: ['plan-model'] } : { phase: 'failed', signedIn: false, reason: 'access_denied' });
    }
    if (path === '/api/providers/chatgpt' && !body) return json({ name: 'chatgpt', entry: chatgptEntry(), revision: 'r1' });
    if (path.endsWith('/activate')) connected = true;
    return json({ ok: true });
  }));
  const dialogs: PetDialog[] = [];
  let failedOnce = false;
  const pet = {
    petState: () => ({ connected: true, url: 'http://127.0.0.1:7797/pet', skin: { figure: 'coo' } }),
    voiceState: () => ({ enabled: true, engine: 'funasr', model: { phase: 'ready', done: 0, total: null, bytes: 0, detail: null }, input: { mode: 'hold', hint: 'hold Alt', keyLabel: 'Alt', taps: 0 } }),
    packs: () => figurePacks([]).packs,
    installVoice: async () => {},
    dialog(d: PetDialog) {
      dialogs.push(d);
      const input = d.input;
      let a: PetDialogAnswer | null;
      if (input?.kind === 'progress') a = null;
      else if (input?.kind === 'choices' && input.options.some((o) => o.label === 'OpenAI')) a = { index: input.options.findIndex((o) => o.label === 'OpenAI') };
      else if (how === 'key' && input?.kind === 'buttons' && input.options.some((o) => o.label === T.useKey)) a = { index: input.options.findIndex((o) => o.label === T.useKey) };
      else if (input?.kind === 'buttons' && input.options.some((o) => o.label === T.chatgptGo)) {
        // after a failure, put it off
        a = d.text.startsWith(T.chatgptFail('').slice(0, 4)) && failedOnce ? { index: 1 } : { index: input.options.findIndex((o) => o.label === T.chatgptGo) };
        if (d.text.startsWith(T.chatgptFail('').slice(0, 4))) failedOnce = true;
      } else if (input?.kind === 'buttons') a = { index: 0 };
      else if (input?.kind === 'choices') a = { index: input.value ?? 0 };
      else if (input?.kind === 'text') a = (input.secret ? how === 'key' ? { text: 'sk-test' } : { alt: true } : { text: input.value || 'Ming' }) as PetDialogAnswer;
      else a = { done: true } as PetDialogAnswer;
      return { answer: a ? Promise.resolve(a) : new Promise(() => {}), dropped: [], update() {}, close() {} };
    },
  } as unknown as DesktopPetWorld;
  const opened: string[] = [];
  let transcript: string[] = [];
  await runGuide({
    pet: () => pet, console: 'http://127.0.0.1:17788', doneFile: join(mkdtempSync(join(tmpdir(), 'chatgpt-guide-')), 'guide.json'),
    openDress() {}, onEnd: (end) => { transcript = end.transcript; }, language: () => language, browse: (url) => opened.push(url),
  });
  return { T, dialogs, calls, opened, transcript };
}

describe('the introduction through the OpenAI card', () => {
  for (const language of ['zh', 'en'] as const) {
    it(`asks key or ChatGPT, signs the plan in through the browser and goes on connected (${language})`, async () => {
      const { T, dialogs, calls, opened, transcript } = await walkChatGPT(language);
      const how = dialogs.find((d) => d.text === T.openaiHow)!;
      expect(how.input).toMatchObject({ kind: 'buttons', options: [{ label: T.useKey, primary: true }, { label: T.chatgptGo, primary: false }] });
      expect(opened).toEqual(['https://auth.openai.com/api/accounts/authorize?x=1']);
      // no model or key step, a closable bar while the browser is out
      expect(dialogs.some((d) => d.text === T.pickModel(CHATGPT) || d.input?.kind === 'text' && d.input.secret)).toBe(false);
      expect(dialogs.find((d) => d.text === T.chatgptWaiting)).toMatchObject({ closable: true, input: { kind: 'progress' } });
      expect(dialogs.some((d) => d.text === T.keyOk(CHATGPT, 'plan-model'))).toBe(true);
      const paths = calls.map(([p]) => p);
      expect(paths).toContain('/api/webui/providers/llm:chatgpt/panels/chatgpt/signIn');
      expect(calls.find(([p, b]) => p === '/api/providers' && b)?.[1]).toMatchObject({ name: 'chatgpt', entry: { kind: 'chatgpt' } });
      expect(paths).toContain('/api/providers/chatgpt/activate');
      // the record Coo is handed has the card picked and the line it connected on, no line of the plan's own
      const record = transcript.join('\n');
      expect(record).toContain('对方:OpenAI');
      expect(record).toContain(`Coo:${T.keyOk(CHATGPT, 'plan-model')}`);
      for (const line of [T.openaiHow, T.useKey, T.chatgptGo, T.chatgptAsk, T.chatgptWaiting]) expect(record).not.toContain(line);
    });
  }

  it('the API-key answer goes on to the model and the key, as before, with no sign-in', async () => {
    const { T, dialogs, calls, opened, transcript } = await walkChatGPT('zh', undefined, 'done', 'key');
    const openai = VENDORS.find((v) => v.id === 'openai')!;
    expect(dialogs.some((d) => d.text === T.pickModel(openai))).toBe(true);
    expect(dialogs.some((d) => d.text === T.askKey(openai) && d.input?.kind === 'text' && d.input.secret)).toBe(true);
    expect(calls.find(([p, b]) => p === '/api/providers' && b)?.[1]).toMatchObject({ name: 'openai', secretValue: 'sk-test', entry: { kind: 'coo' } });
    expect(calls.map(([p]) => p)).toContain('/api/providers/openai/activate');
    expect(calls.some(([p]) => p.includes('/panels/chatgpt/'))).toBe(false);
    expect(opened).toEqual([]);
    // the record reads as it did before the plan came in: the card, then the model and the key steps
    const record = transcript.join('\n');
    expect(record).not.toContain(T.openaiHow);
    expect(record).not.toContain(T.useKey);
    expect(record).toContain(`对方:OpenAI\nCoo:${T.pickModel(openai)}`);
  });

  it('opens no other address the console hands back, and says why a sign-in failed', async () => {
    const { T, opened, dialogs, calls, transcript } = await walkChatGPT('zh', 'https://evil.example/authorize', 'failed');
    expect(opened).toEqual([]);
    expect(dialogs.some((d) => d.text === T.chatgptFail('没有同意授权'))).toBe(true);
    expect(calls.some(([p]) => p.endsWith('/activate'))).toBe(false);
    expect(dialogs.some((d) => d.text === T.keySkipped)).toBe(true);
    expect(transcript.join('\n')).not.toContain(T.chatgptFail('').slice(0, 4));
  });
});
