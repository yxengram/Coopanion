/**
 * GPT-chan's face: eyes, mouth, blush and tears, painted every frame into the live texture over feat.face.rect
 * (master pixels, one texel each). The drawn sprites in model.feat.sprites are used where the model has them;
 * whatever is missing is drawn with strokes, so every face the kit asks for shows (her open eyes too, while the model
 * has no eye drawings in feat.eyes).
 *
 * planFace() says what goes where (pure, for tests); the painter draws a plan into a 2D context.
 */
import { clamp, f1 } from './motion.js';

/** Her eyes: on the viewer's left, on the viewer's right. */
export const EYES = ['eyeL', 'eyeR'];
/** The talking mouths, by the frame's talkShape (0..3). */
export const TALK_SHAPES = ['a', 'i', 'u', 'e'];
/** The drawn eye for each of the kit's eye shapes. */
export const SHAPE_SPRITE = { up: 'happy', down: 'sleep', gt: 'drag', lt: 'drag', heart: 'love', spiral: 'dizzy' };
/** Faces whose own drawn eyes stand in for the open eyes (cry and smug for their shut and half-shut ones too). */
export const FACE_EYES = {
  surprised: 'surprised', scared: 'surprised', petrify: 'surprised', angry: 'angry', determined: 'determined', saluting: 'determined',
  sad: 'sad', worried: 'sad', shy: 'shy', smug: 'smug', cry: 'cry',
};
/** Faces with half-shut eyes: the drawn half lid shows while the lid is not nearly shut. */
export const HALF_LID = ['sleepy', 'content', 'gentle', 'reading', 'sipping', 'disgusted', 'smug', 'sighing'];
/** Faces whose shut smiling eye is a wink. */
export const WINKS = ['wink', 'tongue', 'saluting'];
/**
 * Mouths by face, in order of preference: a sprite name (also looked up as mouth_<name>), [name, scale], a drawn line's
 * curve (number; < 0 frowns), [curve, width], or 'O' (a drawn open mouth). The first the model can show is used.
 */
export const MOUTHS = {
  neutral: ['neutral_mouth', 'smile', .3], happy: ['happy_mouth', 'grin', 'smile', .9], wink: ['wink_mouth', ['happy_mouth', .8], 'smile', .8],
  love: ['love_mouth', 'happy_mouth', 'grin', .9], shy: ['shy_mouth', ['drag_mouth', .7], .2], surprised: ['surprised_mouth', 'u', 'O'],
  sleepy: ['sleep_mouth', 0], sleep: ['sleep_mouth', 0], dizzy: ['dizzy_mouth', -.3], dragged: ['drag_mouth', 'frown', -.6],
  content: ['halflid_mouth', 'smile', .4], waking: [['surprised_mouth', .6], ['u', .7], 'O'], squeeze: ['sleep_mouth', 0],
  listening: ['neutral_mouth', .2], thinking: ['sleep_mouth', 0], run: [['happy_mouth', .7], 'grin', .6],
  angry: ['angry_mouth', 'frown', -1], sad: ['sad_mouth', 'frown', -1.2], smug: ['smug_mouth', 'smile', .7], pout: ['pout', ['surprised_mouth', .45], 'O'],
  worried: [['drag_mouth', .6], 'frown', -.6], determined: ['determined_mouth', .15], flustered: ['shy_mouth', ['drag_mouth', .8], -.3],
  scared: [['drag_mouth', .8], ['surprised_mouth', .7], -.6], excited: ['happy_mouth', 'grin', .9], cry: ['cry_mouth', ['surprised_mouth', .8], 'frown', -1],
  confused: [-.35], disgusted: ['frown', ['drag_mouth', .6], -.5], nervous: [-.2], gentle: ['smile', .45], awkward: [[.05, 1.6]],
  giggle: ['smile', ['happy_mouth', .8], .6], pleading: ['smile', .25], moved: [['happy_mouth', .7], 'smile', .6], petrify: [['surprised_mouth', .5], 'O'],
  saluting: ['smile', .15], stretching: [['surprised_mouth', .75], 'a', 'O'], pointing: ['smile', .3], peeking: ['neutral_mouth', 0],
  sipping: ['smile', .3], reading: ['neutral_mouth', 0], bowing: ['smile', .3], sighing: [0], singing: ['smile', .5], coax: ['cat', 'smile', .5],
  tongue: ['tongue', 'smile', .5],
};

/** The sprite `n` stands for, if the model has it: `n` itself, or `mouth_<n>`. */
export function spriteName(has, n) {
  return [n, `mouth_${n}`].find(x => has(x)) || null;
}
/** The first mouth of `list` (a MOUTHS entry) the model can show. */
export function resolveMouth(list, has) {
  for (const m of list || []) {
    if (typeof m === 'number') return { kind: 'line', form: m, w: 1 };
    if (m === 'O') return { kind: 'oval', open: .6 };
    if (Array.isArray(m)) {
      if (typeof m[0] === 'number') return { kind: 'line', form: m[0], w: m[1] };
      const n = spriteName(has, m[0]);
      if (n) return { kind: 'sprite', name: n, s: m[1] };
      continue;
    }
    const n = spriteName(has, m);
    if (n) return { kind: 'sprite', name: n };
  }
  return { kind: 'line', form: .2, w: 1 };
}

function planEye(k, e, i, face, fc, o, t, has, lx, ly, tilt, shut) {
  const spr = (fam, extra) => (has(`${fam}_${k}`) ? { kind: 'sprite', name: `${fam}_${k}`, ...extra } : null);
  const squash = { sy: 1 - .85 * (o.eyeClose || 0) }, blinkSq = { sy: 1 - .9 * shut };
  if (e.shape === 'ring' || e.shape === 'lid') {
    const fam = FACE_EYES[face];
    const own = fam && (e.shape === 'ring' || fam === 'cry' || fam === 'smug') ? spr(fam, fam === 'cry' ? squash : blinkSq) : null;
    if (own) return own;
    if (fc.wide && e.shape === 'ring') { const s = spr('surprised', blinkSq); if (s) return s; }
    if (e.shape === 'lid' && HALF_LID.includes(face) && (e.ry ?? 16) >= 5) { const s = spr('halflid', blinkSq); if (s) return s; }
    // the iris fills most of the eye: it only shifts a little, so the white never shows past the outline
    const open = (e.shape === 'ring' ? clamp((e.ry ?? 16) / (e.rx ?? 16), 0, 1) * (tilt ? .8 : 1) : clamp((e.ry ?? 0) / 16, 0, 1)) * (1 - shut);
    const ix = clamp(lx + (e.dx || 0), -6, 6), iy = clamp(ly * .7 + (e.dy || 0) * .7, -3.5, 3.5);
    // (each eye's inner corner faces the middle: the lid tilts toward it)
    return { kind: 'open', k, open, ix, iy: iy + (e.shape === 'lid' ? 3 : 0), tilt: tilt * (k === 'eyeL' ? 1 : -1), glint: fc.sparkle ? 1 : 0 };
  }
  const fam = e.shape === 'up' && WINKS.includes(face) && has(`wink_${k}`) ? 'wink' : SHAPE_SPRITE[e.shape];
  const how = e.shape === 'gt' || e.shape === 'lt' ? { s: 1 + .03 * Math.sin(t * 22 + i) }
    : e.shape === 'heart' ? { s: .94 + .06 * (e.s ?? 1) / .8 } : e.shape === 'spiral' ? { rot: (e.rot || 0) * .6 } : squash;
  // a drawn dizzy eye holds its lashes and lid round the spiral: it only wobbles (spun, they would turn with it); the
  // stroked spiral spins whole
  const sprHow = e.shape === 'spiral' ? { rot: .12 * Math.sin(e.rot || 0) } : how;
  return (fam && spr(fam, sprHow)) || { kind: 'stroke', k, shape: e.shape, ...how };
}

function planMouth(fc, face, o, t, has) {
  // stone does not talk
  const talk = face === 'petrify' ? 0 : o.talk || 0;
  const gap = fc.gap || [50, 50];
  const gapOpen = clamp((Math.max(gap[0], gap[1]) - 50) / 14, 0, 1);
  const open = Math.max(talk * (.45 + .45 * Math.abs(Math.sin(t * 17))), face === 'sleepy' || face === 'waking' ? gapOpen : 0);
  const sp = (n, x) => { const name = spriteName(has, n); return name ? { kind: 'sprite', name, ...x } : null; };
  if (open > .12 && face === 'surprised') return sp('surprised_mouth', { sy: .35 + .65 * open, sx: .85 + .15 * open }) || { kind: 'oval', open };
  if (open > .12) {
    // talking, one of four mouths per character said; a yawn is the big open one
    if (talk > .05) {
      const m = sp(`mouth_${TALK_SHAPES[o.talkShape || 0] || 'a'}`, { sx: .9 + .1 * open, sy: .6 + .4 * open });
      if (m) return m;
      const [sx, sy] = [[.85 + .15 * open, .35 + .65 * open], [1.1 + .1 * open, .2 + .25 * open], [.55 + .1 * open, .45 + .45 * open], [.7, .25 + .3 * open]][o.talkShape || 0] || [1, open];
      return sp('happy_mouth', { sx, sy }) || { kind: 'oval', open };
    }
    return sp('mouth_a', { sx: .85 + .15 * open, sy: .5 + .5 * open }) || sp('surprised_mouth', { sx: .85 + .15 * open, sy: .35 + .65 * open }) || { kind: 'oval', open };
  }
  if (fc.cat) return sp('cat') || { kind: 'cat', open: 0 };
  if (fc.tongue) return sp('tongue') || { kind: 'tongue' };
  if (fc.puff > .1) return sp('surprised_mouth', { s: .55 + .25 * fc.puff }) || sp('mouth_u', { s: .6 + .3 * fc.puff }) || { kind: 'oval', open: .3 + .4 * fc.puff };
  if (fc.sing != null && face === 'singing') {
    if (fc.sing > .08) return sp('mouth_u', { sx: .7 + .3 * fc.sing, sy: .5 + .5 * fc.sing }) || sp('surprised_mouth', { sx: .45 + .2 * fc.sing, sy: .3 + .45 * fc.sing }) || { kind: 'oval', open: fc.sing };
    return resolveMouth(['smile', .5], has);
  }
  return resolveMouth(MOUTHS[face] || MOUTHS.neutral, has);
}

/**
 * What to paint for face `fc` (named `face`) with frame `o` at time `t`: `{ eyes: [plan, plan], mouth: plan }`. An eye is
 * a sprite (`name`, scale), the open eye (`open` 0..1, iris shift, lid tilt, glints) or strokes for its `shape`; a
 * mouth is a sprite, a drawn line (`form`, `w`), an open oval, a cat's ω or a tongue. `has(name)` says a sprite is there.
 */
export function planFace(fc, face, o, t, has) {
  const shut = Math.max(o.blink || 0, o.eyeClose || 0), look = o.look || [0, 0];
  const lx = clamp(look[0], -6, 6), ly = clamp(look[1], -5, 5);
  const tilt = fc.brows === 'angry' ? .2 : fc.brows === 'sad' ? -.16 : 0;
  const eyes = (fc.eyes || []).slice(0, 2).map((e, i) => planEye(EYES[i], e, i, face, fc, o, t, has, lx, ly, tilt, shut));
  return { eyes, mouth: planMouth(fc, face, o, t, has) };
}

const asRect = r => (Array.isArray(r) ? { x: r[0], y: r[1], w: r[2], h: r[3] } : r);
const poly2 = (c, x) => c[0] * x * x + c[1] * x + c[2];

/**
 * The face painter for `model`: `paint(g, img, fc, face, o, t)` draws into 2D context `g` (sized to `rect`) with the
 * sprite images `img` (by name). `opts.rect` is the face rectangle (master px; default feat.face.rect): pass the rig's
 * (buildRig's FACE), which has a fallback. `opts.makeCanvas(w, h)` gives a scratch canvas (default: a DOM canvas).
 */
export function createFacePainter(model, opts = {}) {
  const feat = model.feat || {}, F = feat.face || {};
  const FACE = asRect(opts.rect || F.rect);
  const makeCanvas = opts.makeCanvas || ((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  // mouth lines in `ink`, eye strokes in the lashes' `lashInk`
  const INK = F.ink || '#5a2330', LASH = F.lashInk || INK;
  // a plain eye's iris (no eye drawings): her lavender
  const IRIS = F.iris || '#9a8cc8';
  const CHEEKS = F.cheeks || [];
  const MOUTH = F.mouth || [FACE.x + FACE.w / 2, FACE.y + FACE.h * .75];
  const MOUTH_DY = F.mouthDy || {};
  const tearEnd = k => (Array.isArray(F.tearEnd) ? F.tearEnd[EYES.indexOf(k)] : F.tearEnd?.[k]) ?? FACE.y + FACE.h - 4;
  // where an eye with no drawing goes (master px): just over the kit's tear point under it (model.anchors.tears),
  // else at a third of the way across the face from either side
  const { S = .2, X0 = 0, FEET = 0 } = model.units || {};
  const plainBox = i => {
    const w = FACE.w * .17, h = FACE.h * .2, tear = model.anchors?.tears?.[i];
    const cx = tear ? X0 + (tear[0] - 128) / S : FACE.x + FACE.w * (i ? .67 : .33);
    const y1 = tear ? FEET - (256 - tear[1] + 2) / S : FACE.y + FACE.h * .62;
    return [cx - w / 2, y1 - h, cx + w / 2, y1];
  };
  // how far each lid travels to close: from the lid line down past the lower rim
  const EYE = Object.fromEntries(EYES.map((k, i) => {
    const e = feat.eyes?.[k];
    if (!e) return [k, { ball: plainBox(i), drawn: false }];
    const [x0, , x1] = e.ball;
    let h = 0;
    for (let x = x0 + 4; x < x1 - 4; x += 2) h = Math.max(h, poly2(e.rimFit, x) - poly2(e.lidFit, x));
    const cx = (e.iris[0] + e.iris[2]) / 2;
    return [k, { ...e, drawn: true, travel: h + 2, cx, cy: poly2(e.lidFit, cx) }];
  }));
  const eyeCv = makeCanvas(1, 1);

  /** The neutral eye with its lid at `open` (0 shut, 1 rest), iris moved by ix/iy, lid tilted (rad), glints on the iris. */
  function paintOpenEye(g, img, k, open, ix, iy, tilt, glint, t) {
    const e = EYE[k], [bx0, by0, bx1, by1] = e.ball, w = bx1 - bx0, h = by1 - by0;
    if (eyeCv.width !== w + 40 || eyeCv.height !== h + 40) { eyeCv.width = w + 40; eyeCv.height = h + 40; }
    const c = eyeCv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 20 - bx0, 20 - by0);
    c.clearRect(bx0 - 20, by0 - 20, w + 40, h + 40);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(img[`${k}_ball`], bx0, by0);
    c.globalCompositeOperation = 'source-atop';
    c.drawImage(img[`${k}_iris`], e.iris[0] + ix, e.iris[1] + iy);
    // the eye's outline over the iris, so a shifted iris tucks under it
    if (e.rim && img[`${k}_rim`]) { c.globalCompositeOperation = 'source-over'; c.drawImage(img[`${k}_rim`], e.rim[0], e.rim[1]); }
    if (glint > 0) {
      c.globalCompositeOperation = 'source-atop';
      const ic = [(e.iris[0] + e.iris[2]) / 2 + ix, (e.iris[1] + e.iris[3]) / 2 + iy];
      [[-.16, -.2, 24], [.2, .2, 13]].forEach(([fx, fy, r], j) => {
        const R = r * glint * (.8 + .3 * Math.sin(t * 7 + j * 2 + (k === 'eyeL' ? 0 : 1))), q = R * .28;
        const cx = ic[0] + fx * (e.iris[2] - e.iris[0]), cy = ic[1] + fy * (e.iris[3] - e.iris[1]);
        c.save(); c.translate(cx, cy);
        c.fillStyle = 'rgba(255,255,255,.95)';
        c.beginPath(); c.moveTo(0, -R); c.quadraticCurveTo(q, -q, R, 0); c.quadraticCurveTo(q, q, 0, R); c.quadraticCurveTo(-q, q, -R, 0); c.quadraticCurveTo(-q, -q, 0, -R); c.fill();
        c.restore();
      });
    }
    // the lid hides everything above it
    const d = (1 - clamp(open, 0, 1)) * e.travel, tn = Math.tan(tilt);
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.moveTo(bx0 - 20, by0 - 20);
    for (let x = bx0 - 20; x <= bx1 + 20; x += 3) c.lineTo(x, poly2(e.lidFit, clamp(x, bx0, bx1)) + d + tn * (x - e.cx) - 1);
    c.lineTo(bx1 + 20, by0 - 20);
    c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over';
    g.drawImage(eyeCv, bx0 - 20 - FACE.x, by0 - 20 - FACE.y);
    // the lashes ride down with the lid and flatten as they close
    const L = e.lash, sy = .55 + .45 * clamp(open, 0, 1);
    g.save();
    g.translate(e.cx - FACE.x, e.cy + d - FACE.y);
    g.rotate(tilt);
    g.scale(1, sy);
    g.drawImage(img[`${k}_lash`], L[0] - e.cx, L[1] - e.cy);
    g.restore();
  }

  /** An open eye with no drawing of it: an iris under a lid line, both closing with `open`, the iris moved by ix/iy. */
  function plainEye(g, p) {
    const [x0, y0, x1, y1] = EYE[p.k].ball, w = x1 - x0, h = y1 - y0, open = clamp(p.open, 0, 1);
    g.save();
    g.translate((x0 + x1) / 2 - FACE.x, (y0 + y1) / 2 - FACE.y);
    g.rotate(p.tilt || 0);
    g.strokeStyle = LASH; g.lineWidth = Math.max(3, w * .07); g.lineCap = 'round';
    if (open > .15) {
      g.save();
      g.translate(0, h * .42 * (1 - open));
      g.scale(1, open);
      g.fillStyle = IRIS;
      g.beginPath(); g.ellipse(p.ix, p.iy, w * .3, h * .42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(p.ix - w * .1, p.iy - h * .15, w * .08, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // the lid line comes down as the eye closes
    const ly = -h * .42 + h * .84 * (1 - open);
    g.beginPath(); g.moveTo(-w * .42, ly + h * .06); g.quadraticCurveTo(0, ly - h * .12, w * .42, ly + h * .06); g.stroke();
    g.restore();
  }

  /** A whole drawn sprite at its place, optionally scaled/rotated about its centre. */
  function sprite(g, img, name, o = {}) {
    const b = feat.sprites?.[name];
    if (!b || !img[name]) return;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    g.save();
    g.globalAlpha = o.alpha ?? 1;
    g.translate(cx - FACE.x, cy + (MOUTH_DY[name] || 0) - FACE.y);
    if (o.rot) g.rotate(o.rot);
    g.scale(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1);
    g.drawImage(img[name], b[0] - cx, b[1] - cy);
    g.restore();
  }

  /** An eye drawn with strokes, for a shape whose sprite is missing (or the shut eye). */
  function strokeEye(g, p) {
    const e = EYE[p.k], [x0, y0, x1, y1] = e.ball, w = x1 - x0, h = y1 - y0;
    g.save();
    g.translate((x0 + x1) / 2 - FACE.x, (y0 + y1) / 2 - FACE.y);
    g.scale(p.s ?? 1, (p.s ?? 1) * (p.sy ?? 1));
    g.strokeStyle = LASH; g.lineWidth = Math.max(3, w * .07); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    switch (p.shape) {
      case 'up': g.moveTo(-w * .38, h * .12); g.quadraticCurveTo(0, -h * .32, w * .38, h * .12); g.stroke(); break;
      case 'down': g.moveTo(-w * .38, -h * .05); g.quadraticCurveTo(0, h * .3, w * .38, -h * .05); g.stroke(); break;
      case 'gt': g.moveTo(-w * .3, -h * .25); g.lineTo(w * .25, 0); g.lineTo(-w * .3, h * .25); g.stroke(); break;
      case 'lt': g.moveTo(w * .3, -h * .25); g.lineTo(-w * .25, 0); g.lineTo(w * .3, h * .25); g.stroke(); break;
      case 'heart': {
        const r = w * .32;
        g.moveTo(0, r * .9); g.bezierCurveTo(-r * 1.6, -r * .1, -r * .7, -r * 1.2, 0, -r * .4); g.bezierCurveTo(r * .7, -r * 1.2, r * 1.6, -r * .1, 0, r * .9);
        g.fillStyle = '#e8475f'; g.fill(); g.stroke(); break;
      }
      case 'spiral': {
        g.rotate(p.rot || 0);
        for (let a = 0; a <= Math.PI * 4; a += .2) { const r = a / (Math.PI * 4) * w * .38; g.lineTo(r * Math.cos(a), r * Math.sin(a)); }
        g.stroke(); break;
      }
      default: g.moveTo(-w * .38, 0); g.lineTo(w * .38, 0); g.stroke();
    }
    g.restore();
  }

  const mx = () => MOUTH[0] - FACE.x, my = () => MOUTH[1] - FACE.y;
  /** A small drawn mouth (form < 0 frowns), `w` times the usual width. */
  function lineMouth(g, form, w = 1) {
    const cx = mx(), cy = my();
    g.save(); g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 9 * w, cy - form * 3); g.quadraticCurveTo(cx, cy + form * 5, cx + 9 * w, cy - form * 3); g.stroke();
    g.restore();
  }
  /** An open mouth drawn as an oval, `open` 0..1. */
  function ovalMouth(g, open) {
    g.save(); g.fillStyle = '#c8475a'; g.strokeStyle = INK; g.lineWidth = 2.6;
    g.beginPath(); g.ellipse(mx(), my() + 2, 6 + 3 * open, 2 + 7 * open, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
  /** A cat's ω mouth: two small arcs meeting in the middle. */
  function catMouth(g) {
    const cx = mx(), cy = my(), r = 9.5, y = cy - r * .35, a0 = .05 * Math.PI, a1 = .95 * Math.PI;
    g.save(); g.strokeStyle = INK; g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.arc(cx - r, y, r, a0, a1);
    g.moveTo(cx + r + r * Math.cos(a0), y + r * Math.sin(a0)); g.arc(cx + r, y, r, a0, a1); g.stroke();
    g.restore();
  }
  /** A small smile with the tip of a tongue poking out under it. */
  function tongueMouth(g) {
    lineMouth(g, .5, 1.1);
    const cx = mx() + 3, cy = my() + 4;
    g.save(); g.fillStyle = '#ef8394'; g.strokeStyle = INK; g.lineWidth = 2.6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 6, cy - 1); g.quadraticCurveTo(cx - 7, cy + 11, cx + 1, cy + 12); g.quadraticCurveTo(cx + 9, cy + 11, cx + 7, cy - 1);
    g.fill(); g.stroke();
    g.restore();
  }

  function paintBlush(g, a) {
    if (a < .02) return;
    for (const [x, y, rx, ry] of CHEEKS) {
      g.save();
      g.translate(x - FACE.x, y - FACE.y); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(255,120,140,${f1(.55 * a)})`); gr.addColorStop(1, 'rgba(255,120,140,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  /** Tears running from each eye's lower lid down the cheek, wavering with `t` (`o`: { a, len, w } for happy tears). */
  function paintStreams(g, t, o = {}) {
    const a0 = o.a ?? .95, len = o.len ?? 1, wk = o.w ?? 1;
    g.save();
    EYES.forEach((k, i) => {
      const e = EYE[k], [bx0, , bx1, by1] = e.ball, w = (bx1 - bx0) * .21 * wk;
      const x = bx0 + (bx1 - bx0) * .5 - FACE.x, y0 = by1 - 6 - FACE.y;
      const y1 = Math.min(FACE.h - 4, tearEnd(k) - FACE.y, y0 + 110 * len), wob = 4 * Math.sin(t * 6 + i) * wk;
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(120,195,255,${f1(a0)})`); gr.addColorStop(1, `rgba(120,195,255,${f1(a0 * .3 / .95)})`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x - w * .15, y0);
      g.bezierCurveTo(x - w * .5 + wob, y0 + 25, x - w * .55 + wob, y1 - 20, x - w * .4, y1);
      g.quadraticCurveTo(x, y1 + 6, x + w * .4, y1);
      g.bezierCurveTo(x + w * .55 + wob, y1 - 20, x + w * .5 + wob, y0 + 25, x + w * .15, y0);
      g.closePath(); g.fill();
    });
    g.restore();
  }

  /** Paints the face into `g` (the face texture's 2D context) with sprite images `img`; returns the plan it drew. */
  function paint(g, img, fc, face, o, t) {
    const plan = planFace(fc, face, o, t, n => !!img[n] && !!feat.sprites?.[n]);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, FACE.w, FACE.h);
    paintBlush(g, fc.blush || 0);
    if (fc.streams) paintStreams(g, t, fc.streams === true ? {} : fc.streams);
    for (const p of plan.eyes) {
      if (p.kind === 'open') {
        if (EYE[p.k].drawn && img[`${p.k}_ball`]) paintOpenEye(g, img, p.k, p.open, p.ix, p.iy, p.tilt, p.glint, t);
        else plainEye(g, p);
      }
      else if (p.kind === 'sprite') sprite(g, img, p.name, p);
      else strokeEye(g, p);
    }
    // the face texture is blank skin: the nose is painted too
    if (img.nose) sprite(g, img, 'nose');
    const m = plan.mouth;
    if (m.kind === 'sprite') sprite(g, img, m.name, m);
    else if (m.kind === 'line') lineMouth(g, m.form, m.w ?? 1);
    else if (m.kind === 'oval') ovalMouth(g, m.open);
    else if (m.kind === 'cat') catMouth(g);
    else if (m.kind === 'tongue') tongueMouth(g);
    return plan;
  }

  return { rect: FACE, paint };
}
