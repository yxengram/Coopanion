// Text of the main process in Chinese: the tray menu, the settings window's starting page, the notices when the
// Core exits, the dialog that takes back the data an update left behind, the dialogs that ask which data to use
// when none is beside the program (app/data-dir.cjs), and the error box when the data directory cannot be written.
// en.cjs has the same keys.

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
  /** None of the console ports Cortico tried could be listened on, so the Core did not start; a notification and an error box. */
  corePortsBusy: (from, to) => `控制台端口 ${from}–${to} 都被占用,Core 没有启动。可能已经有 ${to - from + 1} 个 Coopanion 在运行,或者别的程序占用了这些端口。关掉其中一个或那个程序,再从托盘菜单选「重新启动」。`,
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
  /** The same for the portable build (app/channel.cjs), whose data is always the data folder beside it. */
  portableNotWritable: (dir) => `Coopanion 无法写入旁边的数据目录,没有启动:\n${dir}\n\n便携版要解压到当前用户有权写入的文件夹,例如「文档」或「桌面」里的一个文件夹,不要放进 Program Files 或只读的盘。`,

  /** Asked when no data is beside the program and the record names data another program directory used (app/data-dir.cjs). */
  dataFoundMessage: '找到之前的 Coopanion 数据',
  dataFoundDetail: (data, when, program) => `Coopanion 现在装在 ${program},这里还没有数据。之前使用的数据在:\n${data}\n最后一次启动:${when}\n\n`
    + '继承后,设置、API Key、提示词和记忆都接着用。新建一只会在现在的位置重新开始,之前的数据留在原处,不会删除。',
  dataInherit: '继承这份数据',
  dataNew: '新建一只',
  /** The data the record names is gone: Retry, Choose folder, Start a new one, Quit. */
  dataMissingMessage: '找不到之前使用的数据',
  dataMissingDetail: (data, when, beside) => `之前使用的数据在:\n${data}\n最后一次启动:${when}\n现在那里没有 Coopanion 的数据。\n\n`
    + `数据在移动硬盘或网络位置上的话,连接后点「重试」;挪到了别处的话,点「选择文件夹」找到它。新建一只会在这里重新开始:\n${beside}`,
  dataRetry: '重试',
  dataChoose: '选择文件夹',
  dataQuit: '退出',
  dataChooseTitle: '选择 Coopanion 的数据文件夹',
  dataChooseInvalid: (dir) => `这个文件夹里没有 Coopanion 的数据:\n${dir}\n\n请选择安装目录,或安装目录下的 data 文件夹。`,
};
