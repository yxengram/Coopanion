import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBody, createPet, FACES, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_FACES, PLUS_MOTIONS, ROLL_D, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { cooFigure, defaultSkin, figure, HEAD_TOP } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { createSfx, EXPR_TONES, OWN_PACKS, SOUND_KINDS } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { readLayout, touchGate } from '../packages/cortico-world-desktop-pet/web/body-host.js';

const PKG = new URL('../packages/cortico-world-desktop-pet/', import.meta.url);
const vocabOf = (pack) => JSON.parse(readFileSync(new URL(`web/${pack}/figure.json`, PKG), 'utf8')).vocab;
const BOUNDS = () => ({ W: 1200, H: 400, floorY: 380, S: .42 });

/**
 * A pet with no page under it: the elements and the sound only take calls. It is Coo as our app has her, the kit's
 * plus body; `opts` may say otherwise (`plus: false` is the kit as any other pack knows it).
 */
function barePet(onEvent, opts = {}) {
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const sfx = { play() {} };
  const fxG = el(), petG = el();
  const pet = createPet({ petG, shadowEl: el(), fxG }, { sfx, onEvent, figure: cooFigure(), skin: defaultSkin(), plus: true, roam: 'off', bounds: BOUNDS, ...opts });
  pet.resize();
  // the particles' and Coo's markup, as last drawn
  pet.fxHtml = () => fxG.innerHTML;
  pet.petHtml = () => petG.innerHTML;
  return pet;
}
/** A bare pet whose sounds are kept as [name, kind] in `pet.heard`. */
function hearingPet(opts = {}) {
  const heard = [];
  const pet = barePet(undefined, { sfx: { play: (name, kind) => heard.push([name, kind]) }, ...opts });
  pet.heard = heard;
  return pet;
}
const run = (pet, seconds) => { for (let i = 0; i < seconds * 60; i++) { pet.step(1 / 60); pet.render(); } };
const eyesIn = html => (html.match(/class="eye"/g) || []).length;
/** Runs `fn` with Math.random drawn from a fixed seed (mulberry32), so a free-roaming pet does the same each time. */
function seeded(fn, seed = 7) {
  const real = Math.random;
  let a = seed;
  Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = real; }
}
/** An audio context that only counts what is made in it: voices (a tone's oscillator or a noise's source) and fades (a hush). */
function countingCtx() {
  const made = { voices: 0, fades: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() { made.fades++; }, setTargetAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: {} });
  const ctx = {
    currentTime: 0, state: 'running', sampleRate: 8, destination: {},
    createGain: node, createDynamicsCompressor: node, createBiquadFilter: node,
    createOscillator() { made.voices++; return node(); },
    createBufferSource() { made.voices++; return node(); },
    createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
  };
  return { ctx, made };
}

describe('the words the model can use', () => {
  it('Coo and the whale do every word of their vocabularies on the kit, and the kit does no word they leave out', () => {
    for (const pack of ['coo', 'whale']) {
      const words = (kind) => vocabOf(pack).filter((v) => v.kind === kind).map((v) => v.id).sort();
      // both know the kit's words and the plus body's
      expect(words('expression'), pack).toEqual([...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS].sort());
      expect(words('motion'), pack).toEqual([...KIT_MOTIONS, ...PLUS_MOTIONS].sort());
    }
  });

  it('Claude-chan knows the same words but spout (she has no blowhole)', () => {
    const words = (kind) => vocabOf('claude-chan').filter((v) => v.kind === kind).map((v) => v.id).sort();
    expect(words('expression')).toEqual([...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS].sort());
    expect(words('motion')).toEqual([...KIT_MOTIONS, ...PLUS_MOTIONS].filter((w) => w !== 'spout').sort());
  });

  it('every expression has a face Coo can draw, the plus ones too', () => {
    for (const n of [...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS]) {
      const fc = (PLUS_FACES[n] ?? FACES[n]).f(.5);
      expect(fc.eyes).toHaveLength(2);
      expect(figure(fc, { look: fc.lookAt || [0, 0], legs: STAND, low: 0, t: .5, blink: 0, acc: defaultSkin() })).toContain('class="eye"');
    }
  });

  it('every motion is one the body takes, and plays out without getting stuck', () => {
    for (const m of [...KIT_MOTIONS, ...PLUS_MOTIONS]) {
      const pet = barePet();
      run(pet, 1);
      expect(pet.doWord(m), m).toBe(true);
      run(pet, 5);
      // everything but sitting, sleeping and lying ends back on its feet
      if (m !== 'sit' && m !== 'sleep' && m !== 'lie' && m !== 'kneel' && m !== 'walk' && m !== 'run') expect(pet.pet.mode, m).toBe('idle');
    }
  });

  it('sitting, sleeping, lying and kneeling last until asked to stand, then end on its feet', () => {
    for (const m of ['sit', 'sleep', 'lie', 'kneel']) {
      const pet = barePet();
      run(pet, 1);
      pet.act(m);
      run(pet, 6);
      expect(pet.pet.mode, m).toBe(m === 'kneel' ? 'sit' : m);
      pet.act('stand');
      run(pet, 2.5);
      expect(pet.pet.mode, m).toBe('idle');
    }
  });

  it('a walk asked for as a word reports done once it stops, so the next word need not wait out its seconds', () => {
    const events = [];
    const pet = barePet((kind, d) => events.push([kind, d.word]));
    run(pet, 1);
    pet.doWord('walk');
    run(pet, 12);
    expect(events).toContainEqual(['done', 'walk']);
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
    // the body files them as motion sounds
    for (const m of ['peek', 'flinch', 'shiver', 'away']) {
      const pet = hearingPet();
      run(pet, 1);
      pet.act(m);
      expect(pet.heard, m).toContainEqual([m, 'move']);
    }
    // look and peek borrow the 'hmm' tone and away the 'huff', which belong to no kind: count the voices made to see whether they played
    const { ctx, made } = countingCtx();
    const sfx = createSfx({ ctx });
    sfx.configure({ kinds: { move: false } });
    for (const n of ['look', 'peek', 'away']) sfx.play(n, 'move');
    expect(made.voices).toBe(0);
    sfx.configure({ kinds: { move: true, face: false } });
    for (const n of ['look', 'peek', 'away']) {
      const before = made.voices;
      sfx.play(n, 'move');
      expect(made.voices, n).toBeGreaterThan(before);
    }
  });

  it("a pack's own expression borrows a kit face's marks, and its own motion is a gesture its figure draws", () => {
    // `salute` is a plus word too: the pack's own word of that name wins, with or without plus
    for (const plus of [false, true]) {
      const frames = [];
      const pet = barePet(undefined, { plus, words: { facepalm: { expression: { like: 'worried' } }, salute: { motion: { seconds: 1.2 } } } });
      pet.setFigure({ draw: (g, face, o) => frames.push({ face, o }) });
      run(pet, 1);
      expect(pet.doWord('facepalm')).toBe(true);
      run(pet, .2);
      expect(frames.at(-1).o.face).toBe('facepalm');
      expect(frames.at(-1).face.sweat).toBe(true);
      expect(pet.doWord('salute')).toBe(true);
      run(pet, .5);
      expect(frames.at(-1).o.gesture.kind).toBe('salute');
      // the pack's gesture, not ours: no serious salute face, and it is over at its own 1.2 s
      expect(frames.at(-1).o.face, String(plus)).not.toBe('saluting');
      run(pet, .8);
      expect(frames.at(-1).o.gesture, String(plus)).toBeNull();
      expect(pet.doWord('fly')).toBe(false);
    }
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
      const pet = barePet();
      pet.setFigure({ anchors, draw() {} });
      run(pet, 1);
      pet.setExpr('happy');
      run(pet, .2);
      const ys = [...pet.fxHtml().matchAll(/stroke="#e0a100"[^>]*translate\([-\d.]+ ([-\d.]+)\)/g)].map(m => +m[1]);
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
  function rollPet(x = 300, bounds = BOUNDS, opts = {}) {
    const attrs = {}, sfx = { play() {} };
    const petG = { setAttribute(k, v) { attrs[k] = v; }, innerHTML: '' }, el = () => ({ setAttribute() {}, innerHTML: '' });
    // Coo, with the frames' gestures kept
    const fig = cooFigure(), draw = fig.draw, gestures = [];
    fig.draw = (g, face, o) => { gestures.push(o.gesture); draw.call(fig, g, face, o); };
    const pet = createPet({ petG, shadowEl: el(), fxG: el() }, { sfx, figure: fig, skin: defaultSkin(), plus: true, roam: 'off', startX: x, bounds, ...opts });
    pet.resize();
    pet.turnOf = () => +(attrs.transform.match(/^rotate\(([-\d.]+) /)?.[1] ?? 0);
    // the spin's drop: 26 * S while the ring is down on the floor, less while it is off it
    pet.dropOf = () => +(attrs.transform.match(/^rotate\([^)]*\) translate\(0 ([-\d.]+)\)/)?.[1] ?? 0);
    pet.transform = () => attrs.transform;
    pet.petHtml = () => petG.innerHTML;
    pet.gestures = gestures;
    return pet;
  }
  /** A stage `W` wide (the body is 2 * (104 * .42 + 8) ≈ 103 across, standing). */
  const narrow = W => () => ({ ...BOUNDS(), W });
  /**
   * Rolls `pet` (already facing the way wanted) and checks the ring never slides: while it is down on the floor it
   * turns exactly as far as it goes (a turn of 360° is ROLL_D). Returns the frames' { x, a, drop, down, travel }.
   */
  function rollWatched(pet) {
    expect(pet.act('roll')).toBe(true);
    const S = .42, out = [];
    for (let i = 0; i < 100; i++) {
      pet.step(1 / 60); pet.render();
      const drop = pet.dropOf();
      out.push({ x: pet.pet.x, a: pet.turnOf(), drop, down: drop >= 26 * S - .1, travel: pet.gestures.at(-1)?.travel });
    }
    let slid = 0;
    for (let i = 1; i < out.length; i++) {
      const [p, q] = [out[i - 1], out[i]];
      if (!p.down || !q.down) continue;
      const turned = (q.a - p.a) / 360 * ROLL_D * S, went = q.x - p.x;
      slid += Math.abs(turned - went);
      expect(Math.abs(turned - went), `frame ${i}`).toBeLessThan(.25);
    }
    expect(slid).toBeLessThan(2);
    return out;
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

  it('a full roll tells the figure it went the whole way, and the ring rolls it without sliding', () => {
    const pet = rollPet(300);
    run(pet, 1);
    pet.pet.facing = 1;
    const x0 = pet.pet.x, out = rollWatched(pet);
    expect(out[0].travel).toBeCloseTo(ROLL_D, 6);
    expect((pet.pet.x - x0) / .42).toBeCloseTo(ROLL_D, 1);
    // all the way on the floor: no hop
    expect(out.filter(o => o.a > 1 && o.a < 359).every(o => o.down)).toBe(true);
  });

  it('near an edge it rolls as far as there is room: the frame says how far, the ring hops for the rest of its turn', () => {
    // 400 wide: 148 px each way from the middle, short of the 264 px a roll goes
    const pet = rollPet(200, narrow(400));
    run(pet, 1);
    pet.pet.facing = 1;
    const x0 = pet.pet.x, out = rollWatched(pet);
    const travel = out[0].travel;
    expect(travel).toBeGreaterThan(300);
    expect(travel).toBeLessThan(ROLL_D * .6);
    // what the frame said is how far she went (the way she faces)
    expect((pet.pet.x - x0) / .42).toBeCloseTo(travel, 1);
    expect(pet.pet.x).toBeCloseTo(400 - 104 * .42 - 8, 6);
    // the ring still turns once, ending upright, but off the floor for part of it
    expect(Math.max(...out.map(o => o.a))).toBeGreaterThan(355);
    expect(out.some(o => !o.down && o.a > 1 && o.a < 359)).toBe(true);
    run(pet, 1);
    expect(pet.turnOf()).toBe(0);
    expect(pet.pet.pulse).toBeNull();
  });

  it('with no room either way she flips on the spot, the ring off the floor', () => {
    const W = 2 * (104 * .42 + 8) + .2;
    const pet = rollPet(W / 2, narrow(W));
    run(pet, 1);
    const x0 = pet.pet.x, out = rollWatched(pet);
    expect(Math.abs(out[0].travel)).toBeLessThan(.5);
    expect(Math.abs(pet.pet.x - x0)).toBeLessThan(.2);
    expect(Math.max(...out.map(o => Math.abs(o.a)))).toBeGreaterThan(355);
    // up off the floor as it turns: by 46 * S at the top (less the 26 * S it drops by), never down mid-turn
    expect(Math.min(...out.map(o => o.drop))).toBeCloseTo(-20 * .42, 0);
    expect(out.some(o => o.down && Math.abs(o.a) > 5 && Math.abs(o.a) < 355)).toBe(false);
  });

  it('off the edge it is facing (no room ahead, less than zero), she turns round and rolls the room behind, no slide', () => {
    for (const [W, full] of [[1200, true], [300, false]]) {
      const pet = rollPet(W / 2, narrow(W));
      run(pet, 1);
      const max0 = W - 104 * .42 - 8, min0 = 104 * .42 + 8;
      pet.pet.x = max0 + 5; pet.pet.facing = 1;
      const out = rollWatched(pet);
      expect(pet.pet.facing, String(W)).toBe(-1);
      // the push back on screen comes before the turn and is not counted
      const want = full ? ROLL_D : (max0 - min0) / .42;
      expect(out[0].travel, String(W)).toBeCloseTo(want, 6);
      expect((max0 - pet.pet.x) / .42, String(W)).toBeCloseTo(want, 1);
      expect(Math.min(...out.map(o => o.a)), String(W)).toBeLessThan(-355);
    }
  });

  it('the frame carries no travel for any other gesture, nor for a pack word named roll', () => {
    const pet = rollPet(300, BOUNDS, { words: { roll: { motion: { seconds: 1.5 } } } });
    run(pet, 1);
    pet.act('nod');
    run(pet, .3);
    expect(Object.keys(pet.gestures.at(-1))).toEqual(['kind', 'k']);
    run(pet, 2);
    expect(pet.doWord('roll')).toBe(true);
    run(pet, .5);
    expect(pet.gestures.at(-1)).toMatchObject({ kind: 'roll' });
    expect(Object.keys(pet.gestures.at(-1))).toEqual(['kind', 'k']);
    expect(pet.transform().startsWith('rotate')).toBe(false);
  });

  it("without plus, a pack's roll draws as with upstream's kit (v0.1.17): the same gestures and group, frame by frame", async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const dir = mkdtempSync(join(tmpdir(), 'upstream-kit-'));
    try {
      for (const f of ['body.js', 'rig.js']) {
        writeFileSync(join(dir, f), execFileSync('git', ['show', `v0.1.17:packages/cortico-world-desktop-pet/web/kit/${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      }
    } catch { return; } // a shallow checkout may lack the tag
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const up = await import(pathToFileURL(join(dir, 'body.js')).href);
    const ours = await import('../packages/cortico-world-desktop-pet/web/kit/body.js');
    const frames = (kit, W) => seeded(() => {
      const log = [], el = () => ({ setAttribute() {}, innerHTML: '' });
      const petG = { setAttribute(k, v) { log.push(v); }, innerHTML: '' };
      const fig = { draw(g, face, o) { log.push(JSON.stringify(o.gesture)); } };
      const pet = kit.createPet({ petG, shadowEl: el(), fxG: el() }, {
        sfx: { play() {} }, figure: fig, plus: false, roam: 'off', startX: W - 60, words: { roll: { motion: { seconds: 1.5 } } },
        bounds: () => ({ W, H: 400, floorY: 380, S: .42 }),
      });
      pet.resize();
      for (const w of ['roll', 'nod', 'jump', 'roll']) { pet.doWord(w); run(pet, 2); }
      return log;
    }, 3);
    for (const W of [1200, 300, 104]) {
      const a = frames(ours, W), b = frames(up, W);
      expect(a.length, String(W)).toBe(b.length);
      expect(a.some(s => s.includes('"roll"')), String(W)).toBe(true);
      expect(a.findIndex((s, i) => s !== b[i]), String(W)).toBe(-1);
    }
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
    for (let t = 0; t < 3; t += .05) { const [x, y] = PLUS_FACES.reading.f(t).lookAt; xs.push(x); ys.push(y); }
    expect(Math.min(...ys)).toBeGreaterThan(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
  });
});

describe('a gentle smile, an awkward one and a giggle', () => {
  it('each has its own face sound, silenced with the other face sounds', () => {
    for (const [face, sound] of [['gentle', 'soft'], ['awkward', 'wry'], ['giggle', 'hehe']]) {
      expect(SOUND_KINDS.face, face).toContain(sound);
      expect(EXPR_TONES[face], face).toBe(sound);
      // the body asks for it as a face sound
      const pet = hearingPet();
      run(pet, 1);
      pet.setExpr(face);
      expect(pet.heard, face).toContainEqual([sound, 'face']);
      const { ctx, made } = countingCtx();
      const sfx = createSfx({ ctx });
      sfx.configure({ kinds: { face: false } });
      sfx.expr(face); sfx.play(sound, 'face');
      expect(made.voices, face).toBe(0);
      sfx.configure({ kinds: { face: true } });
      sfx.expr(face);
      expect(made.voices, face).toBeGreaterThan(0);
    }
  });

  it('gentle nods slowly soon after it comes in and again within the usual 3.2 s hold, still between', () => {
    const lean = s => PLUS_FACES.gentle.f(10 + s, { exprAt: 10 }).lean;
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
    const titter = s => PLUS_FACES.giggle.f(10 + s, { exprAt: 10 }).titter;
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
    let fc = PLUS_FACES.sighing.f(pet.pet.pulse.t0 + .3, pet.pet);
    expect(fc.eyes[0].shape).toBe('ring');
    expect(fc.puff ?? 0).toBe(0);
    fc = PLUS_FACES.sighing.f(pet.pet.pulse.t0 + 1.2, pet.pet);
    expect(fc.eyes[0].shape).toBe('lid');
    expect(fc.puff).toBeGreaterThan(.5);
    // something else cuts it short: no drooping face left over
    pet.act('nod');
    expect(PLUS_FACES.sighing.f(pet.pet.pulse.t0 + .1, pet.pet).puff ?? 0).toBe(0);
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
    const at = s => PLUS_FACES.petrify.f(pet.pet.exprAt + s, pet.pet);
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
    // a motion's own face still showing is not kept (a startled flinch), and a kept expression goes on, not restarted
    pet.act('flinch');
    run(pet, 1);
    pet.act('hips');
    run(pet, .2);
    expect(pet.pet._fname).toBe('determined');
    run(pet, 3);
    pet.setExpr('nervous');
    run(pet, 1);
    const at = pet.pet.exprAt;
    pet.act('hips');
    expect(pet.pet.exprAt).toBe(at);
    expect(pet.pet.expr).toBe('nervous');
  });

  it("hands on hips' swish is a motion sound, muted with them", () => {
    expect(SOUND_KINDS.move).toContain('hips');
    const pet = hearingPet();
    run(pet, 1);
    pet.act('hips');
    expect(pet.heard).toContainEqual(['hips', 'move']);
    // it borrows the 'huff' tone, which belongs to no kind
    const { ctx, made } = countingCtx();
    const sfx = createSfx({ ctx });
    sfx.configure({ kinds: { move: false } });
    sfx.play('hips', 'move');
    expect(made.voices).toBe(0);
    sfx.configure({ kinds: { move: true } });
    sfx.play('hips', 'move');
    expect(made.voices).toBeGreaterThan(0);
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

describe('coaxing, a song, serving tea, a salute and a V sign', () => {
  it('coaxing rocks side to side with a cat mouth and a heart every 1.2 s', () => {
    const fc = PLUS_FACES.coax.f(1);
    expect(fc.cat).toBe(true);
    expect(fc.emitEvery).toBeCloseTo(1.2);
    const rocks = [0, .5, 1, 1.5].map(t => PLUS_FACES.coax.f(t).rock);
    expect(Math.max(...rocks) - Math.min(...rocks)).toBeGreaterThan(1);
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('coax');
    const tilts = [];
    for (let i = 0; i < 90; i++) { pet.step(1 / 60); pet.render(); tilts.push(pet.pet.tilt); }
    expect(Math.max(...tilts) - Math.min(...tilts)).toBeGreaterThan(4);
  });

  it('a song spreads rings and notes, and stops when someone starts talking to her', () => {
    expect(SOUND_KINDS.move).toContain('song');
    const pet = barePet();
    run(pet, 1);
    expect(pet.act('song')).toBe(true);
    let rings = 0;
    for (let i = 0; i < 90; i++) { pet.step(1 / 60); pet.render(); rings = Math.max(rings, (pet.fxHtml().match(/A[\d.]+ [\d.]+ 0 0 [01]/g) || []).length); }
    expect(rings).toBeGreaterThan(0);
    pet.setListening(true);
    run(pet, .1);
    expect(pet.pet.pulse).toBeNull();
    expect(pet.act('song')).toBe(false);
    pet.setListening(false);
  });

  it('a song ends once she walks off, lies down or is picked up, and is not sung asleep; its tune is hushed', () => {
    const hushed = [];
    const pet = barePet(undefined, { sfx: { play: (n, kind) => { if (n.startsWith('stop:')) hushed.push([n, kind]); } } });
    run(pet, 1);
    pet.act('song');
    run(pet, .5);
    pet.walkTo(100, false, 'w');
    run(pet, .1);
    expect(pet.pet.pulse).toBeNull();
    expect(hushed).toEqual([['stop:song', 'move']]);
    run(pet, 4);
    pet.act('sleep');
    run(pet, 1);
    expect(pet.act('song')).toBe(false);
    pet.act('sit');
    run(pet, 1);
    expect(pet.act('song')).toBe(true);
  });

  it("hushing the song fades out what is left of its tune, and only the song's", () => {
    const { ctx, made } = countingCtx();
    const sfx = createSfx({ ctx });
    sfx.play('stop:song', 'move');
    expect(made.fades).toBe(0);
    sfx.play('song', 'move');
    expect(made.voices).toBeGreaterThan(0);
    sfx.play('stop:song', 'move');
    expect(made.fades).toBeGreaterThan(0);
    // once hushed there is nothing left to cut, and a stop is no sound of its own, muted or not
    const fades = made.fades, voices = made.voices;
    sfx.configure({ kinds: { move: false } });
    sfx.play('stop:song', 'move');
    expect(made).toMatchObject({ fades, voices });
  });

  it('a salute looks serious with the hand up and winks as it comes down', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('salute');
    const at = k => PLUS_FACES.saluting.f(pet.pet.pulse.t0 + k * pet.pet.pulse.dur, pet.pet);
    expect(at(.4).brows).toBe('angry');
    expect(at(.9).eyes[1].shape).toBe('up');
  });

  it('each plays out and ends with the body free again, with its own motion sound', () => {
    for (const [m, sound] of [['serve', 'clink'], ['salute', 'snap'], ['vsign', 'cheese']]) {
      expect(SOUND_KINDS.move, m).toContain(sound);
      const pet = barePet();
      run(pet, 1);
      expect(pet.act(m), m).toBe(true);
      run(pet, 3);
      expect(pet.pet.pulse, m).toBeNull();
    }
  });
});

describe('pointing, giggling behind a hand, arms crossed, a stretch and a curtsy', () => {
  it('each plays out and ends with the body free again', () => {
    for (const m of ['point', 'cover', 'cross', 'stretch', 'curtsy']) {
      const pet = barePet();
      run(pet, 1);
      expect(pet.act(m), m).toBe(true);
      expect(pet.pet.pulse.kind, m).toBe(m);
      run(pet, 3);
      expect(pet.pet.pulse, m).toBeNull();
    }
  });

  it('a curtsy from sitting stands up for it', () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('sit');
    run(pet, 1.5);
    pet.act('curtsy');
    expect(pet.pet.mode).toBe('idle');
    run(pet, 1);
    expect(pet.pet.sitK).toBeLessThan(.2);
  });

  it('arms crossed keeps an asked-for face, or pouts', () => {
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('smug');
    run(pet, .3);
    pet.act('cross');
    run(pet, .3);
    expect(pet.pet._fname).toBe('smug');
    run(pet, 4);
    pet.act('cross');
    run(pet, .3);
    expect(pet.pet._fname).toBe('pout');
  });
});

describe('kneeling, a cheeky tongue, talking mouths', () => {
  it('kneeling is a sit that tells the figure so, and ends when she gets up or just sits', () => {
    const frames = [];
    const pet = barePet();
    pet.setFigure({ draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    pet.act('kneel');
    run(pet, 1);
    expect(pet.pet.mode).toBe('sit');
    expect(frames.at(-1).kneel).toBe(true);
    pet.act('sit');
    run(pet, .1);
    expect(frames.at(-1).kneel).toBe(false);
    pet.act('kneel');
    run(pet, .5);
    pet.act('stand');
    run(pet, .1);
    expect(frames.at(-1).kneel).toBe(false);
  });

  it('kneeling ends with the next motion, even one done seated, and lifts the head points', () => {
    const pet = barePet();
    pet.setFigure({ anchors: { kneelRaise: 14 }, draw() {} });
    run(pet, 1);
    pet.act('kneel');
    run(pet, 1.5);
    expect(pet.pet.kneel).toBe(true);
    pet.act('wave');
    expect(pet.pet.kneel).toBe(false);
    expect(pet.pet.mode).toBe('sit');
  });

  it('talking hands the figure a mouth shape by the character said', () => {
    const frames = [];
    const pet = barePet();
    pet.setFigure({ draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    const shapes = new Set();
    for (const ch of 'abcd') { pet.talk(ch); run(pet, .05); shapes.add(frames.at(-1).talkShape); }
    expect(shapes.size).toBe(4);
  });

  it("talking with no character said (a page that does not pass it) moves the mouth's shape on each time", () => {
    for (const plus of [true, false]) {
      const frames = [];
      const pet = barePet(undefined, { plus });
      pet.setFigure({ draw: (g, face, o) => frames.push(o) });
      run(pet, 1);
      const shapes = [];
      for (let i = 0; i < 5; i++) { pet.talk(); run(pet, .05); shapes.push(frames.at(-1).talkShape); }
      expect(shapes, String(plus)).toEqual([1, 2, 3, 0, 1]);
      // a character still picks its own shape
      pet.talk('c');
      run(pet, .05);
      expect(frames.at(-1).talkShape).toBe('c'.codePointAt(0) % 4);
    }
  });

  it('the cheeky face pokes a tongue out, on Coo too', () => {
    expect(PLUS_FACES.tongue.f(0).tongue).toBe(true);
    const fc = PLUS_FACES.tongue.f(0);
    expect(figure(fc, { look: [0, 0], legs: STAND, low: 0, t: 0, blink: 0, acc: defaultSkin() })).toContain('#f08a9a');
  });
});

describe('what the page holds a pack to', () => {
  it("a body's sounds are muted with the kind they are filed under, a pack's own with its manifest's kind", async () => {
    const made = { tones: 0, clips: 0 };
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {} });
    class Ctx {
      constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8; this.destination = {}; }
      createGain() { return node(); }
      createDynamicsCompressor() { return node(); }
      createBiquadFilter() { return node(); }
      createOscillator() { made.tones++; return node(); }
      createBufferSource() { made.clips++; return node(); }
      createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
      decodeAudioData() { return Promise.resolve({}); }
    }
    const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
    Object.assign(globalThis, { window: { AudioContext: Ctx }, document: { hidden: false }, location: { href: 'http://127.0.0.1/' }, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) });
    try {
      const sfx = createSfx({ storageKey: 'test.sfx' });
      sfx.unlock();
      sfx.usePack('/packs/robot/', { boing: { file: 'boing.ogg', kind: 'move', volume: 1 } });
      await new Promise((r) => setTimeout(r, 0));
      sfx.configure({ kinds: { move: false } });
      // looking about borrows the 'hmm' tone, which belongs to no kind; the pack's boing is a move sound whatever the body files it under
      sfx.play('look', 'move'); sfx.play('boing', 'face');
      expect(made).toEqual({ tones: 0, clips: 0 });
      sfx.configure({ kinds: { move: true, face: false } });
      // a face that borrows the ui tone 'pop' is a face sound
      sfx.play('pop', 'face');
      expect(made.tones).toBe(0);
      sfx.play('boing', 'face'); sfx.play('look', 'move');
      expect(made.clips).toBe(1);
      expect(made.tones).toBeGreaterThan(0);
    } finally {
      Object.assign(globalThis, saved);
    }
  });

  it('only our own bodies hear the plus tones; another pack asking for one hears what upstream plays (nothing)', () => {
    const { ctx, made } = countingCtx();
    const sfx = createSfx({ ctx });
    sfx.usePack('/packs/robot/', {}, { plus: false });
    sfx.play('song', 'move'); sfx.play('spout', 'move'); sfx.play('soft', 'face');
    expect(made.voices).toBe(0);
    sfx.play('jump', 'move');
    expect(made.voices).toBeGreaterThan(0);
    const before = made.voices;
    sfx.usePack('/web/whale/', {}, { plus: true });
    sfx.play('song', 'move');
    expect(made.voices).toBeGreaterThan(before);
    // the pages pass plus for exactly the built-in packs that are ours
    expect(OWN_PACKS).toEqual(['coo', 'whale', 'claude-chan']);
  });

  it("a body's box is kept to the stage and to the most the kit stretches a body", () => {
    const size = { W: 1000, H: 600, S: .5 };
    const l = readLayout({ box: { x: -5000, y: -5000, w: 1e6, h: 1e6 }, hit: [{ x: 500, y: 300, r: 1e6 }], bubble: { x: -50, y: 9e9 } }, size);
    // a 256-unit square at S .5 is 128 pixels: no box past 1.5 × √2 of that
    expect(l.box.w).toBeLessThanOrEqual(128 * 1.5 * Math.SQRT2);
    expect(l.box.h).toBeLessThanOrEqual(128 * 1.5 * Math.SQRT2);
    expect(l.bubble).toEqual({ x: 0, y: 600 });
  });

  it('a touch counts only right after pointer input, a crash only after a throw', () => {
    const gate = touchGate();
    expect(gate.take('pet', 0)).toBe(false);
    gate.input(100);
    expect(gate.take('poke', 300)).toBe(true);
    expect(gate.take('pet', 5000)).toBe(false);
    expect(gate.take('crash', 5000)).toBe(false);
    gate.input(6000);
    expect(gate.take('throw', 6100)).toBe(true);
    expect(gate.take('crash', 7500)).toBe(true);
    expect(gate.take('crash', 7600)).toBe(false);
  });
});

/** The body a pack hands the figure frame (createBody), on a stand-in document; what it tells the page is kept in `events`. */
function bareBody(opts = {}) {
  const el = () => ({ setAttribute() {}, innerHTML: '', textContent: '', remove() {}, appendChild() {} });
  const kids = [el(), el(), el()];
  const doc = { head: { appendChild() {} }, documentElement: { dataset: {} }, createElement: el, createElementNS: () => ({ ...el(), children: kids }) };
  const events = [];
  const body = createBody({ root: { ownerDocument: doc, appendChild() {} }, bounds: BOUNDS, emit: (kind, d) => events.push([kind, d]), sound() {}, start: { skin: defaultSkin() } }, { figure: cooFigure(), ...opts });
  body.events = events;
  return body;
}
const stepBody = (body, seconds) => { for (let i = 0; i < seconds * 60; i++) body.step(1 / 60); };

describe('a word the body cannot take', () => {
  it('is done at once, so the page goes on to the next word instead of waiting', () => {
    const body = bareBody({ plus: true });
    stepBody(body, 1);
    const done = () => body.events.filter(([k]) => k === 'done').map(([, d]) => d.word);
    // one it does not know
    expect(body.do('fly')).toBe(false);
    expect(done()).toEqual(['fly']);
    // one it knows but cannot do now: no song while she is being talked to
    body.set({ listening: true });
    expect(body.do('song')).toBe(false);
    expect(done()).toEqual(['fly', 'song']);
    body.set({ listening: false });
    // a word it takes is not done before it is
    expect(body.do('song')).toBe(true);
    expect(body.do('nod')).toBe(true);
    expect(done()).toEqual(['fly', 'song']);
    body.dispose();
  });

  it('without plus, our words are ones the body does not know, and it keeps upstream\'s timing (no early done)', () => {
    const body = bareBody();
    stepBody(body, 1);
    for (const w of [...PLUS_EXPRESSIONS, ...PLUS_MOTIONS, 'fly']) expect(body.do(w), w).toBe(false);
    expect(body.events.filter(([k]) => k === 'done')).toEqual([]);
    body.dispose();
  });
});

describe('a body without plus is the kit as any other pack knows it', () => {
  it('knows only the kit words and the pack\'s own', () => {
    for (const w of [...PLUS_EXPRESSIONS, ...PLUS_MOTIONS]) {
      const pet = barePet(undefined, { plus: false });
      run(pet, 1);
      expect(pet.doWord(w), w).toBe(false);
    }
    for (const w of [...KIT_EXPRESSIONS, ...KIT_MOTIONS]) {
      const pet = barePet(undefined, { plus: false });
      run(pet, 1);
      expect(pet.doWord(w), w).toBe(true);
    }
  });

  it("every kit motion plays out and ends on its feet, as with upstream's kit", () => {
    for (const m of KIT_MOTIONS) {
      const pet = barePet(undefined, { plus: false });
      run(pet, 1);
      expect(pet.doWord(m), m).toBe(true);
      run(pet, 5);
      if (m !== 'sit' && m !== 'sleep' && m !== 'walk' && m !== 'run') expect(pet.pet.mode, m).toBe('idle');
    }
  });

  it("draws the kit's own faces, shy and sad too, not the plus body's", () => {
    for (const [plus, want] of [[false, FACES], [true, PLUS_FACES]]) {
      const frames = [];
      const pet = barePet(undefined, { plus });
      pet.setFigure({ draw: (g, face, o) => frames.push({ face, o }) });
      run(pet, 1);
      pet.setExpr('sad');
      run(pet, .2);
      expect(frames.at(-1).o.face).toBe('sad');
      expect(frames.at(-1).face.lean, String(plus)).toBe(want.sad.f(0).lean);
      pet.setExpr('shy');
      run(pet, .2);
      expect(!!frames.at(-1).face.lookLock, String(plus)).toBe(!plus);
    }
    expect(FACES.sad.f(0).lean).toBeUndefined();
    expect(PLUS_FACES.sad.f(0).lean).toBeGreaterThan(0);
  });

  it('flashes no glints for a happy face', () => {
    for (const plus of [false, true]) {
      const pet = barePet(undefined, { plus });
      run(pet, 1);
      pet.setExpr('happy');
      run(pet, .2);
      expect(pet.fxHtml().includes('#e0a100'), String(plus)).toBe(plus);
    }
  });

  it('never lies down roaming free (the plus body does now and then)', () => {
    const modes = (plus) => seeded(() => {
      const seen = new Set();
      const pet = barePet((kind, d) => { if (kind === 'mode') seen.add(d.mode); }, { plus, roam: 'free' });
      for (let i = 0; i < 600 * 60; i++) { pet.step(1 / 60); if (i % 30 === 0) pet.render(); }
      return seen;
    });
    expect(modes(false).has('lie')).toBe(false);
    expect(modes(true).has('lie')).toBe(true);
  });

  it("hands the figure a frame with the plus fields at rest", () => {
    const frames = [];
    const pet = barePet(undefined, { plus: false });
    pet.setFigure({ anchors: { lie: { hit: [128, 190, 120, 66], halfW: 124, bubble: [180, 60] } }, draw: (g, face, o) => frames.push(o) });
    run(pet, 1);
    pet.act('sit');
    run(pet, 2);
    const o = frames.at(-1);
    expect(o).toMatchObject({ lie: 0, prone: false, kneel: false, away: 0 });
    expect(pet.lying).toBe(0);
  });
});
