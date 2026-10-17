/**
 * Lossless PNG slimming for the packed app (scripts/pack.ts runs it on the staged copy of the desktop pet's `web/`,
 * never on the repository's art, which the pipelines in scratch/ expect byte for byte).
 *
 * Every figure texture is drawn premultiplied: the WebGL rig uploads with UNPACK_PREMULTIPLY_ALPHA_WEBGL and Canvas 2D
 * and <img> always composite premultiplied, so the colour under a fully transparent pixel never reaches the screen.
 * `slimPng` sets that colour to 0 (long zero runs compress far better than the leftover paint the art tools leave
 * there), stores the image in the smallest 8-bit colour type that holds it exactly (palette, grey, grey+alpha, RGB,
 * RGBA), and keeps the smallest of several filter × zlib trials. Every pixel with alpha > 0 decodes to the same RGBA
 * as before. Files it does not fully understand (other chunks such as gAMA/iCCP that could change colours, 16-bit,
 * interlaced, bad CRCs) are returned unchanged, as is any result that would not be smaller. The output depends only
 * on the input bytes (and the zlib Node ships), so an unchanged texture packs to the same bytes in every release.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync, constants as Z } from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array, start = 0, end = buf.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A decoded 8-bit image as RGBA, plus what it was stored as. */
export interface Rgba { width: number; height: number; data: Uint8Array; colorType: number }

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Decodes an 8-bit, non-interlaced PNG whose chunks are only IHDR, PLTE, tRNS, IDAT and IEND, or returns null.
 * `strict` (the input side) also refuses PLTE/tRNS and grey/palette types: only the RGB and RGBA files the art
 * pipelines write are rewritten. The non-strict form decodes everything `slimPng` writes, for its own check.
 */
export function decodePng(buf: Uint8Array, strict = false): Rgba | null {
  if (buf.length < 8 || !SIG.equals(Buffer.from(buf.subarray(0, 8)))) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8, ihdr: Uint8Array | null = null, plte: Uint8Array | null = null, trns: Uint8Array | null = null, ended = false;
  const idat: Uint8Array[] = [];
  while (p + 12 <= buf.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    if (p + 12 + len > buf.length) return null;
    if (crc32(buf, p + 4, p + 8 + len) !== dv.getUint32(p + 8 + len)) return null;
    const body = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === 'IHDR') { if (ihdr || len !== 13) return null; ihdr = body; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') { ended = true; break; }
    else if (!strict && type === 'PLTE' && !idat.length) plte = body;
    else if (!strict && type === 'tRNS' && !idat.length) trns = body;
    else return null;
  }
  if (!ended || p !== buf.length || !ihdr || !idat.length) return null;
  const hv = new DataView(ihdr.buffer, ihdr.byteOffset, 13);
  const width = hv.getUint32(0), height = hv.getUint32(4);
  const [depth, colorType, comp, filt, lace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (!width || !height || depth !== 8 || comp || filt || lace) return null;
  if (strict ? colorType !== 2 && colorType !== 6 : !(colorType in CHANNELS)) return null;
  if (colorType === 3 && !plte) return null;
  if (width * height > 1 << 26) return null;
  const bpp = CHANNELS[colorType], stride = width * bpp;
  let raw: Uint8Array;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  if (raw.length !== height * (stride + 1)) return null;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride, up = o - stride;
    if (f > 4) return null;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
      px[o + i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 0xff;
    }
  }
  const n = width * height, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const d = i * 4;
    if (colorType === 6) { data[d] = px[d]; data[d + 1] = px[d + 1]; data[d + 2] = px[d + 2]; data[d + 3] = px[d + 3]; }
    else if (colorType === 2) { data[d] = px[i * 3]; data[d + 1] = px[i * 3 + 1]; data[d + 2] = px[i * 3 + 2]; data[d + 3] = 255; }
    else if (colorType === 0) { data[d] = data[d + 1] = data[d + 2] = px[i]; data[d + 3] = 255; }
    else if (colorType === 4) { data[d] = data[d + 1] = data[d + 2] = px[i * 2]; data[d + 3] = px[i * 2 + 1]; }
    else {
      const k = px[i];
      if (k * 3 + 2 >= plte!.length) return null;
      data[d] = plte![k * 3]; data[d + 1] = plte![k * 3 + 1]; data[d + 2] = plte![k * 3 + 2]; data[d + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, data, colorType };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  out.set(body, 8);
  out.writeUInt32BE(crc32(out, 4, 8 + body.length), 8 + body.length);
  return out;
}

/** Filters scanlines of `bpp`-byte pixels: 0–4 the PNG filter for every row, 5 the per-row minimum-sum heuristic. */
function filterRows(px: Uint8Array, width: number, height: number, bpp: number, mode: number): Uint8Array {
  const stride = width * bpp, out = new Uint8Array(height * (stride + 1)), tmp = new Uint8Array(stride);
  const apply = (f: number, y: number, dst: Uint8Array, at: number) => {
    const o = y * stride, up = o - stride;
    let sum = 0;
    for (let i = 0; i < stride; i++) {
      const x = px[o + i], a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[up + i] : 0, c = y && i >= bpp ? px[up + i - bpp] : 0;
      const v = (f === 0 ? x : f === 1 ? x - a : f === 2 ? x - b : f === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, c)) & 0xff;
      dst[at + i] = v;
      sum += v < 128 ? v : 256 - v;
    }
    return sum;
  };
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    if (mode < 5) { out[at] = mode; apply(mode, y, out, at + 1); continue; }
    let best = -1, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const s = apply(f, y, tmp, 0);
      if (s < bestSum) { bestSum = s; best = f; }
    }
    out[at] = best;
    apply(best, y, out, at + 1);
  }
  return out;
}

/**
 * The filter modes × zlib strategies tried for each image: on the built-in figures these five won 276 of 280 sampled
 * files among all of 0/1/2/4/min-sum × default/filtered; on the whole set they come within 0.01% of trying all nine,
 * in about half the time.
 */
const TRIALS: ReadonlyArray<[number, number]> = [
  [5, Z.Z_FILTERED], [0, Z.Z_DEFAULT_STRATEGY], [5, Z.Z_DEFAULT_STRATEGY], [4, Z.Z_FILTERED], [2, Z.Z_FILTERED],
];

function encode(width: number, height: number, colorType: number, px: Uint8Array, plte?: Uint8Array, trns?: Uint8Array): Buffer {
  const bpp = CHANNELS[colorType];
  let best: Buffer | null = null;
  const filtered = new Map<number, Uint8Array>();
  for (const [mode, strategy] of colorType === 3 ? TRIALS.filter(([m]) => m === 0 || m === 5) : TRIALS) {
    let f = filtered.get(mode);
    if (!f) { f = filterRows(px, width, height, bpp, mode); filtered.set(mode, f); }
    const z = deflateSync(f, { level: 9, memLevel: 9, strategy });
    if (!best || z.length < best.length) best = z;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), ...(plte ? [chunk('PLTE', plte)] : []), ...(trns?.length ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', best!), chunk('IEND', new Uint8Array(0))]);
}

/** Whether `b` shows the same picture as `a`: equal RGBA wherever `a` is visible, transparent wherever `a` is not. */
export function sameVisible(a: Rgba, b: Rgba): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const x = a.data, y = b.data;
  for (let i = 0; i < x.length; i += 4) {
    if (x[i + 3] === 0) { if (y[i + 3] !== 0) return false; continue; }
    if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) return false;
  }
  return true;
}

/** The slimmed PNG, or `buf` itself when it is not an RGB/RGBA file this understands or nothing smaller came out. */
export function slimPng(buf: Buffer): Buffer {
  const img = decodePng(buf, true);
  if (!img) return buf;
  const { width, height } = img, n = width * height;
  const d = new Uint8Array(img.data);
  let opaque = true, grey = true;
  const colours = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (d[o + 3] === 0) { d[o] = d[o + 1] = d[o + 2] = 0; }
    if (d[o + 3] !== 255) opaque = false;
    if (d[o] !== d[o + 1] || d[o] !== d[o + 2]) grey = false;
    if (colours.size <= 256) {
      const k = ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
      colours.set(k, (colours.get(k) ?? 0) + 1);
    }
  }
  const candidates: Buffer[] = [];
  if (colours.size <= 256) {
    // translucent entries first so tRNS stays short; then by use, then by value (deterministic)
    const order = [...colours].sort((a, b) => ((a[0] & 255) === 255 ? 1 : 0) - ((b[0] & 255) === 255 ? 1 : 0) || b[1] - a[1] || a[0] - b[0]).map(([k]) => k);
    const index = new Map(order.map((k, i) => [k, i]));
    const plte = new Uint8Array(order.length * 3), alphas = order.map((k) => k & 255);
    order.forEach((k, i) => { plte[i * 3] = k >>> 24; plte[i * 3 + 1] = (k >>> 16) & 255; plte[i * 3 + 2] = (k >>> 8) & 255; });
    const nt = alphas.findIndex((a) => a === 255);
    const trns = Uint8Array.from(alphas.slice(0, nt < 0 ? alphas.length : nt));
    const px = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      px[i] = index.get(((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0)!;
    }
    candidates.push(encode(width, height, 3, px, plte, trns));
  }
  const ct = grey ? (opaque ? 0 : 4) : opaque ? 2 : 6, bpp = CHANNELS[ct], px = new Uint8Array(n * bpp);
  for (let i = 0; i < n; i++) {
    const o = i * 4, t = i * bpp;
    if (ct === 6) { px[t] = d[o]; px[t + 1] = d[o + 1]; px[t + 2] = d[o + 2]; px[t + 3] = d[o + 3]; }
    else if (ct === 2) { px[t] = d[o]; px[t + 1] = d[o + 1]; px[t + 2] = d[o + 2]; }
    else if (ct === 4) { px[t] = d[o]; px[t + 1] = d[o + 3]; }
    else px[t] = d[o];
  }
  candidates.push(encode(width, height, ct, px));
  const out = candidates.reduce((a, b) => (b.length < a.length ? b : a));
  if (out.length >= buf.length) return buf;
  // checked with the decoder before it replaces anything: a bug here must fail the pack, not ship a broken texture
  const back = decodePng(out);
  if (!back || !sameVisible(img, back)) throw new Error('png-slim: re-encoded image differs from the original');
  return out;
}

function pngsUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...pngsUnder(p));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out.sort();
}

export interface SlimStats { files: number; changed: number; before: number; after: number }

/** Slims every PNG under `dir` in place, on a pool of worker threads (`threads` 0: in this thread). */
export async function slimTree(dir: string, threads = availableParallelism()): Promise<SlimStats> {
  const files = pngsUnder(dir), stats: SlimStats = { files: files.length, changed: 0, before: 0, after: 0 };
  const one = (before: number, after: number) => {
    stats.before += before; stats.after += after; if (after < before) stats.changed++;
  };
  const here = (file: string) => {
    const b = readFileSync(file), s = slimPng(b);
    if (s !== b) writeFileSync(file, s);
    one(b.length, s.length);
  };
  let next = 0;
  if (threads < 1 || files.length < 2) {
    while (next < files.length) here(files[next++]);
    return stats;
  }
  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: Math.min(threads, files.length) }, () => new Promise<void>((ok, bad) => {
    // workers inherit process.execArgv, which carries tsx's loader when this runs under tsx
    const w = new Worker(self, { workerData: { pngSlimWorker: true } });
    let current: string | null = null, done = false;
    const feed = () => {
      if (next < files.length) w.postMessage(current = files[next++]);
      else { current = null; done = true; void w.terminate().then(() => ok()); }
    };
    w.on('message', (m: { before: number; after: number } | { error: string }) => {
      if ('error' in m) { done = true; bad(new Error(m.error)); void w.terminate(); return; }
      one(m.before, m.after); feed();
    });
    // a worker that cannot start (no TypeScript loader in it): this lane carries on in this thread
    w.on('error', (e) => {
      if (done) return;
      done = true;
      console.warn(`png-slim: worker failed (${e.message}), continuing without it`);
      try {
        if (current) here(current);
        while (next < files.length) here(files[next++]);
        ok();
      } catch (err) { bad(err); }
    });
    // and one that dies without an error event must fail the pack, not leave it waiting
    w.on('exit', (code) => { if (!done) { done = true; bad(new Error(`png-slim: worker exited with code ${code}`)); } });
    feed();
  })));
  return stats;
}

if (!isMainThread && (workerData as { pngSlimWorker?: boolean } | null)?.pngSlimWorker) {
  parentPort!.on('message', (file: string) => {
    try {
      const b = readFileSync(file), s = slimPng(b);
      if (s !== b) writeFileSync(file, s);
      parentPort!.postMessage({ before: b.length, after: s.length });
    } catch (e) {
      parentPort!.postMessage({ error: `${file}: ${(e as Error).message}` });
    }
  });
}
