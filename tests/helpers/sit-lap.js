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

/** Skin as the girls' build scripts tell it (scratch/outfits/gemini/build_arms_w.py skin()). */
const isSkin = c => c[0] > 190 && c[0] - c[2] > 18 && c[0] - c[1] > 4 && c[1] > 120;

/**
 * Her hands resting in her lap belong to sit_top, which a gesture seated hides (with the standing torso and the
 * gesture's arms shown instead): left in sit_skirt they stayed in her lap and she showed four hands (Gemini 娘 did, her
 * navy cuffs cut the hands off the sleeves in the seg map; scratch/art/sit_lap.py lap_hands()). Checked on the textures,
 * the classic look and each outfit with its own sit: sit_top (placed as at rest, its head-relative box sunk by headDrop)
 * has her lap hands below the sunk standing torso, and under them sit_skirt is opaque and not a second pair of hands.
 * `minHand`: the least skin area (rig units²) the lap hands cover. (Not for Claude 娘: her cream dress and book pass
 * the skin test, so sit_top's "skin" reaches over sleeves the pool does not lie under; her renders show no second pair.)
 */
export function describeLapHands(name, { dir, minHand = 15 }) {
  const model = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'));
  const looks = [{ id: 'classic', parts: model.parts, sit: model.poses?.sit }];
  for (const O of model.outfits || []) if (O.parts) looks.push({ id: O.id, parts: [...model.parts.filter(p => !O.parts.some(q => q.id === p.id)), ...O.parts], sit: O.poses?.sit || model.poses?.sit });
  const url = p => new URL(p.src || `tex/${p.tex}.png`, dir);
  describe(`${name}: her lap hands seated`, () => {
    for (const L of looks) {
      const by = id => L.parts.find(p => p.id === id) || L.sit?.required?.find(p => p.id === id);
      const ok = L.sit && ['torso', 'sit_top', 'sit_skirt'].every(id => by(id) && existsSync(url(by(id))));
      it.skipIf(!ok)(`${L.id}: the lap hands are sit_top's, and sit_skirt under them is plain lap (no second pair of hands when a gesture hides sit_top)`, () => {
        const [torso, top, lap] = ['torso', 'sit_top', 'sit_skirt'].map(by), drop = L.sit.headDrop;
        const T = rgba(url(top)), P = rgba(url(lap)), y0 = torso.box[1] + torso.box[3] + drop, st = .25;
        const tbox = [top.box[0], top.box[1] + drop, top.box[2], top.box[3]];
        let hand = 0, opaque = 0, skin = 0;
        for (let y = y0; y < tbox[1] + tbox[3]; y += st) for (let x = tbox[0]; x < tbox[0] + tbox[2]; x += st) {
          const a = texel(T, tbox, x, y);
          if (a[3] < 200 || !isSkin(a)) continue;
          hand++;
          const b = texel(P, lap.box, x, y);
          if (b[3] >= 200) { opaque++; if (isSkin(b)) skin++; }
        }
        expect(hand * st * st, 'skin of sit_top below the sunk torso (rig units²)').toBeGreaterThan(minHand);
        // (under them: the sunk standing skirt and the lap carried in from the sides; skin-coloured frill shading 0-9 %;
        // the hands themselves left in sit_skirt were most of it)
        expect(opaque / hand, 'sit_skirt opaque under the lap hands').toBeGreaterThan(.95);
        expect(skin / hand, 'sit_skirt skin under the lap hands').toBeLessThan(.2);
      });
    }
  });
}
