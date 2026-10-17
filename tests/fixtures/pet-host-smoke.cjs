// Electron's main script for tests/pet-host-smoke.test.js: the pet window process (host/electron-main.cjs) as the World
// runs it, on a test page, with its own user data, no tray, and a deadline.
//   electron pet-host-smoke.cjs --pet-url=<url> --user-data=<dir> --parent-pid=<pid> --quit-after=<ms>
const { app, systemPreferences } = require('electron');
const { join } = require('node:path');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

app.setPath('userData', arg('user-data'));
// a Mac asks for the microphone before the page opens: no dialog to wait on in a test run
if (process.platform === 'darwin') systemPreferences.getMediaAccessStatus = () => 'granted';

const { runPetHost } = require(join(__dirname, '../../packages/cortico-world-desktop-pet/host/electron-main.cjs'));
runPetHost({ url: arg('pet-url'), parentPid: Number(arg('parent-pid')) || 0, tray: false });
setTimeout(() => app.quit(), Number(arg('quit-after')) || 30000);
