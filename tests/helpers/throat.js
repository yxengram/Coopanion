/**
 * A look up (抬头) on the four girls (Claude-chan, GPT-chan, Gemini-chan, Grok-chan: one design, the same LOOKUP in each
 * motion.js): the head rises LOOKUP.neckTy rig units on the neck, standing and seated. The textures that carry her
 * collar (the standing torso, Claude-chan's capelet; sit_top; both outfits) have a neck painted under the chin for it
 * (scratch/next/polish/neck/build_throat.py, run after the girl's merge_model.py / install_outfit.py), so a full lift
 * shows a neck, never the stage or the old flat stub of skin. `describeThroat` checks it on one girl's model and
 * textures: the neck column on her axis is opaque from above a full lift's chin down to the chin's rest line, and
 * (`band`, Grok-chan) the back of her collar fills beside it under the jaw.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rgba, texel } from './sit-lap.js';

/**
 * The frozen hashes tests/fixtures/throat-rest.json: per girl, look and collar texture, `restHash` of it as it was before
 * the neck (written from HEAD's textures at 0dc14de1 with this function). Only the layers whose rest the neck keeps:
 * all of Claude-chan's, GPT-chan's and Grok-chan's, and Gemini-chan's standing torso (her sit_top shows the neck at rest
 * on purpose).
 */
const REST = new URL('../fixtures/throat-rest.json', import.meta.url);

/**
 * A hash of texture `T` (box `box`) away from the face: every texel that is not fully transparent and whose centre is
 * more than `m` rig units from any of the face's texels (`F`, `fbox`; alpha > 0), by its column and its row counted
 * from the bottom (the neck grows the canvas upward only, so those keep their place). Equal hashes: nothing changed
 * outside the face's reach, so the rest frames there are as they were.
 */
export function restHash(T, box, F, fbox, m = .5) {
  const kx = F.w / fbox[2], ky = F.h / fbox[3], h = createHash('sha256');
  const faceAt = (x, y) => {
    const fx = Math.floor((x - fbox[0]) * kx), fy = Math.floor((y - fbox[1]) * ky);
    return fx >= 0 && fx < F.w && fy >= 0 && fy < F.h && F.px[(fy * F.w + fx) * 4 + 3] > 0;
  };
  // (texel centres from the box's bottom edge and its width, which the growth keeps, so they land on the same rig
  // points before and after it, to the last bit)
  const k = T.w / box[2], bottom = Math.round((box[1] + box[3]) * 1e6) / 1e6;
  for (let ty = 0; ty < T.h; ty++) for (let tx = 0; tx < T.w; tx++) {
    const i = (ty * T.w + tx) * 4;
    if (!T.px[i + 3]) continue;
    const x = box[0] + (tx + .5) / k, y = bottom - (T.h - ty - .5) / k;
    let near = false;
    for (const dx of [-m, 0, m]) for (const dy of [-m, 0, m]) near ||= faceAt(x + dx, y + dy);
    if (near) continue;
    h.update(`${tx},${T.h - 1 - ty}:${T.px[i]},${T.px[i + 1]},${T.px[i + 2]},${T.px[i + 3]};`);
  }
  return h.digest('hex');
}

/** The face's lower contour (rig y of its lowest opaque texel) at rig x, from its texture `F` and box. */
function chinAt(F, box, x) {
  const tx = Math.floor((x - box[0]) / box[2] * F.w);
  for (let ty = F.h - 1; ty >= 0; ty--) if (F.px[(ty * F.w + tx) * 4 + 3] > 128) return box[1] + (ty + 1) / F.h * box[3];
  return null;
}

/**
 * `name` her name in the titles, `dir` her web directory, `M` her motion.js, `planFace` her face.js's, `collar` the
 * standing part that carries her collar, `band` (Grok-chan) the collar's back beside the neck, `restShows` the collar
 * parts whose rest shows the neck on purpose (Gemini-chan's sit_top): every other layer must have its frozen hash.
 */
export function describeThroat(name, { dir, M, planFace, collar = 'torso', band = false, restShows = [] }) {
  const rest = JSON.parse(readFileSync(REST, 'utf8'))[basename(fileURLToPath(dir))] || {};
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  const looks = [{ id: 'classic', parts: model.parts, sit: model.poses.sit }];
  for (const O of model.outfits || []) if (O.parts) looks.push({ id: O.id, parts: [...model.parts.filter(p => !O.parts.some(q => q.id === p.id)), ...O.parts], sit: O.poses?.sit || model.poses.sit });
  const url = p => new URL(p.src || `tex/${p.tex}.png`, dir);
  describe(`${name}: a look up (抬头) lifts her head on a neck`, () => {
    it('lifts the head 6 rig units, the eyes to 8 (face.js lifts the iris past the pointer\'s 5) and the brows 5 px', () => {
      expect(M.LOOKUP).toEqual({ pitch: .9, neckTy: 6, look: 8, brow: 5 });
    });
    it('lifts the iris past the clamp only for a look further up than the pointer reaches (-5): every other look is as before', () => {
      const iy = (ly, dy) => planFace({ eyes: [{ shape: 'ring', rx: 16, ry: 16, dy }, { shape: 'ring', rx: 16, ry: 16, dy }] }, 'neutral', { look: [0, ly] }, 0, () => false).eyes[0].iy;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      // (the pointer reaches -4..4, a face's lookAt -4..2 and its eyes' dy -5..5; past -5 only a look up, and a sneeze's
      // caught breath (half a look up) with the pointer above her and a face other than its own)
      for (let ly = -5; ly <= 5; ly += .5) for (const dy of [-5, -4, -2, -1, 0, 1, 2, 4, 5]) expect(iy(ly, dy)).toBeCloseTo(clamp(ly * .7 + dy * .7, -3.5, 3.5), 9);
      // a look up: -LOOKUP.look at its height, 2.1 master px more than the old clamp, whatever the face's dy
      expect(iy(-M.LOOKUP.look, 0)).toBeCloseTo(-5.6, 9);
      expect(iy(-M.LOOKUP.look, -4)).toBeCloseTo(-5.6, 9);
      expect(iy(-M.LOOKUP.look, 4)).toBeCloseTo(-2.8, 9);
      expect(iy(-20, 0)).toBeCloseTo(-5.6, 9);
    });
    for (const L of looks) {
      const face = L.parts.find(p => p.id === 'face'), F = rgba(url(face));
      const chin = chinAt(F, face.box, 128);
      const layers = [['standing', L.parts.find(p => p.id === collar)], ['seated', L.sit.required.find(p => p.id === 'sit_top')]];
      for (const [pose, part] of layers) {
        const fixed = rest[`${L.id}/${part.id}`];
        if (restShows.includes(part.id)) it(`${L.id}, ${pose} (${part.id}): shows the neck at rest on purpose, so it has no frozen rest hash`, () => {
          expect(fixed).toBeUndefined();
        });
        else it(`${L.id}, ${pose} (${part.id}): away from her face (where nothing is hidden at rest) the texture is as it was before the neck`, () => {
          expect(restHash(rgba(url(part)), part.box, F, face.box)).toBe(fixed);
        });
        it(`${L.id}, ${pose} (${part.id}): the texture is sized to its box, and a neck is under a fully lifted chin`, () => {
          const T = rgba(url(part));
          // (the canvas grew upward for the neck: box y and h changed with it, so the texels keep their size)
          expect(Math.abs(T.w / part.box[2] * part.box[3] - T.h)).toBeLessThanOrEqual(2);
          expect(part.box[1]).toBeLessThan(chin - M.LOOKUP.neckTy - 1);
          // on her axis, from a unit above a full lift's chin down to the chin at rest: no stage, no hair between (to
          // half a unit above it: the neck stops where the face at rest is opaque, bar seams under 0.8 units down to
          // the collar, so nothing of it shows through the chin's anti-aliased edge at rest, and what showed under that
          // edge at rest shows there lifted too)
          for (let y = chin - M.LOOKUP.neckTy - 1; y <= chin - .5; y += .2) expect(texel(T, part.box, 128, y)[3], `y ${y.toFixed(1)}`).toBe(255);
          // the neck is skin: about her face's colour just over the chin, darker (its shadow) never lighter
          const skin = texel(F, face.box, 128, chin - 6), neck = texel(T, part.box, 128, chin - 3);
          for (let c = 0; c < 3; c++) expect(neck[c]).toBeLessThanOrEqual(skin[c] + 6);
          expect(neck[0]).toBeGreaterThan(neck[2]);
          // ...shaded: darkest just under a fully lifted chin, lighter toward the chin's rest line (the old stub was flat)
          const lum = y => { const t = texel(T, part.box, 128, y); return t[0] + t[1] + t[2]; };
          expect(lum(chin - M.LOOKUP.neckTy)).toBeLessThan(lum(chin - 3) - 12);
          if (band) {
            // beside the neck, the back of her collar (red, dark): under the jaw, from just under a full lift's jaw line
            for (const x of [113, 143]) {
              const jaw = chinAt(F, face.box, x);
              for (let y = jaw - M.LOOKUP.neckTy + .5; y <= jaw - .5; y += .25) {
                const t = texel(T, part.box, x, y);
                expect(t[3], `x ${x} y ${y.toFixed(1)}`).toBe(255);
                expect(t[0], `x ${x} y ${y.toFixed(1)}`).toBeGreaterThan(t[1] + 30);
              }
            }
          }
        });
      }
    }
  });
}
