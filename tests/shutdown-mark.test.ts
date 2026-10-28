/**
 * The settings window's power button is not a crash (upstream #456, app/shutdown-mark.cjs): its shutdown request is
 * marked from the default session's webRequest, and a refused one takes the mark back. main.cjs is read to check it
 * wires the mark to that session.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

type Details = { id: number; method: string; url: string; statusCode?: number };
type Listener = (details: Details, answer?: (response: object) => void) => void;
const { SHUTDOWN_FILTER, isConsoleShutdown, markConsoleShutdowns } = require('../app/shutdown-mark.cjs') as {
  SHUTDOWN_FILTER: { urls: string[] };
  isConsoleShutdown(details: { method: string; url: string }, coreOrigin: string | null): boolean;
  markConsoleShutdowns(webRequest: object, opts: { origin: () => string | null; core: { expectStop(): void; forgetStop(): void } }): void;
};

const core = 'http://127.0.0.1:17788';

/** A session's webRequest as Electron has it: one listener per event, each with its filter. */
function fakeSession() {
  const on: Record<string, { filter: { urls: string[] }; listener: Listener }> = {};
  const register = (event: string) => (filter: { urls: string[] }, listener: Listener) => { on[event] = { filter, listener }; };
  const webRequest = { onBeforeRequest: register('before'), onCompleted: register('completed'), onErrorOccurred: register('error') };
  const calls: string[] = [];
  const host = { expectStop: () => calls.push('expect'), forgetStop: () => calls.push('forget') };
  let origin: string | null = core;
  markConsoleShutdowns(webRequest, { origin: () => origin, core: host });
  const answers: object[] = [];
  return {
    on, calls, answers,
    setOrigin(o: string | null) { origin = o; },
    before: (d: Details) => on.before.listener(d, (r) => answers.push(r)),
    completed: (d: Details) => on.completed.listener(d),
    error: (d: Details) => on.error.listener(d),
  };
}

describe('the console\'s shutdown request', () => {
  it('is a POST to /api/run/shutdown on the running Core\'s origin, and nothing else', () => {
    expect(isConsoleShutdown({ method: 'POST', url: `${core}/api/run/shutdown` }, core)).toBe(true);
    // a restart goes through .restart-request and must stay a restart
    expect(isConsoleShutdown({ method: 'POST', url: `${core}/api/run/restart` }, core)).toBe(false);
    expect(isConsoleShutdown({ method: 'GET', url: `${core}/api/run/shutdown` }, core)).toBe(false);
    expect(isConsoleShutdown({ method: 'POST', url: 'http://127.0.0.1:7797/api/run/shutdown' }, core)).toBe(false);
    expect(isConsoleShutdown({ method: 'POST', url: `${core}/api/run/shutdown/x` }, core)).toBe(false);
    expect(isConsoleShutdown({ method: 'POST', url: `http://127.0.0.1:17788@elsewhere/api/run/shutdown` }, core)).toBe(false);
    expect(isConsoleShutdown({ method: 'POST', url: `${core}/api/run/shutdown` }, null)).toBe(false);
    expect(isConsoleShutdown({ method: 'POST', url: 'not a url' }, core)).toBe(false);
  });

  it('is watched on the Core\'s loopback address at any port', () => {
    expect(SHUTDOWN_FILTER.urls).toEqual(['http://127.0.0.1:*/api/run/shutdown']);
    const s = fakeSession();
    for (const event of ['before', 'completed', 'error']) expect(s.on[event].filter).toBe(SHUTDOWN_FILTER);
  });

  it('marks the stop before the request goes out and keeps it when Core answers 200', () => {
    const s = fakeSession();
    s.before({ id: 1, method: 'POST', url: `${core}/api/run/shutdown` });
    expect(s.calls).toEqual(['expect']);
    expect(s.answers).toEqual([{}]);
    s.completed({ id: 1, method: 'POST', url: `${core}/api/run/shutdown`, statusCode: 200 });
    expect(s.calls).toEqual(['expect']);
  });

  it('takes the mark back when Core refuses the shutdown', () => {
    const s = fakeSession();
    s.before({ id: 2, method: 'POST', url: `${core}/api/run/shutdown` });
    s.completed({ id: 2, method: 'POST', url: `${core}/api/run/shutdown`, statusCode: 503 });
    expect(s.calls).toEqual(['expect', 'forget']);
  });

  it('keeps the mark when the connection drops (Core exited before its reply)', () => {
    const s = fakeSession();
    s.before({ id: 3, method: 'POST', url: `${core}/api/run/shutdown` });
    s.error({ id: 3, method: 'POST', url: `${core}/api/run/shutdown` });
    // a late completion of the same id no longer counts
    s.completed({ id: 3, method: 'POST', url: `${core}/api/run/shutdown`, statusCode: 500 });
    expect(s.calls).toEqual(['expect']);
  });

  it('lets other requests pass without touching the mark', () => {
    const s = fakeSession();
    s.before({ id: 4, method: 'POST', url: 'http://127.0.0.1:7797/api/run/shutdown' });
    s.completed({ id: 4, method: 'POST', url: 'http://127.0.0.1:7797/api/run/shutdown', statusCode: 404 });
    s.setOrigin(null);
    s.before({ id: 5, method: 'POST', url: `${core}/api/run/shutdown` });
    s.completed({ id: 5, method: 'POST', url: `${core}/api/run/shutdown`, statusCode: 500 });
    expect(s.calls).toEqual([]);
    expect(s.answers).toEqual([{}, {}]);
  });

  it('answers the request even when marking throws', () => {
    const on: Record<string, Listener> = {};
    markConsoleShutdowns({
      onBeforeRequest: (_f: unknown, l: Listener) => { on.before = l; },
      onCompleted: () => {},
      onErrorOccurred: () => {},
    }, { origin: () => core, core: { expectStop: () => { throw new Error('boom'); }, forgetStop: () => {} } });
    const answers: object[] = [];
    expect(() => on.before({ id: 6, method: 'POST', url: `${core}/api/run/shutdown` }, (r) => answers.push(r))).toThrow('boom');
    expect(answers).toEqual([{}]);
  });

  it('is wired to the default session, beside the CSP rule', () => {
    const main = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'app', 'main.cjs'), 'utf8');
    expect(main).toMatch(/markConsoleShutdowns\(session\.defaultSession\.webRequest, \{ origin: coreOrigin, core \}\)/);
    // one listener per event and session: nothing else in the main process takes these three
    expect(main).not.toMatch(/webRequest\.on(BeforeRequest|Completed|ErrorOccurred)/);
    // opening the app again starts a Core the power button stopped, as one that stopped retrying
    expect(main).toMatch(/const bringBack = \(\) => \{[^}]*core\.state === 'failed' \|\| core\.state === 'stopped'\) void core\.start\(\);/);
  });
});
