/**
 * The DeepSeek whale maid as a pet-core figure: a sprite rig drawn with rig/rig.js.
 *
 * She stands the way Coo does, three-quarters on and facing right; pet-core mirrors the whole
 * group when she turns. pet-core runs the body (walking, jumping, dragging, faces); this file turns
 * each frame it hands over into rig parameters, runs springs for hair, skirt, tail, fins and ahoge,
 * paints the face (eyes, mouth, blush) into a live texture, and draws the rig into a canvas that
 * lives in the pet's own SVG group, so the stage's transform (position, squash, tilt, facing) applies.
 *
 * Every layer was cut from one master drawing, so at rest the parts line up pixel for pixel;
 * what each part hides (the dress under the arm, the hair behind the face, the legs under the
 * skirt) was painted in by edits of that same drawing.
 *
 * Rig space = pet-core's logo space: x=128 under the body, soles at y=256.
 * model.json keeps the master drawing's pixel frame for the face sprites; U/V convert.
 */
import { createRig } from '../rig/rig.js';

const f1 = n => Math.round(n * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const bump = u => Math.sin(Math.PI * clamp(u, 0, 1));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * Lying down (pet-core's `lie`, 0..1) as an over-dissolve: the lying drawing fades in over the seated rig, which
 * stays fully drawn until the drawing is opaque and goes in one step then; getting up runs it backwards. The rig is
 * many layers, so fading it would show them through each other where the drawing does not cover it (her head and
 * headdress, seated, reach above the lying drawing). `poseA` is the drawing's alpha, `standA` the rig's (0 or 1);
 * `hide` drops the rig entirely.
 */
/**
 * The open-hand wave's handover: `openHand` is the wave's strength when the drawn arm may show (the scheme has it,
 * she is not lying); `swap` (0..1) moves from the fist arm to the drawn one as the arm's own rotation `armBase` passes
 * 70..95°, on the way up and back down, so the two point about the same way when they trade.
 */
export const ARM_LIMIT = 135;
export function waveHandover(wave, armBase, lieK, ok) {
  const openHand = ok && lieK < 1e-3 ? wave : 0;
  return { openHand, swap: openHand > 0 ? smooth(70, 95, armBase) : 0 };
}
/** The plain arms' spring (stiffness, damping), exported so tests run the same motion. */
export const ARM_SPRING = { k: 60, c: 9 };

/** How far up (°) the fist arms go for a cheer with the drawn arms, which take over on the way. */
export const CHEER_TO = { near: 80, far: 60 };
/** The cheer's envelope (rise, fall): the arms come down early enough for the springs to get back below the trade. */
export const CHEER_ENV = [.12, .6];
/**
 * A drawn cheer arm's handover, the wave's way: with the drawing shown (`on` > 0) the fist arm goes up toward `to`°
 * (sign of `rest`) and `swap` (0..1) moves to the drawing as the fist arm's own rotation `ang` passes 40..25° short of
 * it, on the way up and back down; `dir` is where the drawn arm points, the fist arm's angle until the swap is done,
 * then on up to its own angle `rest` over the fist arm's last stretch (`lift`), so they always point the same way
 * while they trade.
 */
export function cheerHandover(on, ang, to, rest) {
  if (!(on > 0)) return { swap: 0, lift: 0, dir: ang };
  // high up (the drawn arm is longer than the fist one, and turned lower it would hang beside her legs), and almost a cut:
  // the arm sweeps about 10° a frame there, so a wider crossfade shows a half-seen second arm for a few frames
  const m = Math.sign(rest) * ang, lift = smooth(to - 10, to - 3, m);
  return { swap: smooth(to - 16, to - 13, m), lift, dir: lerp(ang, rest, lift) };
}

/** Gestures that pose the far arm themselves: she takes her chin off her hand for them. */
export const FAR_ARM_GESTURES = ['cheer', 'heart', 'shiver', 'flap', 'flinch', 'peek', 'sip', 'read', 'roll'];
/** The gestures that put something in her hands, and the pose (model.poses.<pose>) that draws it. */
export const PROP_GESTURES = { sip: 'cup', read: 'book' };
/** A roll (`roll`) turns once, eased, over this part of the gesture (as pet-core's rollTurn; the body travels with it). */
export const rollTurn = k => smooth(.2, .8, k);
/**
 * The curled-up drawing's share of a roll: it covers her over the crouch, almost a cut (she is squashed low and
 * moving then), and gives her back as she springs up. 1 hides the standing rig.
 */
export const ballMix = k => smooth(.13, .165, k) * (1 - smooth(.835, .87, k));
/** How far the ball's middle sits above the floor turned by `deg` (model.poses.roll.support, every 5°), so it rolls on its edge. */
export function ballLift(support, deg) {
  const n = support.length, x = (((deg % 360) + 360) % 360) / 360 * n, i = Math.floor(x) % n;
  return lerp(support[i], support[(i + 1) % n], x - Math.floor(x));
}
/** How far the cup comes up to her mouth (0..1) at `k` of the sip: over its middle, while pet-core shuts her eyes. */
export const sipLift = k => smooth(.38, .5, k) * (1 - smooth(.56, .66, k));
/** Whether she props her chin on her far hand: thinking, standing or sitting still, the far arm free. */
export function chinWanted(face, mode, lieK, gesture) {
  return face === 'thinking' && !lieK && (mode === 'idle' || mode === 'sit' || mode === 'wake') && !FAR_ARM_GESTURES.includes(gesture?.kind);
}

export function poseMix(lieK) {
  const poseA = smooth(.2, .45, lieK), standA = poseA >= 1 ? 0 : 1;
  return { poseA, standA, hide: standA <= 0 };
}

/** The lying drawing's deformers (model.poses.lie), from the floor up and outside the standing tree. */
export function lieDeformers(LIE) {
  const r = LIE.rects, pv = LIE.pivots;
  return {
    lie: { kind: 'rot', pivot: pv.lie },
    lieBack: { kind: 'warp', parent: 'lie', rect: r.back },
    lieHead: { kind: 'warp', parent: 'lieBack', rect: r.head },
    lieLegs: { kind: 'warp', parent: 'lieHead', rect: r.legs },
    lieTail: { kind: 'rot', parent: 'lie', pivot: pv.lieTail },
    lieTailBend: { kind: 'warp', parent: 'lieTail', rect: r.tail },
  };
}

/**
 * The lying pose's kick, as lieLegs' warp field: the raised shins turn about the knee (`ax` = poses.lie.legAxis),
 * the near one by kc + kd radians and the far one by kc - kd, bending more toward the shoes. Nothing is beside the near
 * shin; beyond the far one the field dies out (ax.far: how far that shin reaches from the knee→shoe line, rig units, -
 * on the far side), and below mid-shin, where the far shin is behind the skirt, already at ax.gap, the seam where the
 * two shins meet. So the head and body never move with it. The two turns blend across that seam; it is one mesh,
 * so keep kd small (see KICK).
 */
export function kickField(ax, kc, kd) {
  const [kx, ky] = ax.knee, lx = ax.shoe[0] - kx, ly = ax.shoe[1] - ky, len2 = lx * lx + ly * ly, len = Math.sqrt(len2);
  return (u, v, x, y) => {
    const dx = x - kx, dy = y - ky, along = clamp((dx * lx + dy * ly) / len2, 0, 1), side = (dx * ly - dy * lx) / len;
    const hi = smooth(.4, .6, along), edge = lerp(ax.gap - 4, ax.far, hi), fall = lerp(6, 14, hi);
    const w = along * along * smooth(edge - fall, edge, side);
    const a = (kc + kd * (2 * smooth(ax.gap - 8, ax.gap + 8, side) - 1)) * w;
    return [-a * dy, a * dx];
  };
}
// the kick's limits (degrees): the swing of both shins, and how far apart they go (kd), which the seam between them takes
export const KICK = { amp: 10, apart: 1.25 };

/**
 * How far the lying drawing's eyes are shut (0..1), for its eyes-shut overlay: blinks, sleep and dozing (o.drowse), the
 * shut-eye shapes (up, down), and lid eyes that are nearly closed (cry, squeeze, a yawn, waking). The drawing has no
 * half-lids, so a half-lidded face (smug, disgusted) keeps its eyes open.
 */
export function eyesShut(o, eyes, mode) {
  const e = eyes?.[0] || {};
  return Math.max(o.blink || 0, o.eyeClose || 0, mode === 'sleep' ? 1 : 0, smooth(.6, 1, o.drowse || 0),
    e.shape === 'up' || e.shape === 'down' ? 1 : 0, e.shape === 'lid' ? 1 - smooth(1.5, 4, e.ry ?? 16) : 0);
}

/**
 * The back drawing's tail flick, as backTail's warp field: the fluke (the outer part of the way from the pivot to the right
 * of `BACK.tail`, from its top down) turns `a` radians about the tail's pivot. The rig hands a warp every vertex of the part,
 * so the field itself keeps the far fin, hair and headdress above the tail still.
 */
export function backTailField(BACK, a) {
  const [rx, ry] = BACK.pivots.backTail, [, ty, tx1] = BACK.tail, x0 = rx + .35 * (tx1 - rx), x1 = rx + .95 * (tx1 - rx);
  return (u, v, x, y) => { const w = smooth(x0, x1, x) * smooth(ty, ty + 12, y) * a; return [-w * (y - ry), w * (x - rx)]; };
}

/**
 * How much of her back shows (`k`, 0..1) from the frame's `facing` (-1..1) and how far she has turned away (`awayA`),
 * and whether the drawing is mirrored. It is drawn as she turns her back on you, the fluke on the far side from her
 * front's tail; mid-turn it is mirrored (`flip`), so the fluke stays on the side her tail was, then is, as she goes round.
 */
export function backView(facing, awayA) {
  const turn = 1 - smooth(.3, .6, Math.abs(facing ?? 1));
  return { k: Math.max(turn, awayA), flip: turn > awayA };
}

/**
 * The away gesture's share of her back (`awayBack`, from this frame's gesture) carried over frames: it follows the
 * gesture's own turns (in, and out at the narrowest moment of the squeeze), but an away dropped or replaced early
 * turns her round over .3 s instead of in one frame.
 */
export function awayStep(awayA, awayBack, g, dt) {
  return g?.kind === 'away' && g.k > .5 ? awayBack : Math.max(awayBack, awayA - dt / .3);
}

// the face texture covers this rect of the master drawing, one texel per master pixel
const FACE = { x: 520, y: 578, w: 390, h: 252 };
// the head's parallax warps act over this rect (rig units); the long hair below it stays put
const HEAD = [30, 12, 215, 168];

/* ---------- springs ---------- */
// `lim` bounds the output: a hard throw may overshoot, the hair must not fold over itself
function spring(k, c, lim = Infinity) {
  return {
    x: 0, v: 0,
    step(target, dt) {
      this.v += ((target - this.x) * k - this.v * c) * dt;
      this.x += this.v * dt;
      if (Math.abs(this.x) > lim) { this.x = Math.sign(this.x) * lim; this.v = 0; }
      return this.x;
    },
  };
}

function loadImage(url) {
  return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; });
}

/**
 * Loads the model and textures; resolves to a figure object for createPet's `opts.figure`.
 * `opts.raster` shows each frame as an SVG <image> copied from the canvas instead of the canvas itself (slower;
 * for pages that are screen-recorded, where a WebGL canvas inside SVG is not always in the capture).
 * `opts.scheme` picks a colour scheme (model.schemes; default the original); `opts.model` (model.json
 * already parsed) and `opts.asset(path)` (a texture's URL) are for pages that bundle the files;
 * `opts.loadImage` is the figure frame's (figure-frame.js), which loads images WebGL may read there.
 */
export async function createWhaleFigure(base = new URL('./', import.meta.url), opts = {}) {
  const model = opts.model || await (await fetch(new URL('model.json', base))).json();
  const asset = opts.asset || (p => new URL(p, base));
  const load = opts.loadImage || loadImage;
  const { S, X0, FEET } = model.units;
  const U = x => 128 + (x - X0) * S, V = y => 256 - (FEET - y) * S;
  const PV = model.pivots, feat = model.feat;
  const EYES = ['eyeL', 'eyeR'];  // near (left) eye, far (right) eye
  const featNames = [...Object.keys(feat.sprites), ...EYES.flatMap(k => ['lash', 'ball', 'iris', ...(feat.eyes[k].rim ? ['rim'] : [])].map(n => `${k}_${n}`))];
  // a scheme is a set of textures over the same geometry; the original's are at tex/ and feat/
  const SCHEMES = (model.schemes || [{ id: 'deepseek' }]).filter(sc => sc.ready !== false);
  const schemeInfo = id => SCHEMES.find(sc => sc.id === id) || SCHEMES[0];
  // lying on her front is a drawing of its own (model.poses.lie): its files are optional, scheme by scheme
  const LIE = model.poses?.lie;
  const LIE_PARTS = LIE ? [...LIE.required, ...LIE.overlays] : [];
  // waving with an open hand is a drawing of the near arm raised (model.poses.wave), optional the same way
  const WAVE = model.poses?.wave;
  // thinking, she rests her chin on her far hand: a drawing of the far forearm raised (model.poses.chin)
  const CHIN = model.poses?.chin;
  // cheering, both arms go up with open hands: one drawing per arm (model.poses.cheer.arms.near / .far)
  const CHEER = model.poses?.cheer?.arms;
  const CHEER_PARTS = CHEER ? Object.values(CHEER).flatMap(a => a.required) : [];
  // a heart made with both hands in front of her chest: one drawing of both forearms (model.poses.heart)
  const HEART = model.poses?.heart;
  // a cup held in both hands, a book held open: one drawing of both forearms and the thing they hold (model.poses.cup / .book)
  const PROPS = Object.fromEntries(Object.entries(PROP_GESTURES).filter(([, k]) => model.poses?.[k]).map(([g, k]) => [g, model.poses[k]]));
  const PROP_PARTS = Object.values(PROPS).flatMap(p => p.required);
  // her back, for the middle of a turn and for turning her back on you (model.poses.back): one drawing, the tail flicks on its mesh
  const BACK = model.poses?.back;
  // a roll: one drawing of her curled up into a ball (model.poses.roll), turned whole about its middle
  const ROLL = model.poses?.roll;
  const POSE_PARTS = [...LIE_PARTS, ...(WAVE ? WAVE.required : []), ...(CHIN ? CHIN.required : []), ...CHEER_PARTS, ...(HEART ? HEART.required : []), ...PROP_PARTS, ...(BACK ? BACK.required : []), ...(ROLL ? ROLL.required : [])];
  // the scheme's accent colours the listening arcs, thought bubbles and sleep z's
  const accent = () => schemeInfo(scheme).accent || '#4d6bfe';
  const loaded = {}, ready = {};
  function loadScheme(id) {
    if (loaded[id]) return loaded[id];
    const dir = id === SCHEMES[0].id ? '' : `schemes/${id}/`;
    const set = { tex: {}, img: {} };
    loaded[id] = Promise.all([
      ...model.parts.map(async p => { set.tex[p.tex] = await load(asset(`${dir}tex/${p.tex}.png`)); }),
      ...featNames.map(async n => { set.img[n] = await load(asset(`${dir}feat/${n}.png`)); }),
      // a missing pose file only takes that pose (or overlay) away from this scheme
      ...POSE_PARTS.map(async p => { const im = await load(asset(`${dir}tex/${p.tex}.png`)).catch(() => null); if (im) set.tex[p.tex] = im; }),
    ]).then(() => {
      set.lie = !!LIE && LIE.required.every(p => set.tex[p.tex]);
      set.wave = !!WAVE && WAVE.required.every(p => set.tex[p.tex]);
      set.chin = !!CHIN && CHIN.required.every(p => set.tex[p.tex]);
      set.cheer = !!CHEER && CHEER_PARTS.every(p => set.tex[p.tex]);
      set.heart = !!HEART && HEART.required.every(p => set.tex[p.tex]);
      for (const [g, pose] of Object.entries(PROPS)) set[g] = pose.required.every(p => set.tex[p.tex]);
      set.back = !!BACK && BACK.required.every(p => set.tex[p.tex]);
      set.roll = !!ROLL && ROLL.required.every(p => set.tex[p.tex]);
      if (LIE && !set.lie && LIE.required.some(p => set.tex[p.tex])) console.warn(`whale: scheme ${id} lacks some lying-pose files; she sits instead`);
      return (ready[id] = set);
    });
    return loaded[id];
  }
  let scheme = schemeInfo(opts.scheme).id;
  let cur = await loadScheme(scheme);  // the set whose textures are drawn (until a fade ends, the outgoing one)
  let { tex, img } = cur;
  const box = Object.fromEntries(model.parts.map(p => [p.id, p.box]));
  const rectOf = id => { const [x, y, w, h] = box[id]; return [x, y, x + w, y + h]; };

  /* deformers: each acts in rest space; parents act after children */
  const deformers = {
    body: { kind: 'rot', pivot: PV.body },
    skirt: { kind: 'warp', parent: 'body', rect: rectOf('skirt') },
    skirtSit: { kind: 'warp', parent: 'body', rect: rectOf('skirt_sit') },
    // the upper body (bodice, arms, head) turns about the waist for a bow; the skirt and legs stay put
    waist: { kind: 'rot', parent: 'body', pivot: PV.waist },
    armNear: { kind: 'rot', parent: 'waist', pivot: PV.armNear },
    armFar: { kind: 'rot', parent: 'waist', pivot: PV.armFar },
    legBack: { kind: 'rot', parent: 'body', pivot: PV.legBack },
    legFront: { kind: 'rot', parent: 'body', pivot: PV.legFront },
    tail: { kind: 'rot', parent: 'body', pivot: PV.tail },
    tailBend: { kind: 'warp', parent: 'tail', rect: rectOf('tail') },
    neck: { kind: 'rot', parent: 'waist', pivot: PV.neck },
    headBack: { kind: 'warp', parent: 'neck', rect: HEAD },
    headMid: { kind: 'warp', parent: 'neck', rect: HEAD },
    headFeat: { kind: 'warp', parent: 'neck', rect: HEAD },
    headFront: { kind: 'warp', parent: 'neck', rect: HEAD },
    hairSway: { kind: 'warp', parent: 'headBack', rect: rectOf('hair_back') },
    bangsSway: { kind: 'warp', parent: 'headFront', rect: rectOf('bangs') },
    finNear: { kind: 'rot', parent: 'headMid', pivot: PV.finNear },
    finFar: { kind: 'rot', parent: 'headBack', pivot: PV.finFar },
    ahoge: { kind: 'rot', parent: 'headFront', pivot: PV.ahoge },
  };
  const parts = model.parts.map(p => ({ ...p, parent: p.id === 'torso_up' ? 'waist' : p.parent }));
  // the face features ride a little ahead of the face for the turn
  parts.push({ id: 'faceFx', tex: 'faceFx', box: [U(FACE.x), V(FACE.y), FACE.w * S, FACE.h * S], z: 9, parent: 'headFeat', grid: [4, 4] });
  // the brows lie on the skin under the fringe, and show through the hair: the same texture is drawn
  // again over the fringe, faint. Each brow lifts and tilts by the face (the warp below splits them).
  const brows = parts.find(p => p.id === 'brows');
  if (brows) {
    deformers.brows = { kind: 'warp', parent: 'headFeat', rect: rectOf('brows') };
    brows.parent = 'brows';
    parts.push({ ...brows, id: 'brows_through', z: 13.2, alpha: .4 });
  }
  // the lid creases follow each eye's upper lid down when the eye narrows, and go when it closes
  const creases = parts.find(p => p.id === 'eye_creases');
  if (creases) {
    deformers.creases = { kind: 'warp', parent: 'headFeat', rect: rectOf('eye_creases') };
    creases.parent = 'creases';
  }

  /* the lying drawing: on its own deformers from the floor, outside the standing tree. The body piece rides
     every warp (legs inside head inside back), and so does each overlay, which keeps them registered */
  const STANDING = Object.fromEntries(parts.map(p => [p.id, true]));
  if (LIE) {
    Object.assign(deformers, lieDeformers(LIE));
    for (const p of LIE_PARTS) parts.push({ ...p, alpha: 0 });
  }
  const poseOK = () => !!(cur.lie && (!fade || fade.set.lie));
  // the raised arm turns about its shoulder with the upper body; its hand waves about the wrist
  if (WAVE) {
    const [wx, wy, ww, wh] = WAVE.required[0].box;
    deformers.armWave = { kind: 'rot', parent: 'waist', pivot: WAVE.pivots.armWave };
    deformers.armWaveHand = { kind: 'warp', parent: 'armWave', rect: [wx, wy, wx + ww, wy + wh] };
    for (const p of WAVE.required) { parts.push({ ...p, alpha: 0 }); STANDING[p.id] = true; }
  }
  const waveOK = () => !!(cur.wave && (!fade || fade.set.wave));
  // the chin-rest forearm turns about its elbow and rides the neck, so the hand stays under the chin as the head moves
  if (CHIN) {
    deformers.armChin = { kind: 'rot', parent: 'neck', pivot: CHIN.pivots.armChin };
    for (const p of CHIN.required) { parts.push({ ...p, alpha: 0 }); STANDING[p.id] = true; }
  }
  const chinOK = () => !!(cur.chin && (!fade || fade.set.chin));
  // each raised arm turns about its own shoulder with the upper body
  if (CHEER) {
    for (const arm of Object.values(CHEER)) {
      const [id, pivot] = Object.entries(arm.pivots)[0];
      deformers[id] = { kind: 'rot', parent: 'waist', pivot };
      for (const p of arm.required) { parts.push({ ...p, alpha: 0 }); STANDING[p.id] = true; }
    }
  }
  const cheerOK = () => !!(cur.cheer && (!fade || fade.set.cheer));
  // the heart rides the upper body, so a bow or a lean carries it
  if (HEART) {
    deformers.armHeart = { kind: 'rot', parent: 'waist', pivot: HEART.pivots.armHeart };
    for (const p of HEART.required) { parts.push({ ...p, alpha: 0 }); STANDING[p.id] = true; }
  }
  const heartOK = () => !!(cur.heart && (!fade || fade.set.heart));
  // each held thing rides the upper body like the heart; its top half (hands and cup) lifts on a warp for the sip
  for (const [g, pose] of Object.entries(PROPS)) {
    const [id, pivot] = Object.entries(pose.pivots)[0], [bx, by, bw, bh] = pose.required[0].box;
    deformers[id] = { kind: 'rot', parent: 'waist', pivot };
    deformers[id + 'Lift'] = { kind: 'warp', parent: id, rect: [bx, by, bx + bw, by + bh] };
    for (const p of pose.required) { parts.push({ ...p, parent: id + 'Lift', alpha: 0 }); STANDING[p.id] = true; }
  }
  const propOK = g => !!(cur[g] && (!fade || fade.set[g]));
  // the back drawing stands on the body (its sway, breath and squash), mirrored about her middle mid-turn (backFlip),
  // with its own warp for the tail's fluke
  if (BACK) {
    deformers.backFlip = { kind: 'rot', parent: 'body', pivot: [128, 256] };
    deformers.backTail = { kind: 'warp', parent: 'backFlip', rect: BACK.tail };
    for (const p of BACK.required) parts.push({ ...p, alpha: 0 });
  }
  const backOK = () => !!(cur.back && (!fade || fade.set.back));
  // the ball turns about its middle on the floor, outside the standing tree (only the stage's squash and facing reach it)
  if (ROLL) {
    deformers.rollBall = { kind: 'rot', pivot: ROLL.pivots.rollBall };
    for (const p of ROLL.required) parts.push({ ...p, alpha: 0 });
  }
  const rollOK = () => !!(cur.roll && (!fade || fade.set.roll));
  /** Whether her back can show now: she has the drawing and is standing (seated or lying she turns as before). */
  const backable = () => !!BACK && backOK() && sitK < .5 && !lieK;

  /* ---------- face painting (master pixels) ---------- */
  const faceCv = document.createElement('canvas');
  faceCv.width = FACE.w; faceCv.height = FACE.h;
  // while a scheme fades in, the face is painted a second time with the incoming scheme's sprites
  const faceCv2 = document.createElement('canvas');
  faceCv2.width = FACE.w; faceCv2.height = FACE.h;
  const fg1 = faceCv.getContext('2d'), fg2 = faceCv2.getContext('2d');
  let fg = fg1;
  const eyeCv = document.createElement('canvas');
  const INK = '#5a2330';
  const poly2 = (c, x) => c[0] * x * x + c[1] * x + c[2];

  // how far the lid travels to close: from the lid line down past the lower rim
  const EYE = Object.fromEntries(EYES.map(k => {
    const e = feat.eyes[k], [x0, , x1] = e.ball;
    let h = 0;
    for (let x = x0 + 4; x < x1 - 4; x += 2) h = Math.max(h, poly2(e.rimFit, x) - poly2(e.lidFit, x));
    const cx = (e.iris[0] + e.iris[2]) / 2;
    return [k, { ...e, travel: h + 2, cx, cy: poly2(e.lidFit, cx) }];
  }));

  /**
   * The neutral eye with its lid at `open` (0 shut, 1 rest), iris moved by ix/iy, lid tilted by tilt (rad);
   * `glint` (0..1) adds star highlights on the iris, which twinkle with `t`.
   */
  function paintOpenEye(k, open, ix, iy, tilt, glint = 0, t = 0) {
    const e = EYE[k], [bx0, by0, bx1, by1] = e.ball, w = bx1 - bx0, h = by1 - by0;
    if (eyeCv.width !== w + 40 || eyeCv.height !== h + 40) { eyeCv.width = w + 40; eyeCv.height = h + 40; }
    const g = eyeCv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 20 - bx0, 20 - by0);
    g.clearRect(bx0 - 20, by0 - 20, w + 40, h + 40);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(img[`${k}_ball`], bx0, by0);
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(img[`${k}_iris`], e.iris[0] + ix, e.iris[1] + iy);
    // the eye's outline over the iris, so a shifted iris tucks under it
    if (e.rim) { g.globalCompositeOperation = 'source-over'; g.drawImage(img[`${k}_rim`], e.rim[0], e.rim[1]); }
    if (glint > 0) {
      // white four-point stars on the iris, the far eye's foreshortened; painted inside the eye, so the lid and lashes cover them
      g.globalCompositeOperation = 'source-atop';
      const sc = k === 'eyeL' ? 1 : .6, ic = [(e.iris[0] + e.iris[2]) / 2 + ix, (e.iris[1] + e.iris[3]) / 2 + iy];
      [[-.16, -.2, 24], [.2, .2, 13]].forEach(([fx, fy, r], j) => {
        const R = r * glint * (.8 + .3 * Math.sin(t * 7 + j * 2 + (k === 'eyeL' ? 0 : 1))), w = R * .28;
        const cx = ic[0] + fx * (e.iris[2] - e.iris[0]), cy = ic[1] + fy * (e.iris[3] - e.iris[1]);
        g.save(); g.translate(cx, cy); g.scale(sc, 1);
        g.fillStyle = 'rgba(255,255,255,.95)';
        g.beginPath(); g.moveTo(0, -R); g.quadraticCurveTo(w, -w, R, 0); g.quadraticCurveTo(w, w, 0, R); g.quadraticCurveTo(-w, w, -R, 0); g.quadraticCurveTo(-w, -w, 0, -R); g.fill();
        g.restore();
      });
    }
    // the lid hides everything above it
    const d = (1 - clamp(open, 0, 1)) * e.travel, tn = Math.tan(tilt);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(bx0 - 20, by0 - 20);
    for (let x = bx0 - 20; x <= bx1 + 20; x += 3) g.lineTo(x, poly2(e.lidFit, clamp(x, bx0, bx1)) + d + tn * (x - e.cx) - 1);
    g.lineTo(bx1 + 20, by0 - 20);
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    fg.drawImage(eyeCv, bx0 - 20 - FACE.x, by0 - 20 - FACE.y);
    // the lashes ride down with the lid and flatten as they close
    const L = e.lash, sy = .55 + .45 * clamp(open, 0, 1);
    fg.save();
    fg.translate(e.cx - FACE.x, e.cy + d - FACE.y);
    fg.rotate(tilt);
    fg.scale(1, sy);
    fg.drawImage(img[`${k}_lash`], L[0] - e.cx, L[1] - e.cy);
    fg.restore();
  }

  // Each mouth sprite sits where its expression edit drew it, and three of those edits drew the mouth
  // higher than the master's: these move them down (master pixels) so the middle of each visible mouth
  // is on the master's mouth line, y 769, as the neutral, love, dizzy and surprised mouths already are.
  const MOUTH_DY = { happy_mouth: 9, drag_mouth: 16, sleep_mouth: 4 };

  /** A whole drawn sprite (an expression's eye or mouth) at its place, optionally scaled/rotated about its centre. */
  function sprite(name, o = {}) {
    const b = feat.sprites[name];
    if (!b) return;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    fg.save();
    fg.globalAlpha = o.alpha ?? 1;
    fg.translate(cx - FACE.x, cy + (MOUTH_DY[name] || 0) - FACE.y);
    if (o.rot) fg.rotate(o.rot);
    fg.scale(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1);
    fg.drawImage(img[name], b[0] - cx, b[1] - cy);
    fg.restore();
  }

  const CHEEKS = [[618, 770, 40, 20], [852, 762, 22, 15]];
  function paintBlush(a) {
    if (a < .02) return;
    for (const [x, y, rx, ry] of CHEEKS) {
      fg.save();
      fg.translate(x - FACE.x, y - FACE.y); fg.scale(1, ry / rx);
      const gr = fg.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(255,120,140,${f1(.55 * a)})`); gr.addColorStop(1, 'rgba(255,120,140,0)');
      fg.fillStyle = gr; fg.beginPath(); fg.arc(0, 0, rx, 0, Math.PI * 2); fg.fill();
      fg.restore();
    }
  }

  /** Small drawn mouths for the moods the sprites don't cover (form < 0 frowns). */
  function lineMouth(form, w = 1) {
    const cx = 766 - FACE.x, cy = 772 - FACE.y;
    fg.save(); fg.strokeStyle = INK; fg.lineWidth = 3; fg.lineCap = 'round';
    fg.beginPath(); fg.moveTo(cx - 9 * w, cy - form * 3); fg.quadraticCurveTo(cx, cy + form * 5, cx + 9 * w, cy - form * 3); fg.stroke();
    fg.restore();
  }

  const MOUTH = {
    neutral: 'neutral_mouth', happy: 'happy_mouth', wink: ['happy_mouth', .8], love: 'love_mouth', shy: ['drag_mouth', .7],
    surprised: 'surprised_mouth', sleepy: 'sleep_mouth', sleep: 'sleep_mouth', dizzy: 'dizzy_mouth', dragged: 'drag_mouth',
    content: 'neutral_mouth', waking: ['surprised_mouth', .6], squeeze: 'sleep_mouth', listening: 'neutral_mouth',
    thinking: 'sleep_mouth', run: ['happy_mouth', .7], angry: -1, sad: -1.2,
    smug: .7, pout: ['surprised_mouth', .45], worried: ['drag_mouth', .6], determined: .15, flustered: ['drag_mouth', .8],
    scared: ['drag_mouth', .8], excited: 'happy_mouth', cry: ['surprised_mouth', .8], confused: -.35,
    disgusted: ['drag_mouth', .6], nervous: -.2,
    // [form, width]: a drawn mouth wider (or narrower) than the usual
    gentle: .45, awkward: [.05, 1.6], giggle: .6, moved: ['happy_mouth', .7], petrify: ['surprised_mouth', .5],
  };

  // where the face's outline is under each eye's tear (master y), with room for the stream's rounded end
  const TEAR_END = { eyeL: 816, eyeR: 786 };
  /** Tears running from each eye's lower lid down the cheek (master pixels), wavering with `t`. */
  function paintStreams(t, o = {}) {
    // (`o`: { a, len, w } for fainter, shorter, thinner tracks, happy tears)
    const a0 = o.a ?? .95, len = o.len ?? 1, wk = o.w ?? 1;
    fg.save();
    EYES.forEach((k, i) => {
      const e = EYE[k], [bx0, , bx1, by1] = e.ball, w = (bx1 - bx0) * (k === 'eyeL' ? .22 : .2) * wk;
      // from just under the shut lid, narrow where it wells up and widening as it runs down
      // (painted before the eyes, so the shut lid's lashes lie over its top; it stops above the jaw under each eye)
      const x = bx0 + (bx1 - bx0) * (k === 'eyeL' ? .55 : .5) - FACE.x, y0 = by1 - 6 - FACE.y;
      const y1 = Math.min(FACE.h - 4, TEAR_END[k] - FACE.y, y0 + 110 * len), wob = 4 * Math.sin(t * 6 + i) * wk;
      const gr = fg.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(120,195,255,${f1(a0)})`); gr.addColorStop(1, `rgba(120,195,255,${f1(a0 * .3 / .95)})`);
      fg.fillStyle = gr;
      fg.beginPath();
      fg.moveTo(x - w * .15, y0);
      fg.bezierCurveTo(x - w * .5 + wob, y0 + 25, x - w * .55 + wob, y1 - 20, x - w * .4, y1);
      fg.quadraticCurveTo(x, y1 + 6, x + w * .4, y1);
      fg.bezierCurveTo(x + w * .55 + wob, y1 - 20, x + w * .5 + wob, y0 + 25, x + w * .15, y0);
      fg.closePath(); fg.fill();
    });
    fg.restore();
  }

  function paintFace(fc, face, o, t) {
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.clearRect(0, 0, FACE.w, FACE.h);
    paintBlush(fc.blush || 0);
    if (fc.streams) paintStreams(t, fc.streams === true ? {} : fc.streams);
    const shut = Math.max(o.blink || 0, o.eyeClose || 0);
    const lx = clamp(o.look[0], -6, 6), ly = clamp(o.look[1], -5, 5);
    const tilt = fc.brows === 'angry' ? .2 : fc.brows === 'sad' ? -.16 : 0;
    fc.eyes.forEach((e, i) => {
      const k = EYES[i], side = k === 'eyeL' ? 1 : -1;  // the near eye's inner corner is to its right
      const squash = { sy: 1 - .85 * (o.eyeClose || 0) };
      if ((face === 'surprised' || fc.wide) && e.shape === 'ring') { sprite(`surprised_${k}`, squash); return; }
      switch (e.shape) {
        case 'ring': case 'lid': {
          const open = (e.shape === 'ring' ? clamp(e.ry / e.rx, 0, 1) * (tilt ? .8 : 1) : clamp(e.ry / 16, 0, 1)) * (1 - shut);
          // the iris fills most of the eye: it only shifts a little, less in the foreshortened far eye,
          // so the white never shows past the eye's outline
          const gx = k === 'eyeL' ? 1 : .35;
          const ix = clamp((lx + (e.dx || 0)) * gx, -6 * gx, 6 * gx), iy = clamp(ly * .7 + (e.dy || 0) * .7, -3.5, 3.5);
          paintOpenEye(k, open, ix, iy + (e.shape === 'lid' ? 3 : 0), tilt * side, fc.sparkle ? 1 : 0, t);
          break;
        }
        case 'up': sprite(`happy_${k}`, squash); break;
        case 'down': sprite(`sleep_${k}`, squash); break;
        case 'gt': case 'lt': sprite(`drag_${k}`, { s: 1 + .03 * Math.sin(t * 22 + i) }); break;
        case 'heart': sprite(`love_${k}`, { s: .94 + .06 * (e.s ?? 1) / .8 }); break;
        case 'spiral': sprite(`dizzy_${k}`, { rot: (e.rot || 0) * .6 }); break;
      }
    });
    // mouth: talking opens the happy mouth about its middle, which stays on the mouth line; otherwise the face's own
    // (stone does not talk)
    const talk = face === 'petrify' ? 0 : o.talk || 0;
    const gapOpen = clamp((Math.max(fc.gap[0], fc.gap[1]) - 50) / 14, 0, 1);
    const m = MOUTH[face] ?? 'neutral_mouth';
    const open = Math.max(talk * (.45 + .45 * Math.abs(Math.sin(t * 17))), face === 'sleepy' || face === 'waking' ? gapOpen : 0);
    if (open > .12) sprite(face === 'surprised' ? 'surprised_mouth' : 'happy_mouth', { sy: .35 + .65 * open, sx: .85 + .15 * open });
    // breathing out a sigh, a small round "ha"
    else if (fc.puff > .1) sprite('surprised_mouth', { s: .55 + .25 * fc.puff });
    else if (typeof m === 'number') lineMouth(m);
    else if (Array.isArray(m) && typeof m[0] === 'number') lineMouth(m[0], m[1]);
    else if (Array.isArray(m)) sprite(m[0], { s: m[1] });
    else sprite(m);
  }

  /* ---------- mounting inside the pet's SVG group ---------- */
  const VIEW = model.view;
  let fo = null, canvas = null, fxG = null, rig = null, mountedIn = null, pxScale = 0, frameN = 0;
  function mount(petG) {
    petG.textContent = '';
    // the previous rig's GL context outlives its canvas until GC: release it or repeated
    // figure switches pile up live contexts (Chromium caps them per page)
    rig?.dispose();
    rig = null;
    const box = (el) => { el.setAttribute('x', VIEW[0]); el.setAttribute('y', VIEW[1]); el.setAttribute('width', VIEW[2] - VIEW[0]); el.setAttribute('height', VIEW[3] - VIEW[1]); return el; };
    canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    if (opts.raster) {
      // each frame is copied into a plain SVG image: screenshots and recordings then always see it
      fo = box(document.createElementNS(SVGNS, 'image'));
    } else {
      fo = box(document.createElementNS(SVGNS, 'foreignObject'));
      canvas.style.cssText = 'width:100%;height:100%;display:block';
      fo.appendChild(canvas);
    }
    fxG = document.createElementNS(SVGNS, 'g');
    petG.append(fo, fxG);
    rig = createRig(canvas, { deformers, parts, view: VIEW });
    for (const n in tex) rig.upload(n, tex[n]);
    if (fade) for (const n in fade.set.tex) rig.upload(n + '@mix', fade.set.tex[n]);
    mountedIn = petG; pxScale = 0;
  }
  // a fade in progress: the rig crossfades every part from `tex` to fade.set's textures over fade.dur seconds
  let fade = null;
  function endFade() {
    if (!fade) return;
    cur = fade.set; tex = cur.tex; img = cur.img; fade = null;
    if (rig) for (const n in tex) rig.upload(n, tex[n]);
  }
  /**
   * Switches the colour scheme: at once if its textures are loaded (see preload), else once they are.
   * `o.fade` (seconds) crossfades instead of cutting over; the clock is the frames' `t`, starting at `o.at`
   * (the pet's time now) or else at the next frame drawn.
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
        // a lying file the incoming scheme lacks fades to the outgoing one's, not to what an earlier fade left there
        for (const p of POSE_PARTS) if (!set.tex[p.tex] && tex[p.tex]) rig.upload(p.tex + '@mix', tex[p.tex]);
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
    // the vertical axis: turning round squeezes the horizontal one through zero, which would shrink the canvas to a few texels
    const k = fixedRes || Math.hypot(m.c, m.d) * (window.devicePixelRatio || 1) * 1.25;
    if (Math.abs(k - pxScale) / (pxScale || 1) < .08) return;
    pxScale = k;
    canvas.width = Math.max(16, Math.round((VIEW[2] - VIEW[0]) * Math.min(k, 6)));
    canvas.height = Math.max(16, Math.round((VIEW[3] - VIEW[1]) * Math.min(k, 6)));
  }

  /* ---------- per-frame state ---------- */
  const sp = {
    hair: spring(55, 7, 1.8), hairY: spring(50, 8, 1.2), bangs: spring(110, 10, 1.6),
    skirt: spring(100, 9, 1.6), skirtY: spring(90, 10, 1.1), tail: spring(40, 5, 32), fins: spring(90, 9, 30),
    ahoge: spring(140, 6, 38), head: spring(70, 10, 16), armN: spring(ARM_SPRING.k, ARM_SPRING.c, ARM_LIMIT), armF: spring(ARM_SPRING.k, ARM_SPRING.c, 95),
  };
  let lastT = null, prevTilt = 0, prevYaw = 0, prevLow = 0, headTilt = 0, fx = '';
  const fxTurn = [0, 0]; // this frame's head turn (angleX, angleY), for effects drawn over the face
  // pet-core tips Coo's whole round body to listen, nod, doze or wobble; she keeps her feet on the floor and
  // moves her head instead. Only flight, dragging and the jump's crouch and landing tip the whole group,
  // running keeps half its lean. The shares ease between modes so the group never snaps.
  // dancing sways her mostly as a whole, the rest of the sway goes to the neck
  const GROUP = { air: [1, 1], drag: [1, 1], crouch: [1, 1], land: [1, 1], walk: [1, .5], run: [1, .5], dance: [.6, 0] };
  let wTilt = 0, wLean = 0;
  const groupTilt = (mode, tilt, lean) => tilt * wTilt + lean * wLean;
  // the cup's steam: how much, and where (deformer and point at the cup's rim)
  let steam = 0, steamAt = null;
  // how far a sigh's breath has gone out (0..1), for its little clouds
  let puffK = 0;
  // whether the last frame may be held as stone, whether it hid the standing rig (a frozen frame draws it again as it was),
  // and how grey she is
  let frozenOK = false, lastHidden = false, stoneK = 0;
  let finMood = 0, tailMood = 0, wagAmp = 0, sitK = 0, danceK = 0, lieK = 0, poseShown = 0, kickPh = 0, chinK = 0, backA = 0, awayA = 0;
  const st = { z: {}, alpha: {} };

  // fins and tail by face: fins up (+) or drooping (-), tail wag size, and how far the tail droops (1 = 12°)
  const MOOD = {
    happy: [.8, 1], love: [.9, 1], wink: [.5, .7], surprised: [1, .2], angry: [.9, .15], sad: [-1, 0, -1.6], shy: [-.5, .3],
    sleepy: [-.7, 0], sleep: [-.9, 0, -1], dizzy: [-.3, 0], dragged: [.6, .6], content: [-.2, .25], listening: [.6, .2],
    thinking: [.1, .15], run: [.2, .4], waking: [-.4, 0], squeeze: [-.3, 0], neutral: [0, .25],
    smug: [.5, .6], pout: [.3, 0], worried: [-.3, .1], determined: [.9, .3], flustered: [.4, .8], scared: [-1, 0, -1],
    excited: [1, 1], cry: [-1, 0, -1], confused: [.2, .1], bowing: [-.2, .2],
    disgusted: [-.4, 0], nervous: [-.4, 0], peeking: [.6, .5],
    gentle: [.1, .15], awkward: [-.4, 0], giggle: [.4, .5], moved: [.4, .5], sighing: [-.3, 0], petrify: [.6, 0],
  };
  // brows by face, in master pixels: [lift of the whole brow, lift of its inner end (by the nose), extra lift of
  // the far brow]; a negative inner lift is the frown
  const BROW = {
    surprised: [6, 0], angry: [-1, -5], sad: [1, 5], shy: [1, 2.5], happy: [2, 0], love: [2, 0], wink: [1, 0],
    sleepy: [-1.5, 0], sleep: [-1.5, 0], dizzy: [1, 3], dragged: [2, 3.5], thinking: [0, 2], waking: [2, 1],
    listening: [1, 0], content: [-1, 0], squeeze: [-1, -2], run: [1, 0],
    smug: [1, -1], pout: [-1, -3], worried: [2, 4.5], determined: [0, -3], flustered: [2, 3.5], scared: [3, 4],
    excited: [3, 0], cry: [1, 5], confused: [1, 0, 5],
    disgusted: [-1.5, -2], nervous: [1.5, 2.5], peeking: [2.5, .5],
    gentle: [1, 1.5], awkward: [1, 4], giggle: [1, 1], moved: [1, 4], sighing: [0, 2.5], petrify: [5, 1],
  };
  // the head by face: tilt (degrees, forward +) and pitch (angleY, down +)
  const HEAD_TILT = { shy: 7, thinking: -8, smug: -6, pout: -4, confused: -7, worried: 3, cry: 4, disgusted: -7, gentle: 6, awkward: -4, giggle: 5 };
  const HEAD_PITCH = { sad: .1, cry: .45, worried: .15, disgusted: -.3, nervous: .1, shy: .3, reading: .4, giggle: .2 };
  const BROW_SPLIT = U(765);  // the near brow is left of this, the far brow right of it
  let browLift = 0, browInner = 0, browSide = 0;
  // how far an eye's upper lid sits below its rest line (master pixels), and whether it is an open eye at all
  // (the same openness paintFace gives the eye, over the lid's full travel; the crease keeps a little above the lid)
  const lidDrop = (e, k, tilt) => {
    const open = e.shape === 'ring' ? clamp((e.ry ?? 16) / (e.rx ?? 16), 0, 1) * (tilt ? .8 : 1) : e.shape === 'lid' ? clamp(e.ry / 16, 0, 1) : 1;
    return EYE[k].travel * (1 - open) * .75;
  };
  const lidOpen = e => e.shape === 'ring' || e.shape === 'lid' ? 1 : 0;
  const creaseDrop = [0, 0];
  let creaseA = 1;

  function draw(petG, fc, o) {
    if (mountedIn !== petG || !petG.contains(fo)) mount(petG);
    if (frameN++ % 20 === 0) fitCanvas();
    const t = o.t, dt = lastT == null ? 1 / 60 : clamp(t - lastT, 0, .05);
    lastT = t;
    // turned to stone (petrify's `freeze`) she holds still: the last pose is drawn again, face and all, and only the
    // grey and the crack change; the springs and clocks pick up where they were once she thaws
    if (fc.freeze && frozenOK) {
      stoneK = fc.stone || 0; st.stone = stoneK;
      // (a dress picked meanwhile waits: its crossfade starts once she thaws)
      if (fade && fade.t0 != null) fade.t0 += dt;
      rig.render(st, lastHidden ? { hidden: STANDING } : undefined);
      if (opts.raster) { fo.setAttribute('href', canvas.toDataURL('image/png')); decoded = fo.decode ? fo.decode().catch(() => {}) : null; }
      drawFx(fc, t);
      return;
    }
    const mode = o.mode || 'idle', face = o.face || 'neutral';
    const walking = mode === 'walk' || mode === 'run', held = mode === 'drag', airborne = mode === 'air';

    /* body: pet-core's `low` is how far the hips sink (sitting, the walk's bob), in these units */
    sitK = lerp(sitK, clamp(o.sit ?? 0, 0, 1), ease(12, dt));
    const low = o.low || 0;
    const lowV = (low - prevLow) / Math.max(dt, 1e-3); prevLow = low;
    const breath = Math.sin(t * (mode === 'sleep' ? 1.7 : 2.4));
    // a scheme without the lying files drops her to sitting at once: its textures are not in the rig to ease out with
    lieK = LIE && poseOK() ? lerp(lieK, clamp(o.lie ?? 0, 0, 1), ease(14, dt)) : 0;
    if (lieK < 1e-3) lieK = 0;  // the easing alone never reaches zero
    const { poseA, hide } = poseMix(lieK);
    poseShown = poseA;
    // thinking, standing or sitting still, she props her chin on her hand; a gesture that needs the far arm takes it down at once
    const chinTaken = FAR_ARM_GESTURES.includes(o.gesture?.kind);
    chinK = lerp(chinK, CHIN && chinOK() && chinWanted(face, mode, lieK, o.gesture) ? 1 : 0, ease(chinTaken ? 16 : 5, dt));
    if (chinK < 1e-3) chinK = 0;

    /* head: tilt toward what it looks at, nod with sleep, wobble with dizzy */
    // (with her chin on her hand the head keeps nearly still)
    let tiltT = (o.look[0] * .7 + o.look[1] * .4) * (1 - .6 * chinK) + Math.sin(t * .9) * 1.2;
    if (mode === 'sleep') tiltT += 6;
    tiltT += (HEAD_TILT[face] || 0) * (1 - .7 * chinK);
    if (face === 'dizzy') tiltT += 3 * Math.sin(t * 4.5);
    if (held) tiltT += o.swing * .25;
    headTilt = sp.head.step(tiltT, dt);
    // what pet-core meant for the whole body and the group did not take goes to the neck (forward +)
    const [gT, gL] = GROUP[mode] || [0, 0];
    const bend = (o.tilt ?? 0) * (1 - wTilt) + (o.lean ?? 0) * Math.sign(o.facing || 1) * (1 - wLean);
    wTilt = lerp(wTilt, gT, ease(10, dt)); wLean = lerp(wLean, gL, ease(10, dt));
    // pet-core's short gestures, as she does them. Nod, shake, wave and bow are hers alone (see `gestures`):
    // a nod pitches the face down twice (angleY +) and dips the head forward, a shake turns the face from side
    // to side (angleX) under a slight roll; both die away by the end. The rest add to what pet-core does.
    const g = o.gesture, gk = g ? g.k : 0;
    const env = (a, b) => smooth(0, a, gk) * (1 - smooth(b, 1, gk));
    const nod = g?.kind === 'nod' ? Math.sin(gk * Math.PI * 2) ** 2 * (1 - .3 * gk) : 0;
    const shake = g?.kind === 'shake' ? Math.sin(gk * Math.PI * 6) * smooth(0, .12, gk) * (1 - gk) : 0;
    const wave = g?.kind === 'wave' ? env(.15, .8) : 0;      // the near arm up beside her head, waving
    const bow = g?.kind === 'bow' ? env(.25, .7) : 0;        // the upper body tips forward about the waist
    const shiver = g?.kind === 'shiver' ? env(.08, .85) : 0; // arms hugged in, trembling, fins down
    const flap = g?.kind === 'flap' ? env(.05, .75) : 0;     // fins, tail, ahoge and arms all flutter
    const cheer = g?.kind === 'cheer' ? env(...CHEER_ENV) : 0; // both arms up, open hands, a happy bounce
    const away = g?.kind === 'away' ? env(.12, .88) : 0;        // her back turned on you (or, without the drawing, her face)
    const heart = g?.kind === 'heart' ? env(.1, .85) : 0;    // both hands make a heart in front of her chest
    const flinch = g?.kind === 'flinch' ? env(.04, .45) : 0; // head and upper body jerk back, arms hugged in
    const peek = g?.kind === 'peek' ? env(.2, .8) : 0;       // the upper body leans in, the head cranes forward
    // a spout: a crouch to gather it (spoutC), then the push as it goes up (spoutP), fins thrown open
    const spoutC = g?.kind === 'spout' ? Math.sin(Math.PI * clamp(gk / .25, 0, 1)) : 0;
    const spoutP = g?.kind === 'spout' ? Math.sin(Math.PI * clamp((gk - .25) / .2, 0, 1)) : 0;
    const spoutOn = g?.kind === 'spout' ? env(.1, .7) : 0;
    // a sigh: drawing a breath (inh), then sagging as it goes out (exh)
    const inh = g?.kind === 'sigh' ? Math.sin(Math.PI * clamp(gk / .45, 0, 1)) : 0;
    const exh = g?.kind === 'sigh' ? smooth(.35, .55, gk) * (1 - smooth(.8, 1, gk)) : 0;
    puffK = g?.kind === 'sigh' ? clamp((gk - .38) / .45, 0, 1) : 0;
    const propG = PROPS[g?.kind] ? g.kind : null;              // a cup or a book held up in both hands
    const hold = propG ? env(.1, .88) : 0, sip = propG === 'sip' ? sipLift(gk) * hold : 0;
    // (turning away without her back drawing, seated say, she turns her face away and drops her chin a little)
    const awayFace = backable() ? 0 : away;
    const gNeck = nod * 7 + shake * 2.5 + bow * 10 + wave * 4 - flinch * 8 + peek * (4 + 1.5 * Math.sin(t * 5)) + awayFace * 3 + sip * 4 + (propG === 'read' ? 5 * hold : 0) - 2 * inh + 6 * exh, gYaw = shake * 1.1 - awayFace * 1.3;
    const headA = headTilt + gNeck;
    const tiltVel = (headA - prevTilt) / Math.max(dt, 1e-3); prevTilt = headA;
    const yawVel = (gYaw - prevYaw) / Math.max(dt, 1e-3); prevYaw = gYaw;
    const angleX = clamp(clamp(o.look[0] / 5, -1, 1) * .9 + gYaw, -1.4, 1.4);
    // angleY + pitches the face down (the features slide down, more crown shows), as a gaze down (look[1] +) does
    const angleY = clamp(clamp(o.look[1] / 4, -1, 1) * .7 + (mode === 'sleep' ? .8 : 0) + (HEAD_PITCH[face] || 0) + nod * .9 + bow * .5 - flinch * .3 - peek * .1 - .1 * inh + .3 * exh, -1.4, 1.4);

    /* springs */
    const sway = clamp(o.swing / 26, -1.6, 1.6);
    const up = airborne || held ? 1 : 0;
    const hair = sp.hair.step(sway * 1.1 - tiltVel * .004 - yawVel * .02 + (walking ? -.25 : 0), dt);
    const hairY = sp.hairY.step(up * -1 + lowV * .006, dt);
    const bangs = sp.bangs.step(sway * .7 - tiltVel * .004 - yawVel * .03, dt);
    const skirt = sp.skirt.step(sway * .8 + (walking ? -.2 : 0), dt);
    danceK = lerp(danceK, mode === 'dance' ? 1 : 0, ease(4, dt));
    const flare = sp.skirtY.step(up * .8 + sitK * .6 + clamp(-lowV * .01, -.3, .6), dt);
    const [fm, wg, droop = 0] = MOOD[face] || MOOD.neutral;
    finMood = lerp(finMood, lerp(fm, -.6, Math.max(shiver, exh)), ease(6, dt));
    wagAmp = lerp(wagAmp, wg, ease(3, dt));
    // the tail sinks slowly (over about a second) and comes back up briskly
    const droopT = mode === 'sleep' ? -1 : Math.min(droop, -exh);
    tailMood = lerp(tailMood, droopT, ease(droopT < tailMood ? 1.1 : 3, dt));
    // fast flutters go on after the springs, which would smooth them away
    const fins = sp.fins.step(finMood * 14 + sway * 10, dt);
    // each fin flutters on its own beat: a stiff buzz when angry, an uneven jitter when flustered, bursts when excited, a beat when flapping
    const burst = k => Math.max(0, Math.sin(t * 2.3 - k)) ** 2;
    // a fit of giggles (pet-core's `titter`, 0..1): the shoulders bob, the fins and ahoge twitch with them
    const titter = fc.titter || 0;
    const finN = (face === 'angry' ? 2.5 * Math.sin(t * 40) : 0) + (face === 'flustered' ? 1.6 * Math.sin(t * 31) + 1.2 * Math.sin(t * 17.3) : 0)
      + (face === 'excited' ? 6 * burst(0) * Math.sin(t * 24) : 0) + flap * 13 * Math.sin(t * 26) + titter * 5 + spoutOn * (14 + 6 * Math.sin(t * 26)) - spoutC * 8;
    const finF = (face === 'angry' ? 2.5 * Math.sin(t * 40) : 0) + (face === 'flustered' ? 1.4 * Math.sin(t * 27 + 1.9) + 1.1 * Math.sin(t * 13.1 + .4) : 0)
      + (face === 'excited' ? 5 * burst(.6) * Math.sin(t * 21 + 1.1) : 0) + flap * 11 * Math.sin(t * 22 + .9) + titter * 4 + spoutOn * (12 + 5 * Math.sin(t * 22 + .9)) - spoutC * 7;
    const ahoge = sp.ahoge.step(-tiltVel * .12 - yawVel * .5 + sway * 18 - spoutP * 40 + (face === 'surprised' ? -16 : 0) + (face === 'confused' ? 20 : 0) + (mode === 'sleep' ? 22 : 0) - hairY * 12, dt)
      + flap * 12 * Math.sin(t * 19) - titter * 6;
    const tail = sp.tail.step(sway * 14 + tailMood * 12 + spoutP * 18, dt) + wagAmp * 13 * Math.sin(t * (4 + 5 * wagAmp)) + Math.sin(t * 1.3) * 3
      + flap * 14 * Math.sin(t * 17);

    /* legs: pet-core hands hip→foot segments sized for Coo; keep their angle (forward = foot to the right) */
    const legA = o.legs.map(l => -Math.atan2(l[2] - l[0], Math.max(4, l[3] - l[1])) * 180 / Math.PI);
    const lift = o.legs.map(l => clamp(29 - Math.hypot(l[2] - l[0], l[3] - l[1]), -8, 20));
    // sitting swaps the lower body for its own drawing (skirt spread on the floor, legs forward) in a
    // couple of frames halfway down, under a little squash; a long crossfade would show both skirts at once
    const sitIn = smooth(.44, .54, sitK), plop = Math.sin(Math.PI * smooth(.3, .8, sitK));

    /* arms: swing against the legs when walking, out in the air, flailing when held */
    let aN = 4, aF = -2;
    if (walking) { aN = -legA[0] * 1.3 + 4; aF = -legA[1] * 1.3 - 2; }
    if (airborne) { aN = 40; aF = -30; }
    if (held) { aN = 70 + 16 * Math.sin(t * 13); aF = -45 - 12 * Math.sin(t * 13 + 1.3); }
    if (sitK > .5 && !walking) { aN = lerp(aN, -4, sitK); aF = lerp(aF, -6, sitK); }
    if (face === 'happy' || face === 'love') { aN += 12 + 5 * Math.sin(t * 8); aF -= 8 + 4 * Math.sin(t * 8); }
    if (face === 'angry') { aN = 20 + 3 * Math.sin(t * 30); aF = -18 - 3 * Math.sin(t * 30); }
    if (face === 'determined') { aN = 14; aF = -10; }
    if (face === 'excited') { aN += 18; aF -= 12; }
    if (mode === 'dance') { const b = Math.sin((o.modeT || 0) * Math.PI * 2 * 1.1); aN = 16 + 24 * Math.max(0, b); aF = -8 - 22 * Math.max(0, -b); }
    // with the open-hand drawing she raises the arm on toward the drawing's own angle, and it takes over halfway up
    const { openHand } = waveHandover(wave, 0, lieK, !!WAVE && waveOK());
    if (wave) aN = lerp(aN, openHand ? WAVE.rest : 108, wave);
    // with the drawn arms the fist arms go part way up and hand over (see cheerHandover); without them she flings them up and out
    const cheerOn = CHEER && cheerOK() && !lieK ? cheer : 0;
    if (cheer) { aN = lerp(aN, cheerOn ? CHEER_TO.near : 100, cheer); aF = lerp(aF, cheerOn ? -CHEER_TO.far : -80, cheer); }
    // the fist arms start in toward her chest; with the drawing they hand over to it, without it they stay there
    const heartOn = HEART && heartOK() && !lieK ? heart : 0;
    if (heart) { aN = lerp(aN, 30, heart); aF = lerp(aF, -22, heart); }
    // ...and for a cup or a book the same way
    const holdOn = propG && propOK(propG) && !lieK ? hold : 0;
    if (hold) { aN = lerp(aN, 30, hold); aF = lerp(aF, -22, hold); }
    if (shiver) { aN = lerp(aN, -10, shiver); aF = lerp(aF, 8, shiver); }
    if (face === 'nervous') { aN = -7 + 2.5 * Math.sin(t * 5); aF = 6; }
    // a flinch hugs the arms in tight; a peek holds them a little back and out, out of the way
    if (flinch) { aN = lerp(aN, -16, flinch); aF = lerp(aF, 14, flinch); }
    if (peek) { aN = lerp(aN, 14, peek); aF = lerp(aF, -6, peek); }
    const armBase = sp.armN.step(aN, dt);
    const armN = armBase + (openHand ? 0 : wave * 13 * Math.sin(t * 15)) + shiver * 1.4 * Math.sin(t * 47) + flap * 9 * Math.sin(t * 24)
      + (fc.shake && face === 'nervous' ? Math.sin(t * 47) : 0);
    const armFBase = sp.armF.step(aF, dt);
    const armF = armFBase - shiver * 1.2 * Math.sin(t * 43 + 1) - flap * 9 * Math.sin(t * 24 + 1);

    /* deformer states */
    // pet-core sinks the hips 29 when seated; the sitting drawing's lowest point is 19.4 above the soles
    // going down to lie she tips forward off the seat before the lying drawing takes over
    st.body = { a: -sway * 1.2 + (held ? o.swing * .15 : 0) + 10 * smooth(.05, .3, lieK) * (1 - poseA), ty: low - 9.6 * sitK, sx: (1 + .006 * breath + .04 * plop) * (1 - .03 * shiver), sy: (1 - .012 * breath - .06 * plop) * (1 - .03 * flinch) };
    // gathering a spout she crouches; it goes up with a little spring of the whole body
    if (spoutC || spoutP) { st.body.sy *= 1 - .1 * spoutC + .05 * spoutP; st.body.sx *= 1 + .05 * spoutC - .02 * spoutP; }
    if (g?.kind === 'roll') {
      // she crouches into the roll and springs up out of it; without the ball drawing she hops along instead
      const c = Math.sin(Math.PI * clamp(gk / .2, 0, 1)), pop = Math.sin(Math.PI * clamp((gk - .82) / .18, 0, 1));
      st.body.sy *= 1 - .16 * c + .07 * pop; st.body.sx *= 1 + .08 * c - .03 * pop;
      if (!(ROLL && rollOK())) st.body.ty -= 46 * Math.sin(Math.PI * rollTurn(gk));
    }
    st.waist = { a: bow * 20 - flinch * 6 + peek * 9 + 3 * titter - 3 * inh + 6 * exh, sy: (1 - .07 * titter) * (1 + .03 * inh - .03 * exh) };
    st.skirt = {
      fn: (u, v) => {
        const k = v * v;
        // on the way down the hem spreads a little before the sitting skirt takes over
        return [skirt * (4 + 4 * danceK) * k + flare * (u - .45) * 9 * v + sitK * (u - .45) * 10 * v, -flare * k * 3 - sitK * k * 8];
      },
    };
    // the sitting skirt breathes a little at its hem, and its front edge swings with the body
    st.skirtSit = { fn: (u, v) => [skirt * 1.5 * v * v, -Math.max(0, breath) * .4 * v] };
    st.alpha.skirt = st.alpha.waist_bow_front = 1 - sitIn;
    st.alpha.leg_back = st.alpha.leg_front = 1 - smooth(.42, .52, sitK);
    st.alpha.skirt_sit = st.alpha.waist_bow_sit_front = sitIn;
    st.armNear = { a: armN };
    // each drawn arm below takes its share of the plain arms away (their alphas multiply)
    st.alpha.arm_near = st.alpha.arm_far = st.alpha.arm_far_end_front = 1;
    if (WAVE) {
      // the fist arm hands over to the drawn one in a couple of frames, the two pointing the same way at that moment;
      // the drawn arm keeps the fist arm's rotation (less its own angle), so it goes on rising into place, then the hand waves
      const { swap } = waveHandover(wave, armBase, lieK, waveOK()), [qx, qy] = WAVE.wrist, [sx0, sy0] = WAVE.pivots.armWave;
      const ux = qx - sx0, uy = qy - sy0, ul = Math.hypot(ux, uy);
      const hand = openHand * (16 * Math.sin(t * 13)) * Math.PI / 180;
      st.armWave = { a: armBase - WAVE.rest + openHand * 3 * Math.sin(t * 13 - .8) };
      st.armWaveHand = {
        fn: (u, v, x, y) => {
          // past the wrist (along shoulder→wrist) the hand turns about the wrist; the sleeve stays
          const w = smooth(-2, 4, ((x - qx) * ux + (y - qy) * uy) / ul);
          return [-hand * w * (y - qy), hand * w * (x - qx)];
        },
      };
      st.alpha.arm_near *= 1 - swap;
      for (const p of WAVE.required) st.alpha[p.id] = tex[p.tex] ? swap : 0;
    }
    st.armFar = { a: armF };
    // how much of the far arm the drawn gesture arms leave free: the chin-rest forearm shows only there
    let farFree = 1;
    if (CHEER) {
      // each drawn arm takes over from its fist arm pointing the same way, rises on into place, then bobs with the cheer;
      // coming down it follows the fist arm back to the same angle and hands over there
      const bob = 4 * Math.sin(t * 11);
      for (const [slot, arm] of Object.entries(CHEER)) {
        const far = slot === 'far', { swap, lift, dir } = cheerHandover(cheerOn, far ? armFBase : armBase, CHEER_TO[slot], arm.rest);
        st[Object.keys(arm.pivots)[0]] = { a: dir - arm.rest + (far ? -bob : bob) * lift };
        for (const p of arm.required) st.alpha[p.id] = tex[p.tex] ? swap : 0;
        if (far) { st.alpha.arm_far *= 1 - swap; st.alpha.arm_far_end_front *= 1 - swap; farFree *= 1 - swap; }
        else st.alpha.arm_near *= 1 - swap;
      }
    }
    if (HEART) {
      // the hands come up from a little lower into place, then bob gently with the beat
      // (letting go, the drawing hands back over a shorter stretch, so the two pairs of arms barely show at once)
      const swap = gk < .5 ? smooth(.05, .3, heartOn) : smooth(.4, .55, heartOn), up = smooth(.1, .5, heartOn), b = .025 * Math.sin(t * 8) * up;
      st.armHeart = { ty: 7 * (1 - up), sx: 1 + b, sy: 1 + b };
      st.alpha.arm_near *= 1 - swap; st.alpha.arm_far *= 1 - swap; st.alpha.arm_far_end_front *= 1 - swap; farFree *= 1 - swap;
      for (const p of HEART.required) st.alpha[p.id] = tex[p.tex] ? swap : 0;
    }
    steam = 0;
    for (const [pg, pose] of Object.entries(PROPS)) {
      // as the heart's: up from a little lower into place; the cup sways a little, the book less. For the sip the hands
      // and the cup (the drawing's top half) come up toward her mouth, the sleeves stretching after them
      const id = Object.keys(pose.pivots)[0], on = pg === propG ? holdOn : 0;
      const swap = gk < .5 ? smooth(.05, .3, on) : smooth(.4, .55, on), up = smooth(.1, .5, on), lift = pg === propG ? 11 * sip : 0;
      st[id] = { ty: 7 * (1 - up), a: (pg === 'sip' ? 1.2 : .6) * Math.sin(t * 1.3) * up - .4 * lift };
      st[id + 'Lift'] = { fn: (u, v) => [0, -lift * (1 - smooth(.5, .95, v))] };
      st.alpha.arm_near *= 1 - swap; st.alpha.arm_far *= 1 - swap; st.alpha.arm_far_end_front *= 1 - swap; farFree *= 1 - swap;
      for (const p of pose.required) st.alpha[p.id] = tex[p.tex] ? swap : 0;
      if (pg === 'sip') { steam = swap * up; steamAt = [id + 'Lift', pose.wrist]; }
    }
    if (CHIN) {
      // the forearm swings up from its elbow to the chin, taking over from the far arm on the way
      const k = smooth(0, 1, chinK), swap = smooth(.15, .55, chinK);
      st.armChin = { a: -60 * (1 - k) + .8 * Math.sin(t * 1.3) * k };
      st.alpha.arm_far *= 1 - swap; st.alpha.arm_far_end_front *= 1 - swap;
      for (const p of CHIN.required) st.alpha[p.id] = tex[p.tex] ? swap * farFree : 0;
    }
    st.legBack = { a: lerp(legA[0], -55, sitK), ty: -lift[0] * .9 * (1 - sitK) };
    st.legFront = { a: lerp(legA[1], -60, sitK), ty: -lift[1] * .9 * (1 - sitK) };
    st.tail = { a: tail - 10 * sitK };
    st.tailBend = { fn: u => [0, -tail * .5 * u * u] };
    st.neck = { a: headA + clamp(bend * .8, -10, 12), ty: (mode === 'sleep' ? 2.5 : 0) + breath * .35 + 3 * titter };
    fxTurn[0] = angleX; fxTurn[1] = angleY;
    const parallax = (k, ky) => (u, v) => [angleX * k * bump(u) * (.4 + .6 * bump(v)), angleY * ky * bump(v) * (.4 + .6 * bump(u))];
    st.headFront = { fn: parallax(4.2, 2.8) };
    // the eyes and mouth move with the face: the eyes' outline is shared between the two layers
    st.headFeat = { fn: parallax(2, 1.4) };
    if (brows) {
      const [lift, inner, side = 0] = BROW[face] || [0, 0];
      browLift = lerp(browLift, lift - 1.5 * (o.blink || 0), ease(14, dt));
      browInner = lerp(browInner, inner, ease(10, dt));
      browSide = lerp(browSide, side, ease(10, dt));
      const [bx0, , bx1] = deformers.brows.rect;
      st.brows = {
        fn: (u, v, x) => {
          // 0 at a brow's outer end, 1 at its inner end
          const k = x < BROW_SPLIT ? clamp((x - bx0) / (BROW_SPLIT - bx0), 0, 1) : clamp((bx1 - x) / (bx1 - BROW_SPLIT), 0, 1);
          return [0, -(browLift + browInner * k * k + (x < BROW_SPLIT ? 0 : browSide)) * S];
        },
      };
    }
    if (creases) {
      // an eye drawn with the wide (surprised) sprite has no lowered lid, whatever the brows do
      fc.eyes.forEach((e, i) => { creaseDrop[i] = lerp(creaseDrop[i], lidDrop(e, EYES[i], fc.wide && e.shape === 'ring' ? 0 : fc.brows), ease(12, dt)); });
      creaseA = lerp(creaseA, (lidOpen(fc.eyes[0]) + lidOpen(fc.eyes[1])) / 2, ease(12, dt));
      st.alpha.eye_creases = creaseA;
      st.creases = { fn: (u, v, x) => [0, (x < BROW_SPLIT ? creaseDrop[0] : creaseDrop[1]) * S] };
    }
    st.headMid = { fn: parallax(2, 1.4) };
    st.headBack = { fn: parallax(-1.4, -1) };
    // the long hair hangs from the head but its lower half keeps to the body when the head tilts
    const nk = PV.neck, na = headA * Math.PI / 180;
    st.hairSway = {
      fn: (u, v, x, y) => {
        const w = smooth(.3, .8, v), a = -na * w, c = Math.cos(a), s = Math.sin(a);
        const dx = x - nk[0], dy = y - nk[1];
        const wv = Math.pow(v, 1.6);
        return [nk[0] + dx * c - dy * s - x + hair * 8 * wv + Math.sin(t * 1.6 + v * 3) * wv,
          nk[1] + dx * s + dy * c - y + hairY * 12 * wv * wv - Math.abs(hair) * 1.5 * wv];
      },
    };
    st.bangsSway = { fn: (u, v) => [bangs * 3.2 * v * v + Math.sin(t * 1.9 + u * 2) * .5 * v * v, hairY * 3 * v * v] };
    st.ahoge = { a: ahoge * .5 + Math.sin(t * 2.1) * 2 };
    st.finNear = { a: fins + finN + Math.sin(t * 1.4) * 1.5 };
    st.finFar = { a: -fins * .8 - finF - Math.sin(t * 1.4 + .8) * 1.2 };

    if (LIE) lying(o, fc, face, mode, t, dt, breath, poseA, { nod, shake, bow, flinch, peek, flap }, g, gk);
    // her back shows through the middle of a turn (pet-core keeps her at least 85% wide then) and while she turns away;
    // it fades in over the front, which only goes once the back is opaque
    const canBack = backable();
    // (turning away, front and back trade at the narrowest moment of the squeeze, almost a cut)
    const awayBack = g?.kind === 'away' ? smooth(.05, .07, gk) * (1 - smooth(.93, .95, gk)) : 0;
    awayA = awayStep(awayA, awayBack, g, dt);
    const view = backView(o.facing, awayA), backK = canBack ? view.k : 0;
    backA = smooth(0, .5, backK);
    if (BACK) {
      const a = (3 * Math.sin(t * 1.6) + wagAmp * 6 * Math.sin(t * (3 + 4 * wagAmp))) * Math.PI / 180;
      st.backTail = { fn: backTailField(BACK, a) };
      st.backFlip = { sx: view.flip ? -1 : 1 };
      for (const p of BACK.required) st.alpha[p.id] = tex[p.tex] ? backA : 0;
      // turning away she squeezes through the turn (and turning round early, through the same narrow moment)
      const sq = Math.max(away ? .3 * Math.sin(Math.PI * smooth(0, .12, gk)) + .3 * Math.sin(Math.PI * smooth(.88, 1, gk)) : 0, awayA > awayBack ? .3 * bump(awayA) : 0);
      if (canBack) st.body.sx *= 1 - sq;
    }
    // rolling, the ball takes over from her in the crouch, turns once rolling on its edge, and gives her back as she pops up
    const ballA = g?.kind === 'roll' && ROLL && rollOK() ? ballMix(gk) : 0;
    if (ROLL) {
      const a = 360 * rollTurn(gk), land = Math.sin(Math.PI * clamp((gk - .12) / .12, 0, 1));
      st.rollBall = { a, ty: ROLL.support[0] - ballLift(ROLL.support, a), sx: 1 + .05 * land, sy: 1 - .05 * land };
      for (const p of ROLL.required) st.alpha[p.id] = tex[p.tex] ? ballA : 0;
    }
    const hideFront = hide || backA >= 1 || ballA >= 1;

    st.mix = 0;
    if (fade) { if (fade.t0 == null) fade.t0 = t; st.mix = smooth(0, 1, (t - fade.t0) / fade.dur); }
    // once the lying drawing (or her back) covers her, the standing rig (face included) is neither painted nor drawn
    if (!hideFront) {
      paintFace(fc, face, o, t);
      rig.upload('faceFx', faceCv);
      if (fade) {
        const own = img;
        img = fade.set.img; fg = fg2;
        paintFace(fc, face, o, t);
        img = own; fg = fg1;
        rig.upload('faceFx@mix', faceCv2);
      }
    }
    // the grey follows the face, but going back to colour takes at least .4 s (a petrify cut short does not snap back)
    stoneK = Math.max(fc.stone || 0, stoneK - dt / .4); st.stone = stoneK;
    // a frame fit to hold as stone: the petrify face itself, eyes open, not talking
    lastHidden = hideFront; frozenOK = face === 'petrify' && !(o.blink > .02) && !(o.eyeClose > .02) && !(o.talk > .05);
    rig.render(st, hideFront ? { hidden: STANDING } : undefined);
    if (opts.raster) { fo.setAttribute('href', canvas.toDataURL('image/png')); decoded = fo.decode ? fo.decode().catch(() => {}) : null; }
    if (fade && st.mix >= 1) endFade();
    drawFx(fc, t);
  }

  /**
   * The lying drawing's deformer states and the dissolve's alphas. Its face is drawn in: the eyes close (blink, doze,
   * sleep, and the faces with shut eyes) by the eyes-shut overlay; the rest of a mood shows in the head, legs and tail.
   */
  const MOOD_KICK = { happy: [1.6, 1.4], love: [1.6, 1.2], excited: [1.9, 1.7], wink: [1.3, 1.2], angry: [1.2, 2], sad: [.3, .6], cry: [.2, .6], sleepy: [.4, .7], scared: [.2, 1], worried: [.5, .8] };
  function lying(o, fc, face, mode, t, dt, breath, poseA, gs, g, gk) {
    const { nod, shake, bow, flinch, peek, flap } = gs;
    const pv = LIE.pivots, still = mode === 'sleep' || fc.listen;
    // a fidget from pet-core (kick, chin, thump) is a short gesture
    const fid = kind => (g?.kind === kind ? Math.sin(Math.PI * gk) : 0);
    const flopUp = 1 - smooth(.2, .6, lieK);  // tipped up off the floor until she is down
    st.lie = { a: -14 * flopUp, sx: 1 + .006 * breath, sy: (1 - .012 * breath) * (1 - .04 * flinch) };
    st.lieBack = { fn: (u, v) => [0, -.8 * (.5 + .5 * breath) * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)] };
    // the head turns about the chin on her hands (degrees, + tips it forward), shifts sideways for a shake or peek
    const th = (1.4 * Math.sin(t * .9) + 1.1 * Math.sin(t * 6.9) * (o.talk || 0) + clamp(o.look[0], -6, 6) * .3 + (mode === 'sleep' ? 3 : 0)
      + nod * 6 + bow * 7 + shake * 2 - flinch * 5 + fid('chin') * 6) * Math.PI / 180;
    const hx = shake * 2.5 + peek * 3, [cx, cy] = pv.lieChin;
    st.lieHead = {
      fn: (u, v, x, y) => {
        const w = smooth(0, .35, u) * (1 - smooth(.7, 1, v));
        return [(-th * (y - cy) + hx) * w, th * (x - cx) * w];
      },
    };
    // the raised feet kick about the knee by mood, still while she sleeps or listens; the two swing together, a little
    // out of step (the shoes touch, and the one mesh between them would fold)
    const [mk, mr] = MOOD_KICK[face] || [1, 1];
    const amp = Math.min(KICK.amp, (still ? 0 : 5 * mk) + 9 * fid('kick') + 8 * flap), rad = Math.PI / 180;
    kickPh += dt * (2.1 * mr + 3 * fid('kick'));
    st.lieLegs = { fn: kickField(LIE.legAxis, amp * Math.sin(kickPh) * rad, Math.min(KICK.apart, amp * .35) * Math.sin(kickPh + 1.6) * rad) };
    // the tail lies on the floor behind her: a slow sway, the mood's wag, a droop when low, a thump (- swings the fluke down)
    const tw = 4 * Math.sin(t * 1.6) + wagAmp * 7 * Math.sin(t * (3 + 4 * wagAmp)) + flap * 10 * Math.sin(t * 17);
    st.lieTail = { a: tw + tailMood * 5 - 14 * fid('thump') };
    st.lieTailBend = { fn: u => [0, -tw * .3 * (1 - u) * (1 - u)] };

    const shut = eyesShut(o, fc.eyes, mode);
    for (const p of LIE.required) st.alpha[p.id] = tex[p.tex] ? poseA : 0;
    for (const p of LIE.overlays) st.alpha[p.id] = tex[p.tex] && p.use === 'shut' ? poseA * shut : 0;
  }

  /* ---------- effects over the figure (SVG, like the built-in figure's) ---------- */
  // a petrified crack's path, standing (through the head, face and dress) and lying (across the head)
  const CRACK = [[134, 24], [124, 48], [140, 70], [126, 96], [142, 120], [128, 148], [144, 176], [130, 204], [142, 236]];
  const CRACK_LIE = [[196, 108], [184, 132], [202, 156], [186, 182], [200, 206], [190, 228]];
  // drawn for the standing head; once she lies, the same points move onto the lying head
  const FXL = LIE?.fx;
  const at = (x, y) => (FXL && poseShown > .5
    ? rig.point('lieHead', st, FXL.to[0] + FXL.s * (x - FXL.from[0]), FXL.to[1] + FXL.s * (y - FXL.from[1]))
    : rig.point('neck', st, x, y));
  function drawFx(fc, t) {
    let s = '';
    const ac = accent();
    if (steam > .02) {
      // three wisps curling up off the cup, each fading as it rises
      const [x, y] = steamAt[1];
      for (let i = 0; i < 3; i++) {
        const q = (t * .6 + i / 3) % 1, c = rig.point(steamAt[0], st, x - 7 + 7 * i + 2.5 * Math.sin(t * 2 + i * 2 + q * 5), y - 3 - 22 * q);
        const d = `M${f1(c[0])} ${f1(c[1] + 6)}q3 -3 0 -6t0 -6`, a = f1(.75 * Math.sin(Math.PI * q) * steam);
        s += `<path fill="none" stroke="#7d86a8" stroke-width="3.6" stroke-linecap="round" opacity="${f1(a * .35)}" d="${d}"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="${a}" d="${d}"/>`;
      }
    }
    if (fc.crack > 0) {
      // a jagged crack down her, growing from the top of the head (stone cannot really split: it is drawn over her)
      const pts = poseShown > .5 ? CRACK_LIE.map(([x, y]) => rig.point('lie', st, x, y))
        : CRACK.map(([x, y]) => rig.point(y < 150 ? 'neck' : 'body', st, x, y));
      const n = (pts.length - 1) * fc.crack, i = Math.floor(n), q = n - i;
      const line = pts.slice(0, i + 1).concat(i < pts.length - 1 ? [[lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q)]] : []);
      const d = 'M' + line.map(p => `${f1(p[0])} ${f1(p[1])}`).join('L');
      s += `<path fill="none" stroke="#f2f3f6" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round" d="${d}"/><path fill="none" stroke="#3b3f4a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="${d}"/>`;
    }
    if (puffK > 0 && puffK < 1 && !poseShown) {
      // the breath of a sigh: two little clouds drifting out from the mouth, forward and down, fading
      const m = rig.point('headFeat', st, U(780), V(790));
      for (let i = 0; i < 2; i++) {
        const q = clamp(puffK * 1.3 - i * .3, 0, 1), x = m[0] + 8 + 20 * q, y = m[1] + 3 + 9 * q, r = 5 + 5 * q;
        if (q > 0) s += `<g opacity="${f1(.9 * Math.sin(Math.PI * q))}" fill="#fff" stroke="#8a93b0" stroke-width="1.8"><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/><circle cx="${f1(x + r * .9)}" cy="${f1(y + r * .3)}" r="${f1(r * .7)}"/></g>`;
      }
    }
    const top = at(124, 34), side = at(204, 52);
    if (fc.orbit) {
      for (let i = 0; i < 3; i++) {
        const a = t * 3.2 + i * 2.094, sn = Math.sin(a);
        s += `<path fill="#ffd23f" stroke="#3a2f7a" stroke-width="1.6" stroke-linejoin="round" opacity="${sn < 0 ? .55 : 1}" transform="translate(${f1(top[0] + 56 * Math.cos(a))} ${f1(top[1] - 4 + 10 * sn)}) scale(${sn < 0 ? .7 : 1})" d="M0 -7L2 -2L7 -2L3 1L4.5 6.5L0 3.3L-4.5 6.5L-3 1L-7 -2L-2 -2Z"/>`;
      }
    }
    if (fc.listen) {
      for (let i = 0; i < 3; i++) {
        const p = (t * .9 + i / 3) % 1, r = 36 - 24 * p, c = at(214, 116);
        s += `<path fill="none" stroke="${ac}" stroke-width="5" stroke-linecap="round" opacity="${f1(Math.sin(Math.PI * p))}" d="M${f1(c[0] + r * Math.cos(-.55))} ${f1(c[1] + r * Math.sin(-.55))}A${f1(r)} ${f1(r)} 0 0 1 ${f1(c[0] + r * Math.cos(.55))} ${f1(c[1] + r * Math.sin(.55))}"/>`;
      }
    }
    if (fc.think) {
      for (let i = 0; i < 3; i++) {
        const k = (t * .8 + i / 3) % 1;
        s += `<circle fill="#e8f0ff" stroke="${ac}" stroke-width="3" cx="${f1(side[0] + 10 * i)}" cy="${f1(side[1] - 20 * i - 6 * k)}" r="${4 + 3 * i}" opacity="${f1(.4 + .6 * Math.sin(Math.PI * k))}"/>`;
      }
    }
    if (fc.sweat) {
      const c = at(196, 88 + 3 * Math.sin(t * 7));
      s += `<path fill="#8fd0ff" stroke="#2f5fae" stroke-width="1.4" transform="translate(${f1(c[0])} ${f1(c[1])}) scale(1.4)" d="M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z"/>`;
    }
    if (fc.anger) {
      const c = at(190, 62), k = 1 + .12 * Math.sin(t * 10);
      s += `<g transform="translate(${f1(c[0])} ${f1(c[1])}) scale(${f1(k)})" fill="none" stroke="#e5484d" stroke-width="5" stroke-linecap="round"><path d="M-11 -3Q-3 -3 -3 -11M3 -11Q3 -3 11 -3M11 3Q3 3 3 11M-3 11Q-3 3 -11 3"/></g>`;
    }
    if (fc.bang) {
      const c = at(206, 36);
      s += `<g transform="translate(${f1(c[0])} ${f1(c[1])})"><path fill="none" stroke="#252049" stroke-width="8" stroke-linecap="round" d="M0 -16V3"/><circle fill="#252049" cx="0" cy="14" r="4.5"/></g>`;
    }
    if (fc.gloom) {
      // three strokes on the bangs above the brows, moved with the face's turn (at() follows only the neck);
      // a pale edge keeps them readable on the dark hair of every scheme
      let d = '';
      for (const [x, y1] of [[132, 93], [143, 97], [154, 93]]) {
        const a = at(x + fxTurn[0] * 3, 79 + fxTurn[1] * 2), b = at(x + fxTurn[0] * 3, y1 + fxTurn[1] * 2);
        d += `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
      }
      s += `<g fill="none" stroke-linecap="round"><path stroke="#fff" stroke-width="5.4" opacity=".75" d="${d}"/><path stroke="#252049" stroke-width="3" d="${d}"/></g>`;
    }
    if (fc.question) {
      const c = at(206, 36), k = 1 + .06 * Math.sin(t * 3);
      s += `<g transform="translate(${f1(c[0])} ${f1(c[1])}) scale(${f1(k)})"><path fill="none" stroke="#252049" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M-8 -9Q-8 -19 0 -19Q9 -19 9 -11Q9 -4 0 -1V4"/><circle fill="#252049" cx="0" cy="14" r="4.5"/></g>`;
    }
    if (fx !== s) { fxG.innerHTML = s; fx = s; }
  }

  return {
    draw,
    groupTilt,
    /** The gestures she draws herself, from the frame's `gesture` (pet-core leaves them off the body). */
    gestures: ['nod', 'shake', 'wave', 'bow', 'flinch', 'peek', 'cheer', 'heart', 'away', 'sip', 'read', 'roll', 'spout', 'sigh'],
    setScheme,
    /** Forgets the motion state (springs, clocks), for callers that replay a timeline from its start. */
    /**
     * Renders `frames` frames of one pose (face `fc`, frame fields `o`, its clock starting at o.t) at `res` canvas
     * pixels per rig unit, then gives up the WebGL context; returns an SVG <image> for the result in rig space.
     * For pages showing many still figures, which would otherwise hold a GPU context each.
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
    /**
     * Releases the WebGL context and drops the mounted DOM (what `setFigure` switching away from
     * this figure calls). The figure object stays usable: the next `draw` re-mounts from scratch.
     */
    dispose() {
      rig?.dispose();
      rig = null; canvas = null; fo = null; fxG = null; mountedIn = null;
    },
    reset() {
      endFade();
      for (const k in sp) { sp[k].x = 0; sp[k].v = 0; }
      lastT = null; prevTilt = 0; prevYaw = 0; prevLow = 0; headTilt = 0; wTilt = 0; wLean = 0; finMood = 0; tailMood = 0; wagAmp = 0; sitK = 0; danceK = 0; lieK = 0; poseShown = 0; kickPh = 0; chinK = 0; backA = 0; awayA = 0; steam = 0; puffK = 0; frozenOK = false; stoneK = 0;
    },
    /** Loads every scheme's textures, so later switches are immediate. */
    preload: () => Promise.all(SCHEMES.map(sc => loadScheme(sc.id))),
    get scheme() { return scheme; },
    /** Raster mode: a promise that settles once the last drawn frame is ready to be painted. */
    get painted() { return decoded || Promise.resolve(); },
    get colors() { return { z: accent() }; },
    /** Which poses of her own she can show now (the current scheme has their files): pet-core keeps her seated otherwise. */
    get poses() { return { lie: !!LIE && poseOK(), back: backable() }; },
    schemes: SCHEMES,
    // points pet-core uses: eye tracking, a tear and one under each eye (where the streams run), sleep z's, hearts [x from, x to, y], bubble
    anchors: {
      gaze: [U(745), V(690)], tear: [U(640), V(752)], tears: [[U(654), V(752)], [U(852), V(750)]], z: [196, 44],
      hearts: [96, 176, 62], bubble: [128, 18], glints: [[48, 32], [208, 46]],
      // a spout leaves the top of her head, just behind the ahoge
      spout: [140, 42],
      // the same, plus the hit ellipse [cx, cy, rx, ry] and half width, lying on her front (the spout from the lying head's crown)
      ...(LIE ? { lie: { ...LIE.anchors, spout: [(LIE.rects.head[0] + LIE.rects.head[2]) / 2, LIE.rects.head[1] + 12] } } : {}),
    },
    model,
  };
}
