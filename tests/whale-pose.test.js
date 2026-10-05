import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { poseMix, lieDeformers, kickField, KICK, eyesShut, waveHandover, ARM_LIMIT } from '../packages/cortico-world-desktop-pet/web/whale/figure.js';

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

/** The alpha channel of an 8-bit RGBA, non-interlaced PNG: { w, h, a }. */
function alphaOf(url) {
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
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  return { w, h, a };
}
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
      for (const id of have) {
        const { w, h, colorType } = png(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
        expect(colorType, `${id} ${p.tex} is RGBA`).toBe(6);
        expect(Math.abs(w - p.box[2] * TEX_PER_UNIT), `${id} ${p.tex} width`).toBeLessThanOrEqual(2);
        expect(Math.abs(h - p.box[3] * TEX_PER_UNIT), `${id} ${p.tex} height`).toBeLessThanOrEqual(2);
      }
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
    // the half width pet-core keeps from the screen edges covers every piece of the drawing (it is centred on x 128)
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
      // where the head is drawn, and the points pet-core and the fx use on it
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
    // waking: pet-core opens the lid from 0 to 10 over half a second; no frame at 60 fps jumps by more than a third
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
      for (const id of have) {
        const { w, h, colorType } = png(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
        expect(colorType, `${id} ${p.tex} is RGBA`).toBe(6);
        expect(Math.abs(w - p.box[2] * TEX_PER_UNIT), `${id} ${p.tex} width`).toBeLessThanOrEqual(2);
        expect(Math.abs(h - p.box[3] * TEX_PER_UNIT), `${id} ${p.tex} height`).toBeLessThanOrEqual(2);
      }
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
    const drawn = Math.atan2(-(wx - sx), wy - sy) * 180 / Math.PI;
    expect(Math.abs(drawn - WAVE.rest)).toBeLessThan(12);
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

describe('the lying and waving drawings inside the pack sandbox', () => {
  it('reports what poses it can show on every frame, so pet-core keeps a pack without the files seated', () => {
    const frame = readFileSync(new URL('../packages/cortico-world-desktop-pet/web/figure-frame.js', import.meta.url), 'utf8');
    const sandbox = readFileSync(new URL('../packages/cortico-world-desktop-pet/web/figure-sandbox.js', import.meta.url), 'utf8');
    expect(frame).toMatch(/t: 'drawn'[^\n]*poses: fig\.poses/);
    expect(sandbox).toMatch(/get poses\(\)/);
  });
});

describe('resting her chin on her hand while thinking, as the whale draws it', () => {
  const CHIN = model.poses.chin;
  const z = id => model.parts.find(p => p.id === id).z;

  it('has its file in every scheme, sized to its box', () => {
    for (const p of CHIN.required) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      expect(have, p.tex).toEqual(SCHEMES);
      for (const id of have) {
        const { w, h } = png(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
        expect(Math.abs(w - p.box[2] * TEX_PER_UNIT), `${id} ${p.tex} width`).toBeLessThanOrEqual(2);
        expect(Math.abs(h - p.box[3] * TEX_PER_UNIT), `${id} ${p.tex} height`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('is the far forearm: its elbow by the far shoulder, the hand in front of the face and under the fringe', () => {
    const [arm] = CHIN.required;
    expect(arm.parent).toBe('armChin');
    const [ex, ey] = CHIN.pivots.armChin, [fx, fy] = model.pivots.armFar;
    expect(Math.hypot(ex - fx, ey - fy)).toBeLessThan(15);
    expect(arm.z).toBeGreaterThan(Math.max(z('face'), z('eye_creases'), z('brows')));
    expect(arm.z).toBeLessThan(z('bangs'));
    expect(model.parts.some(q => q.id === arm.id)).toBe(false);
    // the hand (the wrist and past it) is up at the chin, above the elbow
    expect(CHIN.wrist[1]).toBeLessThan(ey);
  });
});

describe('cheering with both arms up, as the whale draws it', () => {
  const ARMS = model.poses.cheer.arms;
  const z = id => model.parts.find(p => p.id === id).z;

  it('has both arms in every scheme, each sized to its box', () => {
    for (const arm of Object.values(ARMS)) for (const p of arm.required) {
      const have = SCHEMES.filter(id => existsSync(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE)));
      expect(have, p.tex).toEqual(SCHEMES);
      for (const id of have) {
        const { w, h } = png(new URL(`${dir(id)}tex/${p.tex}.png`, WHALE));
        expect(Math.abs(w - p.box[2] * TEX_PER_UNIT), `${id} ${p.tex} width`).toBeLessThanOrEqual(2);
        expect(Math.abs(h - p.box[3] * TEX_PER_UNIT), `${id} ${p.tex} height`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('turns each arm about its own shoulder, its root under the plain arm\'s layer and its hand over the head', () => {
    const plain = { near: 'armNear', far: 'armFar' };
    for (const [slot, arm] of Object.entries(ARMS)) {
      const [[, pivot]] = Object.entries(arm.pivots), [px, py] = model.pivots[plain[slot]];
      expect(Math.hypot(pivot[0] - px, pivot[1] - py), slot).toBeLessThan(5);
      const [root, top] = arm.required;
      expect(root.z, slot).toBe(z(slot === 'near' ? 'arm_near' : 'arm_far'));
      expect(top.z, slot).toBeGreaterThan(Math.max(z('sidelocks'), z('fin_near'), z('face')));
      // raised: the hand is above the shoulder
      expect(arm.wrist[1], slot).toBeLessThan(pivot[1] - 20);
      for (const p of arm.required) expect(model.parts.some(q => q.id === p.id), p.id).toBe(false);
    }
  });
});
