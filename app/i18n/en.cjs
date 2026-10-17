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
  coreMissingModule: (times, code, logFile) => `The Core could not find a file it needs and failed to start ${times} times in a row (exit code ${code}); it is no longer retried. ${FAILED_HINT} An installed extension may also be missing a dependency. Log: ${logFile}`,
  coreFailed: (times, code, logFile) => `The Core exited ${times} times within 5 minutes (exit code ${code}) and is no longer restarted. ${FAILED_HINT} Log: ${logFile}`,
  coreRestarting: (code) => `The Core exited unexpectedly (exit code ${code}); restarting in 3 seconds`,

  strandedMessage: 'Settings from before the update were found',
  strandedDetail: (stranded, parent) => `An earlier automatic update installed Coopanion where it is now. The settings, API keys, prompts and memory from before that update are still in:\n${stranded}\n\n`
    + `Switching back renames the current data to data-replaced-<time> and keeps it in ${parent}; nothing is deleted. After "Keep the current ones" you will not be asked again.`,
  strandedRestore: 'Use the settings from before',
  strandedKeep: 'Keep the current ones',

  dataNotWritable: (dir, suggested) => `Coopanion cannot write to its data directory and did not start:\n${dir}\n\nRun the installer again and install into a directory your user account can write to, for example:\n${suggested}`,
};
