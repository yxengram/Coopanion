/**
 * Preload of the settings window. The console reads its language from localStorage
 * (`cortico.console.language`, vendor/cortico/src/web/client/core/language.ts) before the `<html lang>`
 * the Core stamped when it started: here that preference is set to the app language before each page
 * load, so a language saved by an earlier page (or by Cortico's own language buttons in a version from
 * before the app had a language) never outlives a change of `config.language`. A preference saved that
 * way only ever changed how the console looked, so it is not taken as the app language: the console
 * shows the app's. The main process reloads the window when the language changes.
 * Sandboxed, this file can require nothing but `electron` (tests/app-i18n.test.ts runs it with fakes).
 */
const { ipcRenderer } = require('electron');

const STORED = 'cortico.console.language';

try {
  localStorage.setItem(STORED, ipcRenderer.sendSync('settings:language'));
} catch { /* a page without storage (the starting page) */ }
