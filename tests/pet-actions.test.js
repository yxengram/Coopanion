import { describe, expect, it } from 'vitest';
import { createPet, createSfx, EXPRESSIONS, FACES, figure, MOTIONS, SOUND_KINDS, STAND, defaultSkin, HEAD_TOP, ROLL_D } from '../packages/cortico-world-desktop-pet/web/pet-core.js';
import { VOCAB } from '../packages/cortico-world-desktop-pet/src/script.ts';

/** A pet with no page under it: the elements and the sound only take calls. */
function barePet(onEvent) {
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const sfx = new Proxy({}, { get: () => () => {} });
  const fxG = el(), petG = el();
  const pet = createPet({ petG, shadowEl: el(), fxG }, { sfx, onEvent, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
  pet.resize();
  // the particles' and Coo's markup, as last drawn
  pet.fxHtml = () => fxG.innerHTML;
  pet.petHtml = () => petG.innerHTML;
  return pet;
}
const run = (pet, seconds) => { for (let i = 0; i < seconds * 60; i++) { pet.step(1 / 60); pet.render(); } };
const eyesIn = html => (html.match(/class="eye"/g) || []).length;

describe('the words the model can use', () => {
  it('match what the body knows, both ways', () => {
    const words = kind => VOCAB.filter(v => v.kind === kind).map(v => v.id).sort();
    expect(words('expression')).toEqual([...EXPRESSIONS].sort());
    expect(words('motion')).toEqual([...MOTIONS].sort());
  });

  it('every expression has a face Coo can draw', () => {
    for (const n of EXPRESSIONS) {
      const fc = FACES[n].f(.5);
      expect(fc.eyes).toHaveLength(2);
      expect(figure(fc, { look: fc.lookAt || [0, 0], legs: STAND, low: 0, t: .5, blink: 0, acc: defaultSkin() })).toContain('class="eye"');
    }
  });

  it('every motion is one the body takes, and plays out without getting stuck', () => {
    for (const m of MOTIONS) {
      const pet = barePet();
      run(pet, 1);
      if (m !== 'walk' && m !== 'run') expect(pet.act(m), m).toBe(true);
      run(pet, 5);
      // everything but sitting, sleeping and lying ends back on its feet
      if (m !== 'sit' && m !== 'sleep' && m !== 'lie' && m !== 'walk' && m !== 'run') expect(pet.pet.mode, m).toBe('idle');
    }
  });

  it('sitting, sleeping and lying last until asked to stand, then end on its feet', () => {
    for (const m of ['sit', 'sleep', 'lie']) {
      const pet = barePet();
      run(pet, 1);
      pet.act(m);
      run(pet, 6);
      expect(pet.pet.mode, m).toBe(m);
      pet.act('stand');
      run(pet, 2.5);
      expect(pet.pet.mode, m).toBe('idle');
    }
  });

  it('a motion that stops an ordered walk reports the walk as interrupted', () => {
    for (const m of ['bow', 'turn', 'spin', 'flinch', 'peek', 'away']) {
      const events = [];
      const pet = barePet((kind, d) => events.push([kind, d.walkId]));
      run(pet, 1);
      pet.walkTo(100, false, 'w1');
      run(pet, .3);
      pet.act(m);
      expect(events, m).toContainEqual(['interrupted', 'w1']);
    }
  });

  it('a walk that starts during a flinch is not pulled back to where the flinch stopped', () => {
    const events = [];
    const pet = barePet((kind, d) => events.push([kind, d.x]));
    run(pet, 1);
    pet.act('flinch');
    run(pet, .1);
    pet.walkTo(pet.pet.x + 30, false, 'w1');
    run(pet, 1.5);
    const arrived = events.find(e => e[0] === 'arrived');
    expect(arrived).toBeTruthy();
    expect(Math.abs(pet.pet.x - arrived[1])).toBeLessThan(1);
  });

  it('each motion sound can be silenced with the motion kind', () => {
    for (const n of ['look', 'peek', 'flinch', 'shiver', 'dance', 'away']) expect(SOUND_KINDS.move, n).toContain(n);
    // look and peek borrow the 'hmm' tone and away the 'huff', which belong to no kind: watch them to see whether they played
    const played = [];
    const sfx = createSfx({ storageKey: 'test.sfx' });
    sfx.hmm = () => played.push('hmm');
    sfx.huff = () => played.push('huff');
    sfx.configure({ kinds: { move: false } });
    sfx.look(); sfx.peek(); sfx.away();
    expect(played).toEqual([]);
    sfx.configure({ kinds: { move: true } });
    sfx.look(); sfx.peek(); sfx.away();
    expect(played).toEqual(['hmm', 'hmm', 'huff']);
  });

  it('a figure that draws a gesture itself takes it whole from the frame, and the body leaves it out', () => {
    const pet = barePet(), frames = [];
    pet.setFigure({ gestures: ['nod'], draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    pet.act('nod');
    run(pet, .35);
    const o = frames.at(-1);
    expect(o.gesture.kind).toBe('nod');
    expect(o.gesture.k).toBeGreaterThan(.3);
    expect(Math.abs(o.lean)).toBeLessThan(.01);
    run(pet, 1);
    expect(frames.at(-1).gesture).toBeNull();
  });

  it('turning away pouts with its back turned for a while, then comes round to its own face', () => {
    const pet = barePet();
    run(pet, 1);
    const facing = pet.pet.facing;
    expect(pet.act('away')).toBe(true);
    run(pet, 1.6);
    expect(pet.pet._fname).toBe('pout');
    expect(pet.pet.facing).toBe(facing);
    run(pet, 2.2);
    expect(pet.pet.mode).toBe('idle');
    expect(pet.pet.pulse).toBeNull();
    expect(pet.pet._fname).toBe('neutral');
  });

  it("Coo hides her face while her back is turned, and shows it again after", () => {
    const pet = barePet();
    pet.setSkin({ ...defaultSkin(), glasses: 'round' });
    run(pet, 1);
    const eyes = () => (pet.petHtml().match(/class="eye"/g) || []).length;
    expect(eyes()).toBeGreaterThan(0);
    expect(pet.petHtml()).toContain('c-glasses-main');
    pet.act('away');
    run(pet, 1.6);
    expect(eyes()).toBe(0);
    expect(pet.petHtml()).not.toContain('class="blush"');
    expect(pet.petHtml()).not.toContain('c-glasses-main');
    // the ring is still drawn
    expect(pet.petHtml()).toContain(`stroke-width="36"`);
    run(pet, 2);
    expect(eyes()).toBeGreaterThan(0);
    expect(pet.petHtml()).toContain('c-glasses-main');
  });

  it('Coo turns round gradually when something ends her back turned early', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('away');
    run(pet, 1.5);
    expect(eyesIn(pet.petHtml())).toBe(0);
    // a hop ends the gesture: the face comes back over a few frames, not all at once
    pet.act('hop');
    run(pet, 1 / 60);
    expect(pet.pet.pulse).toBeNull();
    // (the face's opacity group: its blush, then its eyes)
    const faceA = () => pet.petHtml().match(/<g opacity="([\d.]+)">(?:<g class="blush".*?<\/g>)?<path class="eye"/s)?.[1];
    expect(Number(faceA())).toBeLessThan(.2);
    run(pet, .4);
    expect(eyesIn(pet.petHtml())).toBeGreaterThan(0);
    expect(faceA()).toBeUndefined();
  });

  it('lying, turning away only pouts', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('lie');
    run(pet, 2);
    pet.act('away');
    run(pet, 1);
    expect(pet.pet.mode).toBe('lie');
    expect(pet.pet.pulse?.kind).not.toBe('away');
    expect(pet.pet._fname).toBe('pout');
    expect(pet.petHtml()).toContain('class="eye"');
  });

  it('a figure with its own back view is never squeezed thin turning round; one without still is', () => {
    const narrowest = poses => {
      const pet = barePet();
      pet.setFigure({ poses, draw() {} });
      run(pet, 1);
      pet.act('turn');
      let most = Infinity;
      for (let i = 0; i < 60; i++) { run(pet, 1 / 60); most = Math.min(most, Math.abs(pet.pet.xf.kx)); }
      expect(pet.pet.xf.kx * pet.pet.facing).toBeGreaterThan(0);
      return most / .42;
    };
    expect(narrowest({ back: true })).toBeGreaterThan(.85 * .98);
    expect(narrowest({})).toBeLessThan(.1);
  });

  it("a figure with its own back view gets the turn's progress in its frame, and its points follow the drawn width", () => {
    const pet = barePet(), frames = [];
    pet.setFigure({ poses: { back: true }, anchors: { bubble: [200, 18] }, draw: (g, face, o) => frames.push(o.facing) });
    run(pet, 1);
    pet.act('turn');
    run(pet, 4 / 60);
    const mid = frames.at(-1);
    expect(Math.abs(mid)).toBeLessThan(.85);
    // the bubble's spot stays out where the group is drawn, not squeezed in with the turn
    expect(Math.abs(pet.anchor().x - pet.pet.x)).toBeGreaterThan(.85 * 72 * .42 * .98);
  });

  it("Coo's mouth rests while her back is turned: no pout, no talking from behind", () => {
    const ring = (gap, gesture) => {
      const o = { look: [0, 0], legs: [], low: 0, t: 0, acc: defaultSkin(), gesture };
      return figure({ gap, eyes: [{ shape: 'up' }, { shape: 'up' }] }, o).match(/stroke-width="36"[^>]*d="([^"]+)"/)[1];
    };
    const back = { kind: 'away', k: .5 };
    expect(ring([28, 28], back)).toBe(ring([50, 50], back));
    expect(ring([62, 62], back)).toBe(ring([50, 50], back));
    // facing you, the gap is the mouth as ever
    expect(ring([28, 28], null)).not.toBe(ring([50, 50], null));
  });

  it('turning away while getting up from lying turns away once up, not just a pout', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('lie');
    run(pet, 3);
    pet.act('stand');
    run(pet, .2);
    expect(pet.pet.mode).toBe('wake');
    pet.act('away');
    run(pet, 1.4);
    expect(pet.pet.pulse?.kind).toBe('away');
    expect(eyesIn(pet.petHtml())).toBe(0);
  });

  it('a back turned while the lying pose could not show is over once it can', () => {
    let lie = false;
    const pet = barePet(), gestures = [];
    pet.setFigure({ get poses() { return { lie }; }, anchors: { lie: {} }, gestures: ['away'], draw: (g, face, o) => gestures.push(o.gesture?.kind) });
    run(pet, 1);
    pet.act('lie');
    run(pet, 2);
    pet.act('away');
    run(pet, .5);
    expect(pet.pet.pulse?.kind).toBe('away');
    lie = true;
    pet.act('sleep');
    gestures.length = 0;
    run(pet, .5);
    expect(pet.pet.pulse).toBeNull();
    expect(gestures).not.toContain('away');
  });

  it('a figure that draws no turning away of its own looks the other way for a while, then comes round', () => {
    const facings = gestures => {
      const pet = barePet(), seen = [];
      pet.setFigure({ gestures, draw: (g, face, o) => seen.push(o.facing) });
      run(pet, 1);
      const facing = pet.pet.facing;
      pet.act('away');
      seen.length = 0;
      run(pet, 1.6);
      const mid = seen.at(-1);
      run(pet, 2);
      expect(pet.pet.facing).toBe(facing);
      return [mid * facing, seen.at(-1) * facing];
    };
    const [mid, end] = facings(undefined);
    expect(mid).toBeLessThan(-.95);
    expect(end).toBeGreaterThan(.95);
    // one that draws it keeps facing the way it did
    expect(facings(['away'])[0]).toBeGreaterThan(.95);
  });

  it("a figure's back view coming in mid-turn (standing up) eases in, the turn's width not jumping out", () => {
    let sit = 0;
    const pet = barePet();
    // like the whale: a back to show only when not sitting
    pet.setFigure({ get poses() { return { back: sit < .5 }; }, draw: (g, face, o) => { sit = o.sit; } });
    run(pet, 1);
    pet.act('sit');
    run(pet, 2);
    pet.act('stand');
    run(pet, 1);
    pet.act('turn');
    const w = [];
    for (let i = 0; i < 40; i++) { run(pet, 1 / 60); w.push(pet.pet.xf.kx / .42); }
    // past the middle the width comes back out by ever smaller steps
    const after = w.slice(w.findIndex(v => v * w[0] < 0)).map(Math.abs);
    for (let i = 2; i < after.length; i++) expect(after[i] - after[i - 1], `frame ${i}`).toBeLessThan(after[i - 1] - after[i - 2] + .02);
  });

  it("a figure that names no glint spots gets its glints by its own bubble, not at Coo's head", () => {
    const glintY = anchors => {
      const fxG = { setAttribute() {}, innerHTML: '' }, el = () => ({ setAttribute() {}, innerHTML: '' });
      const pet = createPet({ petG: el(), shadowEl: el(), fxG }, { sfx: new Proxy({}, { get: () => () => {} }), roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
      pet.resize();
      pet.setFigure({ anchors, draw() {} });
      run(pet, 1);
      pet.setExpr('happy');
      run(pet, .2);
      const ys = [...fxG.innerHTML.matchAll(/stroke="#e0a100"[^>]*translate\([-\d.]+ ([-\d.]+)\)/g)].map(m => +m[1]);
      expect(ys.length).toBeGreaterThan(0);
      return Math.min(...ys);
    };
    // a short body whose head (and bubble) sits far below Coo's ring top
    expect(glintY({ bubble: [128, 170] })).toBeGreaterThan(glintY({ bubble: [128, 170], glints: [[50, 30], [210, 30]] }) + 40);
  });
});

describe('lying down', () => {
  /** A pet that has lain down and settled. */
  function lying(onEvent) {
    const pet = barePet(onEvent);
    run(pet, 1);
    pet.act('lie');
    run(pet, 2);
    return pet;
  }
  // a press at logo point (x, y), in stage pixels
  const at = (pet, x, y) => pet.toStage(x, y);

  it('goes down through sitting, then onto its front', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('lie');
    run(pet, .3);
    expect(pet.pet.lieK).toBeLessThan(.1);
    expect(pet.pet.sitK).toBeGreaterThan(.7);
    run(pet, 1.7);
    expect(pet.pet.lieK).toBeGreaterThan(.95);
    expect(pet.pet.sitK).toBeGreaterThan(.95);
    expect(pet.pet.mode).toBe('lie');
    expect(pet.pet._fname).toBe('content');
  });

  it('gets up the way it went down: pushes up to sitting, then stands', () => {
    const pet = lying();
    pet.act('stand');
    expect(pet.pet.mode).toBe('wake');
    run(pet, .6);
    expect(pet.pet.lieK).toBeLessThan(.5);
    run(pet, .2);
    expect(pet.pet.sitK).toBeGreaterThan(.5);
    run(pet, 1.2);
    expect(pet.pet.mode).toBe('idle');
    expect(pet.pet.prone).toBe(false);
  });

  it('turns round where it lies', () => {
    const pet = lying(), facing = pet.pet.facing;
    pet.act('turn');
    run(pet, .5);
    expect(pet.pet.mode).toBe('lie');
    expect(pet.pet.facing).toBe(-facing);
    expect(pet.pet.lieK).toBeGreaterThan(.95);
  });

  it('is hit over its lying body, not where its head was standing', () => {
    const events = [];
    const pet = lying((kind, d) => events.push([kind, d]));
    // inside the standing circle (radius 108 about 128,128), above the lying body
    expect(pet.hitPet(at(pet, 128, 40))).toBe(false);
    expect(pet.pointerDown(at(pet, 138, 172))).toBe(true);
    pet.pointerUp();
    expect(pet.pet.mode).toBe('wake');
    // lying is not sleeping: the poke did not wake her from sleep
    expect(events).toContainEqual(['touch', { kind: 'poke', woke: false }]);
  });

  it('can be picked up off the floor', () => {
    const pet = lying();
    const p = at(pet, 138, 172);
    expect(pet.pointerDown(p)).toBe(true);
    pet.pointerMove({ x: p.x + 20, y: p.y - 20 });
    expect(pet.pet.mode).toBe('drag');
    run(pet, .3);
    expect(pet.pet.lieK).toBeLessThan(.1);
    pet.pointerUp();
  });

  it('asked to sleep while lying, sleeps lying down, and gets up through sitting', () => {
    const pet = lying();
    pet.act('sleep');
    run(pet, 2);
    expect(pet.pet.mode).toBe('sleep');
    expect(pet.pet.prone).toBe(true);
    expect(pet.pet.lieK).toBeGreaterThan(.95);
    expect(pet.pet._fname).toBe('sleep');
    pet.act('stand');
    run(pet, .3);
    expect(pet.pet.lieK).toBeGreaterThan(.9);
    run(pet, 2);
    expect(pet.pet.mode).toBe('idle');
  });

  it('sleep from sitting stays seated, and sitting from lying sits up', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('sit');
    run(pet, 1);
    pet.act('sleep');
    run(pet, 2);
    expect(pet.pet.prone).toBe(false);
    expect(pet.pet.lieK).toBeLessThan(.01);
    pet.act('lie');
    run(pet, 2);
    pet.act('sit');
    run(pet, 1.5);
    expect(pet.pet.mode).toBe('sit');
    expect(pet.pet.lieK).toBeLessThan(.05);
    expect(pet.pet.sitK).toBeGreaterThan(.95);
  });

  it('a walk gets up at once and arrives', () => {
    const events = [];
    const pet = lying((kind, d) => events.push([kind, d.walkId]));
    pet.walkTo(pet.pet.x - 150, false, 'w1');
    run(pet, .3);
    expect(pet.pet.lieK).toBeLessThan(.1);
    run(pet, 4);
    expect(events).toContainEqual(['arrived', 'w1']);
  });

  it('roaming free, gets bored of lying: dozes off where it lies or gets up', () => {
    const pet = lying();
    pet.pet.dur = .5;
    pet.setRoam('free');
    run(pet, .2);
    expect(['sleep', 'wake']).toContain(pet.pet.mode);
    if (pet.pet.mode === 'sleep') expect(pet.pet.prone).toBe(true);
  });

  it('fidgets now and then, as gestures the body leaves alone', () => {
    const pet = barePet(), frames = [];
    pet.setFigure({ draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    pet.act('lie');
    run(pet, 20);
    const kinds = new Set(frames.map(o => o.gesture?.kind).filter(Boolean));
    expect([...kinds].every(k => ['kick', 'chin', 'thump'].includes(k))).toBe(true);
    expect(kinds.size).toBeGreaterThan(0);
    // still lying, and a fidget is not motion that needs the full frame rate
    expect(pet.pet.mode).toBe('lie');
    expect(frames.at(-1).lie).toBeGreaterThan(.95);
    expect(frames.at(-1).prone).toBe(true);
    expect(pet.moving).toBe(false);
  });

  it('a figure without a lying pose stays seated, with its usual points and hit circle', () => {
    const pet = barePet(), frames = [];
    const anchors = { gaze: [140, 117], tear: [166, 136], z: [196, 40], hearts: [90, 175, 34], bubble: [128, 18], glints: [[50, 30]] };
    pet.setFigure({ draw: (g, face, o) => frames.push(o), anchors });
    run(pet, 1);
    pet.act('lie');
    run(pet, 2);
    const sits = frames.slice(-60).map(o => o.sit);
    expect(Math.min(...sits)).toBeGreaterThan(.95);
    expect(pet.lying).toBe(0);
    expect(pet.hitPet(at(pet, 128, 40))).toBe(true);
    const b = pet.anchor(), want = at(pet, 128, 18 + pet.pet.low);
    expect(Math.hypot(b.x - want.x, b.y - want.y)).toBeLessThan(1);
    expect(pet.bodyBox()).toEqual([20, 12, 236, 256]);
  });

  it('a figure with lying points uses them once down, unless it says the pose cannot show', () => {
    const lie = { z: [230, 100], bubble: [180, 60], hit: [128, 190, 120, 66], halfW: 124 };
    const fig = { draw() {}, anchors: { lie }, poses: { lie: true } };
    const pet = barePet();
    pet.setFigure(fig);
    run(pet, 1);
    pet.act('lie');
    run(pet, 2.5);
    const b = pet.anchor(), want = at(pet, ...lie.bubble);
    expect(Math.hypot(b.x - want.x, b.y - want.y)).toBeLessThan(1);
    expect(pet.lying).toBeGreaterThan(.95);
    expect(pet.bodyBox().map(Math.round)).toEqual([4, 124, 252, 256]);
    expect(pet.hitPet(at(pet, 128, 40))).toBe(false);
    expect(pet.hitPet(at(pet, 30, 200))).toBe(true);
    // sleeping there, the z's start from the lying point (the newest one has hardly moved yet)
    pet.act('sleep');
    run(pet, 1.35);
    const z = pet.toStage(...lie.z);
    const m = [...pet.fxHtml().matchAll(/translate\(([-\d.]+) ([-\d.]+)\)/g)].at(-1);
    expect(m).toBeTruthy();
    expect(Math.hypot(+m[1] - z.x, +m[2] - z.y)).toBeLessThan(3);
    fig.poses.lie = false;
    expect(pet.lying).toBe(0);
    expect(pet.hitPet(at(pet, 128, 40))).toBe(true);
  });

  it('Coo lies flat and draws its paws', () => {
    const svg = figure(FACES.content.f(0, null), { look: [0, 0], legs: STAND, low: 29, t: 0, blink: 0, acc: defaultSkin(), lie: 1 });
    expect(svg).toContain('rotate(9)');
    expect(svg).toContain('stroke-width="24"');
    // the paws rest on the floor in front of the lower tip (about x 190), not hidden under the ring
    const paws = [...svg.match(/stroke-width="24"[^>]*d="([^"]+)"/)[1].matchAll(/M([\d.]+) ([\d.]+)/g)].map(m => [+m[1], +m[2]]);
    expect(paws).toHaveLength(2);
    for (const [x, y] of paws) { expect(x).toBeGreaterThan(190); expect(y + 12).toBe(256); }
    expect(figure(FACES.content.f(0, null), { look: [0, 0], legs: STAND, low: 29, t: 0, blink: 0, acc: defaultSkin() })).not.toContain('rotate(9)');
  });

  it('Coo lying does not rock about her feet for gestures or listening', () => {
    for (const a of ['bow', 'nod', 'peek', 'flinch', 'shake', 'wave', 'listen']) {
      const pet = lying();
      run(pet, 1);
      if (a === 'listen') pet.setListening(true); else pet.act(a);
      let most = 0;
      for (let i = 0; i < 60; i++) { run(pet, 1 / 60); most = Math.max(most, Math.abs(pet.pet.xf.rot)); }
      expect(pet.pet.mode, a).toBe('lie');
      expect(most, a).toBeLessThan(1);
    }
  });

  it('told to stand before it got down, gets up without lying down first', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('lie');
    run(pet, .2);
    pet.act('stand');
    let most = 0;
    for (let i = 0; i < 60; i++) { run(pet, 1 / 60); most = Math.max(most, pet.pet.lieK); }
    expect(most).toBeLessThan(.1);
    run(pet, 2);
    expect(pet.pet.mode).toBe('idle');
  });

  it('a fidget ends when she stops lying', () => {
    const pet = barePet(), frames = [];
    pet.setFigure({ draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    pet.act('lie');
    run(pet, 2);
    pet.pet.fidgetAt = 0;
    run(pet, 1 / 60);
    expect(['kick', 'chin', 'thump']).toContain(pet.pet.pulse?.kind);
    pet.act('sleep');
    expect(pet.pet.pulse).toBeNull();
    run(pet, 1);
    pet.act('lie');
    run(pet, 1);
    pet.pet.fidgetAt = 0;
    run(pet, 1 / 60);
    pet.act('walk');
    run(pet, .2);
    expect(frames.at(-1).gesture).toBeNull();
  });

  it('keeps the wider lying body on screen at the edge, also dozing off as it goes down', () => {
    const pet = barePet();
    run(pet, 1);
    pet.pet.x = pet.bounds.minX;
    pet.act('lie');
    run(pet, .2);
    pet.act('sleep');
    run(pet, 2);
    expect(pet.pet.lieK).toBeGreaterThan(.95);
    expect(pet.pet.x).toBeGreaterThanOrEqual(pet.bounds.minX - .01);
  });

  it('a walk from lying to the screen edge goes as far as one from standing', () => {
    const arrive = (lie) => {
      const events = [];
      const pet = barePet((kind, d) => events.push([kind, d.x]));
      run(pet, 1);
      if (lie) { pet.act('lie'); run(pet, 2); }
      pet.walkTo(0, false, 'w');
      run(pet, 12);
      return events.find(e => e[0] === 'arrived')?.[1];
    };
    expect(arrive(true)).toBe(arrive(false));
  });

  it('a figure without a lying pose moves through lie exactly as through sit', () => {
    const trace = (m) => {
      const pet = barePet(), out = [];
      const anchors = { gaze: [140, 117], tear: [166, 136], z: [196, 40], hearts: [90, 175, 34], bubble: [128, 18], glints: [[50, 30]] };
      pet.setFigure({ draw: (g, face, o) => out.push([o.legs.flat(), o.lean, o.sit, o.low].flat().map(v => Math.round(v * 100) / 100)), anchors });
      run(pet, 1);
      pet.act(m); run(pet, 3);
      pet.act('sleep'); run(pet, 2);
      pet.act('stand'); run(pet, 2);
      pet.act(m); run(pet, 2);
      // a poke gets it up with a start
      const p = pet.toStage(128, 128);
      pet.pointerDown(p); pet.pointerUp(); run(pet, 1);
      return out;
    };
    expect(trace('lie')).toEqual(trace('sit'));
  });

  it("Coo's box lying down keeps her hat in", () => {
    const pet = barePet();
    pet.setSkin({ ...defaultSkin(), head: 'bunny' });
    run(pet, 1);
    pet.act('lie');
    run(pet, 3);
    expect(HEAD_TOP.bunny).toBeLessThan(0);
    // the ear tips lying reach about y 39
    expect(pet.bodyBox()[1]).toBeLessThan(39);
  });
});

describe('a roll, a cup and a book', () => {
  /** A bare pet whose group transform is kept, to see the roll's turn. */
  function rollPet(x = 300) {
    const attrs = {}, sfx = new Proxy({}, { get: () => () => {} });
    const petG = { setAttribute(k, v) { attrs[k] = v; }, innerHTML: '' }, el = () => ({ setAttribute() {}, innerHTML: '' });
    const pet = createPet({ petG, shadowEl: el(), fxG: el() }, { sfx, roam: 'off', startX: x, bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
    pet.resize();
    pet.turnOf = () => +(attrs.transform.match(/^rotate\(([-\d.]+) /)?.[1] ?? 0);
    pet.petHtml = () => petG.innerHTML;
    return pet;
  }

  it('rolls once round on the floor, one turn of the way along, and is up again where it stopped', () => {
    const pet = rollPet(300);
    run(pet, 1);
    pet.pet.facing = 1;
    expect(pet.act('roll')).toBe(true);
    const x0 = pet.pet.x, turns = [];
    for (let i = 0; i < 90; i++) { pet.step(1 / 60); pet.render(); turns.push(pet.turnOf()); }
    expect(pet.pet.x - x0).toBeCloseTo(ROLL_D * .42, 0);
    // turning the way it goes (clockwise, going right), all the way round and no further
    for (let i = 1; i < turns.length; i++) expect(turns[i]).toBeGreaterThanOrEqual(turns[i - 1] - 1e-6);
    expect(Math.max(...turns)).toBeGreaterThan(355);
    run(pet, 1);
    expect(pet.pet.mode).toBe('idle');
    expect(pet.pet.pulse).toBeNull();
    expect(pet.turnOf()).toBe(0);
  });

  it('turns round first when there is more room behind than ahead, and stays on screen', () => {
    const pet = rollPet(1100);
    run(pet, 1);
    pet.pet.facing = 1;
    pet.act('roll');
    expect(pet.pet.facing).toBe(-1);
    run(pet, 2);
    expect(pet.pet.x).toBeLessThan(1100 - ROLL_D * .42 + 1);
    expect(pet.pet.x).toBeGreaterThan(0);
  });

  it('takes no other order mid-roll, but a pick-up ends it', () => {
    const pet = rollPet();
    run(pet, 1);
    pet.act('roll');
    run(pet, .5);
    expect(pet.busy()).toBe(true);
    expect(pet.act('nod')).toBe(false);
    expect(pet.pet.pulse.kind).toBe('roll');
    const p = pet.toStage(128, 128);
    expect(pet.pointerDown(p)).toBe(true);
    pet.pointerMove({ x: p.x + 20, y: p.y - 20 });
    expect(pet.pet.mode).toBe('drag');
    expect(pet.pet.pulse).toBeNull();
    pet.pointerUp();
  });

  it("Coo's paws hold a cup or a book for the gesture, and nothing after", () => {
    for (const [m, sound] of [['sip', 'sip'], ['read', 'page']]) {
      expect(SOUND_KINDS.move).toContain(sound);
      const pet = barePet();
      run(pet, 1);
      const before = pet.petHtml().length;
      pet.act(m);
      run(pet, 1.5);
      expect(pet.pet._fname, m).toBe(m === 'sip' ? 'sipping' : 'reading');
      expect(pet.petHtml().length, m).toBeGreaterThan(before + 200);
      run(pet, 4);
      expect(pet.pet.pulse, m).toBeNull();
      expect(Math.abs(pet.petHtml().length - before), m).toBeLessThan(200);
    }
  });

  it('reading, the eyes run along a line and back, looking down', () => {
    const xs = [], ys = [];
    for (let t = 0; t < 3; t += .05) { const [x, y] = FACES.reading.f(t).lookAt; xs.push(x); ys.push(y); }
    expect(Math.min(...ys)).toBeGreaterThan(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
  });
});

describe('a gentle smile, an awkward one and a giggle', () => {
  it('each has its own face sound, silenced with the other face sounds', () => {
    for (const [face, sound] of [['gentle', 'soft'], ['awkward', 'wry'], ['giggle', 'hehe']]) {
      expect(SOUND_KINDS.face, face).toContain(sound);
      const played = [];
      const sfx = createSfx({ storageKey: 'test.sfx' });
      sfx.configure({ kinds: { face: false } });
      const orig = sfx[sound];
      expect(typeof orig).toBe('function');
      sfx[sound] = () => played.push(sound);
      sfx.expr(face);
      expect(played, face).toEqual([]);
      sfx.configure({ kinds: { face: true } });
      sfx.expr(face);
      expect(played, face).toEqual([sound]);
    }
  });

  it('gentle nods slowly soon after it comes in and again within the usual 3.2 s hold, still between', () => {
    const lean = s => FACES.gentle.f(10 + s, { exprAt: 10 }).lean;
    expect(lean(.8)).toBeGreaterThan(5);
    expect(Math.abs(lean(1.8))).toBeLessThan(1e-9);
    expect(lean(3)).toBeGreaterThan(5);
    // held the default time by the pet, both nods show
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('gentle');
    const leans = [];
    for (let i = 0; i < 3.2 * 60; i++) { pet.step(1 / 60); pet.render(); leans.push(pet.pet._fname === 'gentle' ? pet.pet.lean : 0); }
    const peaks = leans.filter((v, i) => i > 0 && i < leans.length - 1 && v > 3 && v >= leans[i - 1] && v > leans[i + 1]);
    expect(peaks.length).toBe(2);
  });

  it('a giggle shakes in fits: hard at first, then quiet until the next fit', () => {
    const titter = s => FACES.giggle.f(10 + s, { exprAt: 10 }).titter;
    const peak = (a, b) => { let m = 0; for (let s = a; s < b; s += .01) m = Math.max(m, titter(s)); return m; };
    expect(peak(0, .7)).toBeGreaterThan(.8);
    expect(peak(.71, 1.59)).toBeLessThan(1e-9);
    expect(peak(1.6, 2.3)).toBeGreaterThan(.8);
  });

  it("hands a figure the giggle's shaking in its face, and bobs Coo's ring with it", () => {
    const pet = barePet(), faces = [];
    run(pet, 1);
    pet.setExpr('giggle');
    const sq = [];
    for (let i = 0; i < 40; i++) { pet.step(1 / 60); pet.render(); sq.push(pet.pet.sq); }
    expect(Math.max(...sq) - Math.min(...sq)).toBeGreaterThan(.01);
    pet.setFigure({ draw: (g, face) => faces.push(face) });
    pet.setExpr('giggle');
    run(pet, .5);
    expect(Math.max(...faces.map(f => f.titter || 0))).toBeGreaterThan(.5);
  });
});

describe("a whale's spout", () => {
  /** The spray beads drawn now, as [x, y] on the stage. */
  const beads = pet => [...pet.fxHtml().matchAll(/<circle fill="#cdeeff"[^>]*cx="([-\d.]+)" cy="([-\d.]+)"/g)].map(m => [+m[1], +m[2]]);

  it('throws spray up from the top of the head, which falls back to the floor and is gone', () => {
    const pet = barePet();
    run(pet, 1);
    expect(pet.act('spout')).toBe(true);
    expect(SOUND_KINDS.move).toContain('spout');
    run(pet, .2);
    expect(pet.fxHtml()).not.toContain('#cdeeff');
    run(pet, .55);
    // the column and the first beads, above the head
    const head = pet.toStage(...[128, 30]);
    const b = beads(pet);
    expect(b.length).toBeGreaterThan(3);
    for (const [, y] of b) expect(y).toBeLessThan(head.y + 1);
    run(pet, 2.5);
    expect(beads(pet)).toEqual([]);
    expect(pet.pet.pulse).toBeNull();
  });

  it("starts from a figure's own spout spot, under its bubble spot if it names none, and from the lying head when down", () => {
    const firstX = anchors => {
      const pet = barePet();
      pet.setFigure({ anchors, draw() {} });
      run(pet, 1);
      pet.act('spout');
      run(pet, .52);
      return beads(pet)[0];
    };
    const own = firstX({ spout: [60, 100] }), none = firstX({ bubble: [200, 40] });
    expect(own[0]).toBeLessThan(none[0] - 40);
    const pet = barePet();
    run(pet, 1);
    pet.act('lie');
    run(pet, 3);
    pet.act('spout');
    run(pet, .52);
    const lyingHead = pet.toStage(150, 88);
    expect(Math.abs(beads(pet)[0][0] - lyingHead.x)).toBeLessThan(30);
  });
});

describe('a sigh, happy tears and turning to stone', () => {
  it('a sigh draws a breath, then breathes out with drooping eyes and a "ha", and the face is plain once it is over', () => {
    expect(SOUND_KINDS.move).toContain('sigh');
    const pet = barePet();
    run(pet, 1);
    expect(pet.act('sigh')).toBe(true);
    run(pet, .3);
    let fc = FACES.sighing.f(pet.pet.pulse.t0 + .3, pet.pet);
    expect(fc.eyes[0].shape).toBe('ring');
    expect(fc.puff ?? 0).toBe(0);
    fc = FACES.sighing.f(pet.pet.pulse.t0 + 1.2, pet.pet);
    expect(fc.eyes[0].shape).toBe('lid');
    expect(fc.puff).toBeGreaterThan(.5);
    // something else cuts it short: no drooping face left over
    pet.act('nod');
    expect(FACES.sighing.f(pet.pet.pulse.t0 + .1, pet.pet).puff ?? 0).toBe(0);
  });

  it('happy tears drop slower than crying, with thin tracks on Coo', () => {
    const tears = face => {
      const pet = barePet();
      run(pet, 1);
      pet.setExpr(face, 6);
      let n = 0;
      for (let i = 0; i < 5 * 60; i++) { pet.step(1 / 60); pet.render(); n = Math.max(n, (pet.fxHtml().match(/class="tearf"/g) || []).length); }
      return { n, html: pet.petHtml() };
    };
    const moved = tears('moved'), cry = tears('cry');
    expect(moved.n).toBeGreaterThan(0);
    expect(moved.n).toBeLessThan(cry.n);
    const op = h => +h.match(/class="tearf" opacity="([\d.]+)"/)[1];
    expect(op(moved.html)).toBeLessThan(op(cry.html));
  });

  it('turned to stone does not turn round to the pointer behind it', () => {
    const pet = barePet();
    run(pet, 1);
    pet.pet.facing = 1;
    pet.setExpr('petrify');
    run(pet, .4);
    const p = pet.toStage(128, 128);
    pet.pointerMove({ x: p.x - 200, y: p.y });
    run(pet, 1.5);
    expect(pet.pet.facing).toBe(1);
  });

  it('turned to stone holds still without blinking, cracks once, and thaws before the face ends', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('walk');
    run(pet, .3);
    pet.setExpr('petrify');
    expect(pet.pet.mode).toBe('idle');
    run(pet, .5);
    const at = s => FACES.petrify.f(pet.pet.exprAt + s, pet.pet);
    expect(at(1).freeze).toBe(true);
    expect(at(1).stone).toBeCloseTo(1, 5);
    expect(at(.1).freeze).toBe(false);
    expect(at(3.15).stone).toBeLessThan(.2);
    expect(at(3.15).freeze).toBe(false);
    // frozen: no blink, the gaze held; the crack knocks chips off as it starts (about 1.1 s in)
    const look = [...pet.pet.look], blinks = [];
    let chips = 0;
    for (let i = 0; i < 90; i++) {
      pet.step(1 / 60); pet.render(); blinks.push(pet.pet.blinkAge);
      chips = Math.max(chips, (pet.fxHtml().match(/fill="#c9ccd4"/g) || []).length);
    }
    // (no new blink starts: the blink clock only runs on)
    for (let i = 1; i < blinks.length; i++) expect(blinks[i]).toBeGreaterThan(blinks[i - 1]);
    expect(pet.pet.look).toEqual(look);
    expect(chips).toBe(5);
    // asked again while stone, she stays as she is: no colour flash, no second crack
    const at0 = pet.pet.exprAt;
    pet.setExpr('petrify');
    expect(pet.pet.exprAt).toBe(at0);
    run(pet, 3);
    expect(pet.fxHtml()).not.toContain('#c9ccd4');
    expect(SOUND_KINDS.face).toContain('crack');
  });
});

describe('pleading, a scratch at the head, an idea, hands on hips and a hug', () => {
  it('hands on hips keeps the face she already had, or looks determined', () => {
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('angry');
    run(pet, .3);
    pet.act('hips');
    run(pet, .5);
    expect(pet.pet._fname).toBe('angry');
    run(pet, 4);
    pet.act('hips');
    run(pet, .3);
    expect(pet.pet._fname).toBe('determined');
  });

  it('an idea lights one bulb over the head, which fades', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('idea');
    let most = 0;
    for (let i = 0; i < 90; i++) { pet.step(1 / 60); pet.render(); most = Math.max(most, (pet.fxHtml().match(/fill="#ffe14d"/g) || []).length); }
    expect(most).toBe(1);
    expect(SOUND_KINDS.move).toContain('ding');
    run(pet, 1.5);
    expect(pet.fxHtml()).not.toContain('#ffe14d');
  });

  it('each plays out and ends with the body free again', () => {
    for (const m of ['pray', 'scratch', 'idea', 'hips', 'hug']) {
      const pet = barePet();
      run(pet, 1);
      expect(pet.act(m), m).toBe(true);
      expect(pet.pet.pulse.kind, m).toBe(m);
      run(pet, 3);
      expect(pet.pet.pulse, m).toBeNull();
    }
  });
});
