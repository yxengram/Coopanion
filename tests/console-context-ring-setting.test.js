// @vitest-environment jsdom
/**
 * The 习惯 page's 「其他」 card (upstream #360), read from the console's staged place in build/cortico (run
 * `pnpm run build:cortico` after changing it): the context-ring switch shows `companion.contextRing` from the Core's
 * `companion` group, unticked when the key is missing, and writes it to that group, in zh and en.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/pet/index.ts`);
const RING = 'companion.contextRing';

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

function fakeCore(companion) {
  const sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (path === '/api/config' && method === 'GET') return json({ groups: [{ group: { id: 'companion' }, values: companion }, { group: { id: 'world:desktop-pet' }, values: {} }] });
    if (path === '/api/config' && method === 'POST') { sent.push(body); if (body.group === 'companion') Object.assign(companion, body.values); return json({ result: body.group }); }
    return json({});
  }));
  return sent;
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
  const row = [...root.querySelectorAll('.companion-row')].find((r) => r.querySelector('.companion-label')?.textContent === S.ringLabel);
  return { root, lifecycle, S, row, box: row?.querySelector('input[type="checkbox"]') };
}

describe.skipIf(!STAGED && !process.env.CI)('the context ring switch on the 习惯 page', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it.each(['zh', 'en'])('(%s) sits in the last card, 其他, unticked when the key is missing, and writes the companion group', async (language) => {
    const companion = { language };
    const sent = fakeCore(companion);
    const { root, lifecycle, S, row, box } = await mountPet(language);
    expect(row, S.ringLabel).toBeDefined();
    expect(row.textContent).toContain(S.ring);
    expect(row.textContent).toContain(S.ringHint);
    const sheets = [...root.children];
    expect(sheets.at(-1).contains(row)).toBe(true);
    expect(sheets.at(-1).textContent).toContain(S.otherTitle);
    expect(box.checked).toBe(false);

    box.click();
    await vi.waitFor(() => expect(sent).toContainEqual({ group: 'companion', values: { [RING]: true } }));
    expect(sent.filter((b) => b.group === 'companion')).toEqual([{ group: 'companion', values: { [RING]: true } }]);
    box.click();
    await vi.waitFor(() => expect(sent).toContainEqual({ group: 'companion', values: { [RING]: false } }));
    lifecycle.dispose();
  });

  it('follows the config: ticked when the companion group has it on', async () => {
    fakeCore({ language: 'zh', [RING]: true });
    const { lifecycle, box } = await mountPet('zh');
    expect(box.checked).toBe(true);
    lifecycle.dispose();
  });
});
