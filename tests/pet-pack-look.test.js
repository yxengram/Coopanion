/**
 * The pet page (packages/cortico-world-desktop-pet/web/pet-app.js) in jsdom, with an installed pack's manifest fields of
 * upstream #434 the page reads: the bot's bubbles in the pack's (or its preset's) colours, the pack's voice handed to the
 * sounds, and what the bot is busy with handed to the body (`status`, the figure's `frame.status`).
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

const colours = { light: { fill: '#fff8e1', text: '#3e2723', line: '#ff6f00' }, dark: { fill: '#1a237e', text: '#e8eaf6', line: '#ffd54f' } };
const night = { light: { fill: '#e0f7fa', text: '#004d40', line: '#00838f' }, dark: { fill: '#000000', text: '#ffffff', line: '#00e5ff' } };
/** An installed pack as /api/figures lists it (src/server.ts). */
const ROBOT = {
  id: 'robot', base: '/packs/robot/', name: { zh: '机器人' }, entry: 'figure.js', export: 'createBody', model: null,
  axes: [{ id: 'scheme', name: { zh: '配色' }, options: [{ id: 'day', name: { zh: '白天' } }, { id: 'night', name: { zh: '夜晚' } }] }],
  presets: [{ id: 'day', pick: { scheme: 'day' } }, { id: 'night', pick: { scheme: 'night' }, bubble: night }],
  vocab: [], sounds: { la: { file: 'la.ogg', kind: 'talk', volume: 1 } }, can: { walk: true },
  voice: { pitch: 1.4 }, effects: { reach: .5 }, bubble: colours,
};

/** The page with the robot installed; what it hands its sounds and its body is kept. */
function page() {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1/pet', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  pages.push(win);
  const packsUsed = [], sets = [];
  const body = {
    pack: null,
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 600, y: 500 }, box: { x: 560, y: 500, w: 80, h: 100 }, side: { x: 600, y: 550, reach: 40 } },
    set(s) { sets.push(s); }, cue() {}, talk() {}, tick() {}, hit: () => false, pointer() {}, knownWords: () => null, dispose() {}, setScheme: async () => {}, words: [],
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class { readyState = 1; send() {} };
  win.fetch = async (url) => ({ ok: true, json: async () => (String(url).endsWith('/api/figures') ? [ROBOT] : {}) });
  win.deps = {
    applyTheme, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document), COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS,
    createSfx: () => new Proxy({}, { get: (_, k) => (k === 'usePack' ? (...a) => packsUsed.push(a) : () => {}) }),
    createSpeech: () => ({ configure() {}, begin() {}, reveal() { return false; }, stop() {}, active: false }),
    textSteps: () => 1,
    afterBubbles, dropActs, leftActs, loadBody: async ({ pack }) => { body.pack = pack.id; return body; }, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, createSpeech, textSteps, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss, bubbleColors, bubbleCss, createMic } = window.deps;\n${source}\n`
    + 'window.page = { onOrder };');
  const styles = () => [...win.document.head.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  return { ...win.page, win, packsUsed, sets, styles };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("an installed pack's look on the pet page (upstream #434)", () => {
  it("colours the bot's bubbles with its preset's colours, else its own, and hands its voice to the sounds", async () => {
    const p = page();
    p.onOrder({ t: 'init', skin: { figure: 'robot', scheme: 'night' } });
    await settle();
    expect(p.styles()).toContain(bubbleCss(night));
    expect(p.packsUsed.at(-1)).toEqual(['/packs/robot/', ROBOT.sounds, { plus: false, voice: { pitch: 1.4 } }]);
    // the same pack in a look whose preset names none: the pack's own
    p.onOrder({ t: 'prefs', skin: { figure: 'robot', scheme: 'day' } });
    await settle();
    expect(p.styles()).toContain(bubbleCss(colours));
    expect(p.styles()).not.toContain(bubbleCss(night));
  });

  it('a pack that names none keeps the page\'s bubble colours', async () => {
    const p = page();
    ROBOT.bubble = undefined; ROBOT.presets[1].bubble = undefined;
    try {
      p.onOrder({ t: 'init', skin: { figure: 'robot', scheme: 'night' } });
      await settle();
      expect(p.styles()).not.toContain('.bubble:not(.heard)');
    } finally { ROBOT.bubble = colours; ROBOT.presets[1].bubble = night; }
  });

  it("tells the body what the bot is busy with: 'think' while it thinks, null once it is done", async () => {
    const p = page();
    p.onOrder({ t: 'init', skin: { figure: 'robot', scheme: 'day' } });
    await settle();
    p.onOrder({ t: 'thinking', on: true });
    expect(p.sets).toContainEqual({ thinking: true, status: 'think' });
    p.onOrder({ t: 'thinking', on: false });
    expect(p.sets.at(-1)).toEqual({ thinking: false, status: null });
    // and a body loaded meanwhile hears the state as it is
    expect(p.sets.find((s) => 'roam' in s)).toMatchObject({ status: null });
  });
});
