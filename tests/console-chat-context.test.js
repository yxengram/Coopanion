// @vitest-environment jsdom
/**
 * The chat page (console/features/chat, read from its staged place in build/cortico: run `pnpm run build:cortico`
 * after changing it): the context ring in the composer (upstream #318) is full where Coo's Persona asks for the
 * handoff, filled by the count `/api/status` reports and spinning while a handoff runs, as the phase line says;
 * addresses in Coo's lines and questions are links (#297); and the unsent text outlives leaving the page (#256).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cormini, CORMINI_CONTEXT_DEFAULTS } from '../vendor/cortico/bots/cormini/persona/persona.ts';

const CLIENT = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'cortico', 'src', 'web', 'client').replaceAll('\\', '/')}/`;
const STAGED = existsSync(`${CLIENT}features/chat/context.ts`);

/**
 * Coo's own context policy, as /api/status reports it: core/companion.ts cooContext over Cormini's (pinned to these
 * two values in tests/coo-context-defaults.test.ts; core/companion.ts itself does not load under jsdom).
 */
const policy = { ...CORMINI_CONTEXT_DEFAULTS, maxTokens: 128_000, keepRatio: 0.25 };
const statusAt = (estTokens, hardTokens = null, lastTruncateAt = null) => ({
  loop: { estTokens, lastTruncateAt, context: { hardTokens } },
  context: { maxTokens: policy.maxTokens, softRatio: policy.softRatio },
});

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

class FakeSocket {
  static last = null;
  readyState = 0; onopen = null; onclose = null; onerror = null; onmessage = null;
  sent = [];
  constructor(url) { this.url = url; FakeSocket.last = this; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  frame(f) { this.onmessage?.({ data: JSON.stringify(f) }); }
}

const settle = () => new Promise((r) => setTimeout(r, 30));
let status;
let statusReads;

async function mountChat(language) {
  const [{ createWebUi }, { Lifecycle }, chat] = await load(language, 'ui/index.ts', 'core/lifecycle.ts', 'features/chat/index.ts');
  const lifecycle = new Lifecycle((err) => { throw err; });
  const root = document.createElement('div');
  document.body.append(root);
  const ui = createWebUi({ memo: { get: (_k, d) => d, set: () => {} }, overlayHost: document.body, signal: lifecycle.signal, doc: document });
  const router = { route: { segments: ['chat'] }, navigate: () => {}, replace: () => {} };
  await chat.chatFeature.mount({ root, lifecycle, signal: lifecycle.signal, ui, router, route: router.route, capabilities: {}, onError: (err) => { throw err; }, refreshNav: () => {} });
  const socket = FakeSocket.last;
  socket.open();
  await settle();
  return { root, lifecycle, socket, chat, ring: root.querySelector('.chat-ctx') };
}
const init = (socket, items = []) => socket.frame({ t: 'init', bot: 'Coo', paused: false, more: false, before: null, imagesSeen: true, phase: { state: 'idle', running: [] }, activity: null, pending: [], items });

it("is full where Coo's Persona asks for the handoff, or at the model's input limit when that is lower", async () => {
  if (!STAGED && !process.env.CI) return;
  const [{ contextGauge }] = await load('zh', 'features/chat/context.ts');
  const dir = mkdtempSync(join(tmpdir(), 'coo-ring-'));
  try {
    const persona = new Cormini({ memoryDir: dir, context: () => policy });
    let estTokens = 0;
    let asked = 0;
    const notes = [];
    persona.attach({
      sessionInfo: (id) => ({ id, running: 0, snapshot: null, estTokens, hardTokens: null }),
      injectInternal: (text) => { notes.push(text); },
      requestContextHandoff: () => { asked++; return true; },
    });
    const full = contextGauge(statusAt(0)).handoffAt;
    expect(full).toBe(policy.maxTokens * policy.softRatio);
    estTokens = Math.floor(full);
    persona.onBatchEnd();
    persona.onBatchEnd();
    expect([asked, notes.length]).toEqual([0, 0]);
    estTokens = Math.floor(full) + 1;
    // the first batch end past the mark reminds Coo to take notes, the next asks for the handoff
    persona.onBatchEnd();
    expect([asked, notes.length]).toEqual([0, 1]);
    persona.onBatchEnd();
    expect(asked).toBe(1);

    expect(contextGauge(statusAt(0, full - 1000)).handoffAt).toBe(full - 1000);
    expect(contextGauge({ loop: { estTokens: null } })).toBeNull();
    expect(contextGauge({ loop: { estTokens: 5 } })).toEqual({ tokens: 5, handoffAt: null, lastAt: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe.skipIf(!STAGED && !process.env.CI)('the chat page', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    window.WebSocket = FakeSocket;
    statusReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      if (path === '/api/status') { statusReads++; return new Response(JSON.stringify(status), { headers: { 'content-type': 'application/json' } }); }
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); delete window.WebSocket; });

  it.each([
    ['zh', '约 33k / 109k token', '到 109k 时整理之前的对话', '上次整理:'],
    ['en', 'About 33k / 109k tokens', 'The earlier conversation is tidied up at 109k', 'Last tidied up: '],
  ])('(%s) the ring fills with the reported count, spins during a handoff and says when it last happened', async (language, used, limit, last) => {
    const full = policy.maxTokens * policy.softRatio;
    status = statusAt(Math.round(full * .3));
    const { root, socket, ring, lifecycle, chat } = await mountChat(language);
    // in the composer, beside the send button
    expect(root.querySelector('.prompt-input-host')?.contains(ring)).toBe(true);
    await vi.waitFor(() => expect(ring.hidden).toBe(false));
    expect(Number.parseFloat(ring.style.getPropertyValue('--fill'))).toBeCloseTo(30, 0);
    expect(ring.getAttribute('aria-label')).toBe(`${used} · ${limit}`);
    init(socket);
    expect(ring.dataset.state).toBe('idle');

    const reads = statusReads;
    socket.frame({ t: 'phase', phase: { state: 'handoff', running: [] } });
    expect(ring.dataset.state).toBe('busy');
    expect(ring.getAttribute('aria-label')).toBe(chat.TEXT[language].handoff);
    expect(root.querySelector('.chat-phase').textContent).toBe(chat.TEXT[language].handoff);
    // each phase change reads the count again
    await vi.waitFor(() => expect(statusReads).toBeGreaterThan(reads));

    status = statusAt(1000, null, '2026-10-22T15:30:00.000+08:00');
    socket.frame({ t: 'phase', phase: { state: 'idle', running: [] } });
    await vi.waitFor(() => expect(ring.getAttribute('aria-label')).toContain(last));
    // the time in the app language, whatever the system's
    const stamp = new Date('2026-10-22T15:30:00.000+08:00').toLocaleString(language === 'zh' ? 'zh-CN' : 'en', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    expect(ring.getAttribute('aria-label')).toContain(`${last}${stamp}`);
    expect(ring.dataset.state).toBe('idle');
    expect(Number.parseFloat(ring.style.getPropertyValue('--fill'))).toBeLessThan(1);
    // hovering shows the same lines in the tooltip
    ring.dispatchEvent(new Event('pointerenter'));
    const tip = root.querySelector('.chat-ctx-tip');
    expect(tip.classList.contains('hidden')).toBe(false);
    expect(tip.querySelector('b').textContent).toBe(language === 'zh' ? '约 1k / 109k token' : 'About 1k / 109k tokens');
    lifecycle.dispose();
  });

  it('keeps the ring hidden until Core reports a count', async () => {
    status = { loop: { estTokens: null } };
    const { ring, lifecycle } = await mountChat('zh');
    await vi.waitFor(() => expect(statusReads).toBeGreaterThan(0));
    await settle();
    expect(ring.hidden).toBe(true);
    lifecycle.dispose();
  });

  it("makes written-out addresses in Coo's lines and questions links", async () => {
    status = statusAt(10);
    const { root, socket, lifecycle } = await mountChat('zh');
    init(socket, [
      { kind: 'say', cursor: 1, ts: '', beats: [{ text: '来 https://github.com/Pal-AI-Lab/Coopanion 点星' }] },
      { kind: 'ask', cursor: 2, ts: '', askId: 'a', question: '看过 https://example.com/x 吗?', options: ['看过'], own: false },
    ]);
    const links = [...root.querySelectorAll('.pet-bubble a')].map((a) => [a.getAttribute('href'), a.target, a.rel, a.textContent]);
    expect(links).toEqual([
      ['https://github.com/Pal-AI-Lab/Coopanion', '_blank', 'noopener noreferrer', 'https://github.com/Pal-AI-Lab/Coopanion'],
      ['https://example.com/x', '_blank', 'noopener noreferrer', 'https://example.com/x'],
    ]);
    expect(root.querySelector('.pet-bubble.say').textContent).toBe('来 https://github.com/Pal-AI-Lab/Coopanion 点星');
    lifecycle.dispose();
  });

  it('keeps unsent text across leaving the page, and drops it once sent', async () => {
    status = statusAt(10);
    const first = await mountChat('zh');
    init(first.socket);
    const box = first.root.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, '说了一半');
    box.dispatchEvent(new Event('input', { bubbles: true }));
    const { DRAFT_KEY } = first.chat;
    expect(localStorage.getItem(DRAFT_KEY)).toBe('说了一半');
    first.lifecycle.dispose();
    document.body.replaceChildren();

    const again = await mountChat('zh');
    init(again.socket);
    await vi.waitFor(() => expect(again.root.querySelector('textarea').value).toBe('说了一半'));
    again.root.querySelector('form').requestSubmit();
    await settle();
    expect(again.socket.sent.find((m) => m.t === 'send')).toMatchObject({ text: '说了一半' });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    again.lifecycle.dispose();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('keeps text put back into the box (a withdrawn message) when the page goes', async () => {
    status = statusAt(10);
    const first = await mountChat('en');
    init(first.socket);
    first.socket.frame({ t: 'item', item: { kind: 'user', cursor: 5, ts: '', via: 'chat', text: 'take this back' }, pending: true });
    first.socket.frame({ t: 'withdrawn', cursor: 5 });
    await vi.waitFor(() => expect(first.root.querySelector('textarea').value).toBe('take this back'));
    first.lifecycle.dispose();
    expect(localStorage.getItem(first.chat.DRAFT_KEY)).toBe('take this back');
  });
});
