// The settings window's remembered size (upstream #436, app/settings-size.cjs; the fork keeps its 1180 × 800 default).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { DEFAULT_SIZE, MIN_SIZE, readSettingsSize, saveSettingsSize } = require('../app/settings-size.cjs');

let dir, file;
const area = { width: 1920, height: 1080 };
const minimum = { minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height };
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'coo-window-size-')); file = join(dir, 'settings-size.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('settings window size', () => {
  it('opens at the fork\'s 1180 × 800 by default, with an 880 × 600 minimum', () => {
    expect(DEFAULT_SIZE).toEqual({ width: 1180, height: 800 });
    expect(MIN_SIZE).toEqual({ width: 880, height: 600 });
  });

  it('restores the saved size without keeping the window position', () => {
    const size = { width: 1090, height: 730 };
    saveSettingsSize(file, { ...size, x: 100, y: 200 });
    expect(readSettingsSize(file, area)).toEqual({ ...size, ...minimum });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(size);
  });

  it('uses the default for a missing, malformed or invalid file', () => {
    expect(readSettingsSize(file, area)).toEqual({ ...DEFAULT_SIZE, ...minimum });
    for (const value of ['{', 'null', '{"width":"1000","height":700}', '{"width":1000.5,"height":700}']) {
      writeFileSync(file, value);
      expect(readSettingsSize(file, area)).toEqual({ ...DEFAULT_SIZE, ...minimum });
    }
  });

  it('fits a saved size to the work area and the minimum size', () => {
    saveSettingsSize(file, { width: 3000, height: 2000 });
    expect(readSettingsSize(file, area)).toEqual({ ...area, ...minimum });
    saveSettingsSize(file, { width: 100, height: 100 });
    expect(readSettingsSize(file, area)).toEqual({ ...MIN_SIZE, ...minimum });
  });

  it('keeps the minimum within a small high-DPI work area', () => {
    const small = { width: 800, height: 540 };
    expect(readSettingsSize(file, small)).toEqual({ ...small, minWidth: small.width, minHeight: small.height });
  });

  it('is read in the data directory when the window opens and saved when it closes and when the app quits', () => {
    const main = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'app', 'main.cjs'), 'utf8');
    expect(main).toMatch(/const SETTINGS_SIZE = join\(userData, 'settings-size\.json'\)/);
    expect(main).toMatch(/new BrowserWindow\(\{\n\s+\.\.\.readSettingsSize\(SETTINGS_SIZE, /);
    expect(main).toMatch(/settings\.on\('close', \(e\) => \{\n\s+saveSettingsWindowSize\(settings\);\n\s+if \(quitting\) return;/);
    // the quit ends in app.exit(), which fires no close
    expect(main).toMatch(/app\.on\('before-quit', [^]*?saveSettingsWindowSize\(settings\);[^]*?app\.exit\(0\)/);
    expect(main).toMatch(/saveSettingsSize\(SETTINGS_SIZE, win\.getNormalBounds\(\)\)/);
  });
});
