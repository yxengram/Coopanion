// The exported whale pack (packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs): its manifest is
// built without rendering and checked with the World's readManifest, which keeps upstream's rules (packs.ts adds
// only the alias), plus what an upstream app needs from it. No Electron here.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PACK_ID, buildManifest, encodeWav, finishSound, packFiles, packSounds, requestedTones, toneNamesIn, upstreamToneNames,
} from '../packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs';
import { BUILTIN_PACKS, readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { TONES } from '../packages/cortico-world-desktop-pet/web/sound.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const builtin = (id) => JSON.parse(readFileSync(new URL(`web/${id}/figure.json`, PKG), 'utf8'));
// upstream's tone names from git when origin/main is there (a shallow CI checkout may lack it), else the tones
// sound.js marks as not ours; with git, the two must agree
let fromGit = null;
try { fromGit = upstreamToneNames(); } catch { /* no upstream ref */ }
const upstreamTones = fromGit ?? TONES.filter((t) => !t.plus).map((t) => t.name);

describe('exported whale pack', () => {
  it('upstream tones read from git match the tones sound.js marks as upstream', () => {
    if (!fromGit) return;
    expect(new Set(fromGit)).toEqual(new Set(TONES.filter((t) => !t.plus).map((t) => t.name)));
    expect(toneNamesIn(readFileSync(new URL('web/sound.js', PKG), 'utf8'))).toEqual(TONES.map((t) => t.name));
  });

  it('ships every tone the kit asks for that upstream lacks, as move or face sounds', async () => {
    const sounds = await packSounds({ upstreamTones });
    const names = sounds.map((s) => s.name);
    const asked = requestedTones();
    expect(names.length).toBe(18);
    expect(names).toEqual(expect.arrayContaining(['song', 'spout', 'sip', 'roll', 'sigh', 'soft', 'wry', 'hehe', 'crack']));
    expect(names).not.toContain('huff');
    for (const n of names) expect(upstreamTones).not.toContain(n);
    for (const n of asked) if (!upstreamTones.includes(n)) expect(names).toContain(n);
    for (const s of sounds) expect(['move', 'face']).toContain(s.kind);
  });

  it('builds a manifest an upstream app accepts', async () => {
    const m = await buildManifest({ upstreamTones, volumes: { song: .05 } });
    expect(m).toMatchObject({ manifest: 2, api: 2, id: PACK_ID, entry: 'whale/figure.js', export: 'createWhaleBody', model: 'model.json' });
    const builtinIds = BUILTIN_PACKS.map((b) => JSON.parse(readFileSync(join(b.dir, 'figure.json'), 'utf8')).id);
    expect(builtinIds).toEqual(['coo', 'whale']);
    expect(builtinIds).not.toContain(m.id);
    expect(m.name).toEqual({ zh: 'Coopanion 大肥鱼', en: 'Coopanion Whale' });
    const whale = builtin('whale');
    expect(m.vocab).toEqual(whale.vocab);
    expect(m.vocab.length).toBe(72);
    expect(m.axes).toEqual(whale.axes);
    expect(m.presets).toEqual(whale.presets);
    expect(m.credits).toEqual(expect.arrayContaining(whale.credits));
    expect(m.license).toContain('AGPL-3.0-or-later');
    expect(JSON.stringify(m.credits)).toContain('https://github.com/yxengram/Coopanion');
    for (const [name, s] of Object.entries(m.sounds)) {
      expect(s.file).toBe(`sounds/${name}.wav`);
      expect(['move', 'touch', 'face', 'snore']).toContain(s.kind);
    }
    expect(m.sounds.song.volume).toBe(.05);

    // the World's own check, with the sound files in place
    const root = mkdtempSync(join(tmpdir(), 'whale-pack-')), dir = join(root, PACK_ID);
    mkdirSync(dir);
    writeFileSync(join(dir, 'figure.json'), JSON.stringify(m));
    for (const s of Object.values(m.sounds)) {
      mkdirSync(dirname(join(dir, s.file)), { recursive: true });
      writeFileSync(join(dir, s.file), encodeWav(new Float32Array(8)));
    }
    const missing = [];
    const read = readManifest(dir, false, missing);
    expect(typeof read === 'string' ? read : null).toBeNull();
    expect(missing).toEqual([]);
    expect(Object.keys(read.sounds).sort()).toEqual(Object.keys(m.sounds).sort());
    expect(read.vocab.length).toBe(72);

    // and upstream's own packs.ts, when git has it
    if (fromGit) {
      const up = mkdtempSync(join(tmpdir(), 'upstream-packs-'));
      for (const f of ['packs.ts', 'script.ts']) {
        writeFileSync(join(up, f), execFileSync('git', ['show', `origin/main:packages/cortico-world-desktop-pet/src/${f}`], { encoding: 'utf8' }));
      }
      const upstream = await import(pathToFileURL(join(up, 'packs.ts')).href);
      const gaps = [];
      const r = upstream.readManifest(dir, false, gaps);
      expect(typeof r === 'string' ? r : null).toBeNull();
      expect(gaps).toEqual([]);
      const scan = upstream.scanPacks([], [root]);
      expect(scan.problems).toEqual([]);
      expect(scan.packs.map((p) => p.id)).toEqual([PACK_ID]);
    }
  });

  it('copies a self-contained set of files: the figure, its kit, the model and every texture it loads', async () => {
    const files = await packFiles();
    const to = new Set(files.map((f) => f.to));
    expect(to.size).toBe(files.length);
    for (const f of files) expect(() => readFileSync(f.from)).not.toThrow();
    for (const p of ['whale/figure.js', 'kit/body.js', 'kit/rig.js', 'model.json', 'LICENSE']) expect(to).toContain(p);
    // the copied modules only import each other
    for (const mod of ['whale/figure.js', 'kit/body.js', 'kit/rig.js']) {
      const src = readFileSync(files.find((f) => f.to === mod).from, 'utf8');
      for (const [, spec] of src.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)) {
        expect(spec.startsWith('.')).toBe(true);
        expect(to).toContain(posix.normalize(posix.join(posix.dirname(mod), spec)));
      }
    }
    const whale = builtin('whale');
    for (const t of [whale.thumb, ...whale.axes.flatMap((a) => a.options.map((o) => o.thumb)), ...whale.presets.map((p) => p.thumb)]) expect(to).toContain(t);
    const model = JSON.parse(readFileSync(new URL('web/whale/model.json', PKG), 'utf8'));
    for (const sc of model.schemes.slice(1)) {
      expect(to).toContain(`schemes/${sc.id}/tex/kneel_body.png`);
      expect(to).toContain(`schemes/${sc.id}/feat/eyeL_iris.png`);
    }
    for (const p of model.parts) expect(to).toContain(`tex/${p.tex}.png`);
  });

  it('encodes 16-bit mono WAV and keeps the tone level through the manifest volume', () => {
    const rate = 44100, raw = new Float32Array(rate);
    for (let i = 0; i < rate * .2; i++) raw[i] = .1 * Math.sin(i / 10) * (1 - i / (rate * .2));
    const { samples, volume, peak, seconds } = finishSound(raw, rate);
    expect(peak).toBeCloseTo(.1, 2);
    expect(volume).toBeGreaterThan(0);
    expect(volume).toBeLessThanOrEqual(1);
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      max = Math.max(max, Math.abs(samples[i]));
      expect(samples[i] * volume).toBeCloseTo(raw[i], 4);
    }
    expect(max).toBeCloseTo(10 ** (-1 / 20), 2);
    expect(seconds).toBeGreaterThan(.2);
    expect(seconds).toBeLessThan(.4);
    expect(() => finishSound(new Float32Array(rate))).toThrow(/silent/);

    const wav = encodeWav(samples, rate);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);   // PCM
    expect(wav.readUInt16LE(22)).toBe(1);   // mono
    expect(wav.readUInt32LE(24)).toBe(rate);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(samples.length * 2);
    expect(wav.length).toBe(44 + samples.length * 2);
  });
});
