/**
 * Outfits, a rig figure's second axis (the four girls': classic and winter), as model.json describes them:
 *
 *   "outfits": [ { "id": "classic" },                    the first outfit: model.parts and model.poses as they are
 *                { "id": "winter", "parts": [...],        the whole standing part list (a part with `src` is the
 *                  "pivots"?, "rects"?, "poses": {...} }   outfit's own file; one without is the classic texture)
 *              ]
 *
 * Another outfit's `poses` are whole pose objects (their own boxes, pivots and files): a pose it does not list does not
 * exist in it, so no classic drawing ever shows on it and the figure does without that pose (the rig's arms, the
 * seated rig, a quick flip, the kit's spin), as for a pose whose files are missing.
 * Nothing here is used by kit/body.js: a figure that imports it builds its rig from `outfitModel(model, outfit)`.
 */

/**
 * What a look id picks: `<scheme>-<outfit>` (the pack's two axes, as skin.scheme stores them), a bare `<scheme>` being
 * the first outfit; a part it does not know (another version's scheme or outfit) falls back to the first option of its
 * axis. Option ids have no `-` (packs.ts OPTION_ID).
 */
export function pickOf(model, id) {
  const schemes = (model.schemes || [{ id: 'original' }]).filter(sc => sc.ready !== false), outfits = model.outfits || [{ id: 'classic' }];
  const [c, o] = String(id ?? '').split('-');
  return { scheme: (schemes.find(sc => sc.id === c) || schemes[0]).id, outfit: (outfits.find(x => x.id === o) || outfits[0]).id };
}

/**
 * The model the rig of outfit `of` is built from: the model itself for the first outfit (or one without a part list of
 * its own), else the model with that outfit's parts, poses, and pivots and rects over the model's.
 */
export function outfitModel(model, of) {
  const O = (model.outfits || []).find(x => x.id === of);
  if (!O?.parts) return model;
  return { ...model, parts: O.parts, pivots: { ...model.pivots, ...O.pivots }, rects: { ...model.rects, ...O.rects }, poses: O.poses || {} };
}

/** Where a part's texture file is: its own `src` (an outfit's drawing, the same in every scheme), else `<dir>tex/<tex>.png`. */
export const texPath = (p, dir = '') => p.src || `${dir}tex/${p.tex}.png`;
