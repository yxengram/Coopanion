// The real pet window process (host/electron-main.cjs) in a real Electron, on a test page served from here: after
// launch the page is told its window is shown (and never hidden) and its sounds play (web/sound.js, unmuted, into a
// running AudioContext), and the
// cursor reports arrive (on Linux read from the X server through koffi). This is v0.9.1's "a missed first show leaves
// the pet silent" fix on the platforms where the order of load and show is not to be relied on.
//
// Runs on Windows and on Linux with a display (CI runs the suite under xvfb-run; without a display it fails on CI and
// skips locally). On a Mac it runs only with PET_HOST_SMOKE=1, since it puts a (transparent) window on the screen.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const electron = createRequire(import.meta.url)('electron');
const FIXTURE = fileURLToPath(new URL('./fixtures/pet-host-smoke.cjs', import.meta.url));
const SOUND = fileURLToPath(new URL('../packages/cortico-world-desktop-pet/web/sound.js', import.meta.url));

const linux = process.platform === 'linux';
const noDisplay = linux && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const run = process.platform === 'win32' || (linux && !noDisplay) || (process.platform === 'darwin' && process.env.PET_HOST_SMOKE === '1');

/** The test page: logs what it hears from the window process, and how many tones it made, every half second. */
const PAGE = `<!doctype html><meta charset="utf-8"><title>pet smoke</title><body style="background:transparent">
<script type="module">
import { createSfx } from '/sound.js';
let oscillators = 0, cursors = 0, reports = 0;
const contexts = [];
const Real = window.AudioContext;
window.AudioContext = class extends Real {
  constructor(...a) { super(...a); contexts.push(this); }
  createOscillator() { oscillators++; return super.createOscillator(); }
};
const sfx = createSfx({ storageKey: 'pet-smoke.sfx' });
const heard = [];
const log = (o) => console.log('[smoke] ' + JSON.stringify(o));
window.petHost.onShown((v) => { heard.push(v); sfx.setShown(v); });
window.petHost.onCursor(() => { cursors++; });
sfx.unlock();
setInterval(() => {
  let error = null;
  try { sfx.pop(); } catch (e) { error = String(e); }
  log({ n: ++reports, heard, oscillators, cursors, error, audio: contexts.map((c) => c.state) });
}, 500);
</script>`;

/** Serves the page and sound.js on 127.0.0.1; resolves to its origin and a close function. */
function serve() {
  const sound = readFileSync(SOUND);
  const server = createServer((req, res) => {
    if (req.url === '/pet') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
    if (req.url === '/sound.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(sound); return; }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

describe('pet window process in Electron', () => {
  it.runIf(noDisplay && process.env.CI)('has a display on Linux CI (the workflow runs the tests under xvfb-run)', () => {
    expect.fail('no DISPLAY: run the suite under xvfb-run');
  });

  it.runIf(run)('tells the page it is shown after launch, never hidden, and its sounds play', async () => {
    const { origin, close } = await serve();
    const userData = mkdtempSync(join(tmpdir(), 'pet-smoke-'));
    const flags = linux ? ['--no-sandbox', '--disable-gpu'] : [];
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [...flags, FIXTURE, `--pet-url=${origin}/pet`, `--user-data=${userData}`, `--parent-pid=${process.pid}`, '--quit-after=40000'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let out = '';
    const reports = [];
    try {
      const last = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no settled report within 45 s; output:\n${out.slice(-4000)}`)), 45000);
        // the page's console reaches the window process's stdout as `[page:info] …` (host/electron-main.cjs)
        let pending = '';
        const take = (chunk) => {
          out += chunk;
          pending += chunk;
          const lines = pending.split('\n');
          pending = lines.pop();
          for (const line of lines) {
            const m = line.match(/^\[page:info\] \[smoke\] (\{.*\})\s*$/);
            if (!m) continue;
            const r = JSON.parse(m[1]);
            reports.push(r);
            const fail = (why) => { clearTimeout(timer); reject(new Error(`${why}; reports: ${JSON.stringify(reports.slice(-3))}`)); };
            if (r.heard.includes(false)) { fail('the page was told its window is hidden'); return; }
            if (r.n >= 20 && !r.heard.includes(true)) { fail('the page was not told shown within 10 s'); return; }
            // two seconds after the page first heard shown: time for a wrong "hidden" to come
            const firstShown = reports.find((x) => x.heard.includes(true));
            if (firstShown && r.n - firstShown.n >= 4 && r.cursors > 0) { clearTimeout(timer); resolve(r); }
          }
        };
        child.stderr.on('data', (chunk) => { out += chunk; });
        child.stdout.on('data', take);
        child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Electron exited (${code}) before the page settled; output:\n${out.slice(-4000)}`)); });
      });
      expect(last.heard).toContain(true);
      expect(reports.flatMap((r) => r.heard)).not.toContain(false);
      expect(last.heard.at(-1)).toBe(true);
      // tones made after the window said shown: the page is not muted
      const firstShown = reports.find((r) => r.heard.includes(true));
      expect(last.oscillators).toBeGreaterThan(firstShown.oscillators);
      // and the tones reach an output: the page's AudioContext runs (the window allows autoplay without a gesture).
      // Under xvfb on Linux the runner may have no audio device, so there the state is only logged.
      console.log(`[pet-host-smoke] AudioContext state: ${JSON.stringify(last.audio)}`);
      expect(last.audio.length).toBeGreaterThan(0);
      if (!linux) expect(last.audio.at(-1)).toBe('running');
      expect(last.cursors).toBeGreaterThan(0);
      expect(reports.map((r) => r.error).filter(Boolean)).toEqual([]);
    } finally {
      child.kill();
      close();
      try { rmSync(userData, { recursive: true, force: true }); } catch { /* Windows may still hold a file */ }
    }
  }, 60000);
});
