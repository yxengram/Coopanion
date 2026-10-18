/**
 * The pet page (packages/cortico-world-desktop-pet/web/pet-app.js) run in jsdom with a quiet socket and body, the test
 * advancing the page's clock: what the person said stays beside the pet as up to three dashed bubbles (upstream #241),
 * the listening bubble's cancel button (#205), and the bubble and text size settings (CSS variables, unset at 1).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyTheme, clamp, f, ICONS } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { OWN_PACKS } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { afterBubbles, dropActs, leftActs, pageLoop, slices, STEP_MAX, takeDeferred, walkHold } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { attachSayActs, createActs, sayHeld } from '../packages/cortico-world-desktop-pet/web/acts.js';
import { setLanguage, t } from '../packages/cortico-world-desktop-pet/web/i18n.js';
import { accentColors, accentCss } from '../packages/cortico-world-desktop-pet/web/accent.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const source = readFileSync(new URL('pet-app.js', WEB), 'utf8').replace(/^import [^;]*;$/gm, '');
const html = readFileSync(new URL('pet.html', WEB), 'utf8');
const pages = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); setLanguage('zh'); });

/** The actual page with a socket that keeps what it sends and a body that stands still; `step(dt)` moves its clock on. */
function page() {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1/pet', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  pages.push(win);
  const sent = [];
  const body = {
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 600, y: 500 }, box: { x: 560, y: 500, w: 80, h: 100 }, side: { x: 600, y: 550, reach: 40 } },
    set() {}, cue() {}, talk() {}, tick() {}, hit: () => false, pointer() {}, knownWords: () => null,
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class { readyState = 1; send(d) { sent.push(JSON.parse(d)); } };
  win.deps = {
    applyTheme, clamp, f, ICONS, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS,
    createSfx: () => new Proxy({}, { get: () => () => {} }),
    afterBubbles, dropActs, leftActs, loadBody: async () => body, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss } = window.deps;\n${source}\n`
    + 'window.page = { useBody: (b) => { body = b; }, onOrder, openInput, step: (dt) => { stepPage(dt); layout(dt); }, lines: () => lines, overUi: (el) => el.matches(UI_SELECTOR), REPLIED_FADE, UNANSWERED_FADE, MAX_LINES, MAX_ROWS };');
  return { ...win.page, win, doc: win.document, bubble: win.document.querySelector('#bubble'), sent, body };
}
/** The page with its body handed over at once (a page runs its body only once one is loaded; eval scopes the page's `let`s to itself). */
function ready() {
  const p = page();
  p.useBody(p.body);
  return p;
}
const up = (p) => p.lines().filter((l) => l.fadeAt === null);
const said = (p, text, cursor, images = 0) => p.onOrder({ t: 'said', via: 'chat', text, images, cursor });
const say = (p, id, text) => p.onOrder({ t: 'say', id, beats: [{ text, actions: [], anchors: [] }] });
/** Steps until Coo's bubble has closed (at most `seconds`), calling `each` after every step. */
function untilClosed(p, seconds = 20, each = () => {}) {
  for (let i = 0; i < seconds / .05 && !p.bubble.hidden; i++) { p.step(.05); each(); }
}

describe("the person's lines beside the pet (#241)", () => {
  it('a heard line stays while Coo thinks and while its reply is up, and fades REPLIED_FADE seconds after the reply closes', () => {
    const p = ready();
    p.onOrder({ t: 'listen', phase: 'start' });
    p.onOrder({ t: 'listen', phase: 'heard', text: '今天天气怎么样' });
    expect(up(p)).toHaveLength(1);
    expect(up(p)[0].el.textContent).toBe('今天天气怎么样');
    expect(up(p)[0].el.querySelector('.said-mark')).not.toBeNull();
    // thinking for longer than an unanswered line lasts
    p.onOrder({ t: 'thinking', on: true });
    p.step(p.UNANSWERED_FADE + 1);
    expect(up(p)).toHaveLength(1);
    p.onOrder({ t: 'thinking', on: false });
    say(p, 's', '晴天');
    // one frame takes the item up, the next opens its bubble
    p.step(.01); p.step(.01);
    expect(p.bubble.hidden).toBe(false);
    untilClosed(p, 30, () => expect(up(p)).toHaveLength(1));
    expect(p.bubble.hidden).toBe(true);
    p.step(p.REPLIED_FADE - .1);
    expect(up(p)).toHaveLength(1);
    p.step(.2);
    expect(up(p)).toHaveLength(0);
    // gone from the page once faded
    p.step(1);
    expect(p.lines()).toHaveLength(0);
    expect(p.doc.querySelectorAll('.bubble.said')).toHaveLength(0);
  });

  it('a line Coo does not answer fades UNANSWERED_FADE seconds after it was said', () => {
    const p = ready();
    p.openInput();
    const input = p.bubble.querySelector('input');
    input.value = '在吗';
    p.bubble.querySelector('form').dispatchEvent(new p.win.Event('submit', { cancelable: true }));
    expect(p.sent.at(-1)).toEqual({ t: 'text', text: '在吗' });
    expect(up(p).map((l) => [l.src, l.el.textContent])).toEqual([['type', '在吗']]);
    // typed in the box: no mark
    expect(up(p)[0].el.querySelector('.said-mark')).toBeNull();
    p.step(p.UNANSWERED_FADE - .1);
    expect(up(p)).toHaveLength(1);
    p.step(.2);
    expect(up(p)).toHaveLength(0);
  });

  it('holds MAX_LINES lines at most: past it the oldest fades even while Coo works on it, and the newest stays', () => {
    const p = ready();
    p.onOrder({ t: 'thinking', on: true });
    for (let i = 1; i <= p.MAX_LINES + 1; i++) { said(p, `第 ${i} 句`, i); p.step(.01); }
    expect(up(p).map((l) => l.cursor)).toEqual(Array.from({ length: p.MAX_LINES }, (_, i) => i + 2));
  });

  it('a chat-page message carries its images as a count, and a withdrawn one goes', () => {
    const p = ready();
    said(p, '', 7, 2);
    said(p, '看这个', 8, 1);
    const [onlyImages, both] = up(p);
    expect(onlyImages.el.textContent).toBe(t('said.images', { n: 2 }));
    expect(both.el.querySelector('.b-text').textContent).toBe('看这个');
    expect(both.el.querySelector('.b-hint').textContent).toBe(t('said.images', { n: 1 }));
    p.onOrder({ t: 'said-withdrawn', cursor: 8 });
    expect(up(p).map((l) => l.cursor)).toEqual([7]);
  });

  it('a click closes a settled line, which then lets the pointer through; a line being heard closes only by its cancel button', () => {
    const p = ready();
    said(p, '在吗', 1);
    p.onOrder({ t: 'listen', phase: 'start' });
    p.step(.01);
    const [sentLine, heard] = p.lines();
    heard.el.click();
    expect(heard.fadeAt).toBeNull();
    expect(p.overUi(sentLine.el)).toBe(true);
    sentLine.el.click();
    expect(sentLine.fadeAt).not.toBeNull();
    expect(p.overUi(sentLine.el)).toBe(false);
  });

  it('sits beside the pet, clear of its bubble, newest nearest the head, with the trail to the newest', () => {
    const p = ready();
    // jsdom lays nothing out: give the bubbles a size
    Object.defineProperty(p.win.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('bubble') ? 120 : 0; } });
    Object.defineProperty(p.win.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('bubble') ? 40 : 0; } });
    said(p, '一', 1);
    said(p, '二', 2);
    p.step(.01);
    const [older, newer] = p.lines();
    const top = (l) => parseFloat(l.el.style.top), left = (l) => parseFloat(l.el.style.left);
    expect(top(newer)).toBeGreaterThan(top(older));
    // the pet faces right: the stack is on its left
    expect(left(newer) + 120).toBeLessThanOrEqual(600);
    expect(older.el.classList.contains('older')).toBe(true);
    expect(p.doc.querySelector('#trail').hidden).toBe(false);
  });
});

describe("the listening bubble's cancel button (#205)", () => {
  it('sends cancel; the World closes the bubble with `none` and nothing stays beside the pet', () => {
    const p = ready();
    p.onOrder({ t: 'prefs', voice: { mode: 'hold' } });
    p.onOrder({ t: 'listen', phase: 'start' });
    p.onOrder({ t: 'listen', phase: 'partial', text: '说错', interim: '了' });
    const [line] = p.lines();
    const cancel = line.el.querySelector('.b-cancel');
    expect(cancel.hidden).toBe(false);
    expect(cancel.textContent).toBe(t('heard.cancel'));
    expect(line.el.querySelector('.fin').textContent).toBe('说错');
    // the bubble is updated in place, so the button under the pointer stays the same element
    p.onOrder({ t: 'listen', phase: 'partial', text: '说错了', interim: '' });
    expect(line.el.querySelector('.b-cancel')).toBe(cancel);
    cancel.click();
    expect(p.sent.at(-1)).toEqual({ t: 'cancel' });
    p.onOrder({ t: 'listen', phase: 'none' });
    expect(p.lines()).toHaveLength(0);
  });

  it('is not offered while always listening (no talk key, nothing to cancel)', () => {
    const p = ready();
    p.onOrder({ t: 'prefs', voice: { mode: 'always' } });
    p.onOrder({ t: 'listen', phase: 'start' });
    expect(p.lines()[0].el.querySelector('.b-cancel').hidden).toBe(true);
  });
});

describe('bubble and text size (#241)', () => {
  it('sets --bubble-size and --bubble-font only away from 1, so the default page is as pet.css writes it', () => {
    const p = ready();
    const root = p.doc.documentElement.style;
    p.onOrder({ t: 'prefs', bubbleSize: 1, fontSize: 1 });
    expect(root.getPropertyValue('--bubble-size')).toBe('');
    expect(root.getPropertyValue('--bubble-font')).toBe('');
    p.onOrder({ t: 'prefs', bubbleSize: 1.3, fontSize: .85 });
    expect(root.getPropertyValue('--bubble-size')).toBe('1.3');
    expect(root.getPropertyValue('--bubble-font')).toBe('0.85');
    p.onOrder({ t: 'prefs', bubbleSize: 1, fontSize: 1 });
    expect(root.getPropertyValue('--bubble-size')).toBe('');
    expect(root.getPropertyValue('--bubble-font')).toBe('');
  });
});
