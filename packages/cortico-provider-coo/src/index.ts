/**
 * Coo Pet Provider: one Cortico provider module for the model services Coo can talk through,
 * DeepSeek first. Which service an endpoint is comes from its base URL (`vendorOf`), and the service
 * decides the protocol (`Vendor.protocol`): OpenAI-compatible Responses (`POST <baseUrl>/responses`,
 * stateless, past reasoning replayed as plain text the way DeepSeek wants it, or as the signed blocks
 * for `encryptedReasoning` services such as OpenAI and xAI), Anthropic's Messages API (through
 * `@anthropic-ai/sdk`, `anthropic/`), or the Gemini API. An endpoint is plain Cortico config and
 * nothing else is stored; any other URL uses Responses.
 *
 * Thinking is a four-step choice: off sends `reasoning.effort = none`, the others low / high /
 * max, each rewritten to the value a service documents for the model where it takes other ones
 * (`effortOf`); the Messages and Gemini APIs get the levels in their own form. Images are sent whenever the
 * endpoint is marked multimodal (upstream #432; the vendor table's `vision` only decides whether a new endpoint, or a
 * model typed in the normal mode, is marked so); tool results may carry images too. Images go out only from the newest delivered batch of events on
 * (`sinceLastDelivery`). Prices are built in for DeepSeek, OpenAI, Anthropic, Gemini and xAI.
 *
 * The package has a second module, `chatgpt` (`CHATGPT_PROVIDER`, chatgpt/): a ChatGPT plan signed in with the
 * account instead of a key, its requests billed to the plan.
 */
import type { ProviderModule, ProviderInstance } from 'cortico/providers/base.ts';
import type { LLMProviderEntry } from 'cortico/core/types.ts';
import { baseLanguage } from 'cortico/core/language.ts';
import { isContextOverflow } from 'cortico/providers/transport/errors.ts';
import { ModelCatalog } from 'cortico/providers/openai-responses-compat/native.ts';
import { ClaudeProvider } from './anthropic/client.ts';
import { GeminiProvider, listGeminiModels } from './gemini/client.ts';
import { vendorPrices } from './pricing.ts';
import { VendorResponses } from './responses.ts';
import { cooText } from './strings.ts';
import { plainRemote } from './address.ts';
import { TIERS } from './tiers.ts';
import { VENDORS, effortOf, protocolOf, vendorOf } from './vendors.ts';

/** The Messages API states an oversized prompt as `prompt is too long`, the Gemini API as a token count over the maximum. */
function contextOverflow(error: { status: number; body: string }): boolean {
  return isContextOverflow(error)
    || (error.status === 400 && /prompt is too long|exceeds? the (model's )?context|input token count.*exceeds the maximum/i.test(error.body));
}

/** The longest Anthropic model list read; listing stops there. */
const MODELS_MAX = 2000;

export const COO = {
  id: 'coo',
  title: 'Coo Pet Provider',
  description: 'DeepSeek, Qwen, Kimi, GLM, Doubao, Baidu Qianfan, MiniMax, StepFun, OpenRouter, OpenAI, Anthropic, Gemini and xAI through their Responses endpoints, the Messages API or the Gemini API.',
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
  validateEntry(entry, language) {
    if (plainRemote(entry.baseUrl)) throw new Error(cooText(language).httpRemote);
  },
  accepts: (entry, _spec, mime) => entry.multimodal === true && mime.startsWith('image/'),
  prices: (entry, _request, at) => vendorPrices(vendorOf(entry.baseUrl)?.id, at.startedAt),
  contextOverflow,
  create(name: string, entry: LLMProviderEntry, host): ProviderInstance {
    if (plainRemote(entry.baseUrl)) {
      // an endpoint saved before the rule stays listed; each request fails before anything is sent
      const client = new VendorResponses({ baseUrl: entry.baseUrl, log: host.log }, () => undefined);
      client.respond = () => Promise.reject(new Error(cooText('en').httpRemote));
      return { client };
    }
    const apiKey = entry.secret ? host.secret(entry.secret) : undefined;
    const current = () => host.currentEntry?.() ?? entry;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const vendor = vendorOf(entry.baseUrl);
    const media = { enabled: () => current().multimodal === true, read: host.readBlob };
    const stated = (model: string) => vendor?.contextWindows?.[model];
    if (vendor && protocolOf(entry.baseUrl) === 'anthropic') {
      const client = new ClaudeProvider({ baseUrl: entry.baseUrl, apiKey, media, keepThinking: host.keepThinking, log: host.log });
      const windows = new Map<string, number | undefined>();
      return {
        client,
        compatibilityKey: () => [vendor.id, name, 'anthropic'],
        contextWindow: (model) => stated(model) ?? windows.get(model),
        // the SDK pages `GET /v1/models`; the window and output limit are read where the API states them
        listModels: async () => {
          const models = [];
          for await (const model of client.client().models.list()) {
            // the SDK pages on while the service says there is more
            if (models.length >= MODELS_MAX) break;
            const row = model as typeof model & { max_input_tokens?: number; max_tokens?: number };
            windows.set(model.id, row.max_input_tokens);
            models.push({ id: model.id, displayName: model.display_name,
              ...(row.max_input_tokens ? { contextWindow: row.max_input_tokens } : {}), ...(row.max_tokens ? { maxOutputTokens: row.max_tokens } : {}) });
          }
          return models;
        },
      };
    }
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
        sendSyntheticReasoning: vendor?.syntheticReasoning,
      }, (model) => (vendor ? effortOf(vendor, model) : undefined)),
    };
  },
} satisfies ProviderModule;

export default COO;
export { anthropicPrices, deepseekPrices, geminiPrices, openaiPrices, vendorPrices, xaiPrices, OFF_PEAK } from './pricing.ts';
export { plainRemote } from './address.ts';
export {
  CHATGPT, CHATGPT_MODULE, VENDORS, chatgptEntry, connectionVendor, effortOf, endpointVendor, protocolOf, vendorById, vendorEntry, vendorKeyHint, vendorName, vendorOf,
  type Vendor,
} from './vendors.ts';
export { CHATGPT_BUILTIN_PANEL, CHATGPT_PROVIDER, SIGN_IN_PANEL, USAGE_LIMIT, chatgptModule, signedIn, usageLimited, type SignInStatus } from './chatgpt/index.ts';
export { VENDOR_ICONS } from './icons.ts';
