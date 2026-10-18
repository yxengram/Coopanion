/**
 * The app language as the console reads and changes it: `language` in the Core's `companion` config
 * group (core/language.ts, core/companion.ts). An old config has none, which reads as Chinese.
 *
 * A change is written through `/api/config`; the Core tells the Electron main process, which sets
 * the console's stored language (`cortico.webui.language`, app/settings-preload.cjs) and reloads
 * this window, the tray and the pet. For a plain browser the page also saves the console language
 * itself and reloads, since nothing else would. Cortico's own Settings → Language buttons only save
 * the browser's preference, which the preload overwrites on the next load; `routeLanguageButtons`
 * sends them the same way.
 */
import { isLanguage, LANGUAGES, languageTag, type Language } from '../../../core/language.ts';
import { setConfig, type RequestOptions } from '../core/api.ts';
import { pick, saveLanguage } from '../core/language.ts';
import { S as SETTINGS } from './settings/strings.ts';
import type { FeatureContext } from './feature.ts';

export const APP_GROUP = 'companion';
export const LANGUAGE_KEY = 'language';

/** The language Coopanion's own tables are read in: Cortico's `pick` reads zh for zh-Hant, en for the rest. */
export const BASE = pick<'zh' | 'en'>({ zh: 'zh', en: 'en' });

/** The choices of the 「习惯」 page, each named in itself. */
export const APP_LANGUAGES: ReadonlyArray<{ value: Language; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

/** Exported for the key-parity test (tests/console-i18n.test.js), as every table of the overlay. */
export const TEXT = {
  zh: { languageDesc: '设置窗口、托盘菜单和桌宠用这种语言;切换后窗口会刷新。' },
  en: { languageDesc: 'The settings window, the tray menu and the pet use this language; the window reloads after a change.' },
};
const S = pick(TEXT);

interface ConfigEntry { group: { id: string }; values?: Record<string, unknown> }

/** The app language a `GET /api/config` answer holds: absent or not a language reads as Chinese. */
export function storedLanguage(groups: readonly ConfigEntry[] | undefined): Language {
  const value = groups?.find((g) => g.group.id === APP_GROUP)?.values?.[LANGUAGE_KEY];
  return isLanguage(value) ? value : 'zh';
}

export interface ReloadEnv {
  storage: Pick<Storage, 'setItem'>;
  reload(): void;
}

const windowEnv = (): ReloadEnv => ({ storage: window.localStorage, reload: () => window.location.reload() });

/** Saves the app language, then shows the console in it. Throws when the Core does not take it. */
export async function setAppLanguage(language: Language, opts?: RequestOptions, env: ReloadEnv = windowEnv()): Promise<void> {
  await setConfig(APP_GROUP, { [LANGUAGE_KEY]: language }, opts);
  try {
    saveLanguage(language, env.storage);
  } catch { /* no storage: the server's default stays until the app reloads the window */ }
  env.reload();
}

/**
 * After Cortico's settings page mounted: its language buttons (one per language, each with its `lang`
 * tag) write the app language instead of only this browser's preference, after the same question.
 */
export function routeLanguageButtons(ctx: FeatureContext, env?: ReloadEnv): void {
  const { root, signal, ui } = ctx;
  const byTag = new Map(LANGUAGES.map((l) => [languageTag(l), l] as const));
  const general = root.querySelector('#settings-general');
  if (!general) return;
  for (const el of general.querySelectorAll('.sh-desc')) {
    if (el.textContent === SETTINGS.languageDesc) el.textContent = S.languageDesc;
  }
  // in the capture phase on an ancestor, before the button's own handler, which then never runs
  general.addEventListener('click', (e) => {
    const button = (e.target as Element | null)?.closest?.('[role="group"] button[lang]');
    const language = button ? byTag.get(button.getAttribute('lang') ?? '') : undefined;
    if (!language) return;
    e.stopPropagation();
    e.preventDefault();
    void (async () => {
      if (!await ui.confirm({ title: SETTINGS.reloadTitle, body: SETTINGS.reloadBody }) || signal.aborted) return;
      await setAppLanguage(language, { signal }, env);
    })().catch(ctx.onError);
  }, { capture: true, signal });
}
