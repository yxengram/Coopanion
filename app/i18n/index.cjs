/**
 * The main process's text, and the language a new install starts in.
 *
 * The text follows the app language (`language` in `<home>/companion/config.json`, core/language.ts).
 * Coopanion's own text ships in `zh.cjs` and `en.cjs`, each with every key; as Cortico's `pick` does,
 * `zh-Hant` reads `zh` and every other language reads `en`.
 */
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** The app languages: Cortico's console languages, as `LANGUAGES` in `cortico/core/language.ts` lists them. */
const LANGUAGES = ['zh', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'es-419', 'pt-BR', 'it', 'ru'];

const TABLES = { zh: require('./zh.cjs'), en: require('./en.cjs') };

/** `languageOfLocale` of `cortico/core/language.ts`, which a CommonJS file cannot import (tests/app-i18n.test.ts keeps them alike). */
function languageOfLocale(tag) {
  const t = String(tag ?? '').trim().toLowerCase().replace(/[.@].*$/, '');
  if (!t) return undefined;
  const [primary, second] = t.split(/[-_]/);
  switch (primary) {
    case 'zh': return second === 'hant' || second === 'tw' || second === 'hk' || second === 'mo' ? 'zh-Hant' : 'zh';
    case 'es': return 'es-419';
    case 'pt': return 'pt-BR';
    case 'ja': case 'ko': case 'fr': case 'de': case 'it': case 'ru': return primary;
    default: return 'en';
  }
}

/**
 * The system's language: the first of its preferred languages, else its UI locale, mapped by
 * `languageOfLocale`; English when it names none. Call after `ready` (Electron answers only then).
 * `COOPANION_SYSTEM_LANGUAGE` set to a language when the app is launched stands in for it (to try a
 * first run in another language).
 */
function systemLanguage(app, env = process.env) {
  if (LANGUAGES.includes(env.COOPANION_SYSTEM_LANGUAGE)) return env.COOPANION_SYSTEM_LANGUAGE;
  let tags = [];
  try { tags = [...app.getPreferredSystemLanguages(), app.getLocale()]; } catch { /* before ready: no answer */ }
  for (const tag of tags) {
    const language = languageOfLocale(tag);
    if (language) return language;
  }
  return 'en';
}

/**
 * `language` in `<home>/companion/config.json` (the deployment `core/seed.ts` writes); null before the
 * first start (no file). A config without one, with one that is not a language, or that cannot be read
 * is an install from before there was a choice: Chinese.
 */
function configuredLanguage(home) {
  const file = join(home, 'companion', 'config.json');
  if (!existsSync(file)) return null;
  try {
    const language = JSON.parse(readFileSync(file, 'utf8')).language;
    return LANGUAGES.includes(language) ? language : 'zh';
  } catch {
    return 'zh';
  }
}

/** The text table of `language`: `zh` for zh and zh-Hant, `en` for every other language (and anything unknown). */
function textOf(language) {
  return language === 'zh' || language === 'zh-Hant' ? TABLES.zh : TABLES.en;
}

module.exports = { LANGUAGES, languageOfLocale, systemLanguage, configuredLanguage, textOf };
