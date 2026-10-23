// @vitest-environment jsdom
/**
 * The 习惯 page's 气泡速度 slider (upstream #248) and the input bubbles switch (#279), read from the console's staged
 * place in build/cortico (run `pnpm run build:cortico` after changing it): both show what the World's config holds and
 * write `worlds.desktop-pet.window.bubbleSpeed` / `worlds.desktop-pet.saidBubbles`, in zh and en.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/pet/index.ts`);
const K = 'worlds.desktop-pet';

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

function fakeCore(language, values) {
  const sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (path === '/api/config' && method === 'GET') {
      return json({ groups: [{ group: { id: 'companion' }, values: { language } }, { group: { id: 'world:desktop-pet' }, values }] });
    }
    if (path === '/api/config' && method === 'POST') { sent.push(body); Object.assign(values, body.values); return json({ result: body.group }); }
    return json({});
  }));
  return sent;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe.skipIf(!STAGED && !process.env.CI)('bubble settings on the 习惯 page', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it.each(['zh', 'en'])('(%s) the bubble speed slider and the input bubbles switch read and write the World config', async (language) => {
    const values = { [`${K}.window.bubbleSpeed`]: 1.5, [`${K}.saidBubbles`]: true };
    const sent = fakeCore(language, values);
    const [{ createWebUi }, { Lifecycle }, pet] = await load(language, 'ui/index.ts', 'core/lifecycle.ts', 'features/pet/index.ts');
    const lifecycle = new Lifecycle((err) => { throw err; });
    const root = document.createElement('div');
    document.body.append(root);
    const ui = createWebUi({ memo: { get: (_k, d) => d, set: () => {} }, overlayHost: document.body, signal: lifecycle.signal, doc: document });
    const router = { route: { segments: ['pet'] }, navigate: () => {}, replace: () => {} };
    await pet.petFeature.mount({ root, lifecycle, signal: lifecycle.signal, ui, router, route: router.route, capabilities: {}, onError: (err) => { throw err; }, refreshNav: () => {} });
    await settle();
    const S = pet.TEXT[language];
    const rows = [...root.querySelectorAll('.companion-row')];

    const speedRow = rows.find((r) => r.querySelector('.companion-label')?.textContent === S.bubbleSpeed);
    expect(speedRow, S.bubbleSpeed).toBeDefined();
    expect(speedRow.textContent).toContain(S.bubbleSpeedHint);
    const slider = speedRow.querySelector('input[type="range"]');
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['0.5', '2', '0.05', '1.5']);
    expect(speedRow.querySelector('.companion-rangeval').textContent).toBe('150%');
    slider.value = '0.75';
    slider.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(sent).toContainEqual({ group: 'world:desktop-pet', values: { [`${K}.window.bubbleSpeed`]: .75 } }));
    expect(speedRow.querySelector('.companion-rangeval').textContent).toBe('75%');

    const saidRow = rows.find((r) => r.textContent.includes(S.saidBubbles));
    expect(saidRow, S.saidBubbles).toBeDefined();
    expect(saidRow.textContent).toContain(S.saidBubblesHint);
    const box = saidRow.querySelector('input[type="checkbox"]');
    expect(box.checked).toBe(true);
    box.click();
    await vi.waitFor(() => expect(sent).toContainEqual({ group: 'world:desktop-pet', values: { [`${K}.saidBubbles`]: false } }));
    lifecycle.dispose();
  });
});
