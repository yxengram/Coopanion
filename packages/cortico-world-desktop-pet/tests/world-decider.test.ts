/**
 * Decider mode through the World: a local stand-in for OpenRouter's decisions endpoint (never the real one), the
 * real page socket (FakePage), and a fake host that renders deferred events.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTemplate } from 'cortico/core/template.ts';
import { renderWorldEnvPrompt } from 'cortico/core/prefix.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld, type DesktopPetWorldOptions, type PetMode } from '../src/world.ts';
import { DECIDER_TOOL_DECLS, DESKTOP_PET_TOOL_DECLS } from '../src/tools.ts';
import type { DecisionRecord } from '../src/decider.ts';
import { figurePacks } from '../src/packs.ts';
import { firstName } from '../src/script.ts';

/** A pair of faces Coo composes, by its first names, and its ids. */
const COO = figurePacks([]).packs.find((x) => x.id === 'coo')!.manifest;
const PAIR = Object.keys(COO.pairs ?? {})[0]!.split('~');
const PAIR_NAMES = PAIR.map((id) => firstName(COO.vocab.find((v) => v.id === id)!));
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { DeciderMock } from './helpers/decider-mock.ts';

const KEY = 'sk-or-test-SECRET-1234567890';
const ENV_PROMPT = fileURLToPath(new URL('../src/ENV_PROMPT.md', import.meta.url));

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

interface Made {
  world: DesktopPetWorld;
  cfg: DesktopPetConfigSection;
  host: FakeHost;
  mock: DeciderMock;
  records: DecisionRecord[];
  modes: PetMode[];
  logs: string[];
  key: { value: string };
}

async function mounted(opts: { key?: string; patch?: (c: DesktopPetConfigSection) => void; extra?: Partial<DesktopPetWorldOptions>; start?: boolean } = {}): Promise<Made> {
  const mock = new DeciderMock();
  await mock.start();
  cleanup.push(() => mock.stop());
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  // off by default (the person turns it on); these tests run it switched on
  cfg.decider.enabled = true;
  // roomy for slow CI machines; the timeout test sets its own
  cfg.decider.timeoutMs = 2000;
  opts.patch?.(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-decider-'));
  const records: DecisionRecord[] = [];
  const modes: PetMode[] = [];
  const key = { value: opts.key ?? KEY };
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai',
    persist: (p) => { Object.assign(cfg, p); },
    runtimesRoot: () => join(dir, 'runtimes'), modelsDir: () => join(dir, 'models'),
    deciderKey: () => key.value,
    deciderUrl: mock.url,
    deciderModelsUrl: mock.modelsUrl,
    onDecision: (r) => records.push(r),
    onModeChange: (m) => modes.push(m),
    ...opts.extra,
  });
  const host = new FakeHost();
  const logs: string[] = [];
  const log = (level: string) => (msg: unknown, data?: unknown) => { logs.push(`${level} ${String(msg)} ${data === undefined ? '' : JSON.stringify(data)}`); };
  host.log = { child() { return this; }, info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug'), trace: log('trace'), emit: (lv: string, m: string, d?: unknown) => log(lv)(m, d) } as unknown as FakeHost['log'];
  if (opts.start !== false) {
    await world.start(host);
    cleanup.push(() => world.stop());
  }
  return { world, cfg, host, mock, records, modes, logs, key };
}

const origin = (w: DesktopPetWorld) => w.petUrl.replace(/\/pet$/, '');
const tool = (w: DesktopPetWorld, name: string) => {
  const t = w.tools().find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};
const ctx = { role: 'main', log: new FakeHost().log };
const textOf = (o: unknown) => (typeof o === 'string' ? o : (o as { text: string }).text);

async function page(m: Made, pose: Record<string, unknown> = { x: 1190, w: 1920, facing: -1, mode: 'idle' }): Promise<FakePage> {
  const p = await FakePage.open(origin(m.world));
  cleanup.push(() => p.close());
  p.send({ t: 'hello', screen: { w: 1920, h: 1080 } });
  p.send({ t: 'pose', ...pose });
  await expect.poll(() => m.world.positionLine()).not.toBeNull();
  return p;
}

describe('which mode', () => {
  it('without a key: the classic tools, word for word, and the classic prompt', async () => {
    const m = await mounted({ key: '' });
    expect(m.world.petMode).toBe('classic');
    const tools = m.world.tools().map(({ handler: _h, interruptible: _i, ...d }) => d);
    expect(tools).toEqual(DESKTOP_PET_TOOL_DECLS.map((d) => ({ ...d })));
    const vars = m.world.envPromptVars();
    expect(vars['pet.vocab']).toContain('表情,按心情分组');
    const env = await renderWorldEnvPrompt(m.world);
    expect(env.text).toBe(renderTemplate(readFileSync(ENV_PROMPT, 'utf8'), vars).trim());
    expect(env.sourceKey).toBe('worlds.desktop-pet.envPrompt');
    // no position event in classic mode
    expect(m.host.deferred).toEqual([]);
    expect(m.world.console().lamps!.find((l) => l.label === '表情决策')).toMatchObject({ state: 'offline' });
  });

  it('with a key but switched off: classic', async () => {
    const m = await mounted({ patch: (c) => { c.decider.enabled = false; } });
    expect(m.world.petMode).toBe('classic');
    expect(m.world.tools().map((t) => t.name)).toEqual(DESKTOP_PET_TOOL_DECLS.map((d) => d.name));
  });

  it('off by default: a key alone keeps classic', async () => {
    expect(DESKTOP_PET_DEFAULTS.decider.enabled).toBe(false);
    const m = await mounted({ patch: (c) => { c.decider = structuredClone(DESKTOP_PET_DEFAULTS.decider); } });
    expect(m.world.petMode).toBe('classic');
    expect(m.world.tools().map((t) => t.name)).toEqual(DESKTOP_PET_TOOL_DECLS.map((d) => d.name));
    expect(m.world.console().lamps!.find((l) => l.label === '表情决策')).toMatchObject({ state: 'offline', hint: expect.stringContaining('已关') });
  });

  it('with a key: the decider tools and prompt, no vocabulary', async () => {
    const m = await mounted();
    expect(m.world.petMode).toBe('decider');
    expect(m.world.tools().map((t) => t.name)).toEqual(['pet_say', 'pet_ask', 'pet_walk', 'pet_set', 'pet_quiet', 'pet_feel']);
    expect(m.world.tools().map(({ handler: _h, interruptible: _i, ...d }) => d)).toEqual(DECIDER_TOOL_DECLS.map((d) => ({ ...d })));
    expect(tool(m.world, 'pet_say').parameters).toMatchObject({ required: ['text', 'feeling'] });
    expect(tool(m.world, 'pet_walk').interruptible).toBe(true);
    const env = await renderWorldEnvPrompt(m.world);
    expect(env.sourceKey).toBe('worlds.desktop-pet.envPromptDecider');
    expect(env.text).toContain('feeling');
    expect(env.text).toContain('pet_walk');
    expect(env.text).not.toContain('按心情分组');
    expect(env.text).not.toContain('【词+词】');
    expect(env.text).not.toMatch(/\{\{/);
    expect(m.world.envPromptVars()['pet.vocab']).toBe('');
    expect(m.logs.some((l) => l.includes('表情动作交给决策模型挑'))).toBe(true);
  });

  it('a deployment override of the classic prompt is warned of in decider mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pet-override-'));
    const file = join(dir, 'worlds', 'desktop-pet', 'ENV_PROMPT.md');
    mkdirSync(join(dir, 'worlds', 'desktop-pet'), { recursive: true });
    writeFileSync(file, 'old {{pet.vocab}}');
    const m = await mounted({ extra: { envOverrideFile: () => file } });
    expect(m.logs.some((l) => l.startsWith('warn') && l.includes('改过桌宠的环境说明'))).toBe(true);
    expect(m.world.petState().decider).toMatchObject({ overridden: true, mode: 'decider', keySet: true });
  });

  it('switches when the setting flips, and tells the app once', async () => {
    const m = await mounted();
    m.cfg.decider.enabled = false;
    await expect.poll(() => m.modes).toEqual(['classic']);
    expect(m.world.tools().map((t) => t.name)).toContain('pet_act');
    m.cfg.decider.enabled = true;
    await expect.poll(() => m.modes).toEqual(['classic', 'decider']);
    expect(m.world.tools().map((t) => t.name)).toContain('pet_feel');
  });
});

describe('pet_say', () => {
  it('sends the bubble held for its words, then the words the decision model picked', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.answer = () => ({ face: [[PAIR_NAMES[0], .62], [PAIR_NAMES[1], .3]], head: ['点头', .7] });
    m.host.events.length = 0;
    const out = textOf(await tool(m.world, 'pet_say').handler({ text: '你好呀', feeling: '见到你很高兴' }, ctx));
    const say = await p.next((x) => x.t === 'say');
    expect(say).toMatchObject({ beats: [{ actions: [], text: '你好呀', anchors: [] }], acts: 'pending', holdMs: 1100 });
    const acts = await p.next((x) => x.t === 'say-acts');
    expect(acts.id).toBe(say.id);
    expect((acts.actions as string[])).toHaveLength(1);
    // the two faces Coo composes go in one group with the nod (or as the word they are shown as)
    const members = (acts.actions as string[])[0].split('+');
    expect(members).toContain('nod');
    expect(members.length).toBeGreaterThanOrEqual(2);
    // the receipt went back before the decision: it names no word
    expect(out).toContain('表情动作照 feeling 自动做');
    expect(out).not.toContain('点头');
    expect(out).toMatch(/\n\[位置\] 屏幕横向 1190\/1920 像素\(62%\),面朝左,站着;往左还能走约 \d+ 像素,往右约 \d+ 像素。$/);
    // what was done is told once, with the next position line (here the batch's)
    await m.world.decisionsIdle();
    const [line] = await m.host.deliverDeferred();
    expect(line).toMatch(/^\[位置\] .*\n\[表情动作\] 刚才的气泡:「你好呀」[^;]*点头[^;]*。$/);
    await expect.poll(() => m.host.deferred.length).toBe(1);
    const [again] = await m.host.deliverDeferred();
    expect(again).toMatch(/^\[位置\] /);
    expect(again).not.toContain('[表情动作]');
    // the request: key in the header only, model, state with the feeling and the line, one question per part
    const req = m.mock.requests[0];
    expect(req.auth).toBe(`Bearer ${KEY}`);
    expect(req.body.model).toBe('perplexity/pplx-decider-v1.1-27b');
    expect(req.body.state).toContain('她此刻的心情:见到你很高兴');
    expect(req.body.state).toContain('她正要说的话:你好呀');
    expect(req.body.state).toContain('她现在:站着,在屏幕偏右,面朝左');
    expect(Object.keys(req.body.questions)).toEqual(['face', 'head', 'arm', 'body']);
    expect(Object.keys(req.body.questions.body.criteria)).not.toContain('睡觉');
    expect(JSON.stringify(req.body)).not.toContain(KEY);
    expect(m.records).toHaveLength(1);
    expect(m.records[0]).toMatchObject({ tool: 'pet_say', ok: true, feeling: '见到你很高兴' });
  });

  it('tells the decision model what the person said last and what was done lately', async () => {
    const m = await mounted();
    const p = await page(m);
    p.send({ t: 'text', text: '今天升职了!' });
    await expect.poll(() => m.host.events.length).toBe(1);
    m.mock.answer = () => ({ arm: ['招手', .8] });
    await tool(m.world, 'pet_say').handler({ text: '恭喜!', feeling: '替她开心' }, ctx);
    // asked at once after the first: the decisions still go one after another, so the second sees the first
    await tool(m.world, 'pet_say').handler({ text: '请客吗', feeling: '起哄' }, ctx);
    await m.world.decisionsIdle();
    expect(m.mock.requests[0].body.state).toMatch(/对方刚才说\(\d+ 秒前,打字\):今天升职了!/);
    expect(m.mock.requests[1].body.state).toMatch(/最近做过\(从近到远\):招手\(\d+ 秒前\)/);
  });

  it('a decision that times out: the bubble is freed with no words, and the receipt says why', async () => {
    const m = await mounted();
    const p = await page(m);
    m.cfg.decider.timeoutMs = 300;
    m.mock.delayMs = 1500;
    const t0 = Date.now();
    const out = textOf(await tool(m.world, 'pet_say').handler({ text: '嗯', feeling: '平静' }, ctx));
    // the receipt does not wait for the decision
    expect(Date.now() - t0).toBeLessThan(250);
    expect(m.mock.requests).toHaveLength(0);
    await p.next((x) => x.t === 'say');
    const acts = await p.next((x) => x.t === 'say-acts');
    expect(acts.actions).toEqual([]);
    await m.world.decisionsIdle();
    expect(m.records[0]).toMatchObject({ ok: false, failure: '决策模型超时' });
    // the next receipt tells it
    const next = textOf(await tool(m.world, 'pet_set').handler({}, ctx));
    expect(next).toContain('[表情动作] 刚才的气泡:「嗯」没做(决策模型超时)。');
    void out;
  });

  it('an error status: no words, the mode stays', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.status = 500;
    await tool(m.world, 'pet_say').handler({ text: '嗯', feeling: '平静' }, ctx);
    expect((await p.next((x) => x.t === 'say-acts')).actions).toEqual([]);
    await m.world.decisionsIdle();
    expect(m.records[0].failure).toBe('决策模型返回错误(HTTP 500 mock failure)');
    expect(m.world.petMode).toBe('decider');
  });

  it('without a feeling: only the text, not held; markers are taken out of the text', async () => {
    const m = await mounted();
    const p = await page(m);
    const out = textOf(await tool(m.world, 'pet_say').handler({ text: '【开心】你好<眨眼>呀' }, ctx));
    const say = await p.next((x) => x.t === 'say');
    expect(say.beats).toEqual([{ actions: [], text: '你好呀', anchors: [] }]);
    expect(say).not.toHaveProperty('acts');
    expect(out).toContain('下次带上 feeling');
    expect(out).toContain('不用写标记');
    expect(m.mock.requests).toHaveLength(0);
    // brackets that name no word are the text: code, comparisons
    const code = textOf(await tool(m.world, 'pet_say').handler({ text: '用 <div> 包起来,a < b 而且 c > d' }, ctx));
    const say2 = await p.next((x) => x.t === 'say' && x.id !== say.id);
    expect(say2.beats).toEqual([{ actions: [], text: '用 <div> 包起来,a < b 而且 c > d', anchors: [] }]);
    expect(code).not.toContain('不用写标记');
    const empty = await tool(m.world, 'pet_say').handler({ text: ' ', feeling: 'x' }, ctx);
    expect(empty).toMatchObject({ failed: true });
  });

  it('the keep option everywhere: nothing done', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.answer = () => ({});
    await tool(m.world, 'pet_say').handler({ text: '嗯', feeling: '没什么感觉' }, ctx);
    expect((await p.next((x) => x.t === 'say-acts')).actions).toEqual([]);
    await m.world.decisionsIdle();
    expect((await m.host.deliverDeferred())[0]).toContain('[表情动作] 刚才的气泡:「嗯」没动。');
  });
});

describe('not waiting for decisions', () => {
  it('bubbles and a question go on at once; decisions run in order and the chat records keep the order', async () => {
    const m = await mounted();
    const p = await page(m);
    m.cfg.decider.timeoutMs = 5000;
    m.mock.delayMs = 400;
    m.mock.answer = (r): Record<string, [string, number]> => (r.body.state.includes('第一句') ? { arm: ['招手', .8] } : { head: ['点头', .8] });
    const t0 = Date.now();
    await tool(m.world, 'pet_say').handler({ text: '第一句', feeling: '想打招呼' }, ctx);
    await tool(m.world, 'pet_say').handler({ text: '第二句', feeling: '同意' }, ctx);
    const ask = textOf(await tool(m.world, 'pet_ask').handler({ question: '第三句?', options: ['好'], feeling: '好奇' }, ctx));
    expect(Date.now() - t0).toBeLessThan(300);
    expect(ask).toContain('表情动作照 feeling 自动做');
    // one decision at a time: the second is asked only after the first came back, and sees it
    const first = await p.next((x) => x.t === 'say-acts');
    expect(first.actions).toEqual(['wave']);
    expect(m.mock.requests).toHaveLength(1);
    const second = await p.next((x) => x.t === 'say-acts' && x.id !== first.id);
    expect(second.actions).toEqual(['nod']);
    expect(m.mock.requests[1].body.state).toMatch(/最近做过\(从近到远\):招手/);
    await m.world.decisionsIdle();
    expect(m.mock.requests).toHaveLength(3);
    expect(m.records.map((r) => r.tool)).toEqual(['pet_say', 'pet_say', 'pet_ask']);
    // the chat page: the two bubbles (with their moods) before the question
    const kinds = m.host.stored.filter((e) => (e.meta as { kind?: string } | undefined)?.kind).map((e) => `${(e.meta as { kind: string }).kind}:${e.text}`);
    expect(kinds).toEqual(['say:第一句', 'say:第二句', 'ask:第三句?']);
    // and the next position line tells all three, once
    const [line] = await m.host.deliverDeferred();
    expect(line).toContain('[表情动作] 刚才的气泡:「第一句」招手;「第二句」点头;「第三句?」点头。');
  });

  it('a stop drops the decisions still waiting', async () => {
    const m = await mounted();
    const p = await page(m);
    void p;
    m.cfg.decider.timeoutMs = 5000;
    m.mock.delayMs = 300;
    await tool(m.world, 'pet_say').handler({ text: '一', feeling: '嗯' }, ctx);
    await tool(m.world, 'pet_say').handler({ text: '二', feeling: '嗯' }, ctx);
    await m.world.stop();
    await m.world.decisionsIdle();
    expect(m.mock.requests.length).toBeLessThanOrEqual(1);
  });
});

describe('pet_feel', () => {
  it('does the picked words at once, and a posture says how long it holds', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.answer = () => ({ body: ['坐下', .8], face: ['开心', .5] });
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '聊累了,想坐着歇会儿' }, ctx));
    const act = await p.next((x) => x.t === 'act');
    expect(act.actions).toEqual(['sit+happy']);
    expect(out).toContain('做了:坐下+开心。');
    expect(out).toContain('坐下 一直保持');
    expect(out).toContain('[位置]');
    // sleep is offered when she does not talk
    expect(Object.keys(m.mock.requests[0].body.questions.body.criteria)).toContain('睡觉');
  });

  it('asked to sleep, she sleeps: the posture beats a likelier sleepy face, and needs less than on a bubble', async () => {
    const m = await mounted();
    const p = await page(m);
    // recorded: 犯困 came out likelier than 睡觉, and the sleep was dropped as clashing with it
    m.mock.answer = () => ({ face: ['犯困', .8], body: ['睡觉', .62] });
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '困了,道过晚安,去睡觉' }, ctx));
    expect((await p.next((x) => x.t === 'act')).actions).toEqual(['sleep']);
    expect(out).toContain('做了:睡觉。');
    expect(m.records[0].why.face).toContain('留下姿势');
  });

  it('a posture on pet_feel needs about half: lying down at .61 is done', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.answer = () => ({ body: ['趴下', .61] });
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '想趴一会儿' }, ctx));
    expect((await p.next((x) => x.t === 'act')).actions).toEqual(['lie']);
    expect(out).toContain('做了:趴下。');
  });

  it('tracks a kneel the page shows as sitting, until a word ends it', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.answer = () => ({ body: ['跪坐', .8] });
    await tool(m.world, 'pet_feel').handler({ feeling: '端端正正坐好听你说' }, ctx);
    p.send({ t: 'pose', x: 1190, w: 1920, facing: -1, mode: 'sit' });
    await expect.poll(() => m.world.positionLine()).toContain('跪坐');
    // Coo's kneel ends on an arm gesture
    m.mock.answer = () => ({ arm: ['招手', .8] });
    await tool(m.world, 'pet_feel').handler({ feeling: '想跟你打个招呼' }, ctx);
    expect(m.world.positionLine()).toContain('坐着');
    p.send({ t: 'pose', x: 1190, w: 1920, facing: -1, mode: 'idle' });
    await expect.poll(() => m.world.positionLine()).toContain('站着');
    // the body question leaves out the posture she is in
    p.send({ t: 'pose', x: 1190, w: 1920, facing: -1, mode: 'sit' });
    await expect.poll(() => m.world.positionLine()).toContain('坐着');
    await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx);
    const body = Object.keys(m.mock.requests.at(-1)!.body.questions.body.criteria);
    expect(body).not.toContain('坐下');
    expect(body[0]).toBe('保持现在的姿势(现在:坐着)');
  });

  it('a failure does nothing and is not marked failed', async () => {
    const m = await mounted();
    await page(m);
    m.mock.status = 401;
    const out = await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx);
    expect(out).not.toMatchObject({ failed: true });
    expect(textOf(out)).toContain('决策模型没回应');
  });
});

describe('posture between calls', () => {
  it('a posture word just sent is her posture until the page shows it: the receipt, the next question and the state', async () => {
    const m = await mounted();
    const p = await page(m);
    m.mock.answer = () => ({ body: ['坐下', .8] });
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '聊累了,想坐着歇会儿' }, ctx));
    expect((await p.next((x) => x.t === 'act')).actions).toEqual(['sit']);
    // the page has not said yet: the receipt already tells it
    expect(out).toMatch(/\n\[位置\] [^\n]*,坐着;/);
    m.mock.answer = () => ({});
    await tool(m.world, 'pet_say').handler({ text: '好舒服', feeling: '放松' }, ctx);
    await m.world.decisionsIdle();
    const req = m.mock.requests.at(-1)!.body;
    expect(req.state).toContain('她现在:坐着');
    expect(Object.keys(req.questions.body.criteria)).not.toContain('坐下');
    expect(Object.keys(req.questions.body.criteria)[0]).toBe('保持现在的姿势(现在:坐着)');
    // the page sits, then gets up on its own: the page is believed again
    p.send({ t: 'pose', x: 1190, w: 1920, facing: -1, mode: 'sit' });
    await expect.poll(() => m.world.positionLine()).toContain('坐着');
    p.send({ t: 'pose', x: 1190, w: 1920, facing: -1, mode: 'idle' });
    await expect.poll(() => m.world.positionLine()).toContain('站着');
  });

  it('a kneel sent while standing survives a report from before it showed', async () => {
    const m = await mounted({ patch: (c) => { c.skin.figure = 'claude-chan'; } });
    const p = await page(m);
    m.mock.answer = () => ({ body: ['跪坐', .8] });
    await tool(m.world, 'pet_feel').handler({ feeling: '乖乖坐好' }, ctx);
    expect(m.world.positionLine()).toContain('跪坐');
    // a facing report while still standing (the kneel starts on the next frame)
    p.send({ t: 'pose', x: 1190, w: 1920, facing: 1, mode: 'idle' });
    await expect.poll(() => m.world.positionLine()).toContain('面朝右');
    p.send({ t: 'pose', x: 1190, w: 1920, facing: 1, mode: 'sit' });
    await expect.poll(() => m.world.positionLine()).toContain('跪坐');
  });
});

describe('the body on screen', () => {
  it('a figure switch rebuilds the questions from the new pack', async () => {
    const m = await mounted({ patch: (c) => { c.skin.figure = 'claude-chan'; c.skin.scheme = 'original'; } });
    const p = await page(m);
    m.mock.answer = () => ({ arm: ['招手', .8] });
    await tool(m.world, 'pet_feel').handler({ feeling: '打个招呼' }, ctx);
    await tool(m.world, 'pet_feel').handler({ feeling: '再打个招呼' }, ctx);
    expect(Object.keys(m.mock.requests[0].body.questions)).toEqual(['face', 'head', 'arm', 'body']);
    expect(m.mock.requests[0].body.state).toContain('Claude 娘');
    const set = textOf(await tool(m.world, 'pet_set').handler({ figure: 'gpt-chan' }, ctx));
    expect(set).not.toContain('没执行');
    const gpt = figurePacks([]).packs.find((x) => x.id === 'gpt-chan')!.manifest;
    const wing = gpt.vocab.find((v) => v.kind === 'motion' && /翅膀/.test(JSON.stringify(v.names.zh)))!;
    m.mock.answer = () => ({ arm: ['招手', .8], wings: [firstName(wing), .7] });
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '开心得想扑腾' }, ctx));
    const req = m.mock.requests.at(-1)!.body;
    expect(Object.keys(req.questions)).toEqual(['face', 'head', 'arm', 'body', 'tail', 'wings']);
    expect(req.state).toContain('GPT 娘');
    expect(req.state).not.toContain('Claude 娘');
    // the options are the new pack's words, and what it picked is done with no word dropped
    expect(Object.keys(req.questions.wings.criteria)).toContain(firstName(wing));
    const act = await p.next((x) => x.t === 'act' && JSON.stringify(x.actions).includes(wing.id));
    expect((act.actions as string[]).join('+').split('+')).toContain(wing.id);
    expect(m.records.at(-1)).toMatchObject({ ok: true, dropped: [] });
    expect(out).toContain(firstName(wing));
  });

  it("a third-party pack: its own words, English-only names and abouts, no prompt change", async () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    mkdirSync(join(root, 'robot'));
    writeFileSync(join(root, 'robot', 'figure.json'), JSON.stringify({
      manifest: 2, api: 2, id: 'robot', name: { en: 'Robot' }, about: { en: 'a small robot' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [],
      vocab: [
        { id: 'happy', kind: 'expression', names: { en: ['joyful'] }, about: { en: 'smiles' }, seconds: 1 },
        { id: 'glow', kind: 'expression', names: {}, about: { en: 'eyes glow' }, seconds: 1 },
        { id: 'beep', kind: 'motion', names: { zh: ['哔哔'] }, about: { en: 'beeps and shakes' }, seconds: 1 },
        { id: 'nod', kind: 'motion', names: { zh: ['点头'] }, about: { zh: '点点头' }, seconds: 1 },
        { id: 'sit', kind: 'motion', names: { zh: ['坐下'] }, about: { zh: '坐下' }, seconds: 2, lasting: true },
      ],
    }));
    const m = await mounted({ patch: (c) => { c.skin.figure = 'robot'; }, extra: { packRoots: () => [root] } });
    const p = await page(m);
    m.mock.answer = () => ({ face: ['happy', .7], body: ['哔哔', .8] });
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '高兴' }, ctx));
    const req = m.mock.requests[0].body;
    expect(Object.keys(req.questions)).toEqual(['face', 'head', 'body']);
    expect(req.questions.face.criteria).toMatchObject({ happy: expect.stringContaining('smiles'), glow: expect.stringContaining('eyes glow') });
    // an id the kit does not know takes the whole body
    expect(Object.keys(req.questions.body.criteria)).toEqual(['保持现在的姿势(现在:站着)', '哔哔', '坐下']);
    expect((await p.next((x) => x.t === 'act')).actions).toEqual(['beep+happy']);
    expect(m.records[0]).toMatchObject({ ok: true, dropped: [], notes: [] });
    expect(out).toContain('做了:哔哔+happy。');
    // the prompt is the same text for any pack: no word of it
    const env = m.world.envPromptVars();
    expect(env['pet.vocab']).toBe('');
    expect(JSON.stringify(m.world.tools().map((t) => [t.description, t.parameters]))).not.toContain('哔哔');
  });
});

describe('a decision slower than the hold', () => {
  it('the bubble goes on after the hold, and the words follow while it types', async () => {
    const m = await mounted();
    const p = await page(m);
    // roomy: the decision is slower than the hold, well inside the timeout
    m.cfg.decider.timeoutMs = 5000;
    m.mock.delayMs = 1300;
    m.mock.answer = () => ({ arm: ['招手', .8] });
    const t0 = Date.now();
    await tool(m.world, 'pet_say').handler({ text: '慢慢来', feeling: '想招手' }, ctx);
    expect(Date.now() - t0).toBeLessThan(500);
    const say = await p.next((x) => x.t === 'say');
    expect(say).toMatchObject({ acts: 'pending', holdMs: 1100 });
    const acts = await p.next((x) => x.t === 'say-acts');
    expect(acts).toMatchObject({ id: say.id, actions: ['wave'] });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1200);
  });
});

describe('pet_walk', () => {
  it('walks by pixels, stops at the edge and says so', async () => {
    const m = await mounted();
    const p = await page(m, { x: 100, w: 1920, facing: 1, mode: 'idle' });
    const left = tool(m.world, 'pet_walk').handler({ direction: 'left', pixels: 500 }, ctx);
    const w1 = await p.next((x) => x.t === 'walk');
    expect(w1).toMatchObject({ to: 0, run: false });
    p.send({ t: 'arrived', walkId: w1.id, x: 0.01 });
    const out1 = textOf(await left);
    expect(out1).toMatch(/^本来要往左走 500 像素,左边只剩约 81 像素,走到屏幕边停下了,在 19\/1920\(1%\)。/);
    expect(out1).toContain('[位置] 屏幕横向 19/1920');
    const right = tool(m.world, 'pet_walk').handler({ direction: 'right', pixels: 300, run: true }, ctx);
    const w2 = await p.next((x) => x.t === 'walk');
    expect(w2.to as number).toBeCloseTo(319 / 1920, 3);
    expect(w2.run).toBe(true);
    p.send({ t: 'arrived', walkId: w2.id, x: w2.to });
    expect(textOf(await right)).toMatch(/^往右跑了 300 像素,到了 319\/1920\(17%\)。/);
  });

  it('a lasting posture is left standing up; bad arguments and an unknown place fail', async () => {
    const m = await mounted();
    expect(await tool(m.world, 'pet_walk').handler({ direction: 'up', pixels: 5 }, ctx)).toMatchObject({ failed: true });
    expect(await tool(m.world, 'pet_walk').handler({ direction: 'left', pixels: 0 }, ctx)).toMatchObject({ failed: true });
    const p0 = await FakePage.open(origin(m.world));
    cleanup.push(() => p0.close());
    expect(textOf(await tool(m.world, 'pet_walk').handler({ direction: 'left', pixels: 5 }, ctx))).toContain('还不知道桌宠在哪');
    p0.send({ t: 'pose', x: 960, w: 1920, facing: 1, mode: 'sit' });
    await expect.poll(() => m.world.positionLine()).toContain('坐着');
    const go = tool(m.world, 'pet_walk').handler({ direction: 'right', pixels: 100 }, ctx);
    const w = await p0.next((x) => x.t === 'walk');
    p0.send({ t: 'arrived', walkId: w.id, x: w.to });
    expect(textOf(await go)).toMatch(/^先站起来,往右走了 100 像素/);
  });
});

describe('position on every call', () => {
  it('keeps one piggyback event that renders the pose at delivery, then arms the next', async () => {
    const m = await mounted();
    expect(m.host.deferred).toHaveLength(1);
    expect(m.host.deferred[0].opts).toEqual({ trigger: 'piggyback' });
    expect(m.host.deferred[0].spec).toMatchObject({ type: 'desktop-pet.pose', tags: ['snapshot'] });
    const p = await page(m, { x: 100, w: 1920, facing: 1, mode: 'idle' });
    // the pose changes after it was armed: the line tells the newer one
    p.send({ t: 'pose', x: 1700, w: 1920, facing: -1, mode: 'lie' });
    await expect.poll(() => m.world.positionLine()).toContain('1700');
    expect(m.host.deferred).toHaveLength(1);
    const [line] = await m.host.deliverDeferred();
    expect(line).toMatch(/^\[位置\] 屏幕横向 1700\/1920 像素\(89%\),面朝左,趴着;/);
    await expect.poll(() => m.host.deferred.length).toBe(1);
    // no page: nothing rendered
    await p.close();
    await expect.poll(async () => { const r = await m.host.deliverDeferred(); return r.length === 0 || r[0] === null; }).toBe(true);
  });

  it('classic receipts carry no position line', async () => {
    const m = await mounted({ key: '' });
    const p = await page(m);
    void p;
    const out = textOf(await tool(m.world, 'pet_say').handler({ script: '你好' }, ctx));
    expect(out).not.toContain('[位置]');
  });
});

describe('breaker and the key', () => {
  it('opens after three failures in a row for 60 s, then tries again', async () => {
    let now = 1_000_000;
    let calls = 0;
    const fakeFetch = (async () => { calls++; return new Response('nope', { status: 503 }); }) as typeof fetch;
    const m = await mounted({ extra: { deciderFetch: fakeFetch, deciderNow: () => now } });
    await page(m);
    for (let i = 0; i < 3; i++) await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx);
    expect(calls).toBe(3);
    expect(m.logs.filter((l) => l.startsWith('warn') && l.includes('连续 3 次失败'))).toHaveLength(1);
    const out = textOf(await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx));
    expect(calls).toBe(3);
    expect(out).toContain('暂时用不了');
    expect(m.world.console().lamps!.find((l) => l.label === '表情决策')).toMatchObject({ state: 'error' });
    // a bubble meanwhile is not held for words that will not come
    const p2 = await FakePage.open(origin(m.world));
    cleanup.push(() => p2.close());
    await tool(m.world, 'pet_say').handler({ text: '嗯', feeling: '嗯' }, ctx);
    expect(await p2.next((x) => x.t === 'say')).not.toHaveProperty('acts');
    now += 60_001;
    await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx);
    expect(calls).toBe(4);
  });

  it('never lets the key out: logs, events, receipts, records, state', async () => {
    const leaky = (async (_url: unknown, init?: RequestInit) => {
      throw new Error(`connect failed with header ${String((init?.headers as Record<string, string>).Authorization)}`);
    }) as typeof fetch;
    const m = await mounted({ extra: { deciderFetch: leaky } });
    const p = await page(m);
    const outs: unknown[] = [];
    outs.push(await tool(m.world, 'pet_say').handler({ text: '你好', feeling: '开心' }, ctx));
    outs.push(await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx));
    outs.push(await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx));
    outs.push(await tool(m.world, 'pet_feel').handler({ feeling: '嗯' }, ctx));
    await m.world.decisionsIdle();
    expect(m.records[0].failure).toContain('Bearer ***');
    const all = JSON.stringify({ outs, logs: m.logs, events: m.host.events, stored: m.host.stored, records: m.records, state: m.world.petState(), console: m.world.console().lamps, page: p.messages });
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('SECRET');
  });

  it('lists the decision models from the public listing: no key sent, cached, too small a context left out', async () => {
    const m = await mounted({ key: '' });
    type Listing = { models: Array<{ id: string; promptPerM: number | null; context: number | null }>; source: string; minContext: number };
    const r = await m.world.console().invoke!('pet', 'deciders', []) as Listing;
    expect(r.source).toBe('live');
    // cheapest first; the 2k-context one and the chat model are not offered
    expect(r.models).toEqual([
      { id: 'mock/free-decider:free', name: 'Mock free', promptPerM: 0, context: 16384 },
      { id: 'perplexity/pplx-decider-v1.1-27b', name: 'Perplexity: Decider 27B', promptPerM: 0.02, context: 32768 },
    ]);
    expect(r.minContext).toBe(8192);
    expect(m.mock.listed).toEqual([{ url: '/api/v1/models?output_modalities=decisions', auth: undefined }]);
    // kept: a second ask does not fetch again
    await m.world.console().invoke!('pet', 'deciders', []);
    expect(m.mock.listed).toHaveLength(1);
    // with a key lent, still no key on the listing
    m.key.value = KEY;
    await m.world.console().invoke!('pet', 'deciders', [true]);
    expect(m.mock.listed.map((l) => l.auth)).toEqual([undefined, undefined]);
    // the listing down: the last one, then (a fresh World) the ids we know
    m.mock.listStatus = 503;
    expect(await m.world.console().invoke!('pet', 'deciders', [true])).toMatchObject({ source: 'cache', models: r.models });
    const n = await mounted({ key: '' });
    n.mock.listStatus = 503;
    const fb = await n.world.console().invoke!('pet', 'deciders', []) as Listing;
    expect(fb.source).toBe('fallback');
    expect(fb.models[0]).toEqual({ id: 'perplexity/pplx-decider-v1.1-27b', promptPerM: null, context: null });
    expect(fb.models.map((x) => x.id)).toContain('liquid/d1');
  });

  it('a key removed mid-session: bubbles go on without words until the mode switches back', async () => {
    const m = await mounted();
    const p = await page(m);
    m.key.value = '';
    const out = textOf(await tool(m.world, 'pet_say').handler({ text: '嗯', feeling: '嗯' }, ctx));
    expect(out).toContain('没有 OpenRouter 密钥');
    expect(await p.next((x) => x.t === 'say')).not.toHaveProperty('acts');
    expect(m.mock.requests).toHaveLength(0);
  });
});
