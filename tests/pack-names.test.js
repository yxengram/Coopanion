// The exported packs must not read as official ones (upstream #614): nothing the import dialog or the dressing page
// shows names Coopanion as their maker, and each pack's README says who made it. The ids from before the rename
// stay aliases of the built-in figures.
import { describe, expect, it } from 'vitest';
import * as whale from '../packages/cortico-world-desktop-pet/scripts/export-whale-pack.mjs';
import * as claude from '../packages/cortico-world-desktop-pet/scripts/export-claude-pack.mjs';
import * as gpt from '../packages/cortico-world-desktop-pet/scripts/export-gpt-pack.mjs';
import * as gemini from '../packages/cortico-world-desktop-pet/scripts/export-gemini-pack.mjs';
import * as grok from '../packages/cortico-world-desktop-pet/scripts/export-grok-pack.mjs';
import { PACK_ALIASES } from '../packages/cortico-world-desktop-pet/src/packs.ts';

const PACKS = [['whale', whale], ['claude-chan', claude], ['gpt-chan', gpt], ['gemini-chan', gemini], ['grok-chan', grok]];

describe.each(PACKS)('exported %s pack names', (id, pack) => {
  it('does not name Coopanion as its maker', async () => {
    const m = await pack.buildManifest({ upstreamTones: await whale.upstreamTones(), volumes: {} });
    expect(m.id).toBe(`yxengram-${id}`);
    expect(m.author).toBe('yxengram (https://github.com/yxengram/Coopanion)');
    for (const text of [m.id, ...Object.values(m.name), ...m.credits.map((c) => c.name)]) expect(text).not.toMatch(/coopanion/i);
    // the code is largely upstream's: its authors stay credited, with the link
    expect(m.credits).toContainEqual(expect.objectContaining({ name: 'Pal-AI-Lab', url: 'https://github.com/Pal-AI-Lab/Coopanion' }));
  });

  it('says in its README that it is not official', async () => {
    const m = await pack.buildManifest({ upstreamTones: await whale.upstreamTones(), volumes: {} });
    const head = pack.packReadme(m, []).split('\n').slice(0, 5).join('\n');
    expect(head).toContain('yxengram 维护的 Coopanion 分支');
    expect(head).toContain('不是 Coopanion 官方出品');
    expect(pack.packReadme(m, [])).toContain('改自原版 Coopanion(https://github.com/Pal-AI-Lab/Coopanion)');
  });

  it('is an alias of the built-in figure under its new and its old id', () => {
    expect(PACK_ALIASES[`yxengram-${id}`]).toBe(id);
    expect(PACK_ALIASES[`coopanion-${id}`]).toBe(id);
  });
});
