/**
 * Dressing page: the body (a figure pack, src/packs.ts; Coo is one); for Coo the palette, four accessory slots
 * and their color channels, for another pack a row per dress-up axis of its manifest; with a live preview
 * of the body run as on the desktop (body-host.js).
 * Every change is saved through `POST /api/skin` (the dark/light switch through `POST /api/prefs`);
 * the World persists it and pushes it to the pet window. Changes made elsewhere arrive over
 * `/socket?role=dress`.
 * The figure row ends in an import tile: a figure pack picked as a zip or a folder, or dropped on the page, is sent to
 * `POST /api/figures/import` (src/pack-import.ts), which lists the packs it found; the ones ticked are installed into
 * the data directory's `figures/` and the row is read again. Replacing an installed pack asks first (the server answers
 * 409 with the ids it would replace). A pack the server lists as `removable` has a trash button on its tile, which
 * asks and then uninstalls it (`POST /api/figures/remove`); the pet wearing it changes back to Coo.
 * The page's text follows the app language the World sends (`language` in `init` and `prefs`, i18n.js).
 */
import { applyTheme, ICONS } from './ui.js';
import { applyText, cooLabel, nameIn, setLanguage, t } from './i18n.js';
import { createSfx, OWN_PACKS } from './sound.js';
import {
  COO_CSS, mini, normalizeSkin, skinCss, wear,
  PALETTES, HEADS, SIDES, GLASSES, NECKS, ACC_COLORS, LINKED, NO_BODY, ROLES,
} from './coo/coo.js';
import { loadBody } from './body-host.js';

import { bindAppearance } from './appearance.js';
bindAppearance(document, window);

const $ = (s) => document.querySelector(s);

// Coo's drawing classes for the tiles; the page's own colours follow Coo's palette
const cooStyle = document.createElement('style'), skinStyle = document.createElement('style');
cooStyle.textContent = COO_CSS;
document.head.append(cooStyle, skinStyle);
const sfx = createSfx({ storageKey: 'cortico-pet.dress-sound.v1', volume: .35 });
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => sfx.unlock(), { capture: true }));

let skin = normalizeSkin(null);
let theme = document.documentElement.dataset.theme;
const modeBtn = $('#mode');
applyTheme(theme, modeBtn);
const preview = $('#preview');
const bounds = () => ({ W: preview.clientWidth, H: preview.clientHeight, floorY: preview.clientHeight - 30, S: .5 });
/** The body in the preview (body-host.js), and the page's clock. */
let body = null, T = 0;
new ResizeObserver(() => body?.set({ bounds: bounds() })).observe(preview);
const local = (e) => { const r = preview.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }; };
preview.addEventListener('pointerdown', (e) => { const p = local(e); body?.pointer('down', p); if (body?.hit(p)) preview.setPointerCapture(e.pointerId); });
preview.addEventListener('pointermove', (e) => body?.pointer('move', local(e)));
preview.addEventListener('pointerup', (e) => body?.pointer('up', local(e)));
preview.addEventListener('pointerleave', () => body?.pointer('leave', {}));

modeBtn.addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme, modeBtn);
  body?.set({ theme });
  sfx.tick();
  save('/api/prefs', { theme });
});

function save(path, body) {
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { $('#saved').textContent = t(r.ok ? 'dress.saved' : 'dress.notSaved'); })
    .catch(() => { $('#saved').textContent = t('dress.offline'); });
}

// the installed figure packs, asked for again whenever the page hears of a look
let packs = [];
const loadPacks = () => fetch('/api/figures').then((r) => r.json()).then((list) => { packs = list; render(); }).catch(() => {});
loadPacks();
let wanted = null, loading = null;
// a pack that will not load or breaks previews as Coo, as on the desktop
function previewFailed(id, err) {
  console.error(err);
  if (id !== 'coo' && wanted === id) void showFigure({ ...skin, figure: 'coo' });
}
async function showFigure(s) {
  wanted = s.figure;
  if (loading === s.figure) return;
  try {
    if (body?.pack === s.figure) {
      body.set({ skin: s });
      if (s.figure !== 'coo') await body.setScheme(s.scheme, { fade: .4 });
      return;
    }
    loading = s.figure;
    const pack = packs.find((p) => p.id === s.figure) ?? (await (await fetch('/api/figures')).json()).find((p) => p.id === s.figure);
    if (!pack) throw new Error('没有装这个形象');
    const was = body?.layout;
    const holder = {};
    const next = await loadBody({
      layer: $('#figureLayer'), pack, theme, bounds: bounds(),
      start: { x: was?.x ?? preview.clientWidth / 2, facing: was?.facing, skin: s, scheme: s.scheme },
      onEvent: () => {},
      onSound: (name, kind, ...args) => { if (body === holder.body) sfx.play(name, kind, ...args); },
      onError: (err) => { if (body === holder.body) previewFailed(pack.id, err); },
    });
    if (wanted !== s.figure) { next.dispose(); return; }
    holder.body = next;
    next.set({ roam: 'calm' });
    body?.dispose();
    body = next;
    sfx.usePack(pack.base, pack.sounds, { plus: OWN_PACKS.includes(pack.id) });
  } catch (err) {
    previewFailed(s.figure, err);
  } finally {
    if (loading === s.figure) loading = null;
  }
  // a pick that came while the body was loading
  if (body?.pack === skin.figure && skin !== s) await showFigure(skin);
}

function apply(next, persist) {
  skin = next;
  skinStyle.textContent = skinCss(skin);
  showFigure(skin).catch((err) => console.error(err));
  render();
  if (persist) save('/api/skin', { skin });
}

const CROP = { palette: '18 18 220 220', head: '18 -72 220 220', side: '-52 -4 220 220', glasses: '28 7 220 220', neck: '32 84 220 220' };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function colorRow(slot, item) {
  const row = el('div', 'cmap');
  for (const ch of ROLES[item]) {
    const name = t(ch === 'main' ? 'dress.main' : 'dress.accent');
    const grp = el('div', 'cm-group');
    grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', name);
    grp.appendChild(el('span', 'cm-label', name));
    for (const src of [...LINKED.filter((l) => !(l.id === 'body' && NO_BODY[slot])), ...ACC_COLORS]) {
      const linked = src.id === 'body' || src.id === 'eye';
      const b = el('button', 'dot' + (linked ? ' linked ' + src.id : ''));
      if (!linked) b.style.cssText = `--dl:${src.l};--dd:${src.d}`;
      b.title = cooLabel('color', src.id, src.label);
      b.setAttribute('aria-label', t('dress.colorOf', { channel: name, color: b.title }));
      b.setAttribute('aria-pressed', String(skin.colors[slot][ch] === src.id));
      b.addEventListener('click', () => {
        const next = { ...skin, colors: JSON.parse(JSON.stringify(skin.colors)) };
        next.colors[slot][ch] = src.id;
        apply(next, true); sfx.tick();
      });
      grp.appendChild(b);
    }
    row.appendChild(grp);
  }
  return row;
}

const nameOf = (n) => nameIn(n);
/** The option of each axis that `scheme` picks: a preset id, or the options joined by `-` in axis order. */
function picksOf(pack, scheme) {
  const preset = pack.presets.find((p) => p.id === scheme);
  const parts = (scheme || '').split('-');
  return Object.fromEntries(pack.axes.map((a, i) => {
    const want = preset ? preset.pick[a.id] : parts[i];
    return [a.id, a.options.some((o) => o.id === want) ? want : a.options[0].id];
  }));
}
/** `skin.scheme` for a set of picks: the preset that picks exactly them, else the options joined. */
function schemeOf(pack, picks) {
  const preset = pack.presets.find((p) => pack.axes.every((a) => p.pick[a.id] === picks[a.id]));
  return preset ? preset.id : pack.axes.map((a) => picks[a.id]).join('-');
}
/**
 * The figure's picture for a set of picks: its preset's, else the picture of the last later axis picked off its first
 * option (the whale's winter outfit: no preset is a scheme in it), else the first axis's pick's, else the pack's own.
 */
const thumbOf = (pack, picks) => {
  const preset = pack.presets.find((p) => p.id === schemeOf(pack, picks));
  const opt = (a) => a?.options.find((o) => o.id === picks[a.id]);
  const other = pack.axes.slice(1).reverse().find((a) => picks[a.id] !== a.options[0]?.id && opt(a)?.thumb);
  const file = preset?.thumb ?? opt(other)?.thumb ?? opt(pack.axes[0])?.thumb ?? pack.thumb;
  return file ? pack.base + file : null;
};

/* ---------- importing figure packs (src/pack-import.ts) ---------- */
// (tests/pet-import.test.js runs the page's code from here to the files of a dropped folder)

/** The page's framing of a folder's files (pack-import.ts BUNDLE_TYPE). */
const BUNDLE_TYPE = 'application/x-figure-files';
const importStyle = document.createElement('style');
importStyle.textContent = `
.opt.import .imp-plus{width:52px; height:52px; display:grid; place-items:center; border-radius:6px; background:var(--swatch-bg); color:var(--muted); font:300 30px/1 system-ui,sans-serif}
.opt.import:hover .imp-plus{color:var(--accent)}
.imp{display:flex; flex-direction:column; gap:10px; padding:12px; border-radius:12px; border:1px solid var(--line); background:var(--surface); font-size:13px}
.imp[hidden]{display:none}
.imp p{margin:0; color:var(--muted); line-height:1.5}
.imp .imp-acts{display:flex; flex-wrap:wrap; gap:8px; align-items:center}
.imp button{font:inherit; cursor:pointer; padding:6px 12px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--text)}
.imp button:hover{border-color:var(--accent)}
.imp button.primary{background:var(--accent); border-color:var(--accent); color:var(--surface); font-weight:600}
.imp button:disabled{opacity:.5; cursor:default}
.imp .imp-pack{display:grid; grid-template-columns:auto 52px 1fr; gap:4px 10px; align-items:start; padding:8px; border-radius:10px; background:var(--bg)}
.imp .imp-pack input{margin-top:4px}
.imp .imp-pack img, .imp .imp-pack .imp-nothumb{width:52px; height:52px; border-radius:6px; object-fit:cover; background:var(--swatch-bg)}
.imp .imp-name{font-weight:600; color:var(--text)}
.imp .imp-meta{color:var(--muted); font-size:12px; line-height:1.5}
.imp .imp-warn{color:#D9822B; font-size:12px; line-height:1.5}
.imp .imp-bad{color:#E5484D; font-size:12px; line-height:1.5}
.imp button.danger{background:var(--anger); border-color:var(--anger); color:#fff; font-weight:600}
.imp .imp-list{margin:0; padding-left:20px; color:var(--text); line-height:1.6}
.imp details{font-size:12px; color:var(--muted)}
body.dress-page.dropping main{outline:2px dashed var(--accent); outline-offset:6px; border-radius:14px}
`;
document.head.append(importStyle);

const importBox = el('div', 'imp');
importBox.hidden = true;
const zipInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.zip,application/zip', hidden: true });
const dirInput = Object.assign(document.createElement('input'), { type: 'file', hidden: true });
dirInput.webkitdirectory = true;
document.body.append(zipInput, dirInput);
/** Whether this copy of the World installs packs (`GET /api/figures/import`), and the most one import may hold. */
let importable = false, importMax = 128 * 1024 * 1024;
fetch('/api/figures/import').then((r) => r.json()).then((d) => { importable = !!d.importable; importMax = d.max ?? importMax; render(); }).catch(() => {});

const line = (tag, cls, text) => { const e = el(tag, cls); e.textContent = text; return e; };
function importShow(...nodes) {
  importBox.textContent = '';
  importBox.append(...nodes);
  importBox.hidden = false;
}
function importClose() {
  importBox.hidden = true;
  importBox.textContent = '';
}
function importStart() {
  const close = el('button', '', null); close.textContent = t('import.fold');
  close.addEventListener('click', () => { importClose(); fetch('/api/figures/import/cancel', { method: 'POST' }).catch(() => {}); });
  const zip = el('button', 'primary', null); zip.textContent = t('import.pickZip');
  zip.addEventListener('click', () => zipInput.click());
  const dir = el('button', '', null); dir.textContent = t('import.pickDir');
  dir.addEventListener('click', () => dirInput.click());
  const acts = el('div', 'imp-acts'); acts.append(zip, dir, close);
  importShow(line('p', '', t('import.lead')), acts);
}
zipInput.addEventListener('change', () => { const f = zipInput.files?.[0]; zipInput.value = ''; if (f) void importZip(f); });
dirInput.addEventListener('change', () => {
  const files = [...(dirInput.files ?? [])].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }));
  dirInput.value = '';
  if (files.length) void importFolder(files);
});

async function importZip(file) {
  if (file.size > importMax) return importFailed(t('import.tooBig', { mb: importMax / 1048576 }));
  await importSend(file, 'application/zip');
}
/** `files`: `{ path, file }`, each path starting with the folder's own name. */
async function importFolder(files) {
  const total = files.reduce((n, f) => n + f.file.size, 0);
  if (total > importMax) return importFailed(t('import.tooBig', { mb: importMax / 1048576 }));
  const enc = new TextEncoder();
  const parts = [];
  for (const { path, file } of files) {
    const name = enc.encode(path);
    const head = new DataView(new ArrayBuffer(4)); head.setUint32(0, name.length, true);
    const size = new DataView(new ArrayBuffer(4)); size.setUint32(0, file.size, true);
    parts.push(head.buffer, name, size.buffer, file);
  }
  await importSend(new Blob(parts), BUNDLE_TYPE);
}
function importFailed(why) {
  const again = el('button', '', null); again.textContent = t('import.again');
  again.addEventListener('click', importStart);
  const acts = el('div', 'imp-acts'); acts.append(again);
  importShow(line('p', 'imp-bad', t('import.failed', { why })), acts);
}
/** Counts the imports sent: the answer to one overtaken by a later one is not shown. */
let importSent = 0;
async function importSend(body, type) {
  const sent = ++importSent;
  importShow(line('p', '', t('import.reading')));
  let out;
  try {
    const r = await fetch('/api/figures/import', { method: 'POST', headers: { 'content-type': type }, body });
    out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  } catch {
    if (sent === importSent) importFailed(t('import.offline'));
    return;
  }
  if (sent !== importSent) return;
  if (out.error) return importFailed(out.error);
  importPick(out);
}
/** The packs found, each with a box to tick (all ticked), and what could not be installed. */
function importPick({ token, packs: found, problems }) {
  const nodes = [];
  const ticks = [];
  for (const p of found) {
    const row = el('label', 'imp-pack');
    const tick = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
    ticks.push([tick, p.dir]);
    // the thumbnail comes as a data URL from the server: set as a property, never written into markup
    const pic = p.thumb && p.thumb.startsWith('data:image/') ? Object.assign(el('img'), { src: p.thumb, alt: '' }) : el('div', 'imp-nothumb');
    const text = el('div');
    text.append(line('div', 'imp-name', `${nameOf(p.name)}  ${p.version}`));
    const by = [p.author && t('import.author', { name: p.author }), ...p.credits.map((c) => t('import.credit', { role: c.role, name: c.name }))].filter(Boolean).join(t('import.creditSep'));
    if (by) text.append(line('div', 'imp-meta', by));
    text.append(line('div', 'imp-meta', t('import.contents', { axes: p.axes, words: p.words, sounds: p.sounds, id: p.id })));
    if (p.installed) text.append(line('div', 'imp-warn', t('import.replaces', { version: p.installed })));
    if (p.skipped.length) {
      const more = el('details');
      more.append(line('summary', '', t('import.skipped', { n: p.skipped.length })));
      for (const s of p.skipped) more.append(line('div', '', s));
      text.append(more);
    }
    row.append(tick, pic, text);
    nodes.push(row);
  }
  for (const q of problems) nodes.push(line('div', 'imp-bad', t('import.problem', { dir: q.dir || t('import.pickedLevel'), reason: q.reason })));
  const cancel = el('button', '', null); cancel.textContent = t('import.cancel');
  cancel.addEventListener('click', () => { importClose(); fetch('/api/figures/import/cancel', { method: 'POST' }).catch(() => {}); });
  const acts = el('div', 'imp-acts');
  if (found.length) {
    const go = el('button', 'primary', null); go.textContent = t('import.install');
    const sync = () => { go.disabled = !ticks.some(([t]) => t.checked); };
    for (const [t] of ticks) t.addEventListener('change', sync);
    go.addEventListener('click', () => {
      go.disabled = true;
      void importInstall(token, found, ticks.filter(([t]) => t.checked).map(([, d]) => d));
    });
    acts.append(go);
  } else {
    const again = el('button', '', null); again.textContent = t('import.again');
    again.addEventListener('click', importStart);
    acts.append(again);
  }
  acts.append(cancel);
  importShow(line('p', '', found.length ? t('import.found', { n: found.length }) : t('import.none')), ...nodes, acts);
}

/**
 * Installs the packs found at `dirs`. One that would replace an installed pack is not installed until the person says
 * yes: the server answers with their ids and keeps the import, and `replace` names them on the second try.
 */
async function importInstall(token, found, dirs, replace = []) {
  let out;
  try {
    const r = await fetch('/api/figures/import/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, dirs, replace }) });
    out = await r.json();
  } catch {
    return importFailed(t('import.offline'));
  }
  if (out.error) return importFailed(out.error);
  if (out.conflicts) return importConfirm(token, found, dirs, out.conflicts);
  const names = out.installed.map((id) => nameOf(found.find((p) => p.id === id)?.name) || id).join(t('import.nameSep'));
  const done = line('p', '', t('import.done', { names }));
  importShow(done);
  // the pack on screen was replaced: the preview loads its new files
  const worn = out.installed.includes(skin.figure);
  if (worn) { body?.dispose(); body = null; }
  await loadPacks();
  if (worn) void showFigure(skin);
  sfx.sparkle();
  // the note folds away by itself unless something else has taken the box since
  setTimeout(() => { if (!importBox.hidden && importBox.firstChild === done) importClose(); }, 6000);
}
/** Asks before replacing the installed packs `conflicts`; cancelling keeps them and drops the import. */
function importConfirm(token, found, dirs, conflicts) {
  const list = el('ul', 'imp-list');
  for (const id of conflicts) {
    const p = found.find((x) => x.id === id);
    list.append(line('li', '', p ? `${nameOf(p.name)} (${id})` : id));
  }
  const cancel = el('button', '', null); cancel.textContent = t('import.cancel');
  cancel.addEventListener('click', () => { importClose(); fetch('/api/figures/import/cancel', { method: 'POST' }).catch(() => {}); });
  const go = el('button', 'danger', null); go.textContent = t('import.replace');
  go.addEventListener('click', () => { go.disabled = true; void importInstall(token, found, dirs, conflicts); });
  const acts = el('div', 'imp-acts'); acts.append(go, cancel);
  importShow(line('p', 'imp-name', t('import.replaceTitle')), line('p', '', t('import.replaceText')), list, acts);
}

/* ---------- uninstalling figure packs ---------- */

/** The trash button in the corner of an installed pack's tile, shown while the tile is hovered or focused; it asks first. */
function removeButton(pack) {
  const b = el('button', 'pack-erase', ICONS.trash);
  b.type = 'button';
  b.title = t('remove.label', { name: nameOf(pack.name) });
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', () => { sfx.tick(); removeAsk(pack); });
  return b;
}
function removeAsk(pack) {
  const cancel = el('button', '', null); cancel.textContent = t('import.cancel');
  cancel.addEventListener('click', importClose);
  const go = el('button', 'danger', null); go.textContent = t('remove.go');
  go.addEventListener('click', () => { go.disabled = true; void removePack(pack); });
  const acts = el('div', 'imp-acts'); acts.append(go, cancel);
  importShow(line('p', 'imp-name', t('remove.title', { name: nameOf(pack.name) })), line('p', '', t('remove.lead')), acts);
}
async function removePack(pack) {
  let out;
  try {
    const r = await fetch('/api/figures/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pack.id }) });
    out = await r.json();
  } catch {
    out = { error: t('import.offline') };
  }
  if (out.error) {
    const close = el('button', '', null); close.textContent = t('import.fold');
    close.addEventListener('click', importClose);
    const acts = el('div', 'imp-acts'); acts.append(close);
    return importShow(line('p', 'imp-bad', t('remove.failed', { why: out.error })), acts);
  }
  // the pet wearing it changes back to Coo
  if (skin.figure === pack.id) apply({ ...skin, figure: 'coo' }, true);
  const done = line('p', '', t('remove.done', { name: nameOf(pack.name) }));
  importShow(done);
  await loadPacks();
  setTimeout(() => { if (!importBox.hidden && importBox.firstChild === done) importClose(); }, 6000);
}

/** The files under a dropped folder, each path starting with the folder's name. */
async function entryFiles(entry, prefix = '') {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) return [{ path, file: await new Promise((ok, fail) => entry.file(ok, fail)) }];
  const reader = entry.createReader();
  const out = [];
  for (;;) {
    const batch = await new Promise((ok, fail) => reader.readEntries(ok, fail));
    if (!batch.length) break;
    for (const e of batch) out.push(...await entryFiles(e, path));
  }
  return out;
}
const dragsFiles = (e) => importable && [...(e.dataTransfer?.types ?? [])].includes('Files');
document.addEventListener('dragover', (e) => { if (!dragsFiles(e)) return; e.preventDefault(); document.body.classList.add('dropping'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', async (e) => {
  document.body.classList.remove('dropping');
  if (!dragsFiles(e)) return;
  e.preventDefault();
  const entry = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).find(Boolean);
  if (entry?.isDirectory) {
    importShow(line('p', '', t('import.readingFolder')));
    try { await importFolder(await entryFiles(entry)); } catch (err) { importFailed(err?.message ?? String(err)); }
    return;
  }
  const file = e.dataTransfer.files[0];
  if (file && /\.zip$/i.test(file.name)) void importZip(file);
  else if (file) importFailed(t('import.zipOnly'));
});

function renderFigure() {
  $('#dress').dataset.figure = skin.figure === 'coo' ? 'coo' : 'pack';
  const box = $('#optFigure');
  box.textContent = '';
  const opts = el('div', 'opts');
  // a pack's picture is built as a node, never written into markup: its path comes from the pack's manifest
  const choices = [{ id: 'coo', label: 'Coo', svg: `<svg viewBox="${CROP.palette}" aria-hidden="true">${mini('neutral', skin)}</svg>` },
    ...packs.filter((p) => p.id !== 'coo').map((p) => ({ id: p.id, label: nameOf(p.name), thumb: thumbOf(p, picksOf(p, skin.figure === p.id ? skin.scheme : '')) }))];
  for (const c of choices) {
    const b = el('button', 'opt wide figure', c.svg);
    b.setAttribute('aria-pressed', String(skin.figure === c.id));
    if (c.thumb) Object.assign(b.appendChild(el('img')), { src: c.thumb, alt: '' });
    b.appendChild(el('span')).textContent = c.label;
    b.addEventListener('click', () => {
      if (skin.figure === c.id) return;
      const pack = packs.find((p) => p.id === c.id);
      apply({ ...skin, figure: c.id, ...(pack && c.id !== 'coo' ? { scheme: schemeOf(pack, picksOf(pack, '')) } : {}) }, true);
      sfx.sparkle(); body?.cue('cheer');
    });
    const pack = packs.find((p) => p.id === c.id);
    if (pack?.removable) {
      const tile = opts.appendChild(el('span', 'figure-tile'));
      tile.append(b, removeButton(pack));
    } else opts.appendChild(b);
  }
  if (importable) {
    const b = el('button', 'opt wide figure import');
    b.title = t('import.buttonTitle');
    b.appendChild(el('div', 'imp-plus')).textContent = '+';
    b.appendChild(el('span')).textContent = t('import.button');
    b.addEventListener('click', () => { if (importBox.hidden) importStart(); else importClose(); });
    opts.appendChild(b);
  }
  box.append(opts, importBox);
  // a row per axis of the pack on, after the figure row; Coo's own rows are below
  for (const old of document.querySelectorAll('.pack-axis')) old.remove();
  const pack = skin.figure === 'coo' ? null : packs.find((p) => p.id === skin.figure);
  if (!pack) return;
  const picks = picksOf(pack, skin.scheme);
  let after = box;
  for (const axis of pack.axes) {
    const label = el('div', 'row-label pack-axis');
    label.id = `lbAxis-${axis.id}`;
    label.textContent = nameOf(axis.name);
    const slot = el('div', 'slot pack-axis');
    slot.setAttribute('role', 'group');
    slot.setAttribute('aria-labelledby', label.id);
    const list = el('div', 'opts');
    for (const o of axis.options) {
      const b = el('button', 'opt wide');
      b.setAttribute('aria-pressed', String(picks[axis.id] === o.id));
      if (o.thumb) Object.assign(b.appendChild(el('img')), { src: pack.base + o.thumb, alt: '' });
      b.appendChild(el('span')).textContent = nameOf(o.name);
      b.addEventListener('click', () => {
        apply({ ...skin, scheme: schemeOf(pack, { ...picks, [axis.id]: o.id }) }, true);
        sfx.sparkle(); body?.cue('cheer'); body?.cue('bounce');
      });
      list.appendChild(b);
    }
    slot.appendChild(list);
    after.after(label, slot);
    after = slot;
  }
}

function render() {
  renderFigure();
  const pal = $('#optPalette');
  pal.textContent = '';
  const palOpts = el('div', 'opts');
  for (const p of PALETTES) {
    const b = el('button', 'opt swatch');
    b.setAttribute('aria-pressed', String(skin.palette === p.id));
    b.innerHTML = `<svg viewBox="${CROP.palette}" aria-hidden="true" style="--sl-ink:${p.l[0]};--sl-eye:${p.l[1]};--sd-ink:${p.d[0]};--sd-eye:${p.d[1]}">${mini('neutral', { ...skin, head: 'none', side: 'none', glasses: 'none', neck: 'none' })}</svg><span></span>`;
    b.querySelector('span').textContent = cooLabel('palette', p.id, p.label);
    b.addEventListener('click', () => { apply({ ...skin, palette: p.id }, true); sfx.sparkle(); body?.cue('cheer'); });
    palOpts.appendChild(b);
  }
  pal.appendChild(palOpts);
  for (const [slot, list, sel] of [['head', HEADS, '#optHead'], ['side', SIDES, '#optSide'], ['glasses', GLASSES, '#optGlasses'], ['neck', NECKS, '#optNeck']]) {
    const box = $(sel);
    box.textContent = '';
    const opts = el('div', 'opts');
    for (const [id, label] of list) {
      const b = el('button', 'opt');
      b.setAttribute('aria-pressed', String(skin[slot] === id));
      b.innerHTML = `<svg viewBox="${CROP[slot]}" aria-hidden="true">${mini('neutral', { ...skin, [slot]: id })}</svg><span></span>`;
      b.querySelector('span').textContent = cooLabel(slot, id, label);
      b.addEventListener('click', () => {
        apply(wear(skin, slot, id), true);
        sfx.pop(); if (id !== 'none') { sfx.sparkle(); body?.cue('cheer'); }
        body?.cue('bounce');
      });
      opts.appendChild(b);
    }
    box.appendChild(opts);
    if (skin[slot] !== 'none') box.appendChild(colorRow(slot, skin[slot]));
  }
}

/** Shows the page in the app language `code` (from the World); a change redraws the text already on the page. */
function useLanguage(code) {
  if (!setLanguage(code)) return;
  document.title = t('dress.title');
  applyText();
  applyTheme(theme, modeBtn);
  $('#saved').textContent = '';
  render();
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/socket?role=dress`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'init' || m.t === 'prefs') useLanguage(m.language);
    if ((m.t === 'init' || m.t === 'prefs') && (m.theme === 'dark' || m.theme === 'light') && m.theme !== theme) { theme = m.theme; applyTheme(theme, modeBtn); body?.set({ theme }); }
    if (m.t === 'init') loadPacks();
    if ((m.t === 'init' || m.t === 'prefs') && m.skin && JSON.stringify(normalizeSkin(m.skin)) !== JSON.stringify(skin)) apply(normalizeSkin(m.skin), false);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
// the language before the first drawing, so an English page does not show Chinese first
await fetch('/api/state').then((r) => r.json()).then((s) => useLanguage(s.language)).catch(() => {});
connect();
apply(skin, false);

let last = performance.now();
/** The last error the frame loop logged, so one that keeps recurring is reported once, not per frame. */
let frameErr = null;
function frame(now) {
  // a timestamp behind the last one (the first frame's may be) counts as no time
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;
  try {
    T += dt;
    body?.tick(dt);
    preview.style.cursor = body?.layout?.cursor ?? '';
  } catch (err) {
    // a throwing step must not take the loop with it: the next frame is only asked for below, and
    // without it the preview freezes for good (a broken figure throws again on every frame it draws)
    const msg = err?.message ?? String(err);
    if (msg !== frameErr) { frameErr = msg; console.error(err); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
