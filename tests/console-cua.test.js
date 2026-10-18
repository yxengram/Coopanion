// @vitest-environment jsdom
/**
 * The 电脑操作 page (console/features/cua, read from its staged place in build/cortico: run `pnpm run build:cortico`
 * after changing it): before the switch first turns computer use on, a dialog says what it risks (upstream #243 a).
 * Only its yes turns the World on, and once confirmed this settings window does not ask again. Computer use is on
 * by default, so the first visit with it on shows the same notice with Keep it on and Turn it off; the advanced
 * mode's World page asks before its power button turns computer use on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/cua/index.ts`);

const settle = () => new Promise((r) => setTimeout(r, 0));

/** The page mounted over a fetch that answers the World list and config and keeps what was posted. */
async function mounted({ active = false, world = null, fresh = true } = {}) {
  if (fresh) vi.resetModules();
  const posts = [];
  const fetch = vi.fn(async (path, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'POST' || init.method === 'PUT' || init.method === 'PATCH') posts.push({ path: String(path), body });
    const read = !init.method || init.method === 'GET';
    if (world?.hold && !read && String(path).includes('/api/worlds/activation')) await world.hold;
    if (world?.error && !read && String(path).includes('/api/worlds/activation')) {
      return new Response(JSON.stringify({ error: world.error }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    const status = world ? world.status() : active ? 'active' : 'inactive';
    const json = String(path).includes('/api/worlds') && read ? { worlds: [{ id: 'cua', status }] }
      : String(path).includes('/api/config') && read ? { groups: [] } : {};
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetch);
  const { cuaFeature, TEXT, RISKS_SEEN } = await import(/* @vite-ignore */ `${CLIENT}features/cua/index.ts`);
  const { createWebUi } = await import(/* @vite-ignore */ `${CLIENT}ui/index.ts`);
  const life = new AbortController();
  const root = document.createElement('div');
  document.body.append(root);
  const memo = { get: (_k, d) => d, set() {} };
  const ui = createWebUi({ memo, overlayHost: document.body, signal: life.signal, doc: document });
  await cuaFeature.mount({ root, signal: life.signal, ui, lifecycle: { signal: life.signal, own() {}, interval() {} }, capabilities: {} });
  const box = root.querySelector('input[type="checkbox"]');
  const toggle = async (on) => { box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); };
  const dialog = () => document.querySelector('.modal');
  const button = (label) => [...(dialog()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
  await settle();
  return { S: TEXT.zh, RISKS_SEEN, posts, box, toggle, dialog, button, settle, life, activations: () => posts.filter((p) => p.path.includes('/api/worlds/activation')).map((p) => p.body) };
}

/** Browser storage: Node's own `localStorage` global (unusable without a file) hides jsdom's. */
class MemoryStorage {
  #map = new Map();
  getItem(k) { return this.#map.has(k) ? this.#map.get(k) : null; }
  setItem(k, v) { this.#map.set(k, String(v)); }
  removeItem(k) { this.#map.delete(k); }
  clear() { this.#map.clear(); }
}
let storage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(document.defaultView, 'localStorage', { configurable: true, get: () => storage });
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe.skipIf(!STAGED && !process.env.CI)("the 电脑操作 page's risk dialog", () => {
  it('asks before the first turn-on; Cancel leaves it off and sends nothing', async () => {
    const p = await mounted();
    await p.toggle(true);
    expect(p.dialog()).not.toBeNull();
    expect(p.dialog().querySelector('.modaltitle').textContent).toBe(p.S.riskTitle);
    expect([...p.dialog().querySelectorAll('.cua-risks li')].map((li) => li.textContent)).toEqual(p.S.risks);
    expect(p.dialog().querySelector('strong').textContent).toBe(p.S.riskDanger);
    expect(p.activations()).toEqual([]);
    p.button(p.S.riskCancel).click();
    await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.box.checked).toBe(false);
    expect(p.activations()).toEqual([]);
    expect(storage.getItem(p.RISKS_SEEN)).toBeNull();
  });

  it('Esc and a click beside the card are a no too', async () => {
    const p = await mounted();
    await p.toggle(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.box.checked).toBe(false);
    await p.toggle(true);
    p.dialog().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.activations()).toEqual([]);
  });

  it('Turn on turns the World on and is remembered: later turn-ons do not ask, turning off never does', async () => {
    const p = await mounted();
    await p.toggle(true);
    p.button(p.S.riskOk).click();
    await p.settle(); await p.settle();
    expect(p.box.checked).toBe(true);
    expect(p.activations()).toEqual([{ id: 'cua', enabled: true }]);
    expect(storage.getItem(p.RISKS_SEEN)).toBe('1');
    await p.toggle(false);
    expect(p.dialog()).toBeNull();
    await p.toggle(true);
    expect(p.dialog()).toBeNull();
    await p.settle();
    expect(p.activations()).toEqual([{ id: 'cua', enabled: true }, { id: 'cua', enabled: false }, { id: 'cua', enabled: true }]);
  });

  it('leaving the page while it asks closes the dialog as a no', async () => {
    const p = await mounted();
    await p.toggle(true);
    p.life.abort();
    await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.activations()).toEqual([]);
  });

  it('storage that cannot be read asks every time, and still turns on after a yes', async () => {
    Object.defineProperty(document.defaultView, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    const p = await mounted();
    await p.toggle(true);
    p.button(p.S.riskOk).click();
    await p.settle(); await p.settle();
    expect(p.activations()).toEqual([{ id: 'cua', enabled: true }]);
    await p.toggle(false);
    await p.toggle(true);
    expect(p.dialog()).not.toBeNull();
  });

  it('the first visit with computer use on (the default) shows the notice; Keep it on is remembered and sends nothing', async () => {
    const p = await mounted({ active: true });
    expect(p.dialog()).not.toBeNull();
    expect(p.dialog().querySelector('.modaltitle').textContent).toBe(p.S.riskTitle);
    expect([...p.dialog().querySelectorAll('.cua-risks li')].map((li) => li.textContent)).toEqual(p.S.risks);
    expect(p.button(p.S.riskOk)).toBeUndefined();
    expect(p.box.checked).toBe(true);
    p.button(p.S.riskKeep).click();
    await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.box.checked).toBe(true);
    expect(p.activations()).toEqual([]);
    expect(storage.getItem(p.RISKS_SEEN)).toBe('1');
    p.life.abort();
    const again = await mounted({ active: true });
    expect(again.dialog()).toBeNull();
  });

  it('Turn it off turns the World off and is not remembered: turning it back on asks as before', async () => {
    const p = await mounted({ active: true });
    p.button(p.S.riskOff).click();
    await p.settle(); await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.box.checked).toBe(false);
    expect(p.activations()).toEqual([{ id: 'cua', enabled: false }]);
    expect(storage.getItem(p.RISKS_SEEN)).toBeNull();
    await p.toggle(true);
    expect(p.button(p.S.riskOk)).toBeDefined();
    p.button(p.S.riskOk).click();
    await p.settle(); await p.settle();
    expect(p.activations()).toEqual([{ id: 'cua', enabled: false }, { id: 'cua', enabled: true }]);
    expect(storage.getItem(p.RISKS_SEEN)).toBe('1');
  });

  it('a turn-off that fails because the World is already off (an earlier one finished late) shows it off, not an error', async () => {
    let status = 'active';
    const p = await mounted({ world: { status: () => status, error: '未挂载的 World: cua' } });
    status = 'inactive';
    p.button(p.S.riskOff).click();
    await p.settle(); await p.settle(); await p.settle();
    expect(p.activations()).toEqual([{ id: 'cua', enabled: false }]);
    expect(p.box.checked).toBe(false);
    expect(document.querySelector('.msgline').classList.contains('bad')).toBe(false);
    expect(document.querySelector('.msgline').textContent).toBe(p.S.turnedOff);
  });

  it('a turn-off that really fails puts the switch back on and says why', async () => {
    const p = await mounted({ world: { status: () => 'active', error: 'nope' } });
    p.button(p.S.riskOff).click();
    await p.settle(); await p.settle(); await p.settle();
    expect(p.box.checked).toBe(true);
    expect(document.querySelector('.msgline').classList.contains('bad')).toBe(true);
  });

  it('a turn-off still running when the page is left and opened again is waited for: no second notice', async () => {
    let status = 'active';
    let release;
    const hold = new Promise((r) => { release = r; });
    const world = { status: () => status, hold };
    const p = await mounted({ world });
    p.button(p.S.riskOff).click();
    await p.settle();
    p.life.abort();
    document.body.replaceChildren();
    const q = mounted({ world, fresh: false });
    await settle(); await settle();
    expect(document.querySelector('.modal')).toBeNull();
    expect(document.querySelector('input[type="checkbox"]').disabled).toBe(true);
    status = 'inactive';
    release();
    const again = await q;
    expect(again.dialog()).toBeNull();
    expect(again.box.checked).toBe(false);
    expect(again.box.disabled).toBe(false);
    expect([...p.activations(), ...again.activations()]).toEqual([{ id: 'cua', enabled: false }]);
  });

  it('Esc or leaving the page decides nothing: it stays on and the notice shows on the next visit', async () => {
    const p = await mounted({ active: true });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await p.settle();
    expect(p.dialog()).toBeNull();
    expect(p.box.checked).toBe(true);
    p.life.abort();
    const q = await mounted({ active: true });
    expect(q.dialog()).not.toBeNull();
    q.life.abort();
    await q.settle();
    expect(q.dialog()).toBeNull();
    expect([...p.activations(), ...q.activations()]).toEqual([]);
    expect(storage.getItem(p.RISKS_SEEN)).toBeNull();
  });

  it('no notice when it is off, or once the risks were confirmed', async () => {
    const off = await mounted({ active: false });
    expect(off.dialog()).toBeNull();
    off.life.abort();
    storage.setItem(off.RISKS_SEEN, '1');
    const seen = await mounted({ active: true });
    expect(seen.dialog()).toBeNull();
    expect(seen.activations()).toEqual([]);
  });

  it('English has the same dialog', async () => {

    const { TEXT } = await import(/* @vite-ignore */ `${CLIENT}features/cua/index.ts`);
    expect(Object.keys(TEXT.en).sort()).toEqual(Object.keys(TEXT.zh).sort());
    expect(TEXT.en.risks).toHaveLength(TEXT.zh.risks.length);
    expect(TEXT.en.riskOk).toBe('Turn on');
    expect([TEXT.en.riskKeep, TEXT.en.riskOff]).toEqual(['Keep it on', 'Turn it off']);
    expect([TEXT.zh.riskKeep, TEXT.zh.riskOff]).toEqual(['保持打开', '关掉']);
  });
});

/** A World page card as Cortico's worlds feature draws it: `h3` with the `toolsCount` line, the power button in the corner. */
function worldCard(id, onPower) {
  const card = document.createElement('div');
  card.className = 'sheet tabbed iocard iocard-inactive';
  const h3 = document.createElement('h3');
  h3.textContent = id;
  const en = document.createElement('span');
  en.className = 'en';
  en.textContent = `${id} · 0 tools`;
  h3.append(en);
  const btn = document.createElement('button');
  btn.className = 'iobtn iobtn-start';
  btn.addEventListener('click', onPower);
  const corner = document.createElement('div');
  corner.className = 'iocorner';
  corner.append(btn);
  card.append(h3, corner);
  return { card, btn };
}

describe.skipIf(!STAGED && !process.env.CI)("the World page's power button on computer use", () => {
  async function page() {
    vi.resetModules();
    const { guardWorldsPage, TEXT, RISKS_SEEN } = await import(/* @vite-ignore */ `${CLIENT}features/cua/index.ts`);
    const { createWebUi } = await import(/* @vite-ignore */ `${CLIENT}ui/index.ts`);
    const life = new AbortController();
    const root = document.createElement('div');
    document.body.append(root);
    const ui = createWebUi({ memo: { get: (_k, d) => d, set() {} }, overlayHost: document.body, signal: life.signal, doc: document });
    const powered = [];
    const cua = worldCard('cua', () => powered.push('cua'));
    const pet = worldCard('desktop-pet', () => powered.push('desktop-pet'));
    root.append(cua.card, pet.card);
    guardWorldsPage(root, ui, life.signal);
    const button = (label) => [...(document.querySelector('.modal')?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
    return { S: TEXT.zh, RISKS_SEEN, life, powered, cua, pet, button, dialog: () => document.querySelector('.modal') };
  }

  it('asks before turning computer use on; a no leaves it off, a yes turns it on and is remembered', async () => {
    const p = await page();
    p.cua.btn.click();
    expect(p.dialog()).not.toBeNull();
    expect(p.powered).toEqual([]);
    p.button(p.S.riskCancel).click();
    await settle();
    expect(p.powered).toEqual([]);
    expect(storage.getItem(p.RISKS_SEEN)).toBeNull();
    p.cua.btn.click();
    p.button(p.S.riskOk).click();
    await settle();
    expect(p.powered).toEqual(['cua']);
    expect(storage.getItem(p.RISKS_SEEN)).toBe('1');
    p.cua.btn.click();
    expect(p.dialog()).toBeNull();
    expect(p.powered).toEqual(['cua', 'cua']);
  });

  it('other Worlds, and computer use once confirmed (on its own page too), are not asked', async () => {
    const p = await page();
    p.pet.btn.click();
    expect(p.dialog()).toBeNull();
    expect(p.powered).toEqual(['desktop-pet']);
    storage.setItem(p.RISKS_SEEN, '1');
    p.cua.btn.click();
    expect(p.dialog()).toBeNull();
    expect(p.powered).toEqual(['desktop-pet', 'cua']);
  });

  it("Cortico's World page still draws the marks the guard looks for", () => {
    const src = readFileSync(`${CLIENT}features/worlds/index.ts`, 'utf8');
    expect(src).toContain("iconButton('power', S.activateWorld, 'iobtn-start'");
    expect(src).toContain('ui.sheet({ title: m.label || m.id, en: S.toolsCount(m.id, tools.length) })');
    const strings = readFileSync(`${CLIENT}features/worlds/strings.ts`, 'utf8');
    expect(strings).toContain('toolsCount: (id: string, n: number) => `${id} · ');
    expect(readFileSync(`${CLIENT}main.ts`, 'utf8')).toContain('guardWorldsPage(ctx.root, ctx.ui, ctx.signal)');
  });
});
