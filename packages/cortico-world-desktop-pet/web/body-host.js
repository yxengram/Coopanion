/**
 * The page's side of a figure pack's body (Coo's too): the pack's code runs inside a sandboxed frame
 * (`/figure-frame`, figure-frame.js) that fills `layer`, laid over the page's stage under its bubbles
 * and buttons. The page drives it once a frame (`tick`), forwards the pointer, asks it to do things,
 * and reads back where it is (`layout`), what happened to it (`onEvent`) and what it wants heard
 * (`onSound`).
 *
 * The pack's code is not trusted, so the page holds the line here:
 * - the body's box is kept inside the stage and to the most the kit itself ever stretches a body
 *   (BOX_MAX), and only its hit circles inside that box take the pointer: a pack cannot spread
 *   its clickable area over the screen and swallow clicks meant for the windows underneath;
 * - a touch (poke, pat, pick-up, throw) counts only right after the page passed it pointer input
 *   (TOUCH_MS), and a crash only after a throw: a pack cannot make up touches that wake the bot;
 * - the bubble's spot and the hover buttons' point stay on the stage.
 *
 * `onError(err)` is called when the pack's code fails after it was ready; before that the returned
 * promise rejects. Either way the frame is gone.
 */

/** A pack that has not drawn its first frame by then is taken as broken: its scripts or textures did not load. */
const READY_MS = 20_000;
/**
 * The longest side of a body's box, in 256-unit squares at the body's scale: the kit squashes a body up to 1.33
 * wide and stretches it to 1.5 tall (squash, drag stretch and breath together), and a box turned any way grows by √2.
 */
const BOX_MAX = 1.5 * Math.SQRT2;
/**
 * How long after the page passed pointer input a body may report a touch. The body answers in the frame after the
 * input, a few tens of milliseconds at the resting frame rate; a second covers a frame held up by a stalled page.
 */
const TOUCH_MS = 1000;
const TOUCHES = new Set(['poke', 'pet', 'grab', 'drop', 'throw', 'crash']);
/**
 * The halo blurs only a window around the body (haloRect) instead of the whole stage: drawn with a CSS filter over
 * the stage-sized frame, it blurs the full window on every frame the body redraws, which on a Mac (where it is always
 * on) kept the GPU busy at 60 to 90 percent behind the whale. False goes back to the filter over the whole frame.
 */
export const HALO_CLIP = true;
/**
 * How far around the body's box that window reaches: shares of the box's width (each side) and height (above), and at
 * least HALO_SIDE_PX / HALO_TOP_PX pixels (hearts, notes and z's rise and drift by pixels, not by the body's size) and
 * HALO_REACH, the drop shadows' spread. The particles and marks a body draws leave its box: confetti thrown up and out
 * over her, hearts, notes and z's rising, steam off the head, a rain cloud or 「……」 beside it; rendered on the pet page
 * (whale and Claude-chan at sizes 1 and 2), the farthest went 52 px past the side of a 150 px wide box and 98 px over
 * a 193 px tall one, and 82 px over a 98 px one. Below the box the window reaches the floor (`floorY`): tears, spray,
 * chips and dust fall to it, confetti flutters down to it.
 */
const HALO_SIDE = .6, HALO_TOP = .8, HALO_SIDE_PX = 80, HALO_TOP_PX = 130, HALO_REACH = 24;
/**
 * A body on the move leaves its particles behind (a run's dust, the hearts where it was picked up before a throw), and
 * they last up to the kit's confetti's 2.4 s: the halo's window is the union of the body's windows over that long
 * (haloTrail). A body at rest keeps just its own.
 */
const HALO_TRAIL_MS = 2500;

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clampTo = (v, a, b) => Math.max(a, Math.min(b, v));
/** Rect `r` cut to a `size` stage (one that shrank since), or null when nothing of it is left. */
const clipTo = (r, size) => {
  if (!r) return null;
  const x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(Math.ceil(size.W), r.x + r.w) - x, h = Math.min(Math.ceil(size.H), r.y + r.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};

/** The most words of a body's own list (`ready { words }`) the page reads. */
const WORDS_MAX = 1000;
/**
 * The ids of a pack's vocabulary (`vocab`, the manifest's, as /api/figures lists it) its body knows: the ones in the
 * body's own list (`reported`, figure-frame.js `ready { words }`), in the manifest's order; a body that gives no list
 * is taken at its manifest's word (all of them). What the World is told (pet-app.js `reportFigure`).
 */
export function knownWords(vocab, reported) {
  const ids = (Array.isArray(vocab) ? vocab : []).map((w) => w?.id).filter((id) => typeof id === 'string');
  if (!Array.isArray(reported)) return ids;
  const has = new Set(reported.slice(0, WORDS_MAX).filter((w) => typeof w === 'string'));
  return ids.filter((id) => has.has(id));
}

/** A body's layout report as the page takes it (`size`: the stage, { W, H, S }): numbers where numbers belong, and the limits above. */
export function readLayout(l, size) {
  if (!l || typeof l !== 'object') return null;
  const { W, H, S } = size, side = 256 * S * BOX_MAX;
  const b = l.box ?? {};
  const w = clampTo(num(b.w), 0, side), h = clampTo(num(b.h), 0, side);
  const x0 = clampTo(num(b.x), -w, W), y0 = clampTo(num(b.y), -h, H);
  const box = { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(W, x0 + w) - Math.max(0, x0), h: Math.min(H, y0 + h) - Math.max(0, y0) };
  const pt = (p) => ({ x: clampTo(num(p?.x), 0, W), y: clampTo(num(p?.y), 0, H) });
  return {
    x: clampTo(num(l.x, W / 2), 0, W), facing: l.facing === -1 ? -1 : 1, mode: typeof l.mode === 'string' ? l.mode.slice(0, 32) : 'idle',
    busy: !!l.busy, moving: !!l.moving, pressing: !!l.pressing,
    cursor: l.cursor === 'grab' || l.cursor === 'grabbing' ? l.cursor : '',
    box,
    hit: (Array.isArray(l.hit) ? l.hit : []).map((c) => ({ x: num(c?.x), y: num(c?.y), r: Math.max(0, num(c?.r)) })),
    bubble: pt(l.bubble), side: { ...pt(l.side), reach: clampTo(num(l.side?.reach), 0, side / 2) },
  };
}

/** Whether stage point `p` is on a body with `layout` (readLayout's): in its box and in one of its hit circles. */
export function onBody(layout, p) {
  const b = layout?.box;
  if (!b || p.x < b.x || p.y < b.y || p.x > b.x + b.w || p.y > b.y + b.h) return false;
  return layout.hit.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
}

/**
 * The window the halo is drawn in for a body with `layout` (readLayout's) on a `size` stage ({ W, H, floorY, S }):
 * its box with the reach above around it, and at least the pack's `effects` reach (`fx`, in 256-unit squares at the
 * body's scale, upstream #434) on every side, in whole pixels inside the stage; null when there is no box to draw around.
 */
export function haloRect(layout, size, fx = 0) {
  const b = layout?.box;
  if (!b || !(b.w > 0) || !(b.h > 0)) return null;
  const own = clampTo(num(fx), 0, BOX_MAX) * 256 * num(size.S, 1);
  const px = Math.max(HALO_REACH, b.w * HALO_SIDE, HALO_SIDE_PX, own), top = Math.max(HALO_REACH, b.h * HALO_TOP, HALO_TOP_PX, own);
  const floor = Math.max(b.y + b.h + own, num(size.floorY, size.H)) + HALO_REACH;
  const x = Math.max(0, Math.floor(b.x - px)), y = Math.max(0, Math.floor(b.y - top));
  const w = Math.min(Math.ceil(size.W), Math.ceil(b.x + b.w + px)) - x, h = Math.min(Math.ceil(size.H), Math.ceil(floor)) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * The halo's windows of the last HALO_TRAIL_MS: `add(rect, now)` (ms; `rect` haloRect's, null adds nothing) returns the
 * rect around all of them, or null when there are none.
 */
export function haloTrail() {
  let list = [];
  return {
    add(rect, now) {
      list = list.filter((e) => now - e.at < HALO_TRAIL_MS);
      if (rect) list.push({ at: now, rect });
      if (!list.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const { rect: r } of list) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
  };
}

/**
 * Which touches a body reports are taken: `input(now)` when the page passes it pointer input, `take(kind, now)`
 * for each touch it reports (ms clock).
 */
export function touchGate() {
  let inputAt = -Infinity, thrown = false;
  return {
    input(now) { inputAt = now; },
    take(kind, now) {
      if (!TOUCHES.has(kind)) return false;
      if (kind === 'crash' ? !thrown : now - inputAt > TOUCH_MS) return false;
      thrown = kind === 'throw';
      return true;
    },
  };
}

/**
 * `pack`: the entry of `/api/figures`; `start`: { x, facing, enter, skin }; `bounds`: { W, H, floorY, S };
 * `theme`: 'dark' | 'light'. Resolves to the body once it is ready.
 */
export function loadBody({ layer, pack, start, theme, bounds, onEvent, onSound, onError }) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.className = 'figure-frame';
    frame.src = '/figure-frame';
    // the frame's window onto the stage: all of it, or with the halo on, the halo's rect around the body (haloRect)
    const clip = document.createElement('div');
    clip.className = 'figure-clip';
    clip.appendChild(frame);
    let haloAt = '';
    const trail = haloTrail();
    let ready = false, gone = false, seq = 0, size = bounds;
    let layout = null, z = null, words = null;
    const touches = touchGate();
    const waits = new Map();
    const post = (m) => { if (!gone) frame.contentWindow?.postMessage(m, '*'); };
    const timer = setTimeout(() => fail(new Error(`形象 ${READY_MS / 1000} 秒内没有准备好`)), READY_MS);

    function close() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      clip.remove();
      for (const done of waits.values()) done();
      waits.clear();
    }
    function fail(err) {
      if (gone) return;
      close();
      if (ready) onError?.(err); else reject(err);
    }

    const body = {
      pack: pack.id,
      get layout() { return layout; },
      get z() { return z; },
      /** The words of the pack's vocabulary its body knows (knownWords), once it is ready. */
      get words() { return words; },
      /** Whether stage point `p` is on the body. */
      hit: (p) => onBody(layout, p),
      /** One frame of `dt` seconds; `o.draw` false while the window is hidden: the body moves on without drawing. */
      tick(dt, o) { if (ready) post(o?.draw === false ? { t: 'tick', dt, draw: false } : { t: 'tick', dt }); },
      do: (word) => post({ t: 'do', word }),
      /** A group of words done at once (a body without doAll of its own takes them one by one, see figure-frame.js). */
      doAll: (words) => post({ t: 'do-all', words: words.slice(0, 8) }),
      walk: (x, run, id) => post({ t: 'walk', x, run, id }),
      stopWalk: (id) => post({ t: 'stop-walk', id }),
      /** `type`: down, move, up, cancel, leave; `p` in stage pixels with `t` (ms). */
      pointer(type, p) { if (type !== 'leave') touches.input(performance.now()); post({ t: 'pointer', type, p }); },
      drop(p) { touches.input(performance.now()); post({ t: 'drop', p }); },
      shift: (dx, dy) => post({ t: 'shift', dx, dy }),
      place: (x, facing) => post({ t: 'place', x, facing }),
      /** The page's states (see the kit's `set`), and `bounds` when the stage changed size. */
      set(state) { if (state.bounds) size = state.bounds; post({ t: 'set', state }); },
      cue: (kind) => post({ t: 'cue', kind }),
      talk: (ch) => post(typeof ch === 'string' && ch ? { t: 'talk', ch: ch.slice(0, 2) } : { t: 'talk' }),
      setScheme(id, o = {}) {
        if (gone) return Promise.resolve();
        const s = ++seq;
        post({ t: 'scheme', id, fade: o.fade ?? 0, seq: s });
        return new Promise((done) => waits.set(s, done));
      },
      /**
       * The light halo behind the body (pet-app's backdrop), as a CSS filter on the frame's window cut down to
       * the body's surroundings (haloRect, haloTrail), so it blurs only those; 0 removes it. Called once a frame: it follows the body.
       */
      setHalo(k) {
        const c = k ? `rgba(184,184,184,${k.toFixed(2)})` : '';
        const filter = k ? `drop-shadow(0 0 3px ${c}) drop-shadow(0 0 7px ${c})` : '';
        if (!HALO_CLIP) { frame.style.filter = filter; return; }
        const r = k ? clipTo(trail.add(haloRect(layout, size, pack.effects?.reach), performance.now()), size) : null;
        // (the stage's size too: the frame inside the window keeps it)
        // a body that reports no box (a third-party pack's) keeps the halo over the whole stage, as before the clip
        const key = r ? `${r.x},${r.y},${r.w},${r.h},${size.W},${size.H},${c}` : k ? `all,${c}` : '';
        if (key === haloAt) return;
        haloAt = key;
        if (!r) { clip.removeAttribute('style'); frame.removeAttribute('style'); if (k) frame.style.filter = filter; return; }
        Object.assign(clip.style, { inset: 'auto', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, overflow: 'hidden', filter });
        // the frame keeps the stage's size and place, so the body inside it neither moves nor resizes
        Object.assign(frame.style, { inset: 'auto', left: `${-r.x}px`, top: `${-r.y}px`, width: `${size.W}px`, height: `${size.H}px` });
      },
      dispose: close,
    };

    async function onMessage(e) {
      if (e.source !== frame.contentWindow) return;
      const m = e.data || {};
      if (m.t === 'loaded' && !ready) {
        try {
          const model = pack.model ? await (await fetch(new URL(pack.base + pack.model, location.href))).json() : null;
          post({
            t: 'init', entry: new URL(pack.base + pack.entry, location.href).href, export: pack.export,
            base: new URL(pack.base, location.href).href, model, scheme: start.scheme, start: { x: start.x, facing: start.facing, enter: start.enter, skin: start.skin }, theme, bounds: size,
          });
        } catch (err) { fail(err); }
      } else if (m.t === 'ready' && !ready) {
        ready = true;
        clearTimeout(timer);
        z = typeof m.z === 'string' ? m.z : null;
        words = knownWords(pack.vocab, m.words);
        resolve(body);
      } else if (m.t === 'frame' && ready) {
        layout = readLayout(m.layout, size);
        z = typeof m.z === 'string' ? m.z : null;
        for (const s of Array.isArray(m.sounds) ? m.sounds : []) {
          if (typeof s?.name === 'string') onSound?.(s.name.slice(0, 64), typeof s.kind === 'string' ? s.kind : '', ...(Array.isArray(s.args) ? s.args.filter((a) => typeof a === 'number' || typeof a === 'boolean') : []));
        }
        for (const ev of Array.isArray(m.events) ? m.events : []) {
          if (!ev || typeof ev.kind !== 'string') continue;
          const d = ev.detail && typeof ev.detail === 'object' ? ev.detail : {};
          // a touch only right after real pointer input, a crash only after a throw
          if (ev.kind === 'touch' && !touches.take(d.kind, performance.now())) continue;
          onEvent?.(ev.kind, d);
        }
      } else if (m.t === 'scheme') {
        z = typeof m.z === 'string' ? m.z : null;
        waits.get(m.seq)?.();
        waits.delete(m.seq);
      } else if (m.t === 'error') {
        fail(new Error(m.message));
      }
    }
    addEventListener('message', onMessage);
    layer.appendChild(clip);
  });
}

/* ---------- the order of the page's words among its bubbles ---------- */
/**
 * The pet page's `act` (pet_act, and the decider's pet_feel and pet_ask words) in the order it was sent among the
 * bubbles: a bubble waits in the page's queue and does its 【】 marks when its turn comes, so words pushed at once
 * would run ahead of the marks of a bubble sent before them (two pet_say, then a pet_act: the act came before the
 * second bubble's marks). Kept here, apart from the page, so it can be tested.
 *
 * `afterBubbles(queue, current, actions)`: the latest bubble still to come or still typing (`current`, the page's
 * item on screen, or one of `queue`) takes `actions`:
 * - a say, as a last inline marker at the end of its last beat, tagged `deferred` (done once that beat is typed out,
 *   after all of the bubble's own marks; a beat with no text does its markers as it starts);
 * - a question not shown yet, as words done when it is shown (`it.acts`, see `dropActs`).
 * A question already up, a say whose last beat is typed out, and no bubble at all leave them to be done at once
 * (`'now'`, the caller does them); otherwise `'attached'`. An app's dialog step in between does not count: its words
 * are its own.
 *
 * Words taken this way are never lost: a bubble that leaves before its turn is over gives them back.
 * - `dropActs(it)`: the words a question took that is leaving the queue unshown (replaced, answered elsewhere).
 * - `leftActs(it)`: the words a say took that it has not done yet, taken off it (cut short by the typing box);
 *   the bubble's own marks it did not reach stay lost, as they always were.
 * - `takeDeferred(queue, current)`: all words still waiting on bubbles, taken off them, in the order they were sent.
 *   A World walk takes them first: walking is not busy, so a word waiting on a bubble (坐下, 趴下) would otherwise
 *   come in the middle of a walk sent after it and stop it there (the World is told it was interrupted). The walk
 *   then waits for them (`walkHold`).
 * The caller does them at once, as it would have without the bubble.
 *
 * `walkHold(T, maxS)`: walks waiting for the words queued ahead of them (the page's acts.js queue, the ones taken off
 * the bubbles last), made when a walk comes while words are queued and kept by the page, not by one walk: a walk that
 * replaces a waiting one, or comes after one stopped before it started, waits for the same words. `started(seconds, T)`
 * for each entry the queue starts (`seconds`: how long that one holds the queue at most), and `due(T, queued)`,
 * whether a walk may go: once the queue is empty (`queued`, words sent meanwhile included) and the last word started has
 * had its time, and at most `maxS` after the first walk came (a body carried meanwhile starts no word, and the World
 * times a walk from when it sent it).
 */
export function afterBubbles(queue, current, actions) {
  const list = Array.isArray(actions) ? actions.filter((a) => typeof a === 'string' && a) : [];
  if (!list.length) return 'now';
  for (const it of [current, ...queue].reverse()) {
    if (!it || (it.kind !== 'say' && it.kind !== 'ask')) continue;
    if (it.kind === 'ask') {
      if (it === current) return 'now';
      it.acts = [...(it.acts || []), ...list];
      return 'attached';
    }
    const beats = Array.isArray(it.beats) ? it.beats : [];
    const n = beats.length - 1, last = beats[n];
    // nothing left to type: what comes now is after all of it
    if (!last || (it === current && (it.i > n || (it.i === n && it.beatDone)))) return 'now';
    last.anchors = [...(last.anchors || []), { at: (last.text || '').length, actions: list, deferred: true }];
    return 'attached';
  }
  return 'now';
}

export function dropActs(it) {
  const list = it?.acts || [];
  if (it) it.acts = [];
  return list;
}

export function leftActs(it) {
  if (!it) return [];
  if (it.kind === 'ask') return dropActs(it);
  if (it.kind !== 'say' || !Array.isArray(it.beats)) return [];
  const out = [];
  it.beats.forEach((b, j) => {
    if (!b || !Array.isArray(b.anchors) || j < it.i || (j === it.i && it.beatDone)) return;
    // the beat being typed has done its first `fired` markers
    const done = j === it.i && b.text ? it.fired || 0 : 0;
    b.anchors = b.anchors.filter((a, k) => {
      if (k < done || !a?.deferred) return true;
      out.push(...a.actions);
      return false;
    });
  });
  return out;
}

export function takeDeferred(queue, current) {
  return [current, ...queue].flatMap((it) => leftActs(it));
}

export function walkHold(T, maxS) {
  let end = T;
  const by = T + maxS;
  return {
    started(seconds, T) { end = Math.max(end, T + seconds); },
    due(T, queued) { return T >= by || (queued === 0 && T >= end); },
  };
}

/* ---------- the page's loop: drawn frames while the window is shown, bare steps while it is hidden ---------- */
/** Milliseconds between the page's steps while its window is hidden. */
export const HIDDEN_EVERY_MS = 200;
/** The longest step a hidden tick takes (a machine that slept): time past it is not caught up. */
export const HIDDEN_STEP_MAX = 2;
/** The longest step a body takes at once, as a drawn frame's (the page clamps a frame's dt to it). */
export const STEP_MAX = .05;

/** `dt` seconds as steps no longer than `max`, for a body ticked less often than it is drawn. */
export function slices(dt, max = STEP_MAX) {
  const out = [];
  for (let left = dt > 0 && dt < Infinity ? dt : 0; left > 1e-6; left -= max) out.push(Math.min(max, left));
  return out;
}

/**
 * The pet page's loop. The pet window does not throttle its page (document.hidden stays false, frames keep coming at
 * the display's rate while it is hidden), so the window process says when it is hidden and the page stops drawing:
 * - shown, `draw(timestamp)` runs on display frames; it asks for the next with `next()` (the next display frame) or
 *   `next(ms)` (a display frame after `ms`, for a body at rest);
 * - hidden (`set(false)`), `step(dt)` runs every `every` ms instead, `dt` the real time since the last one (at most
 *   `max`): the page's clock, its words and bubbles, World walks and the body's state move on as they would, unseen;
 * - shown again (`set(true)`), the time since the last hidden step is stepped at once and drawing resumes with the
 *   next display frame: the hidden steps and that last one add up to the real time hidden.
 * What only a drawn frame moves (a figure's own draw state: its pose blends and seat / kneel / lie hand-overs, which
 * clamp each frame's dt) does not move while hidden, so a posture reached unseen plays its hand-over after the show,
 * starting from the picture before the hide. Catching that up on the first frame back belongs to the figures.
 * A frame or a tick asked for before a switch is dropped, so only one loop ever runs. `set` returns whether it switched.
 * `raf`, `after` and `now` are the page's requestAnimationFrame, setTimeout and performance.now (given, for tests).
 */
export function pageLoop({ draw, step, raf, after, now, every = HIDDEN_EVERY_MS, max = HIDDEN_STEP_MAX }) {
  let drawn = true, gen = 0, at = 0;
  function tick(g) {
    if (g !== gen) return;
    const t = now(), dt = Math.max(0, Math.min(max, (t - at) / 1000));
    at = t;
    try { step(dt); } finally { after(() => tick(g), every); }
  }
  const loop = {
    get drawn() { return drawn; },
    next(ms) {
      const g = gen;
      const go = () => raf((t) => { if (g === gen) draw(t); });
      if (ms === undefined) go(); else after(go, ms);
    },
    set(on) {
      on = !!on;
      if (on === drawn) return false;
      drawn = on;
      gen++;
      if (on) {
        // the time since the last hidden tick is stepped too, so the page's clock (and a walk under way) is not left
        // up to `every` ms behind for each hide; the first drawn frame then takes only its own time
        try { step(Math.max(0, Math.min(max, (now() - at) / 1000))); } finally { loop.next(); }
      } else { at = now(); const g = gen; after(() => tick(g), every); }
      return true;
    },
  };
  return loop;
}
