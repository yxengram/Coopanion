/**
 * Installing figure packs from the dressing page (web/dress.js). The page sends a zip, or the files of a folder it
 * was given (framed as `BUNDLE_TYPE`); they are unpacked into a staging directory outside the pack roots, every pack
 * there is read as an installed one would be (src/packs.ts `readManifest`), and the page lists them for the person
 * to pick. Installing copies a pack into a dot folder of the pack directory, then moves it to `<packDir>/<id>/`, in
 * place of the pack with that id already there (whatever its folder is called). A folder `<id>` holding anything else
 * (another pack, a broken one) is left alone: the pack goes to `<id>-2/` and so on, as a pack's folder name does
 * not matter (packs.ts `scanPacks` reads the id from its manifest).
 *
 * Every path in what was sent must stay inside it, by the rules a manifest's own paths follow (packs.ts `inside`),
 * with none of the characters or device names (CON, NUL, COM1...) a Windows file name cannot hold: one that does not refuses the whole import, before
 * anything is written. A built-in id is refused, and so is the id of a built-in's exported copy (`PACK_ALIASES`),
 * which would install but never show.
 *
 * A pack is a directory holding `figure.json`, found at most `PACK_DEPTH` levels below what was sent (a zip from
 * GitHub wraps its files in `<repo>-<branch>/`; a picked folder's files come with its name in front). The search
 * does not go into a pack. Zips are read here (node:zlib; stored and deflated entries, no encryption, no zip64).
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { MANIFEST_FILE, PACK_ALIASES, inside, readManifest, type FigurePack, type Names } from './packs.ts';

export const PACK_DEPTH = 3;
/** The most an import may hold, packed or unpacked (the largest pack shipped, the whale, is about 12 MB). */
export const IMPORT_MAX = 128 * 1024 * 1024;
/** The most files an import may hold. */
const FILES_MAX = 20_000;
/** The page's framing of a folder's files (`filesFromBundle`). */
export const BUNDLE_TYPE = 'application/x-figure-files';
/** A thumbnail bigger than this is left out of the list sent to the page, which shows the pack without one. */
const THUMB_MAX = 1024 * 1024;
const IMAGE: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export interface ImportFile { path: string; bytes: Uint8Array }

/** A pack found in what was sent, as the page lists it for the person to pick. */
export interface StagedPack {
  /** Where it was found, `/`-separated, '' for the root of what was sent. */
  dir: string;
  id: string;
  name: Names;
  version: string;
  author: string | null;
  credits: Array<{ role: string; name: string }>;
  /** A data URL of its thumbnail. */
  thumb: string | null;
  axes: number;
  words: number;
  sounds: number;
  /** Parts of it this version leaves out (packs.ts `readManifest`). */
  skipped: string[];
  /** The version of the installed pack it would replace. */
  installed: string | null;
}

export interface StageResult {
  token: string;
  packs: StagedPack[];
  /** Directories with a `figure.json` that cannot be installed, and why. */
  problems: Array<{ dir: string; reason: string }>;
}

/** Files a system writes beside the ones packed (macOS's resource forks and folder settings, Windows' thumbnails): never part of a pack. */
const JUNK = (parts: readonly string[]) => parts[0] === '__MACOSX' || parts.some((p) => p.startsWith('._') || p === '.DS_Store' || p === 'Thumbs.db');

/** The names Windows keeps for devices, also with an extension (`nul.txt`). */
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(\.|$)/i;
/** A copy on its way in or an old pack on its way out (`PackImporter.install`), left behind if the app stopped meanwhile. */
const IN_FLIGHT = /^\..+\.(tmp|old)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A path inside what was sent: its segments, or null when it is empty, absolute, or leaves it (packs.ts `inside`). */
export function segments(path: string): string[] | null {
  if (!inside(path) || path.startsWith('\\')) return null;
  const parts = path.split(/[\\/]/).filter((p) => p !== '' && p !== '.');
  if (!parts.length) return null;
  // none of what a Windows file name cannot hold, nor a name it cannot end in, nor a device's name (with any extension)
  return parts.some((p) => /[<>:"|?*\x00-\x1f]/.test(p) || /[ .]$/.test(p) || WINDOWS_DEVICE.test(p)) ? null : parts;
}

/** The files of a zip, its directories left out; a string says why it cannot be read. */
export function filesFromZip(bytes: Uint8Array): ImportFile[] | string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // the end of central directory record: 22 bytes and a comment of up to 64 KB, at the end
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) return '这不是 zip 文件';
  const count = buf.readUInt16LE(end + 10);
  const size = buf.readUInt32LE(end + 12);
  let at = buf.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || at === 0xffffffff) return '这个 zip 太大(zip64),读不了';
  if (at + size > end) return 'zip 文件不完整';
  const files: ImportFile[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || buf.readUInt32LE(at) !== 0x02014b50) return 'zip 文件不完整';
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const packed = buf.readUInt32LE(at + 20);
    const unpacked = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.endsWith('\\')) continue;
    if (flags & 1) return `zip 里的 ${name} 加了密码`;
    if (packed === 0xffffffff || unpacked === 0xffffffff) return '这个 zip 太大(zip64),读不了';
    total += unpacked;
    if (total > IMPORT_MAX) return `解开后超过 ${IMPORT_MAX / 1048576} MB`;
    if (files.length >= FILES_MAX) return `文件超过 ${FILES_MAX} 个`;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return 'zip 文件不完整';
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + packed > buf.length) return 'zip 文件不完整';
    const raw = buf.subarray(start, start + packed);
    let data: Buffer;
    if (method === 0) data = raw;
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: Math.max(1, unpacked) }); } catch (err) { return `zip 里的 ${name} 解不开:${(err as Error).message}`; }
    } else return `zip 里的 ${name} 用了读不了的压缩方式(${method})`;
    if (data.length !== unpacked) return `zip 里的 ${name} 大小不对`;
    files.push({ path: name, bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) });
  }
  return files;
}

/**
 * The files the page framed (`BUNDLE_TYPE`): for each, the byte length of its path as uint32 little-endian, the
 * path in UTF-8, the byte length of its contents as uint32, the contents.
 */
export function filesFromBundle(bytes: Uint8Array): ImportFile[] | string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  const files: ImportFile[] = [];
  let at = 0;
  while (at < bytes.length) {
    if (at + 4 > bytes.length) return '上传的内容不完整';
    const pathLen = view.getUint32(at, true); at += 4;
    if (at + pathLen + 4 > bytes.length) return '上传的内容不完整';
    const path = text.decode(bytes.subarray(at, at + pathLen)); at += pathLen;
    const size = view.getUint32(at, true); at += 4;
    if (at + size > bytes.length) return '上传的内容不完整';
    files.push({ path, bytes: bytes.subarray(at, at + size) });
    at += size;
    if (files.length > FILES_MAX) return `文件超过 ${FILES_MAX} 个`;
  }
  return files;
}

/** The directories under `root` holding a figure.json, `depth` levels down at most, not looking inside one. */
async function findPacks(root: string, depth: number, rel = ''): Promise<string[]> {
  const entries = await readdir(join(root, ...rel.split('/').filter(Boolean)), { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === MANIFEST_FILE)) return [rel];
  if (depth === 0) return [];
  const found: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) found.push(...await findPacks(root, depth - 1, rel ? `${rel}/${e.name}` : e.name));
  }
  return found;
}

async function thumbOf(dir: string, file: string | undefined): Promise<string | null> {
  const type = file ? IMAGE[extname(file).toLowerCase()] : undefined;
  if (!file || !type) return null;
  try {
    const full = join(dir, file);
    if ((await stat(full)).size > THUMB_MAX) return null;
    return `data:${type};base64,${(await readFile(full)).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Whether `path` is inside `root` (not `root` itself). */
const within = (root: string, path: string) => normalize(path).startsWith(normalize(root).replace(/[\\/]+$/, '') + sep);

/**
 * One import at a time: staging a new one drops the one before, and of two stagings that overlap only the later one
 * is kept. `packDir` is where packs are installed (the first
 * of the World's pack roots), null when there is none; `packs` the packs as the World scans them, built-in ones first.
 */
export class PackImporter {
  private staged: { token: string; root: string; packs: StagedPack[] } | null = null;
  /** Counts stagings and cancels: a staging that finds it changed meanwhile was overtaken, and drops what it unpacked. */
  private generation = 0;

  constructor(private readonly opts: { packDir: () => string | null; packs: () => FigurePack[] }) {}

  get importable(): boolean {
    return !!this.opts.packDir();
  }

  /** Unpacks `files` into a staging directory and reads the packs in it; `fromFolder`: each path starts with the folder's own name. */
  async stage(files: ImportFile[], fromFolder: boolean): Promise<StageResult | { error: string }> {
    // this staging's number, taken before anything is awaited: another one starting meanwhile changes it
    const generation = this.generation + 1;
    await this.cancel();
    if (!this.importable) return { error: '这里不能导入形象包' };
    const kept: Array<{ parts: string[]; bytes: Uint8Array }> = [];
    for (const f of files) {
      const parts = segments(f.path);
      if (!parts) return { error: `有一个路径不能用:${f.path.slice(0, 200)}` };
      if (!JUNK(parts)) kept.push({ parts, bytes: f.bytes });
    }
    if (!kept.length) return { error: '里面没有文件' };
    const root = await mkdtemp(join(tmpdir(), 'figure-import-'));
    try {
      for (const { parts, bytes } of kept) {
        const full = join(root, ...parts);
        if (!within(root, full)) throw new Error(`路径出界:${parts.join('/')}`);
        await mkdir(join(root, ...parts.slice(0, -1)), { recursive: true });
        await writeFile(full, bytes);
      }
      const dirs = await findPacks(root, PACK_DEPTH + (fromFolder ? 1 : 0));
      const installed = this.opts.packs();
      const packs: StagedPack[] = [];
      const problems: StageResult['problems'] = [];
      for (const dir of dirs) {
        const full = join(root, ...dir.split('/').filter(Boolean));
        const skipped: string[] = [];
        const m = readManifest(full, false, skipped);
        if (typeof m === 'string') { problems.push({ dir, reason: m }); continue; }
        const same = installed.find((p) => p.id === m.id);
        if (same?.builtin) { problems.push({ dir, reason: `id ${m.id} 是内置形象的,换个 id 才能导入` }); continue; }
        if (Object.hasOwn(PACK_ALIASES, m.id)) { problems.push({ dir, reason: `${m.id} 是内置形象「${PACK_ALIASES[m.id]}」导出的副本,这里已经有了` }); continue; }
        if (packs.some((p) => p.id === m.id)) { problems.push({ dir, reason: `id ${m.id} 和这次导入的另一个形象包重复` }); continue; }
        packs.push({
          dir, id: m.id, name: m.name, version: m.version, author: m.author ?? null,
          credits: (m.credits ?? []).filter((c) => typeof c?.role === 'string' && typeof c?.name === 'string').map(({ role, name }) => ({ role, name })),
          thumb: await thumbOf(full, m.thumb), axes: m.axes.length, words: m.vocab.length, sounds: Object.keys(m.sounds).length,
          skipped, installed: same ? same.manifest.version : null,
        });
      }
      if (!dirs.length) problems.push({ dir: '', reason: `往下 ${PACK_DEPTH} 层都没找到 ${MANIFEST_FILE}` });
      if (generation !== this.generation) {
        await rm(root, { recursive: true, force: true });
        return { error: '又选了别的形象包,这次的已作废' };
      }
      if (!packs.length) { await rm(root, { recursive: true, force: true }); return { token: '', packs, problems }; }
      this.staged = { token: randomUUID(), root, packs };
      return { token: this.staged.token, packs, problems };
    } catch (err) {
      await rm(root, { recursive: true, force: true });
      return { error: `没能解开:${(err as Error).message}` };
    }
  }

  /** Installs the staged packs found at `dirs`; resolves to their ids. */
  async install(token: string, dirs: readonly string[]): Promise<{ installed: string[] } | { error: string }> {
    const staged = this.staged;
    if (!staged || staged.token !== token) return { error: '这次导入已经过期,请重新选择' };
    const chosen = staged.packs.filter((p) => dirs.includes(p.dir));
    if (!chosen.length) return { error: '没有选要导入的形象包' };
    const packDir = this.opts.packDir();
    if (!packDir) return { error: '这里不能导入形象包' };
    // the token is spent now: a second install of it, while this one runs, is refused
    this.staged = null;
    this.generation++;
    const done: string[] = [];
    try {
      await mkdir(packDir, { recursive: true });
      for (const e of await readdir(packDir)) if (IN_FLIGHT.test(e)) await rm(join(packDir, e), { recursive: true, force: true });
      const installed = this.opts.packs();
      for (const p of chosen) {
        const failed = await this.installOne(packDir, join(staged.root, ...p.dir.split('/').filter(Boolean)), p.id, installed);
        if (failed) return { error: done.length ? `已导入 ${done.join('、')};${p.id} ${failed}` : `${p.id} ${failed}` };
        done.push(p.id);
      }
      return { installed: done };
    } finally {
      await rm(staged.root, { recursive: true, force: true });
    }
  }

  /**
   * Copies the pack at `from` into `packDir` under a dot folder, then moves it in place of the installed pack with
   * that id; the old one is removed only once the new one is in. Resolves to why it could not, or null.
   */
  private async installOne(packDir: string, from: string, id: string, installed: readonly FigurePack[]): Promise<string | null> {
    const temp = join(packDir, `.${id}.tmp-${randomUUID()}`);
    try {
      await cp(from, temp, { recursive: true });
    } catch (err) {
      await rm(temp, { recursive: true, force: true });
      return `没能复制进去:${(err as Error).message}`;
    }
    // the pack it replaces may sit in a folder named otherwise; one in another pack root is left alone
    const old = installed.find((x) => x.id === id && !x.builtin && within(packDir, x.dir));
    let aside: string | null = null;
    try {
      if (old && existsSync(old.dir)) {
        aside = join(packDir, `.${id}.old-${randomUUID()}`);
        await rename(old.dir, aside);
      }
      // a folder of that name holding anything else stays: the pack takes the next free name
      let target = join(packDir, id);
      for (let n = 2; existsSync(target); n++) target = join(packDir, `${id}-${n}`);
      await rename(temp, target);
    } catch (err) {
      await rm(temp, { recursive: true, force: true });
      if (aside && old) await rename(aside, old.dir).catch(() => {});
      return `没能放进去:${(err as Error).message}`;
    }
    if (aside) await rm(aside, { recursive: true, force: true });
    return null;
  }

  /** Drops the staged import, if any. */
  async cancel(): Promise<void> {
    const staged = this.staged;
    this.staged = null;
    this.generation++;
    if (staged) await rm(staged.root, { recursive: true, force: true });
  }
}
