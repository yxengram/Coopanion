import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * host/preload.cjs renews the page's wish for the mouse (host/mouse-lease.cjs keeps it as a lease) after the page has
 * answered a cursor report, since the page sends a wish only when it changes. Run here with a stand-in for Electron.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('../host/preload.cjs', import.meta.url)), 'utf8');

interface PetHost {
  setInteractive(on: boolean): void;
  onCursor(cb: (p: { x: number; y: number } | null) => void): void;
  onShown(cb: (shown: boolean) => void): void;
}

function loadPreload() {
  const sent: Array<[string, unknown]> = [];
  const listeners = new Map<string, Array<(e: unknown, ...args: unknown[]) => void>>();
  const ipcRenderer = {
    send: (channel: string, value: unknown) => { sent.push([channel, value]); },
    on: (channel: string, fn: (e: unknown, ...args: unknown[]) => void) => { listeners.set(channel, [...(listeners.get(channel) ?? []), fn]); },
    invoke: async () => null,
  };
  let api: PetHost | null = null;
  const contextBridge = { exposeInMainWorld: (_name: string, value: PetHost) => { api = value; } };
  runInNewContext(SOURCE, { require: (m: string) => { if (m !== 'electron') throw new Error(m); return { contextBridge, ipcRenderer }; }, setTimeout, Date });
  /** The window process sends on `channel`: every listener runs, in the order they were added. */
  const emit = (channel: string, ...args: unknown[]) => { for (const fn of listeners.get(channel) ?? []) fn({}, ...args); };
  const wishes = () => sent.filter(([c]) => c === 'pet:interactive').map(([, v]) => v);
  return { host: api! as PetHost, emit, wishes };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
afterEach(() => { vi.useRealTimers(); });

describe('preload mouse lease renewal', () => {
  it('renews a held wish on cursor reports, at most every half second', () => {
    const { host, emit, wishes } = loadPreload();
    host.onCursor(() => {});
    host.setInteractive(true);
    expect(wishes()).toEqual([true]);
    emit('pet:cursor', { x: 1, y: 1 });
    vi.advanceTimersByTime(100);
    expect(wishes()).toEqual([true]);
    for (let i = 0; i < 5; i++) { emit('pet:cursor', { x: 1, y: 1 }); vi.advanceTimersByTime(100); }
    expect(wishes()).toEqual([true, true]);
  });

  it('does not renew a wish the page dropped in its answer to the same report', () => {
    const { host, emit, wishes } = loadPreload();
    host.onCursor((p) => { if (!p) host.setInteractive(false); });
    host.setInteractive(true);
    vi.advanceTimersByTime(600);
    emit('pet:cursor', null);
    vi.advanceTimersByTime(10);
    expect(wishes()).toEqual([true, false]);
    emit('pet:cursor', null);
    vi.advanceTimersByTime(600);
    emit('pet:cursor', null);
    vi.advanceTimersByTime(10);
    expect(wishes()).toEqual([true, false, false, false]);
  });

  it('renews nothing while the page does not want the mouse, and passes on whether the window is shown', () => {
    const { host, emit, wishes } = loadPreload();
    const shown: boolean[] = [];
    host.onShown((s) => shown.push(s));
    for (let i = 0; i < 10; i++) { emit('pet:cursor', { x: 1, y: 1 }); vi.advanceTimersByTime(100); }
    expect(wishes()).toEqual([]);
    emit('pet:shown', false);
    emit('pet:shown', 1);
    expect(shown).toEqual([false, true]);
  });
});
