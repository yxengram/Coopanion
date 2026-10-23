import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// upstream #307: a damaged alarms.json no longer stops the Core from starting
describe('alarm state recovery', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const stateFile = () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-alarms-state-'));
    dirs.push(dir);
    return join(dir, 'alarms.json');
  };
  const tool = (alarms: Alarms, name: string, now = 0) => alarms.tools(() => now).find((t) => t.name === name)!;
  const text = (out: unknown) => (typeof out === 'string' ? out : (out as { text: string }).text);
  const listed = async (alarms: Alarms) => text(await tool(alarms, 'alarm_list').handler({}, {} as never));

  it.each(['', '{"next":', 'null', '{"alarms":[]}', '{"next":0,"alarms":[]}'])('recovers invalid state %j', async (content) => {
    const file = stateFile();
    writeFileSync(file, content);
    const alarms = new Alarms(file, 'UTC');
    expect(await listed(alarms)).toBe('没有设着的唤醒器。');
    expect(readFileSync(`${file}.bad`, 'utf8')).toBe(content);
    const set = await tool(alarms, 'alarm_set').handler({ note: 'tea', in_minutes: 1 }, {} as never);
    expect(text(set)).toBe('已设 a1:01-01 00:01。');
    expect(await listed(new Alarms(file, 'UTC'))).toBe(await listed(alarms));
  });

  it('drops only the records that are not alarms, and keeps numbering after them', async () => {
    const file = stateFile();
    const tea = { id: 'a2', at: 60_000, note: 'tea', daily: false, setAt: 0 };
    writeFileSync(file, JSON.stringify({ next: 3, alarms: [null, { id: 'a1', note: 'no time' }, { ...tea, id: 'a9', at: 'soon' }, tea] }));
    const alarms = new Alarms(file, 'UTC');
    expect(await listed(alarms)).toBe('- a2:01-01 00:01 tea');
    expect(existsSync(`${file}.bad`)).toBe(false);
    expect(text(await tool(alarms, 'alarm_set').handler({ note: 'nap', in_minutes: 5 }, {} as never))).toMatch(/^已设 a3:/);
  });

  it('a daily alarm whose saved clock is not HH:MM keeps its due time\'s wall clock', () => {
    const file = stateFile();
    const tz = 'Asia/Shanghai';
    const at = localToEpoch(tz, 2026, 10, 5, 9, 0);
    writeFileSync(file, JSON.stringify({ next: 2, alarms: [{ id: 'a1', at, note: 'stretch', daily: true, setAt: 0, clock: '25:99' }] }));
    const alarms = new Alarms(file, tz);
    const due = alarms.takeDue(at);
    expect(due.map(({ alarm }) => alarm.note)).toEqual(['stretch']);
    expect(localLabel(tz, alarms.nextAt()!)).toBe('10-06 09:00');
    expect(JSON.parse(readFileSync(file, 'utf8')).alarms[0].clock).toBeUndefined();
  });

  it('sets a daily alarm saved long ago for its next time without stepping through every day since', () => {
    const file = stateFile();
    const tz = 'Asia/Shanghai';
    const now = localToEpoch(tz, 2026, 10, 23, 12, 0);
    writeFileSync(file, JSON.stringify({ next: 3, alarms: [
      { id: 'a1', at: 0, note: 'epoch', daily: true, setAt: 0 },
      { id: 'a2', at: localToEpoch(tz, 2019, 3, 1, 9, 30), note: 'old', daily: true, setAt: 0, clock: '09:30' },
    ] }));
    const alarms = new Alarms(file, tz);
    const started = performance.now();
    expect(alarms.takeDue(now).map(({ alarm, missed }) => [alarm.note, missed])).toEqual([['epoch', true], ['old', true]]);
    expect(performance.now() - started).toBeLessThan(500);
    const saved = JSON.parse(readFileSync(file, 'utf8')).alarms as Array<{ note: string; at: number }>;
    // 1970-01-01T00:00Z is 08:00 in Shanghai
    expect(saved.map((a) => [a.note, localLabel(tz, a.at)])).toEqual([['epoch', '10-24 08:00'], ['old', '10-24 09:30']]);
  });

  it('delivers a due alarm once in the running process when its next save fails', async () => {
    const file = stateFile();
    const alarms = new Alarms(file, 'UTC');
    await tool(alarms, 'alarm_set').handler({ note: 'tea', in_minutes: 1 }, {} as never);
    const previous = readFileSync(file, 'utf8');
    // the write goes through `<file>.tmp`: a directory there makes it fail
    mkdirSync(`${file}.tmp`);
    expect(alarms.takeDue(60_000).map(({ alarm }) => alarm.note)).toEqual(['tea']);
    expect(alarms.takeDue(60_001)).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(previous);
  });

  it('throws on a file it cannot read and leaves it in place', () => {
    const file = stateFile();
    mkdirSync(file);
    expect(() => new Alarms(file, 'UTC')).toThrow(/EISDIR/);
    expect(statSync(file).isDirectory()).toBe(true);
    expect(existsSync(`${file}.bad`)).toBe(false);
  });

  it('replaces the file whole, leaving no temporary file', async () => {
    const file = stateFile();
    const alarms = new Alarms(file, 'UTC');
    await tool(alarms, 'alarm_set').handler({ note: 'tea', in_minutes: 1 }, {} as never);
    expect(JSON.parse(readFileSync(file, 'utf8')).alarms.map((a: { note: string }) => a.note)).toEqual(['tea']);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});

// upstream #312: a date that does not exist is refused, not carried into the next month
describe('dueTime dates', () => {
  const now = Date.UTC(2026, 0, 1);
  it.each(['2026-02-30 08:00', '2026-13-01 08:00', '2026-00-10 08:00', '2026-04-31 08:00', '2026-03-01 24:00', '2026-03-01 08:60', '2026-03-00 08:00'])('refuses %s', (at) => {
    expect(dueTime('UTC', now, at, undefined)).toBe(`at 应为 HH:MM 或 YYYY-MM-DD HH:MM,收到 ${JSON.stringify(at)}`);
  });
  it('takes the last day of a month and 29 February of a leap year', () => {
    expect(localLabel('UTC', dueTime('UTC', now, '2026-04-30 23:59', undefined) as number)).toBe('04-30 23:59');
    expect(localLabel('UTC', dueTime('UTC', now, '2028-02-29 08:00', undefined) as number)).toBe('02-29 08:00');
    expect(dueTime('UTC', now, '2027-02-29 08:00', undefined)).toMatch(/^at 应为/);
  });
});
