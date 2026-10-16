import { describe, expect, it } from 'vitest';
import { DESKTOP_PET_DEFAULTS } from '../src/config.ts';
import { figurePacks } from '../src/packs.ts';
import { planSettings } from '../src/self.ts';

const cfg = () => structuredClone(DESKTOP_PET_DEFAULTS);
const packs = figurePacks([]).packs;

describe('pet_set', () => {
  it('changes what reaches the person only after asking them', () => {
    const { changes } = planSettings({ roam: 'free', sound: false, scale: 1.5, theme: 'light', user: '小明', hoverButtons: ['chat'] }, cfg(), packs);
    expect(Object.fromEntries(changes.map((c) => [c.key, c.tier]))).toEqual({ roam: 'self', sound: 'ask', scale: 'ask', theme: 'ask', user: 'ask', hoverButtons: 'ask' });
  });

  it('refuses settings that are not the bot\'s', () => {
    const { changes, errors } = planSettings({ asr: { enabled: false }, rememberPosition: true }, cfg(), packs);
    expect(changes).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it('takes a pack\'s picks only for that pack', () => {
    expect(planSettings({ figure: 'whale', scheme: 'claude' }, cfg(), packs).errors).toEqual([]);
    expect(planSettings({ scheme: 'claude' }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ figure: 'claude-chan', scheme: 'claude' }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ figure: 'gpt-chan', scheme: 'chatgpt' }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ figure: 'gemini-chan', scheme: 'gemini' }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ figure: 'grok-chan', scheme: 'grok' }, cfg(), packs).errors).toHaveLength(1);
  });

  it('dresses the whale in a scheme and an outfit (`<scheme>-<outfit>`), a bare scheme being her maid dress', () => {
    const { changes, errors } = planSettings({ figure: 'whale', scheme: 'claude-cape' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.find((c) => c.key === 'scheme')).toMatchObject({ say: expect.stringContaining('配色:Claude,服装:冬装'), patch: { skin: { scheme: 'claude-cape' } } });
    expect(planSettings({ figure: 'whale', scheme: 'qwen-maid' }, cfg(), packs).errors).toEqual([]);
    expect(planSettings({ figure: 'whale', scheme: 'qwen' }, cfg(), packs).errors).toEqual([]);
    // an outfit she does not have, or a third part, is no look of hers
    expect(planSettings({ figure: 'whale', scheme: 'qwen-tuxedo' }, cfg(), packs).errors).toHaveLength(1);
    expect(planSettings({ figure: 'whale', scheme: 'qwen-cape-x' }, cfg(), packs).errors).toHaveLength(1);
  });

  it('switches to Claude-chan in her one scheme', () => {
    const { changes, errors } = planSettings({ figure: 'claude-chan' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.patch)).toEqual([{ skin: { figure: 'claude-chan', scheme: 'original' } }]);
  });

  it('switches to GPT-chan in her one scheme', () => {
    const { changes, errors } = planSettings({ figure: 'gpt-chan' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.patch)).toEqual([{ skin: { figure: 'gpt-chan', scheme: 'original' } }]);
  });

  it('switches to Gemini-chan in her one scheme', () => {
    const { changes, errors } = planSettings({ figure: 'gemini-chan' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.patch)).toEqual([{ skin: { figure: 'gemini-chan', scheme: 'original' } }]);
  });

  it('switches to Grok-chan in her one scheme', () => {
    const { changes, errors } = planSettings({ figure: 'grok-chan' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.patch)).toEqual([{ skin: { figure: 'grok-chan', scheme: 'original' } }]);
  });

  it('dresses Coo through its skin\'s own fields', () => {
    const { changes, errors } = planSettings({ scheme: 'fox-cat-none-none-none' }, cfg(), packs);
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.patch)).toEqual([{ skin: { palette: 'fox', head: 'cat', side: 'none', glasses: 'none', neck: 'none' } }]);
  });
});
