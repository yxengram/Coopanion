import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PACK_ALIASES, figureOf, figurePacks, lookOf, lookPatch, nameIn, packFor, readManifest, unaliasSkin } from '../src/packs.ts';
import { PackImporter, filesFromBundle, filesFromZip, segments, type ImportFile } from '../src/pack-import.ts';
import { PetServer } from '../src/server.ts';

function pack(manifest: Record<string, unknown>, files: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  writeFileSync(join(dir, 'figure.json'), JSON.stringify(manifest));
  for (const f of files) writeFileSync(join(dir, f), '');
  return dir;
}
const word = { id: 'beep', kind: 'motion', names: { zh: ['哔'] }, about: { zh: '亮一下灯' }, seconds: 1 };
const base = { manifest: 2, api: 2, id: 'robot', name: { zh: '机器人' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [], vocab: [word] };

describe('figure packs', () => {
  it('reads the built-in Coo, whale, Claude-chan, GPT-chan, Gemini-chan and Grok-chan', () => {
    const { packs, problems } = figurePacks([]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']);
    expect(packs.every((p) => p.builtin)).toBe(true);
    expect(packs.find((p) => p.id === 'claude-chan')).toMatchObject({ base: '/web/claude-chan/', manifest: { export: 'createClaudeBody', model: 'model.json' } });
    expect(packs.find((p) => p.id === 'gpt-chan')).toMatchObject({ base: '/web/gpt-chan/', manifest: { export: 'createGptBody', model: 'model.json' } });
    expect(packs.find((p) => p.id === 'gemini-chan')).toMatchObject({ base: '/web/gemini-chan/', manifest: { export: 'createGeminiBody', model: 'model.json' } });
    expect(packs.find((p) => p.id === 'grok-chan')).toMatchObject({ base: '/web/grok-chan/', manifest: { export: 'createGrokBody', model: 'model.json' } });
  });

  it('the whale has two axes, 配色 (eight schemes) and 服装 (the maid dress and the winter outfit), every preset in the maid dress', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'whale')!.manifest;
    expect(m.axes.map((a) => [a.id, a.options.length])).toEqual([['scheme', 8], ['outfit', 2]]);
    expect(m.axes[1]!.options.map((o) => [o.id, o.thumb])).toEqual([['maid', 'thumbs/maid.png'], ['cape', 'thumbs/cape.png']]);
    expect(m.presets).toHaveLength(8);
    for (const p of m.presets) expect(p.pick).toEqual({ scheme: p.id, outfit: 'maid' });
  });

  it('Claude-chan has one scheme, original, two outfits (常服, 冬装), with settings-window colours, credited to the character\'s designer, and no alias', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'claude-chan')!.manifest;
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']], ['outfit', ['classic', 'winter']]]);
    expect(m.axes[1]!.options.map((o) => [nameIn(o.name), o.thumb])).toEqual([['常服', 'thumbs/classic.png'], ['冬装', 'thumbs/winter.png']]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original', outfit: 'classic' }, accent: '#D97757' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'claude-chan')).toMatchObject({ id: 'claude-chan', builtin: true });
    const skin = { figure: 'claude-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('GPT-chan has one scheme, original, two outfits (常服, 冬装), with settings-window colours, credited to the character\'s designer', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'gpt-chan')!.manifest;
    expect(m.name).toEqual({ zh: 'GPT 娘', en: 'GPT-chan' });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']], ['outfit', ['classic', 'winter']]]);
    expect(m.axes[1]!.options.map((o) => [nameIn(o.name), o.thumb])).toEqual([['常服', 'thumbs/classic.png'], ['冬装', 'thumbs/winter.png']]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original', outfit: 'classic' }, accent: '#7A8FA8' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'gpt-chan')).toMatchObject({ id: 'gpt-chan', builtin: true });
    const skin = { figure: 'gpt-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('Gemini-chan has one scheme, original, two outfits (常服, 冬装), with settings-window colours, credited to the character\'s designer', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'gemini-chan')!.manifest;
    expect(m.name).toEqual({ zh: 'Gemini 娘', en: 'Gemini-chan' });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']], ['outfit', ['classic', 'winter']]]);
    expect(m.axes[1]!.options.map((o) => [nameIn(o.name), o.thumb])).toEqual([['常服', 'thumbs/classic.png'], ['冬装', 'thumbs/winter.png']]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original', outfit: 'classic' }, accent: '#7B5CD6' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'gemini-chan')).toMatchObject({ id: 'gemini-chan', builtin: true });
    const skin = { figure: 'gemini-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('Grok-chan has one scheme, original, two outfits (常服, 冬装), with settings-window colours, credited to the character\'s designer', () => {
    const { packs } = figurePacks([]);
    const m = packs.find((p) => p.id === 'grok-chan')!.manifest;
    expect(m.name).toEqual({ zh: 'Grok 娘', en: 'Grok-chan' });
    expect(m.axes.map((a) => [a.id, a.options.map((o) => o.id)])).toEqual([['scheme', ['original']], ['outfit', ['classic', 'winter']]]);
    expect(m.axes[1]!.options.map((o) => [nameIn(o.name), o.thumb])).toEqual([['常服', 'thumbs/classic.png'], ['冬装', 'thumbs/winter.png']]);
    expect(m.presets).toHaveLength(1);
    expect(m.presets[0]).toMatchObject({ id: 'original', pick: { scheme: 'original', outfit: 'classic' }, accent: '#A3304A' });
    expect(Object.keys(m.presets[0]!.console!)).toEqual(['light', 'dark']);
    expect(m.credits).toEqual([{ role: '角色设定', name: 'ZipZipPipe（Bilibili）' }]);
    expect(packFor(packs, 'grok-chan')).toMatchObject({ id: 'grok-chan', builtin: true });
    const skin = { figure: 'grok-chan', scheme: 'original' };
    expect(unaliasSkin(skin)).toBe(skin);
  });

  it('refuses a pack whose files lie outside it', () => {
    expect(readManifest(pack({ ...base, entry: '../../web/pet-app.js' }))).toMatch(/entry/);
    expect(readManifest(pack({ ...base, model: 'C:/secrets.json' }))).toMatch(/model/);
    expect(readManifest(pack({ ...base, sounds: { boing: { file: '../boing.ogg', kind: 'move' } } }))).toMatch(/sounds/);
  });

  it('refuses a file path holding markup characters or a control character', () => {
    const markup = 't.png"><iframe src="x.html"></iframe>';
    expect(readManifest(pack({ ...base, thumb: markup }))).toMatch(/thumb/);
    expect(readManifest(pack({ ...base, thumb: 'a<b.png' }))).toMatch(/thumb/);
    expect(readManifest(pack({ ...base, entry: 'figure\n.js' }))).toMatch(/entry/);
    const axis = { id: 'tone', name: { zh: '色调' }, options: [{ id: 'day', name: { zh: '白天' }, thumb: markup }] };
    expect(readManifest(pack({ ...base, axes: [axis] }))).toMatch(/day/);
    const fine = { ...axis, options: [{ ...axis.options[0], thumb: 'day.png' }] };
    expect(readManifest(pack({ ...base, axes: [fine], presets: [{ id: 'dawn', pick: { tone: 'day' }, thumb: markup }] }))).toMatch(/dawn/);
    // an ordinary path, sub-folder and all, still goes
    expect(typeof readManifest(pack({ ...base, axes: [fine], presets: [{ id: 'dawn', pick: { tone: 'day' }, thumb: 'thumbs/dawn 1.png' }] }))).toBe('object');
  });

  it('a built-in id is not taken over by an installed pack, Coo\'s included', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    for (const id of ['whale', 'coo', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'figure.json'), JSON.stringify({ ...base, id }));
    }
    const { packs, problems } = figurePacks([root]);
    expect(packs.filter((p) => ['whale', 'coo', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan'].includes(p.id)).map((p) => p.builtin)).toEqual([true, true, true, true, true, true]);
    expect(problems).toHaveLength(6);
  });

  it('takes our whale exported as a pack for the built-in whale: not listed, and a skin naming it shows the built-in', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    mkdirSync(join(root, 'export'));
    writeFileSync(join(root, 'export', 'figure.json'), JSON.stringify({ ...base, id: 'coopanion-whale' }));
    const { packs, problems } = figurePacks([root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']);
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
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']);
    expect(PACK_ALIASES).toEqual({
      'coopanion-whale': 'whale', 'coopanion-claude-chan': 'claude-chan', 'coopanion-gpt-chan': 'gpt-chan', 'coopanion-gemini-chan': 'gemini-chan',
      'coopanion-grok-chan': 'grok-chan',
    });
    expect(figureOf('coopanion-claude-chan')).toBe('claude-chan');
    expect(packFor(packs, 'coopanion-claude-chan')).toMatchObject({ id: 'claude-chan', builtin: true, base: '/web/claude-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-claude-chan', scheme: 'original' })).toEqual({ figure: 'claude-chan', scheme: 'original' });
    expect(lookOf(packFor(packs, 'coopanion-claude-chan')!, { scheme: 'original' })).toBe('original');
  });

  it('takes our GPT-chan exported as a pack for the built-in one, next to the other exports', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    for (const id of ['coopanion-gpt-chan', 'coopanion-claude-chan', 'coopanion-whale', 'coopanion-gemini-chan', 'coopanion-grok-chan']) {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, 'figure.json'), JSON.stringify({ ...base, id }));
    }
    const { packs, problems } = figurePacks([root]);
    expect(problems).toEqual([]);
    expect(packs.map((p) => p.id)).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']);
    expect(figureOf('coopanion-gpt-chan')).toBe('gpt-chan');
    expect(packFor(packs, 'coopanion-gpt-chan')).toMatchObject({ id: 'gpt-chan', builtin: true, base: '/web/gpt-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-gpt-chan', scheme: 'original' })).toEqual({ figure: 'gpt-chan', scheme: 'original' });
    expect(lookOf(packFor(packs, 'coopanion-gpt-chan')!, { scheme: 'original' })).toBe('original');
    expect(figureOf('coopanion-gemini-chan')).toBe('gemini-chan');
    expect(packFor(packs, 'coopanion-gemini-chan')).toMatchObject({ id: 'gemini-chan', builtin: true, base: '/web/gemini-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-gemini-chan', scheme: 'original' })).toEqual({ figure: 'gemini-chan', scheme: 'original' });
    expect(figureOf('coopanion-grok-chan')).toBe('grok-chan');
    expect(packFor(packs, 'coopanion-grok-chan')).toMatchObject({ id: 'grok-chan', builtin: true, base: '/web/grok-chan/' });
    expect(unaliasSkin({ figure: 'coopanion-grok-chan', scheme: 'original' })).toEqual({ figure: 'grok-chan', scheme: 'original' });
  });

  it('Coo knows 108 words (77 and 31 faces made of parts), the whale those, her chin on her hand, her fist, notebook and fingertips, ten moves of the head and body, seven arm words drawn anew, 抹眼泪, 双手捂脸, 摸摸头 and a wag of her tail (133), Claude-chan, GPT-chan, Gemini-chan and Grok-chan all but spout and the wag, and their 哎呀 (132), GPT-chan her tail\'s and wings\' (134), Gemini-chan her tail\'s (and its puff) and ears\' (137), Grok-chan her little wings\' (133), sit, sleep, lie and kneel lasting', () => {
    const { packs } = figurePacks([]);
    let [coo, whale, claude, gpt, gemini, grok] = ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan'].map((id) => packs.find((p) => p.id === id)!.manifest.vocab);
    // (the faces' arm poses as words of their own: drawn by the whale and the girls (all four), not by Coo;
    // the moves of the head and body (低头, 眨眨眼, 凑近, 后仰, 晃来晃去, 跺脚; 抬头, 喘气, 闭眼, 打喷嚏): the whale and the girls, not Coo)
    const POSES = ['muse', 'fist', 'jot', 'twiddle'];
    const MORE = ['droop', 'blink', 'closer', 'leanback', 'sway', 'stamp', 'lookup', 'pant', 'closeeyes', 'sneeze'];
    // (the arm words drawn anew, 拍手, 摊手, 抱头, 举手, 点赞, 嘘, 擦汗: the whale and the girls, not Coo)
    const NEW_ARMS = ['clap', 'shrug', 'headhold', 'raise', 'thumbs', 'shush', 'wipe'];
    // (the vocabulary batch's arm words, 抹眼泪, 双手捂脸, 摸摸头: the whale and the girls, not Coo; right after 擦汗 (the
    // girls: after their 哎呀), with the same names and seconds in all five)
    const VOCAB_ARMS = ['weep', 'hideface', 'pat'];
    // (the moves of a tail, ears or wings: each figure those of the parts she has)
    // (炸毛, the puff of a cat's tail: Gemini-chan's alone)
    const PARTS = ['wag', 'puff', 'earflick', 'earsup', 'earsdown', 'wingbeat'];
    const parts = (v: typeof coo) => v!.filter((w) => PARTS.includes(w.id)).map((w) => w.id);
    expect([coo, whale, claude, gpt, gemini, grok].map(parts)).toEqual([[], ['wag'], [], ['wag', 'wingbeat'], ['wag', 'puff', 'earflick', 'earsup', 'earsdown'], ['wingbeat']]);
    // (哎呀, the girls' flinch arms as a word of its own, right after 擦汗: the four girls only, the drawing is theirs)
    const GIRLS_ONLY = ['oops'];
    for (const v of [claude, gpt, gemini, grok]) {
      const ids = v!.map((w) => w.id);
      expect(ids[ids.indexOf('wipe') + 1]).toBe('oops');
      expect(v!.find((w) => w.id === 'oops')!.names.zh).toEqual(['哎呀', '糟了', '闯祸了']);
    }
    for (const v of [coo, whale]) expect(v!.some((w) => w.id === 'oops')).toBe(false);
    for (const v of [whale, claude, gpt, gemini, grok]) {
      const ids = v!.map((w) => w.id), after = v === whale ? 'wipe' : 'oops';
      expect(ids.slice(ids.indexOf(after) + 1, ids.indexOf(after) + 4)).toEqual(VOCAB_ARMS);
      expect(VOCAB_ARMS.map((id) => v!.find((w) => w.id === id)!.names.zh)).toEqual([['抹眼泪', '擦眼泪', '抹泪'], ['双手捂脸', '捂脸', '不敢看', '羞死了'], ['摸摸头', '摸摸', '乖']]);
      expect(VOCAB_ARMS.map((id) => v!.find((w) => w.id === id)!.seconds)).toEqual([2.5, 2.5, 2.3]);
    }
    expect(coo!.some((w) => VOCAB_ARMS.includes(w.id))).toBe(false);
    [coo, whale, claude, gpt, gemini, grok] = [coo, whale, claude, gpt, gemini, grok].map((v) => v!.filter((w) => !PARTS.includes(w.id) && !GIRLS_ONLY.includes(w.id)));
    expect(coo!.map((w) => w.id)).toEqual(whale!.map((w) => w.id).filter((id) => !POSES.includes(id) && !MORE.includes(id) && !NEW_ARMS.includes(id) && !VOCAB_ARMS.includes(id)));
    for (const v of [whale, claude, gpt, gemini, grok]) expect(v!.filter((w) => NEW_ARMS.includes(w.id)).map((w) => w.id)).toEqual(NEW_ARMS);
    expect(whale!.filter((w) => MORE.includes(w.id)).map((w) => w.id).sort()).toEqual([...MORE].sort());
    expect(claude!.filter((w) => MORE.includes(w.id)).map((w) => w.id).sort()).toEqual([...MORE].sort());
    expect(coo).toHaveLength(108);
    expect(whale).toHaveLength(132);
    expect(claude).toHaveLength(131);
    expect([gpt, gemini, grok].map((v) => v!.length)).toEqual([131, 131, 131]);
    expect(['whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan'].map((id) => packs.find((p) => p.id === id)!.manifest.vocab.length)).toEqual([133, 132, 134, 137, 133]);
    // (the four head moves after 眨眨眼, each with its names, in the whale and every girl)
    for (const v of [whale, claude, gpt, gemini, grok]) {
      const ids = v!.map((w) => w.id);
      expect(ids.slice(ids.indexOf('blink') + 1, ids.indexOf('blink') + 5)).toEqual(['lookup', 'pant', 'closeeyes', 'sneeze']);
      expect(['lookup', 'pant', 'closeeyes', 'sneeze'].map((id) => v!.find((w) => w.id === id)!.names.zh))
        .toEqual([['抬头', '抬眼', '看向你'], ['喘气', '气喘吁吁', '累了'], ['闭眼', '闭上眼睛', '合上眼'], ['打喷嚏', '阿嚏', '喷嚏']]);
    }
    expect(coo!.filter((w) => w.kind === 'expression')).toHaveLength(63);
    // (expr2's four faces, in every pack after giggle, and 眯眼笑 a name of happy; 笑 and 笑眯眯 too, from the evals'
    // skipped words, after the names it had)
    for (const v of [coo, whale, claude, gpt, gemini, grok]) {
      const ids = v!.map((w) => w.id);
      expect(ids.slice(ids.indexOf('giggle') + 1, ids.indexOf('giggle') + 5)).toEqual(['eyeroll', 'shocked', 'deadpan', 'drool']);
      expect(v!.find((w) => w.id === 'happy')!.names.zh).toEqual(['开心', '高兴', '眯眼笑', '笑', '笑眯眯']);
    }
    // (仔细看 the girls' peek with a magnifying glass; the whale's and Coo's peek has none)
    expect(claude!.find((w) => w.id === 'peek')!.names.zh).toEqual(['探头', '瞅瞅', '仔细看']);
    for (const v of [coo, whale]) expect(v!.find((w) => w.id === 'peek')!.names.zh).toEqual(['探头', '瞅瞅']);
    expect(claude!.map((w) => w.id).filter((id) => !POSES.includes(id))).toEqual(whale!.map((w) => w.id).filter((id) => id !== 'spout' && !POSES.includes(id)));
    expect(claude!.filter((w) => POSES.includes(w.id)).map((w) => w.id)).toEqual(POSES);
    expect(whale!.filter((w) => POSES.includes(w.id)).map((w) => w.id)).toEqual(POSES);
    expect(claude!.map((w) => [w.id, w.seconds])).toEqual(whale!.filter((w) => w.id !== 'spout').map((w) => [w.id, w.seconds]));
    // (the same names as the girls' for them; 握拳 the fist's, not 认真's, in both)
    // (托腮 names its own way: the girls' finger at the chin is 琢磨 first)
    const drawn = (v: typeof coo) => v!.filter((w) => POSES.includes(w.id) && w.id !== 'muse').map((w) => w.names);
    expect(drawn(whale)).toEqual(drawn(claude));
    for (const v of [whale, claude]) expect(v!.find((w) => w.id === 'determined')!.names.zh).not.toContain('握拳');
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
    // Grok-chan's the same words, said of her (little bat wings on her bows and twin-tails; no ears, tail or fins to
    // move; a book only to read, standing or lying)
    expect(grok!.map((w) => [w.id, w.seconds, w.lasting])).toEqual(claude!.map((w) => [w.id, w.seconds, w.lasting]));
    expect(grok!.map((w) => w.names)).toEqual(claude!.map((w) => w.names));
    expect(JSON.stringify(grok)).not.toMatch(/鲸|鳍|围裙|喷水|龙|猫|喵|耳|尾巴/);
    expect(grok!.filter((w) => /书/.test(w.about.zh!)).map((w) => w.id)).toEqual(['lie', 'read']);
    for (const v of [coo!, whale!, claude!, gpt!, gemini!, grok!]) expect(v.filter((w) => w.lasting).map((w) => w.id).sort()).toEqual(['kneel', 'lie', 'sit', 'sleep']);
    // the whale and the four girls draw arm gestures kneeling (keepsArms); Coo does not
    for (const v of [whale!, claude!, gpt!, gemini!, grok!]) expect(v.filter((w) => w.keepsArms).map((w) => w.id)).toEqual(['kneel']);
    expect(coo!.some((w) => w.keepsArms)).toBe(false);
    // only the whale leans in, leans back and sways kneeling (keepsLeans, the kit's figure.kneelLeans)
    expect(whale!.filter((w) => w.keepsLeans).map((w) => w.id)).toEqual(['kneel']);
    for (const v of [coo!, claude!, gpt!, gemini!, grok!]) expect(v.some((w) => w.keepsLeans)).toBe(false);
    expect(coo!.find((w) => w.id === 'petrify')!.seconds).toBe(3.2);
  });

  it('reads keepsArms only as true on a lasting word', () => {
    const vocabOf = (w: Record<string, unknown>) => { const m = readManifest(pack({ ...base, vocab: [{ ...word, ...w }] })); if (typeof m === 'string') throw new Error(m); return m.vocab[0]; };
    expect(vocabOf({ lasting: true, keepsArms: true })).toMatchObject({ lasting: true, keepsArms: true });
    expect(vocabOf({ lasting: true, keepsArms: 'yes' })).not.toHaveProperty('keepsArms');
    expect(vocabOf({ lasting: true, keepsArms: 1 })).not.toHaveProperty('keepsArms');
    expect(vocabOf({ keepsArms: true })).not.toHaveProperty('keepsArms');
  });

  it('reads keepsLeans only as true on a lasting word', () => {
    const vocabOf = (w: Record<string, unknown>) => { const m = readManifest(pack({ ...base, vocab: [{ ...word, ...w }] })); if (typeof m === 'string') throw new Error(m); return m.vocab[0]; };
    expect(vocabOf({ lasting: true, keepsLeans: true })).toMatchObject({ lasting: true, keepsLeans: true });
    expect(vocabOf({ lasting: true, keepsArms: true, keepsLeans: true })).toMatchObject({ lasting: true, keepsArms: true, keepsLeans: true });
    expect(vocabOf({ lasting: true, keepsLeans: 'yes' })).not.toHaveProperty('keepsLeans');
    expect(vocabOf({ keepsLeans: true })).not.toHaveProperty('keepsLeans');
  });

  it('refuses a word name a script could never write: a marker\'s separator in it, longer than an inline marker, or naming two words', () => {
    expect(readManifest(pack({ ...base, vocab: [{ ...word, names: { zh: ['哔 哔'] } }] }))).toMatch(/名字/);
    expect(readManifest(pack({ ...base, vocab: [{ ...word, names: { zh: ['哔'.repeat(33)] } }] }))).toMatch(/名字/);
    expect(readManifest(pack({ ...base, vocab: [word, { ...word, id: 'boop' }] }))).toMatch(/不止一个词/);
  });

  it('files a pack\'s sound under a body\'s kind only, and leaves out one whose file is not there', () => {
    const missing: string[] = [];
    const m = readManifest(pack({ ...base, sounds: { boing: { file: 'boing.ogg', kind: 'move' }, clunk: { file: 'clunk.wav', kind: 'touch' } } }, ['boing.ogg']), false, missing);
    if (typeof m === 'string') throw new Error(m);
    expect(Object.keys(m.sounds)).toEqual(['boing']);
    expect(missing).toHaveLength(1);
  });

  // (upstream #434)
  it("reads a pack's voice, how far its effects reach and its bubbles' colours, leaving out values out of range or incomplete", () => {
    const colours = { light: { fill: '#ffffff', text: '#111111', line: '#222222' }, dark: { fill: '#000000', text: '#eeeeee', line: '#dddddd' } };
    const m = readManifest(pack({
      ...base, voice: { pitch: 1.5 }, effects: { reach: .5 }, bubble: colours,
      presets: [{ id: 'dusk', pick: {}, bubble: colours }, { id: 'dawn', pick: {}, bubble: { ...colours, dark: { fill: '#000' } } }],
      sounds: { la: { file: 'la.ogg', kind: 'talk' } },
    }, ['la.ogg']));
    if (typeof m === 'string') throw new Error(m);
    expect(m).toMatchObject({ voice: { pitch: 1.5 }, effects: { reach: .5 }, bubble: colours, sounds: { la: { kind: 'talk' } } });
    expect(m.presets.map((p) => p.bubble)).toEqual([colours, undefined]);
    const off = readManifest(pack({ ...base, voice: { pitch: 9 }, effects: { reach: 5 }, bubble: { light: colours.light } }));
    if (typeof off === 'string') throw new Error(off);
    expect(off).toMatchObject({ voice: { pitch: 1 }, effects: { reach: 0 } });
    expect(off.bubble).toBeUndefined();
    // a colour that is not hex (a stylesheet's text could ride in one) leaves the whole set out
    const css = readManifest(pack({ ...base, bubble: { ...colours, light: { ...colours.light, fill: 'red;}body{x:y' } } }));
    if (typeof css === 'string') throw new Error(css);
    expect(css.bubble).toBeUndefined();
    // none of it given: the defaults, and no bubble
    const plain = readManifest(pack(base));
    if (typeof plain === 'string') throw new Error(plain);
    expect(plain).toMatchObject({ voice: { pitch: 1 }, effects: { reach: 0 } });
    expect(plain).not.toHaveProperty('bubble');
  });

  it('the built-in figures name no voice, effects reach or bubble colours of their own', () => {
    for (const p of figurePacks([]).packs) {
      expect(p.manifest, p.id).toMatchObject({ voice: { pitch: 1 }, effects: { reach: 0 } });
      expect(p.manifest, p.id).not.toHaveProperty('bubble');
      expect(Object.values(p.manifest.sounds).some((d) => d.kind === 'talk'), p.id).toBe(false);
    }
  });

  it('loads a pack without what this version does not know (a word\'s or sound\'s kind, a sound\'s file type, a value of can), naming each part left out', () => {
    const skipped: string[] = [];
    const m = readManifest(pack({
      ...base,
      vocab: [word, { ...word, id: 'pose', kind: 'pose', names: { zh: ['摆姿势'] } }],
      sounds: { boing: { file: 'boing.ogg', kind: 'move' }, chime: { file: 'chime.ogg', kind: 'ui' }, hum: { file: 'hum.flac', kind: 'move' } },
      can: { walk: 'sometimes', fly: true },
      someFieldFromLater: { anything: [1, 2] },
    }, ['boing.ogg', 'chime.ogg', 'hum.flac']), false, skipped);
    if (typeof m === 'string') throw new Error(m);
    expect(m.vocab.map((w) => w.id)).toEqual(['beep']);
    expect(Object.keys(m.sounds)).toEqual(['boing']);
    expect(m.can).toEqual({ walk: true });
    expect(m).not.toHaveProperty('someFieldFromLater');
    expect(skipped).toHaveLength(4);
    expect(skipped.join('\n')).toMatch(/vocab\.pose\.kind/);
    expect(skipped.join('\n')).toMatch(/chime/);
    expect(skipped.join('\n')).toMatch(/hum\.flac/);
    expect(skipped.join('\n')).toMatch(/can\.walk/);
  });

  it('a pair naming a word left out is left out with it, and the pack still loads', () => {
    const face = (id: string, zh: string, kind = 'expression') => ({ id, kind, names: { zh: [zh] }, about: { zh: '一张脸' }, seconds: 1 });
    const skipped: string[] = [];
    const m = readManifest(pack({
      ...base, vocab: [word, face('happy', '开心'), face('surprised', '惊讶'), face('glow', '发光', 'aura')],
      pairs: { 'happy+surprised': 'surprised+happy', 'happy+glow': 'glow+happy' },
    }), false, skipped);
    if (typeof m === 'string') throw new Error(m);
    expect(m.pairs).toEqual({ 'happy~surprised': { eyes: 'surprised', mouth: 'happy' } });
    expect(skipped).toHaveLength(2);
  });

  it('says a pack made for a newer manifest or contract needs the app updated, and reads one made for this one', () => {
    expect(readManifest(pack({ ...base, manifest: 3 }))).toMatch(/更新应用/);
    expect(readManifest(pack({ ...base, api: 3 }))).toMatch(/更新应用/);
    expect(readManifest(pack({ ...base, manifest: 1 }))).toMatch(/manifest/);
    expect(readManifest(pack({ ...base, api: '2' }))).toMatch(/api/);
    expect(readManifest(pack({ ...base }))).toMatchObject({ manifest: 2, api: 2 });
  });

  it('a pack that loads without some of its parts is listed, with the parts named in the notes, not the problems', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    const dir = join(root, 'robot');
    mkdirSync(dir);
    writeFileSync(join(dir, 'figure.json'), JSON.stringify({ ...base, vocab: [word, { ...word, id: 'pose', kind: 'pose', names: { zh: ['摆姿势'] } }] }));
    const { packs, problems, notes } = figurePacks([root]);
    expect(packs.map((p) => p.id)).toContain('robot');
    expect(problems).toEqual([]);
    expect(notes).toEqual([expect.stringContaining('vocab.pose.kind')]);
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

describe('pairs of expressions shown as one face', () => {
  const face = (id: string, zh: string) => ({ id, kind: 'expression', names: { zh: [zh] }, about: { zh: '一张脸' }, seconds: 1 });
  const faces = [face('neutral', '平静'), face('happy', '开心'), face('surprised', '惊讶'), face('smug', '得意'), face('smirk', '坏笑'), face('petrify', '石化')];
  const read = (pairs: unknown) => readManifest(pack({ ...base, vocab: [word, ...faces], pairs }));

  it('the built-ins read with their judged pairs (the four girls the same, the whale fewer, Coo the fewest)', () => {
    const by = Object.fromEntries(figurePacks([]).packs.map((p) => [p.id, p.manifest.pairs]));
    const n = (id: string) => Object.keys(by[id]).length;
    expect([n('coo'), n('whale'), n('claude-chan'), n('gpt-chan'), n('gemini-chan'), n('grok-chan')]).toEqual([24, 122, 136, 136, 136, 136]);
    expect(by['gpt-chan']).toEqual(by['claude-chan']);
    expect(by['gemini-chan']).toEqual(by['claude-chan']);
    expect(by['grok-chan']).toEqual(by['claude-chan']);
    expect(by['claude-chan']['happy~surprised']).toEqual({ eyes: 'surprised', mouth: 'happy' });
    expect(by.coo['happy~smug']).toEqual({ as: 'smirk' });
    // each smaller list is part of the larger one
    for (const k of Object.keys(by.coo)) expect(by.whale[k], k).toEqual(by.coo[k]);
    for (const k of Object.keys(by.whale)) if (k !== 'surprised~worried') expect(by['claude-chan'][k], k).toEqual(by.whale[k]);
  });

  it('reads a pack\'s pairs by key, composed (eyes+mouth) or shown as one of its words', () => {
    const m = read({ 'happy+surprised': 'surprised+happy', 'smug+happy': 'smirk' });
    expect(typeof m).toBe('object');
    expect((m as Exclude<typeof m, string>).pairs).toEqual({ 'happy~surprised': { eyes: 'surprised', mouth: 'happy' }, 'happy~smug': { as: 'smirk' } });
    expect((readManifest(pack({ ...base, vocab: [word, ...faces] })) as Exclude<typeof m, string>).pairs).toEqual({});
  });

  it('leaves out pairs that are not two of its expressions, or say the same pair twice, or a value naming anything else', () => {
    const cases: Array<[unknown, string]> = [
      [['happy+surprised'], 'pairs 应为对象'],
      ['happy+surprised', 'pairs 应为对象'],
      [{ happy: 'happy' }, 'pairs 里有不合法的一项:"happy"'],
      [{ 'happy+surprised+smug': 'smug+happy' }, 'pairs 里有不合法的一项:"happy+surprised+smug"'],
      [{ 'happy+happy': 'happy+happy' }, 'pairs 里有不合法的一项:"happy+happy"'],
      [{ 'happy+beep': 'happy+beep' }, 'pairs 里有不合法的一项:"happy+beep"'],
      [{ 'happy+nosuch': 'happy+nosuch' }, 'pairs 里有不合法的一项:"happy+nosuch"'],
      [{ 'happy+neutral': 'happy+neutral' }, 'pairs 里有不合法的一项:"happy+neutral"'],
      [{ 'petrify+happy': 'petrify+happy' }, 'pairs 里有不合法的一项:"petrify+happy"'],
      [{ 'happy+surprised': 'surprised+happy', 'surprised+happy': 'happy+surprised' }, 'pairs 里 surprised+happy 写了不止一次'],
      [{ 'happy+surprised': 'happy+smug' }, 'pairs.happy+surprised 不合法:"happy+smug"'],
      [{ 'happy+surprised': 'happy+happy' }, 'pairs.happy+surprised 不合法:"happy+happy"'],
      [{ 'happy+surprised': 'beep' }, 'pairs.happy+surprised 不合法:"beep"'],
      [{ 'happy+surprised': 'happy' }, 'pairs.happy+surprised 不合法:"happy"'],
      [{ 'happy+surprised': 'neutral' }, 'pairs.happy+surprised 不合法:"neutral"'],
      [{ 'happy+surprised': 'petrify' }, 'pairs.happy+surprised 不合法:"petrify"'],
      [{ 'happy+surprised': 3 }, 'pairs.happy+surprised 不合法:3'],
    ];
    for (const [pairs, msg] of cases) {
      const skipped: string[] = [];
      const m = readManifest(pack({ ...base, vocab: [word, ...faces], pairs }), false, skipped);
      if (typeof m === 'string') throw new Error(m);
      expect(skipped, JSON.stringify(pairs)).toEqual([expect.stringContaining(msg)]);
      // only the one that holds is kept
      expect(Object.keys(m.pairs).length, JSON.stringify(pairs)).toBeLessThanOrEqual(1);
    }
  });
});

describe('importing figure packs from the dressing page', () => {
  const robot = (id = 'robot', extra: Record<string, unknown> = {}) => strToU8(JSON.stringify({ ...base, id, thumb: 'thumb.png', ...extra }));
  /** A 1×1 PNG. */
  const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const robotFiles = (prefix: string, id = 'robot', extra: Record<string, unknown> = {}) => ({
    [`${prefix}figure.json`]: robot(id, extra), [`${prefix}figure.js`]: strToU8('export function createBody() {}'), [`${prefix}thumb.png`]: PNG,
  });
  const importer = () => {
    const packDir = mkdtempSync(join(tmpdir(), 'figures-'));
    return { packDir, imp: new PackImporter({ packDir: () => packDir, packs: () => figurePacks([packDir]).packs }) };
  };
  const files = (f: ImportFile[] | string): ImportFile[] => { if (typeof f === 'string') throw new Error(f); return f; };
  /** The dressing page's framing of a folder's files (web/dress.js importFolder). */
  const bundle = (entries: Record<string, Uint8Array>): Uint8Array => {
    const parts: Buffer[] = [];
    for (const [path, bytes] of Object.entries(entries)) {
      const name = Buffer.from(path);
      const head = Buffer.alloc(4); head.writeUInt32LE(name.length);
      const size = Buffer.alloc(4); size.writeUInt32LE(bytes.length);
      parts.push(head, name, size, Buffer.from(bytes));
    }
    return new Uint8Array(Buffer.concat(parts));
  };

  it('reads stored and deflated zip entries, leaving out directories and the files macOS adds', () => {
    const zip = zipSync({ 'a/': new Uint8Array(), 'a/b.txt': [strToU8('hello'), { level: 0 }], 'a/c.txt': [strToU8('x'.repeat(5000)), { level: 9 }], '__MACOSX/a/._b.txt': strToU8('junk') });
    const out = files(filesFromZip(zip));
    expect(out.map((f) => f.path).sort()).toEqual(['__MACOSX/a/._b.txt', 'a/b.txt', 'a/c.txt']);
    expect(Buffer.from(out.find((f) => f.path === 'a/c.txt')!.bytes).toString()).toBe('x'.repeat(5000));
    expect(filesFromZip(strToU8('not a zip at all, just text'))).toMatch(/zip/);
  });

  it('refuses a zip entry that unpacks to more than it says (a zip bomb\'s trick), or a damaged zip', () => {
    const zip = Buffer.from(zipSync({ 'big.txt': [strToU8('y'.repeat(100_000)), { level: 9 }] }));
    // the central directory's uncompressed size, said to be 10 bytes
    const cd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt32LE(10, cd + 24);
    expect(filesFromZip(new Uint8Array(zip))).toMatch(/big\.txt/);
    expect(filesFromZip(new Uint8Array(zip.subarray(0, zip.length - 30)))).toMatch(/zip/);
  });

  it('a path that leaves what was sent, or that Windows cannot hold, is refused', () => {
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'c:x', '\\\\server\\share', 'a/b<c', 'a/b:c', 'a/con.', 'a\u0001b', '']) expect(segments(bad), bad).toBeNull();
    // the names Windows keeps for devices, with an extension or not
    for (const bad of ['CON', 'a/nul', 'a/Nul.txt', 'prn/x', 'aux.json', 'a/COM1', 'a/lpt9.png', 'a/com\u00b9']) expect(segments(bad), bad).toBeNull();
    expect(segments('console/connect.png')).toEqual(['console', 'connect.png']);
    expect(segments('com10/null.txt')).toEqual(['com10', 'null.txt']);
    expect(segments('repo-main/packs/robot/figure.json')).toEqual(['repo-main', 'packs', 'robot', 'figure.json']);
    expect(segments('a\\b/./c.png')).toEqual(['a', 'b', 'c.png']);
  });

  it('finds the packs in a zip some folders down, not a folder inside a pack, and installs the picked one under its id', async () => {
    const { imp, packDir } = importer();
    const zip = zipSync({ ...robotFiles('repo-main/packs/robot/'), 'repo-main/packs/robot/extra/figure.json': strToU8('{}'), 'repo-main/README.md': strToU8('#') });
    const staged = await imp.stage(files(filesFromZip(zip)), false);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.problems).toEqual([]);
    expect(staged.packs.map((p) => [p.dir, p.id, p.installed, p.words])).toEqual([['repo-main/packs/robot', 'robot', null, 1]]);
    expect(staged.packs[0]!.thumb).toMatch(/^data:image\/png;base64,/);
    expect(await imp.install(staged.token, ['repo-main/packs/robot'])).toEqual({ installed: ['robot'] });
    expect(figurePacks([packDir]).packs.find((p) => p.id === 'robot')).toMatchObject({ dir: join(packDir, 'robot'), builtin: false, base: '/packs/robot/' });
    // the token is spent
    expect(await imp.install(staged.token, ['repo-main/packs/robot'])).toMatchObject({ error: expect.stringContaining('过期') });
  });

  it('refuses a built-in id and a built-in\'s exported copy, and says why a broken pack cannot go in', async () => {
    const { imp, packDir } = importer();
    const zip = zipSync({ ...robotFiles('a/', 'whale'), ...robotFiles('b/', 'coopanion-gpt-chan'), 'c/figure.json': strToU8('{"manifest":9}'), ...robotFiles('d/', 'coo') });
    const staged = await imp.stage(files(filesFromZip(zip)), false);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs).toEqual([]);
    expect(staged.problems.map((p) => p.dir)).toEqual(['a', 'b', 'c', 'd']);
    expect(staged.problems[0]!.reason).toMatch(/内置/);
    expect(staged.problems[1]!.reason).toMatch(/gpt-chan/);
    expect(staged.problems[2]!.reason).toMatch(/更新应用/);
    expect(readdirSync(packDir)).toEqual([]);
  });

  it('replaces the installed pack with that id whatever its folder is called, only once that is approved, and refuses a path that climbs out before writing anything', async () => {
    const { imp, packDir } = importer();
    mkdirSync(join(packDir, 'old-name'));
    writeFileSync(join(packDir, 'old-name', 'figure.json'), JSON.stringify({ ...base, version: '0.9.0' }));
    writeFileSync(join(packDir, 'old-name', 'kept.txt'), 'original');
    const staged = await imp.stage(files(filesFromBundle(bundle(robotFiles('picked/', 'robot', { version: '1.0.0' })))), true);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs.map((p) => [p.dir, p.installed])).toEqual([['picked', '0.9.0']]);
    // (upstream #306) not without a yes for that id: nothing changes and the token stays good
    expect(await imp.install(staged.token, ['picked'])).toEqual({ conflicts: ['robot'] });
    expect(await imp.install(staged.token, ['picked'], ['another-id'])).toEqual({ conflicts: ['robot'] });
    expect(readdirSync(packDir)).toEqual(['old-name']);
    expect(readFileSync(join(packDir, 'old-name', 'kept.txt'), 'utf8')).toBe('original');
    expect(await imp.install(staged.token, ['picked'], ['robot'])).toEqual({ installed: ['robot'] });
    expect(readdirSync(packDir)).toEqual(['robot']);
    expect(JSON.parse(readFileSync(join(packDir, 'robot', 'figure.json'), 'utf8')).version).toBe('1.0.0');

    const name = `climbed-${process.pid}.txt`;
    const out = await imp.stage([{ path: 'picked/figure.json', bytes: robot() }, { path: `../${name}`, bytes: strToU8('x') }], true);
    expect(out).toMatchObject({ error: expect.stringContaining('路径') });
    expect(existsSync(join(tmpdir(), name))).toBe(false);
    // a zip whose entry climbs out is refused the same way
    const evil = zipSync({ 'ok/figure.json': robot(), [`../../${name}`]: strToU8('x') });
    expect(await imp.stage(files(filesFromZip(evil)), false)).toMatchObject({ error: expect.stringContaining('路径') });
  });

  it('a pet server not told where packs go does not take any', async () => {
    const server = new PetServer({
      port: () => 0, webDir: join(tmpdir()), snapshot: () => ({}), onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {},
      packs: () => figurePacks([]).packs,
    });
    const port = await server.start();
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/api/figures/import`)).json()).toMatchObject({ importable: false });
    } finally {
      await server.stop();
    }
  });

  it('the figure frame may be framed by the pet server and exactly the console origins it is told, by any local port when told none', async () => {
    const webDir = fileURLToPath(new URL('../web/', import.meta.url));
    const opts = { port: () => 0, webDir, snapshot: () => ({}), onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {} };
    const ancestors = async (server: PetServer) => {
      const port = await server.start();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/figure-frame`);
        expect(res.status).toBe(200);
        const csp = res.headers.get('content-security-policy') ?? '';
        expect(csp).toContain('sandbox allow-scripts');
        return { port, ancestors: csp.split('; ').find((d) => d.startsWith('frame-ancestors ')) };
      } finally {
        await server.stop();
      }
    };
    // the console (Start and Dress up frame the pet page) is on another port: its origins are named, nothing wider
    const origins = ['http://127.0.0.1:17788', 'http://localhost:17788'];
    const told = await ancestors(new PetServer({ ...opts, consoleOrigins: () => origins }));
    expect(told.ancestors).toBe(`frame-ancestors http://127.0.0.1:${told.port} http://127.0.0.1:17788 http://localhost:17788`);
    // an app that names none gets upstream's rule
    const untold = await ancestors(new PetServer(opts));
    expect(untold.ancestors).toBe(`frame-ancestors http://127.0.0.1:${untold.port} http://127.0.0.1:* http://localhost:*`);
  });

  it('a folder named as the pack\'s id that holds another pack is left alone: the import takes the next free name', async () => {
    const { imp, packDir } = importer();
    mkdirSync(join(packDir, 'foo'));
    writeFileSync(join(packDir, 'foo', 'figure.json'), JSON.stringify({ ...base, id: 'bar' }));
    mkdirSync(join(packDir, 'foo-2'));
    writeFileSync(join(packDir, 'foo-2', 'figure.json'), '{ broken');
    const staged = await imp.stage(files(filesFromZip(zipSync(robotFiles('foo/', 'foo')))), false);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs.map((p) => [p.id, p.installed])).toEqual([['foo', null]]);
    expect(await imp.install(staged.token, ['foo'])).toEqual({ installed: ['foo'] });
    expect(readdirSync(packDir).sort()).toEqual(['foo', 'foo-2', 'foo-3']);
    const packs = figurePacks([packDir]).packs;
    expect(packs.find((p) => p.id === 'bar')).toMatchObject({ dir: join(packDir, 'foo') });
    expect(packs.find((p) => p.id === 'foo')).toMatchObject({ dir: join(packDir, 'foo-3'), base: '/packs/foo/' });

    // importing foo again replaces it where it is, still leaving bar
    const again = await imp.stage(files(filesFromZip(zipSync(robotFiles('foo/', 'foo', { version: '2.0.0' })))), false);
    if ('error' in again) throw new Error(again.error);
    expect(again.packs[0]!.installed).toBe('0.0.0');
    expect(await imp.install(again.token, ['foo'])).toEqual({ conflicts: ['foo'] });
    expect(await imp.install(again.token, ['foo'], ['foo'])).toEqual({ installed: ['foo'] });
    const after = figurePacks([packDir]).packs;
    expect(after.find((p) => p.id === 'bar')).toBeTruthy();
    expect(after.find((p) => p.id === 'foo')!.manifest.version).toBe('2.0.0');
    expect(readdirSync(packDir).filter((e) => e.startsWith('.'))).toEqual([]);
  });

  it('a copy that fails leaves the installed pack as it was, and a copy left half-made is not read as a pack', async () => {
    const { imp, packDir } = importer();
    mkdirSync(join(packDir, 'robot'));
    writeFileSync(join(packDir, 'robot', 'figure.json'), JSON.stringify({ ...base, version: '0.9.0' }));
    // what an install stopped midway leaves: not listed, and swept up by the next install
    mkdirSync(join(packDir, `.robot.tmp-${randomUUID()}`));
    writeFileSync(join(readdirSync(packDir).map((e) => join(packDir, e)).find((d) => d.includes('.tmp-'))!, 'figure.json'), JSON.stringify({ ...base, id: 'half' }));
    expect(figurePacks([packDir]).packs.map((p) => p.id)).not.toContain('half');
    const staged = await imp.stage(files(filesFromZip(zipSync(robotFiles('robot/', 'robot', { version: '1.0.0' })))), false);
    if ('error' in staged) throw new Error(staged.error);
    // the staged copy goes away under it: copying fails
    rmSync((imp as unknown as { staged: { root: string } }).staged.root, { recursive: true, force: true });
    expect(await imp.install(staged.token, ['robot'], ['robot'])).toMatchObject({ error: expect.stringContaining('robot') });
    expect(readdirSync(packDir)).toEqual(['robot']);
    expect(JSON.parse(readFileSync(join(packDir, 'robot', 'figure.json'), 'utf8')).version).toBe('0.9.0');
  });

  it('of two imports that overlap, only the later one is kept, and a token is installed once', async () => {
    const { imp, packDir } = importer();
    const [first, second] = await Promise.all([
      imp.stage(files(filesFromZip(zipSync(robotFiles('a/', 'alpha')))), false),
      imp.stage(files(filesFromZip(zipSync(robotFiles('b/', 'beta')))), false),
    ]);
    expect(first).toMatchObject({ error: expect.stringContaining('作废') });
    if ('error' in second) throw new Error(second.error);
    expect(second.packs.map((p) => p.id)).toEqual(['beta']);
    const [one, two] = await Promise.all([imp.install(second.token, ['b']), imp.install(second.token, ['b'])]);
    expect(one).toEqual({ installed: ['beta'] });
    expect(two).toMatchObject({ error: expect.stringContaining('过期') });
    expect(readdirSync(packDir)).toEqual(['beta']);
  });

  it('checks every chosen pack before writing, and sees a pack installed after the import was staged (upstream #306)', async () => {
    const { imp, packDir } = importer();
    const staged = await imp.stage(files(filesFromZip(zipSync({ ...robotFiles('one/', 'robot'), ...robotFiles('two/', 'second') }))), false);
    if ('error' in staged) throw new Error(staged.error);
    expect(staged.packs.map((p) => [p.id, p.installed])).toEqual([['robot', null], ['second', null]]);
    mkdirSync(join(packDir, 'old-name'));
    writeFileSync(join(packDir, 'old-name', 'figure.json'), JSON.stringify({ ...base, version: '0.9.0' }));
    expect(await imp.install(staged.token, ['one', 'two'])).toEqual({ conflicts: ['robot'] });
    expect(readdirSync(packDir)).toEqual(['old-name']);
    // a cancelled import cannot be installed afterwards, approved or not
    await imp.cancel();
    expect(await imp.install(staged.token, ['one', 'two'], ['robot'])).toMatchObject({ error: expect.stringContaining('过期') });
    expect(readdirSync(packDir)).toEqual(['old-name']);
  });

  it('a pack installed by another route is no conflict when its folder is not one (the fork\'s <id>-2 rule), and an approved token is spent once', async () => {
    const { imp, packDir } = importer();
    mkdirSync(join(packDir, 'robot'));
    writeFileSync(join(packDir, 'robot', 'notes.txt'), 'not a pack');
    const staged = await imp.stage(files(filesFromZip(zipSync(robotFiles('robot/')))), false);
    if ('error' in staged) throw new Error(staged.error);
    const [one, two] = await Promise.all([imp.install(staged.token, ['robot']), imp.install(staged.token, ['robot'])]);
    expect(one).toEqual({ installed: ['robot'] });
    expect(two).toMatchObject({ error: expect.stringContaining('过期') });
    expect(readdirSync(packDir).sort()).toEqual(['robot', 'robot-2']);
    expect(readFileSync(join(packDir, 'robot', 'notes.txt'), 'utf8')).toBe('not a pack');
  });

  it('uninstalls a pack in the pack directory only, whatever its folder is called (upstream #317)', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'figures-'));
    const other = mkdtempSync(join(tmpdir(), 'figures-other-'));
    mkdirSync(join(packDir, 'old-name'));
    writeFileSync(join(packDir, 'old-name', 'figure.json'), JSON.stringify(base));
    mkdirSync(join(other, 'elsewhere'));
    writeFileSync(join(other, 'elsewhere', 'figure.json'), JSON.stringify({ ...base, id: 'elsewhere' }));
    const packs = () => figurePacks([packDir, other]).packs;
    const imp = new PackImporter({ packDir: () => packDir, packs });
    const listed = packs();
    expect(listed.filter((p) => imp.removable(p)).map((p) => p.id)).toEqual(['robot']);
    expect(listed.find((p) => p.id === 'whale')!.builtin).toBe(true);
    expect(await imp.remove('whale')).toMatchObject({ error: expect.stringContaining('内置') });
    expect(await imp.remove('coo')).toMatchObject({ error: expect.stringContaining('内置') });
    expect(await imp.remove('elsewhere')).toMatchObject({ error: expect.stringContaining('安装目录') });
    expect(await imp.remove('nobody')).toMatchObject({ error: expect.stringContaining('nobody') });
    expect(readdirSync(other)).toEqual(['elsewhere']);
    expect(await imp.remove('robot')).toEqual({ removed: 'robot' });
    expect(readdirSync(packDir)).toEqual([]);
    expect(packs().map((p) => p.id)).not.toContain('robot');
    // without a pack directory nothing is removable
    const none = new PackImporter({ packDir: () => null, packs });
    expect(packs().some((p) => none.removable(p))).toBe(false);
    expect(await none.remove('elsewhere')).toMatchObject({ error: expect.any(String) });
    // in English
    const en = new PackImporter({ packDir: () => packDir, packs, language: () => 'en' });
    expect(await en.remove('whale')).toEqual({ error: 'whale is a built-in figure and cannot be uninstalled' });
  });

  it('the pet server takes a zip from its own pages only, and installs it where it is told packs go', async () => {
    const packDir = mkdtempSync(join(tmpdir(), 'figures-'));
    const server = new PetServer({
      port: () => 0, webDir: join(tmpdir()), snapshot: () => ({}), onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {},
      packs: () => figurePacks([packDir]).packs, packDir: () => packDir,
    });
    const port = await server.start();
    try {
      const url = (p: string) => `http://127.0.0.1:${port}${p}`;
      expect(await (await fetch(url('/api/figures/import'))).json()).toMatchObject({ importable: true });
      const zip = zipSync(robotFiles('robot/'));
      // a page of another site cannot post one
      expect((await fetch(url('/api/figures/import'), { method: 'POST', headers: { 'content-type': 'application/zip', origin: 'https://example.com' }, body: zip })).status).toBe(421);
      expect((await fetch(url('/api/figures/import'), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status).toBe(415);
      const staged = await (await fetch(url('/api/figures/import'), { method: 'POST', headers: { 'content-type': 'application/zip', origin: `http://127.0.0.1:${port}` }, body: zip })).json();
      expect(staged.packs.map((p: { id: string }) => p.id)).toEqual(['robot']);
      const done = await (await fetch(url('/api/figures/import/install'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: staged.token, dirs: ['robot'] }) })).json();
      expect(done).toEqual({ installed: ['robot'] });
      const listed = await (await fetch(url('/api/figures'))).json() as Array<{ id: string; base: string }>;
      expect(listed.find((p) => p.id === 'robot')).toMatchObject({ base: '/packs/robot/' });
      // (upstream #434) the page reads the pack's voice, effects reach and bubble colours from the list
      expect(listed.find((p) => p.id === 'robot')).toMatchObject({ voice: { pitch: 1 }, effects: { reach: 0 }, bubble: null });
    } finally {
      await server.stop();
    }
  });
});
