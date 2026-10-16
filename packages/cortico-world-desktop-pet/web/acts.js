/**
 * The pet page's queue of vocabulary words (`pet_act`, a script's markers, the actions of an app's dialog step):
 * one entry at a time, each started once the body is free (its layout not `busy`), the next once the one playing
 * lets it go: after the word's `seconds`, or sooner when the body reports it `done`.
 *
 * An entry may be a group of words done at once, their ids joined by '+' (`sit+wave+happy`, src/script.ts): it holds
 * the queue until its longest member is over, or each member is reported done.
 *
 * A walk or run asked for as a word crosses the stage, which on a wide screen takes longer than its seconds. Past
 * them the next entry still waits while the body is in that walk (its layout's `mode`), until it reports the word
 * done or stops walking, and at most WALK_MAX seconds after the entry started, so a body that never says done
 * cannot hold the queue for good.
 */
export const WALK_MAX = 90;
const WALKS = new Set(['walk', 'run']);

export function createActs() {
  const list = [];
  /** When each member of the entry playing lets go (-1 once reported done), when it started, and when it lets the next one start. */
  let ends = null, since = 0, until = 0;
  return {
    get length() { return list.length; },
    push(...ws) { list.push(...ws); },
    /**
     * At page time `T`, starts the next entry if it may: `layout` is the body's (body-host.js `readLayout`, null
     * before its first frame), `play(entry)` does it (a word, or a group joined by '+'), `seconds(word)` is how long
     * a word holds the queue at most. Returns the entry started, or null.
     */
    step(T, layout, play, seconds) {
      if (!list.length || T < until || !layout || layout.busy) return null;
      // a walk or run in the entry holds the next one while the body is in it (at most WALK_MAX)
      if (ends && [...ends].some(([m, e]) => WALKS.has(m) && e > -1 && layout.mode === m) && T < since + WALK_MAX) return null;
      const w = list.shift();
      play(w);
      ends = new Map(w.split('+').map((m) => [m, T + seconds(m)]));
      since = T; until = Math.max(...ends.values());
      return w;
    },
    /** The body reported word `m` done (a walk that stopped, a word it could not take): it stops holding the entry. */
    done(m, T) {
      if (!ends?.has(m) || ends.get(m) < 0) return;
      ends.set(m, -1);
      const left = [...ends.values()].filter((e) => e > -1);
      until = left.length ? Math.max(T, ...left) : T;
      if (!left.length) ends = null;
    },
  };
}

/**
 * Decider mode (src/decider.ts): a bubble is sent before its words are picked (`say` with `acts: 'pending'` and
 * `holdMs`), and its words follow by id (`say-acts`). These two keep that apart from the page so it can be tested.
 *
 * `sayHeld(it, T)`: whether bubble `it`, about to start, still waits for its words: at most `holdMs` from the first
 * time it was asked (the moment the bubble's turn came, not when it was queued), the body meanwhile in its thinking face.
 *
 * `attachSayActs(queue, current, id, actions)`: the words for bubble `id`. A bubble still queued, or the current one
 * not yet started, gets them as its first beat's words (done before typing, as a script's leading marker is); the
 * current one already typing gets nothing attached, and the caller does them at once (`'late'`); an id no longer
 * there (said and gone) is dropped (`'missing'`). Either way the bubble no longer waits.
 */
export const SAY_HOLD_MS = 1100;

export function sayHeld(it, T) {
  if (!it || !it.pending) return false;
  if (it.waitUntil === undefined) it.waitUntil = T + (Number.isFinite(it.holdMs) ? it.holdMs : SAY_HOLD_MS) / 1000;
  if (T < it.waitUntil) return true;
  // gave up waiting: words that come later are done when they come
  it.pending = false;
  return false;
}

export function attachSayActs(queue, current, id, actions) {
  const list = Array.isArray(actions) ? actions.filter((a) => typeof a === 'string' && a) : [];
  const it = current && current.kind === 'say' && current.id === id ? current : queue.find((q) => q.kind === 'say' && q.id === id);
  if (!it) return 'missing';
  const started = it === current && it.i >= 0;
  it.pending = false;
  if (started) return 'late';
  const first = it.beats[0];
  if (first) first.actions = [...list, ...(first.actions || [])];
  return it === current ? 'waiting' : 'queued';
}
