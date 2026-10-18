/**
 * Preload of the settings window. The WebUI reads its language from localStorage
 * (`cortico.webui.language`, vendor/cortico/src/web/client/core/language.ts) before the `<html lang>`
 * the Core stamped when it started: here that preference is set to the app language before each page
 * load, so a language saved by an earlier page (or by Cortico's own language buttons in a version from
 * before the app had a language) never outlives a change of `config.language`. A preference saved that
 * way only ever changed how the console looked, so it is not taken as the app language: the console
 * shows the app's. The main process reloads the window when the language changes. The key Cortico read
 * before 0.2 (`cortico.console.language`) is read by nothing now and is removed.
 *
 * In a build that updates itself (app/updater.cjs), the page also gets `window.coopanionUpdate`: the
 * updater's last step and its later ones, which the version line shows (console/features/release.ts).
 * Sandboxed, this file can require nothing but `electron` (tests/app-i18n.test.ts runs it with fakes).
 */
const { contextBridge, ipcRenderer } = require('electron');

const STORED = 'cortico.webui.language';
const OLD_STORED = 'cortico.console.language';

try {
  localStorage.setItem(STORED, ipcRenderer.sendSync('settings:language'));
  localStorage.removeItem(OLD_STORED);
} catch { /* a page without storage (the starting page) */ }

if (ipcRenderer.sendSync('settings:update')?.auto) {
  contextBridge.exposeInMainWorld('coopanionUpdate', {
    step: () => ipcRenderer.sendSync('settings:update')?.step ?? null,
    onStep: (listener) => {
      const handler = (_e, step) => listener(step);
      ipcRenderer.on('settings:update', handler);
      return () => ipcRenderer.removeListener('settings:update', handler);
    },
  });
}
