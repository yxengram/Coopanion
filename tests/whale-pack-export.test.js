// The exported whale pack (packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs): its manifest is
// built without rendering and checked with the World's readManifest, which keeps upstream's rules (packs.ts adds
// only the alias), plus what an upstream app needs from it. No Electron here.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PACK_ID, UPSTREAM_REF, buildManifest, encodeWav, finishSound, packFiles, packSounds, requestedTones, toneNamesIn, upstreamToneNames,
} from '../packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs';
import { BUILTIN_PACKS, readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { TONES } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { PLUS_MIXES } from '../packages/cortico-world-desktop-pet/web/kit/body.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const builtin = (id) => JSON.parse(readFileSync(new URL(`web/${id}/figure.json`, PKG), 'utf8'));
// upstream's tones are the ones sound.js does not mark as ours; when the pinned upstream tag is there (a shallow
// CI checkout may lack it), its sound.js must have exactly those
let fromGit = null;
try { fromGit = upstreamToneNames(UPSTREAM_REF); } catch { /* no tag here */ }
const upstreamTones = TONES.filter((t) => !t.plus).map((t) => t.name);

/** The arm words drawn anew for the girls and the whale. */
const NEW_ARM_WORDS = ['clap', 'shrug', 'headhold', 'raise', 'thumbs', 'shush', 'wipe'];

describe('exported whale pack', () => {
  it('upstream tones at the pinned tag match the tones sound.js marks as upstream', () => {
    if (!fromGit) return;
    expect(new Set(fromGit)).toEqual(new Set(TONES.filter((t) => !t.plus).map((t) => t.name)));
    expect(toneNamesIn(readFileSync(new URL('web/sound.js', PKG), 'utf8'))).toEqual(TONES.map((t) => t.name));
  });

  it('ships every tone the kit asks for that upstream lacks, as move or face sounds', async () => {
    const sounds = await packSounds({ upstreamTones });
    const names = sounds.map((s) => s.name);
    const asked = requestedTones();
    expect(names.length).toBe(33);
    expect(names).toEqual(expect.arrayContaining(['song', 'spout', 'sip', 'roll', 'sigh', 'soft', 'wry', 'hehe', 'crack']));
    // the sounds of the words added since v0.5.0: the arm words drawn anew, her tail's wag, and the faces with marks of
    // their own and 安慰; not the girls' fist, notebook and fingertips (no words of hers), nor ears or wings
    expect(names).toEqual(expect.arrayContaining(['clap', 'shush', 'wipe', 'thumbs', 'raise', 'shrug', 'headhold', 'wag',
      'fume', 'heartbreak', 'confetti', 'gloom', 'dots', 'starry', 'comfort']));
    for (const n of ['fist', 'jot', 'twiddle', 'earflick', 'wingbeat']) expect(names, n).not.toContain(n);
    expect(names).not.toContain('huff');
    for (const n of names) expect(upstreamTones).not.toContain(n);
    for (const n of asked) if (!upstreamTones.includes(n)) expect(names).toContain(n);
    for (const s of sounds) expect(['move', 'face']).toContain(s.kind);
  });

  it('builds a manifest an upstream app accepts', async () => {
    const m = await buildManifest({ upstreamTones, volumes: { song: .05 } });
    // expressions shown as one face in one group are ours alone: upstream's World has no groups
    expect('pairs' in m).toBe(false);
    expect(m).toMatchObject({ manifest: 2, api: 2, id: PACK_ID, entry: 'whale/figure.js', export: 'createWhaleBody', model: 'model.json' });
    const builtinIds = BUILTIN_PACKS.map((b) => JSON.parse(readFileSync(join(b.dir, 'figure.json'), 'utf8')).id);
    expect(builtinIds).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']);
    expect(builtinIds).not.toContain(m.id);
    expect(m.name).toEqual({ zh: 'Coopanion 大肥鱼', en: 'Coopanion Whale' });
    const whale = builtin('whale');
    expect(m.vocab).toEqual(whale.vocab);
    // she draws arm gestures kneeling: her kneel says so (keepsArms)
    expect(m.vocab.find((w) => w.id === 'kneel')).toMatchObject({ lasting: true, keepsArms: true });
    // the 72 words of v0.2.6, the curious tilt (歪头), her chin on her hand (托腮), the head's and body's moves 低头, 眨眨眼,
    // 凑近, 后仰, 晃来晃去, 跺脚, her tail's 摇尾巴 and the faces made of parts (PLUS_MIXES), which the pack's own kit draws
    // and the arm words drawn anew for her (拍手, 摊手, 抱头, 举手, 点赞, 嘘, 擦汗), and expr2's faces with her drawn eyes and
    // drool mouth (翻白眼, 震惊, 死鱼眼, 流口水)
    expect(m.vocab.length).toBe(92 + Object.keys(PLUS_MIXES).length);
    for (const id of ['eyeroll', 'shocked', 'deadpan', 'drool']) expect(m.vocab.some((w) => w.id === id), id).toBe(true);
    // (each with a sound of its own the pack ships)
    expect(m.vocab.filter((w) => NEW_ARM_WORDS.includes(w.id)).map((w) => w.names.zh[0])).toEqual(['拍手', '摊手', '抱头', '举手', '点赞', '嘘', '擦汗']);
    for (const t of NEW_ARM_WORDS) { expect(upstreamTones, t).not.toContain(t); expect(Object.keys(m.sounds), t).toContain(t); }
    for (const t of ['tick', 'pop', 'hmm', 'surprised']) { expect(upstreamTones, t).toContain(t); expect(Object.keys(m.sounds), t).not.toContain(t); }
    for (const id of ['droop', 'blink', 'closer', 'leanback', 'sway', 'stamp']) expect(m.vocab.some((w) => w.id === id), id).toBe(true);
    // (托腮's "hm" is upstream's look tone too; the girls' fist, notebook and fingertips have no drawing of hers)
    expect(m.vocab.find((w) => w.id === 'muse')).toMatchObject({ kind: 'motion', names: { zh: ['托腮', '撑下巴', '托下巴', '琢磨'] } });
    for (const id of ['fist', 'jot', 'twiddle']) expect(m.vocab.some((w) => w.id === id), id).toBe(false);
    // (the tilt's "hm?" is upstream's own look tone: no sound file for it)
    expect(m.vocab.find((w) => w.id === 'tilt')).toMatchObject({ kind: 'motion', names: { zh: ['歪头', '歪脑袋', '偏头', '好奇'] } });
    expect(upstreamTones).toContain('look');
    // the head's and body's moves (低头, 眨眨眼, 凑近, 后仰, 晃来晃去, 跺脚) go too, with sounds upstream has or the pack ships
    // already (peek's hum, the dance's tune, a landing's thud): no new sound files
    expect(m.vocab.filter((w) => ['droop', 'blink', 'closer', 'leanback', 'sway', 'stamp'].includes(w.id)).map((w) => w.names.zh[0]).sort())
      .toEqual(['低头', '眨眨眼', '凑近', '后仰', '晃来晃去', '跺脚'].sort());
    for (const t of ['dance', 'land']) expect(Object.keys(m.sounds)).not.toContain(t);
    expect(Object.keys(m.sounds)).toContain('peek');
    // her tail's word (摇尾巴) goes too, with its swishes; the ears' and wings' she has no part for
    expect(m.vocab.find((w) => w.id === 'wag')).toMatchObject({ kind: 'motion', names: { zh: ['摇尾巴', '甩尾巴', '摆尾巴'] } });
    expect(Object.keys(m.sounds)).toContain('wag');
    for (const id of ['earflick', 'earsup', 'earsdown', 'wingbeat']) expect(m.vocab.some((w) => w.id === id), id).toBe(false);
    expect(m.vocab.filter((w) => w.id in PLUS_MIXES).map((w) => w.kind)).toEqual(Object.keys(PLUS_MIXES).map(() => 'expression'));
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
    expect(read.vocab.length).toBe(m.vocab.length);

    // and upstream's own packs.ts, when git has it
    if (fromGit) {
      // (inside the project: vitest cannot load a module from Windows' temp dir, whose 8.3 name RUNNER~1 it mangles)
      const up = fileURLToPath(new URL('../node_modules/.cache/upstream-packs-whale/', import.meta.url));
      mkdirSync(up, { recursive: true });
      for (const f of ['packs.ts', 'script.ts']) {
        writeFileSync(join(up, f), execFileSync('git', ['show', `${UPSTREAM_REF}:packages/cortico-world-desktop-pet/src/${f}`], { encoding: 'utf8' }));
      }
      const upstream = await import(pathToFileURL(join(up, 'packs.ts')).href);
      const gaps = [];
      const r = upstream.readManifest(dir, false, gaps);
      expect(typeof r === 'string' ? r : null).toBeNull();
      // (upstream leaves keepsArms out: its World sends the kneel and a wave one by one, and the bundled kit keeps the kneel)
      expect(r.vocab.find((w) => w.id === 'kneel')).not.toHaveProperty('keepsArms');
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
      const specs = [
        ...src.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm), // import … from, export … from
        ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm), // import 'x'
        ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g), // import('x')
      ];
      expect(src).not.toMatch(/\bimport\(\s*[^'"\s]/); // no computed dynamic imports
      for (const [, spec] of specs) {
        expect(spec.startsWith('.')).toBe(true);
        expect(to).toContain(posix.normalize(posix.join(posix.dirname(mod), spec)));
      }
    }
    const whale = builtin('whale');
    for (const t of [whale.thumb, ...whale.axes.flatMap((a) => a.options.map((o) => o.thumb)), ...whale.presets.map((p) => p.thumb)]) expect(to).toContain(t);
    const model = JSON.parse(readFileSync(new URL('web/whale/model.json', PKG), 'utf8'));
    for (const sc of model.schemes.slice(1)) {
      expect(to).toContain(`schemes/${sc.id}/tex/kneel_body.png`);
      expect(to).toContain(`schemes/${sc.id}/tex/kneel_low.png`);
      // the live faces on the kneeling and lying drawings: the blank face, and each dress's own hair over it
      for (const n of ['kneel_blank', 'kneel_fringe', 'lie_blank', 'lie_fringe']) expect(to).toContain(`schemes/${sc.id}/tex/${n}.png`);
      expect(to).toContain(`schemes/${sc.id}/feat/eyeL_iris.png`);
      // expr2's drawn eyes and drool mouth, recoloured for every dress
      for (const n of ['eyeroll_eyeL', 'shocked_eyeR', 'deadpan_eyeL', 'drool_mouth']) expect(to).toContain(`schemes/${sc.id}/feat/${n}.png`);
    }
    for (const p of model.parts) expect(to).toContain(`tex/${p.tex}.png`);
    for (const n of ['kneel_blank', 'kneel_fringe', 'lie_blank', 'lie_fringe']) expect(to).toContain(`tex/${n}.png`);
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
