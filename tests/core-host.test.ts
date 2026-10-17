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
  start(): Promise<void>;
  stop(graceMs?: number): Promise<void>;
  restart(): Promise<void>;
}
const { CoreHost, CORE_NODE_FLAGS, MISSING_MODULE_DELAYS_MS, isMissingModule, missingModuleDelay } = require('../app/core-host.cjs') as {
  CoreHost: new (opts: { appRoot: string, env: NodeJS.ProcessEnv, logDir: string, resolveProxy: (url: string) => Promise<string>, execPath?: string }) => Host;
  CORE_NODE_FLAGS: string[];
  MISSING_MODULE_DELAYS_MS: number[];
  isMissingModule(text: string): boolean;
  missingModuleDelay(exits: number): number | null;
};

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
    expect(log).toContain('proxy: system PROXY proxy.test:7890');
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
