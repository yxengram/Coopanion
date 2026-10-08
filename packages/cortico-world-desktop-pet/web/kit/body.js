/**
 * The pet kit: a body that stands on the floor of the stage, walks, runs, jumps, sits, sleeps,
 * is picked up and thrown, makes faces and short gestures, with particles (hearts, tears, z's,
 * dust, notes) and a shadow. A figure pack builds its body on it (`createBody`) and only draws:
 * Coo (web/coo/figure.js) and the whale (web/whale/figure.js) both do. A pack may also ignore the
 * kit and answer the body contract (web/figure-frame.js) on its own.
 *
 * With `opts.plus` the body does more: it lies down on its front and kneels, and knows the faces and
 * motions in PLUS_EXPRESSIONS / PLUS_MOTIONS (a song, a spout, a roll, a cup of tea…) with their
 * particles (glints, rings of song, a bulb, chips of stone, spray). Coo and the whale ask for it;
 * without it the body is the kit as any other pack knows it.
 *
 * Coordinates: the figure is drawn in logo units, facing right, ground at y=256, inside a 256 square.
 * The stage places it with translate(AX AY) rotate(rot) scale(kx ky) translate(-ax -ay); `toStage`
 * maps a logo point back to stage pixels for hit tests, particles and the bubble's spot.
 *
 * Nothing here plays sound or talks to the World: sounds are asked for through `opts.sfx` and what
 * happens to the body is told through `opts.onEvent`; the page around the frame does the rest.
 */
export { createRig } from './rig.js';

export const f = n => Math.round(n * 10) / 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = k => k * k * (3 - 2 * k);
/** 0 → 1 over [0, a] of k, holds, then back to 0 over [b, 1]: the shape of a gesture held for a moment. */
export const envelope = (k, a, b) => smooth(clamp(k / a, 0, 1)) * (1 - smooth(clamp((k - b) / (1 - b), 0, 1)));

/* ---------- legs and particles ---------- */
export const HIPS = [[104, 212], [150, 212]];
export const LEG_W = 30;
// a foot's round cap touches the ground
const FOOT_Y = 256 - LEG_W / 2;
export const STAND = HIPS.map(h => [h[0], h[1], h[0], FOOT_Y]);
// (plus) lying on her front: hips at the back of the body, one foot flat behind, the other up in the air
const LIE_HIPS = [[62, 200], [78, 206]], LIE_FEET = [[8, 240], [18, 178]];
export const DROP = 'M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z';
// (plus) a spout's water: its own fixed colours (any scheme, any desktop), and the spray's fall, per unit of the stage scale
const WATER = '#2f7fd0', SPRAY_G = 2200;
export function heartD(cx, cy, s) {
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, 14)}C${p(-7, 8)} ${p(-19, 1)} ${p(-19, -6)}C${p(-19, -15)} ${p(-8, -18)} ${p(0, -9)}C${p(8, -18)} ${p(19, -15)} ${p(19, -6)}C${p(19, 1)} ${p(7, 8)} ${p(0, 14)}Z`;
}

/* ---------- faces ----------
   What a face asks of the body and the figure: eye shapes and sizes, mouth gap, blush, marks over
   the head, particles. Coo draws these as they are; a figure with its own art reads what it can. */
const ring = o => ({ shape: 'ring', rx: 16, ry: 16, ...o });
const yawn = t => { const p = (t % 4.2) / 1.6; return p < 1 ? Math.sin(Math.PI * p) ** 2 : 0; };

export const FACES = {
  neutral:   { label: '平静', kao: '(0 0',  f: () => ({ gap: [50, 50], eyes: [ring(), ring()] }) },
  happy:     { label: '开心', kao: '(^ ^',  f: () => ({ gap: [58, 58], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .45 }) },
  wink:      { label: '眨眼', kao: '(0 ^',  f: () => ({ gap: [56, 52], eyes: [ring(), { shape: 'up' }] }) },
  love:      { label: '喜欢', kao: '(♡ ♡',  f: t => { const s = .8 + .08 * Math.sin(t * 9); return { gap: [56, 56], eyes: [{ shape: 'heart', s, sw: 8 }, { shape: 'heart', s, sw: 8 }], blush: .7, emit: 'heart' }; } },
  shy:       { label: '害羞', kao: '(o o *', f: () => ({ gap: [40, 40], eyes: [ring({ rx: 13, ry: 12, dx: -3, dy: 5 }), ring({ rx: 13, ry: 12, dx: -3, dy: 5 })], blush: 1, lookLock: true }) },
  surprised: { label: '惊讶', kao: '(O O',  f: () => ({ gap: [62, 62], eyes: [ring({ rx: 20, ry: 21 }), ring({ rx: 20, ry: 21 })], bang: true }) },
  angry:     { label: '生气', kao: '(ò ó',  f: () => ({ gap: [36, 36], eyes: [ring({ ry: 11, dy: 4 }), ring({ ry: 11, dy: 4 })], brows: 'angry', anger: true, shake: true }) },
  sad:       { label: '难过', kao: '(ó ò',  f: () => ({ gap: [34, 40], eyes: [ring({ ry: 14, dy: 4 }), ring({ ry: 14, dy: 4 })], brows: 'sad', emit: 'tear' }) },
  sleepy:    { label: '犯困', kao: '(- -',  f: t => { const y = yawn(t); return { gap: [50 + 14 * y, 50 + 14 * y], eyes: [{ shape: 'lid', ry: 9 - 7 * y }, { shape: 'lid', ry: 9 - 7 * y }] }; } },
  sleep:     { label: '睡着', kao: '(u u',  f: t => { const b = 40 + 6 * Math.sin(t * 1.7); return { gap: [b, b], eyes: [{ shape: 'down' }, { shape: 'down' }], emit: 'z' }; } },
  dizzy:     { label: '晕乎', kao: '(@ @',  f: t => ({ gap: [54 + 5 * Math.sin(t * 5), 48], eyes: [{ shape: 'spiral', rot: t * 7 }, { shape: 'spiral', rot: t * 7 + 1.4 }], orbit: true }) },
  dragged:   { label: '被拎起', kao: '(> <', f: t => { const g = 55 + 3 * Math.sin(t * 22); return { gap: [g, g], eyes: [{ shape: 'gt' }, { shape: 'lt' }], sweat: true }; } },
  content:   { label: '惬意', f: (t, p) => { const r = 11 - 9 * (p ? p.drowse : 0); return { gap: [46, 46], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }] }; } },
  waking:    { label: '醒来', f: (t, p) => {
    const mt = p ? p.modeT : 1;
    const k = clamp(mt / .5, 0, 1), y = mt > .5 ? Math.sin(clamp((mt - .5) / .9, 0, 1) * Math.PI) : 0;
    const r = Math.max(0, 10 * k * (1 - .7 * y));
    return { gap: [50 + 12 * y, 50 + 12 * y], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }] };
  } },
  squeeze:   { label: '回神', f: () => ({ gap: [44, 44], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }] }) },
  listening: { label: '倾听', f: () => ({ gap: [44, 44], eyes: [ring({ rx: 17, ry: 18, dy: -1 }), ring({ rx: 17, ry: 18, dy: -1 })], listen: true }) },
  thinking:  { label: '思考', f: t => ({ gap: [46, 46], eyes: [ring({ rx: 14, ry: 15, dx: 3, dy: -4 }), ring({ rx: 14, ry: 15, dx: 3, dy: -4 })], think: true }) },
  run:       { label: '冲刺', f: t => { const g = 55 + 4 * Math.sin(t * 16); return { gap: [g, g], eyes: [ring(), ring()], sweat: true }; } },
  smug:      { label: '得意', kao: '(¬ ¬', f: () => ({ gap: [52, 46], eyes: [{ shape: 'lid', ry: 8, dx: 4 }, { shape: 'lid', ry: 8, dx: 4 }], blush: .25 }) },
  // `lookAt` holds the gaze (and with it a figure's head) on a point, here away from whoever is there
  pout:      { label: '嘟嘴', kao: '(o o 3', f: () => ({ gap: [28, 28], eyes: [ring({ rx: 14, ry: 13 }), ring({ rx: 14, ry: 13 })], blush: .6, lookAt: [-5, -1] }) },
  worried:   { label: '担心', kao: '(ó ò ;', f: () => ({ gap: [40, 44], eyes: [ring({ ry: 17, dy: 2 }), ring({ ry: 17, dy: 2 })], brows: 'sad', sweat: true }) },
  determined: { label: '认真', kao: '(ò ó', f: () => ({ gap: [42, 42], eyes: [ring({ ry: 13, dy: 1 }), ring({ ry: 13, dy: 1 })], brows: 'angry' }) },
  flustered: { label: '慌张', kao: '(> <;', f: t => ({ gap: [50 + 3 * Math.sin(t * 22), 48], eyes: [{ shape: 'gt' }, { shape: 'lt' }], blush: 1, sweat: true }) },
  // `wide`: eyes wider than open (a figure with drawn eyes may use its surprised ones)
  scared:    { label: '害怕', kao: '(O O;', f: () => ({ gap: [38, 38], eyes: [ring({ rx: 18, ry: 19 }), ring({ rx: 18, ry: 19 })], brows: 'sad', wide: true, shake: true, sweat: true }) },
  excited:   { label: '期待', kao: '(☆ ☆', f: () => ({ gap: [60, 60], eyes: [ring({ rx: 18, ry: 19, dy: -1 }), ring({ rx: 18, ry: 19, dy: -1 })], sparkle: true, blush: .4 }) },
  cry:       { label: '大哭', kao: '(T T', f: t => { const g = 36 + 6 * Math.abs(Math.sin(t * 9)); return { gap: [g, g], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }], brows: 'sad', emit: 'tears', streams: true }; } },
  // a motion's own face (not one to ask for): eyes shut through a bow
  bowing:    { label: '鞠躬', f: () => ({ gap: [48, 48], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }] }) },
  confused:  { label: '疑惑', kao: '(0 o ?', f: () => ({ gap: [44, 40], eyes: [ring(), ring({ rx: 14, ry: 11 })], question: true }) },
};

/** The faces a word can ask for, and the motions the kit does by name. */
export const KIT_EXPRESSIONS = ['neutral', 'happy', 'wink', 'love', 'shy', 'surprised', 'angry', 'sad', 'sleepy', 'thinking',
  'smug', 'pout', 'worried', 'determined', 'flustered', 'scared', 'excited', 'cry', 'confused'];
export const KIT_MOTIONS = ['stand', 'jump', 'hop', 'look', 'turn', 'nod', 'shake', 'spin', 'sit', 'sleep', 'dizzy', 'walk', 'run',
  'wave', 'bow', 'shiver', 'flap', 'dance'];
/** The tone each face plays as it comes on (the host's synthesized sounds, web/sound.js), filed as a face sound. */
const FACE_TONES = {
  happy: 'happy', wink: 'wink', love: 'love', surprised: 'surprised', angry: 'angry', sad: 'sad', shy: 'shy', sleepy: 'yawn',
  smug: 'wink', worried: 'hmm', determined: 'pop', flustered: 'shy', scared: 'surprised', excited: 'sparkle', cry: 'sad', confused: 'hmm',
};
/** Body modes in which the figure travels across the stage or squashes fast (dancing steps and sways on the spot). */
const MOVING_MODES = new Set(['drag', 'air', 'crouch', 'land', 'walk', 'run', 'dance']);
/** Points on the body in logo units, for a figure that names none: where the eyes look from, where a tear starts,
 *  where z's and hearts start ([x from, x to, y]), the bubble's spot. `tears` (one start under each eye) has no default. */
const ANCHORS = { gaze: [140, 117], tear: [166, 136], z: [196, 40], hearts: [90, 175, 34], bubble: [128, 0] };
/** The body's box in logo units, for a figure that names none (`figure.extent`), and its hit circles (`figure.hits`). */
const EXTENT = [20, 12, 236, 256];
const HITS = [[128, 128, 108]];

/* ---------- plus: more faces and words, for a body made with `opts.plus` ---------- */
/**
 * Faces a plus body adds, and the two it does its own way (shy, sad). The motions' own faces (peeking … reading)
 * are not ones to ask for. Beyond the kit's face fields: `lean` tips the body back (-) or forward while standing or
 * sitting; `sag` sinks a figure that squashes for faces a little (+) or holds it stiff (-); `gloom` draws the three
 * lines of 无语; numeric `shake` sets the tremor's size; `titter` (0..1) shakes in fits; `cat` is a ω mouth; `rock`
 * (-1..1) rocks the body side to side; `tongue` pokes the tip of a tongue out; `streams` may be { a, len, w }
 * (fainter, shorter, thinner tracks); `emitEvery` paces the face's particles; `stone` (0..1), `crack` (0..1) and
 * `freeze` turn the body to stone; `puff` (0..1) opens the mouth for a sigh's "ha"; `sing` (0..1) for a song's beat.
 * Faces timed from when they began read `p.exprAt`.
 */
export const PLUS_FACES = {
  // ducks her head and looks away, then about .6 s in peeks back at you for a moment, and again every 2.6 s
  // ("away" is +x for a drawn figure's head, which turns toward profile; Coo's eyes stay averted through dx)
  shy:       { label: '害羞', kao: '(o o *', f: (t, p) => {
    const a = p ? (t - p.exprAt) % 2.6 : 0, peek = a > .6 && a < 1.3;
    return peek
      ? { gap: [42, 42], eyes: [ring({ rx: 15, ry: 15, dy: -2 }), ring({ rx: 15, ry: 15, dy: -2 })], blush: 1, lookAt: [-1.5, -1], lean: 4 }
      : { gap: [40, 40], eyes: [ring({ rx: 13, ry: 12, dx: -6, dy: 5 }), ring({ rx: 13, ry: 12, dx: -6, dy: 5 })], blush: 1, lookAt: [3, 2], lean: 6 };
  } },
  sad:       { label: '难过', kao: '(ó ò',  f: () => ({ gap: [34, 40], eyes: [ring({ ry: 14, dy: 4 }), ring({ ry: 14, dy: 4 })], brows: 'sad', emit: 'tear', lookAt: [1, 3], lean: 4, sag: .04 }) },
  disgusted: { label: '嫌弃', kao: '(- -|||', f: () => ({ gap: [32, 30], eyes: [{ shape: 'lid', ry: 6.5, dx: 4 }, { shape: 'lid', ry: 6.5, dx: 4 }], lookAt: [-4, 0], lean: -5, gloom: true }) },
  // eyes darting off and back about twice a second, a short tremor every 1.7 s, the body held stiff;
  // timed from when the face began (p.exprAt), so the first glance and tremor come at once
  nervous:   { label: '紧张', kao: '(o o;', f: (t, p) => {
    const s = t - (p ? p.exprAt : 0), n = Math.floor(s * 1.9), away = n % 2 === 0;
    return {
      gap: [36, 36], eyes: [ring({ rx: 13, ry: 14 }), ring({ rx: 13, ry: 14 })], sweat: true, sag: -.04,
      lookAt: away ? [Math.sin(n * 78.233) > 0 ? 5.5 : -5.5, 1.5 * Math.sin(n * 2.1)] : [0, 0],
      shake: s % 1.7 < .3 ? .9 : 0,
    };
  } },
  // a quiet, warm smile: eyes softly half shut on you, a little blush, a slow nod every 2.2 s (from when it began,
  // the first just after the face comes in, so a held face of the usual 3.2 s nods twice)
  gentle:    { label: '温柔', kao: '(˘ ˘', f: (t, p) => {
    const u = (t - (p ? p.exprAt : 0)) % 2.2;
    return { gap: [48, 48], eyes: [{ shape: 'lid', ry: 10 }, { shape: 'lid', ry: 10 }], blush: .3, lean: 7 * Math.sin(Math.PI * clamp((u - .4) / .8, 0, 1)) };
  } },
  // a strained smile: smiling eyes under worried brows, a big drop of sweat, leaning back a little
  awkward:   { label: '尴尬', kao: '(^ ^;', f: () => ({ gap: [54, 50], eyes: [{ shape: 'up' }, { shape: 'up' }], brows: 'sad', sweat: true, lean: -3 }) },
  // trying not to laugh: smiling eyes looking a little away and down, shaking in fits every 1.6 s
  giggle:    { label: '偷笑', kao: '(^ ^)', f: (t, p) => {
    const s = t - (p ? p.exprAt : 0), u = s % 1.6;
    return { gap: [52, 52], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .35, lookAt: [2, 1.5], titter: Math.sin(Math.PI * clamp(u / .7, 0, 1)) * Math.abs(Math.sin(s * 18)) };
  } },
  // coaxing, sweet as can be: smiling eyes, cheeks all pink, a cat's ω mouth, rocking side to side, a little heart now and then
  coax:      { label: '撒娇', kao: '(^ω^)', f: t => ({ gap: [56, 56], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .85, cat: true, rock: Math.sin(t * 3), emit: 'heart', emitEvery: 1.2 }) },
  // cheeky: a wink and the tip of her tongue poked out, a little blush
  tongue:    { label: '吐舌', kao: '(^ ڡ o', f: () => ({ gap: [52, 48], eyes: [ring(), { shape: 'up' }], blush: .45, tongue: true }) },
  // happy tears: shining, brimming eyes under raised brows, a smile, two thin tracks and a tear now and then
  moved:     { label: '感动', kao: '(;▽;)', f: () => ({ gap: [54, 54], eyes: [ring({ ry: 15, dy: 1 }), ring({ ry: 15, dy: 1 })], brows: 'sad', sparkle: true, blush: .6, streams: { a: .5, len: .5, w: .6 }, emit: 'tear', emitEvery: 1.5 }) },
  // turned to stone (我裂开了): a shocked stare, then frozen still and greying, a crack running down her with a
  // shudder, and the colour flowing back before the face ends (timed by exprAt / exprUntil)
  petrify:   { label: '石化', kao: '(° °|||', f: (t, p) => {
    const s = t - (p ? p.exprAt : 0), left = p ? p.exprUntil - t : 9, crack = smooth(clamp((s - 1.1) / .4, 0, 1));
    return {
      gap: [40, 40], eyes: [ring({ rx: 17, ry: 18 }), ring({ rx: 17, ry: 18 })], wide: true, gloom: true,
      stone: smooth(clamp((s - .15) / .35, 0, 1)) * smooth(clamp(left / .5, 0, 1)), freeze: s > .3 && left > .6, crack: crack * smooth(clamp(left / .5, 0, 1)),
      shake: s > 1.1 && s < 1.35 ? 1.6 : 0,
    };
  } },
  // motions' own faces (not ones to ask for): wide, alert eyes held ahead for a peek
  peeking:   { label: '探头', f: () => ({ gap: [44, 44], eyes: [ring({ rx: 17, ry: 18 }), ring({ rx: 17, ry: 18 })], lookAt: [5, -1] }) },
  // ...a sip: eyes half shut over the cup, shut for the sip itself (1.4–2.3 s in), a little warm blush
  sipping:   { label: '喝茶', f: (t, p) => { const s = t - (p ? p.exprAt : 0), r = s > 1.4 && s < 2.3 ? 0 : 10; return { gap: [46, 46], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }], blush: .3 }; } },
  // ...a sigh (the `sigh` pulse's own beats): eyes up a little drawing breath, then drooping half shut as it goes out,
  // the mouth open for the "ha"; once the sigh is over (or cut short) a plain face
  sighing:   { label: '叹气', f: (t, p) => {
    const g = p?.pulse?.kind === 'sigh' ? p.pulse : null, k = g ? (t - g.t0) / g.dur : 1;
    if (!g || k >= 1) return { gap: [50, 50], eyes: [ring(), ring()] };
    if (k < .35) return { gap: [50, 50], eyes: [ring({ ry: 17 }), ring({ ry: 17 })], lookAt: [0, -2] };
    const r = 14 - 8 * smooth(clamp((k - .35) / .25, 0, 1));
    return { gap: [46, 46], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }], brows: 'sad', lookAt: [0, 2], puff: Math.sin(Math.PI * clamp((k - .38) / .4, 0, 1)) };
  } },
  // ...singing (the `song` pulse): eyes shut and smiling, chin up, the mouth opening on the beat
  singing:   { label: '唱歌', f: (t, p) => {
    const g = p?.pulse?.kind === 'song' ? p.pulse : null, s = g ? t - g.t0 : 0;
    return { gap: [54, 54], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .35, lookAt: [1, -3], sing: g ? Math.max(0, Math.sin(s * Math.PI * 1.25)) ** 1.5 : 0 };
  } },
  // ...a salute: a serious look while the hand is up, a wink as it comes down
  saluting:  { label: '敬礼', f: (t, p) => {
    const g = p?.pulse?.kind === 'salute' ? p.pulse : null, k = g ? (t - g.t0) / g.dur : 1;
    return k < .8 ? { gap: [46, 46], eyes: [ring({ ry: 14 }), ring({ ry: 14 })], brows: 'angry', lookAt: [2, 0] } : { gap: [56, 52], eyes: [ring(), { shape: 'up' }] };
  } },
  // ...pointing ahead: alert eyes on what she points at; a big stretch: eyes squeezed shut, mouth open in a yawn
  pointing:  { label: '指', f: () => ({ gap: [46, 46], eyes: [ring({ rx: 17, ry: 17 }), ring({ rx: 17, ry: 17 })], lookAt: [5.5, 0] }) },
  stretching: { label: '伸懒腰', f: () => ({ gap: [64, 64], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }] }) },
  // ...pleading with hands pressed together: big shining eyes looking up at you
  pleading:  { label: '拜托', f: () => ({ gap: [44, 44], eyes: [ring({ rx: 17, ry: 18 }), ring({ rx: 17, ry: 18 })], sparkle: true, blush: .4, lookAt: [0, -2] }) },
  // ...reading: eyes down on the page, running along a line and back to the start of the next
  reading:   { label: '看书', f: t => ({ gap: [48, 48], eyes: [{ shape: 'lid', ry: 11 }, { shape: 'lid', ry: 11 }], lookAt: [-3.5 + 7 * ((t * .55) % 1), 3.5] }) },
};
/** The faces and motions a plus body adds to the kit's words. `lie` and `kneel` last until something else happens. */
export const PLUS_EXPRESSIONS = ['disgusted', 'nervous', 'gentle', 'awkward', 'giggle', 'moved', 'petrify', 'coax', 'tongue'];
export const PLUS_MOTIONS = ['lie', 'flinch', 'peek', 'cheer', 'heart', 'away', 'roll', 'sip', 'read', 'spout', 'sigh',
  'pray', 'scratch', 'idea', 'hips', 'hug', 'song', 'serve', 'salute', 'vsign', 'point', 'cover', 'cross', 'stretch', 'curtsy', 'kneel'];
/** The tones of the plus faces, filed as face sounds like the kit's. */
const PLUS_FACE_TONES = {
  disgusted: 'hmm', nervous: 'hmm', gentle: 'soft', awkward: 'wry', giggle: 'hehe', moved: 'soft', petrify: 'surprised', coax: 'shy', tongue: 'wink',
};
/** A forward roll (`roll`) turns once, eased, over this part of the gesture; the body travels the same way. */
export const rollTurn = k => smooth(clamp((k - .2) / .6, 0, 1));
// how far one roll goes, in logo units: once round a ball of radius 100 (Coo's ring is 102 to its outer edge)
export const ROLL_D = 2 * Math.PI * 100;
/** Modes resting on the floor, seated or lying: the body gets up (`wake`) before it does anything else. */
const REST = new Set(['sit', 'sleep', 'lie']);
/** Small idle movements while lying, as short gestures (kind → seconds): a kick of the feet, the chin dipped, a tail thump. */
const FIDGETS = { kick: 1.2, chin: 1.6, thump: .5 };
/** Lying, the raised foot kicks slowly, by face [size, pace]: livelier when happy, quick when angry, hardly when sad, still asleep. */
const KICK = { happy: [1.6, 1.6], love: [1.6, 1.6], excited: [1.6, 1.8], angry: [1, 2.6], sad: [.3, .7], cry: [.3, .7], sleep: [0, 1] };
/**
 * Circles [x, y, r] covering the ellipse [cx, cy, rx, ry] (a lying body's hit area) with little to spare: the
 * circles inside it along its long axis, out to the ends' curvature circles, grown a little to close the gaps.
 */
function ellipseCircles([cx, cy, rx, ry], n = 7, grow = 1.015) {
  const along = rx >= ry, a = Math.max(rx, ry), b = Math.min(rx, ry), c = a - b * b / a, out = [];
  for (let i = 0; i < n; i++) {
    const u = -c + 2 * c * i / (n - 1);
    const r = (c > 0 ? b * Math.sqrt(Math.max(0, 1 - u * u / (a * a - b * b))) : b) * grow;
    out.push(along ? [cx + u, cy, r] : [cx, cy + u, r]);
  }
  return out;
}

/* ---------- the live pet: simulation, rendering, pointer ---------- */
/**
 * `els`: { petG, shadowEl, fxG }, SVG elements the body draws into (the shadow is an ellipse).
 * `opts.bounds()` returns { W, H, floorY, S } in stage pixels.
 * `opts.onEvent(kind, detail)` reports what happened to the body: arrived, interrupted, touch, mode, done.
 * `opts.sfx.play(name, kind, ...args)` asks for a sound (web/sound.js names them); an `sfx` without `play`
 * is called by name instead (`sfx.jump()`), for pages that record the calls.
 * `opts.enter: 'drop'` starts the pet above the top edge, falling to the floor.
 * `opts.words` are the pack's own words, beyond the kit's (KIT_EXPRESSIONS, KIT_MOTIONS):
 *   `{ id: { expression: { like, seconds?, sound? } } }` holds a face that takes its eyes and marks from the kit's
 *   face `like` (the figure gets the word as `frame.face` and may draw it its own way);
 *   `{ id: { motion: { seconds, face?, sound? } } }` is a gesture the figure draws from `frame.gesture`.
 * `opts.figure` draws the body: `figure.draw(petG, face, frame)` keeps its own elements inside `petG` (logo space,
 * feet at y=256). Its frame adds the face's name, the mode, how long the mode has run, the talk level,
 * drowsiness and how far the body sits.
 * `figure.groupTilt(mode, tilt, lean)`, if present, returns the rotation (degrees) the whole group gets
 * instead of tilt + lean; the frame carries tilt, lean and that rotation (groupRot) so the figure can bend the rest.
 * `figure.colors.z`, if present, colours the sleep z's (otherwise they take the `eye` class).
 * `figure.gestures`, if present, names the short gestures (nod, shake) the figure draws itself: the body then
 * leaves them out, and the frame's `gesture` ({ kind, k: 0..1 }, or null) says which one is playing and how far.
 * `figure.anchors`, `figure.extent` ([x0, y0, x1, y1]) and `figure.hits` ([[x, y, r]]) are in logo units; each
 * is read every frame, so a getter may follow the skin. `figure.setSkin(skin)` hears each skin change.
 * The frame also has `talkShape` (0..3, the mouth's shape for the character being spoken), and `lie`, `prone`,
 * `kneel`, `away`, which stay 0 / false without `opts.plus`.
 *
 * `opts.plus` adds PLUS_EXPRESSIONS and PLUS_MOTIONS (after the kit's words and the pack's own, so a pack's word of the
 * same name wins), PLUS_FACES (standing in for the kit's shy and sad), lying down in free roaming, glints on a happy or
 * smug face. Its frame fields: `lie` (0..1) is how far the body lies on its front (always over a full sit, so a figure
 * that cannot lie just stays seated), `prone` says the rest it is in (lying, or a sleep begun lying, until it is up) is a
 * lying one, `kneel` that its sit is a kneel, `away` (0..1) how far its back is turned. While lying, the fidgets kick,
 * chin and thump come as gestures; the body itself does nothing with them but kick the legs. What a figure may declare
 * for a plus body:
 * - `anchors.lie`: the anchors again for the lying pose (gaze, tear, z, hearts, bubble, glints, spout), plus `hit`
 *   ([cx, cy, rx, ry], the lying body's hit ellipse) and `halfW` (its half width), in logo units with the hips' sink in;
 *   a figure without it stays seated where it would lie.
 * - `anchors.tears` (one tear start under each eye), `anchors.glints` ([[x, y]…], where glints flash; otherwise beside
 *   the bubble's spot), `anchors.spout` (where a spout leaves the head; otherwise under the bubble's spot),
 *   `anchors.bulb` (where an idea's bulb lights; otherwise beside the bubble's spot), `anchors.kneelRaise` (how much
 *   higher the head sits kneeling than seated).
 * - `poses`: `{ lie, back }`; `poses.lie === false` says the lying pose cannot show right now; `poses.back === true`
 *   says the figure draws its own back view: turning round, the group is then never squeezed below 85% of its width
 *   (it flips at the middle) and the figure shows the turn from the frame's `facing` (-1..1).
 * - `away: 'hide'`: the figure has no back to show and hides its face by the frame's `away` instead, while the body
 *   does the turn's squash and lean; a figure without it (and without `away` in `gestures`) looks the other way.
 * - `roll: 'spin'`: the whole group turns over about the middle of the ring for a roll, the feet tucked in; a figure
 *   without it (and without `roll` in `gestures`) hops along. A roll's `gesture` also has `travel`: how far it carries
 *   her in all (logo units, + the way she faces), short of ROLL_D near a screen edge, so a ball drawn rolling turns
 *   only that far (a pack in a kit without it assumes ROLL_D); the spin turns once all the same, off the floor for the rest.
 * - `squashFaces: true`: the faces' `sag` and `titter` squash the whole group.
 * - `liePoint(x, y, lie)`: where a standing point is in the lying drawing, for a figure that lies by turning its standing
 *   one (the bubble's spot and the box's top follow it).
 */
export function createPet(els, opts) {
  const { petG, shadowEl, fxG } = els;
  let custom = opts.figure;
  const plus = !!opts.plus;
  const sfx = opts.sfx;
  const play = (name, kind, ...args) => (sfx.play ? sfx.play(name, kind, ...args) : sfx[name]?.(...args));
  const onEvent = opts.onEvent || (() => {});
  const words = opts.words || {};
  let W = 0, H = 0, floorY = 0, S = .42, T = 0;
  let roam = opts.roam ?? 'free';
  let skin = opts.skin || null;
  let hold = 0; // until T: an order from outside is in progress, free roaming waits
  const pet = {
    x: 260, fy: 0, vx: 0, vy: 0, facing: 1, faceVis: 1, mode: 'idle', modeT: 0, dur: 0, target: 0,
    speed: 0, stride: 0, lift: 0, bob: 0, phase: 0, lastHalf: 0, lean: 0, tilt: 0, tiltV: 0,
    sq: 0, sqv: 0, sitK: 0, stretch: 0, low: 0, gap: [50, 50], look: [0, 0], drowse: 0,
    feet: STAND.map(l => [l[2], l[3]]), blinkT: 1.5, blinkAge: 9, expr: null, exprUntil: 0,
    nextAt: 1.2, emitAt: 0, airKind: 'jump', turned: false, startle: false, lastAct: '',
    turnAcc: 0, dx: 0, dy: 0, jumpV: 700, jumpVx: 0, xf: null, blushK: 0,
    eyeSig: '', eyeCur: null, eyePrev: null, eyeDims: [[16, 16, 0, 0], [16, 16, 0, 0]], swapAge: 9,
    glance: [0, 0], glanceAt: 0, swing: 0, swingV: 0, prevA: null, velX: 0, talkK: 0, sfxAt: 0, skid: false, cue: 0,
    pulse: null, walkId: 0, walkWord: null, listening: false, thinking: false, placed: false, noteAt: 0, tearN: 0,
    cursor: '',
    // when the held face began and whether a motion holds it; the mouth's shape; lying, kneeling, fidgets, the back turned
    talkShape: 0, exprAt: 0, exprOwn: false, kneel: false, lieK: 0, prone: false, fidgetAt: 0, kickPh: 0,
    backK: 0, awayK: 0, breathK: 1, chipFor: null,
  };
  const pointer = { x: -1e4, y: -1e4, inside: false, vx: 0, samples: [] };
  let press = null, strokeAcc = 0, petCool = 0;
  const P = [];
  const anchors = () => ({ ...ANCHORS, ...custom?.anchors });
  let A = anchors();
  // a plus body's faces stand in for the kit's of the same name and come after the pack's own words
  const faceDef = (n) => {
    if (!plus) return FACES[n] ?? FACES[words[n]?.expression?.like] ?? FACES.neutral;
    const like = words[n]?.expression?.like;
    return (FACES[n] ? PLUS_FACES[n] ?? FACES[n] : null) ?? (like ? PLUS_FACES[like] ?? FACES[like] : null) ?? PLUS_FACES[n] ?? FACES.neutral;
  };
  /** Whether the gesture playing is the plus body's own `kind` (not a pack word's of the same name). */
  const ours = kind => plus && pet.pulse?.kind === kind && !pet.pulse.pack;

  /** The lying points (plus), while the figure can show the pose. */
  const lieSet = () => (!plus || (custom?.poses && !custom.poses.lie) ? null : A.lie);
  /** How far the body lies, for where it is: 0 for a figure that has no lying points (it stays seated). */
  const proneK = () => (lieSet() ? pet.lieK : 0);
  const lerpPt = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  /** How far the head's points sink: with the hips, less while kneeling if the figure says its kneeling head sits higher. */
  const headLow = () => pet.low - (pet.kneel ? (A.kneelRaise || 0) * pet.sitK : 0);
  /** Anchor `k` blended into its lying point; upright it sinks with the hips by `low`. */
  const ancPt = (k, low = headLow()) => {
    const up = [A[k][0], A[k][1] + low], lp = lieSet()?.[k];
    return lp ? lerpPt(up, lp, pet.lieK) : up;
  };
  /** Hip `i` in logo units, between standing and lying, sunk with the body. */
  const hip = i => { const h = lerpPt(HIPS[i], LIE_HIPS[i], proneK()); return [h[0], h[1] + pet.low]; };
  /** Half the body's width in logo units, `k` of the way to lying (where it lies now unless given). */
  const halfW = (k = proneK()) => lerp(104, lieSet()?.halfW ?? 104, k);
  // the stage x range the body fits in; minX(0), maxX(0) for where it will stand
  const minX = k => halfW(k) * S + 8, maxX = k => W - halfW(k) * S - 8;

  function resize() {
    const b = opts.bounds();
    W = b.W; H = b.H; floorY = b.floorY; S = b.S;
    if (!pet.placed && W > 0) {
      pet.x = opts.startX != null ? opts.startX : W * .7; pet.placed = true;
      if (opts.enter === 'drop') { pet.fy = -8; pet.vy = 0; pet.vx = 0; pet.airKind = 'drop'; setMode('air'); }
    }
    pet.x = clamp(pet.x, minX(), maxX());
    pet.target = clamp(pet.target, minX(), maxX());
    if (pet.mode !== 'air' && pet.mode !== 'drag') pet.fy = floorY;
  }

  function toStage(lx, ly) {
    const c = pet.xf;
    if (!c) return { x: pet.x, y: floorY };
    const x = (lx - c.ax) * c.kx, y = (ly - c.ay) * c.ky, r = c.rot * Math.PI / 180;
    return { x: c.AX + x * Math.cos(r) - y * Math.sin(r), y: c.AY + x * Math.sin(r) + y * Math.cos(r) };
  }
  /** The hit circles in stage pixels (lying, ones covering the lying hit ellipse). */
  function hits() {
    const hit = lieSet()?.hit;
    const cs = hit && proneK() > .5 ? ellipseCircles(hit) : custom?.hits ?? HITS;
    return cs.map(([x, y, r]) => ({ ...toStage(x, y), r: r * S }));
  }
  function hitPet(p) {
    const hit = lieSet()?.hit;
    if (hit && proneK() > .5) {
      const c = toStage(hit[0], hit[1]);
      return ((p.x - c.x) / (hit[2] * S)) ** 2 + ((p.y - c.y) / (hit[3] * S)) ** 2 < 1;
    }
    return hits().some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
  }

  function setMode(m, o = {}) {
    const prev = pet.mode;
    // an arrival clears walkId before going idle, so anything else that ends a walk (a turn, a bow, listening) cuts it short
    if ((prev === 'walk' || prev === 'run') && pet.walkId) {
      onEvent('interrupted', { walkId: pet.walkId, x: Math.round(pet.x), by: m });
      pet.walkId = 0;
    }
    // a walk or run asked for as a word is done once the body stops going, whatever stopped it
    if ((prev === 'walk' || prev === 'run') && pet.walkWord && m !== prev) { onEvent('done', { word: pet.walkWord }); pet.walkWord = null; }
    if (plus) {
      // a flinch's step back is over once anything but standing takes over (a walk, a drag, a fall)
      if (ours('flinch') && m !== 'idle') pet.pulse.dx = 0;
      // ...and a roll is over (picked up mid-roll, say); a song ends once she does anything but stand or sit
      if (ours('roll') && m !== 'idle') pet.pulse = null;
      if (ours('song') && m !== 'idle' && m !== 'sit') endSong();
      // a back turned in a huff lasts through standing and sitting about; anything else turns her round again
      if (ours('away') && m !== 'idle' && m !== 'sit' && m !== 'sleep') pet.pulse = null;
      // kneeling is a way of sitting: anything but sitting ends it
      if (m !== 'sit') pet.kneel = false;
    }
    pet.mode = m; pet.modeT = 0; pet.turned = false; pet.startle = false; pet.skid = false; pet.cue = 0;
    if (plus) {
      // a lying rest stays lying through its sleep and the getting up; anything else ends it
      // ...and getting up goes back through lying only if she got that far down
      if ((!REST.has(m) && m !== 'wake') || (m === 'wake' && pet.lieK < .5)) pet.prone = false;
      // a lying fidget is over once she is not lying
      if (FIDGETS[pet.pulse?.kind] && !pet.pulse.pack && m !== 'lie') pet.pulse = null;
    }
    Object.assign(pet, o);
    if (prev !== m) onEvent('mode', { mode: m });
  }
  // (with plus a roll is under way too: the next order waits for her to be up again)
  const busy = () => pet.mode === 'drag' || pet.mode === 'air' || pet.mode === 'crouch' || ours('roll');
  function pickTarget(minDist) {
    for (let i = 0; i < 12; i++) {
      const x = rnd(minX(0), maxX(0));
      if (Math.abs(x - pet.x) > minDist) return x;
    }
    return pet.x - minX(0) > maxX(0) - pet.x ? minX(0) : maxX(0);
  }

  /** Runs a motion. Returns false when the body cannot take it now (in the air, being dragged). */
  function act(a) {
    if (busy()) return false;
    // a word the pack has of its own (not one of the kit's motions)
    const own = KIT_MOTIONS.includes(a) ? null : words[a]?.motion;
    // (a song needs her standing or sitting, awake and not being talked to)
    if (plus && a === 'song' && !own && (pet.listening || (pet.mode !== 'idle' && pet.mode !== 'sit'))) return false;
    // (an asked-for expression still showing, not a motion's own face: hands on hips keeps it)
    const prevExpr = pet.exprOwn ? null : pet.expr, prevUntil = pet.exprUntil;
    // kneeling lasts until the next motion: any other one (even one done seated) ends it, back to plain sitting
    if (plus && (a !== 'kneel' || own)) pet.kneel = false;
    pet.expr = null; pet.lastAct = a;
    const seated = REST.has(pet.mode);
    switch (a) {
      case 'stand': setMode(seated ? 'wake' : 'idle', seated ? { startle: false } : {}); pet.nextAt = T + 3; break;
      case 'walk': setMode('walk', { target: pickTarget(160) }); break;
      case 'run': setMode('run', { target: pet.x < W / 2 ? maxX(0) - rnd(0, 30) : minX(0) + rnd(0, 30) }); break;
      case 'jump': setMode('crouch', { jumpV: 720, jumpVx: pet.facing * 40 }); break;
      case 'hop': setMode('crouch', { jumpV: 480, jumpVx: 0 }); break;
      case 'look': setMode('look'); break;
      case 'turn': if (!seated) setMode('idle'); pet.facing *= -1; play('tick', 'move'); break;
      case 'nod': pulse('nod', .7); play('nod', 'move'); break;
      case 'shake': pulse('shake', .7); play('shake', 'move'); break;
      case 'spin': if (!seated) setMode('idle'); pulse('spin', .6); play('spin', 'move'); break;
      case 'sit': pet.prone = false; setMode('sit', { dur: 1e9, kneel: false }); break;
      // (plus) asked to sleep while lying, she sleeps lying down
      case 'sleep': pet.prone = plus && (pet.mode === 'lie' || (pet.mode === 'sleep' && pet.prone)); setMode('sleep', { dur: 1e9 }); break;
      case 'dizzy': setMode('dizzy'); break;
      case 'wave': pulse('wave', 1.6); holdFace('happy', 1.8); break;
      case 'bow': if (!seated) setMode('idle'); pulse('bow', 1.6); holdFace('bowing', 1.5); play('tick', 'move'); break;
      case 'shiver': pulse('shiver', 1.8); play('shiver', 'move'); break;
      case 'flap': setMode('crouch', { jumpV: 540, jumpVx: 0 }); pulse('flap', 1.4); holdFace('happy', 1.6); play('chirps', 'move'); break;
      case 'dance': setMode('dance', { dur: 3.2 }); holdFace('happy', 3.4); play('dance', 'move'); break;
      default: {
        // a gesture of the pack's own, drawn by its figure from frame.gesture
        if (own) {
          if (!seated) setMode('idle');
          pulse(a, own.seconds, true);
          if (own.face) holdFace(own.face, own.seconds);
          if (own.sound) play(own.sound, 'move');
        } else if (!plus || !plusAct(a, seated, prevExpr, prevUntil)) return false;
      }
    }
    return true;
  }
  /** Whether `n`, an asked-for face still showing, is one hands on hips or folded arms keep (not stone). */
  const keepsFace = n => n !== 'petrify' && (KIT_EXPRESSIONS.includes(n) || PLUS_EXPRESSIONS.includes(n) || !!words[n]?.expression);
  /** The plus body's own motions (act() has cleared the held face). Returns false for a word it does not know. */
  function plusAct(a, seated, prevExpr, prevUntil) {
    switch (a) {
      // kneeling politely (seiza): a sit to the body, which a figure with its own drawing of it shows instead (Coo just sits)
      case 'kneel': pet.prone = false; setMode('sit', { dur: 1e9, kneel: true }); play('tick', 'move'); break;
      case 'lie': pet.prone = true; setMode('lie', { dur: 1e9, fidgetAt: T + rnd(4, 8) }); break;
      // hands made into a heart for a figure that has hands; hearts float up from the love face either way
      case 'heart': pulse('heart', 2.2); holdFace('love', 2.4); play('love', 'face'); break;
      // a hooray: a little hop (none while seated), arms up for a figure that has them, a couple of glints
      case 'cheer': if (!seated) setMode('crouch', { jumpV: 420, jumpVx: 0 }); pulse('cheer', 1.8); holdFace('happy', 2); emitGlint(2); play('chirps', 'move'); break;
      case 'flinch': {
        // a startled step back (less near the screen edge, none while seated) and back to normal
        if (!seated) setMode('idle');
        const room = pet.facing > 0 ? pet.x - minX() : maxX() - pet.x;
        pulse('flinch', .9);
        Object.assign(pet.pulse, { x0: pet.x, dx: seated || room < 4 ? 0 : -pet.facing * Math.min(room, 30 * S) });
        holdFace('surprised', 1.1); play('flinch', 'move'); break;
      }
      case 'peek':
        // lean in and look ahead; first turn to the pointer if it is behind
        if (!seated) setMode('idle');
        if (pointer.inside && (pointer.x - pet.x) * pet.facing < -40) pet.facing *= -1;
        pulse('peek', 2.4); holdFace('peeking', 2.4); play('peek', 'move'); break;
      // back turned in a huff for a while, then round again (Coo hides her face, a figure with a back view shows it,
      // any other figure looks the other way); lying on her front, only the pout
      case 'away':
        if (pet.prone && lieSet() && pet.mode !== 'wake') { holdFace('pout', 3.2); play('away', 'move'); break; }
        if (!seated) setMode('idle');
        pulse('away', 3.2); holdFace('pout', 3.2); play('away', 'move'); break;
      // a forward roll along the floor and up again (from sitting or lying she gets up into it);
      // with little room ahead and more behind she turns round first
      case 'roll': {
        setMode('idle');
        // (from where she stands: step brings her on screen before the turn starts, if she was off it)
        const x0 = clamp(pet.x, minX(0), maxX(0));
        const room = d => (d > 0 ? maxX(0) - x0 : x0 - minX(0)), far = ROLL_D * S;
        if (room(pet.facing) < far && room(-pet.facing) > room(pet.facing)) pet.facing *= -1;
        pulse('roll', 1.5);
        const dx = pet.facing * clamp(room(pet.facing), 0, far);
        // how far she rolls (logo units, the way she faces), all of it on screen: the figure turns her ball that far
        Object.assign(pet.pulse, { x0, dx, travel: Math.abs(dx) / S });
        holdFace('happy', 1.9); play('roll', 'move'); break;
      }
      // a whale's song: eyes shut, swaying, rings of sound spreading out and notes rising (not while someone is talking to her)
      case 'song': pulse('song', 4); holdFace('singing', 4.1); play('song', 'move'); break;
      // a cup of tea on a tray offered to you; a crisp salute (yes ma'am); a V sign by her cheek, with a wink and a glint
      case 'serve': pulse('serve', 2.6); holdFace('gentle', 2.7); play('clink', 'move'); break;
      case 'salute': pulse('salute', 1.8); holdFace('saluting', 1.9); play('snap', 'move'); break;
      case 'vsign': pulse('vsign', 1.8); holdFace('wink', 1.9); emitGlint(1); play('cheese', 'move'); break;
      // pointing ahead where she faces; giggling behind her hand; arms folded (keeping her face, or a pout);
      // a big stretch with a yawn; a curtsy, holding out her skirt (seated, she stands up for it)
      case 'point': pulse('point', 2); holdFace('pointing', 2.1); play('tick', 'move'); break;
      case 'cover': pulse('cover', 2.4); holdFace('giggle', 2.5); play('hehe', 'face'); break;
      case 'cross': {
        pulse('cross', 2.6);
        if (prevExpr && T < prevUntil && keepsFace(prevExpr)) { pet.expr = prevExpr; pet.exprOwn = false; pet.exprUntil = Math.max(prevUntil, T + 2.7); pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6); }
        else holdFace('pout', 2.7);
        play('hips', 'move'); break;
      }
      case 'stretch': pulse('stretch', 2.6); holdFace('stretching', 2.7); play('yawn', 'face'); break;
      case 'curtsy': setMode('idle'); pulse('curtsy', 2.2); holdFace('bowing', 2); play('tick', 'move'); break;
      // hands pressed together, pleading (also thanks or sorry); a sheepish scratch at the head when praised;
      // a finger up as an idea lands, a bulb lighting over her head; open arms for a hug
      case 'pray': pulse('pray', 2.2); holdFace('pleading', 2.3); play('shy', 'face'); break;
      case 'scratch': pulse('scratch', 2.1); holdFace('happy', 2.2); play('hehe', 'face'); break;
      case 'idea': pulse('idea', 1.8); holdFace('excited', 1.9); break;
      case 'hug': pulse('hug', 2.6); holdFace('gentle', 2.7); play('soft', 'face'); break;
      // hands on hips goes with whatever face she had (cross, smug, determined), or a determined one
      // (only an asked-for expression, not a motion's own face, and it goes on from where it was, not restarted)
      case 'hips': {
        pulse('hips', 2.5);
        if (prevExpr && T < prevUntil && keepsFace(prevExpr)) { pet.expr = prevExpr; pet.exprOwn = false; pet.exprUntil = Math.max(prevUntil, T + 2.6); pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6); }
        else holdFace('determined', 2.6);
        play('hips', 'move'); break;
      }
      // a sigh: drawing a breath, then sagging as it goes out
      case 'sigh': pulse('sigh', 2); holdFace('sighing', 2.1); play('sigh', 'move'); break;
      // a whale's spout from the top of the head: a little crouch, then a column of water and its spray falling back
      case 'spout': pulse('spout', 1.6); holdFace('happy', 1.9); play('spout', 'move'); break;
      // both hands round a warm cup, a sip halfway through; a book held up to read, the eyes running along the lines
      // (a figure with hands draws them; Coo holds a little one of its own)
      case 'sip': pulse('sip', 3.6); holdFace('sipping', 3.7); play('sip', 'move'); break;
      case 'read': pulse('read', 4.4); holdFace('reading', 4.4); play('page', 'move'); break;
      default: return false;
    }
    return true;
  }
  /** Starts a short gesture (`pack`: one of the pack's own words); a plus body's song is cut short by any other one. */
  function pulse(kind, dur, pack = false) {
    if (ours('song') && (kind !== 'song' || pack)) play('stop:song', 'move');
    pet.pulse = pack ? { kind, t0: T, dur, pack } : { kind, t0: T, dur };
  }
  /** Stops a song: its rings and notes, its face, and what is left of its tune. */
  function endSong() { pet.pulse = null; if (pet.expr === 'singing') pet.expr = null; play('stop:song', 'move'); }
  /** A motion's own face, without the expression's sound and bounce (act() has just cleared any held face). */
  function holdFace(n, seconds) { pet.expr = n; pet.exprAt = T; pet.exprUntil = T + seconds; pet.exprOwn = true; pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6); }

  function setExpr(n, seconds) {
    if (n === 'sleep') { act('sleep'); return; }
    if (busy()) return;
    if (n === 'dragged') {
      pet.expr = null;
      pet.vy = -1150; pet.vx = rnd(-120, 120); pet.airKind = 'throw'; pet.sqv -= 3;
      play('whoosh', 'move'); play('jump', 'move');
      setMode('air'); return;
    }
    if (n === 'dizzy') { pet.expr = null; setMode('dizzy'); return; }
    if (pet.mode === 'look' || pet.mode === 'land') setMode('idle');
    const own = words[n]?.expression;
    if (plus && n === 'petrify' && !own) {
      // asked again while already stone, she stays as she is (starting over would flash her colour back)
      if (pet.expr === 'petrify' && T < pet.exprUntil) return;
      // turned to stone she stops where she is
      if (pet.mode === 'walk' || pet.mode === 'run' || pet.mode === 'dance') setMode('idle');
    }
    pet.expr = n; pet.exprAt = T; pet.exprUntil = T + (seconds ?? own?.seconds ?? (n === 'sleepy' ? 4.4 : 3.2)); pet.exprOwn = false;
    pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6);
    pet.sqv += n === 'surprised' ? -2.2 : .8;
    const tone = own?.sound ?? FACE_TONES[n] ?? (plus && !own ? PLUS_FACE_TONES[n] : undefined);
    if (tone) play(tone, 'face');
    if (n === 'love') for (let i = 0; i < 4; i++) emitHeart();
    if (plus && (n === 'happy' || n === 'smug')) emitGlint(n === 'happy' ? 2 : 1);
  }

  /**
   * Does a word of the body's vocabulary: one of the kit's faces or motions, or one of the pack's own
   * (`opts.words`), or with `opts.plus` one of PLUS_EXPRESSIONS / PLUS_MOTIONS. A walk or run goes to the other
   * side of the stage and reports `done` once it stops. Returns false for a word it does not know or cannot take now.
   */
  function doWord(w) {
    if (w === 'neutral') { setExpr('neutral', .1); return true; }
    if (w === 'walk' || w === 'run') {
      const x = pet.x < W / 2 ? W * (.55 + Math.random() * .35) : W * (.1 + Math.random() * .35);
      if (!walkTo(x, w === 'run', 0)) return false;
      if (pet.mode === w) pet.walkWord = w;
      else onEvent('done', { word: w });
      return true;
    }
    if (KIT_MOTIONS.includes(w) || words[w]?.motion) return act(w);
    const face = KIT_EXPRESSIONS.includes(w) || words[w]?.expression;
    if (plus && !face && PLUS_MOTIONS.includes(w)) return act(w);
    if (face || (plus && PLUS_EXPRESSIONS.includes(w))) {
      if (busy()) return false;
      setExpr(w);
      return true;
    }
    return false;
  }

  /** Walks (or runs) to stage x. Resolves the walk through onEvent('arrived' | 'interrupted'). */
  function walkTo(x, run, walkId) {
    if (busy()) return false;
    if (REST.has(pet.mode)) setMode('wake', { startle: true });
    const target = clamp(x, minX(0), maxX(0));
    pet.expr = null;
    if (Math.abs(target - pet.x) < 2) { onEvent('arrived', { walkId, x: Math.round(pet.x) }); return true; }
    setMode(run ? 'run' : 'walk', { target, walkId });
    return true;
  }

  /** Stops the walk `walkId` where the pet stands; it reports the walk 'interrupted'. A finished walk is left alone. */
  function stopWalk(walkId) {
    if ((pet.mode === 'walk' || pet.mode === 'run') && pet.walkId === walkId) setMode('idle');
  }

  function faceName() {
    const m = pet.mode;
    if (m === 'drag') return 'dragged';
    if (m === 'air' && pet.airKind === 'throw') return pet.vy < 0 ? 'dragged' : 'surprised';
    if (m === 'air' && pet.airKind === 'drop') return 'surprised';
    if (m === 'dizzy') return pet.modeT < 2.4 ? 'dizzy' : 'squeeze';
    if (m === 'wake') return pet.startle ? 'surprised' : 'waking';
    if (pet.listening && m !== 'sleep') return 'listening';
    if (m === 'sleep') return 'sleep';
    if (pet.expr && T < pet.exprUntil) return pet.expr;
    if (pet.thinking) return 'thinking';
    if (m === 'sit' || m === 'lie') return 'content';
    if (m === 'run') return 'run';
    return 'neutral';
  }

  function decide() {
    const calm = roam === 'calm';
    const opts2 = [['walk', calm ? 10 : 28], ['run', calm ? 0 : 12], ['look', 14], ['jump', calm ? 2 : 8], ['sit', 16], ...(plus ? [['lie', 8]] : []), ['expr', 12], ['wait', calm ? 30 : 10]]
      .filter(o => o[1] > 0 && (o[0] !== pet.lastAct || o[0] === 'wait'));
    let r = Math.random() * opts2.reduce((a, o) => a + o[1], 0), pick = 'wait';
    for (const o of opts2) { if ((r -= o[1]) < 0) { pick = o[0]; break; } }
    if (pick === 'look') { setMode('look'); pet.lastAct = 'look'; }
    else if (pick === 'expr') { setExpr(['happy', 'wink', 'love', 'sleepy', 'surprised', 'shy'][Math.floor(Math.random() * 6)]); pet.lastAct = 'expr'; }
    else if (pick === 'sit') { setMode('sit', { dur: rnd(6, 9), kneel: false }); pet.lastAct = 'sit'; }
    else if (pick === 'lie') { pet.prone = true; setMode('lie', { dur: rnd(6, 10), fidgetAt: T + rnd(4, 8) }); pet.lastAct = 'lie'; }
    else if (pick !== 'wait') act(pick);
    if (pet.mode === 'idle' && T >= pet.nextAt) pet.nextAt = T + rnd(2, 4);
  }

  /* particles */
  function emit(type, p, o = {}) { P.push({ type, x: p.x, y: p.y, vx: 0, vy: 0, age: 0, life: 1, ...o }); }
  function emitHeart() {
    const lh = proneK() > .5 && lieSet().hearts, h = lh || A.hearts;
    emit('heart', toStage(rnd(h[0], h[1]), h[2] + (lh ? 0 : headLow())), { vx: rnd(-20, 20), vy: rnd(-70, -45), life: 1.6 });
  }
  /** (plus) A glint or two popping by the head (a happy or smug face); never more than three at once. */
  function emitGlint(n) {
    const live = P.filter(p => p.type === 'glint').length;
    // lying, from the lying spots; a figure that names no glint spots gets them either side of its own bubble spot
    const lg = proneK() > .5 && lieSet().glints, [bx, by] = A.bubble;
    const gl = lg || A.glints || [[bx - 50, by + 25], [bx + 50, by + 25]];
    for (let i = 0; i < Math.min(n, 3 - live); i++) {
      const [x, y] = gl[Math.floor(Math.random() * gl.length)];
      emit('glint', toStage(x + rnd(-8, 8), y + rnd(-8, 8) + (lg ? 0 : headLow())), { vx: rnd(-8, 8), vy: rnd(-18, -8), life: rnd(.5, .7) });
    }
  }
  /** (plus) Where a spout leaves the head (logo units): lying, from the lying head; a figure that names no spout spot, just under its bubble spot. */
  function spoutPt() {
    const l = proneK() > .5 && lieSet();
    if (l) return l.spout || [l.bubble[0], l.bubble[1] + 30];
    const [x, y] = A.spout ?? [A.bubble[0], A.bubble[1] + 30];
    return [x, y + headLow()];
  }
  /** How tall the spout's column is (0..1) and how solid, at `k` of the gesture: it shoots up, holds, and breaks into spray. */
  const spoutCol = k => ({ h: smooth(clamp((k - .25) / .1, 0, 1)), a: 1 - smooth(clamp((k - .45) / .12, 0, 1)) });
  function dustAt(lx, n, spread) {
    for (let i = 0; i < n; i++) {
      emit('dust', toStage(lx, 250), { vx: rnd(-spread, spread) - pet.facing * rnd(10, 40), vy: rnd(-30, -8), life: rnd(.4, .65) });
    }
  }

  function step(dt) {
    T += dt; pet.modeT += dt;
    A = anchors();
    const m = pet.mode, mt = pet.modeT;
    let sqT = 0, strideT = 0, liftT = 0, leanT = 0, sitT = 0, lieT = 0, bobT = 0, rate = 0, lookT = [0, 0], tiltT = 0;
    let tk = 160, tc = 12, drowseT = 0;
    const free = roam !== 'off' && T > hold && !opts.dialogOpen?.();

    // (stone starts no new blink; one already under way finishes)
    pet.blinkAge += dt;
    if (!pet._fc?.freeze) pet.blinkT -= dt;
    if (pet.blinkT <= 0) { pet.blinkAge = 0; pet.blinkT = Math.random() < .2 ? .28 : rnd(2.2, 5.2); }

    const head = toStage(...ancPt('gaze', 0));
    const pdx = pointer.x - head.x, pdy = pointer.y - head.y, pm = Math.hypot(pdx, pdy) || 1;
    const track = () => {
      if (!pointer.inside) {
        if (T > pet.glanceAt) { pet.glance = Math.random() < .45 ? [0, 0] : [rnd(-3, 5), rnd(-3, 3)]; pet.glanceAt = T + rnd(1.2, 3); }
        return pet.glance;
      }
      const k = Math.min(1, pm / 120);
      return [pdx * pet.facing / pm * 5 * k, pdy / pm * 4 * k];
    };

    switch (m) {
      case 'idle': {
        lookT = track();
        // (not while she has her back turned on purpose, rolls, or is stone)
        if (pointer.inside && !press && !ours('away') && !ours('roll') && !pet._fc?.freeze && pdx * pet.facing < -50 && pm < 600) {
          pet.turnAcc += dt;
          if (pet.turnAcc > .9) { pet.facing *= -1; pet.turnAcc = 0; }
        } else pet.turnAcc = 0;
        if (pet.listening) { lookT = [3, -4]; tiltT = -7; leanT = -2; }
        if (free && !pet.listening && T > pet.nextAt && !(pet.expr && T < pet.exprUntil)) decide();
        break;
      }
      case 'walk': case 'run': {
        const run = m === 'run', d = pet.target - pet.x, dist = Math.abs(d), dir = Math.sign(d) || pet.facing;
        pet.facing = dir;
        const vMax = run ? 250 : 78;
        const vT = Math.min(vMax, run ? dist * 4 + 20 : dist * 3 + 14);
        strideT = run ? 17 : 10; liftT = run ? 15 : 8; bobT = run ? 7 : 3; rate = run ? 4.4 : 2.1;
        leanT = run ? (dist < 50 && pet.speed > 120 ? -6 : 11) : 4;
        if (leanT < 0 && !pet.skid) { pet.skid = true; play('skid', 'move'); }
        const ramp = Math.min(1, mt / (run ? .35 : .25));
        pet.speed = lerp(pet.speed, vT * smooth(ramp), ease(run ? 6 : 9, dt));
        pet.x += dir * Math.min(dist, pet.speed * dt);
        const k = clamp(pet.speed / vMax, 0, 1);
        strideT *= .4 + .6 * k; liftT *= .4 + .6 * k;
        pet.phase += Math.PI * 2 * rate * dt * Math.max(.35, k);
        lookT = [run ? 4 : 3, run ? 1 : 0];
        const half = Math.floor(pet.phase / Math.PI);
        if (half !== pet.lastHalf) {
          play('step', 'move', run, half & 1);
          if (run && pet.speed > 120) dustAt(128, dist < 50 ? 3 : 1, 20);
        }
        pet.lastHalf = half;
        if (dist < 1.5) {
          pet.speed = 0;
          const id = pet.walkId; pet.walkId = 0;
          setMode('idle'); pet.nextAt = T + rnd(1.2, 3.2);
          if (id) onEvent('arrived', { walkId: id, x: Math.round(pet.x) });
        }
        break;
      }
      case 'look': {
        if (!pet.cue) { pet.cue = 1; play('look', 'move'); }
        if (mt < .9) lookT = [4, -4];
        else if (mt < 1.8) { if (!pet.turned) { pet.turned = true; pet.facing *= -1; } lookT = [5, 0]; }
        else if (mt < 2.6) lookT = [1, 4];
        else { setMode('idle'); pet.nextAt = T + rnd(1, 2.5); }
        break;
      }
      case 'sit': {
        sitT = 1;
        lookT = track().map(v => v * (1 - pet.drowse));
        if (pet.listening) { lookT = [3, -4]; tiltT = -7; }
        drowseT = clamp((mt - 1.5) / Math.max(1, Math.min(pet.dur, 60) - 1.5), 0, free ? 1 : .45);
        if (pet.drowse > .5) leanT = 7 * pet.drowse * Math.pow(Math.max(0, Math.sin(T * 1.3)), 6);
        if (free && mt > pet.dur) {
          if (Math.random() < .6) setMode('sleep', { dur: rnd(8, 12) });
          else { setMode('idle'); pet.sqv -= 1.2; pet.nextAt = T + rnd(1.5, 3); }
        }
        break;
      }
      case 'lie': {
        // (plus) down through sitting (the plop) onto her front, chin on her hands; already down, she stays down
        sitT = 1;
        if (mt >= .35 || pet.lieK > .5) lieT = 1;
        if (lieT && !pet.cue) { pet.cue = 1; if (pet.lieK < .5) play('land', 'move', false); }
        lookT = track().map(v => v * (1 - pet.drowse));
        if (pet.listening) { lookT = [3, -4]; tiltT = -7; }
        drowseT = clamp((mt - 1.5) / Math.max(1, Math.min(pet.dur, 60) - 1.5), 0, free ? 1 : .45);
        // a figure that cannot lie nods off as it does sitting
        if (!lieSet() && pet.drowse > .5) leanT = 7 * pet.drowse * Math.pow(Math.max(0, Math.sin(T * 1.3)), 6);
        if (T > pet.fidgetAt) {
          pet.fidgetAt = T + rnd(4, 8);
          const kinds = Object.keys(FIDGETS), k = kinds[Math.floor(Math.random() * kinds.length)];
          if (!pet.listening && pet.talkK < .1 && !pet.pulse && Math.abs(pet.faceVis - pet.facing) < .05) pulse(k, FIDGETS[k]);
        }
        if (free && mt > pet.dur) {
          if (Math.random() < .5) setMode('sleep', { dur: rnd(8, 12) });
          else setMode('wake', { startle: false });
        }
        break;
      }
      case 'sleep': {
        sitT = 1; drowseT = 1; leanT = 5;
        // (plus) lying, she dozes flat on the floor
        if (pet.prone) { lieT = 1; if (lieSet()) leanT = 0; }
        if (free && mt > pet.dur) setMode('wake');
        break;
      }
      case 'wake': {
        if (pet.startle) {
          sitT = 0; lookT = [3, -2];
          if (mt > .9) { setMode('idle'); pet.nextAt = T + rnd(1.5, 3); }
        } else {
          // (plus) from lying: pushes up to sitting first, then stands as from a sit
          sitT = mt < 1.1 ? 1 : 0;
          if (pet.prone && mt < .45) lieT = 1;
          if (mt > .5 && !pet.cue) { pet.cue = 1; play('yawn', 'face'); }
          sqT = mt > .5 && mt < 1.3 ? -.1 : 0;
          leanT = (mt < .5 ? 5 : mt < 1.2 ? -5 : 0) * (1 - proneK());
          lookT = mt > 1.2 ? track() : [0, 0];
          if (mt > 1.8) { setMode('idle'); pet.nextAt = T + rnd(1, 2); }
        }
        break;
      }
      case 'crouch': {
        sqT = .24; sitT = .3;
        if (mt > .16) {
          pet.vy = -pet.jumpV; pet.vx = pet.jumpVx; pet.airKind = 'jump'; pet.sqv -= 2.6;
          play('jump', 'move');
          setMode('air');
        }
        break;
      }
      case 'air': {
        pet.vy += 2300 * dt;
        pet.vx *= Math.exp(-dt * .4);
        pet.x += pet.vx * dt; pet.fy += pet.vy * dt;
        if (pet.x < minX()) { pet.x = minX(); pet.vx = Math.abs(pet.vx) * .55; pet.sqv += .6; }
        if (pet.x > maxX()) { pet.x = maxX(); pet.vx = -Math.abs(pet.vx) * .55; pet.sqv += .6; }
        if (pet.fy - 250 * S < 0 && pet.vy < 0) { pet.fy = 250 * S; pet.vy = Math.abs(pet.vy) * .3; }
        sqT = -Math.min(.12, Math.abs(pet.vy) / 6000);
        tiltT = clamp(pet.vx * .025, -30, 30);
        tk = 70; tc = 8;
        if (pet.fy >= floorY && pet.vy > 0) land();
        break;
      }
      case 'land': {
        sitT = .35 * (1 - smooth(clamp(mt / .35, 0, 1)));
        lookT = [2, 2];
        if (mt > .4) setMode('idle');
        break;
      }
      case 'dizzy': {
        sitT = mt < 2.6 ? 1 : 0;
        if (mt < 2.4 && T > pet.sfxAt) { play('chirps', 'move'); pet.sfxAt = T + .9; }
        if (mt >= 2.4 && !pet.cue) { pet.cue = 1; play('shake', 'move'); }
        if (mt < 2.4) tiltT = 8 * Math.sin(T * 4.5) * Math.min(1, mt * 2);
        else if (mt < 3) { const k = (mt - 2.4) / .6; tiltT = 12 * Math.sin(mt * 34) * (1 - k); }
        else { setMode('idle'); pet.sqv -= 1; pet.nextAt = T + rnd(1.5, 3); }
        break;
      }
      case 'dance': {
        // a little two-step on the spot: the feet take turns, the body sways with them, notes float up
        strideT = 5; liftT = 10; bobT = 3;
        pet.phase += Math.PI * 2 * 1.1 * dt;
        tiltT = 7 * Math.sin(pet.phase);
        lookT = [3, -2];
        const half = Math.floor(pet.phase / Math.PI);
        if (half !== pet.lastHalf) play('step', 'move', false, half & 1);
        pet.lastHalf = half;
        if (T > pet.noteAt) { emit('note', toStage(...ancPt('z')), { vx: pet.facing * rnd(10, 30), vy: -34, life: 1.8 }); pet.noteAt = T + .6; }
        if (mt > pet.dur) { setMode('idle'); pet.nextAt = T + rnd(1.5, 3); }
        break;
      }
      case 'drag': {
        pet.dx = lerp(pet.dx, pointer.x, ease(28, dt));
        pet.dy = lerp(pet.dy, Math.min(pointer.y, floorY - 245 * S), ease(28, dt));
        tiltT = clamp(pointer.vx * .035, -40, 40); tk = 90; tc = 5;
        if (Math.abs(pointer.vx) > 500 && T > pet.sfxAt) { play('squeak', 'touch'); pet.sfxAt = T + rnd(.4, .7); }
        break;
      }
    }

    // (plus) what some gestures do whatever figure draws them:
    // a flinch's step back moves the body (setMode cancels it when another mode takes over)
    if (ours('flinch') && pet.pulse.dx && m === 'idle') {
      pet.x = clamp(pet.pulse.x0 + pet.pulse.dx * smooth(clamp((T - pet.pulse.t0) / (pet.pulse.dur * .22), 0, 1)), minX(), maxX());
    }
    // a song: someone starting to talk to her ends it; while it lasts, rings of sound spread from her and notes rise
    if (ours('song')) {
      if (pet.listening) endSong();
      else if (T > pet.noteAt) {
        const [x, y] = ancPt('gaze'), e = envelope((T - pet.pulse.t0) / pet.pulse.dur, .08, .9);
        if (e > .3) {
          emit('wave', toStage(x + 30, y), { life: 1.1, dir: Math.sign(pet.faceVis) || 1 });
          emit('note', toStage(...ancPt('z')), { vx: pet.facing * rnd(10, 30), vy: -34, life: 1.8 });
        }
        pet.noteAt = T + .55;
      }
    }
    // an idea lights a bulb over the head as the finger goes up (up beside the head, to the front, clear of the speech bubble)
    if (ours('idea') && !pet.pulse.lit && (T - pet.pulse.t0) / pet.pulse.dur > .25) {
      pet.pulse.lit = true; play('ding', 'move');
      const L = proneK() > .5 && lieSet();
      const [bx, by] = L ? [L.bubble[0] + 62, L.bubble[1] + 28] : A.bulb ? [A.bulb[0], A.bulb[1] + pet.low] : [A.bubble[0] + 62, A.bubble[1] + 28 + pet.low];
      emit('bulb', toStage(bx, by), { vy: -12, life: 1.2 });
    }
    // a spout throws spray up out of the column as it breaks (it falls back under gravity)
    if (ours('spout')) {
      const k = (T - pet.pulse.t0) / pet.pulse.dur;
      if (k > .3 && k < .55 && T >= (pet.pulse.sprayAt ?? 0)) {
        pet.pulse.sprayAt = T + 1 / 30;
        const [x, y] = spoutPt(), g = SPRAY_G * S, h = rnd(55, 95) * S;
        // fanning out to either side, so the beads fall beside her like a fountain's, not down her face
        emit('spray', toStage(x, y - 80 * spoutCol(k).h), { vx: (Math.random() < .5 ? -1 : 1) * rnd(80, 160) * S, vy: -Math.sqrt(2 * g * h) * .5, life: 1.4, r: rnd(.7, 1.2) });
      }
    }
    // a roll carries the body along the floor as it turns
    if (ours('roll') && m === 'idle') {
      pet.x = clamp(pet.pulse.x0 + pet.pulse.dx * rollTurn((T - pet.pulse.t0) / pet.pulse.dur), minX(), maxX());
    }

    // short gestures layered over whatever the body is doing
    // (a figure that lists a gesture in `figure.gestures` draws it itself, from the frame's `gesture`)
    if (pet.pulse) {
      const g = pet.pulse, k = (T - g.t0) / g.dur, own = plus && !g.pack;
      // (a back turned while lying could not be drawn: once she lies down it is over)
      if (k >= 1 || (own && g.kind === 'away' && pet.prone && lieSet())) pet.pulse = null;
      else if (custom?.gestures?.includes(g.kind)) { /* the figure's own */ }
      else if (own && g.kind === 'away' && custom?.away !== 'hide') { /* looks the other way for a while: see faceVis below */ }
      else if (g.kind === 'nod') leanT += 9 * Math.abs(Math.sin(k * Math.PI * 2));
      else if (g.kind === 'shake') tiltT += 10 * Math.sin(k * Math.PI * 6) * (1 - k);
      else if (g.kind === 'wave') tiltT += 6 * Math.sin(k * Math.PI * 6) * Math.sin(k * Math.PI);
      else if (g.kind === 'bow') leanT += 16 * envelope(k, .25, .7);
      else if (g.kind === 'flap') { tiltT += 7 * Math.sin(k * Math.PI * 8) * (1 - k); sqT -= .06 * Math.abs(Math.sin(k * Math.PI * 8)) * (1 - k); }
      else if (g.kind === 'spin' && k > .5 && !g.flipped) { g.flipped = true; pet.facing *= -1; }
      else if (g.kind === 'spin' && k < .5 && !g.first) { g.first = true; pet.facing *= -1; pet.sqv -= 1; }
      else if (own) {
        switch (g.kind) {
          case 'flinch': { const e = envelope(k, .04, .45); leanT -= 12 * e; sqT += .1 * e; break; }
          case 'peek': { const e = envelope(k, .2, .8); leanT += (10 + 1.5 * Math.sin(k * Math.PI * 6)) * e; sqT -= .07 * e; break; }
          case 'heart': { const e = envelope(k, .15, .8); leanT += 6 * e; tiltT += 4 * Math.sin(k * Math.PI * 4) * e; break; }
          case 'away': {
            // narrowing a little at each turn, and leaning away while her back is turned
            const turn = Math.sin(Math.PI * clamp(k / .25, 0, 1)) + Math.sin(Math.PI * clamp((k - .8) / .2, 0, 1));
            sqT -= .12 * turn; leanT -= 5 * envelope(k, .25, .8); break;
          }
          case 'cheer': { const e = envelope(k, .1, .75); sqT -= .08 * e; tiltT += 5 * Math.sin(k * Math.PI * 6) * e; break; }
          // crouching into the roll, curled up through it (see render), springing up out of it
          case 'roll': sqT += .22 * Math.sin(Math.PI * clamp(k / .22, 0, 1)) - .12 * Math.sin(Math.PI * clamp((k - .8) / .2, 0, 1)); break;
          case 'sip': { const e = envelope(k, .1, .9); leanT += 3 * e + 4 * envelope(clamp((k - .38) / .26, 0, 1), .3, .6); break; }
          case 'read': leanT += 4 * envelope(k, .1, .9); break;
          // a breath drawn in (taller), then let out (sagging, leaning in)
          case 'sigh': {
            const inh = envelope(clamp(k / .45, 0, 1), .5, .7), exh = envelope(clamp((k - .35) / .6, 0, 1), .3, .7);
            sqT += -.05 * inh + .07 * exh; leanT += 6 * exh; break;
          }
          // pleading bows twice; a scratch tips the head; an idea pops up; hands on hips leans back, chest out; a hug leans in
          case 'pray': leanT += 5 * envelope(k, .15, .85) * (.6 + .4 * Math.sin(k * Math.PI * 4)); break;
          case 'scratch': tiltT += 6 * envelope(k, .15, .85); break;
          case 'idea': sqT -= .1 * Math.sin(Math.PI * clamp((k - .2) / .2, 0, 1)); break;
          case 'hips': leanT -= 4 * envelope(k, .1, .85); break;
          case 'hug': leanT += 5 * envelope(k, .15, .85); break;
          // pointing leans toward it; a hidden giggle bobs; arms folded leans back; a stretch rises tall; a curtsy sinks
          case 'point': leanT += 4 * envelope(k, .15, .85); break;
          case 'cover': sqT += .04 * Math.abs(Math.sin(k * Math.PI * 10)) * envelope(k, .1, .85); break;
          case 'cross': leanT -= 3 * envelope(k, .1, .85); break;
          case 'stretch': sqT -= .08 * envelope(k, .2, .8); break;
          case 'curtsy': { const d = Math.sin(Math.PI * clamp((k - .15) / .7, 0, 1)); sqT += .1 * d; leanT += 6 * d; break; }
          // offering leans in toward you; a salute straightens up with a little hop of pride; a V sign tips the head
          case 'serve': leanT += 6 * envelope(k, .2, .85); break;
          case 'salute': sqT -= .08 * Math.sin(Math.PI * clamp(k / .15, 0, 1)); leanT -= 3 * envelope(k, .05, .85); break;
          case 'vsign': tiltT -= 6 * envelope(k, .15, .85); break;
          // singing sways gently on the beat, a little back with the chin up
          case 'song': { const e = envelope(k, .08, .9); tiltT += 4 * Math.sin(k * 4 * Math.PI * 1.25) * e; leanT -= 2 * e; break; }
          // crouching to gather a spout, springing up as it goes
          case 'spout': sqT += .16 * Math.sin(Math.PI * clamp(k / .25, 0, 1)) - .1 * Math.sin(Math.PI * clamp((k - .25) / .15, 0, 1)); break;
        }
      }
    }

    const fname = faceName(), fc = faceDef(fname).f(T, pet);
    if (fc.freeze) lookT = [...pet.look];
    else if (fc.lookLock || pet.mode === 'sleep' || pet.mode === 'drag') lookT = [0, 0];
    else if (fc.lookAt) lookT = fc.lookAt;
    if (plus) {
      if (fc.lean && (m === 'idle' || m === 'sit' || (m === 'lie' && !lieSet()))) leanT += fc.lean;
      if (fc.sag && custom?.squashFaces) sqT += fc.sag;
      // coaxing rocks the whole body from side to side (a figure that bends its own parts takes it as tilt, like a dance's sway)
      if (fc.rock && (m === 'idle' || m === 'sit')) tiltT += 6 * fc.rock;
      // a fit of giggles bobs a figure that squashes for faces (another shakes its own shoulders from the face's `titter`)
      if (fc.titter && custom?.squashFaces) sqT += .05 * fc.titter;
    }

    // eye shape changes hide under a quick blink; same-shape changes (ring size) ease
    const sig = fc.eyes.map(e => e.shape).join();
    if (sig !== pet.eyeSig) {
      if (pet.eyeCur) { pet.eyePrev = pet.eyeCur; pet.swapAge = 0; }
      pet.eyeSig = sig;
      fc.eyes.forEach((e, i) => { pet.eyeDims[i] = [e.rx ?? 16, e.ry ?? 16, e.dx || 0, e.dy || 0]; });
    }
    pet.swapAge += dt;
    pet.eyeCur = fc.eyes.map((e, i) => {
      if (e.shape !== 'ring' && e.shape !== 'lid') return e;
      const d = pet.eyeDims[i], tgt = [e.rx ?? 16, e.ry ?? 16, e.dx || 0, e.dy || 0];
      for (let j = 0; j < 4; j++) d[j] = lerp(d[j], tgt[j], ease(16, dt));
      return { ...e, rx: d[0], ry: d[1], dx: d[2], dy: d[3] };
    });
    pet.blushK = lerp(pet.blushK, fc.blush || 0, ease(6, dt));
    // breathing stops (and starts again) smoothly around being turned to stone
    pet.breathK = lerp(pet.breathK, fc.freeze ? 0 : 1, ease(8, dt));

    // springs & easing
    pet.sqv += ((sqT - pet.sq) * 280 - pet.sqv * 14) * dt;
    pet.sq = clamp(pet.sq + pet.sqv * dt, -.35, .45);
    pet.tiltV += ((tiltT - pet.tilt) * tk - pet.tiltV * tc) * dt;
    pet.tilt += pet.tiltV * dt;
    pet.lean = lerp(pet.lean, leanT, ease(7, dt));
    pet.sitK = lerp(pet.sitK, sitT, ease(m === 'land' ? 18 : 6, dt));
    // getting up from lying is quick once anything moves her (no sliding along while still flat)
    pet.lieK = lerp(pet.lieK, lieT, ease(lieT > pet.lieK ? 6 : REST.has(m) || m === 'wake' ? 7 : 16, dt));
    // on the floor, the body keeps clear of the screen edge as it widens (lying down, or a figure swapped in that lies)
    if (plus && (REST.has(m) || m === 'wake')) pet.x = clamp(pet.x, minX(), maxX());
    pet.drowse = lerp(pet.drowse, drowseT, ease(REST.has(m) ? 1.5 : 6, dt));
    pet.stretch = lerp(pet.stretch, m === 'drag' ? 1 : 0, ease(8, dt));
    pet.stride = lerp(pet.stride, strideT, ease(10, dt));
    pet.lift = lerp(pet.lift, liftT, ease(10, dt));
    pet.bob = lerp(pet.bob, bobT, ease(10, dt));
    pet.look[0] = lerp(pet.look[0], lookT[0], ease(9, dt));
    pet.look[1] = lerp(pet.look[1], lookT[1], ease(9, dt));
    pet.gap[0] = lerp(pet.gap[0], fc.gap[0], ease(8, dt));
    pet.gap[1] = lerp(pet.gap[1], fc.gap[1], ease(8, dt));
    // turning reads as a quick card flip rather than a mirror snap
    // (with plus, a figure that neither draws a back turned of its own nor hides its face turns away by looking the
    // other way for a while; only the drawing turns, so whatever ends the gesture early brings it round again)
    const ak = ours('away') && custom?.away !== 'hide' && !custom?.gestures?.includes('away') ? (T - pet.pulse.t0) / pet.pulse.dur : -1;
    pet.faceVis = lerp(pet.faceVis, ak > .05 && ak < .85 ? -pet.facing : pet.facing, ease(15, dt));
    // how far the back is turned: the gesture's own turns, or turning round over .3 s once it is dropped early
    const awayT = ours('away') ? envelope((T - pet.pulse.t0) / pet.pulse.dur, .25, .8) : 0;
    pet.awayK = ours('away') && T - pet.pulse.t0 > pet.pulse.dur / 2 ? awayT : Math.max(awayT, pet.awayK - dt / .3);
    // a figure's back view coming or going mid-turn (sitting down, a scheme fading) eases the width floor in or out
    const backT = plus && custom?.poses?.back === true ? 1 : 0;
    pet.backK = Math.abs(pet.faceVis - pet.facing) < .05 ? backT : lerp(pet.backK, backT, ease(6, dt));
    if (m !== 'walk' && m !== 'run' && m !== 'dance') pet.phase = lerp(pet.phase, Math.round(pet.phase / Math.PI) * Math.PI, ease(6, dt));
    pointer.vx *= Math.exp(-dt * 6);

    // secondary motion for ears/antenna/scarf: lags behind horizontal movement
    const AX = pet.mode === 'drag' ? pet.dx : pet.x;
    if (pet.prevA != null) pet.velX = lerp(pet.velX, (AX - pet.prevA) / dt, .25);
    pet.prevA = AX;
    // dancing stays put but rocks: the rock swings what hangs off the body (ears, hair, skirt), as moving does
    const swingT = clamp(-(pet.velX * .06 + (m === 'dance' ? pet.tiltV * .22 : 0)) * Math.sign(pet.faceVis || 1), -28, 28);
    pet.swingV += ((swingT - pet.swing) * 110 - pet.swingV * 7) * dt;
    pet.swing = clamp(pet.swing + pet.swingV * dt, -40, 40);

    pet.low = pet.sitK * 29 + pet.bob * Math.abs(Math.sin(pet.phase));
    // (plus) lying, the raised foot kicks; the kick fidget is a burst of it
    let [kAmp, kRate] = pet.listening ? [0, 1] : KICK[fname] || [1, 1];
    if (ours('kick')) { const e = envelope((T - pet.pulse.t0) / pet.pulse.dur, .15, .6); kAmp += 2 * e; kRate += 1.5 * e; }
    pet.kickPh += dt * 2.1 * kRate;
    const kick = 10 * kAmp * Math.sin(pet.kickPh) * proneK();
    // curled up for a roll, the feet tuck in under the ring (a figure that turns over whole; another reads the legs for its own)
    const rk = custom?.roll === 'spin' && ours('roll') ? envelope((T - pet.pulse.t0) / pet.pulse.dur, .15, .85) : 0;
    pet.feet.forEach((ft, i) => {
      const [hx, hy] = hip(i);
      let tx, ty;
      if (m === 'drag') { tx = hx + 7 * Math.sin(T * 11 + i * 2.2); ty = hy + 36; }
      else if (m === 'air') { tx = hx + (i ? 9 : -9); ty = hy + 33; }
      else {
        const ph = pet.phase + i * Math.PI;
        const sx = hx + pet.stride * Math.sin(ph), sy = FOOT_Y - pet.lift * Math.max(0, Math.cos(ph));
        tx = lerp(sx, hx + 26, pet.sitK); ty = lerp(sy, FOOT_Y, pet.sitK);
        // lying, the flat foot lifts a little as the raised one comes down
        const lf = LIE_FEET[i];
        tx = lerp(tx, lf[0], proneK()); ty = lerp(ty, i ? lf[1] + kick : lf[1] - .4 * Math.max(0, kick), proneK());
        if (rk) { tx = lerp(tx, hx, rk); ty = lerp(ty, hy + 8, rk); }
      }
      const r = m === 'drag' || m === 'air' ? 14 : 40;
      ft[0] = lerp(ft[0], tx, ease(r, dt)); ft[1] = lerp(ft[1], ty, ease(r, dt));
    });

    // (plus) the crack running down a petrified body knocks a few chips of stone off, once per petrify
    if (fc.crack > .05 && pet.chipFor !== pet.exprAt) {
      pet.chipFor = pet.exprAt; play('crack', 'face');
      for (let i = 0; i < 5; i++) emit('chip', toStage(rnd(100, 160), rnd(60, 200) + pet.low), { vx: rnd(-60, 60), vy: rnd(-90, -30), life: 1.2, r: rnd(0, 6) });
    }
    if (fc.emit && T > pet.emitAt) {
      const z = ancPt('z'), tear = ancPt('tear');
      if (fc.emit === 'heart') { emitHeart(); pet.emitAt = T + (fc.emitEvery ?? .45); }
      if (fc.emit === 'z') { emit('z', toStage(...z), { vx: pet.facing * 16, vy: -26, life: 2.4 }); pet.emitAt = T + 1.3; play('snore', 'snore', pet.modeT); }
      if (fc.emit === 'tear') { emit('drop', toStage(tear[0] + pet.look[0], tear[1]), { vx: pet.facing * rnd(10, 30), vy: -20, life: 3 }); pet.emitAt = T + (fc.emitEvery ?? .8); }
      if (fc.emit === 'tears') {
        // both eyes cry, taking turns; a figure that names only its one tear spot cries from there, and lying from the lying one
        const eyes = proneK() > .5 ? [tear] : (A.tears ?? [A.tear]).map(([x, y]) => [x, y + headLow()]);
        const [ex, ey] = eyes[pet.tearN++ % eyes.length];
        emit('drop', toStage(ex + pet.look[0] + rnd(-6, 6), ey), { vx: pet.facing * rnd(-20, 50), vy: rnd(-60, -20), life: 3 }); pet.emitAt = T + .22;
      }
    }
    strokeAcc *= Math.exp(-dt * 1.5);
    petCool -= dt;

    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'drop' || p.type === 'chip') { p.vy += 900 * dt; if (p.y > floorY) p.age = p.life; }
      if (p.type === 'spray') { p.vy += SPRAY_G * S * dt; if (p.y > floorY) p.age = p.life; }
      if (p.type === 'dust') p.vx *= Math.exp(-dt * 4);
      if (p.age >= p.life) P.splice(i, 1);
    }
    pet.talkK *= Math.exp(-dt * 12);
    pet._fc = fc; pet._fname = fname;
  }

  function land() {
    const impact = pet.vy, kind = pet.airKind;
    pet.fy = floorY; pet.vy = 0; pet.vx = 0;
    pet.sqv += clamp(impact * .0024, .8, 4.5);
    play('land', 'move', kind !== 'jump' && impact > 1000);
    dustAt(128, impact > 900 ? 7 : 3, 70);
    if (kind === 'throw' && impact > 1000) { setMode('dizzy'); onEvent('touch', { kind: 'crash' }); return; }
    setMode('land');
    if (kind === 'throw') { pet.expr = 'surprised'; pet.exprUntil = T + .9; pet.exprOwn = true; pet.nextAt = T + 2; }
    else if (kind === 'drop') { pet.expr = 'happy'; pet.exprUntil = T + 1.6; pet.exprOwn = true; pet.nextAt = T + 2.6; }
    else pet.nextAt = T + rnd(.8, 2);
  }

  function render() {
    const fc = pet._fc || FACES.neutral.f(0), fname = pet._fname || 'neutral';
    const drag = pet.mode === 'drag';
    const br = Math.sin(T * (pet.mode === 'sleep' ? 1.7 : 2.4)) * pet.breathK;
    const sx = (1 + pet.sq * .7) * (1 - .05 * pet.stretch) * (1 - .009 * br);
    const sy = (1 - pet.sq) * (1 + .09 * pet.stretch) * (1 + .016 * br);
    const ax = 128, ay = drag ? 36 : 256;
    let AX = drag ? pet.dx : pet.x, AY = drag ? pet.dy : pet.fy;
    // (plus) a roll: a figure that turns over whole curls up and turns on the floor about the middle of its ring,
    // dropping till the ring touches it; a figure that draws no roll of its own hops along instead.
    // Short of a full roll's way (a screen edge) the ring still turns once, to end upright, but hops off the floor
    // for the share of the turn the way along does not cover, so it never slides
    let rollXf = '';
    if (ours('roll') && !custom?.gestures?.includes('roll')) {
      const k = clamp((T - pet.pulse.t0) / pet.pulse.dur, 0, 1);
      if (custom?.roll === 'spin') {
        // (up a little before the turn starts and down a little after it ends)
        const hop = 46 * S * clamp(1 - (pet.pulse.travel ?? ROLL_D) / ROLL_D, 0, 1) * Math.sin(Math.PI * smooth(clamp((k - .14) / .72, 0, 1)));
        const drop = 26 * S * envelope(k, .18, .82) - hop, cy = AY - 128 * S * sy + drop;
        rollXf = `rotate(${f(360 * rollTurn(k) * Math.sign(pet.facing))} ${f(AX)} ${f(cy)}) translate(0 ${f(drop)}) `;
      } else AY -= 46 * S * Math.sin(Math.PI * rollTurn(k));
    }
    if (fc.shake) AX += Math.sin(T * 60) * (fc.shake === true ? 1.4 : fc.shake);
    else if (pet.pulse?.kind === 'shiver') AX += Math.sin(T * 75) * 1.1 * envelope((T - pet.pulse.t0) / pet.pulse.dur, .08, .85);
    // a figure may keep tilt and lean off the whole group and bend its own parts instead;
    // a body lying flat does not rock about its feet (gestures show in its face and squash);
    // a figure with its own back view turns without going thin: it flips at the middle and draws the rest
    const fv = pet.backK > 0 ? (pet.faceVis < 0 ? -1 : 1) * Math.max(Math.abs(pet.faceVis), .85 * pet.backK) : pet.faceVis;
    const kx = S * fv * sx, ky = S * sy, lean = pet.lean * pet.faceVis;
    const rot = custom?.groupTilt ? custom.groupTilt(pet.mode, pet.tilt, lean) : (pet.tilt + lean) * (1 - proneK());
    pet.xf = { AX, AY, ax, ay, kx, ky, rot };
    petG.setAttribute('transform', `${rollXf}translate(${f(AX)} ${f(AY)}) rotate(${f(rot)}) scale(${kx.toFixed(4)} ${ky.toFixed(4)}) translate(${-ax} ${-ay})`);

    const legs = pet.feet.map((ft, i) => [...hip(i), ft[0], ft[1]]);
    const blink = pet.blinkAge < .16 ? Math.sin(Math.PI * pet.blinkAge / .16) : 0;
    let eyes = pet.eyeCur || fc.eyes, eyeClose = 0;
    if (pet.swapAge < .07 && pet.eyePrev) { eyes = pet.eyePrev; eyeClose = pet.swapAge / .07; }
    else if (pet.swapAge < .16) eyeClose = 1 - (pet.swapAge - .07) / .09;
    // (stone does not talk)
    const face = { ...fc, eyes, gap: pet.gap.map(g => Math.min(64, g + (fc.freeze ? 0 : pet.talkK) * 12)), blush: pet.blushK };
    const gesture = pet.pulse ? { kind: pet.pulse.kind, k: clamp((T - pet.pulse.t0) / pet.pulse.dur, 0, 1) } : null;
    // (plus) how far the roll carries her, so a figure's ball turns only that far round
    if (ours('roll')) gesture.travel = pet.pulse.travel;
    custom.draw(petG, face, {
      look: pet.look, legs, low: pet.low, t: T, blink, eyeClose, acc: skin, swing: pet.swing,
      face: fname, mode: pet.mode, modeT: pet.modeT, talk: pet.talkK, drowse: pet.drowse, sit: pet.sitK, facing: pet.faceVis, tilt: pet.tilt, lean, groupRot: rot, gesture,
      talkShape: pet.talkShape, lie: pet.lieK, prone: pet.prone, kneel: !!pet.kneel, away: pet.awayK,
    });

    const footY = drag ? pet.dy + 220 * S * 1.09 : pet.fy;
    const k = clamp(1 - (floorY - footY) / 420, .3, 1);
    shadowEl.setAttribute('cx', f(AX)); shadowEl.setAttribute('cy', f(floorY - 2));
    shadowEl.setAttribute('rx', f(72 * S * k * (1 + pet.sq * .5) * lerp(1, 1.35, proneK()))); shadowEl.setAttribute('ry', f(10 * S * k + 1));
    shadowEl.setAttribute('opacity', f(k));

    let s = '';
    const sc = S / .48;
    // sleep z's take the eye colour, or the figure's own colour for them
    const zPaint = custom?.colors?.z ? `stroke="${custom.colors.z}"` : 'class="eye"';
    for (const p of P) {
      const a = p.age / p.life;
      if (p.type === 'z') {
        const op = a < .15 ? a / .15 : 1 - (a - .15) / .85, z = (.7 + .9 * a) * sc;
        s += `<path ${zPaint} fill="none" stroke-width="${f(3 / z)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 2.5) * 6)} ${f(p.y)}) scale(${f(z)})" d="M-6 -7H6L-6 7H6"/>`;
      } else if (p.type === 'heart') {
        s += `<path class="p-heart" fill="none" stroke-width="5" stroke-linejoin="round" opacity="${f(1 - a * a)}" transform="translate(${f(p.x + Math.sin(p.age * 4) * 5)} ${f(p.y)}) scale(${f((.45 + .35 * a) * sc)})" d="${heartD(0, 0, 1)}"/>`;
      } else if (p.type === 'dust') {
        s += `<circle class="p-dust" fill="none" stroke-width="2" cx="${f(p.x)}" cy="${f(p.y)}" r="${f((3 + 8 * a) * sc)}" opacity="${f(.7 * (1 - a))}"/>`;
      } else if (p.type === 'note') {
        const op = a < .15 ? a / .15 : 1 - (a - .15) / .85, z = (.8 + .4 * a) * sc;
        s += `<g opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 3) * 8)} ${f(p.y)}) scale(${f(z)})"><path ${zPaint} fill="none" stroke-width="2.4" stroke-linecap="round" d="M3 4V-9L9 -6"/><circle ${zPaint} fill="none" stroke-width="3.6" cx="0" cy="4.5" r="1.8"/></g>`;
      } else if (p.type === 'drop') {
        s += `<path class="tearf" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(.9 * sc)})" d="${DROP}"/>`;
      } else if (p.type === 'glint') {
        // a four-point star that pops in and out, warm white with a gold edge so it shows on any desktop
        const k = Math.sin(Math.PI * a) * sc * 1.1;
        if (k > .01) s += `<path fill="#fffbe0" stroke="#e0a100" stroke-width="${f(1.4 / k)}" stroke-linejoin="round" opacity=".9" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(k)}) rotate(${f(p.age * 60)})" d="M0 -9Q1.6 -1.6 9 0Q1.6 1.6 0 9Q-1.6 1.6 -9 0Q-1.6 -1.6 0 -9Z"/>`;
      } else if (p.type === 'wave') {
        // a ring of song spreading out from her, fading as it grows (the listening arcs turned outward)
        const r = (14 + 46 * a) * sc;
        s += `<path ${zPaint} fill="none" stroke-width="${f(3 * sc)}" stroke-linecap="round" opacity="${f(.7 * (1 - a))}" d="M${f(p.x + p.dir * r * Math.cos(-.6))} ${f(p.y + r * Math.sin(-.6))}A${f(r)} ${f(r)} 0 0 ${p.dir > 0 ? 1 : 0} ${f(p.x + p.dir * r * Math.cos(.6))} ${f(p.y + r * Math.sin(.6))}"/>`;
      } else if (p.type === 'bulb') {
        // a light bulb popping on over the head, its rays flashing out, then fading
        const k = (a < .15 ? smooth(a / .15) * 1.15 : 1 + .15 * (1 - smooth(clamp((a - .15) / .15, 0, 1)))) * sc, op = 1 - smooth(clamp((a - .7) / .3, 0, 1));
        const rays = [0, 1, 2, 3, 4].map(i => { const t = -Math.PI / 2 + (i - 2) * .55; return `M${f(14 * Math.cos(t))} ${f(-3 + 14 * Math.sin(t))}L${f(20 * Math.cos(t))} ${f(-3 + 20 * Math.sin(t))}`; }).join('');
        s += `<g opacity="${f(op)}" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(k)})"><path fill="none" stroke="#e0a100" stroke-width="2.4" stroke-linecap="round" d="${rays}"/>`
          + `<path fill="#ffe14d" stroke="#8a6a00" stroke-width="1.6" d="M0 -12A9 9 0 0 1 5 4V8H-5V4A9 9 0 0 1 0 -12Z"/><path fill="none" stroke="#8a6a00" stroke-width="1.6" stroke-linecap="round" d="M-4 11H4"/></g>`;
      } else if (p.type === 'chip') {
        // a small grey shard of stone, tumbling
        s += `<path fill="#c9ccd4" stroke="#6b7080" stroke-width="1" stroke-linejoin="round" opacity="${f(1 - a * a)}" transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.r * 60 + p.age * 400)}) scale(${f(sc)})" d="M-4 -3L3 -4L5 2L-1 4Z"/>`;
      } else if (p.type === 'spray') {
        // a round bead of water with a highlight: not a tear's drop shape, so a spout does not read as crying
        const r = 3.2 * p.r * sc;
        s += `<g opacity="${f(1 - a * a)}"><circle fill="#cdeeff" stroke="${WATER}" stroke-width="${f(1.1 * sc)}" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}"/><circle fill="#fff" cx="${f(p.x - r * .35)}" cy="${f(p.y - r * .35)}" r="${f(r * .3)}"/></g>`;
      }
    }
    if (ours('spout')) {
      // the column: from the top of the head up to its crown of water, tapering in at the base, wobbling a little
      const k = (T - pet.pulse.t0) / pet.pulse.dur, { h, a } = spoutCol(k);
      if (h > .01 && a > .01) {
        const [x, y] = spoutPt(), b = toStage(x, y), tp = toStage(x, y - 80 * h), w = sc * 5, wt = sc * 9, wob = sc * 2 * Math.sin(T * 30);
        const d = `M${f(b.x - w * .5)} ${f(b.y)}Q${f(b.x - w + wob)} ${f((b.y + tp.y) / 2)} ${f(tp.x - wt)} ${f(tp.y)}`
          + `Q${f(tp.x - wt * .6)} ${f(tp.y - wt * 1.2)} ${f(tp.x)} ${f(tp.y - wt * .6)}Q${f(tp.x + wt * .6)} ${f(tp.y - wt * 1.2)} ${f(tp.x + wt)} ${f(tp.y)}`
          + `Q${f(b.x + w + wob)} ${f((b.y + tp.y) / 2)} ${f(b.x + w * .5)} ${f(b.y)}Z`;
        s += `<g opacity="${f(a)}"><path fill="#cdeeff" stroke="${WATER}" stroke-width="${f(1.4 * sc)}" stroke-linejoin="round" d="${d}"/>`
          + `<path fill="none" stroke="#fff" stroke-width="${f(1.6 * sc)}" stroke-linecap="round" d="M${f(b.x - w * .2)} ${f(b.y - 6 * sc)}Q${f(b.x - w * .5 + wob)} ${f((b.y + tp.y) / 2)} ${f(tp.x - wt * .4)} ${f(tp.y + 4 * sc)}"/></g>`;
      }
    }
    fxG.innerHTML = s;
    return fname;
  }

  /* pointer: stage-pixel coordinates; `p.t` is when it happened (ms), else now */
  const now = (p) => p?.t ?? performance.now();
  function velocity() {
    const s = pointer.samples;
    if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0], b = s[s.length - 1], dt = Math.max(.016, (b.t - a.t) / 1000);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }
  function pointerDown(p) {
    Object.assign(pointer, { x: p.x, y: p.y, inside: true });
    if (!hitPet(p) || pet.mode === 'air') return false;
    press = { x: p.x, y: p.y, t: now(p) };
    pointer.samples = [{ t: now(p), x: p.x, y: p.y }];
    return true;
  }
  /** Returns the cursor the stage should show. */
  function pointerMove(p) {
    const t = now(p);
    const ddx = p.x - pointer.x, ddy = p.y - pointer.y;
    Object.assign(pointer, { x: p.x, y: p.y, inside: true });
    pointer.samples.push({ t, x: p.x, y: p.y });
    while (pointer.samples.length > 2 && t - pointer.samples[0].t > 110) pointer.samples.shift();
    pointer.vx = lerp(pointer.vx, velocity().x, .35);

    if (press && pet.mode !== 'drag' && Math.hypot(p.x - press.x, p.y - press.y) > 6) {
      const scruff = toStage(128, 36);
      pet.expr = null;
      setMode('drag', { dx: scruff.x, dy: scruff.y });
      play('grab', 'touch');
      pet.sqv -= 1.2; pet.tiltV = 0;
      onEvent('touch', { kind: 'grab' });
    }
    if (press) return (pet.cursor = 'grabbing');
    const over = hitPet(p);
    if (over && (pet.mode === 'idle' || pet.mode === 'look' || REST.has(pet.mode))) {
      strokeAcc += Math.hypot(ddx, ddy);
      if (strokeAcc > 320 && petCool <= 0) {
        strokeAcc = 0; petCool = 2.5;
        play('purr', 'touch');
        if (pet.mode === 'sleep') emitHeart();
        else setExpr(Math.random() < .5 ? 'love' : 'shy');
        onEvent('touch', { kind: 'pet', asleep: pet.mode === 'sleep' });
      }
    }
    return (pet.cursor = over ? 'grab' : '');
  }
  function pointerUp(p) {
    pet.cursor = '';
    if (!press) return;
    if (pet.mode === 'drag') {
      // hand over from the scruff anchor to the feet anchor without a visual jump
      const foot = toStage(128, 256);
      const v = velocity();
      pet.x = clamp(foot.x, minX(), maxX());
      pet.fy = Math.min(floorY, foot.y);
      pet.vx = clamp(v.x, -1800, 1800); pet.vy = clamp(v.y, -1800, 1400);
      pet.airKind = 'throw';
      const speed = Math.hypot(v.x, v.y);
      if (speed > 700) play('whoosh', 'move');
      setMode('air');
      onEvent('touch', { kind: speed > 700 ? 'throw' : 'drop', x: Math.round(pet.x) });
    } else if (now(p) - press.t < 400) {
      if (REST.has(pet.mode)) {
        const wasAsleep = pet.mode === 'sleep';
        setMode('wake', { startle: true }); pet.sqv -= 2.2; pet.nextAt = T + 2.4;
        play('surprised', 'face');
        onEvent('touch', { kind: 'poke', woke: wasAsleep });
      } else if (pet.mode !== 'dizzy') {
        play('poke', 'touch');
        const r = ['happy', 'wink', 'surprised', 'love', 'angry'][Math.floor(Math.random() * 5)];
        setExpr(r);
        if (Math.random() < .5 && pet.mode === 'idle') setMode('crouch', { jumpV: 480, jumpVx: 0 });
        onEvent('touch', { kind: 'poke' });
      }
    }
    press = null;
  }
  /**
   * Ends a drag with the body dropped from under stage point `p` with no throw: the pointer was let
   * go of on another display and the stage now covers that one. Call after `resize()` has taken the
   * new size.
   */
  function dropAt(p) {
    press = null;
    if (pet.mode !== 'drag') return;
    Object.assign(pointer, { x: p.x, y: p.y, vx: 0, samples: [] });
    pet.x = clamp(p.x, minX(), maxX());
    pet.fy = Math.min(floorY, p.y + 220 * S);
    pet.vx = 0; pet.vy = 0;
    pet.airKind = 'drop';
    setMode('air');
    onEvent('touch', { kind: 'drop', x: Math.round(pet.x) });
  }
  /**
   * Keeps a held body under the pointer when the stage moved to another display mid-drag: every
   * point on screen now sits (dx, dy) stage pixels from where it was.
   */
  function shiftDrag(dx, dy) {
    if (pet.mode !== 'drag') return;
    pet.dx += dx; pet.dy += dy; pet.x += dx;
    pointer.x += dx; pointer.y += dy;
    for (const s of pointer.samples) { s.x += dx; s.y += dy; }
    if (press) { press.x += dx; press.y += dy; }
  }
  function pointerLeave() { if (!press) pointer.inside = false; }

  /** Head top in stage pixels, for placing a speech bubble (with plus, following the body lying and kneeling). */
  function anchor() {
    if (!plus) return toStage(A.bubble[0], A.bubble[1] + pet.low);
    // a figure that lies by turning its standing drawing carries its head top through that turn
    if (custom?.liePoint && lieSet()) return toStage(...custom.liePoint(A.bubble[0], A.bubble[1] + headLow(), pet.lieK));
    return toStage(...ancPt('bubble'));
  }
  /** The body's box [x0, y0, x1, y1] in logo units: the figure's extent, and with plus blended into its lying box. */
  function bodyBox() {
    const up = custom?.extent ?? EXTENT, L = lieSet();
    if (!L?.hit) return up;
    const w = L.halfW ?? 108, k = proneK();
    // the top of a figure that lies by turning its standing drawing is its own top carried through the turn
    const top = custom?.liePoint ? Math.min(L.hit[1] - L.hit[3], custom.liePoint(128, up[1] + 29, 1)[1]) : L.hit[1] - L.hit[3];
    return [128 - w, top, 128 + w, 256].map((v, i) => lerp(up[i], v, k));
  }
  /** Pressed, carried, airborne, walking, running, dancing, turning round, or in a short gesture (not a lying fidget). */
  const isMoving = () => !!press || MOVING_MODES.has(pet.mode) || (!!pet.pulse && !(plus && FIDGETS[pet.pulse.kind] && !pet.pulse.pack))
    || Math.abs(pet.faceVis - pet.facing) > .05;

  /**
   * Where the body is and what it is doing, in stage pixels, for the page around it: its box and hit
   * circles, the bubble's spot, the point the hover buttons sit beside (`side`, with `reach` from it to
   * the body's edge), and the cursor to show. With plus, the box, circles and side follow the body lying down.
   */
  function layout() {
    const [x0, y0, x1, y1] = bodyBox();
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => toStage(x, y));
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    let side, reach = 104 * S;
    if (plus) {
      // level with the middle of the ring standing or seated, with the middle of the body lying down (and clear of it)
      const k = proneK(), up = 128 + pet.low;
      side = toStage((x0 + x1) / 2, up + ((y0 + y1) / 2 - up) * k);
      reach = (104 + ((x1 - x0) / 2 - 104) * k) * S;
    } else side = toStage(128, 128 + pet.low);
    return {
      x: pet.x, facing: pet.facing, mode: pet.mode, busy: busy(), pressing: !!press, cursor: pet.cursor,
      moving: isMoving(),
      box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      hit: hits(), bubble: anchor(), side: { x: side.x, y: side.y, reach },
    };
  }

  resize();
  custom?.setSkin?.(skin);
  return {
    pet, step, render, resize, act, setExpr, doWord, walkTo, stopWalk, toStage, hitPet, busy, layout,
    pointerDown, pointerMove, pointerUp, pointerLeave, dropAt, shiftDrag,
    get pressing() { return !!press; },
    /** Pressed, carried, airborne, walking, running, dancing, turning round, or in a short gesture (nod, wave, bow…; with plus not a lying fidget): motion that frames far apart show as jumps. */
    get moving() { return isMoving(); },
    get time() { return T; },
    get bounds() { return { W, H, floorY, S, minX: minX(), maxX: maxX() }; },
    setSkin(s) { skin = s; custom?.setSkin?.(s); },
    /** Swaps the body's drawing (see `opts.figure`). */
    setFigure(fig) {
      if (fig === custom) return;
      // a swapped-out figure may hold a WebGL context; release it now instead of waiting for GC
      custom?.dispose?.();
      custom = fig;
      custom.setSkin?.(skin);
      A = anchors();
      petG.textContent = '';
      render();
    },
    get figure() { return custom; },
    get skin() { return skin; },
    setRoam(r) { roam = r; if (r !== 'off') pet.nextAt = T + 1; },
    get roam() { return roam; },
    /** Outside orders keep free roaming quiet for `seconds`. */
    holdRoam(seconds) { hold = Math.max(hold, T + seconds); },
    /**
     * A spoken character: the mouth opens, shaped by the character (one of four shapes, so speech does not just flap);
     * without one (a page that does not say which) the shape just moves on to the next.
     */
    talk(ch) { pet.talkK = 1; pet.talkShape = typeof ch === 'string' && ch ? ch.codePointAt(0) % 4 : (pet.talkShape + 1) % 4; },
    setListening(on) { pet.listening = on; if (on && (pet.mode === 'walk' || pet.mode === 'run')) setMode('idle'); },
    setThinking(on) { pet.thinking = on; },
    anchor,
    /** How far the body is seen lying (0..1): 0 throughout without plus or for a figure that cannot show the pose. */
    get lying() { return proneK(); },
    bodyBox,
    emitHeart,
  };
}

/* ---------- the body a pack hands the figure frame ---------- */
/** Colours of what the kit draws itself (shadow, particles; z's take the `eye` class without a figure colour). */
const KIT_CSS = `
:root{--shadow:rgba(27,22,38,.12);--tear:#5AAEF0;--heart:#F0567A;--dust:#A39DB0;--skin-eye:#00A870}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--shadow:rgba(0,0,0,.32);--tear:#6BBDF7;--heart:#FF6F93;--dust:#5B6472;--skin-eye:#2FD59B}}
:root[data-theme="dark"]{--shadow:rgba(0,0,0,.32);--tear:#6BBDF7;--heart:#FF6F93;--dust:#5B6472;--skin-eye:#2FD59B}
.shadow{fill:var(--shadow)} .tearf{fill:var(--tear)} .p-heart{stroke:var(--heart)} .p-dust{stroke:var(--dust)} .eye{stroke:var(--skin-eye)}
svg.kit{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
`;
const SVGNS = 'http://www.w3.org/2000/svg';

/**
 * The body contract (api 2, web/figure-frame.js) on top of `createPet`: what a pack's factory returns.
 * `host` is what the frame gives the factory: `root` (the element to draw in), `bounds()`, `emit(kind, detail)`
 * for what happens to the body, `sound(name, kind, ...args)` for what it wants heard, and `start` ({ x, facing,
 * enter, skin }: where it stands, or enter 'drop' to fall in from above, and the skin to wear). `opts` are
 * createPet's, with `figure` required (and `plus` for the plus body); `opts.css` is more style for the frame's
 * document (a figure's own classes) and `opts.skinCss(skin)` the style that follows the skin.
 *
 * The body takes these calls from the page: step(dt), layout(), do(word), walk(x, run, id), stopWalk(id), pointer(type, p),
 * drop(p), shift(dx, dy), place(x, facing), set({ roam, hold, dialogOpen, listening, thinking, skin, theme }),
 * cue(kind), talk(ch?), setScheme(id, o), dispose(). A word it does not know or cannot take now is `done` at once.
 */
export function createBody(host, opts) {
  const doc = host.root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = KIT_CSS + (opts.css ?? '');
  doc.head.appendChild(style);
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'kit');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<ellipse class="shadow" cx="0" cy="0" rx="0" ry="0"/><g></g><g></g>';
  host.root.appendChild(svg);
  const [shadowEl, petG, fxG] = svg.children;
  const skinStyle = doc.createElement('style');
  doc.head.appendChild(skinStyle);
  const start = host.start ?? {};
  if (opts.skinCss && start.skin) skinStyle.textContent = opts.skinCss(start.skin);
  let dialogOpen = false;
  const ctl = createPet({ petG, shadowEl, fxG }, {
    ...opts,
    skin: start.skin ?? null, startX: start.x, enter: start.enter,
    bounds: host.bounds,
    onEvent: host.emit,
    sfx: { play: host.sound },
    dialogOpen: () => dialogOpen,
  });
  if (start.facing === 1 || start.facing === -1) ctl.pet.facing = ctl.pet.faceVis = start.facing;
  return {
    step(dt) { ctl.step(dt); ctl.render(); },
    layout: ctl.layout,
    resize: ctl.resize,
    /**
     * Does a word. With `plus`, one it does not know or cannot take now (a song while being talked to) is reported
     * done at once, so the page's queue moves on; other bodies keep upstream's timing (the word's seconds).
     */
    do(word) {
      const ok = ctl.doWord(word);
      if (!ok && opts.plus) host.emit('done', { word });
      return ok;
    },
    walk: (x, run, id) => ctl.walkTo(x, run, id),
    stopWalk: (id) => ctl.stopWalk(id),
    pointer(type, p) {
      if (type === 'down') ctl.pointerDown(p);
      else if (type === 'move') ctl.pointerMove(p);
      else if (type === 'up' || type === 'cancel') ctl.pointerUp(p);
      else if (type === 'leave') ctl.pointerLeave();
    },
    drop: ctl.dropAt,
    shift: ctl.shiftDrag,
    /** Puts a body that is standing at stage x, turned to `facing` (1 right, -1 left). */
    place(x, facing) {
      if (ctl.pet.mode === 'drag' || ctl.pet.mode === 'air') return;
      const { minX, maxX } = ctl.bounds;
      ctl.pet.x = ctl.pet.target = clamp(x, minX, maxX);
      if (facing === 1 || facing === -1) ctl.pet.facing = ctl.pet.faceVis = facing;
    },
    set(s) {
      if (s.roam) ctl.setRoam(s.roam);
      if (typeof s.hold === 'number') ctl.holdRoam(s.hold);
      if (typeof s.dialogOpen === 'boolean') dialogOpen = s.dialogOpen;
      if (typeof s.listening === 'boolean') ctl.setListening(s.listening);
      if (typeof s.thinking === 'boolean') ctl.setThinking(s.thinking);
      if (s.skin) { ctl.setSkin(s.skin); if (opts.skinCss) skinStyle.textContent = opts.skinCss(s.skin); }
      if (s.theme) doc.documentElement.dataset.theme = s.theme;
    },
    /** The page's own moments: a talk key tapped (`perk`), speech heard (`heard`), an answer sent (`cheer`), a dress pick (`bounce`). */
    cue(kind) {
      if (kind === 'perk') { ctl.pet.sqv += .6; ctl.setExpr('surprised', .5); }
      else if (kind === 'heard') ctl.pet.sqv += .9;
      else if (kind === 'cheer') ctl.setExpr('happy');
      else if (kind === 'bounce') ctl.pet.sqv += 1.2;
    },
    /** The mouth opens for a spoken character `ch` (optional: without it the mouth's shape just moves on). */
    talk: (ch) => ctl.talk(ch),
    setScheme: (id, o) => opts.figure.setScheme?.(id, o),
    get z() { return opts.figure.colors?.z ?? null; },
    dispose() { opts.figure.dispose?.(); svg.remove(); style.remove(); skinStyle.remove(); },
  };
}
