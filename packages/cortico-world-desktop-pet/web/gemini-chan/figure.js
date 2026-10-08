/**
 * Gemini-chan (Gemini 娘) as a figure for the kit (web/kit/body.js): a layered 2D puppet drawn with kit/rig.js, a
 * lively chibi cat girl with cat ears, a star ornament in her long gradient hair and a fluffy cat tail.
 *
 * She faces the viewer; the kit mirrors the whole group when she turns. The kit runs the body (walking, jumping,
 * dragging, faces); motion.js turns each frame it hands over into rig parameters (hair, skirt and charm springs, her
 * ears and tail, her arms, head turn), face.js paints her eyes, mouth and blush into a live texture, fx.js the marks
 * over her, and this file loads the textures and draws the rig into a canvas inside the pet's own SVG group, so the
 * stage's transform (position, squash, tilt, facing) applies.
 *
 * Every layer was cut from one master drawing, so at rest the parts line up pixel for pixel. Rig space = the kit's
 * space: x=128 under her, soles at y=256. model.json keeps the master drawing's pixels for the face.
 */
import { createRig } from '../kit/rig.js';
import * as kit from '../kit/body.js';
import { anchorsOf, buildRig, clamp, createMotion, extentOf, fxPointsOf, hitsOf, sitAnchors, smooth } from './motion.js';
import { createFacePainter, EYES } from './face.js';
import { fxMarkup } from './fx.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * The gestures she draws herself, from the frame's `gesture` (the kit leaves them off the body). `roll` joins them only
 * while its ball drawing can show; without it the kit turns her whole group over (`roll: 'spin'`).
 */
export const GESTURES = ['nod', 'shake', 'wave', 'bow', 'flinch', 'peek', 'cheer', 'heart', 'away', 'sip', 'read', 'spout', 'sigh', 'pray',
  'hips', 'hug', 'scratch', 'idea', 'serve', 'salute', 'vsign', 'point', 'cover', 'cross', 'stretch', 'curtsy'];

function loadImage(url) {
  return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; });
}

/**
 * Loads the textures; resolves to a figure object for the kit's `opts.figure` (createPet, createBody).
 * `opts.model` (model.json, already parsed) is required: the figure never fetches (the figure frame allows no
 * connections). `opts.asset(path)` gives a texture's URL (default: relative to `base`); `opts.loadImage` is the figure
 * frame's, and every image goes through it when given. `opts.raster` shows each frame as an SVG <image> copied from the
 * canvas (for screen-recorded pages); `opts.scheme` picks a colour scheme (model.schemes; default the first).
 */
export async function createGeminiFigure(base = new URL('./', import.meta.url), opts = {}) {
  const model = opts.model;
  if (!model || typeof model !== 'object') throw new Error('gemini-chan: opts.model (the parsed model.json) is required; the figure does not fetch it');
  const asset = opts.asset || (p => new URL(p, base));
  const load = opts.loadImage || loadImage;
  const feat = model.feat || {};
  const R = buildRig(model);
  if (R.unknownParents.length) console.warn(`gemini-chan: parts on unknown deformers hang from the body: ${R.unknownParents.join(', ')}`);
  const motion = createMotion(model, R);
  const FX = fxPointsOf(model, R);
  // (an eye with no drawing in feat.eyes is drawn plain: face.js)
  const EYE_FILES = EYES.filter(k => feat.eyes?.[k]).flatMap(k => ['lash', 'ball', 'iris', ...(feat.eyes[k].rim ? ['rim'] : [])].map(n => `${k}_${n}`));
  const SPRITES = Object.keys(feat.sprites || {});
  const BASE_TEX = [...new Set(model.parts.map(p => p.tex))];
  // a pose shows once all its drawing's files are there (a floor drawing's patches are extras)
  const POSE_REQ = {
    ...Object.fromEntries(Object.entries(R.ARM).map(([id, A]) => [id, A.parts.map(p => p.tex)])),
    ...Object.fromEntries(Object.entries(R.W).map(([id, F]) => [id, F.pose.required.map(p => p.tex)])),
  };
  const POSE_TEX = [...new Set([...Object.values(R.ARM).flatMap(A => A.parts), ...Object.values(R.W).flatMap(F => F.parts)].map(p => p.tex))];
  // a scheme is a set of textures over the same geometry; the first one's are at tex/ and feat/
  const SCHEMES = (model.schemes || [{ id: 'original' }]).filter(sc => sc.ready !== false);
  const schemeInfo = id => SCHEMES.find(sc => sc.id === id) || SCHEMES[0];
  const accent = () => schemeInfo(scheme).accent || '#7B5CD6';
  const loaded = {}, ready = {};
  function loadScheme(id) {
    if (loaded[id]) return loaded[id];
    const dir = id === SCHEMES[0].id ? '' : `schemes/${id}/`;
    const set = { tex: {}, img: {}, pose: {} };
    const optional = (url, put) => load(url).then(put, () => {});
    loaded[id] = Promise.all([
      ...BASE_TEX.map(async n => { set.tex[n] = await load(asset(`${dir}tex/${n}.png`)); }),
      ...EYE_FILES.map(async n => { set.img[n] = await load(asset(`${dir}feat/${n}.png`)); }),
      // a missing sprite is drawn with strokes; a missing pose file only takes that pose away from this scheme
      ...SPRITES.map(n => optional(asset(`${dir}feat/${n}.png`), im => { set.img[n] = im; })),
      ...POSE_TEX.map(n => optional(asset(`${dir}tex/${n}.png`), im => { set.tex[n] = im; })),
    ]).then(() => {
      for (const [p, req] of Object.entries(POSE_REQ)) set.pose[p] = req.every(n => set.tex[n]);
      return (ready[id] = set);
    });
    return loaded[id];
  }
  let scheme = schemeInfo(opts.scheme).id;
  let cur = await loadScheme(scheme);  // the set whose textures are drawn (until a fade ends, the outgoing one)
  let { tex, img } = cur;
  // a fade in progress: the rig crossfades every part from `tex` to fade.set's textures over fade.dur seconds
  let fade = null;
  const caps = {
    pose: id => !!(cur.pose[id] && (!fade || fade.set.pose[id])),
    tex: n => !!tex[n],
  };

  /* ---------- the face texture ---------- */
  const painter = createFacePainter(model, { rect: R.FACE });
  const FACE = painter.rect;
  const faceCv = document.createElement('canvas'), faceCv2 = document.createElement('canvas');
  faceCv.width = faceCv2.width = FACE.w; faceCv.height = faceCv2.height = FACE.h;
  const fg1 = faceCv.getContext('2d'), fg2 = faceCv2.getContext('2d');

  /* ---------- mounting inside the pet's SVG group ---------- */
  const VIEW = model.view;
  let fo = null, canvas = null, fxG = null, rig = null, mountedIn = null, pxScale = 0, frameN = 0, fxStr = '';
  function mount(petG) {
    petG.textContent = '';
    // the previous rig's GL context outlives its canvas until GC: release it, or repeated figure switches pile up contexts
    rig?.dispose();
    rig = null;
    const box = (el) => { el.setAttribute('x', VIEW[0]); el.setAttribute('y', VIEW[1]); el.setAttribute('width', VIEW[2] - VIEW[0]); el.setAttribute('height', VIEW[3] - VIEW[1]); return el; };
    canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    if (opts.raster) fo = box(document.createElementNS(SVGNS, 'image'));
    else {
      fo = box(document.createElementNS(SVGNS, 'foreignObject'));
      canvas.style.cssText = 'width:100%;height:100%;display:block';
      fo.appendChild(canvas);
    }
    fxG = document.createElementNS(SVGNS, 'g');
    fxStr = '';
    petG.append(fo, fxG);
    rig = createRig(canvas, { deformers: R.deformers, parts: R.parts, view: VIEW });
    for (const n in tex) rig.upload(n, tex[n]);
    rig.upload('faceFx', faceCv);
    if (fade) for (const n in fade.set.tex) rig.upload(n + '@mix', fade.set.tex[n]);
    mountedIn = petG; pxScale = 0;
  }
  function endFade() {
    if (!fade) return;
    cur = fade.set; tex = cur.tex; img = cur.img; fade = null;
    if (rig) for (const n in tex) rig.upload(n, tex[n]);
  }
  /**
   * Switches the colour scheme: at once if its textures are loaded (see preload), else once they are. `o.fade`
   * (seconds) crossfades instead; the clock is the frames' `t`, starting at `o.at` or else at the next frame drawn.
   */
  function setScheme(id, o = {}) {
    const next = schemeInfo(id).id;
    const apply = set => {
      endFade();
      if (scheme === next && tex === set.tex) return;
      scheme = next;
      if (o.fade > 0 && rig) {
        fade = { set, dur: o.fade, t0: o.at ?? null };
        for (const n in set.tex) rig.upload(n + '@mix', set.tex[n]);
        // a pose file the incoming scheme lacks fades to the outgoing one's
        for (const n of POSE_TEX) if (!set.tex[n] && tex[n]) rig.upload(n + '@mix', tex[n]);
        return;
      }
      cur = set; tex = set.tex; img = set.img;
      if (rig) for (const n in tex) rig.upload(n, tex[n]);
    };
    if (ready[next]) { apply(ready[next]); return Promise.resolve(); }
    return loadScheme(next).then(apply);
  }
  let decoded = null; // raster mode: settles once the last frame's image is decoded
  let fixedRes = 0; // canvas pixels per rig unit for a snapshot; 0 = follow the screen
  function fitCanvas() {
    const m = fixedRes ? null : mountedIn.getScreenCTM();
    if (!m && !fixedRes) return;
    // the vertical axis: turning round squeezes the horizontal one through zero
    const k = fixedRes || Math.hypot(m.c, m.d) * (window.devicePixelRatio || 1) * 1.25;
    if (Math.abs(k - pxScale) / (pxScale || 1) < .08) return;
    pxScale = k;
    canvas.width = Math.max(16, Math.round((VIEW[2] - VIEW[0]) * Math.min(k, 6)));
    canvas.height = Math.max(16, Math.round((VIEW[3] - VIEW[1]) * Math.min(k, 6)));
  }
  const showRaster = () => { if (opts.raster) { fo.setAttribute('href', canvas.toDataURL('image/png')); decoded = fo.decode ? fo.decode().catch(() => {}) : null; } };

  /* ---------- per frame ---------- */
  let lastT = null, last = null, frozenOK = false, stoneK = 0;
  function draw(petG, fc, o) {
    if (mountedIn !== petG || !petG.contains(fo)) mount(petG);
    if (frameN++ % 20 === 0) fitCanvas();
    const t = o.t, dt = lastT == null ? 1 / 60 : clamp(t - lastT, 0, .05);
    lastT = t;
    // turned to stone (petrify's `freeze`) she holds still: the last frame is drawn again, face and all, and only the
    // grey and the crack change; the springs and clocks pick up where they were once she thaws
    if (fc.freeze && frozenOK && last) {
      stoneK = fc.stone || 0; last.st.stone = stoneK;
      if (fade && fade.t0 != null) fade.t0 += dt;
      rig.render(last.st, last.hideFront ? { hidden: R.STANDING } : undefined);
      showRaster();
      drawFx(fc, t, last);
      return;
    }
    const face = o.face || 'neutral';
    const out = motion.step(fc, o, dt, caps), st = out.st;
    st.mix = 0;
    if (fade) { if (fade.t0 == null) fade.t0 = t; st.mix = smooth(0, 1, (t - fade.t0) / fade.dur); }
    // once a floor drawing (or her back) covers her, the standing rig, face included, is neither painted nor drawn
    if (!out.hideFront) {
      const fo2 = { ...o, look: out.look };
      painter.paint(fg1, img, fc, face, fo2, t);
      rig.upload('faceFx', faceCv);
      if (fade) { painter.paint(fg2, fade.set.img, fc, face, fo2, t); rig.upload('faceFx@mix', faceCv2); }
    }
    // the grey follows the face, but going back to colour takes at least .4 s
    stoneK = Math.max(fc.stone || 0, stoneK - dt / .4); st.stone = stoneK;
    // a frame fit to hold as stone: the petrify face itself, eyes open, not talking
    frozenOK = face === 'petrify' && !(o.blink > .02) && !(o.eyeClose > .02) && !(o.talk > .05);
    rig.render(st, out.hideFront ? { hidden: R.STANDING } : undefined);
    showRaster();
    if (fade && st.mix >= 1) endFade();
    last = out;
    drawFx(fc, t, out);
  }

  // effects drawn for the standing head; once she lies, the same points move onto the lying head (poses.lie.fx)
  const FXL = R.W.lie?.pose.fx, LIE_HEAD = R.deformers.lieHead ? 'lieHead' : 'lie';
  function drawFx(fc, t, out) {
    const lying = out.poseShown > .5;
    const pt = (d, x, y) => rig.point(d, out.st, x, y);
    const at = (x, y) => (FXL && lying ? pt(LIE_HEAD, FXL.to[0] + FXL.s * (x - FXL.from[0]), FXL.to[1] + FXL.s * (y - FXL.from[1])) : pt('neck', x, y));
    const s = fxMarkup(fc, t, { P: FX, at, pt, lying, accent: accent(), steam: out.steam, steamAt: out.steamAt, puffK: out.puffK, turn: out.turn });
    if (s !== fxStr) { fxG.innerHTML = s; fxStr = s; }
  }

  const anchors = anchorsOf(model, R), extent = extentOf(model, R), hits = hitsOf(model, R);
  const ownRoll = () => !!R.W.roll && caps.pose('roll'), WITH_ROLL = [...GESTURES, 'roll'];
  return {
    draw,
    groupTilt: motion.groupTilt,
    get gestures() { return ownRoll() ? WITH_ROLL : GESTURES; },
    /** Without a ball drawing her roll is the kit's: the whole group turns over, feet tucked in. */
    get roll() { return ownRoll() ? undefined : 'spin'; },
    setScheme,
    /**
     * Renders `frames` frames of one pose at `res` canvas pixels per rig unit, then gives up the WebGL context;
     * returns an SVG <image> for the result in rig space (for pages showing many still figures).
     */
    snapshot(fc, o, res = 3, frames = 60) {
      fixedRes = res;
      const g = document.createElementNS(SVGNS, 'g');
      for (let i = 0; i < frames; i++) draw(g, fc, { ...o, t: (o.t || 0) + i / 60 });
      const href = canvas.toDataURL('image/png');
      rig.dispose();
      rig = null; mountedIn = null; fixedRes = 0;
      return `<image href="${href}" x="${VIEW[0]}" y="${VIEW[1]}" width="${VIEW[2] - VIEW[0]}" height="${VIEW[3] - VIEW[1]}"/>`;
    },
    /** Releases the WebGL context and drops the mounted DOM; the next `draw` re-mounts from scratch. */
    dispose() {
      rig?.dispose();
      rig = null; canvas = null; fo = null; fxG = null; mountedIn = null;
    },
    /** Forgets the motion state (springs, clocks), for callers that replay a timeline from its start. */
    reset() {
      endFade();
      motion.reset();
      lastT = null; last = null; frozenOK = false; stoneK = 0;
    },
    /** Loads every scheme's textures, so later switches are immediate. */
    preload: () => Promise.all(SCHEMES.map(sc => loadScheme(sc.id))),
    get scheme() { return scheme; },
    /** Raster mode: a promise that settles once the last drawn frame is ready to be painted. */
    get painted() { return decoded || Promise.resolve(); },
    get colors() { return { z: accent() }; },
    /**
     * Her own poses: lying needs its drawing (else the kit keeps her seated); turning round she never goes thin
     * (`back`): with a back drawing she shows it mid-turn, without one the turn is a quick flip.
     */
    get poses() { return { lie: !!R.W.lie && caps.pose('lie'), back: true }; },
    schemes: SCHEMES,
    /**
     * The kit's points (read every frame); seated (sit) they rise by what her head sinks less than the kit's 29.
     * Kneeling without its drawing she shows the seated body, whose raise is already in: no `kneelRaise` on top.
     */
    get anchors() {
      const A = sitAnchors(anchors, motion.sitRaise);
      return A.kneelRaise && !caps.pose('kneel') ? { ...A, kneelRaise: 0 } : A;
    },
    extent,
    hits,
    model,
  };
}

/**
 * The pack's entry (figure.json): her body for the figure frame, the kit's body drawn by her figure. The kit is this
 * file's own `../kit/body.js`; `plus` turns on the kit's extra words, faces and poses, which she draws.
 */
export async function createGeminiBody(base, opts) {
  return kit.createBody(opts.host, { figure: await createGeminiFigure(base, opts), plus: true });
}
