// Text of the main process in English; keys as in zh.cjs.

/** Said after each failure that stops the Core for good. */
const FAILED_HINT = 'If the app was just updated, choose Quit in the tray menu and open Coopanion again.';

module.exports = {
  /** The line the settings window shows until the Core is up. */
  starting: 'Starting…',

  trayOpenSettings: 'Open settings',
  trayShowPet: 'Show pet',
  trayLaunchAtLogin: 'Start at login',
  trayRestart: 'Restart',
  trayQuit: 'Quit',

  coreLocked: (pid, file) => `Another process${pid ? ` (PID ${pid})` : ''} is using Coopanion's data, so the Core did not start. Wait for it to exit or end it, then choose Restart in the tray menu. Lock file: ${file}`,
  corePortsBusy: (from, to) => `The console ports ${from}–${to} are all taken, so the Core did not start. ${to - from + 1} copies of Coopanion may already be running, or other programs are using these ports. Quit one of them, then choose Restart in the tray menu.`,
  coreMissingModule: (times, code, logFile) => `The Core could not find a file it needs and failed to start ${times} times in a row (exit code ${code}); it is no longer retried. ${FAILED_HINT} An installed extension may also be missing a dependency. Log: ${logFile}`,
  coreFailed: (times, code, logFile) => `The Core exited ${times} times within 5 minutes (exit code ${code}) and is no longer restarted. ${FAILED_HINT} Log: ${logFile}`,
  coreRestarting: (code) => `The Core exited unexpectedly (exit code ${code}); restarting in 3 seconds`,

  strandedMessage: 'Settings from before the update were found',
  strandedDetail: (stranded, parent) => `An earlier automatic update installed Coopanion where it is now. The settings, API keys, prompts and memory from before that update are still in:\n${stranded}\n\n`
    + `Switching back renames the current data to data-replaced-<time> and keeps it in ${parent}; nothing is deleted. After "Keep the current ones" you will not be asked again.`,
  strandedRestore: 'Use the settings from before',
  strandedKeep: 'Keep the current ones',

  dataNotWritable: (dir, suggested) => `Coopanion cannot write to its data directory and did not start:\n${dir}\n\nRun the installer again and install into a directory your user account can write to, for example:\n${suggested}`,
  portableNotWritable: (dir) => `Coopanion cannot write to the data folder beside it and did not start:\n${dir}\n\nUnpack the portable version into a folder your user account can write to, such as one in Documents or on the Desktop, not into Program Files or onto a read-only drive.`,

  dataFoundMessage: 'Coopanion data from before was found',
  dataFoundDetail: (data, when, program) => `Coopanion is now installed in ${program}, which has no data yet. The data used before is in:\n${data}\nLast started: ${when}\n\n`
    + 'Inherit it to keep the settings, API keys, prompts and memory. Start a new one to begin again here; the data from before stays where it is and is not deleted.',
  dataInherit: 'Inherit this data',
  dataNew: 'Start a new one',
  dataMissingMessage: 'The data used before cannot be found',
  dataMissingDetail: (data, when, beside) => `The data used before was in:\n${data}\nLast started: ${when}\nThere is no Coopanion data there now.\n\n`
    + `If it is on a removable drive or a network location, connect it and click Retry. If it was moved, click Choose folder to find it. Start a new one to begin again here:\n${beside}`,
  dataRetry: 'Retry',
  dataChoose: 'Choose folder',
  dataQuit: 'Quit',
  dataChooseTitle: 'Choose the Coopanion data folder',
  dataChooseInvalid: (dir) => `This folder has no Coopanion data:\n${dir}\n\nChoose the install folder, or the data folder inside it.`,
};
