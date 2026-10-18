import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Logger } from 'cortico/core/types.ts';
import { WindowHost, exitCodeText } from '../src/window-host.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/window-exit.js', import.meta.url));

/** A logger that keeps each warn line (every area writes to the same list). */
function warnings(): { log: Logger; warned: string[] } {
  const warned: string[] = [];
  const log: Logger = {
    trace() {}, debug() {}, info() {}, error() {}, emit() {},
    warn: (msg: string) => { warned.push(msg); },
    child: () => log,
  };
  return { log, warned };
}

const stopped = (host: WindowHost) => new Promise<void>((resolve) => {
  const poll = setInterval(() => { if (!host.running) { clearInterval(poll); resolve(); } }, 10);
});

describe('the pet window process in the log', () => {
  it('writes a WARN when the window process exits by itself with a failure, and none for a clean exit', async () => {
    const { log, warned } = warnings();
    const host = new WindowHost(log);
    host.start({ command: process.execPath, args: [FIXTURE, '3'], source: 'test' });
    await stopped(host);
    expect(warned).toEqual([`窗口进程退出(退出码 ${exitCodeText(3, null)})`]);
    expect(host.state().phase).toBe('stopped');

    host.start({ command: process.execPath, args: [FIXTURE, '0'], source: 'test' });
    await stopped(host);
    expect(warned).toHaveLength(1);
  });

  it('writes nothing when the window is stopped on purpose', async () => {
    const { log, warned } = warnings();
    const host = new WindowHost(log);
    host.start({ command: process.execPath, args: [FIXTURE], source: 'test' });
    await new Promise((r) => setTimeout(r, 200));
    await host.stop();
    await new Promise((r) => setTimeout(r, 100));
    expect(warned).toEqual([]);
  });

  it('writes a WARN when the window process cannot be started', async () => {
    const { log, warned } = warnings();
    const host = new WindowHost(log);
    host.start({ command: fileURLToPath(new URL('./fixtures/no-such-window-host', import.meta.url)), args: [], source: 'test' });
    for (let i = 0; i < 100 && !warned.length; i++) await new Promise((r) => setTimeout(r, 10));
    expect(warned[0]).toMatch(/^窗口进程出错:.*ENOENT/);
  });

  it('writes Windows exit codes in hex and a signal by name', () => {
    expect(exitCodeText(-2147483645, null, 'win32')).toBe('0x80000003');
    expect(exitCodeText(1, null, 'win32')).toBe('0x1');
    expect(exitCodeText(3, null, 'darwin')).toBe('3');
    expect(exitCodeText(null, 'SIGSEGV', 'linux')).toBe('SIGSEGV');
  });
});
