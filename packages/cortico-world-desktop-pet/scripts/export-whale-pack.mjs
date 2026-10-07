#!/usr/bin/env node
/**
 * Exports the built-in whale (web/whale/) as a figure pack other copies of the desktop pet can install,
 * upstream's v0.1.17 included: `node scripts/export-whale-pack.mjs [outDir]` (default `build/packs` under the
 * repository root) writes `<outDir>/coopanion-whale/`.
 *
 * The pack carries its own kit: `whale/figure.js` imports `../kit/body.js` and `../kit/rig.js` (copied
 * unchanged), so in an app whose kit lacks our extensions she still does all 72 words. The tones our kit asks
 * for that upstream's web/sound.js lacks (found by diffing the two files) are rendered offline with the
 * Electron in node_modules (scripts/render-sounds.cjs) and shipped as `sounds/<name>.wav`. Only the textures
 * the model and the figure actually load are copied.
 *
 * In Coopanion itself the id `coopanion-whale` is an alias of the built-in whale (src/packs.ts PACK_ALIASES).
 * The module's exports (`buildManifest`, `packSounds`, `packFiles`, `encodeWav`, …) are used by
 * tests/whale-pack-export.test.js; nothing renders or writes on import.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PKG = fileURLToPath(new URL('../', import.meta.url));
export const ROOT = resolve(PKG, '../..');
const WEB = join(PKG, 'web');
const WHALE = join(WEB, 'whale');
const PKG_REL = relative(ROOT, PKG).split('\\').join('/').replace(/\/$/, '');

export const PACK_ID = 'coopanion-whale';
export const SOURCE_URL = 'https://github.com/yxengram/Coopanion';
/** The app whose sound.js decides which tones the pack ships. */
export const UPSTREAM_REF = 'origin/main';
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

/** The tone names a sound.js defines: upstream's inline `const tones = {…}` table, or ours inside `voices`. */
export function toneNamesIn(src) {
  const start = src.search(/const (tones|v) = \{\n/);
  if (start < 0) throw new Error('sound.js: no tones table found');
  const end = src.indexOf('\n  };', start);
  return [...src.slice(start, end).matchAll(/^ {4}([a-zA-Z]\w*)\(/gm)].map((m) => m[1]);
}

/** Upstream's tone names, from `git show <ref>:<PKG>/web/sound.js`. */
export function upstreamToneNames(ref = UPSTREAM_REF) {
  let src;
  try {
    src = execFileSync('git', ['show', `${ref}:${PKG_REL}/web/sound.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`could not read upstream's sound.js at ${ref} (git fetch it, or pass --upstream <ref>): ${String(err.stderr ?? err.message).trim()}`);
  }
  return toneNamesIn(src);
}

/** The tone names our kit (and the whale figure) ask for: literal `play('x', …)` calls and the face-tone tables. */
export function requestedTones() {
  const names = new Set();
  for (const file of [join(WEB, 'kit/body.js'), join(WHALE, 'figure.js')]) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bplay\(\s*'([a-zA-Z]\w*)'/g)) names.add(m[1]);
    for (const t of src.matchAll(/const (?:PLUS_)?FACE_TONES = \{([\s\S]*?)\};/g)) {
      for (const m of t[1].matchAll(/:\s*'([a-zA-Z]\w*)'/g)) names.add(m[1]);
    }
  }
  return names;
}

/**
 * The sounds the pack ships, `[{ name, kind }]` in sound.js's order: tones our kit asks for that upstream's
 * sound.js does not have, filed under the kind our SOUND_KINDS gives them. `upstreamTones` defaults to git.
 */
export async function packSounds({ upstreamTones = upstreamToneNames() } = {}) {
  const { TONES } = await soundModule();
  const ours = new Set(TONES.map((t) => t.name));
  const lost = upstreamTones.filter((n) => !ours.has(n));
  if (lost.length) throw new Error(`upstream tones missing from our sound.js: ${lost.join(', ')}`);
  const asked = requestedTones();
  const unknown = [...asked].filter((n) => !ours.has(n));
  if (unknown.length) throw new Error(`the kit asks for tones sound.js does not have: ${unknown.join(', ')}`);
  const upstream = new Set(upstreamTones);
  const list = TONES.filter((t) => asked.has(t.name) && !upstream.has(t.name)).map(({ name, kind }) => ({ name, kind }));
  for (const s of list) if (s.kind !== 'move' && s.kind !== 'face') throw new Error(`sound ${s.name}: kind ${s.kind} (expected move or face)`);
  return list;
}

/**
 * The pack's figure.json: the built-in whale's, renamed, with the pack's own entry, licence and sounds.
 * `volumes`: name → manifest volume from the render (left out = 1).
 */
export async function buildManifest({ upstreamTones, volumes = {}, version } = {}) {
  const base = readJson(join(WHALE, 'figure.json'));
  const sounds = await packSounds(upstreamTones ? { upstreamTones } : {});
  return {
    manifest: base.manifest,
    api: base.api,
    id: PACK_ID,
    version: version ?? readJson(join(ROOT, 'package.json')).version,
    name: { zh: 'Coopanion 大肥鱼', en: 'Coopanion Whale' },
    about: base.about,
    author: `${base.author ?? 'Pal-AI-Lab'}; Coopanion (${SOURCE_URL})`,
    license: `代码 AGPL-3.0-or-later,源码在 ${SOURCE_URL};贴图不在 AGPL 范围内,见 README.md`,
    credits: [
      ...(base.credits ?? []),
      { role: '代码(AGPL-3.0-or-later)', name: 'Coopanion', url: SOURCE_URL },
    ],
    entry: 'whale/figure.js',
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

/** Every texture path (relative to web/whale/) the figure loads, scheme by scheme, recorded through `opts.loadImage`. */
export async function textureFiles() {
  const { createWhaleFigure } = await import(pathToFileURL(join(WHALE, 'figure.js')).href);
  const model = readJson(join(WHALE, 'model.json'));
  const all = new Set();
  for (const sc of model.schemes ?? [{ id: 'deepseek' }]) {
    const seen = new Set();
    // the figure loads a scheme's textures before it makes its canvases; with no DOM here it stops there
    await createWhaleFigure('x/', { model, scheme: sc.id, asset: (p) => p, loadImage: async (p) => { seen.add(String(p)); return { width: 1, height: 1 }; } })
      .catch(() => {});
    if (!seen.size) throw new Error(`whale: scheme ${sc.id} loaded no textures`);
    for (const p of seen) all.add(p);
  }
  return [...all].sort();
}

/** Every file the pack copies: `[{ from, to }]`, `to` relative to the pack. */
export async function packFiles() {
  const manifest = readJson(join(WHALE, 'figure.json'));
  const thumbs = new Set([manifest.thumb, ...manifest.axes.flatMap((a) => a.options.map((o) => o.thumb)), ...manifest.presets.map((p) => p.thumb)].filter(Boolean));
  return [
    { from: join(WHALE, 'figure.js'), to: 'whale/figure.js' },
    { from: join(WEB, 'kit/body.js'), to: 'kit/body.js' },
    { from: join(WEB, 'kit/rig.js'), to: 'kit/rig.js' },
    { from: join(WHALE, 'model.json'), to: 'model.json' },
    { from: join(PKG, 'LICENSE'), to: 'LICENSE' },
    ...[...await textureFiles(), ...[...thumbs].sort()].map((p) => ({ from: join(WHALE, p), to: p })),
  ];
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
  const work = mkdtempSync(join(tmpdir(), 'whale-sounds-'));
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

const KIND_ZH = { move: '动作', face: '表情' };

/** The pack's README, in Chinese. */
export function packReadme(manifest, sounds) {
  const rows = sounds.map((s) => `| \`${s.name}\` | ${KIND_ZH[s.kind] ?? s.kind} | ${s.seconds.toFixed(2)} 秒 |`).join('\n');
  return `# ${manifest.name.zh}

Coopanion 的桌宠形象「DeepSeek 大肥鱼」导出成的形象包(id \`${manifest.id}\`,版本 ${manifest.version}),可以装进别的 Coopanion
(包括原版 v0.1.17 及以后)。她带着自己的 kit(\`kit/body.js\`、\`kit/rig.js\`),所以在原版里也会全部 ${manifest.vocab.length} 个表情和动作:
趴下、跪坐、翻滚、喷水、唱歌、喝茶、看书、敬礼、比耶……以及 ${manifest.axes[0].options.length} 套配色。
原版没有的 ${sounds.length} 个音效事先渲染成了 \`sounds/*.wav\`。

## 安装

把整个 \`${manifest.id}\` 文件夹复制到数据目录下的 \`home/companion/data/figures/\` 里(没有 \`figures\` 就新建),
即 \`<数据目录>/home/companion/data/figures/${manifest.id}/figure.json\`。数据目录:

- Windows:安装目录下的 \`data\`(和 \`Coopanion.exe\` 在同一个文件夹里)
- macOS:\`~/Library/Application Support/Coopanion\`
- Linux:\`~/.config/Coopanion\`
- 从源码运行:仓库里的 \`build/data\`;设了 \`CORTICO_COMPANION_DATA\` 时是它指的目录

然后重启 Coopanion,在装扮页最上面一行「形象」里选「${manifest.name.zh}」,配色在下面一行。

在 Coopanion 自己(${SOURCE_URL})里,这个包是内置大肥鱼的别名:装了不会多出一个形象,
配置里选着它时显示的就是内置的「DeepSeek 大肥鱼」,配色不变。

## 在原版里的已知限制

- 唱歌(\`song\`)不能中途打断:原版不认识 \`stop:song\`,歌会唱完约 ${(sounds.find((s) => s.name === 'song')?.seconds ?? 4).toFixed(1)} 秒。
- 说话口型不跟着字走:原版的页面不把正在说的字传给身体,四种口型只是轮流换。
- 包里音效的第一次播放可能没有声音:原版在音频解码完成前会跳过这一次,之后就正常了。
- 喷水的水声是渲染时定下的一个版本,不像内置音色那样每次音高略有不同。

## 音效

| 名字 | 类别 | 长度 |
|---|---|---|
${rows}

都是 44.1 kHz、16 位单声道 WAV,由 Coopanion 的 \`web/sound.js\` 离线渲染(固定随机种子,每次导出结果相同)。
文件按峰值 -1 dBFS 存,\`figure.json\` 里每个声音的 \`volume\` 把它调回内置音色的响度。设置里关掉「动作」或「表情」音效时它们也一起静音。

## 许可

- 代码(\`whale/figure.js\`、\`kit/body.js\`、\`kit/rig.js\`)是 AGPL-3.0-or-later,全文见 \`LICENSE\`;
  源码在 ${SOURCE_URL}(\`${PKG_REL}/web/\`),导出脚本是 \`${PKG_REL}/scripts/export-whale-pack.mjs\`。
- 贴图(\`tex/\`、\`feat/\`、\`schemes/\`、\`thumbs/\`)不在 AGPL 授权范围内:由 ChatGPT 的图像模型按参考图生成后拆件,
  ${(manifest.credits ?? []).filter((c) => !c.url).map((c) => `${c.role}「${c.name}」`).join(',')};围裙上的喷水小鲸鱼是 Coopanion 自己画的。
  它们随 Coopanion 分发,想在别处使用请自行确认原设的权利。
- 音效由上面的代码合成,和代码同一许可。
`;
}

function fileCount(dir) {
  let n = 0, bytes = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const c = fileCount(p); n += c.n; bytes += c.bytes; } else { n++; bytes += statSync(p).size; }
  }
  return { n, bytes };
}

/** Writes `<outDir>/coopanion-whale/`; returns what it wrote. */
export async function exportPack(outDir = join(ROOT, 'build', 'packs'), { upstream = UPSTREAM_REF, log = console.log } = {}) {
  const upstreamTones = upstreamToneNames(upstream);
  const list = await packSounds({ upstreamTones });
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

  const dir = join(resolve(outDir), PACK_ID);
  rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    mkdirSync(dirname(join(dir, f.to)), { recursive: true });
    copyFileSync(f.from, join(dir, f.to));
  }
  mkdirSync(join(dir, 'sounds'), { recursive: true });
  for (const s of sounds) writeFileSync(join(dir, 'sounds', `${s.name}.wav`), encodeWav(s.samples));
  const manifest = await buildManifest({ upstreamTones, volumes: Object.fromEntries(sounds.map((s) => [s.name, s.volume])) });
  writeFileSync(join(dir, 'figure.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(dir, 'README.md'), packReadme(manifest, sounds));

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

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--upstream');
  const upstream = at >= 0 ? args.splice(at, 2)[1] : UPSTREAM_REF;
  const outDir = args[0] ? resolve(args[0]) : undefined;
  exportPack(outDir, { upstream }).then((r) => {
    console.log(`wrote ${r.dir}: ${r.files} files, ${(r.bytes / 1048576).toFixed(1)} MB (sounds rendered with Electron ${r.electron})`);
    for (const s of r.sounds) {
      console.log(`  ${s.name.padEnd(8)} ${s.kind.padEnd(5)} ${s.seconds.toFixed(2)} s  peak ${(20 * Math.log10(s.peak)).toFixed(1)} dBFS  volume ${s.volume}`);
    }
  }, (err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
}
