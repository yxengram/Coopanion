/** Config section `worlds.cua`, defaults and the console config group. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { Language } from 'cortico/core/language.ts';
import type { WorldSection } from 'cortico/world.ts';
import { cuaText } from './strings.ts';

export const CUA_ID = 'cua';

/**
 * When the person is asked before the bot uses the computer, from strictest to loosest:
 * - ask-each-turn: every turn, before the first screenshot, window list or input;
 * - ask-before-acting: screenshots and the window list are free; every turn, before the first input;
 * - ask-once: screenshots and the window list are free; before an input, and a yes holds for `grantMinutes`;
 * - never-ask: never.
 */
export const PERMISSION_LEVELS = ['ask-each-turn', 'ask-before-acting', 'ask-once', 'never-ask'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export interface CuaConfigSection extends WorldSection {
  /** false: screenshots and the window list only; every input tool fails with that reason. */
  control: boolean;
  /** See PERMISSION_LEVELS. */
  permission: PermissionLevel;
  /** ask-once: how long a yes holds. */
  grantMinutes: number;
  screenshot: {
    maxWidth: number;
    maxHeight: number;
    /** JPEG quality, 1–100. */
    quality: number;
    /** Input tools attach a screenshot unless the call says otherwise. */
    afterAction: boolean;
    /** Wait after an action before taking its screenshot. */
    settleMs: number;
  };
  /** Before sending input, the user must have left mouse and keyboard alone this long. */
  userIdleMs: number;
  /** How long an input tool waits for that before giving up. */
  maxYieldWaitMs: number;
  /** Pause between 16-character chunks while typing. */
  typeChunkDelayMs: number;
}

export const CUA_DEFAULTS: CuaConfigSection = {
  enabled: false,
  control: true,
  permission: 'ask-each-turn',
  grantMinutes: 30,
  screenshot: { maxWidth: 1280, maxHeight: 800, quality: 75, afterAction: true, settleMs: 500 },
  userIdleMs: 2000,
  maxYieldWaitMs: 15_000,
  typeChunkDelayMs: 20,
};

const K = `worlds.${CUA_ID}`;

/** The console config group, its titles and notes in `language`; the keys and `enum` values are the same in every language. */
export function cuaConfigGroup(language: Language = 'zh'): ConfigGroup {
  const t = cuaText(language).config;
  return {
    id: `world:${CUA_ID}`,
    owner: `world:${CUA_ID}`,
    schema: {
      type: 'object',
      title: t.group,
      properties: {
        [`${K}.control`]: { type: 'boolean', title: t.control.title, description: t.control.description, 'x-hot': true },
        [`${K}.permission`]: { type: 'string', title: t.permission.title, enum: [...PERMISSION_LEVELS], 'x-hot': true, description: t.permission.description },
        [`${K}.grantMinutes`]: { type: 'integer', title: t.grantMinutes.title, minimum: 1, maximum: 1440, 'x-suffix': t.grantMinutes.suffix, description: t.grantMinutes.description, 'x-hot': true },
        [`${K}.userIdleMs`]: { type: 'integer', title: t.userIdleMs.title, minimum: 0, maximum: 30000, 'x-suffix': 'ms', description: t.userIdleMs.description, 'x-hot': true },
        [`${K}.maxYieldWaitMs`]: { type: 'integer', title: t.maxYieldWaitMs.title, minimum: 0, maximum: 120000, 'x-suffix': 'ms', 'x-hot': true },
        [`${K}.screenshot.maxWidth`]: { type: 'integer', title: t.maxWidth.title, minimum: 320, maximum: 3840, 'x-suffix': 'px', 'x-hot': true },
        [`${K}.screenshot.maxHeight`]: { type: 'integer', title: t.maxHeight.title, minimum: 240, maximum: 2160, 'x-suffix': 'px', 'x-hot': true },
        [`${K}.screenshot.quality`]: { type: 'integer', title: t.quality.title, minimum: 30, maximum: 95, 'x-hot': true },
        [`${K}.screenshot.afterAction`]: { type: 'boolean', title: t.afterAction.title, 'x-hot': true },
        [`${K}.screenshot.settleMs`]: { type: 'integer', title: t.settleMs.title, minimum: 0, maximum: 5000, 'x-suffix': 'ms', 'x-hot': true },
      },
    },
  };
}

/** The config group in Chinese. */
export const CUA_CONFIG_GROUP: ConfigGroup = cuaConfigGroup('zh');
