/**
 * The pet page (packages/cortico-world-desktop-pet/web/pet-app.js) in jsdom, as tests/pet-lines.test.js runs it:
 * - the typing box takes pasted pictures (upstream #430): fitted by the chat page's rules (only shrunk, the long edge
 *   to 2048; past 6 MB once more as JPEG, still past it refused), up to 4 in the box, sent with the text (or alone)
 *   and carried with the draft to the chat page; a model that cannot see images is said so under the box;
 * - Coo's bubble stands still while the pointer is on it and goes on with the time it had left (upstream #430): a line
 *   with no link, a guide step with nothing to answer, and the next line waiting in the queue meanwhile;
 * - the typing key's `type` order opens the box (upstream #361) and takes the keyboard where the host can;
 * - the sounds are panned by where Coo stands on its display (upstream #435).
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

/**
 * The page with a socket that keeps what it sends, a body that stands still and `step(dt)` for its clock. `host`: a
 * stand-in for the pet window's host that records its calls; `sfx` records setPan; `encode(mime)` is the size of what
 * the canvas encodes a picture to, `screen` the display the window is on.
 */
function page({ host = false, encode = () => 1000, screen = null } = {}) {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1/pet', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  pages.push(win);
  const sent = [], calls = [], pans = [];
  if (host) win.petHost = new Proxy({}, { get: (_t, k) => (k.startsWith('on') ? () => {} : () => calls.push(k)) });
  if (screen) {
    for (const [k, v] of Object.entries(screen)) Object.defineProperty(win.screen, k, { value: v, configurable: true });
    Object.defineProperty(win, 'screenX', { value: screen.screenX ?? 0, configurable: true });
  }
  // what the browser decodes and encodes: the picture's size is in its name ("w×h"), the canvas encodes to `encode`
  win.createImageBitmap = async (file) => {
    const m = /(\d+)x(\d+)/.exec(file.name);
    if (!m) throw new Error('not an image');
    return { width: Number(m[1]), height: Number(m[2]), close() {} };
  };
  const drawn = [];
  win.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: (_b, _x, _y, w, h) => drawn.push([w, h]) }; };
  win.HTMLCanvasElement.prototype.toBlob = function (cb, mime) { cb(new win.Blob([new Uint8Array(encode(mime))], { type: mime })); };
  const body = {
    layout: { busy: false, facing: 1, cursor: '', x: 600, bubble: { x: 600, y: 500 }, box: { x: 560, y: 500, w: 80, h: 100 }, side: { x: 600, y: 550, reach: 40 } },
    set() {}, cue() {}, talk() {}, tick() {}, hit: () => false, pointer() {}, knownWords: () => null,
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class { readyState = 1; send(d) { sent.push(JSON.parse(d)); } };
  win.deps = {
    applyTheme, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document), COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS,
    createSfx: () => new Proxy({}, { get: (_t, k) => (k === 'setPan' ? (v) => pans.push(v) : () => {}) }),
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false }),
    textSteps: () => 1,
    afterBubbles, dropActs, leftActs, loadBody: async () => body, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, createSpeech, textSteps, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic } = window.deps;\n${source}\n`
    + 'window.page = { useBody: (b) => { body = b; }, onOrder, openInput, step: (dt) => { stepPage(dt); layout(dt); }, lines: () => lines, item: () => item };');
  win.page.useBody(body);
  const bubble = win.document.querySelector('#bubble');
  let hovered = false;
  const matches = bubble.matches.bind(bubble);
  bubble.matches = (sel) => (sel === ':hover' ? hovered : matches(sel));
  return { ...win.page, win, doc: win.document, bubble, sent, calls, pans, drawn, body, hover: (on) => { hovered = on; } };
}

/** A paste into the typing box of pictures named "w×h" (their size), `bytes` long each. */
function paste(p, files) {
  const input = p.bubble.querySelector('textarea');
  const e = new p.win.Event('paste', { cancelable: true, bubbles: true });
  e.clipboardData = { files: files.map(([name, type, bytes = 10]) => new p.win.File([new Uint8Array(bytes)], name, { type })) };
  input.dispatchEvent(e);
  return e;
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const submit = (p) => p.bubble.querySelector('form').dispatchEvent(new p.win.Event('submit', { cancelable: true }));
const note = (p) => { const n = p.bubble.querySelector('.b-note'); return n.hidden ? '' : n.textContent; };
const say = (p, id, text) => p.onOrder({ t: 'say', id, beats: [{ text, actions: [], anchors: [] }] });
/** Seconds Coo's bubble stays up, from the frame that opens it. */
function shownFor(p, each = () => {}) {
  p.step(.01); p.step(.01);
  let s = 0;
  while (!p.bubble.hidden && s < 60) { p.step(.05); s += .05; each(s); }
  return s;
}

describe('pictures pasted into the typing box (upstream #430)', () => {
  it('shows them as thumbnails and sends them with the text; a picture alone can be sent, and the line above Coo counts it', async () => {
    const p = page();
    p.onOrder({ t: 'prefs', saidBubbles: true });
    p.openInput();
    const e = paste(p, [['a 10x10.png', 'image/png'], ['b 20x10.jpg', 'image/jpeg']]);
    expect(e.defaultPrevented).toBe(true);
    await settle();
    expect([...p.bubble.querySelectorAll('.b-img img')].map((i) => i.getAttribute('src').split(';')[0])).toEqual(['data:image/png', 'data:image/jpeg']);
    p.bubble.querySelector('textarea').value = '这是什么';
    submit(p);
    expect(p.sent.at(-1)).toMatchObject({ t: 'text', text: '这是什么', images: [{ mime: 'image/png', name: 'a 10x10.png' }, { mime: 'image/jpeg', name: 'b 20x10.jpg' }] });
    expect(p.sent.at(-1).images[0].base64).toBe(Buffer.alloc(10).toString('base64'));

    p.openInput();
    paste(p, [['c 5x5.webp', 'image/webp']]);
    await settle();
    submit(p);
    expect(p.sent.at(-1)).toMatchObject({ t: 'text', text: '', images: [{ mime: 'image/webp' }] });
    expect(p.lines().at(-1).images).toBe(1);
    expect(p.lines().at(-1).el.textContent).toContain(t('said.images', { n: 1 }));
  });

  it('a paste with no picture is left to the text box; a thumbnail can be removed; an empty box sends nothing', async () => {
    const p = page();
    p.openInput();
    expect(paste(p, []).defaultPrevented).toBe(false);
    expect(paste(p, [['notes.txt', 'text/plain']]).defaultPrevented).toBe(false);
    paste(p, [['a 10x10.png', 'image/png'], ['b 10x10.png', 'image/png']]);
    await settle();
    p.bubble.querySelector('.b-img button').click();
    expect(p.bubble.querySelectorAll('.b-img')).toHaveLength(1);
    p.bubble.querySelector('.b-img button').click();
    expect(p.bubble.querySelector('.b-imgs').hidden).toBe(true);
    const before = p.sent.length;
    submit(p);
    expect(p.sent.length).toBe(before);
  });

  it('holds 4 at most: a paste that would make more adds none and says so', async () => {
    const p = page();
    p.openInput();
    paste(p, [['a 1x1.png', 'image/png'], ['b 1x1.png', 'image/png'], ['c 1x1.png', 'image/png']]);
    await settle();
    paste(p, [['d 1x1.png', 'image/png'], ['e 1x1.png', 'image/png']]);
    await settle();
    expect(p.bubble.querySelectorAll('.b-img')).toHaveLength(3);
    expect(note(p)).toBe(t('bubble.tooManyImages', { max: 4 }));
    paste(p, [['d 1x1.png', 'image/png']]);
    await settle();
    expect(p.bubble.querySelectorAll('.b-img')).toHaveLength(4);
  });

  it("fits them as the chat page does: a long edge past 2048 is shrunk, one still past 6 MB goes as JPEG, one past it then is refused", async () => {
    const MB = 1024 * 1024;
    const p = page({ encode: (mime) => (mime === 'image/jpeg' ? 2 * MB : 7 * MB) });
    p.openInput();
    paste(p, [['big 4096x1024.png', 'image/png']]);
    // a picture of megabytes takes a while to read
    await expect.poll(() => p.bubble.querySelectorAll('.b-img').length, { timeout: 5000 }).toBe(1);
    expect(p.drawn).toEqual([[2048, 512]]);
    submit(p);
    expect(p.sent.at(-1).images[0].mime).toBe('image/jpeg');

    const q = page({ encode: () => 7 * MB });
    q.openInput();
    paste(q, [['huge 3000x3000.png', 'image/png']]);
    await expect.poll(() => note(q), { timeout: 5000 }).toBe(t('bubble.imageTooLarge', { mb: 6 }));
    expect(q.bubble.querySelectorAll('.b-img')).toHaveLength(0);

    const r = page();
    r.openInput();
    paste(r, [['broken.png', 'image/png']]);
    await expect.poll(() => note(r)).toBe(t('bubble.imageUnreadable'));
  });

  it('says under the box when the current model cannot see images, in the app language', async () => {
    setLanguage('en');
    const p = page();
    p.onOrder({ t: 'prefs', bot: { name: 'Mochi', imagesSeen: false, buttons: {} } });
    p.openInput();
    paste(p, [['a 1x1.png', 'image/png']]);
    await settle();
    expect(note(p)).toBe('The current model cannot see images; Mochi only learns how many you sent.');
    const q = page();
    q.onOrder({ t: 'prefs', bot: { name: 'Mochi', imagesSeen: true, buttons: {} } });
    q.openInput();
    paste(q, [['a 1x1.png', 'image/png']]);
    await settle();
    expect(note(q)).toBe('');
  });

  it('「在对话页继续写」 carries the pictures with the draft, as the chat page holds them', async () => {
    const p = page();
    p.onOrder({ t: 'prefs', bot: { name: 'Coo', imagesSeen: true, buttons: { chat: true } } });
    p.openInput();
    paste(p, [['a 30x20.png', 'image/png']]);
    await settle();
    p.bubble.querySelector('textarea').value = '还有这张';
    p.bubble.querySelector('.b-expand').click();
    expect(p.sent.at(-1)).toEqual({ t: 'expand', text: '还有这张', images: [{ name: 'a 30x20.png', mime: 'image/png', base64: Buffer.alloc(10).toString('base64'), bytes: 10, width: 30, height: 20 }] });
    expect(p.bubble.hidden).toBe(true);
  });
});

describe("Coo's bubble stands still under the pointer (upstream #430)", () => {
  it('a line with no link stays while the pointer is on it and then has the rest of its time', () => {
    const normal = (() => { const p = page(); say(p, 's', '今天天气不错'); return shownFor(p); })();
    const p = page();
    say(p, 's', '今天天气不错');
    // the pointer rests on it from half its time for 5 seconds
    const held = shownFor(p, (s) => p.hover(s > normal / 2 && s <= normal / 2 + 5));
    expect(held).toBeGreaterThan(normal + 4.8);
    expect(held).toBeLessThan(normal + 5.3);
  });

  it('the next line waits in the queue meanwhile', () => {
    const p = page();
    say(p, 'a', '第一句');
    p.step(.01); p.step(.01);
    p.hover(true);
    say(p, 'b', '第二句');
    for (let i = 0; i < 400; i++) p.step(.05);
    expect(p.bubble.querySelector('.b-text').textContent).toBe('第一句');
    p.hover(false);
    for (let i = 0; i < 200 && p.bubble.querySelector('.b-text')?.textContent !== '第二句'; i++) p.step(.05);
    expect(p.bubble.querySelector('.b-text').textContent).toBe('第二句');
  });

  it('a guide step with nothing to answer is not done while the pointer is on it', () => {
    const p = page();
    p.onOrder({ t: 'dialog', id: 'd1', text: '这是引导的一步' });
    p.step(.01); p.step(.01);
    for (let i = 0; i < 40; i++) p.step(.05);
    p.hover(true);
    for (let i = 0; i < 400; i++) p.step(.05);
    expect(p.sent.some((m) => m.t === 'dialog' && m.done)).toBe(false);
    p.hover(false);
    for (let i = 0; i < 200; i++) p.step(.05);
    expect(p.sent.filter((m) => m.t === 'dialog')).toEqual([{ t: 'dialog', id: 'd1', done: true }]);
  });
});

describe('the typing key (upstream #361)', () => {
  it('`type` opens the typing box and takes the keyboard; again, the open box keeps its text and takes it again', () => {
    const p = page({ host: true });
    p.onOrder({ t: 'type' });
    expect(p.item()?.kind).toBe('input');
    expect(p.calls.filter((c) => c === 'grabFocus')).toHaveLength(1);
    p.bubble.querySelector('textarea').value = '半句';
    p.onOrder({ t: 'type' });
    expect(p.bubble.querySelector('textarea').value).toBe('半句');
    expect(p.calls.filter((c) => c === 'grabFocus')).toHaveLength(2);
    // closing the box gives the keyboard back
    p.bubble.querySelector('.b-close').click();
    expect(p.calls.at(-1)).toBe('releaseFocus');
  });

  it('a question waiting on an answer keeps its bubble', () => {
    const p = page({ host: true });
    p.onOrder({ t: 'ask', id: 'q', question: '选哪个?', options: ['甲', '乙'] });
    p.step(.01); p.step(.01);
    p.onOrder({ t: 'type' });
    expect(p.item()?.kind).toBe('ask');
  });
});

describe('the sounds are placed where Coo stands (upstream #435)', () => {
  it('pans by Coo on its own display: left edge -1, centre 0, right edge 1, a second display counted from its own left', () => {
    const p = page({ screen: { availLeft: 1920, availWidth: 1600, screenX: 1920 } });
    for (const x of [0, 800, 1600]) { p.body.layout.x = x; p.step(.01); }
    expect(p.pans.slice(-3)).toEqual([-1, 0, 1]);
  });
});
