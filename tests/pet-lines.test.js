/**
 * The pet page (packages/cortico-world-desktop-pet/web/pet-app.js) run in jsdom with a quiet socket and body, the test
 * advancing the page's clock: what the person said stays above the pet as up to three grey bubbles (upstream #241,
 * #279, with the 输入气泡 switch), the multi-line typing box (#279), the listening bubble's cancel button (#205), the
 * bubble and text size settings (CSS variables, unset at 1), the bubble speed (#248) and links in Coo's words (#297).
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
    applyTheme, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document), COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS,
    createSfx: () => new Proxy({}, { get: () => () => {} }),
    // the speech stays off: the bubbles babble (tests/pet-speech.test.js covers the voice)
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false }),
    textSteps: () => 1,
    afterBubbles, dropActs, leftActs, loadBody: async () => body, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, createSpeech, textSteps, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss } = window.deps;\n${source}\n`
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

describe("the person's lines above the pet (#241, #279)", () => {
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
    const input = p.bubble.querySelector('textarea');
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

  /** jsdom lays nothing out: every bubble 120 × 40. */
  const sized = (p) => {
    Object.defineProperty(p.win.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('bubble') ? 120 : 0; } });
    Object.defineProperty(p.win.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList.contains('bubble') ? 40 : 0; } });
  };
  const top = (l) => parseFloat(l.el.style.top), left = (l) => parseFloat(l.el.style.left);

  it('stacks the lines above the pet, centred over its head, the newest lowest, with no side picked and no trail (#279)', () => {
    for (const facing of [1, -1]) {
      const p = ready();
      p.body.layout.facing = facing;
      sized(p);
      for (let i = 1; i <= 3; i++) { said(p, `第 ${i} 句`, i); p.step(.01); }
      const tops = p.lines().map(top);
      // above the head (layout.bubble.y 500), newest at the bottom
      expect(tops.every((y) => y + 40 < 500)).toBe(true);
      expect(tops).toEqual([...tops].sort((a, b) => a - b));
      // centred on the head (layout.bubble.x 600), whichever way the pet faces
      expect(p.lines().map(left)).toEqual([540, 540, 540]);
      expect(p.lines().slice(0, -1).every((l) => l.el.classList.contains('older'))).toBe(true);
      expect(p.doc.querySelector('#trail')).toBeNull();
    }
  });

  it("sits over Coo's own bubble while it is up, centred on it", () => {
    const p = ready();
    sized(p);
    said(p, '在吗', 1);
    say(p, 's', '在呢');
    p.step(.01); p.step(.01);
    expect(p.bubble.hidden).toBe(false);
    const cooTop = parseFloat(p.bubble.style.top), cooLeft = parseFloat(p.bubble.style.left);
    const [line] = p.lines();
    // a new line eases to its place
    for (let i = 0; i < 20; i++) p.step(.05);
    expect(top(line) + 40).toBeLessThanOrEqual(cooTop);
    expect(left(line)).toBeCloseTo(cooLeft, 0);
  });

  it('with the switch off nothing typed or sent stays, the lines up fade, and a heard line fades once it is settled (#279)', () => {
    const p = ready();
    said(p, '留着', 1); p.step(.01);
    expect(up(p)).toHaveLength(1);
    p.onOrder({ t: 'prefs', saidBubbles: false });
    expect(up(p)).toHaveLength(0);
    said(p, '在吗', 2);
    expect(p.lines().filter((l) => l.cursor === 2)).toHaveLength(0);
    p.openInput();
    p.bubble.querySelector('textarea').value = '打的字';
    p.bubble.querySelector('form').dispatchEvent(new p.win.Event('submit', { cancelable: true }));
    expect(p.sent.at(-1)).toEqual({ t: 'text', text: '打的字' });
    expect(up(p)).toHaveLength(0);
    // speech still shows while it is heard
    p.onOrder({ t: 'listen', phase: 'start' });
    p.onOrder({ t: 'listen', phase: 'partial', text: '今天', interim: '' });
    expect(up(p)).toHaveLength(1);
    p.onOrder({ t: 'listen', phase: 'heard', text: '今天天气怎么样' });
    expect(up(p)).toHaveLength(0);
    // back on, lines stay again
    p.onOrder({ t: 'prefs', saidBubbles: true });
    said(p, '又开了', 3);
    expect(up(p).map((l) => l.cursor)).toEqual([3]);
  });
});

describe('the typing box (#279)', () => {
  const key = (p, init) => {
    const input = p.bubble.querySelector('textarea');
    const e = new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(e);
    return e;
  };

  it('is a text area: Enter sends, Shift+Enter is a new line, and Enter that confirms an input method sends nothing', () => {
    const p = ready();
    p.openInput();
    const input = p.bubble.querySelector('textarea');
    expect(input).not.toBeNull();
    expect(p.bubble.querySelector('input')).toBeNull();
    input.value = '第一行\n第二行';
    let submits = 0;
    p.bubble.querySelector('form').addEventListener('submit', () => { submits++; });
    expect(key(p, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(key(p, { isComposing: true }).defaultPrevented).toBe(false);
    expect(key(p, { keyCode: 229 }).defaultPrevented).toBe(false);
    expect(submits).toBe(0);
    expect(p.sent.filter((m) => m.t === 'text')).toEqual([]);
    expect(key(p, {}).defaultPrevented).toBe(true);
    expect(submits).toBe(1);
    expect(p.sent.at(-1)).toEqual({ t: 'text', text: '第一行\n第二行' });
  });
});

describe("Coo's bubbles: speed (#248) and links (#297)", () => {
  /** Seconds from a say order until its bubble has closed. */
  const shownFor = (p, text) => {
    say(p, 's', text);
    p.step(.01); p.step(.01);
    let s = 0;
    while (!p.bubble.hidden && s < 60) { p.step(.05); s += .05; }
    return s;
  };

  it('types and holds a bubble faster at a higher bubble speed, about in proportion', () => {
    const text = '这是一段明显更长的话,要多打一会儿字才能说完。';
    const normal = shownFor(ready(), text);
    const p = ready();
    p.onOrder({ t: 'prefs', bubbleSpeed: 2 });
    const fast = shownFor(p, text);
    expect(fast / normal).toBeGreaterThan(.4);
    expect(fast / normal).toBeLessThan(.6);
    // a speed that is not a positive number leaves it as it was
    p.onOrder({ t: 'prefs', bubbleSpeed: 0 });
    expect(shownFor(p, text) / normal).toBeLessThan(.6);
  });

  it('turns an address into a link once it has typed out', () => {
    const p = ready();
    say(p, 's', '来 https://github.com/Pal-AI-Lab/Coopanion 点星');
    p.step(.01); p.step(.01); p.step(.5);
    expect(p.bubble.querySelector('a')).toBeNull();
    p.step(3);
    const a = p.bubble.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://github.com/Pal-AI-Lab/Coopanion');
    expect([a.target, a.rel]).toEqual(['_blank', 'noopener noreferrer']);
    expect(p.bubble.querySelector('.b-text').textContent).toBe('来 https://github.com/Pal-AI-Lab/Coopanion 点星');
  });

  it('keeps a bubble with a link up while the pointer is on it, and closes it once the pointer leaves', () => {
    const p = ready();
    let hovered = true;
    const matches = p.bubble.matches.bind(p.bubble);
    p.bubble.matches = (sel) => (sel === ':hover' ? hovered : matches(sel));
    const linkless = shownFor(ready(), '看这里 example 点星');
    say(p, 's', '看这里 https://e.org 点星');
    p.step(.01); p.step(.01);
    for (let s = 0; s < linkless + 5; s += .05) p.step(.05);
    expect(p.bubble.hidden).toBe(false);
    hovered = false;
    p.step(.05); p.step(.05);
    expect(p.bubble.hidden).toBe(true);
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
