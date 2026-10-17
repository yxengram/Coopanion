/**
 * Connecting a service through a Cortico console's provider routes, as the app's guide and its
 * Start page do: each service gets its own endpoint, named by the service's id, so switching back
 * and forth keeps each key. `call` is the caller's way to reach the console (fetch in the Core, the
 * console's own api in the browser); nothing here imports Node or the DOM.
 */
import { vendorById, vendorEntry, vendorOf, type Vendor } from './vendors.ts';

/** GET when `body` is left out, POST otherwise; throws on an error status. */
export type ConsoleCall = <T>(path: string, body?: unknown) => Promise<T>;

export interface Connection {
  /** The active endpoint has its model and key and its module is available. */
  ready: boolean;
  /** Which service the active endpoint is, when it is one of these. */
  vendor: Vendor | null;
  model: string;
}

export interface ConnectResult { ok: boolean; why: string | null; ms: number | null }

interface Status { modelConnection?: { ready: boolean; model: string | null; baseUrl?: string } | null }
interface Detail { name: string; entry: Record<string, unknown>; revision: string }
interface TestReply { ok?: boolean; elapsedMs?: number; error?: string; status?: number; hint?: string }

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * What this file says to the person, in Chinese and English. `language` is Cortico's `Language`: zh and zh-Hant
 * read the Chinese, every other language the English (this file imports nothing, so the rule is written out).
 */
export const CONNECT_TEXT = {
  zh: { geminiBadKey: 'Gemini 回了 HTTP 400,多半是 Key 不对(也可能是模型名不对)', emptyKey: '密钥是空的' },
  en: { geminiBadKey: 'Gemini answered HTTP 400: most likely the key is wrong (or the model name)', emptyKey: 'The key is empty' },
};
const text = (language: string) => (language === 'zh' || language === 'zh-Hant' ? CONNECT_TEXT.zh : CONNECT_TEXT.en);

export async function currentConnection(call: ConsoleCall): Promise<Connection> {
  const mc = (await call<Status>('/api/status').catch(() => null))?.modelConnection;
  return { ready: !!mc?.ready, vendor: mc?.baseUrl ? vendorOf(mc.baseUrl) : null, model: mc?.model ?? '' };
}

/**
 * The Gemini API answers a wrong key with 400 (API_KEY_INVALID), not 401, so the console's test gives
 * no hint for it; at the service's own endpoint a 400 to the test's one-word request is most likely the key.
 */
function geminiHint(name: string, r: TestReply | undefined, language: string): string | undefined {
  return r?.status === 400 && vendorById(name)?.protocol === 'gemini' ? text(language).geminiBadKey : undefined;
}

/** Tests the endpoint `name` as it is saved; this file's own words in `why` are in `language`. */
export async function testEndpoint(call: ConsoleCall, name: string, language = 'zh'): Promise<ConnectResult> {
  try {
    const r = await call<TestReply>(`/api/providers/${encodeURIComponent(name)}/test`, {});
    const ok = r?.ok !== false && !r?.error;
    return { ok, ms: typeof r?.elapsedMs === 'number' ? Math.round(r.elapsedMs) : null, why: ok ? null : r?.hint ?? geminiHint(name, r, language) ?? r?.error ?? `HTTP ${r?.status ?? '?'}` };
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
}

/**
 * Saves `key` and `model` for `vendor` (creating its endpoint the first time), tests it, and once
 * the test passes makes it the active endpoint and resumes the run, which starts paused without a
 * key. An empty `key` keeps the one the endpoint has; a new endpoint needs one. An empty `model`
 * keeps the endpoint's model, or takes the service's default for a new endpoint. `language` as for `testEndpoint`.
 */
export async function connectVendor(call: ConsoleCall, vendor: Vendor, key: string, model = '', language = 'zh'): Promise<ConnectResult> {
  const secretValue = key.trim() || undefined;
  const name = model.trim();
  try {
    const list = await call<{ providers: Array<{ name: string }> }>('/api/providers');
    if (list.providers.some((p) => p.name === vendor.id)) {
      const d = await call<Detail>(`/api/providers/${encodeURIComponent(vendor.id)}`);
      const entry = { ...d.entry };
      if (name) {
        entry.spec = { ...(d.entry.spec as Record<string, unknown> | undefined), model: name };
        entry.multimodal = (vendor.vision ?? []).includes(name);
      }
      await call(`/api/providers/${encodeURIComponent(vendor.id)}/save`, { name: d.name, entry, expectedRevision: d.revision, secretValue });
    } else {
      await call('/api/providers', { name: vendor.id, entry: vendorEntry(vendor, name || vendor.model), secretValue });
    }
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
  const r = await testEndpoint(call, vendor.id, language);
  if (!r.ok) return r;
  try {
    await call(`/api/providers/${encodeURIComponent(vendor.id)}/activate`, {});
    await call('/api/run/resume', {});
  } catch (err) {
    return { ok: false, ms: r.ms, why: errText(err) };
  }
  return r;
}

/**
 * Saves `key` for `vendor`'s endpoint without making it the active one: the endpoint is created the first time
 * (with the service's default model), otherwise only its key is replaced. For a key another part of the app reads
 * (the desktop pet's decider mode reads OpenRouter's): the chat model stays as it is. The key goes where the
 * console keeps every endpoint's key (its `.env`), nowhere else. `language` as for `testEndpoint`.
 */
export async function saveVendorKey(call: ConsoleCall, vendor: Vendor, key: string, language = 'zh'): Promise<{ ok: boolean; why: string | null }> {
  const secretValue = key.trim();
  if (!secretValue) return { ok: false, why: text(language).emptyKey };
  try {
    const list = await call<{ providers: Array<{ name: string }> }>('/api/providers');
    if (list.providers.some((p) => p.name === vendor.id)) {
      const d = await call<Detail>(`/api/providers/${encodeURIComponent(vendor.id)}`);
      await call(`/api/providers/${encodeURIComponent(vendor.id)}/save`, { name: d.name, entry: d.entry, expectedRevision: d.revision, secretValue });
    } else {
      await call('/api/providers', { name: vendor.id, entry: vendorEntry(vendor), secretValue });
    }
    return { ok: true, why: null };
  } catch (err) {
    return { ok: false, why: errText(err) };
  }
}
