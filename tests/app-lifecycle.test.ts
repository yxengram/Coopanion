/**
 * The main process's quit, update and failure paths (upstream #254 and #311), read from app/main.cjs and
 * app/updater.cjs: they run only inside a packaged Electron app, so the wiring is pinned here and the behaviour is
 * checked in the real app.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(import.meta.dirname, '..', ...p), 'utf8');
const main = read('app', 'main.cjs');
const updater = read('app', 'updater.cjs');

describe('quitting and the update restart (#254)', () => {
  const beforeQuit = main.slice(main.indexOf("app.on('before-quit'"), main.indexOf('\n});', main.indexOf("app.on('before-quit'")));
  it('takes the tray icon down as the quit starts, before the Core is stopped, and the tray menu no longer rebuilds then', () => {
    expect(beforeQuit.indexOf('tray?.destroy();')).toBeGreaterThan(0);
    expect(beforeQuit.indexOf('tray?.destroy();')).toBeLessThan(beforeQuit.indexOf('core.stop()'));
    expect(beforeQuit).toMatch(/tray = null;/);
    // the Core's last states arrive after that and would rebuild a destroyed tray's menu
    expect(main).toMatch(/const refresh = \(\) => \{\n(?:\s*\/\/.*\n)*\s*if \(!tray\) return;/);
  });

  it('restarts for an update through a normal quit, which installs the update and starts it after', () => {
    expect(main).toMatch(/core\.on\('update-install', \(\) => \{\n\s+if \(!updater\?\.hasUpdate\(\)\) return;\n\s+restartAfterUpdate = true;\n\s+app\.quit\(\);\n\}\);/);
    expect(beforeQuit).toMatch(/updater\?\.installOnQuit\(restartAfterUpdate\)/);
    expect(main).not.toMatch(/installNow/);
    expect(updater).toMatch(/hasUpdate: \(\) => !!ready,/);
    expect(updater).toMatch(/autoUpdater\.quitAndInstall\(true, runAfter\);/);
    expect(updater).not.toMatch(/installNow|quitAndInstall\(true, true\)/);
    expect(updater).toMatch(/if \(!canUpdate\(\)\) return \{ hasUpdate: \(\) => false, installOnQuit: \(\) => false \};/);
  });

  it('uses the .ico on Windows and points the packaged settings window\'s taskbar button at the running program', () => {
    expect(main).toMatch(/const WINDOW_ICON = join\(ICONS, process\.platform === 'win32' \? 'icon\.ico' : 'icon\.png'\);/);
    expect(main).not.toMatch(/join\(ICONS, 'icon\.png'\)/);
    expect(main).toMatch(/settings\.setAppDetails\(\{ appId: APP_ID, appIconPath: process\.execPath, appIconIndex: 0, relaunchCommand: `"\$\{process\.execPath\}"`, relaunchDisplayName: 'Coopanion' \}\);/);
    expect(main).toMatch(/app\.setAppUserModelId\(APP_ID\);/);
  });
});

describe('failures that used to hang or leave no window (#311)', () => {
  it('quits with the error when the data-location choice cannot be saved, or anything else in that dialog fails', () => {
    const block = main.slice(main.indexOf('if (located?.ask && !PET_HOST)'), main.indexOf('function dataWritable()'));
    expect(block).toMatch(/\} else dialog\.showErrorBox\('Coopanion', String\(err\?\.message \?\? err\)\);\n\s+app\.exit\(1\);/);
    expect(block).toMatch(/\}\)\.catch\(\(err\) => \{\n(?:\s*\/\/.*\n)*\s*dialog\.showErrorBox\('Coopanion', String\(err\?\.message \?\? err\)\);\n\s*app\.exit\(1\);/);
  });

  it('gives a panel call 5 s, and the tray\'s show-pet catches a Core that went away', () => {
    expect(main).toMatch(/body: JSON\.stringify\(\{ args: \[\] \}\), signal: AbortSignal\.timeout\(5000\) \}\);/);
    expect(main).toMatch(/showPet: \(\) => void showPet\(\)\.catch\(/);
  });

  it('keeps the settings window hidden on close: only the prompts page guards unsaved edits against an unload (#298)', () => {
    // the size is saved first (settings-size.cjs, upstream #436), then the window only hides
    expect(main).toMatch(/settings\.on\('close', \(e\) => \{\n\s+saveSettingsWindowSize\(settings\);\n\s+if \(quitting\) return;\n\s+e\.preventDefault\(\);\n\s+settings\.hide\(\);/);
  });
});
