/**
 * Exports a built-in figure (web/<dir>/) as a figure pack other copies of the desktop pet can install, upstream's
 * v0.1.17 included. Each figure has a thin wrapper with its descriptor and CLI: scripts/export-whale-pack.mjs
 * (`coopanion-whale`), scripts/export-claude-pack.mjs (`coopanion-claude-chan`), scripts/export-gpt-pack.mjs
 * (`coopanion-gpt-chan`), scripts/export-gemini-pack.mjs (`coopanion-gemini-chan`); `node <wrapper> [outDir]
 * [--upstream <ref>]` (default `build/packs` under the repository root) writes `<outDir>/<pack id>/`.
 *
 * A pack carries its own kit: the figure's modules (every one its entry imports, transitively) keep their path under
 * web/, so `<dir>/figure.js` still imports `../kit/body.js` and `../kit/rig.js` (copied unchanged), and in an app whose
 * kit lacks our extensions the figure does all its words. The tones the copied code asks for that upstream's
 * web/sound.js lacks (sound.js marks them `plus`) are rendered offline with the Electron in node_modules
 * (scripts/render-sounds.cjs) and shipped as `sounds/<name>.wav`; a tone only one of the kit's words plays is left out
 * when the figure's vocab lacks that word. Only the textures the model and the figure actually load are copied.
 *
 * In Coopanion itself a pack's id is an alias of its built-in (src/packs.ts PACK_ALIASES). Nothing renders or writes
 * on import; tests use the exporter's functions (`packExporter(descriptor)`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PKG = fileURLToPath(new URL('../', import.meta.url));
export const ROOT = resolve(PKG, '../..');
export const WEB = join(PKG, 'web');
export const PKG_REL = relative(ROOT, PKG).split('\\').join('/').replace(/\/$/, '');

export const SOURCE_URL = 'https://github.com/yxengram/Coopanion';
/**
 * The upstream release the packs were checked against. Which tones a pack ships comes from sound.js itself (the
 * tones it marks `plus` are ours); this tag is only a cross-check (`--upstream <ref>`), since in a clone of the fork
 * `origin` is the fork.
 */
export const UPSTREAM_REF = 'v0.1.17';
export const RATE = 44100;
/** Every tone renders from the same seed (spout's random pitches, the noise), so the files come out the same each time. */
export const SEED = 0x5eed;
/** Seconds rendered per tone before the trailing silence is cut; the longest (song) ends near 3.6 s. */
const RENDER_SECONDS = 6;
/** Kept after the last audible sample. */
const TAIL_SECONDS = .08;
/** A file is normalised to this peak (-1 dBFS); its manifest `volume` brings it back to the tone's own level. */
const PEAK = 10 ** (-1 / 20);
/** Below this raw peak (-46 dBFS) a render counts as silent. */
const SILENT = .005;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const soundModule = () => import(pathToFileURL(join(WEB, 'sound.js')).href);
/** The kit's word lists (`KIT_MOTIONS`, `PLUS_MOTIONS`), read from its source so the tone lookup stays synchronous. */
function kitWords() {
  const src = readFileSync(join(WEB, 'kit/body.js'), 'utf8'), out = new Set();
  for (const name of ['KIT_MOTIONS', 'PLUS_MOTIONS']) {
    const list = src.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`))?.[1];
    if (!list) throw new Error(`kit/body.js: no ${name}`);
    for (const m of list.matchAll(/'([a-z][\w-]*)'/g)) out.add(m[1]);
  }
  return out;
}

/** The tone names a sound.js defines: upstream's inline `const tones = {…}` table, or ours inside `voices`. */
export function toneNamesIn(src) {
  const start = src.search(/const (tones|v) = \{\n/);
  if (start < 0) throw new Error('sound.js: no tones table found');
  const end = src.indexOf('\n  };', start);
  return [...src.slice(start, end).matchAll(/^ {4}([a-zA-Z]\w*)\(/gm)].map((m) => m[1]);
}

/** Upstream's tone names: the tones our sound.js does not mark as ours. */
export async function upstreamTones() {
  const { TONES } = await soundModule();
  return TONES.filter((t) => !t.plus).map((t) => t.name);
}

/** Upstream's tone names as `git show <ref>:<PKG>/web/sound.js` has them, for the cross-check. */
export function upstreamToneNames(ref = UPSTREAM_REF) {
  let src;
  try {
    src = execFileSync('git', ['show', `${ref}:${PKG_REL}/web/sound.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`could not read upstream's sound.js at ${ref} (git fetch it, or pass --upstream <ref>): ${String(err.stderr ?? err.message).trim()}`);
  }
  return toneNamesIn(src);
}

/** The module specifiers `src` imports or re-exports (static and literal dynamic imports). */
export function importsOf(src) {
  if (/\bimport\(\s*[^'"\s]/.test(src)) throw new Error('computed dynamic import');
  return [
    ...src.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm), // import … from, export … from
    ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm), // import 'x'
    ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g), // import('x')
  ].map((m) => m[1]);
}

/**
 * The modules `entry` (a path under web/) loads, itself first, as paths under web/: in the pack they keep that path,
 * so their relative imports still meet. Every import must be relative and stay inside web/.
 */
export function moduleClosure(entry) {
  const out = [entry];
  for (let i = 0; i < out.length; i++) {
    const mod = out[i];
    let specs;
    try { specs = importsOf(readFileSync(join(WEB, mod), 'utf8')); } catch (err) { throw new Error(`${mod}: ${err.message}`); }
    for (const spec of specs) {
      if (!spec.startsWith('.')) throw new Error(`${mod} imports ${spec}: a pack's modules may only import each other`);
      const to = posix.normalize(posix.join(posix.dirname(mod), spec));
      if (to.startsWith('../') || to.startsWith('/')) throw new Error(`${mod} imports ${spec}, outside web/`);
      if (!existsSync(join(WEB, to))) throw new Error(`${mod} imports ${spec}, which is not there`);
      if (!out.includes(to)) out.push(to);
    }
  }
  return out;
}

/**
 * A pack exporter for figure descriptor `d`:
 * - `dir`: the built-in's directory under web/ (its figure.json, model.json, textures);
 * - `id`, `name`: the pack's id and name (the id must not be one of upstream's built-ins);
 * - `entry`: its module, a path under web/ (also its path in the pack); `factory`: the figure factory it exports,
 *   called with a recording `loadImage` to find the textures; `fallbackScheme`: the scheme id when the model has none;
 * - `author(base)`, `license`, `credits(base)`: the manifest's (`base`: the built-in's figure.json);
 * - `readme(manifest, sounds)`: the pack's README.md (`sounds`: [{ name, kind, seconds }]).
 */
export function packExporter(d) {
  const FIG = join(WEB, d.dir);
  const modules = () => moduleClosure(d.entry);

  /**
   * The tone names the copied code asks for: literal `play('x', …)` calls and the face-tone tables, less a tone the kit
   * plays only on a `case '<word>':` line for kit words the figure's vocab lacks (her spout without a spout).
   */
  function requestedTones() {
    const words = kitWords();
    const vocab = new Set(readJson(join(FIG, 'figure.json')).vocab.map((w) => w.id));
    const needed = new Set(), wordOnly = new Set();
    for (const mod of modules()) {
      const src = readFileSync(join(WEB, mod), 'utf8');
      for (const line of src.split('\n')) {
        const plays = [...line.matchAll(/\bplay\(\s*'([a-zA-Z]\w*)'/g)].map((m) => m[1]);
        if (!plays.length) continue;
        const word = line.match(/^\s*case '([a-z][\w-]*)':/)?.[1];
        for (const n of plays) (word && words.has(word) && !vocab.has(word) ? wordOnly : needed).add(n);
      }
      for (const t of src.matchAll(/const (?:PLUS_)?FACE_TONES = \{([\s\S]*?)\};/g)) {
        for (const m of t[1].matchAll(/:\s*'([a-zA-Z]\w*)'/g)) needed.add(m[1]);
      }
    }
    return needed;
  }

  /**
   * The sounds the pack ships, `[{ name, kind }]` in sound.js's order: tones the copied code asks for that upstream's
   * sound.js does not have, filed under the kind our SOUND_KINDS gives them. `upstreamTones` defaults to the tones
   * sound.js does not mark `plus`.
   */
  async function packSounds({ upstreamTones: given } = {}) {
    const theirs = given ?? await upstreamTones();
    const { TONES } = await soundModule();
    const ours = new Set(TONES.map((t) => t.name));
    const lost = theirs.filter((n) => !ours.has(n));
    if (lost.length) throw new Error(`upstream tones missing from our sound.js: ${lost.join(', ')}`);
    const asked = requestedTones();
    const unknown = [...asked].filter((n) => !ours.has(n));
    if (unknown.length) throw new Error(`the kit asks for tones sound.js does not have: ${unknown.join(', ')}`);
    const upstream = new Set(theirs);
    const list = TONES.filter((t) => asked.has(t.name) && !upstream.has(t.name)).map(({ name, kind }) => ({ name, kind }));
    for (const s of list) if (s.kind !== 'move' && s.kind !== 'face') throw new Error(`sound ${s.name}: kind ${s.kind} (expected move or face)`);
    return list;
  }

  /**
   * The pack's figure.json: the built-in's, renamed, with the pack's own entry, licence and sounds.
   * `volumes`: name → manifest volume from the render (left out = 1).
   */
  async function buildManifest({ upstreamTones, volumes = {}, version } = {}) {
    const base = readJson(join(FIG, 'figure.json'));
    const sounds = await packSounds(upstreamTones ? { upstreamTones } : {});
    return {
      manifest: base.manifest,
      api: base.api,
      id: d.id,
      version: version ?? readJson(join(ROOT, 'package.json')).version,
      name: d.name,
      about: base.about,
      author: d.author(base),
      license: d.license,
      credits: d.credits(base),
      entry: d.entry,
      export: base.export,
      model: 'model.json',
      thumb: base.thumb,
      axes: base.axes,
      presets: base.presets,
      vocab: base.vocab,
      sounds: Object.fromEntries(sounds.map(({ name, kind }) => [name, {
        file: `sounds/${name}.wav`, kind, ...(volumes[name] !== undefined && volumes[name] !== 1 ? { volume: volumes[name] } : {}),
      }])),
      can: base.can ?? { walk: true },
    };
  }

  /** Every texture path (relative to the figure's directory) it loads, scheme by scheme, recorded through `opts.loadImage`. */
  async function textureFiles() {
    const make = (await import(pathToFileURL(join(WEB, d.entry)).href))[d.factory];
    if (typeof make !== 'function') throw new Error(`${d.entry} exports no ${d.factory}`);
    const model = readJson(join(FIG, 'model.json'));
    const all = new Set();
    for (const sc of model.schemes ?? [{ id: d.fallbackScheme }]) {
      const seen = new Set();
      // the figure loads a scheme's textures before it makes its canvases; with no DOM here it stops there
      await make('x/', { model, scheme: sc.id, asset: (p) => p, loadImage: async (p) => { seen.add(String(p)); return { width: 1, height: 1 }; } })
        .catch(() => {});
      if (!seen.size) throw new Error(`${d.dir}: scheme ${sc.id} loaded no textures`);
      for (const p of seen) all.add(p);
    }
    return [...all].sort();
  }

  /** Every file the pack copies: `[{ from, to }]`, `to` relative to the pack. */
  async function packFiles() {
    const manifest = readJson(join(FIG, 'figure.json'));
    const thumbs = new Set([manifest.thumb, ...manifest.axes.flatMap((a) => a.options.map((o) => o.thumb)), ...manifest.presets.map((p) => p.thumb)].filter(Boolean));
    const files = [
      ...modules().map((m) => ({ from: join(WEB, m), to: m })),
      { from: join(FIG, 'model.json'), to: 'model.json' },
      { from: join(PKG, 'LICENSE'), to: 'LICENSE' },
      ...[...await textureFiles(), ...[...thumbs].sort()].map((p) => ({ from: join(FIG, p), to: p })),
    ];
    // the same texture can be a thumbnail too: once is enough; two sources for one path is a clash
    const seen = new Map();
    for (const f of files) {
      const was = seen.get(f.to);
      if (was && was !== f.from) throw new Error(`two files for ${f.to}: ${was} and ${f.from}`);
      seen.set(f.to, f.from);
    }
    return [...seen].map(([to, from]) => ({ from, to }));
  }

  /** Writes `<outDir>/<id>/`; returns what it wrote. */
  async function exportPack(outDir = join(ROOT, 'build', 'packs'), { upstream = null, log = console.log } = {}) {
    const tones = await upstreamTones();
    if (upstream) {
      // a newer upstream may have grown tones of its own: a pack file of the same name still wins there
      const git = new Set(upstreamToneNames(upstream)), ours = new Set(tones);
      const extra = [...git].filter((n) => !ours.has(n)), gone = tones.filter((n) => !git.has(n));
      if (extra.length || gone.length) log(`${upstream}'s sound.js differs: has ${extra.join(', ') || 'nothing'} more, lacks ${gone.join(', ') || 'nothing'}`);
      else log(`${upstream}'s sound.js has the same tones as ours, less our own`);
    }
    const list = await packSounds({ upstreamTones: tones });
    const files = await packFiles();
    const missing = files.filter((f) => !existsSync(f.from));
    if (missing.length) throw new Error(`files the pack needs are missing:\n${missing.map((f) => `  ${f.from}`).join('\n')}`);

    log(`rendering ${list.length} sounds with Electron…`);
    const { raw, electron } = renderSounds(list);
    const sounds = list.map((s) => {
      const r = raw.get(s.name);
      if (!r) throw new Error(`sound ${s.name} was not rendered`);
      try { return { ...s, ...finishSound(r) }; } catch (err) { throw new Error(`sound ${s.name}: ${err.message}`); }
    });

    const dir = join(resolve(outDir), d.id);
    rmSync(dir, { recursive: true, force: true });
    for (const f of files) {
      mkdirSync(dirname(join(dir, f.to)), { recursive: true });
      copyFileSync(f.from, join(dir, f.to));
    }
    mkdirSync(join(dir, 'sounds'), { recursive: true });
    for (const s of sounds) writeFileSync(join(dir, 'sounds', `${s.name}.wav`), encodeWav(s.samples));
    const manifest = await buildManifest({ upstreamTones: tones, volumes: Object.fromEntries(sounds.map((s) => [s.name, s.volume])) });
    writeFileSync(join(dir, 'figure.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(join(dir, 'README.md'), d.readme(manifest, sounds));

    // the same checks the app makes when it scans the pack (ours keeps upstream's rules)
    try {
      const { readManifest } = await import(pathToFileURL(join(PKG, 'src', 'packs.ts')).href);
      const gaps = [];
      const read = readManifest(dir, false, gaps);
      if (typeof read === 'string') throw new Error(`the written figure.json does not pass: ${read}`);
      if (gaps.length) throw new Error(`the written figure.json names missing files: ${gaps.join('; ')}`);
    } catch (err) {
      if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION') log('(this Node cannot import src/packs.ts; the manifest was not re-checked, the tests check it)');
      else throw err;
    }

    const { n, bytes } = fileCount(dir);
    return { dir, files: n, bytes, electron, sounds: sounds.map(({ name, kind, seconds, peak, volume }) => ({ name, kind, seconds, peak, volume })) };
  }

  return { PACK_ID: d.id, descriptor: d, modules, requestedTones, packSounds, buildManifest, textureFiles, packFiles, exportPack, packReadme: d.readme };
}

/** `samples` (float, −1…1) as a 16-bit mono PCM WAV file. */
export function encodeWav(samples, rate = RATE) {
  const n = samples.length, out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0, 'ascii'); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii'); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii'); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return out;
}

/**
 * A raw render made into the file and its manifest volume. The page plays a pack's file as
 * `buffer → gain(volume) → master gain → compressor`, the synthesized tone as `tone → master gain → compressor`;
 * so the file is the raw render scaled up to PEAK and `volume` scales it back: in the upstream app the sound
 * meets the master chain at exactly the level the tone has in ours, with the file's full 16 bits used.
 * Leading silence stays (the sounds are timed to the motion's beats); trailing silence is cut after a short tail.
 */
export function finishSound(raw, rate = RATE) {
  let peak = 0;
  for (const x of raw) peak = Math.max(peak, Math.abs(x));
  if (!(peak > SILENT)) throw new Error(`silent render (peak ${peak})`);
  // a file holds −1…1 and `volume` is at most 1: a louder tone would have to be quieter than in our app
  if (peak > 1) throw new Error(`render peaks at ${peak.toFixed(3)}, above full scale`);
  const volume = Math.min(1, Number((peak / PEAK).toPrecision(4)));
  const gain = 1 / volume;
  // the last sample that still rounds to something in 16 bits
  const floor = 1 / 32767 / gain;
  let last = raw.length - 1;
  while (last > 0 && Math.abs(raw[last]) < floor) last--;
  if (last > raw.length - rate * .5) throw new Error('still sounding at the end of the render window');
  const end = Math.min(raw.length, last + 1 + Math.round(TAIL_SECONDS * rate));
  const samples = new Float32Array(end);
  for (let i = 0; i < end; i++) samples[i] = raw[i] * gain;
  return { samples, volume, peak, seconds: end / rate };
}

function electronBinary() {
  try {
    const bin = createRequire(join(ROOT, 'package.json'))('electron');
    if (typeof bin === 'string' && existsSync(bin)) return bin;
  } catch { /* fall back to the shim */ }
  const shim = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  if (!existsSync(shim)) throw new Error('electron not found in node_modules: run pnpm install');
  return shim;
}

/** Renders `sounds` ([{ name, kind }]) with Electron; returns name → Float32Array of the raw render, and the versions used. */
export function renderSounds(sounds, { rate = RATE, seed = SEED } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'pack-sounds-'));
  try {
    const job = join(work, 'job.json'), out = join(work, 'out');
    writeFileSync(job, JSON.stringify({ soundJs: join(WEB, 'sound.js'), rate, seed, tones: sounds.map((s) => ({ ...s, seconds: RENDER_SECONDS })) }));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const bin = electronBinary();
    const r = spawnSync(bin, [join(PKG, 'scripts', 'render-sounds.cjs'), job, out], { env, encoding: 'utf8', timeout: 180000, shell: bin.endsWith('.cmd') });
    if (r.status !== 0 || !existsSync(join(out, 'render.json'))) {
      throw new Error(`rendering the sounds failed (exit ${r.status ?? r.signal}):\n${r.stderr || r.stdout || r.error?.message || ''}`);
    }
    const info = readJson(join(out, 'render.json'));
    const raw = new Map();
    for (const t of info.tones) {
      const bytes = readFileSync(join(out, `${t.name}.f32`));
      raw.set(t.name, new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
    }
    return { raw, electron: info.electron, chrome: info.chrome };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export const KIND_ZH = { move: '动作', face: '表情' };

/** The README's sound table rows. */
export const soundRows = (sounds) => sounds.map((s) => `| \`${s.name}\` | ${KIND_ZH[s.kind] ?? s.kind} | ${s.seconds.toFixed(2)} 秒 |`).join('\n');

/** The README's install steps, for a pack named `manifest.name.zh`. */
export const installSection = (manifest) => `## 安装

把整个 \`${manifest.id}\` 文件夹复制到数据目录下的 \`home/companion/data/figures/\` 里(没有 \`figures\` 就新建),
即 \`<数据目录>/home/companion/data/figures/${manifest.id}/figure.json\`。数据目录:

- Windows:安装目录下的 \`data\`(和 \`Coopanion.exe\` 在同一个文件夹里)
- macOS:\`~/Library/Application Support/Coopanion\`
- Linux:\`~/.config/Coopanion\`
- 从源码运行:仓库里的 \`build/data\`;设了 \`CORTICO_COMPANION_DATA\` 时是它指的目录
`;

/** The README's sound section: the table and how the files were made. */
export const soundSection = (sounds) => `## 音效

| 名字 | 类别 | 长度 |
|---|---|---|
${soundRows(sounds)}

都是 44.1 kHz、16 位单声道 WAV,由 Coopanion 的 \`web/sound.js\` 离线渲染(固定随机种子,每次导出结果相同)。
文件按峰值 -1 dBFS 存,\`figure.json\` 里每个声音的 \`volume\` 把它调回内置音色的响度。设置里关掉「动作」或「表情」音效时它们也一起静音。
`;

function fileCount(dir) {
  let n = 0, bytes = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const c = fileCount(p); n += c.n; bytes += c.bytes; } else { n++; bytes += statSync(p).size; }
  }
  return { n, bytes };
}

/** Runs `exporter` as a CLI when `metaUrl` is the script node was started with: `[outDir] [--upstream <ref>]`. */
export function runCli(exporter, metaUrl) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(metaUrl)) return;
  const args = process.argv.slice(2);
  const at = args.indexOf('--upstream');
  const upstream = at >= 0 ? args.splice(at, 2)[1] : null;
  const outDir = args[0] ? resolve(args[0]) : undefined;
  exporter.exportPack(outDir, { upstream }).then((r) => {
    console.log(`wrote ${r.dir}: ${r.files} files, ${(r.bytes / 1048576).toFixed(1)} MB (sounds rendered with Electron ${r.electron})`);
    for (const s of r.sounds) {
      console.log(`  ${s.name.padEnd(8)} ${s.kind.padEnd(5)} ${s.seconds.toFixed(2)} s  peak ${(20 * Math.log10(s.peak)).toFixed(1)} dBFS  volume ${s.volume}`);
    }
  }, (err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
}
