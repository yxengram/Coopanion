/**
 * Small talk (upstream issue #210): the pet may start a short conversation on its own while the person is at the
 * computer but has not talked to it for a while, or has just come back to it. Opt-in (`smallTalk.enabled`, off by
 * default); the World looks every SMALLTALK_TICK_MS and, when every gate below lets it, wakes the bot with one
 * `[闲聊]` event saying how long it has been, the time of day and the last thing the person said. The bot decides
 * what to say, or stays quiet: an attempt counts whether or not it speaks, so a bot that declines is not asked again
 * before the frequency's gap has passed.
 *
 * Kept apart from the World so the gating can be tested with plain numbers. Whether the person is at the computer
 * comes from the embedding app (`presence`: the system's idle time and screen lock, Electron's powerMonitor); without
 * it there is no telling an empty room from a quiet one, and small talk never starts.
 */

export type SmallTalkFrequency = 'low' | 'mid' | 'high';

/** Least time between two attempts, and since the last conversation, for each frequency (少 2 h, 中 1 h, 多 30 min). */
export const SMALLTALK_GAP_MS: Readonly<Record<SmallTalkFrequency, number>> = { low: 2 * 3600_000, mid: 3600_000, high: 30 * 60_000 };
/** How often the World looks whether to start small talk. */
export const SMALLTALK_TICK_MS = 30_000;
/** The person counts as at the computer while the system has seen input within this long. */
export const PRESENT_IDLE_S = 5 * 60;
/** No input for this long is being away, and input again after it is coming back; a lock or sleep counts only when
 * the person was gone (no input before it, then locked or asleep) at least this long all told. */
export const AWAY_IDLE_S = 15 * 60;
/** A greeting on coming back is offered for this long after the person is back. */
export const BACK_WINDOW_MS = 5 * 60_000;
/** A wake-up the bot set for itself (alarm_set) due within this long: it will speak then, small talk waits. */
export const ALARM_SOON_MS = 15 * 60_000;
/** A presence report older than this is no report (the app went quiet). */
export const PRESENCE_STALE_MS = 2 * 60_000;
/** A `[闲聊]` waiting this long without being delivered (paused, no key) says nothing when it finally is. */
export const SMALLTALK_STALE_MS = 10 * 60_000;
/** The last thing the person said is mentioned while it is at most this old. */
export const TOPIC_MAX_AGE_MS = 12 * 3600_000;
const TOPIC_MAX_CHARS = 60;

/** What the embedding app reports of the person at the computer. */
export interface Presence {
  /** Seconds since the system last saw keyboard or mouse input. */
  idleSec: number;
  /** The screen is locked (or the computer about to sleep). */
  locked: boolean;
}

/** Everything one look weighs; times are epoch ms. */
export interface SmallTalkSignals {
  now: number;
  enabled: boolean;
  frequency: SmallTalkFrequency;
  /** Quiet hours, `HH:MM` local; equal times mean none. */
  quietFrom: string;
  quietTo: string;
  timezone: string;
  /** null: the app does not report it (or its last report is stale). */
  presence: Presence | null;
  /** The pet page is connected and its window shown. */
  shown: boolean;
  /** A full screen window covers the pet's display (Windows; elsewhere never known). */
  fullscreen: boolean;
  /** The bot is paused from the menu or held (no key). */
  paused: boolean;
  /** `pet_quiet` is in force. */
  quiet: boolean;
  /** The pet is asleep. */
  asleep: boolean;
  /** Why the pet is busy with the person right now (typing box open, question up, bot running, listening…), or null. */
  busy: string | null;
  /** Last time anything passed between them: the person typed, spoke, answered or touched, or the bot ran. */
  lastTalkAt: number;
  /** Last small-talk attempt (or the World's start). */
  lastAttemptAt: number;
  /** The next wake-up the bot set for itself, or null. */
  nextAlarmAt: number | null;
}

export type SmallTalkVerdict =
  | { go: true; occasion: 'back' | 'lull'; awayMin: number; sinceTalkMin: number; idleMin: number }
  | { go: false; why: string };

/** Minutes since local midnight of `ms` in `timezone`. */
export function localMinutes(timezone: string, ms: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

/** `HH:MM` as minutes since midnight, or null. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1]! > 23 || +m[2]! > 59) return null;
  return +m[1]! * 60 + +m[2]!;
}

/** Whether `minutes` (since midnight) falls in quiet hours from `from` to `to` (they may wrap midnight; equal = none). */
export function inQuietHours(minutes: number, from: string, to: string): boolean {
  const a = parseClock(from), b = parseClock(to);
  if (a === null || b === null || a === b) return false;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** The part of the day an hour is in, as the event names it. */
export function partOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  if (h < 5) return '深夜';
  if (h < 8) return '清晨';
  if (h < 11) return '上午';
  if (h < 13) return '中午';
  if (h < 17) return '下午';
  if (h < 19) return '傍晚';
  if (h < 23) return '晚上';
  return '深夜';
}

/**
 * The state small talk keeps between looks: when the last attempt was, and whether the person was away and came back.
 * The World feeds it every presence report (`observe`), asks it on every look (`decide`) and tells it of each attempt
 * delivered (`attempted`).
 */
export class SmallTalk {
  private lastAttempt: number;
  /** Since when the person may have been away (no input for AWAY_IDLE_S, or locked: since their last input), or null. */
  private awayFrom: number | null = null;
  /** When the person came back, and how long they had been away. */
  private backAt: { at: number; awayMs: number } | null = null;

  constructor(startedAt: number) {
    // a start is not a lull: the first attempt waits a whole gap
    this.lastAttempt = startedAt;
  }

  get lastAttemptAt(): number { return this.lastAttempt; }

  /**
   * One presence report: tracks going away and coming back. A short lock or sleep (a lid closed for a moment, the
   * screen locked on the way to the coffee machine) is no absence: coming back from it offers no greeting.
   */
  observe(now: number, p: Presence | null): void {
    if (!p) return;
    const away = p.locked || p.idleSec >= AWAY_IDLE_S;
    if (away) {
      // gone since the last input, which for a lock is usually just before it
      const from = now - p.idleSec * 1000;
      this.awayFrom = this.awayFrom === null ? from : Math.min(this.awayFrom, from);
      this.backAt = null;
      return;
    }
    if (this.awayFrom !== null && p.idleSec < PRESENT_IDLE_S) {
      // input again: back since the last input, a greeting only after a real absence
      const at = now - p.idleSec * 1000;
      const awayMs = at - this.awayFrom;
      this.backAt = awayMs >= AWAY_IDLE_S * 1000 ? { at, awayMs } : null;
      this.awayFrom = null;
    }
  }

  attempted(now: number): void {
    this.lastAttempt = now;
    this.backAt = null;
  }

  /** Whether to start small talk now, and on what occasion; or the first gate that holds it back. */
  decide(s: SmallTalkSignals): SmallTalkVerdict {
    if (!s.enabled) return { go: false, why: 'off' };
    if (!s.presence) return { go: false, why: 'no presence' };
    if (s.presence.locked) return { go: false, why: 'locked' };
    if (s.presence.idleSec >= PRESENT_IDLE_S) return { go: false, why: 'away' };
    if (!s.shown) return { go: false, why: 'hidden' };
    if (s.fullscreen) return { go: false, why: 'fullscreen' };
    if (s.paused) return { go: false, why: 'paused' };
    if (s.quiet) return { go: false, why: 'pet_quiet' };
    if (s.asleep) return { go: false, why: 'asleep' };
    if (inQuietHours(localMinutes(s.timezone, s.now), s.quietFrom, s.quietTo)) return { go: false, why: 'quiet hours' };
    if (s.busy) return { go: false, why: s.busy };
    if (s.nextAlarmAt !== null && s.nextAlarmAt - s.now <= ALARM_SOON_MS) return { go: false, why: 'alarm soon' };
    const gap = SMALLTALK_GAP_MS[s.frequency] ?? SMALLTALK_GAP_MS.mid;
    if (s.now - this.lastAttempt < gap) return { go: false, why: 'rate limit' };
    const idleMin = Math.floor(s.presence.idleSec / 60);
    const sinceTalkMin = Math.floor((s.now - s.lastTalkAt) / 60_000);
    // just back after a while away: a greeting, though the gap since they last talked is shorter
    const back = this.backAt;
    if (back && s.now - back.at <= BACK_WINDOW_MS && back.at > s.lastTalkAt) {
      return { go: true, occasion: 'back', awayMin: Math.round(back.awayMs / 60_000), sinceTalkMin, idleMin };
    }
    if (s.now - s.lastTalkAt < gap) return { go: false, why: 'recent talk' };
    return { go: true, occasion: 'lull', awayMin: 0, sinceTalkMin, idleMin };
  }
}

/** The `[闲聊]` event's text. `topic`: the last thing the person said and how long ago, if any. */
export function smallTalkText(
  v: Extract<SmallTalkVerdict, { go: true }>, user: string, minutes: number, topic: { text: string; agoMin: number } | null,
): string {
  const ago = (m: number) => (m >= 120 ? `${Math.round(m / 60)} 小时` : `${m} 分钟`);
  const head = v.occasion === 'back'
    ? `[闲聊] ${user}离开电脑大约 ${ago(Math.max(1, v.awayMin))},刚回来。`
    : `[闲聊] ${user}在电脑前,你们已经 ${ago(v.sinceTalkMin)}没说话了${v.idleMin >= 1 ? `(${user}有 ${v.idleMin} 分钟没碰键盘鼠标)` : ''}。`;
  const said = topic
    ? `${user}上次说的是(${ago(topic.agoMin)}前):「${topic.text.length > TOPIC_MAX_CHARS ? `${topic.text.slice(0, TOPIC_MAX_CHARS)}…` : topic.text}」。`
    : '';
  return [
    `${head}现在是${partOfDay(minutes)}。${said}`,
    `想的话可以主动搭一句:${v.occasion === 'back' ? '欢迎回来、' : ''}打个招呼、聊聊这个时间、接着之前的话题,或者温和地提醒一下(喝水、活动活动、该休息了)。一两句就好,别追问。`,
    '没什么想说的,或者觉得对方在忙,就什么也不做,不用回应这条。',
  ].join('\n');
}
