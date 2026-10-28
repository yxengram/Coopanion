/**
 * The pet page's cursor reports (packages/cortico-world-desktop-pet/web/pet-app.js onCursor, upstream #465): while the
 * window passes the mouse through, a report that moved is a pointer move for the body (eyes, turning, the hover
 * take-over), since on Windows such a window gets no moves of its own; a report off the window is a leave. While the
 * window takes the mouse, the page's own pointer moves drive the body and the reports do not repeat them.
 * Run in jsdom as tests/pet-connection.test.js.
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

/** The page in the pet window, its body a stand-in that records the pointer events it gets; `onBody` says where the body is. */
function page() {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:7797/pet#key=k', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  pages.push(win);
  let report = null;
  const wishes = [];
  win.petHost = new Proxy({}, {
    get: (_t, k) => (k === 'onCursor' ? (fn) => { report = fn; } : k === 'setInteractive' ? (on) => wishes.push(on) : () => {}),
  });
  win.document.elementFromPoint = () => null;
  const pointer = [];
  const over = { x: 500, y: 400, w: 200, h: 300 };
  const body = {
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 600, y: 500 }, box: { x: 560, y: 500, w: 80, h: 100 }, side: { x: 600, y: 550, reach: 40 } },
    set() {}, cue() {}, talk() {}, tick() {}, knownWords: () => null,
    hit: (p) => p.x >= over.x && p.x < over.x + over.w && p.y >= over.y && p.y < over.y + over.h,
    pointer: (type, p) => pointer.push([type, p && 'x' in p ? { x: p.x, y: p.y } : null]),
  };
  win.requestAnimationFrame = () => 0;
  win.setTimeout = () => 0;
  win.WebSocket = class { readyState = 1; send() {} close() {} };
  win.deps = {
    applyTheme, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document), COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS,
    createSfx: () => new Proxy({}, { get: () => () => {} }),
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false }),
    textSteps: () => 1,
    afterBubbles, dropActs, leftActs, loadBody: async () => body, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic, body,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, createSpeech, textSteps, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic } = window.deps;\n${source}\n`
    + 'body = window.deps.body; window.page = { interactive: () => interactive };');
  return { ...win.page, report: (p, across) => report(p, across), pointer, wishes, win };
}

describe('the cursor reports drive the body while the window passes the mouse through (upstream #465)', () => {
  it('a report that moved is a move, one that did not is not repeated, one off the window is a leave', () => {
    const p = page();
    p.report({ x: 100, y: 100 }, 100);
    p.report({ x: 100, y: 100 }, 100);
    p.report({ x: 140, y: 120 }, 140);
    expect(p.pointer).toEqual([['move', { x: 100, y: 100 }], ['move', { x: 140, y: 120 }]]);
    expect(p.wishes.at(-1)).toBe(false);
    p.report(null, null);
    p.report(null, null);
    expect(p.pointer.slice(2)).toEqual([['leave', null]]);
  });

  it('once the window takes the mouse (over the body), the reports no longer feed it moves', () => {
    const p = page();
    p.report({ x: 100, y: 100 }, 100);
    // onto the body: this report is still the move that gets there, then the window takes the mouse
    p.report({ x: 600, y: 500 }, 600);
    expect(p.interactive()).toBe(true);
    expect(p.wishes.at(-1)).toBe(true);
    const n = p.pointer.length;
    p.report({ x: 610, y: 510 }, 610);
    expect(p.pointer.length).toBe(n);
    // off the body again: passing through, the reports are moves once more
    p.report({ x: 200, y: 200 }, 200);
    expect(p.interactive()).toBe(false);
    p.report({ x: 210, y: 200 }, 210);
    expect(p.pointer.at(-1)).toEqual(['move', { x: 210, y: 200 }]);
  });
});
