/** First-run files of the app's deployment. Imports nothing from Cortico, so it runs and tests on its own. */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPLOYMENT = 'companion';
export const ENDPOINT = 'deepseek';
export const KEY_NAME = 'DEEPSEEK_API_KEY';
export const CONSOLE_PORT = 17788;
export const DISPLAY_NAME = 'Coo';
/** The provider module of the app's endpoints (cortico-provider-coo). */
export const MODULE = 'coo';
/** The module the endpoints of versions up to 0.1.2 name; it became `coo`. */
const OLD_MODULE = 'deepseek';
/** SHA-256 of the self-description versions 0.1.0 (after the rename) and 0.1.1 seeded, line endings as LF. */
const OLD_CONSTITUTION = 'cfcb7527cbf3518ab9f077ee711c86661a70613b9e5caeb992b30a603490e5cf';
export const SEED_DIR = fileURLToPath(new URL('./seed/', import.meta.url));
/** The person's default name in a new install that is not in Chinese (the pet World's own default is 「伙伴」). */
export const DEFAULT_USER_EN = 'Pal';
/** The languages SenseVoice (the default speech engine) recognizes, as the app languages name them. */
const SPEECH_LANGUAGES: Readonly<Record<string, string>> = { zh: 'zh', 'zh-Hant': 'zh', en: 'en', ja: 'ja', ko: 'ko' };

/**
 * What a new install in `language` sets in the pet World, whose defaults are a Chinese install's: none
 * for Chinese; otherwise speech in that language (`auto` where SenseVoice has none) without the
 * conversion to Simplified Chinese, and an English default name outside Chinese.
 */
export function newInstallWorlds(language: string): Record<string, unknown> | undefined {
  if (language === 'zh') return undefined;
  const asr = { language: SPEECH_LANGUAGES[language] ?? 'auto', simplified: false };
  return { 'desktop-pet': language === 'zh-Hant' ? { asr } : { user: DEFAULT_USER_EN, asr } };
}

/** The pet World's own default name for the person (its `DESKTOP_PET_DEFAULTS.user`), a Chinese install's. */
export const DEFAULT_USER_ZH = '伙伴';
/** Names for the person that are only a default: 「主人」 was the default before 0.1.2. The guide's name box starts empty for them, and statistics count them as not named. */
export const DEFAULT_USERS: readonly string[] = [DEFAULT_USER_ZH, '主人', DEFAULT_USER_EN];

/** The pet World values `newInstallWorlds` decides, as a person would have them untouched in an install of `language`. */
interface LanguageDefaults { user: string; users: readonly string[]; asrLanguage: string; simplified: boolean }

function languageDefaults(language: string): LanguageDefaults {
  const pet = (newInstallWorlds(language)?.['desktop-pet'] ?? {}) as { user?: string; asr?: { language?: string; simplified?: boolean } };
  const user = pet.user ?? DEFAULT_USER_ZH;
  // a Chinese install from before 0.1.2 may still have the old default
  return { user, users: user === DEFAULT_USER_ZH ? [DEFAULT_USER_ZH, '主人'] : [user], asrLanguage: pet.asr?.language ?? 'zh', simplified: pet.asr?.simplified ?? true };
}

/** The part of the pet World's section a change of language may touch. */
export interface LanguagePetValues { user?: unknown; asr?: { language?: unknown; simplified?: unknown } }

/**
 * What a change of the app language from `from` to `to` changes in the pet World (`worlds.desktop-pet`), as config
 * paths under that section: each value `newInstallWorlds` sets (the person's name, the speech language, the
 * conversion to Simplified Chinese) that still is `from`'s default becomes `to`'s, so an install switched to English
 * gets what an English one starts with, and back. A value the person set is theirs and stays; one set to exactly the
 * default (「伙伴」 typed on purpose) cannot be told from it and changes too. Each value is decided on its own; nothing
 * changes when the two languages have the same defaults (English and French keep the name, Chinese and Traditional
 * Chinese keep both).
 */
export function languageSwitchPatch(pet: LanguagePetValues, from: string, to: string): Record<string, string | boolean> {
  const was = languageDefaults(from);
  const now = languageDefaults(to);
  const patch: Record<string, string | boolean> = {};
  if (typeof pet.user === 'string' && was.users.includes(pet.user) && pet.user !== now.user) patch.user = now.user;
  if (pet.asr?.language === was.asrLanguage && was.asrLanguage !== now.asrLanguage) patch['asr.language'] = now.asrLanguage;
  if (pet.asr?.simplified === was.simplified && was.simplified !== now.simplified) patch['asr.simplified'] = now.simplified;
  return patch;
}

/**
 * Writes the first-run files that are missing; existing files are left as the operator made them,
 * except a self-description still exactly as an older version seeded it, which becomes the current
 * one, and endpoints of the old `deepseek` module, which now belong to `coo`. A new deployment config
 * gets `language` (the system's, `newInstallLanguage` in language.ts) and, when that is not Chinese,
 * `newInstallWorlds`; an existing one keeps its own, or none, which reads as Chinese.
 */
export function seed(home: string, language = 'zh'): void {
  const deploy = join(home, DEPLOYMENT);
  const endpoint = join(home, 'providers', ENDPOINT);
  const workspace = join(deploy, 'workspace');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(endpoint, { recursive: true });
  const write = (file: string, value: unknown) => { if (!existsSync(file)) writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
  write(join(deploy, 'deployment.json'), { bot: 'cormini' });
  write(join(deploy, 'config.json'), {
    displayName: DISPLAY_NAME,
    language,
    activeProvider: ENDPOINT,
    providerSchemaVersion: 3,
    web: { port: CONSOLE_PORT },
    worlds: newInstallWorlds(language),
  });
  write(join(endpoint, 'config.json'), {
    kind: MODULE,
    baseUrl: 'https://api.deepseek.com',
    secret: KEY_NAME,
    spec: { model: 'deepseek-flash', thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: true,
    pricing: [],
    options: {},
  });
  if (!existsSync(join(workspace, 'CONSTITUTION.md'))) copyFileSync(join(SEED_DIR, 'CONSTITUTION.md'), join(workspace, 'CONSTITUTION.md'));
  // the console shows it as the bot's avatar
  if (!existsSync(join(deploy, 'avatar.png'))) copyFileSync(join(SEED_DIR, 'avatar.png'), join(deploy, 'avatar.png'));
  upgradeSeededConstitution(workspace);
  moveEndpointsToCoo(join(home, 'providers'));
}

function moveEndpointsToCoo(providers: string): void {
  for (const dir of readdirSync(providers, { withFileTypes: true })) {
    const file = join(providers, dir.name, 'config.json');
    if (!dir.isDirectory() || !existsSync(file)) continue;
    const config = JSON.parse(readFileSync(file, 'utf8')) as { kind?: string };
    if (config.kind !== OLD_MODULE) continue;
    config.kind = MODULE;
    writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  }
}

function upgradeSeededConstitution(workspace: string): void {
  const file = join(workspace, 'CONSTITUTION.md');
  const text = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (createHash('sha256').update(text).digest('hex') === OLD_CONSTITUTION) copyFileSync(join(SEED_DIR, 'CONSTITUTION.md'), file);
}
