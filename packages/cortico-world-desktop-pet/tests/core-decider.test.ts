/**
 * Decider mode through Cortico Core: the position line rides on each delivered batch, the tools offered are the
 * decider ones, and a mode switch takes effect when the prefix is rebuilt (the old tools keep working until then).
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { Bot } from 'cortico/bot.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { desktopPetDefinition } from '../src/definition.ts';
import { DESKTOP_PET_DEFAULTS, type DesktopPetConfigSection } from '../src/config.ts';
import type { DesktopPetWorld, PetMode } from '../src/world.ts';
import { ScriptedModel, startBot } from './helpers/harness.ts';
import { FakePage } from './helpers/page.ts';

let bot: Bot<CoreConfig> | null = null;
let page: FakePage | null = null;
afterAll(async () => {
  await page?.close();
  await bot?.stop();
});

/** Every question answers its first word option, so something is always done. */
const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as { questions: Record<string, { criteria: Record<string, string> }> };
  const answers = Object.fromEntries(Object.entries(body.questions).map(([q, d]) => {
    const keys = Object.keys(d.criteria);
    const pick = q === 'face' ? keys[1] : keys[0];
    return [q, { type: 'choice', choice: pick, probabilities: { [pick]: .9 } }];
  }));
  return new Response(JSON.stringify({ answers, usage: { input_tokens: 100, output_tokens: 0 } }), { status: 200 });
}) as typeof fetch;

describe('decider mode through Core', () => {
  it('delivers the position with each batch; a switch takes effect at the next prefix', async () => {
    const modes: PetMode[] = [];
    const def = desktopPetDefinition({ deciderKey: () => 'sk-or-fake', deciderFetch: fakeFetch, onModeChange: (m) => modes.push(m) });
    let phase = 0;
    const model = new ScriptedModel((turn) => {
      const seen = JSON.stringify(turn.records);
      if (seen.includes('在吗') && phase === 0) {
        phase = 1;
        expect(turn.tools).toEqual(expect.arrayContaining(['pet_say', 'pet_feel', 'pet_walk']));
        expect(turn.tools).not.toContain('pet_act');
        expect(seen).toMatch(/\[位置\] 屏幕横向 1300\/1920 像素/);
        return { calls: [{ name: 'pet_say', args: { text: '在呢!', feeling: '很高兴' } }, { name: 'end_turn' }] };
      }
      if (seen.includes('还在吗') && phase === 1) {
        phase = 2;
        // switched off, prefix not rebuilt yet: the decider tools are still bound and still work
        expect(turn.tools).toContain('pet_feel');
        return { calls: [{ name: 'pet_feel', args: { feeling: '点点头' } }, { name: 'end_turn' }] };
      }
      if (seen.includes('第三句') && phase === 2) {
        phase = 3;
        expect(turn.tools).toContain('pet_act');
        expect(turn.tools).not.toContain('pet_feel');
        return { calls: [{ name: 'pet_say', args: { script: '【开心】好' } }, { name: 'end_turn' }] };
      }
      return { calls: [{ name: 'end_turn' }] };
    });
    bot = await startBot({
      worlds: [def as never],
      sections: { 'desktop-pet': { port: 0, window: { ...DESKTOP_PET_DEFAULTS.window, enabled: false }, asr: { ...DESKTOP_PET_DEFAULTS.asr, enabled: false, mic: { ...DESKTOP_PET_DEFAULTS.asr.mic, mode: 'always' } } } },
      model,
    });
    const world = bot.assembly.mounted.find((w) => w.id === 'desktop-pet') as unknown as DesktopPetWorld;
    expect(world.petMode).toBe('decider');
    page = await FakePage.open(world.petUrl.replace(/\/pet$/, ''));
    page.send({ t: 'pose', x: 1300, w: 1920, facing: -1, mode: 'idle' });
    await expect.poll(() => world.positionLine()).not.toBeNull();
    page.send({ t: 'text', text: '在吗' });
    const say = await page.next((m) => m.t === 'say', 20_000);
    expect(say).toMatchObject({ beats: [{ text: '在呢!' }], acts: 'pending' });
    const acts = await page.next((m) => m.t === 'say-acts', 20_000);
    expect((acts.actions as string[]).length).toBe(1);

    (world as unknown as { cfg: DesktopPetConfigSection }).cfg.decider.enabled = false;
    await expect.poll(() => modes).toEqual(['classic']);
    page.send({ t: 'text', text: '还在吗' });
    await page.next((m) => m.t === 'act', 20_000);
    await expect.poll(() => phase, { timeout: 20_000 }).toBe(2);

    await bot.core.loop.reloadSystemPrefix();
    page.send({ t: 'text', text: '第三句' });
    const classic = await page.next((m) => m.t === 'say' && JSON.stringify(m.beats).includes('好'), 20_000);
    expect(classic.beats).toEqual([{ actions: ['happy'], text: '好', anchors: [] }]);
    expect(phase).toBe(3);
  }, 60_000);
});
