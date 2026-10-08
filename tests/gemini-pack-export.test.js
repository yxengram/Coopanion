// The exported Gemini-chan pack (packages/cortico-world-desktop-pet/scripts/export-gemini-pack.mjs): its manifest is
// built without rendering and checked with the World's readManifest and, when git has the pinned tag, with upstream
// v0.1.17's own packs.ts; the copied modules form a closed set (once her model.json is there); the alias maps an
// installed copy to the built-in.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PACK_ID, buildManifest, modules, packFiles, packReadme, packSounds, requestedTones,
} from '../packages/cortico-world-desktop-pet/scripts/export-gemini-pack.mjs';
import { PACK_ID as WHALE_ID } from '../packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs';
import { PACK_ID as CLAUDE_ID, packSounds as claudeSounds } from '../packages/cortico-world-desktop-pet/scripts/export-claude-pack.mjs';
import { PACK_ID as GPT_ID } from '../packages/cortico-world-desktop-pet/scripts/export-gpt-pack.mjs';
import { ROOT, UPSTREAM_REF, encodeWav, upstreamToneNames } from '../packages/cortico-world-desktop-pet/scripts/export-pack.mjs';
import { BUILTIN_PACKS, PACK_ALIASES, figureOf, figurePacks, packFor, readManifest, unaliasSkin } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { TONES } from '../packages/cortico-world-desktop-pet/web/sound.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const builtin = JSON.parse(readFileSync(new URL('web/gemini-chan/figure.json', PKG), 'utf8'));
// her model.json (and textures) come with her art: until then the file list cannot be made
const hasModel = existsSync(new URL('web/gemini-chan/model.json', PKG));
const upstreamTones = TONES.filter((t) => !t.plus).map((t) => t.name);
let fromGit = null;
try { fromGit = upstreamToneNames(UPSTREAM_REF); } catch { /* a shallow checkout may lack the tag */ }

/** The manifest written into `<root>/<id>/` with a stand-in file for every sound. */
function writePack(m) {
  const root = mkdtempSync(join(tmpdir(), 'gemini-pack-')), dir = join(root, m.id);
  mkdirSync(dir);
  writeFileSync(join(dir, 'figure.json'), JSON.stringify(m));
  for (const s of Object.values(m.sounds)) {
    mkdirSync(dirname(join(dir, s.file)), { recursive: true });
    writeFileSync(join(dir, s.file), encodeWav(new Float32Array(8)));
  }
  return { root, dir };
}

describe('exported Gemini-chan pack', () => {
  it('credits her design in its README exactly as the manifest does', async () => {
    const m = await buildManifest({ upstreamTones });
    const readme = packReadme(m, []);
    expect(m.credits[0].name).toBe('ZipZipPipe（Bilibili）');
    expect(readme).toContain(`角色设定是 ${m.credits[0].name}`);
    expect(readme).not.toContain('ZipZipPipe(');
  });

  it('ships every plus tone she can play, and none for the spout she lacks', async () => {
    const sounds = await packSounds({ upstreamTones });
    const names = sounds.map((s) => s.name);
    const plus = new Set(TONES.filter((t) => t.plus).map((t) => t.name));
    for (const n of names) expect(plus.has(n)).toBe(true);
    for (const n of requestedTones()) if (plus.has(n)) expect(names).toContain(n);
    for (const s of sounds) expect(['move', 'face']).toContain(s.kind);
    // her own words' tones: read turns a page, idea dings, petrify cracks, hug is soft, cover giggles
    expect(names).toEqual(expect.arrayContaining(['song', 'sip', 'page', 'roll', 'sigh', 'ding', 'crack', 'soft', 'hehe', 'wry', 'clink', 'snap', 'cheese']));
    expect(builtin.vocab.map((w) => w.id)).not.toContain('spout');
    expect(names).not.toContain('spout');
    // the same as Claude-chan's: the same kit and the same words
    expect(names).toEqual((await claudeSounds({ upstreamTones })).map((s) => s.name));
  });

  it('builds a manifest our World and upstream v0.1.17 accept', async () => {
    const m = await buildManifest({ upstreamTones, volumes: { song: .05 } });
    expect(m).toMatchObject({ manifest: 2, api: 2, id: PACK_ID, entry: 'gemini-chan/figure.js', export: 'createGeminiBody', model: 'model.json' });
    expect(PACK_ID).toBe('coopanion-gemini-chan');
    expect(m.name).toEqual({ zh: 'Gemini 娘', en: 'Gemini-chan' });
    const ids = BUILTIN_PACKS.map((b) => JSON.parse(readFileSync(join(b.dir, 'figure.json'), 'utf8')).id);
    expect(ids).not.toContain(m.id);
    expect([WHALE_ID, CLAUDE_ID, GPT_ID]).not.toContain(m.id);
    expect(m.vocab).toEqual(builtin.vocab);
    expect(m.vocab.length).toBe(builtin.vocab.length);
    expect(m.axes).toEqual(builtin.axes);
    expect(m.presets).toEqual(builtin.presets);
    expect(m.about).toEqual(builtin.about);
    expect(m.thumb).toBe(builtin.thumb);
    expect(m.credits).toEqual(expect.arrayContaining(builtin.credits));
    expect(m.credits[0]).toEqual({ role: '角色设定', name: 'ZipZipPipe（Bilibili）' });
    expect(JSON.stringify(m.credits)).toContain('https://github.com/yxengram/Coopanion');
    expect(m.license).toContain('AGPL-3.0-or-later');
    expect(m.license).toContain('非商业');
    for (const [name, s] of Object.entries(m.sounds)) {
      expect(s.file).toBe(`sounds/${name}.wav`);
      expect(['move', 'face']).toContain(s.kind);
    }
    expect(m.sounds.song.volume).toBe(.05);

    const { root, dir } = writePack(m);
    const missing = [];
    const read = readManifest(dir, false, missing);
    expect(typeof read === 'string' ? read : null).toBeNull();
    expect(missing).toEqual([]);
    expect(Object.keys(read.sounds).sort()).toEqual(Object.keys(m.sounds).sort());
    expect(read.vocab.length).toBe(builtin.vocab.length);

    // and upstream's own packs.ts (readManifest, its readVocab and readSounds, scanPacks) at the pinned tag
    if (fromGit) {
      const up = mkdtempSync(join(tmpdir(), 'upstream-packs-'));
      for (const f of ['packs.ts', 'script.ts']) {
        writeFileSync(join(up, f), execFileSync('git', ['show', `${UPSTREAM_REF}:packages/cortico-world-desktop-pet/src/${f}`], { cwd: ROOT, encoding: 'utf8' }));
      }
      const upstream = await import(pathToFileURL(join(up, 'packs.ts')).href);
      const gaps = [];
      const r = upstream.readManifest(dir, false, gaps);
      expect(typeof r === 'string' ? r : null).toBeNull();
      expect(gaps).toEqual([]);
      expect(r.vocab.map((w) => w.id)).toEqual(builtin.vocab.map((w) => w.id));
      const scan = upstream.scanPacks([], [root]);
      expect(scan.problems).toEqual([]);
      expect(scan.packs.map((p) => p.id)).toEqual([PACK_ID]);
      // next to upstream's own built-ins (their manifests at the tag): no id clash
      const builtins = ['coo', 'whale'].map((id) => {
        const d = join(up, id);
        mkdirSync(d);
        writeFileSync(join(d, 'figure.json'), execFileSync('git', ['show', `${UPSTREAM_REF}:packages/cortico-world-desktop-pet/web/${id}/figure.json`], { cwd: ROOT, encoding: 'utf8' }));
        return { dir: d, base: `/web/${id}/` };
      });
      const all = upstream.scanPacks(builtins, [root]);
      expect(all.problems).toEqual([]);
      expect(all.packs.map((p) => p.id)).toEqual(['coo', 'whale', PACK_ID]);
    }
  });

  it.skipIf(!hasModel)('copies a self-contained set of files: her modules, the kit, the model and every texture she loads', async () => {
    const files = await packFiles();
    const to = new Set(files.map((f) => f.to));
    expect(to.size).toBe(files.length);
    for (const f of files) {
      expect(() => statSync(f.from)).not.toThrow();
      expect(f.to.startsWith('/') || f.to.split('/').includes('..')).toBe(false);
    }
    const mods = modules();
    expect(new Set(mods)).toEqual(new Set(['gemini-chan/figure.js', 'gemini-chan/motion.js', 'gemini-chan/face.js', 'gemini-chan/fx.js', 'kit/body.js', 'kit/rig.js']));
    for (const p of [...mods, 'model.json', 'LICENSE']) expect(to).toContain(p);
    // every copied module imports only copied modules, by relative paths
    for (const mod of mods) {
      const src = readFileSync(files.find((f) => f.to === mod).from, 'utf8');
      const specs = [
        ...src.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm),
        ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
        ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g),
      ];
      expect(src).not.toMatch(/\bimport\(\s*[^'"\s]/);
      expect(src).not.toMatch(/\bfetch\(/); // the figure frame allows no connections
      for (const [, spec] of specs) {
        expect(spec.startsWith('.')).toBe(true);
        expect(mods).toContain(posix.normalize(posix.join(posix.dirname(mod), spec)));
      }
    }
    const model = JSON.parse(readFileSync(new URL('web/gemini-chan/model.json', PKG), 'utf8'));
    for (const p of model.parts) expect(to).toContain(`tex/${p.tex}.png`);
    for (const t of ['ear_l', 'ear_r', 'tail']) expect(to).toContain(`tex/${t}.png`);
    for (const t of [builtin.thumb, ...builtin.axes.flatMap((a) => a.options.map((o) => o.thumb)), ...builtin.presets.map((p) => p.thumb)]) expect(to).toContain(t);
    // every face drawing the model names (her eyes and mouths are drawn with strokes where there are none)
    for (const n of Object.keys(model.feat?.sprites ?? {})) expect(to).toContain(`feat/${n}.png`);
    // every pose drawing too
    for (const pose of Object.values(model.poses ?? {})) for (const p of [...(pose.required ?? []), ...(pose.overlays ?? [])]) expect(to).toContain(`tex/${p.tex}.png`);
    // what she loads before her first frame, well inside upstream's 20 s READY_MS from a local server
    const texBytes = files.filter((f) => /^(tex|feat)\//.test(f.to)).reduce((a, f) => a + statSync(f.from).size, 0);
    expect(texBytes).toBeLessThan(32 * 1048576);
  });

  it('an installed copy is the built-in Gemini-chan here: not listed, and a skin naming it shows the built-in', async () => {
    expect(PACK_ALIASES[PACK_ID]).toBe('gemini-chan');
    expect(figureOf(PACK_ID)).toBe('gemini-chan');
    const { root } = writePack(await buildManifest({ upstreamTones }));
    const { packs, problems } = figurePacks([root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']);
    expect(packFor(packs, PACK_ID)).toMatchObject({ id: 'gemini-chan', builtin: true });
    expect(unaliasSkin({ figure: PACK_ID, scheme: 'original' })).toEqual({ figure: 'gemini-chan', scheme: 'original' });
  });
});
