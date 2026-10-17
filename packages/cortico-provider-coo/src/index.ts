/**
 * Coo Pet Provider: one Cortico provider module for the model services Coo can talk through,
 * DeepSeek first. Which service an endpoint is comes from its base URL (`vendorOf`), and the service
 * decides the protocol (`Vendor.protocol`): OpenAI-compatible Responses (`POST <baseUrl>/responses`,
 * stateless, past reasoning replayed as plain text the way DeepSeek wants it, or as the signed blocks
 * for `encryptedReasoning` services such as OpenAI and xAI), or the Gemini API. An endpoint is plain
 * Cortico config and nothing else is stored; any other URL uses Responses.
 *
 * Thinking is a four-step choice: off sends `reasoning.effort = none`, the others low / high /
 * max, each rewritten to the value a service documents for the model where it takes other ones
 * (`effortOf`); the Gemini API gets the levels in its own form. Images are sent only when the
 * endpoint is marked multimodal and the service lists the model as reading them; tool results may
 * carry images too. Images go out only from the newest delivered batch of events on
 * (`sinceLastDelivery`). Prices are built in for DeepSeek, OpenAI, Gemini and xAI.
 */
import type { ProviderModule, ProviderInstance } from 'cortico/providers/base.ts';
import type { LLMProviderEntry, ReasoningTier } from 'cortico/core/types.ts';
import { baseLanguage } from 'cortico/core/language.ts';
import { isContextOverflow } from 'cortico/providers/transport/errors.ts';
import { ModelCatalog, ResponsesProvider, type ResponsesProviderOptions } from 'cortico/providers/openai-responses-compat/native.ts';
import type { GenerateOptions } from 'cortico/core/generation.ts';
import type { Request } from 'cortico/protocol/open-responses/index.ts';
import { sinceLastDelivery } from './context.ts';
import { GeminiProvider, listGeminiModels } from './gemini/client.ts';
import { vendorPrices } from './pricing.ts';
import { VENDORS, effortOf, protocolOf, vendorOf, type EffortMap } from './vendors.ts';

const TIERS = {
  zh: [
    { id: 'off', label: '不思考', thinking: false },
    { id: 'low', label: '思考 · 快', thinking: true, effort: 'low' },
    { id: 'high', label: '思考 · 标准', thinking: true, effort: 'high' },
    { id: 'max', label: '思考 · 最深', thinking: true, effort: 'max' },
  ],
  en: [
    { id: 'off', label: 'No thinking', thinking: false },
    { id: 'low', label: 'Thinking · fast', thinking: true, effort: 'low' },
    { id: 'high', label: 'Thinking · standard', thinking: true, effort: 'high' },
    { id: 'max', label: 'Thinking · deepest', thinking: true, effort: 'max' },
  ],
} satisfies Record<string, ReasoningTier[]>;

const readsImages = (entry: LLMProviderEntry, model: string | undefined) => !!model && (vendorOf(entry.baseUrl)?.vision ?? []).includes(model);

/**
 * The Responses client with the thinking level rewritten to the value the service takes for the model
 * (`effortOf`) and images limited to the newest batch (`sinceLastDelivery`).
 */
class VendorResponses extends ResponsesProvider {
  constructor(opts: ResponsesProviderOptions, private readonly effort: (model: string) => EffortMap | undefined) {
    super(opts);
  }

  protected override buildResponseBody(request: Request, options: GenerateOptions): Record<string, unknown> {
    const body = super.buildResponseBody(request, options.context ? { ...options, context: sinceLastDelivery(options.context) } : options);
    const reasoning = body.reasoning as { effort?: string } | undefined;
    const level = reasoning?.effort;
    const effort = this.effort(request.model ?? '');
    if (!effort || !level || !(level in effort)) return body;
    const to = effort[level as keyof EffortMap];
    if (to === null || to === undefined) delete body.reasoning;
    else body.reasoning = { ...reasoning, effort: to };
    return body;
  }
}

/** The Gemini API states an oversized prompt as a token count over the maximum. */
function contextOverflow(error: { status: number; body: string }): boolean {
  return isContextOverflow(error) || (error.status === 400 && /input token count.*exceeds the maximum/i.test(error.body));
}

export const COO = {
  id: 'coo',
  title: 'Coo Pet Provider',
  description: 'DeepSeek, Qwen, Kimi, GLM, Doubao, Baidu Qianfan, MiniMax, StepFun, OpenRouter, OpenAI, Gemini and xAI through their Responses endpoints or the Gemini API.',
  // the tiers and description have zh and en text; zh-Hant reads zh, every other language en
  localize: (language) => ({
    description: baseLanguage(language) === 'zh'
      ? `一个模块接 ${VENDORS.map((v) => v.name).join('、')};按接口地址认是哪一家。思考可调四档。`
      : `One module for ${VENDORS.map((v) => v.nameEn).join(', ')}; the base URL tells which service it is. Thinking has four levels.`,
    reasoningTiers: TIERS[baseLanguage(language)],
  }),
  defaultBaseUrl: VENDORS[0]!.baseUrl,
  baseUrlSuggestions: VENDORS.map((v) => v.baseUrl),
  reasoningTiers: TIERS.en,
  serviceTiers: [],
  accepts: (entry, spec, mime) => entry.multimodal === true && mime.startsWith('image/') && readsImages(entry, spec.model),
  prices: (entry, _request, at) => vendorPrices(vendorOf(entry.baseUrl)?.id, at.startedAt),
  contextOverflow,
  create(name: string, entry: LLMProviderEntry, host): ProviderInstance {
    const apiKey = entry.secret ? host.secret(entry.secret) : undefined;
    const current = () => host.currentEntry?.() ?? entry;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const vendor = vendorOf(entry.baseUrl);
    const media = { enabled: () => current().multimodal === true && readsImages(current(), current().spec?.model), read: host.readBlob };
    const stated = (model: string) => vendor?.contextWindows?.[model];
    if (vendor && protocolOf(entry.baseUrl) === 'gemini') {
      const windows = new Map<string, number | undefined>();
      return {
        client: new GeminiProvider({ baseUrl: entry.baseUrl, apiKey, media, keepThinking: host.keepThinking, log: host.log }),
        compatibilityKey: () => [vendor.id, name, 'gemini'],
        contextWindow: (model) => stated(model) ?? windows.get(model),
        listModels: async () => {
          const models = await listGeminiModels(entry.baseUrl, apiKey ?? '');
          for (const model of models) windows.set(model.id, model.contextWindow);
          return models;
        },
      };
    }
    const catalog = new ModelCatalog(() => ({ baseUrl: entry.baseUrl, headers }));
    return {
      listModels: () => catalog.list(),
      contextWindow: (model) => stated(model) ?? catalog.contextWindow(model),
      compatibilityKey: () => [vendor?.id ?? 'coo', name],
      client: new VendorResponses({
        baseUrl: entry.baseUrl,
        apiKey,
        log: host.log,
        media,
        keepThinking: host.keepThinking,
        reasoningReplay: vendor?.encryptedReasoning ? 'encrypted' : 'plaintext',
      }, (model) => (vendor ? effortOf(vendor, model) : undefined)),
    };
  },
} satisfies ProviderModule;

export default COO;
export { deepseekPrices, geminiPrices, openaiPrices, vendorPrices, xaiPrices, OFF_PEAK } from './pricing.ts';
export { VENDORS, effortOf, protocolOf, vendorById, vendorEntry, vendorOf, type Vendor } from './vendors.ts';
export { VENDOR_ICONS } from './icons.ts';
