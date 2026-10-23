import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldHost } from 'cortico/core/types.ts';
import { noticeDefinition, releaseNotes, settingChanges } from '../core/notice.ts';

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

// upstream #307: a damaged notice.json no longer stops the Core from starting
describe('notice state recovery', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const world = (dir: string, newInstall: boolean) => noticeDefinition({
    version: '0.12.0', notesDir: dir, stateFile: join(dir, 'notice.json'), alarmsFile: join(dir, 'alarms.json'),
    newInstall: () => newInstall, read: () => undefined, petConnected: () => false, guiding: () => false,
  }).create({ cfg: { enabled: true }, timezone: 'UTC' } as never);

  it.each(['', '{"version":', 'null', '{"version":7}', '{}'])('starts with invalid state %j', async (content) => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-notice-state-'));
    dirs.push(dir);
    const stateFile = join(dir, 'notice.json');
    writeFileSync(stateFile, content);
    const w = world(dir, true);
    await w.start({ pushDeferred: () => {} } as unknown as WorldHost);
    try {
      expect(readFileSync(`${stateFile}.bad`, 'utf8')).toBe(content);
      expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({ version: '0.12.0' });
      expect(existsSync(`${stateFile}.tmp`)).toBe(false);
    } finally { await w.stop(); }
  });

  it('throws on a state file it cannot read and leaves it in place', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'coo-notice-state-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'notice.json'));
    await expect(world(dir, false).start({ pushDeferred: () => {} } as unknown as WorldHost)).rejects.toThrow(/EISDIR/);
    expect(existsSync(join(dir, 'notice.json.bad'))).toBe(false);
  });
});

// upstream #243: Coo hears that computer use is on only once its tools are there
describe('computer use switched on or off', () => {
  const dirs: string[] = [];
  afterEach(() => { vi.useRealTimers(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  async function started(values: Record<string, unknown>, inEffect: () => boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'coo-notice-cua-'));
    dirs.push(dir);
    const pushed: Array<{ type: string; render: () => string | null }> = [];
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const w = noticeDefinition({
      version: 'dev', notesDir: dir, stateFile: join(dir, 'notice.json'), alarmsFile: join(dir, 'alarms.json'),
      newInstall: () => false, read: (path) => values[path], petConnected: () => false, guiding: () => false, inEffect,
    }).create({ cfg: { enabled: true }, timezone: 'UTC' } as never);
    await w.start({ pushDeferred: (item: { type: string; render: () => string | null }) => { pushed.push(item); } } as unknown as WorldHost);
    const told = () => pushed.filter((p) => p.type === 'coopanion.settings-changed');
    return { w, told };
  }

  it('waits until the World is there, then tells it', async () => {
    const values: Record<string, unknown> = { 'worlds.cua.enabled': false };
    let mounted = false;
    const { w, told } = await started(values, () => mounted === (values['worlds.cua.enabled'] === true));
    try {
      values['worlds.cua.enabled'] = true;
      await vi.advanceTimersByTimeAsync(5000);
      expect(told()).toHaveLength(0);
      mounted = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(told()).toHaveLength(1);
      expect(told()[0]!.render()).toContain('让你操作这台电脑:关 → 开');
    } finally { await w.stop(); }
  });

  it('tells it anyway after 40 s, and holds no other change', async () => {
    const values: Record<string, unknown> = { 'worlds.cua.enabled': false, 'worlds.desktop-pet.sound': true };
    const { w, told } = await started(values, () => false);
    try {
      values['worlds.desktop-pet.sound'] = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(told()).toHaveLength(1);
      values['worlds.cua.enabled'] = true;
      await vi.advanceTimersByTimeAsync(1000);
      // the item pushed before the flip, delivered while the flip is held, tells only what was let through
      const early = told()[0]!.render();
      expect(early).not.toContain('让你操作这台电脑');
      expect(early).not.toBeNull();
      await vi.advanceTimersByTimeAsync(37_000);
      expect(told()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(3000);
      expect(told()).toHaveLength(2);
      expect(told()[1]!.render()).toContain('让你操作这台电脑:关 → 开');
    } finally { await w.stop(); }
  });

  it('a switch that goes back before it took effect is not told', async () => {
    const values: Record<string, unknown> = { 'worlds.cua.enabled': false };
    const { w, told } = await started(values, () => values['worlds.cua.enabled'] !== true);
    try {
      values['worlds.cua.enabled'] = true;
      await vi.advanceTimersByTimeAsync(3000);
      values['worlds.cua.enabled'] = false;
      await vi.advanceTimersByTimeAsync(3000);
      expect(told()).toHaveLength(0);
    } finally { await w.stop(); }
  });
});

describe('cuaSettled', () => {
  it('on: mounted and in the prefix; off: gone', async () => {
    const { cuaSettled } = await import('../core/companion.ts');
    expect(cuaSettled({ visibility: { cua: true }, driftedWorlds: [] }, true)).toBe(true);
    // mounted, the prefix not rebuilt yet
    expect(cuaSettled({ visibility: { cua: true }, driftedWorlds: ['cua'] }, true)).toBe(false);
    expect(cuaSettled({ visibility: {}, driftedWorlds: [] }, true)).toBe(false);
    expect(cuaSettled({ visibility: {}, driftedWorlds: [] }, false)).toBe(true);
    expect(cuaSettled({ visibility: { cua: true }, driftedWorlds: [] }, false)).toBe(false);
  });
});
