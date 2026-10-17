import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { releaseNotes, settingChanges } from '../core/notice.ts';

/** A releases directory with one file per version, each `## 下载` section after its body. */
function releases(versions: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'coo-notes-'));
  for (const v of versions) writeFileSync(join(dir, `v${v}.md`), `# Coopanion v${v}\n\n本版 ${v}\n\n## 下载\n\n- 安装包 ${v}\n`);
  return dir;
}

describe('releaseNotes', () => {
  it('takes the versions after the last one run up to the running one, in version order', () => {
    // 0.1.9 sorts after 0.1.10 as text
    const dir = releases(['0.1.8', '0.1.9', '0.1.10', '0.1.11', '0.1.12']);
    expect(releaseNotes(dir, '0.1.8', '0.1.11').map((n) => n.version)).toEqual(['0.1.9', '0.1.10', '0.1.11']);
  });

  it('takes only the running version when the last one is unknown', () => {
    const dir = releases(['0.1.12', '0.1.13']);
    expect(releaseNotes(dir, null, '0.1.13').map((n) => n.version)).toEqual(['0.1.13']);
  });

  it('leaves the download list out', () => {
    const [note] = releaseNotes(releases(['0.1.13']), null, '0.1.13');
    expect(note!.text).toContain('本版 0.1.13');
    expect(note!.text).not.toContain('安装包');
  });
});

describe('settingChanges', () => {
  it('tells small talk switched on and its frequency', () => {
    const P = 'worlds.desktop-pet.smallTalk';
    const before = { [`${P}.enabled`]: 'false', [`${P}.frequency`]: '"mid"' };
    const after = { [`${P}.enabled`]: 'true', [`${P}.frequency`]: '"high"' };
    expect(settingChanges(before, after, { palettes: {}, accessories: {} })).toEqual([
      '- 主动找对方闲聊:关 → 开',
      '- 主动闲聊的频率:中(至少隔 1 小时) → 多(至少隔 30 分钟)',
    ]);
  });
});
