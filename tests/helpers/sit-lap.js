/**
 * Seated with a gesture (sit+wave, sit+heart, sit+cheer, sit+muse) her motion.js drops sit_top and shows the standing
 * torso again, sunk with the waist (poses.sit.headDrop), over sit_skirt. Just under that torso sit_skirt must show the
 * standing skirt, sunk the same: the lap there used to be a fill smeared up from the skirt below, feathered at its top,
 * which read as a blurred, see-through band at her waist (scratch/art/sit_lap.py, the girls' build_sit.py).
 * `describeSitLap` checks it on one of the four girls' textures, the classic look and each outfit with its own sit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/** An 8-bit RGBA PNG's pixels. */
function rgba(url) {
  const b = readFileSync(url), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  expect(b[24] === 8 && b[25] === 6 && b[28] === 0, 'an 8-bit RGBA PNG, not interlaced').toBe(true);
  const idat = [];
  for (let o = 8; o < b.length; o += 12 + b.readUInt32BE(o)) if (b.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + b.readUInt32BE(o)));
  const raw = inflateSync(Buffer.concat(idat)), row = w * 4, px = new Uint8Array(row * h);
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

/** The texel of `part` (its box, its texture `T`) at rig point (x, y). */
function texel(T, box, x, y) {
  const tx = Math.min(T.w - 1, Math.max(0, Math.floor((x - box[0]) / box[2] * T.w)));
  const ty = Math.min(T.h - 1, Math.max(0, Math.floor((y - box[1]) / box[3] * T.h)));
  return T.px.subarray((ty * T.w + tx) * 4, (ty * T.w + tx) * 4 + 4);
}

/** `name` her name in the titles, `dir` her web directory. */
export function describeSitLap(name, { dir }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  const looks = [{ id: 'classic', parts: model.parts, sit: model.poses?.sit }];
  for (const O of model.outfits || []) if (O.parts) looks.push({ id: O.id, parts: [...model.parts.filter(p => !O.parts.some(q => q.id === p.id)), ...O.parts], sit: O.poses?.sit || model.poses?.sit });
  const url = p => new URL(p.src || `tex/${p.tex}.png`, dir);
  describe(`${name}: the lap seated with a gesture`, () => {
    for (const L of looks) {
      const by = id => L.parts.find(p => p.id === id) || L.sit?.required?.find(p => p.id === id);
      const ok = L.sit && ['torso', 'skirt', 'sit_skirt'].every(id => by(id) && existsSync(url(by(id))));
      it.skipIf(!ok)(`${L.id}: under the sunk torso sit_skirt shows the standing skirt, sunk with it (no blurred fill)`, () => {
        const [torso, skirt, lap] = ['torso', 'skirt', 'sit_skirt'].map(by), drop = L.sit.headDrop;
        const S = rgba(url(skirt)), P = rgba(url(lap)), y0 = torso.box[1] + torso.box[3] + drop;
        // a strip on her axis from just under the torso's lower edge, 5 rig units deep
        let n = 0, sum = 0;
        for (let y = y0 + 1; y < y0 + 6; y += .5) for (let x = 122; x < 134; x += .5) {
          const a = texel(P, lap.box, x, y), b = texel(S, skirt.box, x, y - drop);
          if (a[3] < 250 || b[3] < 250) continue;
          n++; sum += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
        }
        expect(n, 'opaque in both').toBeGreaterThan(150);
        // (the standing skirt: 0-3 levels apart; the old fill 10-44)
        expect(sum / n).toBeLessThan(6);
      });
    }
  });
}
