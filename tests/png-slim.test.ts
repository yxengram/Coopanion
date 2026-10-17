import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { decodePng, sameVisible, slimPng, slimTree } from '../scripts/png-slim.ts';

const WEB = fileURLToPath(new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url));

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, body: Buffer) => {
  const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]), out = Buffer.alloc(4 + tb.length + 4);
  out.writeUInt32BE(body.length, 0); tb.copy(out, 4); out.writeUInt32BE(crc(tb), 4 + tb.length);
  return out;
};
/** A plain PNG as an art tool might write it: filter 0, default zlib, optional extra chunks before IDAT. */
function png(w: number, h: number, colorType: 2 | 6, px: Uint8Array, extra: Buffer[] = [], depth = 8): Buffer {
  const bpp = colorType === 6 ? 4 : 3, raw = Buffer.alloc(h * (w * bpp + 1));
  for (let y = 0; y < h; y++) Buffer.from(px.subarray(y * w * bpp, (y + 1) * w * bpp)).copy(raw, y * (w * bpp + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra,
    chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
/** Deterministic noise. */
const rand = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff;

/** A soft disc on a transparent field whose colour is leftover paint, like the figure textures. */
function sprite(w = 96, h = 80) {
  const r = rand(7), px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, d = Math.hypot(x - w / 2, y - h / 2), a = Math.max(0, Math.min(255, Math.round((30 - d) * 40)));
    px[o + 3] = a;
    if (a) { px[o] = 200 + (x & 31); px[o + 1] = 90 + (y & 63); px[o + 2] = 40; } else { px[o] = r(); px[o + 1] = r(); px[o + 2] = r(); }
  }
  return { w, h, px };
}

describe('png-slim', () => {
  it('keeps every visible pixel, clears the colour under alpha 0 and gets smaller', () => {
    const { w, h, px } = sprite(), src = png(w, h, 6, px);
    const out = slimPng(src);
    expect(out.length).toBeLessThan(src.length * 0.5);
    const a = decodePng(src)!, b = decodePng(out)!;
    expect(b).not.toBeNull();
    expect(sameVisible(a, b)).toBe(true);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (px[o + 3]) expect([...b.data.subarray(o, o + 4)]).toEqual([...px.subarray(o, o + 4)]);
      else expect([...b.data.subarray(o, o + 4)]).toEqual([0, 0, 0, 0]);
    }
    expect(slimPng(src).equals(out)).toBe(true); // deterministic
  });

  it('stores an opaque RGBA image as RGB with the same pixels', () => {
    const w = 64, h = 64, r = rand(3), px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { px[i * 4] = (i >> 6) * 3; px[i * 4 + 1] = r() & 0xf0; px[i * 4 + 2] = i & 0xff; px[i * 4 + 3] = 255; }
    const src = png(w, h, 6, px), out = slimPng(src), b = decodePng(out)!;
    expect(out.length).toBeLessThan(src.length);
    expect(b.colorType).toBe(2);
    expect(Buffer.from(b.data).equals(Buffer.from(px))).toBe(true);
  });

  it('uses a palette for a few flat colours and keeps their alpha', () => {
    const w = 128, h = 96, r = rand(5), px = new Uint8Array(w * h * 4), cols = [[0, 0, 0, 0], [255, 0, 0, 255], [10, 20, 30, 128], [255, 255, 255, 255]];
    for (let i = 0; i < w * h; i++) px.set(cols[r() & 3], i * 4);
    const src = png(w, h, 6, px), out = slimPng(src), b = decodePng(out)!;
    expect(b.colorType).toBe(3);
    expect(Buffer.from(b.data).equals(Buffer.from(px))).toBe(true);
  });

  it('leaves files it does not fully understand alone', () => {
    const { w, h, px } = sprite(24, 24);
    // a gAMA chunk changes how the colours look: dropping it would not be lossless
    const gama = png(w, h, 6, px, [chunk('gAMA', Buffer.from([0, 0, 0xb1, 0x8f]))]);
    expect(slimPng(gama)).toBe(gama);
    const broken = Buffer.from(png(w, h, 6, px)); broken[broken.length - 20] ^= 0xff; // bad CRC / data
    expect(slimPng(broken)).toBe(broken);
    const sixteen = png(w, h, 6, new Uint8Array(w * h * 8), [], 16);
    expect(slimPng(sixteen)).toBe(sixteen);
    const junk = Buffer.from('not a png'); expect(slimPng(junk)).toBe(junk);
  });

  it('never grows a file and returns already tight ones unchanged', () => {
    const { w, h, px } = sprite(), once = slimPng(png(w, h, 6, px));
    expect(slimPng(once)).toBe(once);
  });

  it('slims real figure textures without changing what is drawn', () => {
    for (const rel of ['claude-chan/tex/pose_chin.png', 'claude-chan/tex/brows.png', 'whale/thumbs/deepseek.png']) {
      let src: Buffer;
      try { src = readFileSync(WEB + rel); } catch { continue; }
      const out = slimPng(src);
      expect(out.length).toBeLessThanOrEqual(src.length);
      expect(sameVisible(decodePng(src)!, decodePng(out)!)).toBe(true);
    }
    const chin = readFileSync(WEB + 'claude-chan/tex/pose_chin.png');
    expect(slimPng(chin).length).toBeLessThan(chin.length * 0.8);
  });

  it('slims a folder in place, on worker threads or in this thread', async () => {
    // not the temp dir: vitest cannot load from it on Windows (CLAUDE.md)
    const dir = fileURLToPath(new URL('../node_modules/.cache/png-slim-test/', import.meta.url));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    const { w, h, px } = sprite(), loose = png(w, h, 6, px), tight = slimPng(loose);
    const gama = png(24, 24, 6, sprite(24, 24).px, [chunk('gAMA', Buffer.from([0, 0, 0xb1, 0x8f]))]);
    const files: Record<string, Buffer> = { 'loose.png': loose, 'a/tight.png': tight, 'a/b/gama.png': gama, 'a/b/LOOSE2.PNG': loose, 'a/notes.txt': Buffer.from('x') };
    for (const [rel, b] of Object.entries(files)) writeFileSync(join(dir, rel), b);
    try {
      for (const threads of [2, 0]) {
        for (const [rel, b] of Object.entries(files)) writeFileSync(join(dir, rel), b);
        // a worker that cannot start falls back to this thread with the same result: only the warning tells them apart
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let s, warned: unknown[][];
        try { s = await slimTree(dir, threads); } finally { warned = [...warn.mock.calls]; warn.mockRestore(); }
        expect(warned).toEqual([]);
        expect(s).toEqual({ files: 4, changed: 2, before: 2 * loose.length + tight.length + gama.length, after: 3 * tight.length + gama.length });
        expect(readFileSync(join(dir, 'loose.png')).equals(tight)).toBe(true);
        expect(readFileSync(join(dir, 'a/b/LOOSE2.PNG')).equals(tight)).toBe(true);
        expect(readFileSync(join(dir, 'a/tight.png')).equals(tight)).toBe(true);
        expect(readFileSync(join(dir, 'a/b/gama.png')).equals(gama)).toBe(true);
        expect(readFileSync(join(dir, 'a/notes.txt')).toString()).toBe('x');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
