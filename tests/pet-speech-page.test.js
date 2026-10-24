/**
 * 说话声 on the pet page (upstream #263): web/pet-app.js run in jsdom with the real web/sound.js and web/speech.js, a
 * stand-in AudioContext that logs what starts, and `/api/speech` answered by the World's own SpeechText (src/speech).
 * A bank unit is a buffer source started at an offset of web/speech/zh.ogg (named here by web/speech/zh.json); the
 * typing babble is a square oscillator. Checked: the voice replaces the babble while it can be heard, keeps to its most
 * syllables a second at any bubble speed, and keeps quiet with sounds off, the 说话 kind off or the window hidden (what
 * it had scheduled is stopped), coming back for the rest of the bubble once shown again.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyTheme, clamp, f, ICONS, linked } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { COO_CSS, mini, normalizeSkin, skinCss } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { afterBubbles, dropActs, leftActs, pageLoop, slices, STEP_MAX, takeDeferred, walkHold } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { attachSayActs, createActs, sayHeld } from '../packages/cortico-world-desktop-pet/web/acts.js';
import { setLanguage, t } from '../packages/cortico-world-desktop-pet/web/i18n.js';
import { accentColors, accentCss } from '../packages/cortico-world-desktop-pet/web/accent.js';
import { SpeechText, speechTextSteps } from '../packages/cortico-world-desktop-pet/src/speech/index.ts';
import { TEXT_PAUSE, textSteps } from '../packages/cortico-world-desktop-pet/web/speech.js';

const WEB = new URL('../packages/cortico-world-desktop-pet/web/', import.meta.url);
const strip = (src) => src.replace(/^import [^;]*;$/gm, '').replace(/^export /gm, '');
const source = strip(readFileSync(new URL('pet-app.js', WEB), 'utf8'));
// the two modules run inside the page's window (they read its location, fetch, AudioContext and localStorage)
const soundSrc = strip(readFileSync(new URL('sound.js', WEB), 'utf8'));
const speechSrc = strip(readFileSync(new URL('speech.js', WEB), 'utf8')).replace('import.meta.url', JSON.stringify('http://127.0.0.1:7797/web/speech.js'));
const html = readFileSync(new URL('pet.html', WEB), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('speech/zh.json', WEB), 'utf8'));
const ogg = readFileSync(new URL('speech/zh.ogg', WEB));
const KEY_AT = new Map(Object.entries(manifest.units).map(([key, [off]]) => [off, key]));
const words = new SpeechText(
  fileURLToPath(new URL('../packages/cortico-world-desktop-pet/src/speech/data/', import.meta.url)),
  fileURLToPath(new URL('speech/zh.json', WEB)),
);
const pages = [];
afterEach(() => { for (const p of pages.splice(0)) p.close(); setLanguage('zh'); });

/** An AudioContext that logs each source started (`log`) on a clock the test moves (`clock.now`). */
function fakeAudio(log, clock) {
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, setValueCurveAtTime(curve) { this.curve = curve; } });
  const node = () => ({ connect() {}, disconnect() {} });
  return class {
    state = 'running';
    sampleRate = 48000;
    destination = node();
    get currentTime() { return clock.now; }
    resume() {}
    createGain() { return { ...node(), gain: param() }; }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return { ...node(), frequency: param(), Q: param() }; }
    createBuffer(_c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createOscillator() {
      const o = { ...node(), type: 'sine', frequency: param(), start: (at) => log.push({ kind: o.type === 'square' ? 'babble' : 'tone', at }), stop() {} };
      return o;
    }
    createBufferSource() {
      const s = {
        ...node(), playbackRate: param(), onended: null,
        start: (at, off, len) => { if (s.buffer?.speech) log.push({ kind: 'unit', key: KEY_AT.get(off), at, len, rate: s.playbackRate.curve?.[0], src: s }); },
        stop: () => { s.stoppedAt ??= clock.now; },
      };
      return s;
    }
    decodeAudioData(bytes) { return Promise.resolve({ speech: bytes.byteLength === ogg.byteLength, duration: 60 }); }
  };
}

/** The page in the pet window (its host says when it is shown), with real sounds and speech; `flush` lets fetches settle. */
function page() {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:7797/pet', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  pages.push(win);
  const log = [], asked = [], clock = { now: 0 };
  let onShown = () => {};
  win.petHost = new Proxy({}, { get: (_t, k) => (k === 'onShown' ? (fn) => { onShown = fn; } : () => {}) });
  win.AudioContext = fakeAudio(log, clock);
  win.fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/api/speech')) {
      const { text } = JSON.parse(init.body);
      asked.push(text);
      return { ok: true, json: async () => ({ units: words.units(text, 'zh') }) };
    }
    if (u.endsWith('/web/speech/zh.json')) return { ok: true, json: async () => manifest };
    if (u.endsWith('/web/speech/zh.ogg')) return { ok: true, arrayBuffer: async () => ogg.buffer.slice(ogg.byteOffset, ogg.byteOffset + ogg.byteLength) };
    return { ok: false, status: 404 };
  };
  const body = {
    layout: { busy: false, facing: 1, cursor: '', bubble: { x: 600, y: 500 }, box: { x: 560, y: 500, w: 80, h: 100 }, side: { x: 600, y: 550, reach: 40 } },
    set() {}, cue() {}, talk() { body.talks++; }, talks: 0, tick() {}, hit: () => false, pointer() {}, knownWords: () => null,
  };
  win.requestAnimationFrame = () => 0;
  win.WebSocket = class { readyState = 1; send() {} close() {} };
  win.eval(`window.sound = (() => { ${soundSrc}\n return { createSfx, OWN_PACKS }; })();\nwindow.voice = (() => { ${speechSrc}\n return { createSpeech, textSteps }; })();`);
  win.deps = {
    applyTheme, clamp, f, ICONS, linked: (text, n) => linked(text, n, win.document), COO_CSS, mini, normalizeSkin, skinCss,
    OWN_PACKS: win.sound.OWN_PACKS, createSfx: win.sound.createSfx, createSpeech: win.voice.createSpeech, textSteps: win.voice.textSteps,
    afterBubbles, dropActs, leftActs, loadBody: async () => body, pageLoop, slices, STEP_MAX, takeDeferred, walkHold,
    attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss,
  };
  win.eval(`const { applyTheme, clamp, f, ICONS, linked, COO_CSS, mini, normalizeSkin, skinCss, OWN_PACKS, createSfx, createSpeech, textSteps, afterBubbles, dropActs, leftActs, loadBody, pageLoop, slices, STEP_MAX, takeDeferred, walkHold, attachSayActs, createActs, sayHeld, setLanguage, t, accentColors, accentCss } = window.deps;\n${source}\n`
    + 'window.page = { useBody: (b) => { body = b; }, onOrder, step: (dt) => { stepPage(dt); layout(dt); } };');
  const p = { ...win.page, win, log, asked, clock, body, bubble: win.document.querySelector('#bubble'), shown: (v) => onShown(v) };
  p.useBody(body);
  return p;
}
const flush = () => new Promise((r) => setTimeout(r, 5));
const SPEECH = { enabled: true, pitchHz: 400, unitsPerSecond: 13 };
/** The page with speech on and its bank fetched and decoded (the decode starts at the first sound it would play). */
async function speaking(prefs = {}) {
  const p = page();
  p.onOrder({ t: 'prefs', speech: SPEECH, ...prefs });
  await flush();
  // the first bubble's first characters babble while the bank decodes, as upstream: a warm-up bubble
  await say(p, '嗯');
  p.log.length = 0;
  return p;
}
/** Says `text` and steps the page (and the audio clock) every 50 ms until the bubble closes, letting fetches settle; `each(seconds)` runs after every step. */
async function say(p, text, each = () => {}) {
  p.onOrder({ t: 'say', id: `s${Math.random()}`, beats: [{ text, actions: [], anchors: [] }] });
  for (let s = 0; s < 30; s += .05) {
    p.step(.05); p.clock.now += .05;
    await flush();
    each(s);
    if (p.bubble.hidden && s > .2) break;
  }
}
const units = (p) => p.log.filter((e) => e.kind === 'unit');
const babbles = (p) => p.log.filter((e) => e.kind === 'babble');

describe('说话声 on the pet page (upstream #263)', () => {
  it('reads a Chinese bubble out as its pinyin syllables instead of babbling, and moves the mouth with each', async () => {
    const p = await speaking();
    const talks = p.body.talks;
    await say(p, '今天好开心,你呢?');
    expect(p.asked).toContain('今天好开心,你呢?');
    expect(units(p).map((u) => u.key)).toEqual(['jin', 'tian', 'hao', 'kai', 'xin', 'ni', 'ne']);
    expect(babbles(p)).toEqual([]);
    expect(p.body.talks - talks).toBe(7);
  });

  it('reads English by the dictionary and a sentence with kana as Japanese', async () => {
    const p = await speaking();
    await say(p, 'Hello there!');
    expect(units(p).map((u) => u.key)).toEqual(['he', 'lou', 'de']);
    p.log.length = 0;
    await say(p, '元気ですか?');
    expect(units(p).map((u) => u.key)).toEqual(['gen', 'qi', 'de', 'su', 'ka']);
    expect(babbles(p)).toEqual([]);
  });

  it('keeps to its most syllables a second at any bubble speed and pitch', async () => {
    for (const [bubbleSpeed, ups, hz] of [[.5, 10, 300], [1, 13, 400], [2, 16, 500], [2, 6, 700]]) {
      const p = await speaking({ bubbleSpeed, speech: { enabled: true, pitchHz: hz, unitsPerSecond: ups } });
      await say(p, '我们一起去公园散步吧');
      const at = units(p).map((u) => u.at);
      expect(at.length, `${bubbleSpeed}× at ${ups}/s`).toBeGreaterThan(5);
      for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(1 / ups - 1e-9);
      // the bank is pitched at manifest.hz; the step's pitch is the playback rate (before a phrase's own line)
      expect(units(p)[1].rate / (hz / manifest.hz)).toBeGreaterThan(.85);
      expect(units(p)[1].rate / (hz / manifest.hz)).toBeLessThan(1.2);
    }
  }, 60_000);

  it('babbles as before while the speech is off', async () => {
    const p = page();
    p.onOrder({ t: 'prefs', speech: { ...SPEECH, enabled: false } });
    await flush();
    await say(p, '今天好开心');
    expect(units(p)).toEqual([]);
    expect(babbles(p).length).toBe(5);
    expect(p.asked).toEqual([]);
  });

  it('keeps quiet with sounds off or the 说话 kind off, babble included', async () => {
    const off = await speaking({ sound: false });
    await say(off, '今天好开心');
    expect(units(off)).toEqual([]);
    expect(babbles(off)).toEqual([]);
    const talk = await speaking();
    talk.onOrder({ t: 'prefs', sounds: { move: true, touch: true, face: true, snore: true, talk: false, ui: true, snoreSeconds: 0 } });
    await say(talk, '今天好开心');
    expect(units(talk)).toEqual([]);
    expect(babbles(talk)).toEqual([]);
  });

  it('stops what it scheduled when the window is hidden, and speaks the rest of the bubble once shown again', async () => {
    const p = await speaking({ speech: { enabled: true, pitchHz: 400, unitsPerSecond: 6 } });
    let hidAt = null, shownAt = null;
    // on the audio clock, the one the units are started on
    await say(p, '我们今天一起去公园散步然后回家吃饭好不好', () => {
      const now = p.clock.now;
      if (hidAt === null && units(p).length >= 3) { hidAt = now; p.shown(false); }
      else if (hidAt !== null && shownAt === null && now > hidAt + .5) { shownAt = now; p.shown(true); }
    });
    expect(hidAt).not.toBeNull();
    // the voice runs behind the text: units scheduled to start after the window hid were there, and were stopped as it hid
    const late = units(p).filter((u) => u.at > hidAt + .02 && u.at < shownAt);
    expect(late.length).toBeGreaterThan(0);
    for (const u of late) expect(u.src.stoppedAt, `${u.key} at ${u.at}`).toBeCloseTo(hidAt, 5);
    // shown again: the rest of the bubble is spoken (asked for again), not babbled
    expect(units(p).filter((u) => u.at >= shownAt).length).toBeGreaterThan(0);
    expect(babbles(p)).toEqual([]);
  });

  it.each([
    ['sounds switched off', { sound: false }],
    ['the 说话 kind switched off', { sounds: { move: true, touch: true, face: true, snore: true, talk: false, ui: true, snoreSeconds: 0 } }],
  ])('stops what it scheduled when %s in the middle of a bubble', async (_what, prefs) => {
    const p = await speaking({ speech: { enabled: true, pitchHz: 400, unitsPerSecond: 6 } });
    let offAt = null;
    await say(p, '我们今天一起去公园散步然后回家吃饭好不好', () => {
      if (offAt === null && units(p).length >= 3) { offAt = p.clock.now; p.onOrder({ t: 'prefs', ...prefs }); }
    });
    const late = units(p).filter((u) => u.at > offAt + .02);
    expect(late.length).toBeGreaterThan(0);
    for (const u of late) expect(u.src.stoppedAt, `${u.key} at ${u.at}`).toBeCloseTo(offAt, 5);
    expect(babbles(p)).toEqual([]);
  });

  it('switched off and on again in the middle of a bubble, speaks its remaining characters', async () => {
    const p = await speaking();
    let phase = 0, onAt = 0;
    await say(p, '我们今天一起去公园散步然后回家吃饭好不好', () => {
      if (phase === 0 && units(p).length >= 2) { phase = 1; p.onOrder({ t: 'prefs', speech: { ...SPEECH, enabled: false } }); }
      else if (phase === 1 && babbles(p).length >= 2) { phase = 2; onAt = p.clock.now; p.onOrder({ t: 'prefs', speech: SPEECH }); }
    });
    expect(phase).toBe(2);
    expect(units(p).filter((u) => u.at > onAt).length).toBeGreaterThan(3);
  });
});

describe('speech typing steps', () => {
  it("the World's (src/speech, for the pet_say estimate) are the page's", () => {
    for (const ch of ['你', 'a', 'Я', 'Ω', ' ', "'", '’', '-', 'あ', 'ア', '한', '1', '「', ...Object.keys(TEXT_PAUSE)]) expect(speechTextSteps(ch), ch).toBe(textSteps(ch));
  });
});
