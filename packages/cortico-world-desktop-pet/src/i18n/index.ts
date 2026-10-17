/**
 * The text this World shows people, in Chinese (`zh.ts`) and English (`en.ts`). Bubbles, the menu, voice
 * hints and the dressing page's errors follow the app language (`DesktopPetWorld.appLanguage`); the
 * console's settings, lamps and panels follow the console request's language. Text the bot reads is not
 * here and stays Chinese.
 *
 * Imports nothing from Cortico at run time, so the console panels (src/console/client.ts) use it too.
 */
import type { Language } from 'cortico/core/language.ts';
import zh from './zh.ts';
import en from './en.ts';

export type PetText = typeof zh;

/**
 * The table of `language`; Chinese when absent. As Cortico's `pick` (cortico/core/language.ts), written
 * out for the console bundle: `zh-Hant` reads Chinese, every other language English.
 */
export function petText(language: Language | undefined = 'zh'): PetText {
  return language === 'zh' || language === 'zh-Hant' ? zh : en;
}
