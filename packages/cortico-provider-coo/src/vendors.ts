/**
 * The model services Coo Pet Provider offers, DeepSeek first. The Chinese services and OpenRouter,
 * OpenAI and xAI are OpenAI-compatible Responses endpoints; Anthropic is the Messages API and Gemini
 * the Gemini API (`protocol`).
 * `id` doubles as the name of the service's endpoint in the app, and `secret` as the name its key is
 * stored under. Cortico reads a secret from the process environment before the endpoint's `.env`, so
 * OpenAI, Anthropic, Gemini and xAI take `COO_`-prefixed names: a developer's own `OPENAI_API_KEY` (or
 * `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`) in the shell Coopanion starts from would
 * otherwise replace the key pasted in the app. Base URLs, starting models, key pages, image input,
 * context windows and thinking levels are from each service's own documentation (the Chinese services
 * and OpenRouter read 2026-09-24; OpenAI, Anthropic, Gemini and xAI as upstream Coopanion read them,
 * 2026-10-08/09); none of the services but DeepSeek has been tried with a key here (upstream has
 * tried Anthropic).
 *
 * A ChatGPT plan (`CHATGPT`) is connected by signing in with the account instead of with a key: its endpoint is the
 * `chatgpt` module's (`chatgpt/index.ts`), at OpenAI's base URL, so it is kept out of `VENDORS` (which `vendorOf`
 * reads by base URL) and found by its module (`connectionVendor`, `endpointVendor`).
 *
 * This file imports nothing, so the browser console and the app's first-run seed can use it.
 */

/** The four thinking levels the provider offers; see `TIERS` in index.ts. */
export type Effort = 'none' | 'low' | 'high' | 'max';

/** The effort value a service takes for each level where it differs; null leaves the effort out. */
export type EffortMap = Partial<Record<Effort, string | null>>;

/**
 * How requests are sent: `responses` is `POST <baseUrl>/responses`, `anthropic` is the Messages API
 * at `<baseUrl>/v1/messages` (through `@anthropic-ai/sdk`), `gemini` is the Gemini API at
 * `<baseUrl>/models/<model>:generateContent`.
 */
export type Protocol = 'responses' | 'anthropic' | 'gemini';

export interface Vendor {
  id: string;
  /** Shown to the person: `name` in Chinese, `nameEn` in every other language (`vendorName`). */
  name: string;
  nameEn: string;
  /** The path before `/responses`. */
  baseUrl: string;
  /** Where a key is created. */
  keyUrl: string;
  /** Placeholder of the key box: how the service's keys start; in Chinese where it is words (`vendorKeyHint`). */
  keyHint: string;
  secret: string;
  /** The model a new endpoint starts with: the service's cheapest current model that reads images. */
  model: string;
  /** Other model names offered next to `model` where one is typed; any name the service takes works. */
  models?: readonly string[];
  /** Models that read images: creating an endpoint, or typing its model in the normal mode, marks it multimodal exactly when the model is listed here. */
  vision?: readonly string[];
  /** Context windows the service states, where `GET /models` does not report them. */
  contextWindows?: Readonly<Record<string, number>>;
  /**
   * `reasoning.effort` for each level where the service takes another value; null leaves
   * `reasoning` out, for a service that documents no effort.
   */
  effort?: EffortMap;
  /** Replaces `effort` for these models. */
  modelEffort?: Readonly<Record<string, EffortMap>>;
  /**
   * Unset: Responses. The Messages and Gemini APIs get the levels in their own form (`thinkingParams`
   * in anthropic/wire.ts, `thinkingConfig` in gemini/wire.ts).
   */
  protocol?: Protocol;
  /** Responses: past reasoning goes back as the signed blocks the service returned, not as text. */
  encryptedReasoning?: true;
  /**
   * Responses with past reasoning sent back as text: whether a tool call with no reasoning recorded before it
   * gets a placeholder reasoning item (Cortico's `sendSyntheticReasoning`). Unset sends one, Cortico's default.
   */
  syntheticReasoning?: boolean;
  /**
   * Connected by signing in instead of with a key: the endpoint is the `chatgpt` module's (`chatgptEntry`);
   * `keyHint`, `secret` and `keyUrl` are not used.
   */
  signIn?: true;
}

/** The key hint of the services whose keys have no fixed start, and its English (`vendorKeyHint`). */
const PASTE_KEY = '粘贴 API Key';
const PASTE_KEY_EN = 'Paste the API key';

export const VENDORS: readonly Vendor[] = [
  {
    id: 'deepseek', name: 'DeepSeek', nameEn: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com', keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'sk-…',
    secret: 'DEEPSEEK_API_KEY', model: 'deepseek-flash', models: ['deepseek-v4-pro'],
    vision: ['deepseek-flash'], contextWindows: { 'deepseek-flash': 1_000_000, 'deepseek-v4-pro': 1_000_000 },
    // the endpoint answers 400 when a tool call in the input has no reasoning before it
    syntheticReasoning: true,
  },
  {
    // Qwen3.8 takes none / low / medium / xhigh; qwen3.7-flash is cheaper up to 32K input. qwen3.8-max reads images
    // as upstream Coopanion's table has listed it since v0.1.20 (未实测 here). Upstream #432 only added
    // deepseek-v4.1-flash(-1017) to this list, models the fork's Qwen list does not carry
    id: 'qwen', name: '通义千问', nameEn: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key', keyHint: 'sk-…',
    secret: 'QWEN_API_KEY', model: 'qwen3.8-flash', models: ['qwen3.7-flash', 'qwen3.8-max'],
    vision: ['qwen3.8-flash', 'qwen3.7-flash', 'qwen3.8-max'], contextWindows: { 'qwen3.8-flash': 1_000_000 },
    effort: { high: 'medium', max: 'xhigh' },
  },
  {
    // the Responses endpoint serves kimi-k3 only, which takes low / high / max
    id: 'kimi', name: 'Kimi', nameEn: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.kimi.com/console/api-keys', keyHint: 'sk-…',
    secret: 'KIMI_API_KEY', model: 'kimi-k3',
    vision: ['kimi-k3'], contextWindows: { 'kimi-k3': 1_048_576 },
    effort: { none: 'low' },
  },
  {
    // the Responses endpoint is under /api/v1, not the chat path /api/paas/v4; its docs show glm-5.3 only
    // (text), so the flash models there are not confirmed
    id: 'glm', name: '智谱 GLM', nameEn: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/v1', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', keyHint: PASTE_KEY,
    secret: 'GLM_API_KEY', model: 'glm-5.3-flash', models: ['glm-5.3', 'glm-4.6v-flash'],
    vision: ['glm-5.3-flash', 'glm-4.6v-flash', 'glm-4.6v-flashx'], contextWindows: { 'glm-5.3': 1_000_000 },
  },
  {
    // the model is used by its id, after it is switched on under 开通管理 in the Ark console
    id: 'doubao', name: '豆包', nameEn: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey', keyHint: PASTE_KEY,
    secret: 'DOUBAO_API_KEY', model: 'doubao-seed-2-1-lite-260915', models: ['doubao-seed-2-0-mini-260428'],
    vision: ['doubao-seed-2-1-lite-260915', 'doubao-seed-2-0-mini-260428'],
  },
  {
    // Qianfan's Responses endpoint lists no ERNIE model, none documented as reading images, and no effort
    id: 'qianfan', name: '百度千帆', nameEn: 'Baidu Qianfan',
    baseUrl: 'https://qianfan.baidubce.com/v2', keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list', keyHint: 'bce-v3/…',
    secret: 'QIANFAN_API_KEY', model: 'glm-5.1', models: ['glm-5', 'qwen3-235b-a22b-instruct-2507', 'deepseek-v4-pro'],
    effort: { none: null, low: null, high: null, max: null },
  },
  {
    // takes none / minimal / low / medium / high
    id: 'minimax', name: 'MiniMax', nameEn: 'MiniMax',
    baseUrl: 'https://api.minimax.cn/v1', keyUrl: 'https://platform.minimax.cn/user-center/basic-information/interface-key', keyHint: PASTE_KEY,
    secret: 'MINIMAX_API_KEY', model: 'MiniMax-M3', models: ['MiniMax-M2.7'],
    vision: ['MiniMax-M3'], contextWindows: { 'MiniMax-M3': 1_000_000 },
    effort: { max: 'high' },
  },
  {
    // takes low / medium / high
    id: 'stepfun', name: '阶跃星辰', nameEn: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1', keyUrl: 'https://platform.stepfun.com/interface-key', keyHint: PASTE_KEY,
    secret: 'STEPFUN_API_KEY', model: 'step-3.7-flash', models: ['step-5-preview'],
    vision: ['step-3.7-flash', 'step-5-preview'],
    effort: { none: 'low', max: 'high' },
  },
  {
    id: 'openrouter', name: 'OpenRouter', nameEn: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/settings/keys', keyHint: 'sk-or-…',
    secret: 'OPENROUTER_API_KEY', model: 'deepseek/deepseek-v4.1-flash',
    models: ['qwen/qwen3.7-flash', 'qwen/qwen3.8-flash', 'google/gemini-3.1-flash-lite', 'z-ai/glm-5.3-flash'],
    vision: ['deepseek/deepseek-v4.1-flash', 'qwen/qwen3.7-flash', 'qwen/qwen3.8-flash', 'google/gemini-3.1-flash-lite', 'z-ai/glm-5.3-flash'], contextWindows: { 'deepseek/deepseek-v4.1-flash': 1_048_576 },
    // the models through it take a tool call with no reasoning before it (upstream Coopanion checked its Qwen, Kimi,
    // GLM, MiniMax and Grok ones, 2026-10-13): no placeholder
    syntheticReasoning: false,
  },
  {
    // gpt-6-luna takes none / low / medium / high / xhigh / max; the larger two have no none
    id: 'openai', name: 'OpenAI', nameEn: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/settings/organization/api-keys', keyHint: 'sk-…',
    secret: 'COO_OPENAI_API_KEY', model: 'gpt-6-luna', models: ['gpt-6.1-sol', 'gpt-6-astra'],
    vision: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    contextWindows: { 'gpt-6-luna': 1_050_000, 'gpt-6.1-sol': 1_050_000, 'gpt-6-astra': 1_050_000 },
    modelEffort: { 'gpt-6.1-sol': { none: 'low' }, 'gpt-6-astra': { none: 'low' } },
    encryptedReasoning: true,
  },
  {
    // thinking and effort are sent in the Messages API's own form (`thinkingParams` in anthropic/wire.ts);
    // Opus 5.5 always thinks, so no thinking sends it the lowest effort
    id: 'anthropic', name: 'Anthropic', nameEn: 'Anthropic',
    baseUrl: 'https://api.anthropic.com', keyUrl: 'https://platform.claude.com/settings/keys', keyHint: 'sk-ant-…',
    secret: 'COO_ANTHROPIC_API_KEY', model: 'claude-haiku-5-5', models: ['claude-sonnet-5-5', 'claude-opus-5-5'],
    vision: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    protocol: 'anthropic',
  },
  {
    // thinking is sent in the Gemini API's own form (`thinkingConfig` in gemini/wire.ts); the Pro model is a preview
    id: 'gemini', name: 'Gemini', nameEn: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/apikey', keyHint: PASTE_KEY,
    secret: 'COO_GEMINI_API_KEY', model: 'gemini-3.5-flash-lite', models: ['gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    vision: ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    contextWindows: { 'gemini-3.5-flash-lite': 1_048_576, 'gemini-3.8-flash': 1_048_576, 'gemini-3.1-pro-preview': 1_048_576 },
    protocol: 'gemini',
  },
  {
    // grok-4.3 takes none / low / medium / high / xhigh; grok-4.7 always reasons and takes low / medium / high / xhigh
    id: 'xai', name: 'xAI', nameEn: 'xAI',
    baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai/team/default/api-keys', keyHint: 'xai-…',
    secret: 'COO_XAI_API_KEY', model: 'grok-4.3', models: ['grok-4.7'],
    vision: ['grok-4.3', 'grok-4.7'], contextWindows: { 'grok-4.3': 1_000_000, 'grok-4.7': 500_000 },
    effort: { max: 'xhigh' },
    modelEffort: { 'grok-4.7': { none: 'low', max: 'xhigh' } },
    encryptedReasoning: true,
  },
];

/** The provider module of a signed-in ChatGPT plan's endpoint (`chatgpt/index.ts`), and the name of the app's endpoint for it. */
export const CHATGPT_MODULE = 'chatgpt';

/**
 * A ChatGPT plan, signed in with the account (Sign in with ChatGPT): OpenAI's API and models, billed to the plan.
 * Its endpoint is the `chatgpt` module's, so it is not in `VENDORS`: its base URL is OpenAI's.
 */
export const CHATGPT: Vendor = {
  ...VENDORS.find((v) => v.id === 'openai')!,
  id: 'chatgpt', name: 'ChatGPT', nameEn: 'ChatGPT', keyUrl: 'https://chatgpt.com/', keyHint: '', secret: '', signIn: true,
};

export const vendorById = (id: string): Vendor | null => (id === CHATGPT.id ? CHATGPT : VENDORS.find((v) => v.id === id) ?? null);

/** Whether `language` (Cortico's `Language`) reads the Chinese text: zh and zh-Hant do, every other language reads English. */
const readsZh = (language: string) => language === 'zh' || language === 'zh-Hant';

/** `v`'s name as `language` shows it. */
export const vendorName = (v: Vendor, language: string): string => (readsZh(language) ? v.name : v.nameEn);

/** The placeholder of `v`'s key box in `language`: how its keys start, or a request to paste one. */
export const vendorKeyHint = (v: Vendor, language: string): string => (v.keyHint === PASTE_KEY && !readsZh(language) ? PASTE_KEY_EN : v.keyHint);

/** The effort values `v` takes for `model`. */
export const effortOf = (v: Vendor, model: string): EffortMap | undefined => v.modelEffort?.[model] ?? v.effort;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * The service an endpoint's base URL points at, or null for any other URL. A path under the
 * service's base URL counts as that service (for its prices and context windows); `protocolOf` is
 * stricter.
 */
export function vendorOf(baseUrl: string | undefined): Vendor | null {
  if (!baseUrl) return null;
  const url = trimSlash(baseUrl.trim());
  return VENDORS.find((v) => url === v.baseUrl || url.startsWith(`${v.baseUrl}/`)) ?? null;
}

/**
 * The service of an endpoint: a ChatGPT plan by its module (its base URL is OpenAI's), the others by base URL
 * (`vendorOf`). `module` is the endpoint's `kind`, as `/api/status` reports it under `modelConnection.module`.
 */
export function connectionVendor(endpoint: { module?: string; baseUrl?: string } | null | undefined): Vendor | null {
  if (!endpoint) return null;
  return endpoint.module === CHATGPT_MODULE ? CHATGPT : vendorOf(endpoint.baseUrl);
}

/** `connectionVendor` for an endpoint's config, whose module is its `kind`. */
export const endpointVendor = (entry: { kind?: string; baseUrl?: string } | null | undefined): Vendor | null =>
  connectionVendor(entry ? { module: entry.kind, baseUrl: entry.baseUrl } : null);

/**
 * How an endpoint at `baseUrl` is sent. A service's own protocol applies only at its base URL
 * itself (Anthropic's also at `<baseUrl>/v1`): Gemini's OpenAI-compatible path (`<baseUrl>/openai`) is not the Gemini API, so it goes out
 * as Responses, as any other URL does.
 */
export function protocolOf(baseUrl: string | undefined): Protocol {
  const v = vendorOf(baseUrl);
  if (!v?.protocol) return 'responses';
  const url = trimSlash(baseUrl!.trim());
  // the familiar `https://api.anthropic.com/v1` is the same API root (the SDK adds `/v1/messages` itself)
  return url === v.baseUrl || (v.protocol === 'anthropic' && url === `${v.baseUrl}/v1`) ? v.protocol : 'responses';
}

/** A new endpoint's config for `v` (`kind: 'coo'`) on `model`; the key goes into its `.env` under `v.secret`. */
export function vendorEntry(v: Vendor, model = v.model) {
  return {
    kind: 'coo',
    baseUrl: v.baseUrl,
    secret: v.secret,
    spec: { model, thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: (v.vision ?? []).includes(model),
    pricing: [],
    options: {},
  };
}

/** A new ChatGPT plan endpoint (`kind: 'chatgpt'`) on `model`; it has no key: the sign-in writes the account's tokens to its `.env`. */
export function chatgptEntry(model = CHATGPT.model) {
  return {
    kind: CHATGPT_MODULE,
    baseUrl: CHATGPT.baseUrl,
    spec: { model, thinking: true, reasoningEffort: 'high', maxTokens: 8192 },
    multimodal: (CHATGPT.vision ?? []).includes(model),
    pricing: [],
    options: {},
  };
}
