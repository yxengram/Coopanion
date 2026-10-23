import { describe, expect, it } from 'vitest';
import COO, { VENDORS, vendorById, vendorKeyHint, vendorName } from '../src/index.ts';
import { COO_TEXT } from '../src/strings.ts';
import { CONNECT_TEXT, saveVendorKey, testEndpoint, type ConsoleCall } from '../src/connect.ts';

/** Chinese and Japanese characters, CJK punctuation and full-width forms. */
const CJK = /[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/;

describe('the text people see', () => {
  it('names every service and its key box without Chinese outside Chinese', () => {
    for (const v of VENDORS) {
      for (const language of ['en', 'ja', 'fr'] as const) {
        expect(vendorName(v, language), v.id).not.toMatch(CJK);
        expect(vendorKeyHint(v, language), v.id).not.toMatch(CJK);
      }
      // Chinese is the fields as they are
      for (const language of ['zh', 'zh-Hant'] as const) {
        expect(vendorName(v, language)).toBe(v.name);
        expect(vendorKeyHint(v, language)).toBe(v.keyHint);
      }
    }
    expect([vendorName(vendorById('qwen')!, 'en'), vendorKeyHint(vendorById('glm')!, 'en'), vendorKeyHint(vendorById('openrouter')!, 'en')])
      .toEqual(['Qwen', 'Paste the API key', 'sk-or-…']);
  });

  it('describes the module and its thinking levels in the request language', () => {
    for (const language of ['en', 'ja'] as const) {
      const text = COO.localize(language);
      expect(JSON.stringify(text)).not.toMatch(CJK);
    }
    expect(COO.localize('zh').reasoningTiers?.map((t) => t.label)).toEqual(['不思考', '思考 · 快', '思考 · 标准', '思考 · 最深']);
  });

  it('has the same connect messages in zh and en', () => {
    expect(Object.keys(CONNECT_TEXT.en)).toEqual(Object.keys(CONNECT_TEXT.zh));
    for (const s of Object.values(CONNECT_TEXT.en)) expect(s).not.toMatch(CJK);
  });

  it("has the same module messages in zh and en", () => {
    expect(Object.keys(COO_TEXT.en)).toEqual(Object.keys(COO_TEXT.zh));
    for (const s of Object.values(COO_TEXT.en)) expect(s).not.toMatch(CJK);
    for (const s of Object.values(COO_TEXT.zh)) expect(s).toMatch(CJK);
  });

  it('says why a connection failed in the language asked for, Chinese by default', async () => {
    const gemini = vendorById('gemini')!;
    expect(await saveVendorKey((async () => ({})) as ConsoleCall, gemini, ' ')).toEqual({ ok: false, why: '密钥是空的' });
    expect(await saveVendorKey((async () => ({})) as ConsoleCall, gemini, ' ', 'en')).toEqual({ ok: false, why: 'The key is empty' });
    const call = (async () => ({ ok: false, status: 400, error: 'HTTP 400' })) as ConsoleCall;
    expect((await testEndpoint(call, 'gemini')).why).toBe('Gemini 回了 HTTP 400,多半是 Key 不对(也可能是模型名不对)');
    expect((await testEndpoint(call, 'gemini', 'en')).why).not.toMatch(CJK);
  });
});
