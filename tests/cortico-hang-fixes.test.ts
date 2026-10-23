/**
 * The vendored Cortico's fixes for the bot going silent (after v0.1.16, before the 0.2.0 rename),
 * checked through this app's own wiring of Core: a real bot with a scripted model.
 *
 * - #245: a tool handler that returns neither a string nor `{ text }` (an extension the type checker
 *   never saw) used to throw inside the main loop and stop it; it now gets a failed receipt and the
 *   turn goes on.
 * - #246: a receipt in `session-main.jsonl` with no call before it (a call line lost in a crash) made
 *   every request after a restart fail upstream; Core now drops it when it reads the session back.
 * - #249: items recorded from another endpoint go out without their `id`, which the new endpoint
 *   rejects with a 400 when it did not issue it. In this app that is switching between Responses-protocol
 *   vendors (DeepSeek, OpenAI, xAI...: the origin is the endpoint name and its base URL); Gemini and
 *   Anthropic have their own wire code in cortico-provider-coo.
 * - Cortico #293 / upstream Coopanion #270: a main loop that stops (a state write that fails, as a file held
 *   by antivirus or a sync tool on Windows makes it) used to leave the process alive and deaf. Core now logs
 *   `loop-exit`, and `onLoopExit` (core/companion.ts) turns it into a crash report and a shutdown.
 *
 * Cortico's own tests: vendor/cortico/tests/core/loop.test.ts (#245, #246; it needs the minecraft
 * World's dependencies, so it only runs in a Cortico checkout) and
 * vendor/cortico/tests/providers/transport/responses-input.test.ts (#249).
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBot, type Bot, type BotDefinition } from 'cortico/bot.ts';
import { Runlog } from 'cortico/core/util.ts';
import { onLoopExit } from '../core/companion.ts';
import { CORE_DEFAULTS, type LoadedConfig } from 'cortico/core/config.ts';
import type { BlobStore, CoreApi, CoreConfig, Persona, PrefixSegment, SessionDecl, SystemPrefixContext, ToolDef, World } from 'cortico/core/types.ts';
import { responsesInput } from 'cortico/providers/transport/responses-input.ts';
import { withWorlds, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { ScriptedModel, type Turn } from '../packages/cortico-world-desktop-pet/tests/helpers/harness.ts';

const tool = (name: string, handler: () => Promise<unknown>): ToolDef => ({
  name, description: name, tags: ['act'], parameters: { type: 'object', properties: {}, required: [] },
  handler: handler as ToolDef['handler'],
});

/** Tools for the tests; pushes one event on start so that every start wakes the bot. */
const HANG: WorldDefinition<WorldSection> = {
  id: 'hang',
  label: 'hang',
  defaults: () => ({ enabled: true }),
  create: () => ({
    id: 'hang',
    envPromptVars: () => null,
    tools: () => [
      // what an extension compiled without types can hand back
      tool('broken_return', async () => undefined),
      tool('look', async () => 'a quiet desk'),
    ],
    start: async (host) => {
      await host.pushEvent({ type: 'hang.request', source: 'hang', senderKey: 'hang', ts: new Date().toISOString(), text: 'hi' }, { trigger: 'flush' });
    },
    stop: async () => {},
  }),
};

class MemoryBlobs implements BlobStore {
  private readonly map = new Map<string, { bytes: Uint8Array; mime: string }>();
  put(name: string, bytes: Uint8Array, mime: string): string {
    const handle = `mem:blobs/${name}`;
    this.map.set(handle, { bytes, mime });
    return handle;
  }
  get(handle: string) { return this.map.get(handle) ?? null; }
  list() { return [...this.map].map(([handle, b]) => ({ handle, mime: b.mime, size: b.bytes.length })); }
}

class TestPersona implements Persona {
  readonly blobs = new MemoryBlobs();
  constructor(readonly memoryDir: string, private readonly worlds: readonly World[]) {}
  attach(_core: CoreApi): void {}
  async systemSegments(_ctx: SystemPrefixContext): Promise<PrefixSegment[]> { return [{ title: 'PREFIX', text: 'test' }]; }
  declareSessions(): SessionDecl[] {
    const endTurn: ToolDef = {
      ...tool('end_turn', async () => '[turn ended]'), tags: ['flow'], barrierAfter: true, endsTurn: true,
    };
    return [{ id: 'main', label: 'main', rounds: () => ({ soft: 20, hard: 40 }), persistent: true, receivesEvents: true, tools: () => [...this.worlds.flatMap((w) => w.tools()), endTurn] }];
  }
  ownToolNames(): string[] { return ['end_turn']; }
}

const roots: string[] = [];
const bots: Bot<CoreConfig>[] = [];
afterEach(async () => {
  await Promise.all(bots.splice(0).map((b) => b.stop().catch(() => {})));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'coopanion-hang-'));
  roots.push(root);
  return root;
}

async function startBot(root: string, model: ScriptedModel, before?: (bot: Bot<CoreConfig>) => void): Promise<Bot<CoreConfig>> {
  const base: BotDefinition<CoreConfig> = {
    id: 'hang',
    declares: ['hang'],
    defaults: () => ({
      ...CORE_DEFAULTS,
      displayName: 'hang',
      providers: { scripted: { kind: 'openai-responses-compat', baseUrl: 'https://model.test', spec: { model: 'scripted', thinking: false } } },
      activeProvider: 'scripted',
      paths: { memory: 'memory', data: 'data' },
      web: { port: 0, theme: 'mint' },
    } as CoreConfig),
    build: (loaded, worlds) => ({ persona: new TestPersona(loaded.memoryDir, worlds), llm: model, console: { enabled: false } }),
  };
  const definition = withWorlds(base, [HANG]);
  const loaded: LoadedConfig<CoreConfig> = {
    config: definition.defaults() as CoreConfig,
    secret: (name) => (name === 'CORTICO_WEB_PASSWORD' ? '' : 'fake-key'),
    rootDir: root,
    memoryDir: join(root, 'memory'),
    dataDir: join(root, 'data'),
  };
  const bot = createBot(loaded, definition);
  bots.push(bot);
  before?.(bot);
  await bot.start();
  return bot;
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const outputs = (turn: Turn) => turn.records
  .map((r) => r.item as { type?: string; call_id?: string; output?: unknown })
  .filter((item) => item.type === 'function_call_output');

describe('Cortico hang fixes as the app runs them', () => {
  it('#245: a tool returning undefined gets a failed receipt and the bot answers again', async () => {
    const model = new ScriptedModel((turn) => (turn.n === 0 ? { calls: [{ name: 'broken_return' }] } : { calls: [{ name: 'end_turn' }] }));
    await startBot(newRoot(), model);
    await until(() => model.turns.length >= 2);
    // the loop went on to a second request, and that request carries a receipt for the broken call
    const call = model.turns[1].records
      .map((r) => r.item as { type?: string; name?: string; call_id?: string })
      .find((item) => item.type === 'function_call' && item.name === 'broken_return');
    expect(call?.call_id).toBeTruthy();
    const receipt = outputs(model.turns[1]).find((o) => o.call_id === call?.call_id)?.output;
    expect(receipt).toBeDefined();
    // the wording is Cortico's; only pin that it names the tool and what it returned
    expect(String(receipt)).toMatch(/broken_return/);
    expect(String(receipt)).toMatch(/undefined/);
  });

  it('#246: a receipt whose call was lost is dropped when the session is read back', async () => {
    const root = newRoot();
    const first = new ScriptedModel((turn) => (turn.n === 0 ? { calls: [{ name: 'look' }] } : { calls: [{ name: 'end_turn' }] }));
    const bot = await startBot(root, first);
    await until(() => first.turns.length >= 2);
    const ghost = outputs(first.turns[1]).find((o) => o.output === 'a quiet desk')?.call_id;
    expect(ghost).toBeTruthy();
    await bot.stop();
    bots.splice(bots.indexOf(bot), 1);

    // lose the call's line, as a crash between the two writes would
    const file = join(root, 'data', 'session-main.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const kept = lines.filter((line) => {
      const item = (JSON.parse(line) as { item?: { type?: string; call_id?: string } }).item;
      return !(item?.type === 'function_call' && item.call_id === ghost);
    });
    expect(kept.length).toBe(lines.length - 1);
    writeFileSync(file, kept.map((l) => `${l}\n`).join(''));

    const second = new ScriptedModel(() => ({ calls: [{ name: 'end_turn' }] }));
    await startBot(root, second);
    await until(() => second.turns.length >= 1);
    expect(second.turns[0].records.some((r) => (r.item as { call_id?: string }).call_id === ghost)).toBe(false);

    const runs = join(root, 'data', 'runs');
    const logged = readdirSync(runs).map((run) => join(runs, run, 'log.jsonl')).filter(existsSync)
      .some((log) => readFileSync(log, 'utf8').includes(String(ghost)));
    expect(logged).toBe(true);
  });

  it('#249: items from another endpoint go out without their id, keeping call_id', () => {
    const deepseek = { instance: 'coo', module: 'openai-responses-compat', model: 'deepseek-chat', compatibilityDomain: 'deepseek' };
    const openai = { instance: 'openai', module: 'openai-responses-compat', model: 'gpt-5', compatibilityDomain: 'openai' };
    const record = (item: Record<string, unknown>, origin?: typeof deepseek) => ({ item, context: origin ? { origin } : {} });
    const context = [
      record({ type: 'message', role: 'user', content: 'hi' }),
      record({ type: 'function_call', id: '0f6c2b1e-7d4a-4c1b-9e2f-3a5b6c7d8e9f', call_id: 'call_a', name: 'look', arguments: '{}', status: 'completed' }, deepseek),
      record({ type: 'function_call_output', id: 'out_a', call_id: 'call_a', output: 'x' }, deepseek),
      record({ type: 'function_call', id: 'fc_own', call_id: 'call_b', name: 'look', arguments: '{}', status: 'completed' }, openai),
    ];
    const input = responsesInput({ model: 'gpt-5', input: [] as never[] }, { context, origin: openai } as never).input as Array<Record<string, unknown>>;
    const calls = input.filter((i) => i.type === 'function_call' || i.type === 'function_call_output');
    expect(calls.map((i) => i.call_id)).toEqual(['call_a', 'call_a', 'call_b']);
    expect(calls[0]).not.toHaveProperty('id');
    expect(calls[1]).not.toHaveProperty('id');
    expect(calls[2].id).toBe('fc_own');
  });

  it('#293: a main loop that stops logs loop-exit, and onLoopExit hands its error on once', async () => {
    const model = new ScriptedModel(() => ({ calls: [{ name: 'end_turn' }] }));
    const exits: Array<Error | undefined> = [];
    const bot = await startBot(newRoot(), model, (b) => {
      onLoopExit(b.core.runlog, (err) => exits.push(err));
      // the state file cannot be replaced: the loop's first state write throws (Cortico's own test does the same)
      mkdirSync(join(b.core.loaded.dataDir, 'core-state.json'), { recursive: true });
      const stale = Date.now() - 2 * 60 * 60_000;
      (b.core.state.data as { llmStall?: unknown }).llmStall = { since: stale, at: [stale] };
    });
    await until(() => exits.length > 0);
    expect(exits).toHaveLength(1);
    expect(exits[0]).toBeInstanceOf(Error);
    expect(exits[0]?.message).toMatch(/core-state\.json/);
    expect(exits[0]?.stack).toBeTruthy();
    expect(bot.core.loop.getStatus().running).toBe(false);
  });

  it('onLoopExit ignores every other log line, errors included', () => {
    const runlog = new Runlog(null, { stdout: false });
    const exits: Array<Error | undefined> = [];
    onLoopExit(runlog, (err) => exits.push(err));
    const log = runlog.logger('core');
    log.info('core已启动', { event: 'started' });
    log.emit('error', '未处理的 promise 拒绝', { event: 'unhandled-rejection', err: new Error('elsewhere') });
    log.emit('error', '没有 event 的错误', { err: new Error('plain') });
    expect(exits).toEqual([]);
    const cause = new Error('EBUSY: resource busy or locked, rename');
    log.emit('error', '主循环异常退出', { event: 'loop-exit', err: cause });
    expect(exits).toHaveLength(1);
    expect(exits[0]?.message).toBe(cause.message);
    expect(exits[0]?.stack).toBe(cause.stack);
  });
});
