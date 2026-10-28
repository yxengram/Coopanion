import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import type { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);

interface Host extends EventEmitter {
  state: string;
  child: ChildProcess | null;
  crashes: number[];
  missingModuleExits: number;
  blocked: unknown;
  shutdownAsked: boolean;
  start(): Promise<void>;
  stop(graceMs?: number): Promise<void>;
  restart(): Promise<void>;
  send(msg: unknown): void;
  expectStop(): void;
  forgetStop(): void;
}
const { CoreHost, CORE_NODE_FLAGS, MISSING_MODULE_DELAYS_MS, isMissingModule, missingModuleDelay } = require('../app/core-host.cjs') as {
  CoreHost: new (opts: { appRoot: string, env: NodeJS.ProcessEnv, logDir: string, resolveProxy: (url: string) => Promise<string>, execPath?: string }) => Host;
  CORE_NODE_FLAGS: string[];
  MISSING_MODULE_DELAYS_MS: number[];
  isMissingModule(text: string): boolean;
  missingModuleDelay(exits: number): number | null;
};

const { textOf } = require('../app/i18n/index.cjs') as { textOf(language: string): { corePortsBusy(from: number, to: number): string } };

// not the temp directory: a Windows CI run cannot use it for this (CLAUDE.md)
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '.cache', 'core-host-test');
afterEach(() => rmSync(scratch, { recursive: true, force: true }));
// the app's own runtime: under vitest process.execPath is the Node running the tests, which may not take CORE_NODE_FLAGS
const electron = require('electron') as string;

describe('Core host', () => {
  it('recognises a missing module or package from import and from require', () => {
    expect(isMissingModule("Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from C:\\\\app\\\\")).toBe(true);
    expect(isMissingModule("Error: Cannot find module './boot.ts'")).toBe(true);
    expect(isMissingModule("code: 'MODULE_NOT_FOUND'")).toBe(true);
    expect(isMissingModule('TypeError: fetch failed')).toBe(false);
  });

  it('waits 3 s, 10 s, then 30 s between missing-module starts and gives up after 223 s', () => {
    const waits: number[] = [];
    for (let exits = 0; ; exits++) {
      const delay = missingModuleDelay(exits);
      if (delay === null) break;
      waits.push(delay);
    }
    expect(waits.slice(0, 3)).toEqual([3_000, 10_000, 30_000]);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(223_000);
    expect(missingModuleDelay(MISSING_MODULE_DELAYS_MS.length)).toBeNull();
  });

  it('starts the Core with Node options the bundled Electron runtime accepts', async () => {
    expect(CORE_NODE_FLAGS).toContain('--use-system-ca');
    // the desktop-pet World frees a stopped speech model at once (upstream #298)
    expect(CORE_NODE_FLAGS).toContain('--expose-gc');
    // an unknown option makes the runtime exit 9 before anything runs
    const child = spawn(electron, [...CORE_NODE_FLAGS, '-e', 'process.exit(0)'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const code = await new Promise<number | null>((r, reject) => { child.on('exit', r); child.on('error', reject); });
    expect(code, stderr).toBe(0);
  });

  it('retries a start that cannot find its modules without a notification, gives up after the last wait, and starts afresh after failing', async () => {
    const appRoot = join(scratch, 'app');
    const logDir = join(scratch, 'logs');
    mkdirSync(appRoot, { recursive: true });
    const make = () => {
      const host = new CoreHost({ appRoot, logDir, execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'PROXY proxy.test:7890' });
      host.on('state', (state: string, detail?: string) => states.push([state, detail]));
      return host;
    };
    const states: [string, string | undefined][] = [];
    const next = (host: Host, want: string) => new Promise<string | undefined>((r) => {
      const on = (state: string, detail?: string) => { if (state === want) { host.off('state', on); r(detail); } };
      host.on('state', on);
    });
    // core/boot.ts is not there: the child exits before it is ready with a missing module
    const first = make();
    try {
      const restarting = next(first, 'restarting');
      await first.start();
      expect(await restarting).toBeUndefined();
      expect(first.missingModuleExits).toBe(1);
      // the crash budget is not spent on it
      expect(first.crashes).toEqual([]);
    } finally { await first.stop(); }

    const last = make();
    try {
      last.missingModuleExits = MISSING_MODULE_DELAYS_MS.length;
      const failed = next(last, 'failed');
      await last.start();
      expect(await failed).toMatch(/找不到所需的文件.*从托盘菜单选择「退出」/);
      // what a second launch of the app does after `failed`: the next start has a full budget again
      const restarting = next(last, 'restarting');
      await last.start();
      expect(await restarting).toBeUndefined();
      expect(last.missingModuleExits).toBe(1);
    } finally { await last.stop(); }
    const log = readFileSync(join(logDir, 'core.log'), 'utf8');
    // the proxy is looked up per host as the Core's requests go out (core/system-proxy.ts), not once at the start
    expect(log).toContain('proxy: system, looked up per host as requests go out');
    expect(log).toMatch(/exited before ready; app argv .*boot\.ts missing; .*loader\.mjs (exists|missing)/);
    expect(states.filter(([s]) => s === 'restarting').every(([, d]) => d === undefined)).toBe(true);
  });

  it('does not restart a Core that said another process holds the data directory, and names that process', async () => {
    const appRoot = join(scratch, 'locked');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    // what core/companion.ts does when bot.start() throws InstanceLockedError
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "process.send({ type: 'companion:locked', pid: 4242, file: '/data/companion/.instance.lock' }, () => process.exit(1));",
    ].join('\n'));
    const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
    const states: [string, string | undefined][] = [];
    host.on('state', (state: string, detail?: string) => states.push([state, detail]));
    try {
      const failed = new Promise<string | undefined>((r) => host.on('state', (state: string, detail?: string) => { if (state === 'failed') r(detail); }));
      await host.start();
      expect(await failed).toMatch(/另一个进程\(PID 4242\)正在使用.*「重新启动」.*\/data\/companion\/\.instance\.lock/);
      expect(states.map(([s]) => s)).toEqual(['starting', 'failed']);
      expect(host.crashes).toEqual([]);
      expect(host.child).toBeNull();
    } finally { await host.stop(); }
  });

  it('does not restart a Core that said every console port is taken, and names the ports', async () => {
    const appRoot = join(scratch, 'ports-busy');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    // what core/companion.ts does when bot.start() throws the last console port's EADDRINUSE
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "process.send({ type: 'companion:ports-busy', from: 17788, to: 17792 }, () => process.exit(1));",
    ].join('\n'));
    const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
    const states: [string, string | undefined][] = [];
    host.on('state', (state: string, detail?: string) => states.push([state, detail]));
    try {
      const failed = new Promise<string | undefined>((r) => host.on('state', (state: string, detail?: string) => { if (state === 'failed') r(detail); }));
      await host.start();
      const detail = await failed;
      expect(detail).toBe(textOf('zh').corePortsBusy(17788, 17792));
      expect(detail).toMatch(/控制台端口 17788–17792 都被占用.*5 个 Coopanion.*「重新启动」/);
      expect(states.map(([s]) => s)).toEqual(['starting', 'failed']);
      expect(host.crashes).toEqual([]);
      expect(host.child).toBeNull();
      // the next start (Restart in the tray) is not held by what the last child said
      expect(host.blocked).toBeNull();
    } finally { await host.stop(); }
  });

  // upstream #311: a Core that does not stop is killed and waited for, and that restart is no crash
  it('stops a Core that exits on the shutdown request without killing it', async () => {
    const appRoot = join(scratch, 'clean-stop');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "process.on('message', (m) => { if (m?.type === 'companion:shutdown') process.exit(0); });",
      "process.send({ type: 'companion:ready', port: 1 });",
    ].join('\n'));
    const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
    const states: string[] = [];
    host.on('state', (state: string) => states.push(state));
    const ready = new Promise((r) => host.once('ready', r));
    await host.start();
    await ready;
    const child = host.child!;
    const started = Date.now();
    await host.stop();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(child.signalCode).toBeNull();
    expect(child.exitCode).toBe(0);
    expect(states).toEqual(['starting', 'running', 'stopped']);
    expect(host.crashes).toEqual([]);
  });

  it('kills a Core that ignores the shutdown request and SIGTERM, then restarts it without counting a crash', async () => {
    const appRoot = join(scratch, 'hung-stop');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    // what a Core whose shutdown hangs does: it already treats SIGTERM as another shutdown request
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "process.on('SIGTERM', () => {});",
      "process.on('message', () => {});",
      "setInterval(() => {}, 1000);",
      "process.send({ type: 'companion:ready', port: 1 });",
    ].join('\n'));
    const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
    const states: string[] = [];
    host.on('state', (state: string) => states.push(state));
    const stop = host.stop.bind(host);
    host.stop = (graceMs?: number) => stop(graceMs ?? 50);
    // every child started, so a failing run (one that only sends SIGTERM) leaves none of them running
    let first: ChildProcess | null = null;
    try {
      let ready = new Promise((r) => host.once('ready', r));
      await host.start();
      await ready;
      first = host.child!;
      ready = new Promise((r) => host.once('ready', r));
      await host.restart();
      await ready;
      expect(first.signalCode).toBe('SIGKILL');
      expect(host.child).not.toBe(first);
      expect(host.crashes).toEqual([]);
      await host.stop();
      expect(host.child).toBeNull();
      expect(states).toEqual(['starting', 'running', 'stopped', 'starting', 'running', 'stopped']);
      expect(host.crashes).toEqual([]);
    } finally { first?.kill('SIGKILL'); host.child?.kill('SIGKILL'); }
  });

  // upstream #456: the settings window's power button shuts the Core down on purpose (app/shutdown-mark.cjs marks it)
  describe('a shutdown from the console', () => {
    /** A Core that is ready, then exits with `code` when told `test:exit` (what Cortico does after a shutdown). */
    const consoleCore = (name: string) => {
      const appRoot = join(scratch, name);
      mkdirSync(join(appRoot, 'core'), { recursive: true });
      writeFileSync(join(appRoot, 'core', 'boot.ts'), [
        "process.on('message', (m) => { if (m?.type === 'test:exit') process.exit(m.code); if (m?.type === 'companion:shutdown') process.exit(0); });",
        "process.send({ type: 'companion:ready', port: 1 });",
      ].join('\n'));
      const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
      const states: [string, string | undefined][] = [];
      host.on('state', (state: string, detail?: string) => states.push([state, detail]));
      return { host, states };
    };
    const ready = (host: Host) => new Promise((r) => host.once('ready', r));
    /** Has the running child exit with `code` and waits longer than the 3 s restart delay, so a restart would show. */
    const exitAndWait = async (host: Host, code: number) => {
      const exited = new Promise((r) => host.child!.once('exit', r));
      host.send({ type: 'test:exit', code });
      await exited;
      await new Promise((r) => setTimeout(r, 3500));
    };

    // Cortico exits 0 after a complete shutdown and 1 when a step was skipped (bot.ts beginShutdown): both were asked for
    for (const code of [0, 1]) {
      it(`leaves Core stopped after the console asked for a shutdown (exit ${code}), with no restart and no notification`, async () => {
        const { host, states } = consoleCore(`console-stop-${code}`);
        try {
          const up = ready(host);
          await host.start();
          await up;
          host.expectStop();
          await exitAndWait(host, code);
          expect(host.child).toBeNull();
          expect(host.state).toBe('stopped');
          expect(host.crashes).toEqual([]);
          expect(host.shutdownAsked).toBe(false);
          // no detail: the app shows a notification only for a state with one
          expect(states).toEqual([['starting', undefined], ['running', undefined], ['stopped', undefined]]);
          // the tray's 「重新启动」 starts it again
          const again = ready(host);
          await host.restart();
          await again;
          expect(host.state).toBe('running');
        } finally { await host.stop(); }
      }, 20_000);
    }

    it('treats the exit as a crash again when the shutdown request was refused', async () => {
      const { host, states } = consoleCore('console-refused');
      try {
        const up = ready(host);
        await host.start();
        await up;
        host.expectStop();
        host.forgetStop();
        const restarted = ready(host);
        await exitAndWait(host, 0);
        await restarted;
        expect(host.crashes).toHaveLength(1);
        expect(states.map(([s]) => s)).toEqual(['starting', 'running', 'restarting', 'starting', 'running']);
        // the restart is told (a notification in the app)
        expect(states[2][1]).toBeTruthy();
      } finally { await host.stop(); }
    }, 20_000);

    it('ignores a shutdown mark while no Core runs, and a new child starts unmarked', async () => {
      const { host } = consoleCore('console-idle');
      host.expectStop();
      expect(host.shutdownAsked).toBe(false);
      try {
        // a mark left over from an earlier child (an exit while stopping clears it too, so it is set by hand here):
        // the new child's start clears it, and that child's unexpected exit is a crash again
        host.shutdownAsked = true;
        const up = ready(host);
        await host.start();
        expect(host.shutdownAsked).toBe(false);
        await up;
        const restarted = ready(host);
        await exitAndWait(host, 0);
        await restarted;
        expect(host.crashes).toHaveLength(1);
      } finally { await host.stop(); }
    }, 20_000);
  });

  // upstream #331: the Core asks for the system proxy of each host it reaches; the app answers from resolveProxy
  it('answers the Core\'s proxy questions from resolveProxy, per URL', async () => {
    const appRoot = join(scratch, 'proxy-ask');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "const asked = ['https://api.deepseek.com', 'https://api.openai.com'];",
      "const answers = [];",
      "process.on('message', (m) => {",
      "  if (m?.type !== 'companion:proxy') return;",
      "  answers[m.id] = m;",
      "  if (answers.filter(Boolean).length === asked.length) { console.log('answers ' + JSON.stringify(answers.filter(Boolean))); process.send({ type: 'companion:ready', port: 1 }); }",
      "});",
      "asked.forEach((url, i) => process.send({ type: 'companion:proxy', id: i, url }));",
      "process.on('message', (m) => { if (m?.type === 'companion:shutdown') process.exit(0); });",
    ].join('\n'));
    const logDir = join(scratch, 'proxy-logs');
    const seen: string[] = [];
    const host = new CoreHost({ appRoot, logDir, execPath: electron, env: { PATH: process.env.PATH },
      resolveProxy: async (url) => { seen.push(url); return url.includes('openai') ? 'PROXY 127.0.0.1:7897; DIRECT' : 'DIRECT'; } });
    const ready = new Promise((r) => host.once('ready', r));
    await host.start();
    await ready;
    await host.stop();
    expect(seen).toEqual(['https://api.deepseek.com', 'https://api.openai.com']);
    const line = readFileSync(join(logDir, 'core.log'), 'utf8').split('\n').find((l) => l.startsWith('answers '))!;
    expect(JSON.parse(line.slice(8))).toEqual([
      { type: 'companion:proxy', id: 0, proxy: null, rule: 'DIRECT' },
      { type: 'companion:proxy', id: 1, proxy: 'http://127.0.0.1:7897', rule: 'PROXY 127.0.0.1:7897' },
    ]);
  });

  // Windows does not keep the stderr pipe open through a grandchild that inherits it, so no exit is ever held there;
  // the restart path is the same on every platform
  it.skipIf(process.platform === 'win32')('restarts on demand while a child that exited is still held for its last stderr lines', async () => {
    const appRoot = join(scratch, 'held');
    mkdirSync(join(appRoot, 'core'), { recursive: true });
    // a start that fails on a missing module while a process it started keeps its stderr open, so the host waits
    // the full second for the last lines
    writeFileSync(join(appRoot, 'core', 'boot.ts'), [
      "import { spawn } from 'node:child_process';",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], { stdio: ['ignore', 'ignore', 'inherit'] }).unref();",
      "process.stderr.write(\"Error: Cannot find module './missing'\\n\");",
      'process.exitCode = 1;',
    ].join('\n'));
    const host = new CoreHost({ appRoot, logDir: join(scratch, 'logs'), execPath: electron, env: { PATH: process.env.PATH }, resolveProxy: async () => 'DIRECT' });
    const states: string[] = [];
    host.on('state', (state: string) => states.push(state));
    try {
      let held = false;
      await host.start();
      // registered after the host's own exit handler: the tray's 「重新启动」 right after the exit
      const restarted = await new Promise<Promise<void>>((r) => host.child!.once('exit', () => { held = host.child !== null; r(host.restart()); }));
      await restarted;
      // the exit is let go as stopped, not as a missing-module exit, and a new child is started
      expect(held).toBe(true);
      expect(states.slice(0, 3)).toEqual(['starting', 'stopped', 'starting']);
      expect(host.missingModuleExits).toBe(0);
      expect(host.crashes).toEqual([]);
      expect(host.child).not.toBeNull();
    } finally { await host.stop(); }
  });
});
