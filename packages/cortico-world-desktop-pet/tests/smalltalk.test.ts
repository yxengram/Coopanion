import { describe, expect, it } from 'vitest';
import {
  ALARM_SOON_MS, AWAY_IDLE_S, BACK_WINDOW_MS, PRESENT_IDLE_S, SMALLTALK_GAP_MS, SmallTalk, inQuietHours, localMinutes, parseClock, partOfDay, smallTalkText,
  type SmallTalkSignals,
} from '../src/smalltalk.ts';

const TZ = 'Asia/Shanghai';
/** 2026-10-17 14:00 in Shanghai. */
const T0 = Date.UTC(2026, 9, 17, 6, 0);
const H = 3600_000;
const M = 60_000;

function signals(over: Partial<SmallTalkSignals> = {}): SmallTalkSignals {
  return {
    now: T0, enabled: true, frequency: 'mid', quietFrom: '23:00', quietTo: '08:00', timezone: TZ,
    presence: { idleSec: 20, locked: false }, shown: true, fullscreen: false, paused: false, quiet: false, asleep: false,
    busy: null, lastTalkAt: T0 - 3 * H, lastAttemptAt: 0, nextAlarmAt: null,
    ...over,
  };
}

describe('clock helpers', () => {
  it('reads local minutes in the time zone', () => {
    expect(localMinutes(TZ, T0)).toBe(14 * 60);
    expect(localMinutes('UTC', T0)).toBe(6 * 60);
  });

  it('parses HH:MM and rejects the rest', () => {
    expect(parseClock('08:30')).toBe(510);
    expect(parseClock('8:05')).toBe(485);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('12:60')).toBeNull();
    expect(parseClock('noon')).toBeNull();
  });

  it('quiet hours wrap midnight; equal or broken times mean none', () => {
    expect(inQuietHours(23 * 60 + 30, '23:00', '08:00')).toBe(true);
    expect(inQuietHours(3 * 60, '23:00', '08:00')).toBe(true);
    expect(inQuietHours(8 * 60, '23:00', '08:00')).toBe(false);
    expect(inQuietHours(14 * 60, '23:00', '08:00')).toBe(false);
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
    expect(inQuietHours(14 * 60, '12:00', '14:00')).toBe(false);
    expect(inQuietHours(3 * 60, '00:00', '00:00')).toBe(false);
    expect(inQuietHours(3 * 60, 'x', '08:00')).toBe(false);
  });

  it('names the part of the day', () => {
    expect([2, 6, 9, 12, 15, 18, 21, 23].map((h) => partOfDay(h * 60))).toEqual(['深夜', '清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜']);
  });
});

describe('gating', () => {
  const st = () => new SmallTalk(T0 - 10 * H);

  it('goes in a lull when everything lets it', () => {
    expect(st().decide(signals())).toEqual({ go: true, occasion: 'lull', awayMin: 0, sinceTalkMin: 180, idleMin: 0 });
  });

  it.each<[string, Partial<SmallTalkSignals>]>([
    ['off', { enabled: false }],
    ['no presence', { presence: null }],
    ['locked', { presence: { idleSec: 0, locked: true } }],
    ['away', { presence: { idleSec: PRESENT_IDLE_S, locked: false } }],
    ['hidden', { shown: false }],
    ['fullscreen', { fullscreen: true }],
    ['paused', { paused: true }],
    ['pet_quiet', { quiet: true }],
    ['asleep', { asleep: true }],
    ['quiet hours', { now: Date.UTC(2026, 9, 17, 16, 0) /* 00:00 local */, lastTalkAt: Date.UTC(2026, 9, 17, 12, 0) }],
    ['typing', { busy: 'typing' }],
    ['alarm soon', { nextAlarmAt: T0 + ALARM_SOON_MS }],
    ['recent talk', { lastTalkAt: T0 - 59 * M }],
  ])('holds back: %s', (why, over) => {
    expect(st().decide(signals(over))).toEqual({ go: false, why });
  });

  it('an alarm due later does not hold it back', () => {
    expect(st().decide(signals({ nextAlarmAt: T0 + ALARM_SOON_MS + M })).go).toBe(true);
  });

  it('a start counts as an attempt: the first waits a whole gap', () => {
    const s = new SmallTalk(T0 - 30 * M);
    expect(s.decide(signals())).toEqual({ go: false, why: 'rate limit' });
    expect(s.decide(signals({ now: T0 + 30 * M })).go).toBe(true);
  });

  it.each([['low', 2 * H], ['mid', H], ['high', 30 * M]] as const)('%s: attempts at least %d ms apart, declined or not', (frequency, gap) => {
    expect(SMALLTALK_GAP_MS[frequency]).toBe(gap);
    const s = st();
    const base = { frequency, lastTalkAt: T0 - 5 * H };
    expect(s.decide(signals({ ...base })).go).toBe(true);
    s.attempted(T0);
    // the bot said nothing: still an attempt
    expect(s.decide(signals({ ...base, now: T0 + gap - 1 }))).toEqual({ go: false, why: 'rate limit' });
    expect(s.decide(signals({ ...base, now: T0 + gap })).go).toBe(true);
  });
});

describe('coming back', () => {
  it('greets after an absence even though the gap since they talked is short, once', () => {
    const s = new SmallTalk(T0 - 10 * H);
    const lastTalkAt = T0 - 40 * M;
    // away from 20 minutes before T0 (idle reported), then input again
    s.observe(T0 - 5 * M, { idleSec: AWAY_IDLE_S + 60, locked: false });
    expect(s.decide(signals({ now: T0 - 5 * M, lastTalkAt, presence: { idleSec: AWAY_IDLE_S + 60, locked: false } }))).toEqual({ go: false, why: 'away' });
    s.observe(T0, { idleSec: 10, locked: false });
    const v = s.decide(signals({ lastTalkAt, presence: { idleSec: 10, locked: false } }));
    expect(v).toMatchObject({ go: true, occasion: 'back' });
    expect(v.go && v.awayMin).toBe(21);
    s.attempted(T0 + M);
    expect(s.decide(signals({ now: T0 + 2 * M, lastTalkAt, presence: { idleSec: 10, locked: false } })).go).toBe(false);
  });

  it('a lock is being away; the greeting is offered only for a while after coming back', () => {
    const s = new SmallTalk(T0 - 10 * H);
    s.observe(T0 - 30 * M, { idleSec: 0, locked: true });
    s.observe(T0, { idleSec: 5, locked: false });
    const lastTalkAt = T0 - 45 * M;
    expect(s.decide(signals({ lastTalkAt }))).toMatchObject({ occasion: 'back', awayMin: 30 });
    expect(s.decide(signals({ now: T0 + BACK_WINDOW_MS + 6000, lastTalkAt }))).toEqual({ go: false, why: 'recent talk' });
  });

  it('talking after coming back takes the greeting away', () => {
    const s = new SmallTalk(T0 - 10 * H);
    s.observe(T0 - 30 * M, { idleSec: 0, locked: true });
    s.observe(T0 - 2 * M, { idleSec: 0, locked: false });
    expect(s.decide(signals({ lastTalkAt: T0 - M }))).toEqual({ go: false, why: 'recent talk' });
  });

  it('a short lock or sleep is no absence: no greeting, and the gap since they talked still holds', () => {
    const s = new SmallTalk(T0 - 10 * H);
    const lastTalkAt = T0 - 2 * M;
    // chatted, locked the screen a minute later for 30 s, unlocked
    s.observe(T0 - M - 30_000, { idleSec: 0, locked: true });
    s.observe(T0 - M, { idleSec: 0, locked: false });
    expect(s.decide(signals({ lastTalkAt }))).toEqual({ go: false, why: 'recent talk' });
  });

  it('a lock after a while without input counts the whole absence', () => {
    const s = new SmallTalk(T0 - 10 * H);
    // 10 minutes without input, then locked for 6 more: gone 16 minutes
    s.observe(T0 - 6 * M, { idleSec: 10 * 60, locked: true });
    s.observe(T0, { idleSec: 2, locked: false });
    expect(s.decide(signals({ lastTalkAt: T0 - 20 * M }))).toMatchObject({ go: true, occasion: 'back', awayMin: 16 });
  });

  it('a short break is not an absence', () => {
    const s = new SmallTalk(T0 - 10 * H);
    s.observe(T0 - 5 * M, { idleSec: 6 * 60, locked: false });
    s.observe(T0, { idleSec: 5, locked: false });
    expect(s.decide(signals({ lastTalkAt: T0 - 40 * M }))).toEqual({ go: false, why: 'recent talk' });
  });
});

describe('the event text', () => {
  it('a lull: how long, the time of day, the last topic, and that it may say nothing', () => {
    const text = smallTalkText({ go: true, occasion: 'lull', awayMin: 0, sinceTalkMin: 75, idleMin: 2 }, '伙伴', 15 * 60, { text: '明天要交报告', agoMin: 80 });
    expect(text).toContain('[闲聊] 伙伴在电脑前,你们已经 75 分钟没说话了(伙伴有 2 分钟没碰键盘鼠标)。现在是下午。');
    expect(text).toContain('伙伴上次说的是(80 分钟前):「明天要交报告」。');
    expect(text).toContain('就什么也不做,不用回应这条');
  });

  it('coming back: the absence in hours, a long topic cut', () => {
    const text = smallTalkText({ go: true, occasion: 'back', awayMin: 150, sinceTalkMin: 200, idleMin: 0 }, '小明', 9 * 60, { text: '字'.repeat(80), agoMin: 200 });
    expect(text).toContain('[闲聊] 小明离开电脑大约 3 小时,刚回来。现在是上午。');
    expect(text).toContain(`「${'字'.repeat(60)}…」`);
    expect(text).toContain('欢迎回来');
  });
});
