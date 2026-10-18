/**
 * Connecting a service through a Cortico console's provider routes, as the app's guide and its
 * Start page do: each service gets its own endpoint, named by the service's id, so switching back
 * and forth keeps each key. A ChatGPT plan is signed in instead (`connectChatGPT`), through the `chatgpt` module's
 * WebUI panel methods. `call` is the caller's way to reach the console (fetch in the Core, the
 * console's own api in the browser); nothing here imports Node or the DOM.
 */
import { CHATGPT, CHATGPT_MODULE, chatgptEntry, connectionVendor, vendorById, vendorEntry, type Vendor } from './vendors.ts';

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

interface Status { modelConnection?: { ready: boolean; model: string | null; module?: string; baseUrl?: string } | null }
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
  return { ready: !!mc?.ready, vendor: connectionVendor(mc), model: mc?.model ?? '' };
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
  return testAndStart(call, vendor.id, language);
}

/** Tests the endpoint `name` and, once the test passes, makes it the active endpoint and resumes the run. */
async function testAndStart(call: ConsoleCall, name: string, language: string): Promise<ConnectResult> {
  const r = await testEndpoint(call, name, language);
  if (!r.ok) return r;
  try {
    await call(`/api/providers/${encodeURIComponent(name)}/activate`, {});
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

/** A ChatGPT endpoint's sign-in as its `state` method reports it (`SignInStatus` in chatgpt/auth.ts). */
export interface SignInState {
  signedIn: boolean;
  email: string | null;
  phase: 'idle' | 'waiting' | 'done' | 'failed';
  /** Why the last sign-in failed: a code (`signInReason` in strings.ts words the known ones). */
  reason: string | null;
  /** The plan's models, once a sign-in is done. */
  models?: string[];
}

/** The WebUI panel of the `chatgpt` module's sign-in methods. */
export const SIGN_IN_PANEL = 'chatgpt';

/**
 * The panel is declared as this built-in WebUI panel (it ships no browser bundle): the app's settings window
 * registers the sign-in row under the name (console/features/chatgpt), and Cortico's endpoint editor draws it.
 */
export const CHATGPT_BUILTIN_PANEL = 'coopanion-chatgpt';

/** The WebUI route of a sign-in method of the `chatgpt` module. */
const signInRoute = (method: string) => `/api/webui/providers/${encodeURIComponent(`llm:${CHATGPT_MODULE}`)}/panels/${SIGN_IN_PANEL}/${method}`;

export const chatgptState = (call: ConsoleCall, name: string) => call<SignInState>(signInRoute('state'), { args: [name] });

/** Revokes and removes the tokens of the ChatGPT endpoint `name`. */
export const signOutChatGPT = (call: ConsoleCall, name: string) => call<SignInState>(signInRoute('signOut'), { args: [name] });

/** How often a sign-in under way is looked at. */
const SIGN_IN_POLL_MS = 1000;

/** What an aborted wait for the browser throws, and `connectChatGPT` gives as `why`. */
export const SIGN_IN_CANCELLED = 'cancelled';

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((done, fail) => {
  if (signal?.aborted) return fail(new Error(SIGN_IN_CANCELLED));
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); fail(new Error(SIGN_IN_CANCELLED)); }, { once: true });
});

export interface SignInOptions { signal?: AbortSignal; pollMs?: number }

/**
 * Signs the saved ChatGPT endpoint `name` in: `open` takes the authorization URL to the system
 * browser, and the sign-in is looked at until the browser comes back, it fails or times out
 * (`SIGN_IN_MS` in chatgpt/auth.ts), or `signal` aborts the wait (which throws `SIGN_IN_CANCELLED`). An aborted
 * wait also ends that sign-in in the Core (panel method `cancel`), so its callback port closes and a browser
 * that comes back later signs nothing in; a signal already aborted when the URL arrives opens no browser.
 */
export async function signInChatGPT(call: ConsoleCall, name: string, open: (url: string) => void, opts: SignInOptions = {}): Promise<SignInState> {
  const { url } = await call<{ url: string }>(signInRoute('signIn'), { args: [name] });
  try {
    if (opts.signal?.aborted) throw new Error(SIGN_IN_CANCELLED);
    open(url);
    let state: SignInState;
    do {
      await wait(opts.pollMs ?? SIGN_IN_POLL_MS, opts.signal);
      state = await chatgptState(call, name);
    } while (state.phase === 'waiting');
    return state;
  } catch (err) {
    if (opts.signal?.aborted) await call(signInRoute('cancel'), { args: [name, url] }).catch(() => {});
    throw err;
  }
}

/**
 * The endpoint name `connectChatGPT` uses: `wanted` when it is free or already a ChatGPT endpoint; otherwise
 * (an endpoint of another kind took the name, say a custom one named `chatgpt`) the first ChatGPT endpoint named
 * `<wanted>-<n>`, else the first free such name.
 */
export function chatgptName(providers: ReadonlyArray<{ name: string; module?: string }>, wanted: string = CHATGPT_MODULE): string {
  const kindOf = (name: string) => providers.find((p) => p.name === name)?.module;
  const usable = (name: string) => { const kind = kindOf(name); return kind === undefined || kind === CHATGPT_MODULE; };
  if (usable(wanted)) return wanted;
  const suffix = (n: string) => (n.startsWith(`${wanted}-`) && /^[1-9]\d*$/.test(n.slice(wanted.length + 1)) ? Number(n.slice(wanted.length + 1)) : 0);
  const own = providers.map((p) => p.name).filter((n) => suffix(n) > 0 && kindOf(n) === CHATGPT_MODULE);
  if (own.length) return own.sort((a, b) => suffix(a) - suffix(b))[0]!;
  for (let n = 2; ; n++) if (!providers.some((p) => p.name === `${wanted}-${n}`)) return `${wanted}-${n}`;
}

/**
 * Signs the ChatGPT endpoint `name` (`chatgpt` unless given; `chatgptName` when an endpoint of another kind has it) in (`signInChatGPT`), creating it the first time,
 * and once it is in and its test passes makes it active and resumes the run. When the plan's model list leaves
 * out the endpoint's model, the endpoint takes the first model it lists. `language` as for `testEndpoint`.
 */
export async function connectChatGPT(call: ConsoleCall, open: (url: string) => void, opts: SignInOptions & { name?: string; language?: string } = {}): Promise<ConnectResult> {
  let name = opts.name ?? CHATGPT_MODULE;
  try {
    const list = await call<{ providers: Array<{ name: string; module?: string }> }>('/api/providers');
    name = chatgptName(list.providers, name);
    if (!list.providers.some((p) => p.name === name)) await call('/api/providers', { name, entry: chatgptEntry() });
    const state = await signInChatGPT(call, name, open, opts);
    if (state.phase !== 'done' || !state.signedIn) return { ok: false, ms: null, why: state.reason ?? state.phase };
    const first = state.models?.[0];
    if (first) {
      const d = await call<Detail>(`/api/providers/${encodeURIComponent(name)}`);
      const spec = d.entry.spec as Record<string, unknown> | undefined;
      if (!state.models!.includes(String(spec?.model ?? ''))) {
        const entry = { ...d.entry, spec: { ...spec, model: first }, multimodal: (CHATGPT.vision ?? []).includes(first) };
        await call(`/api/providers/${encodeURIComponent(name)}/save`, { name: d.name, entry, expectedRevision: d.revision });
      }
    }
  } catch (err) {
    return { ok: false, ms: null, why: errText(err) };
  }
  return testAndStart(call, name, opts.language ?? 'zh');
}
