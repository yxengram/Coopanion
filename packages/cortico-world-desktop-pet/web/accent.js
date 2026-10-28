/**
 * The pet page's theme colour (`--skin-eye`: the bubble's picked cards, step dots, marks, caret and buttons) for the
 * body on screen. Coo's palette sets it (coo/coo.js skinCss); another pack's body sets it from the preset its look
 * wears: the preset's settings-window accent (`presets[].console.light/dark.a`), light and dark, else its `accent`
 * for both. A look that is not a preset (the whale's `claude-cape`, a girl's `original-winter`) wears the preset
 * that picks the same option on the most axes, the first of them on a tie: the one whose colours the settings
 * window takes (core/console-theme.ts `schemeForSkin` in Coopanion), so the bubble and the window agree.
 */

/** Only plain hex colours: a pack's figure.json is written into a stylesheet. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const hex = (c) => (typeof c === 'string' && HEX.test(c) ? c : null);

/** The preset whose colours a look wears (see the top of this file), or null for a pack with none. */
export function presetFor(pack, scheme, has = () => true) {
  const presets = (pack?.presets ?? []).filter(has);
  if (!presets.length) return null;
  const exact = presets.find((p) => p.id === scheme);
  if (exact) return exact;
  const picks = String(scheme ?? '').split('-');
  const shared = (p) => (pack.axes ?? []).filter((a, i) => p.pick?.[a.id] === picks[i]).length;
  return presets.reduce((best, p) => (shared(p) > shared(best) ? p : best));
}

/** `--skin-eye` for `pack` (as /api/figures lists it) in `skin`, light and dark; null for Coo or no colour. */
export function accentColors(pack, skin) {
  if (!pack || pack.id === 'coo') return null;
  const own = presetFor(pack, skin?.scheme, (p) => hex(p.console?.light?.a) && hex(p.console?.dark?.a));
  if (own) return { light: own.console.light.a, dark: own.console.dark.a };
  const accent = hex(presetFor(pack, skin?.scheme, (p) => hex(p.accent))?.accent);
  return accent ? { light: accent, dark: accent } : null;
}

/** The stylesheet that puts `colors` (accentColors) over the skin's, following the page's light and dark; '' for none. */
export function accentCss(colors, selector = 'html:root') {
  if (!colors) return '';
  return `${selector}{--skin-eye:${colors.light}}`
    + `@media (prefers-color-scheme: dark){${selector}:not([data-theme="light"]){--skin-eye:${colors.dark}}}`
    + `${selector}[data-theme="dark"]{--skin-eye:${colors.dark}}`;
}

/** A bubble colour (upstream #434 allows #rgb, #rgba, #rrggbb and #rrggbbaa, as src/packs.ts reads them). */
const BUBBLE_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const bubbleSet = (c) => (c && typeof c === 'object' && [c.fill, c.text, c.line].every((h) => typeof h === 'string' && BUBBLE_HEX.test(h)) ? c : null);

/**
 * The bot's bubbles' colours for `pack` (as /api/figures lists it) in `skin` (upstream #434): the `bubble` of the preset its
 * look wears (presetFor, as the accent above), else the pack's own; null when it names none or not a whole set per theme.
 */
export function bubbleColors(pack, skin) {
  if (!pack) return null;
  const b = presetFor(pack, skin?.scheme)?.bubble ?? pack.bubble;
  const light = bubbleSet(b?.light), dark = bubbleSet(b?.dark);
  return light && dark ? { light, dark } : null;
}

/** The stylesheet that puts `colors` (bubbleColors) on the bot's bubbles, light and dark; the person's own lines (`.heard`) keep the page's. */
export function bubbleCss(colors) {
  if (!colors) return '';
  const vars = (c) => `--surface:${c.fill};--text:${c.text};--skin-ink:${c.line}`;
  const sel = 'html:root .bubble:not(.heard)';
  return `${sel}{${vars(colors.light)}}`
    + `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]) .bubble:not(.heard){${vars(colors.dark)}}}`
    + `html:root[data-theme="dark"] .bubble:not(.heard){${vars(colors.dark)}}`;
}
