/**
 * What the pet page is told about its window being shown (`pet:shown`), whatever order the platform's
 * window events come in.
 *
 * The page mutes its sounds and stops drawing while it is told the window is hidden. The window is
 * created hidden and shown once it is ready; on macOS the page finishes loading first and the window's
 * `show` event follows, but on Windows and X11 that order (and whether `show` fires at all for the
 * first map) is not something to rely on: a page told "hidden" at load and never told "shown" would
 * stay silent from launch. So:
 *
 * - nothing is said before the window has been shown once: a window not yet shown is not a hidden
 *   pet, and the page starts out as shown;
 * - after that every change is said once (`update`, fed from the `show` / `hide` events, and with
 *   `true` only from the window process's own poll of `isVisible()`, so a missed or late show is
 *   caught up within a poll while a hide is said only by its event);
 * - a page that (re)loads while the window is visible hears shown; otherwise it hears the last state
 *   said (`loaded`), so one reloaded after a hide starts out hidden, one reloaded while `isVisible()`
 *   reads false with no hide said stays shown, and one loaded before the first show hears nothing.
 *
 * Kept apart from Electron so it can be tested.
 */
function createShownReport() {
  let seen = false, said = null;
  return {
    /** The window is (`visible`) shown or not now: the value to send the page, or null when there is nothing new to say. */
    update(visible) {
      const v = !!visible;
      if (v) seen = true;
      if (!seen || said === v) return null;
      said = v;
      return v;
    },
    /** A page finished loading with the window `visible` or not: what to send it (shown when visible, else the last state said), or null before the first show. */
    loaded(visible) {
      if (visible) { seen = true; said = true; }
      return seen ? said : null;
    },
    /** Whether the window has been shown at least once. */
    get seen() { return seen; },
  };
}

module.exports = { createShownReport };
