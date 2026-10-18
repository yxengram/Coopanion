/**
 * Runs the Core child process and keeps it running.
 *
 * The child is `core/boot.ts` under the app's own runtime in Node mode, with `--import tsx`.
 * It reports `companion:ready` with the console port. It exits on purpose after asking for a
 * restart (`cortico:restart`, or `<dataDir>/.restart-request` written by the console), and is
 * started again; an unexpected exit is restarted after 3 s, at most 5 times in 5 minutes, except one
 * before `companion:ready` that could not find a module or package on stderr (what a start meets while an update is
 * still writing the runtime's files), which waits longer each time (MISSING_MODULE_DELAYS_MS) without counting toward
 * that budget, and one that said another process holds the data directory's instance lock (`companion:locked`) or that
 * every console port it tried is taken (`companion:ports-busy`), which is not restarted: starting again would meet the
 * same lock or ports. A child that exits unasked before it is ready leaves the app's arguments, its parent PID and whether the
 * entry and tsx are on disk in the log. A start after the host gave up (`failed`) begins with a full budget. The next
 * child started after an unexpected exit gets its exit code or signal in `COOPANION_CORE_EXIT`, for
 * the usage statistics. Every start looks up the system proxy again (systemProxyEnvironment) and hands
 * it to the child as proxy variables unless the environment already has its own.
 *
 * Events: `ready` ({ port, keyMissing, language }), `language` (the app language, from each ready child and after
 * each change it reports with `companion:language`), `state` (state, detail in the app language), and the
 * child's requests (`open`, `hide`, `quit`, `update-install`, `releases`, and `browse` with a ChatGPT sign-in page to
 * open in the system browser: only an `https://auth.openai.com/` address is handed on, see `isSignInPage`).
 */
const { fork } = require('node:child_process');
const { coreEnvironment, systemProxyEnvironment } = require('./core-env.cjs');
const { EventEmitter } = require('node:events');
const { createWriteStream, existsSync, mkdirSync, renameSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { textOf } = require('./i18n/index.cjs');

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

/** Whether a piece of stderr says a module or package could not be found. */
const isMissingModule = (text) => MISSING_MODULE.test(text);

/** The wait before the next start after `exits` such exits in a row, or null when the host gives up. */
const missingModuleDelay = (exits) => (exits < MISSING_MODULE_DELAYS_MS.length ? MISSING_MODULE_DELAYS_MS[exits] : null);

/**
 * A page of OpenAI's sign-in (`companion:browse`, from the ChatGPT plan's sign-in in the pet's bubble): the only
 * address the Core may have the app open in the system browser.
 */
function isSignInPage(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.host === 'auth.openai.com' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** The app process's arguments and parent PID, and whether the Core's entry and tsx exist, as a line for core.log. */
function startDiagnostics(appRoot) {
  const entry = join(appRoot, 'core', 'boot.ts');
  const tsx = join(appRoot, ...TSX_ENTRY);
  const on = (file) => `${file} ${existsSync(file) ? 'exists' : 'missing'}`;
  return `exited before ready; app argv ${JSON.stringify(process.argv.slice(1))}, ppid ${process.ppid}; ${on(entry)}; ${on(tsx)}\n`;
}

class CoreHost extends EventEmitter {
  /**
   * `execPath` is the runtime the child runs under, by default this process's own. `text` gives the
   * app language's table (app/i18n) for the state details, read when one is said; by default Chinese.
   * @param {{ appRoot: string, env: NodeJS.ProcessEnv, logDir: string, resolveProxy: (url: string) => Promise<string>, execPath?: string, text?: () => Record<string, any> }} opts
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
    /**
     * What the child said keeps it from starting, so its exit is not restarted: another process holds the data
     * directory's lock (`companion:locked`: its PID and the lock file), or every console port is taken
     * (`companion:ports-busy`: the first and last port tried).
     */
    this.blocked = null;
    /** Exit code or signal of the last child that exited unasked, not yet handed to a new one. */
    this.unexpectedExit = null;
    this.state = 'stopped';
    /** The app language as the last ready child said, and after each change it reported (`companion:language`). */
    this.language = null;
  }

  /** The table the state details are said in. */
  text() {
    return this.opts.text?.() ?? textOf('zh');
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
        if (typeof msg.language === 'string') this.language = msg.language;
        this.state = 'running';
        this.missingModuleExits = 0;
        // the language first: a listener of `ready` loads the console in it
        if (typeof msg.language === 'string') this.emit('language', msg.language);
        this.emit('ready', { port: msg.port, keyMissing: this.keyMissing, language: this.language });
        this.emit('state', this.state);
      } else if (msg?.type === 'cortico:ready') {
        this.dataDir = msg.dataDir;
      } else if (msg?.type === 'companion:locked') {
        this.blocked = { kind: 'locked', pid: Number.isInteger(msg.pid) ? msg.pid : null, file: String(msg.file ?? '') };
      } else if (msg?.type === 'companion:ports-busy' && Number.isInteger(msg.from) && Number.isInteger(msg.to)) {
        this.blocked = { kind: 'ports-busy', from: msg.from, to: msg.to };
      } else if (msg?.type === 'companion:language' && typeof msg.language === 'string') {
        this.language = msg.language;
        this.emit('language', msg.language);
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
      } else if (msg?.type === 'companion:browse' && isSignInPage(msg.url)) {
        this.emit('browse', msg.url);
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
      if (this.blocked) {
        // starting again would meet the same lock or ports: the person frees them, then restarts from the tray
        const blocked = this.blocked;
        this.blocked = null;
        this.state = 'failed';
        this.emit('state', this.state, blocked.kind === 'locked' ? this.text().coreLocked(blocked.pid, blocked.file) : this.text().corePortsBusy(blocked.from, blocked.to));
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
        this.emit('state', this.state, this.text().coreMissingModule(this.missingModuleExits + 1, code, logFile));
        return;
      }
      const now = Date.now();
      this.crashes = this.crashes.filter((t) => now - t < CRASH_WINDOW_MS);
      this.crashes.push(now);
      if (this.crashes.length > MAX_CRASHES) {
        this.state = 'failed';
        this.emit('state', this.state, this.text().coreFailed(this.crashes.length, code, logFile));
        return;
      }
      this.state = 'restarting';
      this.emit('state', this.state, this.text().coreRestarting(code));
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

module.exports = { CoreHost, CORE_NODE_FLAGS, MISSING_MODULE_DELAYS_MS, isMissingModule, isSignInPage, missingModuleDelay };
