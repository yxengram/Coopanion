// The five exported packs (pnpm run export:whale / claude / gpt / gemini / grok) against upstream's current release, not
// only v0.1.17 (each *-pack-export.test.js): upstream's own readManifest and scanPacks at that release
// (tests/helpers/upstream-packs.js) read every manifest without a problem, with every word and sound kept, next to
// upstream's own built-in figures. Skips without the release's ref locally; on CI the workflow fetches it.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { encodeWav } from '../packages/cortico-world-desktop-pet/scripts/export-pack.mjs';
import * as whale from '../packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs';
import * as claude from '../packages/cortico-world-desktop-pet/scripts/export-claude-pack.mjs';
import * as gpt from '../packages/cortico-world-desktop-pet/scripts/export-gpt-pack.mjs';
import * as gemini from '../packages/cortico-world-desktop-pet/scripts/export-gemini-pack.mjs';
import * as grok from '../packages/cortico-world-desktop-pet/scripts/export-grok-pack.mjs';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { TONES } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { UPSTREAM_RELEASE, upstreamPacks } from './helpers/upstream-packs.js';

const EXPORTERS = [whale, claude, gpt, gemini, grok];
const upstreamTones = TONES.filter((t) => !t.plus).map((t) => t.name);
const upstream = await upstreamPacks('upstream-packs-release');

/** Every scratch directory made here, removed after the tests. */
const scratch = [];
const tempDir = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); scratch.push(d); return d; };
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

/** The manifest written into `<root>/<id>/` with a stand-in file for every sound, as an installed pack. */
function writePack(root, m) {
  const dir = join(root, m.id);
  mkdirSync(dir);
  writeFileSync(join(dir, 'figure.json'), JSON.stringify(m));
  for (const s of Object.values(m.sounds)) {
    mkdirSync(dirname(join(dir, s.file)), { recursive: true });
    writeFileSync(join(dir, s.file), encodeWav(new Float32Array(8)));
  }
  return dir;
}

describe.skipIf(!upstream)(`exported packs in upstream ${UPSTREAM_RELEASE}`, () => {
  it('copies upstream\'s pack reader with the modules it loads', () => {
    expect(upstream.modules).toContain('packs.ts');
    expect(upstream.modules).toContain('script.ts');
    // upstream's own figures at the release: an exported pack must not take one of their ids
    expect(upstream.builtinIds).toEqual(expect.arrayContaining(['coo', 'whale']));
  });

  it.each(EXPORTERS.map((e) => [e.PACK_ID, e]))('%s: upstream reads the manifest whole, words and sounds', async (id, exporter) => {
    const m = await exporter.buildManifest({ upstreamTones, volumes: { song: .05 } });
    expect(m.id).toBe(id);
    expect(upstream.builtinIds).not.toContain(m.id);
    const root = tempDir(`${id}-upstream-`);
    const dir = writePack(root, m);
    // ours first: the same manifest passes our own World
    const ours = readManifest(dir, false, []);
    expect(typeof ours === 'string' ? ours : null).toBeNull();

    const gaps = [];
    const r = upstream.readManifest(dir, false, gaps);
    expect(typeof r === 'string' ? r : null).toBeNull();
    expect(gaps).toEqual([]);
    expect(r).toMatchObject({ id: m.id, entry: m.entry, export: m.export, model: m.model, name: m.name });
    expect(r.vocab.map((w) => w.id)).toEqual(m.vocab.map((w) => w.id));
    expect(Object.keys(r.sounds).sort()).toEqual(Object.keys(m.sounds).sort());
    expect(r.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual(m.axes.map((a) => [a.id, a.options.map((o) => o.id)]));
    expect(r.presets.map((p) => p.id)).toEqual(m.presets.map((p) => p.id));
    // a lasting word stays lasting there (the kneel)
    for (const w of m.vocab.filter((v) => v.lasting)) expect(r.vocab.find((v) => v.id === w.id), w.id).toMatchObject({ lasting: true });

    // installed next to upstream's own built-ins
    const scan = upstream.scanPacks(upstream.builtins(tempDir('upstream-builtins-')), [root]);
    expect(scan.problems).toEqual([]);
    expect(scan.packs.map((p) => p.id)).toEqual([...upstream.builtinIds, m.id]);
    expect(scan.packs.find((p) => p.id === m.id)).toMatchObject({ builtin: false, base: `/packs/${m.id}/` });
  });

  it('all five installed together: no clash between them', async () => {
    const root = tempDir('packs-upstream-');
    for (const e of EXPORTERS) writePack(root, await e.buildManifest({ upstreamTones }));
    const scan = upstream.scanPacks([], [root]);
    expect(scan.problems).toEqual([]);
    expect(scan.packs.map((p) => p.id).sort()).toEqual(EXPORTERS.map((e) => e.PACK_ID).sort());
  });
});
