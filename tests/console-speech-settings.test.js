// @vitest-environment jsdom
/**
 * The 习惯 page's 「说话声」 section (upstream #263, greyed rows from #299), read from the console's staged place in
 * build/cortico (run `pnpm run build:cortico` after changing it): the switch and the pitch and speed steps show what the
 * World's sound group holds and write `worlds.desktop-pet.speech.*` there; 自定义 shows its number, starting from the step
 * it leaves, and an out-of-range number goes back; the speech switch is disabled with sounds off, and pitch and speed are
 * greyed while the speech cannot be heard (sounds, the 说话 kind or the speech off), in zh and en.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/pet/index.ts`);
const K = 'worlds.desktop-pet';
const SOUND_GROUP = 'world:desktop-pet:sound';

class MemoryStorage {
  #map = new Map();
  get length() { return this.#map.size; }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  clear() { this.#map.clear(); }
}

async function load(language, ...files) {
  localStorage.setItem('cortico.webui.language', language);
  vi.resetModules();
  const out = [];
  for (const file of files) out.push(await import(/* @vite-ignore */ `${CLIENT}${file}`));
  return out;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeCore(language, sound) {
  const sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (path === '/api/config' && method === 'GET') {
      return json({ groups: [{ group: { id: 'companion' }, values: { language } }, { group: { id: 'world:desktop-pet' }, values: {} }, { group: { id: SOUND_GROUP }, values: sound }] });
    }
    if (path === '/api/config' && method === 'POST') { sent.push(body); if (body.group === SOUND_GROUP) Object.assign(sound, body.values); return json({ result: body.group }); }
    return json({});
  }));
  return sent;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe.skipIf(!STAGED && !process.env.CI)('说话声 on the 习惯 page', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it.each(['zh', 'en'])('(%s) reads and writes the speech settings, greyed while it cannot be heard', async (language) => {
    const sound = {
      [`${K}.sound`]: true, [`${K}.sounds.talk`]: true,
      [`${K}.speech.enabled`]: false, [`${K}.speech.pitch`]: 'mid', [`${K}.speech.pitchHz`]: 400,
      [`${K}.speech.speed`]: 'custom', [`${K}.speech.unitsPerSecond`]: 8,
    };
    const sent = fakeCore(language, sound);
    const [{ createWebUi }, { Lifecycle }, pet] = await load(language, 'ui/index.ts', 'core/lifecycle.ts', 'features/pet/index.ts');
    const lifecycle = new Lifecycle((err) => { throw err; });
    const root = document.createElement('div');
    document.body.append(root);
    const ui = createWebUi({ memo: { get: (_k, d) => d, set: () => {} }, overlayHost: document.body, signal: lifecycle.signal, doc: document });
    const router = { route: { segments: ['pet'] }, navigate: () => {}, replace: () => {} };
    await pet.petFeature.mount({ root, lifecycle, signal: lifecycle.signal, ui, router, route: router.route, capabilities: {}, onError: (err) => { throw err; }, refreshNav: () => {} });
    await settle();
    const S = pet.TEXT[language];
    const saved = (values) => vi.waitFor(() => expect(sent).toContainEqual({ group: SOUND_GROUP, values }));
    const rows = [...root.querySelectorAll('.companion-row')];
    const labelled = (text) => rows.find((r) => r.querySelector('.companion-label')?.textContent === text);
    const box = (text) => [...root.querySelectorAll('label')].find((l) => l.textContent.trim() === text)?.querySelector('input[type="checkbox"]');

    const switchRow = rows.find((r) => r.textContent.includes(S.speech));
    expect(switchRow.textContent).toContain(S.speechHint);
    const speech = box(S.speech);
    const pitchRow = labelled(S.speechPitch), speedRow = labelled(S.speechSpeed);
    expect([speech, pitchRow, speedRow].every(Boolean)).toBe(true);
    const buttons = (r) => [...r.querySelectorAll('button')];
    const number = (r) => r.querySelector('input[type="number"]');
    const numberShown = (r) => !r.querySelector('.companion-rangebox').hidden;

    // off: the switch shows it, pitch and speed are greyed; speed's custom number is the saved one
    expect(speech.checked).toBe(false);
    expect(speech.disabled).toBe(false);
    for (const r of [pitchRow, speedRow]) {
      expect(r.classList.contains('is-off')).toBe(true);
      expect(buttons(r).every((b) => b.disabled)).toBe(true);
      expect(number(r).disabled).toBe(true);
    }
    expect(buttons(pitchRow).map((b) => b.textContent)).toEqual(['low', 'mid', 'high', 'custom'].map((v) => S.speechPitchLevels[v]));
    expect(buttons(speedRow).map((b) => b.textContent)).toEqual(['low', 'mid', 'high', 'custom'].map((v) => S.speechSpeedLevels[v]));
    expect(numberShown(pitchRow)).toBe(false);
    expect(numberShown(speedRow)).toBe(true);
    expect(number(speedRow).value).toBe('8');
    expect(speedRow.textContent).toContain(S.speechRateUnit);

    speech.click();
    await saved({ [`${K}.speech.enabled`]: true });
    for (const r of [pitchRow, speedRow]) {
      expect(r.classList.contains('is-off')).toBe(false);
      expect(buttons(r).some((b) => b.disabled)).toBe(false);
    }

    // 自定义 starts from the step it leaves, saved with the step at once
    buttons(pitchRow).find((b) => b.textContent === S.speechPitchLevels.high).click();
    await saved({ [`${K}.speech.pitch`]: 'high' });
    buttons(pitchRow).find((b) => b.textContent === S.speechPitchLevels.custom).click();
    await saved({ [`${K}.speech.pitch`]: 'custom', [`${K}.speech.pitchHz`]: 500 });
    expect(numberShown(pitchRow)).toBe(true);
    expect(number(pitchRow).value).toBe('500');
    const before = sent.length;
    number(pitchRow).value = '900';
    number(pitchRow).dispatchEvent(new Event('change'));
    expect(number(pitchRow).value).toBe('500');
    expect(sent.length).toBe(before);
    number(pitchRow).value = '650';
    number(pitchRow).dispatchEvent(new Event('change'));
    await saved({ [`${K}.speech.pitchHz`]: 650 });

    // the 说话 kind off greys pitch and speed; sounds off also disables the switch
    box(S.kinds.talk[0]).click();
    await saved({ [`${K}.sounds.talk`]: false });
    expect(pitchRow.classList.contains('is-off')).toBe(true);
    expect(speech.disabled).toBe(false);
    box(S.kinds.talk[0]).click();
    await saved({ [`${K}.sounds.talk`]: true });
    expect(pitchRow.classList.contains('is-off')).toBe(false);
    box(S.sound).click();
    await saved({ [`${K}.sound`]: false });
    expect(speech.disabled).toBe(true);
    expect(speedRow.classList.contains('is-off')).toBe(true);
    lifecycle.dispose();
  });
});
