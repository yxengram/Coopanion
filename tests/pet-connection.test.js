/**
 * The pet page's socket (packages/cortico-world-desktop-pet/web/pet-app.js, upstream #306): in the pet window it sends
 * the launch key its host loaded in the URL's fragment and connects again when another connection replaced it; a
 * browser tab sends no key, whatever its fragment says, and stays away once replaced. Run in jsdom as tests/pet-lines.test.js.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyTheme, clamp, f, ICONS, linked } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { OWN_PACKS } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { afterBubbles, dropActs, leftActs, pageLoop, slices, STEP_MAX, takeDeferred, walkHold } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { attachSayActs, createActs, sayHeld } from '../packages/cortico-world-desktop-pet/web/acts.js';
import { setLanguage, t } from '../packages/cortico-world-desktop-pet/web/i18n.js';
import { accentColors, accentCss, bubbleColors, bubbleCss } from '../packages/cortico-world-desktop-pet/web/accent.js';
import { createMic } from '../packages/cortico-world-desktop-pet/web/mic.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const source = readFileSync(new URL('pet-app.js', WEB), 'utf8').replace(/^import [^;]*;$/gm, '');
const html = readFileSync(new URL('pet.html', WEB), 'utf8');
const pages = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); setLanguage('zh'); });

/** The actual page with a socket stand-in that records the URLs it was opened with; `host` puts it in the pet window. */
function page({ host = false, hash = '' } = {}) {
  const dom = new JSDOM(html, { url: `http://127.0.0.1:7797/pet${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  pages.push(win);
  // the window host's preload: every call is a no-op, every subscription a no-op too
  if (host) win.petHost = new Proxy({}, { get: () => () => {} });
  const sockets = [];
  const timers = [];
  win.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  const body = {
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 600, y: 500 }, box: { x: 560, y: 500, w: 80, h: 100 }, side: { x: 600, y: 550, reach: 40 } },
    set() {}, cue() {}, talk() {}, tick() {}, hit: () => false, pointer() {}, knownWords: () => null,
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class {
    readyState = 1;
    constructor(url) { this.url = new URL(url); sockets.push(this); }
    send() {}
    close() {}
  };
  win.deps = {
    applyTheme, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document), COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS,
    createSfx: () => new Proxy({}, { get: () => () => {} }),
    // the speech stays off: the bubbles babble (tests/pet-speech.test.js covers the voice)
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false }),
    textSteps: () => 1,
    afterBubbles, dropActs, leftActs, loadBody: async () => body, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, createSpeech, textSteps, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic } = window.deps;\n${source}\n`
    + 'window.page = { onOrder, watching: () => watching };');
  return { ...win.page, sockets, timers, win };
}
const runTimers = (p) => { for (const fn of p.timers.splice(0)) fn(); };

describe('the pet page connection (upstream #306)', () => {
  it('in the window, sends the launch key from the fragment and connects again after being replaced', () => {
    const p = page({ host: true, hash: '#key=launch-credential' });
    expect(p.sockets).toHaveLength(1);
    const url = p.sockets[0].url;
    expect(url.pathname).toBe('/socket');
    expect(Object.fromEntries(url.searchParams)).toEqual({ role: 'pet', host: 'window', key: 'launch-credential' });
    p.sockets[0].onopen();
    p.sockets[0].onclose({ code: 4000 });
    runTimers(p);
    expect(p.sockets).toHaveLength(2);
    expect(p.sockets[1].url.href).toBe(url.href);
  });

  it('a new connection starts as the pet again, though the old one was told it only watches', () => {
    const p = page({ host: true, hash: '#key=k' });
    p.sockets[0].onopen();
    p.onOrder({ t: 'watching' });
    expect(p.watching()).toBe(true);
    p.sockets[0].onclose({ code: 1006 });
    runTimers(p);
    p.sockets[1].onopen();
    expect(p.watching()).toBe(false);
  });

  it('in a browser tab, sends no key even with one in the fragment, and stays away once replaced', () => {
    const p = page({ hash: '#key=unused' });
    expect(Object.fromEntries(p.sockets[0].url.searchParams)).toEqual({ role: 'pet', host: 'tab' });
    p.sockets[0].onopen();
    p.sockets[0].onclose({ code: 4000 });
    runTimers(p);
    expect(p.sockets).toHaveLength(1);
    // any other close tries again
    p.sockets[0].onclose({ code: 1006 });
    runTimers(p);
    expect(p.sockets).toHaveLength(2);
  });

  it('a window loaded without a key (an old host) connects without one, and the server answers it 403', () => {
    const p = page({ host: true });
    expect(Object.fromEntries(p.sockets[0].url.searchParams)).toEqual({ role: 'pet', host: 'window' });
  });
});
