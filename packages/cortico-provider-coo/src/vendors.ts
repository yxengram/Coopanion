/**
 * The model services Coo Pet Provider offers, DeepSeek first. The Chinese services and OpenRouter,
 * OpenAI and xAI are OpenAI-compatible Responses endpoints; Gemini is the Gemini API (`protocol`).
 * `id` doubles as the name of the service's endpoint in the app, and `secret` as the name its key is
 * stored under. Cortico reads a secret from the process environment before the endpoint's `.env`, so
 * OpenAI, Gemini and xAI take `COO_`-prefixed names: a developer's own `OPENAI_API_KEY` (or
 * `GEMINI_API_KEY`, `XAI_API_KEY`) in the shell Coopanion starts from would otherwise replace the key
 * pasted in the app. Base URLs, starting models, key pages, image input, context windows and thinking
 * levels are from each service's own documentation (the Chinese services and OpenRouter read
 * 2026-09-24; OpenAI, Gemini and xAI as upstream Coopanion read them, 2026-10-08/09); none of the
 * services but DeepSeek has been tried with a key.
 *
 * This file imports nothing, so the browser console and the app's first-run seed can use it.
 */

/** The four thinking levels the provider offers; see `TIERS` in index.ts. */
export type Effort = 'none' | 'low' | 'high' | 'max';

/** The effort value a service takes for each level where it differs; null leaves the effort out. */
export type EffortMap = Partial<Record<Effort, string | null>>;

/**
 * How requests are sent: `responses` is `POST <baseUrl>/responses`, `gemini` is the Gemini API at
 * `<baseUrl>/models/<model>:generateContent`.
 */
export type Protocol = 'responses' | 'gemini';

export interface Vendor {
  id: string;
  /** Shown to the person. */
  name: string;
  nameEn: string;
  /** The path before `/responses`. */
  baseUrl: string;
  /** Where a key is created. */
  keyUrl: string;
  /** Placeholder of the key box: how the service's keys start. */
  keyHint: string;
  secret: string;
  /** The model a new endpoint starts with: the service's cheapest current model that reads images. */
  model: string;
  /** Other model names offered next to `model` where one is typed; any name the service takes works. */
  models?: readonly string[];
  /** Models that read images. */
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
  /** Unset: Responses. The Gemini API gets the levels in its own form (`thinkingConfig` in gemini/wire.ts). */
  protocol?: Protocol;
  /** Responses: past reasoning goes back as the signed blocks the service returned, not as text. */
  encryptedReasoning?: true;
}

export const VENDORS: readonly Vendor[] = [
  {
    id: 'deepseek', name: 'DeepSeek', nameEn: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com', keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'sk-…',
    secret: 'DEEPSEEK_API_KEY', model: 'deepseek-flash', models: ['deepseek-v4-pro'],
    vision: ['deepseek-flash'], contextWindows: { 'deepseek-flash': 1_000_000, 'deepseek-v4-pro': 1_000_000 },
  },
  {
    // Qwen3.8 takes none / low / medium / xhigh; qwen3.7-flash is cheaper up to 32K input
    id: 'qwen', name: '通义千问', nameEn: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key', keyHint: 'sk-…',
    secret: 'QWEN_API_KEY', model: 'qwen3.8-flash', models: ['qwen3.7-flash', 'qwen3.8-max'],
    vision: ['qwen3.8-flash', 'qwen3.7-flash'], contextWindows: { 'qwen3.8-flash': 1_000_000 },
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
    baseUrl: 'https://open.bigmodel.cn/api/v1', keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', keyHint: '粘贴 API Key',
    secret: 'GLM_API_KEY', model: 'glm-5.3-flash', models: ['glm-5.3', 'glm-4.6v-flash'],
    vision: ['glm-5.3-flash', 'glm-4.6v-flash', 'glm-4.6v-flashx'], contextWindows: { 'glm-5.3': 1_000_000 },
  },
  {
    // the model is used by its id, after it is switched on under 开通管理 in the Ark console
    id: 'doubao', name: '豆包', nameEn: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey', keyHint: '粘贴 API Key',
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
    baseUrl: 'https://api.minimax.cn/v1', keyUrl: 'https://platform.minimax.cn/user-center/basic-information/interface-key', keyHint: '粘贴 API Key',
    secret: 'MINIMAX_API_KEY', model: 'MiniMax-M3', models: ['MiniMax-M2.7'],
    vision: ['MiniMax-M3'], contextWindows: { 'MiniMax-M3': 1_000_000 },
    effort: { max: 'high' },
  },
  {
    // takes low / medium / high
    id: 'stepfun', name: '阶跃星辰', nameEn: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1', keyUrl: 'https://platform.stepfun.com/interface-key', keyHint: '粘贴 API Key',
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
    // thinking is sent in the Gemini API's own form (`thinkingConfig` in gemini/wire.ts); the Pro model is a preview
    id: 'gemini', name: 'Gemini', nameEn: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/apikey', keyHint: '粘贴 API Key',
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

export const vendorById = (id: string): Vendor | null => VENDORS.find((v) => v.id === id) ?? null;

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
 * How an endpoint at `baseUrl` is sent. A service's own protocol applies only at its base URL
 * itself: Gemini's OpenAI-compatible path (`<baseUrl>/openai`) is not the Gemini API, so it goes out
 * as Responses, as any other URL does.
 */
export function protocolOf(baseUrl: string | undefined): Protocol {
  const v = vendorOf(baseUrl);
  return v?.protocol && trimSlash(baseUrl!.trim()) === v.baseUrl ? v.protocol : 'responses';
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
