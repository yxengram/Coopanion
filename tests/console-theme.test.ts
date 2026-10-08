import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { figurePacks } from 'cortico-world-desktop-pet';
import { COO_SCHEME, figureSchemes, followPetLook } from '../core/console-theme.ts';

const packs = figurePacks([]).packs;
const WHALE_SCHEMES = figureSchemes(packs);

const theme = (dir: string) => JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')) as { selectedId: string; mode: string; custom: Array<{ id: string }> };

describe('console colours follow the pet', () => {
  it('switches between Coo and each whale scheme, keeping the light/dark mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'coo', scheme: 'claude' }, packs);
    expect(theme(dir).selectedId).toBe(COO_SCHEME);
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ ...theme(dir), mode: 'dark' }));
    followPetLook(dir, { figure: 'whale', scheme: 'claude' }, packs);
    expect(theme(dir)).toMatchObject({ selectedId: 'coo-whale-claude', mode: 'dark' });
    expect(theme(dir).custom.map((s) => s.id)).toEqual(WHALE_SCHEMES.map((s) => s.id));
    followPetLook(dir, { figure: 'coo' }, packs);
    expect(theme(dir).selectedId).toBe(COO_SCHEME);
  });

  it('gives the exported whale pack (an alias of the built-in whale) the whale\'s schemes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'coopanion-whale', scheme: 'kimi' }, packs);
    expect(theme(dir).selectedId).toBe('coo-whale-kimi');
  });

  it('gives Claude-chan her own scheme, named after her, next to the whale\'s', () => {
    expect(WHALE_SCHEMES.filter((s) => s.id.startsWith('coo-fig-claude-chan-')).map((s) => [s.id, s.name])).toEqual([['coo-fig-claude-chan-original', 'Claude 娘 · 原版']]);
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'claude-chan', scheme: 'original' }, packs);
    expect(theme(dir).selectedId).toBe('coo-fig-claude-chan-original');
    followPetLook(dir, { figure: 'whale', scheme: 'claude' }, packs);
    expect(theme(dir).selectedId).toBe('coo-whale-claude');
    // her exported pack (an alias of the built-in) gets the same scheme
    followPetLook(dir, { figure: 'coopanion-claude-chan', scheme: 'original' }, packs);
    expect(theme(dir).selectedId).toBe('coo-fig-claude-chan-original');
  });

  it('gives GPT-chan her own scheme too, her exported pack included', () => {
    expect(WHALE_SCHEMES.filter((s) => s.id.startsWith('coo-fig-gpt-chan-')).map((s) => [s.id, s.name])).toEqual([['coo-fig-gpt-chan-original', 'GPT 娘 · 原版']]);
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    followPetLook(dir, { figure: 'gpt-chan', scheme: 'original' }, packs);
    expect(theme(dir).selectedId).toBe('coo-fig-gpt-chan-original');
    followPetLook(dir, { figure: 'claude-chan', scheme: 'original' }, packs);
    expect(theme(dir).selectedId).toBe('coo-fig-claude-chan-original');
    followPetLook(dir, { figure: 'coopanion-gpt-chan', scheme: 'original' }, packs);
    expect(theme(dir).selectedId).toBe('coo-fig-gpt-chan-original');
  });

  it('leaves a scheme picked on the appearance page, and keeps the person\'s own schemes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-theme-'));
    const mine = { id: 'mine', name: '我的', note: '', palettes: { light: {}, dark: {} } };
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ selectedId: 'navigator', mode: 'system', custom: [mine] }));
    followPetLook(dir, { figure: 'whale', scheme: 'kimi' }, packs);
    expect(theme(dir).selectedId).toBe('navigator');
    expect(theme(dir).custom.map((s) => s.id)).toEqual(['mine', ...WHALE_SCHEMES.map((s) => s.id)]);
  });
});
