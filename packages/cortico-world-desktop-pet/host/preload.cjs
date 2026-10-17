// The only surface the pet page gets from the window process.
const { contextBridge, ipcRenderer } = require('electron');

/**
 * The page's last wish for the mouse, renewed while it holds the mouse: the window process keeps the
 * wish as a lease (host/mouse-lease.cjs) that runs out unless renewed. The page sends a wish only
 * when it changes, so the renewal is made here, after the page has answered a cursor report: this
 * world runs on the page's thread, so a page that hangs stops renewing, and a reload starts over
 * with no wish.
 */
const RENEW_MS = 500;
let wish = false, sentAt = 0;
const ask = (on) => { wish = !!on; sentAt = Date.now(); ipcRenderer.send('pet:interactive', wish); };
// after the page's own listeners have run on this report (they may change the wish)
ipcRenderer.on('pet:cursor', () => setTimeout(() => { if (wish && Date.now() - sentAt >= RENEW_MS) ask(true); }, 0));

contextBridge.exposeInMainWorld('petHost', {
  /** true: the window takes the mouse; false: clicks pass through to what is underneath. */
  setInteractive: (on) => ask(on),
  focus: () => ipcRenderer.send('pet:focus'),
  /** Takes the keyboard from whatever window has it (a question's number keys), and gives it back. */
  grabFocus: () => ipcRenderer.send('pet:grabFocus'),
  releaseFocus: () => ipcRenderer.send('pet:releaseFocus'),
  hide: () => ipcRenderer.send('pet:hide'),
  /**
   * Whether the window is shown, each time it is shown or hidden (by the menu, the tray or a fullscreen window), and once
   * the page has loaded; never before the window was first shown (host/shown.cjs), so a page that hears nothing is shown.
   */
  onShown: (cb) => ipcRenderer.on('pet:shown', (_e, shown) => cb(!!shown)),
  /** Whether a full screen window covers the window's display, each time that changes (Windows only; never said elsewhere). */
  onFullscreen: (cb) => ipcRenderer.on('pet:fullscreen', (_e, on) => cb(!!on)),
  /** Whether the window hides itself while a fullscreen window covers its display. */
  hideWhenFullscreen: (on) => ipcRenderer.send('pet:hideWhenFullscreen', !!on),
  openDress: () => ipcRenderer.send('pet:openDress'),
  /** The app language the page shows (from the World): the window process's own text (the tray's menu) follows it. */
  setLanguage: (code) => ipcRenderer.send('pet:language', String(code)),
  /**
   * Where the cursor is, in page pixels, or null off the window: called every tenth of a second while the window is shown.
   * The second argument is its x in page pixels while it is on the window's display (over the Dock or the taskbar too,
   * clamped to the window), null on another display.
   */
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, p, across) => cb(p, typeof across === 'number' ? across : null)),
  /** Screen pixels behind `rect`, minus `skip` rects (page coordinates), as a flat [r, g, b, …]; null where the screen cannot be read. */
  sampleBackdrop: (rect, skip) => ipcRenderer.invoke('pet:sampleBackdrop', { rect, skip }),
  /** Moves the window to the display under the cursor: { x, y } the cursor and { w, h } the new size in page pixels, or null when it stays. */
  followCursor: () => ipcRenderer.invoke('pet:followCursor'),
});
