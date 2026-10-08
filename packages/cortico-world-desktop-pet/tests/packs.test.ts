import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_ALIASES, figureOf, figurePacks, lookOf, lookPatch, packFor, readManifest, unaliasSkin } from '../src/packs.ts';

function pack(manifest: Record<string, unknown>, files: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  writeFileSync(join(dir, 'figure.json'), JSON.stringify(manifest));
  for (const f of files) writeFileSync(join(dir, f), '');
  return dir;
}
const word = { id: 'beep', kind: 'motion', names: { zh: ['哔'] }, about: { zh: '亮一下灯' }, seconds: 1 };
const base = { manifest: 2, api: 2, id: 'robot', name: { zh: '机器人' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [], vocab: [word] };

describe('figure packs', () => {
  it('reads the built-in Coo, whale, Claude-chan, GPT-chan and Gemini-chan', () => {
    const { packs, problems } = figurePacks([]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']);
    expect(packs.every((p) => p.builtin)).toBe(true);
    expect(packs.find((p) => p.id === 'claude-chan')).toMatchObject({ base: '/web/claude-chan/', manifest: { export: 'createClaudeBody', model: 'model.json' } });
    expect(packs.find((p) => p.id === 'gpt-chan')).toMatchObject({ base: '/web/gpt-chan/', manifest: { export: 'createGptBody', model: 'model.json' } });
    expect(packs.find((p) => p.id === 'gemini-chan')).toMatchObject({ base: '/web/gemini-chan/', manifest: { export: 'createGeminiBody', model: 'model.json' } });
  });

  it('Claude-chan has one scheme, original, with settings-window colours, credited to the character\'s designer, and no alias', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'claude-chan')!.manifest;
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']]]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original' }, accent: '#D97757' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'claude-chan')).toMatchObject({ id: 'claude-chan', builtin: true });
    const skin = { figure: 'claude-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('GPT-chan has one scheme, original, with settings-window colours, credited to the character\'s designer', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'gpt-chan')!.manifest;
    expect(m.name).toEqual({ zh: 'GPT 娘', en: 'GPT-chan' });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']]]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original' }, accent: '#7A8FA8' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'gpt-chan')).toMatchObject({ id: 'gpt-chan', builtin: true });
    const skin = { figure: 'gpt-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('Gemini-chan has one scheme, original, with settings-window colours, credited to the character\'s designer', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'gemini-chan')!.manifest;
    expect(m.name).toEqual({ zh: 'Gemini 娘', en: 'Gemini-chan' });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']]]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original' }, accent: '#7B5CD6' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'gemini-chan')).toMatchObject({ id: 'gemini-chan', builtin: true });
    const skin = { figure: 'gemini-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('refuses a pack whose files lie outside it', () => {
    expect(readManifest(pack({ ...base, entry: '../../web/pet-app.js' }))).toMatch(/entry/);
    expect(readManifest(pack({ ...base, model: 'C:/secrets.json' }))).toMatch(/model/);
    expect(readManifest(pack({ ...base, sounds: { boing: { file: '../boing.ogg', kind: 'move' } } }))).toMatch(/sounds/);
  });

  it('a built-in id is not taken over by an installed pack, Coo\'s included', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    for (const id of ['whale', 'coo', 'claude-chan', 'gpt-chan', 'gemini-chan']) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'figure.json'), JSON.stringify({ ...base, id }));
    }
    const { packs, problems } = figurePacks([root]);
    expect(packs.filter((p) => ['whale', 'coo', 'claude-chan', 'gpt-chan', 'gemini-chan'].includes(p.id)).map((p) => p.builtin)).toEqual([true, true, true, true, true]);
    expect(problems).toHaveLength(5);
  });

  it('takes our whale exported as a pack for the built-in whale: not listed, and a skin naming it shows the built-in', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    mkdirSync(join(root, 'export'));
    writeFileSync(join(root, 'export', 'figure.json'), JSON.stringify({ ...base, id: 'coopanion-whale' }));
    const { packs, problems } = figurePacks([root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']);
    expect(packFor(packs, 'coopanion-whale')).toMatchObject({ id: 'whale', builtin: true });
    expect(unaliasSkin({ figure: 'coopanion-whale', scheme: 'claude' })).toEqual({ figure: 'whale', scheme: 'claude' });
    const skin = { figure: 'robot', scheme: '' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('takes our Claude-chan exported as a pack for the built-in one, next to the exported whale', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    for (const id of ['coopanion-claude-chan', 'coopanion-whale']) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'figure.json'), JSON.stringify({ ...base, id }));
    }
    const { packs, problems } = figurePacks([root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']);
    expect(PACK_ALIASES).toEqual({
      'coopanion-whale': 'whale', 'coopanion-claude-chan': 'claude-chan', 'coopanion-gpt-chan': 'gpt-chan', 'coopanion-gemini-chan': 'gemini-chan',
    });
    expect(figureOf('coopanion-claude-chan')).toBe('claude-chan');
    expect(packFor(packs, 'coopanion-claude-chan')).toMatchObject({ id: 'claude-chan', builtin: true, base: '/web/claude-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-claude-chan', scheme: 'original' })).toEqual({ figure: 'claude-chan', scheme: 'original' });
    expect(lookOf(packFor(packs, 'coopanion-claude-chan')!, { scheme: 'original' })).toBe('original');
  });

  it('takes our GPT-chan exported as a pack for the built-in one, next to the other exports', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    for (const id of ['coopanion-gpt-chan', 'coopanion-claude-chan', 'coopanion-whale', 'coopanion-gemini-chan']) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'figure.json'), JSON.stringify({ ...base, id }));
    }
    const { packs, problems } = figurePacks([root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']);
    expect(figureOf('coopanion-gpt-chan')).toBe('gpt-chan');
    expect(packFor(packs, 'coopanion-gpt-chan')).toMatchObject({ id: 'gpt-chan', builtin: true, base: '/web/gpt-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-gpt-chan', scheme: 'original' })).toEqual({ figure: 'gpt-chan', scheme: 'original' });
    expect(lookOf(packFor(packs, 'coopanion-gpt-chan')!, { scheme: 'original' })).toBe('original');
    expect(figureOf('coopanion-gemini-chan')).toBe('gemini-chan');
    expect(packFor(packs, 'coopanion-gemini-chan')).toMatchObject({ id: 'gemini-chan', builtin: true, base: '/web/gemini-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-gemini-chan', scheme: 'original' })).toEqual({ figure: 'gemini-chan', scheme: 'original' });
  });

  it('Coo and the whale know the same 72 words, Claude-chan, GPT-chan and Gemini-chan all but spout, sit, sleep, lie and kneel lasting', () => {
    const { packs } = figurePacks([]);
    const [coo, whale, claude, gpt, gemini] = ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan'].map((id) => packs.find((p) => p.id === id)!.manifest.vocab);
    expect(coo!.map((w) => w.id)).toEqual(whale!.map((w) => w.id));
    expect(coo).toHaveLength(72);
    expect(coo!.filter((w) => w.kind === 'expression')).toHaveLength(28);
    expect(claude!.map((w) => w.id)).toEqual(whale!.map((w) => w.id).filter((id) => id !== 'spout'));
    expect(claude!.map((w) => [w.id, w.seconds])).toEqual(whale!.filter((w) => w.id !== 'spout').map((w) => [w.id, w.seconds]));
    // her words say what she does, nothing of the whale's body
    expect(JSON.stringify(claude)).not.toMatch(/鲸|鳍|尾巴|呆毛|围裙|喷水/);
    // GPT-chan's the same words, said of her (wings and a tail, no fins; a book only to read, standing or lying)
    expect(gpt!.map((w) => [w.id, w.seconds, w.lasting])).toEqual(claude!.map((w) => [w.id, w.seconds, w.lasting]));
    expect(gpt!.map((w) => w.names)).toEqual(claude!.map((w) => w.names));
    expect(JSON.stringify(gpt)).not.toMatch(/鲸|鳍|围裙|喷水/);
    expect(gpt!.filter((w) => /书/.test(w.about.zh!)).map((w) => w.id)).toEqual(['lie', 'read']);
    // Gemini-chan's the same words, said of her (cat ears and a tail, no wings or fins; a book only to read)
    expect(gemini!.map((w) => [w.id, w.seconds, w.lasting])).toEqual(claude!.map((w) => [w.id, w.seconds, w.lasting]));
    expect(gemini!.map((w) => w.names)).toEqual(claude!.map((w) => w.names));
    expect(JSON.stringify(gemini)).not.toMatch(/鲸|鳍|围裙|喷水|龙|翅膀|翼/);
    expect(gemini!.filter((w) => /书/.test(w.about.zh!)).map((w) => w.id)).toEqual(['read']);
    for (const v of [coo!, whale!, claude!, gpt!, gemini!]) expect(v.filter((w) => w.lasting).map((w) => w.id).sort()).toEqual(['kneel', 'lie', 'sit', 'sleep']);
    expect(coo!.find((w) => w.id === 'petrify')!.seconds).toBe(3.2);
  });

  it('refuses a word name a script could never write: a marker\'s separator in it, longer than an inline marker, or naming two words', () => {
    expect(readManifest(pack({ ...base, vocab: [{ ...word, names: { zh: ['哔 哔'] } }] }))).toMatch(/名字/);
    expect(readManifest(pack({ ...base, vocab: [{ ...word, names: { zh: ['哔'.repeat(33)] } }] }))).toMatch(/名字/);
    expect(readManifest(pack({ ...base, vocab: [word, { ...word, id: 'boop' }] }))).toMatch(/不止一个词/);
  });

  it('files a pack\'s sound under a body\'s kind only, and leaves out one whose file is not there', () => {
    expect(readManifest(pack({ ...base, sounds: { boing: { file: 'boing.ogg', kind: 'ui' } } }, ['boing.ogg']))).toMatch(/kind/);
    const missing: string[] = [];
    const m = readManifest(pack({ ...base, sounds: { boing: { file: 'boing.ogg', kind: 'move' }, clunk: { file: 'clunk.wav', kind: 'touch' } } }, ['boing.ogg']), false, missing);
    if (typeof m === 'string') throw new Error(m);
    expect(Object.keys(m.sounds)).toEqual(['boing']);
    expect(missing).toHaveLength(1);
  });

  it('Coo\'s pick is its skin\'s own fields, a pack\'s is the scheme', () => {
    const { packs } = figurePacks([]);
    const coo = packs.find((p) => p.id === 'coo')!, whale = packs.find((p) => p.id === 'whale')!;
    const skin = { scheme: 'deepseek', palette: 'fox', head: 'cat', side: 'none', glasses: 'round', neck: 'none' };
    expect(lookOf(coo, skin)).toBe('fox-cat-none-round-none');
    expect(lookPatch(coo, 'mint-none-bow-none-bell')).toEqual({ palette: 'mint', head: 'none', side: 'bow', glasses: 'none', neck: 'bell' });
    expect(lookOf(whale, skin)).toBe('deepseek');
    expect(lookPatch(whale, 'claude')).toEqual({ scheme: 'claude' });
  });
});
