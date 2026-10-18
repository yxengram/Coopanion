/**
 * Coopanion main process.
 *
 * Two modes share this executable:
 * - the app: tray icon, the settings window (the Cortico console served by the Core child on
 *   127.0.0.1), and the Core child process (`core-host.cjs`). A start shows the pet and the tray
 *   icon only; the settings window opens from the tray, the pet's menu, or when the pet asks for
 *   a missing model key (`core/companion.ts`). Starting it again while it runs brings the pet back, or starts the
 *   Core again when it stopped retrying (`failed`);
 * - `--pet-host --pet-url=… --parent-pid=…`: the desktop pet's transparent window, started by
 *   the desktop-pet World through `CORTICO_DESKTOP_PET_HOST`. It uses its own profile directory.
 *
 * A build is for one channel, `coopanion.channel` in the app's package.json (scripts/pack.ts, `channel.cjs`): `github`
 * (the default) is the installers, which on Windows and as an AppImage update themselves from the GitHub releases;
 * `portable` is the Windows zip, which runs from wherever it is unpacked, writes nothing outside its folder but its
 * login item, and is updated by hand.
 *
 * Every file the app writes lives under one data directory: on Windows `data\` beside the program when
 * packaged, or for the installed build the data an earlier start used when the program has none beside it
 * (`data-dir.cjs`, whose record in `%LOCALAPPDATA%\Coopanion` is the one file outside it); the uninstaller leaves
 * it. A portable folder copied whole is a second pet with its own data. On macOS
 * `~/Library/Application Support/Coopanion`, since the .app is not a place to write; on Linux
 * `~/.config/Coopanion` (an AppImage is mounted read-only, a deb installs under /opt); from
 * source `build/data`; or `CORTICO_COMPANION_DATA`. It holds `home/` (deployment, endpoint,
 * Memory), `extensions/` (Worlds and providers installed from npm), `logs/`, `tmp/` (the process
 * temp directory), `pnpm/` (store and caches for extension installs),
 * and the Chromium profiles.
 *
 * On macOS the app lives in the menu bar (the Info.plist sets LSUIElement): no Dock icon, except
 * while the settings window is open, so it can be reached with Command-Tab.
 *
 * Text follows the app language (`config.language`, tables in `i18n/`): the deployment config's at
 * start, the system's before the first start, then each one the Core reports (`companion:language`),
 * which rebuilds the tray menu and reloads the settings window. A new install's language is the
 * system's, handed to the Core as `COOPANION_SYSTEM_LANGUAGE`. The settings window's preload keeps the
 * console in the app language (`settings-preload.cjs`); a console language an older version saved there
 * only changed the console's look and gives way to it.
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, powerMonitor, session, shell } = require('electron');
const { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } = require('node:fs');
const { delimiter, dirname, join } = require('node:path');
const { askDataLocation, bindDataLocation, locateData, readRecord, samePath, strandedAction, writeRecord } = require('./data-dir.cjs');
const { buildChannel, channelRules, loginItemOn } = require('./channel.cjs');

const MAC = process.platform === 'darwin';
const LINUX = process.platform === 'linux';
// Linux: X11 (XWayland under a Wayland session). On Wayland a window cannot place itself or stay on top,
// and the cursor position outside the app's own windows is unknown, which the pet needs.
if (LINUX) app.commandLine.appendSwitch('ozone-platform', 'x11');
// Without a usable GPU (virtual machines, blocklisted drivers) Chromium no longer
// falls back to software WebGL on its own, and the whale and the four 娘 figures draw with WebGL: allow SwiftShader. It
// only renders the app's own pages.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const APP_ROOT = app.getAppPath();
const ICONS = join(__dirname, 'icons');
const PET_HOST = process.argv.includes('--pet-host');
const PROGRAM_DIR = dirname(process.execPath);
/** The build's channel (see the module header); from source there is none, which reads as `github`. */
const CHANNEL = buildChannel(JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')));
const RULES = channelRules({
  channel: CHANNEL, platform: process.platform, isPackaged: app.isPackaged, dataOverride: !!process.env.CORTICO_COMPANION_DATA,
  canUpdate: require('./updater.cjs').canUpdate(), programDir: PROGRAM_DIR,
});
/** The Windows installed build, whose data directory data-dir.cjs finds from the program's directory. */
const INSTALLED = RULES.installed;
const BESIDE = join(PROGRAM_DIR, 'data');
const DATA_RECORD = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Coopanion', 'data-location.json') : null;
const located = INSTALLED && DATA_RECORD ? locateData({ programDir: PROGRAM_DIR, record: readRecord(DATA_RECORD) }) : null;
const DATA = process.env.CORTICO_COMPANION_DATA
  || (!app.isPackaged ? join(APP_ROOT, 'build', 'data')
    : MAC || LINUX ? join(app.getPath('appData'), 'Coopanion') : located?.use ?? BESIDE);

/**
 * An install made through the installer's pages sits in %LOCALAPPDATA%\Programs\Coopanion: the per-user
 * install mode (installer/nsis.nsh's customInstallMode) sets that after its customInit ran. From 0.1.14 to 0.1.16 an update, which installs
 * silently and so keeps customInit's choice, moved the program to %USERPROFILE%\Coopanion and left data\ behind
 * (#84). See restoreStrandedData.
 */
const STRANDED_DIR = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'Coopanion') : null;
const STRANDED_DATA = STRANDED_DIR && join(STRANDED_DIR, 'data');

if (located?.ask && !PET_HOST) {
  // No data beside the program, and the record names data an earlier start used: ask which to use, bind the
  // record to this program directory with the answer, and start again on it (data-dir.cjs).
  // Chromium's own files for these dialogs go to the temp directory
  app.setPath('userData', join(app.getPath('temp'), 'Coopanion'));
  app.whenReady().then(() => {
    const { record } = located;
    const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
    const language = configuredLanguage(join(record.data, 'home')) ?? systemLanguage(app);
    const data = askDataLocation(located, {
      box: (options) => dialog.showMessageBoxSync(options),
      pickFolder: (defaultPath) => dialog.showOpenDialogSync({ title: textOf(language).dataChooseTitle, defaultPath, properties: ['openDirectory'] })?.[0],
      text: textOf(language),
      when: new Date(record.startedAt).toLocaleString(language),
      programDir: PROGRAM_DIR,
      beside: BESIDE,
    });
    if (data) {
      try {
        bindDataLocation(data, { recordFile: DATA_RECORD, record, programDir: PROGRAM_DIR, beside: BESIDE, strandedData: STRANDED_DATA });
      } catch {
        // quit rather than stay running with no window; a new one beside a program in a directory that needs
        // administrator rights (Program Files) says why, as dataNotWritable below does
        if (samePath(data, BESIDE)) {
          const suggested = join(process.env.LOCALAPPDATA ?? app.getPath('home'), 'Programs', 'Coopanion');
          dialog.showErrorBox('Coopanion', textOf(language).dataNotWritable(data, suggested));
        }
        app.exit(1);
        return;
      }
      app.relaunch();
    }
    app.exit(0);
  });
  return;
}

/**
 * data\ beside the program cannot be written when the program sits in a directory that needs administrator
 * rights, such as Program Files. The app then says why and quits before anything is created under DATA; the
 * probe goes into DATA, or into the install directory while DATA does not exist yet (an empty data\ made here
 * would be taken for data in use by restoreStrandedData). The portable build checks the same (a zip unpacked into
 * Program Files, or onto a read-only drive) and says to unpack it somewhere else.
 */
function dataWritable() {
  const probe = join(existsSync(DATA) ? DATA : dirname(DATA), `.write-test-${process.pid}`);
  try {
    writeFileSync(probe, '');
    rmSync(probe);
    return true;
  } catch {
    return false;
  }
}
if ((INSTALLED || RULES.besideOnly) && !dataWritable()) {
  // Chromium's own files for this one dialog go to the temp directory
  app.setPath('userData', join(app.getPath('temp'), 'Coopanion'));
  app.whenReady().then(() => {
    const suggested = join(process.env.LOCALAPPDATA ?? app.getPath('home'), 'Programs', 'Coopanion');
    const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
    const t = textOf(configuredLanguage(join(DATA, 'home')) ?? systemLanguage(app));
    dialog.showErrorBox('Coopanion', INSTALLED ? t.dataNotWritable(DATA, suggested) : t.portableNotWritable(DATA));
    app.exit(1);
  });
  return;
}

/*
 * The data an update left in STRANDED_DIR (#84): the first start in the new place takes that data\ back. When
 * the app has run here since, this data\ may be the one in use, so a dialog asks first (askRestoreStranded);
 * taking the old one back then happens on the next start, before anything here is open, and keeps this one
 * beside it as data-replaced-<time>. Only data beside the program is handled so: data the record pointed
 * elsewhere was chosen, and a new one started from the data-location dialog carries the answer `keep`.
 */
/** The answer to that dialog: `restore` or `keep`. */
const STRANDED_CHOICE = join(DATA, 'stranded-data-choice');

/** Returns true when the dialog has to ask. */
function restoreStrandedData() {
  const choice = existsSync(STRANDED_CHOICE) ? readFileSync(STRANDED_CHOICE, 'utf8') : '';
  const action = strandedAction({ data: DATA, strandedDir: STRANDED_DIR, choice });
  if (action !== 'restore') return action === 'ask';
  rmSync(STRANDED_CHOICE, { force: true });
  const aside = `${DATA}-replaced-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let line;
  try {
    if (existsSync(DATA)) renameSync(DATA, aside);
    renameSync(STRANDED_DATA, DATA);
    line = `restored ${STRANDED_DATA}${existsSync(aside) ? `, the data here kept as ${aside}` : ''}`;
    try { rmdirSync(STRANDED_DIR); } catch { /* not empty: something else was put there */ }
  } catch (err) {
    if (existsSync(aside) && !existsSync(DATA)) renameSync(aside, DATA);
    line = `could not restore ${STRANDED_DATA}: ${err?.message ?? err}`;
  }
  mkdirSync(join(DATA, 'logs'), { recursive: true });
  appendFileSync(join(DATA, 'logs', 'data-restore.log'), `${new Date().toISOString()} ${line}\n`);
  return false;
}
const askStranded = INSTALLED && !PET_HOST && DATA === BESIDE && restoreStrandedData();

// before anything asks Electron for a path: the single-instance lock and the profile live in userData
app.setPath('userData', DATA);
app.setPath('crashDumps', join(DATA, 'Crashpad'));
process.env.TEMP = process.env.TMP = process.env.TMPDIR = join(DATA, 'tmp');
mkdirSync(process.env.TEMP, { recursive: true });

/* ---------- pet window mode ---------- */
if (PET_HOST) {
  const arg = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : ''; };
  app.setPath('userData', join(app.getPath('userData'), 'pet-window'));
  if (MAC) app.dock?.hide();
  const { runPetHost } = require(require.resolve('cortico-world-desktop-pet/host/electron-main.cjs'));
  runPetHost({ url: arg('pet-url'), parentPid: Number(arg('parent-pid')) || 0, tray: false });
  return;
}

/* ---------- app mode ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
if (located) {
  try {
    writeRecord(DATA_RECORD, { data: DATA, program: PROGRAM_DIR, startedAt: new Date().toISOString() });
  } catch { /* the app runs without the record; a later move of the program then finds no data to offer */ }
}

const { CoreHost, isSignInPage } = require('./core-host.cjs');
const { systemLanguageEnvironment } = require('./core-env.cjs');
const { configuredLanguage, systemLanguage, textOf } = require('./i18n/index.cjs');
const { trayTemplate } = require('./tray-menu.cjs');
const { RELEASES_URL, startUpdater } = require('./updater.cjs');
const { startPresence } = require('./presence.cjs');

const userData = app.getPath('userData');
const shimDir = join(__dirname, 'shims');
const petHost = app.isPackaged ? [process.execPath, '--pet-host'] : [process.execPath, APP_ROOT, '--pet-host'];

/** The app language, set once the app is ready (see the module header); Chinese until then. */
let language = 'zh';
const T = () => textOf(language);

const core = new CoreHost({
  appRoot: APP_ROOT,
  logDir: join(userData, 'logs'),
  // the default session follows the operating system's proxy settings, PAC scripts included
  resolveProxy: (url) => session.defaultSession.resolveProxy(url),
  text: T,
  env: {
    ...process.env,
    CORTICO_HOME: join(userData, 'home'),
    CORTICO_EXTENSIONS_DIR: join(userData, 'extensions'),
    CORTICO_SUPERVISED: '1',
    CORTICO_START_PAUSED: '0',
    CORTICO_DESKTOP_PET_HOST: JSON.stringify(petHost),
    // pnpm keeps its store and caches in LOCALAPPDATA unless told otherwise; pnpm 11 reads the pnpm_config_ prefix
    pnpm_config_store_dir: join(DATA, 'pnpm', 'store'),
    pnpm_config_cache_dir: join(DATA, 'pnpm', 'cache'),
    pnpm_config_state_dir: join(DATA, 'pnpm', 'state'),
    // the portable build installs extensions in pnpm's hoisted layout, which survives copying the folder (channel.cjs)
    ...RULES.coreEnv,
    // extension installs call `corepack pnpm`; the shim (corepack.cmd, or corepack on macOS) runs the bundled pnpm on this runtime
    PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}`,
    CORTICO_NODE_EXE: process.execPath,
    CORTICO_PNPM_CJS: join(APP_ROOT, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    // reported with the usage statistics (core/telemetry.ts)
    COOPANION_VERSION: app.getVersion(),
  },
});

let settings = null;
let tray = null;
/** Builds the tray menu again (its labels, the Core's state, the login item); set once the tray exists. */
let refreshTray = () => {};
let quitting = false;
let updater = null;
/** The updater's last step, told again to a Core that starts after it (`core/companion.ts` says it in the bubble). */
let updateStep = null;
/** What the settings window's version line shows of the updater (`settings-preload.cjs`, console/features/release.ts). */
const updateLine = () => updateStep && { phase: updateStep.phase, version: updateStep.version };

const consoleUrl = (path = '') => (core.port ? `http://127.0.0.1:${core.port}/${path}` : null);

function loadingPage(text) {
  // with lang set, Chromium takes the system's Chinese font for Chinese
  const html = `<!doctype html><html lang="${language === 'zh' ? 'zh-CN' : language}"><meta charset="utf-8"><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#f4f5f4;color:#5c5c60;font:15px -apple-system,"PingFang SC","Microsoft YaHei UI",system-ui,sans-serif}@media(prefers-color-scheme:dark){html,body{background:#0e1113;color:#9aa0a6}}</style><body>${text}</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function openSettings(path = '') {
  // a menu-bar app shows in the Dock only while it has a window to switch to
  if (MAC) void app.dock?.show();
  if (settings) {
    if (settings.isMinimized()) settings.restore();
    settings.show();
    settings.focus();
    const url = consoleUrl(path);
    if (url && path) settings.loadURL(url);
    return;
  }
  settings = new BrowserWindow({
    width: 1180, height: 800, minWidth: 880, minHeight: 600,
    title: 'Coopanion', icon: join(ICONS, 'icon.png'), autoHideMenuBar: true, show: false,
    backgroundColor: '#f4f5f4',
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: join(__dirname, 'settings-preload.cjs') },
  });
  settings.once('ready-to-show', () => settings.show());
  settings.on('page-title-updated', (e) => e.preventDefault());
  settings.webContents.setWindowOpenHandler(({ url }) => {
    const origin = core.port ? `http://127.0.0.1:${core.port}` : null;
    const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url);
    if (local) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: join(ICONS, 'icon.png') } };
    if (origin && url.startsWith(origin)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  settings.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    settings.hide();
    if (MAC) app.dock?.hide();
  });
  settings.on('closed', () => { settings = null; });
  const url = consoleUrl(path);
  settings.loadURL(url ?? loadingPage(T().starting));
}

/** Calls a panel method of a World page through the WebUI API. */
async function panel(pageId, panelId, method) {
  const url = consoleUrl(`api/webui/providers/${encodeURIComponent(pageId)}/panels/${panelId}/${method}`);
  if (!url) return null;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: [] }) });
  return res.ok ? res.json() : null;
}

async function showPet() {
  await panel('world:desktop-pet', 'pet', 'closeWindow');
  await panel('world:desktop-pet', 'pet', 'openWindow');
}

/** Brings the pet back unless its page is on screen already (reopening it would make it blink). */
async function ensurePet() {
  const state = await panel('world:desktop-pet', 'pet', 'state').catch(() => null);
  if (!state?.connected) await showPet();
}

/**
 * Start at login. Electron's login items cover Windows and macOS; on Linux it is an XDG autostart entry
 * (~/.config/autostart/coopanion.desktop) that runs the AppImage, or the installed executable. The portable build
 * names its Windows value after its folder, so each copy has its own (channel.cjs).
 */
const AUTOSTART = join(app.getPath('home'), '.config', 'autostart', 'coopanion.desktop');
const LOGIN_ARGS = ['--background'];
const loginItem = {
  // Windows reads openAtLogin back as true only with the arguments it was set with
  get: () => (LINUX ? existsSync(AUTOSTART) : loginItemOn(app.getLoginItemSettings(RULES.loginName ? undefined : { args: LOGIN_ARGS }), RULES.loginName)),
  set(on) {
    if (!LINUX) { app.setLoginItemSettings({ openAtLogin: on, args: LOGIN_ARGS, ...RULES.loginName ? { name: RULES.loginName } : {} }); return; }
    if (!on) { rmSync(AUTOSTART, { force: true }); return; }
    const exe = process.env.APPIMAGE || process.execPath;
    mkdirSync(dirname(AUTOSTART), { recursive: true });
    writeFileSync(AUTOSTART, `[Desktop Entry]\nType=Application\nName=Coopanion\nExec="${exe}" --background\nX-GNOME-Autostart-enabled=true\n`);
  },
};

/** The usage statistics report whether the app starts at login; the Core reads it when it (re)starts. */
function noteAutostart() {
  core.opts.env.COOPANION_AUTOSTART = app.isPackaged && loginItem.get() ? '1' : '0';
}

function buildTray() {
  // macOS: a black template image the menu bar tints to its own color
  const name = MAC ? 'trayTemplate' : 'tray';
  const icon = nativeImage.createFromPath(join(ICONS, `${name}.png`));
  icon.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(join(ICONS, `${name}@2x.png`)).toPNG() });
  if (MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Coopanion');
  const refresh = () => {
    tray.setContextMenu(Menu.buildFromTemplate(trayTemplate(T(), { running: core.state === 'running', login: loginItem.get(), packaged: app.isPackaged }, {
      openSettings: () => openSettings(),
      showPet: () => void showPet(),
      setLogin: (on) => { loginItem.set(on); noteAutostart(); refresh(); },
      restart: () => void core.restart(),
      quit: () => app.quit(),
    })));
  };
  refreshTray = refresh;
  refresh();
  core.on('state', refresh);
  // on macOS a click opens the menu, as every menu-bar icon does
  if (!MAC) tray.on('click', () => openSettings());
}

core.on('ready', () => {
  if (settings) settings.loadURL(consoleUrl());
  if (updateStep) core.send(updateStep);
});

// the app language as the Core has it: at each start and after the 「习惯」 page changes it
core.on('language', (next) => {
  if (next === language) return;
  language = next;
  refreshTray();
  if (!settings) return;
  // the preload sets the console's language before the page loads again; the starting page is drawn anew
  if (settings.webContents.getURL().startsWith('data:')) settings.loadURL(loadingPage(T().starting));
  else settings.webContents.reload();
});
ipcMain.on('settings:language', (e) => { e.returnValue = language; });
// whether this build updates itself (then the version line shows the updater's steps), and its last step
ipcMain.on('settings:update', (e) => { e.returnValue = { auto: RULES.selfUpdate, step: updateLine() }; });
core.on('update-install', () => updater?.installNow());
core.on('releases', () => void shell.openExternal(RELEASES_URL));
// the ChatGPT sign-in page the pet's bubble sends to the system browser; core-host.cjs hands on no other address
core.on('browse', (url) => { if (isSignInPage(url)) void shell.openExternal(url); });
core.on('state', (state, detail) => {
  if (!detail) return;
  if (Notification.isSupported()) new Notification({ title: 'Coopanion', body: detail, icon: join(ICONS, 'icon.png') }).show();
  if (state === 'failed') dialog.showErrorBox('Coopanion', detail);
});

core.on('open', (path) => openSettings(path));
// the introduction runs again on the desktop, where Coo is
core.on('hide', () => {
  if (!settings) return;
  settings.hide();
  if (MAC) app.dock?.hide();
});
core.on('quit', () => app.quit());
const bringBack = () => {
  if (core.state === 'failed') void core.start();
  else if (core.state === 'running') ensurePet().catch(() => { /* Core went away meanwhile */ });
};
app.on('second-instance', bringBack);
// macOS: opening the app again while it runs
app.on('activate', bringBack);
app.on('window-all-closed', () => { /* stays in the tray */ });
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  void core.stop().finally(() => {
    // a downloaded update installs now; its quit comes back here with quitting set and goes through
    if (updater?.installOnQuit()) setTimeout(() => app.exit(0), 10_000);
    else app.exit(0);
  });
});

/** Asks whether to take back the data\ an update left behind; true when the app restarts to do it. */
function askRestoreStranded() {
  const response = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Coopanion',
    message: T().strandedMessage,
    detail: T().strandedDetail(STRANDED_DATA, dirname(DATA)),
    buttons: [T().strandedRestore, T().strandedKeep],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  writeFileSync(STRANDED_CHOICE, response === 0 ? 'restore' : 'keep');
  if (response !== 0) return false;
  app.relaunch();
  app.exit(0);
  return true;
}

app.whenReady().then(() => {
  app.setAppUserModelId('ai.pal.coopanion');
  // the system's language is known from here on: a new install starts in it (core/seed.ts)
  const system = systemLanguage(app);
  Object.assign(core.opts.env, systemLanguageEnvironment(system));
  language = configuredLanguage(join(userData, 'home')) ?? system;
  if (askStranded && askRestoreStranded()) return;
  buildTray();
  // whether the person is at the computer, for the pet's small talk (app/presence.cjs)
  startPresence({ powerMonitor, send: (msg) => core.send(msg), onReady: (fn) => core.on('ready', fn) });
  noteAutostart();
  void core.start();
  // the portable build is updated by hand: its version line links to a newer release instead
  if (RULES.selfUpdate) updater = startUpdater({
    logDir: join(userData, 'logs'),
    tell: (step) => {
      updateStep = { type: 'companion:update', ...step };
      core.send(updateStep);
      settings?.webContents.send('settings:update', updateLine());
    },
  });
});
