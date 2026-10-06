/**
 * The pet's body: geometry, faces, accessories, skin, synthesized sound, and the motion
 * simulation with pointer handling. Pages build on it: the desktop window (pet.html), the
 * dressing page (dress.html) and anything else that wants the same figure.
 *
 * Coordinates: the figure is drawn in logo units, facing right, ground at y=256. A stage places
 * it with translate(AX AY) rotate(rot) scale(kx ky) translate(-ax -ay); `toStage` maps a logo
 * point back to stage pixels for hit tests, particles and bubble placement.
 */

export const f = n => Math.round(n * 10) / 10;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = k => k * k * (3 - 2 * k);
/** 0 → 1 over [0, a] of k, holds, then back to 0 over [b, 1]: the shape of a gesture held for a moment. */
export const envelope = (k, a, b) => smooth(clamp(k / a, 0, 1)) * (1 - smooth(clamp((k - b) / (1 - b), 0, 1)));

/* ---------- figure geometry ---------- */
const HIPS = [[104, 212], [150, 212]];
const EYES = [[113, 117], [163, 117]];
const BODY_W = 36, LEG_W = 30;
// a foot's round cap touches the ground
const FOOT_Y = 256 - LEG_W / 2;
export const STAND = HIPS.map(h => [h[0], h[1], h[0], FOOT_Y]);
// lying on her front: hips at the back of the ring, one foot flat behind, the other up in the air
const LIE_HIPS = [[62, 200], [78, 206]], LIE_FEET = [[8, 240], [18, 178]];
// ...and the ring with its face tips forward and flattens about the point on the ground under it (by lie 0..1)
const lieXf = (L, dip = 0) => `translate(128 256) rotate(${f(9 * L + dip)}) scale(${(1 + .08 * L).toFixed(3)} ${(1 - .13 * L).toFixed(3)}) translate(-128 -256)`;
function liePt(x, y, L) {
  const a = 9 * L * Math.PI / 180, dx = (x - 128) * (1 + .08 * L), dy = (y - 256) * (1 - .13 * L);
  return [128 + dx * Math.cos(a) - dy * Math.sin(a), 256 + dx * Math.sin(a) + dy * Math.cos(a)];
}
const DROP = 'M0 -9C4 -3 6 0 6 3.5A6 6 0 0 1 -6 3.5C-6 0 -4 -3 0 -9Z';
// a spout's water: its own fixed colours (any scheme, any desktop), and the spray's fall, per unit of the stage scale
const WATER = '#2f7fd0', SPRAY_G = 2200;
const pol = (a, r) => [128 + r * Math.cos(a * Math.PI / 180), 128 - r * Math.sin(a * Math.PI / 180)];
const pt = p => `${f(p[0])} ${f(p[1])}`;

function cPath(gt, gb) {
  return `M${pt(pol(gt, 84))}A84 84 0 1 0 ${pt(pol(-gb, 84))}`;
}
function ellipse(cx, cy, rx, ry) {
  if (ry < 1.6) return `M${f(cx - rx)} ${f(cy)}L${f(cx + rx)} ${f(cy)}`;
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}
export function heartD(cx, cy, s) {
  const p = (x, y) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  return `M${p(0, 14)}C${p(-7, 8)} ${p(-19, 1)} ${p(-19, -6)}C${p(-19, -15)} ${p(-8, -18)} ${p(0, -9)}C${p(8, -18)} ${p(19, -15)} ${p(19, -6)}C${p(19, 1)} ${p(7, 8)} ${p(0, 14)}Z`;
}
function eyePath(e, cx, cy) {
  cx += e.dx || 0; cy += e.dy || 0;
  switch (e.shape) {
    case 'ring': return ellipse(cx, cy, e.rx, e.ry);
    case 'lid': return e.ry < 1.6 ? `M${f(cx - 16)} ${f(cy)}L${f(cx + 16)} ${f(cy)}` : `M${f(cx - 16)} ${f(cy)}A16 ${f(e.ry)} 0 0 0 ${f(cx + 16)} ${f(cy)}Z`;
    case 'up': return `M${f(cx - 15)} ${f(cy + 6)}Q${f(cx)} ${f(cy - 17)} ${f(cx + 15)} ${f(cy + 6)}`;
    case 'down': return `M${f(cx - 15)} ${f(cy - 3)}Q${f(cx)} ${f(cy + 15)} ${f(cx + 15)} ${f(cy - 3)}`;
    case 'gt': return `M${f(cx - 10)} ${f(cy - 13)}L${f(cx + 11)} ${f(cy)}L${f(cx - 10)} ${f(cy + 13)}`;
    case 'lt': return `M${f(cx + 10)} ${f(cy - 13)}L${f(cx - 11)} ${f(cy)}L${f(cx + 10)} ${f(cy + 13)}`;
    case 'heart': return heartD(cx, cy, e.s);
    case 'spiral': {
      let d = '';
      const max = Math.PI * 4.4;
      for (let i = 0; i <= 44; i++) {
        const a = max * i / 44, r = 2 + 15 * i / 44;
        d += (i ? 'L' : 'M') + f(cx + r * Math.cos(a + e.rot)) + ' ' + f(cy + r * Math.sin(a + e.rot));
      }
      return d;
    }
  }
  return '';
}

/* ---------- accessories ----------
   Solid shapes first; lines only where a piece is a line (band, stalk, frame), never thinner than 10.
   Every part is painted through a color channel: c-<slot>-main / c-<slot>-acc. */
export const PALETTES = [
  { id: 'mint',      label: '薄荷绿', l: ['#1B1626', '#00A870'], d: ['#FFFFFF', '#2FD59B'] },
  { id: 'mono',      label: '单色',   l: ['#1B1626', '#1B1626'], d: ['#FFFFFF', '#FFFFFF'] },
  { id: 'navigator', label: '领航员', l: ['#14213A', '#1F6FE0'], d: ['#FFFFFF', '#5EA3FF'] },
  { id: 'claude',    label: '克劳德', l: ['#2A1C16', '#C9623F'], d: ['#FFFFFF', '#E58B69'] },
  { id: 'fox',       label: '红狐狸', l: ['#26140F', '#DD3526'], d: ['#FFFFFF', '#FF6655'] },
  { id: 'purple',    label: '虚式茈', l: ['#1D1430', '#8B3DF0'], d: ['#FFFFFF', '#B98AFF'] },
  { id: 'lemon',     label: '柠檬黄', l: ['#252010', '#D9B300'], d: ['#FFFFFF', '#FFE14F'] },
];
export const HEADS = [['none', '无'], ['cat', '猫耳'], ['bear', '熊耳'], ['bunny', '兔耳'], ['antenna', '天线'], ['halo', '光环'], ['tophat', '礼帽'], ['party', '派对帽'], ['sailor', '水手帽']];
export const SIDES = [['none', '无'], ['headphones', '耳机'], ['feather', '耳羽'], ['earring', '耳环'], ['clip', '发夹'], ['bow', '蝴蝶结']];
export const GLASSES = [['none', '无'], ['round', '圆框'], ['square', '方框'], ['monocle', '单片镜']];
export const NECKS = [['none', '无'], ['bowtie', '领结'], ['bell', '铃铛'], ['scarf', '围巾']];
export const HEAD_TOP = { none: 12, cat: -14, bear: -4, bunny: -34, antenna: -34, halo: -8, tophat: -28, party: -34, sailor: -20 };

/* color mapping: channel -> source. 'body' / 'eye' follow the palette; the rest are fixed accessory colors with a dark twin */
export const ACC_COLORS = [
  { id: 'mint',      label: '薄荷绿', l: '#00A870', d: '#2FD59B' },
  { id: 'leaf',      label: '叶绿',   l: '#3C9A2C', d: '#80D46B' },
  { id: 'lemon',     label: '柠檬黄', l: '#D9B300', d: '#FFE14F' },
  { id: 'fox',       label: '红狐狸', l: '#DD3526', d: '#FF6655' },
  { id: 'claude',    label: '克劳德', l: '#C9623F', d: '#E58B69' },
  { id: 'rose',      label: '樱粉',   l: '#DB3F76', d: '#FF85AE' },
  { id: 'purple',    label: '虚式茈', l: '#8B3DF0', d: '#B98AFF' },
  { id: 'navigator', label: '领航员', l: '#1F6FE0', d: '#5EA3FF' },
  { id: 'holo',      label: '全息蓝', l: '#1AA3D9', d: '#6FD3FF' },
];
export const LINKED = [{ id: 'body', label: '跟随身体' }, { id: 'eye', label: '跟随眼睛' }];
export const SLOTS = ['head', 'side', 'glasses', 'neck'];
export const SLOT_LISTS = { head: HEADS, side: SIDES, glasses: GLASSES, neck: NECKS };
export const CHANNEL_DEFAULT = { head: { main: 'body', acc: 'eye' }, side: { main: 'eye', acc: 'eye' }, glasses: { main: 'body', acc: 'eye' }, neck: { main: 'eye', acc: 'eye' } };
// side and neck pieces lie on top of the body outline: mapping them to the body color would make them vanish
export const NO_BODY = { head: false, side: true, glasses: false, neck: true };
// character pieces carry their original colors; picking one fills its channels, which stay editable afterwards
export const ITEM_COLORS = {
  sailor: { main: 'body', acc: 'navigator' },
  feather: { main: 'holo', acc: 'navigator' },
  headphones: { main: 'claude', acc: 'holo' },
};
export const ROLES = {
  cat: ['main'], bear: ['main'], bunny: ['main'], antenna: ['main', 'acc'], halo: ['acc'],
  tophat: ['main', 'acc'], party: ['main', 'acc'], round: ['main'], square: ['main'], monocle: ['main'],
  bowtie: ['main'], bell: ['main', 'acc'], scarf: ['main'], sailor: ['main', 'acc'],
  headphones: ['main', 'acc'], feather: ['main', 'acc'], earring: ['main'], clip: ['main'], bow: ['main'],
};

const mount = (a, r = 96) => `translate(${pt(pol(a, r))}) rotate(${f(90 - a)})`;
const stroke = (cls, w) => `class="${cls}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
// solid shape with rounded corners: filled and stroked in the same channel color
const blob = (slot, ch, w) => `class="f-${slot}-${ch} c-${slot}-${ch}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function headBack(id, sw) {
  switch (id) {
    case 'cat':
      return [126, 82].map(a => `<path ${blob('head', 'main', 10)} transform="${mount(a)}" d="M-17 8L0 -28L17 8Z"/>`).join('');
    case 'bear':
      return [128, 80].map(a => `<circle class="f-head-main" transform="${mount(a)}" cx="0" cy="-8" r="18"/>`).join('');
    case 'bunny':
      return [[116, -10, .7], [92, 6, 1]].map(([a, off, k]) =>
        `<g transform="${mount(a)} rotate(${f(off + sw * k)})"><ellipse class="f-head-main" cx="0" cy="-28" rx="14" ry="30"/></g>`).join('');
    case 'antenna':
      return `<g transform="${mount(98)} rotate(${f(sw)})"><path ${stroke('c-head-main', 14)} d="M0 0Q5 -20 0 -38"/><circle class="f-head-acc" cx="0" cy="-50" r="12"/></g>`;
  }
  return '';
}
function headFront(id, sw, t) {
  switch (id) {
    case 'sailor':
      return `<g transform="${mount(106)} rotate(${f(sw * .2)})"><path class="f-head-main" d="M-34 3L-38 -30Q0 -40 38 -30L34 3Q0 -3 -34 3Z"/><path class="f-head-acc" d="M-37.1 -23Q0 -31 37.1 -23L36.1 -15Q0 -23 -36.1 -15ZM-35.6 -11Q0 -19 35.6 -11L34.8 -4Q0 -12 -34.8 -4Z"/></g>`;
    case 'halo':
      return `<g transform="${mount(98)}"><ellipse ${stroke('c-head-acc', 12)} cx="0" cy="${f(-28 + 3 * Math.sin(t * 2.2))}" rx="36" ry="9"/></g>`;
    case 'tophat':
      return `<g transform="${mount(104)} rotate(${f(sw * .2)})"><rect class="f-head-main" x="-40" y="-7" width="80" height="12" rx="6"/><rect class="f-head-main" x="-22" y="-48" width="44" height="46" rx="7"/><rect class="f-head-acc" x="-22" y="-20" width="44" height="10"/></g>`;
    case 'party':
      return `<g transform="${mount(110)} rotate(${f(sw * .3)})"><path ${blob('head', 'main', 8)} d="M-24 2L0 -46L24 2Z"/><circle class="f-head-acc" cx="0" cy="-55" r="11"/></g>`;
  }
  return '';
}
// Side pieces sit where an ear would be on this profile: the back of the head, around 130–172°.
function sideBack(id, sw) {
  if (id !== 'feather') return '';
  const blade = (L, w) => `M0 0C${-w} ${f(-L * .3)} ${f(-w * .8)} ${f(-L * .8)} ${f(-L * .14)} ${-L}C${f(w * .6)} ${f(-L * .75)} ${w} ${f(-L * .3)} 0 0Z`;
  return `<g transform="${mount(166, 92)} rotate(${f(sw * .6)})">` +
    `<path class="f-side-acc" transform="rotate(58)" d="${blade(66, 18)}"/>` +
    `<path class="f-side-main" transform="rotate(26)" d="${blade(56, 16)}"/>` +
    `<path class="f-side-main" d="${blade(42, 14)}"/></g>`;
}
function sideFront(id, sw) {
  switch (id) {
    case 'headphones':
      return `<path ${stroke('c-side-main', 16)} d="M${pt(pol(150, 113))}A113 113 0 0 1 ${pt(pol(76, 113))}"/>` +
        `<rect class="f-side-acc" transform="${mount(166, 98)}" x="-24" y="-17" width="48" height="34" rx="17"/>`;
    case 'earring':
      return `<g transform="translate(${pt(pol(172, 99))}) rotate(${f(sw * .8)})"><circle class="f-side-main" cx="0" cy="13" r="10"/></g>`;
    case 'clip':
      return `<rect class="f-side-main" transform="${mount(140, 86)}" x="-17" y="-6.5" width="34" height="13" rx="6.5"/>`;
    case 'bow':
      return `<g class="f-side-main" transform="${mount(132, 100)} rotate(${f(sw * .3)})"><path d="M-4 0L-24 -14Q-28 0 -24 14ZM4 0L24 -14Q28 0 24 14Z"/><circle r="7"/></g>`;
  }
  return '';
}
function glassesD(id, gx, gy) {
  // frames sit one ring-width outside the eyes so the two never touch
  const L = [113 + gx, 117 + gy], R = [163 + gx, 117 + gy], M = stroke('c-glasses-main', 10);
  switch (id) {
    case 'round':
      return `<circle ${M} cx="${f(L[0])}" cy="${f(L[1])}" r="31"/><circle ${M} cx="${f(R[0])}" cy="${f(R[1])}" r="31"/><path ${M} d="M${f(L[0] - 31)} ${f(L[1] - 6)}L62 106"/>`;
    case 'square':
      return `<rect ${M} x="${f(L[0] - 26)}" y="${f(L[1] - 22)}" width="52" height="44" rx="15"/><rect ${M} x="${f(R[0] - 26)}" y="${f(R[1] - 22)}" width="52" height="44" rx="15"/><path ${M} d="M${f(L[0] - 26)} ${f(L[1] - 6)}L62 106"/>`;
    case 'monocle':
      return `<circle ${M} cx="${f(R[0])}" cy="${f(R[1])}" r="31"/>`;
  }
  return '';
}
function neckD(id, sw) {
  switch (id) {
    case 'bowtie':
      return `<g ${blob('neck', 'main', 6)} transform="translate(176 206) rotate(-32)"><path d="M-4 0L-22 -13V13ZM4 0L22 -13V13Z"/><circle r="7"/></g>`;
    case 'bell': {
      const a = pol(-150, 84), b = pol(-60, 84);
      return `<path ${stroke('c-neck-main', 12)} d="M${pt(a)}A84 84 0 0 0 ${pt(b)}"/><g transform="translate(${pt(b)}) rotate(${f(sw * .6)})"><circle class="f-neck-acc" cx="0" cy="14" r="13"/></g>`;
    }
    case 'scarf': {
      const a = pol(-150, 84), b = pol(-72, 84), S2 = stroke('c-neck-main', 18);
      return `<path ${S2} d="M${pt(a)}A84 84 0 0 0 ${pt(b)}"/><g transform="rotate(${f(sw * .8)} ${pt(a)})"><path ${S2} d="M${pt(a)}q-12 22 -6 40"/></g>`;
    }
  }
  return '';
}

/* ---------- faces ---------- */
const ring = o => ({ shape: 'ring', rx: 16, ry: 16, ...o });
const yawn = t => { const p = (t % 4.2) / 1.6; return p < 1 ? Math.sin(Math.PI * p) ** 2 : 0; };

export const FACES = {
  neutral:   { label: '平静', kao: '(0 0',  f: () => ({ gap: [50, 50], eyes: [ring(), ring()] }) },
  happy:     { label: '开心', kao: '(^ ^',  f: () => ({ gap: [58, 58], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .45 }) },
  wink:      { label: '眨眼', kao: '(0 ^',  f: () => ({ gap: [56, 52], eyes: [ring(), { shape: 'up' }] }) },
  love:      { label: '喜欢', kao: '(♡ ♡',  f: t => { const s = .8 + .08 * Math.sin(t * 9); return { gap: [56, 56], eyes: [{ shape: 'heart', s, sw: 8 }, { shape: 'heart', s, sw: 8 }], blush: .7, emit: 'heart' }; } },
  // ducks her head and looks away, then about .6 s in peeks back at you for a moment, and again every 2.6 s
  // ("away" is +x for a drawn figure's head, which turns toward profile; Coo's eyes stay averted through dx)
  shy:       { label: '害羞', kao: '(o o *', f: (t, p) => {
    const a = p ? (t - p.exprAt) % 2.6 : 0, peek = a > .6 && a < 1.3;
    return peek
      ? { gap: [42, 42], eyes: [ring({ rx: 15, ry: 15, dy: -2 }), ring({ rx: 15, ry: 15, dy: -2 })], blush: 1, lookAt: [-1.5, -1], lean: 4 }
      : { gap: [40, 40], eyes: [ring({ rx: 13, ry: 12, dx: -6, dy: 5 }), ring({ rx: 13, ry: 12, dx: -6, dy: 5 })], blush: 1, lookAt: [3, 2], lean: 6 };
  } },
  surprised: { label: '惊讶', kao: '(O O',  f: () => ({ gap: [62, 62], eyes: [ring({ rx: 20, ry: 21 }), ring({ rx: 20, ry: 21 })], bang: true }) },
  angry:     { label: '生气', kao: '(ò ó',  f: () => ({ gap: [36, 36], eyes: [ring({ ry: 11, dy: 4 }), ring({ ry: 11, dy: 4 })], brows: 'angry', anger: true, shake: true }) },
  // `sag` sinks Coo's round body a little (+) or holds it stiff (-); a drawn figure keeps its art unsquashed
  sad:       { label: '难过', kao: '(ó ò',  f: () => ({ gap: [34, 40], eyes: [ring({ ry: 14, dy: 4 }), ring({ ry: 14, dy: 4 })], brows: 'sad', emit: 'tear', lookAt: [1, 3], lean: 4, sag: .04 }) },
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
  // `lean` tips the body back (-) or forward while standing or sitting; `gloom` draws the three lines of 无语
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
  // trying not to laugh: smiling eyes looking a little away and down, shaking in fits (`titter`, 0..1) every 1.6 s
  giggle:    { label: '偷笑', kao: '(^ ^)', f: (t, p) => {
    const s = t - (p ? p.exprAt : 0), u = s % 1.6;
    return { gap: [52, 52], eyes: [{ shape: 'up' }, { shape: 'up' }], blush: .35, lookAt: [2, 1.5], titter: Math.sin(Math.PI * clamp(u / .7, 0, 1)) * Math.abs(Math.sin(s * 18)) };
  } },
  // happy tears: shining, brimming eyes under raised brows, a smile, two thin tracks and a tear now and then
  moved:     { label: '感动', kao: '(;▽;)', f: () => ({ gap: [54, 54], eyes: [ring({ ry: 15, dy: 1 }), ring({ ry: 15, dy: 1 })], brows: 'sad', sparkle: true, blush: .6, streams: { a: .5, len: .5, w: .6 }, emit: 'tear', emitEvery: 1.5 }) },
  // turned to stone (我裂开了): a shocked stare, then frozen still and greying (`freeze`, `stone` 0..1), a crack running
  // down her (`crack` 0..1) with a shudder, and the colour flowing back before the face ends (timed by exprAt / exprUntil)
  petrify:   { label: '石化', kao: '(° °|||', f: (t, p) => {
    const s = t - (p ? p.exprAt : 0), left = p ? p.exprUntil - t : 9, crack = smooth(clamp((s - 1.1) / .4, 0, 1));
    return {
      gap: [40, 40], eyes: [ring({ rx: 17, ry: 18 }), ring({ rx: 17, ry: 18 })], wide: true, gloom: true,
      stone: smooth(clamp((s - .15) / .35, 0, 1)) * smooth(clamp(left / .5, 0, 1)), freeze: s > .3 && left > .6, crack: crack * smooth(clamp(left / .5, 0, 1)),
      shake: s > 1.1 && s < 1.35 ? 1.6 : 0,
    };
  } },
  // motions' own faces (not ones to ask for): eyes shut through a bow; wide, alert eyes held ahead for a peek
  bowing:    { label: '鞠躬', f: () => ({ gap: [48, 48], eyes: [{ shape: 'lid', ry: 0 }, { shape: 'lid', ry: 0 }] }) },
  peeking:   { label: '探头', f: () => ({ gap: [44, 44], eyes: [ring({ rx: 17, ry: 18 }), ring({ rx: 17, ry: 18 })], lookAt: [5, -1] }) },
  // ...a sip: eyes half shut over the cup, shut for the sip itself (1.4–2.3 s in), a little warm blush
  sipping:   { label: '喝茶', f: (t, p) => { const s = t - (p ? p.exprAt : 0), r = s > 1.4 && s < 2.3 ? 0 : 10; return { gap: [46, 46], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }], blush: .3 }; } },
  // ...a sigh (the `sigh` pulse's own beats): eyes up a little drawing breath, then drooping half shut as it goes out,
  // the mouth open for the "ha" (`puff`, 0..1); once the sigh is over (or cut short) a plain face
  sighing:   { label: '叹气', f: (t, p) => {
    const g = p?.pulse?.kind === 'sigh' ? p.pulse : null, k = g ? (t - g.t0) / g.dur : 1;
    if (!g || k >= 1) return { gap: [50, 50], eyes: [ring(), ring()] };
    if (k < .35) return { gap: [50, 50], eyes: [ring({ ry: 17 }), ring({ ry: 17 })], lookAt: [0, -2] };
    const r = 14 - 8 * smooth(clamp((k - .35) / .25, 0, 1));
    return { gap: [46, 46], eyes: [{ shape: 'lid', ry: r }, { shape: 'lid', ry: r }], brows: 'sad', lookAt: [0, 2], puff: Math.sin(Math.PI * clamp((k - .38) / .4, 0, 1)) };
  } },
  // ...reading: eyes down on the page, running along a line and back to the start of the next
  reading:   { label: '看书', f: t => ({ gap: [48, 48], eyes: [{ shape: 'lid', ry: 11 }, { shape: 'lid', ry: 11 }], lookAt: [-3.5 + 7 * ((t * .55) % 1), 3.5] }) },
  confused:  { label: '疑惑', kao: '(0 o ?', f: () => ({ gap: [44, 40], eyes: [ring(), ring({ rx: 14, ry: 11 })], question: true }) },
};
export const GALLERY = ['neutral', 'happy', 'wink', 'love', 'shy', 'surprised', 'angry', 'sad', 'sleepy', 'sleep', 'dizzy', 'dragged'];

/** One frame of the figure as SVG markup, in logo units. */
export function figure(fc, o) {
  const t = o.t, lx = o.look[0], ly = o.look[1], acc = o.acc, sw = o.swing || 0;
  const L = o.lie || 0, g = o.gesture, gs = g ? Math.sin(Math.PI * g.k) : 0;
  // back turned (away): Coo has no back to draw, so the face goes, out over the turn and in again on the way back
  // (`o.away`, pet-core's eased share of it, brings the face back gradually when the gesture ends early)
  const fa = 1 - (o.away ?? (g?.kind === 'away' ? envelope(g.k, .25, .8) : 0));
  const faceG = m => (fa > .99 ? m : fa > .01 ? `<g opacity="${f(fa)}">${m}</g>` : '');
  // ...and with it the mouth, the ring's gap, rests: no pout or talking from the back
  const gap = fa > .99 ? fc.gap : fc.gap.map(v => lerp(50, v, fa));
  let s = `<g class="ink" fill="none" stroke-width="${LEG_W}" stroke-linecap="round">`;
  for (const l of o.legs) s += `<path d="M${f(l[0])} ${f(l[1])}L${f(l[2])} ${f(l[3])}"/>`;
  s += '</g>';
  // lying: the chin fidget dips the ring a little more
  if (L > .02) s += `<g transform="${lieXf(L, g?.kind === 'chin' ? 3 * gs * L : 0)}">`;
  s += `<g transform="translate(0 ${f(o.low)})">`;
  s += sideBack(acc.side, sw);
  s += headBack(acc.head, sw);
  s += `<path class="ink" fill="none" stroke-width="${BODY_W}" stroke-linecap="round" d="${cPath(gap[0], gap[1])}"/>`;
  s += neckD(acc.neck, sw);
  let fs = '';
  if (fc.blush > .02) {
    fs += `<g class="blush" opacity="${f(fc.blush * .8)}"><ellipse cx="${f(99 + lx)}" cy="146" rx="11" ry="5.5"/><ellipse cx="${f(167 + lx)}" cy="146" rx="11" ry="5.5"/></g>`;
  }
  const close = o.eyeClose || 0;
  fc.eyes.forEach((e, i) => {
    const ee = { ...e };
    if ((ee.shape === 'ring' || ee.shape === 'lid') && o.blink) ee.ry *= (1 - o.blink);
    const cx = EYES[i][0] + lx, cy = EYES[i][1] + ly;
    const tr = close > .01 ? ` transform="translate(0 ${f(cy)}) scale(1 ${f(Math.max(.08, 1 - close) * 100) / 100}) translate(0 ${f(-cy)})"` : '';
    fs += `<path class="eye" fill="none" stroke-width="${e.sw || 12}" stroke-linecap="round" stroke-linejoin="round"${tr} d="${eyePath(ee, cx, cy)}"/>`;
  });
  fs += glassesD(acc.glasses, lx * .4, ly * .3);
  if (fc.brows) {
    const bx = lx * .5, by = ly * .4;
    const d = fc.brows === 'angry'
      ? `M${f(98 + bx)} ${f(88 + by)}L${f(124 + bx)} ${f(97 + by)}M${f(152 + bx)} ${f(97 + by)}L${f(178 + bx)} ${f(88 + by)}`
      : `M${f(98 + bx)} ${f(96 + by)}L${f(123 + bx)} ${f(88 + by)}M${f(153 + bx)} ${f(88 + by)}L${f(178 + bx)} ${f(96 + by)}`;
    fs += `<path class="ink" fill="none" stroke-width="9" stroke-linecap="round" d="${d}"/>`;
  }
  s += faceG(fs);
  s += sideFront(acc.side, sw);
  s += headFront(acc.head, sw, t);
  if (fc.orbit) {
    const top = HEAD_TOP[acc.head] ?? 12;
    for (let i = 0; i < 3; i++) {
      const a = t * 3.2 + i * 2.094, sn = Math.sin(a);
      s += `<circle class="eye" fill="none" stroke-width="4" cx="${f(128 + 62 * Math.cos(a))}" cy="${f(top + 12 * sn)}" r="${sn < 0 ? 5 : 7}" opacity="${sn < 0 ? .55 : 1}"/>`;
    }
  }
  if (fc.listen) {
    // sound waves drifting in toward the face
    for (let i = 0; i < 3; i++) {
      const p = (t * .9 + i / 3) % 1, r = 46 - 30 * p, a0 = -.55, a1 = .55;
      s += `<path class="eye" fill="none" stroke-width="7" stroke-linecap="round" opacity="${f(Math.sin(Math.PI * p))}" d="M${f(196 + r * Math.cos(a0))} ${f(104 + r * Math.sin(a0))}A${f(r)} ${f(r)} 0 0 1 ${f(196 + r * Math.cos(a1))} ${f(104 + r * Math.sin(a1))}"/>`;
    }
  }
  if (fc.think) {
    // three rings rising from the head, the eye's own shape
    for (let i = 0; i < 3; i++) {
      const k = ((t * .8 + i / 3) % 1);
      s += `<circle class="eye" fill="none" stroke-width="5" cx="${f(214 + 10 * i)}" cy="${f(46 - 22 * i - 6 * k)}" r="${4 + 3 * i}" opacity="${f(.4 + .6 * Math.sin(Math.PI * k))}"/>`;
    }
  }
  if (fc.sweat) s += `<path class="tearf" transform="translate(56 ${f(64 + 3 * Math.sin(t * 7))}) scale(1.3)" d="${DROP}"/>`;
  if (fc.anger) {
    const k = 1 + .12 * Math.sin(t * 10);
    s += `<g class="angry" transform="translate(210 44) scale(${f(k * 10) / 10})" fill="none" stroke-width="7" stroke-linecap="round"><path d="M-13 -4Q-4 -4 -4 -13M4 -13Q4 -4 13 -4M13 4Q4 4 4 13M-4 13Q-4 4 -13 4"/></g>`;
  }
  if (fc.bang) s += `<g transform="translate(222 30)"><path class="ink" fill="none" stroke-width="11" stroke-linecap="round" d="M0 -18V4"/><circle class="inkf" cx="0" cy="18" r="5.5"/></g>`;
  if (fc.question) s += `<g transform="translate(222 30)"><path class="ink" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" d="M-10 -12Q-10 -24 0 -24Q11 -24 11 -13Q11 -5 0 -1V5"/><circle class="inkf" cx="0" cy="18" r="5.5"/></g>`;
  // what sits on the face goes with it
  let fx = '';
  if (fc.gloom) {
    // three short downward strokes under the top of the ring: 无语
    fx += `<g class="ink" fill="none" stroke-width="5" stroke-linecap="round" opacity=".55">${[[118, 84], [134, 90], [150, 84]].map(([x, y1]) => `<path d="M${f(x + lx * .5)} 70V${y1}"/>`).join('')}</g>`;
  }
  if (fc.sparkle) {
    // a twinkling four-point glint inside each eye ring
    EYES.forEach(([ex, ey], i) => {
      const k = .8 + .3 * Math.sin(t * 7 + i * 2);
      fx += `<path class="eye" fill="none" stroke-width="4" stroke-linecap="round" transform="translate(${f(ex + lx)} ${f(ey + ly - 1)}) scale(${f(k)})" d="M0 -8V8M-8 0H8"/>`;
    });
  }
  if (fc.streams) {
    // tears running from each eye down the cheek (`streams` may be { a, len, w }: fainter, shorter, thinner tracks)
    const st = fc.streams === true ? {} : fc.streams, L = 46 * (st.len ?? 1), W = st.w ?? 1;
    EYES.forEach(([ex, ey], i) => {
      const w = 2 * Math.sin(t * 6 + i), x = ex + lx;
      fx += `<path class="tearf" opacity="${f(.75 * (st.a ?? .95) / .95)}" d="M${f(x - 5 * W)} ${f(ey + 6)}Q${f(x - 7 * W + w)} ${f(ey + 6 + L * .52)} ${f(x - 3 * W)} ${f(ey + 6 + L)}L${f(x + 5 * W)} ${f(ey + 6 + L)}Q${f(x + 3 * W + w)} ${f(ey + 6 + L * .52)} ${f(x + 5 * W)} ${f(ey + 6)}Z"/>`;
    });
  }
  s += faceG(fx);
  if (o.zmark) s += '<path class="eye" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M204 22H220L204 42H220M226 4H236L226 16H236"/>';
  s += propD(g, t);
  if (fc.crack > .01) {
    // turned to stone: a crack splitting the top of the ring, running down as it goes
    s += `<path fill="none" stroke="#f2f3f6" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="${f(fc.crack)} 1" d="M120 18L135 32L121 45L137 58L127 70"/>`;
  }
  s += '</g>';
  // ...and gone grey
  if (fc.stone > .01) s = `<g style="filter:grayscale(${f(fc.stone)}) brightness(${f(1 + .5 * fc.stone)})">${s}`;
  if (L > .02) {
    // two round paws on the floor in front, the chin (the lower tip) on the first; bobbing as she talks and slapping
    // down for the thump fidget
    const py = -1.5 * (o.talk || 0) - (g?.kind === 'thump' ? 5 * gs : 0);
    s += `</g><path class="ink" fill="none" stroke-width="24" stroke-linecap="round" opacity="${f(clamp((L - .02) * 4, 0, 1))}" d="M196 ${f(244 + py)}h${f(16 * L)}M222 ${f(244 + py)}h${f(16 * L)}"/>`;
  }
  if (fc.stone > .01) s += '</g>';
  return s;
}

/**
 * Coo's cup or book (the `sip` and `read` gestures): held up in two round paws inside the ring, under the eyes.
 * The cup steams and comes up for the sip; the book's pages turn now and then.
 */
function propD(g, t) {
  const hold = g?.kind === 'sip' || g?.kind === 'read' ? envelope(g.k, .1, .88) : 0;
  if (hold < .01) return '';
  const up = (1 - hold) * 30, ink = 'class="ink" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  let p = '';
  if (g.kind === 'sip') {
    // the mug's rim at y, the handle toward where it faces
    const x = 126, y = 150 + up - 16 * envelope(clamp((g.k - .38) / .26, 0, 1), .3, .6);
    p += `<path ${ink} stroke-width="11" d="M${x - 22} ${f(y)}V${f(y + 30)}Q${x - 22} ${f(y + 42)} ${x - 10} ${f(y + 42)}H${x + 10}Q${x + 22} ${f(y + 42)} ${x + 22} ${f(y + 30)}V${f(y)}ZM${x + 22} ${f(y + 9)}q15 0 15 12t-15 12"/>`;
    for (let i = 0; i < 2; i++) {
      const q = (t * .7 + i / 2) % 1, sx = x - 5 + 10 * i + 3 * Math.sin(t * 2 + i * 2 + q * 5), sy = y - 6 - 16 * q;
      p += `<path ${ink} stroke-width="5" opacity="${f(.55 * Math.sin(Math.PI * q) * hold)}" d="M${f(sx)} ${f(sy)}q4 -4 0 -8t0 -8"/>`;
    }
    p += `<path ${ink} stroke-width="22" d="M${x - 30} ${f(y + 24)}h.1M${x + 32} ${f(y + 26)}h.1"/>`;
  } else {
    // an open book, its spine at the bottom middle; now and then a page lifts off the right and lays down on the left
    const x = 128, y = 190 + up, q = ((g.k * 4.4) % 2.2) / .5;
    p += `<path ${ink} stroke-width="9" d="M${x} ${f(y)}Q${x - 22} ${f(y - 10)} ${x - 44} ${f(y - 5)}V${f(y - 38)}Q${x - 22} ${f(y - 43)} ${x} ${f(y - 32)}Q${x + 22} ${f(y - 43)} ${x + 44} ${f(y - 38)}V${f(y - 5)}Q${x + 22} ${f(y - 10)} ${x} ${f(y)}ZM${x} ${f(y - 32)}V${f(y)}"/>`;
    if (q < 1) {
      const a = Math.PI * smooth(q), tx = x + 42 * Math.cos(a), ty = -14 * Math.sin(a);
      p += `<path ${ink} stroke-width="7" d="M${x} ${f(y)}L${f(tx)} ${f(y - 6 + ty)}L${f(tx)} ${f(y - 38 + ty)}L${x} ${f(y - 32)}"/>`;
    }
    p += `<path ${ink} stroke-width="22" d="M${x - 46} ${f(y - 18)}h.1M${x + 46} ${f(y - 18)}h.1"/>`;
  }
  return hold < .99 ? `<g opacity="${f(clamp(hold * 3, 0, 1))}">${p}</g>` : p;
}

/** A static figure for previews and tiles. */
export function mini(face, acc, t = 0, extra = {}) {
  return figure(FACES[face].f(t), { look: [0, 0], legs: STAND, low: 0, t, blink: 0, acc, ...extra });
}

/* ---------- skin ---------- */
/**
 * The body is `figure`: `coo`, drawn here, or the id of a figure pack (src/packs.ts, drawn by
 * figure-sandbox.js); `scheme` is the pack's dress-up pick. Whether a pack with that id is installed
 * is the pages' to find out: an id that is not falls back to Coo there.
 */
const FIGURE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
export function defaultSkin() {
  return { figure: 'coo', scheme: 'deepseek', palette: 'mint', head: 'none', side: 'none', glasses: 'none', neck: 'none', colors: JSON.parse(JSON.stringify(CHANNEL_DEFAULT)) };
}
const validColor = (slot, v) => (v === 'eye' || (v === 'body' && !NO_BODY[slot]) || ACC_COLORS.some(c => c.id === v));
/** Keeps what is valid in `raw`, defaults the rest. */
export function normalizeSkin(raw) {
  const skin = defaultSkin();
  if (!raw || typeof raw !== 'object') return skin;
  if (typeof raw.figure === 'string' && FIGURE_ID.test(raw.figure)) skin.figure = raw.figure;
  // a pack lists its picks in its manifest; it falls back to its first for one it does not know
  if (typeof raw.scheme === 'string' && /^[a-z0-9-]{1,32}$/.test(raw.scheme)) skin.scheme = raw.scheme;
  if (PALETTES.some(p => p.id === raw.palette)) skin.palette = raw.palette;
  for (const slot of SLOTS) if (SLOT_LISTS[slot].some(h => h[0] === raw[slot])) skin[slot] = raw[slot];
  for (const slot of SLOTS) for (const ch of ['main', 'acc']) {
    const v = raw.colors?.[slot]?.[ch];
    if (validColor(slot, v)) skin.colors[slot][ch] = v;
  }
  return skin;
}
/** Picking an item: fills the character colors of pieces that carry them. */
export function wear(skin, slot, id) {
  const next = { ...skin, colors: JSON.parse(JSON.stringify(skin.colors)) };
  next[slot] = id;
  if (ITEM_COLORS[id]) Object.assign(next.colors[slot], ITEM_COLORS[id]);
  return next;
}
function channelValue(skin, slot, ch, dark) {
  const v = skin.colors[slot][ch];
  if (v === 'body') return 'var(--skin-ink)';
  if (v === 'eye') return 'var(--skin-eye)';
  const c = ACC_COLORS.find(x => x.id === v);
  return dark ? c.d : c.l;
}
/** CSS custom properties for one theme side. */
export function skinVars(skin, dark) {
  const p = PALETTES.find(x => x.id === skin.palette) || PALETTES[0];
  let s = `--skin-ink:${p[dark ? 'd' : 'l'][0]};--skin-eye:${p[dark ? 'd' : 'l'][1]};`;
  for (const slot of SLOTS) for (const ch of ['main', 'acc']) s += `--c-${slot}-${ch}:${channelValue(skin, slot, ch, dark)};`;
  return s;
}
/** A stylesheet applying `skin` under `selector`, following the page's light/dark choice. */
export function skinCss(skin, selector = 'html:root') {
  return `${selector}{${skinVars(skin, false)}}` +
    `@media (prefers-color-scheme: dark){${selector}:not([data-theme="light"]){${skinVars(skin, true)}}}` +
    `${selector}[data-theme="dark"]{${skinVars(skin, true)}}`;
}

/* ---------- the pages' round buttons: icons (24 units, currentColor) and the theme switch ---------- */
const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  chat: icon('<path d="M6 4.5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-4.5 3.5v-3.5H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3z"/>'),
  moon: icon('<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v1.6M12 19.6v1.6M2.8 12h1.6M19.6 12h1.6M5.5 5.5l1.1 1.1M17.4 17.4l1.1 1.1M5.5 18.5l1.1-1.1M17.4 6.6l1.1-1.1"/>'),
  play: icon('<path d="M8 5.5v13l10.5-6.5z"/>'),
  pause: icon('<path d="M9 5.5v13M15 5.5v13"/>'),
  // eight flat teeth around a hub
  settings: icon(`<path d="${Array.from({ length: 32 }, (_, i) => {
    const a = (i - .5) * Math.PI / 16, r = i % 4 < 2 ? 9.6 : 7.2;
    return `${i ? 'L' : 'M'}${f(12 + r * Math.cos(a))} ${f(12 + r * Math.sin(a))}`;
  }).join('')}Z"/><circle cx="12" cy="12" r="3"/>`),
  power: icon('<path d="M12 3.5v8M7.2 6.3a8 8 0 1 0 9.6 0"/>'),
  mic: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>'),
  // the same microphone struck through
  micOff: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M4 4l16 16"/>'),
  sound: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: icon('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  // a T-shirt: the dressing page
  shirt: icon('<path d="M8.5 3.5 4 6l-1.5 4.5L6 12v8.5h12V12l3.5-1.5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z"/>'),
  eye: icon('<path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="3"/>'),
  // a page that opens in the browser
  external: icon('<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
  eyeOff: icon('<path d="M3 12s3.2-6 9-6c1.6 0 3 .4 4.2 1M21 12s-3.2 6-9 6c-1.6 0-3-.4-4.2-1"/><path d="M9.9 14.1a3 3 0 0 1 4.2-4.2M4 4l16 16"/>'),
  // how much the pet walks on its own, as a gauge: low, middle, high
  roam_off: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16 7 13.2"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),
  roam_calm: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16V10"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>'),
  roam_free: icon('<path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l5-2.8"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/><path d="M19.5 6.5l1.5-1.5M21 10h1.5"/>'),
};
/** Sets `theme` ('dark' | 'light') on the page; `button`, when given, shows the mode a click switches to. */
export function applyTheme(theme, button) {
  document.documentElement.dataset.theme = theme;
  if (!button) return;
  const toLight = theme === 'dark';
  button.innerHTML = toLight ? ICONS.sun : ICONS.moon;
  button.title = toLight ? '切到白天模式' : '切到夜间模式';
  button.setAttribute('aria-label', button.title);
}

/* ---------- sound: synthesized with Web Audio, no files ---------- */
/** Which kind each sound belongs to; a kind can be silenced on its own (`sfx.configure`). */
export const SOUND_KINDS = {
  move: ['step', 'skid', 'jump', 'land', 'whoosh', 'chirps', 'shake', 'nod', 'spin', 'shiver', 'dance', 'flinch', 'look', 'peek', 'away', 'roll', 'sip', 'page', 'spout', 'sigh'],
  touch: ['grab', 'squeak', 'purr', 'poke'],
  face: ['happy', 'wink', 'love', 'surprised', 'angry', 'sad', 'shy', 'yawn', 'soft', 'wry', 'hehe', 'crack'],
  snore: ['snore'],
  talk: ['babble', 'blub'],
  ui: ['tick', 'pop', 'sparkle', 'select', 'listenStart', 'listenEnd'],
};
export function createSfx({ storageKey = 'cortico-pet.sound.v1', volume = .55 } = {}) {
  let ctx = null, master = null, unlocked = false, on = true, noiseBuf = null, gainValue = volume;
  // kinds turned off, and seconds of snoring per sleep (0 = the whole sleep)
  let muted = new Set(), snoreSeconds = 0;
  try { on = localStorage.getItem(storageKey) !== 'off'; } catch (e) { /* default on */ }
  const R = (a, b) => a + Math.random() * (b - a);
  function ready() {
    if (!on || !unlocked || document.hidden) return null;
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain(); master.gain.value = gainValue;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone({ type = 'sine', f0 = 440, f1 = f0, dur = .1, vol = .2, at = 0, attack = .005, vib = 0, vibRate = 0, filter = 0 }) {
    const c = ready(); if (!c) return;
    const t0 = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = vibRate; lg.gain.value = vib;
      l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + .05);
    }
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    let node = o;
    if (filter) { const bq = c.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = filter; o.connect(bq); node = bq; }
    node.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .03);
  }
  function noise({ type = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = .2, vol = .15, at = 0, attack = .01 }) {
    const c = ready(); if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + at, s = c.createBufferSource(), bq = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; bq.type = type; bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t0);
    bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    s.connect(bq); bq.connect(g); g.connect(master);
    s.start(t0, Math.random() * .5); s.stop(t0 + dur + .03);
  }
  const api = {
    unlock() { unlocked = true; ready(); },
    isOn: () => on,
    set(v) { on = v; try { localStorage.setItem(storageKey, v ? 'on' : 'off'); } catch (e) { /* not persisted */ } },
    volume(v) { gainValue = v; if (master) master.gain.value = v; },
    /** `kinds`: kind → on (SOUND_KINDS); `snoreSeconds`: snoring stops this long into a sleep, 0 = never. */
    configure({ kinds, snoreSeconds: s } = {}) {
      if (kinds) muted = new Set(Object.keys(SOUND_KINDS).filter((k) => kinds[k] === false));
      if (typeof s === 'number' && s >= 0) snoreSeconds = s;
    },
    step(run, i) {
      const k = run ? 1.25 : 1;
      tone({ f0: (i ? 520 : 440) * k, f1: (i ? 380 : 330) * k, dur: .06, vol: run ? .07 : .05 });
      if (run) noise({ f0: 2500, q: .8, dur: .05, vol: .03 });
    },
    skid() { noise({ type: 'highpass', f0: 1800, f1: 900, dur: .22, vol: .08 }); },
    jump() { tone({ type: 'triangle', f0: 200, f1: 720, dur: .24, vol: .22, vib: 40, vibRate: 22 }); },
    land(hard) {
      tone({ f0: hard ? 160 : 190, f1: 48, dur: hard ? .28 : .16, vol: hard ? .4 : .25 });
      noise({ type: 'lowpass', f0: hard ? 700 : 500, f1: 120, dur: .12, vol: hard ? .25 : .12 });
      if (hard) tone({ type: 'square', f0: 420, f1: 300, dur: .08, vol: .06, at: .02, filter: 1600 });
    },
    grab() { tone({ type: 'triangle', f0: 680, f1: 1500, dur: .14, vol: .18, vib: 60, vibRate: 30 }); },
    squeak() { tone({ type: 'triangle', f0: R(900, 1200), f1: R(1300, 1700), dur: .09, vol: .08, vib: 40, vibRate: 35 }); },
    whoosh() { noise({ f0: 300, f1: 2400, q: 1.4, dur: .38, vol: .22, attack: .08 }); },
    chirps() { for (let i = 0; i < 3; i++) tone({ f0: 2300 + i * 120, f1: 3200, dur: .06, vol: .06, at: i * .11 }); },
    shake() { for (let i = 0; i < 5; i++) tone({ type: 'square', f0: 180, f1: 160, dur: .05, vol: .05, at: i * .06, filter: 900 }); },
    hmm() { tone({ type: 'triangle', f0: 330, f1: 360, dur: .12, vol: .08 }); tone({ type: 'triangle', f0: 392, f1: 470, dur: .16, vol: .08, at: .14 }); },
    yawn() { tone({ type: 'triangle', f0: 520, f1: 240, dur: 1, vol: .1, vib: 12, vibRate: 5, filter: 1500, attack: .15 }); },
    /** `asleepFor`: seconds since this sleep began. */
    snore(asleepFor = 0) {
      if (snoreSeconds > 0 && asleepFor > snoreSeconds) return;
      noise({ type: 'lowpass', f0: 250, f1: 700, dur: .7, vol: .09, attack: .35 });
    },
    purr() { tone({ type: 'sawtooth', f0: 62, f1: 58, dur: .9, vol: .08, vib: 6, vibRate: 24, filter: 320, attack: .1 }); },
    poke() { tone({ f0: 320, f1: 200, dur: .09, vol: .16 }); },
    shiver() { for (let i = 0; i < 8; i++) tone({ type: 'square', f0: 900, f1: 820, dur: .03, vol: .035, at: i * .07, filter: 2400 }); },
    // looking about and peeking hum like the thinking 'hmm', but count as motion sounds
    look() { api.hmm(); },
    peek() { api.hmm(); },
    // turning away in a huff: a soft swish, the whoosh's voice turned down
    huff() { noise({ f0: 1400, f1: 500, q: 1.2, dur: .26, vol: .09, attack: .06 }); },
    away() { api.huff(); },
    // a tumble: a low rumble along the floor, then a soft bump as she lands on her feet (timed to the roll's own beats)
    roll() {
      noise({ type: 'lowpass', f0: 260, f1: 900, dur: .7, vol: .1, attack: .2, at: .3 });
      tone({ f0: 190, f1: 60, dur: .14, vol: .16, at: 1.2 });
    },
    // a sip at the top of the lift, then a contented little "ah"
    sip() {
      noise({ f0: 700, f1: 1500, q: 3, dur: .3, vol: .05, at: 1.55 });
      tone({ type: 'triangle', f0: 440, f1: 392, dur: .35, vol: .07, at: 2.1 });
    },
    // a sigh: a short breath in, then a long, soft breath out
    sigh() {
      noise({ type: 'lowpass', f0: 400, f1: 900, dur: .35, vol: .035, attack: .12 });
      noise({ type: 'lowpass', f0: 900, f1: 250, dur: .9, vol: .07, attack: .25, at: .75 });
    },
    // a whale's spout: a pop as it goes up, the hiss of the column, then the spray pattering down
    spout() {
      tone({ f0: 300, f1: 900, dur: .08, vol: .12, at: .36 });
      noise({ f0: 1200, f1: 2600, q: 1.2, dur: .45, vol: .09, attack: .03, at: .4 });
      for (let i = 0; i < 4; i++) tone({ f0: R(1800, 2400), dur: .03, vol: .03, at: .95 + i * .08 });
    },
    // the book opening: two papery rustles
    page() { noise({ type: 'highpass', f0: 3200, f1: 1600, dur: .16, vol: .05 }); noise({ type: 'highpass', f0: 2800, f1: 1400, dur: .2, vol: .04, at: .22 }); },
    flinch() { tone({ type: 'triangle', f0: 900, f1: 1400, dur: .09, vol: .12 }); noise({ type: 'highpass', f0: 2400, f1: 1200, dur: .12, vol: .05 }); },
    dance() { [523, 659, 784, 659, 880].forEach((fr, i) => tone({ type: 'triangle', f0: fr, dur: .13, vol: .09, at: i * .15 })); },
    nod() { tone({ type: 'triangle', f0: 520, f1: 440, dur: .07, vol: .08 }); tone({ type: 'triangle', f0: 520, f1: 440, dur: .07, vol: .08, at: .2 }); },
    spin() { tone({ type: 'triangle', f0: 300, f1: 1200, dur: .3, vol: .12, vib: 30, vibRate: 18 }); },
    happy() { tone({ type: 'triangle', f0: 660, f1: 700, dur: .1, vol: .14 }); tone({ type: 'triangle', f0: 990, f1: 1050, dur: .14, vol: .14, at: .09 }); },
    wink() { tone({ f0: 1760, dur: .5, vol: .1 }); tone({ f0: 2637, dur: .45, vol: .06, at: .04 }); },
    love() { tone({ f0: 480, f1: 820, dur: .1, vol: .14 }); tone({ f0: 600, f1: 1000, dur: .12, vol: .14, at: .13 }); },
    surprised() { tone({ f0: 380, f1: 1500, dur: .2, vol: .16, vib: 15, vibRate: 12 }); },
    angry() { tone({ type: 'sawtooth', f0: 120, f1: 95, dur: .5, vol: .12, vib: 12, vibRate: 14, filter: 700 }); },
    sad() { tone({ type: 'triangle', f0: 440, f1: 392, dur: .3, vol: .13, vib: 8, vibRate: 6 }); tone({ type: 'triangle', f0: 392, f1: 262, dur: .55, vol: .13, at: .3, vib: 10, vibRate: 5 }); },
    shy() { tone({ f0: 1300, f1: 1600, dur: .07, vol: .07 }); tone({ f0: 1450, f1: 1750, dur: .07, vol: .06, at: .1 }); },
    // a warm, low two-note hum (gentle); a laugh running out of air (awkward); stifled little giggles
    soft() { tone({ type: 'triangle', f0: 523, f1: 540, dur: .2, vol: .07, attack: .05 }); tone({ type: 'triangle', f0: 659, f1: 640, dur: .3, vol: .06, at: .18, attack: .05 }); },
    wry() { [660, 600, 520].forEach((fr, i) => tone({ type: 'triangle', f0: fr, f1: fr * .93, dur: .08, vol: .07, at: i * .11 })); },
    // stone cracking: a sharp snap and a crumble
    crack() { tone({ type: 'square', f0: 1400, f1: 500, dur: .05, vol: .06, filter: 2600 }); noise({ type: 'highpass', f0: 2600, f1: 900, dur: .35, vol: .07, at: .04 }); },
    hehe() { for (let i = 0; i < 3; i++) tone({ type: 'triangle', f0: 620 - i * 30, f1: 520 - i * 30, dur: .06, vol: .07, at: i * .12, filter: 900 }); },
    expr(n) {
      const m = {
        happy: 'happy', wink: 'wink', love: 'love', surprised: 'surprised', angry: 'angry', sad: 'sad', shy: 'shy', sleepy: 'yawn',
        smug: 'wink', worried: 'hmm', determined: 'pop', flustered: 'shy', scared: 'surprised', excited: 'sparkle', cry: 'sad', confused: 'hmm',
        disgusted: 'hmm', nervous: 'hmm', gentle: 'soft', awkward: 'wry', giggle: 'hehe', moved: 'soft', petrify: 'surprised',
      };
      // an expression's sound is a face sound, whichever tone it borrows
      if (m[n] && !muted.has('face')) api[m[n]]();
    },
    tick() { tone({ f0: 1200, f1: 1000, dur: .03, vol: .05 }); },
    pop() { tone({ f0: 240, f1: 720, dur: .07, vol: .14 }); },
    sparkle() { [1568, 2093, 2637].forEach((fr, i) => tone({ f0: fr, dur: .25, vol: .06, at: i * .06 })); },
    select() { tone({ type: 'triangle', f0: 520, f1: 1040, dur: .1, vol: .12 }); },
    babble(ch) {
      const fr = 330 + (ch.codePointAt(0) % 9) * 28;
      tone({ type: 'square', f0: fr, f1: fr * R(.85, 1.1), dur: .05, vol: .05, filter: 1800 });
    },
    blub() { tone({ f0: R(500, 700), f1: R(900, 1200), dur: .05, vol: .05 }); },
    listenStart() { tone({ f0: 880, dur: .12, vol: .1 }); tone({ f0: 1320, dur: .16, vol: .1, at: .1 }); },
    listenEnd() { tone({ f0: 1320, dur: .1, vol: .09 }); tone({ f0: 990, dur: .16, vol: .09, at: .09 }); },
  };
  for (const [kind, names] of Object.entries(SOUND_KINDS)) {
    for (const name of names) {
      const play = api[name];
      api[name] = (...args) => { if (!muted.has(kind)) play(...args); };
    }
  }
  return api;
}

/* ---------- actions the pet can be asked to do ---------- */
/** Expressions: a face held for a few seconds. */
export const EXPRESSIONS = ['neutral', 'happy', 'wink', 'love', 'shy', 'surprised', 'angry', 'sad', 'sleepy', 'thinking',
  'smug', 'pout', 'worried', 'determined', 'flustered', 'scared', 'excited', 'cry', 'confused', 'disgusted', 'nervous',
  'gentle', 'awkward', 'giggle', 'moved', 'petrify'];
/** A forward roll (`roll`) turns once, eased, over this part of the gesture; the body travels the same way. */
export const rollTurn = k => smooth(clamp((k - .2) / .6, 0, 1));
// how far one roll goes, in logo units: once round a ball of radius 100 (Coo's ring is 102 to its outer edge)
export const ROLL_D = 2 * Math.PI * 100;
/** Motions: things the body does. `sit`, `sleep` and `lie` last until something else happens. */
export const MOTIONS = ['stand', 'jump', 'hop', 'look', 'turn', 'nod', 'shake', 'spin', 'sit', 'sleep', 'lie', 'dizzy', 'walk', 'run',
  'wave', 'bow', 'shiver', 'flap', 'dance', 'flinch', 'peek', 'cheer', 'heart', 'away', 'roll', 'sip', 'read', 'spout', 'sigh'];
/** Body modes in which the figure travels across the stage or squashes fast (dancing steps and sways on the spot). */
const MOVING_MODES = new Set(['drag', 'air', 'crouch', 'land', 'walk', 'run', 'dance']);
/** Modes resting on the floor, seated or lying: the body gets up (`wake`) before it does anything else. */
const REST = new Set(['sit', 'sleep', 'lie']);
/** Small idle movements while lying, as short gestures (kind → seconds): a kick of the feet, the chin dipped, a tail thump. */
const FIDGETS = { kick: 1.2, chin: 1.6, thump: .5 };
/** Lying, the raised foot kicks slowly, by face [size, pace]: livelier when happy, quick when angry, hardly when sad, still asleep. */
const KICK = { happy: [1.6, 1.6], love: [1.6, 1.6], excited: [1.6, 1.8], angry: [1, 2.6], sad: [.3, .7], cry: [.3, .7], sleep: [0, 1] };

/* ---------- the live pet: simulation, rendering, pointer ---------- */
/**
 * `els`: { svg, petG, shadowEl, fxG } inside a stage element that receives pointer events.
 * `opts.bounds()` returns { W, H, floorY, S } in stage pixels.
 * `opts.onEvent(kind, detail)` reports what happened to the body: arrived, interrupted, touch, mode.
 * `opts.enter: 'drop'` starts the pet above the top edge, falling to the floor.
 * `opts.figure`, when given, draws the body instead of the built-in one: `figure.draw(petG, face, frame)` keeps
 * its own elements inside `petG` (same logo space, feet at y=256). Its frame adds the face's name, the mode,
 * how long the mode has run, the talk level, drowsiness and how far the body sits; `lie` (0..1) is how far it lies
 * on its front (always over a full sit, so a figure that cannot lie just stays seated) and `prone` says the rest it is
 * in (lying, or a sleep begun lying, until it is up) is a lying one.
 * `figure.groupTilt(mode, tilt, lean)`, if present, returns the rotation (degrees) the whole group gets
 * instead of tilt + lean; the frame carries tilt, lean and that rotation (groupRot) so the figure can bend the rest.
 * `figure.colors.z`, if present, colours the sleep z's (otherwise they take the skin's eye colour).
 * `figure.gestures`, if present, names the short gestures (nod, shake) the figure draws itself: the body then
 * leaves them out, and the frame's `gesture` ({ kind, k: 0..1 }, or null) says which one is playing and how far.
 * A figure that does not list `away` turns to face the other way for it instead (the frame's `facing` going round).
 * While lying, the fidgets in `FIDGETS` come as gestures too; the body itself does nothing with them.
 * `figure.anchors.lie`, if present, holds the same points (plus `hit`: [cx, cy, rx, ry] and `halfW`) for the lying pose,
 * in logo units with the hips' sink already in; `figure.poses.lie === false` says the pose cannot show right now.
 * `figure.poses.back === true` says the figure draws its own back view: turning round, the group is then never squeezed
 * below 85% of its width (it flips at the middle) and the figure shows the turn from the frame's `facing` (-1..1).
 */
export function createPet(els, opts) {
  const { petG, shadowEl, fxG } = els;
  let custom = opts.figure || null;
  const sfx = opts.sfx;
  const onEvent = opts.onEvent || (() => {});
  let W = 0, H = 0, floorY = 0, S = .42, T = 0;
  let roam = opts.roam ?? 'free';
  let skin = opts.skin || defaultSkin();
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
    pulse: null, walkId: 0, listening: false, thinking: false, placed: false, noteAt: 0, tearN: 0, exprAt: 0,
    lieK: 0, prone: false, fidgetAt: 0, kickPh: 0, backK: 0, awayK: 0, breathK: 1,
  };
  const pointer = { x: -1e4, y: -1e4, inside: false, vx: 0, samples: [] };
  let press = null, strokeAcc = 0, petCool = 0;
  const P = [];

  // points on the body in logo units: where the eyes look from, where a tear starts (and under each eye, for crying),
  // where z's and hearts start, the bubble's spot, where a glint flashes, where a spout of water leaves the head;
  // `lie` is the same points carried through Coo's lying pose (lieXf at lie 1, hips sunk 29), with the lying body's
  // hit ellipse and half width (the raised foot reaches furthest)
  const COO_ANCHORS = {
    gaze: [140, 117], tear: [166, 136], tears: [[116, 136], [166, 136]], z: [196, 40], hearts: [90, 175, 34], bubble: [146, 0], glints: [[50, 30], [210, 30]],
    spout: [128, 30],
    lie: { gaze: [156, 164], tear: [181, 184], z: [226, 107], hearts: [114, 204, 90], bubble: [176, 64], glints: [[72, 74], [242, 101]], spout: [150, 88], hit: [138, 172, 114, 90], halfW: 132 },
  };
  // a figure's anchors replace Coo's; its lying points are its own or none
  const anchorsOf = fig => (fig ? { ...COO_ANCHORS, lie: undefined, ...fig.anchors } : COO_ANCHORS);
  let A = anchorsOf(custom);
  /** The lying points, while the figure can show the pose. */
  const lieSet = () => (custom?.poses && !custom.poses.lie ? null : A.lie);
  /** How far the body lies, for where it is: 0 for a figure that has no lying points (it stays seated). */
  const proneK = () => (lieSet() ? pet.lieK : 0);
  const lerpPt = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  /** Anchor `k` blended into its lying point; upright it sinks with the hips by `low`. */
  const ancPt = (k, low = pet.low) => {
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
  function hitPet(p) {
    const hit = lieSet()?.hit;
    if (hit && proneK() > .5) {
      const c = toStage(hit[0], hit[1]);
      return ((p.x - c.x) / (hit[2] * S)) ** 2 + ((p.y - c.y) / (hit[3] * S)) ** 2 < 1;
    }
    const c = toStage(128, 128);
    return Math.hypot(p.x - c.x, p.y - c.y) < 108 * S;
  }

  function setMode(m, o = {}) {
    const prev = pet.mode;
    // an arrival clears walkId before going idle, so anything else that ends a walk (a turn, a bow, listening) cuts it short
    if ((prev === 'walk' || prev === 'run') && pet.walkId) {
      onEvent('interrupted', { walkId: pet.walkId, x: Math.round(pet.x), by: m });
      pet.walkId = 0;
    }
    // a flinch's step back is over once anything but standing takes over (a walk, a drag, a fall)
    if (pet.pulse?.kind === 'flinch' && m !== 'idle') pet.pulse.dx = 0;
    // ...and a roll is over (picked up mid-roll, say)
    if (pet.pulse?.kind === 'roll' && m !== 'idle') pet.pulse = null;
    // a back turned in a huff lasts through standing and sitting about; anything else turns her round again
    if (pet.pulse?.kind === 'away' && m !== 'idle' && m !== 'sit' && m !== 'sleep') pet.pulse = null;
    pet.mode = m; pet.modeT = 0; pet.turned = false; pet.startle = false; pet.skid = false; pet.cue = 0;
    // a lying rest stays lying through its sleep and the getting up; anything else ends it
    // ...and getting up goes back through lying only if she got that far down
    if ((!REST.has(m) && m !== 'wake') || (m === 'wake' && pet.lieK < .5)) pet.prone = false;
    // a lying fidget is over once she is not lying
    if (FIDGETS[pet.pulse?.kind] && m !== 'lie') pet.pulse = null;
    Object.assign(pet, o);
    if (prev !== m) onEvent('mode', { mode: m });
  }
  // (a roll is under way too: the next order waits for her to be up again)
  const busy = () => pet.mode === 'drag' || pet.mode === 'air' || pet.mode === 'crouch' || pet.pulse?.kind === 'roll';
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
    pet.expr = null; pet.lastAct = a;
    const seated = REST.has(pet.mode);
    switch (a) {
      case 'stand': setMode(seated ? 'wake' : 'idle', seated ? { startle: false } : {}); pet.nextAt = T + 3; break;
      case 'walk': setMode('walk', { target: pickTarget(160) }); break;
      case 'run': setMode('run', { target: pet.x < W / 2 ? maxX(0) - rnd(0, 30) : minX(0) + rnd(0, 30) }); break;
      case 'jump': setMode('crouch', { jumpV: 720, jumpVx: pet.facing * 40 }); break;
      case 'hop': setMode('crouch', { jumpV: 480, jumpVx: 0 }); break;
      case 'look': setMode('look'); break;
      case 'turn': if (!seated) setMode('idle'); pet.facing *= -1; sfx.tick(); break;
      case 'nod': pulse('nod', .7); sfx.nod(); break;
      case 'shake': pulse('shake', .7); sfx.shake(); break;
      case 'spin': if (!seated) setMode('idle'); pulse('spin', .6); sfx.spin(); break;
      case 'sit': pet.prone = false; setMode('sit', { dur: 1e9 }); break;
      // asked to sleep while lying, she sleeps lying down
      case 'sleep': pet.prone = pet.mode === 'lie' || (pet.mode === 'sleep' && pet.prone); setMode('sleep', { dur: 1e9 }); break;
      case 'lie': pet.prone = true; setMode('lie', { dur: 1e9, fidgetAt: T + rnd(4, 8) }); break;
      case 'dizzy': setMode('dizzy'); break;
      case 'wave': pulse('wave', 1.6); holdFace('happy', 1.8); break;
      case 'bow': if (!seated) setMode('idle'); pulse('bow', 1.6); holdFace('bowing', 1.5); sfx.tick(); break;
      case 'shiver': pulse('shiver', 1.8); sfx.shiver(); break;
      case 'flap': setMode('crouch', { jumpV: 540, jumpVx: 0 }); pulse('flap', 1.4); holdFace('happy', 1.6); sfx.chirps(); break;
      // hands made into a heart for a figure that has hands; hearts float up from the love face either way
      case 'heart': pulse('heart', 2.2); holdFace('love', 2.4); sfx.love(); break;
      // a hooray: a little hop (none while seated), arms up for a figure that has them, a couple of glints
      case 'cheer': if (!seated) setMode('crouch', { jumpV: 420, jumpVx: 0 }); pulse('cheer', 1.8); holdFace('happy', 2); emitGlint(2); sfx.chirps(); break;
      case 'dance': setMode('dance', { dur: 3.2 }); holdFace('happy', 3.4); sfx.dance(); break;
      case 'flinch': {
        // a startled step back (less near the screen edge, none while seated) and back to normal
        if (!seated) setMode('idle');
        const room = pet.facing > 0 ? pet.x - minX() : maxX() - pet.x;
        pulse('flinch', .9);
        Object.assign(pet.pulse, { x0: pet.x, dx: seated || room < 4 ? 0 : -pet.facing * Math.min(room, 30 * S) });
        holdFace('surprised', 1.1); sfx.flinch(); break;
      }
      case 'peek':
        // lean in and look ahead; first turn to the pointer if it is behind
        if (!seated) setMode('idle');
        if (pointer.inside && (pointer.x - pet.x) * pet.facing < -40) pet.facing *= -1;
        pulse('peek', 2.4); holdFace('peeking', 2.4); sfx.peek(); break;
      // back turned in a huff for a while, then round again (Coo hides her face, a figure with a back view shows it,
      // any other figure looks the other way);
      // lying on her front, only the pout
      case 'away':
        if (pet.prone && lieSet() && pet.mode !== 'wake') { holdFace('pout', 3.2); sfx.away(); break; }
        if (!seated) setMode('idle');
        pulse('away', 3.2); holdFace('pout', 3.2); sfx.away(); break;
      // a forward roll along the floor and up again (from sitting or lying she gets up into it);
      // with little room ahead and more behind she turns round first
      case 'roll': {
        setMode('idle');
        const room = d => (d > 0 ? maxX(0) - pet.x : pet.x - minX(0)), far = ROLL_D * S;
        if (room(pet.facing) < far && room(-pet.facing) > room(pet.facing)) pet.facing *= -1;
        pulse('roll', 1.5);
        Object.assign(pet.pulse, { x0: pet.x, dx: pet.facing * clamp(room(pet.facing), 0, far) });
        holdFace('happy', 1.9); sfx.roll(); break;
      }
      // a sigh: drawing a breath, then sagging as it goes out
      case 'sigh': pulse('sigh', 2); holdFace('sighing', 2.1); sfx.sigh(); break;
      // a whale's spout from the top of the head: a little crouch, then a column of water and its spray falling back
      case 'spout': pulse('spout', 1.6); holdFace('happy', 1.9); sfx.spout(); break;
      // both hands round a warm cup, a sip halfway through; a book held up to read, the eyes running along the lines
      // (a figure with hands draws them; Coo holds a little one of its own)
      case 'sip': pulse('sip', 3.6); holdFace('sipping', 3.7); sfx.sip(); break;
      case 'read': pulse('read', 4.4); holdFace('reading', 4.4); sfx.page(); break;
      default: return false;
    }
    return true;
  }
  function pulse(kind, dur) { pet.pulse = { kind, t0: T, dur }; }
  /** A motion's own face, without the expression's sound and bounce (act() has just cleared any held face). */
  function holdFace(n, seconds) { pet.expr = n; pet.exprAt = T; pet.exprUntil = T + seconds; pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6); }

  function setExpr(n, seconds) {
    if (n === 'sleep') { act('sleep'); return; }
    if (busy()) return;
    if (n === 'dragged') {
      pet.expr = null;
      pet.vy = -1150; pet.vx = rnd(-120, 120); pet.airKind = 'throw'; pet.sqv -= 3;
      sfx.whoosh(); sfx.jump();
      setMode('air'); return;
    }
    if (n === 'dizzy') { pet.expr = null; setMode('dizzy'); return; }
    if (pet.mode === 'look' || pet.mode === 'land') setMode('idle');
    // asked again while already stone, she stays as she is (starting over would flash her colour back)
    if (n === 'petrify' && pet.expr === 'petrify' && T < pet.exprUntil) return;
    // turned to stone she stops where she is
    if (n === 'petrify' && (pet.mode === 'walk' || pet.mode === 'run' || pet.mode === 'dance')) setMode('idle');
    pet.expr = n; pet.exprAt = T; pet.exprUntil = T + (seconds ?? (n === 'sleepy' ? 4.4 : 3.2));
    pet.nextAt = Math.max(pet.nextAt, pet.exprUntil + .6);
    pet.sqv += n === 'surprised' ? -2.2 : .8;
    sfx.expr(n);
    if (n === 'love') for (let i = 0; i < 4; i++) emitHeart();
    if (n === 'happy' || n === 'smug') emitGlint(n === 'happy' ? 2 : 1);
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
    const opts2 = [['walk', calm ? 10 : 28], ['run', calm ? 0 : 12], ['look', 14], ['jump', calm ? 2 : 8], ['sit', 16], ['lie', 8], ['expr', 12], ['wait', calm ? 30 : 10]]
      .filter(o => o[1] > 0 && (o[0] !== pet.lastAct || o[0] === 'wait'));
    let r = Math.random() * opts2.reduce((a, o) => a + o[1], 0), pick = 'wait';
    for (const o of opts2) { if ((r -= o[1]) < 0) { pick = o[0]; break; } }
    if (pick === 'look') { setMode('look'); pet.lastAct = 'look'; }
    else if (pick === 'expr') { setExpr(['happy', 'wink', 'love', 'sleepy', 'surprised', 'shy'][Math.floor(Math.random() * 6)]); pet.lastAct = 'expr'; }
    else if (pick === 'sit') { setMode('sit', { dur: rnd(6, 9) }); pet.lastAct = 'sit'; }
    else if (pick === 'lie') { pet.prone = true; setMode('lie', { dur: rnd(6, 10), fidgetAt: T + rnd(4, 8) }); pet.lastAct = 'lie'; }
    else if (pick !== 'wait') act(pick);
    if (pet.mode === 'idle' && T >= pet.nextAt) pet.nextAt = T + rnd(2, 4);
  }

  /* particles */
  function emit(type, p, o = {}) { P.push({ type, x: p.x, y: p.y, vx: 0, vy: 0, age: 0, life: 1, ...o }); }
  function emitHeart() {
    const lh = proneK() > .5 && lieSet().hearts, h = lh || A.hearts;
    emit('heart', toStage(rnd(h[0], h[1]), h[2] + (lh ? 0 : pet.low)), { vx: rnd(-20, 20), vy: rnd(-70, -45), life: 1.6 });
  }
  /** A glint or two popping by the head (a happy or smug face); never more than three at once. */
  function emitGlint(n) {
    const live = P.filter(p => p.type === 'glint').length;
    // lying, from the lying spots; a figure that names no glint spots gets them either side of its own bubble spot, not at Coo's head
    const lg = proneK() > .5 && lieSet().glints, [bx, by] = A.bubble;
    const gl = lg || (custom && !custom.anchors?.glints ? [[bx - 50, by + 25], [bx + 50, by + 25]] : A.glints);
    for (let i = 0; i < Math.min(n, 3 - live); i++) {
      const [x, y] = gl[Math.floor(Math.random() * gl.length)];
      emit('glint', toStage(x + rnd(-8, 8), y + rnd(-8, 8) + (lg ? 0 : pet.low)), { vx: rnd(-8, 8), vy: rnd(-18, -8), life: rnd(.5, .7) });
    }
  }
  /** Where a spout leaves the head (logo units): lying, from the lying head; a figure that names no spout spot, just under its bubble spot. */
  function spoutPt() {
    const l = proneK() > .5 && lieSet();
    if (l) return l.spout || [l.bubble[0], l.bubble[1] + 30];
    const [x, y] = custom && !custom.anchors?.spout ? [A.bubble[0], A.bubble[1] + 30] : A.spout;
    return [x, y + pet.low];
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
        // (not while she has her back turned on purpose)
        if (pointer.inside && !press && pet.pulse?.kind !== 'away' && pet.pulse?.kind !== 'roll' && !pet._fc?.freeze && pdx * pet.facing < -50 && pm < 600) {
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
        if (leanT < 0 && !pet.skid) { pet.skid = true; sfx.skid(); }
        const ramp = Math.min(1, mt / (run ? .35 : .25));
        pet.speed = lerp(pet.speed, vT * smooth(ramp), ease(run ? 6 : 9, dt));
        pet.x += dir * Math.min(dist, pet.speed * dt);
        const k = clamp(pet.speed / vMax, 0, 1);
        strideT *= .4 + .6 * k; liftT *= .4 + .6 * k;
        pet.phase += Math.PI * 2 * rate * dt * Math.max(.35, k);
        lookT = [run ? 4 : 3, run ? 1 : 0];
        const half = Math.floor(pet.phase / Math.PI);
        if (half !== pet.lastHalf) {
          sfx.step(run, half & 1);
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
        if (!pet.cue) { pet.cue = 1; sfx.look(); }
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
        // down through sitting (the plop) onto her front, chin on her hands; already down, she stays down
        sitT = 1;
        if (mt >= .35 || pet.lieK > .5) lieT = 1;
        if (lieT && !pet.cue) { pet.cue = 1; if (pet.lieK < .5) sfx.land(false); }
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
        // lying, she dozes flat on the floor
        if (pet.prone) { lieT = 1; if (lieSet()) leanT = 0; }
        if (free && mt > pet.dur) setMode('wake');
        break;
      }
      case 'wake': {
        if (pet.startle) {
          sitT = 0; lookT = [3, -2];
          if (mt > .9) { setMode('idle'); pet.nextAt = T + rnd(1.5, 3); }
        } else {
          // from lying: pushes up to sitting first, then stands as from a sit
          sitT = mt < 1.1 ? 1 : 0;
          if (pet.prone && mt < .45) lieT = 1;
          if (mt > .5 && !pet.cue) { pet.cue = 1; sfx.yawn(); }
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
          sfx.jump();
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
        if (mt < 2.4 && T > pet.sfxAt) { sfx.chirps(); pet.sfxAt = T + .9; }
        if (mt >= 2.4 && !pet.cue) { pet.cue = 1; sfx.shake(); }
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
        if (half !== pet.lastHalf) sfx.step(false, half & 1);
        pet.lastHalf = half;
        if (T > pet.noteAt) { emit('note', toStage(...ancPt('z')), { vx: pet.facing * rnd(10, 30), vy: -34, life: 1.8 }); pet.noteAt = T + .6; }
        if (mt > pet.dur) { setMode('idle'); pet.nextAt = T + rnd(1.5, 3); }
        break;
      }
      case 'drag': {
        pet.dx = lerp(pet.dx, pointer.x, ease(28, dt));
        pet.dy = lerp(pet.dy, Math.min(pointer.y, floorY - 245 * S), ease(28, dt));
        tiltT = clamp(pointer.vx * .035, -40, 40); tk = 90; tc = 5;
        if (Math.abs(pointer.vx) > 500 && T > pet.sfxAt) { sfx.squeak(); pet.sfxAt = T + rnd(.4, .7); }
        break;
      }
    }

    // short gestures layered over whatever the body is doing
    // a flinch's step back moves the body whatever figure draws it (setMode cancels it when another mode takes over)
    if (pet.pulse?.kind === 'flinch' && pet.pulse.dx && m === 'idle') {
      pet.x = clamp(pet.pulse.x0 + pet.pulse.dx * smooth(clamp((T - pet.pulse.t0) / (pet.pulse.dur * .22), 0, 1)), minX(), maxX());
    }
    // a spout throws spray up out of the column as it breaks, whatever figure draws it (it falls back under gravity)
    if (pet.pulse?.kind === 'spout') {
      const k = (T - pet.pulse.t0) / pet.pulse.dur;
      if (k > .3 && k < .55 && T >= (pet.pulse.sprayAt ?? 0)) {
        pet.pulse.sprayAt = T + 1 / 30;
        const [x, y] = spoutPt(), g = SPRAY_G * S, h = rnd(55, 95) * S;
        // fanning out to either side, so the beads fall beside her like a fountain's, not down her face
        emit('spray', toStage(x, y - 80 * spoutCol(k).h), { vx: (Math.random() < .5 ? -1 : 1) * rnd(80, 160) * S, vy: -Math.sqrt(2 * g * h) * .5, life: 1.4, r: rnd(.7, 1.2) });
      }
    }
    // a roll carries the body along the floor as it turns, whatever figure draws it
    if (pet.pulse?.kind === 'roll' && m === 'idle') {
      pet.x = clamp(pet.pulse.x0 + pet.pulse.dx * rollTurn((T - pet.pulse.t0) / pet.pulse.dur), minX(), maxX());
    }
    // (a custom figure that lists a gesture in `figure.gestures` draws it itself, from the frame's `gesture`)
    if (pet.pulse) {
      const k = (T - pet.pulse.t0) / pet.pulse.dur;
      // (a back turned while lying could not be drawn: once she lies down it is over)
      if (k >= 1 || (pet.pulse.kind === 'away' && pet.prone && lieSet())) pet.pulse = null;
      else if (custom?.gestures?.includes(pet.pulse.kind)) { /* the figure's own */ }
      else if (pet.pulse.kind === 'away' && custom) { /* looks the other way for a while: see faceVis below */ }
      else if (pet.pulse.kind === 'nod') leanT += 9 * Math.abs(Math.sin(k * Math.PI * 2));
      else if (pet.pulse.kind === 'shake') tiltT += 10 * Math.sin(k * Math.PI * 6) * (1 - k);
      else if (pet.pulse.kind === 'wave') tiltT += 6 * Math.sin(k * Math.PI * 6) * Math.sin(k * Math.PI);
      else if (pet.pulse.kind === 'bow') leanT += 16 * envelope(k, .25, .7);
      else if (pet.pulse.kind === 'flinch') { const e = envelope(k, .04, .45); leanT -= 12 * e; sqT += .1 * e; }
      else if (pet.pulse.kind === 'peek') { const e = envelope(k, .2, .8); leanT += (10 + 1.5 * Math.sin(k * Math.PI * 6)) * e; sqT -= .07 * e; }
      else if (pet.pulse.kind === 'heart') { const e = envelope(k, .15, .8); leanT += 6 * e; tiltT += 4 * Math.sin(k * Math.PI * 4) * e; }
      else if (pet.pulse.kind === 'away') {
        // narrowing a little at each turn, and leaning away while her back is turned
        const turn = Math.sin(Math.PI * clamp(k / .25, 0, 1)) + Math.sin(Math.PI * clamp((k - .8) / .2, 0, 1));
        sqT -= .12 * turn; leanT -= 5 * envelope(k, .25, .8);
      }
      else if (pet.pulse.kind === 'cheer') { const e = envelope(k, .1, .75); sqT -= .08 * e; tiltT += 5 * Math.sin(k * Math.PI * 6) * e; }
      // crouching into the roll, curled up through it (Coo: see render), springing up out of it
      else if (pet.pulse.kind === 'roll') sqT += .22 * Math.sin(Math.PI * clamp(k / .22, 0, 1)) - .12 * Math.sin(Math.PI * clamp((k - .8) / .2, 0, 1));
      else if (pet.pulse.kind === 'sip') { const e = envelope(k, .1, .9); leanT += 3 * e + 4 * envelope(clamp((k - .38) / .26, 0, 1), .3, .6); }
      else if (pet.pulse.kind === 'read') leanT += 4 * envelope(k, .1, .9);
      // a breath drawn in (taller), then let out (sagging, leaning in)
      else if (pet.pulse.kind === 'sigh') {
        const inh = envelope(clamp(k / .45, 0, 1), .5, .7), exh = envelope(clamp((k - .35) / .6, 0, 1), .3, .7);
        sqT += -.05 * inh + .07 * exh; leanT += 6 * exh;
      }
      // crouching to gather a spout, springing up as it goes
      else if (pet.pulse.kind === 'spout') sqT += .16 * Math.sin(Math.PI * clamp(k / .25, 0, 1)) - .1 * Math.sin(Math.PI * clamp((k - .25) / .15, 0, 1));
      else if (pet.pulse.kind === 'flap') { tiltT += 7 * Math.sin(k * Math.PI * 8) * (1 - k); sqT -= .06 * Math.abs(Math.sin(k * Math.PI * 8)) * (1 - k); }
      else if (pet.pulse.kind === 'spin' && k > .5 && !pet.pulse.flipped) { pet.pulse.flipped = true; pet.facing *= -1; }
      else if (pet.pulse.kind === 'spin' && k < .5 && !pet.pulse.first) { pet.pulse.first = true; pet.facing *= -1; pet.sqv -= 1; }
    }

    const fname = faceName(), fc = FACES[fname].f(T, pet);
    if (fc.freeze) lookT = [...pet.look];
    else if (fc.lookLock || pet.mode === 'sleep' || pet.mode === 'drag') lookT = [0, 0];
    else if (fc.lookAt) lookT = fc.lookAt;
    if (fc.lean && (m === 'idle' || m === 'sit' || (m === 'lie' && !lieSet()))) leanT += fc.lean;
    if (fc.sag && !custom) sqT += fc.sag;
    // a fit of giggles bobs Coo's ring (a figure shakes its own shoulders from the face's `titter`)
    if (fc.titter && !custom) sqT += .05 * fc.titter;

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
    if (REST.has(m) || m === 'wake') pet.x = clamp(pet.x, minX(), maxX());
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
    // (a custom figure that draws no back turned of its own turns away by looking the other way for a while;
    // only the drawing turns, so whatever ends the gesture early brings it round again)
    const ak = pet.pulse?.kind === 'away' && custom && !custom.gestures?.includes('away') ? (T - pet.pulse.t0) / pet.pulse.dur : -1;
    pet.faceVis = lerp(pet.faceVis, ak > .05 && ak < .85 ? -pet.facing : pet.facing, ease(15, dt));
    // how far Coo's back is turned: the gesture's own turns, or turning round over .3 s once it is dropped early
    const awayT = pet.pulse?.kind === 'away' ? envelope((T - pet.pulse.t0) / pet.pulse.dur, .25, .8) : 0;
    pet.awayK = pet.pulse?.kind === 'away' && T - pet.pulse.t0 > pet.pulse.dur / 2 ? awayT : Math.max(awayT, pet.awayK - dt / .3);
    // a figure's back view coming or going mid-turn (sitting down, a scheme fading) eases the width floor in or out
    const backT = custom?.poses?.back === true ? 1 : 0;
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
    // the kick fidget is a burst of the lying kick
    let [kAmp, kRate] = pet.listening ? [0, 1] : KICK[fname] || [1, 1];
    if (pet.pulse?.kind === 'kick') { const e = envelope((T - pet.pulse.t0) / pet.pulse.dur, .15, .6); kAmp += 2 * e; kRate += 1.5 * e; }
    pet.kickPh += dt * 2.1 * kRate;
    const kick = 10 * kAmp * Math.sin(pet.kickPh) * proneK();
    // (Coo's own legs only: a figure reads the legs' angles and lengths for its own)
    const rk = !custom && pet.pulse?.kind === 'roll' ? envelope((T - pet.pulse.t0) / pet.pulse.dur, .15, .85) : 0;
    pet.feet.forEach((ft, i) => {
      const [hx, hy] = hip(i);
      let tx, ty;
      if (m === 'drag') { tx = hx + 7 * Math.sin(T * 11 + i * 2.2); ty = hy + 36; }
      else if (m === 'air') { tx = hx + (i ? 9 : -9); ty = hy + 33; }
      else {
        const ph = pet.phase + i * Math.PI;
        const sx = hx + pet.stride * Math.sin(ph), sy = FOOT_Y - pet.lift * Math.max(0, Math.cos(ph));
        tx = lerp(sx, hx + 26, pet.sitK); ty = lerp(sy, FOOT_Y, pet.sitK);
        // the flat foot lifts a little as the raised one comes down
        const lf = LIE_FEET[i];
        tx = lerp(tx, lf[0], proneK()); ty = lerp(ty, i ? lf[1] + kick : lf[1] - .4 * Math.max(0, kick), proneK());
        // curled up for a roll, the feet tuck in under the ring
        if (rk) { tx = lerp(tx, hx, rk); ty = lerp(ty, hy + 8, rk); }
      }
      const r = m === 'drag' || m === 'air' ? 14 : 40;
      ft[0] = lerp(ft[0], tx, ease(r, dt)); ft[1] = lerp(ft[1], ty, ease(r, dt));
    });

    // the crack running down a petrified body knocks a few chips of stone off, once per petrify
    if (fc.crack > .05 && pet.chipFor !== pet.exprAt) {
      pet.chipFor = pet.exprAt; sfx.crack();
      for (let i = 0; i < 5; i++) emit('chip', toStage(rnd(100, 160), rnd(60, 200) + pet.low), { vx: rnd(-60, 60), vy: rnd(-90, -30), life: 1.2, r: rnd(0, 6) });
    }
    if (fc.emit && T > pet.emitAt) {
      const z = ancPt('z'), tear = ancPt('tear');
      if (fc.emit === 'heart') { emitHeart(); pet.emitAt = T + .45; }
      if (fc.emit === 'z') { emit('z', toStage(...z), { vx: pet.facing * 16, vy: -26, life: 2.4 }); pet.emitAt = T + 1.3; sfx.snore(pet.modeT); }
      if (fc.emit === 'tear') { emit('drop', toStage(tear[0] + pet.look[0], tear[1]), { vx: pet.facing * rnd(10, 30), vy: -20, life: 3 }); pet.emitAt = T + (fc.emitEvery ?? .8); }
      if (fc.emit === 'tears') {
        // both eyes cry, taking turns; a figure that names only its one tear spot cries from there, and lying from the lying one
        const eyes = proneK() > .5 ? [tear] : (custom && !custom.anchors?.tears ? [A.tear] : A.tears).map(([x, y]) => [x, y + pet.low]);
        const [ex, ey] = eyes[pet.tearN++ % eyes.length];
        emit('drop', toStage(ex + pet.look[0] + rnd(-6, 6), ey), { vx: pet.facing * rnd(-20, 50), vy: rnd(-60, -20), life: 3 }); pet.emitAt = T + .22;
      }
    }
    strokeAcc *= Math.exp(-dt * 1.5);
    petCool -= dt;

    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'drop') { p.vy += 900 * dt; if (p.y > floorY) p.age = p.life; }
      if (p.type === 'chip') { p.vy += 900 * dt; if (p.y > floorY) p.age = p.life; }
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
    sfx.land(kind !== 'jump' && impact > 1000);
    dustAt(128, impact > 900 ? 7 : 3, 70);
    if (kind === 'throw' && impact > 1000) { setMode('dizzy'); onEvent('touch', { kind: 'crash' }); return; }
    setMode('land');
    if (kind === 'throw') { pet.expr = 'surprised'; pet.exprUntil = T + .9; pet.nextAt = T + 2; }
    else if (kind === 'drop') { pet.expr = 'happy'; pet.exprUntil = T + 1.6; pet.nextAt = T + 2.6; }
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
    // a roll: Coo curls up and turns over on the floor about the middle of its ring, dropping till the ring touches it;
    // a figure that draws no roll of its own hops along instead
    let rollXf = '';
    if (pet.pulse?.kind === 'roll' && !custom?.gestures?.includes('roll')) {
      const k = clamp((T - pet.pulse.t0) / pet.pulse.dur, 0, 1);
      if (custom) AY -= 46 * S * Math.sin(Math.PI * rollTurn(k));
      else {
        const drop = 26 * S * envelope(k, .18, .82), cy = AY - 128 * S * sy + drop;
        rollXf = `rotate(${f(360 * rollTurn(k) * Math.sign(pet.facing))} ${f(AX)} ${f(cy)}) translate(0 ${f(drop)}) `;
      }
    }
    if (fc.shake) AX += Math.sin(T * 60) * (fc.shake === true ? 1.4 : fc.shake);
    else if (pet.pulse?.kind === 'shiver') AX += Math.sin(T * 75) * 1.1 * envelope((T - pet.pulse.t0) / pet.pulse.dur, .08, .85);
    // a custom figure may keep tilt and lean off the whole group and bend its own parts instead;
    // a body lying flat does not rock about its feet (gestures show in its face and squash)
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
    const face = { ...fc, eyes, gap: pet.gap.map(g => Math.min(64, g + (fc.freeze ? 0 : pet.talkK) * 12)), blush: pet.blushK };
    const gesture = pet.pulse ? { kind: pet.pulse.kind, k: clamp((T - pet.pulse.t0) / pet.pulse.dur, 0, 1) } : null;
    const frame = { look: pet.look, legs, low: pet.low, t: T, blink, eyeClose, acc: skin, swing: pet.swing, lie: pet.lieK, prone: pet.prone, talk: pet.talkK, gesture };
    if (custom) custom.draw(petG, face, { ...frame, face: fname, mode: pet.mode, modeT: pet.modeT, drowse: pet.drowse, sit: pet.sitK, facing: pet.faceVis, tilt: pet.tilt, lean, groupRot: rot });
    else petG.innerHTML = figure(face, { ...frame, away: pet.awayK });

    const footY = drag ? pet.dy + 220 * S * 1.09 : pet.fy;
    const k = clamp(1 - (floorY - footY) / 420, .3, 1);
    shadowEl.setAttribute('cx', f(AX)); shadowEl.setAttribute('cy', f(floorY - 2));
    shadowEl.setAttribute('rx', f(72 * S * k * (1 + pet.sq * .5) * lerp(1, 1.35, proneK()))); shadowEl.setAttribute('ry', f(10 * S * k + 1));
    shadowEl.setAttribute('opacity', f(k));

    let s = '';
    const sc = S / .48;
    // sleep z's take the eye colour, or the custom figure's own colour for them
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
      } else if (p.type === 'glint') {
        // a four-point star that pops in and out, warm white with a gold edge so it shows on any desktop
        const k = Math.sin(Math.PI * a) * sc * 1.1;
        if (k > .01) s += `<path fill="#fffbe0" stroke="#e0a100" stroke-width="${f(1.4 / k)}" stroke-linejoin="round" opacity=".9" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(k)}) rotate(${f(p.age * 60)})" d="M0 -9Q1.6 -1.6 9 0Q1.6 1.6 0 9Q-1.6 1.6 -9 0Q-1.6 -1.6 0 -9Z"/>`;
      } else if (p.type === 'note') {
        const op = a < .15 ? a / .15 : 1 - (a - .15) / .85, z = (.8 + .4 * a) * sc;
        s += `<g opacity="${f(op)}" transform="translate(${f(p.x + Math.sin(p.age * 3) * 8)} ${f(p.y)}) scale(${f(z)})"><path ${zPaint} fill="none" stroke-width="2.4" stroke-linecap="round" d="M3 4V-9L9 -6"/><circle ${zPaint} fill="none" stroke-width="3.6" cx="0" cy="4.5" r="1.8"/></g>`;
      } else if (p.type === 'drop') {
        s += `<path class="tearf" transform="translate(${f(p.x)} ${f(p.y)}) scale(${f(.9 * sc)})" d="${DROP}"/>`;
      } else if (p.type === 'chip') {
        // a small grey shard of stone, tumbling
        s += `<path fill="#c9ccd4" stroke="#6b7080" stroke-width="1" stroke-linejoin="round" opacity="${f(1 - a * a)}" transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.r * 60 + p.age * 400)}) scale(${f(sc)})" d="M-4 -3L3 -4L5 2L-1 4Z"/>`;
      } else if (p.type === 'spray') {
        // a round bead of water with a highlight: not a tear's drop shape, so a spout does not read as crying
        const r = 3.2 * p.r * sc;
        s += `<g opacity="${f(1 - a * a)}"><circle fill="#cdeeff" stroke="${WATER}" stroke-width="${f(1.1 * sc)}" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}"/><circle fill="#fff" cx="${f(p.x - r * .35)}" cy="${f(p.y - r * .35)}" r="${f(r * .3)}"/></g>`;
      }
    }
    if (pet.pulse?.kind === 'spout') {
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

  /* pointer: stage-pixel coordinates */
  function velocity() {
    const s = pointer.samples;
    if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0], b = s[s.length - 1], dt = Math.max(.016, (b.t - a.t) / 1000);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }
  function pointerDown(p) {
    Object.assign(pointer, p, { inside: true });
    if (!hitPet(p) || pet.mode === 'air') return false;
    press = { x: p.x, y: p.y, t: performance.now() };
    pointer.samples = [{ t: performance.now(), x: p.x, y: p.y }];
    return true;
  }
  /** Returns the cursor the stage should show. */
  function pointerMove(p) {
    const now = performance.now();
    const ddx = p.x - pointer.x, ddy = p.y - pointer.y;
    Object.assign(pointer, p, { inside: true });
    pointer.samples.push({ t: now, x: p.x, y: p.y });
    while (pointer.samples.length > 2 && now - pointer.samples[0].t > 110) pointer.samples.shift();
    pointer.vx = lerp(pointer.vx, velocity().x, .35);

    if (press && pet.mode !== 'drag' && Math.hypot(p.x - press.x, p.y - press.y) > 6) {
      const scruff = toStage(128, 36);
      pet.expr = null;
      setMode('drag', { dx: scruff.x, dy: scruff.y });
      sfx.grab();
      pet.sqv -= 1.2; pet.tiltV = 0;
      onEvent('touch', { kind: 'grab' });
    }
    if (press) return 'grabbing';
    const over = hitPet(p);
    if (over && (pet.mode === 'idle' || pet.mode === 'look' || REST.has(pet.mode))) {
      strokeAcc += Math.hypot(ddx, ddy);
      if (strokeAcc > 320 && petCool <= 0) {
        strokeAcc = 0; petCool = 2.5;
        sfx.purr();
        if (pet.mode === 'sleep') emitHeart();
        else setExpr(Math.random() < .5 ? 'love' : 'shy');
        onEvent('touch', { kind: 'pet', asleep: pet.mode === 'sleep' });
      }
    }
    return over ? 'grab' : '';
  }
  function pointerUp() {
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
      if (speed > 700) sfx.whoosh();
      setMode('air');
      onEvent('touch', { kind: speed > 700 ? 'throw' : 'drop', x: Math.round(pet.x) });
    } else if (performance.now() - press.t < 400) {
      if (REST.has(pet.mode)) {
        const wasAsleep = pet.mode === 'sleep';
        setMode('wake', { startle: true }); pet.sqv -= 2.2; pet.nextAt = T + 2.4;
        sfx.surprised();
        onEvent('touch', { kind: 'poke', woke: wasAsleep });
      } else if (pet.mode !== 'dizzy') {
        sfx.poke();
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
    Object.assign(pointer, p, { vx: 0, samples: [] });
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

  resize();
  return {
    pet, step, render, resize, act, setExpr, walkTo, toStage, hitPet, busy,
    pointerDown, pointerMove, pointerUp, pointerLeave, dropAt, shiftDrag,
    get pressing() { return !!press; },
    /** Pressed, carried, airborne, walking, running, dancing, turning round, or in a short gesture (nod, wave, bow…; not a lying fidget): motion that frames far apart show as jumps. */
    get moving() {
      return !!press || MOVING_MODES.has(pet.mode) || (!!pet.pulse && !FIDGETS[pet.pulse.kind]) || Math.abs(pet.faceVis - pet.facing) > .05;
    },
    get time() { return T; },
    get bounds() { return { W, H, floorY, S, minX: minX(), maxX: maxX() }; },
    setSkin(s) { skin = s; },
    /** Swaps the body's drawing: a custom figure (see `opts.figure`) or null for the built-in Coo. */
    setFigure(fig) {
      if (fig === custom) return;
      // a swapped-out figure may hold a WebGL context; release it now instead of waiting for GC
      custom?.dispose?.();
      custom = fig || null;
      A = anchorsOf(custom);
      petG.textContent = '';
      render();
    },
    get figure() { return custom; },
    get skin() { return skin; },
    setRoam(r) { roam = r; if (r !== 'off') pet.nextAt = T + 1; },
    get roam() { return roam; },
    /** Outside orders keep free roaming quiet for `seconds`. */
    holdRoam(seconds) { hold = Math.max(hold, T + seconds); },
    talk() { pet.talkK = 1; },
    setListening(on) { pet.listening = on; if (on && (pet.mode === 'walk' || pet.mode === 'run')) setMode('idle'); },
    setThinking(on) { pet.thinking = on; },
    /** Head top in stage pixels, for placing a speech bubble. */
    anchor() {
      // Coo's head top depends on the hat: lying, it is carried through her lying pose
      if (!custom) return toStage(...liePt(A.bubble[0], (HEAD_TOP[skin.head] ?? 12) - 8 + pet.low, pet.lieK));
      return toStage(...ancPt('bubble'));
    },
    /** How far the body is seen lying (0..1): 0 throughout for a figure that cannot show the pose (it stays seated). */
    get lying() { return proneK(); },
    /** The body's box [x0, y0, x1, y1] in logo units, standing, sitting or lying: for placing what goes beside it. */
    bodyBox() {
      const up = [20, Math.min(20, HEAD_TOP[skin.head] ?? 12), 236, 256], L = lieSet();
      if (!L?.hit) return up;
      const w = L.halfW ?? 108, k = proneK();
      // Coo's hat top carried through her lying pose, as it is in her bubble's spot
      const top = custom ? L.hit[1] - L.hit[3] : Math.min(L.hit[1] - L.hit[3], liePt(128, up[1] + 29, 1)[1]);
      return [128 - w, top, 128 + w, 256].map((v, i) => lerp(up[i], v, k));
    },
    emitHeart,
  };
}
