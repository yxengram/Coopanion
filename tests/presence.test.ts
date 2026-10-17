// The presence pipeline small talk depends on, outside the World: the app's powerMonitor reports (app/presence.cjs),
// the Core's reading of `companion:presence` (core/presence.ts, as core/companion.ts uses it) and the hand-off
// through desktopPetDefinition({ presence }) to the World, whose small talk then gets past the presence gate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_PET_DEFAULTS, desktopPetDefinition, type DesktopPetWorld } from 'cortico-world-desktop-pet';
import { presenceFrom, type PresenceReport } from '../core/presence.ts';
const require = createRequire(import.meta.url);

const { PRESENCE_EVERY_MS, startPresence } = require('../app/presence.cjs') as {
  PRESENCE_EVERY_MS: number;
  startPresence(opts: { powerMonitor: unknown; send(msg: unknown): void; onReady?(fn: () => void): void; every?: number }): { stop(): void };
};

/** 2026-10-17 14:00 in Shanghai. */
const T0 = Date.UTC(2026, 9, 17, 6, 0);

class FakePowerMonitor extends EventEmitter {
  idle = 12;
  state = 'active';
  fail = false;
  getSystemIdleTime(): number { if (this.fail) throw new Error('no idle time'); return this.idle; }
  getSystemIdleState(): string { return this.state; }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('app presence reports', () => {
  it('reports on ready, every interval, and at once on lock, unlock, sleep and wake', () => {
    const pm = new FakePowerMonitor();
    const sent: unknown[] = [];
    let ready: (() => void) | null = null;
    const p = startPresence({ powerMonitor: pm, send: (m) => sent.push(m), onReady: (fn) => { ready = fn; } });
    expect(sent).toEqual([]);
    ready!();
    expect(sent).toEqual([{ type: 'companion:presence', idleSec: 12, locked: false }]);
    vi.advanceTimersByTime(PRESENCE_EVERY_MS);
    expect(sent).toHaveLength(2);
    pm.emit('lock-screen');
    expect(sent.at(-1)).toEqual({ type: 'companion:presence', idleSec: 12, locked: true });
    pm.emit('unlock-screen');
    expect(sent.at(-1)).toMatchObject({ locked: false });
    pm.emit('suspend');
    expect(sent.at(-1)).toMatchObject({ locked: true });
    pm.emit('resume');
    expect(sent.at(-1)).toMatchObject({ locked: false });
    // the system's own idle state says locked
    pm.state = 'locked';
    vi.advanceTimersByTime(PRESENCE_EVERY_MS);
    expect(sent.at(-1)).toMatchObject({ locked: true });
    p.stop();
  });

  it('a powerMonitor that throws sends nothing rather than a broken report', () => {
    const pm = new FakePowerMonitor();
    pm.fail = true;
    const sent: unknown[] = [];
    const p = startPresence({ powerMonitor: pm, send: (m) => sent.push(m) });
    vi.advanceTimersByTime(3 * PRESENCE_EVERY_MS);
    expect(sent).toEqual([]);
    p.stop();
  });
});

describe('the Core reading companion:presence', () => {
  it('keeps well-formed reports with when they came, and ignores anything else', () => {
    expect(presenceFrom({ type: 'companion:presence', idleSec: 30, locked: true }, T0)).toEqual({ idleSec: 30, locked: true, at: T0 });
    expect(presenceFrom({ type: 'companion:presence', idleSec: -1 }, T0)).toEqual({ idleSec: 0, locked: false, at: T0 });
    expect(presenceFrom({ type: 'companion:presence', idleSec: '30' }, T0)).toBeNull();
    expect(presenceFrom({ type: 'companion:presence', idleSec: Number.NaN }, T0)).toBeNull();
    expect(presenceFrom({ type: 'companion:update', idleSec: 30 }, T0)).toBeNull();
    expect(presenceFrom(null, T0)).toBeNull();
  });
});

describe('from powerMonitor to the World', () => {
  it('the World lent the Core\'s last report sees the person at the computer, and loses them when reports stop', () => {
    const pm = new FakePowerMonitor();
    let presence: PresenceReport | null = null;
    // what core/companion.ts does with each message from the app
    const onMessage = (msg: unknown) => { presence = presenceFrom(msg, Date.now()) ?? presence; };
    let ready: (() => void) | null = null;
    const p = startPresence({ powerMonitor: pm, send: onMessage, onReady: (fn) => { ready = fn; } });
    const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
    cfg.port = 0;
    cfg.window.enabled = false;
    cfg.asr.enabled = false;
    cfg.smallTalk.enabled = true;
    const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '.cache', 'presence-test');
    const def = desktopPetDefinition({ presence: () => presence });
    const world = def.create({
      id: 'desktop-pet', cfg, timezone: 'Asia/Shanghai', botName: 'Coo', botDir: dir, packageDir: dir, dataDir: dir, repoRoot: dir,
      secret: () => '', storeSecret: () => {}, persist: () => {}, restart: async () => {},
    } as never) as unknown as DesktopPetWorld;
    const state = () => world.petState().smallTalk as { presence: boolean };
    expect(state().presence).toBe(false);
    expect(world.lookForSmallTalk()).toEqual({ go: false, why: 'no presence' });
    ready!();
    expect(state().presence).toBe(true);
    // past the presence gates: held back only because no pet page is connected
    expect(world.lookForSmallTalk()).toEqual({ go: false, why: 'hidden' });
    pm.emit('lock-screen');
    expect(world.lookForSmallTalk()).toEqual({ go: false, why: 'locked' });
    pm.emit('unlock-screen');
    // the app goes quiet: after two minutes the last report is no report
    p.stop();
    vi.advanceTimersByTime(3 * 60_000);
    expect(state().presence).toBe(false);
    expect(world.lookForSmallTalk()).toEqual({ go: false, why: 'no presence' });
  });
});
