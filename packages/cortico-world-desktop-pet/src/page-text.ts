/**
 * The pages' first paint in the app language. pet.html and dress.html are written in Chinese and filled from the
 * pages' tables (web/i18n.js `applyText`) once their script knows the language; for another language the server
 * stamps the table's text into the markup it sends (`<html lang>`, `<title>`, `data-i18n` text and
 * `data-i18n-label` aria-labels), so the page never shows Chinese first and the window title does not flip. In
 * Chinese the file goes out as it is.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Language } from 'cortico/core/language.ts';

/** The page table a language reads (web/i18n.js `tableOf`). */
export const pageTableOf = (language: Language): 'zh' | 'en' => (language === 'zh' || language === 'zh-Hant' ? 'zh' : 'en');

/** `<html lang>` for an app language (web/i18n.js `htmlLang`). */
const htmlLang = (language: Language): string => (language === 'zh' ? 'zh-CN' : language);

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `html` with the text of `table` for `language`; `titleKey` names the `<title>`'s text. */
export function stampPage(html: string, table: Readonly<Record<string, string>>, language: Language, titleKey: string): string {
  const text = (key: string, was: string): string => (typeof table[key] === 'string' ? escape(table[key]) : was);
  return html
    .replace(/<html lang="[^"]*"/, `<html lang="${escape(htmlLang(language))}"`)
    .replace(/(<title\b[^>]*>)([^<]*)(<\/title>)/, (_m, open: string, was: string, close: string) => `${open}${text(titleKey, was)}${close}`)
    .replace(/(<[a-z][^>]*\sdata-i18n="([\w.-]+)"[^>]*>)([^<]*)(?=<)/g, (_m, open: string, key: string, was: string) => `${open}${text(key, was)}`)
    .replace(/aria-label="([^"]*)"(\s+data-i18n-label="([\w.-]+)")/g, (_m, was: string, attr: string, key: string) => `aria-label="${text(key, was)}"${attr}`);
}

const tables = new Map<string, Promise<Record<string, string> | null>>();

/** The English page table of `webDir` (web/i18n/en.js), loaded once; null when it cannot be read. */
export function pageTable(webDir: string): Promise<Record<string, string> | null> {
  let table = tables.get(webDir);
  if (!table) {
    table = import(pathToFileURL(join(webDir, 'i18n', 'en.js')).href)
      .then((m: { default?: Record<string, string> }) => m.default ?? null, () => null);
    tables.set(webDir, table);
  }
  return table;
}
