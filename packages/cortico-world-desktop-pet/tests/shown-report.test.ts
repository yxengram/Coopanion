import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/** `host/` is plain CommonJS outside the TypeScript project: the helper is reached through this facade. */
const require_ = createRequire(import.meta.url);
const { createShownReport } = require_('../host/shown.cjs') as {
  createShownReport: () => { update(visible: boolean): boolean | null; loaded(visible: boolean): boolean | null; readonly seen: boolean };
};

describe('what the pet page is told about its window being shown (host/shown.cjs)', () => {
  it('says nothing before the window was first shown: a page loaded before the first show starts out shown', () => {
    const r = createShownReport();
    // macOS: the page loads while the window is still hidden, then the window shows
    expect(r.loaded(false)).toBe(null);
    expect(r.update(false)).toBe(null);
    expect(r.seen).toBe(false);
    expect(r.update(true)).toBe(true);
    expect(r.seen).toBe(true);
  });

  it("a first `show` that never comes cannot leave the pet silent: the poll's `isVisible()` catches up, and before it nothing muted it", () => {
    const r = createShownReport();
    const sent: boolean[] = [];
    const tell = (v: boolean | null) => { if (v !== null) sent.push(v); };
    tell(r.loaded(false));
    // poll ticks while the window is not yet mapped, then mapped with no `show` event
    tell(r.update(false));
    tell(r.update(false));
    tell(r.update(true));
    tell(r.update(true));
    expect(sent).toEqual([true]);
  });

  it('either order of load and show: the page ends up shown, and is never told hidden on the way', () => {
    for (const order of [['load', 'show'], ['show', 'load']] as const) {
      const r = createShownReport();
      let visible = false;
      const sent: boolean[] = [];
      for (const e of order) {
        if (e === 'show') { visible = true; const v = r.update(true); if (v !== null) sent.push(v); }
        else { const v = r.loaded(visible); if (v !== null) sent.push(v); }
      }
      expect(sent.includes(false), order.join('→')).toBe(false);
      expect(sent.at(-1), order.join('→')).toBe(true);
    }
  });

  it('after the first show, real hides and shows are said once each, whichever of the event and the poll comes first', () => {
    const r = createShownReport();
    expect(r.update(true)).toBe(true);
    expect(r.update(true)).toBe(null);
    // hidden: the `hide` event, then the poll sees it too
    expect(r.update(false)).toBe(false);
    expect(r.update(false)).toBe(null);
    // shown again, seen first by the poll and then by a late `show`
    expect(r.update(true)).toBe(true);
    expect(r.update(true)).toBe(null);
  });

  it('a page reloaded while the window is hidden is told so; one reloaded while shown is told shown', () => {
    const r = createShownReport();
    r.update(true);
    r.update(false);
    expect(r.loaded(false)).toBe(false);
    expect(r.update(false)).toBe(null);
    expect(r.update(true)).toBe(true);
    expect(r.loaded(true)).toBe(true);
    expect(r.update(true)).toBe(null);
  });

  it("a false `isVisible()` with no `hide` said never mutes: the poll feeds only shows, and a reload then hears shown", () => {
    const r = createShownReport();
    const sent: boolean[] = [];
    const tell = (v: boolean | null) => { if (v !== null) sent.push(v); };
    // as electron-main.cjs feeds it: the events both ways, the poll only when it reads visible
    const poll = (visible: boolean) => { if (visible) tell(r.update(true)); };
    tell(r.loaded(false));
    poll(false);
    poll(true);
    // covered, locked or whatever else reads as not visible, with no `hide` event: nothing said
    poll(false);
    poll(false);
    tell(r.loaded(false));
    expect(sent).toEqual([true, true]);
    // a real hide is said by its event, and a reload after it hears hidden; the poll catches a missed show
    tell(r.update(false));
    tell(r.loaded(false));
    poll(true);
    expect(sent).toEqual([true, true, false, false, true]);
  });
});
