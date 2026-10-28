// The pet window's command gets the app's own switches (upstream #378, app/pet-host-command.cjs).
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { petHostCommand } = require('../app/pet-host-command.cjs');

describe('the pet window command', () => {
  it('is the executable and --pet-host, packaged, or with the app directory from source', () => {
    expect(petHostCommand({ execPath: 'C:\\Coopanion\\Coopanion.exe', appRoot: 'C:\\Coopanion\\resources\\app', packaged: true, argv: ['C:\\Coopanion\\Coopanion.exe'] }))
      .toEqual(['C:\\Coopanion\\Coopanion.exe', '--pet-host']);
    expect(petHostCommand({ execPath: '/repo/node_modules/electron/dist/Electron', appRoot: '/repo', packaged: false, argv: ['/repo/node_modules/electron/dist/Electron', '.'] }))
      .toEqual(['/repo/node_modules/electron/dist/Electron', '/repo', '--pet-host']);
  });

  it('carries the switches the app was started with, so a shortcut\'s Chromium switch reaches the pet window', () => {
    const argv = ['Coopanion.exe', '--disable-gpu-compositing', '--no-sandbox', '--background'];
    expect(petHostCommand({ execPath: 'Coopanion.exe', appRoot: 'app', packaged: true, argv }))
      .toEqual(['Coopanion.exe', '--disable-gpu-compositing', '--no-sandbox', '--background', '--pet-host']);
    // from source the second argument is the app directory, not a switch
    expect(petHostCommand({ execPath: 'electron', appRoot: '/repo', packaged: false, argv: ['electron', '.', '--disable-gpu-compositing'] }))
      .toEqual(['electron', '/repo', '--disable-gpu-compositing', '--pet-host']);
  });

  it('leaves out plain arguments, macOS\'s -psn_ argument and switches that open a debugging port', () => {
    const argv = ['Coopanion', '-psn_0_12345', 'file.txt', '--inspect=9229', '--inspect-brk', '--inspect-port=9230', '--remote-debugging-port=9222', '--pet-host', '--lang=zh-CN', '--inspector-x'];
    expect(petHostCommand({ execPath: 'Coopanion', appRoot: 'app', packaged: true, argv }))
      .toEqual(['Coopanion', '--lang=zh-CN', '--inspector-x', '--pet-host']);
  });

  it("leaves out --pet-url= and --parent-pid=: the World appends its own, and the pet window reads the first of each", () => {
    const argv = ['/App', '--pet-url=http://evil.example/', '--parent-pid=1', '--pet-url', '--parent-pid', '--pet-urls=x', '--disable-gpu-compositing'];
    expect(petHostCommand({ execPath: '/App', appRoot: 'app', packaged: true, argv }))
      .toEqual(['/App', '--pet-urls=x', '--disable-gpu-compositing', '--pet-host']);
  });

  it('is what main.cjs hands the desktop-pet World', () => {
    const main = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'app', 'main.cjs'), 'utf8');
    expect(main).toMatch(/const petHost = petHostCommand\(\{ execPath: process\.execPath, appRoot: APP_ROOT, packaged: app\.isPackaged, argv: process\.argv \}\)/);
    expect(main).toMatch(/CORTICO_DESKTOP_PET_HOST: JSON\.stringify\(petHost\)/);
  });
});
