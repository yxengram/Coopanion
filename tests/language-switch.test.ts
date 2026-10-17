/**
 * A change of the app language on an install that already exists: the pet World's values that are still the old
 * language's defaults (the name, the speech language, the conversion to Simplified Chinese; what `newInstallWorlds`
 * decides) take the new language's, in the live config and in config.json, and the person's own values stay.
 * The writes go the way the console's config API makes them (`setByPath` on the live config, then `language` alone
 * into the file), through the accessor `watchLanguage` puts on the live config.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { updateJsonObject } from 'cortico/config-file.ts';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import { setByPath } from 'cortico/core/config-schema.ts';
import type { CoreConfig } from 'cortico/core/types.ts';
import { loadDeployment } from 'cortico/deploy.ts';
import { DESKTOP_PET_DEFAULTS } from '../packages/cortico-world-desktop-pet/src/config.ts';
import { watchLanguage } from '../core/companion.ts';
import { DEPLOYMENT, languageSwitchPatch, newInstallWorlds, seed } from '../core/seed.ts';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;

/** An install seeded in `language`, its config.json edited by `edit`, loaded and watched as the Core does. */
function install(language: string, edit?: (raw: Record<string, any>) => void) {
  const home = mkdtempSync(join(tmpdir(), 'cc-lang-'));
  seed(home, language);
  const file = join(home, DEPLOYMENT, 'config.json');
  if (edit) writeFileSync(file, JSON.stringify((() => { const raw = read(file); edit(raw); return raw; })(), null, 2) + '\n');
  const source = { defaults: () => ({ ...structuredClone(CORE_DEFAULTS), worlds: { 'desktop-pet': structuredClone(DESKTOP_PET_DEFAULTS) } }) as unknown as CoreConfig };
  const config = loadDeployment(source, join(home, DEPLOYMENT), home, join(home, DEPLOYMENT), join(home, 'providers')).config;
  const changes: string[] = [];
  watchLanguage(config, file, (l) => changes.push(l));
  const pet = (config as any).worlds['desktop-pet'];
  /** What the 「习惯」 page and Settings → Language do: POST /api/config { group: 'companion', values: { language } }. */
  const setLanguage = (next: string) => {
    setByPath(config as any, 'language', next);
    updateJsonObject(file, (raw) => setByPath(raw, 'language', next));
  };
  return { file, config, pet, asr: pet.asr, changes, setLanguage };
}

describe('switching the language of an existing install', () => {
  it('zh → en: the untouched Chinese defaults become an English install\'s, live and on disk', () => {
    const i = install('zh');
    i.setLanguage('en');
    expect(i.changes).toEqual(['en']);
    expect(i.pet.user).toBe('Pal');
    expect(i.pet.asr).toMatchObject({ language: 'en', simplified: false });
    // the pet World holds this very section and its asr object: the change reaches it without a restart
    expect(i.pet.asr).toBe(i.asr);
    const disk = read(i.file);
    expect(disk.language).toBe('en');
    expect(disk.worlds['desktop-pet']).toEqual({ user: 'Pal', asr: { language: 'en', simplified: false } });
    // what an English install starts with
    expect(disk.worlds).toEqual(newInstallWorlds('en'));
  });

  it('en → zh: an English install\'s defaults go back to Chinese ones', () => {
    const i = install('en');
    i.setLanguage('zh');
    expect(i.pet.user).toBe('伙伴');
    expect(i.pet.asr).toMatchObject({ language: 'zh', simplified: true });
    expect(read(i.file).worlds['desktop-pet']).toEqual({ user: '伙伴', asr: { language: 'zh', simplified: true } });
  });

  it('zh → en → zh ends where it started', () => {
    const i = install('zh');
    i.setLanguage('en');
    i.setLanguage('zh');
    expect(i.pet.user).toBe('伙伴');
    expect(i.pet.asr).toMatchObject({ language: 'zh', simplified: true });
  });

  it('keeps what the person set, each value decided on its own', () => {
    const i = install('zh', (raw) => { raw.worlds = { 'desktop-pet': { user: '小明', asr: { language: 'ja' } } }; });
    i.setLanguage('en');
    expect(i.pet.user).toBe('小明');
    expect(i.pet.asr.language).toBe('ja');
    // the conversion was still the default
    expect(i.pet.asr.simplified).toBe(false);
    expect(read(i.file).worlds['desktop-pet']).toEqual({ user: '小明', asr: { language: 'ja', simplified: false } });

    const e = install('en', (raw) => { raw.worlds['desktop-pet'].user = 'Sam'; raw.worlds['desktop-pet'].asr.simplified = true; });
    e.setLanguage('zh');
    expect(e.pet.user).toBe('Sam');
    expect(e.pet.asr).toMatchObject({ language: 'zh', simplified: true });
  });

  it('takes the name from before 0.1.2 (「主人」) as a Chinese default', () => {
    const i = install('zh', (raw) => { raw.worlds = { 'desktop-pet': { user: '主人' } }; });
    i.setLanguage('en');
    expect(i.pet.user).toBe('Pal');
  });

  it('between languages with the same defaults changes only what differs', () => {
    expect(languageSwitchPatch({ user: 'Pal', asr: { language: 'en', simplified: false } }, 'en', 'ja')).toEqual({ 'asr.language': 'ja' });
    expect(languageSwitchPatch({ user: 'Pal', asr: { language: 'en', simplified: false } }, 'en', 'fr')).toEqual({ 'asr.language': 'auto' });
    expect(languageSwitchPatch({ user: '伙伴', asr: { language: 'zh', simplified: true } }, 'zh', 'zh-Hant')).toEqual({ 'asr.simplified': false });
    expect(languageSwitchPatch({ user: '伙伴', asr: { language: 'zh', simplified: false } }, 'zh-Hant', 'zh')).toEqual({ 'asr.simplified': true });
    expect(languageSwitchPatch({ user: '伙伴', asr: { language: 'zh', simplified: true } }, 'zh', 'zh')).toEqual({});
  });

  it('a Chinese install that never switches is not touched', () => {
    const i = install('zh');
    // the same language again, and anything else the console writes
    i.setLanguage('zh');
    setByPath(i.config as any, 'rounds.soft', 9);
    expect(i.changes).toEqual([]);
    expect(read(i.file)).not.toHaveProperty('worlds');
    expect(i.pet.user).toBe('伙伴');
    expect(i.pet.asr).toMatchObject({ language: 'zh', simplified: true });
    // a stored value that is not a language reads as Chinese: still no change
    const odd = install('zh', (raw) => { raw.language = 'xx'; });
    const oddBytes = readFileSync(odd.file);
    odd.setLanguage('zh');
    expect(odd.changes).toEqual([]);
    expect(read(odd.file)).toEqual({ ...JSON.parse(oddBytes.toString()), language: 'zh' });
  });

  it('leaves config.json byte for byte as it was when the language is not changed', () => {
    const i = install('zh');
    const before = readFileSync(i.file);
    i.setLanguage('zh');
    expect(readFileSync(i.file).equals(before)).toBe(true);
  });

  it('an unreadable config.json does not stop the change of language itself', () => {
    const i = install('zh');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(i.file, '{ not json');
    setByPath(i.config as any, 'language', 'en');
    expect(i.changes).toEqual(['en']);
    expect(warn).toHaveBeenCalled();
    // nothing half done: the live values stay as the file has them
    expect(i.pet.user).toBe('伙伴');
    warn.mockRestore();
  });
});
