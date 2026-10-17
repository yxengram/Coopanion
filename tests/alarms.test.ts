import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Alarms, dueTime, localLabel, localToEpoch, nextDay } from '../core/alarms.ts';

describe('dueTime', () => {
  // 2026-10-05 14:00 in Shanghai (UTC+8)
  const now = Date.UTC(2026, 9, 5, 6, 0);

  it('reads HH:MM as the person\'s local time, today or else tomorrow', () => {
    expect(localLabel('Asia/Shanghai', dueTime('Asia/Shanghai', now, '18:30', undefined) as number)).toBe('10-05 18:30');
    expect(localLabel('Asia/Shanghai', dueTime('Asia/Shanghai', now, '09:00', undefined) as number)).toBe('10-06 09:00');
  });

  it('keeps the wall-clock time across a daylight-saving change', () => {
    // New York leaves daylight saving on 2026-11-01
    const at = dueTime('America/New_York', now, '2026-11-02 08:00', undefined) as number;
    expect(localLabel('America/New_York', at)).toBe('11-02 08:00');
  });
});

// the time zone is the computer's since Cortico 0.1.11, and many have daylight saving
describe('daily alarms', () => {
  it('ring at the same wall-clock time after a daylight-saving change', async () => {
    const tz = 'America/New_York';
    // New York leaves daylight saving on 2026-11-01 at 02:00
    const sat = localToEpoch(tz, 2026, 10, 31, 9, 0);
    expect(localLabel(tz, nextDay(tz, sat))).toBe('11-01 09:00');
    expect(nextDay(tz, sat) - sat).toBe(25 * 3_600_000);
    const alarms = new Alarms(join(mkdtempSync(join(tmpdir(), 'cc-alarms-')), 'alarms.json'), tz);
    const set = alarms.tools(() => localToEpoch(tz, 2026, 10, 31, 8, 0)).find((t) => t.name === 'alarm_set')!;
    await set.handler({ at: '09:00', note: 'stretch', daily: true }, {} as never);
    expect(alarms.takeDue(localToEpoch(tz, 2026, 10, 31, 9, 0)).map(({ alarm }) => alarm.note)).toEqual(['stretch']);
    // 24 hours later is 08:00 there
    expect(alarms.takeDue(localToEpoch(tz, 2026, 11, 1, 8, 30))).toEqual([]);
    const due = alarms.takeDue(localToEpoch(tz, 2026, 11, 1, 9, 0));
    expect(due.map(({ alarm }) => localLabel(tz, alarm.at))).toEqual(['11-01 09:00']);
  });

  it('set for HH:MM already past today, fall on tomorrow\'s HH:MM across the change', () => {
    const tz = 'America/New_York';
    const at = dueTime(tz, localToEpoch(tz, 2026, 10, 31, 10, 0), '09:00', undefined) as number;
    expect(localLabel(tz, at)).toBe('11-01 09:00');
  });
});

// clocks jump from 02:00 to 03:00, so 02:30 does not exist that morning
describe('a daylight-saving gap', () => {
  for (const [tz, y, mo, d] of [['America/New_York', 2027, 3, 14], ['Australia/Sydney', 2026, 10, 4]] as const) {
    it(`moves a skipped time past the jump, not before it (${tz})`, () => {
      expect(localLabel(tz, localToEpoch(tz, y, mo, d, 2, 30)).slice(6)).toBe('03:30');
      expect(localLabel(tz, localToEpoch(tz, y, mo, d, 1, 30)).slice(6)).toBe('01:30');
      expect(localLabel(tz, localToEpoch(tz, y, mo, d, 3, 30)).slice(6)).toBe('03:30');
    });

    it(`keeps a daily 02:30 at 02:30 on the days after (${tz})`, async () => {
      const alarms = new Alarms(join(mkdtempSync(join(tmpdir(), 'cc-alarms-')), 'alarms.json'), tz);
      const set = alarms.tools(() => localToEpoch(tz, y, mo, d - 1, 12, 0)).find((t) => t.name === 'alarm_set')!;
      await set.handler({ at: '02:30', note: 'water', daily: true }, {} as never);
      expect(alarms.takeDue(localToEpoch(tz, y, mo, d, 3, 0))).toEqual([]);
      const first = alarms.takeDue(localToEpoch(tz, y, mo, d, 3, 30));
      expect(first.map(({ alarm }) => localLabel(tz, alarm.at).slice(6))).toEqual(['03:30']);
      const next = alarms.takeDue(localToEpoch(tz, y, mo, d + 1, 2, 30));
      expect(next.map(({ alarm }) => localLabel(tz, alarm.at).slice(6))).toEqual(['02:30']);
      expect(alarms.takeDue(localToEpoch(tz, y, mo, d + 2, 2, 30)).map(({ alarm }) => localLabel(tz, alarm.at).slice(6))).toEqual(['02:30']);
    });

    it(`asked at 01:50 that morning for 02:30, rings at 03:30 the same morning (${tz})`, () => {
      const at = dueTime(tz, localToEpoch(tz, y, mo, d, 1, 50), '02:30', undefined) as number;
      expect(at - localToEpoch(tz, y, mo, d, 1, 50)).toBe(40 * 60_000);
      expect(localLabel(tz, at).slice(6)).toBe('03:30');
    });
  }

  it('takes the first of a time that happens twice', () => {
    // New York 2026-11-01 and Sydney 2026-04-05 set clocks back from 02:00/03:00 to 01:00/02:00
    expect(localToEpoch('America/New_York', 2026, 11, 1, 1, 30)).toBe(Date.UTC(2026, 10, 1, 5, 30));
    expect(localToEpoch('Australia/Sydney', 2026, 4, 5, 2, 30)).toBe(Date.UTC(2026, 3, 4, 15, 30));
  });
});

describe('nextAt', () => {
  it('is the soonest alarm set (the pet\'s small talk keeps clear of it), null with none', async () => {
    const now = Date.UTC(2026, 9, 5, 6, 0);
    const alarms = new Alarms(join(mkdtempSync(join(tmpdir(), 'cc-alarms-')), 'alarms.json'), 'Asia/Shanghai');
    expect(alarms.nextAt()).toBeNull();
    const set = alarms.tools(() => now).find((t) => t.name === 'alarm_set')!;
    await set.handler({ in_minutes: 90, note: 'later' }, {} as never);
    await set.handler({ in_minutes: 10, note: 'soon' }, {} as never);
    expect(alarms.nextAt()).toBe(now + 10 * 60_000);
    alarms.takeDue(now + 10 * 60_000);
    expect(alarms.nextAt()).toBe(now + 90 * 60_000);
  });
});
