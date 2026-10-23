/**
 * The dressing page's import and uninstall (packages/cortico-world-desktop-pet/web/dress.js, upstream #306 and #317),
 * its code run in jsdom against a real pet server over a real pack folder: replacing an installed pack asks first
 * (the server's 409) and cancelling keeps its files; a new pack installs at once; a pack the server lists as
 * removable is uninstalled from its tile after a yes, the pet changing back to Coo when it wore it; a built-in is refused.
 * The fork's import box is inline (no dialog), so the page's code from its import section to the dropped-folder helper is run.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { strToU8, zipSync } from 'fflate';
import { PetServer } from '../packages/cortico-world-desktop-pet/src/server.ts';
import { figurePacks } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { ICONS } from '../packages/cortico-world-desktop-pet/web/ui.js';
import { nameIn, setLanguage, t } from '../packages/cortico-world-desktop-pet/web/i18n.js';
import zh from '../packages/cortico-world-desktop-pet/web/i18n/zh.js';
import en from '../packages/cortico-world-desktop-pet/web/i18n/en.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const dress = readFileSync(new URL('web/dress.js', PKG), 'utf8');
const START = '/* ---------- importing figure packs (src/pack-import.ts) ---------- */';
const END = "/** The files under a dropped folder, each path starting with the folder's name. */";
const importing = dress.slice(dress.indexOf(START), dress.indexOf(END));
const word = { id: 'nod', kind: 'action', seconds: 1, desc: { zh: '点头' } };
const manifest = (version) => ({ manifest: 2, api: 2, id: 'robot', version, name: { zh: '机器人', en: 'Robot' }, about: { zh: '一个机器人' }, entry: 'figure.js', export: 'createBody', axes: [], presets: [], vocab: [word] });
const cleanup = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); setLanguage('zh'); });

/** A pack folder, the pet server over it, and the page's import code in jsdom; `installed` puts version 0.9.0 in as `old-name/`. */
async function page({ installed = true, figure = 'coo', language = 'zh' } = {}) {
  setLanguage(language);
  const root = mkdtempSync(join(tmpdir(), 'pet-import-'));
  const old = join(root, 'old-name');
  if (installed) {
    mkdirSync(old);
    writeFileSync(join(old, 'figure.json'), JSON.stringify(manifest('0.9.0')));
    writeFileSync(join(old, 'figure.js'), 'export function createBody() {}');
    writeFileSync(join(old, 'kept.txt'), 'original');
  }
  const server = new PetServer({
    port: () => 0, webDir: fileURLToPath(new URL('web/', PKG)), snapshot: () => ({}),
    packs: () => figurePacks([root]).packs, packDir: () => root,
    onPetMessage() {}, onAudio() {}, onPetConnect() {}, onPetDisconnect() {}, onSkin() {}, onPrefs() {},
  });
  await server.start();
  cleanup.push(async () => { await server.stop(); rmSync(root, { recursive: true, force: true }); });
  const dom = new JSDOM('<!doctype html><body></body>', { url: `${server.origin}/dress`, runScripts: 'outside-only' });
  const win = dom.window;
  cleanup.push(() => win.close());
  const responses = [];
  // the page's requests still on their way when a test ends finish before the server stops (upstream #328)
  const inFlight = new Set();
  cleanup.push(() => Promise.allSettled(inFlight));
  win.fetch = (path, options = {}) => {
    const request = fetch(new URL(path, server.origin), { ...options, headers: { ...options.headers, origin: server.origin } })
      .then((res) => { responses.push({ path, status: res.status }); return res; });
    inFlight.add(request);
    void request.finally(() => inFlight.delete(request)).catch(() => {});
    return request;
  };
  const applied = [];
  win.deps = { t, nameOf: nameIn, ICONS, applied, figure };
  win.eval(`
    const { t, nameOf, ICONS, applied } = window.deps;
    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    let skin = { figure: window.deps.figure }, body = { dispose() {} }, packs = [];
    const sfx = { sparkle() {}, tick() {} };
    const render = () => {}, showFigure = async () => {};
    const apply = (next) => { skin = next; applied.push(next); };
    const loadPacks = () => fetch('/api/figures').then((r) => r.json()).then((list) => { packs = list; });
    ${importing}
    window.page = { importPick, removeButton, importBox, skin: () => skin, packs: async () => { await loadPacks(); return packs; } };
  `);
  const stage = async (version) => {
    const files = { 'robot/figure.json': strToU8(JSON.stringify(manifest(version))), 'robot/figure.js': strToU8('export function createBody() {}') };
    const res = await fetch(`${server.origin}/api/figures/import`, { method: 'POST', headers: { origin: server.origin, 'content-type': 'application/zip' }, body: zipSync(files) });
    return res.json();
  };
  const box = win.page.importBox;
  const button = (text) => [...box.querySelectorAll('button')].find((b) => b.textContent === text);
  return { root, old, server, responses, win, box, button, applied, stage, page: win.page };
}

describe('figure import confirmation (upstream #306)', () => {
  it('asks before replacing an installed pack, and cancelling keeps its files and drops the import', async () => {
    const p = await page();
    p.page.importPick(await p.stage('2.0.0'));
    expect(p.box.textContent).toContain(t('import.replaces', { version: '0.9.0' }));
    p.button(t('import.install')).click();
    await expect.poll(() => !!p.button(t('import.replace'))).toBe(true);
    expect(p.responses).toContainEqual({ path: '/api/figures/import/install', status: 409 });
    expect(p.box.querySelector('.imp-name').textContent).toBe(t('import.replaceTitle'));
    expect(p.box.querySelector('.imp-list li').textContent).toBe('机器人 (robot)');
    expect(p.button(t('import.replace')).className).toBe('danger');
    expect(readFileSync(join(p.old, 'kept.txt'), 'utf8')).toBe('original');
    p.button(t('import.cancel')).click();
    await expect.poll(() => p.responses).toContainEqual({ path: '/api/figures/import/cancel', status: 200 });
    expect(p.box.hidden).toBe(true);
    expect(readdirSync(p.root)).toEqual(['old-name']);
    expect(readFileSync(join(p.old, 'kept.txt'), 'utf8')).toBe('original');
  });

  it('replaces the pack only after the person says yes to the listed conflict', async () => {
    const p = await page();
    p.page.importPick(await p.stage('2.0.0'));
    p.button(t('import.install')).click();
    await expect.poll(() => !!p.button(t('import.replace'))).toBe(true);
    p.button(t('import.replace')).click();
    await expect.poll(() => p.box.textContent).toContain(t('import.done', { names: '机器人' }));
    expect(p.responses.filter((r) => r.path.endsWith('/install')).map((r) => r.status)).toEqual([409, 200]);
    expect(existsSync(p.old)).toBe(false);
    expect(JSON.parse(readFileSync(join(p.root, 'robot', 'figure.json'), 'utf8')).version).toBe('2.0.0');
  });

  it('installs a new pack at once, and a page of another port cannot import', async () => {
    const p = await page({ installed: false });
    const res = await fetch(`${p.server.origin}/api/figures/import`, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/zip' }, body: new Uint8Array() });
    expect(res.status).toBe(421);
    p.page.importPick(await p.stage('1.0.0'));
    p.button(t('import.install')).click();
    await expect.poll(() => p.box.textContent).toContain(t('import.done', { names: '机器人' }));
    expect(p.responses.filter((r) => r.path.endsWith('/install')).map((r) => r.status)).toEqual([200]);
    expect(figurePacks([p.root]).packs.some((pack) => pack.id === 'robot')).toBe(true);
  });

  it('asks in English too', async () => {
    const p = await page({ language: 'en' });
    p.page.importPick(await p.stage('2.0.0'));
    p.button('Import').click();
    await expect.poll(() => !!p.button('Replace')).toBe(true);
    expect(p.box.querySelector('.imp-name').textContent).toBe('Replace existing figure packs?');
    expect(p.box.querySelector('.imp-list li').textContent).toBe('Robot (robot)');
  });
});

describe('uninstalling figure packs (upstream #317)', () => {
  it('the trash on an imported pack asks, then deletes the pack, and the pet wearing it changes back to Coo', async () => {
    const p = await page({ figure: 'robot' });
    const listed = await p.page.packs();
    expect(listed.filter((x) => x.removable).map((x) => x.id)).toEqual(['robot']);
    const trash = p.page.removeButton(listed.find((x) => x.id === 'robot'));
    expect(trash.getAttribute('aria-label')).toBe('卸载「机器人」');
    expect(trash.querySelector('svg')).not.toBeNull();
    trash.click();
    expect(p.box.hidden).toBe(false);
    expect(p.box.querySelector('.imp-name').textContent).toBe('卸载「机器人」?');
    // cancelling deletes nothing
    p.button(t('import.cancel')).click();
    expect(p.box.hidden).toBe(true);
    expect(readdirSync(p.root)).toEqual(['old-name']);
    trash.click();
    p.button(t('remove.go')).click();
    await expect.poll(() => p.box.textContent).toBe(t('remove.done', { name: '机器人' }));
    expect(p.responses).toContainEqual({ path: '/api/figures/remove', status: 200 });
    expect(readdirSync(p.root)).toEqual([]);
    expect(p.applied).toEqual([{ figure: 'coo' }]);
    expect((await p.page.packs()).map((x) => x.id)).not.toContain('robot');
  });

  it('leaves the look alone when another figure is worn, and says why a pack cannot go', async () => {
    const p = await page({ figure: 'whale' });
    p.page.removeButton((await p.page.packs()).find((x) => x.id === 'robot')).click();
    p.button(t('remove.go')).click();
    await expect.poll(() => readdirSync(p.root)).toEqual([]);
    expect(p.applied).toEqual([]);
    // a built-in (the server refuses it whatever the page sends)
    p.page.removeButton({ id: 'whale', name: { zh: '大肥鱼' } }).click();
    p.button(t('remove.go')).click();
    await expect.poll(() => p.box.querySelector('.imp-bad')?.textContent ?? '').toMatch(/^没卸载:whale 是内置形象/);
  });

  it('has the replace and uninstall text in both tables', () => {
    for (const key of ['import.replaceTitle', 'import.replaceText', 'import.replace', 'remove.label', 'remove.title', 'remove.lead', 'remove.go', 'remove.failed', 'remove.done']) {
      expect(zh[key], key).toEqual(expect.any(String));
      expect(en[key], key).toEqual(expect.any(String));
    }
  });
});
