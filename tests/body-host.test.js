import { describe, expect, it } from 'vitest';
import { haloRect, haloTrail, HALO_CLIP, readLayout } from '../packages/cortico-world-desktop-pet/web/body-host.js';

describe('the halo around a body (web/body-host.js haloRect)', () => {
  const size = { W: 1470, H: 859, floorY: 857, S: .42 };

  it("blurs only the body's surroundings, not the whole stage (upstream #86: the whale kept a Mac's GPU busy)", () => {
    expect(HALO_CLIP).toBe(true);
    const l = readLayout({ box: { x: 970, y: 745, w: 90, h: 100 } }, size);
    // at least 80 px each side and 130 px above (hearts, notes and z's drift by pixels), down to the floor and the stage's edge
    expect(haloRect(l, size)).toEqual({ x: 890, y: 615, w: 250, h: 244 });
    const r = haloRect(l, size);
    expect(r.w * r.h).toBeLessThan(size.W * size.H / 15);
  });

  it('a big body gets shares of its box: confetti and hearts fly farther', () => {
    const big = { ...size, S: .84 };
    expect(haloRect(readLayout({ box: { x: 700, y: 457, w: 200, h: 400 } }, big), big)).toEqual({ x: 580, y: 137, w: 440, h: 722 });
  });

  it('a body carried up high keeps the floor in its window: what it drops falls there', () => {
    const r = haloRect(readLayout({ box: { x: 500, y: 200, w: 90, h: 100 } }, size), size);
    expect(r.y + r.h).toBe(size.H);
    expect(r.y).toBe(70);
  });

  it('stays on the stage, and there is none without a box', () => {
    expect(haloRect(readLayout({ box: { x: 2, y: 10, w: 20, h: 20 } }, size), size)).toEqual({ x: 0, y: 0, w: 102, h: 859 });
    expect(haloRect(readLayout({ box: { x: 10, y: 10, w: 0, h: 0 } }, size), size)).toBe(null);
    expect(haloRect(null, size)).toBe(null);
  });

  it('a body on the move keeps the windows it was in for 2.5 s: hearts left where she was picked up, a run\'s dust', () => {
    const trail = haloTrail();
    expect(trail.add(null, 0)).toBe(null);
    expect(trail.add({ x: 100, y: 100, w: 50, h: 50 }, 0)).toEqual({ x: 100, y: 100, w: 50, h: 50 });
    expect(trail.add({ x: 400, y: 20, w: 50, h: 50 }, 1000)).toEqual({ x: 100, y: 20, w: 350, h: 130 });
    // off the stage meanwhile: what is left of where she was still glows
    expect(trail.add(null, 2000)).toEqual({ x: 100, y: 20, w: 350, h: 130 });
    expect(trail.add({ x: 400, y: 20, w: 50, h: 50 }, 2600)).toEqual({ x: 400, y: 20, w: 50, h: 50 });
    expect(trail.add(null, 6000)).toBe(null);
  });
});
