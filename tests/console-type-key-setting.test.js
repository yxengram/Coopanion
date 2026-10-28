// @vitest-environment jsdom
/**
 * The 习惯 page's typing key row (upstream #361), read from the console's staged place in build/cortico (run
 * `pnpm run build:cortico` after changing it): it follows the pet panel's state (`typeKey`: the setting, its keys named in
 * the app language, why they cannot be read), and saves through the panel's `setTypeKey`: the switch, a new key set as the
 * talk key's is (key-capture.ts, how it is pressed kept) and how it is pressed; while it is on and cannot be read, the
 * reason replaces the hint, in red. In zh and en.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/pet/index.ts`);
const PANEL = `/api/webui/providers/${encodeURIComponent('world:desktop-pet')}/panels/pet/`;
const CJK = /[　-〿㐀-鿿＀-￯]/;

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

/** A Core whose pet panel keeps a typing key as the World does: `setTypeKey` merges what it is given. */
function fakeCore(language, typeKey) {
  const calls = [];
  const state = () => ({ typeKey: { ...typeKey, keyLabel: typeKey.hotkey.replace(/\*\d$/, '').replace('LeftCtrl', language === 'zh' ? '左 Ctrl' : 'Left Ctrl') } });
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (path === '/api/config' && method === 'GET') return json({ groups: [{ group: { id: 'companion' }, values: { language } }, { group: { id: 'world:desktop-pet' }, values: {} }] });
    if (path === `${PANEL}state`) return json(state());
    if (path === `${PANEL}setTypeKey`) { calls.push(body.args[0]); Object.assign(typeKey, body.args[0]); return json(state()); }
    return json({});
  }));
  return calls;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

async function mountPet(language) {
  const [{ createWebUi }, { Lifecycle }, pet] = await load(language, 'ui/index.ts', 'core/lifecycle.ts', 'features/pet/index.ts');
  const lifecycle = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createWebUi({ memo: { get: (_k, d) => d, set: () => {} }, overlayHost: document.body, signal: lifecycle.signal, doc: document });
  const router = { route: { segments: ['pet'] }, navigate: () => {}, replace: () => {} };
  await pet.petFeature.mount({ root, lifecycle, signal: lifecycle.signal, ui, router, route: router.route, capabilities: {}, onError: (err) => { throw err; }, refreshNav: () => {} });
  await settle();
  const S = pet.TEXT[language];
  const row = [...root.querySelectorAll('.companion-row')].find((r) => r.textContent.includes(S.typeKey));
  return {
    lifecycle, S, row,
    box: row?.querySelector('input[type="checkbox"]'),
    keys: row?.querySelector('.companion-rangebox'),
    button: row?.querySelector('.companion-rangebox button'),
    press: row?.querySelector('.companion-rangebox select'),
    hint: row?.querySelector('.home-note'),
  };
}

describe.skipIf(!STAGED && !process.env.CI)('the typing key on the 习惯 page (upstream #361)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it.each(['zh', 'en'])('(%s) off by default; on, it shows the keys and how they are pressed, and saves each change through the pet panel', async (language) => {
    const typeKey = { enabled: false, hotkey: 'LeftCtrl*2', problem: null };
    const calls = fakeCore(language, typeKey);
    const { lifecycle, S, row, box, keys, button, press, hint } = await mountPet(language);
    expect(row, S.typeKey).toBeDefined();
    expect(box.checked).toBe(false);
    expect(keys.hidden).toBe(true);
    expect(hint.textContent).toBe(S.typeKeyHint);

    box.click();
    await vi.waitFor(() => expect(calls).toEqual([{ enabled: true }]));
    await vi.waitFor(() => expect(keys.hidden).toBe(false));
    expect(row.querySelector('.companion-rangeval').textContent).toBe(language === 'zh' ? '左 Ctrl' : 'Left Ctrl');
    expect([...press.options].map((o) => [o.value, o.textContent])).toEqual([['2', S.typeKeyPresses[2]], ['1', S.typeKeyPresses[1]]]);
    expect(press.value).toBe('2');
    if (language === 'en') expect(row.textContent).not.toMatch(CJK);

    // a new key: every key down until the first release; how it is pressed stays as picked
    button.click();
    expect(hint.textContent).toBe(S.typeKeyCapture);
    expect(button.textContent).toBe(S.typeKeyCancel);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyK' }));
    await vi.waitFor(() => expect(calls.at(-1)).toEqual({ hotkey: 'LeftShift+K*2' }));
    expect(button.textContent).toBe(S.typeKeyChange);
    // Esc cancels and sends nothing
    button.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    await settle();
    expect(calls).toHaveLength(2);
    expect(hint.textContent).toBe(S.typeKeyHint);

    press.value = '1';
    press.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(calls.at(-1)).toEqual({ hotkey: 'LeftShift+K' }));
    lifecycle.dispose();
  });

  it('while on and unreadable the reason replaces the hint, in red; off, the hint is back', async () => {
    const typeKey = { enabled: true, hotkey: 'LeftCtrl*2', problem: '打字键只在 Windows、macOS 和 Linux 上可用' };
    fakeCore('zh', typeKey);
    const { lifecycle, S, box, hint } = await mountPet('zh');
    expect(box.checked).toBe(true);
    expect(hint.textContent).toBe(typeKey.problem);
    expect(hint.classList.contains('bad')).toBe(true);
    box.click();
    await vi.waitFor(() => expect(hint.textContent).toBe(S.typeKeyHint));
    expect(hint.classList.contains('bad')).toBe(false);
    lifecycle.dispose();
  });
});
