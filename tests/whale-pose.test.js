import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { poseMix, lieDeformers, kickField, KICK, eyesShut, waveHandover, ARM_LIMIT, ARM_SPRING, cheerHandover, CHEER_TO, CHEER_ENV, chinWanted, FAR_ARM_GESTURES, backTailField, backView, awayStep, PROP_GESTURES, BOTH_HANDS, NEAR_RAISES, BENT_RAISES, FAR_RAISES, RAISE_TO, lyingMouth, sipLift, rollTurn, ballMix, ballLift, ballAngle, ROLL_D as WHALE_ROLL_D } from '../packages/cortico-world-desktop-pet/web/whale/figure.js';
import { ROLL_D, rollTurn as coreRollTurn } from '../packages/cortico-world-desktop-pet/web/kit/body.js';

const WHALE = new URL('../packages/cortico-world-desktop-pet/web/whale/', import.meta.url);
const model = JSON.parse(readFileSync(new URL('model.json', WHALE), 'utf8'));
const LIE = model.poses.lie;
const SCHEMES = model.schemes.filter(s => s.ready !== false).map(s => s.id);
const dir = id => (id === SCHEMES[0] ? '' : `schemes/${id}/`);
const TEX_PER_UNIT = model.units.DS / model.units.S;

/** Width, height and colour type of a PNG, from its header. */
function png(url) {
  const b = readFileSync(url);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}
const inside = ([x, y], [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** The pixels of an 8-bit RGBA, non-interlaced PNG: { w, h, px } (4 bytes a pixel). */
function rgbaOf(url) {
  const b = readFileSync(url), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  expect(b[24] === 8 && b[25] === 6 && b[28] === 0, 'an 8-bit RGBA PNG, not interlaced').toBe(true);
  const idat = [];
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const raw = inflateSync(Buffer.concat(idat)), row = w * 4, px = new Uint8Array(row * h), a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
    for (let i = 0; i < row; i++) {
      const l = i >= 4 ? px[dst + i - 4] : 0, u = y ? px[dst + i - row] : 0, ul = y && i >= 4 ? px[dst + i - row - 4] : 0;
      const p = l + u - ul, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul);
      px[dst + i] = (raw[src + i] + [0, l, u, (l + u) >> 1, pa <= pb && pa <= pc ? l : pb <= pc ? u : ul][f]) & 255;
    }
  }
  return { w, h, px };
}
/** The alpha channel of an 8-bit RGBA, non-interlaced PNG: { w, h, a }. */
function alphaOf(url) {
  const { w, h, px } = rgbaOf(url), a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  return { w, h, a };
}
/** A pose part's file in a scheme is there, RGBA (an opaque background would cover her) and sized to its box. */
function expectFile(id, p) {
  const { w, h, colorType } = png(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
  expect(colorType, `${id} ${p.tex} is RGBA`).toBe(6);
  expect(Math.abs(w - p.box[2] * TEX_PER_UNIT), `${id} ${p.tex} width`).toBeLessThanOrEqual(2);
  expect(Math.abs(h - p.box[3] * TEX_PER_UNIT), `${id} ${p.tex} height`).toBeLessThanOrEqual(2);
}
/** Where a pose part's hand is drawn, in rig units: the centre of its skin pixels (the sleeves are dark, the cuffs white). */
function skinOf(id, p, least = 150) {
  const { w, h, px } = rgbaOf(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)), [bx, by, bw, bh] = p.box;
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4);
    if (a > 128 && r > 170 && g > 120 && r - b > 25) { n++; sx += x + .5; sy += y + .5; }
  }
  expect(n, `${id} ${p.tex} has a hand`).toBeGreaterThan(least);
  return [bx + sx / n * bw / w, by + sy / n * bh / h];
}
/** The direction from a shoulder to a point, as the near arm's rotation that points there (0 hanging down, + out to the front). */
const armDir = ([sx, sy], [x, y]) => Math.atan2(-(x - sx), y - sy) * 180 / Math.PI;
const BODY = LIE.required.find(p => p.id === 'lie_body');
const bodyAlpha = alphaOf(new URL('tex/lie_body.png', WHALE));
/** The rest grid of lie_body as the rig builds it, and whether each cell has any of the drawing in it. */
function bodyGrid() {
  const [nx, ny] = BODY.grid, [bx, by, bw, bh] = BODY.box, { w, h, a } = bodyAlpha, rest = [], drawn = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) rest.push([bx + bw * i / nx, by + bh * j / ny]);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let n = 0, o = 0;
    for (let y = Math.floor(j * h / ny); y < Math.floor((j + 1) * h / ny); y++) for (let x = Math.floor(i * w / nx); x < Math.floor((i + 1) * w / nx); x++) { n++; if (a[y * w + x] > 128) o++; }
    drawn.push(o / n > .05);
  }
  return { nx, ny, rest, drawn };
}

describe('lying down, as the whale draws it', () => {
  it('never shows the lying drawing and the standing rig through each other', () => {
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const k = i <= 1000 ? i / 1000 : 2 - i / 1000;
      const { poseA, standA, hide } = poseMix(k);
      // the rig only fades once the drawing over it is opaque, and is gone (not drawn) only at zero
      if (standA < 1) expect(poseA).toBe(1);
      // and goes in one step: a part-by-part fade would show the rig's layers through each other
      expect([0, 1]).toContain(standA);
      if (hide) expect(standA).toBe(0);
      if (i <= 1000) { expect(poseA).toBeGreaterThanOrEqual(prev); prev = poseA; }
    }
    expect(poseMix(0)).toEqual({ poseA: 0, standA: 1, hide: false });
    expect(poseMix(1)).toEqual({ poseA: 1, standA: 0, hide: true });
  });

  it('every ready scheme has every standing file (one missing file fails the whole scheme)', () => {
    const feat = [...Object.keys(model.feat.sprites), ...['eyeL', 'eyeR'].flatMap(k => ['lash', 'ball', 'iris', ...(model.feat.eyes[k].rim ? ['rim'] : [])].map(n => `${k}_${n}`))];
    for (const id of SCHEMES) {
      for (const p of model.parts) expect(existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)), `${id} ${p.tex}`).toBe(true);
      for (const n of feat) expect(existsSync(new URL(`${dir(id)}feat/${n}.png`, WHALE)), `${id} ${n}`).toBe(true);
    }
  });

  it('has its files in every scheme or in none, each sized to its box', () => {
    for (const p of [...LIE.required, ...LIE.overlays]) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      expect(have.length === 0 || have.length === SCHEMES.length, `${p.tex} only in ${have}`).toBe(true);
      for (const id of have) expectFile(id, p);
    }
  });

  it('lies on the floor inside the figure\'s view, its pivots, anchors and hit area on the drawing', () => {
    const [vx0, vy0, vx1, vy1] = model.view;
    const body = LIE.required.find(p => p.id === 'lie_body').box;
    for (const p of [...LIE.required, ...LIE.overlays]) {
      const [x, y, w, h] = p.box;
      expect(x >= vx0 && y >= vy0 && x + w <= vx1 && y + h <= vy1, `${p.id} inside the view`).toBe(true);
    }
    // her lowest point is on the floor (soles' line, y 256)
    expect(Math.abs(body[1] + body[3] - 256)).toBeLessThan(2);
    const drawn = [body[0], body[1], body[0] + body[2], body[1] + body[3]];
    expect(inside(LIE.pivots.lieChin, LIE.rects.head)).toBe(true);
    expect(inside(LIE.pivots.lieTail, LIE.rects.tail)).toBe(true);
    expect(inside(LIE.legAxis.knee, LIE.rects.legs) && inside(LIE.legAxis.shoe, LIE.rects.legs)).toBe(true);
    const A = LIE.anchors;
    for (const k of ['gaze', 'tear']) expect(inside(A[k], drawn), k).toBe(true);
    // the speech bubble's point sits over her head, at most a little into the drawing's top
    expect(A.bubble[1]).toBeLessThan(drawn[1] + 10);
    expect(A.bubble[0] > drawn[0] && A.bubble[0] < drawn[2]).toBe(true);
    const [cx, cy, rx, ry] = A.hit;
    expect(inside([cx, cy], drawn)).toBe(true);
    expect(cx - rx >= vx0 && cx + rx <= vx1 && cy - ry >= vy0 && cy + ry <= vy1).toBe(true);
    // the half width the kit keeps from the screen edges covers every piece of the drawing (it is centred on x 128)
    const x0 = Math.min(...LIE.required.map(p => p.box[0])), x1 = Math.max(...LIE.required.map(p => p.box[0] + p.box[2]));
    expect(A.halfW).toBeGreaterThanOrEqual(Math.max(128 - x0, x1 - 128) - 2);
  });

  it('can be pressed anywhere she is drawn: the hit ellipse covers the drawing', () => {
    const [cx, cy, rx, ry] = LIE.anchors.hit;
    let n = 0, hit = 0;
    for (const p of LIE.required) {
      const { w, h, a } = p === BODY ? bodyAlpha : alphaOf(new URL(`tex/${p.tex}.png`, WHALE)), [bx, by, bw, bh] = p.box;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (a[y * w + x] < 128) continue;
        n++;
        if (((bx + (x + .5) * bw / w - cx) / rx) ** 2 + ((by + (y + .5) * bh / h - cy) / ry) ** 2 < 1) hit++;
      }
    }
    expect(hit / n).toBeGreaterThanOrEqual(.97);
  });

  it('hangs every piece from a lying deformer, none named like a standing part', () => {
    const defs = lieDeformers(LIE), standing = new Set(model.parts.map(p => p.id));
    for (const d of Object.values(defs)) if (d.parent) expect(defs[d.parent], d.parent).toBeTruthy();
    for (const p of [...LIE.required, ...LIE.overlays]) {
      expect(defs[p.parent], `${p.id}'s parent ${p.parent}`).toBeTruthy();
      expect(standing.has(p.id), p.id).toBe(false);
    }
  });

  it('kicks only the shins: the head and body stay put, and the mesh never folds', () => {
    const ax = LIE.legAxis, rad = Math.PI / 180;
    expect(typeof ax.far === 'number' && typeof ax.gap === 'number').toBe(true);
    const { nx, ny, rest, drawn } = bodyGrid();
    const cell = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && drawn[j * nx + i];
    const onDrawn = k => { const i = k % (nx + 1), j = (k - i) / (nx + 1); return cell(i, j) || cell(i - 1, j) || cell(i, j - 1) || cell(i - 1, j - 1); };
    const area = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const [hx0, hy0, hx1, hy1] = LIE.rects.head, A = LIE.anchors;
    let worst = Infinity;
    for (let s = 0; s < 48; s++) {
      const ph = s / 48 * 2 * Math.PI, f = kickField(ax, KICK.amp * Math.sin(ph) * rad, KICK.apart * Math.sin(ph + 1.6) * rad);
      const out = rest.map(([x, y]) => { const d = f(0, 0, x, y); return [x + d[0], y + d[1]]; });
      // where the head is drawn, and the points the kit and the fx use on it
      rest.forEach(([x, y], i) => { if (onDrawn(i) && x >= hx0 && y >= hy0 && x <= hx1 && y <= hy1) expect(Math.hypot(out[i][0] - x, out[i][1] - y), `${x},${y}`).toBeLessThan(.01); });
      for (const p of [A.gaze, A.tear, LIE.pivots.lieChin, LIE.fx.to]) expect(Math.hypot(...f(0, 0, ...p))).toBeLessThan(.01);
      drawn.forEach((d, c) => {
        if (!d) return;
        const i = c % nx, j = (c - i) / nx, a = j * (nx + 1) + i, b = a + 1, cc = a + nx + 1, dd = cc + 1;
        for (const [p, q, r] of [[a, b, cc], [b, dd, cc]]) worst = Math.min(worst, area(out[p], out[q], out[r]) / area(rest[p], rest[q], rest[r]));
      });
    }
    expect(worst).toBeGreaterThan(.5);
    // while the shoes do swing
    expect(Math.hypot(...kickField(ax, KICK.amp * rad, 0)(0, 0, ...ax.shoe))).toBeGreaterThan(5);
  });

  it('closes the drawn eyes for shut and nearly shut faces, and opens them gradually on waking', () => {
    const lid = ry => [{ shape: 'lid', ry }, { shape: 'lid', ry }];
    expect(eyesShut({}, lid(11), 'lie')).toBe(0);                        // content, awake
    expect(eyesShut({ drowse: 1 }, lid(2), 'lie')).toBe(1);              // content, dozed off
    expect(eyesShut({ drowse: .85 }, lid(11 - 9 * .85), 'lie')).toBeGreaterThan(.5);
    expect(eyesShut({}, lid(0), 'lie')).toBe(1);                         // cry, squeeze
    expect(eyesShut({}, lid(8), 'lie')).toBe(0);                         // smug: half lids stay open
    expect(eyesShut({}, [{ shape: 'down' }, { shape: 'down' }], 'sleep')).toBe(1);
    expect(eyesShut({}, [{ shape: 'ring', ry: 16 }], 'lie')).toBe(0);
    expect(eyesShut({ blink: .7 }, [{ shape: 'ring', ry: 16 }], 'lie')).toBe(.7);
    // waking: the kit opens the lid from 0 to 10 over half a second; no frame at 60 fps jumps by more than a third
    let prev = 1;
    for (let mt = 0; mt <= .5; mt += 1 / 60) {
      const s = eyesShut({}, lid(10 * Math.min(1, mt / .5)), 'wake');
      expect(prev - s).toBeLessThan(.34);
      prev = s;
    }
    expect(prev).toBe(0);
  });
});

describe('waving with an open hand, as the whale draws it', () => {
  const WAVE = model.poses.wave;
  const z = id => model.parts.find(p => p.id === id).z;

  it('has its files in every scheme, each sized to its box', () => {
    for (const p of WAVE.required) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      // model.json declares the pose, so a file left out of a commit must fail here, not fall back to the fist wave unnoticed
      expect(have, p.tex).toEqual(SCHEMES);
      for (const id of have) expectFile(id, p);
    }
  });

  it('draws the arm twice on one deformer: the sleeve under the side locks, the hand over the fin and bow', () => {
    const [arm, top] = WAVE.required;
    expect(top.box).toEqual(arm.box);
    expect(top.parent).toBe(arm.parent);
    expect(arm.parent).toBe('armWave');
    // the sleeve's root goes behind the side locks, as the near arm does; the hand is in front of every part of the head
    expect(arm.z).toBe(z('arm_near'));
    expect(arm.z).toBeLessThan(z('sidelocks'));
    expect(top.z).toBeGreaterThan(Math.max(z('fin_near'), z('bow'), z('bangs'), z('ahoge')));
    for (const p of WAVE.required) expect(model.parts.some(q => q.id === p.id), `${p.id} clashes with a standing part`).toBe(false);
  });

  it('turns about the near shoulder and hands over from the fist arm pointing the same way', () => {
    const [sx, sy] = WAVE.pivots.armWave, [px, py] = model.pivots.armNear, [wx, wy] = WAVE.wrist;
    expect(Math.hypot(sx - px, sy - py)).toBeLessThan(12);
    // the drawn forearm's direction equals the near arm (hanging straight down at rotation 0, a few degrees out) turned by `rest`
    expect(Math.abs(armDir([sx, sy], [wx, wy]) - WAVE.rest)).toBeLessThan(12);
    // past the fist wave's 108° and within the arm's reach, so the hand goes on rising after the handover and gets there
    expect(WAVE.rest).toBeGreaterThan(108);
    expect(WAVE.rest).toBeLessThanOrEqual(ARM_LIMIT);
  });

  it('trades arms only once the fist arm is well up, never while she lies or lacks the drawing', () => {
    // the swap follows the arm's actual rotation, not the gesture's clock: still hanging, it is the fist arm
    expect(waveHandover(1, 12, 0, true).swap).toBe(0);
    expect(waveHandover(1, 60, 0, true).swap).toBe(0);
    expect(waveHandover(1, 100, 0, true).swap).toBe(1);
    expect(waveHandover(1, 100, 0, false)).toEqual({ openHand: 0, swap: 0 });
    expect(waveHandover(1, 100, .5, true)).toEqual({ openHand: 0, swap: 0 });
    // after lying, her lie eases toward zero without reaching it; the open hand comes back all the same
    let lie = 1;
    for (let i = 0; i < 600; i++) { lie += (0 - lie) * (1 - Math.exp(-14 / 60)); if (lie < 1e-3) lie = 0; }
    expect(waveHandover(1, 100, lie, true).swap).toBe(1);
    // the drawn arm, rotated to where the fist arm is at the handover, keeps its wrist off the floor (soles' line y 256)
    const [sx, sy] = WAVE.pivots.armWave, [wx, wy] = WAVE.wrist, a = (70 - WAVE.rest) * Math.PI / 180;
    const y = sy + (wx - sx) * Math.sin(a) + (wy - sy) * Math.cos(a);
    expect(y).toBeLessThan(220);
  });
});

describe('the lying and waving drawings, as the kit reads them', () => {
  it('reports what poses it can show on every frame, so the kit keeps a pack without the files seated', () => {
    const src = readFileSync(new URL('figure.js', WHALE), 'utf8');
    expect(src).toMatch(/get poses\(\)/);
    // the whale's body is the kit's plus body, from the kit next to it (in the app and in an exported pack alike)
    expect(src).toMatch(/import \* as kit from '\.\.\/kit\/body\.js'/);
    expect(src).toMatch(/kit\.createBody\(opts\.host, \{ figure: await createWhaleFigure\(base, opts\), plus: true \}\)/);
    // the figure never fetches (the frame allows no connections): the model comes in opts.model
    expect(src).not.toMatch(/\bfetch\(/);
  });
});

describe('resting her chin on her hand while thinking, as the whale draws it', () => {
  const CHIN = model.poses.chin;
  const z = id => model.parts.find(p => p.id === id).z;

  it('has its file in every scheme, sized to its box', () => {
    for (const p of CHIN.required) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      expect(have, p.tex).toEqual(SCHEMES);
      for (const id of have) expectFile(id, p);
    }
  });

  it('is the far forearm: its elbow by the far shoulder, the hand in front of the face and under the fringe', () => {
    const [arm] = CHIN.required;
    expect(arm.parent).toBe('armChin');
    const [ex, ey] = CHIN.pivots.armChin, [fx, fy] = model.pivots.armFar;
    // the elbow hangs from the far shoulder: below it, within an upper arm's length
    expect(Math.hypot(ex - fx, ey - fy)).toBeLessThan(25);
    expect(ey).toBeGreaterThanOrEqual(fy);
    expect(arm.z).toBeGreaterThan(Math.max(z('face'), z('eye_creases'), z('brows')));
    expect(arm.z).toBeLessThan(z('bangs'));
    expect(model.parts.some(q => q.id === arm.id)).toBe(false);
  });

  it('draws the hand up at the chin, above the elbow, in every scheme', () => {
    const [arm] = CHIN.required, [, ey] = CHIN.pivots.armChin;
    for (const id of SCHEMES) {
      const [hx, hy] = skinOf(id, arm);
      expect(hy, `${id} hand above the elbow`).toBeLessThan(ey - 20);
      expect(Math.hypot(hx - CHIN.wrist[0], hy - CHIN.wrist[1]), `${id} hand at \`wrist\``).toBeLessThan(10);
    }
  });

  it('takes her chin off her hand for a gesture that poses the far arm', () => {
    expect(chinWanted('thinking', 'idle', 0, null)).toBe(true);
    expect(chinWanted('thinking', 'sit', 0, { kind: 'nod', k: .5 })).toBe(true);
    expect(chinWanted('thinking', 'walk', 0, null)).toBe(false);
    expect(chinWanted('thinking', 'idle', .2, null)).toBe(false);
    for (const kind of ['cheer', 'heart', 'shiver']) {
      expect(FAR_ARM_GESTURES, kind).toContain(kind);
      // shiver keeps the thinking face, and a gesture's first frame still may: the chin pose goes all the same
      expect(chinWanted('thinking', 'idle', 0, { kind, k: 0 }), kind).toBe(false);
    }
  });
});

describe('cheering with both arms up, as the whale draws it', () => {
  const ARMS = model.poses.cheer.arms;
  const z = id => model.parts.find(p => p.id === id).z;

  it('has both arms in every scheme, each sized to its box', () => {
    for (const arm of Object.values(ARMS)) for (const p of arm.required) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      expect(have, p.tex).toEqual(SCHEMES);
      for (const id of have) expectFile(id, p);
    }
  });

  it('turns each arm about its own shoulder, its root under the plain arm\'s layer and its hand over the head', () => {
    const plain = { near: 'armNear', far: 'armFar' };
    for (const [slot, arm] of Object.entries(ARMS)) {
      const [[, pivot]] = Object.entries(arm.pivots), [px, py] = model.pivots[plain[slot]];
      expect(Math.hypot(pivot[0] - px, pivot[1] - py), slot).toBeLessThan(5);
      const [root, top] = arm.required;
      expect(root.z, slot).toBe(z(slot === 'near' ? 'arm_near' : 'arm_far'));
      expect(top.z, slot).toBeGreaterThan(Math.max(z('sidelocks'), z('fin_near'), z('face'), z('headdress'), z('bangs')));
      for (const p of arm.required) expect(model.parts.some(q => q.id === p.id), p.id).toBe(false);
    }
    // the near hand, beside her face, goes over every part of the head; the far one stays under the bow and ahoge
    expect(ARMS.near.required[1].z).toBeGreaterThan(Math.max(z('bow'), z('ahoge')));
  });

  it('draws each hand raised where `rest` says the arm points, in every scheme', () => {
    for (const [slot, arm] of Object.entries(ARMS)) {
      const [pivot] = Object.values(arm.pivots);
      expect(Math.abs(armDir(pivot, arm.wrist) - arm.rest), slot).toBeLessThan(12);
      for (const id of SCHEMES) {
        const hand = skinOf(id, arm.required[0]);
        expect(hand[1], `${id} ${slot} hand above the shoulder`).toBeLessThan(pivot[1] - 20);
        expect(Math.abs(armDir(pivot, hand) - arm.rest), `${id} ${slot} hand's direction`).toBeLessThan(12);
      }
    }
  });

  it('trades arms pointing the same way, on the way up and back down', () => {
    // the cheer as figure.js runs it: the envelope, the plain arm's spring, a happy face's resting arms
    const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const env = gk => smooth(0, CHEER_ENV[0], gk) * (1 - smooth(CHEER_ENV[1], 1, gk));
    for (const [slot, arm] of Object.entries(ARMS)) {
      const s = Math.sign(arm.rest), to = CHEER_TO[slot], lim = slot === 'near' ? ARM_LIMIT : 95, rest0 = slot === 'near' ? 16 : -10;
      expect(to, slot).toBeLessThan(Math.abs(arm.rest));
      expect(to, slot).toBeLessThan(lim);
      let x = rest0, v = 0, full = false, swapped = false, last = 0;
      // the kit's pulse('cheer', 1.8); the gesture's last frame comes before k reaches 1
      const dt = 1 / 60, T = 1.8;
      for (let t = 0; t < T - 1e-9; t += dt) {
        const gk = t / T, on = env(gk), target = rest0 + (s * to - rest0) * on;
        v += ((target - x) * ARM_SPRING.k - v * ARM_SPRING.c) * dt; x += v * dt;
        if (Math.abs(x) > lim) { x = Math.sign(x) * lim; v = 0; }
        const { swap, lift, dir } = cheerHandover(on, x, to, arm.rest);
        // mid-trade both arms are seen: the drawn one points where the fist one does
        if (swap > 0 && swap < 1) { expect(lift, `${slot} at ${gk}`).toBe(0); expect(dir).toBe(x); }
        if (swap > 0) swapped = true;
        if (gk > .3 && gk < .6) { expect(swap, `${slot} at ${gk}`).toBe(1); full ||= Math.abs(dir - arm.rest) < 8; }
        last = swap;
      }
      expect(swapped && full, slot).toBe(true);
      // and it is the fist arm again before the gesture ends, so nothing pops when it does
      expect(last, slot).toBeLessThan(.01);
    }
    expect(cheerHandover(0, 70, CHEER_TO.near, ARMS.near.rest)).toEqual({ swap: 0, lift: 0, dir: 70 });
  });

  it('keeps each drawn hand off the floor where the trade starts', () => {
    for (const [slot, arm] of Object.entries(ARMS)) {
      const [[sx, sy]] = Object.values(arm.pivots), [wx, wy] = arm.wrist;
      const a = (Math.sign(arm.rest) * (CHEER_TO[slot] - 40) - arm.rest) * Math.PI / 180;
      expect(sy + (wx - sx) * Math.sin(a) + (wy - sy) * Math.cos(a), slot).toBeLessThan(220);
    }
  });
});

describe('a heart made with both hands, as the whale draws it', () => {
  const HEART = model.poses.heart;
  const z = id => model.parts.find(p => p.id === id).z;

  it('has its file in every scheme, sized to its box', () => {
    for (const p of HEART.required) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      expect(have, p.tex).toEqual(SCHEMES);
      for (const id of have) expectFile(id, p);
    }
  });

  it('sits in front of her chest, between the shoulders, over the bodice and face, under the fringe', () => {
    const [arm] = HEART.required, [x, y, w, h] = arm.box;
    expect(arm.parent).toBe('armHeart');
    expect(x).toBeLessThan(model.pivots.armNear[0]);
    expect(x + w).toBeGreaterThan(model.pivots.armFar[0]);
    expect(y + h).toBeGreaterThan(model.pivots.armNear[1]);
    expect(arm.z).toBeGreaterThan(Math.max(z('torso_up'), z('arm_near'), z('face')));
    expect(arm.z).toBeLessThan(z('bangs'));
    expect(model.parts.some(q => q.id === arm.id)).toBe(false);
  });

  it('draws the hands at `wrist`, above the forearms\' pivot, in every scheme', () => {
    const [arm] = HEART.required, [, py] = HEART.pivots.armHeart;
    for (const id of SCHEMES) {
      const [hx, hy] = skinOf(id, arm);
      expect(hy, id).toBeLessThan(py - 10);
      expect(Math.hypot(hx - HEART.wrist[0], hy - HEART.wrist[1]), id).toBeLessThan(8);
    }
  });
});

describe('her back, as the whale draws it', () => {
  const BACK = model.poses.back;

  it('has its file in every scheme, sized to its box', () => {
    for (const p of BACK.required) for (const id of SCHEMES) expectFile(id, p);
  });

  it('stands where she stands: inside the view, feet on the floor, about as tall and as centred as the front', () => {
    const [vx0, vy0, vx1, vy1] = model.view, [p] = BACK.required, [x, y, w, h] = p.box;
    expect(x >= vx0 && y >= vy0 && x + w <= vx1 && y + h <= vy1).toBe(true);
    expect(Math.abs(y + h - 256)).toBeLessThan(3);
    const front = model.parts.filter(q => ['bangs', 'headdress', 'ahoge'].includes(q.id)).map(q => q.box[1]);
    expect(Math.abs(y - Math.min(...front))).toBeLessThan(12);
    expect(Math.abs(x + w / 2 - 128)).toBeLessThan(15);
    // it rides the body, under its tail warp, drawn over every standing part
    expect(p.parent).toBe('backTail');
    expect(p.z).toBeGreaterThan(Math.max(...model.parts.map(q => q.z)));
    const [tx0, ty0, tx1, ty1] = BACK.tail, [rx, ry] = BACK.pivots.backTail;
    expect(rx >= tx0 && rx <= tx1 && ry >= ty0 && ry <= ty1).toBe(true);
  });

  it('flicks only the fluke: the far fin, hair and headdress above the tail stay put', () => {
    const [p] = BACK.required, [bx, by, bw, bh] = p.box, ty = BACK.tail[1];
    const field = backTailField(BACK, 9 * Math.PI / 180);
    for (const id of SCHEMES) {
      const { w, h, a } = alphaOf(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
      let most = 0, fluke = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        if (a[y * w + x] < 32) continue;
        const rx = bx + (x + .5) * bw / w, ry = by + (y + .5) * bh / h, [dx, dy] = field(0, 0, rx, ry), d = Math.hypot(dx, dy);
        if (ry < ty) most = Math.max(most, d); else fluke = Math.max(fluke, d);
      }
      expect(most, id).toBe(0);
      expect(fluke, id).toBeGreaterThan(5);
    }
  });

  it("keeps the fluke on her tail's side through a turn, mirrored mid-turn, and as authored when she turns away", () => {
    // facing right the front's tail is on the left; the drawing has its fluke on the right
    expect(model.parts.find(q => q.id === 'tail').box[0] + model.parts.find(q => q.id === 'tail').box[2] / 2).toBeLessThan(128);
    expect((BACK.tail[0] + BACK.tail[2]) / 2).toBeGreaterThan(128);
    // the kit's turn: faceVis eases to the other side, the group flipping at zero
    let fv = 1, shown = 0;
    for (let i = 0; i < 30; i++) {
      fv += (-1 - fv) * (1 - Math.exp(-15 / 60));
      const { k, flip } = backView(fv, 0), side = Math.sign(fv);
      if (k <= 0) continue;
      shown++;
      // the front's tail is at -side on screen; the fluke at side, mirrored once more by `flip`
      expect(side * (flip ? -1 : 1), `faceVis ${fv}`).toBe(-side);
    }
    expect(shown).toBeGreaterThan(2);
    expect(backView(1, 1)).toEqual({ k: 1, flip: false });
  });

  it('turns round over a few frames when an away is dropped early, and on its own cue when it runs out', () => {
    let a = 1, frames = 0;
    while (a > 0) { const n = awayStep(a, 0, null, 1 / 60); expect(a - n).toBeLessThan(.1); a = n; frames++; }
    expect(frames).toBeGreaterThan(12);
    // a replaced one does the same, and the gesture's own way out is followed exactly
    expect(awayStep(1, 0, { kind: 'away', k: 0 }, 1 / 60)).toBeGreaterThan(.9);
    expect(awayStep(1, 0, { kind: 'away', k: .96 }, 1 / 60)).toBe(0);
    expect(awayStep(.2, 1, { kind: 'away', k: .1 }, 1 / 60)).toBe(1);
  });
});

describe('a cup and a book held in both hands, as the whale draws them', () => {
  const z = id => model.parts.find(p => p.id === id).z;

  for (const [g, pose] of Object.entries(PROP_GESTURES)) {
    const P = model.poses[pose];
    it(`${pose}: has its file in every scheme, in front of her chest with its hands below the rim, over the bodice and face, under the fringe`, () => {
      const [arm] = P.required, [x, y, w, h] = arm.box, [, py] = Object.values(P.pivots)[0];
      for (const id of SCHEMES) expectFile(id, arm);
      expect(arm.parent).toBe(Object.keys(P.pivots)[0]);
      expect(x).toBeLessThan(model.pivots.armNear[0]);
      expect(x + w).toBeGreaterThan(model.pivots.armFar[0]);
      expect(y + h).toBeGreaterThan(model.pivots.armNear[1]);
      expect(arm.z).toBeGreaterThan(Math.max(z('torso_up'), z('arm_near'), z('face')));
      expect(arm.z).toBeLessThan(z('bangs'));
      // `wrist` is the top of the cup (where the steam rises) or of the book; the hands hold it lower down
      for (const id of SCHEMES) {
        const [, hy] = skinOf(id, arm);
        expect(hy, id).toBeGreaterThan(P.wrist[1] + 5);
        expect(hy, id).toBeLessThan(py);
      }
    });

    it(`${pose}: keeps the thing held its own colour in every scheme`, () => {
      // a point inside the cup's body or on the book's cover, below the rim
      const [arm] = P.required, [bx, by, bw, bh] = arm.box, px = P.wrist[0] - 4, py = P.wrist[1] + 12;
      const at = id => {
        const { w, h, px: pix } = rgbaOf(new URL(`${dir(id)}tex/${arm.tex}.png`, WHALE));
        const i = (Math.round((py - by) / bh * h) * w + Math.round((px - bx) / bw * w)) * 4;
        return [...pix.subarray(i, i + 4)];
      };
      const ref = at(SCHEMES[0]);
      expect(ref[3]).toBe(255);
      for (const id of SCHEMES) expect(at(id), id).toEqual(ref);
    });
  }

  it('lifts the cup to her mouth over the middle of the sip only', () => {
    expect(sipLift(.2)).toBe(0);
    expect(sipLift(.8)).toBe(0);
    expect(sipLift(.53)).toBe(1);
    for (const g of Object.keys(PROP_GESTURES)) expect(FAR_ARM_GESTURES).toContain(g);
  });
});

describe('a roll, as the whale draws it', () => {
  const ROLL = model.poses.roll;

  it('has its file in every scheme, sized to its box, over every standing part', () => {
    const [p] = ROLL.required;
    for (const id of SCHEMES) expectFile(id, p);
    expect(p.parent).toBe('rollBall');
    expect(p.z).toBeGreaterThan(Math.max(...model.parts.map(q => q.z)));
  });

  it("goes as far in a turn as the kit carries her, turning about the ball's middle, under her", () => {
    expect(ROLL.around).toBeCloseTo(ROLL_D, 0);
    const [p] = ROLL.required, [x, y, w, h] = p.box, [cx, cy] = ROLL.pivots.rollBall;
    expect(cx).toBe(128);
    expect(cx > x && cx < x + w && cy > y && cy < y + h).toBe(true);
    expect(cy + ROLL.support[0]).toBeCloseTo(256, 1);
  });

  it('rolls on its edge: at every turn its lowest drawn point is on the floor', () => {
    const [p] = ROLL.required, [bx, by, bw, bh] = p.box, [cx, cy] = ROLL.pivots.rollBall;
    expect(ROLL.support).toHaveLength(72);
    for (const id of SCHEMES.slice(0, 2)) {
      const { w, h, a } = alphaOf(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
      for (const deg of [0, 37, 90, 155, 200, 271, 333]) {
        const t = deg * Math.PI / 180;
        let low = -Infinity;
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          if (a[y * w + x] < 128) continue;
          const dx = bx + (x + .5) * bw / w - cx, dy = by + (y + .5) * bh / h - cy;
          low = Math.max(low, dx * Math.sin(t) + dy * Math.cos(t));
        }
        expect(Math.abs(low - ballLift(ROLL.support, deg)), `${id} ${deg}°`).toBeLessThan(3);
      }
    }
  });

  it('covers her only between the crouch and the spring up, and turns once while it does', () => {
    expect(ballMix(.1)).toBe(0);
    expect(ballMix(.9)).toBe(0);
    expect(ballMix(.3)).toBe(1);
    expect(ballMix(.7)).toBe(1);
    // the ball turns in step with the kit carrying her along
    for (let k = 0; k <= 1; k += .05) expect(rollTurn(k)).toBeCloseTo(coreRollTurn(k), 9);
    expect(rollTurn(.165)).toBe(0);
    expect(rollTurn(.835)).toBe(1);
    expect(ballLift(ROLL.support, 360)).toBeCloseTo(ROLL.support[0], 5);
    expect(ballLift(ROLL.support, -5)).toBeCloseTo(ROLL.support[71], 5);
  });

  it('turns the ball only as far as the kit carries her (gesture.travel), the full roll when no kit says', () => {
    expect(WHALE_ROLL_D).toBe(ROLL_D);
    // a full roll is once round, upright at both ends (her ball is as big round as the kit's roll)
    expect(ballAngle(0, ROLL.around)).toBeCloseTo(0, 0);
    expect(ballAngle(1, ROLL.around)).toBeCloseTo(360, 0);
    expect(ballAngle(.5, ROLL.around, undefined)).toBe(ballAngle(.5, ROLL.around, ROLL_D));
    for (const travel of [ROLL_D, 450, 300, 100, 0, -3]) {
      const a0 = ballAngle(0, ROLL.around, travel), a1 = ballAngle(1, ROLL.around, travel);
      // rolling without slipping: the perimeter it turns over is the way she goes
      expect((a1 - a0) / 360 * ROLL.around, String(travel)).toBeCloseTo(travel, 6);
      expect(Math.abs(a0)).toBeLessThanOrEqual(90);
      expect(((a1 % 360) + 360) % 360).toBeCloseTo(((-a0 % 360) + 360) % 360, 6);
      // in step with the kit moving her
      if (travel) for (const k of [.3, .5, .7]) expect((ballAngle(k, ROLL.around, travel) - a0) / (a1 - a0)).toBeCloseTo(coreRollTurn(k), 9);
    }
    expect(ballAngle(.6, ROLL.around, 0)).toBe(0);
    // and the drawing turns by it, with the frame's travel
    const src = readFileSync(new URL('../packages/cortico-world-desktop-pet/web/whale/figure.js', import.meta.url), 'utf8');
    expect(src).toMatch(/const a = ballAngle\(gk, ROLL\.around, g\?\.travel\)/);
  });
});

describe('hands pressed together, on the hips and held out; a hand at the head and a finger up, as the whale draws them', () => {
  const z = id => model.parts.find(p => p.id === id).z;

  it('has every file in every scheme, sized to its box', () => {
    for (const pose of [...Object.values(BOTH_HANDS), ...Object.values(NEAR_RAISES)]) {
      for (const p of model.poses[pose].required) for (const id of SCHEMES) expectFile(id, p);
    }
  });

  it('draws both-hand poses over the bodice and face, under the fringe, riding the upper body', () => {
    for (const pose of ['pray', 'hips', 'hug', 'tea']) {
      const P = model.poses[pose], [arm] = P.required, [x, , w] = arm.box;
      expect(arm.parent, pose).toBe(Object.keys(P.pivots)[0]);
      // across her middle (pressed hands are narrower than the shoulders; hips and a hug reach past them)
      expect(x, pose).toBeLessThan(128);
      expect(x + w, pose).toBeGreaterThan(128);
      if (pose !== 'pray') { expect(x, pose).toBeLessThan(model.pivots.armNear[0]); expect(x + w, pose).toBeGreaterThan(model.pivots.armFar[0]); }
      expect(arm.z, pose).toBeGreaterThan(Math.max(z('torso_up'), z('arm_near'), z('face')));
      expect(arm.z, pose).toBeLessThan(z('bangs'));
    }
  });

  it('raises the near arm from its shoulder to the drawn hand: `rest` points the fist arm the same way, the hand is at `wrist`', () => {
    for (const pose of Object.values(NEAR_RAISES)) {
      const P = model.poses[pose], [sx, sy] = Object.values(P.pivots)[0], [wx, wy] = P.wrist;
      // the fist arm hangs straight down at 0°; turned by `rest` it points from the shoulder at the drawn wrist
      const a = P.rest * Math.PI / 180;
      expect(Math.hypot(-Math.sin(a) - (wx - sx) / Math.hypot(wx - sx, wy - sy), Math.cos(a) - (wy - sy) / Math.hypot(wx - sx, wy - sy)), pose).toBeLessThan(.03);
      // (raised by angle, the drawing must sit past where the fist arm hands over; bent arms come in another way)
      const g = Object.keys(NEAR_RAISES).find(w => NEAR_RAISES[w] === pose);
      if (!BENT_RAISES.includes(g)) expect(Math.abs(P.rest), pose).toBeGreaterThan(RAISE_TO);
      // the far arm turns the other way (negative), the near one positive
      if (!BENT_RAISES.includes(g)) expect(Math.sign(P.rest), pose).toBe(FAR_RAISES.includes(g) ? -1 : 1);
      // two copies: the whole arm with the plain arms, the hand again over the head
      // (one held out in front of her, pointing, is a single copy over her body)
      const [whole, top] = P.required;
      if (top) { expect(top.z, pose).toBeGreaterThan(z('bangs')); expect(whole.z, pose).toBeLessThan(z('face')); }
      else expect(whole.z, pose).toBeGreaterThan(z('torso_up'));
      for (const id of SCHEMES) {
        // (a hand pointing ahead is seen edge-on: fewer skin pixels)
        const [hx, hy] = skinOf(id, whole, top ? 150 : 60);
        expect(Math.hypot(hx - wx, hy - wy), `${pose} ${id}`).toBeLessThan(14);
      }
    }
  });
});

describe('lying mouths and kneeling, as the whale draws them', () => {
  it('lying, she talks and smiles with mouth patches; asleep the mouth stays shut', () => {
    expect(lyingMouth({ talk: 1, t: Math.PI / 34 }, 'neutral', 'lie').talk).toBe(1);
    expect(lyingMouth({ talk: 0 }, 'happy', 'lie').smile).toBe(1);
    expect(lyingMouth({ talk: 0 }, 'neutral', 'lie').smile).toBe(0);
    expect(lyingMouth({ talk: 1 }, 'happy', 'sleep')).toEqual({ talk: 0, smile: 0 });
    expect(lyingMouth({ talk: 1 }, 'petrify', 'lie')).toEqual({ talk: 0, smile: 0 });
    // talking, it opens and closes on the beat
    const opens = [0, .03, .06, .09, .12, .15].map(t => lyingMouth({ talk: 1, t }, 'neutral', 'lie').talk);
    expect(Math.max(...opens) - Math.min(...opens)).toBeGreaterThan(.5);
    for (const use of ['smile', 'talk']) {
      const p = model.poses.lie.overlays.find(o => o.use === use);
      expect(p, use).toBeTruthy();
      for (const id of SCHEMES) expectFile(id, p);
    }
  });

  it('kneeling is one drawing on the floor, with an eyes-shut patch, in every scheme', () => {
    const K = model.poses.kneel, [p] = K.required, [x, y, w, h] = p.box;
    for (const id of SCHEMES) { expectFile(id, p); for (const o of K.overlays) expectFile(id, o); }
    expect(K.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
    expect(Math.abs(y + h - 256)).toBeLessThan(3);
    expect(Math.abs(x + w / 2 - 128)).toBeLessThan(25);
    expect(p.z).toBeGreaterThan(Math.max(...model.parts.map(q => q.z)));
  });
});
