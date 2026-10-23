/** The pages' round buttons: icons (24 units, currentColor) and the theme switch. */
import { t } from './i18n.js';

export const f = n => Math.round(n * 10) / 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The http(s) addresses written out in `text`, as [start, end) pairs (upstream #297). An address runs to the first
 * space or non-ASCII character, so one written straight into Chinese prose ends there; a sentence's closing
 * punctuation is left out. Only written-out addresses become links: the text of a link is where it goes.
 */
export function urlRanges(text) {
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[!-~]+/g)) {
    let url = m[0];
    // a closing bracket stays when the address opened it, as in a wiki title
    while (/[.,;:!?'"]$/.test(url) || (/[)\]}>]$/.test(url) && count(url, OPENERS[url.at(-1)]) < count(url, url.at(-1)))) url = url.slice(0, -1);
    try { new URL(url); } catch { continue; }
    out.push([m.index, m.index + url.length]);
  }
  return out;
}
const OPENERS = { ')': '(', ']': '[', '}': '{', '>': '<' };
const count = (s, c) => s.split(c).length - 1;

/**
 * The first `n` characters of `text` as nodes of `doc`; an address typed out in full is a link that opens outside the
 * window (the pet window's host sends http(s) to the browser, host/electron-main.cjs `guard`).
 */
export function linked(text, n = text.length, doc = document) {
  const frag = doc.createDocumentFragment();
  let at = 0;
  for (const [start, end] of urlRanges(text)) {
    if (end > n) break;
    const a = Object.assign(doc.createElement('a'), { href: text.slice(start, end), target: '_blank', rel: 'noopener noreferrer' });
    a.textContent = text.slice(start, end);
    frag.append(text.slice(at, start), a);
    at = end;
  }
  frag.append(text.slice(at, n));
  return frag;
}

const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  chat: icon('<path d="M6 4.5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-4.5 3.5v-3.5H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z"/>'),
  moon: icon('<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v1.6M12 19.6v1.6M2.8 12h1.6M19.6 12h1.6M5.5 5.5l1.1 1.1M17.4 17.4l1.1 1.1M5.5 18.5l1.1-1.1M17.4 6.6l1.1-1.1"/>'),
  play: icon('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: icon('<path d="M9 5.5v13M15 5.5v13"/>'),
  // eight flat teeth around a hub
  settings: icon(`<path d="${Array.from({ length: 32 }, (_, i) => {
    const a = (i - .5) * Math.PI / 16, r = i % 4 < 2 ? 9.6 : 7.2;
    return `${i ? 'L' : 'M'}${f(12 + r * Math.cos(a))} ${f(12 + r * Math.sin(a))}`;
  }).join('')}Z"/><circle cx="12" cy="12" r="3"/>`),
  power: icon('<path d="M12 3.5v8M7.2 6.3a8 8 0 1 0 9.6 0"/>'),
  mic: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>'),
  // the same microphone struck through
  micOff: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M4 4l16 16"/>'),
  sound: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  // a T-shirt: the dressing page
  shirt: icon('<path d="M8.5 3.5 4 6l-1.5 4.5L6 12v8.5h12V12l3.5-1.5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>'),
  eye: icon('<path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="3"/>'),
  // the chat page: the mark on what was sent from it (the typing box's button that carries the draft there draws the same arrows)
  expand: icon('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  // a page that opens in the browser
  external: icon('<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
  eyeOff: icon('<path d="M3 12s3.2-6 9-6c1.6 0 3 .4 4.2 1M21 12s-3.2 6-9 6c-1.6 0-3-.4-4.2-1"/><path d="M9.9 14.1a3 3 0 0 1 4.2-4.2M4 4l16 16"/>'),
  // how much the pet walks on its own, as a gauge: low, middle, high
  roam_off: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16 7 13.2"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),
  roam_calm: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16V10"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),
  roam_free: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l5-2.8"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/><path d="M19.5 6.5l1.5-1.5M21 10h1.5"/>'),
  // a waste bin: uninstalling a figure pack on the dressing page
  trash: icon('<path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>'),
};
/** Sets `theme` ('dark' | 'light') on the page; `button`, when given, shows the mode a click switches to. */
export function applyTheme(theme, button) {
  document.documentElement.dataset.theme = theme;
  if (!button) return;
  const toLight = theme === 'dark';
  button.innerHTML = toLight ? ICONS.sun : ICONS.moon;
  button.title = t(toLight ? 'theme.toLight' : 'theme.toDark');
  button.setAttribute('aria-label', button.title);
}
