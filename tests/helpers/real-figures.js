/**
 * The five rig figures (the whale and the four girls) as the app runs them: each one's own figure.js on the kit's body
 * (plus), with every texture there, without a GPU (the test file that uses this mocks kit/rig.js).
 */
import { readFileSync } from 'node:fs';
import { createPet } from '../../packages/cortico-world-desktop-pet/web/kit/body.js';
import { createWhaleFigure } from '../../packages/cortico-world-desktop-pet/web/whale/figure.js';
import { createClaudeFigure } from '../../packages/cortico-world-desktop-pet/web/claude-chan/figure.js';
import { createGptFigure } from '../../packages/cortico-world-desktop-pet/web/gpt-chan/figure.js';
import { createGeminiFigure } from '../../packages/cortico-world-desktop-pet/web/gemini-chan/figure.js';
import { createGrokFigure } from '../../packages/cortico-world-desktop-pet/web/grok-chan/figure.js';

const WEB = new URL('../../packages/cortico-world-desktop-pet/web/', import.meta.url);
export const FIGURES = { whale: createWhaleFigure, 'claude-chan': createClaudeFigure, 'gpt-chan': createGptFigure, 'gemini-chan': createGeminiFigure, 'grok-chan': createGrokFigure };
export const dirOf = id => new URL(`${id}/`, WEB);
export const modelOf = id => JSON.parse(readFileSync(new URL('model.json', dirOf(id)), 'utf8'));

// a do-nothing stand-in for whatever DOM or 2D canvas call a figure makes (numbers read as 0)
const any = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any), set: () => true, apply: () => any });
const fakeDoc = { createElement: () => any, createElementNS: () => any };

/**
 * Figure `id` on the kit. `run(sec, { draw })`: that many 1/60 s steps, each drawn (the window shown) or, with `draw`
 * false, only stepped (the window hidden: the kit moves on, nothing is drawn); `each(seen, o)` after each drawn frame.
 * `frame()`: the kit's last frame handed to the figure. Call `done()` at the end.
 */
export async function figureOnKit(id, seen) {
  const doc = globalThis.document;
  globalThis.document = fakeDoc;
  const model = modelOf(id);
  const fig = await FIGURES[id](dirOf(id), { model, asset: p => String(p), loadImage: async url => ({ width: 1, height: 1, url: String(url) }) });
  const petG = { setAttribute() {}, append() {}, contains: () => true, getScreenCTM: () => null, textContent: '' };
  let last = null;
  const figure = { ...fig, draw(g, fc, o) { last = o; fig.draw(g, fc, o); } };
  for (const k of ['anchors', 'poses', 'gestures', 'roll', 'kneelArms']) Object.defineProperty(figure, k, { get: () => fig[k] });
  const el = () => ({ setAttribute() {}, innerHTML: '' });
  const pet = createPet({ petG, shadowEl: el(), fxG: el() }, { sfx: { play() {} }, figure, plus: true, roam: 'off', bounds: () => ({ W: 1200, H: 400, floorY: 380, S: .42 }) });
  pet.resize();
  const run = (sec, { draw = true, each = () => {} } = {}) => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      pet.step(1 / 60);
      if (draw) { pet.render(); each(seen, last); }
    }
  };
  return { pet, run, fig, model, frame: () => last, done: () => { globalThis.document = doc; } };
}
