/** The four thinking levels the provider's modules offer (`coo` and `chatgpt`), in Chinese and English. */
import type { ReasoningTier } from 'cortico/core/types.ts';

export const TIERS = {
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
