/**
 * The app's language (`config.language`) and what it means for the text the bot reads.
 *
 * The app language is Cortico's console language (`Language` in `cortico/core/language.ts`), and the
 * settings window shows the console in it. A new install takes the operating system's language
 * (`COOPANION_SYSTEM_LANGUAGE`, read by the Electron main process in `app/i18n/index.cjs` and written
 * into the new config by `seed.ts`); the person changes it on the 「习惯」 page, which writes
 * `language` through the console's config API (the `companion` config group). A value outside
 * `Language` (absent, or edited by hand) reads as Chinese, the language every install had before
 * there was a choice, so an upgrade never changes it.
 *
 * Text people read ships in `zh` and `en`; Cortico's `pick` reads `zh` for `zh-Hant` and `en` for
 * every other language. Text the bot reads (environment prompts, tool descriptions, events, the
 * self-description) stays Chinese in every language: for a language other than `zh` and `zh-Hant`
 * the bot gets one more line, `replyLanguage`, telling it to talk to the person in that language.
 * Only the `coopanion` World (`notice.ts`) puts that line in the prefix, so it appears once; the
 * prefix follows a change at the rebuild `companion.ts` asks for.
 */
import { isLanguage, type Language } from 'cortico/core/language.ts';

/** The language of the text the bot reads: Chinese for every app language. */
export type ModelLanguage = 'zh';

/** The app language a stored value stands for. */
export const appLanguage = (value: unknown): Language => (isLanguage(value) ? value : 'zh');

/** The language of the text the bot reads for app language `language`. */
export const modelLanguage = (_language: unknown): ModelLanguage => 'zh';

/** Each app language other than Chinese, named in Chinese, for the bot's one line. */
const REPLY_NAMES: Readonly<Record<Exclude<Language, 'zh' | 'zh-Hant'>, string>> = {
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  'es-419': '西班牙语(拉丁美洲)',
  'pt-BR': '葡萄牙语(巴西)',
  it: '意大利语',
  ru: '俄语',
};

/**
 * The one line telling the bot to talk to the person in `language`; null for `zh`, `zh-Hant` and
 * anything that is not a language (which reads as `zh`).
 */
export function replyLanguage(language: unknown): string | null {
  const l = appLanguage(language);
  if (l === 'zh' || l === 'zh-Hant') return null;
  const name = REPLY_NAMES[l];
  return `对方用的是${name}:用${name}和对方说话,气泡里的话、提问和选项都用${name}写。`;
}

/**
 * The language a new install starts in: the system's as the Electron main process read it
 * (`COOPANION_SYSTEM_LANGUAGE`), Chinese when the Core runs without it (an eval, a test) or it is
 * not a language.
 */
export function newInstallLanguage(env: Record<string, string | undefined>): Language {
  return appLanguage(env.COOPANION_SYSTEM_LANGUAGE);
}
