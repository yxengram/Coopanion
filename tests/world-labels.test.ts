/**
 * The Worlds' names (`labelLanguage` in core/companion.ts): Cortico keeps the name it read while assembling the bot
 * for its notices to the bot (`labelOf`, cormini's 「World 「…」…」 lines), which stay Chinese in every app language;
 * the name it reads afterwards for a World it could not build (`labelIn`, the console's World list) follows the app
 * language.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Language } from 'cortico/core/language.ts';
import { WorldAssembly, type WorldDefinition, type WorldSection } from 'cortico/world.ts';
import { desktopPetDefinition } from 'cortico-world-desktop-pet';
import { cuaDefinition } from 'cortico-world-cua';

describe('the Worlds\' names', () => {
  it('Chinese for the bot, the app language for a World the console lists as missing', () => {
    let assembled = false;
    const app: Language = 'en';
    const labelLanguage = (): Language => (assembled ? app : 'zh');
    const pet = desktopPetDefinition({ language: () => app, labelLanguage });
    // a pet World whose constructor fails: listed as missing, by its definition's name
    const failing = Object.create(pet, { create: { value: () => { throw new Error('no display'); } } }) as WorldDefinition<WorldSection>;
    const cua = cuaDefinition({ language: () => app, labelLanguage }) as unknown as WorldDefinition<WorldSection>;
    const dir = mkdtempSync(join(tmpdir(), 'cc-labels-'));
    const loaded = { config: { worlds: {}, displayName: 'Coo' }, rootDir: dir, dataDir: dir, secret: () => undefined } as never;
    const assembly = new WorldAssembly(loaded, [failing, cua], []);
    assembled = true;
    expect(assembly.labelOf('cua')).toBe('电脑操作');
    expect(assembly.missing.map((m) => m.label)).toEqual(['桌宠']);
    expect(assembly.labelIn('desktop-pet', 'en')).toBe('Desktop pet');
  });
});
