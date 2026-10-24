import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { DESKTOP_PET, desktopPetDefinition } from '../src/definition.ts';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import { DesktopPetWorld, type DesktopPetWorldOptions, type PetBotControls } from '../src/world.ts';
import { INLINE_TAG_MAX } from '../src/script.ts';
import { DECIDER_TOOL_DECLS, DESKTOP_PET_TOOL_DECLS } from '../src/tools.ts';
import { FakeHost } from './helpers/fake-host.ts';
import { FakePage } from './helpers/page.ts';
import { HOST_ENV } from '../src/window-host.ts';

const ctx = { role: 'main', log: new FakeHost().log };

function makeWorld(patch: (c: DesktopPetConfigSection) => void = () => {}, extra: Partial<DesktopPetWorldOptions> = {}) {
  const cfg = structuredClone(DESKTOP_PET_DEFAULTS);
  cfg.enabled = true;
  cfg.port = 0;
  cfg.window.enabled = false;
  cfg.asr.enabled = false;
  patch(cfg);
  const dir = mkdtempSync(join(tmpdir(), 'pet-'));
  const persisted: unknown[] = [];
  const world = new DesktopPetWorld({
    cfg, timezone: 'Asia/Shanghai',
    persist: (p) => { persisted.push(p); Object.assign(cfg, p); },
    runtimesRoot: () => join(dir, 'runtimes'), modelsDir: () => join(dir, 'models'),
    ...extra,
  });
  return { world, cfg, persisted };
}

const origin = (w: DesktopPetWorld) => w.petUrl.replace(/\/pet$/, '');
const tool = (w: DesktopPetWorld, name: string) => w.tools().find((t) => t.name === name)!;

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function mounted(patch?: (c: DesktopPetConfigSection) => void, extra?: Partial<DesktopPetWorldOptions>) {
  const made = makeWorld(patch, extra);
  const host = new FakeHost();
  await made.world.start(host);
  cleanup.push(() => made.world.stop());
  return { ...made, host };
}

/** The pet window as its host opens it: a local host process gets the launch URL, and the page connects with its key. */
async function windowPage(world: DesktopPetWorld): Promise<FakePage> {
  const dir = mkdtempSync(join(tmpdir(), 'pet-window-'));
  const file = join(dir, 'url');
  const previous = process.env[HOST_ENV];
  process.env[HOST_ENV] = JSON.stringify([process.execPath, '-e',
    'require("node:fs").writeFileSync(process.argv[1], process.argv.find(a => a.startsWith("--pet-url=")).slice(10)); setInterval(() => {}, 1000);', '--', file]);
  try { world.openWindow(); } finally {
    if (previous === undefined) delete process.env[HOST_ENV];
    else process.env[HOST_ENV] = previous;
  }
  cleanup.push(async () => { rmSync(dir, { recursive: true, force: true }); });
  await expect.poll(() => existsSync(file) && readFileSync(file, 'utf8').length > 0).toBe(true);
  const url = new URL(readFileSync(file, 'utf8'));
  const key = new URLSearchParams(url.hash.slice(1)).get('key');
  expect(key).toBeTruthy();
  expect(world.petUrl).toBe(`${url.origin}/pet`);
  expect(JSON.stringify(world.petState())).not.toContain(key);
  return FakePage.open(url.origin, new URLSearchParams({ role: 'pet', host: 'window', key: key! }).toString());
}

describe('definition', () => {
  it('passes the extension dry mount', async () => {
    const report = await dryMountWorld(DESKTOP_PET as never, { scratchDir: mkdtempSync(join(tmpdir(), 'pet-dry-')), packageDir: fileURLToPath(new URL('../', import.meta.url)), hasWebUiClient: true });
    expect(report.failures).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});

describe('tools without a page', () => {
  it('fail and say the window is not connected', async () => {
    const { world } = await mounted();
    const out = await tool(world, 'pet_say').handler({ script: '你好' }, ctx);
    expect(out).toMatchObject({ failed: true });
    expect((out as { text: string }).text).toContain('没有连接');
  });
});

describe('with a pet page', () => {
  it('pet_say sends parsed beats and reports dropped markers', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_say').handler({ script: '【开心,飞】你好<眨眼>呀' }, ctx) as { text: string };
    const say = await page.next((m) => m.t === 'say');
    expect(say.beats).toEqual([{ actions: ['happy'], text: '你好呀', anchors: [{ at: 2, actions: ['wink'] }] }]);
    expect(out.text).toContain('飞');
  });

  it('pet_ask delivers the chosen option as an answer event that wakes', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    await tool(world, 'pet_ask').handler({ question: '喝什么?', options: ['茶', '咖啡', '水', '果汁'] }, ctx);
    const ask = await page.next((m) => m.t === 'ask');
    expect(ask.options).toEqual(['茶', '咖啡', '水']);
    page.send({ t: 'answer', askId: ask.id, index: 1 });
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.answer', source: 'desktop-pet', text: '[回答] 伙伴回答「喝什么?」:选了第 2 项「咖啡」' });
    expect(host.pushOpts[0]).toEqual({ trigger: 'flush' });
  });

  it('pet_ask reports a free answer and a dismissal', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    await tool(world, 'pet_ask').handler({ question: 'A?', options: ['x'] }, ctx);
    const a1 = await page.next((m) => m.t === 'ask');
    page.send({ t: 'answer', askId: a1.id, text: '都不要' });
    await expect.poll(() => host.events.length).toBe(1);
    await tool(world, 'pet_ask').handler({ question: 'B?', options: ['y'] }, ctx);
    const a2 = await page.next((m) => m.t === 'ask');
    page.send({ t: 'answer', askId: a2.id, dismissed: true });
    await expect.poll(() => host.events.length).toBe(2);
    expect(host.events.map((e) => e.text)).toEqual(['[回答] 伙伴回答「A?」:自己写了:「都不要」', '[回答] 伙伴关掉了提问「B?」,没有作答。']);
  });

  it('an answer to a replaced question is ignored', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    await tool(world, 'pet_ask').handler({ question: 'old?', options: ['x'] }, ctx);
    const old = await page.next((m) => m.t === 'ask');
    const out = await tool(world, 'pet_say').handler({ script: '算了' }, ctx) as { text: string };
    expect(out.text).toContain('替换了还没回答的提问「old?」');
    page.send({ t: 'answer', askId: old.id, index: 0 });
    page.send({ t: 'text', text: 'ping' });
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0].type).toBe('desktop-pet.message');
  });

  it('pet_walk_to waits for the page to report arrival or interruption', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const arriving = tool(world, 'pet_walk_to').handler({ to: 'right', run: true }, ctx);
    const walk = await page.next((m) => m.t === 'walk');
    expect(walk).toMatchObject({ to: .95, run: true });
    page.send({ t: 'arrived', walkId: walk.id, x: .95 });
    expect(await arriving).toEqual({ text: '走到了屏幕横向 95% 处。' });

    const interrupted = tool(world, 'pet_walk_to').handler({ to: .1 }, ctx);
    const w2 = await page.next((m) => m.t === 'walk');
    page.send({ t: 'interrupted', walkId: w2.id, x: .4, by: 'drag' });
    expect(await interrupted).toEqual({ text: '没走到:走到 40% 处时被伙伴拎起来了。' });
  });

  it('pet_walk_to returns at once with a plain reason when the body cannot start walking', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const started = Date.now();
    const refused = tool(world, 'pet_walk_to').handler({ to: 'left' }, ctx);
    const walk = await page.next((m) => m.t === 'walk');
    // carried, in the air or rolling: the figure frame reports the walk interrupted by 'busy' in its next frame
    page.send({ t: 'interrupted', walkId: walk.id, x: .6, by: 'busy' });
    expect(await refused).toEqual({ text: '没走:身体正忙(被拎着、在跳、在空中或在翻滚),没法起步,还在屏幕横向 60% 处。等它落地站稳再走。' });
    expect(Date.now() - started).toBeLessThan(5000);
    const early = tool(world, 'pet_walk_to').handler({ to: 'right' }, ctx);
    page.send({ t: 'interrupted', walkId: (await page.next((m) => m.t === 'walk')).id, x: .5, by: 'none' });
    expect(await early).toEqual({ text: '没走:桌宠的身体还没准备好。' });
  });

  it('pet_walk_to across a wide stage waits as long as the walk takes, and on while the page says she is walking', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const seen = (mode: string) => expect.poll(() => (world as unknown as { pose: { mode: string } | null }).pose?.mode).toBe(mode);
    page.send({ t: 'pose', x: 100, w: 3840, facing: 1, mode: 'idle' });
    await seen('idle');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    cleanup.push(async () => { vi.useRealTimers(); });
    let settled = false;
    // 3548 px at 78 px/s is 45 s of walking: more than the old fixed 30 s
    const far = tool(world, 'pet_walk_to').handler({ to: 'right' }, ctx).finally(() => { settled = true; });
    const walk = await page.next((m) => m.t === 'walk');
    page.send({ t: 'pose', x: 120, w: 3840, facing: 1, mode: 'walk' });
    await seen('walk');
    await vi.advanceTimersByTimeAsync(35_000);
    expect(settled).toBe(false);
    // past its time (about 67 s) but the page still reports her walking: it waits on
    await vi.advanceTimersByTimeAsync(40_000);
    expect(settled).toBe(false);
    page.send({ t: 'arrived', walkId: walk.id, x: .95 });
    expect(await far).toEqual({ text: '走到了屏幕横向 95% 处。' });

    // a walk the page no longer reports under way times out at its time, and says how long that was
    page.send({ t: 'pose', x: 3648, w: 3840, facing: 1, mode: 'idle' });
    await seen('idle');
    const lost = tool(world, 'pet_walk_to').handler({ to: 'left' }, ctx);
    await page.next((m) => m.t === 'walk');
    await vi.advanceTimersByTimeAsync(66_000);
    expect(await lost).toEqual({ text: '65 秒内没有走到。' });
  });

  it('pet_walk_to rejects a target it cannot read', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(await tool(world, 'pet_walk_to').handler({ to: 'moon' }, ctx)).toMatchObject({ failed: true });
  });

  it('pet_walk_to cursor asks the page where the pointer is, stops beside it and says where both were', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'pose', x: 400, w: 2000, facing: 1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(400);
    const going = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, ctx);
    const q = await page.next((m) => m.t === 'pointer?');
    page.send({ t: 'pointer', id: q.id, x: 1500, w: 2000 });
    const walk = await page.next((m) => m.t === 'walk');
    // beside the pointer, not under it: half her standing width plus 8 px (the kit's minX(0), 52 px at scale 1) short of it
    expect(walk.to).toBeCloseTo(1448 / 2000, 6);
    page.send({ t: 'arrived', walkId: walk.id, x: walk.to });
    expect(await going).toEqual({ text: '鼠标在屏幕横向 75% 处;往右走,到了它左边,在屏幕横向 72% 处。' });

    // the pointer right beside her: no walk
    page.send({ t: 'pose', x: 1448, w: 2000, facing: 1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(1448);
    const stay = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, ctx);
    page.send({ t: 'pointer', id: (await page.next((m) => m.t === 'pointer?')).id, x: 1490, w: 2000 });
    expect(await stay).toEqual({ text: '鼠标在屏幕横向 75% 处,就在你旁边(你在屏幕横向 72% 处),不用走。' });
    expect(page.messages.some((m) => m.t === 'walk')).toBe(false);

    // the pointer on another screen: she does not walk to the middle, she says so
    const off = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, ctx);
    page.send({ t: 'pointer', id: (await page.next((m) => m.t === 'pointer?')).id, x: null, w: 2000 });
    expect(await off).toEqual({ text: '[pet_walk_to 没执行] 鼠标不在桌宠所在的这块屏幕上,不知道往哪走。', failed: true });
  });

  it('pet_walk_to away walks a third of the screen away from the pointer, and stops at the edge', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'pose', x: 1000, w: 1800, facing: 1, mode: 'sit' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(1000);
    const away = tool(world, 'pet_walk_to').handler({ to: 'away', run: true }, ctx);
    page.send({ t: 'pointer', id: (await page.next((m) => m.t === 'pointer?')).id, x: 1200, w: 1800 });
    const walk = await page.next((m) => m.t === 'walk');
    expect(walk).toMatchObject({ to: 400 / 1800, run: true });
    page.send({ t: 'arrived', walkId: walk.id, x: walk.to });
    expect(await away).toEqual({ text: '鼠标在屏幕横向 67% 处;先站起来,往左跑躲开它,到了屏幕横向 22% 处。' });

    page.send({ t: 'pose', x: 200, w: 1800, facing: -1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(200);
    const edge = tool(world, 'pet_walk_to').handler({ to: 'away' }, ctx);
    page.send({ t: 'pointer', id: (await page.next((m) => m.t === 'pointer?')).id, x: 900, w: 1800 });
    const w2 = await page.next((m) => m.t === 'walk');
    // the kit's edge: 52 px in at scale 1
    expect(w2.to).toBeCloseTo(52 / 1800, 6);
    page.send({ t: 'arrived', walkId: w2.id, x: 52 / 1800 });
    expect(await edge).toEqual({ text: '鼠标在屏幕横向 50% 处;往左走躲开它,走到屏幕边停下了,在屏幕横向 3% 处。' });

    // cornered: already at the edge on the far side from the pointer (where the kit stops her: x = 52 at scale 1)
    page.send({ t: 'pose', x: 52, w: 1800, facing: -1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(52);
    const cornered = tool(world, 'pet_walk_to').handler({ to: 'away' }, ctx);
    page.send({ t: 'pointer', id: (await page.next((m) => m.t === 'pointer?')).id, x: 600, w: 1800 });
    expect(await cornered).toEqual({ text: '鼠标在屏幕横向 33% 处;你已经在屏幕左边(屏幕横向 3% 处),没处可躲了,没走。' });
  });

  it('pet_walk_to cursor with a page that does not answer walks where the page last saw the pointer; away fails', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const going = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, ctx);
    await page.next((m) => m.t === 'pointer?');
    const walk = await page.next((m) => m.t === 'walk', 3000);
    expect(walk.to).toBe('cursor');
    page.send({ t: 'arrived', walkId: walk.id, x: .3 });
    expect(await going).toEqual({ text: '没问到鼠标这会儿在哪,朝桌宠页面上次看到它的地方走:走到了屏幕横向 30% 处。' });
    const away = tool(world, 'pet_walk_to').handler({ to: 'away' }, ctx);
    await page.next((m) => m.t === 'pointer?');
    expect(await away).toEqual({ text: '[pet_walk_to 没执行] 没问到鼠标在哪(桌宠页面没有回答),稍后再试。', failed: true });
  });

  it('pet_act forwards known actions', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['跳', 'happy', 'sit', 'fly'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['jump', 'happy', 'sit']);
    expect(out.text).toContain('sit 一直保持:做手势、换表情不影响');
    expect(out.text).toContain('fly');
  });

  it('pet_act says lying down lasts through gestures and kneeling only until the next motion', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['趴下', '点头', 'lie'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['lie', 'nod', 'lie']);
    // said once, and not "until the next motion": a nod does not get her up
    expect(out.text.match(/lie 一直保持/g)).toHaveLength(1);
    expect(out.text).toContain('换别的姿势或走、跑、跳这类全身动作才结束');
    expect(out.text).not.toContain('保持到下一个动作');
    const kneel = await tool(world, 'pet_act').handler({ actions: ['跪坐'] }, ctx) as { text: string };
    expect(kneel.text).toContain('kneel 保持到下一个手或全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头不影响');
  });

  it('pet_act sends words at once as one entry, and says what it had to do one after another', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['坐下+开心+招手', '招手+比心', '跪坐 + 开心'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['sit+wave+happy', 'wave', 'heart', 'kneel+happy']);
    expect(out.text).toContain('开始依次做:sit+wave+happy → wave → heart → kneel+happy。');
    expect(out.text).toContain('[执行参数] 招手 和 比心 不能同时做,改成先后做。');
    // the lasting words inside groups are said once each
    expect(out.text).toContain('sit 一直保持');
    expect(out.text).toContain('kneel 保持到下一个手或全身动作');
  });

  it('pet_say reports split groups and dropped members, and a dialog sends a group', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_say').handler({ script: '【开心+飞起来】好呀【招手+比心】再见' }, ctx) as { text: string };
    const beats = (await page.next((m) => m.t === 'say')).beats as Array<{ actions: string[] }>;
    expect(beats.map((b) => b.actions)).toEqual([['happy'], ['wave', 'heart']]);
    expect(out.text).toContain('[执行参数] 当前形象的词表里没有这些标记,已略过:飞起来。招手 和 比心 不能同时做,改成先后做。');
    const d = world.dialog({ text: '你好', actions: ['开心+跳', '飞'] });
    expect((await page.next((m) => m.t === 'dialog')).actions).toEqual(['jump+happy']);
    expect(d.dropped).toEqual(['飞']);
    d.close();
  });

  it('tells the bot how to write words at once', () => {
    const { world } = makeWorld();
    const env = readFileSync(fileURLToPath(new URL('../src/ENV_PROMPT.md', import.meta.url)), 'utf8');
    expect(env).toContain('| 【词+词】 |');
    expect(env).toContain('用 + 连起来的词同时做,用逗号隔开的先后做');
    expect(env).toContain(`最多 ${INLINE_TAG_MAX} 字,不跨行`);
    expect(env).toContain('石化除外');
    // the worked example comes right after the rule, before the words
    expect(env.indexOf('{{pet.vocab}}') - env.indexOf('用逗号隔开的先后做')).toBeLessThan(400);
    expect(world.envPromptVars()['pet.vocab']).toMatch(/^例:`【[^`]+\+[^`]+】/);
    expect(world.envPromptVars()['pet.vocab']).toContain('- nod 点头/轻轻点头/连连点头/猛点头/使劲点头:');
    expect(world.envPromptVars()['pet.vocab']).toContain('- tilt 歪头/歪脑袋/偏头/好奇:');
    expect(JSON.stringify(tool(world, 'pet_say').parameters)).toContain('+ 连起来的词同时做,逗号隔开的先后做');
    expect(JSON.stringify(tool(world, 'pet_say').parameters)).not.toContain('【表情,动作】');
    expect(env).toContain('说话间用点头、摇头、叹气、歪头接话');
    expect(JSON.stringify(tool(world, 'pet_act').parameters)).toContain('同时做的几个词用 + 连起来');
  });

  it('takes the words of the body on screen: a pack\'s own, and Coo\'s once the page says the pack would not run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    mkdirSync(join(root, 'robot'));
    writeFileSync(join(root, 'robot', 'figure.json'), JSON.stringify({
      manifest: 2, api: 2, id: 'robot', name: { zh: '机器人' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [],
      vocab: [{ id: 'beep', kind: 'motion', names: { zh: ['哔哔'] }, about: { zh: '哔一声' }, seconds: 1 }],
    }));
    const { world } = await mounted((c) => { c.skin.figure = 'robot'; }, { packRoots: () => [root] });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const act = tool(world, 'pet_act').handler;
    await act({ actions: ['哔哔', '坐下'] }, ctx);
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['beep']);
    page.send({ t: 'figure', id: 'robot', ok: false, reason: 'broken' });
    await expect.poll(async () => (await act({ actions: ['坐下'] }, ctx) as { failed?: boolean }).failed).toBeUndefined();
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['sit']);
  });

  it('keeps two expressions of one group together for a figure that shows them as one face, says so, and tells the bot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    const coo = JSON.parse(readFileSync(fileURLToPath(new URL('../web/coo/figure.json', import.meta.url)), 'utf8'));
    mkdirSync(join(root, 'paired'));
    writeFileSync(join(root, 'paired', 'figure.json'), JSON.stringify({ ...coo, id: 'paired', pairs: { 'happy+surprised': 'surprised+happy', 'smug+happy': 'smirk' } }));
    const { world } = await mounted((c) => { c.skin.figure = 'paired'; }, { packRoots: () => [root] });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['开心+惊讶'] }, ctx) as { text: string };
    // eyes first, as the manifest says: the body composes the first face's eyes with the second's mouth
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['surprised+happy']);
    expect(out.text).toContain('开始依次做:surprised+happy。');
    expect(out.text).toContain('[执行参数] 开心 和 惊讶 合成了一张脸:惊讶的眼睛,开心的嘴。');
    const said = await tool(world, 'pet_say').handler({ script: '【得意+开心】好' }, ctx) as { text: string };
    expect(((await page.next((m) => m.t === 'say')).beats as Array<{ actions: string[] }>)[0]!.actions).toEqual(['smirk']);
    expect(said.text).toContain('得意 和 开心 合成了一张脸:坏笑。');
    const vocab = world.envPromptVars()['pet.vocab'];
    expect(vocab).toContain('- smirk 坏笑/贼笑(=开心+得意):');
    expect(vocab).toContain('表情对(写在同一组里会合成一张脸,先写哪个都行;如【开心+惊讶】是惊讶的眼睛配开心的嘴):开心+惊讶\n');
  });

  it('splits two expressions of one group for a figure that lists no pairs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    const { pairs: _, ...coo } = JSON.parse(readFileSync(fileURLToPath(new URL('../web/coo/figure.json', import.meta.url)), 'utf8'));
    mkdirSync(join(root, 'unpaired'));
    writeFileSync(join(root, 'unpaired', 'figure.json'), JSON.stringify({ ...coo, id: 'unpaired' }));
    const { world } = await mounted((c) => { c.skin.figure = 'unpaired'; }, { packRoots: () => [root] });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['开心+惊讶'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['happy', 'surprised']);
    expect(out.text).toContain('[执行参数] 开心 和 惊讶 不能同时做,改成先后做。');
    await tool(world, 'pet_say').handler({ script: '【得意+开心】好' }, ctx);
    expect(((await page.next((m) => m.t === 'say')).beats as Array<{ actions: string[] }>).map((b) => b.actions)).toEqual([['smug', 'happy']]);
    expect(world.envPromptVars()['pet.vocab']).not.toContain('合成一张脸');
  });

  it("built-in Coo merges only the pairs on its own list and tells the bot which", async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    // happy+surprised is a pair of the girls and the whale, not of Coo (no mouth to show it with)
    const out = await tool(world, 'pet_act').handler({ actions: ['开心+惊讶'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['happy', 'surprised']);
    expect(out.text).toContain('[执行参数] 开心 和 惊讶 不能同时做,改成先后做。');
    const said = await tool(world, 'pet_say').handler({ script: '【得意+开心】好【开心+嘟嘴】呀【嘟嘴+开心】' }, ctx) as { text: string };
    expect(((await page.next((m) => m.t === 'say')).beats as Array<{ actions: string[] }>).map((b) => b.actions))
      .toEqual([['smirk'], ['happy+pout'], ['happy+pout']]);
    expect(said.text).toContain('得意 和 开心 合成了一张脸:坏笑。');
    expect(said.text).toContain('开心 和 嘟嘴 合成了一张脸:开心的眼睛,嘟嘴的嘴。');
    expect(said.text).toContain('嘟嘴 和 开心 合成了一张脸:开心的眼睛,嘟嘴的嘴。');
    const vocab = world.envPromptVars()['pet.vocab'];
    expect(vocab).toContain('- bashful 腼腆/不好意思(=开心+害羞):');
    expect(vocab).toContain('如【开心+嘟嘴】是开心的眼睛配嘟嘴的嘴):开心+嘟嘴、眨眼+嘟嘴、');
    expect(vocab).not.toMatch(/开心\+惊讶|惊讶\+开心/);
  });

  it('tells the classic bot that only a posture word wakes her (talking, a stretch or a sleepy face do not)', () => {
    const env = readFileSync(fileURLToPath(new URL('../src/ENV_PROMPT.md', import.meta.url)), 'utf8');
    expect(env).toContain('睡着时说话、伸懒腰、犯困都不会醒,要醒就带【站起】或【坐下】。');
  });

  it('tells the bot a walk to the pointer needs no screenshot first: its receipt says where the pointer is', async () => {
    for (const decls of [DESKTOP_PET_TOOL_DECLS, DECIDER_TOOL_DECLS]) {
      const walk = decls.find((d) => d.name === 'pet_walk_to' || d.name === 'pet_walk')!;
      expect(walk.description, walk.name).toContain('回执里说');
      expect(walk.description, walk.name).toContain('找鼠标、走到鼠标那里都不用先截图');
    }
  });

  it('tells the bot a face in a group lasts until the group\'s gestures are done', () => {
    const env = readFileSync(fileURLToPath(new URL('../src/ENV_PROMPT.md', import.meta.url)), 'utf8');
    expect(env).toContain('同一组里的表情至少持续到同组的手势做完。');
  });

  it('shows the built-in whale for a skin naming our whale exported as a pack', async () => {
    const { world } = await mounted((c) => { c.skin.figure = 'coopanion-whale'; c.skin.scheme = 'claude'; });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(page.init.skin).toMatchObject({ figure: 'whale', scheme: 'claude' });
    await tool(world, 'pet_act').handler({ actions: ['跪坐'] }, ctx);
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['kneel']);
    expect(world.envPromptVars()['pet.body']).toContain('大肥鱼');
  });

  it('pet_act does a kneel and a wave at once for a figure that draws arm gestures kneeling, and says how long the kneel lasts', async () => {
    const { world } = await mounted((c) => { c.skin.figure = 'claude-chan'; c.skin.scheme = 'original'; });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['跪坐+招手'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['kneel+wave']);
    expect(out.text).toContain('kneel 保持到下一个全身动作,然后变回普通坐着;换表情、点头、摇头、叹气、歪头、低头、眨眨眼、只占「手」的手势和唱歌都不影响(她跪着做)');
    expect(out.text).not.toContain('不能同时做');
    const cheer = await tool(world, 'pet_act').handler({ actions: ['跪坐+欢呼'] }, ctx) as { text: string };
    expect(cheer.text).toContain('跪坐 和 欢呼 不能同时做,改成先后做。');
    // a song keeps the kneel in the kit (she sings kneeling): one group, no note
    const song = await tool(world, 'pet_act').handler({ actions: ['跪坐+唱歌'] }, ctx) as { text: string };
    expect(song.text).toContain('kneel+song');
    expect(song.text).not.toContain('不能同时做');
  });

  it('pet_act does a kneel and a lean at once for the whale (keepsLeans), and a lean on its own keeps her kneeling', async () => {
    const { world } = await mounted((c) => { c.skin.figure = 'whale'; c.skin.scheme = 'deepseek'; });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const out = await tool(world, 'pet_act').handler({ actions: ['跪坐+凑近'] }, ctx) as { text: string };
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['kneel+closer']);
    expect(out.text).not.toContain('不能同时做');
    expect(out.text).toContain('唱歌和凑近、后仰、晃来晃去都不影响(她跪着做)');
    const kneeling = () => (world as unknown as { kneeling: boolean }).kneeling;
    expect(kneeling()).toBe(true);
    await tool(world, 'pet_act').handler({ actions: ['晃来晃去'] }, ctx);
    expect(kneeling()).toBe(true);
    // a bow still gets her up
    await tool(world, 'pet_act').handler({ actions: ['鞠躬'] }, ctx);
    expect(kneeling()).toBe(false);
  });

  it('dresses as the built-in Claude-chan, with her words (no spout)', async () => {
    const { world } = await mounted((c) => { c.skin.figure = 'claude-chan'; c.skin.scheme = 'original'; });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(page.init.skin).toMatchObject({ figure: 'claude-chan', scheme: 'original' });
    await tool(world, 'pet_act').handler({ actions: ['看书', '喷水'] }, ctx);
    expect((await page.next((m) => m.t === 'act')).actions).toEqual(['read']);
    expect(world.envPromptVars()['pet.body']).toContain('棕色书');
  });

  it('dresses as the built-in GPT-chan, and as her exported pack, with her words (no spout)', async () => {
    for (const figure of ['gpt-chan', 'coopanion-gpt-chan']) {
      const { world } = await mounted((c) => { c.skin.figure = figure; c.skin.scheme = 'original'; });
      const page = await FakePage.open(origin(world));
      cleanup.push(() => page.close());
      expect(page.init.skin).toMatchObject({ figure: 'gpt-chan', scheme: 'original' });
      await tool(world, 'pet_act').handler({ actions: ['看书', '喷水'] }, ctx);
      expect((await page.next((m) => m.t === 'act')).actions).toEqual(['read']);
      expect(world.envPromptVars()['pet.body']).toContain('龙翼');
    }
  });

  it('dresses as the built-in Gemini-chan, and as her exported pack, with her words (no spout)', async () => {
    for (const figure of ['gemini-chan', 'coopanion-gemini-chan']) {
      const { world } = await mounted((c) => { c.skin.figure = figure; c.skin.scheme = 'original'; });
      const page = await FakePage.open(origin(world));
      cleanup.push(() => page.close());
      expect(page.init.skin).toMatchObject({ figure: 'gemini-chan', scheme: 'original' });
      await tool(world, 'pet_act').handler({ actions: ['看书', '喷水'] }, ctx);
      expect((await page.next((m) => m.t === 'act')).actions).toEqual(['read']);
      expect(world.envPromptVars()['pet.body']).toContain('猫耳');
    }
  });

  it('dresses as the built-in Grok-chan, and as her exported pack, with her words (no spout)', async () => {
    for (const figure of ['grok-chan', 'coopanion-grok-chan']) {
      const { world } = await mounted((c) => { c.skin.figure = figure; c.skin.scheme = 'original'; });
      const page = await FakePage.open(origin(world));
      cleanup.push(() => page.close());
      expect(page.init.skin).toMatchObject({ figure: 'grok-chan', scheme: 'original' });
      await tool(world, 'pet_act').handler({ actions: ['看书', '喷水', '摇尾巴'] }, ctx);
      expect((await page.next((m) => m.t === 'act')).actions).toEqual(['read']);
      expect(world.envPromptVars()['pet.body']).toContain('蝙蝠翅膀');
    }
  });

  it('merges repeated pokes into one touch event', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    for (let i = 0; i < 3; i++) page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.touch', text: '[互动] 伙伴戳了你 3 下' });
    expect(host.pushOpts[0]).toEqual({ trigger: 'debounce' });
  });

  it('petting and a drop wait for the next wake; a poke wakes once until a turn ends', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'touch', kind: 'pet' });
    page.send({ t: 'touch', kind: 'grab' });
    page.send({ t: 'touch', kind: 'drop', x: 300 });
    page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(3);
    page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(4);
    world.onTurnEnded();
    page.send({ t: 'touch', kind: 'poke' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(5);
    expect(host.pushOpts.map((o) => o?.trigger)).toEqual(['piggyback', 'piggyback', 'debounce', 'piggyback', 'debounce']);
  });

  it('reports a throw that ends in a crash as one event', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'touch', kind: 'grab' });
    page.send({ t: 'touch', kind: 'throw', x: 300 });
    page.send({ t: 'touch', kind: 'crash' });
    await expect.poll(() => host.events.length, { timeout: 6000 }).toBe(1);
    expect(host.events[0].text).toBe('[互动] 伙伴把你拎起来甩了出去,你重重落地,摔晕了一会儿');
  });

  it('sends no touch events when touch reporting is off', async () => {
    const { world, host } = await mounted((c) => { c.touch.enabled = false; });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'touch', kind: 'poke' });
    page.send({ t: 'text', text: 'hi' });
    await expect.poll(() => host.events.length).toBe(1);
    await new Promise((r) => setTimeout(r, 2800));
    expect(host.events.map((e) => e.type)).toEqual(['desktop-pet.message']);
  });

  it('a skin saved from the dressing page is persisted and pushed to the pet', async () => {
    const { world, persisted } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const skin = { ...DESKTOP_PET_DEFAULTS.skin, head: 'cat', palette: 'fox' };
    const res = await fetch(`${origin(world)}/api/skin`, { method: 'POST', body: JSON.stringify({ skin }) });
    expect(res.status).toBe(200);
    expect(persisted).toContainEqual({ skin });
    expect((await page.next((m) => m.t === 'prefs')).skin).toEqual(skin);
  });

  it('the position the page reports is written once, on stop, and the next run starts there', async () => {
    const made = await mounted((c) => { c.rememberPosition = true; });
    const page = await FakePage.open(origin(made.world));
    page.send({ t: 'position', x: 0.3 });
    page.send({ t: 'position', x: 'left' });
    page.send({ t: 'position', x: 0.6 });
    page.send({ t: 'text', text: 'ping' });
    await expect.poll(() => made.host.events.length).toBe(1);
    expect(made.persisted).toEqual([]);
    await page.close();
    await made.world.stop();
    expect(made.persisted).toEqual([{ petX: 0.6 }]);

    const again = await mounted((c) => { c.rememberPosition = true; c.petX = 0.6; });
    const next = await FakePage.open(origin(again.world));
    expect(next.init.startX).toBe(0.6);
    await next.close();
    await again.world.stop();
    expect(again.persisted).toEqual([]);
  });

  it('with rememberPosition off the page gets no start position and a saved one is cleared on stop', async () => {
    const made = await mounted((c) => { c.petX = 0.6; });
    const page = await FakePage.open(origin(made.world));
    expect(page.init.startX).toBeNull();
    await page.close();
    await made.world.stop();
    expect(made.persisted).toEqual([{ petX: null }]);
  });

  it('a browser tab only watches while the pet window is connected', async () => {
    const { world } = await mounted();
    const win = await windowPage(world);
    cleanup.push(() => win.close());
    const tab = await FakePage.open(origin(world), 'role=pet&host=tab');
    cleanup.push(() => tab.close());
    await tab.next((m) => m.t === 'watching');
    await tool(world, 'pet_act').handler({ actions: ['nod'] }, ctx);
    await win.next((m) => m.t === 'act');
    expect(tab.messages.some((m) => m.t === 'act')).toBe(false);
  });

  it('puts the local time before each event, with the date on the first one only', async () => {
    const { world, host } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'text', text: 'a' });
    await expect.poll(() => host.events.length).toBe(1);
    page.send({ t: 'text', text: 'b' });
    await expect.poll(() => host.events.length).toBe(2);
    // a run that crosses midnight between the two dates the second one too
    expect(host.stamps[0]).toMatch(/^\[\d\d-\d\d 周. \d\d:\d\d\] $/);
    expect(host.stamps[1]).toMatch(/^\[\d\d:\d\d\] $/);
  });

  it('a watching tab still sends typed text and a theme switch, which reaches the pet window', async () => {
    const { world, host, persisted } = await mounted();
    const win = await windowPage(world);
    cleanup.push(() => win.close());
    const tab = await FakePage.open(origin(world), 'role=pet&host=tab');
    cleanup.push(() => tab.close());
    await tab.next((m) => m.t === 'watching');
    tab.send({ t: 'text', text: 'hi' });
    await expect.poll(() => host.events.length).toBe(1);
    expect(host.events[0]).toMatchObject({ type: 'desktop-pet.message', text: '[打字] 伙伴:hi' });
    const theme = DESKTOP_PET_DEFAULTS.theme === 'dark' ? 'light' : 'dark';
    tab.send({ t: 'prefs', theme });
    expect((await win.next((m) => m.t === 'prefs')).theme).toBe(theme);
    expect(persisted).toContainEqual({ theme });
    expect((await (await fetch(`${origin(world)}/api/state`)).json()).theme).toBe(theme);
  });

  it('confirm resolves from the bubble without an event to the bot', async () => {
    const { world, host } = await mounted();
    expect(await world.confirm('可以吗?', ['可以', '不行'])).toBe('unavailable');
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const yes = world.confirm('可以吗?', ['可以', '不行']);
    const c1 = await page.next((m) => m.t === 'confirm');
    expect(c1).toMatchObject({ question: '可以吗?', options: ['可以', '不行'] });
    page.send({ t: 'confirmed', id: c1.id, index: 0 });
    expect(await yes).toBe('yes');
    const closed = world.confirm('再问一次?', ['可以', '不行']);
    page.send({ t: 'confirmed', id: (await page.next((m) => m.t === 'confirm')).id, index: null });
    expect(await closed).toBe('dismissed');
    const gone = world.confirm('还在吗?', ['可以', '不行']);
    await page.next((m) => m.t === 'confirm');
    await page.close();
    expect(await gone).toBe('unavailable');
    expect(host.events).toHaveLength(0);
  });

  it('dialog steps resolve from the bubble without an event to the bot', async () => {
    const { world, host } = await mounted();
    const warned: string[] = [];
    host.log.warn = ((m: string) => { warned.push(m); }) as typeof host.log.warn;
    expect(await world.dialog({ text: '在吗?' }).answer).toEqual({ unavailable: true });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());

    const name = world.dialog({ text: '怎么称呼你?', actions: ['思考', '不存在'], step: [1, 5], closable: true, input: { kind: 'text', submit: '好' } });
    const d1 = await page.next((m) => m.t === 'dialog');
    // vocabulary words arrive as ids, unknown ones are left out
    expect(d1).toMatchObject({ text: '怎么称呼你?', actions: ['thinking'], step: [1, 5], closable: true, input: { kind: 'text' } });
    expect(name.dropped).toEqual(['不存在']);
    expect(warned).toEqual(['气泡对话里有当前形象的词表没有的词,已略过:不存在']);
    // relabelled while it is up (the app language changed): the page gets the new line, marks and input
    name.update({ text: 'What should I call you?', marks: [], input: { kind: 'text', submit: 'OK' } });
    expect(await page.next((m) => m.t === 'dialog-update')).toMatchObject({ id: d1.id, text: 'What should I call you?', marks: [], input: { kind: 'text', submit: 'OK' } });
    page.send({ t: 'dialog', id: d1.id, text: '小明' });
    expect(await name.answer).toEqual({ text: '小明' });
    // once answered, a late relabel reaches no page
    name.update({ text: 'too late' });

    const pick = world.dialog({ text: '选一个', actions: ['happy'], input: { kind: 'buttons', options: [{ label: 'A' }, { label: 'B' }] } });
    // all of them known: nothing left out, nothing logged
    expect(pick.dropped).toEqual([]);
    expect(warned).toHaveLength(1);
    page.send({ t: 'dialog', id: (await page.next((m) => m.t === 'dialog')).id, index: 1 });
    expect(await pick.answer).toEqual({ index: 1 });
    expect(page.messages.some((m) => m.t === 'dialog-update' && m.text === 'too late')).toBe(false);

    const closed = world.dialog({ text: '跳过?', closable: true, input: { kind: 'text', submit: '好', alt: '算了' } });
    page.send({ t: 'dialog', id: (await page.next((m) => m.t === 'dialog')).id, closed: true });
    expect(await closed.answer).toEqual({ closed: true });

    // a progress step moves with update and ends when the app closes it
    const bar = world.dialog({ text: '下载中', input: { kind: 'progress' } });
    const d4 = await page.next((m) => m.t === 'dialog');
    bar.update({ progress: .5 });
    expect(await page.next((m) => m.t === 'dialog-update' && m.id === d4.id)).toMatchObject({ id: d4.id, progress: .5 });
    bar.close();
    expect(await page.next((m) => m.t === 'dialog-close')).toMatchObject({ id: d4.id });
    expect(await bar.answer).toEqual({ done: true });

    const gone = world.dialog({ text: '还在吗?', input: { kind: 'buttons', options: [{ label: '在' }] } });
    await page.next((m) => m.t === 'dialog');
    await page.close();
    expect(await gone.answer).toEqual({ unavailable: true });
    expect(host.events).toHaveLength(0);
  });

  it('the pet panel runs the app\'s introduction when the app lends one', async () => {
    let runs = 0;
    const { world } = await mounted(undefined, { controls: { guide: () => { runs++; } } });
    await world.webUi().invoke!('pet', 'guide', []);
    expect(runs).toBe(1);
    const bare = await mounted();
    await expect(bare.world.webUi().invoke!('pet', 'guide', [])).rejects.toThrow('没有引导');
  });

  it('the menu header carries the bot and its run controls; clicks reach them', async () => {
    const calls: string[] = [];
    let paused = false;
    const controls: PetBotControls = {
      isPaused: () => paused,
      setPaused: (p) => { paused = p; calls.push(p ? 'pause' : 'resume'); },
      openSettings: () => calls.push('settings'),
      quit: () => calls.push('quit'),
      quitLabel: '退出 App',
    };
    const dir = mkdtempSync(join(tmpdir(), 'pet-avatar-'));
    const avatarFile = join(dir, 'avatar.png');
    writeFileSync(avatarFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { world } = await mounted(undefined, { botName: () => 'Bot', avatarFile, controls });
    const res = await fetch(`${origin(world)}/api/avatar`);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const win = await windowPage(world);
    cleanup.push(() => win.close());
    const tab = await FakePage.open(origin(world), 'role=pet&host=tab');
    cleanup.push(() => tab.close());
    const state = await (await fetch(`${origin(world)}/api/state`)).json() as { bot: Record<string, unknown> };
    expect(state.bot).toMatchObject({
      name: 'Bot', controls: true, buttons: { pause: true, settings: true, dress: false, quit: true }, paused: false, quitLabel: '退出 App', avatar: expect.any(String),
    });
    win.send({ t: 'control', action: 'pause' });
    expect((await win.next((m) => m.t === 'prefs')).bot).toMatchObject({ paused: true });
    tab.send({ t: 'control', action: 'settings' });
    tab.send({ t: 'control', action: 'quit' });
    await expect.poll(() => calls).toEqual(['pause', 'settings', 'quit']);
  });

  it('the menu header shows only the controls the app lends', async () => {
    const calls: string[] = [];
    const { world } = await mounted(undefined, { botName: () => 'Bot', controls: { openSettings: () => calls.push('settings') } });
    const win = await windowPage(world);
    cleanup.push(() => win.close());
    const state = await (await fetch(`${origin(world)}/api/state`)).json() as { bot: Record<string, unknown> };
    expect(state.bot).toMatchObject({ controls: true, buttons: { pause: false, settings: true, dress: false, quit: false }, paused: null, quitLabel: '', quitPrompt: '' });
    // controls that were not lent are ignored
    win.send({ t: 'control', action: 'pause' });
    win.send({ t: 'control', action: 'quit' });
    win.send({ t: 'control', action: 'settings' });
    await expect.poll(() => calls).toEqual(['settings']);
  });

  it('rejects requests whose Host is not a loopback name', async () => {
    const { world } = await mounted();
    const url = new URL(origin(world));
    const res = await new Promise<number>((done) => {
      import('node:http').then(({ request }) => {
        const req = request({ host: '127.0.0.1', port: url.port, path: '/api/state', headers: { host: 'evil.example' } }, (r) => done(r.statusCode ?? 0));
        req.end();
      });
    });
    expect(res).toBe(421);
  });
});

/** A chat page connected to the World's `chat` stream: frames it got, and a way to send one. */
function chatSocket(world: DesktopPetWorld) {
  const frames: Array<Record<string, unknown>> = [];
  let receive: (text: string) => void = () => {};
  const socket = {
    open: true,
    send: (d: string) => { frames.push(JSON.parse(d) as Record<string, unknown>); },
    close: () => {},
    onMessage: (cb: (text: string) => void) => { receive = cb; },
    onClose: () => {},
  };
  world.webUi().stream!('chat', socket);
  return { frames, send: (m: Record<string, unknown>) => receive(JSON.stringify(m)), last: (t: string) => frames.filter((f) => f.t === t).at(-1) };
}

describe('chat page', () => {
  it('a typed message waits on the page until delivered; a withdrawn one leaves the history, the pet\'s lines stay', async () => {
    const { world, host } = await mounted(undefined, { botName: () => 'Coo' });
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const chat = chatSocket(world);

    chat.send({ t: 'send', id: 1, text: '帮我看看这个报错' });
    await expect.poll(() => chat.last('sent')).toMatchObject({ id: 1 });
    const sent = host.events.at(-1)!;
    expect(sent).toMatchObject({ type: 'desktop-pet.message', text: '[打字] 伙伴:帮我看看这个报错', meta: { via: 'chat' } });
    expect(host.pushOpts.at(-1)).toEqual({ trigger: 'preempt' });
    expect(chat.last('item')).toMatchObject({ pending: true, item: { kind: 'user', cursor: sent.cursor } });
    world.onEventsSettled([sent], 'delivered');
    await expect.poll(() => chat.last('settled')).toEqual({ t: 'settled', cursors: [sent.cursor], outcome: 'delivered' });

    // (the mood is the first expression, a group's members too)
    await tool(world, 'pet_say').handler({ script: '【招手+开心】看到了' }, ctx);
    chat.send({ t: 'send', id: 2, text: '算了不用了' });
    await expect.poll(() => chat.last('sent')).toMatchObject({ id: 2 });
    const second = chat.last('sent')!.cursor as number;
    chat.send({ t: 'withdraw', cursor: second });
    await expect.poll(() => chat.last('withdrawn')).toEqual({ t: 'withdrawn', cursor: second });
    expect(host.withdrawn).toEqual([second]);

    chat.send({ t: 'hello' });
    await expect.poll(() => chat.last('init')).toBeDefined();
    expect((chat.last('init')!.items as Array<Record<string, unknown>>).map((i) => i.kind === 'say' ? i.beats : i.text))
      .toEqual(['帮我看看这个报错', [{ text: '看到了', mood: { id: 'happy', zh: '开心' } }]]);
  });

  it('the pet page gets what was sent from the chat page, to show beside the pet, and closes it when it is withdrawn', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const chat = chatSocket(world);

    chat.send({ t: 'send', id: 1, text: '这张截图里的报错是什么意思', images: [{ mime: 'image/png', base64: Buffer.from('png').toString('base64') }] });
    await expect.poll(() => chat.last('sent')).toMatchObject({ id: 1 });
    const cursor = chat.last('sent')!.cursor as number;
    expect(await page.next((m) => m.t === 'said')).toEqual({ t: 'said', via: 'chat', text: '这张截图里的报错是什么意思', images: 1, cursor });

    chat.send({ t: 'withdraw', cursor });
    expect(await page.next((m) => m.t === 'said-withdrawn')).toEqual({ t: 'said-withdrawn', cursor });
  });

  it('the pet page gets the bubble and text sizes, each 1 by default and kept in range', async () => {
    const { world, cfg } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(page.init).toMatchObject({ bubbleSize: 1, fontSize: 1 });
    cfg.window.bubbleSize = 1.3;
    cfg.window.fontSize = 9;
    expect(await page.next((m) => m.t === 'prefs' && m.bubbleSize === 1.3)).toMatchObject({ fontSize: 1.6 });
  });

  it('the pet page gets the bubble speed, 1 by default and kept within 0.5–2, and the input bubbles switch (upstream #248, #279)', async () => {
    const { world, cfg } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(page.init).toMatchObject({ bubbleSpeed: 1, saidBubbles: true });
    cfg.window.bubbleSpeed = 0;
    cfg.saidBubbles = false;
    expect(await page.next((m) => m.t === 'prefs' && m.saidBubbles === false)).toMatchObject({ bubbleSpeed: .5 });
    cfg.window.bubbleSpeed = 1.53;
    expect((await page.next((m) => m.t === 'prefs' && m.bubbleSpeed !== .5)).bubbleSpeed).toBe(1.55);
    // neither is a setting the bot changes itself
    const setProps = Object.keys((tool(world, 'pet_set').parameters as { properties: Record<string, unknown> }).properties);
    expect(setProps.filter((k) => /speed|said/i.test(k))).toEqual([]);
  });

  it("pet_say's receipt counts the bubble's time at the bubble speed", async () => {
    const { world, cfg } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const script = '这是一段明显更长的话,要多打一会儿字才能说完,再多说几句让它停得久一些。';
    const secs = (out: unknown) => Number(/这段约 (\d+) 秒/.exec((out as { text: string }).text)?.[1]);
    const normal = secs(await tool(world, 'pet_say').handler({ script }, ctx));
    // the second waits for the first: the receipt says how long it is itself
    cfg.window.bubbleSpeed = 2;
    const fast = secs(await tool(world, 'pet_say').handler({ script }, ctx));
    expect(normal).toBeGreaterThan(4);
    expect(Math.abs(fast - normal / 2)).toBeLessThanOrEqual(1);
  });

  it("pet_say's receipt counts the speech's typing steps while 说话声 is on (upstream #263)", async () => {
    const { world, cfg } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    const script = 'What a lovely morning it is out there today and the birds are singing in every single tree along the road';
    const secs = (out: unknown) => Number(/这段约 (\d+) 秒/.exec((out as { text: string }).text)?.[1]);
    const off = secs(await tool(world, 'pet_say').handler({ script }, ctx));
    // letters type faster for the voice (web/speech.js textSteps)
    cfg.speech.enabled = true;
    const on = secs(await tool(world, 'pet_say').handler({ script }, ctx));
    expect(off - on).toBeGreaterThanOrEqual(3);
  });

  it('an interrupt while the page is asked where the pointer is stops pet_walk_to before it sets off', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'pose', x: 500, w: 1000, facing: 1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(500);
    const stop = new AbortController();
    const walking = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, { ...ctx, signal: stop.signal });
    const q = await page.next((m) => m.t === 'pointer?');
    stop.abort();
    page.send({ t: 'pointer', id: q.id, x: 900, w: 1000 });
    expect(await walking).toEqual({ text: '还没起步就停下了,没走,还在屏幕横向 50% 处。' });
    expect(page.messages.some((m) => m.t === 'walk')).toBe(false);
  });

  it('a page that goes away while it is asked where the pointer is ends pet_walk_to at once, without a walk', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    page.send({ t: 'pose', x: 500, w: 1000, facing: 1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(500);
    const walking = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, ctx);
    await page.next((m) => m.t === 'pointer?');
    const asked = Date.now();
    await page.close();
    // not the 1 s wait for an answer, and not a walk set off toward where the page last saw the pointer
    expect(await walking).toMatchObject({ failed: true, text: expect.stringContaining('没有连接') });
    expect(Date.now() - asked).toBeLessThan(600);
    expect(page.messages.some((m) => m.t === 'walk')).toBe(false);
    expect((world as unknown as { pointerAsks: Map<string, unknown> }).pointerAsks.size).toBe(0);
  });

  it('stopping the World while the page is asked where the pointer is ends pet_walk_to at once, without a walk', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    page.send({ t: 'pose', x: 500, w: 1000, facing: 1, mode: 'idle' });
    await expect.poll(() => (world as unknown as { pose: { x: number } | null }).pose?.x).toBe(500);
    const walking = tool(world, 'pet_walk_to').handler({ to: 'cursor' }, ctx);
    await page.next((m) => m.t === 'pointer?');
    const asked = Date.now();
    await world.stop();
    expect(await walking).toMatchObject({ failed: true });
    expect(Date.now() - asked).toBeLessThan(600);
    expect(page.messages.some((m) => m.t === 'walk')).toBe(false);
    expect((world as unknown as { pointerAsks: Map<string, unknown> }).pointerAsks.size).toBe(0);
  });

  it('an interrupt stops pet_walk_to where the pet stands', async () => {
    const { world } = await mounted();
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(tool(world, 'pet_walk_to').interruptible).toBe(true);
    const stop = new AbortController();
    const walking = tool(world, 'pet_walk_to').handler({ to: 'left' }, { ...ctx, signal: stop.signal });
    const walk = await page.next((m) => m.t === 'walk');
    stop.abort();
    expect(await page.next((m) => m.t === 'walk-stop')).toMatchObject({ id: walk.id });
    page.send({ t: 'interrupted', walkId: walk.id, x: .4, by: 'idle' });
    expect(await walking).toEqual({ text: '走到屏幕横向 40% 处停下了。' });
  });
});

describe("the bot's name (upstream #320)", () => {
  it('is read at each use: a rename reaches the menu header and an open chat page without a restart', async () => {
    let name = 'Coo';
    const def = desktopPetDefinition({ botName: () => name });
    const wctx = fakeWorldContext(def, { scratchDir: mkdtempSync(join(tmpdir(), 'pet-name-')) });
    Object.assign(wctx.cfg, { enabled: true, port: 0 });
    wctx.cfg.window.enabled = false;
    wctx.cfg.asr.enabled = false;
    const world = def.create(wctx) as DesktopPetWorld;
    const host = new FakeHost();
    await world.start(host);
    cleanup.push(() => world.stop());
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(page.init.bot).toMatchObject({ name: 'Coo' });
    const chat = chatSocket(world);
    chat.send({ t: 'hello' });
    await expect.poll(() => chat.last('init')?.bot).toBe('Coo');

    name = 'Mochi';
    // throws when no prefs frame with the new name arrives
    await page.next((m) => m.t === 'prefs' && (m.bot as { name?: unknown }).name === 'Mochi');
    await expect.poll(() => chat.last('bot')).toEqual({ t: 'bot', bot: 'Mochi' });
    chat.send({ t: 'hello' });
    await expect.poll(() => chat.last('init')?.bot).toBe('Mochi');
  });

  it('falls back to the name the World was mounted with when the app lends none', async () => {
    const def = desktopPetDefinition();
    const wctx = fakeWorldContext(def, { scratchDir: mkdtempSync(join(tmpdir(), 'pet-name-')) });
    Object.assign(wctx.cfg, { enabled: true, port: 0 });
    wctx.cfg.window.enabled = false;
    wctx.cfg.asr.enabled = false;
    const world = def.create(wctx) as DesktopPetWorld;
    await world.start(new FakeHost());
    cleanup.push(() => world.stop());
    const page = await FakePage.open(origin(world));
    cleanup.push(() => page.close());
    expect(page.init.bot).toMatchObject({ name: wctx.botName });
  });
});
