import { describe, expect, it } from 'vitest';
import { figurePacks } from 'cortico-world-desktop-pet';
import { figureSchemes, schemeForSkin } from '../core/console-theme.ts';
// @ts-expect-error: a page module in plain JS
import { accentColors, accentCss } from '../packages/cortico-world-desktop-pet/web/accent.js';

const packs = figurePacks([]).packs;
const schemes = new Map(figureSchemes(packs).map((s) => [s.id, s]));
/** A pack as /api/figures lists it to the pet page (src/server.ts): the fields accent.js reads. */
const listed = (id: string) => {
  const p = packs.find((x) => x.id === id)!;
  return { id: p.id, axes: p.manifest.axes, presets: p.manifest.presets };
};
/** Every look of a pack: each option of its first axis alone, and each combination of all its axes. */
function looks(id: string): string[] {
  const axes = packs.find((x) => x.id === id)!.manifest.axes;
  let all: string[][] = [[]];
  for (const a of axes) all = all.flatMap((pre) => a.options.map((o) => [...pre, o.id]));
  return [...axes[0]!.options.map((o) => o.id), ...all.map((l) => l.join('-'))];
}

describe("the pet bubble's theme colour (web/accent.js, --skin-eye)", () => {
  it('is the settings window accent of the same look for every built-in pack but Coo, in every scheme and outfit', () => {
    const others = packs.filter((p) => p.builtin && p.id !== 'coo').map((p) => p.id);
    expect(others).toEqual(expect.arrayContaining(['whale', 'claude-chan', 'gpt-chan', 'gemini-chan', 'grok-chan']));
    for (const id of others) {
      for (const scheme of looks(id)) {
        const window = schemes.get(schemeForSkin({ figure: id, scheme }, packs))!;
        expect(window, `${id} ${scheme}`).toBeDefined();
        expect(accentColors(listed(id), { figure: id, scheme }), `${id} ${scheme}`).toEqual({ light: window.palettes.light.accent, dark: window.palettes.dark.accent });
      }
    }
  });

  it("differs between the whale's schemes, and is the same in both of her outfits", () => {
    const whale = listed('whale');
    expect(accentColors(whale, { scheme: 'deepseek' })).not.toEqual(accentColors(whale, { scheme: 'claude' }));
    expect(accentColors(whale, { scheme: 'claude-cape' })).toEqual(accentColors(whale, { scheme: 'claude' }));
    expect(accentColors(listed('gemini-chan'), { scheme: 'original-winter' })).toEqual(accentColors(listed('gemini-chan'), { scheme: 'original' }));
  });

  it("leaves Coo's to its palette, and an unknown look wears the first preset", () => {
    expect(accentColors(listed('coo'), { palette: 'mint' })).toBeNull();
    expect(accentColors(null, {})).toBeNull();
    const whale = listed('whale');
    expect(accentColors(whale, {})).toEqual(accentColors(whale, { scheme: whale.presets[0]!.id }));
  });

  it("takes an imported pack's colours only as plain hex, else its preset accent, else none", () => {
    const pack = (presets: unknown[]) => ({ id: 'x', axes: [{ id: 'scheme', options: [{ id: 'a' }] }], presets });
    const hues = (a: string) => ({ a, a2: a, on: '#fff', t: a, c3: a, c4: a });
    expect(accentColors(pack([{ id: 'a', pick: { scheme: 'a' }, console: { light: hues('#123456'), dark: hues('#abc') } }]), { scheme: 'a' })).toEqual({ light: '#123456', dark: '#abc' });
    // CSS would run from a pack's figure.json otherwise
    const bad = pack([{ id: 'a', pick: { scheme: 'a' }, accent: '#00ff00', console: { light: hues('red}body{display:none'), dark: hues('#000') } }]);
    expect(accentColors(bad, { scheme: 'a' })).toEqual({ light: '#00ff00', dark: '#00ff00' });
    expect(accentColors(pack([{ id: 'a', pick: { scheme: 'a' }, accent: 'url(x)' }]), { scheme: 'a' })).toBeNull();
  });

  it('writes the light colour, and the dark one for a dark page by setting or by system', () => {
    expect(accentCss(null)).toBe('');
    const css = accentCss({ light: '#111111', dark: '#eeeeee' });
    expect(css).toBe('html:root{--skin-eye:#111111}@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){--skin-eye:#eeeeee}}html:root[data-theme="dark"]{--skin-eye:#eeeeee}');
  });
});
