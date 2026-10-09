/**
 * The pet page's queue of vocabulary words (`pet_act`, a script's markers, the actions of an app's dialog step):
 * one word at a time, each started once the body is free (its layout not `busy`), the next once the one playing
 * lets it go: after the word's `seconds`, or sooner when the body reports it `done`.
 *
 * A walk or run asked for as a word crosses the stage, which on a wide screen takes longer than its seconds. Past
 * them the next word still waits while the body is in that walk (its layout's `mode`), until it reports the word
 * done or stops walking, and at most WALK_MAX seconds after the word started, so a body that never says done
 * cannot hold the queue for good.
 */
export const WALK_MAX = 90;
const WALKS = new Set(['walk', 'run']);

export function createActs() {
  const list = [];
  /** The word playing, when it started, and when it lets the next one start. */
  let word = null, since = 0, until = 0;
  return {
    get length() { return list.length; },
    push(...ws) { list.push(...ws); },
    /**
     * At page time `T`, starts the next word if it may: `layout` is the body's (body-host.js `readLayout`, null
     * before its first frame), `play(word)` does it, `seconds(word)` is how long it holds the queue at most.
     * Returns the word started, or null.
     */
    step(T, layout, play, seconds) {
      if (!list.length || T < until || !layout || layout.busy) return null;
      if (WALKS.has(word) && layout.mode === word && T < since + WALK_MAX) return null;
      const w = list.shift();
      play(w);
      word = w; since = T; until = T + seconds(w);
      return w;
    },
    /** The body reported `w` done (a walk that stopped, a word it could not take): the next word may start now. */
    done(w, T) {
      if (w !== word) return;
      word = null; until = T;
    },
  };
}
