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
