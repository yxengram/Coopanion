/**
 * 说话声's settings and timing on the World's side (upstream #263): the five keys in the sound group (the 「习惯」 page saves
 * them there), what the page is sent for each step or a custom number, an install saved before the speech existed, and
 * the `pet_say` estimate that follows the speech's typing steps (src/speech speechTextSteps; tests/pet-speech-page.test.js checks
 * they are web/speech.js's).
 */
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_PET_DEFAULTS, SPEECH_PITCH_HZ, SPEECH_PITCH_MAX, SPEECH_PITCH_MIN, SPEECH_RATE, SPEECH_RATE_MAX, SPEECH_RATE_MIN,
  desktopPetConfigGroups, desktopPetSoundConfigGroup, speechFor,
} from '../src/config.ts';
import { estimateSeconds, parseScript } from '../src/script.ts';
import { speechTextSteps } from '../src/speech/index.ts';

const KEYS = ['enabled', 'pitch', 'pitchHz', 'speed', 'unitsPerSecond'].map((k) => `worlds.desktop-pet.speech.${k}`);

describe('speech settings', () => {
  it('is off by default at the middle steps', () => {
    expect(DESKTOP_PET_DEFAULTS.speech).toEqual({ enabled: false, pitch: 'mid', pitchHz: 400, speed: 'mid', unitsPerSecond: 13 });
    expect(speechFor(DESKTOP_PET_DEFAULTS.speech)).toEqual({ enabled: false, pitchHz: 400, unitsPerSecond: 13 });
  });

  it('lists its keys in the sound group only, hot, in both languages', () => {
    for (const language of ['zh', 'en'] as const) {
      const sound = desktopPetSoundConfigGroup(language).schema.properties as Record<string, { title: string; 'x-hot'?: boolean }>;
      for (const k of KEYS) {
        expect(sound[k], `${language} ${k}`).toBeTruthy();
        expect(sound[k]!['x-hot']).toBe(true);
      }
      for (const g of desktopPetConfigGroups(language).filter((g) => !g.id.endsWith(':sound'))) {
        for (const k of KEYS) expect(Object.keys(g.schema.properties ?? {})).not.toContain(k);
      }
    }
    const zh = desktopPetSoundConfigGroup('zh').schema.properties as Record<string, { title: string; description?: string }>;
    expect(zh['worlds.desktop-pet.speech.enabled']!.title).toBe('说话声');
    expect(zh['worlds.desktop-pet.speech.pitch']!.description).toBe('low、mid、high 依次为 300、400、500 Hz;custom 用自定义音高。');
  });

  it('sends a step its own number, and custom the saved one kept within range', () => {
    expect(speechFor({ enabled: true, pitch: 'low', pitchHz: 650, speed: 'high', unitsPerSecond: 7 })).toEqual({ enabled: true, pitchHz: SPEECH_PITCH_HZ.low, unitsPerSecond: SPEECH_RATE.high });
    expect(speechFor({ enabled: true, pitch: 'custom', pitchHz: 650, speed: 'custom', unitsPerSecond: 7 })).toEqual({ enabled: true, pitchHz: 650, unitsPerSecond: 7 });
    expect(speechFor({ enabled: true, pitch: 'custom', pitchHz: 5000, speed: 'custom', unitsPerSecond: 0 })).toEqual({ enabled: true, pitchHz: SPEECH_PITCH_MAX, unitsPerSecond: SPEECH_RATE_MIN });
    expect(speechFor({ enabled: true, pitch: 'custom', pitchHz: 1, speed: 'custom', unitsPerSecond: 99 })).toEqual({ enabled: true, pitchHz: SPEECH_PITCH_MIN, unitsPerSecond: SPEECH_RATE_MAX });
    // a hand edit: an unknown step or a custom without a number is the middle one; anything but true is off
    expect(speechFor({ enabled: 'yes' as never, pitch: 'loud' as never, pitchHz: 400, speed: 'custom', unitsPerSecond: Number.NaN })).toEqual({ enabled: false, pitchHz: 400, unitsPerSecond: 13 });
  });

  it('reads as off from a config saved before the speech existed', () => {
    expect(speechFor(undefined)).toEqual({ enabled: false, pitchHz: 400, unitsPerSecond: 13 });
    expect(speechFor({})).toEqual({ enabled: false, pitchHz: 400, unitsPerSecond: 13 });
  });
});

describe('speech timing', () => {
  it('estimates a bubble by the speech steps while it is on, and as before while off', () => {
    const zh = parseScript('今天天气真好,我们出去走走吧。', []).beats;
    expect(estimateSeconds(zh, 1, undefined)).toBe(estimateSeconds(zh, 1));
    // Han characters are one step either way; the pause marks wait longer with speech
    expect(estimateSeconds(zh, 1, speechTextSteps)).toBeGreaterThan(estimateSeconds(zh, 1));
    // letters type faster with speech
    const en = parseScript('What a lovely day it is today, let us go for a walk.', []).beats;
    expect(estimateSeconds(en, 1, speechTextSteps)).toBeLessThan(estimateSeconds(en, 1));
    expect(estimateSeconds(en, 2, speechTextSteps)).toBeLessThan(estimateSeconds(en, 1, speechTextSteps));
  });
});
