/**
 * Claude-chan's motion (Claude 娘): the rig she is built from, and what each frame of the kit (web/kit/body.js) does to it.
 *
 * buildRig(model) turns model.json into kit/rig.js deformers and parts; createMotion(model, rig) turns every frame the
 * kit hands over into deformer states and part alphas. Nothing here touches the DOM: figure.js draws, tests run it bare.
 *
 * She faces the viewer; the kit mirrors the whole group to turn her. Rig space = the kit's space (x=128 under her,
 * soles at y=256); model.json keeps the master drawing's pixels for the face (U/V convert). `armL` is the arm on the
 * viewer's left (her right), the one that gestures; `armR` the other. Standing calmly she holds her book in both hands
 * (poses.book); a one-arm gesture keeps it hugged in armR (poses.bookside); a two-arm gesture is one drawing of both.
 * Whatever drawing is missing, the plain hanging arms (arm_l, arm_r) stand in, turned roughly into the gesture.
 */

export const f1 = n => Math.round(n * 100) / 100;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
export const bump = u => Math.sin(Math.PI * clamp(u, 0, 1));
export const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
/** `v` moved toward `to` at a pace that crosses 0..1 in `dur` seconds. */
export const approach = (v, to, dt, dur) => v + clamp(to - v, -dt / dur, dt / dur);

/* ---------- springs ---------- */
// `lim` bounds the output: a hard throw may overshoot, the hair must not fold over itself
export function spring(k, c, lim = Infinity) {
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

/** Master pixels → rig units: U(x), V(y), and the scale S (rig units per master pixel). */
export function unitsOf(model) {
  const { S, X0, FEET } = model.units;
  return { S, U: x => 128 + (x - X0) * S, V: y => 256 - (FEET - y) * S };
}

/* ---------- whole-body drawings (lie, kneel, sit, back, roll), as the whale has them ---------- */
/**
 * Lying down (the kit's `lie`, 0..1) as an over-dissolve: the lying drawing fades in over the seated rig, which stays
 * fully drawn until the drawing is opaque and goes in one step then. `poseA` is the drawing's alpha, `standA` the rig's.
 */
export function poseMix(lieK) {
  const poseA = smooth(.2, .45, lieK), standA = poseA >= 1 ? 0 : 1;
  return { poseA, standA, hide: standA <= 0 };
}
/** Faces that smile with an open mouth (the floor drawings' smile patches show for them). */
export const SMILING = ['happy', 'love', 'excited', 'wink', 'giggle', 'coax', 'moved', 'tongue', 'dragged'];
/** Which mouth patch a floor drawing shows (0..1 each): talking opens it on the beat, a smiling face smiles. */
export function lyingMouth(o, face, mode) {
  if (mode === 'sleep' || face === 'petrify') return { talk: 0, smile: 0 };
  const talk = smooth(.5, .75, (o.talk || 0) * (.45 + .45 * Math.abs(Math.sin((o.t || 0) * 17))));
  return { talk, smile: SMILING.includes(face) ? 1 - talk : 0 };
}
/**
 * How far a floor drawing's eyes are shut (0..1), for its eyes-shut patch. The patch is a whole drawn face over open
 * eyes, so it nearly cuts (a half-faded patch over open eyes reads as a grey smear mid-blink).
 */
export function eyesShut(o, eyes, mode) {
  const e = eyes?.[0] || {};
  return smooth(.35, .65, Math.max(o.blink || 0, o.eyeClose || 0, mode === 'sleep' ? 1 : 0, smooth(.6, 1, o.drowse || 0),
    e.shape === 'up' || e.shape === 'down' ? 1 : 0, e.shape === 'lid' ? 1 - smooth(1.5, 4, e.ry ?? 16) : 0));
}
/** How far the cup comes up to her mouth (0..1) at `k` of the sip. */
export const sipLift = k => smooth(.38, .5, k) * (1 - smooth(.56, .66, k));
/** A roll turns once, eased, over this part of the gesture (as the kit's rollTurn). */
export const rollTurn = k => smooth(.2, .8, k);
/** The curled-up drawing's share of a roll: almost a cut in the crouch, and out again as she springs up. */
export const ballMix = k => smooth(.13, .165, k) * (1 - smooth(.835, .87, k));
/** How far the ball's middle sits above the floor turned by `deg` (poses.roll.support, every 5°). */
export function ballLift(support, deg) {
  const n = support.length, x = (((deg % 360) + 360) % 360) / 360 * n, i = Math.floor(x) % n;
  return lerp(support[i], support[(i + 1) % n], x - Math.floor(x));
}
/** The away gesture's share of her back carried over frames: dropped early, she turns round over .3 s. */
export function awayStep(awayA, awayBack, g, dt) {
  return g?.kind === 'away' && g.k > .5 ? awayBack : Math.max(awayBack, awayA - dt / .3);
}
/** How much of her back shows (0..1) from the frame's `facing` and the away turn, and whether it is mirrored. */
export function backView(facing, awayA) {
  const turn = 1 - smooth(.3, .6, Math.abs(facing ?? 1));
  return { k: Math.max(turn, awayA), flip: turn > awayA };
}
/** The lying drawing's deformers (poses.lie), from the floor up; `inner` is the innermost, where its parts hang. */
export function lieDeformers(LIE) {
  const r = LIE.rects || {}, pv = LIE.pivots || {};
  const d = { lie: { kind: 'rot', pivot: pv.lie || [128, 256] } };
  let inner = 'lie';
  for (const [id, rect] of [['lieBack', r.back], ['lieHead', r.head], ['lieLegs', r.legs]]) {
    if (!rect) continue;
    d[id] = { kind: 'warp', parent: inner, rect };
    inner = id;
  }
  return { deformers: d, inner };
}
/** The lying kick as a warp field: the raised shins turn about the knee (poses.lie.legAxis), more toward the shoes. */
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
export const KICK = { amp: 10, apart: 1.25 };

/* ---------- facing the viewer ---------- */
/** The share of the kit's [tilt, lean] the whole group takes, by mode; the rest she bends herself. */
export const GROUP = { air: [1, .3], drag: [1, .3], crouch: [1, .3], land: [1, .3], walk: [.5, .15], run: [.8, .3], dance: [.6, 0] };
/**
 * A forward lean (degrees, + toward the viewer) the way a figure facing you shows it: the head pitches down, the neck
 * dips, the upper body shortens a little about the waist; `share` of it (at most 6°) stays an in-plane turn.
 */
export function pitchFromLean(deg, share = 0) {
  const k = clamp(deg / 20, -.6, 1.4);
  return { pitch: .55 * k, neckTy: 3 * k, waistSy: 1 - .08 * k, waistTy: 2 * k, rot: clamp(deg * share, -6, 6) };
}
/** The kit's foot at rest (y of a foot's centre on the floor). */
export const FOOT_Y = 241;
/** The kit's hip→foot segments (sized for Coo) as her shoes under the skirt: a lifted foot rises, a stride shifts it a little. */
export function feetFromLegs(legs) {
  return legs.map(([hx, , fx, fy]) => { const lift = clamp(FOOT_Y - fy, 0, 30); return { tx: clamp((fx - hx) * .12, -4, 4), ty: -lift * .8, lift }; });
}

/* ---------- arms ---------- */
/** One-arm gestures (armL does them; armR hugs the book meanwhile): kit gesture → pose. */
export const ARM_ONE = { wave: 'wave', scratch: 'scratch', idea: 'idea', salute: 'salute', vsign: 'vsign', point: 'point', cover: 'cover' };
/** Two-arm gestures, one drawing of both arms each: kit gesture → pose. */
export const ARM_BOTH = {
  cheer: 'cheer', heart: 'heart', read: 'read', sip: 'cup', serve: 'cup', pray: 'pray', hips: 'hips', hug: 'hug', cross: 'cross',
  stretch: 'stretch', curtsy: 'curtsy', flinch: 'oops', peek: 'search', shiver: 'cross',
};
/** Faces she holds her arms for, standing or sitting still with no gesture going. */
export const FACE_ARMS = {
  thinking: 'chin', listening: 'write', determined: 'hips', angry: 'hips', excited: 'fist', shy: 'shy', flustered: 'shy',
  awkward: 'scratch', scared: 'oops', nervous: 'oops', pout: 'cross', disgusted: 'cross', singing: 'pray', pleading: 'pray',
};
/** Which arms a pose drawing replaces, unless model.poses.<id>.kind says. */
export const POSE_KIND = {
  wave: 'armL', chin: 'armL', scratch: 'armL', idea: 'armL', salute: 'armL', vsign: 'armL', point: 'armL', cover: 'armL', fist: 'armL',
  bookside: 'armR',
};
/** A missing drawing stands in for another that is there (the book-held ones first). */
export const POSE_ALT = { read: ['book'], write: ['read', 'book'], search: ['read', 'book'], offer: ['book'], fist: ['vsign'], shy: ['pray'], oops: ['cover'] };
/** Modes where she holds the book when nothing else is asked; and the calm ones where faces pose her arms. */
export const CALM_MODES = ['idle', 'look', 'sit', 'sleep', 'wake'];
export const BOOK_MODES = [...CALM_MODES, 'walk'];
/** The plain arms' spring (stiffness, damping) and limit. */
export const ARM_SPRING = { k: 60, c: 9, lim: 170 };
/** The arms' crossfade between drawings (seconds), and how far a drawing rises into place as it comes. */
export const ARM_FADE = .15, ARM_RISE = 6;
/** How long her back drawing takes to go when it may no longer show (s). */
export const BACK_FADE = .15;
/**
 * How the plain arms do a gesture whose drawing is missing: [armL, armR] angles (degrees; + turns armL out and up,
 * - turns armR out and up; null leaves that arm be).
 */
export const ARM_FALLBACK = {
  wave: [108, null], scratch: [150, null], idea: [160, null], salute: [145, null], vsign: [95, null], point: [90, null],
  cover: [-32, null], chin: [-32, null], fist: [120, null],
  cheer: [115, -115], heart: [-28, 28], read: [-26, 26], cup: [-28, 28], offer: [-24, 24], pray: [-30, 30], hips: [24, -24],
  hug: [70, -70], cross: [-34, 34], stretch: [165, -165], curtsy: [16, -16], oops: [-36, 36], search: [-26, 26], shy: [-30, 30],
  write: [-26, 26],
};

/**
 * Which drawing each arm shows: `{ L, R, fallback }`, where L and R are 'hangL' / 'hangR' (the plain arms) or pose ids
 * (a two-arm pose is both), and `fallback` names the gesture the plain arms act out when its drawing is missing.
 * `has(id)` says a pose can show now; `faceOK` lets the face pose her arms (it has settled); `kneel` (a kneel with no
 * drawing of its own) puts the book aside: the plain arms rest down by her lap.
 */
export function armPlan({ mode, gesture, face, faceOK = true, kneel = false }, has) {
  const hang = { L: 'hangL', R: 'hangR', fallback: null };
  // carried, or reeling: her arms are free
  if (mode === 'drag' || mode === 'dizzy') return hang;
  const g = gesture && gesture.k > .02 && gesture.k < .9 ? gesture.kind : null;
  const armG = g ? ARM_BOTH[g] || ARM_ONE[g] : null;
  const faceArm = !armG && faceOK && CALM_MODES.includes(mode) ? FACE_ARMS[face] : null;
  const want = armG || faceArm;
  if (want) {
    const got = [want, ...(POSE_ALT[want] || [])].find(has);
    if (got) {
      const kind = has.kind?.(got) || POSE_KIND[got] || 'both';
      if (kind === 'armL') return { L: got, R: has('bookside') ? 'bookside' : 'hangR', fallback: null };
      if (kind === 'armR') return { L: 'hangL', R: got, fallback: null };
      return { L: got, R: got, fallback: null };
    }
    if (armG) return { ...hang, fallback: want };
  }
  if (!kneel && BOOK_MODES.includes(mode) && has('book')) return { L: 'book', R: 'book', fallback: null };
  return hang;
}

/* ---------- moods (the ornament's ribbons and the hair stand in for the whale's fins and tail) ---------- */
// by face: ribbons perk up (+) or droop (-), hair-tip swish, and how far the ribbons hang limp (-1 = full)
export const MOOD = {
  happy: [.8, 1], love: [.9, 1], wink: [.5, .7], surprised: [1, .2], angry: [.9, .15], sad: [-1, 0, -1.6], shy: [-.5, .3],
  sleepy: [-.7, 0], sleep: [-.9, 0, -1], dizzy: [-.3, 0], dragged: [.6, .6], content: [-.2, .25], listening: [.6, .2],
  thinking: [.1, .15], run: [.2, .4], waking: [-.4, 0], squeeze: [-.3, 0], neutral: [0, .25],
  smug: [.5, .6], pout: [.3, 0], worried: [-.3, .1], determined: [.9, .3], flustered: [.4, .8], scared: [-1, 0, -1],
  excited: [1, 1], cry: [-1, 0, -1], confused: [.2, .1], bowing: [-.2, .2], disgusted: [-.4, 0], nervous: [-.4, 0], peeking: [.6, .5],
  gentle: [.1, .15], awkward: [-.4, 0], giggle: [.4, .5], pleading: [.2, .3], moved: [.4, .5], sighing: [-.3, 0], petrify: [.6, 0],
  coax: [.5, 1], singing: [.6, .6], saluting: [.9, .3], tongue: [.6, .8], stretching: [.3, .2], pointing: [.8, .4],
  sipping: [.1, .2], reading: [0, .1],
};
// brows by face, master pixels: [lift of both brows, extra lift of their inner ends, extra lift of the right brow]
export const BROW = {
  surprised: [6, 0], angry: [-1, -5], sad: [1, 5], shy: [1, 2.5], happy: [2, 0], love: [2, 0], wink: [1, 0],
  sleepy: [-1.5, 0], sleep: [-1.5, 0], dizzy: [1, 3], dragged: [2, 3.5], thinking: [0, 2], waking: [2, 1],
  listening: [1, 0], content: [-1, 0], squeeze: [-1, -2], run: [1, 0],
  smug: [1, -1], pout: [-1, -3], worried: [2, 4.5], determined: [0, -3], flustered: [2, 3.5], scared: [3, 4],
  excited: [3, 0], cry: [1, 5], confused: [1, 0, 5], disgusted: [-1.5, -2], nervous: [1.5, 2.5], peeking: [2.5, .5],
  gentle: [1, 1.5], awkward: [1, 4], giggle: [1, 1], pleading: [2, 4.5], moved: [1, 4], sighing: [0, 2.5], petrify: [5, 1], coax: [2, 2.5],
  singing: [2.5, 1], saluting: [0, -3], tongue: [1.5, 0], stretching: [-1, 0], pointing: [1.5, 0],
};
// the head by face: in-plane tilt (degrees, toward +x) and pitch (angleY, down +)
export const HEAD_TILT = { shy: 7, thinking: -8, smug: -6, pout: -4, confused: -7, worried: 3, cry: 4, disgusted: -7, gentle: 6, awkward: -4, giggle: 5, pleading: 4, coax: 4, tongue: -5 };
export const HEAD_PITCH = { singing: -.25, sad: .1, cry: .45, worried: .15, disgusted: -.3, nervous: .1, shy: .3, reading: .4, giggle: .2, sipping: .15 };
// the head's parallax gains [x, y] per layer, front to back
export const PARALLAX = { headFront: [5, 3], headFeat: [3.5, 2], headMid: [2, 1.4], headBack: [-2, -1.2] };
/** Poses whose drawing rides the neck (the hand stays on her face as the head moves). */
export const NECK_POSES = ['cover'];
/** Whole-body drawings: kept out of the arm machinery. */
export const WHOLE_POSES = ['lie', 'kneel', 'back', 'roll', 'sit'];

/* ---------- sitting: a seated body under her live head (poses.sit) ---------- */
// poses.sit is not a whole-figure drawing: it is her body below the collar seated (skirt pool and shoes on `sitBase`,
// collar, capelet, arms and book on `sitTop`, which rides the waist). Her head, face, fringe, flower and long hair stay
// the live rig's, sunk by poses.sit.headDrop. While seated a gesture's (or a face's) arm drawings show over the
// standing torso and capelet, sunk with the waist, and the seated arms and book fade out meanwhile.
/** How far the kit sinks her points seated (kit/body.js: `low = sitK * 29`). */
export const SIT_LOW = 29;
/** Standing parts the seated body replaces: under the pool (gone once it is opaque), and beside the seated arms. */
export const SIT_UNDER = ['skirt'], SIT_BESIDE = ['torso', 'capelet'];
/** How much less than the kit's sink her head goes down with the seated body (rig units), at the kit's `sit` (0..1). */
export function sitRaise(sit, headDrop) {
  return Math.max(0, SIT_LOW - (headDrop ?? SIT_LOW)) * clamp(sit || 0, 0, 1);
}
/** The kit's anchors raised by `raise`, so its points (bubble, tears, Zs, hearts) stay on her head seated. */
export function sitAnchors(A, raise) {
  if (!(raise > 0)) return A;
  const up = p => [p[0], f1(p[1] - raise)];
  const out = { ...A };
  for (const k of ['gaze', 'tear', 'z', 'bubble', 'spout', 'bulb']) if (A[k]) out[k] = up(A[k]);
  for (const k of ['tears', 'glints']) if (A[k]) out[k] = A[k].map(up);
  if (A.hearts) out.hearts = [A.hearts[0], A.hearts[1], f1(A.hearts[2] - raise)];
  return out;
}
/** Whether her arms are the seated body's own (hugging the book): nothing but the book or the plain arms planned. */
export const sitOwnArms = plan => [plan.L, plan.R].every(k => k === 'book' || k === 'hangL' || k === 'hangR');
/** The seated body's alphas: `sitA` the pool (from `k`, how far down she is), `topA` its arms and book (`own` 0..1). */
export function sitMix(k, own) {
  const sitA = smooth(.3, .7, k);
  return { sitA, topA: sitA * smooth(0, 1, own) };
}
/** The seated body's deformers and parts: `sitBase` on the floor under `body`, `sitTop` on the waist. */
function sitRig(pose, deformers, parts) {
  const pv = pose.pivots || {};
  deformers.sitBase = { kind: 'rot', parent: 'body', pivot: pv.sitBase || [128, 256] };
  deformers.sitTop = { kind: 'rot', parent: 'waist', pivot: pv.sitTop || deformers.waist.pivot };
  const ps = [...(pose.required || []), ...(pose.overlays || [])].map(p => {
    const q = { ...p, parent: p.parent === 'sitTop' ? 'sitTop' : 'sitBase', alpha: 0 };
    parts.push(q);
    return q;
  });
  return { pose, parts: ps, drop: pose.headDrop ?? SIT_LOW };
}

/* ---------- the rig ---------- */
const rectOfBox = b => b && [b[0], b[1], b[0] + b[2], b[1] + b[3]];
function unionRect(boxes) {
  const rs = boxes.filter(Boolean).map(rectOfBox);
  if (!rs.length) return null;
  return [Math.min(...rs.map(r => r[0])), Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[2])), Math.max(...rs.map(r => r[3]))];
}
const asRect = r => (Array.isArray(r) ? { x: r[0], y: r[1], w: r[2], h: r[3] } : r);

/**
 * The rig from model.json: deformers (each acts in rest space; parents act after children), parts, which parts are
 * the standing figure (hidden whole when a floor drawing covers her), and the pose drawings found.
 */
export function buildRig(model) {
  const { S, U, V } = unitsOf(model);
  const PV = model.pivots || {}, R = model.rects || {};
  const box = Object.fromEntries(model.parts.map(p => [p.id, p.box]));
  const rectOf = id => rectOfBox(box[id]);
  const HEAD = R.head || [58, 20, 198, 130];
  const HAIR = R.hair || rectOf('hair_back') || HEAD;
  const SKIRT = R.skirt || rectOf('skirt') || rectOf('body') || [60, 150, 196, 256];
  const piv = (k, d) => PV[k] || d;
  const deformers = {
    body: { kind: 'rot', pivot: piv('body', [128, 256]) },
    skirt: { kind: 'warp', parent: 'body', rect: SKIRT },
    waist: { kind: 'rot', parent: 'body', pivot: piv('waist', [128, SKIRT[1]]) },
    armL: { kind: 'rot', parent: 'waist', pivot: piv('armL', [104, 160]) },
    armR: { kind: 'rot', parent: 'waist', pivot: piv('armR', [152, 160]) },
    footL: { kind: 'rot', parent: 'body', pivot: piv('footL', [119, 253]) },
    footR: { kind: 'rot', parent: 'body', pivot: piv('footR', [137, 253]) },
    neck: { kind: 'rot', parent: 'waist', pivot: piv('neck', [128, HEAD[3]]) },
    headBack: { kind: 'warp', parent: 'neck', rect: HEAD },
    headMid: { kind: 'warp', parent: 'neck', rect: HEAD },
    headFeat: { kind: 'warp', parent: 'neck', rect: HEAD },
    headFront: { kind: 'warp', parent: 'neck', rect: HEAD },
    hairSway: { kind: 'warp', parent: 'headBack', rect: HAIR },
    bangsSway: { kind: 'warp', parent: 'headFront', rect: rectOf('bangs') || HEAD },
    ornament: { kind: 'rot', parent: 'headFront', pivot: piv('ornament', [HEAD[2] - 20, HEAD[1] + 30]) },
  };
  const orn = piv('ornament', deformers.ornament.pivot);
  // the ribbons hang from the flower: a warp under its turn swings them, the flower itself stays pinned
  deformers.ribbons = { kind: 'warp', parent: 'ornament', rect: rectOf('ornament') || [orn[0] - 15, orn[1] - 15, orn[0] + 15, orn[1] + 60] };

  const unknownParents = [];
  const parts = model.parts.map(p => {
    let parent = p.parent === 'ornament' ? 'ribbons' : p.parent;
    if (!deformers[parent]) { unknownParents.push(`${p.id}:${p.parent}`); parent = 'body'; }
    return { ...p, parent };
  });
  // the eyes, mouth and blush are painted live into this texture over the face (one texel per master pixel)
  // (without feat.face.rect: over the face part)
  const fb = box.face || HEAD.map((v, i) => (i < 2 ? v : v - HEAD[i - 2]));
  const { X0, FEET } = model.units;
  const FACE = asRect(model.feat?.face?.rect || [Math.round(X0 + (fb[0] - 128) / S), Math.round(FEET - (256 - fb[1]) / S), Math.round(fb[2] / S), Math.round(fb[3] / S)]);
  parts.push({ id: 'faceFx', tex: 'faceFx', box: [U(FACE.x), V(FACE.y), FACE.w * S, FACE.h * S], z: 9, parent: 'headFeat', grid: [4, 4] });
  // the brows lie on the skin under the fringe and show through it: drawn again over the fringe, faint;
  // each lifts and tilts by the face (the warp splits them at feat.face.browSplit)
  const brows = parts.find(p => p.id === 'brows');
  if (brows) {
    deformers.brows = { kind: 'warp', parent: 'headFeat', rect: rectOf('brows') };
    brows.parent = 'brows';
    parts.push({ ...brows, id: 'brows_through', z: 13.2, alpha: .4 });
  }
  const STANDING = Object.fromEntries(parts.map(p => [p.id, true]));
  const byParent = d => parts.filter(p => p.parent === d).map(p => p.id);
  const HANG = { hangL: byParent('armL'), hangR: byParent('armR') };
  const SHOES = [...byParent('footL'), ...byParent('footR')];

  // every arm drawing: a turn about its shoulder (or elbow) with the upper body, and a warp over it for the hands
  const ARM = {};
  for (const [id, pose] of Object.entries(model.poses || {})) {
    if (WHOLE_POSES.includes(id) || !pose?.required?.length) continue;
    const rect = unionRect(pose.required.map(p => p.box));
    const first = Object.entries(pose.pivots || {})[0];
    const rot = first && !deformers[first[0]] ? first[0] : `pose_${id}`;
    const pivot = first ? first[1] : pose.wrist || [(rect[0] + rect[2]) / 2, rect[3]];
    deformers[rot] = { kind: 'rot', parent: NECK_POSES.includes(id) ? 'neck' : 'waist', pivot };
    const lift = `${rot}Lift`;
    deformers[lift] = { kind: 'warp', parent: rot, rect };
    const ps = pose.required.map(p => ({ ...p, parent: lift, alpha: 0 }));
    for (const p of ps) { parts.push(p); STANDING[p.id] = true; }
    ARM[id] = { id, rot, lift, pivot, rect, wrist: pose.wrist || [(rect[0] + rect[2]) / 2, rect[1]], kind: pose.kind || POSE_KIND[id] || 'both', parts: ps };
  }

  // the whole-body drawings stand on the floor on their own deformers, outside the standing tree
  const P = model.poses || {};
  // (a part keeps the parent model.json gives it if that is one of its own drawing's deformers)
  const floorParts = (pose, inner, own) => [...(pose.required || []), ...(pose.overlays || [])].map(p => {
    const q = { ...p, parent: own.includes(p.parent) ? p.parent : inner, alpha: 0 };
    parts.push(q);
    return q;
  });
  const W = {};
  if (P.lie?.required?.length) {
    const L = lieDeformers(P.lie);
    Object.assign(deformers, L.deformers);
    W.lie = { pose: P.lie, parts: floorParts(P.lie, L.inner, Object.keys(L.deformers)) };
  }
  if (P.back?.required?.length) {
    deformers.backFlip = { kind: 'rot', parent: 'body', pivot: [128, 256] };
    deformers.backHair = { kind: 'warp', parent: 'backFlip', rect: P.back.rects?.hair || unionRect(P.back.required.map(p => p.box)) };
    W.back = { pose: P.back, parts: floorParts(P.back, 'backHair', ['backFlip', 'backHair']) };
  }
  if (P.roll?.required?.length) {
    deformers.rollBall = { kind: 'rot', pivot: P.roll.pivots?.rollBall || [128, 160] };
    W.roll = { pose: P.roll, parts: floorParts(P.roll, 'rollBall', ['rollBall']) };
  }
  if (P.kneel?.required?.length) {
    deformers.kneel = { kind: 'rot', pivot: P.kneel.pivots?.kneel || [128, 256] };
    W.kneel = { pose: P.kneel, parts: floorParts(P.kneel, 'kneel', ['kneel']) };
  }
  // (sit) her seated body, under the live head
  if (P.sit?.required?.length) W.sit = sitRig(P.sit, deformers, parts);
  return { S, U, V, deformers, parts, STANDING, HEAD, HAIR, SKIRT, FACE, ARM, HANG, SHOES, W, unknownParents, rectOf, hasBrows: !!brows };
}

/** Where a rest point lands with this frame's states (kit/rig.js's point, without a GL context). */
export function pointOf(deformers, id, st, x, y) {
  for (let d = id; d; d = deformers[d].parent) {
    const df = deformers[d], s = st[d];
    if (!s) continue;
    if (df.kind === 'rot') {
      const [px, py] = df.pivot, a = (s.a || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      const lx = (x - px) * (s.sx ?? s.s ?? 1), ly = (y - py) * (s.sy ?? s.s ?? 1);
      x = px + (s.tx || 0) + lx * c - ly * sn;
      y = py + (s.ty || 0) + lx * sn + ly * c;
    } else if (df.kind === 'warp' && s.fn) {
      const [x0, y0, x1, y1] = df.rect;
      const r = s.fn(clamp((x - x0) / (x1 - x0), 0, 1), clamp((y - y0) / (y1 - y0), 0, 1), x, y);
      x += r[0]; y += r[1];
    }
  }
  return [x, y];
}

/* ---------- points the kit and the effects use ---------- */
/** The kit's anchors (kit units): model.anchors over defaults from the head rect and the eyes. */
export function anchorsOf(model, R) {
  const [x0, y0, x1] = R.HEAD, cx = (x0 + x1) / 2, eyes = model.feat?.eyes || {};
  const under = k => { const b = eyes[k]?.ball; return b ? [f1(R.U((b[0] + b[2]) / 2)), f1(R.V(b[3]) + 2)] : [k === 'eyeL' ? cx - 14 : cx + 14, y0 + 70]; };
  const [l, r] = [under('eyeL'), under('eyeR')];
  const out = {
    gaze: [f1((l[0] + r[0]) / 2), f1((l[1] + r[1]) / 2 - 8)], tear: l, tears: [l, r], z: [x1 - 8, y0 + 20],
    hearts: [x0 + 30, x1 - 30, y0 + 40], bubble: [128, y0 - 4], glints: [[x0 + 8, y0 + 24], [x1 - 8, y0 + 36]],
    spout: [cx, y0 + 10], bulb: [x0 + 4, y0 + 6],
    ...(model.anchors || {}),
  };
  const KNEEL = R.W.kneel?.pose;
  if (KNEEL && KNEEL.headDrop != null) out.kneelRaise = f1(29 - KNEEL.headDrop);
  const LIE = R.W.lie?.pose;
  // lying, the same points on the lying drawing (none without it: the kit keeps her seated)
  if (LIE?.anchors) {
    const h = LIE.rects?.head;
    out.lie = { ...LIE.anchors, ...(h && !LIE.anchors.spout ? { spout: [(h[0] + h[2]) / 2, h[1] + 12] } : {}) };
  } else if (!LIE) delete out.lie;
  return out;
}
/** Where the effects over her go (rig units): model.fx over defaults from the head rect, brows and mouth. */
export function fxPointsOf(model, R) {
  const [x0, y0, x1, y1] = R.HEAD, cx = (x0 + x1) / 2, h = y1 - y0;
  const bb = R.rectOf('brows'), m = model.feat?.face?.mouth;
  const gy = bb ? bb[1] - 2 : y0 + h * .5;
  const neckY = R.deformers.neck.pivot[1];
  // a jagged crack down her middle, from the crown to the hem
  const crack = [];
  for (let i = 0; i <= 8; i++) crack.push([f1(cx + (i % 2 ? -8 : 8) + (i === 0 ? -2 : 0)), f1(y0 + 4 + i * (R.SKIRT[3] - 20 - y0) / 8)]);
  const out = {
    crack, orbit: [cx, y0 + 14], orbitR: (x1 - x0) * .42, think: [x1 - 4, y0 + 30], listen: [x1 + 8, y0 + h * .55],
    sweat: [x1 - 16, y0 + h * .55], anger: [x1 - 22, y0 + 26], bang: [x1 - 6, y0 + 10], question: [x1 - 6, y0 + 10],
    gloom: [[cx - 11, gy - 14, gy], [cx, gy - 14, gy + 4], [cx + 11, gy - 14, gy]],
    puff: m ? [f1(R.U(m[0])), f1(R.V(m[1]))] : [cx, y0 + h * .75],
    neckY,
  };
  // model.fx may use the whale's names: `top` (the stars' orbit), `side` (thought bubbles), gloom strokes as [x, y1] under `gloomTop`
  const M = { ...(model.fx || {}) };
  if (M.top && !M.orbit) M.orbit = M.top;
  if (M.side && !M.think) M.think = M.side;
  if (M.gloom) M.gloom = M.gloom.map(g => (g.length === 2 ? [g[0], M.gloomTop ?? g[1] - 14, g[1]] : g));
  for (const k of ['top', 'side', 'gloomTop']) delete M[k];
  return { ...out, ...M };
}
/** Her box and hit circles (kit units). */
export function extentOf(model, R) {
  if (model.extent) return model.extent;
  const r = unionRect(model.parts.map(p => p.box)) || [20, 12, 236, 256];
  return r.map(f1);
}
export function hitsOf(model, R) {
  if (model.hits) return model.hits;
  const [x0, y0, x1, y1] = R.HEAD, [sx0, sy0, sx1] = R.SKIRT;
  const head = [f1((x0 + x1) / 2), f1((y0 + y1) / 2), f1(Math.max(x1 - x0, y1 - y0) * .5)];
  const body = [128, f1((sy0 + 256) / 2), f1(Math.max((sx1 - sx0) * .5, (256 - sy0) * .5))];
  return [head, body];
}

/* ---------- frame by frame ---------- */
/**
 * The motion: `step(fc, o, dt, caps)` turns the kit's face `fc` and frame `o` into `{ st, hideFront, look, turn, steam,
 * steamAt, puffK, poseShown }` for the rig. `caps.pose(id)` says a pose's drawing can show now (its files are loaded),
 * `caps.tex(name)` that a texture is there.
 */
export function createMotion(model, R) {
  const feat = model.feat || {};
  const { S, U, ARM, HANG, SHOES, W, deformers } = R;
  const LIE = W.lie, BACK = W.back, ROLL = W.roll, KNEEL = W.kneel, SIT = W.sit;
  const neckPv = deformers.neck.pivot;
  const browSplit = feat.face?.browSplit != null ? U(feat.face.browSplit) : 128;
  const hemDrop = Math.max(0, 256 - R.SKIRT[3]);
  // where each foot is across the skirt (0..1), for the hem's bulge over a lifted foot
  const footU = ['footL', 'footR'].map(k => clamp((deformers[k].pivot[0] - R.SKIRT[0]) / (R.SKIRT[2] - R.SKIRT[0]), 0, 1));
  // the point drawing's finger goes this way (x): she looks where she points
  const pointDir = ARM.point ? Math.sign(ARM.point.wrist[0] - ARM.point.pivot[0]) || -1 : -1;
  const sp = {};
  const springs = () => {
    Object.assign(sp, {
      hair: spring(55, 7, 1.8), hairY: spring(50, 8, 1.2), bangs: spring(110, 10, 1.6), skirt: spring(100, 9, 1.6), skirtY: spring(90, 10, 1.1),
      orn: spring(140, 6, 38), rib: spring(90, 9, 30), head: spring(70, 10, 16),
      armL: spring(ARM_SPRING.k, ARM_SPRING.c, ARM_SPRING.lim), armR: spring(ARM_SPRING.k, ARM_SPRING.c, ARM_SPRING.lim),
    });
  };
  springs();
  let prevTilt = 0, prevYaw = 0, prevLow = 0, wTilt = 0, wLean = 0, sitK = 0, danceK = 0, lieK = 0, kneelK = 0, sitDrawK = 0;
  let sitOwnK = 1, raiseNow = 0;  // (sit) the seated arms' share; how far her points rise over the kit's sink
  let perk = 0, swish = 0, droop = 0, browLift = 0, browInner = 0, browSide = 0, backA = 0, backOn = 1, awayA = 0, faceArmT = 0, sinceArmG = 9, lastFaceArm = null, lastArmG = null;
  let armA = { hangL: 1, hangR: 1 };
  const groupTilt = (mode, tilt, lean) => tilt * wTilt + lean * wLean;
  const posable = (caps, id) => !!ARM[id] && caps.pose(id);

  function step(fc, o, dt, caps) {
    const t = o.t || 0, mode = o.mode || 'idle', face = o.face || 'neutral';
    const walking = mode === 'walk' || mode === 'run', held = mode === 'drag', airborne = mode === 'air';
    const st = { alpha: {} };
    sitK = lerp(sitK, clamp(o.sit ?? 0, 0, 1), ease(12, dt));
    const low = o.low || 0;
    const lowV = (low - prevLow) / Math.max(dt, 1e-3); prevLow = low;
    const breath = Math.sin(t * (mode === 'sleep' ? 1.7 : 2.4));
    lieK = LIE && caps.pose('lie') ? lerp(lieK, clamp(o.lie ?? 0, 0, 1), ease(14, dt)) : 0;
    if (lieK < 1e-3) lieK = 0;
    const { poseA, hide } = poseMix(lieK);
    // (sit) seated she shows the seated body, her head sunk less than `low`; a kneel with its own drawing goes down
    // through it too (the drawing fades in over it), but then the kit's points follow the kneel's own head (kneelRaise)
    const kneelOK = !!KNEEL && caps.pose('kneel'), sitOK = !!SIT && caps.pose('sit');
    const sitDrop = sitOK ? sitRaise(o.sit, SIT.drop) : 0;
    raiseNow = o.kneel && kneelOK ? 0 : sitDrop;
    const lowB = low - sitDrop;

    /* the kit's short gestures, as she does them */
    const g = o.gesture, gk = g ? g.k : 0, gkind = g?.kind;
    const env = (a, b) => smooth(0, a, gk) * (1 - smooth(b, 1, gk));
    const is = k => gkind === k;
    const nod = is('nod') ? Math.sin(gk * Math.PI * 2) ** 2 * (1 - .3 * gk) : 0;
    const shake = is('shake') ? Math.sin(gk * Math.PI * 6) * smooth(0, .12, gk) * (1 - gk) : 0;
    const wave = is('wave') ? env(.15, .8) : 0;
    const bow = is('bow') ? env(.25, .7) : 0;
    const shiver = is('shiver') ? env(.08, .85) : 0;
    const flap = is('flap') ? env(.05, .75) : 0;
    const cheer = is('cheer') ? env(.12, .6) : 0;
    const away = is('away') ? env(.12, .88) : 0;
    const heart = is('heart') ? env(.1, .85) : 0;
    const flinch = is('flinch') ? env(.04, .45) : 0;
    const peek = is('peek') ? env(.2, .8) : 0;
    const spoutC = is('spout') ? Math.sin(Math.PI * clamp(gk / .25, 0, 1)) : 0;
    const spoutP = is('spout') ? Math.sin(Math.PI * clamp((gk - .25) / .2, 0, 1)) : 0;
    const spoutOn = is('spout') ? env(.1, .7) : 0;
    const inh = is('sigh') ? Math.sin(Math.PI * clamp(gk / .45, 0, 1)) : 0;
    const exh = is('sigh') ? smooth(.35, .55, gk) * (1 - smooth(.8, 1, gk)) : 0;
    const puffK = is('sigh') ? clamp((gk - .38) / .45, 0, 1) : 0;
    const hold = ARM_BOTH[gkind] || ARM_ONE[gkind] ? env(.1, .88) : 0;
    const sip = is('sip') ? sipLift(gk) * hold : 0;
    const curt = is('curtsy') ? Math.sin(Math.PI * clamp((gk - .15) / .7, 0, 1)) * hold : 0;
    const titter = fc.titter || 0;
    const canBackDraw = !!BACK && caps.pose('back') && sitK < .5 && !lieK;
    // the back drawing's share fades over .15 s when it stops being allowed (sitting down turned away), not in a frame
    backOn = approach(backOn, canBackDraw ? 1 : 0, dt, BACK_FADE);
    const awayFace = away * (1 - backOn);

    /* arms: which drawings show, crossfading between them */
    const armG = ARM_BOTH[gkind] || ARM_ONE[gkind];
    sinceArmG = armG && gk < .9 ? 0 : sinceArmG + dt;
    if (armG) lastArmG = armG;
    const faceArm = CALM_MODES.includes(mode) ? FACE_ARMS[face] || null : null;
    faceArmT = faceArm && faceArm === lastFaceArm ? faceArmT + dt : 0;
    lastFaceArm = faceArm;
    // a face poses her arms once it has settled, and not right after a gesture (unless it keeps the gesture's pose)
    const faceOK = faceArm != null && ((faceArmT > .3 && sinceArmG > .4) || (faceArm === lastArmG && sinceArmG < .5));
    const has = Object.assign(id => posable(caps, id), { kind: id => ARM[id]?.kind });
    const plan = lieK > .5 ? { L: 'hangL', R: 'hangR', fallback: null } : armPlan({ mode, gesture: g, face, faceOK, kneel: !!o.kneel && !(KNEEL && caps.pose('kneel')) }, has);
    const want = new Set([plan.L, plan.R]);
    for (const k of new Set([...Object.keys(armA), ...want])) {
      armA[k] = approach(armA[k] || 0, want.has(k) ? 1 : 0, dt, ARM_FADE);
      if (armA[k] <= 0 && !want.has(k)) delete armA[k];
    }
    const up = k => smooth(0, 1, armA[k] || 0);
    const chinA = up('chin');

    /* where she looks: pointing, at what she points at */
    const look = (is('point') || face === 'pointing') && pointDir < 0 ? [-(o.look?.[0] || 0), o.look?.[1] || 0] : [o.look?.[0] || 0, o.look?.[1] || 0];

    /* head: tilt toward what it looks at, droop asleep, wobble dizzy */
    let tiltT = (look[0] * .5 + look[1] * .3) * (1 - .6 * chinA) + Math.sin(t * .9) * 1.2;
    if (mode === 'sleep') tiltT += 6;
    tiltT += (HEAD_TILT[face] || 0) * (1 - .7 * chinA);
    if (face === 'dizzy') tiltT += 3 * Math.sin(t * 4.5);
    if (held) tiltT += (o.swing || 0) * .25;
    const headTilt = sp.head.step(tiltT, dt);
    // what the kit meant for the whole group and the group did not take: tilt stays in-plane on the neck, lean pitches
    const [gT, gL] = GROUP[mode] || [0, 0];
    const tiltRest = (o.tilt ?? 0) * (1 - wTilt), leanRest = (o.lean ?? 0) * Math.sign(o.facing || 1) * (1 - wLean);
    wTilt = lerp(wTilt, gT, ease(10, dt)); wLean = lerp(wLean, gL, ease(10, dt));
    const gNeck = shake * 2.5 - wave * 3 + (gkind === 'vsign' ? -5 * hold : 0) + (gkind === 'scratch' ? 5 * hold : 0) + (gkind === 'heart' ? 3 * Math.sin(gk * Math.PI * 4) * heart : 0);
    const gYaw = shake * 1.1 - awayFace * 1.3;
    const fwd = bow * 20 - flinch * 8 + peek * (9 + 1.5 * Math.sin(t * 5)) + 3 * titter - 3 * inh + 6 * exh + curt * 10
      + (is('read') ? 5 * hold : 0) + sip * 4 + (is('serve') || is('hug') ? 5 * hold : 0) + (is('pray') ? 4 * hold * (.6 + .4 * Math.sin(gk * Math.PI * 4)) : 0)
      - (is('hips') || is('cross') ? 3 * hold : 0) + (is('point') ? 3 * hold : 0) + awayFace * 4;
    const P = pitchFromLean(fwd), PL = pitchFromLean(leanRest, .3);
    const headA = headTilt + gNeck;
    const tiltVel = (headA - prevTilt) / Math.max(dt, 1e-3); prevTilt = headA;
    const yawVel = (gYaw - prevYaw) / Math.max(dt, 1e-3); prevYaw = gYaw;
    // facing you, the head turns a touch toward +x at rest; angleY + pitches the face down
    const angleX = clamp(clamp(look[0] / 5, -1, 1) * .9 + gYaw + .12, -1.4, 1.4);
    const angleY = clamp(clamp(look[1] / 4, -1, 1) * .7 + (mode === 'sleep' ? .8 : 0) + (HEAD_PITCH[face] || 0) + nod * .9 + P.pitch + PL.pitch
      - flinch * .3 - .1 * inh + .3 * exh + awayFace * .35, -1.4, 1.4);

    /* springs */
    const sway = clamp((o.swing || 0) / 26, -1.6, 1.6);
    const upK = airborne || held ? 1 : 0;
    const hair = sp.hair.step(sway * 1.1 - tiltVel * .004 - yawVel * .02, dt);
    const hairY = sp.hairY.step(upK * -1 + lowV * .006, dt);
    const bangs = sp.bangs.step(sway * .7 - tiltVel * .004 - yawVel * .03, dt);
    const skirt = sp.skirt.step(sway * .8, dt);
    danceK = lerp(danceK, mode === 'dance' ? 1 : 0, ease(4, dt));
    const flare = sp.skirtY.step(upK * .8 + clamp(-lowV * .01, -.3, .6), dt);
    const [pk, sw, dr = 0] = MOOD[face] || MOOD.neutral;
    perk = lerp(perk, lerp(pk, -.6, Math.max(shiver, exh)), ease(6, dt));
    swish = lerp(swish, sw, ease(3, dt));
    const droopT = mode === 'sleep' ? -1 : Math.min(dr, -exh);
    droop = lerp(droop, droopT, ease(droopT < droop ? 1.1 : 3, dt));
    const burst = k => Math.max(0, Math.sin(t * 2.3 - k)) ** 2;
    const beat = face === 'singing' ? 7 * Math.sin(t * Math.PI * 2.5) : 0;
    // the ribbons buzz when angry, jitter when flustered, flutter in bursts when excited, beat time singing
    const jit = (face === 'angry' ? 2.5 * Math.sin(t * 40) : 0) + (face === 'flustered' ? 1.6 * Math.sin(t * 31) + 1.2 * Math.sin(t * 17.3) : 0)
      + (face === 'excited' || face === 'coax' ? (face === 'coax' ? 3 : 6) * burst(0) * Math.sin(t * 24) : 0) + flap * 13 * Math.sin(t * 26)
      + titter * 5 + beat + spoutOn * 6 * Math.sin(t * 26);
    // sway turns the flower counter-clockwise, so the ribbons trail the same way as the hair and skirt
    const orn = sp.orn.step(-tiltVel * .12 - yawVel * .5 - sway * 18 - spoutP * 20 + (face === 'surprised' ? -16 : 0) + (face === 'confused' ? 20 : 0)
      + (mode === 'sleep' ? 14 : 0) - hairY * 12, dt) + flap * 12 * Math.sin(t * 19) - titter * 6;
    const rib = sp.rib.step(perk * 10 - sway * 10, dt);

    /* feet under the skirt; sitting the skirt settles on the floor */
    const feet = feetFromLegs(o.legs || [[104, 212, 104, FOOT_Y], [150, 212, 150, FOOT_Y]]);
    const plop = Math.sin(Math.PI * smooth(.3, .8, sitK));

    /* plain arms: hang a little out, sway walking, out in the air, flailing when held */
    const walkS = clamp((feet[0].lift - feet[1].lift) / 12, -1, 1);
    let aL = 3, aR = -3;
    if (walking) { const amp = mode === 'run' ? 10 : 3; aL = 3 + amp * walkS; aR = -3 + amp * walkS; }
    if (airborne) { aL = 40; aR = -40; }
    if (held) { aL = 70 + 16 * Math.sin(t * 13); aR = -70 - 12 * Math.sin(t * 13 + 1.3); }
    if (mode === 'dizzy') { aL = 16 + 10 * Math.sin(t * 4.5); aR = -16 + 10 * Math.sin(t * 4.5 + 1); }
    if (sitK > .5 && !walking) { aL = lerp(aL, 10, sitK); aR = lerp(aR, -10, sitK); }
    if (face === 'happy' || face === 'love') { aL += 8 + 4 * Math.sin(t * 8); aR -= 8 + 4 * Math.sin(t * 8); }
    if (face === 'excited') { aL += 14; aR -= 14; }
    if (mode === 'dance') { const b = Math.sin((o.modeT || 0) * Math.PI * 2 * 1.1); aL = 16 + 24 * Math.max(0, b); aR = -16 - 24 * Math.max(0, -b); }
    if (plan.fallback) {
      const [fl, fr] = ARM_FALLBACK[plan.fallback] || [null, null], k = hold || env(.12, .85);
      if (fl != null) aL = lerp(aL, fl, k);
      if (fr != null) aR = lerp(aR, fr, k);
    }
    if (shiver && !armA.cross) { aL = lerp(aL, -10, shiver); aR = lerp(aR, 10, shiver); }
    if (flinch && !armA.oops) { aL = lerp(aL, -16, flinch); aR = lerp(aR, 16, flinch); }
    const baseL = sp.armL.step(aL, dt), baseR = sp.armR.step(aR, dt);
    const fbWave = plan.fallback === 'wave' ? wave * 13 * Math.sin(t * 15) : 0;
    st.armL = { a: baseL + fbWave + shiver * 1.4 * Math.sin(t * 47) + flap * 9 * Math.sin(t * 24) + (fc.shake && face === 'nervous' ? Math.sin(t * 47) : 0) };
    st.armR = { a: baseR - shiver * 1.2 * Math.sin(t * 43 + 1) - flap * 9 * Math.sin(t * 24 + 1) };
    for (const id of HANG.hangL) st.alpha[id] = up('hangL');
    for (const id of HANG.hangR) st.alpha[id] = up('hangR');

    /* the arm drawings: each rises a little into place as it fades in, then moves its own way */
    let steam = 0, steamAt = null;
    for (const [id, A] of Object.entries(ARM)) {
      const k = up(id), s = { ty: ARM_RISE * (1 - k), a: 0, sx: 1, sy: 1 };
      let lift = null;
      if (k > 0) {
        const own = (ARM_ONE[gkind] || ARM_BOTH[gkind]) === id;
        switch (id) {
          case 'wave': {
            // past the wrist (along shoulder→wrist) the hand waves about the wrist; the sleeve stays
            const [qx, qy] = A.wrist, ux = qx - A.pivot[0], uy = qy - A.pivot[1], ul = Math.hypot(ux, uy) || 1;
            const hand = 16 * Math.sin(t * 13) * Math.PI / 180;
            s.a = 3 * Math.sin(t * 13 - .8);
            lift = (u, v, x, y) => { const w = smooth(-2, 4, ((x - qx) * ux + (y - qy) * uy) / ul); return [-hand * w * (y - qy), hand * w * (x - qx)]; };
            break;
          }
          case 'scratch': s.a = 3 * Math.sin(t * 16); break;
          case 'idea': if (own) s.a = -4 * Math.sin(Math.PI * smooth(.2, .45, gk)); break;
          case 'vsign': if (own) s.a = -3 * Math.sin(Math.PI * smooth(.2, .4, gk)); break;
          case 'point': if (own) s.a = 3 * Math.sin(Math.PI * smooth(.3, .45, gk)); break;
          case 'salute': if (own) s.a = 5 * Math.sin(Math.PI * clamp((gk - .1) / .1, 0, 1)); break;
          case 'chin': s.a = .8 * Math.sin(t * 1.3); break;
          case 'fist': s.ty -= 2.5 * Math.abs(Math.sin(t * 7)); break;
          case 'cheer': s.ty -= 3 * Math.abs(Math.sin(t * 11)); break;
          case 'heart': { const b = .025 * Math.sin(t * 8); s.sx = s.sy = 1 + b; break; }
          case 'pray': s.ty += 1.5 * Math.abs(Math.sin(t * 6)); break;
          case 'hug': s.sx = 1 + .02 * Math.sin(t * 2.2); break;
          case 'offer': if (own) { const o2 = .05 * smooth(.2, .45, gk); s.sx = s.sy = 1 + o2; } break;
          case 'cross': s.a = shiver * 1.2 * Math.sin(t * 43); break;
          case 'oops': s.a = .6 * Math.sin(t * 31) * (flinch || .3); break;
          case 'shy': s.ty += .6 * Math.sin(t * 9); break;
          case 'search': s.a = 1.6 * Math.sin(t * 1.7); break;
          case 'write': {
            // the pen scribbles along the page
            const [qx, qy] = A.wrist, d = .9 * Math.sin(t * 23), e = .4 * Math.sin(t * 9);
            lift = (u, v, x, y) => { const w = Math.exp(-((x - qx) ** 2 + (y - qy) ** 2) / 120); return [d * w, e * w]; };
            break;
          }
          case 'cup': {
            // sipping, the hands and cup (the drawing's top half) come up toward her mouth, the sleeves after them
            s.a = 1.2 * Math.sin(t * 1.3) * k - .4 * 11 * sip;
            const l = 11 * sip;
            lift = (u, v) => [0, -l * (1 - smooth(.5, .95, v))];
            if (own || !steam) { steam = k * hold; steamAt = [A.lift, A.wrist]; }
            break;
          }
          default: s.a = .6 * Math.sin(t * 1.3) + (walking ? .8 * walkS : 0); s.ty += .3 * breath;
        }
      }
      st[A.rot] = s;
      if (lift) st[A.lift] = { fn: lift };
      for (const p of A.parts) st.alpha[p.id] = caps.tex(p.tex) ? k : 0;
    }

    /* deformer states */
    // a breath, the sit's plop, a shiver and a flinch squash the body about her feet; walking sways it a little
    st.body = {
      a: -sway * 1.2 + (held ? (o.swing || 0) * .15 : 0) + (walking ? 1.5 * walkS : 0) + 10 * smooth(.05, .3, lieK) * (1 - poseA),
      ty: 0, sx: (1 + .006 * breath + .04 * plop) * (1 - .03 * shiver), sy: (1 - .012 * breath - .06 * plop) * (1 - .03 * flinch),
    };
    if (is('stretch')) st.body.sy *= 1 + .05 * smooth(.2, .45, gk) * hold;
    if (curt) { st.body.sy *= 1 - .07 * curt; st.body.sx *= 1 + .03 * curt; }
    if (cheer) st.body.ty -= 4 * Math.abs(Math.sin(t * 11)) * cheer;
    if (is('salute')) st.body.sy *= 1 + .03 * Math.sin(Math.PI * clamp(gk / .15, 0, 1));
    if (fc.rock && face === 'coax') st.body.a += 3 * fc.rock;
    if (spoutC || spoutP) { st.body.sy *= 1 - .1 * spoutC + .05 * spoutP; st.body.sx *= 1 + .05 * spoutC - .02 * spoutP; }
    if (is('roll') && ROLL && caps.pose('roll')) {
      const c = Math.sin(Math.PI * clamp(gk / .2, 0, 1)), pop = Math.sin(Math.PI * clamp((gk - .82) / .18, 0, 1));
      // (without the ball drawing the roll is the kit's, squash and all: figure.roll = 'spin')
      st.body.sy *= 1 - .16 * c + .07 * pop; st.body.sx *= 1 + .08 * c - .03 * pop;
    }
    // the upper body sinks with the kit's `low` (sitting, the walk's bob); a bow shortens it instead of turning it
    st.waist = {
      a: P.rot + PL.rot, ty: lowB + P.waistTy + PL.waistTy,
      sy: (1 - .07 * titter) * (1 + .03 * inh - .03 * exh) * P.waistSy * PL.waistSy,
    };
    // the skirt: its top goes down with the waist, seated its hem settles on the floor and spreads; it bulges over a lifted foot
    const hemK = sitK * hemDrop;
    st.skirt = {
      fn: (u, v) => {
        const k = v * v;
        let bulge = 0;
        for (let i = 0; i < 2; i++) bulge += feet[i].lift * Math.exp(-(((u - footU[i]) / .16) ** 2));
        return [skirt * (4 + 4 * danceK) * k + flare * (u - .5) * 9 * v + sitK * (u - .5) * 16 * v + curt * (u - .5) * 14 * v,
          lerp(lowB, hemK, v) - flare * k * 3 - curt * 6 * k * Math.abs(u - .5) * 2 - bulge * .35 * smooth(.6, 1, v)];
      },
    };
    const shoeA = 1 - smooth(.35, .6, sitK);
    for (const id of SHOES) st.alpha[id] = shoeA;
    st.footL = { tx: feet[0].tx, ty: feet[0].ty };
    st.footR = { tx: feet[1].tx, ty: feet[1].ty };

    st.neck = {
      a: headA + clamp(tiltRest * .8, -10, 12),
      ty: (mode === 'sleep' ? 2.5 : 0) + breath * .35 + 3 * titter + P.neckTy + PL.neckTy + nod * 2,
    };
    const turn = [angleX, angleY];
    const parallax = ([kx, ky]) => (u, v) => [angleX * kx * bump(u) * (.4 + .6 * bump(v)), angleY * ky * bump(v) * (.4 + .6 * bump(u))];
    for (const [id, gains] of Object.entries(PARALLAX)) st[id] = { fn: parallax(gains) };
    if (R.hasBrows) {
      const [bl, bi, bs = 0] = BROW[face] || [0, 0];
      browLift = lerp(browLift, bl - 1.5 * (o.blink || 0), ease(14, dt));
      browInner = lerp(browInner, bi, ease(10, dt));
      browSide = lerp(browSide, bs, ease(10, dt));
      const [bx0, , bx1] = deformers.brows.rect;
      st.brows = {
        fn: (u, v, x) => {
          // 0 at a brow's outer end, 1 at its inner end
          const k = x < browSplit ? clamp((x - bx0) / (browSplit - bx0), 0, 1) : clamp((bx1 - x) / (bx1 - browSplit), 0, 1);
          return [0, -(browLift + browInner * k * k + (x < browSplit ? 0 : browSide)) * S];
        },
      };
    }
    // the long hair hangs from the head but its lower part keeps to the body when the head tilts; its tips swish with the mood
    const na = headA * Math.PI / 180;
    st.hairSway = {
      fn: (u, v, x, y) => {
        const w = smooth(.3, .8, v), a = -na * w, c = Math.cos(a), s = Math.sin(a);
        const dx = x - neckPv[0], dy = y - neckPv[1], wv = Math.pow(v, 1.6);
        return [neckPv[0] + dx * c - dy * s - x + hair * 8 * wv + Math.sin(t * 1.6 + v * 3) * wv + swish * 1.2 * Math.sin(t * (3 + 4 * swish) + v * 2) * wv * wv,
          neckPv[1] + dx * s + dy * c - y + hairY * 12 * wv * wv - Math.abs(hair) * 1.5 * wv];
      },
    };
    st.bangsSway = { fn: (u, v) => [bangs * 3.2 * v * v + Math.sin(t * 1.9 + u * 2) * .5 * v * v, hairY * 3 * v * v] };
    // the flower is pinned in her hair: it only rocks; its ribbons swing from it, perk up or hang limp with the mood
    st.ornament = { a: orn * .2 + Math.sin(t * 2.1) * .8 };
    const [opx, opy] = deformers.ornament.pivot, ry1 = deformers.ribbons.rect[3];
    const ra = (rib + jit + orn * .5) * Math.PI / 180 * .6, rdy = -perk * 1.5 - droop * 1.5;
    st.ribbons = {
      fn: (u, v, x, y) => {
        const w = smooth(0, 1, (y - opy) / Math.max(1, ry1 - opy)), sw2 = Math.sin(t * 1.7 + v * 2) * .6 * w;
        return [(-ra * (y - opy) + sw2 + swish * Math.sin(t * (3 + 4 * swish)) * .8 * w) * w, (ra * (x - opx) * .3 + rdy) * w];
      },
    };

    /* whole-body drawings */
    if (LIE) lying(st, o, fc, face, mode, t, dt, breath, poseA, { nod, shake, bow, flinch, peek, flap }, g, gk, caps);
    const awayBack = is('away') ? smooth(.05, .07, gk) * (1 - smooth(.93, .95, gk)) : 0;
    awayA = awayStep(awayA, awayBack, g, dt);
    const view = backView(o.facing, awayA), backK = BACK && caps.pose('back') ? view.k : 0;
    backA = smooth(0, .5, backK) * backOn;
    if (BACK) {
      st.backFlip = { sx: view.flip ? -1 : 1 };
      // the drawing's lower end is her hem and shoes: they stay put on the floor
      st.backHair = { fn: (u, v) => { const w = v * v * (1 - smooth(.75, .97, v)); return [(hair * 6 + Math.sin(t * 1.6 + v * 3)) * w, hairY * 6 * w]; } };
      for (const p of BACK.parts) st.alpha[p.id] = caps.tex(p.tex) ? backA : 0;
      const sq = Math.max(away ? .3 * Math.sin(Math.PI * smooth(0, .12, gk)) + .3 * Math.sin(Math.PI * smooth(.88, 1, gk)) : 0, awayA > awayBack ? .3 * bump(awayA) : 0);
      st.body.sx *= 1 - sq * backOn;
    }
    // no back drawing to show: the body turns off too (narrower, leaning away), not just the head
    if (awayFace) { st.body.sx *= 1 - .12 * awayFace; st.body.a -= 3 * awayFace; }
    const ballA = is('roll') && ROLL && caps.pose('roll') ? ballMix(gk) : 0;
    if (ROLL) {
      const a = 360 * rollTurn(gk), land = Math.sin(Math.PI * clamp((gk - .12) / .12, 0, 1)), sup = ROLL.pose.support;
      st.rollBall = { a, ty: sup?.length ? sup[0] - ballLift(sup, a) : 0, sx: 1 + .05 * land, sy: 1 - .05 * land };
      for (const p of ROLL.parts) st.alpha[p.id] = caps.tex(p.tex) ? ballA : 0;
    }
    // kneeling with a kneeling drawing: once she is down it fades in over the seated rig, as lying does
    kneelK = lerp(kneelK, o.kneel && kneelOK && !lieK ? smooth(.5, 1, sitK) : 0, ease(10, dt));
    if (kneelK < 1e-3) kneelK = 0;
    let kneelA = 0;
    if (KNEEL) {
      const a = kneelA = smooth(.15, .5, kneelK), shut = eyesShut(o, fc.eyes, mode), m = lyingMouth(o, face, mode);
      st.kneel = { sx: 1 + .006 * breath, sy: 1 - .012 * breath };
      for (const p of KNEEL.parts) {
        const use = p.use ? (p.use === 'shut' ? shut : m[p.use] || 0) : 1;
        st.alpha[p.id] = caps.tex(p.tex) ? a * use : 0;
      }
    }
    // an opaque drawing over her (lying, her back, the ball, kneeling) hides the standing and the seated body alike
    const hideFront = hide || backA >= 1 || ballA >= 1 || kneelA >= 1;
    if (SIT) seated(st, o, fc, face, mode, dt, caps, sitOK, hideFront, plan);
    return { st, hideFront, look, turn, steam, steamAt, puffK, poseShown: poseA, plan };
  }

  /* ---------- (sit) the seated body ---------- */
  const SIT_ARMS = [...HANG.hangL, ...HANG.hangR, ...Object.values(ARM).flatMap(A => A.parts.map(p => p.id))];
  const SIT_UNDER_IDS = [...SIT_UNDER, ...SHOES];
  /**
   * The seated body's alphas: its pool comes in over the standing skirt as she goes down (which goes once the pool is
   * opaque); its arms and book come in over every standing arm drawing, and give way to a gesture's or a face's arms
   * (the standing torso and capelet show again under those). Gone under an opaque whole-body drawing (`hide`).
   */
  function seated(st, o, fc, face, mode, dt, caps, sitOK, hide, plan) {
    sitDrawK = lerp(sitDrawK, sitOK ? sitK : 0, ease(14, dt));
    if (sitDrawK < 1e-3) sitDrawK = 0;
    sitOwnK = approach(sitOwnK, sitOwnArms(plan) ? 1 : 0, dt, ARM_FADE);
    const { sitA, topA } = hide ? { sitA: 0, topA: 0 } : sitMix(sitDrawK, sitOwnK);
    const shut = eyesShut(o, fc.eyes, mode), m = lyingMouth(o, face, mode);
    st.sitBase = {};
    st.sitTop = {};
    for (const p of SIT.parts) {
      const use = p.use ? (p.use === 'shut' ? shut : m[p.use] || 0) : 1;
      st.alpha[p.id] = caps.tex(p.tex) ? (p.parent === 'sitTop' ? topA : sitA) * use : 0;
    }
    if (sitA >= 1) for (const id of SIT_UNDER_IDS) st.alpha[id] = 0;
    if (topA >= 1) for (const id of SIT_BESIDE) st.alpha[id] = 0;
    if (topA > 0) for (const id of SIT_ARMS) st.alpha[id] = (st.alpha[id] ?? 1) * (1 - topA);
  }

  /** The lying drawing's states and the dissolve's alphas; its face is drawn in, with eyes-shut and mouth patches. */
  const MOOD_KICK = { happy: [1.6, 1.4], love: [1.6, 1.2], excited: [1.9, 1.7], wink: [1.3, 1.2], angry: [1.2, 2], sad: [.3, .6], cry: [.2, .6], sleepy: [.4, .7], scared: [.2, 1], worried: [.5, .8] };
  let kickPh = 0;
  function lying(st, o, fc, face, mode, t, dt, breath, poseA, gs, g, gk, caps) {
    const { nod, shake, bow, flinch, peek, flap } = gs, L = LIE.pose;
    const pv = L.pivots || {}, still = mode === 'sleep' || fc.listen;
    const fid = kind => (g?.kind === kind ? Math.sin(Math.PI * gk) : 0);
    const flopUp = 1 - smooth(.2, .6, lieK);
    st.lie = { a: -14 * flopUp, sx: 1 + .006 * breath, sy: (1 - .012 * breath) * (1 - .04 * flinch) };
    st.lieBack = { fn: (u, v) => [0, -.8 * (.5 + .5 * breath) * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)] };
    const th = (1.4 * Math.sin(t * .9) + 1.1 * Math.sin(t * 6.9) * (o.talk || 0) + clamp(o.look?.[0] || 0, -6, 6) * .3 + (mode === 'sleep' ? 3 : 0)
      + nod * 6 + bow * 7 + shake * 2 - flinch * 5 + fid('chin') * 6) * Math.PI / 180;
    const hx = shake * 2.5 + peek * 3, [cx, cy] = pv.lieChin || [L.rects?.head?.[0] ?? 128, L.rects?.head?.[3] ?? 200];
    st.lieHead = {
      fn: (u, v, x, y) => { const w = smooth(0, .35, u) * (1 - smooth(.7, 1, v)); return [(-th * (y - cy) + hx) * w, th * (x - cx) * w]; },
    };
    if (L.legAxis) {
      const [mk, mr] = MOOD_KICK[face] || [1, 1];
      const amp = Math.min(KICK.amp, (still ? 0 : 5 * mk) + 9 * fid('kick') + 8 * flap), rad = Math.PI / 180;
      kickPh += dt * (2.1 * mr + 3 * fid('kick'));
      st.lieLegs = { fn: kickField(L.legAxis, amp * Math.sin(kickPh) * rad, Math.min(KICK.apart, amp * .35) * Math.sin(kickPh + 1.6) * rad) };
    }
    const shut = eyesShut(o, fc.eyes, mode), mouth = lyingMouth(o, face, mode);
    for (const p of LIE.parts) st.alpha[p.id] = !caps.tex(p.tex) ? 0 : !p.use ? poseA : p.use === 'shut' ? poseA * shut : poseA * (mouth[p.use] || 0);
  }

  function reset() {
    springs();
    prevTilt = prevYaw = prevLow = wTilt = wLean = sitK = danceK = lieK = kneelK = sitDrawK = 0;
    perk = swish = droop = browLift = browInner = browSide = backA = awayA = faceArmT = kickPh = 0;
    backOn = 1;
    sinceArmG = 9; lastFaceArm = lastArmG = null;
    sitOwnK = 1; raiseNow = 0;
    armA = { hangL: 1, hangR: 1 };
  }

  return {
    step, reset, groupTilt,
    /** The arm drawings' alphas now (for tests and tools). */
    get arms() { return { ...armA }; },
    get lieK() { return lieK; },
    get sitK() { return sitK; },
    /** (sit) How far the kit's points must rise seated (figure.anchors). */
    get sitRaise() { return raiseNow; },
  };
}
