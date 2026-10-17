/**
 * The app's `companion:presence` messages (app/presence.cjs) as the Core keeps them for the pet's small talk: the
 * last report and when it came. The World treats a report older than two minutes as none (PRESENCE_STALE_MS).
 */
export interface PresenceReport { idleSec: number; locked: boolean; at: number }

/** The report a message carries, or null when it is not a well-formed `companion:presence`. */
export function presenceFrom(msg: unknown, now: number): PresenceReport | null {
  const m = msg as { type?: unknown; idleSec?: unknown; locked?: unknown } | null;
  if (m?.type !== 'companion:presence' || typeof m.idleSec !== 'number' || !Number.isFinite(m.idleSec)) return null;
  return { idleSec: Math.max(0, m.idleSec), locked: m.locked === true, at: now };
}
