// The pet window process (packages/cortico-world-desktop-pet/host/electron-main.cjs) run with Electron, koffi and the
// platform stood in, so the Windows and X11 branches of v0.9.1's window fixes run on every OS's CI (and on a Mac):
// - the pet is told it is shown even when the platform's first `show` event never comes, and never told hidden
//   before that (a hidden page plays no sound: tests/pet-sound-hidden.test.js);
// - Windows: a window gone full screen from maximized hides the pet while one still maximized does not; the desktop,
//   the pet itself and other monitors never count; a hand's hide or show takes the window back from the rule;
// - X11: the cursor is read from the X server (Electron's stays where it was for a click-through window), the page
//   hears it inside the window and null outside, the mouse lease follows the page's wish and runs out, and the verdict
//   is applied again whenever the window is mapped or unmapped; with the preload in between, hover buttons beside the
//   pet keep the mouse and leaving them gives it back.
// The modules are loaded as the window process loads them (CommonJS) with `process` swapped for each platform.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const HOST = fileURLToPath(new URL('../packages/cortico-world-desktop-pet/host/', import.meta.url));
const realRequire = createRequire(import.meta.url);

/** `file` and what it requires from host/, each run with `proc` as its `process`; `electron` and `koffi` stood in. */
function loadModule(file, { platform, electron, koffi }) {
  const proc = { platform, argv: [], env: {}, pid: 4242, kill() {} };
  const cache = new Map();
  const requireFrom = (from) => (spec) => {
    if (spec === 'electron') return electron;
    if (spec === 'koffi') { if (!koffi) throw new Error('koffi not here'); return koffi; }
    if (spec.startsWith('node:')) return realRequire(spec);
    const path = join(from, spec);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const fn = runInThisContext(`(function (exports, require, module, __filename, __dirname, process) {${readFileSync(path, 'utf8')}\n})`, { filename: path });
    fn(module.exports, requireFrom(dirname(path)), module, path, dirname(path), proc);
    return module.exports;
  };
  return requireFrom(HOST)(file);
}

const WS_VISIBLE = 0x10000000, WS_MAXIMIZE = 0x01000000, WS_CAPTION = 0x00c00000;
/** The pet window's HWND. */
const PET_HWND = 0x500;

/** Electron as far as the host uses it: one display, windows that keep what they are told, ipcMain's handlers. */
function fakeElectron({ display, cursor = { x: 5, y: 5 }, emitShow = true }) {
  const ipc = new Map(), handles = new Map(), wins = [], toRenderer = new Map();
  const listen = (map) => (e, f) => { map.set(e, [...(map.get(e) ?? []), f]); };
  const fire = (map, e, ...args) => { for (const f of map.get(e) ?? []) f(...args); };
  class BrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.visible = false;
      this.bounds = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
      /** Every setIgnoreMouseEvents, oldest first: true while clicks pass through. */
      this.ignore = [];
      this.sent = [];
      this.events = new Map();
      const wcEvents = new Map();
      this.webContents = {
        events: wcEvents,
        on: listen(wcEvents),
        emit: (e, ...args) => fire(wcEvents, e, ...args),
        send: (ch, v, ...more) => { this.sent.push([ch, v, ...more]); fire(toRenderer, ch, {}, v, ...more); },
        setWindowOpenHandler() {},
        setZoomLevel: (z) => { this.zoom = z; },
        getURL: () => this.url,
      };
      wins.push(this);
    }
    on(e, f) { listen(this.events)(e, f); }
    once(e, f) { const g = (...a) => { this.events.set(e, (this.events.get(e) ?? []).filter((h) => h !== g)); f(...a); }; listen(this.events)(e, g); }
    emit(e, ...args) { fire(this.events, e, ...args); }
    setBounds(b) { this.bounds = { ...b }; }
    getBounds() { return { ...this.bounds }; }
    setAlwaysOnTop(_on, level) { this.level = level; }
    setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents(ignore) { this.ignore.push(ignore); }
    showInactive() { const was = this.visible; this.visible = true; if (!was && emitShow) this.emit('show'); }
    hide() { const was = this.visible; this.visible = false; if (was) this.emit('hide'); }
    isVisible() { return this.visible; }
    getNativeWindowHandle() { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(PET_HWND)); return b; }
    loadURL(u) { this.url = u; }
    focus() {}
    isFocused() { return false; }
    blur() {}
  }
  const state = { cursor };
  const electron = {
    app: { whenReady: () => Promise.resolve(), once() {}, on() {}, quit: vi.fn(), focus() {}, dock: { hide() {} } },
    BrowserWindow,
    Menu: { buildFromTemplate: () => ({}) },
    Tray: class {},
    nativeImage: { createFromBitmap: () => ({ setTemplateImage() {} }) },
    ipcMain: { on: (ch, f) => ipc.set(ch, f), handle: (ch, f) => handles.set(ch, f) },
    screen: {
      getAllDisplays: () => [display],
      getPrimaryDisplay: () => display,
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => state.cursor,
      on() {},
    },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    shell: { openExternal() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
    // the preload's side, wired to the window above
    contextBridge: { exposeInMainWorld: (_name, api) => { state.petHost = api; } },
    ipcRenderer: {
      send: (ch, v) => ipc.get(ch)?.({}, v),
      on: listen(toRenderer),
      invoke: async (ch, q) => handles.get(ch)?.({}, q),
    },
  };
  return { electron, wins, ipc, state };
}

/** koffi whose functions are looked up by name in `fns`; any other is a no-op returning 0. */
function fakeKoffi(fns) {
  return {
    load: () => ({ func: (signature) => fns[signature.match(/(\w+)\(/)[1]] ?? (() => 0) }),
    struct: () => ({}),
    sizeof: () => 48,
  };
}

/** Windows' user32 and shell32: the foreground window and every window's style, class, rect and monitor. */
function win32Desktop() {
  const desk = {
    fg: 0,
    windows: {},
    monitors: { 1: { left: 0, top: 0, right: 1920, bottom: 1080 }, 2: { left: 1920, top: 0, right: 3840, bottom: 1080 } },
    autoHide: false, edge: 3,
  };
  const win = (h) => desk.windows[Number(h)];
  desk.koffi = fakeKoffi({
    GetForegroundWindow: () => desk.fg,
    GetWindowLongW: (h) => win(h)?.style ?? 0,
    GetClassNameW: (h, buf) => { const n = win(h)?.cls ?? 'Chrome_WidgetWin_1'; buf.write(`${n}\0`, 'utf16le'); return n.length; },
    GetWindowRect: (h, buf) => {
      const r = win(h)?.rect;
      if (!r) return 0;
      [r.left, r.top, r.right, r.bottom].forEach((v, i) => buf.writeInt32LE(v, i * 4));
      return 1;
    },
    MonitorFromWindow: (h) => win(h)?.monitor ?? 1,
    GetMonitorInfoW: (m, buf) => {
      const r = desk.monitors[Number(m)];
      [r.left, r.top, r.right, r.bottom].forEach((v, i) => buf.writeInt32LE(v, 4 + i * 4));
      return 1;
    },
    // ABM_GETSTATE, ABM_GETTASKBARPOS
    SHAppBarMessage: (msg, data) => (msg === 4 ? (desk.autoHide ? 1 : 0) : msg === 5 ? ((data.uEdge = desk.edge), 1) : 0),
  });
  return desk;
}

/** Xlib with XQueryPointer answering where `x.pointer` is, in physical pixels. */
function x11Pointer() {
  const x = { pointer: { x: 0, y: 0 } };
  x.koffi = fakeKoffi({
    XOpenDisplay: () => ({}),
    XDefaultRootWindow: () => 1,
    XQueryPointer: (_dpy, _root, _r, _c, rx, ry) => { rx[0] = x.pointer.x; ry[0] = x.pointer.y; return 1; },
    XCloseDisplay: () => 0,
  });
  return x;
}

const FULL_HD = { id: 1, scaleFactor: 1, nativeOrigin: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };

/** Runs the host on `platform` and waits for its window. */
async function startHost({ platform, koffi = null, display = FULL_HD, emitShow = true, cursor }) {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(100_000);
  const fake = fakeElectron({ display, emitShow, cursor });
  const { runPetHost } = loadModule('./electron-main.cjs', { platform, electron: fake.electron, koffi });
  runPetHost({ url: 'http://127.0.0.1:9/pet', tray: false });
  for (let i = 0; i < 5 && !fake.wins.length; i++) await Promise.resolve();
  const win = fake.wins[0];
  expect(win).toBeTruthy();
  return {
    ...fake,
    win,
    send: (ch, v) => fake.ipc.get(ch)({}, v),
    tick: (ms) => vi.advanceTimersByTime(ms),
    shown: () => win.sent.filter(([c]) => c === 'pet:shown').map(([, v]) => v),
    cursors: () => win.sent.filter(([c]) => c === 'pet:cursor').map(([, v]) => v),
    /** The preload, run against this window: the page's `petHost`. */
    preload: () => { loadModule('./preload.cjs', { platform, electron: fake.electron }); return fake.state.petHost; },
  };
}

afterEach(() => { vi.useRealTimers(); });

const PLATFORMS = ['win32', 'linux', 'darwin'];

describe('pet window shown report, on each platform', () => {
  it.each(PLATFORMS)('%s: a first `show` that never comes still tells the page shown within a poll, never hidden', async (platform) => {
    const h = await startHost({ platform, emitShow: false });
    // the page finishes loading before the window is mapped: nothing is said, it starts out shown
    h.win.webContents.emit('did-finish-load');
    expect(h.win.zoom).toBe(0);
    expect(h.shown()).toEqual([]);
    h.win.emit('ready-to-show');
    expect(h.win.visible).toBe(true);
    expect(h.shown()).toEqual([]);
    h.tick(100);
    expect(h.shown()).toEqual([true]);
    h.tick(2000);
    expect(h.shown()).toEqual([true]);
  });

  it.each(PLATFORMS)('%s: shown once mapped, a hide said once (and the mouse given back), shown again by a hand', async (platform) => {
    const h = await startHost({ platform });
    h.win.emit('ready-to-show');
    h.win.webContents.emit('did-finish-load');
    expect(h.shown().length).toBeGreaterThan(0);
    expect(h.shown().every((v) => v === true)).toBe(true);
    h.send('pet:interactive', true);
    expect(h.win.ignore.at(-1)).toBe(false);
    const before = h.shown().length;
    h.send('pet:hide');
    expect(h.win.visible).toBe(false);
    expect(h.shown().slice(before)).toEqual([false]);
    expect(h.win.ignore.at(-1)).toBe(true);
    // hidden: no cursor reports, nothing more said
    const reports = h.cursors().length;
    h.tick(1000);
    expect(h.shown().slice(before)).toEqual([false]);
    expect(h.cursors().length).toBe(reports);
    // a reload while hidden hears hidden
    h.win.webContents.emit('did-finish-load');
    expect(h.shown().at(-1)).toBe(false);
    h.win.showInactive();
    expect(h.shown().at(-1)).toBe(true);
  });

  it.each(PLATFORMS)('%s: `isVisible()` reading false with no hide said never mutes the pet', async (platform) => {
    const h = await startHost({ platform });
    h.win.emit('ready-to-show');
    h.tick(100);
    // macOS reads a covered window as not visible; elsewhere a late map could read so too
    h.win.visible = false;
    h.tick(1000);
    h.win.webContents.emit('did-finish-load');
    expect(h.shown()).not.toContain(false);
  });

  it.each([
    ['win32', 'toolbar', 'screen-saver'],
    ['linux', undefined, 'screen-saver'],
    ['darwin', undefined, 'floating'],
  ])('%s: window type %s, on top at %s; zoom keys are kept from the page', async (platform, type, level) => {
    const h = await startHost({ platform });
    expect(h.win.opts.type).toBe(type);
    expect(h.win.level).toBe(level);
    expect(h.win.opts).toMatchObject({ transparent: true, show: false, skipTaskbar: true });
    expect(h.win.ignore[0]).toBe(true);
    const key = (input) => { const e = { preventDefault: vi.fn() }; h.win.webContents.emit('before-input-event', e, input); return e.preventDefault.mock.calls.length > 0; };
    expect(key({ control: true, key: '-' })).toBe(true);
    expect(key({ meta: true, key: '=' })).toBe(true);
    // the numpad keys by code, with a key name outside the list
    expect(key({ control: true, code: 'NumpadAdd', key: 'Add' })).toBe(true);
    expect(key({ control: true, code: 'NumpadSubtract', key: 'Subtract' })).toBe(true);
    expect(key({ control: true, code: 'Numpad0', key: 'Insert' })).toBe(true);
    expect(key({ key: '-' })).toBe(false);
    expect(key({ control: true, key: 'a' })).toBe(false);
  });
});

describe('Windows: hiding while a window is full screen', () => {
  const MONITOR = { left: 0, top: 0, right: 1920, bottom: 1080 };
  const maximized = { style: WS_VISIBLE | WS_MAXIMIZE | WS_CAPTION, rect: { left: -8, top: -8, right: 1928, bottom: 1048 }, monitor: 1 };
  // a maximized window with no taskbar strip on its monitor (auto-hidden) reaches past every edge
  const maximizedNoTaskbar = { ...maximized, rect: { left: -8, top: -8, right: 1928, bottom: 1088 } };
  // full screen from maximized: Chromium keeps WS_MAXIMIZE, the title bar goes
  const fullscreenFromMax = { style: WS_VISIBLE | WS_MAXIMIZE, rect: { ...MONITOR }, monitor: 1 };

  async function start() {
    const desk = win32Desktop();
    const h = await startHost({ platform: 'win32', koffi: desk.koffi });
    h.send('pet:hideWhenFullscreen', true);
    h.win.emit('ready-to-show');
    desk.fg = 0x200;
    return { h, desk };
  }

  it('a maximized window never hides the pet, even one reaching past every edge; going full screen from it does', async () => {
    const { h, desk } = await start();
    expect(vi.getTimerCount()).toBe(2); // the cursor poll and the full-screen poll
    for (const w of [maximized, maximizedNoTaskbar]) {
      desk.windows[0x200] = w;
      h.tick(1000);
      expect(h.win.visible).toBe(true);
    }
    desk.windows[0x200] = fullscreenFromMax;
    h.tick(200);
    expect(h.win.visible).toBe(false);
    expect(h.shown().at(-1)).toBe(false);
    // back to maximized (or closed): the pet comes back by itself
    desk.windows[0x200] = maximized;
    h.tick(200);
    expect(h.win.visible).toBe(true);
    expect(h.shown().at(-1)).toBe(true);
    desk.windows[0x200] = fullscreenFromMax;
    h.tick(200);
    expect(h.win.visible).toBe(false);
    desk.fg = 0;
    h.tick(200);
    expect(h.win.visible).toBe(true);
  });

  it.each([
    ['the desktop (Progman)', { style: WS_VISIBLE, rect: { ...MONITOR }, monitor: 1, cls: 'Progman' }],
    ['the desktop (WorkerW)', { style: WS_VISIBLE, rect: { ...MONITOR }, monitor: 1, cls: 'WorkerW' }],
    ['a full screen window on another monitor', { style: WS_VISIBLE, rect: { left: 1920, top: 0, right: 3840, bottom: 1080 }, monitor: 2 }],
    ['a borderless window smaller than the monitor', { style: WS_VISIBLE, rect: { left: 100, top: 100, right: 1800, bottom: 1000 }, monitor: 1 }],
  ])('%s does not count', async (_name, w) => {
    const { h, desk } = await start();
    desk.windows[0x200] = w;
    h.tick(1000);
    expect(h.win.visible).toBe(true);
  });

  it('the pet window itself in the foreground does not count', async () => {
    const { h, desk } = await start();
    desk.fg = PET_HWND;
    desk.windows[PET_HWND] = { style: WS_VISIBLE, rect: { ...MONITOR }, monitor: 1 };
    h.tick(1000);
    expect(h.win.visible).toBe(true);
  });

  it('only while the setting is on; turned off while it hid the pet, the pet comes back', async () => {
    const { h, desk } = await start();
    desk.windows[0x200] = fullscreenFromMax;
    h.send('pet:hideWhenFullscreen', false);
    h.tick(1000);
    expect(h.win.visible).toBe(true);
    h.send('pet:hideWhenFullscreen', true);
    h.tick(200);
    expect(h.win.visible).toBe(false);
    h.send('pet:hideWhenFullscreen', false);
    h.tick(200);
    expect(h.win.visible).toBe(true);
  });

  it('the page hears a full screen window come and go whether or not the setting hides the pet (small talk keeps quiet then)', async () => {
    const { h, desk } = await start();
    h.send('pet:hideWhenFullscreen', false);
    const full = () => h.win.sent.filter(([c]) => c === 'pet:fullscreen').map(([, v]) => v);
    desk.windows[0x200] = maximized;
    h.tick(1000);
    expect(full()).toEqual([]);
    desk.windows[0x200] = fullscreenFromMax;
    h.tick(1000);
    expect(h.win.visible).toBe(true);
    expect(full()).toEqual([true]);
    // a page reloaded meanwhile hears it again
    h.win.webContents.emit('did-finish-load');
    expect(full()).toEqual([true, true]);
    desk.windows[0x200] = maximized;
    h.tick(1000);
    expect(full()).toEqual([true, true, false]);
    // the preload hands it to the page
    const seen = [];
    h.preload().onFullscreen((on) => seen.push(on));
    desk.windows[0x200] = fullscreenFromMax;
    h.tick(200);
    expect(seen).toEqual([true]);
  });

  it('a hide by hand while full screen hid the pet is the hand\'s: the end of the full screen does not show it', async () => {
    const { h, desk } = await start();
    desk.windows[0x200] = fullscreenFromMax;
    h.tick(200);
    expect(h.win.visible).toBe(false);
    h.send('pet:hide');
    desk.windows[0x200] = maximized;
    h.tick(1000);
    expect(h.win.visible).toBe(false);
  });

  it('an auto-hidden taskbar keeps a 3 DIP gap on its edge; none without auto-hide', async () => {
    const desk = win32Desktop();
    desk.autoHide = true;
    const display = { ...FULL_HD, workArea: { ...FULL_HD.bounds } };
    let h = await startHost({ platform: 'win32', koffi: desk.koffi, display });
    expect(h.win.getBounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1077 });
    vi.useRealTimers();
    desk.autoHide = false;
    h = await startHost({ platform: 'win32', koffi: desk.koffi, display });
    expect(h.win.getBounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it.each(['linux', 'darwin'])('%s: no full-screen poll at all', async (platform) => {
    const h = await startHost({ platform });
    h.send('pet:hideWhenFullscreen', true);
    h.win.emit('ready-to-show');
    expect(vi.getTimerCount()).toBe(1);
    h.tick(1000);
    expect(h.win.visible).toBe(true);
  });
});

describe('Linux/X11: the cursor from the X server, and the mouse lease', () => {
  // a top panel takes the first 27 pixels; the window covers the rest
  const PANEL = { ...FULL_HD, workArea: { x: 0, y: 27, width: 1920, height: 1053 } };

  async function start() {
    const x = x11Pointer();
    const h = await startHost({ platform: 'linux', koffi: x.koffi, display: PANEL });
    h.win.emit('ready-to-show');
    return { h, x };
  }

  it('reports the X pointer in page pixels inside the window, null over the panel, while Electron\'s stays put', async () => {
    const { h, x } = await start();
    x.pointer = { x: 300, y: 427 };
    h.tick(100);
    expect(h.cursors().at(-1)).toEqual({ x: 300, y: 400 });
    x.pointer = { x: 1000, y: 10 };
    h.tick(100);
    expect(h.cursors().at(-1)).toBeNull();
    // a report goes out on every tick, moved or not, so a resting cursor still gets a verdict
    const n = h.cursors().length;
    h.tick(500);
    expect(h.cursors().length).toBe(n + 5);
  });

  it('says the pointer\'s x over the panel (off the window, on its display), null on another display; the preload passes it on', async () => {
    const { h, x } = await start();
    const host = h.preload();
    const got = [];
    host.onCursor((p, across) => got.push([p, across]));
    const last = () => h.win.sent.filter(([c]) => c === 'pet:cursor').at(-1).slice(1);
    x.pointer = { x: 300, y: 427 };
    h.tick(100);
    expect(last()).toEqual([{ x: 300, y: 400 }, 300]);
    x.pointer = { x: 1000, y: 10 };
    h.tick(100);
    expect(last()).toEqual([null, 1000]);
    // left of this display: another one
    x.pointer = { x: -500, y: 400 };
    h.tick(100);
    expect(last()).toEqual([null, null]);
    expect(got.slice(-3)).toEqual([[{ x: 300, y: 400 }, 300], [null, 1000], [null, null]]);
  });

  it('holds the mouse while the wish is renewed, gives it back once it is not', async () => {
    const { h } = await start();
    h.send('pet:interactive', true);
    expect(h.win.ignore.at(-1)).toBe(false);
    h.tick(1400);
    expect(h.win.ignore.at(-1)).toBe(false);
    // no renewal within 1.5 s: a page that hangs loses the mouse
    h.tick(200);
    expect(h.win.ignore.at(-1)).toBe(true);
  });

  it('applies the verdict again whenever the window is mapped or unmapped (the X input shape does not survive it)', async () => {
    const { h } = await start();
    h.tick(100);
    const n = h.win.ignore.length;
    h.win.hide();
    h.tick(100);
    expect(h.win.ignore.length).toBe(n + 1);
    h.win.showInactive();
    h.tick(100);
    expect(h.win.ignore.length).toBe(n + 2);
    expect(h.win.ignore.slice(n)).toEqual([true, true]);
    // and every 2 s while nothing changes
    h.tick(2000);
    expect(h.win.ignore.length).toBe(n + 3);
  });

  it('with the preload: the pet and its hover buttons keep the mouse though the page sees no pointer moves; off them, clicks pass through', async () => {
    const { h, x } = await start();
    const host = h.preload();
    // the page's own hit test on the cursor reports (pet-app.js onCursor): the figure, and the hover buttons beside it
    const pet = { x: 200, y: 300, w: 200, h: 300 }, tools = { x: 400, y: 300, w: 44, h: 96 };
    const over = (p, r) => p && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
    let wish = null;
    host.onCursor((p) => { const on = !!(over(p, pet) || over(p, tools)); if (on !== wish) { wish = on; host.setInteractive(on); } });
    x.pointer = { x: 300, y: 27 + 400 };
    h.tick(100);
    expect(h.win.ignore.at(-1)).toBe(false);
    // onto a hover button and resting there for 3 s: the preload renews the lease on the reports
    x.pointer = { x: 420, y: 27 + 350 };
    for (let i = 0; i < 30; i++) { h.tick(100); expect(h.win.ignore.at(-1)).toBe(false); }
    // off the pet and its buttons (onto another window, or the panel): the clicks go through again
    x.pointer = { x: 900, y: 27 + 700 };
    h.tick(100);
    expect(h.win.ignore.at(-1)).toBe(true);
    x.pointer = { x: 420, y: 27 + 350 };
    h.tick(100);
    expect(h.win.ignore.at(-1)).toBe(false);
    x.pointer = { x: 420, y: 5 };
    h.tick(100);
    expect(h.win.ignore.at(-1)).toBe(true);
  });

  it('falls back to Electron\'s cursor when libX11 does not load', async () => {
    const h = await startHost({ platform: 'linux', koffi: null, display: PANEL, cursor: { x: 300, y: 427 } });
    h.win.emit('ready-to-show');
    h.tick(100);
    // Electron's cursor, inside the window below the 27 px panel
    expect(h.cursors().at(-1)).toEqual({ x: 300, y: 400 });
    h.state.cursor = { x: 1000, y: 10 };
    h.tick(100);
    // over the panel, off the window
    expect(h.cursors().at(-1)).toBeNull();
  });
});
