/**
 * Renders web/sound.js tones offline, for the exported whale pack (scripts/export-whale-pack.mjs).
 * Run by Electron (not Node): `electron render-sounds.cjs <job.json> <outDir>`.
 *
 * job.json: `{ soundJs, rate, seed, tones: [{ name, kind, seconds }] }`. A hidden window imports sound.js
 * and plays each tone into its own OfflineAudioContext with `createSfx({ ctx, volume: 1, compress: false })`,
 * so the file holds what the page's master gain and compressor get at playback. Math.random is reseeded
 * before each tone, so the output does not depend on the order. Writes `<name>.f32` (raw little-endian
 * float32, mono) per tone and `render.json` ({ electron, chrome, rate, tones: [{ name, kind, frames }] }).
 */
const { app, BrowserWindow } = require('electron');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [jobFile, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!jobFile || !outDir) {
  console.error('usage: electron render-sounds.cjs <job.json> <outDir>');
  process.exit(2);
}
const job = JSON.parse(readFileSync(jobFile, 'utf8'));
const source = readFileSync(job.soundJs, 'utf8');

// Runs in the page: returns [{ name, kind, frames, data (base64 float32) }].
async function renderInPage(src, { rate, seed, tones }) {
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const { createSfx } = await import(url);
  // mulberry32: a small seeded generator, the same numbers on every machine
  const seeded = (s) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const b64 = (f32) => {
    const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const out = [];
  for (const { name, kind, seconds } of tones) {
    Math.random = seeded(seed);
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
    const sfx = createSfx({ ctx, volume: 1, compress: false, random: Math.random });
    sfx.play(name, kind);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    out.push({ name, kind, frames: data.length, data: b64(data) });
  }
  return out;
}

app.dock?.hide();
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  await win.loadURL('about:blank');
  const rendered = await win.webContents.executeJavaScript(`(${renderInPage})(${JSON.stringify(source)}, ${JSON.stringify(job)})`);
  mkdirSync(outDir, { recursive: true });
  for (const t of rendered) writeFileSync(join(outDir, `${t.name}.f32`), Buffer.from(t.data, 'base64'));
  writeFileSync(join(outDir, 'render.json'), JSON.stringify({
    electron: process.versions.electron, chrome: process.versions.chrome, rate: job.rate,
    tones: rendered.map(({ name, kind, frames }) => ({ name, kind, frames })),
  }, null, 2));
  win.destroy();
  app.exit(0);
}).catch((err) => {
  console.error(err?.stack ?? err);
  app.exit(1);
});
