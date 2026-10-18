/**
 * The data directory of the installed Windows build (app/data-dir.cjs, upstream #236): the record of the data an
 * earlier start used, the questions when none is beside the program, and how the answer meets the older
 * recovery of data an update left behind (#84).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
interface DataRecord { data: string; program: string; startedAt: string }
type Question = { ask: 'inherit' | 'missing'; record: DataRecord };
interface Box { type: string; message: string; detail?: string; buttons?: string[]; cancelId?: number }
const { readRecord, writeRecord, locateData, dataDirIn, askDataLocation, bindDataLocation, strandedAction } = require('../app/data-dir.cjs') as {
  readRecord(file: string): DataRecord | null;
  writeRecord(file: string, record: DataRecord): void;
  locateData(at: { programDir: string; record: DataRecord | null }): { use: string } | Question;
  dataDirIn(folder: string): string | null;
  askDataLocation(q: Question, env: { box(o: Box): number; pickFolder(d: string): string | undefined; text: Record<string, unknown>; when: string; programDir: string; beside: string }): string | null;
  bindDataLocation(data: string, at: { recordFile: string; record: DataRecord; programDir: string; beside: string; strandedData?: string | null }): void;
  strandedAction(at: { data: string; strandedDir: string | null; choice: string }): 'none' | 'ask' | 'restore';
};
const zh = require('../app/i18n/zh.cjs') as Record<string, (...a: string[]) => string> & Record<string, string>;
const en = require('../app/i18n/en.cjs') as Record<string, (...a: string[]) => string> & Record<string, string>;

let root = '';
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = ''; });

/** Two install folders on disk; `withData` lists the ones whose data\ holds a deployment. */
function installs(...withData: Array<'old' | 'new'>) {
  root = mkdtempSync(join(tmpdir(), 'coo-data-dir-'));
  const dir = { old: join(root, 'old'), new: join(root, 'new') };
  for (const name of ['old', 'new'] as const) {
    mkdirSync(dir[name]);
    if (withData.includes(name)) mkdirSync(join(dir[name], 'data', 'home'), { recursive: true });
  }
  const record = (data: string, program: string): DataRecord => ({ data, program, startedAt: '2026-10-16T09:18:40.000Z' });
  return { ...dir, record };
}

/** A message box that answers from `answers` in turn and keeps what it was shown. */
function boxes(...answers: number[]) {
  const shown: Box[] = [];
  return { shown, box: (o: Box) => { shown.push(o); return answers.shift() ?? -1; } };
}

describe('the data directory of the installed Windows build', () => {
  it('uses the data beside the program whatever the record says, and beside the program when there is no record', () => {
    const at = installs('old', 'new');
    expect(locateData({ programDir: at.new, record: at.record(join(at.old, 'data'), at.old) })).toEqual({ use: join(at.new, 'data') });
    expect(locateData({ programDir: at.old, record: null })).toEqual({ use: join(at.old, 'data') });
  });

  it('asks before taking over the data another program directory used, and when that data is gone', () => {
    const at = installs('old');
    const record = at.record(join(at.old, 'data'), at.old);
    expect(locateData({ programDir: at.new, record })).toEqual({ ask: 'inherit', record });
    rmSync(join(at.old, 'data'), { recursive: true });
    expect(locateData({ programDir: at.new, record })).toEqual({ ask: 'missing', record });
  });

  it('uses the data a record bound to this program directory, a new one not yet seeded included, and asks once it is gone', () => {
    const at = installs('old');
    expect(locateData({ programDir: at.new.toUpperCase(), record: at.record(join(at.old, 'data'), at.new) })).toEqual({ use: join(at.old, 'data') });
    mkdirSync(join(at.new, 'data'));
    expect(locateData({ programDir: at.new, record: at.record(join(at.new, 'data'), at.new) })).toEqual({ use: join(at.new, 'data') });
    const gone = at.record(join(root, 'elsewhere', 'data'), at.new);
    expect(locateData({ programDir: at.new, record: gone })).toEqual({ ask: 'missing', record: gone });
  });

  it('takes a picked data folder or install folder, and nothing else', () => {
    const at = installs('old');
    expect(dataDirIn(join(at.old, 'data'))).toBe(join(at.old, 'data'));
    expect(dataDirIn(at.old)).toBe(join(at.old, 'data'));
    expect(dataDirIn(at.new)).toBeNull();
  });

  it('reads back what it wrote, and no record from a missing or foreign file', () => {
    const at = installs();
    const file = join(root, 'record', 'data-location.json');
    expect(readRecord(file)).toBeNull();
    const record = at.record(join(at.old, 'data'), at.old);
    writeRecord(file, record);
    expect(readRecord(file)).toEqual(record);
    writeFileSync(file, JSON.stringify({ data: 1 }));
    expect(readRecord(file)).toBeNull();
    writeFileSync(file, '{');
    expect(readRecord(file)).toBeNull();
  });
});

describe('asking which data to use', () => {
  const env = (at: ReturnType<typeof installs>, box: (o: Box) => number, picks: Array<string | undefined> = [], text: Record<string, unknown> = zh) => ({
    box, pickFolder: () => picks.shift(), text, when: '2026/10/16 17:18:40', programDir: at.new, beside: join(at.new, 'data'),
  });

  it('inherit: the data from before, or a new one beside the program; in the app language', () => {
    const at = installs('old');
    const q = { ask: 'inherit', record: at.record(join(at.old, 'data'), at.old) } as const;
    const yes = boxes(0);
    expect(askDataLocation(q, env(at, yes.box))).toBe(join(at.old, 'data'));
    expect(yes.shown[0]).toMatchObject({ type: 'question', message: zh.dataFoundMessage, buttons: [zh.dataInherit, zh.dataNew], cancelId: 0, defaultId: 0, title: 'Coopanion' });
    expect(yes.shown[0]!.detail).toContain(join(at.old, 'data'));
    expect(yes.shown[0]!.detail).toContain(at.new);
    const no = boxes(1);
    expect(askDataLocation(q, env(at, no.box, [], en))).toBe(join(at.new, 'data'));
    expect(no.shown[0]).toMatchObject({ message: en.dataFoundMessage, buttons: [en.dataInherit, en.dataNew] });
  });

  it('missing: Retry finds the data once it is back, a picked folder without data is refused, Start a new one and Quit', () => {
    const at = installs();
    const data = join(at.old, 'data');
    const q = { ask: 'missing', record: at.record(data, at.old) } as const;
    // Retry while it is still gone asks again; then it is back
    let tries = 0;
    const retry = boxes(0, 0);
    const box = (o: Box) => { if (++tries === 2) mkdirSync(join(data, 'home'), { recursive: true }); return retry.box(o); };
    expect(askDataLocation(q, env(at, box))).toBe(data);
    expect(retry.shown[0]).toMatchObject({ type: 'warning', message: zh.dataMissingMessage, buttons: [zh.dataRetry, zh.dataChoose, zh.dataNew, zh.dataQuit], cancelId: 3 });
    expect(retry.shown).toHaveLength(2);

    // Choose folder: first one without data (refused with a note), then an install folder that has it
    const choose = boxes(1, 0, 1);
    expect(askDataLocation(q, env(at, choose.box, [at.new, at.old]))).toBe(data);
    expect(choose.shown.map((s) => s.message)).toEqual([zh.dataMissingMessage, zh.dataChooseInvalid(at.new), zh.dataMissingMessage]);
    // a cancelled picker just asks again
    expect(askDataLocation(q, env(at, boxes(1, 3).box, [undefined]))).toBeNull();

    expect(askDataLocation(q, env(at, boxes(2).box))).toBe(join(at.new, 'data'));
    expect(askDataLocation(q, env(at, boxes(3).box))).toBeNull();
    // a box that gives no known answer quits instead of asking forever
    expect(askDataLocation(q, env(at, boxes(-1).box))).toBeNull();
  });
});

describe('the answer and the recovery of data an update left behind (#84)', () => {
  it('Start a new one: the next start uses the new data beside the program and does not move the stranded data into it', () => {
    const at = installs('old');
    // the old install folder plays %LOCALAPPDATA%\Programs\Coopanion: its data left behind, no Coopanion.exe
    const recordFile = join(root, 'local', 'data-location.json');
    const record = at.record(join(at.old, 'data'), at.old);
    const beside = join(at.new, 'data');
    expect(locateData({ programDir: at.new, record })).toEqual({ ask: 'inherit', record });
    bindDataLocation(beside, { recordFile, record, programDir: at.new, beside, strandedData: join(at.old, 'data') });

    // relaunched
    const next = locateData({ programDir: at.new, record: readRecord(recordFile) });
    expect(next).toEqual({ use: beside });
    const choice = readFileSync(join(beside, 'stranded-data-choice'), 'utf8');
    expect(strandedAction({ data: beside, strandedDir: at.old, choice })).toBe('none');
    // without that answer the recovery would have moved the old data in
    expect(strandedAction({ data: beside, strandedDir: at.old, choice: '' })).toBe('restore');
    expect(existsSync(join(at.old, 'data', 'home'))).toBe(true);
  });

  it('Inherit: the record is bound to this program directory, nothing is written into the data', () => {
    const at = installs('old');
    const recordFile = join(root, 'local', 'data-location.json');
    const record = at.record(join(at.old, 'data'), at.old);
    bindDataLocation(join(at.old, 'data'), { recordFile, record, programDir: at.new, beside: join(at.new, 'data'), strandedData: join(at.old, 'data') });
    expect(readRecord(recordFile)).toEqual({ ...record, program: at.new });
    expect(existsSync(join(at.new, 'data'))).toBe(false);
    expect(existsSync(join(at.old, 'data', 'stranded-data-choice'))).toBe(false);
    expect(locateData({ programDir: at.new, record: readRecord(recordFile) })).toEqual({ use: join(at.old, 'data') });
  });

  it('the recovery as before: nothing without stranded data or with an install still there, asks over data in use, keeps an answer', () => {
    const at = installs('old');
    const beside = join(at.new, 'data');
    expect(strandedAction({ data: beside, strandedDir: null, choice: '' })).toBe('none');
    expect(strandedAction({ data: join(at.old, 'data'), strandedDir: at.old, choice: '' })).toBe('none');
    expect(strandedAction({ data: beside, strandedDir: at.new, choice: '' })).toBe('none');
    mkdirSync(join(beside, 'home'), { recursive: true });
    expect(strandedAction({ data: beside, strandedDir: at.old, choice: '' })).toBe('ask');
    expect(strandedAction({ data: beside, strandedDir: at.old, choice: 'restore' })).toBe('restore');
    expect(strandedAction({ data: beside, strandedDir: at.old, choice: 'keep' })).toBe('none');
    writeFileSync(join(at.old, 'Coopanion.exe'), '');
    expect(strandedAction({ data: beside, strandedDir: at.old, choice: 'restore' })).toBe('none');
  });
});
