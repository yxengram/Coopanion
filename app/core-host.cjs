/**
 * Runs the Core child process and keeps it running.
 *
 * The child is `core/boot.ts` under the app's own runtime in Node mode, with `--import tsx`.
 * It reports `companion:ready` with the console port. It exits on purpose after asking for a
 * restart (`cortico:restart`, or `<dataDir>/.restart-request` written by the console), and is
 * started again; an unexpected exit is restarted after 3 s, at most 5 times in 5 minutes, except one
 * before `companion:ready` that could not find a module or package on stderr (what a start meets while an update is
 * still writing the runtime's files), which waits longer each time (MISSING_MODULE_DELAYS_MS) without counting toward
 * that budget. A child that exits unasked before it is ready leaves the app's arguments, its parent PID and whether the
 * entry and tsx are on disk in the log. A start after the host gave up (`failed`) begins with a full budget. The next
 * child started after an unexpected exit gets its exit code or signal in `COOPANION_CORE_EXIT`, for
 * the usage statistics. Every start looks up the system proxy again (systemProxyEnvironment) and hands
 * it to the child as proxy variables unless the environment already has its own.
 */
const { fork } = require('node:child_process');
const { coreEnvironment, systemProxyEnvironment } = require('./core-env.cjs');
const { EventEmitter } = require('node:events');
const { createWriteStream, existsSync, mkdirSync, renameSync, statSync } = require('node:fs');
const { join } = require('node:path');

const CRASH_WINDOW_MS = 5 * 60_000;
const MAX_CRASHES = 5;
/**
 * The waits before starting again after a child that exited before it was ready because a module or package was
 * missing. These exits do not count toward MAX_CRASHES; after the last wait the next one is `failed`. Together they
 * wait 223 s (an update was seen writing the runtime's files for about 82 s), within the 5 minutes the failure reports.
 * The match is not limited to the app's own files: an installed extension missing a dependency gets the same waits
 * before it is reported, and the failure says so.
 */
const MISSING_MODULE_DELAYS_MS = [3_000, 10_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000];
/** What Node writes on stderr for a module or package it cannot find, from `import` or from `require`. */
const MISSING_MODULE = /MODULE_NOT_FOUND|Cannot find (?:package|module)/;
/** The file `--import tsx` loads: tsx's `exports['.']`. */
const TSX_ENTRY = ['node_modules', 'tsx', 'dist', 'loader.mjs'];
/**
 * Node options of the Core. --use-system-ca: TLS trusts the operating system's certificate store as well as Node's
 * bundled one (company or antivirus root certificates); certificates are still checked.
 */
const CORE_NODE_FLAGS = ['--use-env-proxy', '--use-system-ca'];
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
const FAILED_HINT = '如果刚刚更新过,请从托盘菜单选择「退出」,再重新打开 Coopanion。';

/** Whether a piece of stderr says a module or package could not be found. */
const isMissingModule = (text) => MISSING_MODULE.test(text);

/** The wait before the next start after `exits` such exits in a row, or null when the host gives up. */
const missingModuleDelay = (exits) => (exits < MISSING_MODULE_DELAYS_MS.length ? MISSING_MODULE_DELAYS_MS[exits] : null);

/** The app process's arguments and parent PID, and whether the Core's entry and tsx exist, as a line for core.log. */
function startDiagnostics(appRoot) {
  const entry = join(appRoot, 'core', 'boot.ts');
  const tsx = join(appRoot, ...TSX_ENTRY);
  const on = (file) => `${file} ${existsSync(file) ? 'exists' : 'missing'}`;
  return `exited before ready; app argv ${JSON.stringify(process.argv.slice(1))}, ppid ${process.ppid}; ${on(entry)}; ${on(tsx)}\n`;
}

class CoreHost extends EventEmitter {
  /**
   * `execPath` is the runtime the child runs under, by default this process's own.
   * @param {{ appRoot: string, env: NodeJS.ProcessEnv, logDir: string, resolveProxy: (url: string) => Promise<string>, execPath?: string }} opts
   */
  constructor(opts) {
    super();
    this.opts = opts;
    this.child = null;
    this.port = null;
    this.dataDir = null;
    this.keyMissing = false;
    this.restartAsked = false;
    this.stopping = false;
    /** The system proxy lookup before a start is running. */
    this.launching = false;
    this.crashes = [];
    /** Missing-module exits before ready since the last ready child: the index into MISSING_MODULE_DELAYS_MS. */
    this.missingModuleExits = 0;
    /** Settles once the last child held after its exit while its last stderr lines are read is let go. */
    this.settling = Promise.resolve();
    /** Exit code or signal of the last child that exited unasked, not yet handed to a new one. */
    this.unexpectedExit = null;
    this.state = 'stopped';
  }

  async start() {
    if (this.child || this.launching) return;
    this.launching = true;
    const proxy = await systemProxyEnvironment(this.opts.env, this.opts.resolveProxy);
    this.launching = false;
    if (this.stopping) return;
    if (this.state === 'failed') { this.crashes = []; this.missingModuleExits = 0; }
    mkdirSync(this.opts.logDir, { recursive: true });
    const logFile = join(this.opts.logDir, 'core.log');
    if (existsSync(logFile) && statSync(logFile).size > LOG_ROTATE_BYTES) renameSync(logFile, join(this.opts.logDir, 'core.old.log'));
    const log = createWriteStream(logFile, { flags: 'a' });
    log.write(`\n===== ${new Date().toISOString()} start =====\n${proxy.note}\n`);
    const child = fork(join(this.opts.appRoot, 'core', 'boot.ts'), [], {
      cwd: this.opts.appRoot,
      execPath: this.opts.execPath ?? process.execPath,
      execArgv: [...CORE_NODE_FLAGS, '--import', 'tsx'],
      env: coreEnvironment({ ...this.opts.env, ...proxy.vars, ...(this.unexpectedExit === null ? {} : { COOPANION_CORE_EXIT: String(this.unexpectedExit) }) }),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.unexpectedExit = null;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let missingModule = false;
    let tail = '';
    child.stderr.on('data', (chunk) => {
      const text = tail + chunk;
      if (isMissingModule(text)) missingModule = true;
      tail = text.slice(-64);
    });
    this.child = child;
    this.state = 'starting';
    this.restartAsked = false;
    this.emit('state', this.state);
    child.on('message', (msg) => {
      if (msg?.type === 'companion:ready') {
        this.port = msg.port;
        this.dataDir = msg.dataDir;
        this.keyMissing = !!msg.keyMissing;
        this.state = 'running';
        this.missingModuleExits = 0;
        this.emit('ready', { port: msg.port, keyMissing: this.keyMissing });
        this.emit('state', this.state);
      } else if (msg?.type === 'cortico:ready') {
        this.dataDir = msg.dataDir;
      } else if (msg?.type === 'cortico:restart') {
        this.restartAsked = true;
      } else if (msg?.type === 'companion:open') {
        this.emit('open', typeof msg.path === 'string' ? msg.path : '');
      } else if (msg?.type === 'companion:hide') {
        this.emit('hide');
      } else if (msg?.type === 'companion:quit') {
        this.emit('quit');
      } else if (msg?.type === 'companion:update-install') {
        this.emit('update-install');
      } else if (msg?.type === 'companion:releases') {
        this.emit('releases');
      }
    });
    const exited = (code, signal, startFailed) => {
      if (startFailed) log.write(startDiagnostics(this.opts.appRoot));
      log.end(`===== exit ${code} =====\n`);
      if (this.child !== child) return;
      this.child = null;
      this.port = null;
      if (this.stopping) { this.state = 'stopped'; this.emit('state', this.state); return; }
      const flagged = this.dataDir && existsSync(join(this.dataDir, '.restart-request'));
      if (this.restartAsked || flagged) {
        this.state = 'restarting';
        this.emit('state', this.state);
        void this.start();
        return;
      }
      this.unexpectedExit = code ?? signal;
      if (startFailed && missingModule) {
        const delay = missingModuleDelay(this.missingModuleExits);
        if (delay !== null) {
          this.missingModuleExits++;
          // no detail: these waits are not told with a notification
          this.state = 'restarting';
          this.emit('state', this.state);
          setTimeout(() => { if (!this.stopping) void this.start(); }, delay);
          return;
        }
        this.state = 'failed';
        this.emit('state', this.state, `Core 启动时找不到所需的文件,连续 ${this.missingModuleExits + 1} 次没有启动(退出码 ${code}),已停止重试。${FAILED_HINT}也可能是某个已安装的扩展缺少依赖。日志:${logFile}`);
        return;
      }
      const now = Date.now();
      this.crashes = this.crashes.filter((t) => now - t < CRASH_WINDOW_MS);
      this.crashes.push(now);
      if (this.crashes.length > MAX_CRASHES) {
        this.state = 'failed';
        this.emit('state', this.state, `Core 在 5 分钟内退出了 ${this.crashes.length} 次(退出码 ${code}),已停止重试。${FAILED_HINT}日志:${logFile}`);
        return;
      }
      this.state = 'restarting';
      this.emit('state', this.state, `Core 意外退出(退出码 ${code}),3 秒后重启`);
      setTimeout(() => { if (!this.stopping) void this.start(); }, 3000);
    };
    child.on('exit', (code, signal) => {
      const startFailed = this.child === child && this.state === 'starting' && !this.stopping && !this.restartAsked;
      if (!startFailed || child.stderr.readableEnded) { exited(code, signal, startFailed); return; }
      // the last stderr lines can be read after the exit, and a failed start is judged on all of them
      let settled = false;
      let release;
      this.settling = new Promise((r) => { release = r; });
      const settle = () => { if (!settled) { settled = true; exited(code, signal, startFailed); release(); } };
      child.stderr.once('end', settle);
      setTimeout(settle, 1000);
    });
  }

  /** Sends a message to the running child; dropped while there is none. */
  send(msg) {
    try { this.child?.send(msg); } catch { /* channel closing */ }
  }

  /** Asks for a clean shutdown; kills the child if it has not exited within `graceMs`. */
  async stop(graceMs = 12_000) {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    // a child that exited already may still be held while its last stderr lines are read: it is let go as stopped
    if (child.exitCode !== null || child.signalCode !== null) { await this.settling; return; }
    const exited = new Promise((r) => child.once('exit', r));
    try { child.send({ type: 'companion:shutdown' }); } catch { /* channel already closed */ }
    const done = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), graceMs))]);
    if (!done) child.kill();
  }

  /** Restart on demand (tray menu). */
  async restart() {
    await this.stop();
    this.stopping = false;
    await this.start();
  }
}

module.exports = { CoreHost, CORE_NODE_FLAGS, MISSING_MODULE_DELAYS_MS, isMissingModule, missingModuleDelay };
