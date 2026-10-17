// Text of the main process in Chinese: the tray menu, the settings window's starting page, the notices when the
// Core exits, the dialog that takes back the data an update left behind, and the error box when the data
// directory cannot be written. en.cjs has the same keys.

/** Said after each failure that stops the Core for good. */
const FAILED_HINT = '如果刚刚更新过,请从托盘菜单选择「退出」,再重新打开 Coopanion。';

module.exports = {
  /** The line the settings window shows until the Core is up. */
  starting: '正在启动…',

  trayOpenSettings: '打开设置',
  trayShowPet: '显示桌宠',
  trayLaunchAtLogin: '开机自动启动',
  trayRestart: '重新启动',
  trayQuit: '退出',

  /** Another process holds the data directory's instance lock, so the Core did not start; a notification and an error box. */
  coreLocked: (pid, file) => `另一个进程${pid ? `(PID ${pid})` : ''}正在使用 Coopanion 的数据,Core 没有启动。等它退出或手动结束它,再从托盘菜单选「重新启动」。锁文件:${file}`,
  /** The Core kept exiting before it was ready because a file was missing, and is not started again. */
  coreMissingModule: (times, code, logFile) => `Core 启动时找不到所需的文件,连续 ${times} 次没有启动(退出码 ${code}),已停止重试。${FAILED_HINT}也可能是某个已安装的扩展缺少依赖。日志:${logFile}`,
  /** The Core exited too often within 5 minutes and is not restarted. */
  coreFailed: (times, code, logFile) => `Core 在 5 分钟内退出了 ${times} 次(退出码 ${code}),已停止重试。${FAILED_HINT}日志:${logFile}`,
  coreRestarting: (code) => `Core 意外退出(退出码 ${code}),3 秒后重启`,

  /** Asked once when an update moved the program and left the old data directory behind. */
  strandedMessage: '找到更新前的设置',
  strandedDetail: (stranded, parent) => `之前的一次自动更新把 Coopanion 装到了现在的位置,更新前的设置、API Key、提示词和记忆还留在:\n${stranded}\n\n`
    + `换回后,现在这份改名为 data-replaced-<时间>,留在 ${parent} 里,不会删除。选「继续用现在的」以后不再询问。`,
  strandedRestore: '换回更新前的设置',
  strandedKeep: '继续用现在的',

  /** The data directory cannot be written (an install in a directory that needs administrator rights), so the app does not start. */
  dataNotWritable: (dir, suggested) => `Coopanion 无法写入数据目录,没有启动:\n${dir}\n\n请重新运行安装器,安装到当前用户有权写入的目录,例如:\n${suggested}`,
};
