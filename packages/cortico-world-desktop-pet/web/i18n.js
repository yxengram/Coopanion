/**
 * The pages' text (the pet page, the dressing page). Each table is a module in `i18n/`, whose default export maps
 * keys to strings; `{name}` marks a value filled in. zh.js and en.js have the same keys.
 *
 * The app language comes from the World (`language` in `init` and `prefs`, `GET /api/state`): Chinese (`zh`,
 * `zh-Hant`) reads zh.js and every other language reads en.js, as Cortico's `pick` chooses. Until the World says,
 * the pages show Chinese. Only text people read goes through here; what the page reports to the World (a figure that
 * would not load, and why) is the bot's and stays Chinese.
 */
import zh from './i18n/zh.js';
import en from './i18n/en.js';

export const TABLES = { zh, en };

let current = 'zh', table = zh;

/** The table a language reads: zh for Chinese, en for the rest. */
export const tableOf = (code) => (code === 'zh' || code === 'zh-Hant' ? 'zh' : 'en');

/** `<html lang>` for an app language code. */
export const htmlLang = (code) => (code === 'zh' ? 'zh-CN' : code);

/**
 * Switches the pages' text to `code` and marks the page with it; a value that is not a language code leaves it as it
 * is. Returns whether the text changed (the caller redraws what it wrote).
 */
export function setLanguage(code, doc = globalThis.document) {
  if (typeof code !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) return false;
  const was = tableOf(current);
  current = code;
  table = TABLES[tableOf(code)];
  if (doc?.documentElement) doc.documentElement.lang = htmlLang(code);
  return tableOf(code) !== was;
}

/** The app language the pages show. */
export const language = () => current;

/** Whether the pages show Chinese. */
export const isZh = () => tableOf(current) === 'zh';

/** The text of `key`, `{name}` filled from `vars`. */
export function t(key, vars) {
  const s = table[key] ?? zh[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/**
 * A name a figure pack gives per language (`{ zh, en, … }`): the page's, else its table's, else the first one; outside
 * Chinese English and Chinese come before the first. In Chinese that is `zh`, else the first one, as the World's own
 * `nameIn(n, 'zh')` (src/packs.ts) names it to the bot and as the page did before it had other languages.
 */
export function nameIn(names) {
  if (!names) return '';
  const own = names[current] ?? names[tableOf(current)];
  return (isZh() ? own : own ?? names.en ?? names.zh) ?? Object.values(names)[0] ?? '';
}

/**
 * The label of one of Coo's options (web/coo/coo.js: a palette, an accessory, an accessory colour) by its kind and id:
 * coo.js's own Chinese label in Chinese (core/notice.ts tells the bot those), else the table's.
 */
export function cooLabel(kind, id, label) {
  return isZh() ? label : t(`${kind}.${id}`);
}

/** Fills the elements under `root` marked `data-i18n` (text), `data-i18n-label` (aria-label) and `data-i18n-title` (title). */
export function applyText(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
