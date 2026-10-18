/** Config section `worlds.desktop-pet`, its defaults and the console config groups. */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import type { Language } from 'cortico/core/language.ts';
import type { WorldSection } from 'cortico/world.ts';
import type { SegmentConfig } from './asr/segmenter.ts';
import { DEFAULT_HOTKEY } from './asr/hotkey.ts';
import { DECIDER_DEFAULT_MODEL } from './decider.ts';
import type { SmallTalkFrequency } from './smalltalk.ts';
import { petText } from './i18n/index.ts';

export const DESKTOP_PET_ID = 'desktop-pet';

/** What the pet's menu offers, in its order; any of them can also show as a button beside the pet on hover. */
export const PET_ACTIONS = ['chat', 'voice', 'roam', 'theme', 'sound', 'dress', 'hide'] as const;
export type PetAction = typeof PET_ACTIONS[number];
/** Most hover buttons. */
export const MAX_HOVER_BUTTONS = 6;

/** The hover buttons a config value names: known actions, each once, at most MAX_HOVER_BUTTONS. */
export function hoverButtonList(value: string): PetAction[] {
  const out: PetAction[] = [];
  for (const id of value.split(',').map((s) => s.trim())) {
    if ((PET_ACTIONS as readonly string[]).includes(id) && !out.includes(id as PetAction)) out.push(id as PetAction);
  }
  return out.slice(0, MAX_HOVER_BUTTONS);
}

/**
 * The body and how it is dressed, as the pages' `normalizeSkin` (web/coo/coo.js) reads it; unknown values fall back
 * to defaults there. Coo's picks are its own fields (palette and the four slots, with their colour channels);
 * a figure pack's are `scheme` (src/packs.ts).
 */
export interface PetSkin {
  /**
   * The figure pack on screen: coo (built in), whale (built in, web/whale), claude-chan (built in, web/claude-chan),
   * gpt-chan (built in, web/gpt-chan), gemini-chan (built in, web/gemini-chan), grok-chan (built in, web/grok-chan) or an
   * installed pack's id.
   */
  figure?: string;
  /** The pack's pick: a preset id, or its axes' options joined by `-`. */
  scheme?: string;
  palette: string;
  head: string;
  side: string;
  glasses: string;
  neck: string;
  colors: Record<string, { main: string; acc: string }>;
}

/** Kinds of the pet's sounds, the keys of `SOUND_KINDS` in web/sound.js; a pack's own sounds are filed under these too. */
export const SOUND_KINDS = ['move', 'touch', 'face', 'snore', 'talk', 'ui'] as const;
export type SoundKind = typeof SOUND_KINDS[number];
export type SoundSettings = Record<SoundKind, boolean> & {
  /** Snoring stops this many seconds into each sleep; the z's keep floating. 0 = snore the whole sleep. */
  snoreSeconds: number;
};

export type RoamMode = 'free' | 'calm' | 'off';
/** Which side of each palette the pet pages draw: dark = light figure for dark surroundings. */
export type PetTheme = 'dark' | 'light';
/** Which touches wake the bot: poke = clicks only, petting and carrying wait for the next wake; all; none = every touch waits. */
export type TouchWake = 'poke' | 'all' | 'none';
/** hold: listen while the talk key is held; toggle: each press starts or stops listening; always: listen all the time. */
export type MicMode = 'hold' | 'toggle' | 'always';
/** funasr: FunASR's SenseVoiceSmall in this process (one model download, every platform); system: the recognizer Windows ships (nothing to download, less accurate). */
export type AsrEngine = 'funasr' | 'system';

export interface DesktopPetConfigSection extends WorldSection {
  /** Local server for the pet page, the dressing page and the pet window's socket. */
  port: number;
  /** How events name the person at the computer. */
  user: string;
  window: {
    /** Open the pet window when the World starts. */
    enabled: boolean;
    /** Electron executable; empty uses CORTICO_DESKTOP_PET_HOST, then the managed runtime. */
    electronFile: string;
    /** Figure size on screen, 1 = 256 logo units drawn at 107 px. */
    scale: number;
    /** The bubbles' frame (widths, padding, corners, tail, distance from the head), 1 = as drawn by pet.css; the text keeps its size. */
    bubbleSize: number;
    /** The text in the bubbles and the icons on its lines, 1 = as drawn by pet.css; the bubbles keep their widths. */
    fontSize: number;
    /** The pet page draws 60 frames a second at rest too; off, it drops to 30 while the body stands, sits, lies or sleeps. */
    lockFrameRate: boolean;
    /** Hide the pet window while a fullscreen window covers the display it is on. */
    hideWhenFullscreen: boolean;
  };
  roam: RoamMode;
  /** All of the pet's sounds; `sounds` picks among them while this is on. */
  sound: boolean;
  sounds: SoundSettings;
  theme: PetTheme;
  /** Start each run where the pet stood when the World last stopped. */
  rememberPosition: boolean;
  /**
   * Where the pet stood when the World last stopped, as a share of the pet window's width (0..1), whichever
   * display the window was on; each start opens the window on the primary display. Written only on stop;
   * null when nothing is saved.
   */
  petX: number | null;
  /** Actions shown as buttons beside the pet on hover, ids from PET_ACTIONS joined by commas. */
  hoverButtons: string;
  /** Double-clicking the pet opens the typing box. */
  doubleClickChat: boolean;
  /** The bot may change its own looks and habits (src/self.ts), and asks before the rest. */
  selfAdjust: boolean;
  skin: PetSkin;
  /**
   * Decider mode (src/decider.ts): with an OpenRouter key lent by the app (`deciderKey`), the bot writes how it
   * feels and a decision model picks the expressions and motions; without a key this does nothing. Off by default:
   * the person turns it on (each decision sends what she says and feels to OpenRouter).
   */
  decider: {
    enabled: boolean;
    /** The OpenRouter decision model. */
    model: string;
    /** How long one decision may take before the bubble goes on without it. */
    timeoutMs: number;
  };
  /**
   * Small talk (src/smalltalk.ts): while the person is at the computer and has not talked to the pet for a while, or
   * has just come back, the bot is woken with a `[闲聊]` event and may say something, or nothing. Off by default.
   */
  smallTalk: {
    enabled: boolean;
    /** low / mid / high: at least 2 h / 1 h / 30 min between attempts, and since the last conversation. */
    frequency: SmallTalkFrequency;
    /** Quiet hours, local `HH:MM`, wrapping midnight when `quietFrom` is later; equal times mean none. */
    quietFrom: string;
    quietTo: string;
  };
  touch: {
    /** Clicks, petting and throws become events. */
    enabled: boolean;
    wakeOn: TouchWake;
  };
  asr: {
    enabled: boolean;
    /** Earlier versions wrote `auto` or `whisper` here; both now mean funasr. */
    engine: AsrEngine;
    language: string;
    /** CPU threads for one FunASR decode; 0 = two. */
    threads: number;
    simplified: boolean;
    timeoutMs: number;
    segment: SegmentConfig;
    mic: {
      mode: MicMode;
      /** Talk key for hold and toggle, names joined by `+` (see `src/asr/hotkey.ts`). */
      hotkey: string;
      /** Browser media device id of the microphone; empty uses the system default. */
      deviceId: string;
      /** Hold mode: the microphone opens when the talk key goes down and closes after it goes up; off keeps it open while voice input is on. */
      openOnPress: boolean;
    };
  };
}

export const DESKTOP_PET_DEFAULTS: DesktopPetConfigSection = {
  enabled: false,
  port: 7797,
  user: '伙伴',
  window: { enabled: true, electronFile: '', scale: 1, bubbleSize: 1, fontSize: 1, lockFrameRate: false, hideWhenFullscreen: false },
  roam: 'calm',
  sound: true,
  sounds: { move: true, touch: true, face: true, snore: true, talk: true, ui: true, snoreSeconds: 0 },
  theme: 'dark',
  rememberPosition: false,
  petX: null,
  hoverButtons: 'chat,voice',
  doubleClickChat: false,
  selfAdjust: true,
  skin: {
    figure: 'coo', scheme: 'deepseek', palette: 'mint', head: 'none', side: 'none', glasses: 'none', neck: 'none',
    colors: { head: { main: 'body', acc: 'eye' }, side: { main: 'eye', acc: 'eye' }, glasses: { main: 'body', acc: 'eye' }, neck: { main: 'eye', acc: 'eye' } },
  },
  decider: { enabled: false, model: DECIDER_DEFAULT_MODEL, timeoutMs: 2500 },
  smallTalk: { enabled: false, frequency: 'mid', quietFrom: '23:00', quietTo: '08:00' },
  touch: { enabled: true, wakeOn: 'poke' },
  asr: {
    enabled: true,
    engine: 'funasr',
    language: 'zh',
    threads: 0,
    simplified: true,
    timeoutMs: 20_000,
    segment: { thresholdDb: -42, minSpeechMs: 180, dispatchSilenceMs: 250, silenceMs: 600, maxUtteranceMs: 15_000, preRollMs: 320, minUtteranceMs: 350 },
    mic: { mode: 'hold', hotkey: DEFAULT_HOTKEY, deviceId: '', openOnPress: false },
  },
};

/** The range of `window.bubbleSize` and `window.fontSize` (the Habits page's sliders, 80%–160%). */
export const BUBBLE_SIZE_MIN = .8, BUBBLE_SIZE_MAX = 1.6;
/** A bubble or text size as the page takes it: a number in range, in steps of 5%; anything else is 1. */
export function bubbleFactor(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.round(Math.min(BUBBLE_SIZE_MAX, Math.max(BUBBLE_SIZE_MIN, v)) * 20) / 20;
}

const K = `worlds.${DESKTOP_PET_ID}`;

/** The pet's own config group, titled in `language` (the console request's). */
export function desktopPetConfigGroup(language: Language = 'zh'): ConfigGroup {
  const c = petText(language).config;
  return {
    id: `world:${DESKTOP_PET_ID}`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.group,
      properties: {
        [`${K}.user`]: { type: 'string', title: c.user.title, description: c.user.description, 'x-hot': true },
        [`${K}.roam`]: { type: 'string', title: c.roam.title, enum: ['free', 'calm', 'off'], description: c.roam.description, 'x-hot': true },
        [`${K}.theme`]: { type: 'string', title: c.theme.title, enum: ['dark', 'light'], description: c.theme.description, 'x-hot': true },
        [`${K}.rememberPosition`]: { type: 'boolean', title: c.rememberPosition.title, description: c.rememberPosition.description, 'x-hot': true },
        [`${K}.hoverButtons`]: { type: 'string', title: c.hoverButtons.title, description: c.hoverButtons.description(MAX_HOVER_BUTTONS, PET_ACTIONS.join(', ')), 'x-hot': true },
        [`${K}.doubleClickChat`]: { type: 'boolean', title: c.doubleClickChat.title, description: c.doubleClickChat.description, 'x-hot': true },
        [`${K}.selfAdjust`]: { type: 'boolean', title: c.selfAdjust.title, description: c.selfAdjust.description, 'x-hot': true },
        [`${K}.window.enabled`]: { type: 'boolean', title: c.windowEnabled.title, 'x-hot': false },
        [`${K}.window.scale`]: { type: 'number', title: c.scale.title, minimum: .5, maximum: 2, multipleOf: .05, 'x-hot': true },
        [`${K}.window.bubbleSize`]: { type: 'number', title: c.bubbleSize.title, description: c.bubbleSize.description, minimum: BUBBLE_SIZE_MIN, maximum: BUBBLE_SIZE_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.fontSize`]: { type: 'number', title: c.fontSize.title, description: c.fontSize.description, minimum: BUBBLE_SIZE_MIN, maximum: BUBBLE_SIZE_MAX, multipleOf: .05, 'x-hot': true },
        [`${K}.window.lockFrameRate`]: { type: 'boolean', title: c.lockFrameRate.title, description: c.lockFrameRate.description, 'x-hot': true },
        // only the Windows window process tells another program's full screen (host/electron-main.cjs `fullscreen`); unregistered, the Habits page hides it too
        ...(process.platform === 'win32' ? {
          [`${K}.window.hideWhenFullscreen`]: { type: 'boolean', title: c.hideWhenFullscreen.title, description: c.hideWhenFullscreen.description, 'x-hot': true },
        } : {}),
        [`${K}.window.electronFile`]: { type: 'string', title: c.electronFile.title, description: c.electronFile.description, 'x-path': { kind: 'file' }, 'x-hot': false },
        [`${K}.port`]: { type: 'integer', title: c.port.title, minimum: 1024, maximum: 65535, description: c.port.description, 'x-hot': false },
        [`${K}.smallTalk.enabled`]: { type: 'boolean', title: c.smallTalk.title, description: c.smallTalk.description, 'x-hot': true },
        [`${K}.smallTalk.frequency`]: { type: 'string', title: c.smallTalkFrequency.title, enum: ['low', 'mid', 'high'], description: c.smallTalkFrequency.description, 'x-hot': true },
        [`${K}.smallTalk.quietFrom`]: { type: 'string', title: c.quietFrom.title, description: c.quietFrom.description, 'x-hot': true },
        [`${K}.smallTalk.quietTo`]: { type: 'string', title: c.quietTo.title, description: c.quietTo.description, 'x-hot': true },
        [`${K}.touch.enabled`]: { type: 'boolean', title: c.touchEnabled.title, description: c.touchEnabled.description, 'x-hot': true },
        [`${K}.touch.wakeOn`]: { type: 'string', title: c.touchWakeOn.title, enum: ['poke', 'all', 'none'], description: c.touchWakeOn.description, 'x-hot': true },
      },
    },
  };
}

/** The sound settings, titled in `language`. */
export function desktopPetSoundConfigGroup(language: Language = 'zh'): ConfigGroup {
  const c = petText(language).config;
  const s = c.sounds;
  return {
    id: `world:${DESKTOP_PET_ID}:sound`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.soundGroup,
      properties: {
        [`${K}.sound`]: { type: 'boolean', title: c.sound.title, description: c.sound.description, 'x-hot': true },
        [`${K}.sounds.move`]: { type: 'boolean', title: s.move.title, description: s.move.description, 'x-hot': true },
        [`${K}.sounds.touch`]: { type: 'boolean', title: s.touch.title, description: s.touch.description, 'x-hot': true },
        [`${K}.sounds.face`]: { type: 'boolean', title: s.face.title, description: s.face.description, 'x-hot': true },
        [`${K}.sounds.snore`]: { type: 'boolean', title: s.snore.title, 'x-hot': true },
        [`${K}.sounds.snoreSeconds`]: { type: 'integer', title: c.snoreSeconds.title, minimum: 0, maximum: 3600, 'x-suffix': c.snoreSeconds.suffix, description: c.snoreSeconds.description, 'x-hot': true },
        [`${K}.sounds.talk`]: { type: 'boolean', title: s.talk.title, description: s.talk.description, 'x-hot': true },
        [`${K}.sounds.ui`]: { type: 'boolean', title: s.ui.title, description: s.ui.description, 'x-hot': true },
      },
    },
  };
}

/** The decision-model settings, titled in `language`. */
export function desktopPetDeciderConfigGroup(language: Language = 'zh'): ConfigGroup {
  const c = petText(language).config;
  return {
    id: `world:${DESKTOP_PET_ID}:decider`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.deciderGroup,
      properties: {
        [`${K}.decider.enabled`]: { type: 'boolean', title: c.deciderEnabled.title, description: c.deciderEnabled.description, 'x-hot': true },
        [`${K}.decider.model`]: { type: 'string', title: c.deciderModel.title, description: c.deciderModel.description(DECIDER_DEFAULT_MODEL), 'x-hot': true },
        [`${K}.decider.timeoutMs`]: { type: 'integer', title: c.deciderTimeout.title, minimum: 500, maximum: 10000, 'x-suffix': 'ms', description: c.deciderTimeout.description, 'x-hot': true },
      },
    },
  };
}

/** The voice input settings, titled in `language`. */
export function desktopPetAsrConfigGroup(language: Language = 'zh'): ConfigGroup {
  const c = petText(language).config;
  return {
    id: `world:${DESKTOP_PET_ID}:asr`,
    owner: `world:${DESKTOP_PET_ID}`,
    schema: {
      type: 'object',
      title: c.asrGroup,
      properties: {
        [`${K}.asr.enabled`]: { type: 'boolean', title: c.asrEnabled.title, 'x-hot': true },
        [`${K}.asr.engine`]: { type: 'string', title: c.asrEngine.title, enum: ['funasr', 'system'], description: c.asrEngine.description, 'x-hot': true },
        [`${K}.asr.language`]: { type: 'string', title: c.asrLanguage.title, description: c.asrLanguage.description, 'x-hot': true },
        [`${K}.asr.threads`]: { type: 'integer', title: c.asrThreads.title, minimum: 0, maximum: 16, description: c.asrThreads.description, 'x-hot': true },
        [`${K}.asr.simplified`]: { type: 'boolean', title: c.asrSimplified.title, 'x-hot': true },
        [`${K}.asr.segment.thresholdDb`]: { type: 'number', title: c.thresholdDb.title, minimum: -80, maximum: 0, 'x-suffix': 'dBFS', 'x-hot': true },
        [`${K}.asr.segment.silenceMs`]: { type: 'integer', title: c.silenceMs.title, minimum: 200, maximum: 5000, 'x-suffix': 'ms', 'x-hot': true },
        [`${K}.asr.segment.maxUtteranceMs`]: { type: 'integer', title: c.maxUtteranceMs.title, minimum: 2000, maximum: 60000, 'x-suffix': 'ms', 'x-hot': true },
      },
    },
  };
}

/** The console's config groups in the order the World page lists them, titled in `language`. */
export function desktopPetConfigGroups(language: Language = 'zh'): ConfigGroup[] {
  return [desktopPetConfigGroup(language), desktopPetSoundConfigGroup(language), desktopPetAsrConfigGroup(language), desktopPetDeciderConfigGroup(language)];
}

/** The config groups in Chinese, as earlier versions exported them. */
export const DESKTOP_PET_CONFIG_GROUP: ConfigGroup = desktopPetConfigGroup('zh');
export const DESKTOP_PET_SOUND_CONFIG_GROUP: ConfigGroup = desktopPetSoundConfigGroup('zh');
export const DESKTOP_PET_DECIDER_CONFIG_GROUP: ConfigGroup = desktopPetDeciderConfigGroup('zh');
export const DESKTOP_PET_ASR_CONFIG_GROUP: ConfigGroup = desktopPetAsrConfigGroup('zh');
