import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { poseMix, lieStep, LIE_CUT, BODY_CUT, kneelStep, sitStep, seatStep, liftAnchors, lieDeformers, kickField, KICK, eyesShut, waveHandover, ARM_LIMIT, ARM_SPRING, cheerHandover, CHEER_TO, CHEER_ENV, chinWanted, FAR_ARM_GESTURES, backTailField, backView, awayStep, PROP_GESTURES, BOTH_HANDS, NEAR_RAISES, BENT_RAISES, FAR_RAISES, RAISE_TO, RAISE_HIGH, lyingMouth, sipLift, rollTurn, ballMix, BALL_IN, BALL_OUT, ballLift, ballAngle, ROLL_D as WHALE_ROLL_D, createWhaleFigure, kneelAlphas, KNEEL_ARMS_HOLD, KNEEL_LOW_UNDER, gesturesOf, headMoves, KNEEL_HEAD, kneelHeadField, partsOf, drawnEye, DRAWN_EYES, TILT_BACK, TILT_DEG, tiltEased, DROOP, LOOKUP, BODY_LEAN, WAG, appendagesOf, ARM_TWIN, SWAP_AT, handsIn, RAISE_ENTRY, FACE_ARMS, FACE_ARM, FACE_ARM_NOT, faceArmStep, KNEEL_FACE_SKIP, KNEEL_LEANS, NECK_HANDS, RAISE_AS, WEEP, weepPose, PAT_BOB } from '../packages/cortico-world-desktop-pet/web/whale/figure.js';
import { CLAP, createPet, TEAR_FX, FACES, mixFace, PLUS_FACES, PLUS_MIXES, PLUS_MIX_FACES, ROLL_D, rollTurn as coreRollTurn, HEAD_MORE, SNEEZE } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { pointOf } from '../packages/cortico-world-desktop-pet/web/claude-chan/motion.js';
import { chainPoint, meshGap } from './helpers/mesh.js';
import { upstreamKit } from './helpers/upstream-kit.js';
import { lieCutCheck } from './helpers/lie-cut.js';

// the whale's own figure.js runs below without WebGL: its rig keeps the last frame's deformer states for the tests
// (and the names of the textures uploaded since `up` was last cleared)
const rigSeen = vi.hoisted(() => ({ st: null, tree: null, up: [], hidden: null }));
vi.mock('../packages/cortico-world-desktop-pet/web/kit/rig.js', () => ({
  createRig: (_canvas, tree) => (rigSeen.tree = tree, { upload(n) { rigSeen.up.push(n); }, render(st, o) { rigSeen.st = st; rigSeen.hidden = o?.hidden ?? null; }, point: (_d, _st, x, y) => [x, y], dispose() {} }),
}));

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

  it('cuts the lying drawing in and out in a frame, at a lie with a margin either way, not dissolving over the rig', () => {
    expect(LIE_CUT.up).toBeLessThan(LIE_CUT.down);
    // on above `down`, off again only below `up`
    expect(lieStep({ on: false, a: 0 }, LIE_CUT.down - .01, 0).on).toBe(false);
    expect(lieStep({ on: false, a: 0 }, LIE_CUT.down + .01, 0).on).toBe(true);
    expect(lieStep({ on: true, a: 1 }, LIE_CUT.up + .01, 0).on).toBe(true);
    expect(lieStep({ on: true, a: 1 }, LIE_CUT.up - .01, 0).on).toBe(false);
    // the lie eased as the figure eases it, down and up (the kit's own easing on top only slows it): the drawing and
    // the opaque rig show together for at most BODY_CUT
    for (const dt of [1 / 60, 1 / 144]) {
      let L = { on: false, a: 0 }, lie = 0, both = 0;
      for (const [to, secs] of [[1, 1], [0, 1]]) {
        for (let i = 0; i < secs / dt; i++) {
          lie += (to - lie) * (1 - Math.exp(-14 * dt));
          L = lieStep(L, lie, dt);
          const { poseA, standA } = poseMix(L.a);
          if (poseA > 0 && standA > 0) both++;
        }
        expect(L.a).toBe(to);
      }
      expect(both * dt, `dt ${dt}`).toBeLessThanOrEqual(2 * BODY_CUT + 1e-9);
    }
  });

  it('swaps her lower body for the seated one in a frame on the kit\'s own sit, and never in the air', () => {
    expect(sitStep(0, .54, false, 1)).toBe(0);
    expect(sitStep(0, .56, false, 1)).toBe(1);
    expect(sitStep(1, .46, false, 1)).toBe(1);
    expect(sitStep(1, .44, false, 1)).toBe(0);
    // a jump from sitting: off the floor with the kit's sit still high, she is standing
    expect(sitStep(1, .9, true, 1)).toBe(0);
    expect(sitStep(0, 1, false, 1 / 120)).toBeCloseTo(.5);
    expect(sitStep(.5, 1, false, 1 / 120)).toBe(1);
  });
  it('cuts the kneeling drawing in and out in a frame, with a margin either way', () => {
    expect(kneelStep(0, .49, 1)).toBe(0);
    expect(kneelStep(0, .51, 1)).toBe(1);
    expect(kneelStep(1, .31, 1)).toBe(1);
    expect(kneelStep(1, .29, 1)).toBe(0);
    // her kneel eased in and (the kit drops it at once on any word) out: part-way for at most BODY_CUT each way
    for (const dt of [1 / 60, 1 / 144]) {
      let b = 0, k = 0, part = 0;
      for (const to of [1, 0]) {
        for (let i = 0; i < 1 / dt; i++) {
          k += (to - k) * (1 - Math.exp(-10 * dt));
          b = kneelStep(b, k, dt);
          if (b > 0 && b < 1) part++;
        }
        expect(b).toBe(to);
      }
      expect(part * dt, `dt ${dt}`).toBeLessThanOrEqual(2 * BODY_CUT + 1e-9);
    }
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

  it('keeps the lying drawing where it was drawn in a box 4 texture rows taller at the top (the winter outfit\'s spout), the maid\'s rows padded empty', () => {
    // (both outfits share the pose's box: the maid drawing has 4 empty rows on top, so each of its pixels lies where it lay
    // in the 473-row drawing in the box [9.6, 106.4, 236.96, 149.76], to a thousandth of a texel)
    expect(BODY.box).toEqual([9.6, 105.13, 236.96, 151.03]);
    const [, by, , bh] = BODY.box, old = { y: 106.4, h: 149.76, rows: 473 };
    for (const id of SCHEMES) {
      const { w, h, a } = alphaOf(new URL(`${dir(id)}tex/lie_body.png`, WHALE));
      expect([w, h], id).toEqual([748, 477]);
      for (let i = 0; i < 4 * w; i++) expect(a[i], `${id} row ${Math.floor(i / w)}`).toBe(0);
      // a drawn row r (r ≥ 4) at the rig height of row r - 4 in the old box
      for (const r of [4, 240, 476]) expect(Math.abs((by + (r + .5) * bh / h) - (old.y + (r - 4 + .5) * old.h / old.rows)) * TEX_PER_UNIT, `${id} row ${r}`).toBeLessThan(.02);
      // and something is drawn on the first row under the pad
      let top = 0;
      for (let x = 0; x < w; x++) top = Math.max(top, a[4 * w + x]);
      expect(top, id).toBeGreaterThan(0);
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

  it('props her chin on her hand when asked (托腮, `muse`) under any face, while the gesture lasts, standing or seated still', () => {
    for (const face of ['neutral', 'happy', 'sad']) {
      expect(chinWanted(face, 'idle', 0, { kind: 'muse', k: .5 }), face).toBe(true);
      expect(chinWanted(face, 'sit', 0, { kind: 'muse', k: .5 }), face).toBe(true);
      expect(chinWanted(face, 'idle', 0, { kind: 'muse', k: .95 }), face).toBe(false);
      expect(chinWanted(face, 'idle', 0, null), face).toBe(false);
    }
    expect(chinWanted('happy', 'walk', 0, { kind: 'muse', k: .5 })).toBe(false);
    expect(chinWanted('happy', 'idle', .2, { kind: 'muse', k: .5 })).toBe(false);
    expect(FAR_ARM_GESTURES).not.toContain('muse');
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
    // (the floor line: measured on the texture, every 1°, it is 255.87, as on the cape's table; only support[0] - ballLift(a) moves the ball)
    expect(cy + ROLL.support[0]).toBeCloseTo(255.87, 1);
  });

  it('rolls on its edge: at every turn its lowest drawn point is on the floor', () => {
    const [p] = ROLL.required, [bx, by, bw, bh] = p.box, [cx, cy] = ROLL.pivots.rollBall;
    expect(ROLL.support).toHaveLength(360);
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

  it('rolls on its edge between the samples too: its table every 1°, so the ball never floats off the floor', () => {
    // (every 5° the lowest point jumped from corner to corner between samples, around 211° by 0.9 units, and the straight
    // line across floated the ball; the table is measured on the texture as scratch/roll-cut/support_dense.py does)
    const [p] = ROLL.required, [bx, by, bw, bh] = p.box, [cx, cy] = ROLL.pivots.rollBall;
    const { w, h, a } = alphaOf(new URL(`${dir(SCHEMES[0])}tex/${p.tex}.png`, WHALE));
    const pts = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x] >= 128) pts.push(bx + (x + .5) * bw / w - cx, by + (y + .5) * bh / h - cy);
    let worst = 0, at = 0;
    for (let deg = 0; deg < 360; deg += .5) {
      const t = deg * Math.PI / 180, s = Math.sin(t), c = Math.cos(t);
      let low = -Infinity;
      for (let i = 0; i < pts.length; i += 2) low = Math.max(low, pts[i] * s + pts[i + 1] * c);
      const e = Math.abs(ballLift(ROLL.support, deg) - low);
      if (e > worst) { worst = e; at = deg; }
    }
    expect(worst, `maid ball at ${at}°`).toBeLessThan(.4);
  });

  it('cuts the ball in and out in one frame, never half over her standing rig', () => {
    // (a hand-over between bodies is a cut: a fade showed the ball and her standing body both half see-through)
    for (const dt of [1 / 60, 1 / 144]) {
      let flips = 0, prev = 0;
      for (let k = 0; k <= 1 + 1e-9; k += dt / 1.5) {
        const m = ballMix(k);
        expect([0, 1], `k ${k}`).toContain(m);
        if (m !== prev) flips++;
        prev = m;
      }
      expect(flips).toBe(2);
    }
    // at the old fade's middle, so the timing stays
    expect([ballMix(BALL_IN - 1e-6), ballMix(BALL_IN), ballMix(BALL_OUT - 1e-6), ballMix(BALL_OUT)]).toEqual([0, 1, 1, 0]);
    expect(BALL_IN).toBeCloseTo((.13 + .165) / 2, 9);
    expect(BALL_OUT).toBeCloseTo((.835 + .87) / 2, 9);
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
    expect(ballLift(ROLL.support, -5)).toBeCloseTo(ROLL.support[355], 5);
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
  it('gets up from kneeling on the kneeling drawing, never the seated one; a sit word after a kneel does sit', () => {
    // the kit's body (plus) running, and every frame it hands over stepped as the figure steps it
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    let seat = { sitB: 0, kneelK: 0, kneelB: 0, prevSit: 0 }, sitK = 0;
    const fig = {
      draw(_g, _fc, o) {
        sitK += (Math.min(1, Math.max(0, o.sit ?? 0)) - sitK) * (1 - Math.exp(-12 / 60));
        seat = seatStep(seat, o, { sitK, airborne: o.mode === 'air', kneelOK: true }, 1 / 60);
      },
      poses: { kneel: true },
    };
    const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    const run = (s, each = () => {}) => { for (let i = 0; i < s * 60; i++) { pet.step(1 / 60); pet.render(); each(); } };
    run(.5);
    // standing up (the kit wakes her, a second at sit 1), walking off, or sent somewhere (a startled wake, sit at once
    // to 0): kneeling until the seated body is gone
    for (const up of ['stand', 'walk', 'walkTo']) {
      pet.doWord('kneel'); run(3);
      expect(seat.kneelB, up).toBe(1);
      if (up === 'walkTo') pet.walkTo(pet.pet.x + 300, false, 1); else pet.doWord(up);
      let seatedShown = 0;
      run(4, () => { if (seat.sitB > 0 && seat.kneelB < 1) seatedShown++; });
      expect(seatedShown, up).toBe(0);
      expect(seat.kneelB, up).toBe(0);
      expect(seat.sitB, up).toBe(0);
    }
    pet.doWord('kneel'); run(3);
    pet.doWord('sit'); run(2);
    expect(seat.kneelB).toBe(0);
    expect(seat.sitB).toBe(1);
    // without the drawing she kneels as the seated rig
    expect(seatStep({ sitB: 1, kneelK: 1, kneelB: 1, prevSit: 1 }, { sit: 1, kneel: true, mode: 'sit' }, { sitK: 1 }, 1 / 60).kneelB).toBe(0);
  });
  it('keeps the kit\'s points on her kneeling head while she gets up, and seated after a sit word', () => {
    // her points as figure.js gives them: raised by seatStep's `up`, with no kneelRaise for the kit to add
    const src = readFileSync(new URL('figure.js', WHALE), 'utf8');
    // (only with the kneeling drawing: a dress without it kneels as the seated rig, whose head the points follow down)
    expect(src).toMatch(/seat = seatStep\(seat, o, \{[^}]*kneelRaise: KNEEL && kneelOK\(\) \? KNEEL_RAISE : 0[^}]*\}, dt\);/);
    expect(src).toMatch(/get anchors\(\) \{ return liftAnchors\(POINTS, seat\.up\); \}/);
    expect(src).not.toMatch(/const POINTS = \{[^;]*kneelRaise/);
    const K = 29 - model.poses.kneel.headDrop, POINTS = { gaze: [140, 110], tears: [[120, 120], [150, 120]], hearts: [96, 176, 62], bubble: [128, 18] };
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    let seat = { sitB: 0, kneelK: 0, kneelB: 0, prevSit: 0, up: 0 }, sitK = 0;
    const fig = {
      draw(_g, _fc, o) {
        sitK += (Math.min(1, Math.max(0, o.sit ?? 0)) - sitK) * (1 - Math.exp(-12 / 60));
        seat = seatStep(seat, o, { sitK, airborne: o.mode === 'air', kneelOK: true, kneelRaise: K }, 1 / 60);
      },
      get anchors() { return liftAnchors(POINTS, seat.up); },
      poses: { kneel: true },
    };
    const pet = createPet({ petG: el(), shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure: fig, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    const run = s => { for (let i = 0; i < s * 60; i++) { pet.step(1 / 60); pet.render(); } };
    // how far the bubble's spot is below her standing one, in kit units (the kit's own transform undone)
    const sink = () => {
      const p = pet.anchor(), c = pet.pet.xf, r = c.rot * Math.PI / 180;
      return (-(p.x - c.AX) * Math.sin(r) + (p.y - c.AY) * Math.cos(r)) / c.ky + c.ay - POINTS.bubble[1];
    };
    expect(liftAnchors(POINTS, 0)).toBe(POINTS);
    expect(liftAnchors(POINTS, 5)).toEqual({ gaze: [140, 105], tears: [[120, 115], [150, 115]], hearts: [96, 176, 57], bubble: [128, 13] });
    run(.5);
    pet.doWord('kneel'); run(3);
    expect(seat.kneelB).toBe(1);
    // kneeling they are on the drawing's head: raised once (hers), not twice
    expect(sink()).toBeCloseTo(model.poses.kneel.headDrop, 0);
    // getting up the kit's kneel is off from the first frame, while she wakes (a second at sit 1) on the kneeling
    // drawing: the points stay on its head, and from there they only go up, through the drawing's cut too (never down
    // toward the seated sink)
    pet.doWord('stand');
    let still = 0, off = 0, down = 0, last = sink(), cut = false;
    for (let i = 0; i < 4 * 60; i++) {
      run(1 / 60);
      const s = sink();
      down = Math.max(down, s - last);
      last = s;
      if (seat.kneelB === 0 && seat.prevSit > .2) cut = true;
      if (seat.kneelB >= 1 && pet.pet.sitK > .999) { still++; off = Math.max(off, Math.abs(s - model.poses.kneel.headDrop)); }
    }
    expect(still).toBeGreaterThan(30);
    expect(cut).toBe(true);
    expect(off).toBeLessThan(.5);
    expect(down).toBeLessThan(.5);
    expect(sink()).toBeCloseTo(0, 0);
    // a sit word after a kneel: the kneeling drawing goes, and so does the raise (the seated rig's points are the kit's)
    pet.doWord('kneel'); run(3);
    pet.doWord('sit'); run(2);
    expect(seat.kneelB).toBe(0);
    expect(sink()).toBeCloseTo(29, 0);
    // kneeling the raise is the kit's kneelRaise by its sit, drawing or not; seated or standing there is none
    const opt = { sitK: 1, kneelOK: true, kneelRaise: K };
    expect(seatStep({ sitB: 1, kneelK: 0, kneelB: 0, prevSit: .5 }, { sit: .5, kneel: true, mode: 'sit' }, { ...opt, kneelOK: false }, 1 / 60).up).toBeCloseTo(K / 2);
    expect(seatStep({ sitB: 1, kneelK: 0, kneelB: 0, prevSit: 1 }, { sit: 1, mode: 'sit' }, opt, 1 / 60).up).toBe(0);
    expect(seatStep({ sitB: 1, kneelK: 0, kneelB: 0, prevSit: 1 }, { sit: 1, kneel: true, mode: 'sit' }, { ...opt, kneelRaise: 0 }, 1 / 60).up).toBe(0);
  });
});

describe('a face and a gesture at once, as the whale draws them', () => {
  /**
   * The whale's own figure.js on the kit's body (plus), without a GPU: every frame's deformer states, and the frame.
   * `make` is the kit's createPet to run her on (upstream's, for a pack exported to it).
   */
  async function whaleOnKit(make = createPet, scheme = undefined) {
    // a do-nothing stand-in for whatever DOM or 2D canvas call the figure makes (numbers read as 0)
    const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
    const doc = globalThis.document;
    globalThis.document = { createElement: () => any, createElementNS: () => any };
    const fig = await createWhaleFigure(WHALE, { model, scheme, loadImage: async () => ({ width: 1, height: 1 }) });
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
    let frame = null;
    const figure = { ...fig, draw(g, fc, o) { frame = o; fig.draw(g, fc, o); } };
    Object.defineProperty(figure, 'anchors', { get: () => fig.anchors });
    Object.defineProperty(figure, 'poses', { get: () => fig.poses });
    const fxG = el();
    const pet = make({ petG, shadowEl: el(), fxG }, { sfx: { play() {} }, figure, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    const run = (s, each = () => {}) => { for (let i = 0; i < s * 60; i++) { pet.step(1 / 60); pet.render(); each(rigSeen.st, frame); } };
    return { pet, run, tree: rigSeen.tree, frame: () => frame, fx: () => fxG.innerHTML, fig, done: () => { globalThis.document = doc; } };
  }
  it('cuts her drawn arms in for the fist arms in a frame (SWAP_AT), never both half seen: at an angle, on an envelope, on a clock', () => {
    // the wave and the stretch at the fist arm's own angle, the two pointing the same way
    expect(waveHandover(1, SWAP_AT.wave - .01, 0, true).swap).toBe(0);
    expect(waveHandover(1, SWAP_AT.wave, 0, true).swap).toBe(1);
    // a cheer (and a long raise) a little short of where the fist arm is going, and its drawn arm still follows the fist arm there
    const rest = model.poses.cheer.arms.near.rest, to = CHEER_TO.near;
    expect(cheerHandover(1, to - SWAP_AT.cheer - .01, to, rest).swap).toBe(0);
    const c = cheerHandover(1, to - SWAP_AT.cheer, to, rest);
    expect(c).toMatchObject({ swap: 1, lift: 0 });
    expect(c.dir).toBe(to - SWAP_AT.cheer);
    // heart-way drawings early in their envelope coming in, late going (the drawing rises the rest of the way in after)
    expect(handsIn(SWAP_AT.hands.in - .01, .1)).toBe(0);
    expect(handsIn(SWAP_AT.hands.in, .1)).toBe(1);
    expect(handsIn(SWAP_AT.hands.out, .9)).toBe(1);
    expect(handsIn(SWAP_AT.hands.out - .01, .9)).toBe(0);
    expect(handsIn(0, .1)).toBe(0);
  });
  it('shows each arm one drawing, whole, through every arm gesture and her chin on her hand, standing, seated and kneeling', async () => {
    // every drawing of each arm (N near, F far): the fist arms, and each drawn arm by the arms it replaces
    const groups = [['fistN', 'N', ['arm_near']], ['fistF', 'F', ['arm_far', 'arm_far_end_front']]];
    for (const [id, P] of Object.entries(model.poses)) {
      if (['lie', 'back', 'roll', 'kneel', 'kneelLow'].includes(id)) continue;
      if (P.arms) { for (const [slot, a] of Object.entries(P.arms)) groups.push([`${id}.${slot}`, slot === 'near' ? 'N' : 'F', a.required.map(p => p.id)]); continue; }
      groups.push([id, id === 'chin' || FAR_RAISES.includes(id) ? 'F' : id === 'wave' || NEAR_RAISES[id] ? 'N' : 'NF', P.required.map(p => p.id)]);
    }
    // (and the words played on another's raised drawing, RAISE_AS: the weep's fist)
    const WORDS = ['wave', 'cheer', 'heart', ...Object.keys(PROP_GESTURES), ...Object.keys(BOTH_HANDS), ...Object.keys(NEAR_RAISES), ...Object.keys(RAISE_AS), 'muse'];
    const bad = [], seen = new Set();
    const check = (st, tag) => {
      const on = { N: [], F: [] };
      for (const [g, side, ids] of groups) {
        const a = Math.max(0, ...ids.map(i => st.alpha[i] ?? 0));
        if (a > 1e-6 && a < 1 - 1e-6) bad.push(`${tag} ${g} part way ${a.toFixed(2)}`);
        if (a > .02) for (const x of side) { on[x].push(g); seen.add(g); }
      }
      for (const x of ['N', 'F']) if (on[x].length !== 1) bad.push(`${tag} ${x}: ${on[x].join('+') || 'none'}`);
    };
    for (const scene of ['stand', 'sit', 'kneel']) {
      for (const w of [...new Set(WORDS)]) {
        const { pet, run, done } = await whaleOnKit();
        try {
          run(.5);
          if (scene !== 'stand') { pet.doWord(scene); run(3); }
          if (w === 'muse') pet.setExpr('thinking', 3); else pet.doWord(w);
          let i = 0;
          run(4, st => check(st, `${scene} ${w} @${i++}`));
        } finally { done(); }
      }
    }
    // back to back, the second asked part way through the first's hand-over, and in the middle of it
    for (const [a, b, gap] of [['wave', 'hug', .3], ['heart', 'point', .05], ['cheer', 'cross', .4], ['salute', 'stretch', .1]]) {
      const { pet, run, done } = await whaleOnKit();
      try {
        run(.5); pet.doWord(a); run(gap); pet.doWord(b);
        let i = 0;
        run(3, st => check(st, `${a}→${b} @${i++}`));
      } finally { done(); }
    }
    // her chin on her hand (thinking), then a gesture that takes the far arm from it, standing and seated
    for (const scene of ['stand', 'sit']) {
      for (const w of ['heart', 'point', 'cheer', 'hug']) {
        const { pet, run, done } = await whaleOnKit();
        try {
          run(.5);
          if (scene === 'sit') { pet.doWord('sit'); run(3); }
          pet.setExpr('thinking', 30);
          let i = 0;
          run(1.5, st => check(st, `${scene} thinking @${i++}`));
          pet.doWord(w);
          run(3, st => check(st, `${scene} thinking ${w} @${i++}`));
        } finally { done(); }
      }
    }
    // a face that poses her arms (FACE_ARMS), standing, seated and kneeling (the hybrid), in both outfits; then an arm
    // gesture over it (another drawing, and the face's own), and the face's pose back after it
    for (const scheme of ['deepseek', 'deepseek-cape']) {
      for (const scene of ['stand', 'sit', 'kneel']) {
        for (const [f, pose] of Object.entries(FACE_ARMS)) {
          const { pet, run, done } = await whaleOnKit(createPet, scheme);
          try {
            run(.5);
            if (scene !== 'stand') { pet.doWord(scene); run(3); }
            pet.setExpr(f, 30);
            let i = 0, last = null;
            const tag = `${scheme} ${scene} ${f}`;
            run(1.5, st => { check(st, `${tag} @${i++}`); last = st; });
            const shown = Math.max(...model.poses[pose].required.map(p => last.alpha[p.id] ?? 0));
            expect(shown, tag).toBe(scene === 'kneel' && KNEEL_FACE_SKIP.includes(f) ? 0 : 1);
            for (const w of ['wave', pose]) {
              pet.doWord(w);
              run(3.5, st => check(st, `${tag} ${w} @${i++}`));
            }
          } finally { done(); }
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    for (const g of ['wave', 'cheer.near', 'cheer.far', 'heart', 'hug', 'clap', 'clapo', 'stretch', 'salute', 'raise', 'point', 'chin', ...new Set(Object.values(FACE_ARMS))]) expect(seen.has(g), g).toBe(true);
  });
  it('poses her arms for a face (FACE_ARMS) once it has settled and no gesture of hers plays, cutting the drawing in early and out late', async () => {
    // (faceArmStep) the face held FACE_ARM.settle first; then the share comes in over FACE_ARM.dur, the drawing cut in at
    // SWAP_AT.hands.in of it and out at SWAP_AT.hands.out
    const dt = 1 / 60;
    let F = FACE_ARM_NOT, firstOn = null, t = 0;
    for (; t < 1.2; t += dt) { F = faceArmStep(F, 'hips', null, dt); if (F.on && firstOn == null) firstOn = F.k; }
    expect(F).toMatchObject({ g: 'hips', k: 1, on: 1 });
    expect(firstOn).toBeGreaterThanOrEqual(SWAP_AT.hands.in);
    expect(firstOn).toBeLessThan(SWAP_AT.hands.in + 2 * dt / FACE_ARM.dur);
    let lastOn = null;
    for (let i = 0; i < 40; i++) { F = faceArmStep(F, null, null, dt); if (F.on) lastOn = F.k; }
    expect(F).toMatchObject({ g: null, k: 0, on: 0 });
    expect(lastOn).toBeGreaterThanOrEqual(SWAP_AT.hands.out);
    expect(lastOn).toBeLessThan(SWAP_AT.hands.out + 2 * dt / FACE_ARM.dur);
    // a gesture for another drawing takes the arms at once; one for the same drawing keeps it shown as the gesture comes in
    let H = F = FACE_ARM_NOT;
    for (let i = 0; i < 60; i++) F = H = faceArmStep(F, 'cross', null, dt);
    expect(faceArmStep(F, 'cross', 'wave', dt)).toMatchObject({ on: 0 });
    expect(faceArmStep(H, 'cross', 'cross', dt)).toMatchObject({ on: 1, g: 'cross' });
    // after a gesture: FACE_ARM.after before the face's pose comes back, at once if the gesture was that pose
    for (let i = 0; i < 30; i++) F = faceArmStep(F, 'cross', 'wave', dt);
    expect(F.k).toBe(0);
    let back = 0;
    for (let i = 0; i < 120 && !F.on; i++, back += dt) F = faceArmStep(F, 'cross', null, dt);
    expect(back).toBeGreaterThan(FACE_ARM.after);
    for (let i = 0; i < 30; i++) H = faceArmStep(H, 'cross', 'cross', dt);
    expect(H).toMatchObject({ g: 'cross', k: 1, on: 1 });
    H = faceArmStep(H, 'cross', null, dt);
    expect(H).toMatchObject({ g: 'cross', k: 1, on: 1 });
    // a new face's pose waits for the one shown to go
    for (let i = 0; i < 60; i++) H = faceArmStep(H, 'cross', null, dt);
    H = faceArmStep(H, 'pray', null, dt);
    expect(H.g).toBe('cross');
    // on the kit: walking, lying and with a gesture playing she does not; a head move or a lean leaves the pose
    const { pet, run, done } = await whaleOnKit();
    try {
      const alpha = id => rigSeen.st.alpha[id] ?? 0;
      run(.5); pet.setExpr('determined', 60); run(1);
      expect(alpha('arm_hips')).toBe(1);
      expect(alpha('arm_near')).toBe(0);
      for (const w of ['nod', 'closer', 'sway']) { let min = 1; pet.doWord(w); run(1.5, () => { min = Math.min(min, alpha('arm_hips')); }); expect(min, w).toBe(1); run(2); }
      pet.doWord('walk'); run(.6);
      expect(alpha('arm_hips')).toBe(0);
      pet.doWord('lie'); run(3);
      expect(alpha('arm_hips')).toBe(0);
      pet.doWord('stand'); run(3);
      expect(alpha('arm_hips')).toBe(1);
      // the face's mouth is never under a hand: her own drawn mouths stay painted with the pose up
      expect(Object.values(FACE_ARMS)).not.toContain('cover');
    } finally { done(); }
  });
  /**
   * Her near arm's turn and the leg on the same side (the back leg, legs[0], as the kit's legs give it) over `seconds` of
   * a steady walk toward the far side of the stage, after `settle` seconds of walking; `face` is held throughout.
   */
  async function walkSamples(face = null, seconds = 2, settle = 1) {
    const { pet, run, done } = await whaleOnKit();
    try {
      run(.5);
      if (face) pet.setExpr(face, 60);
      pet.walkTo(pet.pet.x > 600 ? 60 : 1140, false, 1);
      run(settle);
      const arm = [], leg = [], far = [], legF = [];
      run(seconds, (st, o) => {
        if (pet.pet.mode !== 'walk') return;
        const a = o.legs.map(l => -Math.atan2(l[2] - l[0], Math.max(4, l[3] - l[1])) * 180 / Math.PI);
        arm.push(st.armNear.a); leg.push(a[0]); far.push(st.armFar.a); legF.push(a[1]);
      });
      return { arm, leg, far, legF };
    } finally { done(); }
  }
  const corr = (x, y) => {
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  };
  const spread = (x) => Math.max(...x) - Math.min(...x);
  it('walking, swings each arm against the leg on its own side, as far as before (#228)', async () => {
    const { arm, leg, far, legF } = await walkSamples();
    expect(arm.length).toBeGreaterThan(100);
    // the legs swing (a stride every half second or so): each arm goes back as its own leg goes forward
    expect(spread(leg)).toBeGreaterThan(20);
    expect(corr(arm, leg)).toBeLessThan(-.95);
    expect(corr(far, legF)).toBeLessThan(-.95);
    // as wide as the swing that went through the arm springs before (about 21° from front to back)
    expect(spread(arm)).toBeGreaterThan(15);
    expect(spread(arm)).toBeLessThan(28);
  });
  it('walking, does not swing the arms a face holds still (angry, determined, nervous)', async () => {
    for (const face of ['angry', 'determined', 'nervous']) {
      const { arm, leg } = await walkSamples(face);
      expect(spread(leg), face).toBeGreaterThan(20);
      // (nervous fidgets on its own, about 6° from end to end, standing or walking)
      expect(spread(arm), face).toBeLessThan(face === 'nervous' ? 7 : 2.5);
      expect(Math.abs(corr(arm, leg)), face).toBeLessThan(.5);
    }
  });
  it('lying down and getting up (jump or stand), the lying drawing cuts, never two of her at once (as the girls: tests/helpers/lie-cut.js)', async () => {
    const { pet, done } = await whaleOnKit();
    try {
      lieCutCheck({ pet, frame: () => { pet.step(1 / 60); pet.render(); return { pose: rigSeen.st.alpha.lie_body ?? 0, front: rigSeen.hidden == null }; } });
    } finally { done(); }
  });
  it('cries small drops (tearDrop): about a quarter of an eye across, from under each eye standing and kneeling, from the lying head lying', async () => {
    const { pet, run, fx, fig, done } = await whaleOnKit();
    try {
      const { w, run: slide } = fig.tearDrop;
      // her eyes are 125 and 67 master px across (S .19 a px): the kit's own drop is 22.5 units, wider than either
      expect(w).toBeGreaterThan(3.5);
      expect(w).toBeLessThan(5.5);
      // (one per eye: the far cheek's outline is higher, nearer its eye)
      expect(slide[0]).toBeGreaterThan(9);
      expect(slide[0]).toBeLessThan(15);
      expect(slide[1]).toBeGreaterThan(4);
      expect(slide[1]).toBeLessThan(slide[0]);
      // the drops as drawn: each one's tip (stage px) and width
      const drops = () => [...fx().matchAll(/class="tearf" opacity=".92" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/g)].map(m => ({ x: +m[1], y: +m[2] - 9 * +m[3], w: 12 * +m[3] }));
      const near = (d, [x, y], low = pet.pet.low) => { const q = pet.toStage(x, y + low); expect(Math.hypot(d.x - q.x, d.y - q.y)).toBeLessThan(1.5); };
      const firstTwo = () => { pet.setExpr('neutral', .1); run(1.5); pet.setExpr('cry', 30); run(TEAR_FX.well + .03); const a = drops().at(-1); run(TEAR_FX.every); return [a, drops().at(-1)]; };
      run(.5);
      let [a, b] = firstTwo();
      expect(a.w).toBeCloseTo(Math.max(w * .42, TEAR_FX.minPx), 1);
      const tears = fig.anchors.tears;
      near(a, tears[0]); near(b, tears[1]);
      pet.doWord('kneel');
      run(3);
      [a, b] = firstTwo();
      near(a, fig.anchors.tears[0]); near(b, fig.anchors.tears[1]);
      pet.doWord('lie');
      run(3);
      expect(pet.pet.lieK).toBeGreaterThan(.95);
      [a] = firstTwo();
      near(a, fig.anchors.lie.tear, 0);
    } finally { done(); }
  });
  it("puts the kit's own marks by her head: the dots beside it standing, lower kneeling, by the lying head lying; steam off both sides", async () => {
    const { pet, run, fx, fig, done } = await whaleOnKit();
    try {
      run(.5);
      const DOTS = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\([\d.]+\)" opacity="[\d.]+"><g fill="#fff"/;
      const dots = () => { const m = fx().match(DOTS); return [+m[1], +m[2]]; };
      const near = (p, q) => expect(Math.hypot(p[0] - q.x, p[1] - q.y)).toBeLessThan(.5);
      // (she names no bulb spot: beside her bubble's, as an idea's bulb)
      expect(fig.anchors.bulb).toBeUndefined();
      const [bx, by] = fig.anchors.bubble;
      pet.setExpr('speechless');
      run(1);
      near(dots(), pet.toStage(bx + 62, by + 28));
      const standing = dots();
      pet.doWord('kneel');
      run(3);
      pet.setExpr('speechless');
      run(1);
      expect(dots()[1]).toBeGreaterThan(standing[1] + 2);
      pet.doWord('lie');
      run(3);
      expect(pet.pet.lieK).toBeGreaterThan(.95);
      pet.setExpr('speechless');
      run(1);
      const [lx, ly] = fig.anchors.lie.bubble;
      near(dots(), pet.toStage(lx + 62, ly + 28));
      // 灵魂出窍's little ghost too, beside the lying head (bobbing up to 2.5 units)
      const ghost = () => { const m = fx().match(/<g class="soul" opacity="[\d.]+" transform="translate\(([-\d.]+) ([-\d.]+)\)/); return [+m[1], +m[2]]; };
      pet.setExpr('soulout');
      run(1.2);
      const gp = ghost(), gq = pet.toStage(lx + 62, ly + 28 - 8);
      expect(Math.hypot(gp[0] - gq.x, gp[1] - gq.y)).toBeLessThan(3);
      pet.doWord('stand');
      run(3);
      pet.setExpr('fuming');
      run(.1);
      const xs = [...fx().matchAll(/<g fill="#8a93b0"[^>]*><circle cx="([-\d.]+)"/g)].map((m) => +m[1]), mid = pet.anchor().x;
      expect(xs).toHaveLength(2);
      expect(Math.min(...xs)).toBeLessThan(mid);
      expect(Math.max(...xs)).toBeGreaterThan(mid);
    } finally { done(); }
  });
  /** A fresh whale figure drawing frames by hand (no kit): each call draws `o` with face `fc` and gives that frame's states. */
  async function whaleByHand() {
    const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
    const doc = globalThis.document;
    globalThis.document = { createElement: () => any, createElementNS: () => any };
    try {
      const fig = await createWhaleFigure(WHALE, { model, loadImage: async () => ({ width: 1, height: 1 }) });
      const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
      return (fc, o) => {
        globalThis.document = { createElement: () => any, createElementNS: () => any };
        try { fig.draw(petG, fc, o); } finally { globalThis.document = doc; }
        const st = rigSeen.st;
        // (the states are one object the figure reuses: keep what the tests read)
        return { neck: { ...st.neck }, pitch: st.headFront.fn(.5, .5)[1] / 2.8, waist: { ...st.waist }, arm: st.armNear.a };
      };
    } finally { globalThis.document = doc; }
  }
  /** A still frame of the kit's, standing, with `x` over it. */
  const frame = (x = {}) => ({ t: 1, mode: 'idle', face: 'neutral', look: [0, 0], legs: [[104, 212, 104, 241], [150, 212, 150, 241]], low: 0, sit: 0, tilt: 0, lean: 0, facing: 1, swing: 0, gesture: null, ...x });
  const faceOf = n => FACES[n].f(0);
  // each arm gesture's drawn arms, and the plain arm(s) they take over from
  const DRAWN = {
    wave: { parts: model.poses.wave.required, plain: ['arm_near'] },
    cheer: { parts: [...model.poses.cheer.arms.near.required, ...model.poses.cheer.arms.far.required], plain: ['arm_near', 'arm_far'] },
    stretch: { parts: model.poses.stretch.required, plain: ['arm_near', 'arm_far'] },
    scratch: { parts: model.poses.scratch.required, plain: ['arm_near'] },
    point: { parts: model.poses.point.required, plain: ['arm_far'] },
  };

  /** What in a frame's deformer states is not a finite number: the rotations and moves, and each warp at its corners and middle. */
  const notFinite = (tree, st) => {
    const bad = [];
    for (const [id, s] of Object.entries(st)) {
      if (typeof s !== 'object' || !s || id === 'alpha') continue;
      for (const k of ['a', 'tx', 'ty', 'sx', 'sy', 's']) if (k in s && !Number.isFinite(s[k])) bad.push(`${id}.${k}=${s[k]}`);
      if (!s.fn) continue;
      const [x0, y0, x1, y1] = tree.deformers[id]?.rect ?? [0, 0, 256, 256];
      for (const [u, v] of [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]]) {
        if (!s.fn(u, v, x0 + u * (x1 - x0), y0 + v * (y1 - y0)).every(Number.isFinite)) bad.push(`${id}.fn(${u},${v})`);
      }
    }
    return bad;
  };
  it('keeps her hair, bangs, tail and skirt drawn after a frame that took no time or a swing that is not a number (#87)', async () => {
    // on the kit: a frame of dt 0 while she walks and is held is skipped, and the frames after it are whole
    const { pet, run, done } = await whaleOnKit();
    try {
      run(.5);
      pet.walkTo(pet.pet.x + 300, false, 1);
      run(.3);
      pet.step(0);
      run(.3);
      expect(notFinite(rigSeen.tree, rigSeen.st)).toEqual([]);
      expect(Number.isFinite(pet.pet.swing)).toBe(true);
    } finally { done(); }
    // her pack exported to upstream's kit (v0.1.17, without the kit's guard): the frame of dt 0 leaves its swing NaN for
    // good, and she is handed it every frame; she reads it as none, so every warp and turn is still drawn
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const up = await upstreamKit('upstream-kit-v0.1.17-whale');
      if (up) {
        const { pet, run, done } = await whaleOnKit(up.createPet);
        try {
          run(.5);
          pet.walkTo(pet.pet.x + 300, false, 1);
          run(.3);
          pet.step(0); pet.render();
          run(.3);
          expect(pet.pet.swing).toBeNaN();
          expect(notFinite(rigSeen.tree, rigSeen.st)).toEqual([]);
        } finally { done(); }
      }
      // drawn by hand, a frame that took no time, then a NaN swing and gaze for a frame or two (what reaches her
      // springs): they hold, and the frames after it draw every warp again
      const draw = await whaleByHand(), fc = faceOf('neutral');
      for (const mode of ['walk', 'drag']) {
        let t = 1;
        for (let i = 0; i < 30; i++) draw(fc, frame({ t: t += 1 / 60, mode, swing: 8 }));
        draw(fc, frame({ t, mode, swing: NaN, look: [NaN, NaN] }));
        draw(fc, frame({ t: t += 1 / 60, mode, swing: NaN, look: [NaN, NaN] }));
        for (let i = 0; i < 3; i++) draw(fc, frame({ t: t += 1 / 60, mode, swing: 8 }));
        expect(notFinite(rigSeen.tree, rigSeen.st), mode).toEqual([]);
      }
    } finally { warn.mockRestore(); }
  });
  it("draws a gesture's arms over a nervous or coaxing face's idle arms, handing over from the fist arms as without it", async () => {
    const { pet, run, done } = await whaleOnKit();
    try {
      run(.5);
      for (const face of ['nervous', 'coax']) {
        for (const [gesture, { parts, plain }] of Object.entries(DRAWN)) {
          // (seated the cheer has no hop, which would turn the face away while she is in the air)
          if (gesture === 'cheer') { pet.doWord('sit'); run(2); } else { pet.doWord('stand'); run(2.5); }
          // the face asked for once the gesture is under way (the kit keeps the gesture and shows the face)
          expect(pet.doWord(gesture), gesture).toBe(true);
          run(.1);
          expect(pet.doWord(face), `${face} over ${gesture}`).toBe(true);
          let shown = 0, plainLeft = 1, frames = 0;
          run(2.8, (st, o) => {
            // (over a gesture whose own face is its body, a stretch, the face is made of both: `nervous+nervous+stretching`)
            if (o.gesture?.kind !== gesture || o.face.split('+')[0] !== face) return;
            frames++;
            const k = Math.min(...parts.map(p => st.alpha[p.id]));
            if (k > shown) { shown = k; plainLeft = Math.max(...plain.map(id => st.alpha[id])); }
          });
          expect(frames, `${face} shows during ${gesture}`).toBeGreaterThan(30);
          expect(shown, `${gesture}'s drawn arms while ${face}`).toBe(1);
          expect(plainLeft, `${gesture}'s plain arms gone while ${face}`).toBe(0);
          pet.doWord('neutral'); run(1.5);
        }
      }
    } finally { done(); }
  });

  it('plays a nod on its own clock beside a wave, and takes it from the gesture when the kit has no head channel', async () => {
    const nod = headMoves({ kind: 'nod', k: .6 }).nod;
    const both = (await whaleByHand())(faceOf('neutral'), frame({ gesture: { kind: 'wave', k: .2 }, head: { kind: 'nod', k: .6 } }));
    const arms = (await whaleByHand())(faceOf('neutral'), frame({ gesture: { kind: 'wave', k: .2 }, head: null }));
    // (the wave's arm the same either way; the nod dips the neck and pitches the face)
    expect(both.arm).toBeCloseTo(arms.arm, 9);
    expect(both.neck.a - arms.neck.a).toBeCloseTo(7 * nod, 6);
    expect(both.pitch - arms.pitch).toBeCloseTo(.9 * nod, 6);
    for (const kind of ['nod', 'shake', 'sigh', 'tilt']) {
      for (const k of [.15, .4, .6, .85]) {
        const old = (await whaleByHand())(faceOf('neutral'), frame({ gesture: { kind, k } }));
        const now = (await whaleByHand())(faceOf('neutral'), frame({ head: { kind, k } }));
        expect(now, `${kind} ${k}`).toEqual(old);
      }
    }
    expect(gesturesOf({ gesture: { kind: 'sigh', k: .3 } })).toEqual({ head: { kind: 'sigh', k: .3 }, arm: null });
  });

  it('on the kit, nods while she waves: both in the same frames, each on its own clock', async () => {
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      run(.5);
      expect(pet.doGroup(['wave', 'nod'])).toEqual([true, true]);
      let both = null, waved = 0;
      run(.65, (st, o) => {
        if (o.gesture?.kind !== 'wave' || o.head?.kind !== 'nod') return;
        // (the drawn arm waving while she nods)
        waved = Math.max(waved, Math.min(...model.poses.wave.required.map(p => st.alpha[p.id])));
        if (headMoves(o.head).nod > (both ? headMoves(both.o.head).nod : 0)) both = { o: { ...o } };
      });
      expect(both).not.toBe(null);
      expect(both.o.gesture.k).toBeLessThan(both.o.head.k);
      expect(waved).toBe(1);
      // that frame drawn again without the head's gesture: only the nod is gone
      const fc = faceOf('happy'), withNod = (await whaleByHand())(fc, both.o), without = (await whaleByHand())(fc, { ...both.o, head: null });
      expect(withNod.neck.a - without.neck.a).toBeCloseTo(7 * headMoves(both.o.head).nod, 6);
      expect(withNod.neck.a - without.neck.a).toBeGreaterThan(4);
      expect(withNod.arm).toBeCloseTo(without.arm, 9);
      expect(last().gesture.kind).toBe('wave');
    } finally { done(); }
  });

  it('nods, shakes and sighs kneeling: the kneeling drawing\'s head moves, its sides and bottom and the knees stay', async () => {
    const { pet, run, tree, frame: last, done } = await whaleOnKit();
    try {
      const D = tree.deformers, [x0, y0, x1, y1] = D.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      expect(D.kneelHead.parent).toBe('kneel');
      for (const p of [...model.poses.kneel.required, ...model.poses.kneel.overlays]) expect(tree.parts.find(q => q.id === p.id).parent, p.id).toBe('kneelHead');
      let st = null;
      const go = s => run(s, x => { st = x; });
      const off = (x, y) => {
        const a = pointOf(D, 'kneelHead', st, x, y), b = pointOf(D, 'kneelHead', { ...st, kneelHead: null }, x, y);
        return [a[0] - b[0], a[1] - b[1]];
      };
      const still = () => { for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1], [cx, 240]]) for (const d of off(x, y)) expect(Math.abs(d)).toBeLessThan(1e-9); };
      go(.5);
      pet.doWord('kneel'); go(3);
      expect(st.alpha.kneel_body).toBe(1);
      pet.doWord('nod'); go(.17);
      expect(last().kneel).toBe(true);
      expect(off(cx, cy)[1]).toBeGreaterThan(3);
      expect(off(cx, y0 + 4)[1]).toBeGreaterThan(off(cx, cy)[1]);
      still();
      go(1);
      pet.doWord('shake'); go(.08);
      expect(Math.abs(off(cx, cy)[0])).toBeGreaterThan(2);
      expect(Math.abs(off(cx, cy)[1])).toBeLessThan(1e-9);
      still();
      go(1);
      pet.doWord('sigh'); go(.5);
      expect(off(cx, cy)[1]).toBeLessThan(-1);
      go(.7);
      expect(off(cx, cy)[1]).toBeGreaterThan(1.5);
      expect(last().kneel).toBe(true);
      expect(st.alpha.kneel_body).toBe(1);
      const f = kneelHeadField([0, 0, 100, 100], { shake: 1 });
      expect(f(.5, .5, 50, 50)).toEqual([KNEEL_HEAD.shake, 0]);
      expect(f(0, .5, 0, 50)).toEqual([0, 0]);
    } finally { done(); }
  });

  it('tilts her head curiously (歪头) standing, seated, kneeling and lying: over to one side, held about 1.2 s, back', async () => {
    // (her idle glances, at random, move her head by up to ±3.5°: here she looks straight ahead)
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      let st = null;
      const go = s => run(s, x => { st = x; });
      /** The neck's angle over `s` seconds, averaged (her idle sway is ±1.2°). */
      const mean = s => { let a = 0, n = 0; run(s, x => { st = x; a += x.neck.a; n++; }); return a / n; };
      go(1);
      const rest = mean(.4);
      expect(pet.doWord('tilt')).toBe(true);
      go(.5);
      expect(last().head).toMatchObject({ kind: 'tilt' });
      expect(last().gesture).toBe(null);
      expect(mean(.6) - rest).toBeGreaterThan(TILT_DEG * .8);
      go(1.2);
      expect(last().head).toBe(null);
      expect(Math.abs(mean(.4) - rest)).toBeLessThan(TILT_DEG * .4);
      // a face that leans the other way (confused) takes the tilt that way
      pet.setExpr('confused', 4); go(1);
      pet.doWord('tilt'); go(.5);
      expect(mean(.6) - rest).toBeLessThan(-TILT_DEG * .8);
      go(1.5);
      pet.setExpr('neutral', .1); go(1);
      // beside a wave
      expect(pet.doGroup(['wave', 'tilt'])).toEqual([true, true]);
      go(.5);
      expect(last().gesture?.kind).toBe('wave');
      expect(last().head?.kind).toBe('tilt');
      go(2);
      // seated
      pet.doWord('sit'); go(2.5);
      const seated = mean(.4);
      pet.doWord('tilt'); go(.5);
      expect(last().mode).toBe('sit');
      expect(mean(.6) - seated).toBeGreaterThan(TILT_DEG * .8);
      go(1.5);
      // kneeling: the kneeling drawing's head turns about the chin, its sides and bottom stay
      // (this whale's rig, made at her first frame)
      const D = rigSeen.tree.deformers, [x0, y0, x1, y1] = D.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const off = (x, y) => {
        const a = pointOf(D, 'kneelHead', st, x, y), b = pointOf(D, 'kneelHead', { ...st, kneelHead: null }, x, y);
        return [a[0] - b[0], a[1] - b[1]];
      };
      pet.doWord('kneel'); go(3);
      expect(st.alpha.kneel_body).toBe(1);
      pet.doWord('tilt'); go(.8);
      expect(last().kneel).toBe(true);
      expect(off(cx, y0 + 6)[0]).toBeGreaterThan(5);
      expect(off(cx, y0 + 6)[0]).toBeGreaterThan(off(cx, cy)[0]);
      for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1]]) for (const d of off(x, y)) expect(Math.abs(d)).toBeLessThan(1e-9);
      go(1.5);
      expect(last().kneel).toBe(true);
      expect(Math.hypot(...off(cx, y0 + 6))).toBeLessThan(1e-9);
      // lying: the head turns about the chin on her hands
      pet.doWord('lie'); go(3);
      expect(last().lie).toBeCloseTo(1, 3);
      const L = model.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const before = st.lieHead.fn(.5, .1, ...top);
      pet.doWord('tilt'); go(.8);
      expect(last().head?.kind).toBe('tilt');
      expect(Math.abs(st.lieHead.fn(.5, .1, ...top)[0] - before[0])).toBeGreaterThan(3);
      expect(headMoves({ kind: 'tilt', k: .5 }).tilt).toBe(1);
      const f = kneelHeadField([0, 0, 100, 100], { tilt: 1 });
      expect(f(.5, .3, 50, 30)[0]).toBeCloseTo(KNEEL_HEAD.tilt * Math.PI / 180 * 70, 9);
      expect(f(.5, 1, 50, 100)).toEqual([0, 0]);
    } finally { done(); rand.mockRestore(); }
  });

  it('wags her tail (摇尾巴) wider and faster than any mood standing, seated and lying, then hands it back', async () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      const range = (s, at) => { const xs = []; run(s, x => xs.push(at(x))); return Math.max(...xs) - Math.min(...xs); };
      run(1, () => {});
      pet.setExpr('excited', 30); run(1.5, () => {});
      const glad = range(2, x => x.tail.a);
      for (const mode of ['stand', 'sit']) {
        pet.doWord(mode); run(2.5, () => {});
        expect(pet.act('wag'), mode).toBe(true);
        run(.3, () => {});
        expect(last().appendages.tail, mode).toMatchObject({ kind: 'wag' });
        expect(range(1.8, x => x.tail.a), mode).toBeGreaterThan(Math.max(glad * 1.5, WAG.swing * 1.5));
        run(1, () => {});
      }
      expect(range(1.5, x => x.tail.a)).toBeLessThan(glad * 1.3);
      // lying, the tail on the floor; turned away, the back drawing's fluke
      pet.doWord('lie'); run(3, () => {});
      const lying = range(1.5, x => x.lieTail.a);
      pet.act('wag'); run(.3, () => {});
      expect(range(1.8, x => x.lieTail.a)).toBeGreaterThan(Math.max(lying * 1.5, WAG.lie * 1.5));
      run(1, () => {});
      expect(appendagesOf({ gesture: { kind: 'wag', k: .3 } })).toEqual({ tail: { kind: 'wag', k: .3 } });
      expect(appendagesOf({ gesture: { kind: 'earsup', k: .3 } })).toEqual({});
    } finally { done(); rand.mockRestore(); }
  });

  it('droops her head (低头) standing, seated, kneeling and lying, and leans in, back, sways and stamps standing or seated', async () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      let st = null;
      const go = s => run(s, x => { st = x; });
      const mean = (at, s) => { let a = 0, n = 0; run(s, x => { st = x; a += at(x); n++; }); return a / n; };
      const span = (word, s, at) => { pet.doWord(word); const xs = []; run(s, x => { st = x; xs.push(at(x)); }); return xs; };
      go(1);
      // standing and seated, the neck bends her head forward and down, held, then back
      for (const mode of ['stand', 'sit']) {
        pet.doWord(mode); go(2.5);
        const rest = mean(x => x.neck.a, .4);
        pet.doWord('droop'); go(.5);
        expect(last().head, mode).toMatchObject({ kind: 'droop' });
        expect(mean(x => x.neck.a, .6) - rest, mode).toBeGreaterThan(DROOP.neck * .7);
        go(1.5);
        expect(Math.abs(mean(x => x.neck.a, .3) - rest), mode).toBeLessThan(DROOP.neck * .4);
        // nearer, further off, rocking
        expect(Math.max(...span('closer', 2.1, x => x.waist.sx ?? 1)), mode).toBeGreaterThan(1 + BODY_LEAN.near * .8);
        expect(Math.min(...span('leanback', 1.7, x => x.waist.a)), mode).toBeLessThan(-BODY_LEAN.back * .7);
        const rock = span('sway', 2.5, x => x.body.a);
        expect(Math.max(...rock) - Math.min(...rock), mode).toBeGreaterThan(BODY_LEAN.swayBody * 1.5);
      }
      // a stamp gets her up and lifts a leg
      // (the legs are warps about the hip, `hinge`: how far each foot, at the bottom of its leg's box, moves up or down)
      const foot = (x, id) => { const [x0, , x1, y1] = rigSeen.tree.deformers[id].rect; return x[id].fn(.5, 1, (x0 + x1) / 2, y1 - 4)[1]; };
      const legs = span('stamp', 1.4, x => Math.min(foot(x, 'legBack'), foot(x, 'legFront')));
      expect(last().mode).toBe('idle');
      expect(Math.min(...legs)).toBeLessThan(-8);
      // kneeling the drawing's head drops, the kneel kept; lying the head turns forward about the chin
      const D = rigSeen.tree.deformers, [x0, y0, x1, y1] = D.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const off = (x, y) => {
        const a = pointOf(D, 'kneelHead', st, x, y), b = pointOf(D, 'kneelHead', { ...st, kneelHead: null }, x, y);
        return [a[0] - b[0], a[1] - b[1]];
      };
      pet.doWord('kneel'); go(3);
      pet.doWord('droop'); go(.8);
      expect(last().kneel).toBe(true);
      expect(off(cx, y0 + 6)[1]).toBeGreaterThan(2);
      for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1]]) for (const d of off(x, y)) expect(Math.abs(d)).toBeLessThan(1e-9);
      go(1.5);
      pet.doWord('lie'); go(3);
      const L = model.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const before = st.lieHead.fn(.5, .1, ...top);
      pet.doWord('droop'); go(.8);
      expect(Math.abs(st.lieHead.fn(.5, .1, ...top)[0] - before[0])).toBeGreaterThan(3);
      expect(headMoves({ kind: 'droop', k: .5 }).down).toBe(1);
    } finally { done(); rand.mockRestore(); }
  });

  it('looks up (抬头), pants (喘气), shuts her eyes (闭眼) and sneezes (打喷嚏) standing, seated, kneeling and lying', async () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      let st = null;
      const go = s => run(s, x => { st = x; });
      const mean = (at, s) => { let a = 0, n = 0; run(s, x => { st = x; a += at(x); n++; }); return a / n; };
      const span = (word, s, at) => { pet.doWord(word); const xs = []; run(s, x => { st = x; xs.push(at(x)); }); return xs; };
      go(1);
      for (const mode of ['stand', 'sit']) {
        pet.doWord(mode); go(2.5);
        // a look up bends the neck back (the other way from a droop), held, then back; her waist stays (a lean back moves it)
        const rest = mean(x => x.neck.a, .4), waist = mean(x => x.waist.a, .2);
        pet.doWord('lookup'); go(.5);
        expect(last().head, mode).toMatchObject({ kind: 'lookup' });
        expect(rest - mean(x => x.neck.a, .6), mode).toBeGreaterThan(LOOKUP.neck * .7);
        expect(Math.abs(mean(x => x.waist.a, .2) - waist), mode).toBeLessThan(1);
        go(1.2);
        expect(Math.abs(mean(x => x.neck.a, .3) - rest), mode).toBeLessThan(LOOKUP.neck * .4);
        // a pant bobs her upper body on each quick breath, with its own face
        const sy = span('pant', HEAD_MORE.pant, x => x.waist.sy);
        expect(Math.max(...sy) - Math.min(...sy), mode).toBeGreaterThan(.03);
        go(.4);
        // shut eyes: the frame's blink held shut
        pet.doWord('closeeyes'); go(.6);
        expect(last().blink, mode).toBeGreaterThan(.95);
        go(1.5);
        // a sneeze: the neck back as the breath catches, then thrown forward at the jolt
        const necks = span('sneeze', HEAD_MORE.sneeze, x => x.neck.a), at = Math.round(HEAD_MORE.sneeze * SNEEZE.at * 60);
        expect(Math.max(...necks.slice(at, at + 12)) - rest, mode).toBeGreaterThan(5);
        go(.5);
      }
      // kneeling each keeps her kneeling; a look up lifts the drawing's head, its sides and bottom staying
      const D = rigSeen.tree.deformers, [x0, y0, x1, y1] = D.kneelHead.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const off = (x, y) => {
        const a = pointOf(D, 'kneelHead', st, x, y), b = pointOf(D, 'kneelHead', { ...st, kneelHead: null }, x, y);
        return [a[0] - b[0], a[1] - b[1]];
      };
      pet.doWord('kneel'); go(3);
      pet.doWord('lookup'); go(.8);
      expect(last().kneel).toBe(true);
      expect(off(cx, y0 + 6)[1]).toBeLessThan(-1);
      for (const [x, y] of [[x0, cy], [x1, cy], [cx, y1]]) for (const d of off(x, y)) expect(Math.abs(d)).toBeLessThan(1e-9);
      go(1.5);
      for (const word of ['pant', 'closeeyes', 'sneeze']) { pet.doWord(word); go(.3); expect(last().kneel, word).toBe(true); go(2.2); }
      // lying a look up turns the head up about the chin, the other way from a droop
      pet.doWord('lie'); go(3);
      const L = model.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const flat = st.lieHead.fn(.5, .1, ...top)[0];
      pet.doWord('droop'); go(.8);
      const down = st.lieHead.fn(.5, .1, ...top)[0] - flat;
      go(1.5);
      pet.doWord('lookup'); go(.8);
      const up = st.lieHead.fn(.5, .1, ...top)[0] - flat;
      expect(Math.abs(up)).toBeGreaterThan(2);
      expect(Math.sign(up)).toBe(-Math.sign(down));
      expect(headMoves({ kind: 'lookup', k: .5 }).up).toBe(1);
    } finally { done(); rand.mockRestore(); }
  });

  it('sneezes her mist from her mouth (anchors.mouth) at the jolt\'s peak, standing and seated: by her mouth as her head comes down, not over her eyes', async () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    const { pet, run, fx, fig, done } = await whaleOnKit();
    try {
      run(1);
      // her mouth: under her tear spots, raised with them (liftAnchors)
      const A = fig.anchors, mouth0 = A.mouth;
      expect(mouth0[1]).toBeGreaterThan((A.tears[0][1] + A.tears[1][1]) / 2);
      expect(liftAnchors(A, 5).mouth[0]).toBe(mouth0[0]);
      expect(liftAnchors(A, 5).mouth[1]).toBeCloseTo(mouth0[1] - 5, 1);
      const D = rigSeen.tree.deformers, MIST = /<g fill="#8a93b0"[^>]*><circle cx="([-\d.]+)" cy="([-\d.]+)"/g;
      for (const mode of ['stand', 'sit']) {
        pet.doWord(mode); run(2.5);
        pet.doWord('sneeze');
        let xs = [];
        for (let i = 0; i < 3 * 60 && !xs.length; i++) { run(1 / 60); xs = [...fx().matchAll(MIST)].map(m => [+m[1], +m[2]]); }
        expect(xs.length, mode).toBeGreaterThanOrEqual(3);
        // a few frames on, with the head down at the bottom of the jolt: the mist by where her mouth is drawn then
        run(4 / 60);
        xs = [...fx().matchAll(MIST)].map(m => [+m[1], +m[2]]);
        const m = pet.toStage(...pointOf(D, 'headFeat', rigSeen.st, ...mouth0)), S = pet.toStage(0, 1).y - pet.toStage(0, 0).y;
        const cy = xs.reduce((a, p) => a + p[1], 0) / xs.length, cx = xs.reduce((a, p) => a + p[0], 0) / xs.length;
        // (seated, the kit's points for her were measured some 7-9 units under her live head, the tear spots too: the
        // mist comes from her chin there, still well under her eyes)
        expect(Math.abs(cy - m.y) / S, mode).toBeLessThan(mode === 'stand' ? 3 : 8);
        expect(Math.abs(cx - m.x) / S, mode).toBeLessThan(8);
        const eyes = pet.toStage(...pointOf(D, 'headFeat', rigSeen.st, ...A.tears[0]));
        expect((cy - eyes.y) / S, mode).toBeGreaterThan(4);
        run(1.5);
      }
    } finally { done(); rand.mockRestore(); }
  });

  it('kneeling and lying, a head gesture cutting a held tilt short brings her head back over a few frames, not in one', async () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(.3);
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      let st = null;
      const go = s => run(s, x => { st = x; });
      const D = rigSeen.tree.deformers, [x0, y0, x1] = D.kneelHead.rect, cx = (x0 + x1) / 2;
      // (x only: a nod and a sigh move the kneeling head up and down, a tilt turns it over)
      const kneelTop = () => pointOf(D, 'kneelHead', st, cx, y0 + 6)[0] - pointOf(D, 'kneelHead', { ...st, kneelHead: null }, cx, y0 + 6)[0];
      const L = model.poses.lie.rects.head, top = [(L[0] + L[2]) / 2, L[1] + 8];
      const lieTop = () => st.lieHead.fn(.5, .1, ...top)[0];
      /** The largest move of `at` in one frame over `s` seconds. */
      const steepest = (at, s) => { let p = at(), m = 0; run(s, x => { st = x; const v = at(); m = Math.max(m, Math.abs(v - p)); p = v; }); return m; };
      go(1);
      pet.doWord('kneel'); go(3);
      expect(st.alpha.kneel_body).toBe(1);
      // a tilt from rest, over and back, at its fastest
      pet.doWord('tilt');
      const fresh = steepest(kneelTop, 2.2);
      expect(fresh).toBeGreaterThan(.3);
      for (const second of ['tilt', 'nod', 'sigh']) {
        pet.doWord('tilt'); go(.8);
        expect(last().head?.kind).toBe('tilt');
        expect(kneelTop()).toBeGreaterThan(5);
        expect(pet.doWord(second)).toBe(true);
        expect(steepest(kneelTop, .4)).toBeLessThan(fresh * 1.5);
        expect(last().kneel).toBe(true);
        go(3);
        expect(Math.abs(kneelTop())).toBeLessThan(1e-9);
      }
      // lying, another tilt
      pet.doWord('lie'); go(3);
      expect(last().lie).toBeCloseTo(1, 3);
      pet.doWord('tilt');
      const lieFresh = steepest(lieTop, 2.2);
      pet.doWord('tilt'); go(.8);
      pet.doWord('tilt');
      expect(steepest(lieTop, .4)).toBeLessThan(lieFresh * 1.5);
      expect(tiltEased(1, 0, 1 / 60)).toBeCloseTo(1 - TILT_BACK / 60, 12);
      expect(tiltEased(.4, .6, 1 / 60)).toBe(.6);
    } finally { done(); rand.mockRestore(); }
  });

  it('paints a face made of others with the eyes of its eyes\' face and the mouth of its mouth\'s', async () => {
    // a 2D context that notes the images drawn into it (each loaded image keeps its file name)
    const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
    const drawn = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? im => drawn.push(im?.src) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : any), set: () => true });
    const canvas = new Proxy({}, { get: (_, k) => (k === 'getContext' ? () => ctx : any), set: () => true });
    const doc = globalThis.document, fake = { createElement: () => canvas, createElementNS: () => any };
    globalThis.document = fake;
    try {
      const fig = await createWhaleFigure(WHALE, { model, loadImage: async url => ({ width: 1, height: 1, src: String(url).split('/').pop() }) });
      const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
      const paint = (fc, o) => { drawn.length = 0; fig.draw(petG, fc, o); return [...drawn]; };
      paint(faceOf('neutral'), frame());
      const fc = { ...faceOf('surprised'), gap: faceOf('happy').gap, parts: { eyes: 'surprised', brows: 'surprised', mouth: 'happy', body: 'surprised' } };
      const mixed = paint(fc, frame({ face: 'surprised+happy' }));
      expect(mixed).toContain('surprised_eyeL.png');
      expect(mixed).toContain('happy_mouth.png');
      expect(mixed).not.toContain('surprised_mouth.png');
      // (the same face named but without parts would take neither: no such name in her tables)
      const bare = paint({ ...fc, parts: undefined }, frame({ face: 'surprised+happy' }));
      expect(bare).not.toContain('happy_mouth.png');
      // every face made of parts (PLUS_MIXES): the eye art of its eyes' face and the mouth art of its mouth's, all loaded
      const kitFace = n => PLUS_FACES[n] ?? FACES[n], t = .5, p = { exprAt: 0, exprUntil: 9, modeT: 1 };
      const eyesOf = list => list.filter(n => /eye[LR]/.test(n)), mouthOf = list => list.filter(n => /mouth/.test(n));
      for (const [n, d] of Object.entries(PLUS_MIXES)) {
        const all = paint(PLUS_MIX_FACES[n].f(t, p), frame({ face: n, t }));
        expect(all.every(Boolean), n).toBe(true);
        expect(eyesOf(all).length, n).toBeGreaterThanOrEqual(2);
        expect(eyesOf(all), n).toEqual(eyesOf(paint(kitFace(d.eyes).f(t, p), frame({ face: d.eyes, t }))));
        expect(mouthOf(all), n).toEqual(mouthOf(paint(kitFace(d.mouth).f(t, p), frame({ face: d.mouth, t }))));
      }
      // two faces of one group shown as one (`eyes+mouth`, the face a plus kit composes of them): test samples, and every
      // pair her manifest composes
      const listed = Object.values(readManifest(fileURLToPath(new URL('../packages/cortico-world-desktop-pet/web/whale/', import.meta.url)), true).pairs)
        .filter((v) => !('as' in v));
      const pairs = [{ eyes: 'surprised', mouth: 'happy' }, { eyes: 'smug', mouth: 'coax' }, ...listed];
      for (const d of pairs) {
        const k = `${d.eyes}+${d.mouth}`;
        const all = paint(mixFace(d, n => kitFace(n) ?? FACES.neutral).f(t, p), frame({ face: k, t }));
        expect(all.every(Boolean), k).toBe(true);
        expect(eyesOf(all), k).toEqual(eyesOf(paint(kitFace(d.eyes).f(t, p), frame({ face: d.eyes, t }))));
        expect(mouthOf(all), k).toEqual(mouthOf(paint(kitFace(d.mouth).f(t, p), frame({ face: d.mouth, t }))));
      }
      expect(eyesOf(paint(mixFace(pairs[0], kitFace).f(t, p), frame({ face: 'surprised+happy', t })))).toContain('surprised_eyeL.png');
      expect(mouthOf(paint(mixFace(pairs[0], kitFace).f(t, p), frame({ face: 'surprised+happy', t })))).toContain('happy_mouth.png');
      // smug, angry, sad and shy have drawn eyes of their own in place of the painted open eye (and with them every
      // face whose eyes are theirs: the loops above compare those with these)
      for (const f of DRAWN_EYES) {
        const eyes = eyesOf(paint(kitFace(f).f(t, p), frame({ face: f, t })));
        expect(eyes, f).toEqual(expect.arrayContaining([`${f}_eyeL.png`, `${f}_eyeR.png`]));
        expect(eyes, f).not.toContain('eyeL_ball.png');
      }
      // (so a smirk, smug's eyes over a happy mouth, cannot fall back to the painted eye unnoticed)
      expect(eyesOf(paint(PLUS_MIX_FACES.smirk.f(t, p), frame({ face: 'smirk', t })))).toContain('smug_eyeL.png');
      // shy's peek back at you is the painted eye looking at you
      const peek = { ...p, exprAt: t - .9 }, peeking = eyesOf(paint(kitFace('shy').f(t, peek), frame({ face: 'shy', t })));
      expect(peeking).toContain('eyeL_ball.png');
      expect(peeking.filter(n => n.startsWith('shy_'))).toEqual([]);
    } finally { globalThis.document = doc; }
  });

  it("takes smug's, angry's, sad's and shy's own drawn eyes for an open eye, not shy's peek; the lid creases go under them", async () => {
    const has = () => true, ring = x => ({ shape: 'ring', rx: 13, ry: 12, ...x });
    expect(drawnEye('smug', { shape: 'lid', ry: 8, dx: 4 }, has)).toBe('smug');
    expect(drawnEye('angry', ring({ ry: 11 }), has)).toBe('angry');
    expect(drawnEye('sad', ring({ ry: 14 }), has)).toBe('sad');
    expect(drawnEye('shy', ring({ dx: -6, dy: 5 }), has)).toBe('shy');
    // the peek (no dx), and easing back to it past halfway
    expect(drawnEye('shy', ring({ dy: -2 }), has)).toBe(null);
    expect(drawnEye('shy', ring({ dx: -1 }), has)).toBe(null);
    // other eye shapes, a lid for another face, other faces, and a model without the art
    expect(drawnEye('angry', { shape: 'up' }, has)).toBe(null);
    expect(drawnEye('sad', { shape: 'heart' }, has)).toBe(null);
    expect(drawnEye('angry', { shape: 'lid', ry: 8 }, has)).toBe(null);
    expect(drawnEye('happy', ring(), has)).toBe(null);
    expect(drawnEye('angry', ring(), () => false)).toBe(null);
    // (whale_faces) determined's focused eyes for its open ring; cry's squeezed-shut eyes for its shut lid, never an open eye
    expect(drawnEye('determined', ring({ ry: 13, dy: 1 }), has)).toBe('determined');
    expect(drawnEye('cry', { shape: 'lid', ry: 0 }, has)).toBe('cry');
    expect(drawnEye('cry', ring(), has)).toBe(null);
    for (const f of DRAWN_EYES) for (const k of ['eyeL', 'eyeR']) expect(model.feat.sprites[`${f}_${k}`], `${f}_${k}`).toHaveLength(4);
    // expr2's eyeroll, shocked and deadpan: ring eyes, so their own drawings (shocked is not `wide`, which would paint
    // the surprised eyes first)
    expect(DRAWN_EYES).toEqual(expect.arrayContaining(['eyeroll', 'shocked', 'deadpan']));
    for (const f of ['eyeroll', 'shocked', 'deadpan']) {
      const fc = PLUS_FACES[f].f(.5, { exprAt: 0, exprUntil: 9, modeT: 1 });
      expect(fc.wide, f).toBeUndefined();
      for (const e of fc.eyes) expect(drawnEye(f, e, has), f).toBe(f);
      expect(drawnEye(f, fc.eyes[0], () => false), f).toBe(null);
    }
    const { pet, run, done } = await whaleOnKit();
    try {
      let st = null;
      run(1, x => { st = x; });
      expect(st.alpha.eye_creases).toBeGreaterThan(.9);
      pet.setExpr('angry'); run(1, x => { st = x; });
      expect(st.alpha.eye_creases).toBeLessThan(.05);
      pet.setExpr('neutral'); run(1, x => { st = x; });
      expect(st.alpha.eye_creases).toBeGreaterThan(.9);
    } finally { done(); }
  });

  it("blinks smug's, angry's, sad's and shy's drawn eyes shut with the painted lid and its lash line, not a squashed sliver", async () => {
    // a 2D context that notes the images drawn into it (each loaded image keeps its file name)
    const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
    const drawn = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? im => drawn.push(im?.src) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : any), set: () => true });
    const canvas = new Proxy({}, { get: (_, k) => (k === 'getContext' ? () => ctx : any), set: () => true });
    const doc = globalThis.document;
    globalThis.document = { createElement: () => canvas, createElementNS: () => any };
    try {
      const fig = await createWhaleFigure(WHALE, { model, loadImage: async url => ({ width: 1, height: 1, src: String(url).split('/').pop() }) });
      const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
      const paint = (fc, o) => { drawn.length = 0; fig.draw(petG, fc, o); return drawn.filter(n => /eye[LR]/.test(n)); };
      const t = .5, p = { exprAt: 0, exprUntil: 9, modeT: 1 };
      // (expr2) drool: the half-shut painted eyes and her own drooling mouth, moved up onto the mouth line
      const mouths = (f) => { drawn.length = 0; fig.draw(petG, (PLUS_FACES[f] ?? FACES[f]).f(t, p), frame({ face: f, t })); return drawn.filter(n => /mouth/.test(n)); };
      expect(mouths('drool')).toEqual(['drool_mouth.png']);
      // (whale_faces) each of these faces paints a mouth of its own: shocked's gasp (no longer the surprised mouth, bigger),
      // smug's smirk, giggle's grin, cry's wail, scared's, determined's and flustered's; disgusted's is a drawn frown line
      for (const [f, m] of Object.entries({ shocked: 'gasp', smug: 'smug', giggle: 'giggle', cry: 'cry', scared: 'scared', determined: 'determined', flustered: 'flustered' })) {
        expect(mouths(f), f).toEqual([`${m}_mouth.png`]);
      }
      expect(mouths('disgusted')).toEqual([]);
      // cry's drawn eyes are already shut (squeezed over a welling tear line): a blink neither squashes them nor cuts to
      // the painted eye
      for (const blink of [0, .3, .6, 1]) expect(paint(FACES.cry.f(t, p), frame({ face: 'cry', t, blink })), `cry blink ${blink}`).toEqual(['cry_eyeL.png', 'cry_eyeR.png']);
      for (const f of DRAWN_EYES.filter(f => f !== 'cry')) {
        const fc = (PLUS_FACES[f] ?? FACES[f]).f(t, p);
        // standing, sitting, and turned (looking off to one side): the same eyes
        for (const x of [{}, { mode: 'sit', sit: 1 }, { look: [5, -2] }]) {
          const at = (o) => paint(fc, frame({ face: f, t, ...x, ...o })), n = `${f} ${JSON.stringify(x)}`;
          // open, and the start and end of a blink: her own drawn eyes (squashed a little)
          for (const blink of [0, .3]) {
            expect(at({ blink }), `${n} blink ${blink}`).toEqual([`${f}_eyeL.png`, `${f}_eyeR.png`]);
          }
          // most of the way shut and shut: the painted eye, its lid down and the lash line along it
          for (const shut of [{ blink: .6 }, { blink: 1 }, { eyeClose: 1 }]) {
            const eyes = at(shut);
            expect(eyes, `${n} ${JSON.stringify(shut)}`).toEqual(expect.arrayContaining(['eyeL_ball.png', 'eyeL_lash.png', 'eyeR_ball.png', 'eyeR_lash.png']));
            expect(eyes.filter(s => s.startsWith(`${f}_`)), `${n} ${JSON.stringify(shut)}`).toEqual([]);
          }
        }
      }
    } finally { globalThis.document = doc; }
  });

  it('sings under an asked-for face with the song\'s chin up, and reads with her eyes on the book', async () => {
    const { pet, run, frame: last, done } = await whaleOnKit();
    try {
      run(1);
      pet.setExpr('angry');
      expect(pet.act('song')).toBe(true);
      run(1);
      const o = last();
      expect(o.face).toBe('angry+singing+singing');
      // the face's body language is the song's: the same frame as a plain angry face pitches the head by the song's
      const fc = { ...faceOf('angry'), parts: { eyes: 'angry', brows: 'angry', mouth: 'singing', body: 'singing' } };
      const mixed = (await whaleByHand())(fc, o), plain = (await whaleByHand())(faceOf('angry'), { ...o, face: 'angry' });
      expect(mixed.pitch - plain.pitch).toBeCloseTo(-.25, 6);
      const reading = (await whaleByHand())({ ...faceOf('angry'), parts: { eyes: 'angry', brows: 'angry', mouth: 'angry', body: 'reading' } }, frame({ face: 'angry+angry+reading' }));
      expect(reading.pitch - (await whaleByHand())(faceOf('angry'), frame({ face: 'angry' })).pitch).toBeCloseTo(.4, 6);
      expect(partsOf({ parts: { eyes: 'smug', brows: 'smug', mouth: 'happy', body: 'smug' } }, 'smug+happy').mouth).toBe('happy');
    } finally { done(); }
  });
});

describe('arm gestures kneeling: the kneeling hybrid (her live upper body over poses.kneelLow), as the whale draws it', () => {
  const KL = model.poses.kneelLow, KD = model.poses.kneel;
  /** The whale's own figure.js on the kit's body (plus), without a GPU (`missing`: textures that fail to load). */
  async function onKit(missing = [], scheme = undefined, { noLeans = false } = {}) {
    const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
    const doc = globalThis.document;
    globalThis.document = { createElement: () => any, createElementNS: () => any };
    const fig = await createWhaleFigure(WHALE, { model, scheme, loadImage: async url => { if (missing.some(n => String(url).endsWith(`tex/${n}.png`))) throw new Error('missing'); return { width: 1, height: 1 }; } });
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
    const seen = { fig, o: null, st: null };
    const figure = { ...fig, draw(g, fc, o) { seen.o = o; fig.draw(g, fc, o); seen.st = rigSeen.st; } };
    for (const k of ['anchors', 'poses', 'kneelArms', 'kneelArmsK', 'kneelLeans']) Object.defineProperty(figure, k, { get: () => fig[k] });
    // (noLeans: as on a kit that does not read figure.kneelLeans, upstream's, which ends a kneel for a lean)
    if (noLeans) delete figure.kneelLeans;
    const pet = createPet({ petG, shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    seen.pet = pet;
    seen.run = (sec, each = () => {}) => { for (let i = 0; i < Math.round(sec * 60); i++) { pet.step(1 / 60); pet.render(); each(); } };
    seen.alpha = id => seen.st.alpha[id] ?? 0;
    seen.done = () => { globalThis.document = doc; };
    return seen;
  }
  const kneelDown = s => { s.run(.5); s.pet.doWord('kneel'); s.run(3); expect(s.alpha('kneel_body')).toBe(1); };

  it('is the kneeling drawing\'s lower body on its box, at her skirt\'s z, in every scheme', () => {
    const [p] = KL.required;
    expect(p).toMatchObject({ id: 'kneel_low', tex: 'kneel_low', parent: 'kneelLow', z: model.parts.find(q => q.id === 'skirt').z });
    expect(p.box).toEqual(KD.required[0].box);
    expect(KL.pivots.kneelLow).toEqual([128, 256]);
    expect(KL.hides).toEqual(['tail']);
    for (const id of SCHEMES) expectFile(id, p);
    // (the same masks cut every scheme: the same pixels are there in each)
    const a0 = alphaOf(new URL('tex/kneel_low.png', WHALE)).a;
    for (const id of SCHEMES.slice(1)) {
      const a = alphaOf(new URL(`${dir(id)}tex/kneel_low.png`, WHALE)).a;
      let off = 0;
      for (let i = 0; i < a.length; i++) if ((a[i] > 8) !== (a0[i] > 8)) off++;
      expect(off / a.length, id).toBeLessThan(.002);
    }
  });

  it('cuts the hybrid in for the drawing in a frame once she is down, and the drawing back over it', () => {
    const down = { sitB: 1, kneelK: 1, kneelB: 1, armsB: 0, prevSit: 1, up: 14 }, o = { sit: 1, kneel: true, mode: 'sit' };
    const arms = seatStep(down, o, { sitK: 1, kneelOK: true, kneelRaise: 14, withArms: true }, 1 / 60);
    expect(arms.armsB).toBe(1);
    expect(arms.kneelB).toBe(1);
    expect(kneelAlphas(arms)).toEqual({ drawA: 0, lowA: 1 });
    const back = seatStep(arms, o, { sitK: 1, kneelOK: true, kneelRaise: 14, withArms: false }, 1 / 60);
    expect(back.armsB).toBe(0);
    expect(kneelAlphas(back)).toEqual({ drawA: 1, lowA: 0 });
    // half way (a faster screen): the drawing half over an opaque hybrid
    expect(kneelAlphas({ kneelB: 1, armsB: .5 })).toEqual({ drawA: .5, lowA: 1 });
    // not down yet: no hybrid; getting up she keeps kneeling (the drawing's share), arms or not
    expect(seatStep({ ...down, kneelK: 0, kneelB: 0 }, { sit: .3, kneel: true, mode: 'sit' }, { sitK: .3, kneelOK: true, withArms: true }, 1 / 60).armsB).toBe(0);
    const up = seatStep(arms, { sit: .9, kneel: false, mode: 'wake' }, { sitK: .95, kneelOK: true, kneelRaise: 14, withArms: true }, 1 / 60);
    expect(up.kneelB).toBe(1);
    expect(up.armsB).toBe(1);
    expect(KNEEL_ARMS_HOLD).toBe(.25);
  });

  it('waves kneeling in the hybrid: her upper body raised to the drawing\'s head, the seated rig\'s lower body gone, the kneel kept', async () => {
    const s = await onKit();
    try {
      expect(s.fig.kneelArms).toBe(true);
      kneelDown(s);
      const up0 = s.fig.anchors.bubble;
      expect(s.st.waist.ty).toBe(0);
      s.pet.doWord('wave');
      let mixed = 0, hybrid = 0;
      s.run(1.5, () => {
        const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
        if (k > 0 && k < 1) mixed++;
        expect(k >= 1 || l >= 1 || (k === 0 && l === 0)).toBe(true);
        if (l >= 1) {
          hybrid++;
          // (the body sinks the seated rig's way; the upper body comes up to the kneeling drawing's head)
          expect(s.st.body.ty + s.st.waist.ty).toBeCloseTo(KD.headDrop, 6);
          for (const id of [...KNEEL_LOW_UNDER, 'tail']) expect(s.alpha(id), id).toBe(0);
          for (const k2 of ['a', 'sx', 'sy']) expect(s.st.kneelLow[k2]).toBe(s.st.body[k2]);
          expect(s.alpha('kneel_body')).toBe(0);
        }
      });
      expect(mixed).toBeLessThanOrEqual(1);
      expect(hybrid).toBeGreaterThan(30);
      expect(s.o.kneel).toBe(true);
      expect(s.fig.anchors.bubble).toEqual(up0);
      s.run(2);
      expect(s.alpha('kneel_body')).toBe(1);
      expect(s.alpha('kneel_low')).toBe(0);
      expect(s.st.waist.ty).toBe(0);
    } finally { s.done(); }
  });

  it('opens the hybrid for her drawn arms (a heart, a held cup, a raised hand, her chin on her hand), not for a song, a spout or a face\'s arm angles; a cheer ends the kneel', async () => {
    const s = await onKit();
    try {
      const peak = (word, sec = 2) => { kneelDown(s); let m = 0; if (word) s.pet.doWord(word); s.run(sec, () => { m = Math.max(m, s.alpha('kneel_low')); }); return m; };
      for (const w of ['heart', 'sip', 'scratch', 'salute']) expect(peak(w), w).toBe(1);
      for (const w of ['song', 'spout']) expect(peak(w, 2.5), w).toBe(0);
      s.pet.doWord('stand'); s.run(3);
      kneelDown(s);
      s.pet.setExpr('happy'); s.run(1.5);
      expect(s.alpha('kneel_low')).toBe(0);
      s.pet.setExpr('thinking'); s.run(1.5);
      expect(s.alpha('kneel_low')).toBe(1);
      // (her chin comes off her hand slowly, then the hybrid holds KNEEL_ARMS_HOLD)
      s.pet.setExpr('neutral'); s.run(2.5);
      expect(s.alpha('kneel_low')).toBe(0);
      // a face that poses her arms (FACE_ARMS: shy's fingertips together) opens it too, and the drawing comes back after it
      s.pet.setExpr('shy'); s.run(1.5);
      expect(s.alpha('kneel_low')).toBe(1);
      expect(s.alpha('arm_twiddle')).toBe(1);
      s.pet.setExpr('neutral'); s.run(1.5);
      expect(s.alpha('kneel_low')).toBe(0);
      s.pet.doWord('cheer'); s.run(.2);
      expect(s.o.kneel).toBe(false);
    } finally { s.done(); }
  });

  it('opens the hybrid for her chin on her hand asked as a word (托腮), keeping the kneel, and goes back to the drawing after', async () => {
    const s = await onKit();
    try {
      kneelDown(s);
      s.pet.setExpr('happy'); s.run(.5);
      s.pet.doWord('muse');
      let low = 0, mixed = 0;
      s.run(2, () => {
        const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
        low = Math.max(low, l);
        if (k > 0 && k < 1 && l > 0 && l < 1) mixed++;
      });
      expect(low).toBe(1);
      expect(mixed).toBe(0);
      expect(s.o.kneel).toBe(true);
      expect(s.o.face).toBe('happy');
      // (her chin comes off her hand slowly as the gesture ends, then the hybrid holds KNEEL_ARMS_HOLD)
      s.run(3.5);
      expect(s.alpha('kneel_low')).toBe(0);
      expect(s.alpha('kneel_body')).toBe(1);
      expect(s.o.kneel).toBe(true);
    } finally { s.done(); }
  });

  it('leans in, leans back and sways kneeling on the hybrid\'s upper body, the kneeling legs still, in both outfits', async () => {
    for (const scheme of ['deepseek', 'deepseek-cape']) {
      const s = await onKit([], scheme);
      try {
        expect(s.fig.kneelLeans, scheme).toBe(true);
        for (const w of KNEEL_LEANS) {
          kneelDown(s);
          const xs = [];
          // (the kit reads kneelLeans and keeps the kneel through them, as it does an arm gesture through kneelArms)
          expect(s.pet.doWord(w), w).toBe(true);
          s.run(2.6, () => {
            expect(s.pet.pet.kneel, w).toBe(true);
            const st = s.st;
            xs.push({ low: s.alpha('kneel_low'), body: s.alpha('kneel_body'), legs: st.kneelLow.a, a: st.waist.a, sx: st.waist.sx ?? 1, k: s.o.gesture?.k ?? 1 });
          });
          const mid = xs.filter(x => x.k > .2 && x.k < .7), tag = `${scheme} ${w}`;
          // the hybrid, cut in and out whole, never the drawing and it half seen
          expect(mid.every(x => x.low === 1 && x.body === 0), tag).toBe(true);
          expect(xs.every(x => (x.low === 0 || x.low === 1) && (x.body === 0 || x.body === 1)), tag).toBe(true);
          // her upper body moves as standing; the kneeling legs keep still on the floor (a sway rocks the waist, not them)
          const span = f => Math.max(...mid.map(f)) - Math.min(...mid.map(f));
          expect(span(x => x.legs), tag).toBeLessThan(.5);
          if (w === 'closer') expect(Math.max(...mid.map(x => x.sx)), tag).toBeGreaterThan(1 + BODY_LEAN.near * .8);
          if (w === 'leanback') expect(Math.min(...mid.map(x => x.a)), tag).toBeLessThan(-BODY_LEAN.back * .7);
          if (w === 'sway') expect(span(x => x.a), tag).toBeGreaterThan(BODY_LEAN.swayBody * 1.5);
          // and back to the kneeling drawing once it is over, still kneeling
          s.run(1);
          expect(s.alpha('kneel_body'), tag).toBe(1);
          expect(s.o.kneel, tag).toBe(true);
          s.pet.doWord('stand'); s.run(3);
        }
      } finally { s.done(); }
      // a kit that ends the kneel for them (upstream's rule, no kneelLeans read): she sits as before, the kneeling drawing
      // cut to the seated rig, never the hybrid on the way
      const u = await onKit([], scheme, { noLeans: true });
      try {
        for (const w of KNEEL_LEANS) {
          kneelDown(u);
          let low = 0;
          u.pet.doWord(w);
          u.run(1.5, () => { low = Math.max(low, u.alpha('kneel_low')); });
          expect(u.o.kneel, `${scheme} ${w}`).toBe(false);
          expect(low, `${scheme} ${w}`).toBe(0);
          u.pet.doWord('stand'); u.run(3);
        }
      } finally { u.done(); }
    }
  });

  it('draws the arm words drawn anew (拍手, 摊手, 抱头, 举手, 点赞, 嘘, 擦汗) on their own arms: hands on her face or head ride the neck', async () => {
    const s = await onKit();
    try {
      const D = rigSeen.tree.deformers;
      const parentOf = pose => D[Object.keys(model.poses[pose].pivots)[0]].parent;
      for (const pose of ['shush', 'wipe', 'headhold']) expect(parentOf(pose), pose).toBe('neck');
      for (const pose of ['clap', 'clapo', 'shrug', 'raise', 'thumbs']) expect(parentOf(pose), pose).toBe('waist');
      expect(ARM_TWIN).toEqual({ clap: 'clapo' });
      for (const g of ['clap', 'shrug', 'headhold']) { expect(BOTH_HANDS[g], g).toBe(g); expect(FAR_ARM_GESTURES, g).toContain(g); }
      for (const g of ['raise', 'thumbs', 'shush', 'wipe']) expect(NEAR_RAISES[g], g).toBe(g);
      expect(BENT_RAISES.filter(g => ['raise', 'thumbs', 'shush', 'wipe'].includes(g))).toEqual(['thumbs', 'shush', 'wipe']);
      // standing, each shows its drawing and takes the arms it draws
      for (const [w, parts, arm] of [['shrug', ['arm_shrug'], 'arm_far'], ['headhold', ['arm_headhold'], 'arm_far'], ['raise', ['arm_raise'], 'arm_near'],
        ['thumbs', ['arm_thumbs'], 'arm_near'], ['shush', ['arm_shush', 'arm_shush_top'], 'arm_near'], ['wipe', ['arm_wipe'], 'arm_near']]) {
        s.run(1);
        s.pet.doWord(w);
        let shown = 0, plain = 1;
        s.run(1.2, () => { shown = Math.max(shown, Math.min(...parts.map(s.alpha))); plain = Math.min(plain, s.alpha(arm)); });
        expect(shown, w).toBe(1);
        expect(plain, w).toBe(0);
        s.run(2.5);
        for (const p of parts) expect(s.alpha(p), `${w} ${p}`).toBe(0);
      }
    } finally { s.done(); }
  });

  it('hands the raised arm (举手) over from a fist arm already high: the long drawing never shows turned down off her shoulder', async () => {
    expect(RAISE_HIGH.raise).toBeGreaterThan(RAISE_TO);
    for (const kneel of [false, true]) {
      const s = await onKit();
      try {
        if (kneel) kneelDown(s); else s.run(1);
        s.pet.doWord('raise');
        let worst = 0, shown = 0;
        // (the drawing's turn off its own angle while any of it shows: at RAISE_TO it would stick out sideways, ~-100°)
        s.run(2.4, () => { const a = s.alpha('arm_raise'); shown = Math.max(shown, a); if (a > .02) worst = Math.min(worst, s.st.armRaise.a); });
        expect(shown, `kneel ${kneel}`).toBe(1);
        expect(worst, `kneel ${kneel}`).toBeGreaterThan(-50);
      } finally { s.done(); }
    }
  });

  it('claps by cutting between her two drawings of it in a frame, never both at once, four times', async () => {
    const s = await onKit();
    try {
      s.run(1);
      s.pet.doWord('clap');
      let both = 0, cuts = 0, was = null;
      const peak = { arm_clap: 0, arm_clapo: 0 };
      s.run(3, () => {
        const a = s.alpha('arm_clap'), b = s.alpha('arm_clapo');
        if (a > 0 && b > 0) both++;
        peak.arm_clap = Math.max(peak.arm_clap, a); peak.arm_clapo = Math.max(peak.arm_clapo, b);
        const now = a > 0 ? 'clap' : b > 0 ? 'clapo' : null;
        if (now && was && now !== was) cuts++;
        if (now) was = now;
      });
      expect(both).toBe(0);
      expect(peak).toEqual({ arm_clap: 1, arm_clapo: 1 });
      expect(cuts).toBe(2 * CLAP.at.length);
      // without the hands-apart drawing (a scheme lacking it), the hands-together one shows throughout
      const t = await onKit(['arm_clapo']);
      try {
        t.run(1); t.pet.doWord('clap');
        let on = 0;
        t.run(1.6, () => { if (t.alpha('arm_clap') >= 1) on++; expect(t.alpha('arm_clapo')).toBe(0); });
        expect(on).toBeGreaterThan(60);
      } finally { t.done(); }
    } finally { s.done(); }
  });

  it('does the arm words drawn anew kneeling, in the hybrid, keeping the kneel, and goes back to the drawing after', async () => {
    for (const [w, parts] of [['clap', ['arm_clap', 'arm_clapo']], ['shrug', ['arm_shrug']], ['headhold', ['arm_headhold']], ['raise', ['arm_raise']],
      ['thumbs', ['arm_thumbs']], ['shush', ['arm_shush']], ['wipe', ['arm_wipe']], ['fist', ['arm_fist', 'arm_fist_top']], ['jot', ['arm_jot']], ['twiddle', ['arm_twiddle']],
      // (抹眼泪 on the fist's drawing, 双手捂脸, 摸摸头)
      ['weep', ['arm_fist', 'arm_fist_top']], ['hideface', ['arm_hideface']], ['pat', ['arm_pat', 'arm_pat_top']]]) {
      const s = await onKit();
      try {
        kneelDown(s);
        s.pet.doWord(w);
        let low = 0, mixed = 0;
        const shown = {};
        s.run(2.5, () => {
          const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
          low = Math.max(low, l);
          if (k > 0 && k < 1 && l > 0 && l < 1) mixed++;
          for (const p of parts) shown[p] = Math.max(shown[p] || 0, s.alpha(p));
        });
        expect(low, w).toBe(1);
        expect(mixed, w).toBe(0);
        for (const p of parts) expect(shown[p], `${w} ${p}`).toBe(1);
        expect(s.o.kneel, w).toBe(true);
        s.run(4);
        expect(s.alpha('kneel_low'), w).toBe(0);
        expect(s.alpha('kneel_body'), w).toBe(1);
        expect(s.o.kneel, w).toBe(true);
      } finally { s.done(); }
    }
  });

  it('draws the girls\' fist, notebook and fingertips (加油, 记笔记, 对手指) on arms of her own, standing and seated, each taking the arms it draws', async () => {
    const s = await onKit();
    try {
      const D = rigSeen.tree.deformers;
      const parentOf = pose => D[Object.keys(model.poses[pose].pivots)[0]].parent;
      for (const pose of ['fist', 'jot', 'twiddle']) expect(parentOf(pose), pose).toBe('waist');
      expect(NEAR_RAISES.fist).toBe('fist');
      expect(BENT_RAISES).toContain('fist');
      for (const g of ['jot', 'twiddle']) { expect(BOTH_HANDS[g], g).toBe(g); expect(FAR_ARM_GESTURES, g).toContain(g); expect(PROP_GESTURES[g], g).toBeUndefined(); }
      expect(s.fig.gestures).toEqual(expect.arrayContaining(['fist', 'jot', 'twiddle']));
      // (the fist's hand and cuff again over the fringe and side locks it is raised in front of; the others lie over her front)
      expect(model.poses.fist.required.map(p => [p.id, p.z])).toEqual([['arm_fist', 6], ['arm_fist_top', 14.2]]);
      for (const pose of ['jot', 'twiddle']) expect(model.poses[pose].required.map(p => p.z), pose).toEqual([9.6]);
      for (const scene of ['stand', 'sit']) {
        for (const [w, parts, arms] of [['fist', ['arm_fist', 'arm_fist_top'], ['arm_near']], ['jot', ['arm_jot'], ['arm_near', 'arm_far', 'arm_far_end_front']],
          ['twiddle', ['arm_twiddle'], ['arm_near', 'arm_far', 'arm_far_end_front']]]) {
          s.run(1);
          if (scene === 'sit') { s.pet.doWord('sit'); s.run(2.5); }
          s.pet.doWord(w);
          // each plain arm it replaces goes out, and never shows in a frame the drawing shows in
          // (the generic one-drawing-per-arm test covers the whole hand-over, kneeling too)
          let shown = 0, seated = 1, both = 0;
          const low = arms.map(() => 1);
          s.run(1.2, () => {
            const d = Math.max(...parts.map(s.alpha));
            shown = Math.max(shown, Math.min(...parts.map(s.alpha)));
            arms.forEach((a, i) => { low[i] = Math.min(low[i], s.alpha(a)); if (d > .02 && s.alpha(a) > .02) both++; });
            seated = Math.min(seated, s.o.sit ?? 0);
          });
          expect(shown, `${scene} ${w}`).toBe(1);
          expect(low, `${scene} ${w}`).toEqual(arms.map(() => 0));
          expect(both, `${scene} ${w}`).toBe(0);
          if (scene === 'sit') expect(seated, `${scene} ${w}`).toBeGreaterThan(.9);
          s.run(3);
          for (const p of parts) expect(s.alpha(p), `${scene} ${w} ${p}`).toBe(0);
          if (scene === 'sit') { s.pet.doWord('stand'); s.run(1.5); }
        }
      }
    } finally { s.done(); }
  });

  it('kneels and does her fist, notebook or fingertips in one group (跪坐+加油, as the World sends it): the hybrid cuts in once she is down, the kneel kept', async () => {
    for (const [w, parts] of [['fist', ['arm_fist', 'arm_fist_top']], ['jot', ['arm_jot']], ['twiddle', ['arm_twiddle']]]) {
      const s = await onKit();
      try {
        s.run(.5);
        expect(s.pet.doGroup(['kneel', w]), w).toEqual([true, true]);
        let low = 0, mixed = 0;
        const shown = {};
        s.run(3, () => {
          const k = s.alpha('kneel_body'), l = s.alpha('kneel_low');
          low = Math.max(low, l);
          if ((k > 0 && k < 1) || (l > 0 && l < 1)) mixed++;
          for (const p of parts) shown[p] = Math.max(shown[p] || 0, s.alpha(p));
        });
        expect(low, w).toBe(1);
        expect(mixed, w).toBeLessThanOrEqual(1);
        for (const p of parts) expect(shown[p], `${w} ${p}`).toBe(1);
        expect(s.o.kneel, w).toBe(true);
        s.run(3);
        expect(s.alpha('kneel_low'), w).toBe(0);
        expect(s.alpha('kneel_body'), w).toBe(1);
        expect(s.o.kneel, w).toBe(true);
      } finally { s.done(); }
    }
  });

  it('swings the fist (and the patting hand) in from outside (clear of her cheek) and pumps it; the other bent raises come in from her side', async () => {
    expect(RAISE_ENTRY).toEqual({ fist: -12, pat: -12 });
    for (const [w, sign] of [['fist', -1], ['pat', -1], ['idea', 1], ['thumbs', 1]]) {
      const s = await onKit();
      try {
        s.run(1);
        s.pet.doWord(w);
        const id = Object.keys(model.poses[w].pivots)[0], part = model.poses[w].required[0].id;
        let first = null;
        const ty = [];
        s.run(1.5, () => { if (s.alpha(part) >= 1) { if (first == null) first = s.st[id].a; ty.push(s.st[id].ty); } });
        // the first frame the drawing shows it is turned off its own angle the way it comes in, and settles on it
        expect(Math.sign(first), w).toBe(sign);
        expect(Math.abs(first), w).toBeGreaterThan(4);
        if (w === 'fist' || w === 'pat') {
          // a little up-and-down beat (the pat's PAT_BOB), never below where it is drawn
          expect(Math.min(...ty), w).toBeLessThan(w === 'pat' ? -.9 * PAT_BOB.amp : -1.8);
          expect(Math.max(...ty), w).toBeLessThanOrEqual(0);
        } else expect(ty.every(v => v === 0), w).toBe(true);
      } finally { s.done(); }
    }
  });

  it('wipes a tear (抹眼泪) with the fist moved in under her eye, hides her face (双手捂脸) on the neck and pats (摸摸头) with the near hand', async () => {
    // the weep plays on the fist's entry (RAISE_AS), not an entry of its own: one writer of armFist and its alphas
    expect(RAISE_AS).toEqual({ weep: 'fist' });
    expect(NEAR_RAISES.weep).toBeUndefined();
    expect([BOTH_HANDS.hideface, NEAR_RAISES.pat]).toEqual(['hideface', 'pat']);
    expect(NECK_HANDS).toEqual(['headhold', 'hideface']);
    expect(FAR_ARM_GESTURES).toContain('hideface');
    expect(FAR_ARM_GESTURES).not.toContain('weep');
    expect(BENT_RAISES).toContain('pat');
    // the faces the three hold pose none of her arms (hideface's body is neutral's: shy's would bring the fingertips)
    for (const f of ['cry', 'comfort', 'gentle', 'neutral']) expect(FACE_ARMS[f], f).toBeUndefined();
    expect(FACE_ARMS.shy).toBe('twiddle');
    // (the hands over her face lie over it, the patting hand's cuff and hand again over the hair it is held in front of)
    expect(model.poses.hideface.required.map(p => p.z)).toEqual([14.6]);
    expect(model.poses.pat.required.map(p => [p.id, p.z])).toEqual([['arm_pat', 6], ['arm_pat_top', 14.2]]);
    const s = await onKit();
    try {
      const D = rigSeen.tree.deformers;
      const parentOf = pose => D[Object.keys(model.poses[pose].pivots)[0]].parent;
      expect(parentOf('hideface')).toBe('neck');
      expect(parentOf('pat')).toBe('waist');
      expect(Object.keys(D).filter(k => k === 'armFist')).toHaveLength(1);
      expect(s.fig.gestures).toEqual(expect.arrayContaining(['weep', 'hideface', 'pat']));
      for (const scene of ['stand', 'sit']) {
        s.run(1);
        if (scene === 'sit') { s.pet.doWord('sit'); s.run(2.5); }
        // the weep: the fist shows, the plain near arm goes; it comes in at its share of WEEP's place (no swing past it)
        // and sits there, rubbing, through the middle; crying
        s.pet.doWord('weep');
        let first = null, mid = null, plain = 1, rub = [];
        s.run(2.4, () => {
          if (s.alpha('arm_fist') >= 1) {
            if (first == null) first = { ...s.st.armFist };
            plain = Math.min(plain, s.alpha('arm_near'));
            if (s.alpha('arm_fist_top') >= 1 && Math.abs(s.st.armFist.ty + WEEP.ty) < 1e-6) { mid = { ...s.st.armFist }; rub.push(s.st.armFist.tx); }
          }
        });
        expect(s.pet.pet.expr, scene).toBe('cry');
        expect(first, scene).not.toBe(null);
        expect(first.a, scene).toBeLessThanOrEqual(0);
        expect(first.a, scene).toBeGreaterThanOrEqual(WEEP.a);
        expect(mid.a, scene).toBe(WEEP.a);
        expect(Math.min(...rub), scene).toBeGreaterThanOrEqual(WEEP.tx - WEEP.rub - 1e-9);
        expect(Math.max(...rub) - Math.min(...rub), scene).toBeGreaterThan(WEEP.rub);
        expect(plain, scene).toBe(0);
        expect(weepPose(1, 0)).toEqual({ a: WEEP.a, tx: WEEP.tx, ty: -WEEP.ty });
        s.run(2);
        expect(s.alpha('arm_fist'), scene).toBe(0);
        // a 加油 straight after is the fist's own again: pumping, no weep offsets
        s.pet.doWord('fist');
        let off = 0;
        s.run(1, () => { if (s.alpha('arm_fist') >= 1) off = Math.max(off, Math.abs(s.st.armFist.tx)); });
        expect(off, scene).toBe(0);
        s.run(2);
        // the face hidden: both plain arms go, the drawing keeps still on her face (no sway)
        s.pet.doWord('hideface');
        let shown = 0, arms = 1;
        s.run(1.2, () => {
          shown = Math.max(shown, s.alpha('arm_hideface'));
          if (s.alpha('arm_hideface') >= 1) { arms = Math.min(arms, Math.max(s.alpha('arm_near'), s.alpha('arm_far'))); expect(Math.abs(s.st.armHideface.a)).toBe(0); }
        });
        expect([shown, arms], scene).toEqual([1, 0]);
        expect(s.pet.pet.expr, scene).toBe('shy+happy+neutral');
        // (and as it ends no fingertips come after it, FACE_ARMS.shy: the face's body is neutral's)
        let tips = 0;
        s.run(2.5, () => { tips = Math.max(tips, s.alpha('arm_twiddle')); });
        expect(tips, scene).toBe(0);
        expect(s.alpha('arm_hideface'), scene).toBe(0);
        // the pat: the near arm's drawing and its top over the hair; comforting
        s.pet.doWord('pat');
        let pat = 0;
        s.run(1.2, () => { pat = Math.max(pat, Math.min(s.alpha('arm_pat'), s.alpha('arm_pat_top'))); });
        expect(pat, scene).toBe(1);
        expect(s.alpha('arm_near'), scene).toBe(0);
        expect(s.pet.pet.expr, scene).toBe('comfort');
        s.run(2.5);
        if (scene === 'sit') { s.pet.doWord('stand'); s.run(1.5); }
      }
    } finally { s.done(); }
  });

  it('writes with her head bent over the notebook, the pen scribbling at its nib; the fingertips poke at each other, the sleeves still', async () => {
    const s = await onKit();
    try {
      s.run(1.5);
      const rest = s.st.neck.a;
      s.pet.doWord('jot');
      expect(s.pet.pet.expr).toBe('reading');
      let bent = -9, pen = [], far = 0;
      const J = model.poses.jot, [qx, qy] = J.wrist, [bx, by] = J.required[0].box;
      s.run(2.4, () => {
        if (s.alpha('arm_jot') < 1) return;
        bent = Math.max(bent, s.st.neck.a - rest);
        pen.push(s.st.armJotLift.fn(.5, .5, qx, qy)[0]);
        far = Math.max(far, Math.abs(s.st.armJotLift.fn(0, 1, bx, by + J.required[0].box[3])[0]));
        expect(Math.abs(s.st.armJot.a), 'jot sway').toBeLessThanOrEqual(.4 + 1e-9);
      });
      expect(bent).toBeGreaterThan(4);
      expect(Math.max(...pen) - Math.min(...pen)).toBeGreaterThan(1.2);
      expect(far).toBeLessThan(.01);
      s.run(3);
      const T = model.poses.twiddle, [tx, ty] = T.wrist;
      s.pet.doWord('twiddle');
      let apart = 0;
      s.run(2, () => {
        if (s.alpha('arm_twiddle') < 1) return;
        expect(Math.abs(s.st.armTwiddle.a), 'twiddle turns').toBe(0);
        const l = s.st.armTwiddleLift.fn(.5, .1, tx - 5, ty)[1], r = s.st.armTwiddleLift.fn(.5, .1, tx + 5, ty)[1];
        apart = Math.max(apart, Math.abs(l - r));
        // (the sleeves' ends, at the box's lower corners, keep still)
        const [x0, y0, w0, h0] = T.required[0].box;
        for (const [x, y] of [[x0, y0 + h0], [x0 + w0, y0 + h0]]) expect(Math.hypot(...s.st.armTwiddleLift.fn(0, 1, x, y))).toBeLessThan(.01);
      });
      expect(apart).toBeGreaterThan(.6);
    } finally { s.done(); }
  });

  it('kneels right after a seated gesture or her chin on her hand in one cut, the seated rig to the drawing (no hybrid between)', async () => {
    const asks = {
      wave: s => { s.pet.doWord('wave'); for (let n = 0; n < 600 && s.pet.pet.pulse; n++) s.run(1 / 60); },
      thinking: s => { s.pet.setExpr('thinking', 1.5); s.run(1.55); },
    };
    for (const [what, ask] of Object.entries(asks)) {
      const s = await onKit();
      try {
        s.run(.5);
        s.pet.doWord('sit');
        s.run(2.5);
        ask(s);
        s.pet.doWord('kneel');
        let low = 0;
        s.run(2.5, () => { if (s.alpha('kneel_low') > 0) low++; });
        expect(low, what).toBe(0);
        expect(s.alpha('kneel_body'), what).toBe(1);
      } finally { s.done(); }
    }
  });

  it('keeps today\'s kneel without the files: the kit ends it on a wave', async () => {
    const s = await onKit(['kneel_low']);
    try {
      expect(s.fig.kneelArms).toBe(false);
      kneelDown(s);
      s.pet.doWord('wave'); s.run(.3);
      expect(s.o.kneel).toBe(false);
      expect(s.alpha('kneel_low')).toBe(0);
    } finally { s.done(); }
  });
});

describe('live faces on the kneeling and lying drawings, as the whale draws them', () => {
  /**
   * The whale's own figure.js on the kit's body (plus), without a GPU: every 2D canvas notes the images drawn into it
   * (each loaded image keeps its file name) by its size, so the floor faces' canvases are told apart (`missing`:
   * textures that fail to load). Each frame: the alphas, the textures uploaded, and what each canvas drew.
   */
  async function onKit(missing = [], scheme = undefined) {
    const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
    const canvases = [];
    const makeCanvas = () => {
      const c = { width: 0, height: 0, drawn: [], transforms: 0 };
      const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? im => c.drawn.push(im?.src) : k === 'transform' ? () => { c.transforms++; } : k === 'canvas' ? c : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : any), set: () => true });
      c.getContext = () => ctx;
      canvases.push(c);
      return c;
    };
    const doc = globalThis.document;
    globalThis.document = { createElement: makeCanvas, createElementNS: () => any };
    const fig = await createWhaleFigure(WHALE, { model, scheme, loadImage: async url => { if (missing.some(n => String(url).endsWith(`tex/${n}.png`))) throw new Error('missing'); return { width: 1, height: 1, src: String(url).split('/').pop() }; } });
    const el = () => ({ setAttribute() {}, innerHTML: '' });
    const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
    const seen = { fig, frames: [] };
    const floorCv = pid => canvases.filter(c => c.width === Math.round(model.poses[pid].face.box[2] / model.units.S) && c.height === Math.round(model.poses[pid].face.box[3] / model.units.S));
    const figure = {
      ...fig,
      draw(g, fc, o) {
        for (const c of canvases) c.drawn = [];
        rigSeen.up = [];
        fig.draw(g, fc, o);
        const a = id => rigSeen.st.alpha[id] ?? 0;
        seen.frames.push({ o, up: [...rigSeen.up], kneel: a('kneel_body'), low: a('kneel_low'), lie: a('lie_body'), alpha: { ...rigSeen.st.alpha }, kneelDrawn: floorCv('kneel')[0]?.drawn || [], lieDrawn: floorCv('lie')[0]?.drawn || [] });
      },
    };
    for (const k of ['anchors', 'poses', 'kneelArms', 'kneelArmsK']) Object.defineProperty(figure, k, { get: () => fig[k] });
    const pet = createPet({ petG, shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    seen.pet = pet;
    seen.floorCv = floorCv;
    seen.run = (sec, each = () => {}) => { for (let i = 0; i < Math.round(sec * 60); i++) { pet.step(1 / 60); pet.render(); each(seen.frames.at(-1)); } };
    seen.last = () => seen.frames.at(-1);
    seen.done = () => { globalThis.document = doc; };
    return seen;
  }

  it('has a blank face and the hair over it for each floor drawing, in every scheme, and its live face on the drawing\'s head', () => {
    for (const pid of ['kneel', 'lie']) {
      const P = model.poses[pid], f = P.face;
      expect(f.parts.map(p => p.id)).toEqual([`${pid}_blank`, `${pid}_fringe`]);
      for (const p of f.parts) for (const id of SCHEMES) expectFile(id, p);
      // (the patches stay, as the fallback for a dress without the files)
      expect(P.overlays.map(o => o.use).sort()).toEqual(['shut', 'smile', 'talk']);
      const head = pid === 'kneel' ? 'kneelHead' : 'lieLegs', body = Math.max(...P.required.map(p => p.z));
      expect(f.parts.every(p => p.parent === head)).toBe(true);
      expect(body < f.parts[0].z && f.parts[0].z < f.z && f.z < f.parts[1].z).toBe(true);
      for (const k of ['eyeL', 'eyeR', 'mouth']) {
        const [a, b, c, d] = f.place[k], det = a * d - b * c;
        expect(det, `${pid} ${k}`).toBeGreaterThan(.45);
        expect(det, `${pid} ${k}`).toBeLessThan(1.7);
        expect(Math.abs(Math.atan2(b, a)), `${pid} ${k}`).toBeLessThan(.4);
      }
    }
  });

  it('kneeling, her asked face is painted on the drawing\'s head (sad\'s own drawn eyes), the patches off; getting up it stays till she stands', async () => {
    const s = await onKit();
    try {
      s.run(.5);
      expect(s.last().up).not.toContain('kneelFx');
      s.pet.doWord('kneel'); s.run(3);
      s.pet.doWord('sad'); s.run(.6);
      // (no blink of her own on the frame checked: past DRAWN_SHUT a blinking eye is the painted one, not sad's sprite)
      s.pet.pet.blinkT = 99; s.pet.pet.blinkAge = 9; s.run(1 / 60);
      const f = s.last();
      expect(f.kneel).toBe(1);
      for (const id of ['kneel_blank', 'kneel_live', 'kneel_fringe']) expect(f.alpha[id], id).toBe(1);
      for (const id of ['kneel_shut', 'kneel_smile', 'kneel_talk']) expect(f.alpha[id], id).toBe(0);
      expect(f.up).toContain('kneelFx');
      expect(f.up).not.toContain('faceFx');
      expect(f.kneelDrawn).toEqual(expect.arrayContaining(['sad_eyeL.png', 'sad_eyeR.png']));
      // each feature through its own matrix: the two eyes (with their cheeks) and the mouth
      expect(s.floorCv('kneel')[0].transforms).toBeGreaterThanOrEqual(3);
      // getting up: the live face on the drawing as long as it shows
      s.frames.length = 0;
      s.pet.doWord('stand'); s.run(4);
      expect(s.frames.some(x => x.kneel >= 1)).toBe(true);
      for (const x of s.frames) {
        expect(x.up.includes('kneelFx'), `kneel ${x.kneel}`).toBe(x.kneel > 0);
        expect(x.alpha.kneel_live ?? 0).toBe(x.kneel);
      }
      expect(s.last().up).toContain('faceFx');
    } finally { s.done(); }
  });

  it('kneeling and lying, a drawn eye blinks shut with the painted lid and its lash line on the drawing\'s head', async () => {
    const s = await onKit();
    try {
      s.run(.5);
      // (kneeling, angry and shy pose her arms, FACE_ARMS, which shows her live upper body: not on the drawing's head)
      for (const [pose, face] of [['kneel', 'sad'], ['kneel', 'smug'], ['lie', 'angry'], ['lie', 'shy']]) {
        s.pet.doWord(pose); s.run(3);
        s.pet.setExpr(face, 30); s.run(.3);
        const drawnOn = () => s.last()[`${pose}Drawn`].filter(n => /eye[LR]/.test(n)), P = s.pet.pet;
        // (no blink of her own meanwhile; one started by hand: .16 s, a sine)
        P.blinkT = 99; P.blinkAge = 9; s.run(1 / 60);
        expect(drawnOn(), `${pose} ${face} open`).toEqual([`${face}_eyeL.png`, `${face}_eyeR.png`]);
        P.blinkAge = 0; s.run(1 / 60);       // blink .32
        expect(drawnOn(), `${pose} ${face} blinking`).toEqual([`${face}_eyeL.png`, `${face}_eyeR.png`]);
        P.blinkAge = .07; s.run(1 / 60);     // blink about 1
        const shut = drawnOn();
        expect(s.last().o.blink, `${pose} ${face}`).toBeGreaterThan(.9);
        // (the painted eye's ball and iris are cut in a canvas of their own, drawn in with the lashes over it)
        expect(shut, `${pose} ${face} shut`).toEqual(expect.arrayContaining(['eyeL_lash.png', 'eyeR_lash.png']));
        expect(shut.filter(n => n.startsWith(`${face}_`)), `${pose} ${face} shut`).toEqual([]);
        P.blinkAge = 9; s.pet.setExpr('neutral', .1); s.pet.doWord('stand'); s.run(4);
      }
    } finally { s.done(); }
  });

  it('lying, a face made of two (smug+happy) is painted on the lying head', async () => {
    const s = await onKit();
    try {
      s.run(.5);
      s.pet.doGroup(['lie', 'smug', 'happy']); s.run(3);
      s.pet.pet.blinkT = 99; s.pet.pet.blinkAge = 9; s.run(1 / 60);   // (no blink of her own on the frame checked)
      const f = s.last();
      expect(f.lie).toBe(1);
      expect(f.up).toContain('lieFx');
      expect(f.alpha.lie_live).toBe(1);
      expect(f.alpha.lie_smile + f.alpha.lie_talk + f.alpha.lie_shut).toBe(0);
      expect(f.lieDrawn).toEqual(expect.arrayContaining(['smug_eyeL.png', 'smug_eyeR.png', 'happy_mouth.png']));
    } finally { s.done(); }
  });

  it('lying, the face\'s meshes stay on the drawing as her head nods (the fringe never slides off its hair), in both outfits', async () => {
    // (the winter outfit's blank and fringe are on boxes of their own, poseParts: they must ride the head as closely)
    for (const look of ['deepseek', 'deepseek-cape']) {
      const s = await onKit([], look);
      try {
        s.run(.5);
        s.pet.doWord('lie'); s.run(3);
        const { parts, deformers } = rigSeen.tree, P = Object.fromEntries(parts.map(p => [p.id, p]));
        let worst = 0, shut = 0, turned = 0;
        const look1 = () => {
          const st = rigSeen.st, d = chainPoint(deformers, st, 'lieHead', P.lie_live.box[0], P.lie_live.box[1]), r = chainPoint(deformers, { ...st, lieHead: null }, 'lieHead', P.lie_live.box[0], P.lie_live.box[1]);
          turned = Math.max(turned, Math.hypot(d[0] - r[0], d[1] - r[1]));
          for (const k of ['lie_blank', 'lie_live', 'lie_fringe']) worst = Math.max(worst, meshGap(deformers, st, P[k], P.lie_body));
          shut = Math.max(shut, meshGap(deformers, st, P.lie_shut, P.lie_body));
        };
        for (let n = 0; n < 2; n++) { s.pet.doWord('nod'); s.run(1.2, look1); }
        expect(s.last().lie, look).toBe(1);
        expect(s.last().alpha.lie_live, look).toBe(1);
        expect(turned, look).toBeGreaterThan(1);  // (the head did turn)
        // (the drawn eyes-shut patch, on its [8, 6] mesh, as the yardstick; the face on [4, 4] slid ~1)
        expect(worst, look).toBeLessThan(Math.max(.3, 2 * shut));
      } finally { s.done(); }
    }
  });

  it('kneeling, the face\'s meshes ride the kneeling head with the drawing as she nods and tilts, in both outfits', async () => {
    for (const look of ['deepseek', 'deepseek-cape']) {
      const s = await onKit([], look);
      try {
        s.run(.5);
        s.pet.doWord('kneel'); s.run(3.5);
        const { parts, deformers } = rigSeen.tree, P = Object.fromEntries(parts.map(p => [p.id, p]));
        let worst = 0, shut = 0, kneeling = 0;
        const look1 = () => {
          if (rigSeen.st.alpha.kneel_live !== 1) return;
          kneeling++;
          for (const k of ['kneel_blank', 'kneel_live', 'kneel_fringe']) worst = Math.max(worst, meshGap(deformers, rigSeen.st, P[k], P.kneel_body));
          shut = Math.max(shut, meshGap(deformers, rigSeen.st, P.kneel_shut, P.kneel_body));
        };
        for (const w of ['nod', 'tilt', 'nod']) { s.pet.doWord(w); s.run(1.2, look1); }
        expect(kneeling, look).toBeGreaterThan(60);
        expect(worst, look).toBeLessThan(Math.max(.3, 2 * shut));
      } finally { s.done(); }
    }
  });

  it('hands the face over with the body at the kneeling hybrid\'s cut: one of the two faces in every frame', async () => {
    const s = await onKit();
    try {
      s.run(.5);
      s.pet.doWord('kneel'); s.run(3);
      s.frames.length = 0;
      s.pet.doWord('wave'); s.run(4);
      expect(s.frames.some(x => x.low >= 1 && x.kneel === 0)).toBe(true);
      expect(s.last().kneel).toBe(1);
      for (const x of s.frames) {
        const floor = x.up.includes('kneelFx'), stand = x.up.includes('faceFx');
        expect(floor || stand, JSON.stringify({ k: x.kneel, l: x.low })).toBe(true);
        expect(floor).toBe(x.kneel > 0);
        expect(stand).toBe(x.kneel < 1);
      }
    } finally { s.done(); }
  });

  it('without the files, kneeling and lying keep the drawn patches as before', async () => {
    const s = await onKit(['kneel_blank', 'lie_fringe']);
    try {
      s.run(.5);
      s.pet.doWord('kneel'); s.run(3);
      s.pet.doWord('happy'); s.run(.6);
      expect(s.last().kneel).toBe(1);
      expect(s.last().alpha.kneel_live).toBe(0);
      expect(s.last().alpha.kneel_smile).toBeGreaterThan(0);
      expect(s.last().up).not.toContain('kneelFx');
      s.pet.doWord('lie'); s.run(3);
      expect(s.last().lie).toBe(1);
      expect(s.last().alpha.lie_live).toBe(0);
      expect(s.last().up).not.toContain('lieFx');
    } finally { s.done(); }
  });

  it('crossfades the floor face with a dress picked while she kneels', async () => {
    const s = await onKit();
    try {
      s.run(.5);
      s.pet.doWord('kneel'); s.run(3);
      await s.fig.preload();
      await s.fig.setScheme(SCHEMES[1], { fade: .5 });
      s.run(.1);
      expect(s.last().up).toEqual(expect.arrayContaining(['kneelFx', 'kneelFx@mix']));
      s.run(1);
      expect(s.last().up).not.toContain('kneelFx@mix');
      expect(s.last().up).toContain('kneelFx');
    } finally { s.done(); }
  });
});
