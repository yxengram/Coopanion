// Small talk as the World runs it (src/smalltalk.ts has the gates themselves): the look every 30 s with fake
// timers, the `[闲聊]` event rendered at delivery, rate limiting across declined attempts, and the page's focus report.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS, DESKTOP_PET_CONFIG_GROUP, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld, type DesktopPetWorldOptions } from '../src/world.ts';
import { SMALLTALK_TICK_MS } from '../src/smalltalk.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';

const M = 60_000;
/** 2026-10-17 14:00 in Shanghai. */
const T0 = Date.UTC(2026, 9, 17, 6, 0);

let cleanup: Array<() => Promise<void>> = [];
beforeEach(() => {
  // the World's looks (setInterval) and its clock; sockets and their timeouts stay real
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
  vi.useRealTimers();
});

/** Waits (on real timeouts) until `cond` holds. */
async function until(cond: () => boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(cond()).toBe(true);
}

interface Setup {
  patch?: (c: DesktopPetConfigSection) => void;
  extra?: Partial<DesktopPetWorldOptions>;
  page?: boolean;
}

async function setup({ patch, extra, page: withPage = true }: Setup = {}) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  cfg.smallTalk.enabled = true;
  patch?.(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-st-'));
  const state = { idleSec: 10, locked: false, nextAlarm: null as number | null };
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai',
    persist: (p) => { Object.assign(cfg, p); },
    runtimesRoot: () => join(dir, 'runtimes'), modelsDir: () => join(dir, 'models'),
    presence: () => ({ idleSec: state.idleSec, locked: state.locked, at: Date.now() }),
    nextAlarmAt: () => state.nextAlarm,
    ...extra,
  });
  const host = new FakeHost();
  await world.start(host);
  cleanup.push(() => world.stop());
  let page: FakePage | null = null;
  if (withPage) {
    page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    cleanup.push(() => page!.close());
  }
  const why = () => (world.petState().smallTalk as { why: string | null }).why;
  const tick = (ms = SMALLTALK_TICK_MS) => vi.advanceTimersByTime(ms);
  return { world, host, page, cfg, state, why, tick };
}

const smallTalks = (host: FakeHost) => host.deferred.filter((d) => d.spec.type === 'desktop-pet.smalltalk');

describe('small talk in the World', () => {
  it('is declared off by default, with its frequency and quiet hours, all hot', () => {
    expect(DESKTOP_PET_DEFAULTS.smallTalk).toEqual({ enabled: false, frequency: 'mid', quietFrom: '23:00', quietTo: '08:00' });
    const props = DESKTOP_PET_CONFIG_GROUP.schema.properties;
    expect(props['worlds.desktop-pet.smallTalk.frequency']).toMatchObject({ enum: ['low', 'mid', 'high'], 'x-hot': true });
    for (const k of ['enabled', 'quietFrom', 'quietTo']) expect(props[`worlds.desktop-pet.smallTalk.${k}`]?.['x-hot']).toBe(true);
  });

  it('quiet-hour times that do not read as HH:MM (edited by hand) are the default ones, not no quiet hours', async () => {
    const { world } = await setup({ patch: (c) => { c.smallTalk.quietFrom = '11pm'; c.smallTalk.quietTo = ''; } });
    // 00:30 in Shanghai: inside the default 23:00–08:00
    vi.setSystemTime(Date.UTC(2026, 9, 17, 16, 30));
    expect(world.lookForSmallTalk()).toEqual({ go: false, why: 'quiet hours' });
  });

  it('switched off (the default) never wakes the bot', async () => {
    const { host, tick, why } = await setup({ patch: (c) => { c.smallTalk.enabled = false; } });
    tick(5 * 3600_000);
    expect(smallTalks(host)).toEqual([]);
    expect(why()).toBe('off');
  });

  it('waits a whole gap after start, wakes once with [闲聊], then not again before the next gap though the bot said nothing', async () => {
    const { host, tick, why } = await setup();
    tick();
    expect(why()).toBe('rate limit');
    expect(smallTalks(host)).toEqual([]);
    tick(60 * M);
    expect(smallTalks(host)).toHaveLength(1);
    expect(smallTalks(host)[0]).toMatchObject({ spec: { origin: 'internal' }, opts: { trigger: 'flush' } });
    // nothing more is pushed while that one waits
    tick();
    expect(smallTalks(host)).toHaveLength(1);
    expect(why()).toBe('waiting');
    const [text] = await host.deliverDeferred();
    expect(text).toMatch(/^\[10-17 周六 15:0\d\] \[闲聊\] 伙伴在电脑前,你们已经 6\d 分钟没说话了。现在是下午。/);
    expect(text).toContain('不用回应这条');
    // the bot declined (no turn, nothing said): still an attempt
    tick(30 * M);
    expect(smallTalks(host)).toEqual([]);
    expect(why()).toBe('rate limit');
    tick(31 * M);
    expect(smallTalks(host)).toHaveLength(1);
  });

  it('frequency 多 halves the gap; the last thing said is the topic', async () => {
    const { world, host, page, tick } = await setup({ patch: (c) => { c.smallTalk.frequency = 'high'; } });
    page!.send({ t: 'text', text: '晚上想吃火锅' });
    await until(() => host.events.length === 1);
    world.onEventsSettled(host.events, 'delivered');
    tick(29 * M);
    expect(smallTalks(host)).toEqual([]);
    tick(2 * M);
    expect(smallTalks(host)).toHaveLength(1);
    const [text] = await host.deliverDeferred();
    expect(text).toContain('伙伴上次说的是(31 分钟前):「晚上想吃火锅」。');
  });

  it('the person talking meanwhile makes a waiting one say nothing', async () => {
    const { world, host, page, tick, why } = await setup();
    tick(61 * M);
    expect(smallTalks(host)).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1000);
    page!.send({ t: 'text', text: '在吗' });
    await until(() => host.events.length === 1);
    expect(await host.deliverDeferred()).toEqual([null]);
    world.onEventsSettled(host.events, 'delivered');
    // not counted as an attempt, but the talk starts the lull again
    tick(59 * M);
    expect(smallTalks(host)).toEqual([]);
    expect(why()).toBe('recent talk');
    tick(2 * M);
    expect(smallTalks(host)).toHaveLength(1);
  });

  it('holds back while the page reports the window hidden, a full screen window or the typing box', async () => {
    const { host, page, tick, why } = await setup();
    // one delivered: the gates below come before the rate limit
    tick(61 * M);
    await host.deliverDeferred();
    for (const [focus, reason] of [[{ shown: false }, 'hidden'], [{ shown: true, fullscreen: true }, 'fullscreen'], [{ fullscreen: false, typing: true }, 'typing']] as const) {
      page!.send({ t: 'focus', ...focus });
      await until(() => { tick(); return why() === reason; });
      expect(smallTalks(host)).toEqual([]);
    }
  });

  it('holds back while the person is away or the screen is locked, and greets them when they come back', async () => {
    const { host, state, tick, why } = await setup();
    tick(61 * M);
    await host.deliverDeferred();
    // away for 40 minutes, then back
    state.idleSec = 20 * 60;
    tick();
    expect(why()).toBe('away');
    state.idleSec = 0;
    state.locked = true;
    tick(70 * M);
    expect(why()).toBe('locked');
    state.locked = false;
    state.idleSec = 5;
    tick();
    expect(smallTalks(host)).toHaveLength(1);
    const [text] = await host.deliverDeferred();
    expect(text).toMatch(/\[闲聊\] 伙伴离开电脑大约 \d+ 分钟,刚回来。/);
  });

  it('keeps clear of quiet hours, a pet_quiet, a pause and a wake-up due soon', async () => {
    let paused = false;
    const { host, state, tick, why, world } = await setup({ extra: { controls: { isPaused: () => paused, setPaused: (p) => { paused = p; } } } });
    tick(61 * M);
    await host.deliverDeferred();
    paused = true;
    tick();
    expect(why()).toBe('paused');
    paused = false;
    state.nextAlarm = Date.now() + 10 * M;
    tick();
    expect(why()).toBe('alarm soon');
    state.nextAlarm = null;
    const quiet = await world.tools().find((t) => t.name === 'pet_quiet')!.handler({ minutes: 30 }, { role: 'main', log: host.log } as never);
    expect(quiet).not.toMatchObject({ failed: true });
    tick();
    expect(why()).toBe('pet_quiet');
    expect(smallTalks(host)).toEqual([]);
    // 23:30 local
    vi.setSystemTime(Date.UTC(2026, 9, 17, 15, 30));
    await world.tools().find((t) => t.name === 'pet_quiet')!.handler({ minutes: 0 }, { role: 'main', log: host.log } as never);
    tick();
    expect(why()).toBe('quiet hours');
  });

  it('a quiet-hour time that is not HH:MM falls back to the default rather than dropping quiet hours', async () => {
    const { host, tick, why } = await setup({ patch: (c) => { c.smallTalk.quietFrom = '11pm'; c.smallTalk.quietTo = ''; } });
    // 23:30 local, a whole gap after the start
    vi.setSystemTime(Date.UTC(2026, 9, 17, 15, 30));
    tick();
    expect(why()).toBe('quiet hours');
    expect(smallTalks(host)).toEqual([]);
  });

  it('a lent presence() whose reports stopped is shown as no presence', async () => {
    let at = Date.now();
    const { world, tick, why } = await setup({ extra: { presence: () => ({ idleSec: 10, locked: false, at }) } });
    expect(world.petState().smallTalk).toMatchObject({ presence: true });
    tick(5 * M);
    expect(why()).toBe('no presence');
    expect(world.petState().smallTalk).toMatchObject({ presence: false });
    at = Date.now();
    expect(world.petState().smallTalk).toMatchObject({ presence: true });
  });

  it('never starts without a presence report, nor with no pet page', async () => {
    const a = await setup({ extra: { presence: undefined } });
    a.tick(3 * 3600_000);
    expect(smallTalks(a.host)).toEqual([]);
    expect(a.why()).toBe('no presence');
    expect(a.world.petState().smallTalk).toMatchObject({ presence: false });
    const b = await setup({ page: false });
    b.tick(3 * 3600_000);
    expect(smallTalks(b.host)).toEqual([]);
    expect(b.why()).toBe('hidden');
  });
});
