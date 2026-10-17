/**
 * The bot hears how its words changed when the figure changes under it (upstream 20751d8, adapted to the fork's
 * line-per-word table, its pairs and decider mode): in a `pet_set` receipt, a `[形象]` event, and when a pack
 * would not run; words a body says it does not know are not offered; decider mode is told nothing (it shows the
 * bot no words) but decides with the new body's words at once, a decision in flight across a switch too.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld, type DesktopPetWorldOptions } from '../src/world.ts';
import { figurePacks } from '../src/packs.ts';
import { vocabChange, vocabTable, type VocabWord } from '../src/script.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { DeciderMock } from './helpers/decider-mock.ts';

const ctx = { role: 'main', log: new FakeHost().log };
const word = (id: string, kind: VocabWord['kind'], name: string, about: string, extra: Partial<VocabWord> = {}): VocabWord =>
  ({ id, kind, names: { zh: [name] }, about: { zh: about }, seconds: 1, ...extra });

/** An installed pack `robot`: a face, sitting, and a word of its own. */
function robotRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'packs-'));
  mkdirSync(join(root, 'robot'));
  writeFileSync(join(root, 'robot', 'figure.json'), JSON.stringify({
    manifest: 2, api: 2, id: 'robot', name: { zh: '机器人' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [],
    vocab: [
      { id: 'happy', kind: 'expression', names: { zh: ['开心'] }, about: { zh: '屏幕上画个笑脸' }, seconds: 1 },
      { id: 'sit', kind: 'motion', names: { zh: ['坐下'] }, about: { zh: '折起腿' }, seconds: 1, lasting: true },
      { id: 'beep', kind: 'motion', names: { zh: ['哔哔'] }, about: { zh: '哔一声' }, seconds: 1 },
    ],
  }));
  return root;
}

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

interface Made { world: DesktopPetWorld; cfg: DesktopPetConfigSection; host: FakeHost; logs: string[]; mock?: DeciderMock }

async function mounted(opts: { patch?: (c: DesktopPetConfigSection) => void; extra?: Partial<DesktopPetWorldOptions>; decider?: boolean } = {}): Promise<Made> {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  let mock: DeciderMock | undefined;
  const extra: Partial<DesktopPetWorldOptions> = { ...opts.extra };
  if (opts.decider) {
    mock = new DeciderMock();
    await mock.start();
    cleanup.push(() => mock!.stop());
    cfg.decider.enabled = true;
    cfg.decider.timeoutMs = 3000;
    Object.assign(extra, { deciderKey: () => 'sk-or-test-key', deciderUrl: mock.url, deciderModelsUrl: mock.modelsUrl });
  }
  opts.patch?.(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-vocab-'));
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai',
    persist: (p) => { Object.assign(cfg, p); },
    runtimesRoot: () => join(dir, 'runtimes'), modelsDir: () => join(dir, 'models'),
    ...extra,
  });
  const host = new FakeHost();
  const logs: string[] = [];
  const log = (level: string) => (msg: unknown) => { logs.push(`${level} ${String(msg)}`); };
  host.log = { child() { return this; }, info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug'), trace: log('trace'), emit: (lv: string, m: string) => log(lv)(m) } as unknown as FakeHost['log'];
  await world.start(host);
  cleanup.push(() => world.stop());
  return { world, cfg, host, logs, mock };
}

const origin = (w: DesktopPetWorld) => w.petUrl.replace(/\/pet$/, '');
const tool = (w: DesktopPetWorld, name: string) => w.tools().find((t) => t.name === name)!;
const textOf = (o: unknown) => (o as { text: string }).text;
async function page(m: Made): Promise<FakePage> {
  const p = await FakePage.open(origin(m.world));
  cleanup.push(() => p.close());
  return p;
}
/** The page reports figure `id` shown, and the World has taken it (a message after it has come through). */
async function shown(m: Made, p: FakePage, id: string): Promise<void> {
  p.send({ t: 'figure', id, ok: true });
  p.send({ t: 'text', text: 'ping' });
  await expect.poll(() => m.host.events.some((e) => e.type === 'desktop-pet.message')).toBe(true);
  m.host.events.length = 0;
  m.host.pushOpts.length = 0;
}

describe('vocabChange', () => {
  // enough words both sides share that telling the change word by word is the shorter
  const shared = ['sad', 'angry', 'shy', 'cry', 'pout', 'smug'].map((id) => word(id, 'expression', id, `${id} 的样子,写得长一点好让表格比变化长`));
  const before = [word('happy', 'expression', '开心', '笑'), word('nod', 'motion', '点头', '点点头'), word('wave', 'motion', '招手', '挥挥手'), ...shared];

  it('is empty when the bot would see the same words', () => {
    expect(vocabChange({ vocab: before }, { vocab: before.map((v) => ({ ...v })) })).toBe('');
  });

  it('names the words gone, and gives the new or changed words as the table writes them, under their groups', () => {
    const after = [word('happy', 'expression', '开心', '咧嘴大笑'), word('nod', 'motion', '点头', '点点头'), word('beep', 'motion', '哔哔', '哔一声'), ...shared];
    const note = vocabChange({ vocab: before }, { vocab: after });
    expect(note).toMatch(/^词表变了,以这里为准。这些词用不了了:wave\(招手\)。新增或样子变了的:/);
    expect(note).toContain('表情:\n\n开心(好消息):\n- happy 开心:咧嘴大笑');
    expect(note).toContain('动作:\n\n身:\n- beep 哔哔(也占手、头):哔一声');
    // unchanged words are not repeated
    expect(note).not.toContain('- nod ');
    // every line is the line the prompt's table has for that word
    const table = vocabTable(after);
    for (const line of note.split('\n').filter((l) => l.startsWith('- '))) expect(table).toContain(line);
  });

  it('gives the whole new table when few words are in common', () => {
    const after = [word('beep', 'motion', '哔哔', '哔一声'), word('boop', 'motion', '噗噗', '噗一声')];
    expect(vocabChange({ vocab: before }, { vocab: after })).toBe(`词表整个换了,以这张为准,之前的词都不算数了:\n\n${vocabTable(after)}`);
  });

  it('gives the composed pairs again when they changed, and says so when there are none any more', () => {
    const faces = [word('happy', 'expression', '开心', '笑'), word('surprised', 'expression', '惊讶', '睁大眼'), ...shared];
    const pairs = { 'happy~surprised': { eyes: 'surprised', mouth: 'happy' } };
    const gained = vocabChange({ vocab: faces }, { vocab: faces, pairs });
    expect(gained).toContain('表情对(写在同一组里会合成一张脸');
    expect(gained).not.toContain('新增或样子变了的');
    expect(vocabChange({ vocab: faces, pairs }, { vocab: faces })).toContain('表情对没有了:同一组里的两个表情先后做。');
    expect(vocabChange({ vocab: faces, pairs }, { vocab: faces, pairs: { ...pairs } })).toBe('');
  });

  it('between two built-in figures is shorter than the whole table', () => {
    const { packs } = figurePacks([]);
    const of = (id: string) => { const m = packs.find((p) => p.id === id)!.manifest; return { vocab: m.vocab, pairs: m.pairs }; };
    const note = vocabChange(of('claude-chan'), of('gpt-chan'));
    expect(note).not.toBe('');
    expect(note.length).toBeLessThan(vocabTable(of('gpt-chan').vocab, 'zh', of('gpt-chan').pairs).length);
  });
});

describe('a figure change, classic mode', () => {
  it('pet_set tells the change; the body\'s own list then keeps a word from the bot, told as gone', async () => {
    const m = await mounted({ extra: { packRoots: () => [robotRoot()] } });
    const p = await page(m);
    await shown(m, p, 'coo');
    const receipt = textOf(await tool(m.world, 'pet_set').handler({ figure: 'robot' }, ctx));
    expect(receipt).toContain('你现在的样子:机器人');
    // the receipt's table is the prompt's, so a rebuilt prefix says the same
    expect(receipt).toContain(`词表整个换了,以这张为准,之前的词都不算数了:\n\n${m.world.envPromptVars()['pet.vocab']}`);
    expect(receipt).toMatch(/- beep 哔哔[^:]*:哔一声/);
    // the page shows the bot's own switch: not told back, but the body knows no beep
    p.send({ t: 'figure', id: 'robot', ok: true, words: ['happy', 'sit'] });
    await expect.poll(() => m.host.events.length).toBe(1);
    expect(m.host.events[0]!.text).toBe('[形象] 词表变了,以这里为准。这些词用不了了:beep(哔哔)。');
    expect(m.logs.some((l) => l.startsWith('warn') && l.includes('形象包 robot 的词表里有身体不认得的词,没给 bot 用:beep'))).toBe(true);
    expect(await tool(m.world, 'pet_act').handler({ actions: ['哔哔'] }, ctx)).toMatchObject({ failed: true });
    expect(m.world.envPromptVars()['pet.vocab']).not.toContain('beep');
    // a body that says nothing of its words is taken at its manifest's word again
    p.send({ t: 'figure', id: 'robot', ok: true, words: null });
    await expect.poll(() => m.host.events.length).toBe(2);
    expect(m.host.events[1]!.text).toMatch(/^\[形象\] 词表变了,以这里为准。新增或样子变了的:[^]*- beep 哔哔[^:]*:哔一声/);
  });

  it('a switch by the person: one event with the look and the change; a new pick of the same words, the look alone', async () => {
    const m = await mounted({ extra: { packRoots: () => [robotRoot()] } });
    const p = await page(m);
    await shown(m, p, 'coo');
    m.cfg.skin = { ...m.cfg.skin, figure: 'robot' };
    p.send({ t: 'figure', id: 'robot', ok: true });
    await expect.poll(() => m.host.events.length).toBe(1);
    // few words in common with Coo: the whole table
    expect(m.host.events[0]!.text).toBe(`[形象] 你现在的样子:机器人,一个机器人。\n词表整个换了,以这张为准,之前的词都不算数了:\n\n${m.world.envPromptVars()['pet.vocab']}`);
    expect(m.host.pushOpts[0]).toEqual({ trigger: 'debounce' });
    p.send({ t: 'figure', id: 'robot', ok: true, scheme: 'other' });
    await expect.poll(() => m.host.events.length).toBe(2);
    expect(m.host.events[1]!.text).toBe('[形象] 你现在的样子:机器人,一个机器人。');
  });

  it('a pack that would not run: the change to Coo\'s words, at once', async () => {
    const m = await mounted({ patch: (c) => { c.skin.figure = 'robot'; }, extra: { packRoots: () => [robotRoot()] } });
    const p = await page(m);
    p.send({ t: 'figure', id: 'robot', ok: false, reason: 'broken' });
    await expect.poll(() => m.host.events.length).toBe(1);
    const text = m.host.events[0]!.text;
    expect(text).toMatch(/^\[形象\] 机器人没能显示出来\(broken\),你现在是Coo/);
    expect(text).toContain(`词表整个换了,以这张为准,之前的词都不算数了:\n\n${m.world.envPromptVars()['pet.vocab']}`);
    expect(text).toContain('- nod 点头');
    expect(text).not.toContain('按 Coo 的词表');
    expect(m.host.pushOpts[0]).toEqual({ trigger: 'flush' });
  });
});

describe('a figure change, decider mode', () => {
  it('tells the bot no words, and the next decision asks with the new body\'s words', async () => {
    const m = await mounted({ decider: true, extra: { packRoots: () => [robotRoot()] } });
    expect(m.world.petMode).toBe('decider');
    const p = await page(m);
    p.send({ t: 'hello', screen: { w: 1920, h: 1080 } });
    p.send({ t: 'pose', x: 900, w: 1920, facing: 1, mode: 'idle' });
    await expect.poll(() => m.world.positionLine()).not.toBeNull();
    const receipt = textOf(await tool(m.world, 'pet_set').handler({ figure: 'robot' }, ctx));
    expect(receipt).toContain('你现在的样子:机器人');
    expect(receipt).not.toContain('词表');
    m.mock!.answer = () => ({ body: ['哔哔', .8] });
    await tool(m.world, 'pet_feel').handler({ feeling: '想哔一声' }, ctx);
    const asked = JSON.stringify(m.mock!.requests.at(-1)!.body.questions);
    expect(asked).toContain('哔哔');
    expect(asked).not.toContain('点头');
    expect((await p.next((x) => x.t === 'act')).actions).toEqual(['beep']);
    // nor is a page report of words told
    p.send({ t: 'figure', id: 'robot', ok: true, words: ['happy', 'sit'] });
    p.send({ t: 'text', text: 'ping' });
    await expect.poll(() => m.host.events.length).toBe(1);
    expect(m.host.events.map((e) => e.type)).toEqual(['desktop-pet.message']);
  });

  it('a decision that was asked with the old body\'s words does only those the new body has', async () => {
    const m = await mounted({ decider: true, extra: { packRoots: () => [robotRoot()] } });
    const p = await page(m);
    p.send({ t: 'hello', screen: { w: 1920, h: 1080 } });
    p.send({ t: 'pose', x: 900, w: 1920, facing: 1, mode: 'idle' });
    await expect.poll(() => m.world.positionLine()).not.toBeNull();
    m.mock!.delayMs = 1000;
    m.mock!.answer = () => ({ head: ['点头', .8], face: ['开心', .7] });
    const feel = tool(m.world, 'pet_feel').handler({ feeling: '同意' }, ctx);
    await expect.poll(() => m.mock!.requests.length).toBe(1);
    expect(JSON.stringify(m.mock!.requests[0]!.body.questions)).toContain('点头');
    await tool(m.world, 'pet_set').handler({ figure: 'robot' }, ctx);
    await feel;
    expect((await p.next((x) => x.t === 'act')).actions).toEqual(['happy']);
    expect(m.logs.some((l) => l.startsWith('debug') && l.includes('表情决策途中换了形象') && l.includes('nod'))).toBe(true);
    expect(m.logs.some((l) => l.startsWith('warn') && l.includes('词表没有的词'))).toBe(false);
  });
});
