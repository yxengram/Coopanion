/**
 * What the provider says to the person, in Chinese and English. `COO_TEXT`: why the `coo` module refuses an
 * endpoint's base URL. `CHATGPT_TEXT`: the `chatgpt` module's description in the console, why its endpoint is not
 * ready, the page the browser shows after the sign-in, and what the sign-in's failure codes mean. `language` is
 * Cortico's `Language`: zh and zh-Hant read the Chinese, every other language the English. Like vendors.ts this file
 * imports nothing, so the settings window can use it.
 */

export const COO_TEXT = {
  zh: { httpRemote: '远程地址只能用 https。http 不加密,API Key 和对话会明文传输;本机和局域网的地址可以用 http。' },
  en: { httpRemote: 'A remote address must use https: http is not encrypted, so the API Key and the conversation would travel in plain text. Addresses on this computer or the local network may use http.' },
};

/** The `coo` module's text in `language`. */
export const cooText = (language: string): typeof COO_TEXT.zh => (language === 'zh' || language === 'zh-Hant' ? COO_TEXT.zh : COO_TEXT.en);

const zh = {
  /** The module's description. */
  description: '用 ChatGPT 账号登录(测试中),请求计入该账号的 ChatGPT 套餐用量。',
  /** The sign-in section's title in the endpoint editor. */
  panel: 'ChatGPT 账号',
  /** Why the endpoint is not ready. */
  signedOut: '未登录 ChatGPT',
  /** The browser's page after the sign-in comes back. */
  returnToApp: '登录结果在应用里显示,可以关闭这个页面。',
  /** What the sign-in's failure codes mean; any other code is shown as it is. */
  reasons: {
    access_denied: '没有同意授权',
    plan_not_granted: '这个账号没有授权使用 ChatGPT 套餐',
    invalid_token_response: '服务已应答,但响应格式不兼容',
    unsupported_country_region_territory: '所在地区不受该服务支持;支持的地区见 https://developers.openai.com/api/docs/supported-countries',
    timeout: '浏览器里的登录超时了',
    account_mismatch: '这不是这个连接之前登录的那个 ChatGPT 账号',
  } as Record<string, string>,
};

const en: typeof zh = {
  description: "Signs in with a ChatGPT account (testing); requests count toward that account's ChatGPT plan.",
  panel: 'ChatGPT account',
  signedOut: 'Not signed in to ChatGPT',
  returnToApp: 'The app shows how the sign-in went. You can close this tab.',
  reasons: {
    access_denied: 'access was not granted',
    plan_not_granted: 'the account did not allow use of its ChatGPT plan',
    invalid_token_response: 'the service answered, but the response format is incompatible',
    unsupported_country_region_territory: 'your region is not supported by this service; supported regions: https://developers.openai.com/api/docs/supported-countries',
    timeout: 'the browser sign-in timed out',
    account_mismatch: 'this is another ChatGPT account than the one this connection signed in with',
  },
};

export const CHATGPT_TEXT = { zh, en };

/** The `chatgpt` module's text in `language`. */
export const chatgptText = (language: string): typeof zh => (language === 'zh' || language === 'zh-Hant' ? zh : en);

/** A sign-in failure code (`SignInState.reason`) in `language`: the known ones in words, any other as it is. */
export const signInReason = (code: string, language: string): string => chatgptText(language).reasons[code] ?? code;
