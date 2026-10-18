/**
 * Where the Windows installed build keeps its data, and the record that ties the program to it (upstream #236).
 *
 * The data directory is `data\` beside the program. An update or a reinstall can put the program in another
 * directory, which has no data of its own. Each start writes the record (`%LOCALAPPDATA%\Coopanion\data-location.json`:
 * the data directory, the program directory, and when it started), so a program that finds no data beside it
 * knows which data was used last. It then asks whether to take that data over or start a new one, and the
 * answer binds the record to the new program directory. Data beside the program always wins: a folder copied
 * whole keeps its own data.
 *
 * The older recovery of data an update left in `%LOCALAPPDATA%\Programs\Coopanion` (#84, `restoreStrandedData` in
 * main.cjs) stays for installs that have no record yet. Starting a new one here answers it too: the new data
 * directory gets the recovery's `keep` answer, so the next start does not move that old data into it.
 */
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

/**
 * @typedef {{ data: string, program: string, startedAt: string }} DataRecord
 * @typedef {{ use: string } | { ask: 'inherit' | 'missing', record: DataRecord }} DataLocation
 */

/** Windows paths compare without case. */
const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** The record in `file`, or null when there is none or it is not one. */
function readRecord(file) {
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    return typeof record?.data === 'string' && typeof record.program === 'string' && typeof record.startedAt === 'string' ? record : null;
  } catch {
    return null;
  }
}

/** @param {string} file @param {DataRecord} record */
function writeRecord(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 2));
}

/**
 * The data directory for the program in `programDir`, or what to ask:
 * - data beside the program, or no record: `data\` beside the program;
 * - a record bound to this program directory: its data directory, `missing` when that is gone;
 * - a record from another program directory: `inherit` when its data is there, `missing` when it is not.
 * @param {{ programDir: string, record: DataRecord | null, exists?: (path: string) => boolean }} at
 * @returns {DataLocation}
 */
function locateData({ programDir, record, exists = existsSync }) {
  const beside = join(programDir, 'data');
  if (exists(join(beside, 'home')) || !record) return { use: beside };
  if (samePath(record.program, programDir)) return exists(record.data) ? { use: record.data } : { ask: 'missing', record };
  return exists(join(record.data, 'home')) ? { ask: 'inherit', record } : { ask: 'missing', record };
}

/** The data directory in a folder someone picked: the folder itself, or the `data` in an install folder; null when neither holds data. */
function dataDirIn(folder, exists = existsSync) {
  if (exists(join(folder, 'home'))) return folder;
  if (exists(join(folder, 'data', 'home'))) return join(folder, 'data');
  return null;
}

/**
 * Asks which data to use when none is beside the program. `box(options)` shows a message box and returns the
 * index of the button clicked (Electron's `dialog.showMessageBoxSync`), `pickFolder(defaultPath)` a folder
 * picker (the folder, or undefined when cancelled); `text` is the app's text table (app/i18n). Returns the data
 * directory to use, which is `beside` for a new one, or null to quit.
 * @param {{ ask: 'inherit' | 'missing', record: DataRecord }} question
 * @param {{ box: (options: object) => number, pickFolder: (defaultPath: string) => string | undefined, text: Record<string, any>,
 *   when: string, programDir: string, beside: string, exists?: (path: string) => boolean }} env
 * @returns {string | null}
 */
function askDataLocation({ ask, record }, { box, pickFolder, text: t, when, programDir, beside, exists = existsSync }) {
  const show = (options) => box({ title: 'Coopanion', noLink: true, defaultId: 0, ...options });
  if (ask === 'inherit') {
    const answer = show({ type: 'question', message: t.dataFoundMessage, detail: t.dataFoundDetail(record.data, when, programDir), buttons: [t.dataInherit, t.dataNew], cancelId: 0 });
    return answer === 0 ? record.data : beside;
  }
  for (;;) {
    const answer = show({ type: 'warning', message: t.dataMissingMessage, detail: t.dataMissingDetail(record.data, when, beside), buttons: [t.dataRetry, t.dataChoose, t.dataNew, t.dataQuit], cancelId: 3 });
    if (answer === 0 && exists(join(record.data, 'home'))) return record.data;
    if (answer === 1) {
      const folder = pickFolder(dirname(record.data));
      const data = folder && dataDirIn(folder, exists);
      if (data) return data;
      if (folder) show({ type: 'warning', message: t.dataChooseInvalid(folder) });
    }
    if (answer === 2) return beside;
    // Quit, the box closed, or an answer the box should not give: quit rather than ask forever
    if (answer !== 0 && answer !== 1) return null;
  }
}

/**
 * Settles the answer: a new data directory beside the program is made, and when data an update left behind
 * (`strandedData`, #84) is waiting it gets that recovery's `keep` answer (its `stranded-data-choice` file), so
 * the recovery does not move the old data into the new one; then the record is bound to this program directory.
 * @param {string} data @param {{ recordFile: string, record: DataRecord, programDir: string, beside: string, strandedData?: string | null, exists?: (path: string) => boolean }} at
 */
function bindDataLocation(data, { recordFile, record, programDir, beside, strandedData = null, exists = existsSync }) {
  if (samePath(data, beside)) {
    mkdirSync(beside, { recursive: true });
    if (strandedData && exists(join(strandedData, 'home')) && !samePath(strandedData, beside)) writeFileSync(join(beside, 'stranded-data-choice'), 'keep');
  }
  writeRecord(recordFile, { data, program: programDir, startedAt: record.startedAt });
}

/**
 * What the #84 recovery does with the data an update left in `strandedDir` (main.cjs restoreStrandedData), for the
 * data directory `data` and the recovery's answer stored in it (`choice`: '', 'restore' or 'keep'): `none`, `ask`
 * when this data directory may be the one in use, or `restore` (move the old data in).
 * @param {{ data: string, strandedDir: string | null, choice: string, exists?: (path: string) => boolean }} at
 * @returns {'none' | 'ask' | 'restore'}
 */
function strandedAction({ data, strandedDir, choice, exists = existsSync }) {
  if (!strandedDir) return 'none';
  const stranded = join(strandedDir, 'data');
  if (samePath(stranded, data)) return 'none';
  // an install still living there is its own install, not a leftover
  if (!exists(join(stranded, 'home')) || exists(join(strandedDir, 'Coopanion.exe'))) return 'none';
  if (choice === 'keep') return 'none';
  if (choice !== 'restore' && exists(join(data, 'home'))) return 'ask';
  return 'restore';
}

module.exports = { readRecord, writeRecord, locateData, dataDirIn, samePath, askDataLocation, bindDataLocation, strandedAction };
