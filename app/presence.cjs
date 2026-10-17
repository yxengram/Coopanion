'use strict';
/**
 * Whether the person is at the computer, for the pet's small talk (packages/cortico-world-desktop-pet/src/smalltalk.ts):
 * the seconds since the system last saw keyboard or mouse input, and whether the screen is locked (or the computer
 * asleep), sent to the Core as `companion:presence` every PRESENCE_EVERY_MS, at once when it locks, unlocks, sleeps or
 * wakes, and when it is ready. Nothing else is read. The raw report stays on this computer (it is not in the usage
 * statistics); a `[闲聊]` event the World builds from it tells the model roughly how long the person has been idle or
 * away, and that text goes to the model vendor like any other event.
 */

/** How often the Core hears whether the person is at the computer. */
const PRESENCE_EVERY_MS = 30_000;

/**
 * Starts the reports. `powerMonitor` is Electron's (or a fake with the same methods and events), `send` posts one
 * message to the Core, `onReady(fn)` calls `fn` each time the Core is ready. Returns `stop`.
 */
function startPresence({ powerMonitor, send, onReady, every = PRESENCE_EVERY_MS }) {
  let locked = false;
  const tell = () => {
    let idleSec, state;
    try { idleSec = powerMonitor.getSystemIdleTime(); state = powerMonitor.getSystemIdleState(60); } catch { return; }
    if (typeof idleSec !== 'number' || !Number.isFinite(idleSec)) return;
    send({ type: 'companion:presence', idleSec, locked: locked || state === 'locked' });
  };
  powerMonitor.on('lock-screen', () => { locked = true; tell(); });
  powerMonitor.on('unlock-screen', () => { locked = false; tell(); });
  powerMonitor.on('suspend', () => { locked = true; tell(); });
  powerMonitor.on('resume', () => { locked = false; tell(); });
  onReady?.(tell);
  const timer = setInterval(tell, every);
  return { stop: () => clearInterval(timer) };
}

module.exports = { PRESENCE_EVERY_MS, startPresence };
