import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADD_KEYS, ARM_GESTURES, createBody, createPet, FACES, HEAD_GESTURES, KIT_EXPRESSIONS, KIT_MOTIONS, PLUS_EXPRESSIONS, PLUS_FACES, PLUS_MIXES, PLUS_MIX_FACES, PLUS_MOTIONS, ROLL_D, STAND } from '../packages/cortico-world-desktop-pet/web/kit/body.js';
import { cooFigure, defaultSkin, figure, HEAD_TOP } from '../packages/cortico-world-desktop-pet/web/coo/coo.js';
import { createSfx, EXPR_TONES, OWN_PACKS, SOUND_KINDS } from '../packages/cortico-world-desktop-pet/web/sound.js';
import { readLayout, touchGate } from '../packages/cortico-world-desktop-pet/web/body-host.js';
import { createActs, WALK_MAX } from '../packages/cortico-world-desktop-pet/web/acts.js';
import { figurePacks, readManifest } from '../packages/cortico-world-desktop-pet/src/packs.ts';
import { CHANNELS, parseActions } from '../packages/cortico-world-desktop-pet/src/script.ts';

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
/**
 * Upstream's kit at v0.1.17 (body.js and rig.js from the tag), or null in a local checkout without the tag; on CI
 * (which fetches the tag) a missing tag fails, so the comparisons cannot skip unnoticed. The copy goes inside the
 * project (node_modules/.cache), where vitest loads it like any other module, on Windows too.
 */
async function upstreamKit() {
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const dir = fileURLToPath(new URL('../node_modules/.cache/upstream-kit-v0.1.17/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  try {
    for (const f of ['body.js', 'rig.js']) {
      writeFileSync(join(dir, f), execFileSync('git', ['show', `v0.1.17:packages/cortico-world-desktop-pet/web/kit/${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    }
  } catch (e) {
    if (process.env.CI) throw new Error(`v0.1.17 tag missing on CI (the workflow fetches it): ${e}`);
    return null;
  }
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  return import(pathToFileURL(join(dir, 'body.js')).href);
}
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

  it('Claude-chan, GPT-chan and Gemini-chan know the same words but spout (they have no blowhole)', () => {
    for (const pack of ['claude-chan', 'gpt-chan', 'gemini-chan']) {
      const words = (kind) => vocabOf(pack).filter((v) => v.kind === kind).map((v) => v.id).sort();
      expect(words('expression'), pack).toEqual([...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS].sort());
      expect(words('motion'), pack).toEqual([...KIT_MOTIONS, ...PLUS_MOTIONS].filter((w) => w !== 'spout').sort());
    }
  });

  it('every expression has a face Coo can draw, the plus ones too', () => {
    for (const n of [...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS]) {
      const fc = (PLUS_FACES[n] ?? PLUS_MIX_FACES[n] ?? FACES[n]).f(.5);
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
    // (plus: a nod is the head's, in the frame's \`head\`)
    const o = frames.at(-1);
    expect(o.head.kind).toBe('nod');
    expect(o.head.k).toBeGreaterThan(.3);
    expect(Math.abs(o.lean)).toBeLessThan(.01);
    run(pet, 1);
    expect(frames.at(-1).head).toBeNull();
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
    pet.act('wave');
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
    const up = await upstreamKit();
    if (!up) return;
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
    // (the sigh plays in the head's channel)
    let fc = PLUS_FACES.sighing.f(pet.pet.head.t0 + .3, pet.pet);
    expect(fc.eyes[0].shape).toBe('ring');
    expect(fc.puff ?? 0).toBe(0);
    fc = PLUS_FACES.sighing.f(pet.pet.head.t0 + 1.2, pet.pet);
    expect(fc.eyes[0].shape).toBe('lid');
    expect(fc.puff).toBeGreaterThan(.5);
    // something else cuts it short: no drooping face left over
    pet.act('nod');
    expect(PLUS_FACES.sighing.f(pet.pet.head.t0 + .1, pet.pet).puff ?? 0).toBe(0);
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
    // the pages pass plus for exactly the built-in packs that are ours (the World's own list of them)
    expect(OWN_PACKS).toEqual(['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']);
    expect(OWN_PACKS).toEqual(figurePacks([]).packs.map((p) => p.id));
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

describe("the page's queue of words (web/acts.js)", () => {
  const seconds = new Map(vocabOf('coo').map((v) => [v.id, v.seconds]));
  const secondsOf = (w) => seconds.get(w) ?? 1;
  /** A layout as the page reads it, for a body that only says what mode it is in. */
  const lay = (mode, busy = false) => ({ mode, busy });

  it('a walk asked for as a word holds the next word until it stops, though the walk outlasts its seconds on a wide stage', () => {
    let T = 0;
    const acts = createActs();
    const done = [];
    const pet = barePet((kind, d) => { if (kind === 'done') { done.push([d.word, T]); acts.done(d.word, T); } }, { bounds: () => ({ W: 2560, H: 400, floorY: 380, S: .42 }) });
    run(pet, 1);
    // from the left edge a walk goes past the middle of the stage: more than 1300 px at 78 px/s
    pet.pet.x = 100;
    const started = [];
    acts.push('walk', 'nod');
    for (let i = 0; i < 40 * 60 && started.length < 2; i++) {
      T += 1 / 60;
      acts.step(T, pet.layout(), (w) => { started.push([w, T, pet.pet.mode]); pet.doWord(w); }, secondsOf);
      pet.step(1 / 60); pet.render();
    }
    expect(secondsOf('walk')).toBe(12);
    const [walk, nod] = started;
    expect(walk[0]).toBe('walk');
    expect(done.map(([w]) => w)).toEqual(['walk']);
    // the walk ran past its 12 s, and the nod waited for it to end rather than cutting in on the way
    expect(done[0][1] - walk[1]).toBeGreaterThan(14);
    expect(nod[0]).toBe('nod');
    expect(nod[1]).toBeGreaterThanOrEqual(done[0][1]);
    expect(nod[2]).toBe('idle');
  });

  it('a body that never says a walk is done holds the queue only while it walks, and never past WALK_MAX', () => {
    const acts = createActs();
    const played = [];
    const play = (w) => played.push(w);
    acts.push('walk', 'nod');
    expect(acts.step(0, lay('idle'), play, secondsOf)).toBe('walk');
    expect(acts.step(12.5, lay('walk'), play, secondsOf)).toBe(null);
    expect(acts.step(WALK_MAX - .1, lay('walk'), play, secondsOf)).toBe(null);
    expect(acts.step(WALK_MAX + .1, lay('walk'), play, secondsOf)).toBe('nod');

    // ...and one that has stopped walking lets the next word go at its seconds, as before
    acts.push('run', 'wave');
    const at = WALK_MAX + 1;
    expect(acts.step(at, lay('idle'), play, secondsOf)).toBe('run');
    expect(acts.step(at + 12.1, lay('idle'), play, secondsOf)).toBe('wave');
    expect(played).toEqual(['walk', 'nod', 'run', 'wave']);
  });

  it('a word reported done lets the next one start at once; words wait while the body is busy or not there', () => {
    const acts = createActs();
    const play = () => {};
    acts.push('walk', 'nod', 'happy');
    expect(acts.step(0, null, play, secondsOf)).toBe(null);
    expect(acts.step(0, lay('crouch', true), play, secondsOf)).toBe(null);
    expect(acts.step(0, lay('idle'), play, secondsOf)).toBe('walk');
    // a done for some other word changes nothing
    acts.done('wave', 3);
    expect(acts.step(3.1, lay('walk'), play, secondsOf)).toBe(null);
    acts.done('walk', 3);
    expect(acts.step(3.1, lay('walk'), play, secondsOf)).toBe('nod');
    expect(acts.step(3.2, lay('idle'), play, secondsOf)).toBe(null);
    expect(acts.step(3.1 + secondsOf('nod'), lay('idle'), play, secondsOf)).toBe('happy');
    expect(acts.length).toBe(0);
  });

  it('a body busy in the air turns a walk down, so the page can say so at once (figure-frame.js reports it interrupted by busy)', () => {
    const body = bareBody({ plus: true });
    stepBody(body, 1);
    expect(body.do('jump')).toBe(true);
    stepBody(body, .1);
    expect(body.layout().busy).toBe(true);
    expect(body.walk(100, false, 'w1')).toBe(false);
    stepBody(body, 3);
    expect(body.layout().busy).toBe(false);
    expect(body.walk(100, false, 'w2')).toBe(true);
    body.dispose();
  });
});

describe('an asked-for face outlives the motions after it (plus)', () => {
  /** A bare pet whose frames are kept, Coo drawing them. */
  function framedPet(opts = {}) {
    const frames = [];
    const pet = barePet(undefined, opts);
    const fig = cooFigure(), draw = fig.draw;
    fig.draw = (g, face, o) => { frames.push({ face, o }); draw.call(fig, g, face, o); };
    pet.setFigure(fig);
    pet.frames = frames;
    return pet;
  }
  /** How long (s) the face named `n` keeps showing from now, up to `max`. */
  const showsFor = (pet, n, max = 8) => { let t = 0; while (t < max) { run(pet, 1 / 60); if (pet.pet._fname !== n) break; t += 1 / 60; } return t; };

  it('a nod or a wave keeps an asked-for face (the wave its own happy face only once the asked one is over)', () => {
    for (const m of ['nod', 'wave', 'cross', 'sit', 'hop']) {
      const pet = barePet();
      run(pet, 1);
      pet.setExpr('angry');
      run(pet, .2);
      expect(pet.act(m), m).toBe(true);
      run(pet, .3);
      expect(pet.pet._fname, m).toBe('angry');
    }
    // a face asked for while a gesture plays takes over its own face
    const pet = barePet();
    run(pet, 1);
    pet.act('wave');
    run(pet, .2);
    expect(pet.pet._fname).toBe('happy');
    pet.setExpr('angry');
    run(pet, .2);
    expect(pet.pet._fname).toBe('angry');
  });

  it('a book read under an asked-for face keeps the face (over the reading body), lasting through the read', () => {
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('angry');
    pet.act('read');
    run(pet, 4);
    expect(pet.pet.expr).toBe('angry');
    expect(pet.pet._fname).toBe('angry+angry+reading');
    run(pet, 1);
    expect(pet.pet._fname).toBe('neutral');
  });

  it("a face asked for mid-gesture shows for its time, then the gesture's own face comes back for the rest of it", () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('read');
    run(pet, .5);
    pet.setExpr('surprised');
    run(pet, 3.1);
    expect(pet.pet.expr).toBe('surprised');
    expect(pet.pet._fname.split('+')[0]).toBe('surprised');
    run(pet, .3);
    expect(pet.pet._fname).toBe('reading');
    expect(pet.pet.exprOwn).toBe(true);
    run(pet, 1);
    expect(pet.pet._fname).toBe('neutral');
  });

  it('a face she gave herself (roaming, a poke, a cue) is not asked for: the next motion replaces it and it is not stretched', () => {
    // roaming: Math.random held at .8 picks a face, and of the faces, surprised
    const pet = barePet(undefined, { roam: 'free' });
    const real = Math.random;
    Math.random = () => .8;
    try { for (let i = 0; i < 600 && pet.pet.expr !== 'surprised'; i++) run(pet, 1 / 60); } finally { Math.random = real; }
    pet.setRoam('off');
    expect(pet.pet.expr).toBe('surprised');
    expect(pet.pet.exprAsked).toBe(false);
    pet.act('wave');
    run(pet, .2);
    expect(pet.pet._fname).toBe('happy');

    // a poke's face (held at .9: angry, and no hop)
    const poked = barePet();
    run(poked, 1);
    const p = poked.toStage(128, 128);
    Math.random = () => .9;
    try { expect(poked.pointerDown(p)).toBe(true); poked.pointerUp(); } finally { Math.random = real; }
    run(poked, .2);
    expect(poked.pet._fname).toBe('angry');
    expect(poked.pet.exprAsked).toBe(false);
    poked.act('wave');
    run(poked, .2);
    expect(poked.pet._fname).toBe('happy');
    // ...and one during a gesture shows over its own face for its time
    Math.random = () => .9;
    try { poked.pointerDown(p); poked.pointerUp(); } finally { Math.random = real; }
    run(poked, .2);
    expect(poked.pet._fname).toBe('angry');

    // the page's perk (a talk key tapped) just before a book: the book's face, not held up by it
    const frames = [];
    const body = bareBody({ plus: true, figure: { draw: (g, face, o) => frames.push(o) } });
    stepBody(body, 1);
    body.cue('perk');
    stepBody(body, .1);
    expect(frames.at(-1).face).toBe('surprised');
    expect(body.do('read')).toBe(true);
    stepBody(body, 1);
    expect(frames.at(-1).face).toBe('reading');
    stepBody(body, 3.6);
    expect(frames.at(-1).face).toBe('neutral');
    body.dispose();
  });

  it('stone ends on any motion, sleep and a pick-up clear the face, a walk keeps it, a plain face is plain', () => {
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('petrify');
    run(pet, .5);
    pet.act('nod');
    run(pet, .1);
    expect(pet.pet._fname).toBe('neutral');

    pet.setExpr('happy');
    pet.act('sleep');
    expect(pet.pet.expr).toBe(null);
    pet.act('stand');
    run(pet, 2.5);

    pet.setExpr('happy');
    run(pet, .2);
    const p = pet.toStage(128, 128);
    expect(pet.pointerDown(p)).toBe(true);
    pet.pointerMove({ x: p.x + 20, y: p.y - 20 });
    expect(pet.pet.expr).toBe(null);
    pet.pointerUp();
    run(pet, 4);

    pet.setExpr('happy');
    expect(pet.doWord('walk')).toBe(true);
    run(pet, .5);
    expect(pet.pet.mode).toBe('walk');
    expect(pet.pet._fname).toBe('happy');
    pet.act('stand');
    pet.setExpr('happy');
    expect(pet.walkTo(pet.pet.x + 200, false, 3)).toBe(true);
    run(pet, .3);
    expect(pet.pet._fname).toBe('happy');
    run(pet, 4);

    // a plain face asked for during a book: plain for the rest of it, not the book's face again
    pet.act('read');
    run(pet, .5);
    expect(pet.doWord('neutral')).toBe(true);
    run(pet, .5);
    expect(pet.pet._fname).toBe('neutral');
    // ...and dizzy leaves no motion's own face to come back
    pet.act('wave');
    run(pet, .2);
    pet.setExpr('dizzy');
    expect(pet.pet.own).toEqual({ arm: null, head: null, body: null });
  });

  it('hands on hips and folded arms are no special case: every motion call names its own face\'s channel', () => {
    const src = readFileSync(new URL('web/kit/body.js', PKG), 'utf8');
    const calls = src.split('\n').filter((l) => l.includes('holdFace(') && !l.includes('function holdFace('));
    expect(calls.length).toBeGreaterThan(25);
    for (const l of calls) expect(l, l.trim()).toMatch(/holdFace\([^)]*, '(arm|head|body)'\)/g);
    expect(src).not.toContain('prevExpr');
  });

  it('a face asked for under a cover waits it out: shown in full after listening or dizzy, dropped after COVER_MAX', () => {
    let pet = barePet();
    run(pet, 1);
    pet.setExpr('happy');
    run(pet, .1);
    pet.setListening(true);
    run(pet, 2);
    expect(pet.pet._fname).toBe('listening');
    pet.setListening(false);
    expect(showsFor(pet, 'happy')).toBeGreaterThan(3);

    pet = barePet();
    run(pet, 1);
    pet.setExpr('happy');
    pet.setListening(true);
    run(pet, 6);
    pet.setListening(false);
    run(pet, .1);
    expect(pet.pet.expr).toBe(null);
    expect(pet.pet._fname).toBe('neutral');

    pet = barePet();
    run(pet, 1);
    pet.act('dizzy');
    run(pet, .1);
    pet.setExpr('happy');
    for (let i = 0; i < 300 && pet.pet.mode === 'dizzy'; i++) run(pet, 1 / 60);
    expect(pet.pet.mode).toBe('idle');
    expect(showsFor(pet, 'happy')).toBeGreaterThan(3);

    // a face timed from when it began goes on from where it was
    pet = barePet();
    run(pet, 1);
    pet.setExpr('giggle');
    run(pet, .5);
    const at = pet.pet.exprAt;
    pet.setListening(true);
    run(pet, 1);
    pet.setListening(false);
    expect(pet.pet.exprAt - at).toBeCloseTo(1, 1);
  });

  it('stone cracks once, though it waits out a cover in between', () => {
    const pet = hearingPet();
    run(pet, 1);
    // the most chips seen at once
    let chips = 0;
    const watch = (s) => { for (let i = 0; i < s * 60; i++) { run(pet, 1 / 60); chips = Math.max(chips, (pet.fxHtml().match(/#c9ccd4/g) || []).length); } };
    pet.setExpr('petrify');
    watch(1.5);
    const cracks = () => pet.heard.filter(([n]) => n === 'crack').length;
    expect(cracks()).toBe(1);
    expect(chips).toBe(5);
    pet.setListening(true);
    watch(1);
    pet.setListening(false);
    watch(2.5);
    expect(cracks()).toBe(1);
    expect(chips).toBe(5);
  });

  it('Coo nods beside what her body does: waving, holding a heart seated, reading, and kneeling (which a nod keeps)', () => {
    /** The most Coo leans forward over `s` seconds after `start`, and the last frame's state. */
    const leanOf = (start, s = .7) => {
      const pet = barePet();
      run(pet, 1);
      start(pet);
      let most = 0;
      for (let i = 0; i < s * 60; i++) { run(pet, 1 / 60); most = Math.max(most, pet.pet.lean); }
      return { most, pet };
    };
    for (const [with_, without] of [[['wave', 'nod'], ['wave']], [['sit', 'heart', 'nod'], ['sit', 'heart']], [['read', 'nod'], ['read']]]) {
      const a = leanOf(p => expect(p.doGroup(with_).every(Boolean)).toBe(true)), b = leanOf(p => p.doGroup(without));
      expect(a.most - b.most, with_.join('+')).toBeGreaterThan(5);
      expect(a.pet.pet.pulse?.kind, with_.join('+')).toBe(with_.at(-2));
    }
    const kneelNod = leanOf(p => { p.doWord('kneel'); run(p, 2); p.doWord('nod'); }), kneelOnly = leanOf(p => { p.doWord('kneel'); run(p, 2); });
    expect(kneelNod.most - kneelOnly.most).toBeGreaterThan(5);
    expect(kneelNod.pet.pet.kneel).toBe(true);
    expect(kneelNod.pet.pet.mode).toBe('sit');
  });

  it('a nod, a shake or a sigh plays in the head, beside a gesture of the arms (a song goes on), and the frame carries both', () => {
    const pet = framedPet();
    run(pet, 1);
    pet.act('wave');
    run(pet, .3);
    pet.act('nod');
    run(pet, .2);
    expect(pet.pet.pulse.kind).toBe('wave');
    expect(pet.pet.head.kind).toBe('nod');
    const { o } = pet.frames.at(-1);
    expect(o.gesture.kind).toBe('wave');
    expect(o.head).toMatchObject({ kind: 'nod' });
    expect(o.head.k).toBeGreaterThan(.2);
    expect(pet.pet.lean).toBeGreaterThan(1);
    expect(pet.moving).toBe(true);
    // a head gesture alone is the frame's head only: its gesture is the arms' and body's
    run(pet, 2);
    pet.act('shake');
    run(pet, .1);
    expect(pet.frames.at(-1).o.gesture).toBe(null);
    expect(pet.frames.at(-1).o.head).toMatchObject({ kind: 'shake' });
    run(pet, 1);
    expect(pet.frames.at(-1).o.head).toBe(null);
    expect(pet.frames.at(-1).o.gesture).toBe(null);
    // a song is not cut by a nod or a sigh
    pet.act('song');
    run(pet, .5);
    pet.act('nod');
    run(pet, .3);
    pet.act('sigh');
    run(pet, .3);
    expect(pet.pet.pulse.kind).toBe('song');
    expect(pet.pet.head.kind).toBe('sigh');
    // a figure that draws the nod itself gets it whole, the body leaving it out
    const own = barePet();
    own.setFigure({ gestures: ['nod'], draw() {} });
    run(own, 1);
    own.act('nod');
    run(own, .3);
    expect(Math.abs(own.pet.lean)).toBeLessThan(.5);
  });

  it("a head gesture's own face lives in the head's channel, an arm gesture's in the arms', and a lying fidget leaves it be", () => {
    const pet = barePet();
    run(pet, 1);
    pet.act('sigh');
    run(pet, .2);
    pet.act('wave');
    run(pet, .1);
    expect(pet.pet.own.head?.n).toBe('sighing');
    expect(pet.pet.own.arm?.n).toBe('happy');
    expect(pet.pet._fname).toBe('happy');

    const lying = barePet();
    run(lying, 1);
    lying.act('lie');
    run(lying, 2);
    lying.act('wave');
    run(lying, 1.65);
    expect(lying.pet.pulse).toBe(null);
    lying.pet.fidgetAt = 0;
    run(lying, 2 / 60);
    expect(['kick', 'chin', 'thump']).toContain(lying.pet.pulse?.kind);
    expect(lying.pet.own.arm?.n).toBe('happy');
  });

  it('a song or a sigh under an asked-for face keeps its body and mouth, with the asked eyes; never over stone, which ends a song', () => {
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('angry');
    pet.act('song');
    run(pet, .5);
    expect(pet.pet._fname).toBe('angry+singing+singing');
    const fc = pet.pet._fc;
    expect(fc.sing).toBeDefined();
    expect(fc.parts).toEqual({ eyes: 'angry', brows: 'angry', mouth: 'singing', body: 'singing' });
    expect(fc.eyes).toEqual(PLUS_FACES.angry?.f(0).eyes ?? FACES.angry.f(0).eyes);
    expect(fc.brows).toBe('angry');
    expect(fc.anger).toBe(true);
    // the beat opens the mouth now and then
    let sung = 0;
    for (let i = 0; i < 60; i++) { run(pet, 1 / 60); sung = Math.max(sung, pet.pet._fc.sing); }
    expect(sung).toBeGreaterThan(.5);

    const reader = barePet();
    run(reader, 1);
    reader.setExpr('angry');
    reader.act('read');
    run(reader, .5);
    expect(reader.pet._fname).toBe('angry+angry+reading');
    expect(reader.pet._fc.parts.body).toBe('reading');

    const stone = barePet();
    run(stone, 1);
    stone.act('song');
    run(stone, .5);
    stone.setExpr('petrify');
    run(stone, .7);
    expect(stone.pet.pulse).toBe(null);
    expect(stone.pet._fname).toBe('petrify');
    expect(stone.pet._fc.stone).toBeGreaterThan(.5);
  });

  it('kneeling lasts through faces and head gestures, ends with an arm gesture (unless the figure draws arms kneeling)', () => {
    for (const w of ['nod', 'shake', 'sigh', 'happy']) {
      const pet = barePet();
      run(pet, 1);
      pet.act('kneel');
      run(pet, 1);
      expect(pet.doWord(w), w).toBe(true);
      run(pet, .5);
      expect(pet.pet.kneel, w).toBe(true);
      expect(pet.pet.mode, w).toBe('sit');
    }
    const pet = barePet();
    run(pet, 1);
    pet.act('kneel');
    run(pet, 1);
    pet.act('wave');
    expect(pet.pet.kneel).toBe(false);
    expect(pet.pet.mode).toBe('sit');
    const arms = barePet();
    arms.setFigure({ kneelArms: true, draw() {} });
    run(arms, 1);
    arms.act('kneel');
    run(arms, 1);
    arms.act('wave');
    expect(arms.pet.kneel).toBe(true);
    arms.act('bow');
    expect(arms.pet.kneel).toBe(false);
    expect(ARM_GESTURES).toContain('wave');
    expect(ARM_GESTURES).not.toContain('bow');
    // a group from standing (the World sends 跪坐+招手 as one for a figure whose kneel has keepsArms): she kneels and waves
    const group = barePet();
    group.setFigure({ kneelArms: true, draw() {} });
    run(group, 1);
    expect(group.doGroup(['kneel', 'wave'])).toEqual([true, true]);
    expect(group.pet.kneel).toBe(true);
    expect(group.pet.pulse?.kind).toBe('wave');
    run(group, 3);
    expect(group.pet.kneel).toBe(true);
    // a gesture that needs her standing or seated still ends it, as without the figure
    const cheer = barePet();
    cheer.setFigure({ kneelArms: true, draw() {} });
    run(cheer, 1);
    cheer.doGroup(['kneel', 'cheer']);
    expect(cheer.pet.kneel).toBe(false);
    // a song is in ARM_GESTURES: she sings kneeling (the World groups 跪坐+唱歌 for such a figure: script.ts KNEEL_SINGS)
    const song = barePet();
    song.setFigure({ kneelArms: true, draw() {} });
    run(song, 1);
    expect(song.doGroup(['kneel', 'song'])).toEqual([true, true]);
    run(song, 1);
    expect(song.pet.kneel).toBe(true);
    expect(ARM_GESTURES).toContain('song');
    const songFirst = barePet();
    songFirst.setFigure({ kneelArms: true, draw() {} });
    run(songFirst, 1);
    expect(songFirst.doGroup(['song', 'kneel'])).toEqual([true, true]);
    run(songFirst, 1);
    expect(songFirst.pet.kneel).toBe(true);
    expect(songFirst.pet.pulse?.kind).toBe('song');
    // and without kneelArms the group's wave ends the kneel (the World splits it for such a figure)
    const plain = barePet();
    run(plain, 1);
    plain.doGroup(['kneel', 'wave']);
    expect(plain.pet.kneel).toBe(false);
  });

  it('a face no longer cuts a look round short (it still ends one on a body without plus)', () => {
    for (const plus of [true, false]) {
      const pet = barePet(undefined, { plus });
      run(pet, 1);
      pet.act('look');
      run(pet, .3);
      pet.setExpr('confused');
      run(pet, .1);
      expect(pet.pet.mode, String(plus)).toBe(plus ? 'look' : 'idle');
    }
  });

  it('does a group of words in one frame: posture first, then gestures, then what leaves her busy, then the face', () => {
    const pet = barePet();
    run(pet, 1);
    expect(pet.doGroup(['happy', 'hop', 'wave'])).toEqual([true, true, true]);
    expect(pet.pet.mode).toBe('crouch');
    expect(pet.pet.pulse.kind).toBe('wave');
    expect(pet.pet.expr).toBe('happy');
    expect(pet.pet.exprAsked).toBe(true);
    // busy to begin with, it takes none
    expect(pet.doGroup(['nod', 'happy'])).toEqual([false, false]);
    run(pet, 2);
    // a song after sitting down, not cut by it; a kneel with a nod and a face
    expect(pet.doGroup(['song', 'sit'])).toEqual([true, true]);
    expect(pet.pet.mode).toBe('sit');
    expect(pet.pet.pulse.kind).toBe('song');
    pet.act('stand');
    run(pet, 2.5);
    expect(pet.doGroup(['happy', 'nod', 'kneel'])).toEqual([true, true, true]);
    run(pet, .5);
    expect(pet.pet.kneel).toBe(true);
    expect(pet.pet._fname).toBe('happy');
    // asleep, as with act('sleep'), the asked face is gone
    pet.setExpr('happy');
    expect(pet.doGroup(['sleep'])).toEqual([true]);
    expect(pet.pet.expr).toBe(null);

    // the body hands the page a done for each word it could not take
    const body = bareBody({ plus: true });
    stepBody(body, 1);
    body.set({ listening: true });
    expect(body.doAll(['wave', 'song'])).toEqual([true, false]);
    expect(body.events.filter(([k]) => k === 'done').map(([, d]) => d.word)).toEqual(['song']);
    body.dispose();
  });

  it('agrees with the World on what part of her each word takes', () => {
    const motions = [...KIT_MOTIONS, ...PLUS_MOTIONS];
    for (const m of motions) expect(CHANNELS[m], m).toBeDefined();
    expect(new Set(Object.keys(CHANNELS).filter((w) => CHANNELS[w].length === 1 && CHANNELS[w][0] === 'head'))).toEqual(HEAD_GESTURES);
    for (const m of motions) {
      const pet = barePet();
      run(pet, 1);
      const pulse = pet.pet.pulse;
      expect(pet.doWord(m), m).toBe(true);
      const cs = CHANNELS[m];
      if (pet.pet.head) expect(cs, m).toContain('head');
      if (pet.pet.pulse && pet.pet.pulse !== pulse) expect(cs, m).toContain('arm');
      if (pet.pet.mode !== 'idle') expect(cs.includes('body') || cs.includes('stance'), m).toBe(true);
    }
    // a curtsy stands her up (body); a song needs her still (stance); an arm gesture ends a kneel (arm)
    const pet = barePet();
    run(pet, 1);
    pet.act('sit');
    run(pet, 1);
    pet.act('curtsy');
    expect(pet.pet.mode).not.toBe('sit');
    expect(CHANNELS.curtsy).toContain('body');
    for (const m of ['walk', 'dance', 'look', 'dizzy', 'hop']) {
      const p = barePet();
      run(p, 1);
      p.doWord(m);
      run(p, .05);
      expect(p.act('song'), m).toBe(false);
      expect(CHANNELS[m], m).toContain('stance');
    }
    expect(CHANNELS.song).toContain('stance');
    pet.act('kneel');
    run(pet, 1);
    pet.act('wave');
    expect(pet.pet.kneel).toBe(false);
    expect(CHANNELS.kneel).toContain('arm');
  });
});

describe('a group of words through the page and the frame', () => {
  const seconds = new Map(vocabOf('coo').map((v) => [v.id, v.seconds]));
  const secondsOf = (w) => seconds.get(w) ?? 1;
  const lay = (mode, busy = false) => ({ mode, busy });

  it('the queue holds a group until its longest member is over, or each member is done; a single word as before', () => {
    const acts = createActs();
    const played = [];
    const play = (w) => played.push(w);
    acts.push('wave+happy', 'nod');
    expect(acts.step(0, lay('idle'), play, secondsOf)).toBe('wave+happy');
    // wave's 1.7 s, longer than happy's .9
    expect(acts.step(1, lay('idle'), play, secondsOf)).toBe(null);
    expect(acts.step(1.8, lay('idle'), play, secondsOf)).toBe('nod');
    // a member reported done stops holding it; the group goes once all have
    acts.push('song+sit', 'wave');
    expect(acts.step(3, lay('idle'), play, secondsOf)).toBe('song+sit');
    acts.done('song', 3.5);
    expect(acts.step(3.6, lay('sit'), play, secondsOf)).toBe(null);
    acts.done('sit', 3.7);
    expect(acts.step(3.7, lay('sit'), play, secondsOf)).toBe('wave');
    // a walk in a group holds the next entry while she walks
    acts.push('walk+happy', 'nod');
    expect(acts.step(10, lay('idle'), play, secondsOf)).toBe('walk+happy');
    expect(acts.step(30, lay('walk'), play, secondsOf)).toBe(null);
    acts.done('walk', 31);
    expect(acts.step(31, lay('idle'), play, secondsOf)).toBe('nod');
    expect(played).toEqual(['wave+happy', 'nod', 'song+sit', 'wave', 'walk+happy', 'nod']);
  });

  it("a body without doAll gets a group's words one by one, each it turns down tried again for up to 2 s", async () => {
    // a body that turns words down while "busy", and one word (fly) always (an in-repo module: vitest loads it like any other)
    const handlers = [], posted = [];
    const saved = ['document', 'addEventListener', 'parent'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
    const parent = { postMessage: (m) => posted.push(m) };
    Object.assign(globalThis, {
      document: { getElementById: () => ({}), documentElement: { dataset: {} } },
      addEventListener: (type, fn) => { if (type === 'message') handlers.push(fn); },
      parent,
    });
    try {
      await import('../packages/cortico-world-desktop-pet/web/figure-frame.js');
      const send = async (data) => { for (const h of handlers) await h({ source: parent, data }); };
      await send({ t: 'init', entry: new URL('./fixtures/frame-body.js', import.meta.url).href, export: 'make', base: 'http://x/', bounds: {}, theme: 'light' });
      const b = globalThis.__frameBody;
      expect(posted.find((m) => m.t === 'error')).toBeUndefined();
      expect(posted.some((m) => m.t === 'ready')).toBe(true);
      await send({ t: 'do-all', words: ['hop', 'happy', 'fly', 7] });
      expect(b.did).toEqual([]);
      await send({ t: 'tick', dt: .5 });
      b.busy = false;
      await send({ t: 'tick', dt: .5 });
      expect(b.did).toEqual(['hop', 'happy']);
      for (let i = 0; i < 6; i++) await send({ t: 'tick', dt: .5 });
      expect(b.did).toEqual(['hop', 'happy']);
      expect(posted.some((m) => m.t === 'error')).toBe(false);
    } finally {
      for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
      delete globalThis.__frameBody;
    }
  });
});

describe('a body without plus keeps upstream\'s faces and words', () => {
  it('a motion still clears the face, kneeling is no word, and there is no group call', () => {
    const pet = barePet(undefined, { plus: false });
    run(pet, 1);
    pet.setExpr('happy');
    pet.doWord('nod');
    run(pet, .2);
    expect(pet.pet._fname).toBe('neutral');
    expect(pet.doWord('kneel')).toBe(false);
    expect(pet.doGroup).toBeUndefined();
    const body = bareBody();
    expect(body.doAll).toBeUndefined();
    body.dispose();
    // a face composed of two (`eyes+mouth`) is a name a body without plus does not know: upstream's plain face, no sound
    const heard = [];
    const plain = barePet(undefined, { plus: false, sfx: { play: (n, k) => heard.push([n, k]) } });
    run(plain, 1);
    plain.setExpr('surprised+happy');
    run(plain, .2);
    expect(plain.pet._fc.parts).toBeUndefined();
    expect(plain.pet._fc.eyes).toEqual(FACES.neutral.f(0).eyes);
    expect(heard.filter(([, k]) => k === 'face')).toEqual([]);
    expect(plain.doWord('surprised+happy')).toBe(false);
  });

  it("frames and faces are upstream's (v0.1.17) through faces, gestures, postures, covers, a poke and a pat, frame by frame", async () => {
    const up = await upstreamKit();
    if (!up) return;
    const ours = await import('../packages/cortico-world-desktop-pet/web/kit/body.js');
    const FIELDS = ['look', 'legs', 'low', 'blink', 'eyeClose', 'face', 'mode', 'modeT', 'talk', 'drowse', 'sit', 'facing', 'tilt', 'lean', 'groupRot', 'gesture'];
    const frames = (kit, W) => seeded(() => {
      const log = [], el = () => ({ setAttribute() {}, innerHTML: '' });
      const petG = { setAttribute(k, v) { log.push(v); }, innerHTML: '' };
      const fig = { draw(g, face, o) {
        log.push(JSON.stringify([FIELDS.map((k) => o[k]), face.eyes, face.gap, face.blush]));
        if (kit === ours) { expect('head' in o).toBe(false); expect('parts' in face).toBe(false); }
      } };
      const pet = kit.createPet({ petG, shadowEl: el(), fxG: el() }, {
        sfx: { play() {} }, figure: fig, plus: false, roam: 'off', words: { roll: { motion: { seconds: 1.5 } } },
        bounds: () => ({ W, H: 400, floorY: 380, S: .42 }),
      });
      pet.resize();
      const steps = [
        () => pet.setExpr('happy'), () => pet.doWord('nod'), () => pet.doWord('wave'), () => pet.doWord('sit'), () => pet.doWord('nod'),
        () => pet.doWord('shake'), () => pet.doWord('stand'), () => pet.doWord('look'), () => pet.setExpr('confused'),
        () => { pet.walkTo(W * .3, false, 7); pet.setExpr('happy'); }, () => { pet.act('dizzy'); pet.setExpr('happy'); },
        () => { pet.setExpr('angry'); pet.setListening(true); }, () => pet.setListening(false), () => pet.setExpr('angry'),
        () => pet.doWord('jump'), () => pet.doWord('roll'), () => pet.setExpr('smirk'), () => pet.doWord('lol'),
        // a poke, then a pat (strokes over her)
        () => { const p = pet.toStage(128, 128); pet.pointerDown({ ...p, t: 0 }); pet.pointerUp({ ...p, t: 100 }); },
        () => { const p = pet.toStage(128, 128); for (let i = 0; i < 12; i++) pet.pointerMove({ x: p.x + (i % 2 ? 40 : -40), y: p.y, t: 200 + i * 16 }); },
      ];
      for (const s of steps) { s(); run(pet, 1.2); }
      return log;
    }, 5);
    for (const W of [1200, 300, 104]) {
      const a = frames(ours, W), b = frames(up, W);
      expect(a.length, String(W)).toBe(b.length);
      expect(a.findIndex((s, i) => s !== b[i]), String(W)).toBe(-1);
    }
  });
});

describe('faces made of parts of others (plus)', () => {
  const kitFace = (n) => PLUS_FACES[n] ?? FACES[n];
  it('each is made of kit faces (never stone), adds only fields every figure reads, and has a tone of its own', () => {
    expect(Object.keys(PLUS_MIXES).length).toBeGreaterThanOrEqual(20);
    for (const [n, d] of Object.entries(PLUS_MIXES)) {
      expect(FACES[n] ?? PLUS_FACES[n], n).toBeUndefined();
      expect(PLUS_EXPRESSIONS, n).toContain(n);
      for (const k of ['eyes', 'mouth', 'brows', 'body', 'marks']) {
        if (d[k] === undefined) continue;
        expect(kitFace(d[k]), `${n}.${k}`).toBeDefined();
        expect(d[k], `${n}.${k}`).not.toBe('petrify');
      }
      for (const k of Object.keys(d.add ?? {})) expect(ADD_KEYS, `${n}.add.${k}`).toContain(k);
      const fc = PLUS_MIX_FACES[n].f(.5);
      for (const k of ['stone', 'crack', 'freeze']) expect(fc[k], `${n}.${k}`).toBeUndefined();
      // one of the tones the other faces play
      expect(Object.entries(EXPR_TONES).filter(([f]) => !(f in PLUS_MIXES)).map(([, t]) => t), n).toContain(EXPR_TONES[n]);
      expect(d.label, n).toBe(vocabOf('coo').find((w) => w.id === n).names.zh[0]);
    }
  });

  it('takes the eyes, brows, mouth, body language and marks each from its own face, and says which in `parts`', () => {
    for (const [n, d] of Object.entries(PLUS_MIXES)) {
      const fc = PLUS_MIX_FACES[n].f(.5), part = (k) => kitFace(d[k] ?? d.eyes).f(.5);
      const eyes = kitFace(d.eyes).f(.5), mouth = kitFace(d.mouth).f(.5);
      expect(fc.parts, n).toEqual({ eyes: d.eyes, brows: d.brows ?? d.eyes, mouth: d.mouth, body: d.body ?? d.eyes });
      expect(fc.eyes, n).toEqual(eyes.eyes);
      expect(fc.sparkle, n).toEqual(eyes.sparkle);
      expect(fc.gap, n).toEqual(mouth.gap);
      for (const k of ['cat', 'tongue']) expect(fc[k], `${n}.${k}`).toEqual(mouth[k]);
      expect(fc.brows, n).toEqual(part('brows').brows);
      for (const k of ['lean', 'titter', 'rock', 'shake']) expect(fc[k], `${n}.${k}`).toEqual(d.add?.[k] ?? part('body')[k]);
      for (const k of ['sweat', 'anger', 'bang', 'question', 'gloom']) expect(fc[k], `${n}.${k}`).toEqual(d.add?.[k] ?? part('marks')[k]);
      if (d.add?.blush !== undefined) expect(fc.blush, n).toBe(d.add.blush);
    }
    // e.g. laughing so hard she cries: crying eyes, a happy mouth, a giggle's fits and no sad brows
    const lc = PLUS_MIX_FACES.laughcry.f(.5);
    expect(lc.streams).toBe(true);
    expect(lc.gap).toEqual(FACES.happy.f(0).gap);
    expect(lc.brows).toBeUndefined();
  });

  it('a plus body does each as a word, draws it on Coo with its tone, and glints for a smirk', () => {
    for (const n of Object.keys(PLUS_MIXES)) {
      const pet = hearingPet();
      run(pet, 1);
      expect(pet.doWord(n), n).toBe(true);
      run(pet, .5);
      expect(pet.pet._fname, n).toBe(n);
      expect(pet.pet._fc.parts.eyes, n).toBe(PLUS_MIXES[n].eyes);
      expect(pet.pet.exprAsked, n).toBe(true);
      expect(pet.heard, n).toContainEqual([EXPR_TONES[n], 'face']);
      expect(pet.petHtml().match(/class="eye"/g)?.length ?? 0, n).toBeGreaterThan(0);
      // a motion after it keeps it, as any asked-for face
      pet.doWord('wave');
      run(pet, .3);
      expect(pet.pet._fname, n).toBe(n);
    }
    const glints = (n) => { const pet = barePet(); run(pet, 1); pet.setExpr(n); run(pet, .2); return (pet.fxHtml().match(/#e0a100/g) || []).length; };
    expect(glints('smirk')).toBeGreaterThan(glints('sulk'));
    // a body without plus knows none of them, and draws its plain face for the name
    const plain = barePet(undefined, { plus: false });
    run(plain, 1);
    for (const n of Object.keys(PLUS_MIXES)) expect(plain.doWord(n), n).toBe(false);
    plain.setExpr('smirk');
    run(plain, .2);
    expect(plain.pet._fc.parts).toBeUndefined();
  });

  it('names `eyes+mouth` and `eyes+mouth+body` faces, a pack word as a part, but takes none of them as a word', () => {
    const pet = barePet(undefined, { words: { sniff: { expression: { like: 'sad' } } } });
    run(pet, 1);
    expect(pet.doWord('happy+pout')).toBe(false);
    pet.setExpr('happy+pout');
    run(pet, .2);
    expect(pet.pet._fc.parts).toEqual({ eyes: 'happy', brows: 'happy', mouth: 'pout', body: 'happy' });
    expect(pet.pet._fc.gap).toEqual(FACES.pout.f(0).gap);
    pet.setExpr('sniff+happy');
    run(pet, .2);
    expect(pet.pet._fc.parts.eyes).toBe('sad');
    expect(() => { pet.setExpr('nosuch+happy'); run(pet, .2); }).not.toThrow();
    expect(pet.pet._fc.parts.eyes).toBe('neutral');
    // a pack word may be like one of the faces made of parts
    const like = barePet(undefined, { words: { grin: { expression: { like: 'smirk' } } } });
    run(like, 1);
    like.setExpr('grin');
    run(like, .2);
    expect(like.pet._fc.parts?.eyes).toBe('smug');
  });

  it('asked over a song or a book, one keeps its own eyes, brows and marks on the gesture\'s body', () => {
    const pet = barePet();
    run(pet, 1);
    pet.setExpr('huff');
    pet.act('song');
    run(pet, .5);
    expect(pet.pet._fname).toBe('huff+singing+singing');
    expect(pet.pet._fc.parts).toEqual({ eyes: 'angry', brows: 'angry', mouth: 'singing', body: 'singing' });
    expect(pet.pet._fc.anger).toBe(true);
    expect(pet.pet._fc.blush).toBe(PLUS_MIXES.huff.add.blush);
    const reader = barePet();
    run(reader, 1);
    reader.setExpr('smirk');
    reader.act('read');
    run(reader, .5);
    expect(reader.pet._fname).toBe('smirk+smirk+reading');
    expect(reader.pet._fc.parts).toEqual({ eyes: 'smug', brows: 'smug', mouth: 'happy', body: 'reading' });
    expect(reader.pet._fc.gap).toEqual(FACES.happy.f(0).gap);
  });

  it('all five figures know them, by the same names, right after the other expressions', () => {
    const ids = Object.keys(PLUS_MIXES);
    const vocabs = ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan'].map((p) => [p, vocabOf(p)]);
    const names = (v) => ids.map((id) => v.find((w) => w.id === id)?.names);
    for (const [p, v] of vocabs) {
      const at = v.findIndex((w) => w.id === ids[0]);
      expect(v.slice(at, at + ids.length).map((w) => w.id), p).toEqual(ids);
      expect(v.slice(0, at).every((w) => w.kind === 'expression'), p).toBe(true);
      expect(v.slice(at + ids.length).every((w) => w.kind === 'motion'), p).toBe(true);
      for (const w of v.slice(at, at + ids.length)) {
        expect(w.kind, w.id).toBe('expression');
        expect(w.seconds, w.id).toBe(.9);
        expect(w.about.zh.length, w.id).toBeGreaterThan(5);
      }
      expect(names(v), p).toEqual(names(vocabs[0][1]));
      // no name is two words'
      const all = v.flatMap((w) => [w.id, ...Object.values(w.names).flat()]);
      expect(all.length - new Set(all).size, p).toBe(0);
    }
    // the whale and the girls say the same of them (Coo has no mouth to describe)
    const about = (v) => ids.map((id) => v.find((w) => w.id === id).about);
    for (const [p, v] of vocabs.slice(2)) expect(about(v), p).toEqual(about(vocabs[1][1]));
  });
});

describe('two faces of one group shown as one (plus)', () => {
  const paired = (opts = {}) => { const pet = hearingPet(opts); run(pet, 1); pet.heard.length = 0; return pet; };
  const glintsIn = (pet) => (pet.fxHtml().match(/#e0a100/g) || []).length;
  /** The plain faces two of which make one: every face asked for alone, less neutral, stone and the faces made of parts. */
  const PLAIN = [...KIT_EXPRESSIONS, ...PLUS_EXPRESSIONS.filter((n) => !PLUS_MIXES[n])].filter((n) => n !== 'neutral' && n !== 'petrify');

  it("two faces are one asked-for face, `eyes+mouth`: the first one's eyes, the second one's mouth", () => {
    for (const [eyes, mouth] of [['surprised', 'happy'], ['happy', 'surprised']]) {
      const pet = paired();
      expect(pet.doGroup([eyes, mouth]), eyes).toEqual([true, true]);
      run(pet, .3);
      expect(pet.pet.expr, eyes).toBe(`${eyes}+${mouth}`);
      expect(pet.pet.exprAsked, eyes).toBe(true);
      expect(pet.pet._fname, eyes).toBe(`${eyes}+${mouth}`);
      const fc = pet.pet._fc;
      expect(fc.parts, eyes).toEqual({ eyes, brows: eyes, mouth, body: eyes });
      expect(fc.gap, eyes).toEqual(FACES[mouth].f(0).gap);
    }
    const pet = paired();
    pet.doGroup(['surprised', 'happy']);
    run(pet, .3);
    expect(pet.pet._fc.eyes).toEqual(FACES.surprised.f(0).eyes);
    expect(pet.pet._fc.eyes[0].rx).toBe(20);
    expect(pet.pet._fc.bang).toBe(true);
  });

  it('a group with one face, or the plain face or stone as the other, is done as before', () => {
    for (const [ws, name] of [[['happy', 'happy'], 'happy'], [['happy', 'neutral'], 'neutral'], [['sit', 'happy'], 'happy']]) {
      const pet = paired();
      pet.doGroup(ws);
      run(pet, .05);
      expect(pet.pet.expr, ws.join()).toBe(name);
    }
    const stone = paired();
    stone.doGroup(['happy', 'petrify']);
    expect(stone.pet.expr).toBe('petrify');
  });

  it('of three faces, the first two make the face, shown over the third, wherever the others are', () => {
    for (const [ws, name] of [[['surprised', 'happy', 'sad'], 'surprised+happy'], [['sad', 'surprised', 'happy'], 'sad+surprised'],
      [['surprised', 'sit', 'happy', 'sad'], 'surprised+happy']]) {
      const pet = paired();
      expect(pet.doGroup(ws), ws.join()).toEqual(ws.map(() => true));
      run(pet, .2);
      expect(pet.pet._fname, ws.join()).toBe(name);
    }
  });

  it('is kept by the motions after it, over a book or a song keeps its eyes, and goes with sleep or a plain face', () => {
    const pet = paired();
    pet.doGroup(['surprised', 'happy']);
    run(pet, .2);
    pet.act('nod');
    run(pet, .3);
    expect(pet.pet._fname).toBe('surprised+happy');
    pet.act('wave');
    run(pet, .3);
    expect(pet.pet._fname).toBe('surprised+happy');
    pet.act('read');
    run(pet, .3);
    expect(pet.pet._fname).toBe('surprised+happy+reading');
    expect(pet.pet._fc.parts).toEqual({ eyes: 'surprised', brows: 'surprised', mouth: 'happy', body: 'reading' });
    expect(pet.pet._fc.gap).toEqual(FACES.happy.f(0).gap);
    const singer = paired();
    singer.doGroup(['surprised', 'happy']);
    singer.act('song');
    run(singer, .5);
    expect(singer.pet._fname).toBe('surprised+singing+singing');
    expect(singer.pet._fc.parts.eyes).toBe('surprised');
    singer.act('sleep');
    expect(singer.pet.expr).toBe(null);
    const plain = paired();
    plain.doGroup(['surprised', 'happy']);
    run(plain, .2);
    plain.setExpr('neutral');
    run(plain, .2);
    expect(plain.pet._fname).toBe('neutral');
  });

  it('waits under a cover like any asked-for face', () => {
    const pet = paired();
    pet.doGroup(['surprised', 'happy']);
    run(pet, .5);
    pet.setListening(true);
    run(pet, 1);
    expect(pet.pet._fname).toBe('listening');
    pet.setListening(false);
    let t = 0;
    while (t < 8) { run(pet, 1 / 60); if (pet.pet._fname !== 'surprised+happy') break; t += 1 / 60; }
    expect(t).toBeGreaterThan(2.6);
    expect(t).toBeLessThan(2.8);
  });

  it("sounds, glints and bounces as its eyes' face (else the mouth's tone), and lasts as long as either would", () => {
    const pet = paired();
    pet.doGroup(['surprised', 'happy']);
    expect(pet.heard.filter(([, k]) => k === 'face')).toEqual([['surprised', 'face']]);
    expect(pet.pet.sqv).toBeLessThan(0);
    expect(pet.pet.exprUntil - pet.time).toBeCloseTo(3.2, 5);
    run(pet, .2);
    expect(glintsIn(pet)).toBe(0);
    for (const ws of [['sleepy', 'gentle'], ['gentle', 'sleepy']]) {
      const sleepy = paired();
      sleepy.doGroup(ws);
      expect(sleepy.heard.filter(([, k]) => k === 'face'), ws.join()).toEqual([[ws[0] === 'sleepy' ? 'yawn' : 'soft', 'face']]);
      expect(sleepy.pet.exprUntil - sleepy.time, ws.join()).toBeCloseTo(4.4, 5);
    }
    // thinking has no tone of its own: the mouth's plays
    const thinking = paired();
    thinking.doGroup(['thinking', 'happy']);
    expect(thinking.heard.filter(([, k]) => k === 'face')).toEqual([['happy', 'face']]);
    // happy eyes glint twice, smug eyes once, as those faces do
    for (const [ws, n] of [[['happy', 'sad'], 2], [['smug', 'sad'], 1], [['sad', 'happy'], 0]]) {
      const g = paired();
      g.doGroup(ws);
      run(g, .1);
      expect(glintsIn(g), ws.join()).toBe(n);
    }
  });

  it("a pack's own face and a face made of parts give their eyes or their mouth like any other", () => {
    const pet = paired({ words: { grin: { expression: { like: 'happy', sound: 'pop' } } } });
    pet.doGroup(['grin', 'surprised']);
    expect(pet.heard.filter(([, k]) => k === 'face')).toEqual([['pop', 'face']]);
    run(pet, .2);
    expect(pet.pet._fname).toBe('grin+surprised');
    expect(pet.pet._fc.parts).toMatchObject({ eyes: 'happy', mouth: 'surprised' });
    pet.doGroup(['surprised', 'grin']);
    run(pet, .2);
    expect(pet.pet._fc.parts).toMatchObject({ eyes: 'surprised', mouth: 'happy' });
    const mix = paired();
    mix.doGroup(['smirk', 'cry']);
    run(mix, .2);
    expect(mix.pet._fc.parts).toMatchObject({ eyes: PLUS_MIXES.smirk.eyes, mouth: 'cry' });
  });

  it('is no word, but setExpr shows it', () => {
    const pet = paired();
    expect(pet.doWord('surprised+happy')).toBe(false);
    pet.setExpr('surprised+happy');
    run(pet, .2);
    expect(pet.pet._fname).toBe('surprised+happy');
    expect(pet.pet._fc.parts.mouth).toBe('happy');
  });

  it('every two plain faces (26), either way round, make a face of the first one\'s eyes and the second one\'s mouth, and no stone', () => {
    expect(PLAIN.length).toBe(26);
    for (const n of PLAIN) expect(PLUS_FACES[n] ?? FACES[n], n).toBeDefined();
    const pet = barePet();
    run(pet, 1);
    let n = 0;
    for (const eyes of PLAIN) {
      for (const mouth of PLAIN) {
        if (eyes === mouth) continue;
        n++;
        expect(pet.doGroup([eyes, mouth]), `${eyes}+${mouth}`).toEqual([true, true]);
        run(pet, 1 / 30);
        expect(pet.pet._fname, `${eyes}+${mouth}`).toBe(`${eyes}+${mouth}`);
        const fc = pet.pet._fc;
        expect(fc.parts, `${eyes}+${mouth}`).toEqual({ eyes, brows: eyes, mouth, body: eyes });
        expect(fc.gap, `${eyes}+${mouth}`).toBeDefined();
        for (const k of ['stone', 'crack', 'freeze']) expect(fc[k], `${eyes}+${mouth}.${k}`).toBeUndefined();
        pet.setExpr('neutral', .01);
        run(pet, 1 / 30);
      }
    }
    expect(n).toBe(650);
  });

  it("the built-in figures' pairs: the World sends each as its manifest says, and the kit shows those eyes and that mouth (the three girls the same)", () => {
    const maps = {};
    const mixes = new Set(Object.values(PLUS_MIXES).map((d) => `${d.eyes}+${d.mouth}`));
    for (const p of ['coo', 'whale', 'claude-chan', 'gpt-chan', 'gemini-chan']) {
      const m = readManifest(fileURLToPath(new URL(`web/${p}/`, PKG)), true);
      expect(typeof m, p).toBe('object');
      maps[p] = m.pairs;
      const pet = barePet();
      run(pet, 1);
      for (const [k, v] of Object.entries(m.pairs)) {
        const [a, b] = k.split('~');
        if ('as' in v) {
          const mix = PLUS_MIXES[v.as];
          expect(mix, `${p} ${k}`).toBeDefined();
          expect([mix.eyes, mix.mouth].sort(), `${p} ${k}`).toEqual([a, b].sort());
          continue;
        }
        // plain faces only, and none a mix's eyes and mouth (that pair is listed as the mix)
        expect(PLAIN, `${p} ${k}`).toContain(v.eyes);
        expect(PLAIN, `${p} ${k}`).toContain(v.mouth);
        expect(mixes.has(`${v.eyes}+${v.mouth}`), `${p} ${k}`).toBe(false);
        for (const ws of [[a, b], [b, a]]) {
          const { actions, notes } = parseActions([ws.join('+')], m.vocab, m.pairs);
          expect(actions, `${p} ${ws}`).toEqual([`${v.eyes}+${v.mouth}`]);
          expect(notes[0], `${p} ${ws}`).toMatch(/合成了一张脸/);
          pet.doGroup(actions[0].split('+'));
          run(pet, 1 / 30);
          expect(pet.pet._fc.parts, `${p} ${ws}`).toMatchObject({ eyes: v.eyes, mouth: v.mouth });
          pet.setExpr('neutral', .01);
          run(pet, 1 / 30);
        }
      }
    }
    expect(maps['gpt-chan']).toEqual(maps['claude-chan']);
    expect(maps['gemini-chan']).toEqual(maps['claude-chan']);
    // the whitelists as judged: Coo the fewest, the girls the most
    expect(Object.keys(maps.coo).length).toBe(24);
    expect(Object.keys(maps.whale).length).toBe(81);
    expect(Object.keys(maps['claude-chan']).length).toBe(118);
  });
});

describe("a face in a group lasts as long as the group's gestures (plus)", () => {
  /** The face names shown, frame by frame, for `seconds` from now. */
  const names = (pet, seconds) => { const out = []; for (let i = 0; i < seconds * 60; i++) { run(pet, 1 / 60); out.push(pet.pet._fname); } return out; };
  const fresh = (opts) => { const pet = barePet(undefined, opts); run(pet, 1); return pet; };

  it('a song, a book or a cup in the group: the asked face shows to the end of its own face, never the gesture\'s after it', () => {
    const song = fresh();
    song.doGroup(['song', 'smirk']);
    run(song, 3.5);
    expect(song.pet._fname).toBe('smirk+singing+singing');
    run(song, .5);
    expect(song.pet._fname).toBe('smirk+singing+singing');
    run(song, .3);
    expect(song.pet._fname).not.toMatch(/singing/);
    const read = fresh();
    read.doGroup(['read', 'angry']);
    run(read, 4.2);
    expect(read.pet._fname).toBe('angry+angry+reading');
    const sip = fresh();
    sip.doGroup(['sip', 'happy']);
    run(sip, 3.6);
    expect(sip.pet._fc.parts?.eyes ?? sip.pet._fname).toBe('happy');
    expect(sip.pet.exprAsked).toBe(true);
    for (const g of ['song', 'read', 'sip', 'serve', 'stretch', 'hug', 'cross', 'away', 'dance', 'sigh', 'cover']) {
      const pet = fresh();
      pet.doGroup([g, 'angry']);
      const seen = names(pet, 6);
      const last = seen.findLastIndex((n) => n.split('+')[0] === 'angry');
      expect(last, g).toBeGreaterThan(3.1 * 60);
      expect(seen.slice(0, last + 1).every((n) => n.split('+')[0] === 'angry'), g).toBe(true);
      expect(seen.slice(last + 1).every((n) => n === 'neutral'), `${g}: ${[...new Set(seen.slice(last + 1))]}`).toBe(true);
    }
  });

  it('a dance in the group: the face outlasts the dance\'s own happy face', () => {
    const pet = fresh();
    pet.doGroup(['dance', 'angry']);
    run(pet, 3.3);
    expect(pet.pet.exprAsked).toBe(true);
    expect(pet.pet._fname).toBe('angry');
  });

  it('a walk or a look in the group does not stretch it', () => {
    const walk = fresh();
    const t0 = walk.time;
    walk.doGroup(['walk', 'happy']);
    expect(walk.pet.exprUntil - t0).toBeCloseTo(3.2, 5);
    const look = fresh();
    look.doGroup(['look', 'confused']);
    expect(look.pet.exprUntil - look.time).toBeCloseTo(3.2, 5);
  });

  it('lasts as long as the face asked for and then the gesture done one after the other; a face asked mid-gesture is unchanged', () => {
    const group = fresh(), seq = fresh();
    group.doGroup(['song', 'smirk']);
    seq.setExpr('smirk');
    seq.act('song');
    expect(group.time).toBe(seq.time);
    expect(group.pet.exprUntil).toBeCloseTo(seq.pet.exprUntil, 9);
    expect(group.pet.nextAt).toBeCloseTo(seq.pet.nextAt, 9);
    // the gesture first and the face after, not in a group: the song's own face comes back for the rest of it
    const after = fresh();
    after.act('song');
    after.setExpr('smirk');
    run(after, 3.5);
    expect(after.pet._fname).toBe('singing');
  });

  it('two faces composed in a group with a song last through the song', () => {
    const pet = fresh();
    pet.doGroup(['song', 'surprised', 'happy']);
    run(pet, 4);
    expect(pet.pet._fname).toBe('surprised+singing+singing');
    run(pet, .3);
    expect(pet.pet._fname).toBe('neutral');
  });
});
